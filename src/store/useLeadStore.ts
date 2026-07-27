import { create } from 'zustand';
import { Lead, AISuggestion } from '@/types/lead';
import { FilterState, ServiceType, Industry } from '@/types/filters';

// Reached-out leads persist across searches (by placeId === lead.id) in localStorage,
// so a business you've already contacted shows "Reached out" even on a fresh search.
const REACHED_KEY = 'leadscraper:reached';

function loadReached(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(REACHED_KEY) ?? '[]'); } catch { return []; }
}
function saveReached(ids: string[]) {
  if (typeof window !== 'undefined') localStorage.setItem(REACHED_KEY, JSON.stringify(ids));
}
function hydrateReached(leads: Lead[], reachedIds: string[]): Lead[] {
  const set = new Set(reachedIds);
  return leads.map((l) => ({ ...l, reachedOut: set.has(l.id) }));
}

interface LeadStore {
  filters: FilterState;
  searchQuery: string;
  leads: Lead[];
  isLoading: boolean;
  error: string | null;
  allFilteredOut: boolean;
  totalFetched: number;
  suggestions: AISuggestion[];
  isFetchingSuggestions: boolean;

  setFilters: (patch: Partial<FilterState>) => void;
  setSearchQuery: (q: string) => void;
  toggleServiceType: (type: ServiceType) => void;
  toggleIndustry: (industry: Industry) => void;

  textSearch: (query: string) => Promise<void>;
  generateLeads: () => Promise<void>;
  enrichLeadEmail: (leadId: string) => Promise<void>;
  generateOutreach: (leadId: string) => Promise<void>;
  updateLead: (leadId: string, patch: Partial<Lead>) => void;
  clearLeads: () => void;
  fetchSuggestions: () => Promise<void>;

  reachedIds: string[];
  markReached: (leadId: string) => void;
}

export const useLeadStore = create<LeadStore>((set, get) => ({
  filters: {
    serviceTypes: ['Website'],
    industries: [],
    location: { city: '', state: '', country: '' },
    radiusKm: 10,
    noWebsiteOnly: false,
    minReviews: 0,
  },
  searchQuery: '',
  leads: [],
  isLoading: false,
  error: null,
  allFilteredOut: false,
  totalFetched: 0,
  suggestions: [],
  isFetchingSuggestions: false,
  reachedIds: loadReached(),

  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  setSearchQuery: (q) => set({ searchQuery: q }),

  toggleServiceType: (type) =>
    set((s) => ({
      filters: {
        ...s.filters,
        serviceTypes: s.filters.serviceTypes.includes(type)
          ? s.filters.serviceTypes.filter((t) => t !== type)
          : [...s.filters.serviceTypes, type],
      },
    })),

  toggleIndustry: (industry) =>
    set((s) => ({
      filters: {
        ...s.filters,
        industries: s.filters.industries.includes(industry)
          ? s.filters.industries.filter((i) => i !== industry)
          : [...s.filters.industries, industry],
      },
    })),

  // --- Text Search (primary) ---
  textSearch: async (query) => {
    set({ isLoading: true, error: null, leads: [], allFilteredOut: false, totalFetched: 0, searchQuery: query });
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, filters: get().filters }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      set({ leads: hydrateReached(data.leads, get().reachedIds), allFilteredOut: data.allFilteredOut ?? false, totalFetched: data.total ?? 0 });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      set({ isLoading: false });
    }
  },

  // --- Filter-based search (advanced, via filter panel) ---
  generateLeads: async () => {
    set({ isLoading: true, error: null, leads: [], allFilteredOut: false, totalFetched: 0 });
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: get().filters }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch leads');
      set({ leads: hydrateReached(data.leads, get().reachedIds), allFilteredOut: data.allFilteredOut ?? false, totalFetched: data.total ?? 0 });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      set({ isLoading: false });
    }
  },

  enrichLeadEmail: async (leadId) => {
    const lead = get().leads.find((l) => l.id === leadId);
    if (!lead) return;
    get().updateLead(leadId, { isEnrichingEmail: true });
    try {
      const res = await fetch('/api/enrich-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: lead.business.website }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Enrichment failed');
      get().updateLead(leadId, { email: data.email, isEnrichingEmail: false });
    } catch {
      get().updateLead(leadId, { isEnrichingEmail: false });
    }
  },

  generateOutreach: async (leadId) => {
    const lead = get().leads.find((l) => l.id === leadId);
    if (!lead) return;
    get().updateLead(leadId, { isGeneratingOutreach: true });
    try {
      const res = await fetch('/api/generate-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: lead.business,
          serviceTypes: get().filters.serviceTypes,
          qualification: lead.qualification,
          siteHealth: lead.siteHealth,
          competitorNote: lead.competitorNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      get().updateLead(leadId, { outreach: data.outreach, isGeneratingOutreach: false });
    } catch {
      get().updateLead(leadId, { isGeneratingOutreach: false });
    }
  },

  updateLead: (leadId, patch) =>
    set((s) => ({ leads: s.leads.map((l) => (l.id === leadId ? { ...l, ...patch } : l)) })),

  markReached: (leadId) => {
    const reachedIds = [...new Set([...get().reachedIds, leadId])];
    saveReached(reachedIds);
    set((s) => ({
      reachedIds,
      leads: s.leads.map((l) => (l.id === leadId ? { ...l, reachedOut: true } : l)),
    }));
  },

  clearLeads: () => set({ leads: [], error: null, allFilteredOut: false, totalFetched: 0 }),

  fetchSuggestions: async () => {
    const { filters } = get();
    if (filters.serviceTypes.length === 0) return;
    set({ isFetchingSuggestions: true, suggestions: [] });
    try {
      const res = await fetch('/api/ai-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceTypes: filters.serviceTypes, existingIndustries: filters.industries }),
      });
      const data = await res.json();
      if (res.ok) set({ suggestions: data.suggestions ?? [] });
    } catch {
      // silently fail
    } finally {
      set({ isFetchingSuggestions: false });
    }
  },
}));
