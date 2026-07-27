import { EmailInfo } from '@/types/lead';

const API_KEY = process.env.HUNTER_API_KEY;

export function extractDomain(websiteUrl: string): string | null {
  try {
    const url = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export async function findEmailByDomain(domain: string): Promise<EmailInfo> {
  if (!API_KEY) return { address: null, confidence: 'unknown', source: null };

  try {
    const res = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${API_KEY}&limit=1`
    );
    const data = await res.json();

    const emails: { value: string; confidence: number }[] = data.data?.emails ?? [];
    if (emails.length > 0) {
      const top = emails[0];
      return {
        address: top.value,
        confidence: top.confidence >= 70 ? 'verified' : 'inferred',
        source: 'hunter',
      };
    }
  } catch {
    // fall through to pattern inference
  }

  return inferEmailFromDomain(domain);
}

export function inferEmailFromDomain(domain: string): EmailInfo {
  return {
    address: `info@${domain}`,
    confidence: 'inferred',
    source: 'pattern',
  };
}
