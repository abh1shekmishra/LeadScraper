import { NextRequest, NextResponse } from 'next/server';
import { textSearchPlaces } from '@/lib/google-places';
import { checkManyWebsites } from '@/lib/website-health';
import { analyzeReviews } from '@/lib/reviews';
import { buildLeads } from '@/lib/build-leads';
import { FilterState } from '@/types/filters';

export async function POST(req: NextRequest) {
  try {
    const { query, filters }: { query: string; filters: FilterState } = await req.json();

    if (!query.trim()) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const { businesses } = await textSearchPlaces(query.trim());

    // Apply quality filters first, then only probe the survivors.
    const filtered = businesses.filter((b) => {
      if (filters.noWebsiteOnly && b.website) return false;
      if ((b.reviewCount ?? 0) < filters.minReviews) return false;
      return true;
    });

    // Visit each site to detect the real digital gap, and mine each business's
    // own reviews for customer-voiced demand. Both feed scoring + outreach.
    const health = await checkManyWebsites(filtered.map((b) => b.website));
    const signals = filtered.map((b) => analyzeReviews(b.reviews));

    const leads = buildLeads(filtered, filters.serviceTypes, health, signals);
    const allFilteredOut = businesses.length > 0 && filtered.length === 0;

    return NextResponse.json({
      leads,
      allFilteredOut,
      total: businesses.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
