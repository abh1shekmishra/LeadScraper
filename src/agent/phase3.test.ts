import { describe, expect, it } from 'vitest';
import { parseRedditRss, redditHiring, stripHtml } from '@/agent/gigs';
import { leadPriority, smoothed, weightedPick } from '@/agent/learn';
import { slugFor } from '@/agent/preview';
import type { BusinessInfo } from '@/types/lead';

describe('gig sources', () => {
  it('parses the Reddit Atom feed', () => {
    const xml = `<feed><entry><category term="hiring" label="r/hiring"/><content type="html">&lt;p&gt;Need a site, $500&lt;/p&gt;</content><id>t3_abc</id>
      <link href="https://www.reddit.com/r/forhire/comments/abc/x/" /><published>2026-11-10T10:00:00+00:00</published>
      <title>[Hiring] Website for my bakery &amp; cafe</title></entry></feed>`;
    const posts = redditHiring('forhire', parseRedditRss(xml));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ id: 'reddit:abc', source: 'r/hiring', title: '[Hiring] Website for my bakery & cafe',
      body: 'Need a site, $500', url: 'https://www.reddit.com/r/forhire/comments/abc/x/' });
    expect(posts[0].postedAt).toBe(Date.parse('2026-11-10T10:00:00Z'));
  });

  it('keeps Reddit hiring posts, drops for-hire ones', () => {
    const posts = redditHiring('forhire', [
      { data: { id: 'a', title: '[Hiring] Shopify site redesign', selftext: 'budget $800', permalink: '/r/forhire/a', created_utc: 1 } },
      { data: { id: 'b', title: '[For Hire] Web developer', selftext: '', permalink: '/r/forhire/b', created_utc: 1 } },
      { data: { id: 'c', title: 'Need an Unreal dev', link_flair_text: 'Hiring', selftext: '', permalink: '/r/x/c', created_utc: 1 } },
    ]);
    expect(posts.map((p) => p.id)).toEqual(['reddit:a', 'reddit:c']);
    expect(posts[0].url).toBe('https://www.reddit.com/r/forhire/a');
  });

  it('strips HN HTML entities', () => {
    expect(stripHtml('a&#x2F;b<p>c &amp; d')).toBe('a/b\n\nc & d');
  });
});

describe('learning', () => {
  it('smooths small samples toward 10%', () => {
    expect(smoothed(0, 0)).toBeCloseTo(0.1);
    expect(smoothed(1, 2)).toBeGreaterThan(smoothed(0, 2));
    expect(smoothed(5, 20)).toBeGreaterThan(smoothed(1, 20));
  });
  it('ranks hot, busy, well-rated leads first', () => {
    expect(leadPriority('hot', 50, 4.6)).toBeGreaterThan(leadPriority('warm', 50, 4.6));
    expect(leadPriority('warm', 300, 4.0)).toBeGreaterThan(leadPriority('warm', 10, 4.0));
    expect(leadPriority('warm', 50, 4.0, 0.4)).toBeGreaterThan(leadPriority('warm', 50, 4.0, 0.1));
  });
  it('picks in proportion to weight', () => {
    const items = [{ item: 'a', w: 1 }, { item: 'b', w: 3 }];
    expect(weightedPick(items, 0.2)).toBe('a');
    expect(weightedPick(items, 0.3)).toBe('b');
    expect(weightedPick(items, 0.999)).toBe('b');
  });
});

describe('preview slug', () => {
  it('is url-safe, stable, and unique per place', () => {
    const b = { name: 'Café Ñoño & Co.', placeId: 'X1' } as BusinessInfo;
    expect(slugFor(b)).toMatch(/^cafe-nono-co-[a-z0-9]+$/);
    expect(slugFor(b)).toBe(slugFor(b));
    expect(slugFor({ ...b, placeId: 'X2' })).not.toBe(slugFor(b));
  });
});
