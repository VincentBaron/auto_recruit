"use client";

// Setup-area building blocks: Niche status badge, onboarding steps, signed-out state, provider marks.

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { NICHE_STATUS_LABELS } from "@/lib/labels";
import type { AuthProvider, NicheStatus } from "@/lib/types";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { SignedOutState } from "@/components/ui/signed-out-state";
import { StatGrid } from "@/components/ui/stat-tile";
import { Badge, Skeleton, cx, type Tone } from "./ui";

const NICHE_STATUS_TONES: Record<NicheStatus, Tone> = {
  draft: "zinc",
  testing: "sky",
  active: "emerald",
  paused: "amber",
};

export function NicheStatusBadge({ status }: { status: NicheStatus }) {
  return (
    <Badge tone={NICHE_STATUS_TONES[status]} dot>
      {NICHE_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * The new-user path, from Niche setup to switching the agents on. `current` is the index of the active step.
 * `freeTestRun` names the third step "Free Test Run", or "Test Run" once the Main Domain used its free one.
 * From sm: every step as a pill. Below sm: "Step 1 of 5 - Describe your Niche" and a progress bar.
 */
export function OnboardingSteps({ current, done = [], freeTestRun }: { current: number; done?: number[]; freeTestRun: boolean }) {
  const steps = ["Describe your Niche", "Review Niche Profile", freeTestRun ? "Free Test Run" : "Test Run", "Buy Credits", "Switch agents on"];
  const isDone = (i: number) => i !== current && (i < current || done.includes(i));
  return (
    <nav aria-label="Getting started" className="mb-6">
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="text-zinc-500 tabular-nums">
            Getting started · Step {current + 1} of {steps.length}
          </span>
          <span className="truncate font-medium text-zinc-800">{steps[current]}</span>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden>
          {steps.map((label, i) => (
            <span key={label} className={cx("h-1.5 flex-1 rounded-full", i === current ? "bg-indigo-600" : isDone(i) ? "bg-emerald-500" : "bg-zinc-200")} />
          ))}
        </div>
      </div>
      <ol className="hidden flex-wrap items-center gap-x-1 gap-y-2 text-xs sm:flex">
        {steps.map((label, i) => {
          const isCurrent = i === current;
          return (
            <li key={label} className="flex items-center gap-1">
              <span
                className={cx(
                  "inline-flex h-6 items-center gap-1.5 rounded-full pl-1 pr-2.5 font-medium",
                  isCurrent ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200" : isDone(i) ? "text-zinc-700" : "text-zinc-400",
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span
                  className={cx(
                    "inline-flex size-4 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                    isCurrent ? "bg-indigo-600 text-white" : isDone(i) ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-500",
                  )}
                >
                  {isDone(i) ? <Check className="size-2.5" strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                {label}
              </span>
              {i < steps.length - 1 ? <span className="h-px w-3 bg-zinc-300 sm:w-5" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Signed out (New user scenario): the page's normal header, then core's "No Workspace yet" state. */
export function NotSignedIn({ eyebrow, title, description, what }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; what: string }) {
  return (
    <PageContainer>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <SignedOutState what={what} />
    </PageContainer>
  );
}

/** Same markup on server and client while `useAppState()` is still null. */
export function PageSkeleton({ variant = "detail" }: { variant?: "detail" | "list" | "split" }) {
  return (
    <PageContainer>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-72 max-w-full" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>
      {variant === "list" ? (
        <div className="space-y-6">
          <StatGrid>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[6.5rem] rounded-xl" />
            ))}
          </StatGrid>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : variant === "split" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[520px]" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Skeleton className="h-56" />
            <Skeleton className="h-40" />
            <Skeleton className="h-72" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-44" />
            <Skeleton className="h-64" />
          </div>
        </div>
      )}
    </PageContainer>
  );
}

/** Generic sign-in marks (simple glyphs, not official artwork). */
export function ProviderMark({ provider, className }: { provider: AuthProvider; className?: string }) {
  if (provider === "microsoft") {
    return (
      <svg viewBox="0 0 16 16" className={cx("size-4", className)} aria-hidden>
        <rect x="1" y="1" width="6.5" height="6.5" fill="#f25022" />
        <rect x="8.5" y="1" width="6.5" height="6.5" fill="#7fba00" />
        <rect x="1" y="8.5" width="6.5" height="6.5" fill="#00a4ef" />
        <rect x="8.5" y="8.5" width="6.5" height="6.5" fill="#ffb900" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className={cx("size-4", className)} aria-hidden>
      <path d="M15.2 8.2c0-.5 0-1-.1-1.5H8v2.9h4.1a3.5 3.5 0 0 1-1.5 2.3v1.9h2.4c1.4-1.3 2.2-3.2 2.2-5.6Z" fill="#4285f4" />
      <path d="M8 15.5c2 0 3.7-.7 5-1.8l-2.4-1.9c-.7.5-1.5.7-2.6.7-2 0-3.6-1.3-4.2-3.1H1.3v1.9A7.5 7.5 0 0 0 8 15.5Z" fill="#34a853" />
      <path d="M3.8 9.4a4.5 4.5 0 0 1 0-2.8V4.7H1.3a7.5 7.5 0 0 0 0 6.6l2.5-1.9Z" fill="#fbbc05" />
      <path d="M8 3.5c1.1 0 2.1.4 2.9 1.1l2.1-2.1A7.5 7.5 0 0 0 1.3 4.7l2.5 1.9C4.4 4.8 6 3.5 8 3.5Z" fill="#ea4335" />
    </svg>
  );
}

export const PROVIDER_NAMES: Record<AuthProvider, string> = {
  google: "Google",
  microsoft: "Microsoft",
};

export function ProductMark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight text-zinc-900", className)}>
      <span className="inline-flex size-6 items-center justify-center rounded-md bg-indigo-600 text-[11px] font-bold text-white">AR</span>
      Auto Recruit
    </span>
  );
}
