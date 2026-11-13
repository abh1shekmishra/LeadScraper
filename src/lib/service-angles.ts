import { BusinessInfo, SiteHealth, ServiceAngle, Pitch, gapBadge } from '@/types/lead';
import { ServiceType } from '@/types/filters';
import { hasRealSite } from '@/lib/website-health';

// Given what Abhishek selected to pitch and what we detected about the business,
// choose the single most provable, compelling angle. This is what finally makes
// the "what are you pitching" selector mean something: pick AR and you get the
// virtual-tour gap, pick Mobile App and you get the no-online-ordering gap, etc.

// Extract a recognisable area/city from a full Google Maps address.
// "No. 59, 4th Floor, Koramangala, Bengaluru, Karnataka 560034, India" -> "Koramangala"
export function extractArea(address: string): string {
  const SKIP = /^(no\.?|#|plot|door|flat|floor|suite|block|unit|shop|building|level|\d)/i;
  const STATE_COUNTRY = /^(india|karnataka|telangana|maharashtra|tamil|delhi|gujarat|rajasthan|west\s*bengal|uttar\s*pradesh|kerala|punjab|\d{6})/i;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (SKIP.test(part) || STATE_COUNTRY.test(part) || part.length < 3) continue;
    return part;
  }
  if (parts.length >= 3) return parts[parts.length - 3].replace(/\d{6}/, '').trim();
  return parts[0] ?? 'your area';
}

// Categories where an immersive experience has an obvious, sellable purpose.
const ARVR_SPACE = /real estate|realtor|propert|apartment|builder|hotel|resort|villa|lodg|hostel|guest house|banquet|event|wedding|venue|interior|architect|gym|fitness|spa|salon|museum|gallery|car dealer|automobile|showroom|travel|tour/i;
const ARVR_PRODUCT = /furniture|decor|eyewear|optic|spectacle|sunglass|jewel|watch|fashion|boutique|clothing|apparel|footwear|shoe/i;
// Repeat-business categories where an ordering/booking app pays off.
const APP_FIT = /restaurant|cafe|coffee|bakery|bar|food|pizz|burger|kitchen|diner|salon|spa|beauty|barber|nail|gym|fitness|yoga|clinic|dental|dentist|doctor|hospital|pharmac|tutor|coaching|repair|laundry|cleaner|pet|grocery|store|retail|boutique/i;

const RANK = { critical: 3, high: 2, medium: 1, none: 0 };

// --- Website (the always-on, most provable signal) ---
function websiteAngle(
  business: BusinessInfo, area: string, category: string, reviews: number, siteHealth?: SiteHealth,
): ServiceAngle {
  const name = business.name;
  const gap = siteHealth?.gap;
  const probeObs = siteHealth?.observation ?? '';
  const loadMs = siteHealth?.loadMs ?? null;
  const base = { service: 'website' as Pitch, serviceLine: 'I build websites', badge: gapBadge(gap) };

  switch (gap) {
    case 'no_website':
      return { ...base, severity: 'critical', hasProblem: true, mockupNoun: 'a site',
        // Only what we checked: the listing has no website link. They may have a site elsewhere.
        observation: `I found ${name} on Google Maps while looking at ${category} in ${area}, and the listing doesn't link to a website`,
        consequence: 'people who find you there have nowhere to click through to see your work, so many move on to the next listing',
        ask: `Want me to put together a quick mockup of what a site for ${name} could look like? No strings`,
        tag: 'No website at all',
        opportunity: reviews > 0 ? `No website — ${reviews} customers with nowhere to find them online` : 'No website — invisible to anyone searching online' };
    case 'dead':
      return { ...base, severity: 'critical', hasProblem: true, mockupNoun: 'a working site',
        observation: `I tried opening ${name}'s website and it didn't load for me`,
        consequence: "every customer who looks you up hits a dead page and assumes you've closed",
        ask: 'Want me to take a look and show you what a working site could look like? No strings',
        tag: 'Website is down / broken',
        opportunity: reviews > 0 ? `Website is down — ${reviews} customers hit a dead link` : 'Website is down — anyone who looks them up hits a dead link' };
    case 'social_only':
      return { ...base, severity: 'high', hasProblem: true, mockupNoun: 'a proper site',
        observation: probeObs || 'the website link on your Google listing goes to a social media page rather than a website',
        consequence: "people can't easily find your details or book you, and you barely show up on Google",
        ask: `Want me to mock up a simple proper site for ${name}? No strings`,
        tag: 'Only a social media page, no real site',
        opportunity: 'Using a social page instead of a real website — easy, obvious upgrade' };
    case 'no_ssl':
      return { ...base, severity: 'high', hasProblem: true, mockupNoun: 'a secure, updated site',
        observation: 'your website loads without a security padlock',
        consequence: 'Chrome and Safari show visitors a "Not Secure" warning before they see anything, which scares a lot of people off',
        ask: 'Want me to show you how to fix that and tidy the site up? No strings',
        tag: "Not secure — browsers show a 'Not Secure' warning",
        opportunity: "Site shows a 'Not Secure' warning — quick credibility fix" };
    case 'not_mobile':
      return { ...base, severity: 'medium', hasProblem: true, mockupNoun: 'a mobile-friendly site',
        observation: "your website isn't built for phones",
        consequence: 'most of your customers are on mobile and it likely looks broken for them',
        ask: 'Want me to show you what a mobile-friendly version could look like? No strings',
        tag: 'Not mobile-friendly — breaks on phones',
        opportunity: 'Site breaks on phones — most of their customers are on mobile' };
    case 'slow': {
      const secs = loadMs ? Math.round(loadMs / 1000) : null;
      return { ...base, severity: 'medium', hasProblem: true, mockupNoun: 'a faster site',
        observation: secs ? `your website took about ${secs} seconds to load for me` : 'your website loads slowly',
        consequence: 'most people leave a site that takes more than a few seconds, so you lose visitors before they even see you',
        ask: 'Want me to take a quick look at speeding it up? No strings',
        tag: 'Slow-loading website',
        opportunity: 'Slow website — visitors leave before it loads' };
    }
    default: { // healthy / unverified / no probe
      // A working site can still have a provable, checkable weakness.
      const psi = siteHealth?.psiMobile;
      if (psi != null && psi < 50) {
        return { ...base, severity: 'medium', hasProblem: true, mockupNoun: 'a faster site',
          badge: { label: `Speed ${psi}/100`, tone: 'warm' },
          observation: `I ran ${name}'s website through Google's PageSpeed test and it scored ${psi}/100 on mobile`,
          consequence: 'Google factors page speed into search rankings, and most mobile visitors leave a slow page before it loads',
          ask: "Want me to send over the few things I'd fix first? No strings",
          tag: `PageSpeed ${psi}/100 on mobile`,
          opportunity: `Google PageSpeed ${psi}/100 on mobile — provable speed fix` };
      }
      const year = siteHealth?.copyrightYear;
      if (year && new Date().getFullYear() - year >= 3) {
        return { ...base, severity: 'medium', hasProblem: true, mockupNoun: 'a refreshed site',
          badge: { label: `Footer © ${year}`, tone: 'warm' },
          observation: `the footer on ${name}'s website still says © ${year}`,
          consequence: 'small signs like that make visitors wonder whether the site, or the business, is still active',
          ask: 'Want me to show you what a refreshed version could look like? No strings',
          tag: `Site footer still says © ${year}`,
          opportunity: `Site looks unmaintained since ${year} — refresh pitch` };
      }
      // Nothing provable — stay neutral.
      return { ...base, severity: 'none', hasProblem: false, mockupNoun: 'an updated site',
        observation: `I came across ${name} while looking at ${category} in ${area}`,
        consequence: 'I think your website could be working harder for you',
        ask: 'Want me to share a couple of specific ideas? No strings',
        tag: gap === 'healthy' ? 'Has a working website' : null,
        opportunity: 'Has a working site — lead with one specific improvement' };
    }
  }
}

// --- AR / VR ---
function arvrAngle(
  business: BusinessInfo, area: string, category: string, siteHealth?: SiteHealth,
): ServiceAngle {
  const name = business.name;
  const isProduct = ARVR_PRODUCT.test(category);
  const fits = ARVR_SPACE.test(category) || isProduct;
  const hasSite = siteHealth ? hasRealSite(siteHealth.gap) : !!business.website;
  const hasImmersive = !!siteHealth?.hasImmersive;
  const base = {
    service: 'arvr' as Pitch,
    serviceLine: isProduct ? 'I build AR try-on and 3D product experiences' : 'I build virtual tours and AR/VR experiences',
    mockupNoun: isProduct ? 'an AR demo' : 'a virtual tour',
  };

  // Already uses immersive content -> don't pitch what they have.
  if (fits && hasImmersive) {
    return { ...base, severity: 'none', hasProblem: false, badge: null, tag: null,
      observation: `I came across ${name} while looking at ${category} in ${area}`,
      consequence: 'you already use some 3D or tour content, there may be room to take it further',
      ask: 'Want a couple of ideas on extending it? No strings',
      opportunity: 'Already uses immersive content — possible upsell' };
  }
  // Fits, has a working site, but no tour/AR -> provable gap.
  if (fits && hasSite) {
    return isProduct
      ? { ...base, severity: 'high', hasProblem: true, badge: { label: 'No AR preview', tone: 'warm' },
          observation: 'there is no way on your site for customers to see your products in their own space or try them on',
          consequence: 'shoppers buy more when they can preview a product before committing',
          ask: `Want me to mock up a quick AR preview for one of your products? No strings`,
          tag: 'No AR product preview', opportunity: `${category} site with no AR try-on — strong conversion upgrade` }
      : { ...base, severity: 'high', hasProblem: true, badge: { label: 'No virtual tour', tone: 'warm' },
          observation: `your website shows photos of ${name} but no virtual tour or 3D walkthrough`,
          consequence: 'people increasingly want to walk through the space online before they visit or book',
          ask: 'Want me to put together a quick virtual tour demo for one of your spaces? No strings',
          tag: 'No virtual tour on site', opportunity: `${category} with a site but no virtual tour — clear AR/VR upgrade` };
  }
  // Fits but no real site yet -> opportunity framing.
  if (fits) {
    return { ...base, severity: 'medium', hasProblem: true, badge: { label: 'AR/VR opportunity', tone: 'warm' },
      observation: `for ${category}, a virtual tour is what wins customers now, and ${name} doesn't have one online`,
      consequence: 'competitors who show the space online get the visit before you do',
      ask: `Want me to show you what a virtual tour for ${name} could look like? No strings`,
      tag: 'Strong AR/VR fit, nothing live yet', opportunity: `${category} — strong virtual-tour use case, nothing live yet` };
  }
  // Doesn't really fit AR/VR -> be honest, weak.
  return { ...base, severity: 'none', hasProblem: false, badge: null, tag: null,
    observation: `I came across ${name} while looking at ${category} in ${area}`,
    consequence: 'an immersive experience could help you stand out',
    ask: 'Want a couple of quick ideas? No strings',
    opportunity: `${category} — softer AR/VR fit` };
}

// --- Mobile App ---
function appAngle(
  business: BusinessInfo, area: string, category: string, reviews: number, siteHealth?: SiteHealth,
): ServiceAngle {
  const name = business.name;
  const fits = APP_FIT.test(category);
  const hasOrdering = !!siteHealth?.hasOnlineOrdering;
  const hasApp = !!siteHealth?.hasAppLinks;
  const base = { service: 'app' as Pitch, serviceLine: 'I build mobile apps', mockupNoun: 'an app' };

  // Already has an app -> don't pitch a new one.
  if (hasApp) {
    return { ...base, severity: 'none', hasProblem: false, badge: null, tag: null,
      observation: `I came across ${name} while looking at ${category} in ${area}`,
      consequence: 'you already have an app, there may be room to improve it',
      ask: 'Want a couple of ideas? No strings',
      opportunity: 'Already has an app — possible rebuild or upsell' };
  }
  // Fits + busy + no online ordering/booking -> provable gap.
  if (fits && !hasOrdering && reviews >= 50) {
    const hot = reviews >= 150;
    return { ...base, severity: hot ? 'high' : 'medium', hasProblem: true,
      badge: { label: 'No online ordering', tone: hot ? 'hot' : 'warm' },
      observation: `there's no way to order or book ${name} online, it looks like it's all by phone or walk-in`,
      consequence: 'you lose after-hours customers, and any delivery orders go through apps taking a big cut',
      ask: 'Want me to mock up what your own ordering and booking app could look like? No strings',
      tag: 'No online ordering or booking',
      opportunity: `${reviews} customers but no way to order/book online — clear app case` };
  }
  // Fits + busy but already takes orders online -> softer loyalty/app upsell.
  if (fits && reviews >= 80) {
    return { ...base, severity: 'medium', hasProblem: false, badge: { label: 'App opportunity', tone: 'warm' },
      observation: `I came across ${name} and saw how busy you are`,
      consequence: 'a business with your repeat customers usually does well with its own app for orders, bookings and loyalty',
      ask: `Want me to show what an app for ${name} could do? No strings`,
      tag: 'Busy enough for a loyalty/ordering app',
      opportunity: `${reviews} reviews — strong fit for an ordering/loyalty app` };
  }
  // Otherwise weak.
  return { ...base, severity: 'none', hasProblem: false, badge: null, tag: null,
    observation: `I came across ${name} while looking at ${category} in ${area}`,
    consequence: 'an app could make repeat business easier for your customers',
    ask: 'Want a couple of quick ideas? No strings',
    opportunity: `${category} — possible app fit` };
}

// --- Desktop app / custom software (no Maps signal — honest, soft opportunity) ---
function generalAngle(business: BusinessInfo, area: string, category: string): ServiceAngle {
  const name = business.name;
  return { service: 'general', severity: 'none', hasProblem: false, badge: null, tag: null,
    serviceLine: 'I build custom software and apps', mockupNoun: 'a quick concept',
    observation: `I came across ${name} while looking at ${category} in ${area}`,
    consequence: 'I think the right custom tool could save your team real time',
    ask: 'Want a couple of specific ideas? No strings',
    opportunity: `${category} — custom software is a conversation, not a Maps signal` };
}

export function pickServiceAngle(
  business: BusinessInfo,
  siteHealth: SiteHealth | undefined,
  serviceTypes: ServiceType[],
): ServiceAngle {
  const area = extractArea(business.address);
  const category = business.category.toLowerCase();
  const reviews = business.reviewCount ?? 0;

  const wantsWebsite = serviceTypes.some((s) => ['Website', 'E-commerce'].includes(s));
  const wantsArVr = serviceTypes.some((s) => ['AR', 'VR'].includes(s));
  const wantsApp = serviceTypes.includes('Mobile App');
  const wantsOther = serviceTypes.some((s) => ['Desktop App', 'Custom Software'].includes(s));

  const candidates: ServiceAngle[] = [];
  if (wantsWebsite) candidates.push(websiteAngle(business, area, category, reviews, siteHealth));
  if (wantsArVr) candidates.push(arvrAngle(business, area, category, siteHealth));
  if (wantsApp) candidates.push(appAngle(business, area, category, reviews, siteHealth));
  if (wantsOther && candidates.length === 0) candidates.push(generalAngle(business, area, category));

  // No service selected -> default to the always-on website signal.
  if (candidates.length === 0) candidates.push(websiteAngle(business, area, category, reviews, siteHealth));

  // Most provable/compelling wins: highest severity, then prefer a real problem.
  candidates.sort((a, b) => RANK[b.severity] - RANK[a.severity] || Number(b.hasProblem) - Number(a.hasProblem));
  return candidates[0];
}
