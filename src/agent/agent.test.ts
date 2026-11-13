import { describe, expect, it } from 'vitest';
import { NOT_A_TARGET, brandKey, cleanName, mapPlace, parseScraperOutput, siteKey, toE164 } from '@/agent/discover';
import { pickEmail } from '@/agent/enrich';
import { extractEmails, staleCopyrightYear } from '@/lib/website-health';
import { pickServiceAngle } from '@/lib/service-angles';
import type { BusinessInfo, SiteHealth } from '@/types/lead';

describe('toE164', () => {
  it('handles national, prefixed and international formats', () => {
    expect(toE164('098765 43210', '91')).toBe('+919876543210');
    expect(toE164('+91 98765 43210', '91')).toBe('+919876543210');
    expect(toE164('(212) 555-1234', '1')).toBe('+12125551234');
    expect(toE164('1 212 555 1234', '1')).toBe('+12125551234');
    expect(toE164('020 7946 0958', '44')).toBe('+442079460958');
    expect(toE164('0044 20 7946 0958', '44')).toBe('+442079460958');
  });
  it('rejects junk', () => {
    expect(toE164('', '91')).toBeNull();
    expect(toE164('12', '91')).toBeNull();
  });
});

describe('cleanName', () => {
  it('drops SEO keywords from listing titles', () => {
    expect(cleanName('Jensen & Co. | Interior Designers NYC')).toBe('Jensen & Co.');
    expect(cleanName('Betty Wasserman Art & Interiors – NYC Interior Designers')).toBe('Betty Wasserman Art & Interiors');
    expect(cleanName('Sawyer & Company - NYC Interior Design Firm')).toBe('Sawyer & Company');
    expect(cleanName('IMPERFECTION DESIGN · Interior Design Studio')).toBe('IMPERFECTION DESIGN');
    expect(cleanName('𝐃𝐢𝐠𝐢𝐜𝐫𝐚𝐟𝐭 𝐈𝐧𝐭𝐞𝐫𝐢𝐨𝐫 𝐃𝐞𝐬𝐢𝐠𝐧')).toBe('Digicraft Interior Design');
    expect(cleanName('A Design L.L.C / ايه ديزاين ذ.م.م')).toBe('A Design L.L.C');
    expect(cleanName('Ideal Designer Decoration Co. LLC ( Carpentry and Joinery ) شركة المصمم المثالي')).toBe('Ideal Designer Decoration Co. LLC');
    expect(cleanName('ايه ديزاين')).toBe('ايه ديزاين'); // non-Latin-only names stay
    expect(cleanName('Expressions Inside Interior Designer 15 years experience Best Interior Designer architects in Mumbai'))
      .toBe('Expressions Inside Interior Designer');
    expect(cleanName('Best Interiors')).toBe('Best Interiors'); // "Best" as the name itself stays
    expect(cleanName('Smith-Jones Design')).toBe('Smith-Jones Design'); // hyphenated names stay
    expect(cleanName('AB | Studio')).toBe('AB | Studio'); // too short to stand alone
  });
});

describe('targeting', () => {
  it('keys a company by its own domain, not shared directories or social pages', () => {
    expect(siteKey('https://www.homelane.com/')).toBe('homelane.com');
    expect(siteKey('homelane.com')).toBe('homelane.com');
    expect(siteKey('https://www.homelane.com/interior-design-studio/mumbai/borivali')).toBe('homelane.com');
    expect(siteKey('https://a2zdial.in/srinteriors')).toBeNull();
    expect(siteKey('https://studio.wixsite.com/acme')).toBeNull();
    expect(siteKey('https://www.instagram.com/lavish')).toBeNull();
    expect(siteKey(null)).toBeNull();
  });
  it('gives branches of one business the same brand key', () => {
    expect(brandKey('HomeLane Borivali, Interior Design Studio', 'Shop 3, Borivali West, Mumbai 400092'))
      .toBe(brandKey('HomeLane Noida, Sector 4, Interior Design Studio', 'Plot 12, Sector 4, Noida, Uttar Pradesh 201301'));
    const andheri = brandKey('Sai Krupa Interiors Andheri', 'Andheri East, Mumbai');
    expect(andheri).toBe('sai krupa');
    expect(brandKey('Sai Krupa Interiors Thane', 'Ghodbunder Rd, Thane West')).toBe(andheri);
  });
  it('never merges unrelated businesses with short common names', () => {
    expect(brandKey('Jensen & Co.', 'New York')).toBeNull();          // surname, not a brand
    expect(brandKey('Jensen Architects', 'San Francisco')).toBeNull();
    expect(brandKey('Shree Interiors', 'Pune')).toBeNull();
    expect(brandKey('Interior Design Studio', 'Delhi')).toBeNull();
    expect(brandKey('Urban Nest Interiors', 'Pune')).not.toBe(brandKey('Urban Space Designs', 'Pune'));
  });
  it('flags schools and courses as non-buyers', () => {
    expect(NOT_A_TARGET.test('IVS School of Design Education center')).toBe(true);
    expect(NOT_A_TARGET.test('Studio Nine Interior designer')).toBe(false);
  });
});

describe('scraper output', () => {
  const row = {
    input_id: '0', title: 'Studio Nine', category: 'Interior designer', address: 'Baner, Pune',
    web_site: 'https://studionine.in', phone: '098765 43210', review_count: 42, review_rating: 4.7,
    place_id: 'ChIJabc', link: 'https://maps.google.com/?cid=1', timezone: 'Asia/Kolkata',
    emails: ['Hello@StudioNine.in'], order_online: [], reservations: null,
    user_reviews: [{ Name: 'A', Rating: 5, Description: 'Lovely work on our flat', When: '2 weeks ago' }],
  };

  it('parses JSON lines and arrays', () => {
    expect(parseScraperOutput(`${JSON.stringify(row)}\n${JSON.stringify(row)}\n`)).toHaveLength(2);
    expect(parseScraperOutput(JSON.stringify([row]))).toHaveLength(1);
  });

  it('maps a place into a lead', () => {
    const d = mapPlace(row, '91', 'interior designers')!;
    expect(d.business.placeId).toBe('ChIJabc');
    expect(d.business.website).toBe('https://studionine.in'); // real field name is web_site
    expect(d.business.internationalPhone).toBe('+919876543210');
    expect(d.business.reviews[0].text).toBe('Lovely work on our flat');
    expect(d.emails).toEqual(['hello@studionine.in']);
    expect(d.mapsOrdering).toBe(false);
  });

  it('drops permanently closed places', () => {
    expect(mapPlace({ ...row, status: 'Permanently closed' }, '91', 'x')).toBeNull();
  });
});

describe('emails', () => {
  it('extracts real addresses and drops asset/builder noise', () => {
    const html = 'Write to info&#64;acme.co.uk or <a href="mailto:Sales@Acme.co.uk">us</a>. logo@2x.png noreply@acme.co.uk x@sentry.io';
    expect(extractEmails(html)).toEqual(['info@acme.co.uk', 'sales@acme.co.uk']);
  });
  it('prefers own-domain role inboxes', () => {
    expect(pickEmail(['jo@gmail.com', 'info@acme.com', 'jo@acme.com'], 'https://www.acme.com')).toBe('info@acme.com');
    expect(pickEmail([], 'https://acme.com')).toBeNull();
  });
});

describe('stale footer + PageSpeed angles', () => {
  it('reads the latest static copyright year, ignores JS-updated footers', () => {
    expect(staleCopyrightYear('<footer>© 2015 - 2019 Acme</footer>')).toBe(2019);
    expect(staleCopyrightYear('Copyright &copy; 2018')).toBe(2018);
    expect(staleCopyrightYear('© <script>document.write(new Date().getFullYear())</script> 2019')).toBeUndefined();
  });

  const b: BusinessInfo = {
    placeId: 'p', name: 'Acme Dental', address: 'Austin, TX', phone: null, internationalPhone: null,
    website: 'https://acme.com', rating: 4.6, reviewCount: 80, category: 'Dentist', googleMapsUrl: '', reviews: [],
  };
  const h = (x: Partial<SiteHealth>): SiteHealth => ({ gap: 'healthy', https: true, mobileFriendly: true, loadMs: 400, observation: '', ...x });

  it('turns a low PageSpeed score into a provable observation', () => {
    const a = pickServiceAngle(b, h({ psiMobile: 23 }), ['Website']);
    expect(a.hasProblem).toBe(true);
    expect(a.observation).toContain('23/100');
  });
  it('flags an old footer, stays neutral on a fine site', () => {
    expect(pickServiceAngle(b, h({ copyrightYear: 2017 }), ['Website']).observation).toContain('© 2017');
    expect(pickServiceAngle(b, h({ psiMobile: 90, copyrightYear: new Date().getFullYear() }), ['Website']).hasProblem).toBe(false);
  });
  it('never pitches AR/VR/Unreal from the agent niches (day-job overlap)', async () => {
    const { NICHES } = await import('@/agent/config');
    for (const services of Object.values(NICHES)) expect(services.some((s) => ['AR', 'VR'].includes(s))).toBe(false);
  });
});
