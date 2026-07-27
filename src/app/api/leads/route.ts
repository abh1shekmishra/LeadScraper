import { NextRequest, NextResponse } from 'next/server';
import { geocodeLocation, searchNearbyPlaces } from '@/lib/google-places';
import { checkManyWebsites } from '@/lib/website-health';
import { analyzeReviews } from '@/lib/reviews';
import { buildLeads } from '@/lib/build-leads';
import { DEMO_MODE, demoLeads } from '@/lib/demo';
import { FilterState, WEBSITE_SERVICES } from '@/types/filters';

export async function POST(req: NextRequest) {
  try {
    const { filters }: { filters: FilterState } = await req.json();

    // Demo mode: same curated sample set as the text-search path.
    if (DEMO_MODE) {
      const leads = demoLeads(filters.serviceTypes);
      const wantsWebsite = filters.serviceTypes.some((s) => WEBSITE_SERVICES.includes(s));
      return NextResponse.json({ leads, allFilteredOut: false, wantsWebsite, total: leads.length });
    }

    if (!filters.location.city) {
      return NextResponse.json({ error: 'City is required' }, { status: 400 });
    }
    if (filters.industries.length === 0) {
      return NextResponse.json({ error: 'Select at least one industry' }, { status: 400 });
    }

    const { lat, lng } = await geocodeLocation(
      filters.location.city,
      filters.location.state,
      filters.location.country,
    );

    const radiusMeters = filters.radiusKm * 1000;

    // Parallel search per place type — many more raw results
    const { businesses } = await searchNearbyPlaces(lat, lng, radiusMeters, filters.industries);

    const wantsWebsite = filters.serviceTypes.some((s) => WEBSITE_SERVICES.includes(s));

    // Filter: no website only + min reviews
    const filtered = businesses.filter((b) => {
      if (filters.noWebsiteOnly && b.website) return false;
      if ((b.reviewCount ?? 0) < filters.minReviews) return false;
      return true;
    });

    // Visit each site to detect the real digital gap, and mine reviews for
    // customer-voiced demand. Both feed scoring + outreach.
    const health = await checkManyWebsites(filtered.map((b) => b.website));
    const signals = filtered.map((b) => analyzeReviews(b.reviews));

    const leads = buildLeads(filtered, filters.serviceTypes, health, signals);
    const allFilteredOut = businesses.length > 0 && filtered.length === 0;

    return NextResponse.json({ leads, allFilteredOut, wantsWebsite, total: businesses.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
