import { CONFIG, COUNTRIES, COUNTRY_TZ } from './config';
import { getDb, now, parse } from './db';
import { emailConfigured, emailStopReason, scanInbox, sendEmail } from './email';
import { sendWhatsApp, startWhatsApp, whatsappReady, whatsappReplySince } from './whatsapp';
import { followUpPlan, inWindow, withFooter } from './schedule';
import { BusinessInfo, OutreachDraft } from '@/types/lead';

// The sender: only ever touches messages with status 'approved' (by you in
// /queue, or automatically once CONFIG.autonomous is on). It paces sends,
// respects each business's local hours, schedules follow-ups, and stops a
// lead's whole sequence the moment they reply or the email bounces.

type Channel = 'email' | 'whatsapp';
type Log = (...a: unknown[]) => void;
const DAY = 86_400_000;

// ---- state ----

const db = getDb();
const rand = ([a, b]: readonly number[]) => (a + Math.random() * (b - a)) * 60_000;
const nextAt: Record<Channel, number> = { email: 0, whatsapp: 0 };
const pausedUntil: Record<Channel, number> = { email: 0, whatsapp: 0 };
let warnedAddress = false;

interface Row {
  id: number; lead_id: string; channel: Channel; step: number; to_addr: string; subject: string | null;
  body: string; due_at: number | null; country: string; timezone: string | null; outreach: string | null;
}

// Earliest time each channel may send again (spacing, pauses, daily cap), for the
// activity panel's countdown. Written once a minute by the sender tick.
function publishPacing() {
  const tomorrow = new Date(); tomorrow.setHours(24, 0, 0, 0);
  const earliest = (c: Channel) => {
    const capped = sentToday(c) >= (c === 'email' ? CONFIG.emailPerDay : CONFIG.whatsappPerDay);
    const t = Math.max(nextAt[c], pausedUntil[c], capped ? tomorrow.getTime() : 0);
    return Number.isFinite(t) ? t : null; // null = paused indefinitely (e.g. Gmail login failed)
  };
  db.prepare(`INSERT INTO state (key, value) VALUES ('pacing', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(JSON.stringify({ email: earliest('email'), whatsapp: earliest('whatsapp'), at: now() }));
}

function sentToday(channel: Channel): number {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  return (db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE channel = ? AND status = 'sent' AND sent_at >= ?`)
    .get(channel, midnight.getTime()) as { n: number }).n;
}

// Follow-ups that fell due go to your queue (shadow) or straight out (autonomous).
function promoteDue() {
  db.prepare(`UPDATE messages SET status = ? WHERE status = 'scheduled' AND due_at <= ?`)
    .run(CONFIG.autonomous ? 'approved' : 'pending', now());
}

function nextReady(channel: Channel): Row | null {
  const rows = db.prepare(`
    SELECT m.*, l.country, l.timezone, l.outreach FROM messages m JOIN leads l ON l.id = m.lead_id
    WHERE m.channel = ? AND m.status = 'approved' AND (m.due_at IS NULL OR m.due_at <= ?) AND l.replied_at IS NULL
    ORDER BY m.step DESC, coalesce(m.priority, 0) DESC, m.created_at ASC LIMIT 200`).all(channel, now()) as unknown as Row[];
  const window = channel === 'email' ? CONFIG.emailWindow : CONFIG.whatsappWindow;
  return rows.find((r) => {
    if (channel === 'email' && r.country === 'US' && !CONFIG.postalAddress.trim()) return false;
    return inWindow(window, r.timezone || COUNTRY_TZ[r.country] || 'UTC');
  }) ?? null;
}

function markSent(r: Row, msgId: string) {
  const t = now();
  db.prepare(`UPDATE messages SET status = 'sent', sent_at = ?, msg_id = ?, error = NULL WHERE id = ?`).run(t, msgId, r.id);
  if (r.step !== 0) return;
  const insert = db.prepare(`INSERT INTO messages (lead_id, channel, step, to_addr, subject, body, status, due_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`);
  for (const f of followUpPlan(r.channel, t, parse<OutreachDraft | null>(r.outreach, null))) {
    insert.run(r.lead_id, r.channel, f.step, r.to_addr, r.subject ? `Re: ${r.subject.replace(/^re:\s*/i, '')}` : null, f.body, f.due, t);
  }
}

function emailFallback(r: Row, log: Log) {
  const lead = db.prepare('SELECT email FROM leads WHERE id = ?').get(r.lead_id) as { email: string | null } | undefined;
  const o = parse<OutreachDraft | null>(r.outreach, null);
  const country = COUNTRIES.find((c) => c.code === r.country);
  if (!lead?.email || !o?.emailBody || !country?.email) return;
  if (db.prepare(`SELECT 1 FROM messages WHERE to_addr = ? AND status != 'rejected'`).get(lead.email)) return;
  db.prepare(`INSERT INTO messages (lead_id, channel, step, variant, to_addr, subject, body, status, created_at)
    VALUES (?, 'email', 0, 'email', ?, ?, ?, ?, ?)`)
    .run(r.lead_id, lead.email, o.emailSubject, o.emailBody, CONFIG.autonomous ? 'approved' : 'pending', now());
  log('WhatsApp unavailable; queued the email version instead');
}

function markFailed(r: Row, error: string) {
  db.prepare(`UPDATE messages SET status = 'failed', error = ? WHERE id = ?`).run(error, r.id);
}

export async function notify(text: string) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: 'POST', headers: { Title: 'LeadScraper reply', Priority: 'high' }, body: text,
  }).catch(() => { /* phone alert is best-effort */ });
}

function stopSequence(leadId: string) {
  db.prepare(`UPDATE messages SET status = 'cancelled' WHERE lead_id = ? AND status IN ('scheduled', 'pending', 'approved')`)
    .run(leadId);
}

async function markReplied(leadId: string, text: string, log: Log) {
  const res = db.prepare(`UPDATE leads SET replied_at = ?, reply_text = ? WHERE id = ? AND replied_at IS NULL`)
    .run(now(), text.slice(0, 1000), leadId);
  if (!res.changes) return;
  stopSequence(leadId);
  const b = parse<BusinessInfo | null>(
    (db.prepare('SELECT business FROM leads WHERE id = ?').get(leadId) as { business: string }).business, null);
  log(`REPLY from ${b?.name}: ${text.slice(0, 120)}`);
  await notify(`${b?.name ?? 'A lead'} replied:\n${text.slice(0, 300)}\n\nOpen /queue to see it.`);
}

// ---- sending ----

async function trySend(channel: Channel, log: Log) {
  const t = now();
  if (t < nextAt[channel] || t < pausedUntil[channel]) return;
  const cap = channel === 'email' ? CONFIG.emailPerDay : CONFIG.whatsappPerDay;
  if (sentToday(channel) >= cap) return;
  if (channel === 'email' && !emailConfigured()) return;
  if (channel === 'whatsapp' && !whatsappReady()) return;

  const r = nextReady(channel);
  if (!r) return;

  try {
    if (channel === 'email') {
      const first = r.step === 0 ? null
        : (db.prepare('SELECT msg_id FROM messages WHERE lead_id = ? AND channel = ? AND step = 0').get(r.lead_id, 'email') as { msg_id: string } | undefined)?.msg_id;
      markSent(r, await sendEmail({ to: r.to_addr, subject: r.subject ?? '', text: withFooter(r.body), inReplyTo: first }));
    } else {
      const id = await sendWhatsApp(r.to_addr, r.body);
      if (!id) {
        markFailed(r, 'number is not on WhatsApp');
        // Landlines etc.: fall back to email if the business has one and it's allowed there.
        if (r.step === 0) emailFallback(r, log);
        return;
      }
      markSent(r, id);
    }
    const who = parse<{ name?: string }>((db.prepare('SELECT business FROM leads WHERE id = ?').get(r.lead_id) as { business: string }).business, {}).name;
    log(`SENT ${channel === 'email' ? 'email' : 'WhatsApp'}${r.step ? ` follow-up ${r.step}` : ''} -> ${who ?? r.to_addr}`);
    nextAt[channel] = now() + rand(channel === 'email' ? CONFIG.emailGapMin : CONFIG.whatsappGapMin);
  } catch (e) {
    const stop = channel === 'email' ? emailStopReason(e) : null;
    if (stop === 'auth') { pausedUntil.email = Infinity; log('Email: Gmail login failed. Check GMAIL_USER / GMAIL_APP_PASSWORD. Email paused.'); return; }
    if (stop === 'quota') { pausedUntil.email = now() + 6 * 3_600_000; log('Email: Gmail sending limit hit. Paused 6h.'); return; }
    markFailed(r, (e as Error).message);
    log(`Send failed (${channel} -> ${r.to_addr}):`, (e as Error).message);
  }
}

// ---- replies & bounces ----

export async function checkReplies(log: Log) {
  const since = now() - 30 * DAY;
  const active = db.prepare(`
    SELECT m.lead_id, m.channel, m.to_addr, m.msg_id, m.sent_at FROM messages m JOIN leads l ON l.id = m.lead_id
    WHERE m.status = 'sent' AND m.sent_at >= ? AND l.replied_at IS NULL`).all(since) as
    { lead_id: string; channel: Channel; to_addr: string; msg_id: string; sent_at: number }[];

  const emails = active.filter((a) => a.channel === 'email');
  if (emails.length && emailConfigured() && pausedUntil.email !== Infinity) {
    try {
      const oldest = Math.min(...emails.map((e) => e.sent_at));
      const scan = await scanInbox(new Date(oldest - DAY), [...new Set(emails.map((e) => e.to_addr))]);
      for (const e of emails) {
        const reply = scan.replies.find((r) => r.from === e.to_addr || (e.msg_id && r.inReplyTo === e.msg_id));
        if (reply) await markReplied(e.lead_id, `Email reply: "${reply.subject}" (read it in Gmail)`, log);
        else if (scan.bounced.has(e.to_addr)) {
          stopSequence(e.lead_id);
          db.prepare(`UPDATE messages SET status = 'failed', error = 'bounced' WHERE lead_id = ? AND channel = 'email' AND status = 'sent'`).run(e.lead_id);
          log(`Bounced: ${e.to_addr}`);
        }
      }
    } catch (err) {
      log('Inbox check failed:', (err as Error).message);
    }
  }

  if (whatsappReady()) {
    const seen = new Set<string>();
    for (const w of active.filter((a) => a.channel === 'whatsapp')) {
      if (seen.has(w.lead_id)) continue;
      seen.add(w.lead_id);
      try {
        const text = await whatsappReplySince(w.to_addr, w.sent_at);
        if (text) await markReplied(w.lead_id, `WhatsApp: ${text}`, log);
      } catch { /* chat not loadable right now, retry next round */ }
    }
  }
}

// ---- loop ----

export function startSender(log: Log, isStopping: () => boolean) {
  if (!emailConfigured()) log('Email sending off: set GMAIL_USER and GMAIL_APP_PASSWORD in .env.local');
  if (!CONFIG.postalAddress.trim() && !warnedAddress) {
    warnedAddress = true;
    log('Note: CONFIG.postalAddress is empty, so US emails stay queued (CAN-SPAM needs one).');
  }
  startWhatsApp(log);

  let lastReplyCheck = 0;
  const tick = async () => {
    if (isStopping()) return;
    try {
      promoteDue();
      await trySend('email', log);
      await trySend('whatsapp', log);
      publishPacing();
      if (now() - lastReplyCheck > 10 * 60_000) {
        lastReplyCheck = now();
        await checkReplies(log);
      }
    } catch (e) {
      log('Sender error:', (e as Error).message);
    }
    setTimeout(tick, 60_000);
  };
  setTimeout(tick, 15_000);
}
