import type { DatabaseSync } from 'node:sqlite';

// Reply-rate learning. Every first message sent is an experiment; replies are
// the result. Smoothed rates steer which niches get searched and drafted first
// and which WhatsApp variant gets used, without overreacting to tiny samples.

// (replies + 1) / (sent + 10): new options start at 10% and must earn more.
export const smoothed = (replies: number, sent: number) => (replies + 1) / (sent + 10);

export function weightedPick<T>(items: { item: T; w: number }[], r = Math.random()): T {
  const total = items.reduce((s, i) => s + i.w, 0);
  let x = r * total;
  for (const i of items) if ((x -= i.w) < 0) return i.item;
  return items[items.length - 1].item;
}

// Sending is the bottleneck (daily caps), so the outbox goes best-first:
// strength of the provable gap, how established the business is (more reviews =
// more customers = budget), and what's been earning replies for this niche.
export function leadPriority(score: string, reviews: number, rating: number | null, nicheRate = 0.1): number {
  return (score === 'hot' ? 2 : score === 'warm' ? 1 : 0)
    + Math.log10(Math.max(0, reviews) + 1) * 0.5
    + ((rating ?? 0) >= 4.5 ? 0.2 : 0)
    + nicheRate * 5;
}

export type Dim = 'niche' | 'country' | 'channel' | 'variant' | 'city';

const DIM_SQL: Record<Dim, string> = {
  niche: `substr(l.query_key, instr(l.query_key, '|') + 1)`,
  city: `substr(l.query_key, 1, instr(l.query_key, '|') - 1)`,
  country: 'l.country',
  channel: 'm.channel',
  variant: `coalesce(m.variant, m.channel)`,
};

export function replyRates(db: DatabaseSync, dim: Dim): { key: string; sent: number; replies: number; rate: number }[] {
  const rows = db.prepare(`
    SELECT ${DIM_SQL[dim]} AS key, COUNT(*) AS sent, SUM(CASE WHEN l.replied_at IS NOT NULL THEN 1 ELSE 0 END) AS replies
    FROM messages m JOIN leads l ON l.id = m.lead_id
    WHERE m.step = 0 AND m.status IN ('sent', 'failed') AND m.sent_at IS NOT NULL
    GROUP BY key ORDER BY sent DESC`).all() as { key: string; sent: number; replies: number }[];
  return rows.map((r) => ({ ...r, rate: smoothed(r.replies, r.sent) }));
}

export function weightsBy(db: DatabaseSync, dim: Dim): Map<string, number> {
  return new Map(replyRates(db, dim).map((r) => [r.key, r.rate]));
}
