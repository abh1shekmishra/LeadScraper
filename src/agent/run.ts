import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, COUNTRIES, GIGS, NICHES, PREVIEWS, SKIP_BRANDS, Country } from './config';
import { getDb, json, now, parse } from './db';
import { NOT_A_TARGET, brandKey, mapPlace, scrape, siteKey } from './discover';
import { crawlContactEmails, hasMx, pickEmail } from './enrich';
import { pageSpeedMobile } from './pagespeed';
import { checkWebsiteHealth, hasRealSite } from '@/lib/website-health';
import { analyzeReviews } from '@/lib/reviews';
import { pickServiceAngle } from '@/lib/service-angles';
import { generateOutreach } from '@/lib/claude';
import { notify, startSender } from './send';
import { stopWhatsApp } from './whatsapp';
import { runGigs } from './gigs';
import { buildPreview, deployPreviews, previewConfigured, previewUrl } from './preview';
import { leadPriority, weightedPick, weightsBy } from './learn';
import { BusinessInfo, LeadQualification, OutreachDraft, SiteHealth, scoreLeadQualification } from '@/types/lead';

// The autonomous loop. `npm run agent` starts it; Ctrl+C stops it after the
// current step. All progress is in data/agent.db, so a restart resumes.
//
//   discover -> audit (site probe, PageSpeed, contacts, reviews, score) -> draft -> /queue
//
// The sender (send.ts) runs alongside on its own 1-minute timer and only
// picks up 'approved' messages.

const db = getDb();

// One agent at a time: two would both pick up the same approved message and
// send it twice. The pid file also tells the activity panel the agent is alive.
const PID_FILE = path.join(process.cwd(), 'data', 'agent.pid');
try {
  const other = Number(fs.readFileSync(PID_FILE, 'utf8'));
  if (other && other !== process.pid) {
    process.kill(other, 0); // throws if that process is gone
    console.log(`Another agent is already running (pid ${other}). Close it first.`);
    process.exit(0);
  }
} catch { /* no live agent */ }
fs.writeFileSync(PID_FILE, String(process.pid));
process.on('exit', () => {
  try { if (fs.readFileSync(PID_FILE, 'utf8') === String(process.pid)) fs.rmSync(PID_FILE); } catch { /* gone */ }
});

// Local time ("sv-SE" formats as YYYY-MM-DD HH:MM:SS). Also kept in the DB for the activity panel.
const logRow = db.prepare('INSERT INTO activity (at, line) VALUES (?, ?)');
const log = (...a: unknown[]) => {
  console.log(new Date().toLocaleString('sv-SE'), ...a);
  try { logRow.run(now(), a.map(String).join(' ')); } catch { /* never let logging break the agent */ }
};
db.prepare('DELETE FROM activity WHERE at < ?').run(now() - 14 * 86_400_000);
let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(1);
  stopping = true;
  log('Stopping after the current step (Ctrl+C again to force).');
});

// Sleeps in 1s slices so Ctrl+C never waits out a whole cycle pause.
async function sleep(ms: number) {
  const end = Date.now() + ms;
  while (!stopping && Date.now() < end) await new Promise((r) => setTimeout(r, 1000));
}
const countryOf = (code: string) => COUNTRIES.find((c) => c.code === code)!;
const servicesOf = (queryKey: string) => NICHES[queryKey.split('|')[1]] ?? ['Website'];

// Run fn over items with at most `n` in flight.
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length && !stopping) await fn(queue.shift()!);
  }));
}

// --- 1. Discover -------------------------------------------------------------

function allQueries(): { key: string; text: string; country: Country }[] {
  // Interleave cities so one country's throttling doesn't stall the whole run.
  // Niches that earn more replies get searched first (learned, see learn.ts).
  const w = weightsBy(db, 'niche');
  const niches = Object.keys(NICHES).sort((a, b) => (w.get(b) ?? 0.1) - (w.get(a) ?? 0.1));
  const out = [];
  for (const niche of niches)
    for (const country of COUNTRIES)
      for (const city of country.cities)
        out.push({ key: `${city}|${niche}`, text: `${niche} in ${city}`, country });
  return out;
}

async function discover(): Promise<boolean> {
  const done = new Set(
    (db.prepare('SELECT key FROM queries WHERE done_at IS NOT NULL').all() as { key: string }[]).map((r) => r.key),
  );
  const batch = allQueries().filter((q) => !done.has(q.key)).slice(0, CONFIG.queriesPerCycle);
  if (!batch.length) return false;

  const insert = db.prepare(`INSERT OR IGNORE INTO leads
    (id, query_key, country, business, emails, timezone, maps_ordering, stage, brand_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'discovered', ?, ?, ?)`);
  const mark = db.prepare('INSERT OR REPLACE INTO queries (key, found, done_at) VALUES (?, ?, ?)');

  // One search per scraper run, so every result row belongs to that search
  // without relying on the scraper echoing query ids back.
  for (const q of batch) {
    if (stopping) break;
    log(`Discover: ${q.text}`);
    const rows = await scrape([{ id: '0', text: q.text }], {
      exe: CONFIG.scraperPath, depth: CONFIG.scrollDepth, concurrency: CONFIG.scraperConcurrency,
    });
    let added = 0;
    for (const row of rows) {
      const d = mapPlace(row, q.country.dial, q.key.split('|')[1]);
      if (!d) continue;
      added += Number(insert.run(d.business.placeId, q.key, q.country.code, json(d.business), json(d.emails),
        d.timezone, d.mapsOrdering ? 1 : 0, brandKey(d.business.name, d.business.address), now(), now()).changes);
    }
    mark.run(q.key, added, now());
    log(`Discover: ${rows.length} places, ${added} new`);
  }
  return true;
}

// --- 2. Audit ----------------------------------------------------------------

interface LeadRow {
  id: string; query_key: string; country: string; business: string; emails: string;
  maps_ordering: number; health: string | null; qualification: string | null;
  email: string | null; phone: string | null; brand_key: string | null;
}

async function auditOne(row: LeadRow) {
  const business = parse<BusinessInfo>(row.business, null as unknown as BusinessInfo);
  const country = countryOf(row.country);
  const services = servicesOf(row.query_key);

  // Cheap checks first: is this even a buyer, and is the company already covered?
  const key = siteKey(business.website);
  const sameSite = key
    ? (db.prepare(`SELECT stage, json_extract(business, '$.website') AS website FROM leads WHERE id != ? AND website LIKE ?`)
        .all(row.id, `%${key}%`) as { stage: string; website: string }[]).filter((l) => siteKey(l.website) === key)
    : [];
  // Branches with their own phone/email and no shared site: match on the brand name.
  const sameBrand = row.brand_key
    ? db.prepare(`SELECT stage FROM leads WHERE id != ? AND brand_key = ? AND country = ?`).all(row.id, row.brand_key, row.country) as { stage: string }[]
    : [];
  const live = (l: { stage: string }) => l.stage === 'qualified' || l.stage === 'drafted';
  const early =
    NOT_A_TARGET.test(`${business.name} ${business.category}`) ? 'not a buyer (school/course)'
    : SKIP_BRANDS.test(business.listingTitle ?? business.name) ? 'national chain'
    : sameSite.length >= 2 || sameBrand.length >= 2 ? 'chain (3+ branches)'
    : sameSite.some(live) || sameBrand.some(live) ? 'same company already in pipeline'
    : null;
  if (early) {
    db.prepare(`UPDATE leads SET stage = 'skipped', skip_reason = ?, updated_at = ? WHERE id = ?`).run(early, now(), row.id);
    log(`Audit: ${business.name} -> skip (${early})`);
    return;
  }

  const health: SiteHealth = await checkWebsiteHealth(business.website);
  if (row.maps_ordering) health.hasOnlineOrdering = true;
  // PageSpeed only matters where the site otherwise looks fine.
  if (business.website && (health.gap === 'healthy' || health.gap === 'unverified')) {
    const psi = await pageSpeedMobile(business.website);
    if (psi != null) health.psiMobile = psi;
  }

  // Contacts: scraper emails + homepage emails, then contact pages as a fallback.
  let emails = [...new Set([...parse<string[]>(row.emails, []), ...(health.emails ?? [])])];
  if (!emails.length && business.website && hasRealSite(health.gap)) {
    emails = await crawlContactEmails(business.website);
  }
  let email = country.email ? pickEmail(emails, business.website) : null;
  if (email && !(await hasMx(email))) email = null;
  const phone = country.whatsapp ? business.internationalPhone : null;

  const angle = pickServiceAngle(business, health, services);
  const q = scoreLeadQualification(business, analyzeReviews(business.reviews), angle);

  const minOk = CONFIG.minScore === 'warm' ? q.score !== 'cold' : q.score === 'hot';
  const whatsappOk = !!phone && (!CONFIG.whatsappOnlyHot || q.score === 'hot');
  const skip = !minOk ? `score ${q.score}` : !email && !whatsappOk ? 'no usable contact' : null;

  db.prepare(`UPDATE leads SET stage = ?, skip_reason = ?, email = ?, phone = ?, health = ?,
    qualification = ?, updated_at = ? WHERE id = ?`)
    .run(skip ? 'skipped' : 'qualified', skip, email, whatsappOk ? phone : null, json(health), json(q), now(), row.id);
  log(`Audit: ${business.name} -> ${skip ? `skip (${skip})` : `${q.score.toUpperCase()} ${q.opportunity}`}`);
}

async function audit(): Promise<number> {
  const rows = db.prepare(`SELECT * FROM leads WHERE stage = 'discovered' LIMIT 40`).all() as unknown as LeadRow[];
  await pool(rows, CONFIG.auditConcurrency, async (row) => {
    try { await auditOne(row); }
    catch (e) { log(`Audit failed for ${row.id}:`, (e as Error).message); }
  });
  return rows.length;
}

// --- 3. Draft ----------------------------------------------------------------

function draftsToday(): number {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  // Rejected drafts don't count: re-audits shouldn't eat the day's budget.
  return (db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE step = 0 AND status != 'rejected' AND created_at >= ?`)
    .get(midnight.getTime()) as { n: number }).n;
}

function previewsToday(): number {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  return (db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE preview_slug IS NOT NULL AND updated_at >= ?`)
    .get(midnight.getTime()) as { n: number }).n;
}

// Concept sites for the hottest website-gap leads in this batch, deployed in one upload.
async function makePreviews(rows: { r: LeadRow; b: BusinessInfo; q: LeadQualification }[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (!previewConfigured()) return urls;
  let room = PREVIEWS.perDay - previewsToday();
  const built: { id: string; slug: string }[] = [];
  for (const { r, b, q } of rows) {
    if (room <= 0 || stopping) break;
    const angle = pickServiceAngle(b, parse<SiteHealth | undefined>(r.health, undefined), servicesOf(r.query_key));
    if (q.score !== 'hot' || angle.service !== 'website' || angle.severity !== 'critical' && angle.severity !== 'high') continue;
    try {
      built.push({ id: r.id, slug: await buildPreview(b) });
      room--;
    } catch (e) {
      log(`Preview failed for ${b.name}:`, (e as Error).message);
    }
  }
  if (!built.length) return urls;
  try {
    await deployPreviews();
  } catch (e) {
    log('Preview deploy failed (check Cloudflare setup):', (e as Error).message);
    return urls;
  }
  for (const { id, slug } of built) {
    db.prepare('UPDATE leads SET preview_slug = ?, updated_at = ? WHERE id = ?').run(slug, now(), id);
    urls.set(id, previewUrl(slug));
  }
  log(`Previews: ${built.length} deployed`);
  return urls;
}

async function draft(): Promise<number> {
  const room = CONFIG.draftsPerDay - draftsToday();
  if (room <= 0) return 0;
  // Hot first, then niches that have been earning replies, then the busiest businesses.
  const nicheW = weightsBy(db, 'niche');
  const nw = (r: LeadRow) => nicheW.get(r.query_key.split('|')[1]) ?? 0.1;
  const rows = (db.prepare(`SELECT * FROM leads WHERE stage = 'qualified'`).all() as unknown as LeadRow[])
    .map((r) => {
      const q = parse<LeadQualification>(r.qualification, { score: 'cold', reasons: [], opportunity: '' });
      const b = parse<BusinessInfo>(r.business, null as unknown as BusinessInfo);
      return { r, q, b, priority: leadPriority(q.score, b.reviewCount ?? 0, b.rating, nw(r)) };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, room);

  const previews = await makePreviews(rows);
  const variantW = weightsBy(db, 'variant');
  const insert = db.prepare(`INSERT INTO messages (lead_id, channel, step, variant, to_addr, subject, body, status, priority, created_at)
    VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`);
  for (const { r, b, priority } of rows) {
    if (stopping) break;
    const country = countryOf(r.country);
    const health = parse<SiteHealth | undefined>(r.health, undefined);

    // One channel per lead for the first touch: the country's preferred one if possible.
    const channel = r.phone && (country.prefer === 'whatsapp' || !r.email) ? 'whatsapp' : 'email';
    // Never write to the same inbox / number twice (shared agency inboxes, branches).
    // Checked before drafting, so duplicates cost no Claude call.
    const to = channel === 'email' ? r.email! : r.phone!;
    if (db.prepare(`SELECT 1 FROM messages WHERE to_addr = ? AND status != 'rejected' LIMIT 1`).get(to)) {
      db.prepare(`UPDATE leads SET stage = 'skipped', skip_reason = 'same inbox/number already in pipeline', updated_at = ? WHERE id = ?`).run(now(), r.id);
      log(`Draft: ${b.name} -> skip (same ${channel} recipient already contacted)`);
      continue;
    }

    let outreach: OutreachDraft;
    try {
      outreach = await generateOutreach(b, servicesOf(r.query_key), health, undefined, previews.get(r.id));
    } catch (e) {
      log('Draft failed (check ANTHROPIC_API_KEY):', (e as Error).message);
      return 0; // stop drafting this cycle; leads stay 'qualified'
    }

    const status = CONFIG.autonomous ? 'approved' : 'pending';
    if (channel === 'email') {
      insert.run(r.id, 'email', 'email', r.email!, outreach.emailSubject, outreach.emailBody, status, priority, now());
    } else {
      // Variants that get more replies get used more (smoothed, so all keep being tried).
      const variant = weightedPick((['whatsappDirect', 'whatsappFriendly', 'whatsappCurious'] as const)
        .map((v) => ({ item: v, w: variantW.get(v) ?? 0.1 })));
      insert.run(r.id, 'whatsapp', variant, r.phone!, null, outreach[variant], status, priority, now());
    }
    db.prepare(`UPDATE leads SET stage = 'drafted', outreach = ?, updated_at = ? WHERE id = ?`).run(json(outreach), now(), r.id);
    log(`Draft: ${b.name} via ${channel} -> ${status}`);
  }
  return rows.length;
}

// --- Startup backfill --------------------------------------------------------
// Rows saved before a field existed get it computed once (idempotent).
function backfill() {
  const leads = db.prepare(`SELECT id, business FROM leads WHERE brand_key IS NULL`).all() as { id: string; business: string }[];
  const setBrand = db.prepare('UPDATE leads SET brand_key = ? WHERE id = ?');
  for (const l of leads) {
    const b = parse<BusinessInfo>(l.business, null as unknown as BusinessInfo);
    setBrand.run(brandKey(b.name, b.address ?? '') ?? '', l.id); // '' = computed, not distinctive
  }

  const nicheW = weightsBy(db, 'niche');
  const msgs = db.prepare(`SELECT m.id, l.query_key, l.business, l.qualification FROM messages m JOIN leads l ON l.id = m.lead_id
    WHERE m.priority IS NULL AND m.status IN ('approved', 'pending', 'scheduled')`).all() as Record<string, string>[];
  const setPriority = db.prepare('UPDATE messages SET priority = ? WHERE id = ?');
  for (const m of msgs) {
    const b = parse<BusinessInfo>(m.business, null as unknown as BusinessInfo);
    const q = parse<LeadQualification>(m.qualification, { score: 'warm', reasons: [], opportunity: '' });
    setPriority.run(leadPriority(q.score, b.reviewCount ?? 0, b.rating, nicheW.get(m.query_key.split('|')[1]) ?? 0.1), Number(m.id));
  }
  if (leads.length || msgs.length) log(`Backfilled ${leads.length} brand keys, ${msgs.length} send priorities`);
}

// --- Loop --------------------------------------------------------------------

async function main() {
  log(`Agent started (${CONFIG.autonomous ? 'AUTONOMOUS' : 'shadow mode: drafts wait at /queue'})`);
  // Leads parked for re-checking (e.g. after an audit fix) are audited again by this code.
  const parked = db.prepare(`UPDATE leads SET stage = 'discovered' WHERE stage = 'reaudit'`).run().changes;
  if (parked) log(`Re-auditing ${parked} leads with the current checks`);
  backfill();
  // Autonomous: anything still waiting from shadow mode goes out like any new draft.
  if (CONFIG.autonomous) {
    const released = db.prepare(`UPDATE messages SET status = 'approved' WHERE status = 'pending'`).run().changes;
    if (released) log(`Autonomous: ${released} waiting drafts released to the sender`);
  }
  startSender(log, () => stopping);
  let announcedDone = false;
  // First gig check ~10 min after start, so quick restarts don't hammer Reddit (it 429s).
  let lastGigs = now() - GIGS.checkEveryHours * 3_600_000 + 10 * 60_000;
  while (!stopping) {
    if (now() - lastGigs > GIGS.checkEveryHours * 3_600_000) {
      lastGigs = now();
      await runGigs(db, log, notify);
    }
    // Backlog first (audit + draft what's already found), then go find more.
    while (!stopping && (await audit()) > 0) { /* drain the audit backlog */ }
    if (!stopping) await draft();
    let more = false;
    if (!stopping) {
      try { more = await discover(); }
      catch (e) { log('Discover failed:', (e as Error).message); }
    }

    const waiting = (db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE stage = 'qualified'`).get() as { n: number }).n;
    // Keep running after discovery ends: follow-ups and reply checks still need the sender.
    if (!more && !announcedDone) {
      announcedDone = true;
      log(`All searches done (${waiting} qualified leads still to draft). Sender keeps running for follow-ups and replies.`);
    }
    if (!stopping) await sleep(CONFIG.cycleSleepMs);
  }
  await stopWhatsApp();
  log('Agent stopped.');
  process.exit(0);
}

main();
