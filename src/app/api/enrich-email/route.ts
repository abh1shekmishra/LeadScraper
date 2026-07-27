import { NextRequest, NextResponse } from 'next/server';
import { findEmailByDomain, extractDomain, inferEmailFromDomain } from '@/lib/hunter';
import { DEMO_MODE } from '@/lib/demo';

export async function POST(req: NextRequest) {
  try {
    const { website }: { website: string | null } = await req.json();

    if (!website) {
      return NextResponse.json({
        email: { address: null, confidence: 'unknown', source: null },
      });
    }

    const domain = extractDomain(website);
    if (!domain) {
      return NextResponse.json({
        email: { address: null, confidence: 'unknown', source: null },
      });
    }

    // Demo mode: show the pattern-inferred email path without a Hunter API call.
    if (DEMO_MODE) {
      return NextResponse.json({
        email: { address: inferEmailFromDomain(domain), confidence: 'inferred', source: 'pattern' },
      });
    }

    const email = await findEmailByDomain(domain);
    return NextResponse.json({ email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
