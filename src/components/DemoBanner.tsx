// Shown only on the public demo deployment (NEXT_PUBLIC_DEMO_MODE=1). It's here
// for the same reason the tool never makes an unprovable claim: be upfront that
// this is curated sample data, not live Google/Claude results.
export default function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== '1') return null;

  return (
    <div className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-center text-xs text-amber-300">
      <span className="font-semibold">Demo mode</span> — sample leads scored by the
      real pipeline. No live Google Places or Claude calls. Search runs on curated
      data; try toggling <span className="font-medium">Website / AR / Mobile App</span> to
      see the pitch angle change.
    </div>
  );
}
