'use client';

import { useState, useRef } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { useLeadStore } from '@/store/useLeadStore';

const EXAMPLES = [
  'interior designers in Dubai',
  'restaurants without website in Mumbai',
  'real estate agencies in Bangalore',
  'gyms in Hyderabad',
  'hotels in Goa',
  'car dealers in Delhi',
];

export default function SearchBar() {
  const { textSearch, isLoading, searchQuery, setSearchQuery } = useLeadStore();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (q?: string) => {
    const query = q ?? searchQuery;
    if (!query.trim() || isLoading) return;
    textSearch(query.trim());
    setFocused(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') setFocused(false);
  };

  return (
    <div className="px-6 py-4">
      <div className="relative max-w-2xl">
        <div className="flex items-center gap-3 glass glass-hi rounded-2xl px-4 py-3 focus-within:border-violet-400/50 transition-colors">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-violet-300 animate-spin flex-shrink-0" />
          ) : (
            <Search className="w-4 h-4 text-white/40 flex-shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="interior designers in Dubai, restaurants in Mumbai..."
            className="flex-1 bg-transparent text-white placeholder-white/35 text-sm focus:outline-none"
            disabled={isLoading}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-white/35 hover:text-white/70 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => handleSubmit()}
            disabled={!searchQuery.trim() || isLoading}
            className="px-4 py-1.5 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:opacity-40 disabled:from-white/10 disabled:to-white/10 text-white text-xs font-semibold rounded-xl transition-all flex-shrink-0 shadow-lg shadow-violet-500/20"
          >
            Search
          </button>
        </div>

        {/* Example queries dropdown */}
        {focused && !searchQuery && (
          <div className="absolute top-full left-0 right-0 mt-2 glass-strong glass-hi rounded-2xl overflow-hidden z-10 animate-fade">
            <p className="px-4 py-2 text-xs text-white/40 border-b border-white/10">Try searching for</p>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onMouseDown={() => {
                  setSearchQuery(ex);
                  handleSubmit(ex);
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-3"
              >
                <Search className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
