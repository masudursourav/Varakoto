/** Pulse placeholder block — all skeletons are built from this. */
function Bone({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200 dark:bg-slate-700 ${className}`}
    />
  );
}

/**
 * Skeleton for the home search card (two stop fields + swap + CTA).
 * Matches the layout produced by StopAutocomplete × 2, the swap
 * button, the calculate button, and the stop-count footer.
 */
export function SearchCardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Origin field */}
      <div>
        <Bone className="mb-2 h-3 w-16" />
        <div className="flex items-center border-b-2 border-slate-100 py-2 dark:border-slate-700">
          <Bone className="mr-3 h-5 w-5 shrink-0 rounded-full" />
          <Bone className="h-5 w-40" />
        </div>
        {/* Locate me button placeholder */}
        <Bone className="mt-2 h-10 w-full rounded-panel" />
      </div>

      {/* Swap button */}
      <div className="flex justify-center">
        <Bone className="h-9 w-9 rounded-full" />
      </div>

      {/* Destination field */}
      <div>
        <Bone className="mb-2 h-3 w-20" />
        <div className="flex items-center border-b-2 border-slate-100 py-2 dark:border-slate-700">
          <Bone className="mr-3 h-5 w-5 shrink-0 rounded-full" />
          <Bone className="h-5 w-36" />
        </div>
      </div>

      {/* Calculate button */}
      <Bone className="mt-2 h-14 w-full rounded-card" />

      {/* Stop count */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        <Bone className="h-3 w-32" />
      </div>
    </div>
  );
}

/**
 * Single fare-result-card ghost.
 * Mirrors the card body: title row, route subtitle, distance line,
 * fare badge on the right, and the footer bar.
 */
function FareCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between p-4">
        {/* Left: bus name, route, distance */}
        <div className="min-w-0 flex-1 space-y-2">
          <Bone className="h-5 w-32" />
          <Bone className="h-3 w-48" />
          <Bone className="mt-1 h-3 w-24" />
        </div>

        {/* Right: fare badge */}
        <div className="ml-4 flex flex-col items-center rounded-panel px-4 py-3">
          <Bone className="mb-1.5 h-7 w-14" />
          <Bone className="h-4 w-20 rounded" />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/50">
        <Bone className="h-3 w-28" />
        <Bone className="h-3 w-16" />
      </div>
    </div>
  );
}

/**
 * Skeleton for the results page — renders 3 ghost fare cards.
 */
export function ResultsSkeleton() {
  return (
    <div className="space-y-4">
      <FareCardSkeleton />
      <FareCardSkeleton />
      <FareCardSkeleton />
    </div>
  );
}
