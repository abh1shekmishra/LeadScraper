import { NextRequest, NextResponse } from 'next/server';
import { generateOutreach } from '@/lib/claude';
import { DEMO_MODE, demoOutreach } from '@/lib/demo';
import { BusinessInfo, SiteHealth } from '@/types/lead';
import { ServiceType } from '@/types/filters';

export async function POST(req: NextRequest) {
  try {
    const { business, serviceTypes, siteHealth, competitorNote }: {
      business: BusinessInfo;
      serviceTypes: ServiceType[];
      siteHealth?: SiteHealth;
      competitorNote?: string;
    } = await req.json();

    // Demo mode: compose grounded sample outreach without calling Claude.
    if (DEMO_MODE) {
      return NextResponse.json({ outreach: demoOutreach(business, serviceTypes, siteHealth) });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const outreach = await generateOutreach(business, serviceTypes, siteHealth, competitorNote);
    return NextResponse.json({ outreach });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
