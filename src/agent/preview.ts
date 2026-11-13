import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, PREVIEWS } from './config';
import { client } from '@/lib/claude';
import { extractArea } from '@/lib/service-angles';
import { BusinessInfo } from '@/types/lead';

// "Show, don't tell": for hot leads with no/broken website, Claude builds a
// one-page concept site from their own public listing, and it's hosted free on
// Cloudflare Pages. The message then says "I made you a quick preview: <link>".
//
// Honesty rules baked in: only real listing data, a visible "unofficial concept
// preview" banner, and noindex so it never competes with them on Google.

const DIR = path.join(process.cwd(), 'data', 'previews');

export function slugFor(b: BusinessInfo): string {
  const base = b.name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  let h = 0;
  for (const ch of b.placeId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${base || 'preview'}-${h.toString(36).slice(0, 5)}`;
}

export const previewUrl = (slug: string) => `https://${PREVIEWS.project}.pages.dev/${slug}/`;

export const previewConfigured = () =>
  PREVIEWS.enabled && !!process.env.CLOUDFLARE_API_TOKEN && !!process.env.CLOUDFLARE_ACCOUNT_ID;

export async function buildPreview(b: BusinessInfo): Promise<string> {
  const praise = b.reviews
    .filter((r) => r.rating >= 4 && r.text.length > 30)
    .slice(0, 3)
    .map((r) => `"${r.text.replace(/\s+/g, ' ').slice(0, 220)}"`)
    .join('\n');
  const phoneDigits = (b.internationalPhone ?? '').replace(/\D/g, '');

  const prompt = `Build a one-page concept website for a real local business, as a single self-contained HTML file.

FACTS (use ONLY these; invent nothing: no services list, prices, years, awards, staff names, addresses or claims not given here):
Name: ${b.name}
Type: ${b.category}
Area: ${extractArea(b.address)}
${b.rating ? `Google rating: ${b.rating} from ${b.reviewCount ?? 0} reviews` : ''}
Phone: ${b.phone ?? 'none'}
${phoneDigits ? `WhatsApp link: https://wa.me/${phoneDigits}` : ''}
Map link: ${b.googleMapsUrl || 'none'}
${praise ? `Real customer reviews (quote verbatim, attributed only as "Google review"):\n${praise}` : ''}

REQUIREMENTS:
- A fixed thin banner at the very top on every screen size: "Unofficial concept preview made by ${CONFIG.fromName}. This is not the official ${b.name} website."
- <meta name="robots" content="noindex, nofollow"> and a <title> with the business name.
- Mobile-first, looks premium and current for a ${b.category}: strong typography (one Google Font is allowed via <link>), a tasteful palette that suits the trade, generous spacing, no stock photos or external images (use CSS shapes/gradients/initials instead).
- Sections: hero with name + a short neutral tagline built only from the type and area + call / WhatsApp / directions buttons using the real links above (omit any that are missing); a reviews section if reviews exist; a simple contact/visit section; a small footer repeating the "concept preview" notice.
- Generic copy must stay generic ("Get in touch to discuss your project"), never factual claims.
- No JavaScript needed. Inline CSS only.

Return ONLY the HTML document, starting with <!doctype html>.`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5', max_tokens: 6000, messages: [{ role: 'user', content: prompt }],
  });
  const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
  const start = text.toLowerCase().indexOf('<!doctype html');
  if (start < 0) throw new Error('preview: model returned no HTML');
  const html = text.slice(start, text.toLowerCase().lastIndexOf('</html>') + 7);
  // Guarantee the honesty notice and noindex even if the model drifted.
  if (!/unofficial concept preview/i.test(html) || !/noindex/i.test(html)) throw new Error('preview: missing banner/noindex');

  const slug = slugFor(b);
  fs.mkdirSync(path.join(DIR, slug), { recursive: true });
  fs.writeFileSync(path.join(DIR, slug, 'index.html'), html);
  return slug;
}

// Upload everything in data/previews in one go (Pages skips unchanged files).
export async function deployPreviews(): Promise<void> {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta name="robots" content="noindex"><title>Previews</title>');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['-y', 'wrangler@4', 'pages', 'deploy', DIR,
      '--project-name', PREVIEWS.project, '--branch', 'main', '--commit-dirty=true'],
    { stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32' });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`wrangler exited ${code}: ${err.slice(-300)}`))));
  });
}
