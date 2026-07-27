'use client';

import Header from '@/components/Header';
import FilterPanel from '@/components/FilterPanel/FilterPanel';
import LeadGrid from '@/components/LeadGrid';
import SearchBar from '@/components/SearchBar';
import DemoBanner from '@/components/DemoBanner';

export default function Home() {
  return (
    <div className="flex flex-col h-full">
      <DemoBanner />
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <FilterPanel />
        <main className="flex-1 overflow-hidden flex flex-col">
          <SearchBar />
          <LeadGrid />
        </main>
      </div>
    </div>
  );
}
