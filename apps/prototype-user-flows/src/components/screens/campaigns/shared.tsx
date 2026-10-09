"use client";

// Domain building blocks shared by the campaigns screens: status badges, the email card with its
// mandatory footer (ADR-0002, ADR-0005), and the loading / error / sign-up / free-trial gates.

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Building, Coins, Lock, Mail, UserRound } from "lucide-react";
import { EmailFooterBlock } from "@/components/domain/email-footer";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import { SignedOutState } from "@/components/ui/signed-out-state";
import { formatCredits, formatDate } from "@/lib/format";
import {
  AUDIENCE_LABELS,
  CAMPAIGN_STATUS_LABELS,
  MAILBOX_STATUS_LABELS,
  RECIPIENT_STATE_LABELS,
  REPLY_CATEGORY_LABELS,
  VERIFICATION_LABELS,
} from "@/lib/labels";
import { PRICES } from "@/lib/pricing";
import type {
  CampaignAudience,
  CampaignStatus,
  ClientState,
  ContactValue,
  Language,
  MailboxStatus,
  Message,
  RecipientState,
  ReplyCategory,
  SendingMailbox,
} from "@/lib/types";
import { Badge, ButtonLink, Card, PageContainer, PageHeader, PriceHint, Skeleton, cx, type Tone } from "./ui";

/* ------------------------------------------------------------------ */
/* Breadcrumbs                                                         */
/* ------------------------------------------------------------------ */

/** Above the page header, like the Prospect and Candidate pages: "Campaigns / <current page>". */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-500">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className={cx("flex min-w-0 items-center gap-1.5", i === items.length - 1 && "truncate")}>
            {i > 0 ? (
              <span className="text-zinc-300" aria-hidden>
                /
              </span>
            ) : null}
            {item.href ? (
              <Link href={item.href} className="whitespace-nowrap hover:text-zinc-800">
                {item.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-zinc-700" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

const CAMPAIGN_STATUS_TONES: Record<CampaignStatus, Tone> = { draft: "neutral", active: "green", paused: "amber" };

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge tone={CAMPAIGN_STATUS_TONES[status]}>{CAMPAIGN_STATUS_LABELS[status]}</Badge>;
}

export function AudienceBadge({ audience }: { audience: CampaignAudience }) {
  return audience === "hiring_contacts" ? (
    <Badge tone="blue" icon={<Building className="size-3" aria-hidden />}>
      {AUDIENCE_LABELS.hiring_contacts}
    </Badge>
  ) : (
    <Badge tone="violet" icon={<UserRound className="size-3" aria-hidden />}>
      {AUDIENCE_LABELS.candidates}
    </Badge>
  );
}

export const RECIPIENT_STATE_TONES: Record<RecipientState, Tone> = {
  awaiting_review: "amber",
  scheduled: "blue",
  sent: "indigo",
  replied: "green",
  stopped: "neutral",
};

export function RecipientStateBadge({ state }: { state: RecipientState }) {
  return <Badge tone={RECIPIENT_STATE_TONES[state]}>{RECIPIENT_STATE_LABELS[state]}</Badge>;
}

export const REPLY_CATEGORY_TONES: Record<ReplyCategory, Tone> = {
  interested: "green",
  not_now: "amber",
  not_interested: "neutral",
  opt_out: "red",
  out_of_office: "sky",
  referral: "violet",
  bounce: "red",
};

export function ReplyCategoryBadge({ category }: { category: ReplyCategory }) {
  return <Badge tone={REPLY_CATEGORY_TONES[category]}>{REPLY_CATEGORY_LABELS[category]}</Badge>;
}

const MAILBOX_STATUS_TONES: Record<MailboxStatus, Tone> = { warming: "sky", active: "green", paused: "amber", refused: "red" };

export function MailboxStatusBadge({ status, rampDay }: { status: MailboxStatus; rampDay?: number }) {
  return (
    <Badge tone={MAILBOX_STATUS_TONES[status]}>
      {MAILBOX_STATUS_LABELS[status]}
      {status === "warming" && rampDay ? <span className="font-normal opacity-80">day {rampDay}</span> : null}
    </Badge>
  );
}

function mailboxStatusText(m: SendingMailbox): string {
  return m.status === "warming" ? `${MAILBOX_STATUS_LABELS.warming}, day ${m.rampDay}` : MAILBOX_STATUS_LABELS[m.status];
}

/** Paused and refused mailboxes first, then ramping, then active: the one that needs attention shows. */
const MAILBOX_ATTENTION: Record<MailboxStatus, number> = { paused: 0, refused: 1, warming: 2, active: 3 };

/**
 * A Sending Mailbox address that is never cut with an ellipsis: in a narrow cell it breaks before
 * the "@" ("vincent" over "@ateliertalent-hq.com"), and only a part too long for the cell on its own
 * breaks anywhere.
 */
export function MailboxAddress({ address, className }: { address: string; className?: string }) {
  const at = address.lastIndexOf("@");
  const part = "inline-block max-w-full [overflow-wrap:anywhere]";
  return (
    <span className={cx("min-w-0", className)} title={address}>
      {at > 0 ? (
        <>
          <span className={part}>{address.slice(0, at)}</span>
          <wbr />
          <span className={part}>{address.slice(at)}</span>
        </>
      ) : (
        <span className={part}>{address}</span>
      )}
    </span>
  );
}

/**
 * Sending Mailboxes in a narrow table cell: one address, wrapping before the "@" when it does not
 * fit, with "+N" for the others on its first line (every address and status in its tooltip), and the
 * status stacked under the address when it is not active.
 */
export function MailboxesSummary({ mailboxes, empty }: { mailboxes: SendingMailbox[]; empty?: ReactNode }) {
  if (mailboxes.length === 0) return <>{empty ?? <span className="text-xs text-zinc-400">-</span>}</>;
  const sorted = [...mailboxes].sort((a, b) => MAILBOX_ATTENTION[a.status] - MAILBOX_ATTENTION[b.status]);
  const first = sorted[0];
  const others = sorted.length - 1;
  const all = sorted.map((m) => `${m.address} (${mailboxStatusText(m)})`).join("\n");
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-start gap-1.5 text-xs leading-5">
        <MailboxAddress address={first.address} className="text-zinc-700" />
        {others > 0 ? (
          <span
            title={all}
            aria-label={`${others} more: ${sorted
              .slice(1)
              .map((m) => m.address)
              .join(", ")}`}
            className="mt-0.5 shrink-0 cursor-default rounded bg-zinc-100 px-1 text-[11px] font-medium leading-4 tabular-nums text-zinc-600 ring-1 ring-inset ring-zinc-200"
          >
            +{others}
          </span>
        ) : null}
      </div>
      {first.status !== "active" ? (
        <div className="mt-1">
          <MailboxStatusBadge status={first.status} rampDay={first.rampDay} />
        </div>
      ) : null}
    </div>
  );
}

export function VerificationBadge({ value }: { value: ContactValue }) {
  const tone: Tone = value.verification === "valid" ? "green" : value.verification === "catch_all" ? "amber" : value.verification === "invalid" ? "red" : "neutral";
  return <Badge tone={tone}>{VERIFICATION_LABELS[value.verification]}</Badge>;
}

export function LanguageChip({ language }: { language: Language }) {
  return (
    <span
      title={language === "fr" ? "Drafted in French" : "Drafted in English"}
      className="inline-flex h-5 shrink-0 items-center rounded border border-zinc-200 bg-white px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
    >
      {language}
    </span>
  );
}

/** Score with a thin bar, tabular numbers. */
export function ScoreBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const tone = v >= 70 ? "bg-indigo-600" : v >= 45 ? "bg-indigo-400" : "bg-zinc-300";
  return (
    <span className="inline-flex items-center gap-2" title={`${label} ${v}`}>
      <span className="w-6 text-right text-sm tabular-nums text-zinc-900">{v}</span>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-zinc-100" aria-hidden>
        <span className={cx("block h-full rounded-full", tone)} style={{ width: `${v}%` }} />
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Recipient state bar                                                 */
/* ------------------------------------------------------------------ */

const BAR_COLORS: Record<RecipientState, string> = {
  awaiting_review: "bg-amber-400",
  scheduled: "bg-blue-400",
  sent: "bg-indigo-500",
  replied: "bg-emerald-500",
  stopped: "bg-zinc-300",
};

export function StateBar({ counts, total }: { counts: Record<RecipientState, number>; total: number }) {
  const order: RecipientState[] = ["replied", "sent", "scheduled", "awaiting_review", "stopped"];
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
      {total > 0
        ? order.map((s) => (counts[s] > 0 ? <span key={s} className={BAR_COLORS[s]} style={{ width: `${(100 * counts[s]) / total}%` }} /> : null))
        : null}
    </div>
  );
}

export function StateLegendDot({ state }: { state: RecipientState }) {
  return <span aria-hidden className={cx("inline-block size-2 shrink-0 rounded-full", BAR_COLORS[state])} />;
}

/* ------------------------------------------------------------------ */
/* Email card with its footer                                          */
/* ------------------------------------------------------------------ */

/** "<address>" after the sender's name, or a warning when the Campaign has no Sending Mailbox to send from. */
export function SenderAddress({ address }: { address: string | null | undefined }) {
  return address ? <>&lt;{address}&gt;</> : <span className="text-amber-700">(no Sending Mailbox)</span>;
}

export function EmailCard({
  message,
  to,
  toName,
  status,
  className,
}: {
  message: Message;
  to: string | null;
  toName?: string;
  status?: ReactNode;
  className?: string;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  return (
    <article className={cx("min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white", className)}>
      <header className="space-y-1 border-b border-zinc-100 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge tone="neutral" icon={<Mail className="size-3" aria-hidden />}>
              {message.origin === "response" ? "Response" : `Email ${message.step}`}
            </Badge>
            <LanguageChip language={message.language} />
            {message.editedByRecruiter ? <Badge tone="indigo">Edited by you</Badge> : null}
          </div>
          {status ? <div className="text-xs text-zinc-500">{status}</div> : null}
        </div>
        <dl className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-2 text-xs leading-5 text-zinc-500">
          <dt>From</dt>
          <dd className="truncate text-zinc-700">
            {message.footer.senderName} <SenderAddress address={message.footer.senderEmail} />
          </dd>
          <dt>To</dt>
          <dd className="truncate text-zinc-700">{to ? (toName ? `${toName} <${to}>` : to) : toName ?? "-"}</dd>
        </dl>
        <div className="pt-1 text-sm font-semibold text-zinc-900">{message.subject}</div>
      </header>
      <div className="whitespace-pre-wrap break-words px-4 py-3 text-sm leading-6 text-zinc-800">{message.body}</div>
      {message.editedByRecruiter && message.originalBody ? (
        <div className="px-4 pb-3">
          <button type="button" onClick={() => setShowOriginal((v) => !v)} className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
            {showOriginal ? "Hide the Outreach Agent's draft" : "Show the Outreach Agent's draft"}
          </button>
          {showOriginal ? (
            <div className="mt-2 whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] leading-6 text-zinc-500 line-through decoration-zinc-300">
              {message.originalBody}
            </div>
          ) : null}
        </div>
      ) : null}
      <EmailFooterBlock footer={message.footer} />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Gates                                                               */
/* ------------------------------------------------------------------ */

/** Free trial: people are Previews only, so Campaigns lead to buying Credits (ADR-0018). */
export function FreeTrialPaywall({ credits }: { credits: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="px-6 py-8">
          <div className="flex size-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <Lock className="size-5" aria-hidden />
          </div>
          <h2 className="mt-4 text-base font-semibold text-zinc-900">Campaigns start once you buy Credits</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-zinc-600">
            In the free trial, Hiring Contacts and Candidates are Previews only: an anonymised summary, never stored, so there is nobody to email yet. Buy
            Credits to reveal the people from your Test Run, enrich them and add them to a Campaign.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/credits" variant="primary" icon={<Coins className="size-3.5" aria-hidden />}>
              Buy Credits
            </ButtonLink>
            <ButtonLink href="/niches">Back to my Niches</ButtonLink>
          </div>
        </div>
        <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-6 md:border-l md:border-t-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">What a Campaign costs</div>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            <li className="flex items-baseline justify-between gap-3">
              <span>Verified email</span>
              <span className="shrink-0 tabular-nums">{PRICES.verifiedEmail} Credits</span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span>Email sent, including your responses to replies</span>
              <span className="shrink-0 tabular-nums">{PRICES.emailSent} Credit</span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span>Drafting</span>
              <span className="shrink-0 tabular-nums">Free</span>
            </li>
          </ul>
          <div className="mt-3">
            <PriceHint />
          </div>
          <div className="mt-4 border-t border-zinc-200 pt-3 text-xs text-zinc-500">
            Balance: <span className="font-medium tabular-nums text-zinc-800">{formatCredits(credits)}</span> Credits
          </div>
        </div>
      </div>
    </Card>
  );
}

export function Gate({
  state,
  error,
  skeleton,
  requirePaid = true,
  children,
}: {
  state: ClientState | null;
  error: string | null;
  skeleton: ReactNode;
  requirePaid?: boolean;
  children: (state: ClientState) => ReactNode;
}) {
  if (!state) return error ? <BackendErrorState error={error} /> : <PageContainer>{skeleton}</PageContainer>;
  if (!state.workspace) {
    return (
      <PageContainer>
        <PageHeader title="Campaigns" />
        <SignedOutState what="run Campaigns" />
      </PageContainer>
    );
  }
  if (requirePaid && state.workspace.plan === "free_trial") {
    return (
      <PageContainer>
        <PageHeader title="Campaigns" description="Outreach to Hiring Contacts or Candidates within one Niche, from your own Sending Mailboxes." />
        <FreeTrialPaywall credits={state.workspace.credits} />
      </PageContainer>
    );
  }
  return <>{children(state)}</>;
}

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */

export function HeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card>
      <div className="border-b border-zinc-200 px-4 py-3">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-zinc-100">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="hidden h-4 w-40 sm:block" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function formatOn(prefix: string, iso: string | null): string {
  return iso ? `${prefix} ${formatDate(iso)}` : "-";
}
