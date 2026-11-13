'use client';

import { useEffect, useState } from 'react';
import OpsShell, { Empty, Panel } from '@/components/OpsShell';
import { plainSkip } from '@/lib/plain';

// Read-only record of everything the agent has done: per day, and per business.

interface Msg { channel: string; step: number; status: string; subject: string | null; body: string; sent_at: number | null; due_at: number | null; created_at: number; error: string | null }
interface Biz {
  id: string; name: string; category: string; website: string | null; mapsUrl: string | null; rating: number | null; reviews: number | null;
  city: string; niche: string; country: string; stage: string; skipReason: string | null; score: string | null; opportunity: string | null;
  reasons: string[]; email: string | null; phone: string | null; createdAt: number; checkedAt: number | null;
  repliedAt: number | null; replyText: string | null; last: number; messages: Msg[];
}
interface Data {
  days: { day: string; found: number; contacted: number; followUps: number; replies: number }[];
  counts: Record<string, number>;
  businesses: Biz[];
}

const FILTERS: [string, string][] = [
  ['all', 'Everything'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['waiting', 'Waiting to send'],
  ['skipped', 'Skipped'], ['unchecked', 'Not checked yet'],
];

const fmt = (t: number | null) => (t
  ? new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  : '—');
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const chan = (c: string) => (c === 'email' ? 'Email' : 'WhatsApp');

function status(b: Biz): { text: string; color: string } {
  const sent = b.messages.filter((m) => m.status === 'sent').length;
  if (b.repliedAt) return { text: 'Replied', color: 'var(--ops-live)' };
  if (sent) return { text: sent > 1 ? `Contacted · ${sent} messages` : 'Contacted', color: 'var(--ops-text)' };
  if (b.stage === 'skipped') return { text: 'Skipped', color: 'var(--ops-faint)' };
  if (b.stage === 'drafted' || b.stage === 'qualified') return { text: 'Waiting to send', color: 'var(--ops-email)' };
  return { text: 'Not checked yet', color: 'var(--ops-faint)' };
}

function msgState(m: Msg): string {
  switch (m.status) {
    case 'sent': return `sent ${fmt(m.sent_at)}`;
    case 'scheduled': return `due ${fmt(m.due_at)}`;
    case 'approved': case 'pending': return 'queued to send';
    case 'failed': return `didn’t send: ${m.error ?? 'error'}`;
    case 'cancelled': return 'cancelled (they replied)';
    case 'rejected': return 'withdrawn before sending';
    default: return m.status;
  }
}

function Step({ dot, title, when, children }: { dot: string; title: React.ReactNode; when?: string; children?: React.ReactNode }) {
  return (
    <li className="relative pl-6 pb-4 last:pb-0">
      <span className="absolute left-0 top-[7px] w-2 h-2 rounded-full" style={{ background: dot }} />
      <span className="absolute left-[3px] top-[18px] bottom-0 w-px bg-[var(--ops-line)] [li:last-child>&]:hidden" />
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-[var(--ops-text)]">{title}</span>
        {when && <span className="num font-[family-name:var(--font-mono)] text-[11px] text-[var(--ops-faint)] flex-shrink-0">{when}</span>}
      </div>
      {children && <div className="mt-1 text-[13px] text-[var(--ops-muted)]">{children}</div>}
    </li>
  );
}

function Business({ b }: { b: Biz }) {
  const s = status(b);
  const visible = b.messages.filter((m) => m.status !== 'rejected');
  return (
    <details className="border-b border-[var(--ops-line)] last:border-b-0">
      <summary className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_12rem_8rem] items-center gap-x-4 gap-y-0.5 px-4 py-3 cursor-pointer list-none hover:bg-[var(--ops-raised)] transition-[background-color] duration-150">
        <span className="min-w-0">
          <span className="block text-[14px] text-[var(--ops-text)] truncate">{b.name}</span>
          <span className="block text-[12px] text-[var(--ops-faint)] truncate">{b.niche} · {b.city}, {b.country}</span>
        </span>
        <span className="text-[12px] text-right sm:text-left" style={{ color: s.color }}>{s.text}</span>
        <span className="hidden sm:block num font-[family-name:var(--font-mono)] text-[11px] text-[var(--ops-faint)] text-right">{fmt(b.last)}</span>
      </summary>

      <div className="px-4 pb-5 pt-1 grid md:grid-cols-[1fr_16rem] gap-6">
        <ol className="max-w-[72ch]">
          <Step dot="var(--ops-faint)" title="Found on Google Maps" when={fmt(b.createdAt)}>
            {b.category}{b.reviews != null ? ` · ${b.rating ?? '–'}★ from ${b.reviews} reviews` : ''}
          </Step>
          {b.checkedAt && (
            b.stage === 'skipped'
              ? <Step dot="var(--ops-faint)" title="Checked · skipped" when={fmt(b.checkedAt)}>{plainSkip(b.skipReason)}</Step>
              : <Step dot="var(--ops-text)" title={`Checked · ${b.score === 'hot' ? 'strong lead' : 'good lead'}`} when={fmt(b.checkedAt)}>
                  {b.opportunity}
                  {!!b.reasons.length && <span className="block text-[12px] text-[var(--ops-faint)] mt-1">{b.reasons.join(' · ')}</span>}
                </Step>
          )}
          {visible.map((m, i) => (
            <Step key={i} dot={m.status === 'sent' ? (m.channel === 'email' ? 'var(--ops-email)' : 'var(--ops-wa)') : 'var(--ops-line-strong)'}
              title={`${chan(m.channel)}${m.step ? ` · follow-up ${m.step}` : ' · first message'}`} when={msgState(m)}>
              <details>
                <summary className="cursor-pointer list-none text-[12px] text-[var(--ops-faint)] hover:text-[var(--ops-muted)] transition-[color] duration-150">Show message</summary>
                {m.subject && <span className="block mt-2 text-[var(--ops-text)]">{m.subject}</span>}
                <span className="block mt-1 whitespace-pre-wrap leading-relaxed">{m.body}</span>
              </details>
            </Step>
          ))}
          {b.repliedAt && (
            <Step dot="var(--ops-live)" title={<span className="text-[var(--ops-live)]">They replied</span>} when={fmt(b.repliedAt)}>
              <span className="whitespace-pre-wrap">{b.replyText}</span>
            </Step>
          )}
        </ol>

        <div className="flex flex-col gap-2 text-[12px]">
          {b.mapsUrl && <a className="text-[var(--ops-muted)] hover:text-[var(--ops-text)] transition-[color] duration-150" href={b.mapsUrl} target="_blank" rel="noreferrer">Google Maps listing ↗</a>}
          {b.website && <a className="text-[var(--ops-muted)] hover:text-[var(--ops-text)] transition-[color] duration-150 truncate" href={b.website} target="_blank" rel="noreferrer">Website ↗</a>}
          {b.phone && <a className="text-[var(--ops-muted)] hover:text-[var(--ops-text)] transition-[color] duration-150" href={`https://wa.me/${b.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp chat ↗</a>}
          {b.email && <a className="text-[var(--ops-muted)] hover:text-[var(--ops-text)] transition-[color] duration-150 truncate" href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(b.email)}`} target="_blank" rel="noreferrer">Gmail thread ↗</a>}
        </div>
      </div>
    </details>
  );
}

export default function HistoryPage() {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState('contacted');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');

  // Debounce typing so every keystroke doesn't hit the database.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/history?filter=${filter}&q=${encodeURIComponent(query)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setData(d); })
      .catch(() => { /* dashboard restarting */ });
    return () => { alive = false; };
  }, [filter, query]);

  const maxDay = Math.max(1, ...(data?.days ?? []).map((d) => d.contacted + d.followUps));

  return (
    <OpsShell>
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] leading-[1.2] font-medium text-[var(--ops-text)]">History</h1>
        <p className="text-[14px] text-[var(--ops-muted)]">Every business the agent has looked at, and everything it did with each one.</p>
      </div>

      <Panel title="Day by day" meta="last 14 days">
        {data?.days.length ? (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.1em] uppercase text-[var(--ops-faint)]">
                <th className="text-left font-normal px-4 py-2">Day</th>
                <th className="text-right font-normal px-4 py-2">Found</th>
                <th className="text-right font-normal px-4 py-2">Contacted</th>
                <th className="text-right font-normal px-4 py-2 hidden sm:table-cell">Follow-ups</th>
                <th className="text-right font-normal px-4 py-2">Replies</th>
                <th className="hidden md:table-cell w-[30%] px-4 py-2" />
              </tr>
            </thead>
            <tbody className="num font-[family-name:var(--font-mono)]">
              {data.days.map((d) => (
                <tr key={d.day} className="border-t border-[var(--ops-line)]">
                  <td className="px-4 py-2 font-[family-name:var(--font-sans)] text-[var(--ops-text)]">{dayLabel(d.day)}</td>
                  <td className="px-4 py-2 text-right text-[var(--ops-muted)]">{d.found}</td>
                  <td className="px-4 py-2 text-right text-[var(--ops-text)]">{d.contacted}</td>
                  <td className="px-4 py-2 text-right text-[var(--ops-muted)] hidden sm:table-cell">{d.followUps}</td>
                  <td className="px-4 py-2 text-right" style={{ color: d.replies ? 'var(--ops-live)' : 'var(--ops-faint)' }}>{d.replies}</td>
                  <td className="hidden md:table-cell px-4 py-2">
                    <div className="h-[3px] bg-[var(--ops-line)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--ops-live)] rounded-full" style={{ width: `${((d.contacted + d.followUps) / maxDay) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>No activity yet.</Empty>}
      </Panel>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter businesses">
          {FILTERS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-md text-[12px] border transition-[color,background-color,border-color] duration-150 ${filter === k
                ? 'bg-[var(--ops-raised)] border-[var(--ops-line-strong)] text-[var(--ops-text)]'
                : 'border-[var(--ops-line)] text-[var(--ops-muted)] hover:text-[var(--ops-text)] hover:border-[var(--ops-line-strong)]'}`}>
              {label} <span className="num font-[family-name:var(--font-mono)] text-[var(--ops-faint)]">{data?.counts[k] ?? '–'}</span>
            </button>
          ))}
        </div>
        <label className="sm:ml-auto flex items-center gap-2">
          <span className="sr-only">Search businesses</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or city"
            className="w-full sm:w-64 bg-[var(--ops-surface)] border border-[var(--ops-line)] rounded-md px-3 py-1.5 text-[13px] text-[var(--ops-text)] placeholder:text-[var(--ops-faint)] outline-none focus-visible:border-[var(--ops-line-strong)] transition-[border-color] duration-150" />
        </label>
      </div>

      <Panel title="Businesses" meta={data ? `${data.businesses.length}${data.businesses.length === 150 ? '+' : ''} shown` : ''}>
        {!data ? <Empty>Loading…</Empty>
          : data.businesses.length ? data.businesses.map((b) => <Business key={b.id} b={b} />)
          : <Empty>{query ? `Nothing matches “${query}”.` : 'Nothing here yet.'}</Empty>}
      </Panel>
    </OpsShell>
  );
}
