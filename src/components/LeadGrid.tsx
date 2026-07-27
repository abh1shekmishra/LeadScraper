'use client';

import { Loader2 } from 'lucide-react';
import { useLeadStore } from '@/store/useLeadStore';
import LeadCard from './LeadCard/LeadCard';

export default function LeadGrid() {
  const { leads, isLoading, error, filters, allFilteredOut, totalFetched } = useLeadStore();

  const hotCount = leads.filter((l) => l.qualification?.score === 'hot').length;
  const warmCount = leads.filter((l) => l.qualification?.score === 'warm').length;
  const reachedCount = leads.filter((l) => l.reachedOut).length;

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/50">
        <Loader2 className="w-8 h-8 animate-spin text-violet-300" />
        <p className="text-sm">Finding qualified leads and checking their websites...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
        <div className="w-12 h-12 rounded-full glass bg-rose-500/10 flex items-center justify-center">
          <span className="text-rose-300 text-xl">!</span>
        </div>
        <p className="text-sm font-medium text-white/80">Something went wrong</p>
        <p className="text-xs text-white/45 max-w-sm">{error}</p>
      </div>
    );
  }

  if (leads.length === 0) {
    if (allFilteredOut) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center text-3xl">
            🔍
          </div>
          <div>
            <p className="text-sm font-medium text-white/80">Found {totalFetched} businesses but none matched your filters</p>
            <p className="text-xs text-white/45 mt-1 max-w-sm">
              All {totalFetched} businesses in this area passed the filters out. Try:
            </p>
            <ul className="text-xs text-white/45 mt-2 space-y-1">
              <li>→ Turn off &quot;No website only&quot; to see all leads</li>
              <li>→ Lower the minimum reviews filter</li>
              <li>→ Try a different city or industry</li>
            </ul>
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
        <div className="w-16 h-16 rounded-2xl glass glass-hi flex items-center justify-center text-3xl">
          🎯
        </div>
        <div>
          <p className="text-sm font-medium text-white/80">Ready to find leads</p>
          <p className="text-xs text-white/45 mt-1">
            Search a business type and city to find qualified potential clients
          </p>
          <p className="text-xs text-white/30 mt-3 max-w-xs">
            Tip: try a service business like &quot;dentists in Pune&quot; or &quot;salons in Mumbai&quot;
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Stats bar */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <p className="text-sm text-white/55">
          <span className="text-white font-semibold">{leads.length} qualified leads</span>
          {totalFetched > leads.length && (
            <span className="text-white/35"> (from {totalFetched} scanned)</span>
          )}
        </p>
        {hotCount > 0 && (
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-400/30 text-rose-200">
            🔥 {hotCount} hot
          </span>
        )}
        {warmCount > 0 && (
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200">
            ⚡ {warmCount} warm
          </span>
        )}
        {reachedCount > 0 && (
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-400/15 border border-emerald-400/30 text-emerald-200">
            ✓ {reachedCount} reached
          </span>
        )}
        {filters.noWebsiteOnly && (
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-400/15 border border-sky-400/30 text-sky-200">
            No website filter active
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}
