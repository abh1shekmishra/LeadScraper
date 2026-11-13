import { ServiceType } from '@/types/filters';

// Everything the agent needs to decide WHERE to look and HOW MUCH to do.
// Edit this file, restart `npm run agent`. Progress lives in data/agent.db, so
// restarting never repeats work.

export interface Country {
  code: string;
  dial: string;               // phone country code, for WhatsApp numbers
  email: boolean;             // allowed to cold email here?
  whatsapp: boolean;          // allowed to cold WhatsApp here?
  prefer: 'email' | 'whatsapp'; // first channel when both contacts exist
  cities: string[];
}

// Canada (CASL), Germany and Australia are consent-first for cold messages, so
// they are left out. Add them only if you have a lawful basis.
export const COUNTRIES: Country[] = [
  { code: 'US', dial: '1', email: true, whatsapp: false, prefer: 'email',
    cities: ['New York', 'Los Angeles', 'San Francisco', 'Chicago', 'Houston', 'Dallas', 'Austin', 'Miami', 'Seattle', 'Boston'] },
  // UK PECR: companies OK, sole traders need consent. Nothing here can tell a
  // sole trader apart reliably, so reject those UK drafts by hand in /queue.
  { code: 'UK', dial: '44', email: true, whatsapp: false, prefer: 'email',
    cities: ['London', 'Manchester', 'Birmingham'] },
  { code: 'AE', dial: '971', email: true, whatsapp: true, prefer: 'whatsapp',
    cities: ['Dubai', 'Abu Dhabi'] },
  { code: 'SG', dial: '65', email: true, whatsapp: false, prefer: 'email',
    cities: ['Singapore'] },
  { code: 'IN', dial: '91', email: true, whatsapp: true, prefer: 'whatsapp',
    cities: ['Mumbai', 'Bengaluru', 'Delhi', 'Gurugram', 'Pune', 'Hyderabad', 'Chennai'] },
];

// Niche -> what to pitch. pickServiceAngle() picks the most provable gap among them.
// Cold outreach sells websites and apps only. AR/VR/Unreal is never pitched
// (overlaps the day job); it's offered only when a client asks for it.
export const NICHES: Record<string, ServiceType[]> = {
  'interior designers': ['Website'],
  'architects': ['Website'],
  'real estate developers': ['Website'],
  'furniture showrooms': ['Website'],
  'wedding venues': ['Website'],
  'boutique hotels': ['Website'],
  'dentists': ['Website'],
  'law firms': ['Website'],
  'physiotherapy clinics': ['Website', 'Mobile App'],
  'restaurants': ['Website', 'Mobile App'],
  'salons': ['Website', 'Mobile App'],
  'gyms': ['Website', 'Mobile App'],
  'car dealers': ['Website'],
};

// Big national brands show up as many local "studios". They won't hire a solo
// freelancer, so skip them. Add names here as you spot them in /queue.
export const SKIP_BRANDS = /\b(homelane|livspace|decorpot|design ?cafe|bonito designs|arrivae|asian paints|godrej interio|ikea|urban company|nobroker|interior company|hafele|kohler)\b/i;

export const CONFIG = {
  // Shadow mode: every draft waits at /queue for your approval.
  // Flip to true only once you've checked enough drafts.
  autonomous: true,

  // Patched build (see build-scraper.cmd): the 1.18.2 release breaks on Windows.
  scraperPath: 'bin/google-maps-scraper.exe',
  queriesPerCycle: 4,       // city x niche searches per scraper run (keep low: Google throttles)
  scrollDepth: 3,           // ~20 results per depth step
  scraperConcurrency: 2,

  auditConcurrency: 5,
  draftsPerDay: 45,         // Claude spend + matches what can actually be sent per day
  minScore: 'warm' as 'hot' | 'warm',
  whatsappOnlyHot: true,    // WhatsApp is reserved for the strongest leads

  cycleSleepMs: 5 * 60_000, // pause between cycles

  // --- Sending ---
  fromName: 'Abhishek Mishra',
  // US law (CAN-SPAM) needs a real postal address in cold emails; a PO box is fine.
  // Set POSTAL_ADDRESS in .env.local (personal data stays out of the repo).
  // US emails are held until it is set.
  postalAddress: process.env.POSTAL_ADDRESS ?? '',
  emailPerDay: 30,          // personal Gmail: stay well under the radar
  whatsappPerDay: 8,        // personal number: keep this low, raise slowly only if nothing goes wrong
  emailGapMin: [3, 8],      // random minutes between two emails
  whatsappGapMin: [8, 20],  // random minutes between two WhatsApp messages
  // Local time of the BUSINESS (weekday 1 = Mon ... 7 = Sun).
  emailWindow: { days: [1, 2, 3, 4, 5], fromHour: 9, toHour: 12 },
  whatsappWindow: { days: [1, 2, 3, 4, 5, 6], fromHour: 10, toHour: 18 },
  // Follow-ups after the first message, cancelled the moment they reply.
  // WhatsApp gets one: unanswered chats are what get numbers flagged.
  followUps: {
    email: [{ days: 3, field: 'followUp1' }, { days: 7, field: 'followUp2' }, { days: 14, field: 'followUp3' }],
    whatsapp: [{ days: 7, field: 'followUp2' }],
  } as const,
};

// Who you are, for gig replies. Only list what's true: Claude never claims more.
export const PROFILE = {
  name: 'Abhishek Mishra',
  portfolioUrl: '', // add a link and every gig reply includes it
  skills:
    'websites and web apps (React, Next.js, TypeScript), mobile apps, ' +
    'Unity and Unreal Engine (games, interactive 3D, architectural walkthroughs, VR and AR)',
  // Gigs are scored against this: he has a full-time job.
  availability:
    'has a full-time job; works evenings and weekends, roughly 10-15 hours a week, async. ' +
    'Takes fixed-scope projects with a clear deliverable only: no set working hours, no daily meetings, ' +
    'no long-term or part-time employment contracts.',
};

// Reddit only: Hacker News hiring threads are almost all ongoing employment.
export const GIGS = {
  checkEveryHours: 2,
  maxAgeDays: 10,            // ignore older posts: first good replies win gigs
  assessPerRun: 40,          // Claude calls per check, cost cap
  minFit: 6,                 // 0-10; below this it's skipped
  alertFit: 8,               // phone alert (ntfy) at or above this
  subreddits: ['forhire', 'hiring', 'gameDevClassifieds'], // fetched as one combined feed
};

// Concept preview sites for hot "no/broken website" leads, hosted free on
// Cloudflare Pages at https://<project>.pages.dev/<slug>/.
export const PREVIEWS = {
  enabled: true,
  project: 'leadscraper-previews', // create once: see SETUP.md
  perDay: 8,
};

// Used when the scraper gave no timezone for a business.
export const COUNTRY_TZ: Record<string, string> = {
  US: 'America/New_York', UK: 'Europe/London', AE: 'Asia/Dubai', SG: 'Asia/Singapore', IN: 'Asia/Kolkata',
};
