"use client";

// /campaigns: every Campaign of the Workspace with audience, status (and why an active one is not
// sending), recipients per state, replies and Sending Mailboxes.

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Megaphone, Plus, SlidersHorizontal } from "lucide-react";
import { formatDate, formatNumber, initials, keepDashesAttached } from "@/lib/format";
import { RECIPIENT_STATE_LABELS } from "@/lib/labels";
import { PRICES } from "@/lib/pricing";
import type { Campaign, CampaignAudience, CampaignStatus, ClientState, RecipientState } from "@/lib/types";
import { useAppState, useBackendError } from "@/lib/api";
import {
  RECIPIENT_STATES,
  mailboxById,
  nicheName,
  recipientsOf,
  recruiterName,
  repliesOf,
  reviewQueue,
  sendingProblem,
  sentCount,
  stateCounts,
  type SendingProblem,
} from "./derive";
import { AudienceBadge, CampaignStatusBadge, Gate, HeaderSkeleton, MailboxesSummary, StateBar, StateLegendDot, TableSkeleton } from "./shared";
import {
  Avatar,
  Button,
  ButtonLink,
  Card,
  Dot,
  EmptyState,
  PageContainer,
  PageHeader,
  PriceHint,
  Segmented,
  Skeleton,
  StatGrid,
  StatTile,
  ToastProvider,
  cx,
} from "./ui";

type AudienceFilter = "all" | CampaignAudience;
type StatusFilter = "all" | CampaignStatus;
type OwnerFilter = "all" | "mine";

const STATUS_ORDER: Record<CampaignStatus, number> = { active: 0, paused: 1, draft: 2 };

export function CampaignsList() {
  const state = useAppState();
  const error = useBackendError();
  return (
    <ToastProvider>
      <Gate state={state} error={error} skeleton={<ListSkeleton />}>
        {(s) => <ListBody state={s} />}
      </Gate>
    </ToastProvider>
  );
}

/** Same boxes as the stat tiles (label 16px, value 32px, hint 16px), so nothing jumps on load. */
export function StatTileSkeleton() {
  return (
    <div className="rounded-xl bg-white p-4 shadow-xs ring-1 ring-zinc-200">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-1 h-8 w-12" />
      <Skeleton className="mt-1 h-4 w-28" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <StatGrid className="mb-6">
        {[0, 1, 2, 3].map((i) => (
          <StatTileSkeleton key={i} />
        ))}
      </StatGrid>
      <TableSkeleton rows={4} />
    </>
  );
}

interface Row {
  campaign: Campaign;
  counts: Record<RecipientState, number>;
  total: number;
  replies: number;
  unhandled: number;
  toReview: number;
  sent: number;
  problem: SendingProblem | null;
}

function ListBody({ state }: { state: ClientState }) {
  const me = state.session.recruiterId;
  const [audience, setAudience] = useState<AudienceFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [owner, setOwner] = useState<OwnerFilter>("all");

  const rows: Row[] = useMemo(
    () =>
      state.campaigns
        .map((campaign) => {
          const recipients = recipientsOf(state, campaign.id);
          const replies = repliesOf(state, campaign.id);
          return {
            campaign,
            counts: stateCounts(recipients),
            total: recipients.length,
            replies: replies.length,
            unhandled: replies.filter((r) => !r.handled).length,
            toReview: reviewQueue(state, campaign.id).length,
            sent: sentCount(recipients),
            problem: sendingProblem(state, campaign),
          };
        })
        .sort((a, b) => {
          const s = STATUS_ORDER[a.campaign.status] - STATUS_ORDER[b.campaign.status];
          if (s !== 0) return s;
          const da = a.campaign.launchedOn ?? a.campaign.createdOn;
          const db = b.campaign.launchedOn ?? b.campaign.createdOn;
          return da < db ? 1 : da > db ? -1 : 0;
        }),
    [state],
  );

  const filtered = rows.filter(
    (r) =>
      (audience === "all" || r.campaign.audience === audience) &&
      (status === "all" || r.campaign.status === status) &&
      (owner === "all" || r.campaign.ownerId === me),
  );

  const mine = rows.filter((r) => r.campaign.ownerId === me);
  const totals = {
    active: rows.filter((r) => r.campaign.status === "active").length,
    sent: rows.reduce((s, r) => s + r.sent, 0),
    toReview: mine.reduce((s, r) => s + r.toReview, 0),
    firstToReview: mine.find((r) => r.toReview > 0)?.campaign.id ?? null,
    unhandled: rows.reduce((s, r) => s + r.unhandled, 0),
  };

  return (
    <PageContainer>
      <PageHeader
        title="Campaigns"
        description="Outreach to Hiring Contacts or Candidates within one Niche, sent from your own Sending Mailboxes. Recipients can join at any time."
        actions={
          <ButtonLink href="/campaigns/new" variant="primary" icon={<Plus className="size-4" aria-hidden />}>
            New Campaign
          </ButtonLink>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone />}
            title="No Campaigns yet"
            action={
              <ButtonLink href="/campaigns/new" variant="primary" icon={<Plus className="size-4" aria-hidden />}>
                New Campaign
              </ButtonLink>
            }
          >
            A Campaign emails Enriched Hiring Contacts or Candidates of one Niche with a Brief and a Sequence of up to three emails. You review the first drafts
            before anything is sent.
          </EmptyState>
        </Card>
      ) : (
        <>
          <StatGrid className="mb-6">
            <StatTile label="Active Campaigns" value={formatNumber(totals.active)} hint={`of ${formatNumber(rows.length)} in the Workspace`} />
            <StatTile label="Emails sent" value={formatNumber(totals.sent)} hint="Across every Campaign" />
            <StatTile
              label={<TileLabel dot={totals.toReview > 0 ? "amber" : null}>Awaiting your review</TileLabel>}
              value={formatNumber(totals.toReview)}
              hint={
                totals.firstToReview ? (
                  <Link href={`/campaigns/${totals.firstToReview}?tab=review`} className="inline-flex items-center gap-0.5 font-medium text-indigo-600 hover:text-indigo-500">
                    Review drafts <ArrowUpRight className="size-3" aria-hidden />
                  </Link>
                ) : (
                  "Nothing to review"
                )
              }
            />
            <StatTile
              label={<TileLabel dot={totals.unhandled > 0 ? "green" : null}>Replies to handle</TileLabel>}
              value={formatNumber(totals.unhandled)}
              hint={
                <Link href="/inbox" className="inline-flex items-center gap-0.5 font-medium text-indigo-600 hover:text-indigo-500">
                  Open the Inbox <ArrowUpRight className="size-3" aria-hidden />
                </Link>
              }
            />
          </StatGrid>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  label="Audience"
                  value={audience}
                  onChange={setAudience}
                  options={[
                    { value: "all", label: "All", count: rows.length },
                    { value: "hiring_contacts", label: "Hiring Contacts", count: rows.filter((r) => r.campaign.audience === "hiring_contacts").length },
                    { value: "candidates", label: "Candidates", count: rows.filter((r) => r.campaign.audience === "candidates").length },
                  ]}
                />
                <Segmented
                  label="Status"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "all", label: "Any status" },
                    { value: "active", label: "Active" },
                    { value: "paused", label: "Paused" },
                    { value: "draft", label: "Draft" },
                  ]}
                />
                <Segmented
                  label="Owner"
                  value={owner}
                  onChange={setOwner}
                  options={[
                    { value: "all", label: "Everyone" },
                    { value: "mine", label: "Mine" },
                  ]}
                />
              </div>
              <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 lg:flex">
                {RECIPIENT_STATES.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5">
                    <StateLegendDot state={s} />
                    {RECIPIENT_STATE_LABELS[s]}
                  </span>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={<SlidersHorizontal />}
                title="No Campaigns match these filters"
                action={
                  <Button
                    onClick={() => {
                      setAudience("all");
                      setStatus("all");
                      setOwner("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <>
                {/* Fixed columns that fit the page from 1280px (974px of table); narrower screens get cards. */}
                <table className="hidden w-full table-fixed text-left text-sm xl:table">
                  <colgroup>
                    <col />
                    <col className="w-[168px]" />
                    <col className="w-[244px]" />
                    <col className="w-[104px]" />
                    <col className="w-[200px]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs font-medium text-zinc-500">
                      <th className="px-4 py-2.5 font-medium">Campaign</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">Recipients by state</th>
                      <th className="px-3 py-2.5 font-medium">Replies</th>
                      <th className="px-4 py-2.5 font-medium">Sending Mailboxes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filtered.map((r) => (
                      <CampaignRow key={r.campaign.id} row={r} state={state} />
                    ))}
                  </tbody>
                </table>
                <ul className="divide-y divide-zinc-100 xl:hidden">
                  {filtered.map((r) => (
                    <CampaignCard key={r.campaign.id} row={r} state={state} />
                  ))}
                </ul>
              </>
            )}
          </Card>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Each email sent, including your responses to replies, costs{" "}
            <span className="whitespace-nowrap">
              {PRICES.emailSent} Credit <PriceHint />.
            </span>{" "}
            Drafting and reviewing are free.
          </p>
        </>
      )}
    </PageContainer>
  );
}

function TileLabel({ dot, children }: { dot: "amber" | "green" | null; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dot ? <Dot tone={dot} /> : null}
      {children}
    </span>
  );
}

function OwnerLine({ state, campaign }: { state: ClientState; campaign: Campaign }) {
  const owner = recruiterName(state, campaign.ownerId);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar name={owner} initials={initials(owner)} size="xs" />
      <span className="truncate">{campaign.ownerId === state.session.recruiterId ? `${owner} (you)` : owner}</span>
    </span>
  );
}

/** Under the Campaign name: its Niche on a line of its own (wrapping, never cut), then audience and owner. */
function CampaignFacts({ state, campaign }: { state: ClientState; campaign: Campaign }) {
  return (
    <>
      <div className="mt-0.5 text-balance break-words text-xs leading-5 text-zinc-500">{keepDashesAttached(nicheName(state, campaign.nicheId))}</div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-zinc-500">
        <AudienceBadge audience={campaign.audience} />
        <OwnerLine state={state} campaign={campaign} />
      </div>
    </>
  );
}

function StateCounts({ row }: { row: Row }) {
  return (
    <div className="w-full min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs text-zinc-500">
        <span className="whitespace-nowrap">
          <span className="font-medium tabular-nums text-zinc-900">{row.total}</span> {row.total === 1 ? "recipient" : "recipients"}
        </span>
        <span className="whitespace-nowrap tabular-nums">
          {row.sent} {row.sent === 1 ? "email" : "emails"} sent
        </span>
      </div>
      <StateBar counts={row.counts} total={row.total} />
      <div className="mt-1.5 flex items-center justify-between text-xs tabular-nums text-zinc-600">
        {RECIPIENT_STATES.map((s) => (
          <span key={s} className={cx("inline-flex items-center gap-1", row.counts[s] === 0 && "text-zinc-300")} title={`${RECIPIENT_STATE_LABELS[s]}: ${row.counts[s]}`}>
            <StateLegendDot state={s} />
            {row.counts[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

function RepliesCell({ row, compact }: { row: Row; compact?: boolean }) {
  if (row.replies === 0) return <span className="text-zinc-400">{compact ? "No replies" : "-"}</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="whitespace-nowrap tabular-nums text-zinc-900">
        {row.replies} {row.replies === 1 ? "reply" : "replies"}
      </span>
      {row.unhandled > 0 ? (
        <Link href="/inbox" className="whitespace-nowrap text-xs font-medium text-emerald-700 hover:text-emerald-600">
          {row.unhandled} to handle
        </Link>
      ) : (
        <span className="whitespace-nowrap text-xs text-zinc-500">All handled</span>
      )}
    </div>
  );
}

function MailboxesCell({ state, campaign }: { state: ClientState; campaign: Campaign }) {
  const mbs = campaign.mailboxIds.map((id) => mailboxById(state, id)).filter((m) => m !== undefined);
  return <MailboxesSummary mailboxes={mbs} empty={<span className="text-xs text-amber-700">No Sending Mailbox</span>} />;
}

/** Why an active Campaign does not send, under its status: "Sending stopped today: Credits ran out". */
function SendingNote({ problem, stacked }: { problem: SendingProblem; stacked: boolean }) {
  const tone = problem.severe ? "text-red-700" : "text-amber-700";
  return stacked ? (
    <div className={cx("text-xs", tone)} title={problem.text}>
      <span className="block whitespace-nowrap font-medium">{problem.lead}:</span>
      <span className="block">{problem.short}</span>
    </div>
  ) : (
    <div className={cx("text-xs", tone)} title={problem.text}>
      <span className="font-medium">{problem.lead}:</span> {problem.short}
    </div>
  );
}

function StatusCell({ row, mine, withNote, align = "start" }: { row: Row; mine: boolean; withNote: boolean; align?: "start" | "end" }) {
  const c = row.campaign;
  const problem = row.problem && !row.problem.resolved ? row.problem : null;
  return (
    <div className={cx("flex flex-col gap-1", align === "end" ? "items-end text-right" : "items-start")}>
      <CampaignStatusBadge status={c.status} />
      {withNote && problem ? <SendingNote problem={problem} stacked /> : null}
      {row.toReview > 0 && mine ? (
        <Link href={`/campaigns/${c.id}?tab=review`} className="whitespace-nowrap text-xs font-medium text-amber-700 hover:text-amber-600">
          {row.toReview} to review
        </Link>
      ) : (
        <span className="whitespace-nowrap text-xs text-zinc-500">{c.launchedOn ? `Since ${formatDate(c.launchedOn)}` : `Created ${formatDate(c.createdOn)}`}</span>
      )}
    </div>
  );
}

function CampaignRow({ row, state }: { row: Row; state: ClientState }) {
  const c = row.campaign;
  return (
    <tr className="group align-top hover:bg-zinc-50/70">
      <td className="px-4 py-3.5">
        <Link href={`/campaigns/${c.id}`} title={c.name} className="line-clamp-2 break-words font-medium text-zinc-900 group-hover:text-indigo-700">
          {c.name}
        </Link>
        <CampaignFacts state={state} campaign={c} />
      </td>
      <td className="px-3 py-3.5">
        <StatusCell row={row} mine={c.ownerId === state.session.recruiterId} withNote />
      </td>
      <td className="px-3 py-3.5">
        <StateCounts row={row} />
      </td>
      <td className="px-3 py-3.5">
        <RepliesCell row={row} />
      </td>
      <td className="px-4 py-3.5">
        <MailboxesCell state={state} campaign={c} />
      </td>
    </tr>
  );
}

function CampaignCard({ row, state }: { row: Row; state: ClientState }) {
  const c = row.campaign;
  const problem = row.problem && !row.problem.resolved ? row.problem : null;
  return (
    <li className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/campaigns/${c.id}`} className="block break-words font-medium text-zinc-900 hover:text-indigo-700">
            {c.name}
          </Link>
          <CampaignFacts state={state} campaign={c} />
        </div>
        <div className="shrink-0">
          <StatusCell row={row} mine={c.ownerId === state.session.recruiterId} withNote={false} align="end" />
        </div>
      </div>
      {problem ? (
        <div className="mt-2">
          <SendingNote problem={problem} stacked={false} />
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-8">
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <StateCounts row={row} />
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-xs text-zinc-500">Replies</div>
          <RepliesCell row={row} compact />
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-xs text-zinc-500">Sending Mailboxes</div>
          <MailboxesCell state={state} campaign={c} />
        </div>
      </div>
    </li>
  );
}
