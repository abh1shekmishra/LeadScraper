import { NextRequest, NextResponse } from 'next/server';
import { generateFilterSuggestions } from '@/lib/claude';
import { DEMO_MODE } from '@/lib/demo';
import { ServiceType, Industry } from '@/types/filters';

const DEMO_SUGGESTIONS = [
  { industry: 'Real Estate Agencies', reason: 'High-ticket clients who win on virtual tours' },
  { industry: 'Restaurants & Cafes', reason: 'Busy, repeat customers, often no online ordering' },
  { industry: 'Dental & Medical Clinics', reason: 'Trust-driven; a dead or missing site costs bookings' },
];

export async function POST(req: NextRequest) {
  try {
    const {
      serviceTypes,
      existingIndustries,
    }: { serviceTypes: ServiceType[]; existingIndustries: Industry[] } = await req.json();

    if (serviceTypes.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    if (DEMO_MODE) {
      return NextResponse.json({ suggestions: DEMO_SUGGESTIONS });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const suggestions = await generateFilterSuggestions(serviceTypes, existingIndustries);
    return NextResponse.json({ suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
