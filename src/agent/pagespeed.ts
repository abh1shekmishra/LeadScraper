// Google PageSpeed Insights: free, 25k calls/day with a (free) API key.
// The mobile performance score is a number the business can verify themselves,
// so it's a claim we can make honestly.
export async function pageSpeedMobile(url: string): Promise<number | null> {
  const key = process.env.PAGESPEED_API_KEY;
  const api =
    'https://www.googleapis.com/pagespeedonline/v5/runPagespeed' +
    `?url=${encodeURIComponent(url)}&strategy=mobile&category=performance` +
    (key ? `&key=${key}` : '');
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) return null;
    const data = await res.json();
    const score = data?.lighthouseResult?.categories?.performance?.score;
    return typeof score === 'number' ? Math.round(score * 100) : null;
  } catch {
    return null;
  }
}
