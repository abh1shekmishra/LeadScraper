import { NextRequest, NextResponse } from 'next/server';
import { generateFilterSuggestions } from '@/lib/claude';
import { ServiceType, Industry } from '@/types/filters';

export async function POST(req: NextRequest) {
  try {
    const {
      serviceTypes,
      existingIndustries,
    }: { serviceTypes: ServiceType[]; existingIndustries: Industry[] } = await req.json();

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    if (serviceTypes.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = await generateFilterSuggestions(serviceTypes, existingIndustries);
    return NextResponse.json({ suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
