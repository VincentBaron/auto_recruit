"use client";

// The daily Digest, rendered as the email the Recruiter receives: new replies by Reply Category with
// the suggested next step, replies still waiting, Data Requests due, the best new Feed items, Sending
// Mailbox health, Credits remaining and Candidates deleted by retention.
// The URL is the only source of truth for the Digest shown (?on=YYYY-MM-DD), so Back restores it.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Coins, Hourglass, Mail, MailCheck, Newspaper, ShieldCheck, Sunrise, Trash, TriangleAlert } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import { Select } from "@/components/ui/select";
import { SignedOutState } from "@/components/ui/signed-out-state";
import { formatCreditsLabel, formatDate, formatNumber, formatRelative, formatWeekdayDate, plural } from "@/lib/format";
import { MAILBOX_STATUS_LABELS, RETENTION } from "@/lib/labels";
import type { Digest, DigestReplyGroup, MailboxStatus } from "@/lib/types";
import { useAppState, useBackendError } from "@/lib/api";
import { CategoryBadge } from "./category";
import { currentRecruiterOf } from "./model";
import { Badge, EmptyState, Skeleton, cx } from "./ui";

const MAILBOX_TONES: Record<MailboxStatus, { badge: "green" | "sky" | "amber" | "red"; dot: string }> = {
  active: { badge: "green", dot: "bg-emerald-500" },
  warming: { badge: "sky", dot: "bg-sky-500" },
  paused: { badge: "amber", dot: "bg-amber-500" },
  refused: { badge: "red", dot: "bg-rose-500" },
};

const DIGEST_SENDER = "digest@autorecruit.example";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function countReplies(groups: DigestReplyGroup[]): number {
  return groups.reduce((n, g) => n + g.items.length, 0);
}

function subjectFor(digest: Digest): string {
  const replies = countReplies(digest.newReplies);
  const deleted = digest.deletedByRetention + digest.deletedAtRetentionEnd;
  const parts: string[] = [];
  if (replies > 0) parts.push(plural(replies, "new reply", "new replies"));
  if (digest.bestNewFeedItems.length > 0) parts.push(`${plural(digest.bestNewFeedItems.length, "Feed item")} worth a look`);
  if (deleted > 0) parts.push(`${plural(deleted, "Candidate")} deleted`);
  if (parts.length === 0) parts.push(`${formatCreditsLabel(digest.creditsRemaining)} left`);
  return `Your Digest for ${formatWeekdayDate(digest.on)}: ${parts.join(", ")}`;
}

const NAV_BUTTON =
  "inline-flex size-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-500 shadow-xs hover:border-zinc-400 hover:text-zinc-900 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-300 disabled:shadow-none";

export function DigestScreen() {
  const state = useAppState();
  const backendError = useBackendError();
  const params = useSearchParams();
  const pathname = usePathname();
  const onParam = params.get("on");
  const selectedOn = onParam && ISO_DATE.test(onParam) ? onParam : null;

  if (!state) return backendError ? <BackendErrorState error={backendError} /> : <DigestSkeleton />;

  const me = currentRecruiterOf(state);
  const digests = state.digests
    .filter((d) => d.recruiterId === me?.id)
    .sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
  const index = Math.max(0, digests.findIndex((d) => d.on === selectedOn));
  const digest = digests[index] ?? null;

  // Native history update, synced with useSearchParams by Next.js: the URL holds the Digest shown.
  function pick(on: string) {
    window.history.replaceState(null, "", `${pathname}?on=${on}`);
  }

  const signedIn = !!state.workspace && !!me;
  const header = (
    <PageHeader
      title="Digest"
      description={`The email ${me ? me.name.split(" ")[0] : "each Recruiter"} receives every morning. Advance the simulated day to receive the next one.`}
      actions={
        signedIn && digest ? (
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="Older Digest" disabled={index >= digests.length - 1} onClick={() => pick(digests[index + 1].on)} className={NAV_BUTTON}>
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <Select aria-label="Digest date" value={digest.on} onChange={(e) => pick(e.target.value)} className="w-56 tabular-nums">
              {digests.map((d) => (
                <option key={d.id} value={d.on}>
                  {formatWeekdayDate(d.on)}
                  {d.on === state.clock.today ? " (today)" : ""}
                </option>
              ))}
            </Select>
            <button type="button" aria-label="Newer Digest" disabled={index <= 0} onClick={() => pick(digests[index - 1].on)} className={NAV_BUTTON}>
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        ) : null
      }
    />
  );

  return (
    <PageContainer>
      {header}
      {!signedIn || !me || !state.workspace ? (
        <SignedOutState what="receive your Digest every morning" />
      ) : !digest ? (
        <div className="rounded-xl border border-zinc-200 bg-white">
          <EmptyState icon={Mail} title="No Digest yet">
            Your first Digest arrives the morning after your agents first run. Advance the simulated day to receive it.
          </EmptyState>
        </div>
      ) : (
        <DigestEmail digest={digest} recipientName={me.name} recipientEmail={me.email} workspaceName={state.workspace.name} isToday={digest.on === state.clock.today} />
      )}
    </PageContainer>
  );
}

function DigestEmail({
  digest,
  recipientName,
  recipientEmail,
  workspaceName,
  isToday,
}: {
  digest: Digest;
  recipientName: string;
  recipientEmail: string;
  workspaceName: string;
  isToday: boolean;
}) {
  const replyCount = countReplies(digest.newReplies);
  const waitingCount = countReplies(digest.waitingReplies);
  const first = recipientName.split(" ")[0];
  const summary: string[] = [];
  summary.push(replyCount > 0 ? `${plural(replyCount, "new reply", "new replies")} to look at` : "no new replies");
  if (waitingCount > 0) summary.push(`${plural(waitingCount, "reply", "replies")} still waiting for you`);
  summary.push(digest.bestNewFeedItems.length > 0 ? `${plural(digest.bestNewFeedItems.length, "new Feed item")} with strong Signals` : "no standout Feed items");
  summary.push(`${formatCreditsLabel(digest.creditsRemaining)} left`);

  return (
    <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      {/* Mail client header */}
      <header className="border-b border-zinc-200 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 text-base font-semibold text-zinc-900">{subjectFor(digest)}</h2>
          {isToday ? <Badge tone="indigo">Today</Badge> : null}
        </div>
        <dl className="mt-2 grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
          <dt className="text-zinc-500">From</dt>
          <dd className="truncate text-zinc-800">
            Auto Recruit <span className="text-zinc-500">&lt;{DIGEST_SENDER}&gt;</span>
          </dd>
          <dt className="text-zinc-500">To</dt>
          <dd className="truncate text-zinc-800">
            {recipientName} <span className="text-zinc-500">&lt;{recipientEmail}&gt;</span>
          </dd>
          <dt className="text-zinc-500">Date</dt>
          <dd className="text-zinc-800 tabular-nums">{formatWeekdayDate(digest.on)}, 07:00</dd>
        </dl>
      </header>

      {/* Email body */}
      <div className="bg-zinc-100/80 px-3 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-[640px] overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 sm:px-7">
            <span className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-indigo-600 text-[10px] font-bold text-white">AR</span>
              <span className="text-sm font-semibold text-zinc-900">Auto Recruit</span>
            </span>
            <span className="text-xs text-zinc-500">Digest · {formatWeekdayDate(digest.on)}</span>
          </div>

          <div className="px-5 py-6 sm:px-7">
            <p className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
              <Sunrise className="size-5 text-amber-500" aria-hidden />
              Good morning, {first}.
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">Today you have {summary.join(", ")}.</p>

            <DigestSection icon={Mail} title="New replies" count={replyCount}>
              {replyCount === 0 ? <p className="text-sm text-zinc-500">No new replies since yesterday.</p> : <ReplyGroups groups={digest.newReplies} />}
            </DigestSection>

            {waitingCount > 0 ? (
              <DigestSection icon={Hourglass} title="Still waiting for you" count={waitingCount}>
                <p className="mb-3 text-sm text-zinc-600">Older replies to your Campaigns that nobody has handled yet.</p>
                <ReplyGroups groups={digest.waitingReplies} />
                <EmailLink href="/inbox">Open the Inbox</EmailLink>
              </DigestSection>
            ) : null}

            {digest.dataRequestsDue.length > 0 ? (
              <DigestSection icon={ShieldCheck} title="Data Requests due" count={digest.dataRequestsDue.length}>
                <ul className="divide-y divide-zinc-100 rounded-md ring-1 ring-zinc-200">
                  {digest.dataRequestsDue.map((dr) => (
                    <li key={dr.id} className="flex items-start gap-3 px-3 py-2.5">
                      <span aria-hidden className={cx("mt-1.5 size-2 shrink-0 rounded-full", dr.overdue ? "bg-rose-500" : "bg-amber-500")} />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">{dr.personQuery}</p>
                      <p className={cx("shrink-0 text-xs tabular-nums", dr.overdue ? "font-medium text-rose-600" : "text-zinc-500")}>
                        {dr.overdue ? `Overdue since ${formatDate(dr.dueOn)}` : `Due ${formatDate(dr.dueOn)} (${formatRelative(dr.dueOn, digest.on)})`}
                      </p>
                    </li>
                  ))}
                </ul>
                <EmailLink href="/settings/privacy">Answer them in Data &amp; privacy</EmailLink>
              </DigestSection>
            ) : null}

            <DigestSection icon={Newspaper} title="Best new Feed items" count={digest.bestNewFeedItems.length}>
              {digest.bestNewFeedItems.length === 0 ? (
                <p className="text-sm text-zinc-500">Nothing new above your Fit threshold stands out today.</p>
              ) : (
                <>
                  <ul className="divide-y divide-zinc-100 rounded-md ring-1 ring-zinc-200">
                    {digest.bestNewFeedItems.map((item) => (
                      <li key={`${item.kind}-${item.id}`}>
                        <Link
                          href={item.kind === "prospect" ? `/prospects/${item.id}` : `/candidates/${item.id}`}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-zinc-900">
                              {item.name}
                              <Badge tone={item.kind === "prospect" ? "neutral" : "indigo"}>{item.kind === "prospect" ? "Prospect" : "Candidate"}</Badge>
                            </p>
                            <p className="mt-0.5 truncate text-sm text-zinc-600">{item.headline}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-base font-semibold tabular-nums text-zinc-900">{item.signalStrength}</p>
                            <p className="text-[11px] text-zinc-500">Signal Strength</p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <EmailLink href="/feed">Open the Feed</EmailLink>
                </>
              )}
            </DigestSection>

            <DigestSection icon={MailCheck} title="Sending Mailbox health" count={digest.mailboxHealth.length}>
              {digest.mailboxHealth.length === 0 ? (
                <p className="text-sm text-zinc-500">No Sending Mailbox connected yet.</p>
              ) : (
                <>
                  <ul className="divide-y divide-zinc-100 rounded-md ring-1 ring-zinc-200">
                    {digest.mailboxHealth.map((m) => {
                      const tone = MAILBOX_TONES[m.status];
                      const sent = m.status === "refused" ? null : `${formatNumber(m.sentYesterday)} / ${formatNumber(m.dailyCap)} sent yesterday`;
                      return (
                        <li key={m.mailboxId} className="flex items-start gap-3 px-3 py-2.5">
                          <span aria-hidden className={cx("mt-1.5 size-2 shrink-0 rounded-full", tone.dot)} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-900">{m.address}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{m.note}</p>
                            {/* On a phone the count sits under the note, so the address keeps the width. */}
                            {sent ? <p className="mt-0.5 text-xs tabular-nums text-zinc-500 sm:hidden">{sent}</p> : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <Badge tone={tone.badge}>{MAILBOX_STATUS_LABELS[m.status]}</Badge>
                            {sent ? <p className="mt-1 hidden whitespace-nowrap text-xs tabular-nums text-zinc-500 sm:block">{sent}</p> : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <EmailLink href="/settings/mailboxes">Manage Sending Mailboxes</EmailLink>
                </>
              )}
            </DigestSection>

            <DigestSection icon={Coins} title="Credits">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-2xl font-semibold tabular-nums text-zinc-900">
                  {formatNumber(digest.creditsRemaining)}
                  <span className="ml-1.5 text-sm font-normal text-zinc-500">Credits remaining</span>
                </p>
                <p className="text-sm tabular-nums text-zinc-600">{formatCreditsLabel(digest.creditsSpentYesterday)} spent yesterday</p>
              </div>
              <EmailLink href="/credits">See the Credit ledger</EmailLink>
            </DigestSection>

            <DigestSection icon={Trash} title="Retention">
              <ul className="space-y-1.5 text-sm leading-relaxed text-zinc-700">
                <RetentionLine>
                  {digest.deletedByRetention > 0 ? (
                    <>
                      <span className="font-semibold tabular-nums">{plural(digest.deletedByRetention, "Candidate")}</span> deleted under the {RETENTION.surfacedCandidateDays}-day
                      retention rule: never Contacted in the {RETENTION.surfacedCandidateDays} days after being Surfaced.
                    </>
                  ) : (
                    <>No Candidate deleted under the {RETENTION.surfacedCandidateDays}-day retention rule.</>
                  )}
                </RetentionLine>
                <RetentionLine>
                  {digest.deletedAtRetentionEnd > 0 ? (
                    <>
                      <span className="font-semibold tabular-nums">{plural(digest.deletedAtRetentionEnd, "Candidate")}</span> deleted at the end of their retention after
                      Contact: {RETENTION.contactedNoConsentDays} days after the first email without Consent, or at the end of the consented period.
                    </>
                  ) : (
                    <>No Candidate reached the end of their retention after Contact.</>
                  )}
                </RetentionLine>
              </ul>
            </DigestSection>

            {digest.notes.length > 0 ? (
              <DigestSection icon={TriangleAlert} title="Notes">
                <ul className="space-y-1.5">
                  {digest.notes.map((note, i) => (
                    <li key={i} className="flex gap-2 text-sm text-zinc-700">
                      <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-zinc-400" />
                      {note}
                    </li>
                  ))}
                </ul>
              </DigestSection>
            ) : null}
          </div>

          <footer className="border-t border-zinc-100 bg-zinc-50 px-5 py-4 text-xs leading-relaxed text-zinc-500 sm:px-7">
            Sent to {recipientEmail} because you are a Recruiter in {workspaceName}. Your Digest arrives every morning at 07:00 with what happened since the day before.
          </footer>
        </div>
      </div>
    </article>
  );
}

function ReplyGroups({ groups }: { groups: DigestReplyGroup[] }) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.category}>
          <div className="flex items-center gap-2">
            <CategoryBadge category={group.category} />
            <span className="text-xs tabular-nums text-zinc-400">{group.items.length}</span>
          </div>
          <ul className="mt-2 divide-y divide-zinc-100 rounded-md ring-1 ring-zinc-200">
            {group.items.map((item) => (
              <li key={item.replyId} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">
                    {item.personLabel}
                    {item.prospectName ? <span className="font-normal text-zinc-500"> · {item.prospectName}</span> : null}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-600">{item.suggestedNextStep}</p>
                </div>
                <Link
                  href={`/inbox?reply=${encodeURIComponent(item.replyId)}`}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500"
                >
                  Open in Inbox
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RetentionLine({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-zinc-400" />
      <span>{children}</span>
    </li>
  );
}

function DigestSection({ icon: Icon, title, count, children }: { icon: typeof Mail; title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mt-7 border-t border-zinc-100 pt-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <Icon className="size-4 text-zinc-400" aria-hidden />
        {title}
        {count !== undefined ? <span className="font-medium tabular-nums text-zinc-400">{count}</span> : null}
      </h3>
      {children}
    </section>
  );
}

function EmailLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500">
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/** Same frame as the loaded page (PageContainer, PageHeader), also the Suspense fallback of the route. */
export function DigestSkeleton() {
  return (
    <PageContainer>
      <div aria-busy="true" aria-label="Loading the Digest">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-5 w-96 max-w-full" />
          </div>
          <Skeleton className="h-8 w-[18.75rem] max-w-full" />
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="space-y-2 border-b border-zinc-200 px-5 py-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <div className="bg-zinc-100/80 px-3 py-8 sm:px-6">
            <div className="mx-auto max-w-[640px] space-y-4 rounded-lg bg-white p-7 ring-1 ring-zinc-200">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
