import type { DatabaseSync } from 'node:sqlite';
import { GIGS, PROFILE } from './config';
import { client } from '@/lib/claude';
import { extractEmails } from '@/lib/website-health';

// Inbound intent: people who are publicly asking for exactly this work.
// Far warmer than cold outreach. Source: Reddit hiring subs via their public RSS
// feeds (free, no account). Hacker News was dropped: its hiring threads are
// almost all ongoing employment, which doesn't fit around a full-time job.
// Claude scores each post against PROFILE (skills + availability) and drafts a short reply. You send
// it from /queue (one click opens the post or a prefilled email): people
// hiring judge the reply itself, so it stays in your hands.

export interface Post { id: string; source: string; url: string; title: string; body: string; postedAt: number }

const UA = { 'User-Agent': 'leadscraper-personal/0.3 (personal freelance search)' };
const DAY = 86_400_000;
const now = () => Date.now();

export function stripHtml(html: string): string {
  return html
    .replace(/<p>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&#x2F;/g, '/').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').trim();
}

// Cheap keyword gate so Claude only sees posts that could plausibly fit.
const SKILL_RE = /\b(web ?site|web ?app|landing page|front[- ]?end|full[- ]?stack|react|next\.?js|node|wordpress|shopify|webflow|mobile app|ios|android|flutter|react native|unity|unreal|ue5|game dev|3d|vr|ar\b|xr|archviz|walkthrough|three\.?js|webgl)/i;

export function redditHiring(sub: string, children: { data: Record<string, unknown> }[]): Post[] {
  return children
    .map((c) => c.data)
    .filter((d) => {
      const tag = `${d.link_flair_text ?? ''} ${d.title ?? ''}`;
      return /hiring|\[paid\]|\[task\]/i.test(tag) && !/for ?hire|seeking work|\[unpaid\]/i.test(tag);
    })
    .map((d) => ({
      id: `reddit:${d.id}`, source: `r/${d.subreddit || sub}`, url: `https://www.reddit.com${d.permalink}`,
      title: String(d.title ?? ''), body: String(d.selftext ?? ''), postedAt: Number(d.created_utc ?? 0) * 1000,
    }));
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// Reddit blocks anonymous .json now, but the Atom feed still works without an account.
export function parseRedditRss(xml: string): { data: Record<string, unknown> }[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const tag = (t: string) => e.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? '';
    const link = e.match(/<link href="([^"]+)"/)?.[1] ?? '';
    return {
      data: {
        id: tag('id').replace(/^t3_/, ''),
        subreddit: e.match(/<category term="([^"]+)"/)?.[1] ?? '',
        title: decode(tag('title')),
        selftext: stripHtml(decode(tag('content'))),
        permalink: link.replace('https://www.reddit.com', ''),
        created_utc: Date.parse(tag('published') || tag('updated')) / 1000,
      },
    };
  });
}

// All subs in ONE request ("r/a+b+c"): Reddit 429s separate feed reads even when spaced out.
async function fetchReddit(subs: string[]): Promise<Post[]> {
  const multi = subs.join('+');
  const res = await fetch(`https://www.reddit.com/r/${multi}/new/.rss?limit=100`, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} r/${multi}`);
  return redditHiring(subs[0], parseRedditRss(await res.text()));
}

// Claude: does this post fit, and what would a good, honest reply be?
async function assess(p: Post): Promise<{ fit: number; why: string; budget: string | null; reply: string }> {
  const prompt = `You help ${PROFILE.name}, an independent developer, pick freelance gigs and reply to them.

HIS SKILLS (only these; never claim anything else): ${PROFILE.skills}
HIS AVAILABILITY: ${PROFILE.availability}
${PROFILE.portfolioUrl ? `PORTFOLIO: ${PROFILE.portfolioUrl}` : 'No portfolio link to share.'}

POST (${p.source}):
${p.title}
${p.body.slice(0, 3500)}

1. fit: 0 to 10. 10 = squarely his skills, clearly paid, AND a fixed-scope project he can do async around his job.
   0 = unrelated, unpaid, equity only, or the post is someone advertising themselves / looking for work (a candidate, not a client).
   0 to 3 = anything that needs set hours, daily standups or calls, "join our team", or an ongoing part-time/full-time/multi-month contract,
   even if the skills match.
2. why: one short line.
3. budget: the budget/rate if the post states one, else null.
4. reply: what he'd send. 60 to 110 words, plain and human, no em dashes, no buzzwords, no "I hope this finds you well".
   Open on THEIR project specifically, say in one line how he'd approach it, ${PROFILE.portfolioUrl ? 'include the portfolio link once, ' : ''}end with one concrete question about scope or timeline. Sign off "${PROFILE.name.split(' ')[0]}". Never invent past clients, years, or results.

Return ONLY JSON: {"fit":0,"why":"...","budget":null,"reply":"..."}`;
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5', max_tokens: 700, messages: [{ role: 'user', content: prompt }],
  });
  const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
  const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  return {
    fit: Math.max(0, Math.min(10, Number(j.fit) || 0)),
    why: String(j.why ?? ''),
    budget: j.budget ? String(j.budget) : null,
    reply: String(j.reply ?? '').replace(/[—–]/g, '-'),
  };
}

export async function runGigs(db: DatabaseSync, log: (...a: unknown[]) => void, notify: (t: string) => Promise<void>) {
  const posts: Post[] = [];
  try { posts.push(...(await fetchReddit(GIGS.subreddits))); } catch (e) { log('Gigs: source failed:', (e as Error).message); }

  const insert = db.prepare(`INSERT OR IGNORE INTO gigs (id, source, url, title, body, email, posted_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let added = 0;
  for (const p of posts) {
    const fresh = now() - p.postedAt < GIGS.maxAgeDays * DAY;
    const status = fresh && SKILL_RE.test(`${p.title}\n${p.body}`) ? 'new' : 'skipped';
    const email = extractEmails(p.body)[0] ?? null;
    added += Number(insert.run(p.id, p.source, p.url, p.title, p.body, email, p.postedAt, status, now()).changes);
  }

  const todo = db.prepare(`SELECT * FROM gigs WHERE status = 'new' ORDER BY posted_at DESC LIMIT ?`)
    .all(GIGS.assessPerRun) as unknown as (Post & { posted_at: number })[];
  for (const g of todo) {
    try {
      const a = await assess({ ...g, postedAt: g.posted_at });
      const ok = a.fit >= GIGS.minFit;
      db.prepare(`UPDATE gigs SET status = ?, fit = ?, why = ?, budget = ?, reply = ? WHERE id = ?`)
        .run(ok ? 'ready' : 'skipped', a.fit, a.why, a.budget, a.reply, g.id);
      if (a.fit >= GIGS.alertFit) await notify(`Gig ${a.fit}/10 on ${g.source}: ${g.title}\n${a.budget ?? ''}\nOpen /queue to reply.`);
    } catch (e) {
      log('Gigs: assess failed (check ANTHROPIC_API_KEY):', (e as Error).message);
      break;
    }
  }
  log(`Gigs: ${posts.length} hiring posts seen, ${added} new, ${todo.length} assessed`);
}
