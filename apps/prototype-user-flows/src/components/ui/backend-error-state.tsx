"use client";

// Shown instead of a page's content when the dummy backend does not answer (the state keeps polling).

import { CircleAlert, RotateCcw } from "lucide-react";
import { PageContainer } from "@/components/shell/page";
import { refetch } from "@/lib/api";

export function BackendErrorState({ error }: { error: string }) {
  return (
    <PageContainer>
      <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-rose-950">The dummy backend did not answer</p>
            <p className="mt-0.5 text-zinc-600">{error} The page keeps retrying every 2 seconds.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 shadow-xs hover:bg-zinc-50 sm:self-auto"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Try again
        </button>
      </div>
    </PageContainer>
  );
}
