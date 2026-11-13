import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getDb, parse } from '@/agent/db';
import { CONFIG, COUNTRIES, COUNTRY_TZ, NICHES } from '@/agent/config';
import { nextWindowStart } from '@/agent/schedule';
import { replyRates } from '@/agent/learn';

// Read-only snapshot of everything the agent is doing, for /activity.

export const dynamic = 'force-dynamic';

function agentAlive(): boolean {
  try {
    const pid = Number(fs.readFileSync(path.join(process.cwd(), 'data', 'agent.pid'), 'utf8'));
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const nameOf = (business: unknown) => (parse<{ name?: string }>(business, {}).name ?? '?');

export async function GET() {
  const db = getDb();
  const now = Date.now();
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const q = <T,>(sql: string, ...a: (string | number)[]) => db.prepare(sql).all(...a) as T[];

  const sentToday = Object.fromEntries(
    q<{ channel: string; n: number }>(`SELECT channel, COUNT(*) n FROM messages WHERE status = 'sent' AND sent_at >= ? GROUP BY channel`, midnight.getTime())
      .map((r) => [r.channel, r.n]),
  );
  const totalSearches = Object.keys(NICHES).length * COUNTRIES.reduce((s, c) => s + c.cities.length, 0);
  const searchesDone = (db.prepare('SELECT COUNT(*) n FROM queries WHERE done_at IS NOT NULL').get() as { n: number }).n;

  // Sender's own pacing (spacing between sends, pauses, daily cap), published each minute.
  const pacingRow = db.prepare(`SELECT value FROM state WHERE key = 'pacing'`).get() as { value: string } | undefined;
  const pacing = parse<{ email: number | null; whatsapp: number | null }>(pacingRow?.value, { email: 0, whatsapp: 0 });

  // Waiting to go out, with the earliest moment the business's window and the sender's pacing allow.
  const upNext = q<Record<string, unknown>>(`
    SELECT m.id, m.channel, m.step, m.subject, m.body, m.to_addr, m.due_at, l.business, l.country, l.timezone
    FROM messages m JOIN leads l ON l.id = m.lead_id
    WHERE m.status = 'approved' AND l.replied_at IS NULL`)
    .map((m) => {
      const window = m.channel === 'email' ? CONFIG.emailWindow : CONFIG.whatsappWindow;
      const tz = String(m.timezone || COUNTRY_TZ[String(m.country)] || 'UTC');
      const paced = pacing[m.channel as 'email' | 'whatsapp'];
      const from = new Date(Math.max(now, Number(m.due_at ?? 0), paced ?? 0));
      const held = (m.channel === 'email' && m.country === 'US' && !CONFIG.postalAddress.trim()) || paced === null;
      return {
        id: m.id, channel: m.channel, step: m.step, subject: m.subject, body: m.body, to: m.to_addr, country: m.country,
        name: nameOf(m.business), earliest: held ? null : nextWindowStart(window, tz, from)?.getTime() ?? null,
        note: paced === null ? 'paused' : held ? 'held: POSTAL_ADDRESS not set' : null,
      };
    })
    .sort((a, b) => (a.earliest ?? Infinity) - (b.earliest ?? Infinity));

  const sent = q<Record<string, unknown>>(`
    SELECT m.id, m.channel, m.step, m.subject, m.body, m.to_addr, m.sent_at, l.business, l.country, l.replied_at
    FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.status = 'sent' ORDER BY m.sent_at DESC LIMIT 100`)
    .map((m) => ({ ...m, name: nameOf(m.business), business: undefined }));

  const followUps = q<Record<string, unknown>>(`
    SELECT m.id, m.channel, m.step, m.due_at, m.body, l.business FROM messages m JOIN leads l ON l.id = m.lead_id
    WHERE m.status = 'scheduled' ORDER BY m.due_at LIMIT 100`)
    .map((m) => ({ ...m, name: nameOf(m.business), business: undefined }));

  const replies = q<Record<string, unknown>>(`
    SELECT id, business, email, phone, replied_at, reply_text FROM leads WHERE replied_at IS NOT NULL ORDER BY replied_at DESC LIMIT 50`)
    .map((r) => ({ ...r, name: nameOf(r.business), website: parse<{ website?: string }>(r.business, {}).website ?? null, business: undefined }));

  const problems = q<Record<string, unknown>>(`
    SELECT m.id, m.channel, m.to_addr, m.error, coalesce(m.sent_at, m.created_at) at, l.business FROM messages m JOIN leads l ON l.id = m.lead_id
    WHERE m.status = 'failed' ORDER BY at DESC LIMIT 30`)
    .map((m) => ({ ...m, name: nameOf(m.business), business: undefined }));

  const count = (sql: string, ...a: number[]) => (db.prepare(sql).get(...a) as { n: number }).n;
  const m0 = midnight.getTime();
  const todaySummary = {
    searches: count('SELECT COUNT(*) n FROM queries WHERE done_at >= ?', m0),
    found: count('SELECT COUNT(*) n FROM leads WHERE created_at >= ?', m0),
    checked: count(`SELECT COUNT(*) n FROM leads WHERE stage != 'discovered' AND updated_at >= ?`, m0),
    written: count(`SELECT COUNT(*) n FROM messages WHERE step = 0 AND status != 'rejected' AND created_at >= ?`, m0),
    sent: count(`SELECT COUNT(*) n FROM messages WHERE status = 'sent' AND sent_at >= ?`, m0),
    replies: count('SELECT COUNT(*) n FROM leads WHERE replied_at >= ?', m0),
  };

  return NextResponse.json({
    now,
    agentAlive: agentAlive(),
    autonomous: CONFIG.autonomous,
    todaySummary,
    today: {
      email: sentToday.email ?? 0, emailCap: CONFIG.emailPerDay,
      whatsapp: sentToday.whatsapp ?? 0, whatsappCap: CONFIG.whatsappPerDay,
    },
    totals: {
      sent: (db.prepare(`SELECT COUNT(*) n FROM messages WHERE status = 'sent'`).get() as { n: number }).n,
      replies: replies.length,
      searchesDone, totalSearches,
      stages: q<{ stage: string; n: number }>('SELECT stage, COUNT(*) n FROM leads GROUP BY stage'),
    },
    upNext, sent, followUps, replies, problems,
    gigs: q('SELECT id, source, url, title, fit, budget, why, posted_at FROM gigs WHERE status = ? ORDER BY fit DESC, posted_at DESC LIMIT 20', 'ready'),
    rates: replyRates(db, 'niche'),
    log: q<{ at: number; line: string }>('SELECT at, line FROM activity ORDER BY id DESC LIMIT 80'),
  });
}
