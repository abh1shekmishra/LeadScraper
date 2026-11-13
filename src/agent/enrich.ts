import { promises as dns } from 'node:dns';
import { BROWSER_HEADERS, extractEmails, readCapped } from '@/lib/website-health';

// Free contact enrichment: what the business publishes itself, checked for a
// mail server. No paid finders, no guessed addresses.

const CONTACT_PATHS = ['/contact', '/contact-us', '/about', '/about-us'];

export async function crawlContactEmails(website: string): Promise<string[]> {
  const base = new URL(website.includes('://') ? website : `https://${website}`);
  const found = new Set<string>();
  for (const p of CONTACT_PATHS) {
    try {
      const res = await fetch(new URL(p, base), {
        headers: BROWSER_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { await res.body?.cancel(); continue; }
      for (const e of extractEmails(await readCapped(res))) found.add(e);
      if (found.size) break;
    } catch { /* next path */ }
  }
  return [...found];
}

const ROLE_FIRST = /^(info|hello|contact|enquir|inquir|office|studio|admin|bookings?|sales|team)/;

// Prefer an address on the business's own domain, then a role inbox.
export function pickEmail(emails: string[], website: string | null): string | null {
  if (!emails.length) return null;
  let host = '';
  try { host = new URL(website!.includes('://') ? website! : `https://${website}`).hostname.replace(/^www\./, ''); } catch { /* no site */ }
  const rank = (e: string) =>
    (host && e.endsWith(`@${host}`) ? 0 : 2) + (ROLE_FIRST.test(e) ? 0 : 1);
  return [...emails].sort((a, b) => rank(a) - rank(b))[0];
}

// Domain must accept mail, or the send just bounces and hurts your Gmail reputation.
export async function hasMx(email: string): Promise<boolean> {
  try {
    return (await dns.resolveMx(email.split('@')[1])).length > 0;
  } catch {
    return false;
  }
}
