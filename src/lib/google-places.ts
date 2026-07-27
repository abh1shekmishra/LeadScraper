import { BusinessInfo, BusinessReview } from '@/types/lead';
import { INDUSTRY_TO_PLACES_TYPES, Industry } from '@/types/filters';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const PLACES_BASE = 'https://places.googleapis.com/v1';
const GEOCODING_BASE = 'https://maps.googleapis.com/maps/api';

const PLACE_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.types',
  'places.googleMapsUri',
  'places.primaryTypeDisplayName',
  'places.reviews', // up to 5 reviews inline — customer-voice for qualification + warmth
];

const NEARBY_FIELD_MASK = PLACE_FIELDS.join(',');
// Text Search adds the top-level pagination token (NOT 'places.nextPageToken').
const TEXT_FIELD_MASK = [...PLACE_FIELDS, 'nextPageToken'].join(',');

export async function geocodeLocation(city: string, state: string, country: string) {
  const query = [city, state, country].filter(Boolean).join(', ');
  const url = `${GEOCODING_BASE}/geocode/json?address=${encodeURIComponent(query)}&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.[0]) {
    throw new Error(`Could not geocode location: ${query}`);
  }
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng };
}

// Search one specific place type via Nearby Search
async function searchOneType(
  lat: number,
  lng: number,
  radiusMeters: number,
  placeType: string,
): Promise<BusinessInfo[]> {
  const body = {
    locationRestriction: {
      circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
    },
    includedTypes: [placeType],
    maxResultCount: 20,
  };

  const res = await fetch(`${PLACES_BASE}/places:searchNearby`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': NEARBY_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return []; // skip failed types silently
  const data = await res.json();
  return (data.places ?? []).map(mapPlaceToBusinessInfo);
}

export async function searchNearbyPlaces(
  lat: number,
  lng: number,
  radiusMeters: number,
  industries: Industry[],
): Promise<{ businesses: BusinessInfo[] }> {
  const allTypes = industries.flatMap((i) => INDUSTRY_TO_PLACES_TYPES[i]);
  const uniqueTypes = [...new Set(allTypes)];

  const results = await Promise.allSettled(
    uniqueTypes.map((type) => searchOneType(lat, lng, radiusMeters, type))
  );

  const seen = new Set<string>();
  const businesses: BusinessInfo[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const b of result.value) {
        if (!seen.has(b.placeId)) { seen.add(b.placeId); businesses.push(b); }
      }
    }
  }
  return { businesses };
}

// Free-form text search — handles "interior designers in Dubai" natively.
// Returns one page plus the token for the next page (if any).
async function textSearchPage(
  query: string,
  pageToken?: string,
): Promise<{ businesses: BusinessInfo[]; nextPageToken?: string }> {
  const body: Record<string, unknown> = { textQuery: query, pageSize: 20, languageCode: 'en' };
  if (pageToken) body.pageToken = pageToken;

  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': TEXT_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Places Text Search failed: ${err}`);
  }

  const data = await res.json();
  return {
    businesses: (data.places ?? []).map(mapPlaceToBusinessInfo),
    nextPageToken: data.nextPageToken as string | undefined,
  };
}

const MAX_PAGES = 3; // ~60 results on the primary query

// Balanced sourcing: paginate the exact query deep (~60), then add one light
// synonym variant ("in" -> "near") for extra coverage. Deduped by placeId.
export async function textSearchPlaces(query: string): Promise<{ businesses: BusinessInfo[] }> {
  const seen = new Set<string>();
  const businesses: BusinessInfo[] = [];
  const collect = (list: BusinessInfo[]) => {
    for (const b of list) {
      if (!seen.has(b.placeId)) { seen.add(b.placeId); businesses.push(b); }
    }
  };

  // Primary query, paginated. A first-page failure is a real error (surface it);
  // a later-page failure just stops pagination and keeps what we already have.
  let token: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    let result: { businesses: BusinessInfo[]; nextPageToken?: string };
    try {
      result = await textSearchPage(query, token);
    } catch (err) {
      if (page === 0) throw err;
      break;
    }
    collect(result.businesses);
    if (!result.nextPageToken) break;
    token = result.nextPageToken;
  }

  // Light synonym coverage (best-effort — never breaks a working search).
  const q2 = query.replace(/\bin\b/, 'near').trim();
  if (q2 !== query) {
    try {
      const r2 = await textSearchPage(q2);
      collect(r2.businesses);
    } catch { /* ignore */ }
  }

  return { businesses };
}

// Google review object (New API): { rating, text: { text }, relativePublishTimeDescription }
function mapReviews(raw: unknown): BusinessReview[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const rev = r as {
        rating?: number;
        text?: { text?: string };
        originalText?: { text?: string };
        relativePublishTimeDescription?: string;
      };
      return {
        rating: rev.rating ?? 0,
        text: rev.text?.text ?? rev.originalText?.text ?? '',
        when: rev.relativePublishTimeDescription ?? '',
      };
    })
    .filter((r) => r.text.trim().length > 0)
    .slice(0, 5);
}

function mapPlaceToBusinessInfo(place: Record<string, unknown>): BusinessInfo {
  const displayName = place.displayName as { text?: string } | undefined;
  const primaryTypeDisplayName = place.primaryTypeDisplayName as { text?: string } | undefined;
  const types = place.types as string[] | undefined;

  return {
    placeId: place.id as string,
    name: displayName?.text ?? 'Unknown Business',
    address: (place.formattedAddress as string) ?? '',
    phone: (place.nationalPhoneNumber as string | null) ?? null,
    internationalPhone: (place.internationalPhoneNumber as string | null) ?? null,
    website: (place.websiteUri as string | null) ?? null,
    rating: (place.rating as number | null) ?? null,
    reviewCount: (place.userRatingCount as number | null) ?? null,
    category:
      primaryTypeDisplayName?.text ??
      (types?.[0] ? types[0].replace(/_/g, ' ') : 'Business'),
    googleMapsUrl: (place.googleMapsUri as string) ?? '',
    reviews: mapReviews(place.reviews),
  };
}
