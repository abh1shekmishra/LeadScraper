import { NextRequest, NextResponse } from 'next/server';
import { getDb, parse } from '@/agent/db';

// Read-only history: what happened each day, and each business's full timeline.

export const dynamic = 'force-dynamic';

const FILTERS: Record<string, string> = {
  all: '1 = 1',
  contacted: `l.id IN (SELECT lead_id FROM messages WHERE status = 'sent')`,
  replied: 'l.replied_at IS NOT NULL',
  waiting: `l.stage IN ('qualified', 'drafted') AND l.id NOT IN (SELECT lead_id FROM messages WHERE status = 'sent')`,
  skipped: `l.stage = 'skipped'`,
  unchecked: `l.stage IN ('discovered', 'reaudit')`,
};

export async function GET(req: NextRequest) {
  const db = getDb();
  const filter = FILTERS[req.nextUrl.searchParams.get('filter') ?? 'all'] ? req.nextUrl.searchParams.get('filter') ?? 'all' : 'all';
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();

  // ---- day by day (local dates), last 14 days ----
  const day = (col: string) => `date(${col} / 1000, 'unixepoch', 'localtime')`;
  const since = Date.now() - 14 * 86_400_000;
  const series = (sql: string) =>
    Object.fromEntries((db.prepare(sql).all(since) as { d: string; n: number }[]).map((r) => [r.d, r.n]));
  const found = series(`SELECT ${day('created_at')} d, COUNT(*) n FROM leads WHERE created_at >= ? GROUP BY d`);
  const firsts = series(`SELECT ${day('sent_at')} d, COUNT(*) n FROM messages WHERE status = 'sent' AND step = 0 AND sent_at >= ? GROUP BY d`);
  const follow = series(`SELECT ${day('sent_at')} d, COUNT(*) n FROM messages WHERE status = 'sent' AND step > 0 AND sent_at >= ? GROUP BY d`);
  const replies = series(`SELECT ${day('replied_at')} d, COUNT(*) n FROM leads WHERE replied_at >= ? GROUP BY d`);
  const days = [...new Set([...Object.keys(found), ...Object.keys(firsts), ...Object.keys(follow), ...Object.keys(replies)])]
    .sort().reverse()
    .map((d) => ({ day: d, found: found[d] ?? 0, contacted: firsts[d] ?? 0, followUps: follow[d] ?? 0, replies: replies[d] ?? 0 }));

  // ---- counts per filter (for the chips) ----
  const counts = Object.fromEntries(Object.entries(FILTERS).map(([k, where]) =>
    [k, (db.prepare(`SELECT COUNT(*) n FROM leads l WHERE ${where}`).get() as { n: number }).n]));

  // ---- businesses, most recent activity first ----
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const rows = db.prepare(`
    SELECT l.*, max(l.updated_at, coalesce((SELECT MAX(sent_at) FROM messages WHERE lead_id = l.id), 0), coalesce(l.replied_at, 0)) AS last
    FROM leads l
    WHERE ${FILTERS[filter]} AND (? = '' OR l.business LIKE ? OR l.query_key LIKE ?)
    ORDER BY last DESC LIMIT 150`).all(q, like, like) as Record<string, unknown>[];

  const ids = rows.map((r) => String(r.id));
  const msgs = ids.length
    ? db.prepare(`SELECT lead_id, channel, step, status, subject, body, sent_at, due_at, created_at, error FROM messages
        WHERE lead_id IN (${ids.map(() => '?').join(',')}) ORDER BY step, created_at`).all(...ids) as Record<string, unknown>[]
    : [];

  const businesses = rows.map((r) => {
    const b = parse<Record<string, unknown>>(r.business, {});
    const qual = parse<{ score?: string; opportunity?: string; reasons?: string[] } | null>(r.qualification, null);
    const [city, niche] = String(r.query_key).split('|');
    return {
      id: r.id, name: b.name, category: b.category, website: b.website ?? null, mapsUrl: b.googleMapsUrl ?? null,
      rating: b.rating ?? null, reviews: b.reviewCount ?? null, city, niche, country: r.country,
      stage: r.stage, skipReason: r.skip_reason, score: qual?.score ?? null, opportunity: qual?.opportunity ?? null,
      reasons: qual?.reasons ?? [], email: r.email, phone: r.phone,
      createdAt: r.created_at, checkedAt: r.stage === 'discovered' ? null : r.updated_at,
      repliedAt: r.replied_at, replyText: r.reply_text, last: r.last,
      messages: msgs.filter((m) => m.lead_id === r.id).map((m) => ({ ...m, lead_id: undefined })),
    };
  });

  return NextResponse.json({ days, counts, businesses, filter, q });
}
