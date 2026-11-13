import { CONFIG } from './config';
import { OutreachDraft } from '@/types/lead';

// Pure timing/format helpers for the sender (no DB, no network), unit-tested.

const DAY = 86_400_000;
const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localTime(tz: string, at = new Date()): { day: number; hour: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
      .formatToParts(at);
  } catch {
    return localTime('UTC', at);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: WEEKDAY[get('weekday')], hour: Number(get('hour')) };
}

export function inWindow(w: { days: readonly number[]; fromHour: number; toHour: number }, tz: string, at = new Date()) {
  const { day, hour } = localTime(tz, at);
  return w.days.includes(day) && hour >= w.fromHour && hour < w.toHour;
}

// Earliest moment at/after `from` when the window is open in that timezone.
// Steps in 15-minute UTC slots so half-hour zones (India +5:30) land exactly.
// Null if none within 8 days.
export function nextWindowStart(
  w: { days: readonly number[]; fromHour: number; toHour: number }, tz: string, from = new Date(),
): Date | null {
  if (inWindow(w, tz, from)) return from;
  const SLOT = 15 * 60_000;
  const start = Math.floor(from.getTime() / SLOT) * SLOT;
  for (let i = 1; i <= 8 * 24 * 4; i++) {
    const c = new Date(start + i * SLOT);
    if (inWindow(w, tz, c)) return c;
  }
  return null;
}

export function followUpPlan(channel: 'email' | 'whatsapp', sentAt: number, outreach: OutreachDraft | null) {
  if (!outreach) return [];
  return CONFIG.followUps[channel]
    .map((f, i) => ({ step: i + 1, due: sentAt + f.days * DAY, body: outreach[f.field] }))
    .filter((f) => f.body?.trim());
}

// Opt-out line on every email; postal address where configured (required for US).
export function withFooter(body: string, postalAddress = CONFIG.postalAddress): string {
  const addr = postalAddress.trim();
  return `${body.trim()}\n\n${addr ? `${addr}\n` : ''}Not useful? Just reply "no thanks" and I won't write again.`;
}
