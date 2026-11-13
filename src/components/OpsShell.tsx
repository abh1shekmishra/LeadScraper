'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Geist, Geist_Mono } from 'next/font/google';

// Shared frame for the agent console pages (/activity, /history).

const sans = Geist({ subsets: ['latin'], variable: '--font-sans' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

const NAV = [
  { href: '/activity', label: 'Live' },
  { href: '/history', label: 'History' },
  { href: '/queue', label: 'Queue' },
  { href: '/', label: 'Manual search' },
];

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.14em] uppercase text-[var(--ops-faint)]">{children}</div>;
}

export function Panel({ title, meta, children, className = '' }: { title: string; meta?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border border-[var(--ops-line)] bg-[var(--ops-surface)] rounded-lg flex flex-col min-w-0 ${className}`}>
      <header className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-[var(--ops-line)]">
        <Label>{title}</Label>
        {meta != null && <span className="num font-[family-name:var(--font-mono)] text-[11px] text-[var(--ops-faint)]">{meta}</span>}
      </header>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-[13px] text-[var(--ops-faint)]">{children}</p>;
}

export default function OpsShell({ status, children }: { status?: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className={`ops ${sans.variable} ${mono.variable} font-[family-name:var(--font-sans)] h-full overflow-y-auto`}>
      <div className="sticky top-0 z-10 border-b border-[var(--ops-line)] bg-[var(--ops-bg)]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-12 flex items-center gap-4">
          <span className="font-[family-name:var(--font-mono)] text-[12px] tracking-[0.18em] text-[var(--ops-text)]">LEADSCRAPER</span>
          <nav className="flex gap-1 text-[12px]">
            {NAV.map((n) => {
              const active = path === n.href;
              return (
                <Link key={n.href} href={n.href}
                  className={`px-2.5 py-1 rounded-md transition-[color,background-color] duration-150 ${n.href === '/' || n.href === '/queue' ? 'hidden md:inline' : ''} ${active ? 'bg-[var(--ops-raised)] text-[var(--ops-text)]' : 'text-[var(--ops-muted)] hover:text-[var(--ops-text)]'}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-4">{status}</div>
        </div>
      </div>
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">{children}</main>
    </div>
  );
}
