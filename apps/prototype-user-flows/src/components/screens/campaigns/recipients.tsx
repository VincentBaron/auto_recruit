"use client";

// Recipients of a Campaign grouped by state, and the per-recipient thread (emails with their
// footer, replies with their automatic effects, the response the Recruiter sent).

import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import { ArrowUpRight, CircleSlash, Clock, ExternalLink, Lock, MessageSquareReply, Search, ShieldCheck, Users, Zap } from "lucide-react";
import { formatDate, formatRelative, formatWeekdayDate } from "@/lib/format";
import { CONSENT_LABELS, RECIPIENT_STATE_LABELS, REPLY_CATEGORY_LABELS } from "@/lib/labels";
import type { Campaign, ClientState, Message, Recipient, RecipientState, Reply } from "@/lib/types";
import { RECIPIENT_STATES, mailboxById, nextCampaignMessage, recipientPerson, recipientsOf, recruiterName, sentSteps, stateCounts } from "./derive";
import { RetentionBadge } from "@/components/domain/person-badges";
import { isOutOfOfficePaused, nextSend } from "./next-send";
import { EmailCard, LanguageChip, MailboxAddress, MailboxesSummary, RecipientStateBadge, ReplyCategoryBadge, StateLegendDot, VerificationBadge } from "./shared";
import { Badge, ButtonLink, Card, Drawer, EmptyState, Segmented, TextInput, cx } from "./ui";

export type RecipientFilter = "all" | RecipientState;

const STATE_ORDER: Record<RecipientState, number> = { awaiting_review: 0, scheduled: 1, sent: 2, replied: 3, stopped: 4 };

function latestReply(state: ClientState, r: Recipient): Reply | undefined {
  const replies = state.replies.filter((x) => x.recipientId === r.id);
  return replies[replies.length - 1];
}

function NextCell({ state, campaign, r }: { state: ClientState; campaign: Campaign; r: Recipient }) {
  const today = state.clock.today;
  if (r.state === "replied" || r.state === "stopped") return <span className="text-zinc-400">No next email</span>;
  if (r.state === "awaiting_review") return <span className="text-amber-700">After your review</span>;
  if (r.pausedUntil && isOutOfOfficePaused(r, today)) return <span className="text-sky-700">Paused until {formatDate(r.pausedUntil)}</span>;
  const next = nextCampaignMessage(r);
  if (!next) return <span className="text-zinc-500">Sequence complete</span>;
  if (next.status === "draft") return <span className="text-amber-700">Follow-up {next.step - 1} to review</span>;
  const send = nextSend(state, campaign, r, next.step);
  if (send.kind === "on_hold") return <span className="text-zinc-500">On hold while {send.campaignStatus === "paused" ? "paused" : "a draft"}</span>;
  if (send.kind === "waiting") return <span className="text-amber-700">Waiting for {send.waitsFor}</span>;
  return (
    <span className="text-zinc-700">
      {next.step === 1 ? "Email 1" : `Follow-up ${next.step - 1}`} <span className="text-zinc-500">{formatRelative(send.date, today)}</span>
    </span>
  );
}

function MailboxCell({ state, r }: { state: ClientState; r: Recipient }) {
  const mailbox = mailboxById(state, r.mailboxId);
  if (!mailbox) return <span className="text-xs text-amber-700">No Sending Mailbox</span>;
  return <MailboxesSummary mailboxes={[mailbox]} />;
}

function ReplyCell({ reply }: { reply: Reply | undefined }) {
  if (!reply) return <span className="text-zinc-400">-</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <ReplyCategoryBadge category={reply.category} />
      {!reply.handled ? <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" title="To handle" aria-label="To handle" /> : null}
    </span>
  );
}

export function RecipientsPanel({
  state,
  campaign,
  filter,
  onFilter,
  onOpen,
  onAdd,
  addBlockedReason,
}: {
  state: ClientState;
  campaign: Campaign;
  filter: RecipientFilter;
  onFilter: (f: RecipientFilter) => void;
  onOpen: (recipientId: string) => void;
  onAdd: (() => void) | null;
  /** Why recipients cannot be added right now (no Sending Mailbox), shown instead of the button. */
  addBlockedReason?: string | null;
}) {
  const [query, setQuery] = useState("");
  const all = recipientsOf(state, campaign.id);
  const counts = stateCounts(all);
  const q = query.trim().toLowerCase();
  const rows = all
    .filter((r) => (filter === "all" || r.state === filter) && (!q || r.personLabel.toLowerCase().includes(q)))
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.addedOn < b.addedOn ? 1 : a.addedOn > b.addedOn ? -1 : 0));
  const groups = RECIPIENT_STATES.map((s) => ({ state: s, rows: rows.filter((r) => r.state === s) })).filter((g) => g.rows.length > 0);
  const today = state.clock.today;

  const groupLabel = (g: (typeof groups)[number]) => (
    <span className="inline-flex items-center gap-1.5">
      <StateLegendDot state={g.state} />
      {RECIPIENT_STATE_LABELS[g.state]}
      <span className="tabular-nums text-zinc-400">{g.rows.length}</span>
    </span>
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <Segmented
          label="Recipient state"
          size="sm"
          value={filter}
          onChange={onFilter}
          options={[{ value: "all" as RecipientFilter, label: "All", count: all.length }, ...RECIPIENT_STATES.map((s) => ({ value: s as RecipientFilter, label: RECIPIENT_STATE_LABELS[s], count: counts[s] }))]}
        />
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" aria-hidden />
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipients" className="w-full pl-8" aria-label="Search recipients" />
        </div>
      </div>
      {all.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No recipients yet"
          action={
            onAdd ? (
              <button type="button" onClick={onAdd} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                Add recipients
              </button>
            ) : null
          }
        >
          {addBlockedReason
            ? addBlockedReason
            : campaign.autoAddRule
              ? `Newly Enriched people at Signal Strength ${campaign.autoAddRule.minSignalStrength} or more join automatically.`
              : "Add Enriched people of the Niche. Recipients can join at any time."}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Search />} title="No recipient matches" />
      ) : (
        <>
          {/* Fixed columns (widths on the header cells, so a hidden column takes no room): from 1280px
              every column fits; from 768px the mailbox and date columns step aside. */}
          <table className="hidden w-full table-fixed text-left text-sm md:table">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                <th className="px-4 py-2.5 font-medium">Recipient</th>
                <th className="w-[132px] px-3 py-2.5 font-medium">State</th>
                <th className="w-[184px] px-3 py-2.5 font-medium">Emails</th>
                <th className="hidden w-[176px] px-3 py-2.5 font-medium xl:table-cell">Sending Mailbox</th>
                <th className="w-[132px] px-3 py-2.5 font-medium">Reply</th>
                <th className="hidden w-[100px] py-2.5 pl-2 pr-4 text-right font-medium xl:table-cell">Added</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.state}>
                  {filter === "all" ? (
                    <tr className="border-b border-zinc-100 bg-zinc-50/80">
                      <td colSpan={6} className="px-4 py-1.5 text-xs font-medium text-zinc-600">
                        {groupLabel(g)}
                      </td>
                    </tr>
                  ) : null}
                  {g.rows.map((r) => {
                    const person = recipientPerson(state, r);
                    const reply = latestReply(state, r);
                    return (
                      <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer border-b border-zinc-100 align-top last:border-b-0 hover:bg-zinc-50">
                        <td className="px-4 py-2.5">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpen(r.id);
                              }}
                              className={cx("min-w-0 truncate text-left font-medium hover:text-indigo-700", r.personDeleted ? "text-zinc-500 italic" : "text-zinc-900")}
                            >
                              {r.personLabel}
                            </button>
                            {person ? <LanguageChip language={person.language} /> : null}
                          </div>
                          <div className="truncate text-xs text-zinc-500">{person?.subtitle ?? "Data deleted, only the hash is kept"}</div>
                          {person?.deleteOn ? (
                            <div className="mt-1 flex">
                              <RetentionBadge deleteOn={person.deleteOn} today={today} onHold={person.retentionHold} />
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <RecipientStateBadge state={r.state} />
                          {r.state === "stopped" && r.stopReason ? (
                            <div className="mt-1 break-words text-xs text-zinc-500">{r.stopReason}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="tabular-nums text-zinc-700">
                            {sentSteps(r)} <span className="text-zinc-400">of {campaign.sequence.length} sent</span>
                          </div>
                          <div className="mt-0.5 text-xs">
                            <NextCell state={state} campaign={campaign} r={r} />
                          </div>
                        </td>
                        <td className="hidden px-3 py-2.5 xl:table-cell">
                          <MailboxCell state={state} r={r} />
                        </td>
                        <td className="px-3 py-2.5">
                          <ReplyCell reply={reply} />
                        </td>
                        <td className="hidden whitespace-nowrap py-2.5 pl-2 pr-4 text-right text-xs leading-5 tabular-nums text-zinc-500 xl:table-cell">{formatDate(r.addedOn)}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>

          {/* Phones: one line of facts per recipient instead of a table that scrolls sideways. */}
          <div className="md:hidden">
            {groups.map((g) => (
              <section key={g.state}>
                {filter === "all" ? <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-1.5 text-xs font-medium text-zinc-600">{groupLabel(g)}</div> : null}
                <ul className="divide-y divide-zinc-100 border-b border-zinc-100 last:border-b-0">
                  {g.rows.map((r) => {
                    const person = recipientPerson(state, r);
                    const reply = latestReply(state, r);
                    return (
                      <li key={r.id}>
                        <button type="button" onClick={() => onOpen(r.id)} className="block w-full px-4 py-3 text-left hover:bg-zinc-50">
                          <span className="flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className={cx("truncate font-medium", r.personDeleted ? "text-zinc-500 italic" : "text-zinc-900")}>{r.personLabel}</span>
                                {person ? <LanguageChip language={person.language} /> : null}
                              </span>
                              <span className="block truncate text-xs text-zinc-500">{person?.subtitle ?? "Data deleted, only the hash is kept"}</span>
                            </span>
                            <RecipientStateBadge state={r.state} />
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span className="tabular-nums text-zinc-500">
                              {sentSteps(r)} of {campaign.sequence.length} sent
                            </span>
                            <NextCell state={state} campaign={campaign} r={r} />
                            {reply ? <ReplyCell reply={reply} /> : null}
                            {person?.deleteOn ? <RetentionBadge deleteOn={person.deleteOn} today={today} onHold={person.retentionHold} /> : null}
                          </span>
                          {r.state === "stopped" && r.stopReason ? <span className="mt-1 block text-xs text-zinc-500">{r.stopReason}</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Thread drawer                                                       */
/* ------------------------------------------------------------------ */

type TimelineItem = { kind: "message"; date: string | null; order: number; message: Message } | { kind: "reply"; date: string; order: number; reply: Reply };

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-sm text-zinc-900">{children}</dd>
    </div>
  );
}

export function RecipientThread({
  state,
  campaign,
  recipientId,
  onClose,
  onReview,
}: {
  state: ClientState;
  campaign: Campaign;
  recipientId: string | null;
  onClose: () => void;
  onReview: (recipientId: string) => void;
}) {
  const r = recipientId ? state.recipients.find((x) => x.id === recipientId) : undefined;
  if (!r) return null;
  const person = recipientPerson(state, r);
  const mailbox = mailboxById(state, r.mailboxId);
  const replies = state.replies.filter((x) => x.recipientId === r.id);
  const candidate = r.personKind === "candidate" ? state.candidates.find((c) => c.id === r.personId) : undefined;
  const hasResponseMessages = r.messages.some((m) => m.origin === "response");

  const items: TimelineItem[] = [
    ...r.messages.map((m, i) => ({ kind: "message" as const, date: m.sentOn, order: i, message: m })),
    ...replies.map((rep, i) => ({ kind: "reply" as const, date: rep.receivedOn, order: 100 + i, reply: rep })),
  ].sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order;
    if (a.date) return -1;
    if (b.date) return 1;
    return a.order - b.order;
  });

  const claim = person?.claim ?? null;

  return (
    <Drawer
      open
      onClose={onClose}
      title={r.personLabel}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate">{person?.subtitle ?? "Data deleted, only the hash is kept on the Suppression List"}</span>
          <RecipientStateBadge state={r.state} />
        </span>
      }
      actions={
        person?.href ? (
          <ButtonLink href={person.href} size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" aria-hidden />}>
            {r.personKind === "candidate" ? "Candidate" : "Prospect"}
          </ButtonLink>
        ) : null
      }
    >
      <div className="space-y-4">
        <Card className="px-4 py-3.5">
          <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <InfoRow label="To">
              {person?.email ? (
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="truncate">{r.toAddress ?? person.email.value}</span>
                  <VerificationBadge value={person.email} />
                </span>
              ) : (
                <span className="text-zinc-500">{r.toAddress ?? "No address kept"}</span>
              )}
            </InfoRow>
            <InfoRow label="Sending Mailbox">{mailbox ? <MailboxAddress address={mailbox.address} className="block" /> : "-"}</InfoRow>
            <InfoRow label="Added">{formatDate(r.addedOn)}</InfoRow>
            <InfoRow label="Claim">
              {claim ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  <Lock className="size-3.5 text-zinc-400" aria-hidden />
                  {claim.recruiterId === state.session.recruiterId ? "Yours" : recruiterName(state, claim.recruiterId)}
                  <span className="text-xs text-zinc-500">until {formatDate(claim.expiresOn)}, 90 days after the last activity</span>
                </span>
              ) : (
                <span className="text-zinc-500">None</span>
              )}
            </InfoRow>
            {candidate ? (
              <>
                <InfoRow label="Article 14 Notice">
                  {candidate.article14NoticeSentOn ? (
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden /> Sent on {formatDate(candidate.article14NoticeSentOn)}
                    </span>
                  ) : (
                    <span className="text-zinc-600">In the first email, when it is sent</span>
                  )}
                </InfoRow>
                <InfoRow label="Consent">
                  {candidate.consent ? (
                    <span>
                      {CONSENT_LABELS[candidate.consent]}
                      {candidate.retainUntil ? <span className="text-xs text-zinc-500"> - kept until {formatDate(candidate.retainUntil)}</span> : null}
                    </span>
                  ) : (
                    <span className="text-zinc-600">Not given yet{candidate.retainUntil ? `, kept until ${formatDate(candidate.retainUntil)}` : ""}</span>
                  )}
                </InfoRow>
              </>
            ) : null}
          </dl>
          {r.state === "stopped" && r.stopReason ? (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
              <CircleSlash className="mt-0.5 size-3.5 shrink-0 text-zinc-500" aria-hidden /> Stopped: {r.stopReason}
            </div>
          ) : null}
          {r.pausedUntil && isOutOfOfficePaused(r, state.clock.today) ? (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">
              <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Sequence paused until {formatDate(r.pausedUntil)} (Out of Office).
            </div>
          ) : null}
        </Card>

        <ol className="space-y-3">
          {items.map((it) =>
            it.kind === "message" && it.message.status !== "sent" && (r.state === "replied" || r.state === "stopped") ? (
              <li key={it.message.id} className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-4 py-2.5 text-xs text-zinc-500">
                <CircleSlash className="size-3.5 shrink-0" aria-hidden />
                {it.message.step === 1 ? "First email" : `Follow-up ${it.message.step - 1}`} not sent:{" "}
                {r.state === "replied" ? `${r.personLabel} replied, so the Sequence stopped.` : (r.stopReason ?? "outreach stopped.")}
              </li>
            ) : it.kind === "message" ? (
              <li key={it.message.id}>
                <EmailCard
                  message={it.message}
                  to={it.message.status === "sent" ? r.toAddress : person?.email?.value ?? r.toAddress}
                  toName={r.personLabel}
                  status={<MessageStatus state={state} campaign={campaign} r={r} m={it.message} onReview={onReview} />}
                />
              </li>
            ) : (
              <li key={it.reply.id}>
                <ReplyCard state={state} reply={it.reply} showResponse={!hasResponseMessages} />
              </li>
            ),
          )}
        </ol>
      </div>
    </Drawer>
  );
}

function MessageStatus({ state, campaign, r, m, onReview }: { state: ClientState; campaign: Campaign; r: Recipient; m: Message; onReview: (id: string) => void }) {
  if (m.status === "sent") return <span>Sent {formatDate(m.sentOn)}</span>;
  if (r.state === "replied" || r.state === "stopped") return <span className="text-zinc-400">Not sent</span>;
  if (m.status === "draft") {
    return (
      <button type="button" onClick={() => onReview(r.id)} className="font-medium text-amber-700 hover:text-amber-600">
        Awaiting your review
      </button>
    );
  }
  const send = nextSend(state, campaign, r, m.step);
  if (send.kind === "on_hold") return <span>Approved, on hold</span>;
  if (send.kind === "waiting") return <span className="text-amber-700">Waiting for {send.waitsFor}</span>;
  return <span>Scheduled for {formatWeekdayDate(send.date)}</span>;
}

function ReplyCard({ state, reply, showResponse }: { state: ClientState; reply: Reply; showResponse: boolean }) {
  return (
    <article className="overflow-hidden rounded-lg border border-emerald-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50/50 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="green" icon={<MessageSquareReply className="size-3" aria-hidden />}>
            Reply
          </Badge>
          <ReplyCategoryBadge category={reply.category} />
          {reply.recategorizedFrom ? <span className="text-xs text-zinc-500">recategorized from {REPLY_CATEGORY_LABELS[reply.recategorizedFrom]}</span> : null}
        </div>
        <span className="text-xs text-zinc-500">
          {formatDate(reply.receivedOn)} - {formatRelative(reply.receivedOn, state.clock.today)}
        </span>
      </header>
      <div className="px-4 py-3">
        <div className="text-sm font-medium text-zinc-900">{reply.subject}</div>
        <div className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800">{reply.body}</div>
      </div>
      {reply.effects.length > 0 ? (
        <div className="space-y-1.5 border-t border-zinc-100 px-4 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Automatic effects</div>
          {reply.effects.map((e, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs leading-5 text-zinc-700">
              <Zap className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden />
              {e.description}
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/70 px-4 py-2.5 text-xs">
        <span className="min-w-0 text-zinc-600">
          <span className="font-medium text-zinc-700">Next step:</span> {reply.suggestedNextStep}
        </span>
        <Link href={`/inbox?reply=${reply.id}`} className="inline-flex shrink-0 items-center gap-0.5 font-medium text-indigo-600 hover:text-indigo-500">
          {reply.handled ? "Open in the Inbox" : "Answer in the Inbox"} <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </div>
      {showResponse && reply.responseSentOn && reply.responseBody ? (
        <div className="border-t border-zinc-100 px-4 py-3">
          <div className="text-xs text-zinc-500">Response sent by you on {formatDate(reply.responseSentOn)}</div>
          <div className="mt-1.5 whitespace-pre-wrap break-words rounded-md bg-zinc-50 px-3 py-2 text-[13px] leading-6 text-zinc-700">{reply.responseBody}</div>
        </div>
      ) : null}
    </article>
  );
}
