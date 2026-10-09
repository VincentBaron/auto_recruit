"use client";

// The Feed: Surfaced Prospects and Candidates across the Recruiter's Niches, ranked by Signal
// Strength among items above the Fit threshold (ADR-0006). Three structurally different variants
// via `?variant=`: A Table, B Split, C Triage. Tab, Niche and view live in the URL too.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building, CircleAlert, Lock, Radar, SearchX, Sparkles, User } from "lucide-react";
import { clearChatSelection, setChatSelection } from "@/components/chat/selection";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { VariantSwitcher } from "@/components/shell/variant-switcher";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import { SignedOutState } from "@/components/ui/signed-out-state";
import { act, useAppState, useBackendError } from "@/lib/api";
import { formatRelative, plural } from "@/lib/format";
import type { ActionName, ActionPayload, ActionResult, FeedItemRef, Niche, PersonRef } from "@/lib/types";
import { type EnrichRequest, FeedContext, type FeedApi, type ToastInput } from "./context";
import { AddToCampaignDialog, DismissDialog, EnrichDialog } from "./dialogs";
import { shouldIgnoreShortcut } from "./keys";
import {
  type FeedModel,
  type FeedSort,
  type FeedTab,
  type FeedView,
  buildModel,
  compareIsoDates,
  feedCounts,
  feedRows,
  nicheName,
  nichesInScope,
  nichesWithItems,
  parseTab,
  parseVariant,
  parseView,
  readyNiches,
  rowKey,
  stoppedLastRuns,
  unfinishedNiche,
  VARIANTS,
} from "./model";
import { SelectionBar } from "./selection-bar";
import { FeedSkeleton } from "./skeleton";
import { ToastViewport, useToasts } from "./toasts";
import { FeedTabs, NicheSelect, RankingCaption, SearchInput, ViewToggle } from "./toolbar";
import { Button, ButtonLink, EmptyState } from "./ui";
import { SplitVariant } from "./variant-split";
import { TableVariant } from "./variant-table";
import { TriageVariant } from "./variant-triage";

type DialogState =
  | { kind: "enrich"; id: number; request: EnrichRequest }
  | { kind: "dismiss"; id: number; items: FeedItemRef[]; onDone?: () => void }
  | { kind: "add"; id: number; people: PersonRef[] }
  | null;

export function FeedScreen() {
  const state = useAppState();
  const backendError = useBackendError();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const variant = parseVariant(params.get("variant"));
  const tab = parseTab(params.get("tab"));
  const view = parseView(params.get("view"));
  const nicheParam = params.get("niche") ?? "all";

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<FeedSort>("signal");
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const dialogSeq = useRef(0);
  const { toasts, notify, dismiss: dismissToast } = useToasts();

  const model = useMemo(() => (state ? buildModel(state) : null), [state]);
  // An unknown Niche, or an unfinished draft (nothing to show yet), falls back to all Niches.
  const niche = model && nicheParam !== "all" && nicheParam !== "mine" && !model.nicheById.get(nicheParam)?.setupComplete ? "all" : nicheParam;

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      if (!next.get("variant")) next.set("variant", variant);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router, variant],
  );

  const clearSelection = useCallback(() => setSelection(new Set()), []);
  const onSelect = useCallback((keys: string[], on: boolean) => {
    setSelection((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }, []);

  // Escape clears the selection (dialogs handle their own Escape).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !shouldIgnoreShortcut(e)) setSelection(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Publish the selection to the Ask panel, so "enrich these 5" acts on the ticked rows.
  useEffect(() => {
    const refs: FeedItemRef[] = [];
    for (const key of selection) {
      const [kind, id] = key.split(":");
      if ((kind === "prospect" || kind === "candidate") && id) refs.push({ kind, id });
    }
    setChatSelection(refs);
  }, [selection]);
  useEffect(() => () => clearChatSelection(), []);

  const api: FeedApi | null = useMemo(() => {
    if (!model) return null;
    async function run<K extends ActionName>(name: K, payload: ActionPayload<K>): Promise<ActionResult<K> | null> {
      const res = await act(name, payload);
      if (!res.ok) {
        notify({ tone: "danger", title: "That did not work", description: res.error });
        return null;
      }
      return res.result;
    }
    const nextId = () => {
      dialogSeq.current += 1;
      return dialogSeq.current;
    };
    return {
      model,
      run,
      notify: (t: ToastInput) => notify(t),
      openEnrich: (request) => setDialog({ kind: "enrich", id: nextId(), request }),
      openDismiss: (items, onDone) => setDialog({ kind: "dismiss", id: nextId(), items, onDone }),
      openAddToCampaign: (people) => setDialog({ kind: "add", id: nextId(), people }),
      restore: async (items) => {
        const res = await run("undismiss", { items });
        if (res) notify({ tone: "success", title: `${plural(res.restored, "item")} restored to the Feed` });
      },
      markSeen: (prospectId) => {
        void run("markSignalsSeen", { prospectIds: [prospectId] });
      },
    };
  }, [model, notify]);

  if (!state || !model || !api) {
    return backendError ? <BackendErrorState error={backendError} /> : <FeedSkeleton />;
  }

  if (!state.workspace) {
    return (
      <PageContainer width="wide">
        <FeedHeader model={model} niches={[]} />
        <SignedOutState what="get a Feed of Prospects and Candidates ranked for your Niche" />
      </PageContainer>
    );
  }

  if (readyNiches(model).length === 0) {
    const draft = unfinishedNiche(model);
    return (
      <PageContainer width="wide">
        <FeedHeader model={model} niches={[]} />
        <div className="rounded-xl bg-white ring-1 ring-zinc-200">
          {draft ? (
            <EmptyState
              icon={<Radar className="size-5" aria-hidden />}
              title="Finish setting up your Niche"
              action={
                <ButtonLink href={`/onboarding/niche?niche=${draft.id}`} tone="primary">
                  Continue setup
                </ButtonLink>
              }
            >
              The agents fill your Feed once the Niche Profile is drafted: describe the placements you make, review the Niche Profile, then launch a Test
              Run.
            </EmptyState>
          ) : (
            <EmptyState
              icon={<Radar className="size-5" aria-hidden />}
              title="Set up your first Niche"
              action={
                <ButtonLink href="/onboarding/niche" tone="primary">
                  Set up a Niche
                </ButtonLink>
              }
            >
              The Feed ranks the Prospects and Candidates the agents find in your Niches. Describe the placements you make to get started.
            </EmptyState>
          )}
        </div>
      </PageContainer>
    );
  }

  const filters = { tab, niche, view, query, sort: variant === "A" ? sort : ("signal" as FeedSort) };
  const rows = feedRows(model, filters);
  const counts = feedCounts(model, niche);
  const tabNiches = nichesWithItems(model, tab);
  const dismissedCount = tab === "prospects" ? counts.dismissedProspects : counts.dismissedCandidates;
  const selectedIds = rows.filter((r) => r.kind !== "preview" && selection.has(rowKey(r))).map((r) => r.id);

  const switchTab = (t: FeedTab) => {
    clearSelection();
    setQuery("");
    // The Candidates table has no Surfaced column to show that order.
    if (t === "candidates" && sort === "surfaced") setSort("signal");
    setParam({ tab: t === "prospects" ? null : t });
  };
  const switchView = (v: FeedView) => {
    clearSelection();
    setParam({ view: v === "open" ? null : v });
  };

  return (
    <FeedContext.Provider value={api}>
      <PageContainer width="wide">
        <FeedHeader model={model} niches={nichesInScope(model, niche)} />
        {model.isFreeTrial ? <FreeTrialBanner /> : null}

        <div className="border-b border-zinc-200">
          <FeedTabs tab={tab} counts={counts} onTab={switchTab} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <NicheSelect
            model={model}
            niches={tabNiches}
            value={niche}
            onChange={(v) => {
              clearSelection();
              setParam({ niche: v === "all" ? null : v });
            }}
          />
          <SearchInput value={query} onChange={setQuery} placeholder={tab === "prospects" ? "Search Prospects" : "Search Candidates"} />
          <div className="ml-auto">
            <ViewToggle view={view} dismissedCount={dismissedCount} onView={switchView} />
          </div>
        </div>
        <div className="mt-3 mb-3">
          <RankingCaption niches={nichesInScope(model, niche, tabNiches)} variant={variant} />
        </div>

        {rows.length === 0 ? (
          <NoRows tab={tab} view={view} query={query} onClearQuery={() => setQuery("")} niche={niche} onAllNiches={() => setParam({ niche: null })} />
        ) : variant === "A" ? (
          <TableVariant rows={rows} tab={tab} view={view} selected={selection} onSelect={onSelect} sort={sort} onSort={setSort} />
        ) : variant === "B" ? (
          <SplitVariant rows={rows} selected={selection} onSelect={onSelect} />
        ) : (
          <TriageVariant key={`${tab}-${view}-${niche}`} rows={rows} tab={tab} view={view} />
        )}

        {variant !== "C" ? <SelectionBar tab={tab} view={view} selected={selectedIds} onClear={clearSelection} /> : null}
        {/* Room for the floating selection bar, so the last row can scroll clear of it. */}
        {variant !== "C" && selectedIds.length > 0 ? <div className="h-14" aria-hidden /> : null}
      </PageContainer>

      {dialog?.kind === "enrich" ? <EnrichDialog key={dialog.id} request={dialog.request} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "dismiss" ? <DismissDialog key={dialog.id} items={dialog.items} onDone={dialog.onDone} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "add" ? <AddToCampaignDialog key={dialog.id} people={dialog.people} onClose={() => setDialog(null)} /> : null}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <VariantSwitcher variants={VARIANTS} current={variant} label="Feed variant" />
    </FeedContext.Provider>
  );
}

const FEED_DESCRIPTION = "Surfaced Prospects and Candidates across your Niches, ranked by Signal Strength.";

/** The page header; `niches` are the ready Niches shown, for the agents' status line. */
function FeedHeader({ model, niches }: { model: FeedModel; niches: Niche[] }) {
  return <PageHeader title="Feed" description={FEED_DESCRIPTION} actions={niches.length > 0 ? <RunStatus model={model} niches={niches} /> : undefined} />;
}

/** "2 active Niches · agents last ran 3 days ago", and why the last run stopped when it did. */
function RunStatus({ model, niches }: { model: FeedModel; niches: Niche[] }) {
  const active = niches.filter((n) => n.status === "active").length;
  const lastRun = niches
    .map((n) => n.lastRunOn)
    .filter((d): d is string => Boolean(d))
    .sort(compareIsoDates)
    .pop();
  const stopped = stoppedLastRuns(model, niches);
  const reasons = Array.from(new Set(stopped.map((s) => s.reason)));
  return (
    <div className="flex flex-col gap-1 text-xs text-zinc-500 sm:items-end sm:text-right">
      <p>
        {plural(active, "active Niche")} · {lastRun ? `agents last ran ${formatRelative(lastRun, model.today)}` : "agents have not run yet"}
      </p>
      {reasons.length > 0 ? (
        <p className="flex items-center gap-1.5 text-rose-700" title={stopped.map((s) => `${nicheName(s.niche)}: ${s.reason}`).join("\n")}>
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          <span>Last run stopped: {reasons.join(", ")}</span>
          <span className="text-rose-300" aria-hidden>
            ·
          </span>
          <Link href="/credits" className="font-medium underline underline-offset-2 hover:text-rose-900">
            Buy Credits
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function FreeTrialBanner() {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-xl bg-violet-50 px-4 py-3 ring-1 ring-violet-200 sm:flex-row sm:items-center">
      <Lock className="hidden size-4 shrink-0 text-violet-600 sm:block" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-violet-950">
        <span className="font-semibold">Free trial.</span> Prospects are shown in full. Hiring Contacts and Candidates are Previews: anonymised and never stored.
        Enrichment and Campaigns start once you buy Credits.
      </p>
      <ButtonLink href="/credits" tone="primary" size="sm">
        <Sparkles className="size-3.5" aria-hidden />
        Buy Credits to reveal people
      </ButtonLink>
    </div>
  );
}

function NoRows({
  tab,
  view,
  query,
  onClearQuery,
  niche,
  onAllNiches,
}: {
  tab: FeedTab;
  view: FeedView;
  query: string;
  onClearQuery: () => void;
  niche: string;
  onAllNiches: () => void;
}) {
  const noun = tab === "prospects" ? "Prospects" : "Candidates";
  const Icon = tab === "prospects" ? Building : User;
  let body;
  if (query.trim()) {
    body = (
      <EmptyState icon={<SearchX className="size-5" aria-hidden />} title={`No ${noun} match "${query.trim()}"`} action={<Button onClick={onClearQuery}>Clear search</Button>}>
        Search looks at names, titles, employers, sectors and locations.
      </EmptyState>
    );
  } else if (view === "dismissed") {
    body = (
      <EmptyState icon={<Icon className="size-5" aria-hidden />} title={`No dismissed ${noun}`}>
        {noun} you dismiss land here with their reason, and you can restore them.
      </EmptyState>
    );
  } else {
    body = (
      <EmptyState
        icon={<Icon className="size-5" aria-hidden />}
        title={`No Surfaced ${noun} yet`}
        action={
          <>
            {niche !== "all" ? <Button onClick={onAllNiches}>Show all Niches</Button> : null}
            <ButtonLink href="/niches">Review your Niches</ButtonLink>
          </>
        }
      >
        The agents surface {noun} above each Niche&apos;s Fit threshold on the Niche&apos;s schedule. Launch a Test Run or wait for the next run.
      </EmptyState>
    );
  }
  return <div className="rounded-xl bg-white ring-1 ring-zinc-200">{body}</div>;
}
