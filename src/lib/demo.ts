import { BusinessInfo, Lead, OutreachDraft, ReviewSignal, SiteHealth } from '@/types/lead';
import { ServiceType } from '@/types/filters';
import { buildLeads } from '@/lib/build-leads';
import { pickServiceAngle } from '@/lib/service-angles';

// Demo mode lets the deployed app be explored with zero API keys and zero cost:
// the routes return this curated, realistic sample set instead of calling Google
// Places or Claude. The data is run through the SAME buildLeads/pickServiceAngle
// pipeline the live app uses, so scoring, badges and angles are genuine — only the
// source of the businesses (and the outreach copy) is canned.
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1';

function review(rating: number, text: string, when: string) {
  return { rating, text, when };
}

interface DemoEntry {
  business: BusinessInfo;
  health: SiteHealth;
  signal: ReviewSignal;
}

// Eight businesses spanning every gap the tool detects, so the grid shows the full
// range of badges/scores at a glance and reacts as you toggle Website / AR / App.
const ENTRIES: DemoEntry[] = [
  {
    business: b('demo-1', 'Anand Sweets & Savouries', 'Sweets Shop', '100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038, India', null, 4.4, 260),
    health: h('no_website', "you don't have a website at all"),
    signal: { hasDigitalPain: false, painTags: [] },
  },
  {
    business: b('demo-2', 'Dr. Rao Dental Care', 'Dental Clinic', '7th Block, Jayanagar, Bengaluru, Karnataka 560070, India', 'https://drraodental.in', 4.6, 90),
    health: h('dead', 'I tried opening your website and it didn\'t load for me'),
    signal: { hasDigitalPain: false, painTags: [] },
  },
  {
    business: b('demo-3', 'Kritika Boutique', 'Clothing Boutique', 'Khan Market, New Delhi, Delhi 110003, India', 'https://instagram.com/kritikaboutique', 4.7, 68),
    health: h('social_only', "you're using an Instagram page instead of a real website"),
    signal: { hasDigitalPain: true, painTags: ['A reviewer asked where to see the collection online'] },
  },
  {
    business: b('demo-4', 'Prestige Green Realty', 'Real Estate Agency', 'Baner Road, Pune, Maharashtra 411045, India', 'https://prestigegreenrealty.com', 4.3, 140),
    health: h('healthy', '', { hasImmersive: false }),
    signal: { hasDigitalPain: false, painTags: [] },
  },
  {
    business: b('demo-5', 'Blue Tokai Coffee Roasters', 'Cafe', 'Church Street, Bengaluru, Karnataka 560001, India', 'https://bluetokaidemo.com', 4.5, 520),
    health: h('healthy', '', { hasOnlineOrdering: false }),
    signal: { hasDigitalPain: false, painTags: [] },
  },
  {
    business: b('demo-6', 'Grand Palace Banquets', 'Banquet Hall', 'MG Road, Gurugram, Haryana 122002, India', null, 4.2, 110),
    health: h('no_website', "you don't have a website at all"),
    signal: { hasDigitalPain: false, painTags: [] },
  },
  {
    business: b('demo-7', 'TechFix Mobile Repairs', 'Electronics Repair Shop', 'Ashok Nagar, Chennai, Tamil Nadu 600083, India', 'https://techfixchennai.in', 4.1, 34),
    health: h('not_mobile', "your website isn't built for phones, so it likely looks broken on mobile", { mobileFriendly: false }),
    signal: { hasDigitalPain: false, painTags: [] },
  },
  {
    business: b('demo-8', 'Green Leaf Family Restaurant', 'Restaurant', 'FC Road, Pune, Maharashtra 411004, India', 'https://greenleafpune.com', 4.4, 175),
    health: h('slow', 'your website took about 8 seconds to load for me, slow enough that visitors drop off', { loadMs: 8100, hasOnlineOrdering: false }),
    signal: { hasDigitalPain: false, painTags: [] },
  },
];

function b(
  placeId: string, name: string, category: string, address: string,
  website: string | null, rating: number, reviewCount: number,
): BusinessInfo {
  const intl = '+91' + (9000000000 + Math.abs(hash(placeId)) % 999999999);
  return {
    placeId, name, category, address, website, rating, reviewCount,
    phone: intl.replace('+91', '0'),
    internationalPhone: intl,
    googleMapsUrl: `https://www.google.com/maps/search/${encodeURIComponent(name)}`,
    reviews: [
      review(rating, 'Great place, been coming here for years. Highly recommend to everyone.', '3 weeks ago'),
      review(Math.max(3, rating - 1), 'Good service overall, would visit again.', '1 month ago'),
    ],
  };
}

function h(gap: SiteHealth['gap'], observation: string, extra: Partial<SiteHealth> = {}): SiteHealth {
  return {
    gap,
    https: gap !== 'no_ssl',
    mobileFriendly: gap === 'healthy' ? true : null,
    loadMs: gap === 'healthy' ? 700 : null,
    observation,
    ...extra,
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export function demoLeads(serviceTypes: ServiceType[]): Lead[] {
  return buildLeads(
    ENTRIES.map((e) => e.business),
    serviceTypes,
    ENTRIES.map((e) => e.health),
    ENTRIES.map((e) => e.signal),
  );
}

// Compose plausible, human-sounding outreach from the same angle the live app
// would compute — no LLM call, but grounded in the real detected gap.
export function demoOutreach(
  business: BusinessInfo, serviceTypes: ServiceType[], siteHealth?: SiteHealth,
): OutreachDraft {
  const angle = pickServiceAngle(business, siteHealth, serviceTypes);
  const obs = cap(angle.observation);
  const cons = cap(angle.consequence);
  const ask = angle.ask;
  const name = business.name;

  return {
    emailSubject: `A quick idea for ${name}`,
    emailBody:
      `Hi ${name} team,\n\n${obs}. ${cons}.\n\n${ask}. No cost, no pressure, just something useful you can keep either way.\n\nBest,\nAbhishek\nRedHut Studios`,
    whatsappDirect: `Hi, this is Abhishek from RedHut Studios. ${obs}. ${cons}. ${ask}?`,
    whatsappCurious: `Hey! I was looking at ${name} and noticed one quick thing that's probably costing you customers. Mind if I show you? ${ask}?`,
    whatsappFriendly: `Hi ${name}! Love what you do. ${obs}, and I think a small fix would help a lot. ${ask}? Totally free.`,
    followUp1: `Hi again! Following up on ${name}. ${cons}, and it's a genuinely quick fix. Happy to just send over a rough idea if that's easier?`,
    followUp2: `Hey, no worries if now's not the time. I actually put together a quick ${angle.mockupNoun} for ${name} to show what I meant. Want me to send it across?`,
    followUp3: `Last note from me, promise. If ${name} ever wants a hand with this, the door's open. Wishing you a great month either way!`,
  };
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
