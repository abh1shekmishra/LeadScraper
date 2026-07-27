import { BusinessInfo, Lead, ReviewSignal, SiteHealth, scoreLeadQualification } from '@/types/lead';
import { ServiceType } from '@/types/filters';
import { hasRealSite } from '@/lib/website-health';
import { pickServiceAngle } from '@/lib/service-angles';

const scoreOrder = { hot: 0, warm: 1, cold: 2 };

// Assemble the final, sorted lead list from the raw businesses plus their probed
// site health and review signals. Shared by both the text-search and filter-panel
// routes so qualification stays identical across them.
export function buildLeads(
  businesses: BusinessInfo[],
  serviceTypes: ServiceType[],
  health: SiteHealth[],
  signals: ReviewSignal[],
): Lead[] {
  // Competitor framing: of everything we found in this search, how many already
  // have a real, working website? Only assert "most" when the sample is big
  // enough and the majority truly is ahead (keeps it honest).
  const total = businesses.length;
  const withSite = health.filter((h) => hasRealSite(h.gap)).length;
  const peersAhead = total >= 8 && withSite / total >= 0.6;
  const competitorNote = peersAhead
    ? 'Most of the similar businesses near you already have a website.'
    : undefined;

  const leads: Lead[] = businesses.map((business, i) => {
    const siteHealth = health[i];
    const reviewSignal = signals[i];
    // Choose the best service-specific angle, then score from it.
    const angle = pickServiceAngle(business, siteHealth, serviceTypes);
    const qualification = scoreLeadQualification(business, reviewSignal, angle);

    // The competitor nudge only makes sense for a website pitch on a laggard.
    const behind = !!competitorNote && angle.service === 'website' && !!siteHealth && !hasRealSite(siteHealth.gap);
    if (behind) qualification.reasons.push('Behind competitors — most nearby have a website');

    return {
      id: business.placeId,
      business,
      email: { address: null, confidence: 'unknown' as const, source: null },
      outreach: null,
      isGeneratingOutreach: false,
      isEnrichingEmail: false,
      siteHealth,
      qualification,
      pitchBadge: angle.badge,
      competitorNote: behind ? competitorNote : undefined,
    };
  });

  return leads.sort((a, b) => scoreOrder[a.qualification!.score] - scoreOrder[b.qualification!.score]);
}
