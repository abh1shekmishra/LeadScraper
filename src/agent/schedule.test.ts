import { describe, expect, it } from 'vitest';
import { followUpPlan, inWindow, localTime, nextWindowStart, withFooter } from '@/agent/schedule';
import type { OutreachDraft } from '@/types/lead';

// Wed 2026-11-11 04:30 UTC = 10:00 IST (Wed) = 23:30 New York (Tue).
const at = new Date('2026-11-11T04:30:00Z');

describe('send windows', () => {
  it('reads local weekday and hour per timezone', () => {
    expect(localTime('Asia/Kolkata', at)).toEqual({ day: 3, hour: 10 });
    expect(localTime('America/New_York', at)).toEqual({ day: 2, hour: 23 });
    expect(localTime('Not/AZone', at)).toEqual({ day: 3, hour: 4 }); // falls back to UTC
  });
  it('only sends inside the business hours window', () => {
    const w = { days: [1, 2, 3, 4, 5], fromHour: 9, toHour: 12 };
    expect(inWindow(w, 'Asia/Kolkata', at)).toBe(true);
    expect(inWindow(w, 'America/New_York', at)).toBe(false);
    expect(inWindow({ ...w, days: [6, 7] }, 'Asia/Kolkata', at)).toBe(false);
  });
});

describe('nextWindowStart', () => {
  const w = { days: [1, 2, 3, 4, 5], fromHour: 9, toHour: 12 };
  it('is now when the window is open', () => {
    expect(nextWindowStart(w, 'Asia/Kolkata', at)).toEqual(at);
  });
  it('finds the next opening in the business timezone', () => {
    // Tue 23:30 New York -> Wed 09:00 New York = Wed 13:00 UTC
    expect(nextWindowStart(w, 'America/New_York', at)?.toISOString()).toBe('2026-11-11T14:00:00.000Z');
  });
});

describe('follow-ups', () => {
  const o = { followUp1: 'one', followUp2: 'two', followUp3: '' } as OutreachDraft;
  it('schedules email follow-ups at 3/7 days and skips empty bodies', () => {
    const plan = followUpPlan('email', 0, o);
    expect(plan.map((p) => [p.step, p.due / 86_400_000, p.body])).toEqual([[1, 3, 'one'], [2, 7, 'two']]);
  });
  it('gives WhatsApp a single day-7 follow-up', () => {
    expect(followUpPlan('whatsapp', 0, o).map((p) => [p.step, p.body])).toEqual([[1, 'two']]);
  });
});

describe('email footer', () => {
  it('always adds the opt-out, and the address when set', () => {
    expect(withFooter('Hi\n', '')).toBe('Hi\n\nNot useful? Just reply "no thanks" and I won\'t write again.');
    expect(withFooter('Hi', 'PO Box 1, Pune')).toContain('Hi\n\nPO Box 1, Pune\nNot useful?');
  });
});
