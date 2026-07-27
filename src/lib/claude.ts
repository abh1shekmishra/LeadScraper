import Anthropic from '@anthropic-ai/sdk';
import { OutreachDraft, AISuggestion, SiteHealth, ServiceAngle } from '@/types/lead';
import { BusinessInfo } from '@/types/lead';
import { ServiceType, Industry } from '@/types/filters';
import { reviewsForPrompt } from '@/lib/reviews';
import { pickServiceAngle, extractArea } from '@/lib/service-angles';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function stripEmDashes(s: string) {
  return s.replace(/—/g, '-').replace(/–/g, '-');
}

export async function generateOutreach(
  business: BusinessInfo,
  serviceTypes: ServiceType[],
  siteHealth?: SiteHealth,
  competitorNote?: string,
): Promise<OutreachDraft> {
  const area = extractArea(business.address);
  const category = business.category.toLowerCase();
  const reviewCount = business.reviewCount ?? 0;
  const name = business.name;
  const angle = pickServiceAngle(business, siteHealth, serviceTypes);
  const reviewContext = reviewsForPrompt(business.reviews);

  const prompt = `Write WhatsApp-first cold outreach for Abhishek, an independent developer who builds websites, apps, and AR/VR.

BUSINESS
Name: ${name}
Type: ${category}
Area: ${area}
${reviewCount > 0 ? `Google reviews: ${reviewCount}` : 'Reviews: not many yet'}

WHAT ABHISHEK NOTICED (this is true and was personally checked — build EVERY message on THIS, do not invent anything else):
${angle.hasProblem
  ? `"${angle.observation}". Why it matters: ${angle.consequence}.`
  : `Nothing is visibly broken, so do NOT claim any problem. Angle: ${angle.observation}, and ${angle.consequence}.`}
THE ASK (keep it exactly this small and pressure-free): ${angle.ask}.
${competitorNote ? `\nCONTEXT YOU MAY USE (only if it fits naturally, max once across all messages): ${competitorNote}\n` : ''}
${reviewContext ? `REAL CUSTOMER REVIEWS (for warmth only):
${reviewContext}

How to use these: if there is genuine, specific praise (a dish, the service, the atmosphere), you MAY open one or two messages with a short, natural nod to it so it's obvious Abhishek actually looked them up. Keep it real and brief. NEVER mention, quote, hint at, or paraphrase any complaint or negative review. Praise only.\n` : ''}
TONE: Human, warm, and genuinely helpful. Like a real person who looked them up and wants to give them a useful heads-up, not a salesperson. Plain words. No games, no vague hints, no mystery, no hard selling.

HARD RULES:
- Every message opens with a greeting and "I'm Abhishek"
- No em dashes (— or –) anywhere
- Never use: "I hope you're doing well", "I wanted to reach out", "touch base", "leverage", "innovative", "excited to", "boost your revenue", "grow your business", "has anyone mentioned", "noticed something interesting"
- Don't explain your services in detail, don't mention past work or experience
- ${angle.hasProblem ? 'State the observation as a fact you personally checked, never as an accusation' : 'Do not pretend anything is broken'}
- Keep every message specific to THIS business

WHATSAPP VERSION 1 (blunt and direct): 50 to 65 words. Greeting + "I'm Abhishek" + the observation stated plainly + why it matters + the ask.
WHATSAPP VERSION 2 (warm but still direct): 50 to 65 words. Friendlier opener (a genuine nod to their reviews is great here if you have one), same honesty, the ask phrased naturally.
WHATSAPP VERSION 3 (casual, reads like a real text): 45 to 60 words. Relaxed and human, still names the observation and makes the ask.

EMAIL (this is a HELPFUL HEADS-UP, not a pitch — write it so a busy owner actually reads it and doesn't feel sold to):
Subject: 3 to 6 words, lowercase like a real person typed it, no marketing capitalisation, no buzzwords. Good examples: "quick note about ${name}", "came across ${name}", "a thought for ${name}".
Body: 60 to 100 words, plain short sentences. Flow: "Hi, I'm Abhishek." + (optional one-line genuine nod to their reviews) + "I went looking for ${name} online and noticed [the observation, said plainly]." + "Just thought you'd want to know, since [why it matters, one line]." + one plain line: "${angle.serviceLine} for small businesses." + the soft offer (${angle.ask}). + "No pressure either way." + sign off on its own line: "Abhishek". No bullet points, no em dashes, no banned phrases, nothing pushy.

FOLLOW-UP 1 (WhatsApp, day 3): 35 to 50 words. A different angle from message 1.${reviewCount > 0 ? ` You can reference their ${reviewCount} reviews.` : ''} Still specific, not "just checking in". No em dashes.
FOLLOW-UP 2 (WhatsApp, day 7): 35 to 50 words. Lead with: "Hey, Abhishek again. I put together a rough idea of what ${angle.mockupNoun} for ${name} could look like. Want me to send it over?" No em dashes.
FOLLOW-UP 3 (WhatsApp, day 14): 25 to 40 words. Warm, no pressure, leave the door open, sign off cleanly. No em dashes.

Return ONLY valid JSON, nothing else:
{"emailSubject":"...","emailBody":"...","whatsappCurious":"...","whatsappDirect":"...","whatsappFriendly":"...","followUp1":"...","followUp2":"...","followUp3":"..."}`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    system: `You write cold outreach for Abhishek, an independent developer, sent mostly over WhatsApp. Every message is human, warm, and genuinely helpful — like a real person giving a useful heads-up, never a salesperson. Each is built on the one specific observation you are given; you never invent problems or make claims beyond it. You may warmly reference genuine praise from a business's reviews, but you NEVER mention or paraphrase complaints. The email is a plain, friendly heads-up, not a pitch. You never use em dashes (— or –). You never mention experience, portfolio, or company history. You always return only valid JSON.`,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const result = JSON.parse(jsonMatch[0]) as OutreachDraft;
    return {
      emailSubject:    stripEmDashes(result.emailSubject    ?? ''),
      emailBody:       stripEmDashes(result.emailBody       ?? ''),
      whatsappCurious: stripEmDashes(result.whatsappCurious ?? ''),
      whatsappDirect:  stripEmDashes(result.whatsappDirect  ?? ''),
      whatsappFriendly:stripEmDashes(result.whatsappFriendly?? ''),
      followUp1:       stripEmDashes(result.followUp1       ?? ''),
      followUp2:       stripEmDashes(result.followUp2       ?? ''),
      followUp3:       stripEmDashes(result.followUp3       ?? ''),
    };
  } catch {
    return buildFallback(name, reviewCount, angle);
  }
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Used only if the model returns no parseable JSON. Still gap-specific and honest.
// Email follows the "helpful heads-up" voice: plain, friendly, not a pitch.
function buildFallback(
  name: string,
  reviewCount: number,
  angle: ServiceAngle,
): OutreachDraft {
  const reviewProof = reviewCount > 0 ? ` You've got ${reviewCount} reviews, so the customers are clearly there.` : '';
  return {
    emailSubject: angle.hasProblem ? `quick note about ${name}` : `came across ${name}`,
    emailBody: `Hi, I'm Abhishek.\n\nI went looking for ${name} online and noticed ${angle.observation}. Just thought you'd want to know, since ${angle.consequence}.\n\n${angle.serviceLine} for small businesses. ${angle.ask}. No pressure either way.\n\nAbhishek`,
    whatsappCurious: `Hi! I'm Abhishek. ${cap(angle.observation)}. ${cap(angle.consequence)}. ${angle.ask}.`,
    whatsappDirect: `Hey! I'm Abhishek. ${cap(angle.observation)}, and honestly ${angle.consequence}. ${angle.ask}.`,
    whatsappFriendly: `Hi, Abhishek here. ${cap(angle.observation)}. ${angle.ask}.`,
    followUp1: `Hey, Abhishek again about ${name}.${reviewProof} ${angle.hasProblem ? 'Fixing this is quicker than you might think.' : 'Still happy to share those ideas.'} Want me to send over a quick example?`,
    followUp2: `Hey, Abhishek again. I put together a rough idea of what ${angle.mockupNoun} for ${name} could look like. Want me to send it over? No commitment at all.`,
    followUp3: `No worries if the timing isn't right. I'll leave this here. If it ever makes sense, just reply and I'll pick it up.`,
  };
}

export async function generateFilterSuggestions(
  serviceTypes: ServiceType[],
  existingIndustries: Industry[],
): Promise<AISuggestion[]> {
  const prompt = `Abhishek offers: ${serviceTypes.join(', ')}
They have already considered: ${existingIndustries.join(', ') || 'none yet'}

Suggest 4 to 5 specific business types they should search for that would strongly benefit from ${serviceTypes.join(' / ')}. Be specific and practical.

Return ONLY a valid JSON array:
[{"industry":"...","reason":"explain in max 8 words"}]`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    system: 'You suggest practical client targets for a dev studio. Return only valid JSON.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]';
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]) as AISuggestion[];
  } catch {
    return [];
  }
}
