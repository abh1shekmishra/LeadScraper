import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BusinessInfo, ServiceAngle, SiteHealth } from '@/types/lead';
import { gapBadge, scoreLeadQualification } from '@/types/lead';
import { extractArea, pickServiceAngle } from '@/lib/service-angles';
import { checkWebsiteHealth, hasRealSite } from '@/lib/website-health';
import { analyzeReviews } from '@/lib/reviews';

// Fixtures. Each test overrides only the fields it cares about.
function business(extra: Partial<BusinessInfo> = {}): BusinessInfo {
  return {
    placeId: 'p1',
    name: 'Acme Cafe',
    address: 'No. 12, 2nd Floor, Koramangala, Bengaluru, Karnataka 560034, India',
    phone: null,
    internationalPhone: null,
    website: null,
    rating: 4.5,
    reviewCount: 100,
    category: 'Cafe',
    googleMapsUrl: 'https://maps.google.com/?cid=1',
    reviews: [],
    ...extra,
  };
}

function health(extra: Partial<SiteHealth> = {}): SiteHealth {
  return { gap: 'healthy', https: true, mobileFriendly: true, loadMs: 500, observation: '', ...extra };
}

describe('extractArea', () => {
  it('pulls the locality out of a full Google Maps address', () => {
    expect(extractArea('No. 59, 4th Floor, Koramangala, Bengaluru, Karnataka 560034, India')).toBe(
      'Koramangala',
    );
  });

  it('skips street/unit tokens and postal/state tokens', () => {
    expect(extractArea('Shop 5, Andheri West, Mumbai, Maharashtra 400058, India')).toBe(
      'Andheri West',
    );
  });

  it('falls back gracefully on a sparse address', () => {
    expect(extractArea('India')).toBe('India');
    expect(extractArea('')).toBe('your area');
  });
});

describe('hasRealSite', () => {
  it('treats a reachable site (even if flawed) as real', () => {
    for (const gap of ['healthy', 'slow', 'no_ssl', 'not_mobile', 'unverified'] as const) {
      expect(hasRealSite(gap)).toBe(true);
    }
  });

  it('treats missing/dead/social-only as not a real site', () => {
    for (const gap of ['no_website', 'dead', 'social_only'] as const) {
      expect(hasRealSite(gap)).toBe(false);
    }
  });
});

describe('gapBadge', () => {
  it('flags the hot gaps and stays quiet on healthy/unverified', () => {
    expect(gapBadge('no_website')).toEqual({ label: 'No website', tone: 'hot' });
    expect(gapBadge('social_only')?.tone).toBe('warm');
    expect(gapBadge('healthy')).toBeNull();
    expect(gapBadge('unverified')).toBeNull();
  });
});

describe('pickServiceAngle', () => {
  it('makes a missing website a critical, provable website angle', () => {
    const angle = pickServiceAngle(business({ website: null }), health({ gap: 'no_website' }), ['Website']);
    expect(angle.service).toBe('website');
    expect(angle.severity).toBe('critical');
    expect(angle.hasProblem).toBe(true);
  });

  it('stays neutral (invents nothing) when the site is healthy', () => {
    const angle = pickServiceAngle(business(), health({ gap: 'healthy' }), ['Website']);
    expect(angle.severity).toBe('none');
    expect(angle.hasProblem).toBe(false);
  });

  it('finds the no-virtual-tour gap for an AR-fit business with a real site', () => {
    const angle = pickServiceAngle(
      business({ category: 'Real Estate Agency' }),
      health({ gap: 'healthy', hasImmersive: false }),
      ['AR'],
    );
    expect(angle.service).toBe('arvr');
    expect(angle.hasProblem).toBe(true);
    expect(angle.badge?.label).toMatch(/virtual tour/i);
  });

  it('does not pitch AR when the site already has immersive content', () => {
    const angle = pickServiceAngle(
      business({ category: 'Hotel' }),
      health({ gap: 'healthy', hasImmersive: true }),
      ['AR'],
    );
    expect(angle.hasProblem).toBe(false);
  });

  it('finds the no-online-ordering gap for a busy restaurant', () => {
    const angle = pickServiceAngle(
      business({ category: 'Restaurant', reviewCount: 200 }),
      health({ gap: 'healthy', hasOnlineOrdering: false }),
      ['Mobile App'],
    );
    expect(angle.service).toBe('app');
    expect(angle.hasProblem).toBe(true);
    expect(angle.badge?.label).toMatch(/ordering/i);
  });

  it('picks the most severe angle when several services are selected', () => {
    const angle = pickServiceAngle(
      business({ category: 'Restaurant', website: null, reviewCount: 200 }),
      health({ gap: 'no_website' }),
      ['Website', 'Mobile App'],
    );
    // No website is critical and should outrank the app angle.
    expect(angle.service).toBe('website');
    expect(angle.severity).toBe('critical');
  });

  it('defaults to the website signal when nothing is selected', () => {
    const angle = pickServiceAngle(business(), health({ gap: 'dead' }), []);
    expect(angle.service).toBe('website');
    expect(angle.severity).toBe('critical');
  });
});

describe('scoreLeadQualification', () => {
  const angle = (extra: Partial<ServiceAngle> = {}): ServiceAngle => ({
    service: 'website',
    severity: 'none',
    hasProblem: false,
    observation: '',
    consequence: '',
    ask: '',
    mockupNoun: 'a site',
    serviceLine: 'I build websites',
    opportunity: 'x',
    badge: null,
    tag: null,
    ...extra,
  });

  it('scores a critical gap on an active business as hot', () => {
    const q = scoreLeadQualification(business({ reviewCount: 60 }), undefined, angle({ severity: 'critical' }));
    expect(q.score).toBe('hot');
  });

  it('scores a mild gap with few reviews as cold', () => {
    const q = scoreLeadQualification(business({ reviewCount: 3, rating: 4 }), undefined, angle({ severity: 'none' }));
    expect(q.score).toBe('cold');
  });

  it('scores a medium gap on an active business as warm', () => {
    const q = scoreLeadQualification(business({ reviewCount: 30 }), undefined, angle({ severity: 'medium' }));
    expect(q.score).toBe('warm');
  });

  it('lets customer-voiced demand upgrade a medium gap', () => {
    const withPain = scoreLeadQualification(
      business({ reviewCount: 45 }),
      { hasDigitalPain: true, painTags: ['customers asked to book online'] },
      angle({ severity: 'medium' }),
    );
    expect(withPain.score).toBe('hot'); // medium -> high via pain, and 45 >= 40
    expect(withPain.opportunity).toMatch(/reviewers are asking/i);
  });
});

describe('checkWebsiteHealth (no network paths)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports no_website for an empty input, without any network call', async () => {
    const res = await checkWebsiteHealth(null);
    expect(res.gap).toBe('no_website');
    expect(res.observation).toMatch(/website/i);
  });

  it('detects a social-only "website" without a network call', async () => {
    const res = await checkWebsiteHealth('https://facebook.com/acmecafe');
    expect(res.gap).toBe('social_only');
    expect(res.observation).toMatch(/facebook/i);
  });

  it('classifies a non-resolving domain as dead (credibility: a claim we can stand behind)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const err = new Error('getaddrinfo ENOTFOUND') as Error & { cause?: { code?: string } };
      err.cause = { code: 'ENOTFOUND' };
      throw err;
    }));
    const res = await checkWebsiteHealth('https://definitely-not-real.example');
    expect(res.gap).toBe('dead');
  });

  it('makes no claim (unverified) when the site bot-blocks with a 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(403, '')));
    const res = await checkWebsiteHealth('https://blocked.example');
    expect(res.gap).toBe('unverified');
    expect(res.observation).toBe('');
  });

  it('flags a loaded page with no responsive viewport as not_mobile', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(200, '<html><head></head><body>hi</body></html>', 'https://acme.example')));
    const res = await checkWebsiteHealth('https://acme.example');
    expect(res.gap).toBe('not_mobile');
  });

  it('passes a secure, mobile-friendly page as healthy', async () => {
    const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head></html>';
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(200, html, 'https://acme.example')));
    const res = await checkWebsiteHealth('https://acme.example');
    expect(res.gap).toBe('healthy');
  });

  const mobileHtml = '<html><head><meta name="viewport" content="width=device-width"></head></html>';

  it('does not claim "Not Secure" for an http:// link when the site also serves HTTPS', async () => {
    // Maps stores http://, but browsers upgrade to HTTPS, so visitors see a padlock.
    vi.stubGlobal('fetch', vi.fn(async (u: URL | string) =>
      streamResponse(200, mobileHtml, String(u))));
    const res = await checkWebsiteHealth('http://acme.example/');
    expect(res.gap).toBe('healthy');
  });

  it('makes no claim on 5xx (Cloudflare 520 / host 502 are often bot-only)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: URL | string) => streamResponse(520, '', String(u))));
    expect((await checkWebsiteHealth('https://acme.example/')).gap).toBe('unverified');
  });

  it('does not call a site dead when only the www (or non-www) host fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: URL | string) => {
      if (String(u).includes('www.')) {
        const err = new Error('getaddrinfo ENOTFOUND') as Error & { cause?: { code?: string } };
        err.cause = { code: 'ENOTFOUND' };
        throw err;
      }
      return streamResponse(200, mobileHtml, String(u));
    }));
    expect((await checkWebsiteHealth('https://www.acme.example/')).gap).toBe('healthy');
  });

  it('checks the homepage before calling a deep Maps link dead', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: URL | string) =>
      String(u).includes('/old-page') ? streamResponse(404, '', String(u)) : streamResponse(200, mobileHtml, String(u))));
    expect((await checkWebsiteHealth('https://acme.example/old-page?utm=gmb')).gap).toBe('healthy');
  });

  it('claims "Not Secure" only when HTTPS genuinely fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: URL | string) => {
      if (String(u).startsWith('https:')) {
        const err = new Error('connect ECONNREFUSED') as Error & { cause?: { code?: string } };
        err.cause = { code: 'ECONNREFUSED' };
        throw err;
      }
      return streamResponse(200, mobileHtml, String(u));
    }));
    const res = await checkWebsiteHealth('http://acme.example/');
    expect(res.gap).toBe('no_ssl');
  });
});

describe('review pain patterns (no false positives on ordinary praise)', () => {
  const sig = (text: string) => analyzeReviews([{ rating: 5, text, when: '' }]);
  it('ignores praise that merely mentions sites, appointments or old things', () => {
    expect(sig('They came on site and the team was great, old house looks new').hasDigitalPain).toBe(false);
    expect(sig('No appointment needed, walked in and they helped right away').hasDigitalPain).toBe(false);
    expect(sig("Couldn't get an appointment for weeks, they are that popular").hasDigitalPain).toBe(false);
    expect(sig('Their website showed my old kitchen photos, love it').hasDigitalPain).toBe(false);
  });
  it('still catches real digital pain', () => {
    expect(sig('There is no online booking, I had to call three times').painTags).toContain('A reviewer wanted online booking');
    expect(sig("I couldn't book online at all").painTags).toContain('A reviewer wanted online booking');
    expect(sig('Their website is outdated and hard to navigate').painTags).toContain('A reviewer found their website outdated / broken');
  });
});

// Minimal Response stand-in exposing the streaming reader that readCapped() uses.
function streamResponse(status: number, html: string, url = 'https://example.com') {
  const chunk = new TextEncoder().encode(html);
  let sent = false;
  return {
    status,
    url,
    body: {
      getReader: () => ({
        read: async () => (sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: chunk })),
        cancel: async () => {},
      }),
    },
  } as unknown as Response;
}
