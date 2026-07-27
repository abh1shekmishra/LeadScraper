export type ServiceType =
  | 'AR'
  | 'VR'
  | 'Website'
  | 'Mobile App'
  | 'Desktop App'
  | 'E-commerce'
  | 'Custom Software';

export type Industry =
  | 'Restaurant'
  | 'Healthcare'
  | 'Real Estate'
  | 'Education'
  | 'Retail'
  | 'Hospitality'
  | 'Fitness'
  | 'Legal'
  | 'Automotive'
  | 'Beauty & Wellness';

export interface FilterState {
  serviceTypes: ServiceType[];
  industries: Industry[];
  location: {
    city: string;
    state: string;
    country: string;
  };
  radiusKm: number;
  noWebsiteOnly: boolean;
  minReviews: number;
}

// Industries where AR/VR makes proven business sense
export const AR_VR_INDUSTRIES: Industry[] = [
  'Real Estate',
  'Education',
  'Retail',
  'Hospitality',
  'Automotive',
  'Healthcare',
];

// Services that require "no website" as primary signal
export const WEBSITE_SERVICES: ServiceType[] = ['Website', 'E-commerce'];

// Services that work best for specific industries
export const SERVICE_BEST_INDUSTRIES: Partial<Record<ServiceType, Industry[]>> = {
  AR: AR_VR_INDUSTRIES,
  VR: AR_VR_INDUSTRIES,
  'Mobile App': ['Restaurant', 'Fitness', 'Healthcare', 'Hospitality', 'Retail'],
  Website: ['Restaurant', 'Healthcare', 'Real Estate', 'Retail', 'Legal', 'Automotive', 'Beauty & Wellness', 'Fitness'],
  'E-commerce': ['Retail', 'Beauty & Wellness', 'Automotive'],
};

export const ALL_SERVICE_TYPES: ServiceType[] = [
  'AR',
  'VR',
  'Website',
  'Mobile App',
  'Desktop App',
  'E-commerce',
  'Custom Software',
];

export const ALL_INDUSTRIES: Industry[] = [
  'Restaurant',
  'Healthcare',
  'Real Estate',
  'Education',
  'Retail',
  'Hospitality',
  'Fitness',
  'Legal',
  'Automotive',
  'Beauty & Wellness',
];

export const INDUSTRY_TO_PLACES_TYPES: Record<Industry, string[]> = {
  Restaurant: ['restaurant', 'cafe', 'bakery', 'bar'],
  Healthcare: ['doctor', 'dentist', 'hospital', 'pharmacy'],
  'Real Estate': ['real_estate_agency'],
  Education: ['school', 'university'],
  Retail: ['clothing_store', 'shoe_store', 'furniture_store', 'electronics_store'],
  Hospitality: ['hotel', 'lodging'],
  Fitness: ['gym'],
  Legal: ['lawyer'],
  Automotive: ['car_dealer', 'car_repair', 'auto_parts_store'],
  'Beauty & Wellness': ['beauty_salon', 'hair_care', 'spa'],
};
