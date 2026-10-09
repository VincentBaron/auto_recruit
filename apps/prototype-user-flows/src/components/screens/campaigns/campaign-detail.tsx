"use client";

// /campaigns/[id]: recipients by state, review queue (approve, edit then approve), per-recipient
// thread, pause / resume, add recipients, launch a draft, and why an active Campaign is not sending.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Coins, Mail, Megaphone, Pause, Play, Rocket, UserPlus } from "lucide-react";
import { formatCredits, formatDate, initials } from "@/lib/format";
import { AUTONOMY_LABELS, RECIPIENT_STATE_LABELS } from "@/lib/labels";
import { PRICES } from "@/lib/pricing";
import type { Campaign, ClientState, RecipientState } from "@/lib/types";
import { act, useAppState, useBackendError } from "@/lib/api";
import {
  RECIPIENT_STATES,
  isUsableMailbox,
  nicheName,
  recipientsOf,
  recruiterName,
  repliesOf,
  reviewQueue,
  sendingProblem,
  sentCount,
  stateCounts,
  usableMailboxes,
} from "./derive";
import { AddRecipientsDialog, CampaignSettings, SENDING_CARD_ID } from "./campaign-settings";
import { RecipientThread, RecipientsPanel, type RecipientFilter } from "./recipients";
import { ReviewQueue } from "./review-queue";
import { AudienceBadge, Breadcrumbs, CampaignStatusBadge, Gate, HeaderSkeleton, MailboxAddress, StateLegendDot, TableSkeleton } from "./shared";
import {
  Avatar,
  Button,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  Modal,
  PageContainer,
  PageHeader,
  PriceHint,
  Skeleton,
  StatTile,
  ToastProvider,
  cx,
  useToast,
} from "./ui";

export type DetailTab = "review" | "recipients" | "settings";

export interface DetailFlash {
  launched?: boolean;
  created?: boolean;
  skipped?: number;
  addError?: string;
  launchError?: string;
}

export function CampaignDetail({ id, initialTab, flash }: { id: string; initialTab: DetailTab | null; flash: DetailFlash }) {
  const state = useAppState();
  const error = useBackendError();
  return (
    <ToastProvider>
      <Gate state={state} error={error} skeleton={<DetailSkeleton />}>
        {(s) => <Detail state={s} id={id} initialTab={initialTab} flash={flash} />}
      </Gate>
    </ToastProvider>
  );
}

function DetailSkeleton() {
  return (
    <>
      <Skeleton className="mb-2 h-4 w-48" />
      <HeaderSkeleton />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl bg-white p-4 shadow-xs ring-1 ring-zinc-200">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-1 h-8 w-10" />
          </div>
        ))}
      </div>
      <Skeleton className="mb-4 h-8 w-72" />
      <TableSkeleton rows={6} />
    </>
  );
}

function Detail({ state, id, initialTab, flash }: { state: ClientState; id: string; initialTab: DetailTab | null; flash: DetailFlash }) {
  const campaign = state.campaigns.find((c) => c.id === id);
  if (!campaign) {
    return (
      <PageContainer>
        <Breadcrumbs items={[{ label: "Campaigns", href: "/campaigns" }, { label: "Not found" }]} />
        <PageHeader title="Campaign not found" />
        <Card>
          <EmptyState icon={<Megaphone />} title="This Campaign does not exist" action={<ButtonLink href="/campaigns">Back to Campaigns</ButtonLink>}>
            It may have been deleted, or the dummy backend was reset.
          </EmptyState>
        </Card>
      </PageContainer>
    );
  }
  return <DetailBody state={state} campaign={campaign} initialTab={initialTab} flash={flash} />;
}

/**
 * The one-time callout after the wizard. It reads the URL flags once, then removes them from the URL
 * (a reload does not show it again), and counts from the live recipients, so it never contradicts
 * the counters under it.
 */
function FlashBanner({ state, campaign, flash, initialTab }: { state: ClientState; campaign: Campaign; flash: DetailFlash; initialTab: DetailTab | null }) {
  const router = useRouter();
  const [read] = useState(flash);
  const [open, setOpen] = useState(true);
  const hasFlash = Boolean(read.launched || read.created || read.addError || read.launchError);

  useEffect(() => {
    if (!hasFlash) return;
    router.replace(`/campaigns/${campaign.id}${initialTab ? `?tab=${initialTab}` : ""}`, { scroll: false });
  }, [hasFlash, router, campaign.id, initialTab]);

  if (!open || !hasFlash) return null;
  const dismiss = () => setOpen(false);
  const counts = stateCounts(recipientsOf(state, campaign.id));
  const total = RECIPIENT_STATES.reduce((s, k) => s + counts[k], 0);
  const skipped = read.skipped ? ` ${read.skipped} ${read.skipped === 1 ? "person was" : "people were"} skipped (Claim, Suppression List or Prospect rule).` : "";

  if (read.launchError || read.addError) {
    return (
      <Callout tone="danger" className="mb-5" title="The Campaign was created, but not everything went through" onDismiss={dismiss}>
        {read.addError ? `Adding recipients failed: ${read.addError} ` : ""}
        {read.launchError ? `Launch failed: ${read.launchError}` : ""}
      </Callout>
    );
  }
  if (read.launched) {
    const scheduled = counts.scheduled;
    const review = counts.awaiting_review;
    const parts = [
      scheduled > 0 ? `${scheduled} ${scheduled === 1 ? "email is" : "emails are"} scheduled` : null,
      review > 0 ? `${review} ${review === 1 ? "draft waits" : "drafts wait"} for your review` : null,
    ].filter((x): x is string => x !== null);
    const body =
      total === 0
        ? "Nobody is in it yet: newly Enriched people join through the auto-add rule."
        : parts.length === 0
          ? "Every first email is approved."
          : `${parts.join(" and ")}.`;
    return (
      <Callout tone="success" className="mb-5" title="Campaign launched" onDismiss={dismiss}>
        {body}
        {skipped}
      </Callout>
    );
  }
  if (read.created && campaign.status === "draft") {
    return (
      <Callout tone="success" className="mb-5" title="Saved as a draft" onDismiss={dismiss}>
        {total} {total === 1 ? "recipient" : "recipients"} added. Nothing is sent until you launch the Campaign.{skipped}
      </Callout>
    );
  }
  return null;
}

/** Why an active Campaign is not sending, with the way out. Nothing when it sends normally. */

/** Renders Sending Mailbox addresses inside a sentence so they wrap before the "@", never at a hyphen. */
function withMailboxAddresses(text: string): ReactNode {
  const parts = text.split(/(\S+@\S+\.[a-z]{2,})/i);
  return parts.map((part, i) => (i % 2 === 1 ? <MailboxAddress key={i} address={part} /> : part));
}
function SendingBanner({ state, campaign, canEdit, onChooseMailbox }: { state: ClientState; campaign: Campaign; canEdit: boolean; onChooseMailbox: () => void }) {
  const problem = sendingProblem(state, campaign);
  if (!problem) return null;
  if (problem.resolved) {
    return (
      <Callout tone="info" className="mb-5" title="Sending resumes on the next sending day">
        {problem.summary}. That is fixed now, so the waiting emails go out in the next sending window.
      </Callout>
    );
  }
  const mailboxesLink = (
    <ButtonLink href="/settings/mailboxes" size="sm" icon={<Mail className="size-3.5" aria-hidden />}>
      Open Sending Mailboxes
    </ButtonLink>
  );
  const ownerHasOther = state.mailboxes.some((m) => m.recruiterId === campaign.ownerId && isUsableMailbox(m) && !campaign.mailboxIds.includes(m.id));
  let action: ReactNode;
  let guidance: string;
  if (problem.reason === "credits") {
    action = (
      <ButtonLink href="/credits" size="sm" variant="primary" icon={<Coins className="size-3.5" aria-hidden />}>
        Buy Credits
      </ButtonLink>
    );
    guidance = "Emails wait until the balance covers them; nothing is lost.";
  } else if (problem.allPaused) {
    // Every Sending Mailbox of the Campaign is paused: resuming one is the way out, not a new one.
    const me = state.recruiters.find((r) => r.id === state.session.recruiterId);
    const canResume = me !== undefined && (me.role === "owner" || state.mailboxes.some((m) => m.recruiterId === me.id && m.status === "paused" && campaign.mailboxIds.includes(m.id)));
    const onePaused = campaign.mailboxIds.filter((id) => state.mailboxes.some((m) => m.id === id && m.status === "paused")).length === 1;
    action = canResume ? (
      <ButtonLink href="/settings/mailboxes" size="sm" variant="primary" icon={<Play className="size-3.5" aria-hidden />}>
        {onePaused ? "Resume the Sending Mailbox" : "Resume a paused Sending Mailbox"}
      </ButtonLink>
    ) : (
      mailboxesLink
    );
    guidance = canResume
      ? `${onePaused ? "Resume it" : "Resume one of them"} and the waiting emails go out on the next sending day.${canEdit && ownerHasOther ? " You can also choose another of your Sending Mailboxes in the Campaign settings." : ""}`
      : `Only ${recruiterName(state, campaign.ownerId)} or an Owner can resume a paused Sending Mailbox.`;
  } else if (problem.reason === "no_mailbox" && problem.orphanedFollowUps > 0 && usableMailboxes(state, campaign).length > 0) {
    action = mailboxesLink;
    guidance = `${problem.orphanedFollowUps} ${problem.orphanedFollowUps === 1 ? "follow-up was" : "follow-ups were"} started from a Sending Mailbox removed since. A follow-up stays in its thread, on the mailbox that sent the first email, so ${problem.orphanedFollowUps === 1 ? "it is" : "they are"} not sent.`;
  } else if (usableMailboxes(state, campaign).length === 0) {
    action =
      canEdit && ownerHasOther ? (
        <Button size="sm" variant="primary" icon={<Mail className="size-3.5" aria-hidden />} onClick={onChooseMailbox}>
          Choose a Sending Mailbox
        </Button>
      ) : (
        mailboxesLink
      );
    guidance = canEdit
      ? ownerHasOther
        ? "Choose another of your Sending Mailboxes in the Campaign settings."
        : "Connect a Sending Mailbox or resume a paused one, then choose it in the Campaign settings."
      : `Only ${recruiterName(state, campaign.ownerId)} can choose a Sending Mailbox for this Campaign.`;
  } else {
    action = mailboxesLink;
    guidance = problem.reason === "caps" ? "They go out on the next sending day, within the caps." : "Resume the mailbox to send them.";
  }
  // The title already names the reason: "Credits ran out: 6 emails not sent" reads "6 emails not sent".
  const detail = problem.text.startsWith(`${problem.short}: `) ? problem.text.slice(problem.short.length + 2) : problem.text;
  return (
    <Callout tone={problem.severe ? "danger" : "warning"} role="status" className="mb-5" title={problem.summary} action={action}>
      {withMailboxAddresses(/^\S+@/.test(detail) ? detail : detail.charAt(0).toUpperCase() + detail.slice(1))}. {guidance}
    </Callout>
  );
}

function DetailBody({ state, campaign, initialTab, flash }: { state: ClientState; campaign: Campaign; initialTab: DetailTab | null; flash: DetailFlash }) {
  const toast = useToast();
  const queue = reviewQueue(state, campaign.id);
  const recipients = recipientsOf(state, campaign.id);
  const counts = stateCounts(recipients);
  const replies = repliesOf(state, campaign.id);
  const unhandled = replies.filter((r) => !r.handled).length;
  const owner = recruiterName(state, campaign.ownerId);
  const canEdit = state.session.recruiterId === campaign.ownerId;
  const noMailbox = usableMailboxes(state, campaign).length === 0;
  const noMailboxReason = noMailbox ? "This Campaign has no active or ramping Sending Mailbox: choose one in the Campaign settings first." : null;

  const [tab, setTab] = useState<DetailTab>(initialTab ?? (queue.length > 0 ? "review" : "recipients"));
  const [filter, setFilter] = useState<RecipientFilter>("all");
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmLaunch, setConfirmLaunch] = useState(false);
  const [busy, setBusy] = useState<"pause" | "resume" | "launch" | null>(null);

  const live = recipients.filter((r) => r.state !== "stopped" && r.state !== "replied");
  const maxEmails = live.reduce((s, r) => s + r.messages.filter((m) => m.origin === "campaign" && m.status !== "sent").length, 0);

  const run = async (kind: "pause" | "resume" | "launch") => {
    setBusy(kind);
    const res =
      kind === "pause"
        ? await act("pauseCampaign", { campaignId: campaign.id })
        : kind === "resume"
          ? await act("resumeCampaign", { campaignId: campaign.id })
          : await act("launchCampaign", { campaignId: campaign.id });
    setBusy(null);
    setConfirmLaunch(false);
    if (!res.ok) {
      toast({ tone: "danger", title: "Something went wrong", description: res.error });
      return;
    }
    if (kind === "pause") toast({ tone: "success", title: "Campaign paused", description: "No email is sent until you resume. Replies still reach your Inbox." });
    if (kind === "resume") toast({ tone: "success", title: "Campaign resumed", description: "Scheduled emails go out in the next sending window." });
    if (kind === "launch" && "scheduled" in res.result) {
      toast({ tone: "success", title: "Campaign launched", description: `${res.result.scheduled} scheduled, ${res.result.awaitingReview} waiting for your review.` });
    }
  };

  const openFilter = (s: RecipientState) => {
    if (s === "awaiting_review" && queue.length > 0) {
      setTab("review");
      return;
    }
    setFilter(s);
    setTab("recipients");
  };

  const reviewRecipient = (rid: string) => {
    setThreadId(null);
    setSelectedReview(rid);
    setTab("review");
  };

  const chooseMailbox = () => {
    setTab("settings");
    requestAnimationFrame(() => document.getElementById(SENDING_CARD_ID)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: "Campaigns", href: "/campaigns" }, { label: campaign.name }]} />
      <PageHeader
        title={campaign.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5">
              <CampaignStatusBadge status={campaign.status} />
              <AudienceBadge audience={campaign.audience} />
            </span>
            <Link href={`/niches/${campaign.nicheId}`} className="hover:text-zinc-900">
              {nicheName(state, campaign.nicheId)}
            </Link>
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={owner} initials={initials(owner)} size="xs" />
              {canEdit ? `${owner} (you)` : owner}
            </span>
            <span>{campaign.launchedOn ? `Launched ${formatDate(campaign.launchedOn)}` : `Created ${formatDate(campaign.createdOn)}`}</span>
            <span>{campaign.autonomy === "review_first_n" ? `Review the first ${campaign.reviewFirstN}` : AUTONOMY_LABELS[campaign.autonomy]}</span>
          </span>
        }
        actions={
          canEdit ? (
            <>
              <span title={noMailboxReason ?? undefined} className="inline-flex">
                <Button icon={<UserPlus className="size-3.5" aria-hidden />} onClick={() => setAdding(true)} disabled={noMailbox}>
                  Add recipients
                </Button>
              </span>
              {campaign.status === "draft" ? (
                <span title={noMailboxReason ?? undefined} className="inline-flex">
                  <Button variant="primary" icon={<Rocket className="size-3.5" aria-hidden />} onClick={() => setConfirmLaunch(true)} disabled={noMailbox}>
                    Launch
                  </Button>
                </span>
              ) : campaign.status === "active" ? (
                <Button icon={<Pause className="size-3.5" aria-hidden />} loading={busy === "pause"} onClick={() => void run("pause")}>
                  Pause
                </Button>
              ) : (
                <Button variant="primary" icon={<Play className="size-3.5" aria-hidden />} loading={busy === "resume"} onClick={() => void run("resume")}>
                  Resume
                </Button>
              )}
            </>
          ) : null
        }
      />

      <FlashBanner state={state} campaign={campaign} flash={flash} initialTab={initialTab} />
      <SendingBanner state={state} campaign={campaign} canEdit={canEdit} onChooseMailbox={chooseMailbox} />

      {!canEdit ? (
        <Callout tone="info" className="mb-5" title={`This Campaign belongs to ${owner}`}>
          Emails go out in {owner}&apos;s name from their Sending Mailboxes, so only they review drafts, add recipients and pause or resume it. The people in it
          are claimed by {owner}.
        </Callout>
      ) : campaign.status === "draft" ? (
        noMailbox ? (
          <Callout
            tone="warning"
            className="mb-5"
            title="Draft: choose a Sending Mailbox before you launch"
            action={
              <Button size="sm" variant="primary" icon={<Mail className="size-3.5" aria-hidden />} onClick={chooseMailbox}>
                Choose a Sending Mailbox
              </Button>
            }
          >
            Nothing is sent yet. This Campaign has no active or ramping Sending Mailbox to send from.
          </Callout>
        ) : (
          <Callout
            tone="warning"
            className="mb-5"
            title="Draft: nothing is sent yet"
            action={
              <Button size="sm" variant="primary" icon={<Rocket className="size-3.5" aria-hidden />} onClick={() => setConfirmLaunch(true)}>
                Launch
              </Button>
            }
          >
            Review the first drafts, then launch. Recipients are already claimed for you.
          </Callout>
        )
      ) : campaign.status === "paused" ? (
        <Callout tone="warning" className="mb-5" title="Paused: nothing is sent until you resume">
          Scheduled emails and follow-ups wait. Replies still arrive in your Inbox.
        </Callout>
      ) : null}

      {/* Recipients per state: each tile filters the Recipients tab */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {RECIPIENT_STATES.map((s) => {
          const selected = tab === "recipients" && filter === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={selected}
              onClick={() => openFilter(s)}
              className={cx(
                "block min-w-0 rounded-xl text-left [&>div]:h-full [&>div]:transition-shadow",
                selected ? "[&>div]:ring-2 [&>div]:ring-indigo-500" : "hover:[&>div]:ring-zinc-300",
              )}
            >
              <StatTile
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <StateLegendDot state={s} />
                    {RECIPIENT_STATE_LABELS[s]}
                  </span>
                }
                value={counts[s]}
              />
            </button>
          );
        })}
        <Link href="/inbox" className="block min-w-0 rounded-xl [&>div]:h-full [&>div]:transition-shadow hover:[&>div]:ring-zinc-300">
          <StatTile
            label={
              <span className="inline-flex items-center gap-1">
                Replies <ArrowUpRight className="size-3" aria-hidden />
              </span>
            }
            value={
              <span className="flex items-baseline gap-2">
                {replies.length}
                {unhandled > 0 ? <span className="text-xs font-medium tracking-normal text-emerald-700">{unhandled} to handle</span> : null}
              </span>
            }
          />
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-zinc-200" role="tablist">
        {(
          [
            { key: "review", label: "Review queue", count: queue.length },
            { key: "recipients", label: "Recipients", count: recipients.length },
            { key: "settings", label: "Settings", count: null },
          ] as { key: DetailTab; label: string; count: number | null }[]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key ? "border-indigo-600 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800",
            )}
          >
            {t.label}
            {t.count !== null ? (
              <span
                className={cx(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  t.key === "review" && t.count > 0 ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-600",
                )}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
        <span className="ml-auto hidden shrink-0 pr-1 text-xs tabular-nums text-zinc-500 sm:block">{sentCount(recipients)} emails sent</span>
      </div>

      {tab === "review" ? (
        <ReviewQueue state={state} campaign={campaign} items={queue} canEdit={canEdit} selectedId={selectedReview} onSelect={setSelectedReview} />
      ) : tab === "recipients" ? (
        <RecipientsPanel
          state={state}
          campaign={campaign}
          filter={filter}
          onFilter={setFilter}
          onOpen={setThreadId}
          onAdd={canEdit && !noMailbox ? () => setAdding(true) : null}
          addBlockedReason={canEdit ? noMailboxReason : null}
        />
      ) : (
        <CampaignSettings state={state} campaign={campaign} canEdit={canEdit} />
      )}

      <RecipientThread state={state} campaign={campaign} recipientId={threadId} onClose={() => setThreadId(null)} onReview={reviewRecipient} />
      {canEdit ? <AddRecipientsDialog state={state} campaign={campaign} open={adding && !noMailbox} onClose={() => setAdding(false)} /> : null}

      <Modal
        open={confirmLaunch}
        onClose={() => setConfirmLaunch(false)}
        title={`Launch "${campaign.name}"?`}
        description="Emails go out within the sending window, from your Sending Mailboxes and within their daily caps."
        footer={
          <>
            <Button onClick={() => setConfirmLaunch(false)}>Cancel</Button>
            <Button variant="primary" icon={<Rocket className="size-3.5" aria-hidden />} loading={busy === "launch"} onClick={() => void run("launch")}>
              Launch Campaign
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm leading-6 text-zinc-600">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3">
            <span className="flex items-center gap-1.5 text-zinc-700">
              <Coins className="size-4 text-zinc-400" aria-hidden /> {live.length} recipients, at most
            </span>
            <span className="font-semibold tabular-nums text-zinc-900">{formatCredits(Math.max(maxEmails, live.length * campaign.sequence.length) * PRICES.emailSent)} Credits</span>
          </div>
          <p>
            {PRICES.emailSent} Credit per email sent{" "}
            <span className="whitespace-nowrap">
              <PriceHint />,
            </span>{" "}
            charged only when an email leaves. Balance: <span className="font-medium tabular-nums text-zinc-900">{formatCredits(state.workspace?.credits ?? 0)} Credits</span>.
          </p>
          {queue.length > 0 ? <Callout tone="info">{queue.length} drafts still wait for your review: they are sent once you approve them.</Callout> : null}
        </div>
      </Modal>
    </PageContainer>
  );
}
