import { NextRequest, NextResponse } from 'next/server';
import { getDb, parse } from '@/agent/db';
import { replyRates } from '@/agent/learn';

// Dashboard data for the agent: drafts to approve, replies, gigs, reply rates.

export async function GET() {
  const db = getDb();
  const stages = db.prepare('SELECT stage, COUNT(*) AS n FROM leads GROUP BY stage').all();
  const statuses = db.prepare('SELECT status, COUNT(*) AS n FROM messages GROUP BY status').all();
  const rows = db.prepare(`
    SELECT m.id, m.channel, m.step, m.variant, m.to_addr, m.subject, m.body, m.status, m.created_at,
           l.business, l.qualification, l.health, l.country, l.query_key, l.preview_slug
    FROM messages m JOIN leads l ON l.id = m.lead_id
    WHERE m.status = 'pending'
    ORDER BY m.created_at ASC LIMIT 100`).all() as Record<string, unknown>[];

  const messages = rows.map((r) => ({
    ...r,
    business: parse(r.business, null),
    qualification: parse(r.qualification, null),
    health: parse(r.health, null),
  }));
  const replies = (db.prepare(`
    SELECT l.id, l.business, l.email, l.phone, l.replied_at, l.reply_text
    FROM leads l WHERE l.replied_at IS NOT NULL ORDER BY l.replied_at DESC LIMIT 50`).all() as Record<string, unknown>[])
    .map((r) => ({ ...r, business: parse(r.business, null) }));
  const gigs = db.prepare(`
    SELECT id, source, url, title, email, posted_at, fit, why, budget, reply
    FROM gigs WHERE status = 'ready' ORDER BY fit DESC, posted_at DESC LIMIT 50`).all();
  const rates = {
    niche: replyRates(db, 'niche'),
    country: replyRates(db, 'country'),
    variant: replyRates(db, 'variant'),
  };

  return NextResponse.json({ stages, statuses, messages, replies, gigs, rates });
}

type Body =
  | { kind?: 'message'; id: number; action: 'approve' | 'reject'; subject?: string; body?: string }
  | { kind: 'gig'; id: string; action: 'done' | 'dismiss' };

export async function POST(req: NextRequest) {
  const b = (await req.json()) as Body;
  const db = getDb();

  if (b.kind === 'gig') {
    if (typeof b.id !== 'string' || !['done', 'dismiss'].includes(b.action)) {
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }
    db.prepare(`UPDATE gigs SET status = ? WHERE id = ? AND status = 'ready'`)
      .run(b.action === 'done' ? 'done' : 'dismissed', b.id);
    return NextResponse.json({ ok: true });
  }

  if (!['approve', 'reject'].includes(b.action) || !Number.isInteger(b.id)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (b.action === 'approve') {
    if (!b.body?.trim()) return NextResponse.json({ error: 'empty message' }, { status: 400 });
    db.prepare(`UPDATE messages SET status = 'approved', subject = ?, body = ? WHERE id = ? AND status = 'pending'`)
      .run(b.subject ?? null, b.body, b.id);
  } else {
    db.prepare(`UPDATE messages SET status = 'rejected' WHERE id = ? AND status = 'pending'`).run(b.id);
  }
  return NextResponse.json({ ok: true });
}
