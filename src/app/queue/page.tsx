'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import type { BusinessInfo, LeadQualification, SiteHealth } from '@/types/lead';
import { PREVIEWS } from '@/agent/config';

const previewUrl = (slug: string) => `https://${PREVIEWS.project}.pages.dev/${slug}/`;

interface QueueMessage {
  id: number;
  channel: 'email' | 'whatsapp';
  step: number;
  variant: string | null;
  to_addr: string;
  subject: string | null;
  body: string;
  country: string;
  query_key: string;
  business: BusinessInfo;
  qualification: LeadQualification | null;
  health: SiteHealth | null;
  preview_slug: string | null;
}

interface Reply {
  id: string;
  business: BusinessInfo;
  email: string | null;
  phone: string | null;
  replied_at: number;
  reply_text: string;
}

interface Gig {
  id: string;
  source: string;
  url: string;
  title: string;
  email: string | null;
  posted_at: number;
  fit: number;
  why: string;
  budget: string | null;
  reply: string;
}

interface Rate { key: string; sent: number; replies: number; rate: number }

interface QueueData {
  stages: { stage: string; n: number }[];
  statuses: { status: string; n: number }[];
  messages: QueueMessage[];
  replies: Reply[];
  gigs: Gig[];
  rates: { niche: Rate[]; country: Rate[]; variant: Rate[] };
}

function GigCard({ g, onDone }: { g: Gig; onDone: () => void }) {
  const [reply, setReply] = useState(g.reply);
  const [copied, setCopied] = useState(false);

  async function act(action: 'done' | 'dismiss') {
    const res = await fetch('/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'gig', id: g.id, action }),
    });
    if (res.ok) onDone();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(reply); setCopied(true); } catch { /* clipboard blocked */ }
  }
  const mailto = g.email
    ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(g.email)}&su=${encodeURIComponent(`Re: ${g.title.slice(0, 80)}`)}&body=${encodeURIComponent(reply)}`
    : null;

  return (
    <article className="glass rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-white font-semibold">{g.title}</h3>
          <p className="text-xs text-white/50">
            {g.source} · {new Date(g.posted_at).toLocaleDateString()}{g.budget ? ` · ${g.budget}` : ''}
          </p>
        </div>
        <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-200 flex-shrink-0">fit {g.fit}/10</span>
      </div>
      <p className="text-sm text-white/70">{g.why}</p>
      <textarea
        aria-label="Reply draft"
        rows={6}
        className="bg-black/30 rounded-lg px-3 py-2 text-sm text-white leading-relaxed outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
        value={reply}
        onChange={(e) => { setReply(e.target.value); setCopied(false); }}
      />
      <div className="flex flex-wrap gap-2 justify-end">
        <button onClick={() => act('dismiss')} className="px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10">Dismiss</button>
        <a href={g.url} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg text-sm text-indigo-200 hover:bg-white/10">Open post</a>
        <button onClick={copy} className="px-3 py-2 rounded-lg text-sm text-indigo-200 hover:bg-white/10">{copied ? 'Copied' : 'Copy reply'}</button>
        {mailto && <a href={mailto} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg text-sm text-indigo-200 hover:bg-white/10">Email in Gmail</a>}
        <button onClick={() => act('done')} className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white">Mark replied</button>
      </div>
    </article>
  );
}

function RateTable({ title, rows }: { title: string; rows: Rate[] }) {
  if (!rows.length) return null;
  return (
    <div className="glass rounded-xl p-3 min-w-0">
      <h3 className="text-xs font-semibold text-white/70 mb-2">{title}</h3>
      <table className="w-full text-xs text-white/70">
        <thead><tr className="text-white/40"><th className="text-left font-normal">{title.split(' ').pop()}</th><th className="text-right font-normal">sent</th><th className="text-right font-normal">replies</th></tr></thead>
        <tbody>
          {rows.slice(0, 8).map((r) => (
            <tr key={r.key}><td className="truncate max-w-[10rem]">{r.key}</td><td className="text-right">{r.sent}</td><td className="text-right text-white">{r.replies}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReplyCard({ r }: { r: Reply }) {
  return (
    <article className="glass rounded-2xl p-4 flex flex-col gap-2 ring-1 ring-emerald-400/40">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-white font-semibold truncate">{r.business?.name}</h3>
        <time className="text-xs text-white/40 flex-shrink-0">{new Date(r.replied_at).toLocaleString()}</time>
      </div>
      <p className="text-sm text-white/80 whitespace-pre-wrap">{r.reply_text}</p>
      <div className="flex flex-wrap gap-3 text-xs">
        {r.phone && <a className="text-emerald-300 hover:underline" href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">Open WhatsApp chat</a>}
        {r.email && <a className="text-emerald-300 hover:underline" href={`https://mail.google.com/mail/u/0/#search/from%3A${encodeURIComponent(r.email)}`} target="_blank" rel="noreferrer">Open in Gmail</a>}
        {r.business?.website && <a className="text-indigo-300 hover:underline" href={r.business.website} target="_blank" rel="noreferrer">Website</a>}
      </div>
    </article>
  );
}

const SCORE_STYLE: Record<string, string> = {
  hot: 'bg-rose-500/20 text-rose-200',
  warm: 'bg-amber-500/20 text-amber-200',
  cold: 'bg-sky-500/20 text-sky-200',
};

function Draft({ m, onDone }: { m: QueueMessage; onDone: () => void }) {
  const [subject, setSubject] = useState(m.subject ?? '');
  const [body, setBody] = useState(m.body);
  const [busy, setBusy] = useState(false);
  const score = m.qualification?.score ?? 'cold';

  async function act(action: 'approve' | 'reject') {
    setBusy(true);
    const res = await fetch('/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, action, subject, body }),
    });
    setBusy(false);
    if (res.ok) onDone();
  }

  return (
    <article className="glass rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-white font-semibold truncate">{m.business.name}</h2>
          <p className="text-xs text-white/50 truncate">
            {m.business.category} · {m.query_key.split('|')[0]}, {m.country}
            {m.business.reviewCount ? ` · ${m.business.reviewCount} reviews` : ''}
          </p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {m.step > 0 && <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-violet-500/20 text-violet-200">Follow-up {m.step}</span>}
          <span className={`text-xs font-semibold uppercase px-2 py-1 rounded-lg ${SCORE_STYLE[score]}`}>{score}</span>
        </div>
      </div>

      <p className="text-sm text-white/80">{m.qualification?.opportunity}</p>
      {!!m.qualification?.reasons.length && (
        <ul className="flex flex-wrap gap-1.5">
          {m.qualification.reasons.map((r) => (
            <li key={r} className="text-xs text-white/60 bg-white/5 rounded-md px-2 py-0.5">{r}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-3 text-xs">
        {m.business.googleMapsUrl && <a className="text-indigo-300 hover:underline" href={m.business.googleMapsUrl} target="_blank" rel="noreferrer">Maps listing</a>}
        {m.business.website && <a className="text-indigo-300 hover:underline" href={m.business.website} target="_blank" rel="noreferrer">Website</a>}
        {m.preview_slug && <a className="text-emerald-300 hover:underline" href={previewUrl(m.preview_slug)} target="_blank" rel="noreferrer">Concept preview</a>}
        <span className="text-white/50">
          {m.channel === 'email' ? 'Email' : `WhatsApp (${m.variant?.replace('whatsapp', '')})`} to {m.to_addr}
        </span>
      </div>

      {m.channel === 'email' && (
        <input
          aria-label="Email subject"
          className="bg-black/30 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-400"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      )}
      <textarea
        aria-label="Message body"
        rows={m.channel === 'email' ? 9 : 5}
        className="bg-black/30 rounded-lg px-3 py-2 text-sm text-white leading-relaxed outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="flex gap-2 justify-end">
        <button disabled={busy} onClick={() => act('reject')}
          className="px-4 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 disabled:opacity-40">Reject</button>
        <button disabled={busy} onClick={() => act('approve')}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-40">Approve</button>
      </div>
    </article>
  );
}

export default function QueuePage() {
  const [data, setData] = useState<QueueData | null>(null);
  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);

  // Refetch on every tick; auto-tick every 15s so new drafts show up.
  useEffect(() => {
    let alive = true;
    fetch('/api/queue', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setData(d); })
      .catch(() => { /* dashboard server restarting; next tick retries */ });
    const t = setTimeout(() => setTick((x) => x + 1), 15_000);
    return () => { alive = false; clearTimeout(t); };
  }, [tick]);

  return (
    <div className="flex flex-col h-full">
      <Header />
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-lg font-bold text-white">Agent queue</h1>
            <Link href="/" className="text-xs text-indigo-300 hover:underline">Manual search</Link>
          </div>

          {data && (
            <div className="flex flex-wrap gap-2 text-xs">
              {[...data.stages.map((s) => [`leads ${s.stage}`, s.n] as const),
                ...data.statuses.map((s) => [`messages ${s.status}`, s.n] as const)].map(([k, n]) => (
                <span key={k} className="glass rounded-lg px-2.5 py-1 text-white/70">{k}: <b className="text-white">{n}</b></span>
              ))}
            </div>
          )}

          {!!data?.replies?.length && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-emerald-300">Replies ({data.replies.length}): these are yours to answer</h2>
              {data.replies.map((r) => <ReplyCard key={r.id} r={r} />)}
            </section>
          )}

          {!!data?.gigs?.length && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-indigo-200">Gigs people posted ({data.gigs.length}): reply fast, first good replies win</h2>
              {data.gigs.map((g) => <GigCard key={g.id} g={g} onDone={load} />)}
            </section>
          )}

          {data && (data.rates.niche.length > 0) && (
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <RateTable title="Replies by niche" rows={data.rates.niche} />
              <RateTable title="Replies by country" rows={data.rates.country} />
              <RateTable title="Replies by variant" rows={data.rates.variant} />
            </section>
          )}

          {data && <h2 className="text-sm font-semibold text-white/80 mt-2">Drafts waiting for approval</h2>}
          {!data && <p className="text-white/50 text-sm">Loading…</p>}
          {data && !data.messages.length && (
            <p className="text-white/50 text-sm">No drafts waiting. Start the agent with <code>npm run agent</code>.</p>
          )}
          {data?.messages.map((m) => <Draft key={m.id} m={m} onDone={load} />)}
        </div>
      </main>
    </div>
  );
}
