"use client";

// Inbox: replies to Campaigns grouped or filtered by Reply Category, the thread, the suggested next
// step, the automatic effects, and the drafted response the Recruiter edits and sends.
//
// The URL is the only source of truth for what is shown (?reply, ?category, ?status, ?campaign), so
// Back and shared links restore it. The selected reply is sticky: it stays selected and listed
// whatever happens to it (handled, recategorized, deleted elsewhere), and the Inbox never switches
// to another reply on its own while the Recruiter writes.

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CircleCheck, Inbox as InboxIcon, MailOpen, MailQuestion, Megaphone } from "lucide-react";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import { Select } from "@/components/ui/select";
import { SignedOutState } from "@/components/ui/signed-out-state";
import { REPLY_CATEGORY_LABELS } from "@/lib/labels";
import { REPLY_CATEGORIES, type ReplyCategory } from "@/lib/types";
import { useAppState, useBackendError } from "@/lib/api";
import { CategoryDot } from "./category";
import {
  buildReplyViews,
  buildThread,
  currentRecruiterOf,
  matchesStatus,
  parseCategory,
  parseStatus,
  sortReplies,
  type CampaignFilter,
  type CategoryFilter,
  type DraftRecord,
  type ReplyView,
  type StatusFilter,
} from "./model";
import { ReplyDetail, UnsentDraft } from "./reply-detail";
import { ReplyList, type ReplyGroup } from "./reply-list";
import { Button, EmptyState, Segmented, Skeleton, cx } from "./ui";

/** Where to scroll once the URL change has rendered: the detail pane, or the list row the Recruiter came back from. */
type ScrollIntent = { to: "detail" } | { to: "row"; id: string } | null;

export function InboxScreen() {
  const state = useAppState();
  const backendError = useBackendError();
  const params = useSearchParams();
  const pathname = usePathname();
  const [drafts, setDrafts] = useState<Record<string, DraftRecord>>({});
  /** The reply shown by default (no ?reply), remembered so a newer reply arriving on top does not replace it. */
  const [implicitId, setImplicitId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const scrollIntent = useRef<ScrollIntent>(null);

  const views = useMemo(() => (state ? sortReplies(buildReplyViews(state)) : []), [state]);

  const replyParam = params.get("reply");
  const status = parseStatus(params.get("status"));
  const category = parseCategory(params.get("category"));
  const campaignParam = params.get("campaign");
  const campaignsWithReplies = state ? state.campaigns.filter((c) => views.some((v) => v.reply.campaignId === c.id)) : [];
  const pinned = replyParam ? views.find((v) => v.reply.id === replyParam) : undefined;
  // Without a Campaign scope in the URL, a deep-linked reply to another Recruiter's Campaign opens
  // under All Campaigns, so the counts include it; hrefFor then writes that scope into the URL.
  // The status filter is never derived from the reply: acting on it must not flip the tabs.
  const campaign: CampaignFilter =
    campaignParam === "all" || (campaignParam && campaignsWithReplies.some((c) => c.id === campaignParam))
      ? campaignParam
      : pinned && !pinned.isMine
        ? "all"
        : "mine";

  const inCampaign = views.filter((v) => (campaign === "all" ? true : campaign === "mine" ? v.isMine : v.reply.campaignId === campaign));
  const strictStatus = inCampaign.filter((v) => matchesStatus(v, status));
  const filtered = strictStatus.filter((v) => category === "all" || v.reply.category === category);
  // The selected reply stays listed even when it does not match the filters (acted on here or elsewhere,
  // or opened from a link), in a group of its own so every count on the page still matches the filters.
  const outside = pinned && !filtered.includes(pinned) ? pinned : null;
  const implicit = replyParam ? null : (filtered.find((v) => v.reply.id === implicitId) ?? filtered[0] ?? null);
  const selected: ReplyView | null = replyParam ? (pinned ?? null) : implicit;
  const selectedId = selected?.reply.id ?? null;
  /** A reply in the URL that no longer exists (scenario reloaded): a placeholder, never another reply. */
  const gone = !!state && replyParam !== null && !pinned;

  const implicitView = implicit?.reply.id ?? null;
  useEffect(() => {
    if (implicitView !== implicitId) setImplicitId(implicitView);
  }, [implicitView, implicitId]);

  useEffect(() => {
    const intent = scrollIntent.current;
    if (!intent) return;
    scrollIntent.current = null;
    if (intent.to === "detail") {
      const el = detailRef.current;
      if (!el) return;
      // Only when its top is hidden: under the sticky chrome (its scroll margin) or above the viewport.
      if (el.getBoundingClientRect().top < parseFloat(getComputedStyle(el).scrollMarginTop || "0")) el.scrollIntoView({ block: "start" });
    } else {
      document.querySelector(`[data-reply-row="${CSS.escape(intent.id)}"]`)?.scrollIntoView({ block: "center" });
    }
  }, [selectedId, replyParam]);

  if (!state) return backendError ? <BackendErrorState error={backendError} /> : <InboxSkeleton />;

  const me = currentRecruiterOf(state);
  const today = state.clock.today;

  function hrefFor(next: { reply?: string | null; status?: StatusFilter; category?: CategoryFilter; campaign?: CampaignFilter }): string {
    const sp = new URLSearchParams();
    const nextCampaign = next.campaign ?? campaign;
    const nextStatus = next.status ?? status;
    const nextCategory = next.category ?? category;
    const nextReply = next.reply === undefined ? replyParam : next.reply;
    if (nextCampaign !== "mine") sp.set("campaign", nextCampaign);
    if (nextStatus !== "needs_action") sp.set("status", nextStatus);
    if (nextCategory !== "all") sp.set("category", nextCategory);
    if (nextReply) sp.set("reply", nextReply);
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // Native history update, synced with useSearchParams by Next.js (no server round trip, no scroll).
  function navigate(url: string) {
    window.history.replaceState(null, "", url);
  }

  function select(id: string) {
    scrollIntent.current = { to: "detail" };
    navigate(hrefFor({ reply: id }));
  }

  /** Makes the reply shown by default an explicit selection, so nothing replaces it while it is worked on. */
  function pin(id: string) {
    if (replyParam !== id) navigate(hrefFor({ reply: id }));
  }

  function back() {
    if (replyParam) scrollIntent.current = { to: "row", id: replyParam };
    navigate(hrefFor({ reply: null }));
  }

  function changeFilters(next: { status?: StatusFilter; category?: CategoryFilter; campaign?: CampaignFilter }) {
    setImplicitId(null);
    navigate(hrefFor({ ...next, reply: null }));
  }

  function updateDraft(view: ReplyView, text: string) {
    const id = view.reply.id;
    setDrafts((d) => ({ ...d, [id]: { text, personLabel: d[id]?.personLabel ?? view.reply.personLabel } }));
    pin(id);
  }

  function resetDraft(id: string) {
    setDrafts((d) => {
      if (!(id in d)) return d;
      const next = { ...d };
      delete next[id];
      return next;
    });
  }

  const statusCounts = {
    needs_action: inCampaign.filter((v) => !v.reply.handled).length,
    handled: inCampaign.filter((v) => v.reply.handled).length,
    all: inCampaign.length,
  };
  // Counts ignore the selected reply outside the filters, so they always match the filters.
  const categoryCounts = Object.fromEntries(REPLY_CATEGORIES.map((c) => [c, strictStatus.filter((v) => v.reply.category === c).length])) as Record<ReplyCategory, number>;

  /** The first filter the selected reply does not match, named as in the controls above the list. */
  function outsideFilterLabel(view: ReplyView): string {
    if (!inCampaign.includes(view)) return campaign === "mine" ? "My Campaigns" : "this Campaign";
    if (!matchesStatus(view, status)) return status === "handled" ? "Handled" : "Needs action";
    return category === "all" ? "this filter" : REPLY_CATEGORY_LABELS[category];
  }

  // Under one category the chip already names it: a header only sets these replies apart from the selected one.
  const matchingGroups: ReplyGroup[] =
    category === "all"
      ? REPLY_CATEGORIES.map((c): ReplyGroup => ({ key: c, header: { kind: "category", category: c }, items: filtered.filter((v) => v.reply.category === c) }))
      : [{ key: category, header: outside ? { kind: "category", category } : null, items: filtered }];
  const groups: ReplyGroup[] = [
    ...(outside ? [{ key: "selected", header: { kind: "selected", outsideOf: outsideFilterLabel(outside) }, items: [outside] } satisfies ReplyGroup] : []),
    ...matchingGroups.filter((g) => g.items.length > 0),
  ];

  const chosenCampaign = campaign !== "mine" && campaign !== "all" ? state.campaigns.find((c) => c.id === campaign) : undefined;
  const chosenOwner = chosenCampaign ? state.recruiters.find((r) => r.id === chosenCampaign.ownerId) : undefined;
  const description =
    campaign === "mine"
      ? "Replies to your Campaigns. Agents draft every response; you send it."
      : campaign === "all"
        ? "Replies to all Campaigns. Each Campaign's owner sends its responses."
        : chosenCampaign && chosenOwner && chosenOwner.id !== me?.id
          ? `Replies to one Campaign of ${chosenOwner.name}, who sends its responses.`
          : "Replies to one of your Campaigns. Agents draft every response; you send it.";

  const filters =
    views.length > 0 ? (
      <>
        <Select aria-label="Campaign" value={campaign} onChange={(e) => changeFilters({ campaign: e.target.value })} className="w-60 max-w-full">
          <option value="mine">My Campaigns</option>
          <option value="all">All Campaigns</option>
          <optgroup label="Campaigns">
            {campaignsWithReplies.map((c) => {
              const owner = state.recruiters.find((r) => r.id === c.ownerId);
              return (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {owner && owner.id !== me?.id ? ` (${owner.name})` : ""}
                </option>
              );
            })}
          </optgroup>
        </Select>
        <Segmented
          label="Show replies"
          value={status}
          onChange={(v) => changeFilters({ status: v })}
          options={[
            { value: "needs_action", label: "Needs action", count: statusCounts.needs_action },
            { value: "handled", label: "Handled", count: statusCounts.handled },
            { value: "all", label: "All", count: statusCounts.all },
          ]}
        />
      </>
    ) : null;

  if (!state.workspace) {
    return (
      <PageContainer width="wide">
        <PageHeader title="Inbox" description="Replies to your Campaigns. Agents draft every response; you send it." />
        <SignedOutState what="launch Campaigns and answer their replies here" />
      </PageContainer>
    );
  }

  if (views.length === 0) {
    return (
      <PageContainer width="wide">
        <PageHeader title="Inbox" description={description} />
        <div className="rounded-xl border border-zinc-200 bg-white">
          <EmptyState
            icon={InboxIcon}
            title="No replies yet"
            action={
              <Link
                href="/campaigns"
                className="inline-flex h-8 items-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-zinc-800 shadow-sm ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
              >
                <Megaphone className="size-4" aria-hidden />
                Go to Campaigns
              </Link>
            }
          >
            When someone answers a Campaign email, the reply lands here, classified by Reply Category, with a suggested next step and a drafted response.
          </EmptyState>
        </div>
      </PageContainer>
    );
  }

  const thread = selected ? buildThread(selected, state.replies) : [];
  const detailOpen = replyParam !== null;
  const goneDraft = gone && replyParam ? drafts[replyParam] : undefined;

  return (
    <PageContainer width="wide">
      <PageHeader title="Inbox" description={description} actions={filters} />

      <div
        role="group"
        aria-label="Filter by Reply Category"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
      >
        <CategoryChip active={category === "all"} label="All categories" count={strictStatus.length} onClick={() => changeFilters({ category: "all" })} />
        {REPLY_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            active={category === c}
            category={c}
            label={REPLY_CATEGORY_LABELS[c]}
            count={categoryCounts[c]}
            onClick={() => changeFilters({ category: c })}
          />
        ))}
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div
          className={cx(
            "overflow-hidden rounded-xl border border-zinc-200 bg-white lg:sticky lg:top-[calc(var(--chrome-h)+1rem)] lg:max-h-[calc(100dvh-var(--chrome-h)-2rem)] lg:self-start lg:overflow-y-auto",
            detailOpen ? "hidden lg:block" : "block",
          )}
        >
          {groups.length > 0 ? (
            <ReplyList
              groups={groups}
              filterCategory={category === "all" ? null : category}
              selectedId={selectedId}
              selectionExplicit={detailOpen}
              today={today}
              onSelect={select}
            />
          ) : inCampaign.length === 0 && campaign === "mine" ? (
            <EmptyState
              icon={InboxIcon}
              title="No replies to your Campaigns yet"
              action={
                <Button size="sm" onClick={() => changeFilters({ campaign: "all" })}>
                  Show all Campaigns
                </Button>
              }
            >
              Replies to the Campaigns of other Recruiters are under All Campaigns.
            </EmptyState>
          ) : (
            <EmptyState
              icon={status === "needs_action" ? CircleCheck : MailOpen}
              title={
                status === "needs_action"
                  ? category === "all"
                    ? "Nothing needs action"
                    : `No ${REPLY_CATEGORY_LABELS[category]} reply needs action`
                  : category === "all"
                    ? "No handled replies"
                    : `No ${REPLY_CATEGORY_LABELS[category]} replies here`
              }
              action={
                <Button size="sm" onClick={() => changeFilters({ status: "all", category: "all" })}>
                  Show all replies
                </Button>
              }
            >
              {status === "needs_action" ? "Every reply in this view is handled. New replies land here as they arrive." : "Try another Reply Category or filter."}
            </EmptyState>
          )}
        </div>

        <div ref={detailRef} className={cx("min-w-0 scroll-mt-[calc(var(--chrome-h)+0.75rem)]", detailOpen ? "block" : "hidden lg:block")}>
          {selected ? (
            <ReplyDetail
              key={selected.reply.id}
              view={selected}
              state={state}
              thread={thread}
              draft={drafts[selected.reply.id]}
              onDraftChange={(text) => updateDraft(selected, text)}
              onDraftReset={() => resetDraft(selected.reply.id)}
              onActed={() => pin(selected.reply.id)}
              onBack={back}
            />
          ) : gone ? (
            <div className="rounded-xl border border-zinc-200 bg-white">
              <div className="px-4 pt-4 lg:hidden">
                <button type="button" onClick={back} className="-ml-1 inline-flex items-center gap-1 rounded px-1 text-sm font-medium text-zinc-600 hover:text-zinc-900">
                  <ArrowLeft className="size-4" aria-hidden />
                  All replies
                </button>
              </div>
              <EmptyState
                icon={MailQuestion}
                title="This reply is no longer in the Inbox"
                action={
                  <Button size="sm" onClick={back}>
                    Show replies
                  </Button>
                }
              >
                {goneDraft ? `It was removed while you were writing to ${goneDraft.personLabel}. Your text is kept below if you need it.` : "It was removed from this Workspace."}
              </EmptyState>
              {goneDraft && replyParam ? (
                <div className="-mt-6 px-4 pb-5 sm:px-5">
                  <UnsentDraft text={goneDraft.text} onDiscard={() => resetDraft(replyParam)} />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white">
              <EmptyState icon={MailOpen} title="No reply selected">
                Pick a reply to see the thread, the suggested next step and the drafted response.
              </EmptyState>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

function CategoryChip({
  active,
  category,
  label,
  count,
  onClick,
}: {
  active: boolean;
  category?: ReplyCategory;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ring-1 ring-inset transition-colors",
        active ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50",
        !active && count === 0 && "text-zinc-400",
      )}
    >
      {category ? <CategoryDot category={category} className={cx(!active && count === 0 && "opacity-40")} /> : null}
      {label}
      <span className={cx("tabular-nums", active ? "text-zinc-300" : "text-zinc-400")}>{count}</span>
    </button>
  );
}

/** Same frame as the loaded page (PageContainer, PageHeader), also the Suspense fallback of the route. */
export function InboxSkeleton() {
  return (
    <PageContainer width="wide">
      <div aria-busy="true" aria-label="Loading the Inbox">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-5 w-96 max-w-full" />
          </div>
          <Skeleton className="h-8 w-[30rem] max-w-full" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex gap-3 px-4 py-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden space-y-4 rounded-xl border border-zinc-200 bg-white p-5 lg:block">
            <div className="flex gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
