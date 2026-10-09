"use client";

// The next Test Run, worded from state on every setup screen: the free Test Run while the free trial's
// Main Domains have not used it, otherwise a Test Run paid in Credits (ADR-0018). Same rule as the
// Test Run card on /niches/[id], so no screen promises a free Test Run the Workspace no longer has.

import { FlaskConical } from "lucide-react";
import { formatCreditsLabel } from "@/lib/format";
import { PAID_TEST_RUN_COST, PRICES } from "@/lib/pricing";
import type { ClientState } from "@/lib/types";
import { PriceHint } from "@/components/ui/price-hint";

/** Upper bound of a paid Test Run: 10 Prospects, 10 Candidates, up to 2 Hiring Contacts per Prospect. */
export const PAID_TEST_RUN_MAX = PAID_TEST_RUN_COST + 10 * 2 * PRICES.hiringContactFound;

export interface NextTestRun {
  /** The free Test Run: 0 Credits, Hiring Contacts and Candidates as Previews. */
  free: boolean;
  /** Free trial whose Main Domain already used its free Test Run: Credits come before any Test Run. */
  needsCredits: boolean;
  /** The Main Domain that used the free Test Run, which is why the next one costs Credits. */
  usedBy: string | null;
}

export function nextTestRun(state: ClientState): NextTestRun {
  const trial = state.derived.isFreeTrial;
  const free = trial && state.derived.freeTestRunAvailable;
  return { free, needsCredits: trial && !free, usedBy: state.workspace?.freeTestRunUsedBy ?? null };
}

/** "up to 40 Credits" and its placeholder price hint, the amount never split from its hint. */
export function PaidTestRunCost() {
  return (
    <>
      up to{" "}
      <span className="whitespace-nowrap">
        {formatCreditsLabel(PAID_TEST_RUN_MAX)} <PriceHint />
      </span>
    </>
  );
}

/**
 * Ends a sentence after "then": "launch your free Test Run.", or "run a Test Run: x.fr already used
 * its free one, so it costs up to 40 Credits" with the placeholder price hint.
 */
export function TestRunNextStep({ next }: { next: NextTestRun }) {
  if (next.free) return <>launch your free Test Run.</>;
  if (!next.usedBy) {
    return (
      <>
        run a Test Run, <PaidTestRunCost />
      </>
    );
  }
  return (
    <>
      run a Test Run: <span className="font-medium [overflow-wrap:anywhere]">{next.usedBy}</span> already used its free one, so it costs <PaidTestRunCost />
    </>
  );
}

/** The drafted Niche Profile panel's last line: what the next Test Run costs. */
export function NextTestRunNote({ next }: { next: NextTestRun }) {
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[11px] text-zinc-500">
      <FlaskConical className="size-3" aria-hidden />
      {next.free ? (
        <span>Next: your free Test Run, 0&nbsp;Credits</span>
      ) : (
        <>
          <span>Next: a Test Run, up to {formatCreditsLabel(PAID_TEST_RUN_MAX)}</span>
          <PriceHint />
        </>
      )}
    </p>
  );
}
