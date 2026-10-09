// Loading skeleton: identical on the server and on the first client render (no state, no time).
// Same frame as the Feed (PageContainer, PageHeader spacing), so nothing jumps when the state lands.

import { PageContainer } from "@/components/shell/page";

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200/70 ${className}`} />;
}

export function FeedSkeleton() {
  return (
    <PageContainer width="wide">
      <div aria-busy="true" aria-label="Loading the Feed">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2.5">
            <Bar className="h-6 w-20" />
            <Bar className="h-4 w-[30rem] max-w-full" />
          </div>
          <Bar className="h-4 w-56" />
        </div>
        <div className="flex gap-5 border-b border-zinc-200 pb-2.5">
          <Bar className="h-5 w-28" />
          <Bar className="h-5 w-32" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Bar className="h-8 w-full sm:w-[300px]" />
          <Bar className="h-8 min-w-0 flex-1 sm:max-w-[280px]" />
          <div className="hidden flex-1 sm:block" />
          <Bar className="h-8 w-36" />
        </div>
        <Bar className="mt-3 mb-3 h-4 w-[36rem] max-w-full" />
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
          <div className="flex items-center gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
            <Bar className="h-3 w-4" />
            <Bar className="h-3 w-40" />
            <div className="flex-1" />
            <Bar className="hidden h-3 w-24 md:block" />
            <Bar className="hidden h-3 w-12 md:block" />
          </div>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-center gap-4 border-b border-zinc-100 px-4 py-3 last:border-b-0">
              <Bar className="h-4 w-4" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Bar className="h-3.5 w-48 max-w-full" />
                <Bar className="h-3 w-72 max-w-full" />
              </div>
              <Bar className="hidden h-3 w-24 md:block" />
              <Bar className="hidden h-3 w-24 md:block" />
              <Bar className="hidden h-5 w-32 lg:block" />
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
