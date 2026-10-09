"use client";

// Loading skeleton (identical on server and client: useAppState() is null until mounted), not-found,
// deleted-record and signed-out states for the people screens. The backend error state is the
// shared one (`BackendErrorState`).

import { ArrowLeft, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { SignedOutState } from "@/components/ui/signed-out-state";
import { StatGrid } from "@/components/ui/stat-tile";
import { RETENTION } from "@/lib/labels";
import { Breadcrumbs, ButtonLink, Skeleton } from "./ui";

export function DetailSkeleton() {
  return (
    <PageContainer>
      <div aria-busy="true" aria-label="Loading">
        <Skeleton className="h-3 w-48" />
        <div className="mt-4 mb-6 flex items-start gap-3">
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-64 max-w-full" />
            <Skeleton className="h-3.5 w-96 max-w-full" />
            <Skeleton className="h-3.5 w-40" />
          </div>
        </div>
        <StatGrid>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl bg-white p-4 shadow-xs ring-1 ring-zinc-200">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-7 w-12" />
              <Skeleton className="mt-3 h-1.5 w-full" />
            </div>
          ))}
        </StatGrid>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-xl border border-zinc-200 bg-white">
                <div className="border-b border-zinc-100 px-4 py-3">
                  <Skeleton className="h-4 w-40" />
                </div>
                <div className="space-y-3 px-4 py-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
              <Skeleton className="h-4 w-28" />
              <div className="mt-4 space-y-3">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3.5 w-3/5" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

export function NotFoundState({ title, children, backHref, backLabel }: { title: string; children: ReactNode; backHref: string; backLabel: string }) {
  return (
    <PageContainer>
      <div className="mx-auto mt-10 max-w-md rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center shadow-xs">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <SearchX className="size-5" />
        </div>
        <h1 className="mt-3 text-base font-semibold text-zinc-900">{title}</h1>
        <div className="mt-1.5 text-sm leading-6 text-zinc-500">{children}</div>
        <ButtonLink href={backHref} variant="secondary" icon={<ArrowLeft />} className="mt-5">
          {backLabel}
        </ButtonLink>
      </div>
    </PageContainer>
  );
}

/** A Candidate record that is not (or no longer) stored: the retention and deletion rules. */
export function CandidateGoneState() {
  return (
    <NotFoundState title="This Candidate is no longer stored" backHref="/feed?tab=candidates" backLabel="Back to the Feed">
      Candidates never Contacted are deleted {RETENTION.surfacedCandidateDays} days after being Surfaced, and Contacted Candidates without Consent{" "}
      {RETENTION.contactedNoConsentDays} days after the first email; the Talent Pool keeps them {RETENTION.talentPoolYears} years from their choice. An Opt-out or a
      request to delete their data deletes them immediately, and only a hash stays on the Suppression List.
    </NotFoundState>
  );
}

/** No Workspace yet (New user scenario): the page's header, then the shared signed-out state. */
export function PersonSignedOutState({ kind }: { kind: "prospect" | "candidate" }) {
  const prospect = kind === "prospect";
  return (
    <PageContainer>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Feed", href: "/feed" }, { label: prospect ? "Prospects" : "Candidates" }]} />
      </div>
      <PageHeader title={prospect ? "Prospect" : "Candidate"} />
      <SignedOutState
        what={prospect ? "see the Prospects the Prospection Agent finds for your Niches" : "see the Candidates the Sourcing Agent finds for your Niches"}
      />
    </PageContainer>
  );
}
