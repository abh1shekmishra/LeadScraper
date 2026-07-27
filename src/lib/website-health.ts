import { SiteHealth, SiteGap } from '@/types/lead';

// Visit a business's website server-side and detect the strongest, most provable
// digital gap. Everything here is phrased as OUR observation ("I tried opening
// your site and it didn't load for me") so the outreach never makes a claim we
// can't back up. Ambiguous failures (bot-blocking) return 'unverified' → no claim.

// Does this business effectively have a real, working website? Used to compute
// the "most businesses near you already have a website" competitor framing.
export function hasRealSite(gap: SiteGap): boolean {
  return gap === 'healthy' || gap === 'slow' || gap === 'no_ssl' || gap === 'not_mobile' || gap === 'unverified';
}

const TIMEOUT_MS = 9000;
const SLOW_MS = 6000;          // a document that takes longer than this to arrive is genuinely slow
const MAX_BYTES = 120_000;     // enough to capture <head> for the viewport check

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Hosts that mean "no real website" — a social/link page used in place of a site.
function matchSocial(host: string): string | null {
  if (/(^|\.)(facebook\.com|fb\.me|fb\.com)$/.test(host))
    return "you're using a Facebook page instead of a real website";
  if (/(^|\.)(instagram\.com|instagr\.am)$/.test(host))
    return "you're using an Instagram page instead of a real website";
  if (/(^|\.)(linktr\.ee|linktree\.com)$/.test(host))
    return 'your link is just a Linktree, not an actual website';
  if (/(^|\.)(wa\.me|api\.whatsapp\.com)$/.test(host))
    return "your website link just opens WhatsApp, there's no actual site";
  if (/(^|\.)business\.site$/.test(host))
    return "you're using a basic auto-generated Google page instead of a real website";
  if (/(^|\.)sites\.google\.com$/.test(host))
    return "you're using a basic Google Sites page instead of a real website";
  return null;
}

function hasViewport(html: string): boolean {
  return /<meta[^>]+name=["']?viewport["']?/i.test(html);
}

// Scan the page for what they ALREADY have, so we never pitch something that's
// already there. Drives the AR/VR and Mobile App angles.
function detectFeatures(html: string): Pick<SiteHealth, 'hasImmersive' | 'hasOnlineOrdering' | 'hasAppLinks'> {
  return {
    hasImmersive:
      /virtual tour|matterport|3d ?tour|360[\s°-]*(view|tour|degree)|walk ?through|kuula|3dvista|panorama|view in 3d|augmented reality|ar (view|try)|try[\s-]?on/i.test(html),
    hasOnlineOrdering:
      /order online|order now|add to (cart|bag|basket)|\/cart|checkout|place (your )?order|book (now|a table|online|an appointment)|reservation|reserve a|buy now|shop now|swiggy|zomato|opentable|doordash|ubereats/i.test(html),
    hasAppLinks:
      /apps\.apple\.com|play\.google\.com|app ?store|google play|download (our|the) app/i.test(html),
  };
}

type ProbeResult =
  | { ok: true; status: number; html: string; finalUrl: string; loadMs: number }
  | { ok: false; reason: 'dead' | 'unverified' };

// Credibility-first error classification. We only call a site "dead" when we can
// genuinely stand behind it: the domain doesn't resolve, or the server refuses
// the connection. A timeout, reset, or TLS quirk could just be a slow site or
// bot-blocking, so it becomes 'unverified' and produces no claim.
function classifyError(err: unknown): 'dead' | 'unverified' {
  const code = (err as { cause?: { code?: string } })?.cause?.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNREFUSED') return 'dead';
  return 'unverified';
}

async function probe(url: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    });
    const loadMs = Date.now() - start;
    const html = await readCapped(res);
    return { ok: true, status: res.status, html, finalUrl: res.url || url, loadMs };
  } catch (err) {
    return { ok: false, reason: classifyError(err) };
  } finally {
    clearTimeout(timer);
  }
}

// Read at most MAX_BYTES of the body so we never pull a huge page into memory.
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let received = 0;
  let html = '';
  try {
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
    }
  } catch {
    // partial read is fine — we only need the <head>
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
  return html;
}

export async function checkWebsiteHealth(website: string | null): Promise<SiteHealth> {
  if (!website || !website.trim()) {
    return { gap: 'no_website', https: false, mobileFriendly: null, loadMs: null,
      observation: "you don't have a website at all" };
  }

  let parsed: URL;
  try {
    parsed = new URL(website.includes('://') ? website : `https://${website}`);
  } catch {
    return { gap: 'no_website', https: false, mobileFriendly: null, loadMs: null,
      observation: "you don't have a working website" };
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  const socialObservation = matchSocial(host);
  if (socialObservation) {
    return { gap: 'social_only', https: parsed.protocol === 'https:', mobileFriendly: null,
      loadMs: null, observation: socialObservation };
  }

  const result = await probe(parsed.toString());

  if (!result.ok) {
    if (result.reason === 'dead') {
      return { gap: 'dead', https: parsed.protocol === 'https:', mobileFriendly: null, loadMs: null,
        observation: "I tried opening your website and it didn't load for me" };
    }
    // Timed out / reset / TLS quirk — can't confirm anything, so make no claim.
    return { gap: 'unverified', https: parsed.protocol === 'https:', mobileFriendly: null,
      loadMs: null, observation: '' };
  }

  const { status, html, finalUrl, loadMs } = result;

  // Bot-blocking / rate-limit / temporary unavailable → can't confirm, make no claim.
  if (status === 403 || status === 429 || status === 503) {
    return { gap: 'unverified', https: true, mobileFriendly: null, loadMs, observation: '' };
  }
  // Hard failures we can stand behind.
  if (status === 404 || status === 410 || status >= 500) {
    return { gap: 'dead', https: parsed.protocol === 'https:', mobileFriendly: null, loadMs,
      observation: 'your website link is up but the page returns an error' };
  }
  // Other 4xx → be conservative, no claim.
  if (status >= 400) {
    return { gap: 'unverified', https: true, mobileFriendly: null, loadMs, observation: '' };
  }

  // Successful load. What does the page already have, and is it secure?
  const features = detectFeatures(html);
  let finalIsHttps = true;
  try { finalIsHttps = new URL(finalUrl).protocol === 'https:'; } catch { /* keep default */ }

  if (!finalIsHttps) {
    return { gap: 'no_ssl', https: false, mobileFriendly: hasViewport(html), loadMs, ...features,
      observation: "your website runs on an unsecured connection, so browsers show visitors a 'Not Secure' warning" };
  }

  if (!hasViewport(html)) {
    return { gap: 'not_mobile', https: true, mobileFriendly: false, loadMs, ...features,
      observation: "your website isn't built for phones, so it likely looks broken on mobile" };
  }

  if (loadMs > SLOW_MS) {
    return { gap: 'slow', https: true, mobileFriendly: true, loadMs, ...features,
      observation: `your website took about ${Math.round(loadMs / 1000)} seconds to load for me, slow enough that visitors drop off` };
  }

  return { gap: 'healthy', https: true, mobileFriendly: true, loadMs, ...features, observation: '' };
}

// Probe many sites at once without ever letting one failure break a search.
export async function checkManyWebsites(websites: (string | null)[]): Promise<SiteHealth[]> {
  const results = await Promise.allSettled(websites.map((w) => checkWebsiteHealth(w)));
  return results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { gap: 'unverified', https: false, mobileFriendly: null, loadMs: null, observation: '' },
  );
}
