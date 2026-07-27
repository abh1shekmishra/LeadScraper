'use client';

import { Sparkles, Loader2, Info } from 'lucide-react';
import { useLeadStore } from '@/store/useLeadStore';
import { ALL_SERVICE_TYPES, ServiceType, WEBSITE_SERVICES } from '@/types/filters';
import { clsx } from 'clsx';

const MIN_REVIEW_OPTIONS = [0, 10, 25, 50, 100, 200];

export default function FilterPanel() {
  const {
    filters,
    toggleServiceType,
    setFilters,
    fetchSuggestions,
    suggestions,
    isFetchingSuggestions,
  } = useLeadStore();

  const wantsWebsite = filters.serviceTypes.some((s) => WEBSITE_SERVICES.includes(s));

  return (
    <aside className="w-72 flex-shrink-0 glass border-r border-white/10 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-5 space-y-6 pb-2">

        {/* Service Types */}
        <section>
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-1">
            What are you pitching?
          </h3>
          <p className="text-xs text-white/35 mb-3">Used to personalise outreach messages</p>
          <div className="flex flex-wrap gap-2">
            {ALL_SERVICE_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggleServiceType(type)}
                className={clsx(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                  filters.serviceTypes.includes(type)
                    ? 'bg-gradient-to-r from-indigo-500 to-violet-500 border-transparent text-white shadow-lg shadow-violet-500/20'
                    : 'glass text-white/65 hover:text-white hover:border-white/25',
                )}
              >
                {type}
              </button>
            ))}
          </div>

          {filters.serviceTypes.some((s) => ['AR', 'VR'].includes(s)) && (
            <div className="mt-3 flex gap-2 bg-amber-400/10 border border-amber-400/20 rounded-xl px-3 py-2">
              <Info className="w-3.5 h-3.5 text-amber-300 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90">
                Search for Real Estate, Education, Retail, or Hospitality, best fit for AR/VR pitches.
              </p>
            </div>
          )}
          {wantsWebsite && (
            <div className="mt-3 flex gap-2 bg-sky-400/10 border border-sky-400/20 rounded-xl px-3 py-2">
              <Info className="w-3.5 h-3.5 text-sky-300 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-sky-200/90">
                Enable &quot;No website only&quot; below to see only businesses with zero web presence.
              </p>
            </div>
          )}
        </section>

        {/* AI Suggestions */}
        {filters.serviceTypes.length > 0 && (
          <section>
            <button
              onClick={fetchSuggestions}
              disabled={isFetchingSuggestions}
              className="flex items-center gap-2 text-xs text-violet-300 hover:text-violet-200 disabled:opacity-40 transition-colors"
            >
              {isFetchingSuggestions ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              AI: What should I search for?
            </button>

            {suggestions.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-white/35">Click to use as search query</p>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const store = useLeadStore.getState();
                      const q = `${s.industry} in ${filters.location.city || 'your city'}`;
                      store.textSearch(q);
                      store.setSearchQuery(q);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl glass glass-hover group"
                  >
                    <span className="text-xs font-medium text-white/80 group-hover:text-white block">
                      {s.industry}
                    </span>
                    <span className="text-xs text-white/40">{s.reason}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Lead Quality */}
        <section>
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">
            Lead Quality Filters
          </h3>
          <div className="space-y-4">

            {/* No website toggle */}
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={filters.noWebsiteOnly}
                  onChange={(e) => setFilters({ noWebsiteOnly: e.target.checked })}
                  className="sr-only"
                />
                <div className={clsx(
                  'w-9 h-5 rounded-full transition-colors',
                  filters.noWebsiteOnly ? 'bg-gradient-to-r from-indigo-500 to-violet-500' : 'bg-white/15',
                )}>
                  <div className={clsx(
                    'w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform',
                    filters.noWebsiteOnly ? 'translate-x-4' : 'translate-x-0.5',
                  )} />
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-white/80">No website only</span>
                <p className="text-xs text-white/40 mt-0.5">Only businesses with zero web presence</p>
              </div>
            </label>

            {/* Min reviews */}
            <div>
              <p className="text-xs text-white/50 mb-2">Min. Google reviews</p>
              <div className="flex gap-1.5 flex-wrap">
                {MIN_REVIEW_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setFilters({ minReviews: r })}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                      filters.minReviews === r
                        ? 'bg-gradient-to-r from-indigo-500 to-violet-500 border-transparent text-white'
                        : 'glass text-white/65 hover:text-white hover:border-white/25',
                    )}
                  >
                    {r === 0 ? 'Any' : `${r}+`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

      </div>

      <div className="p-4 border-t border-white/10">
        <p className="text-xs text-white/35 text-center">
          Use the search bar above to find leads globally
        </p>
      </div>
    </aside>
  );
}
