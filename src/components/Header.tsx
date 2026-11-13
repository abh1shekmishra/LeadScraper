export default function Header() {
  return (
    <header className="h-14 glass border-b border-white/10 flex items-center px-6 gap-3 flex-shrink-0">
      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
        <span className="text-white font-black text-xs">LS</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-bold text-white">LeadScraper</span>
        <span className="text-white/30 text-xs">/</span>
        <span className="text-xs text-white/50 font-medium">AI lead gen</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <a href="/activity" className="text-xs text-indigo-300 hover:underline mr-3">Activity</a>
        <a href="/queue" className="text-xs text-indigo-300 hover:underline mr-3">Approval queue</a>
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow shadow-emerald-400/50" />
        <span className="text-xs text-white/40">Local</span>
      </div>
    </header>
  );
}
