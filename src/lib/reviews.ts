import { BusinessReview, ReviewSignal } from '@/types/lead';

// Mine a business's own Google reviews for evidence that customers are running
// into the exact problems these services solve. When a real customer writes "couldn't
// find their menu online" or "had to call to book", that's not us guessing they
// have a problem — it's demand, voiced out loud. We use it to QUALIFY and rank
// (painTags are for Abhishek's eyes), never to quote back in a cold message.

interface PainPattern {
  tag: string;
  re: RegExp;
}

const PAIN_PATTERNS: PainPattern[] = [
  {
    tag: 'A reviewer struggled to find them online',
    re: /\b(can('?t|not)|could(n'?t| not)|hard to|difficult to|unable to)\s+find\b[^.]*\b(online|website|google|web)\b|\bno\s+website\b|\bnot\s+on\s+google\b|\bno\s+online\s+presence\b/i,
  },
  {
    tag: 'A reviewer wanted online booking',
    re: /\b(no|without|lack of|couldn'?t|can'?t)\s+(online\s+)?(booking|reservation|appointment)\b|\bhad to call\b[^.]*\b(book|reserve|appointment)\b|\bbooking\b[^.]*\b(only by phone|by phone only)\b/i,
  },
  {
    tag: 'A reviewer wanted online ordering / delivery',
    re: /\b(no|without|couldn'?t|can'?t|wish.*had)\s+(online\s+)?(order|ordering|delivery|takeaway|take-out)\b|\border\s+online\b[^.]*\b(no|not|can'?t)\b/i,
  },
  {
    tag: "A reviewer couldn't find the menu / prices / hours online",
    re: /\b(menu|prices?|pricing|hours|timings?)\b[^.]*\b(not\s+(online|available|updated)|out of date|outdated|wrong|couldn'?t find)\b|\bno\s+(menu|prices?)\s+online\b/i,
  },
  {
    tag: 'A reviewer found their website outdated / broken',
    re: /\b(website|site|web\s*page)\b[^.]*\b(outdated|old|broken|doesn'?t work|not working|down|slow|confusing|hard to use)\b/i,
  },
];

export function analyzeReviews(reviews: BusinessReview[] | undefined): ReviewSignal {
  if (!reviews || reviews.length === 0) {
    return { hasDigitalPain: false, painTags: [] };
  }

  const found = new Set<string>();
  for (const r of reviews) {
    const text = r.text ?? '';
    if (!text) continue;
    for (const p of PAIN_PATTERNS) {
      if (p.re.test(text)) found.add(p.tag);
    }
  }

  return { hasDigitalPain: found.size > 0, painTags: [...found] };
}

// A compact block of real review text for the outreach model to mine for
// GENUINE, specific praise (a dish, the service, the vibe) so the message opens
// like someone who actually looked. The model is told to use praise only and
// never reference complaints, so passing all of it is safe.
export function reviewsForPrompt(reviews: BusinessReview[] | undefined): string {
  if (!reviews || reviews.length === 0) return '';
  return reviews
    .filter((r) => r.text && r.text.trim().length > 0)
    .slice(0, 5)
    .map((r) => `(${r.rating}★) "${r.text.replace(/\s+/g, ' ').trim().slice(0, 280)}"`)
    .join('\n');
}
