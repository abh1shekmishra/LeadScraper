'use client';

import { useEffect, useMemo, useState } from 'react';
import OpsShell, { Empty, Label, Panel } from '@/components/OpsShell';
import { EventKind, plainEvent } from '@/lib/plain';

// Live, read-only operations console for the autonomous agent. Nothing here
// changes anything; it polls /api/activity and ticks a local clock.

interface Msg { id: number; channel: string; step: number; subject?: string | null; body: string; name: string; country?: string; to?: string; to_addr?: string }
interface Data {
  now: number;
  agentAlive: boolean;
  autonomous: boolean;
  todaySummary: { searches: number; found: number; checked: number; written: number; sent: number; replies: number };
  today: { email: number; emailCap: number; whatsapp: number; whatsappCap: number };
  totals: { sent: number; replies: number; searchesDone: number; totalSearches: number; stages: { stage: string; n: number }[] };
  upNext: (Msg & { earliest: number | null; note: string | null })[];
  sent: (Msg & { sent_at: number; replied_at: number | null })[];
  followUps: (Msg & { due_at: number })[];
  replies: { id: string; name: string; email: string | null; phone: string | null; website: string | null; replied_at: number; reply_text: string }[];
  problems: { id: number; channel: string; to_addr: string; error: string; at: number; name: string }[];
  gigs: { id: string; source: string; url: string; title: string; fit: number; budget: string | null; why: string; posted_at: number }[];
  rates: { key: string; sent: number; replies: number }[];
  log: { at: number; line: string }[];
}

// ---------- helpers ----------

const KIND_LABEL: Record<EventKind, string> = {
  find: 'Search', check: 'Lead', skip: 'Skip', draft: 'Write', send: 'Sent', reply: 'Reply', gig: 'Gigs', err: 'Error', sys: 'System',
};
const KIND_COLOR: Record<EventKind, string> = {
  find: 'var(--ops-muted)', check: 'var(--ops-text)', skip: 'var(--ops-faint)', draft: 'var(--ops-email)',
  send: 'var(--ops-live)', reply: 'var(--ops-live)', gig: 'var(--ops-warn)', err: 'var(--ops-err)', sys: 'var(--ops-faint)',
};

const pad = (n: number) => String(n).padStart(2, '0');
function countdown(ms: number) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hms = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d ? `${d}d ${hms}` : hms;
}
function ago(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function at(t: number | null, now: number) {
  if (t == null) return '—';
  const d = new Date(t);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if (Math.abs(t - now) < 60_000) return 'now';
  return new Date(now).toDateString() === d.toDateString()
    ? time
    : `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric' })} ${time}`;
}
const chan = (c: string) => (c === 'email' ? 'Email' : 'WhatsApp');
const chanColor = (c: string) => (c === 'email' ? 'var(--ops-email)' : 'var(--ops-wa)');

// ---------- small pieces ----------

function MessageItem({ m, right, accent }: { m: Msg; right: React.ReactNode; accent?: string }) {
  return (
    <details className="group border-b border-[var(--ops-line)] last:border-b-0">
      <summary className="flex items-center gap-3 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--ops-raised)] transition-[background-color] duration-150">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accent ?? chanColor(m.channel) }} />
        <span className="text-[13px] text-[var(--ops-text)] truncate flex-1 min-w-0">{m.name}</span>
        <span className="num font-[family-name:var(--font-mono)] text-[11px] text-[var(--ops-muted)] flex-shrink-0">{right}</span>
      </summary>
      <div className="px-4 pb-4 pt-1 flex flex-col gap-2">
        <div className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--ops-faint)]">
          {chan(m.channel)}{m.step ? ` · follow-up ${m.step}` : ''}{m.country ? ` · ${m.country}` : ''}{(m.to ?? m.to_addr) ? ` · ${m.to ?? m.to_addr}` : ''}
        </div>
        {m.subject && <div className="text-[13px] text-[var(--ops-text)]">{m.subject}</div>}
        <p className="text-[13px] leading-relaxed text-[var(--ops-muted)] whitespace-pre-wrap max-w-[68ch]">{m.body}</p>
      </div>
    </details>
  );
}

function Quota({ label, used, cap, color }: { label: string; used: number; cap: number; color: string }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, cap)) * 100));
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-[var(--ops-muted)]">{label}</span>
        <span className="num font-[family-name:var(--font-mono)] text-[12px] text-[var(--ops-text)]">{used}<span className="text-[var(--ops-faint)]">/{cap}</span></span>
      </div>
      <div className="h-[3px] bg-[var(--ops-line)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-200 ease-out" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ---------- page ----------

const logKey = (l: { at: number; line: string }) => `${l.at}|${l.line}`;

export default function ActivityPage() {
  // `fresh` = event keys that arrived in the latest poll (they slide in once).
  const [state, setState] = useState<{ data: Data | null; fresh: Set<string> }>({ data: null, fresh: new Set() });
  const data = state.data;
  const [offline, setOffline] = useState(false);
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState(() => Date.now());

  // Data: every 5s (local, cheap). Clock: every second, so countdowns move.
  useEffect(() => {
    let alive = true;
    fetch('/api/activity', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => {
        if (!alive) return;
        setState((prev) => {
          const seen = new Set(prev.data?.log.map(logKey) ?? []);
          const fresh = prev.data ? new Set(d.log.map(logKey).filter((k) => !seen.has(k))) : new Set<string>();
          return { data: d, fresh };
        });
        setOffline(false);
      })
      .catch(() => { if (alive) setOffline(true); });
    const t = setTimeout(() => setTick((x) => x + 1), 5_000);
    return () => { alive = false; clearTimeout(t); };
  }, [tick]);
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  const events = useMemo(
    () => (data?.log ?? []).map((l) => ({ ...l, key: logKey(l), fresh: state.fresh.has(logKey(l)), ...plainEvent(l.line) })),
    [data, state.fresh],
  );

  if (!data) {
    return (
      <OpsShell>
        <div className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--ops-muted)] py-24 text-center">
          {offline ? 'Dashboard can’t reach the agent database. Is the dashboard running?' : 'Connecting to agent…'}
        </div>
      </OpsShell>
    );
  }

  const stage = (s: string) => data.totals.stages.find((x) => x.stage === s)?.n ?? 0;
  const latest = events[0];
  const next = data.upNext.find((m) => m.earliest != null);
  const nextIn = next?.earliest != null ? next.earliest - clock : null;
  const lastAction = latest ? clock - latest.at : null;
  const busy = lastAction != null && lastAction < 3 * 60_000;

  const pipeline = [
    { k: 'Searched', v: data.totals.searchesDone, sub: `of ${data.totals.totalSearches} city × niche searches` },
    { k: 'To check', v: stage('discovered'), sub: 'businesses found, not checked yet' },
    { k: 'To write', v: stage('qualified'), sub: `good leads · ${stage('drafted')} written so far` },
    { k: 'To send', v: data.upNext.length, sub: `messages queued · ${data.totals.sent} sent total` },
    { k: 'Replies', v: data.totals.replies, sub: data.totals.replies ? 'answer these yourself' : 'none yet' },
  ];
  const t = data.todaySummary;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  const status = (
    <>
      <span className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-[11px]">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: offline || !data.agentAlive ? 'var(--ops-err)' : 'var(--ops-live)' }} />
        <span className={offline || !data.agentAlive ? 'text-[var(--ops-err)]' : 'text-[var(--ops-live)]'}>
          {offline ? 'DASHBOARD OFFLINE' : data.agentAlive ? (data.autonomous ? 'RUNNING · FULLY AUTOMATIC' : 'RUNNING · NEEDS APPROVAL') : 'AGENT STOPPED'}
        </span>
      </span>
      <span className="num hidden sm:inline font-[family-name:var(--font-mono)] text-[12px] text-[var(--ops-muted)]">
        {new Date(clock).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}
      </span>
    </>
  );

  return (
    <OpsShell status={status}>
        {/* ---- today, in one sentence ---- */}
        <p className="text-[15px] leading-relaxed text-[var(--ops-muted)] max-w-[90ch]">
          <span className="text-[var(--ops-text)]">Today</span> the agent ran {plural(t.searches, 'search', 'searches')}, found{' '}
          {plural(t.found, 'new business', 'new businesses')}, checked {t.checked}, wrote {plural(t.written, 'message')} and sent{' '}
          <span className="text-[var(--ops-live)]">{t.sent}</span>.{' '}
          {t.replies ? <span className="text-[var(--ops-live)]">{plural(t.replies, 'reply', 'replies')} came in.</span> : 'No replies yet today.'}
        </p>

        {/* ---- hero: now + next transmission ---- */}
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
          <section className="border border-[var(--ops-line)] bg-[var(--ops-surface)] rounded-lg p-6 flex flex-col gap-5 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <Label>Now</Label>
              <span className="num font-[family-name:var(--font-mono)] text-[11px] text-[var(--ops-faint)]">
                {lastAction != null ? `last action ${ago(lastAction)}` : 'waiting for first action'}
              </span>
            </div>
            {latest ? (
              <div key={latest.key} className="ops-in flex flex-col gap-2 min-w-0">
                <span className="font-[family-name:var(--font-mono)] text-[12px] tracking-[0.14em]" style={{ color: KIND_COLOR[latest.kind] }}>
                  {busy ? '▸ ' : ''}{KIND_LABEL[latest.kind]}
                </span>
                <p className="text-[22px] sm:text-[26px] leading-[1.2] font-medium text-[var(--ops-text)] break-words">{latest.text}</p>
              </div>
            ) : (
              <p className="text-[22px] leading-[1.2] text-[var(--ops-muted)]">Agent hasn’t logged anything yet.</p>
            )}
            <div className="grid grid-cols-2 gap-6 pt-1 border-t border-[var(--ops-line)] mt-auto">
              <div className="pt-4"><Quota label="Emails today" used={data.today.email} cap={data.today.emailCap} color="var(--ops-email)" /></div>
              <div className="pt-4"><Quota label="WhatsApp today" used={data.today.whatsapp} cap={data.today.whatsappCap} color="var(--ops-wa)" /></div>
            </div>
          </section>

          <section className="border border-[var(--ops-line)] bg-[var(--ops-surface)] rounded-lg p-6 flex flex-col gap-4 min-w-0">
            <Label>Next message</Label>
            {next && nextIn != null ? (
              <>
                <div className="num font-[family-name:var(--font-mono)] text-[44px] sm:text-[56px] leading-none tracking-tight text-[var(--ops-text)]">
                  {nextIn <= 60_000 ? 'sending' : countdown(nextIn)}
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-[15px] text-[var(--ops-text)] truncate">{next.name}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[11px]" style={{ color: chanColor(next.channel) }}>
                    {chan(next.channel).toUpperCase()}{next.step ? ` · FOLLOW-UP ${next.step}` : ''} · {next.country} · {at(next.earliest, clock)}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-[var(--ops-faint)] mt-auto">
                  Each message waits for the business&apos;s own working hours; daily limits and random spacing apply on top.
                </p>
              </>
            ) : (
              <p className="text-[15px] text-[var(--ops-muted)]">Nothing queued. New drafts appear as the agent finds businesses.</p>
            )}
          </section>
        </div>

        {/* ---- pipeline ---- */}
        <div className="grid grid-cols-2 sm:grid-cols-5 border border-[var(--ops-line)] rounded-lg bg-[var(--ops-surface)] overflow-hidden">
          {pipeline.map((p, i) => (
            <div key={p.k} className={`px-4 py-4 flex flex-col gap-1 ${i ? 'sm:border-l' : ''} border-[var(--ops-line)] ${i > 1 ? 'border-t sm:border-t-0' : ''} ${i === 1 ? 'border-l' : ''}`}>
              <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.14em] text-[var(--ops-faint)]">{String(i + 1).padStart(2, '0')} {p.k.toUpperCase()}</span>
              <span className="num font-[family-name:var(--font-mono)] text-[28px] leading-none text-[var(--ops-text)]">{p.v}</span>
              <span className="text-[12px] text-[var(--ops-muted)]">{p.sub}</span>
            </div>
          ))}
        </div>

        {/* ---- replies, when there are any, come first ---- */}
        {!!data.replies.length && (
          <Panel title="Replies · yours to answer" meta={data.replies.length}>
            {data.replies.map((r) => (
              <div key={r.id} className="px-4 py-3 border-b border-[var(--ops-line)] last:border-b-0 flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] text-[var(--ops-text)]">{r.name}</span>
                  <span className="num font-[family-name:var(--font-mono)] text-[11px] text-[var(--ops-live)]">{at(r.replied_at, clock)}</span>
                </div>
                <p className="text-[13px] text-[var(--ops-muted)] whitespace-pre-wrap max-w-[68ch]">{r.reply_text}</p>
                <div className="flex gap-4 text-[12px]">
                  {r.phone && <a className="text-[var(--ops-live)] hover:underline" href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">Open WhatsApp</a>}
                  {r.email && <a className="text-[var(--ops-live)] hover:underline" href={`https://mail.google.com/mail/u/0/#search/from%3A${encodeURIComponent(r.email)}`} target="_blank" rel="noreferrer">Open Gmail</a>}
                  {r.website && <a className="text-[var(--ops-muted)] hover:underline" href={r.website} target="_blank" rel="noreferrer">Website</a>}
                </div>
              </div>
            ))}
          </Panel>
        )}

        {/* ---- stream + outbox ---- */}
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
          <Panel title="What it's doing" meta={`last ${events.length} actions`}>
            <ol className="max-h-[30rem] overflow-y-auto text-[13px]">
              {events.map((e) => (
                <li key={e.key} className={`${e.fresh ? 'ops-in' : ''} grid grid-cols-[2.75rem_3.5rem_1fr] gap-3 px-4 py-2 border-b border-[var(--ops-line)] last:border-b-0`}>
                  <span className="num font-[family-name:var(--font-mono)] text-[11px] leading-5 text-[var(--ops-faint)]">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[11px] leading-5" style={{ color: KIND_COLOR[e.kind] }}>{KIND_LABEL[e.kind]}</span>
                  <span className={`leading-5 break-words ${e.kind === 'skip' ? 'text-[var(--ops-faint)]' : 'text-[var(--ops-muted)]'}`}>{e.text}</span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Outbox" meta={`${data.upNext.length} waiting`}>
            {data.upNext.length ? (
              <div className="max-h-[30rem] overflow-y-auto">
                {data.upNext.map((m) => <MessageItem key={m.id} m={m} right={m.note ?? at(m.earliest, clock)} />)}
              </div>
            ) : <Empty>Nothing waiting to send.</Empty>}
          </Panel>
        </div>

        {/* ---- history ---- */}
        <div className="grid lg:grid-cols-3 gap-4">
          <Panel title="Sent" meta={data.sent.length}>
            {data.sent.length ? (
              <div className="max-h-[24rem] overflow-y-auto">
                {data.sent.map((m) => (
                  <MessageItem key={m.id} m={m} accent={m.replied_at ? 'var(--ops-live)' : undefined}
                    right={<>{m.replied_at ? <span className="text-[var(--ops-live)]">replied · </span> : null}{at(m.sent_at, clock)}</>} />
                ))}
              </div>
            ) : <Empty>Nothing sent yet.</Empty>}
          </Panel>

          <Panel title="Follow-ups scheduled" meta={data.followUps.length}>
            {data.followUps.length ? (
              <div className="max-h-[24rem] overflow-y-auto">
                {data.followUps.map((m) => <MessageItem key={m.id} m={m} right={at(m.due_at, clock)} />)}
              </div>
            ) : <Empty>Each first message schedules its follow-ups here. A reply cancels them.</Empty>}
          </Panel>

          <div className="flex flex-col gap-4 min-w-0">
            <Panel title="Problems" meta={data.problems.length}>
              {data.problems.length ? (
                <div className="max-h-[11rem] overflow-y-auto">
                  {data.problems.map((p) => (
                    <div key={p.id} className="px-4 py-2 border-b border-[var(--ops-line)] last:border-b-0 flex flex-col gap-0.5">
                      <span className="text-[13px] text-[var(--ops-text)] truncate">{p.name}</span>
                      <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--ops-err)] truncate">{p.error}</span>
                    </div>
                  ))}
                </div>
              ) : <Empty>No failed sends or bounces.</Empty>}
            </Panel>

            <Panel title="Gigs posted" meta={data.gigs.length}>
              {data.gigs.length ? (
                data.gigs.map((g) => (
                  <a key={g.id} href={g.url} target="_blank" rel="noreferrer"
                    className="block px-4 py-2 border-b border-[var(--ops-line)] last:border-b-0 hover:bg-[var(--ops-raised)] transition-[background-color] duration-150">
                    <div className="flex gap-3"><span className="text-[13px] text-[var(--ops-text)] truncate flex-1">{g.title}</span><span className="num font-[family-name:var(--font-mono)] text-[11px] text-[var(--ops-warn)]">{g.fit}/10</span></div>
                    <div className="text-[12px] text-[var(--ops-faint)] truncate">{g.source}{g.budget ? ` · ${g.budget}` : ''}</div>
                  </a>
                ))
              ) : <Empty>No matching gigs right now. Checked every 2 hours.</Empty>}
            </Panel>
          </div>
        </div>

        {!!data.rates.length && (
          <Panel title="Reply rate by niche · effort shifts toward what works">
            <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3">
              {data.rates.map((r) => (
                <span key={r.key} className="text-[12px] text-[var(--ops-muted)]">
                  {r.key} <span className="num font-[family-name:var(--font-mono)] text-[var(--ops-text)]">{r.replies}/{r.sent}</span>
                </span>
              ))}
            </div>
          </Panel>
        )}
    </OpsShell>
  );
}
