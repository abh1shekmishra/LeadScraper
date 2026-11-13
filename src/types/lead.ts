// A single Google review, trimmed to what we use (customer voice).
export interface BusinessReview {
  rating: number;
  text: string;
  when: string; // e.g. "2 weeks ago"
}

export interface BusinessInfo {
  placeId: string;
  name: string;
  listingTitle?: string; // raw Google Maps title when `name` was cleaned (agent only)
  address: string;
  phone: string | null;
  internationalPhone: string | null; // E.164-style with country code, for WhatsApp deep links
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  category: string;
  googleMapsUrl: string;
  reviews: BusinessReview[]; // up to 5 recent reviews, for qualification + warm personalization
}

// Output of analysing a business's reviews. `painTags` are for Abhishek's eyes
// (card + scoring) only — we never quote complaints back in a cold message.
export interface ReviewSignal {
  hasDigitalPain: boolean;
  painTags: string[];
}

// --- Website health (the core lead-qualification signal) ---
// Detected by visiting the business's website server-side. Drives scoring and
// gives the outreach a specific, provable observation to open with.
export type SiteGap =
  | 'no_website'   // no website at all
  | 'dead'         // didn't load / DNS fail / 404 / 5xx
  | 'social_only'  // "website" is a Facebook/Instagram/Linktree page, not a real site
  | 'no_ssl'       // served over http:// only — browsers show "Not Secure"
  | 'not_mobile'   // no responsive viewport — breaks on phones
  | 'slow'         // loads too slowly
  | 'healthy'      // loads fine, https, mobile — weak lead
  | 'unverified';  // blocked / couldn't confirm — make NO claim

export interface SiteHealth {
  gap: SiteGap;
  https: boolean;
  mobileFriendly: boolean | null;
  loadMs: number | null;
  observation: string; // honest, first-person phrase ("" when nothing is provable)
  // Content signals scanned from the page (only meaningful when the site loaded).
  // Used to qualify AR/VR and Mobile App pitches, not just websites.
  hasImmersive?: boolean;     // virtual tour / 360 / 3D / AR already on the site
  hasOnlineOrdering?: boolean; // order / book / reserve / cart already on the site
  hasAppLinks?: boolean;       // links to an App Store / Play Store listing
  emails?: string[];           // emails published on the homepage
  copyrightYear?: number;      // latest year in a static footer copyright line
  psiMobile?: number;          // Google PageSpeed mobile performance score 0-100 (agent only)
}

export type Badge = { label: string; tone: 'hot' | 'warm' } | null;

// Short badge for the card. Returns null for healthy/unverified (nothing to flag).
export function gapBadge(gap?: SiteGap): Badge {
  switch (gap) {
    case 'no_website':  return { label: 'No website', tone: 'hot' };
    case 'dead':        return { label: 'Site down', tone: 'hot' };
    case 'social_only': return { label: 'Social page only', tone: 'warm' };
    case 'no_ssl':      return { label: 'Not secure', tone: 'warm' };
    case 'not_mobile':  return { label: 'Not mobile', tone: 'warm' };
    case 'slow':        return { label: 'Slow site', tone: 'warm' };
    default:            return null;
  }
}

// --- Service angle ---
// Which service we're pitching THIS lead, and the one provable thing to open on.
// Computed by pickServiceAngle() in src/lib/service-angles.ts from the selected
// service types + what we detected on their site. Drives scoring, the card badge,
// and the outreach message — so "what are you pitching" finally means something.
export type Pitch = 'website' | 'arvr' | 'app' | 'general';

export interface ServiceAngle {
  service: Pitch;
  severity: 'critical' | 'high' | 'medium' | 'none';
  hasProblem: boolean;   // false => stay neutral, invent nothing (credibility rule)
  observation: string;   // what Abhishek personally checked
  consequence: string;   // why it costs them
  ask: string;           // the small, zero-pressure ask
  mockupNoun: string;    // used in the day-7 follow-up ("a site" / "a tour" / "an app")
  serviceLine: string;   // "I build websites" / "I build mobile apps" / ...
  opportunity: string;   // one-liner shown on the card
  badge: Badge;          // pitch badge for the card
  tag: string | null;    // reason tag for the card
}

export interface EmailInfo {
  address: string | null;
  confidence: 'verified' | 'inferred' | 'unknown';
  source: 'hunter' | 'pattern' | null;
}

export interface OutreachDraft {
  emailSubject: string;
  emailBody: string;
  whatsappCurious: string;   // variant 1 — creates intrigue
  whatsappDirect: string;    // variant 2 — straight to the point
  whatsappFriendly: string;  // variant 3 — warm and casual
  followUp1: string;         // day 3: fresh angle, not "just checking in"
  followUp2: string;         // day 7: curiosity hook with mockup offer
  followUp3: string;         // day 14: warm door-open, no pressure
}

export interface Lead {
  id: string;
  business: BusinessInfo;
  email: EmailInfo;
  outreach: OutreachDraft | null;
  isGeneratingOutreach: boolean;
  isEnrichingEmail: boolean;
  qualification?: LeadQualification;
  siteHealth?: SiteHealth;
  pitchBadge?: Badge;      // the service-specific badge (No website / No virtual tour / No app...)
  competitorNote?: string; // e.g. "Most cafes near you already have a website" (soft, only when true)
  reachedOut?: boolean;    // Abhishek marked this lead as contacted (persists across searches)
}

export interface AISuggestion {
  industry: string;
  reason: string;
}

export type LeadScore = 'hot' | 'warm' | 'cold';

export interface LeadQualification {
  score: LeadScore;
  reasons: string[];       // why this is a good lead
  opportunity: string;     // one-line pitch angle e.g. "No website despite 200+ reviews"
}

// Angle-driven scoring. The chosen ServiceAngle already encodes the provable gap
// and its severity for whatever service Abhishek is pitching; here we combine that
// with customer-voiced demand and business strength into hot / warm / cold.
export function scoreLeadQualification(
  business: BusinessInfo,
  reviewSignal: ReviewSignal | undefined,
  angle: ServiceAngle,
): LeadQualification {
  const tags: string[] = [];
  const rating = business.rating ?? 0;
  const reviews = business.reviewCount ?? 0;

  if (angle.tag) tags.push(angle.tag);

  // --- Customer-voiced demand (the strongest intent signal there is) ---
  // If their own reviewers ask for the thing we build, the need is real and felt.
  let severity = angle.severity;
  if (reviewSignal?.hasDigitalPain) {
    for (const t of reviewSignal.painTags) tags.push(t);
    if (severity === 'none' || severity === 'medium') severity = 'high';
  }

  // --- Business-strength signals (proof they're worth contacting) ---
  if (reviews >= 50) tags.push(`${reviews} reviews — real, active customers`);
  if (rating >= 4.3 && reviews >= 20) tags.push(`Well rated (${rating}★)`);
  if (rating > 0 && rating < 3.5 && reviews >= 30) tags.push('Struggling ratings — digital could help');

  // --- Score ---
  let score: LeadScore = 'cold';
  if ((severity === 'critical' && reviews >= 20) || (severity === 'high' && reviews >= 40)) {
    score = 'hot';
  } else if (
    severity === 'critical' ||
    severity === 'high' ||
    (severity === 'medium' && reviews >= 20)
  ) {
    score = 'warm';
  }

  const opportunity = reviewSignal?.hasDigitalPain
    ? 'Their own reviewers are asking for this — real, felt demand'
    : angle.opportunity;

  return { score, reasons: tags, opportunity };
}
