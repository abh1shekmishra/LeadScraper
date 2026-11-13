import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BusinessInfo, BusinessReview } from '@/types/lead';

// Discovery through gosom/google-maps-scraper (MIT, local, no API key, no cost).
// It drives a real browser over Google Maps, so it's slow on purpose: few
// queries per run, low concurrency.

export interface Discovered {
  business: BusinessInfo;
  emails: string[];
  timezone: string | null;
  mapsOrdering: boolean; // listing already links online ordering / reservations
}

// Normalise a Maps phone into E.164 for WhatsApp. Null when it can't be trusted.
export function toE164(phone: string | null | undefined, dial: string): string | null {
  if (!phone) return null;
  const hasPlus = phone.trim().startsWith('+');
  let d = phone.replace(/\D/g, '');
  if (!d) return null;
  if (hasPlus) {
    // already international
  } else if (d.startsWith('00')) {
    d = d.slice(2);
  } else if (d.startsWith(dial) && d.length >= dial.length + 9) {
    // national number already prefixed with the country code
  } else {
    d = dial + d.replace(/^0+/, '');
  }
  return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
}

type Raw = Record<string, unknown>;

function mapReviews(raw: unknown): BusinessReview[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: Raw) => ({
      rating: Number(r.Rating ?? r.rating ?? 0),
      text: String(r.Description ?? r.description ?? r.text ?? ''),
      when: String(r.When ?? r.when ?? ''),
    }))
    .filter((r) => r.text.trim().length > 0)
    .slice(0, 5);
}

const nonEmpty = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v);

// "Jensen & Co. | Interior Designers NYC" -> "Jensen & Co.": a person writing to them
// uses the business name, not the SEO keywords stuffed into the listing title.
export function cleanName(title: string): string {
  // NFKC turns "fancy" Unicode (𝐃𝐢𝐠𝐢𝐜𝐫𝐚𝐟𝐭) back into plain letters.
  const t = title.normalize('NFKC').replace(/\s+/g, ' ').trim();
  let head = t.split(/\s+[|–—·•/]\s+|\s+-\s+/)[0]
    .replace(/\s*\([^)]*\)/g, '')                       // "(Carpentry and Joinery)"
    .trim();
  // Drop a trailing non-Latin duplicate of a Latin name ("Ideal Co. شركة ...").
  if (/[A-Za-z]/.test(head)) head = head.replace(/[\s؀-ۿऀ-ॿ]+$/u, '').trim();
  // Keyword stuffing with no separator: "Expressions Inside Interior Designer 15 years experience Best ..."
  const stuffed = head.search(/\s(best|top|no\.?\s?1|#1|\d+\+?\s*(yrs|years)|experienced?|near me|affordable|cheap)\b/i);
  if (stuffed >= 3) head = head.slice(0, stuffed).trim();
  return head.length >= 3 ? head : t;
}

// Businesses that show up in a niche search but aren't buyers: schools, courses.
export const NOT_A_TARGET = /\b(school|institute|academy|college|university|training|courses?|classes)\b/i;

// Hosts many unrelated businesses share (social, link pages, directories, free builders).
const SHARED_HOSTS = /(^|\.)(facebook|fb|instagram|linktr|linktree|wa\.me|whatsapp|business\.site|sites\.google|google|justdial|sulekha|a2zdial|indiamart|houzz|yelp|tradeindia|yellowpages|wixsite|weebly|blogspot|wordpress\.com|godaddysites|square\.site)\./i;

// The company's own domain as a dedupe key ("homelane.com"), so branches that link
// to homelane.com/locations/... count as one company. Null for shared hosts.
export function siteKey(website: string | null): string | null {
  if (!website) return null;
  try {
    const u = new URL(website.includes('://') ? website : `https://${website}`);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    return SHARED_HOSTS.test(`.${host}`) ? null : host;
  } catch {
    return null;
  }
}

// Words that describe a business rather than name it, and legal suffixes.
const GENERIC_WORDS = new Set(('interior interiors design designs designer designers studio studios architect architects ' +
  'architecture decor decors decorator decorators decoration and the of by in at group solutions solution services ' +
  'service consultants consultant associates branch showroom office experience centre center home homes space spaces ' +
  'pvt private ltd limited llc l l c inc co company corp llp plc spc pte fze fzco gmbh india uae').split(' '));

// Brand identity for spotting branches of one business that use different phones,
// emails or no website ("Shreeji Interiors Andheri" / "Shreeji Interiors Thane").
// Drops descriptive words and any word from the listing's own address (the branch's
// locality). Null when what's left is too short to be distinctive, so unrelated
// businesses with common names ("Shree Interiors") are never merged.
export function brandKey(name: string, address: string): string | null {
  const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const place = new Set(norm(address).split(' ').filter((w) => w.length > 2));
  const words = norm(name.split(',')[0]).split(' ')
    .filter((w) => w.length > 1 && !GENERIC_WORDS.has(w) && !place.has(w));
  const key = words.join(' ');
  const letters = key.replace(/ /g, '').length;
  // One word must be long enough to be a coined brand ("homelane"), not a surname
  // ("jensen"); two distinctive words ("sai krupa") are specific enough at 6+.
  const distinctive = words.length >= 2 ? letters >= 6 : letters >= 8;
  return distinctive ? key : null;
}

export function mapPlace(p: Raw, dial: string, fallbackCategory: string): Discovered | null {
  const id = String(p.place_id || p.cid || p.data_id || '');
  const name = cleanName(String(p.title || ''));
  if (!id || !name) return null;
  if (/permanently closed|closed permanently/i.test(String(p.status ?? ''))) return null;

  const phone = p.phone ? String(p.phone) : null;
  // The scraper's real field is "web_site" (its README says "website"). Reading
  // the wrong one would mark every business "no website": a false claim.
  const site = p.web_site || p.website;
  const business: BusinessInfo = {
    placeId: id,
    name,
    address: String(p.address || ''),
    phone,
    internationalPhone: toE164(phone, dial),
    website: site ? String(site) : null,
    rating: p.review_rating != null ? Number(p.review_rating) : null,
    reviewCount: p.review_count != null ? Number(p.review_count) : null,
    category: String(p.category || fallbackCategory),
    googleMapsUrl: String(p.link || ''),
    reviews: mapReviews(p.user_reviews),
  };
  return {
    business,
    emails: Array.isArray(p.emails) ? p.emails.map((e) => String(e).toLowerCase()) : [],
    timezone: p.timezone ? String(p.timezone) : null,
    mapsOrdering: nonEmpty(p.order_online) || nonEmpty(p.reservations),
  };
}

// The scraper's -json output: JSON lines (or one array, handled too).
export function parseScraperOutput(text: string): Raw[] {
  const t = text.trim();
  if (!t) return [];
  if (t.startsWith('[')) return JSON.parse(t) as Raw[];
  return t.split(/\r?\n/).flatMap((line) => {
    try { return [JSON.parse(line) as Raw]; } catch { return []; }
  });
}

export interface ScrapeOpts { exe: string; depth: number; concurrency: number }

// Run one batch of queries. Each line carries "#!#<id>" so results map back.
export async function scrape(queries: { id: string; text: string }[], opts: ScrapeOpts): Promise<Raw[]> {
  const dir = path.join(process.cwd(), 'data', 'scrape');
  fs.mkdirSync(dir, { recursive: true });
  const input = path.join(dir, 'queries.txt');
  const output = path.join(dir, `results-${Date.now()}.json`);
  fs.writeFileSync(input, queries.map((q) => `${q.text} #!#${q.id}`).join('\n'));

  // The scraper is very chatty; its log goes to data/scrape/scraper.log, not the agent window.
  const logFd = fs.openSync(path.join(dir, 'scraper.log'), 'a');
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(path.resolve(opts.exe), [
        '-input', input, '-results', output, '-json', '-email',
        '-depth', String(opts.depth), '-c', String(opts.concurrency),
        '-lang', 'en', '-exit-on-inactivity', '3m',
      ], { stdio: ['ignore', logFd, logFd] });
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`scraper exited with code ${code} (see data/scrape/scraper.log)`))));
    });
  } finally {
    fs.closeSync(logFd);
  }

  const rows = parseScraperOutput(fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '');
  fs.rmSync(output, { force: true });
  return rows;
}
