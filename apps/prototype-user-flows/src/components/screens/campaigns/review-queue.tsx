"use client";

// Review queue of a Campaign: approve a draft, or edit it then approve (edits teach the Voice
// Profile of the email's language), redraft, or remove the recipient.

import Link from "next/link";
import { useState } from "react";
import { CheckCheck, CircleCheck, Hourglass, RotateCcw, UserMinus } from "lucide-react";
import { EmailFooterBlock } from "@/components/domain/email-footer";
import { RetentionBadge } from "@/components/domain/person-badges";
import { formatDate, formatWeekdayDate } from "@/lib/format";
import { PRICES } from "@/lib/pricing";
import type { Campaign, ClientState, Recipient } from "@/lib/types";
import { act } from "@/lib/api";
import { firstEmailsReviewed, mailboxById, recipientPerson, recipientsOf, recruiterName, retentionRisk, type ReviewItem } from "./derive";
import { nextSend } from "./next-send";
import { LanguageChip, RecipientStateBadge, SenderAddress, VerificationBadge } from "./shared";
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Modal, PriceHint, TextArea, TextInput, cx, useToast } from "./ui";

export function ReviewQueue({
  state,
  campaign,
  items,
  canEdit,
  selectedId,
  onSelect,
}: {
  state: ClientState;
  campaign: Campaign;
  items: ReviewItem[];
  canEdit: boolean;
  selectedId: string | null;
  onSelect: (recipientId: string) => void;
}) {
  const toast = useToast();
  const [confirmAll, setConfirmAll] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const recipients = recipientsOf(state, campaign.id);
  const reviewed = firstEmailsReviewed(recipients);
  const current = items.find((i) => i.recipient.id === selectedId) ?? items[0] ?? null;

  const owner = canEdit ? "your" : `${recruiterName(state, campaign.ownerId)}'s`;
  const autonomyLine =
    campaign.autonomy === "review_all"
      ? `Review every email: each one waits for ${owner} approval before it is scheduled.`
      : campaign.autonomy === "review_first_n"
        ? `Review the first ${campaign.reviewFirstN} emails, then drafts are scheduled automatically. ${reviewed} first ${reviewed === 1 ? "email" : "emails"} approved or sent so far.`
        : "Automatic: emails are scheduled as soon as recipients join. Drafts only appear here when one is redrafted.";

  const approveAll = async () => {
    setApprovingAll(true);
    const res = await act("approveAll", { campaignId: campaign.id });
    setApprovingAll(false);
    setConfirmAll(false);
    if (res.ok) toast({ tone: "success", title: `${res.result.approved} ${res.result.approved === 1 ? "email" : "emails"} approved`, description: "They go out in the sending window, within the mailbox caps." });
    else toast({ tone: "danger", title: "Could not approve the drafts", description: res.error });
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Review queue <Badge tone={items.length > 0 ? "amber" : "neutral"}>{items.length}</Badge>
          </span>
        }
        description={autonomyLine}
        actions={
          items.length > 1 && canEdit ? (
            <Button size="sm" icon={<CheckCheck className="size-3.5" aria-hidden />} onClick={() => setConfirmAll(true)}>
              Approve all {items.length}
            </Button>
          ) : null
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={<CircleCheck />} title="Nothing to review">
          {campaign.autonomy === "auto"
            ? "This Campaign sends automatically. Replies still wait for you in the Inbox."
            : "Every draft is approved. New recipients and follow-ups that need your review will appear here."}
        </EmptyState>
      ) : (
        <div className="grid min-w-0 lg:grid-cols-[288px_minmax(0,1fr)]">
          {/* The grid cell carries the divider, so it runs to the card's bottom whichever column is taller. */}
          <div className="min-w-0 border-b border-zinc-200 lg:border-b-0 lg:border-r">
            <ul className="max-h-60 overflow-y-auto lg:max-h-[760px]">
              {items.map((it) => {
                const active = current?.recipient.id === it.recipient.id;
                const person = recipientPerson(state, it.recipient);
                return (
                  <li key={it.recipient.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(it.recipient.id)}
                      className={cx(
                        "flex w-full items-start gap-2.5 border-l-2 px-4 py-3 text-left transition-colors",
                        active ? "border-indigo-600 bg-indigo-50/60" : "border-transparent hover:bg-zinc-50",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-zinc-900">{it.recipient.personLabel}</span>
                          <LanguageChip language={it.message.language} />
                        </span>
                        <span className="block truncate text-xs text-zinc-500">{person?.subtitle ?? "-"}</span>
                        <span className="mt-1 block truncate text-xs text-zinc-600">{it.message.subject}</span>
                        {person?.deleteOn && it.message.step === 1 ? (
                          <span className="mt-1.5 flex">
                            <RetentionBadge deleteOn={person.deleteOn} today={state.clock.today} onHold={person.retentionHold} />
                          </span>
                        ) : null}
                      </span>
                      <Badge tone={it.message.step === 1 ? "amber" : "neutral"}>{it.message.step === 1 ? "First email" : `Follow-up ${it.message.step - 1}`}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {current ? (
            <ReviewEditor
              key={`${current.message.id}|${current.message.subject}|${current.message.body}`}
              state={state}
              campaign={campaign}
              item={current}
              canEdit={canEdit}
            />
          ) : null}
        </div>
      )}

      <Modal
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title={`Approve all ${items.length} drafts?`}
        description="They are scheduled as written by the Outreach Agent, without edits."
        footer={
          <>
            <Button onClick={() => setConfirmAll(false)}>Cancel</Button>
            <Button variant="primary" loading={approvingAll} icon={<CheckCheck className="size-3.5" aria-hidden />} onClick={() => void approveAll()}>
              Approve {items.length} drafts
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-zinc-600">
          Each email sent costs{" "}
          <span className="whitespace-nowrap">
            {PRICES.emailSent} Credit <PriceHint />:
          </span>{" "}
          up to {items.length * PRICES.emailSent} Credits for these drafts, charged when they are sent.
        </p>
      </Modal>
    </Card>
  );
}

/** When a follow-up leaves once approved, on the same rule as the recipients table. */
function followUpDueNote(state: ClientState, campaign: Campaign, r: Recipient, step: number): string {
  const send = nextSend(state, campaign, r, step);
  switch (send.kind) {
    case "on":
      return `Due on ${formatWeekdayDate(send.date)} once approved, if there is no reply before.`;
    case "on_hold":
      return `Once approved, it waits until the Campaign is ${send.campaignStatus === "paused" ? "resumed" : "launched"}.`;
    case "waiting":
      return send.reason === "mailbox"
        ? "Waiting for a Sending Mailbox: follow-ups leave from the mailbox that started the thread, which cannot send now."
        : "Waiting for Credits: once approved, it leaves on the next sending day after Credits are bought.";
  }
}

function ReviewEditor({ state, campaign, item, canEdit }: { state: ClientState; campaign: Campaign; item: ReviewItem; canEdit: boolean }) {
  const toast = useToast();
  const { recipient: r, message: m } = item;
  const [subject, setSubject] = useState(m.subject);
  const [body, setBody] = useState(m.body);
  const [busy, setBusy] = useState<"approve" | "redraft" | "remove" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const person = recipientPerson(state, r);
  const mailbox = mailboxById(state, r.mailboxId);
  const edited = subject !== m.subject || body !== m.body;
  const languageName = m.language === "fr" ? "French" : "English";
  const risk = m.step === 1 ? retentionRisk(state, campaign, r, person) : null;
  const notRunning = campaign.status === "draft" ? " and the Campaign is launched" : campaign.status === "paused" ? " and the Campaign is resumed" : "";

  const approve = async () => {
    setBusy("approve");
    const res = await act("approveMessage", { recipientId: r.id, messageId: m.id, ...(edited ? { subject, body } : {}) });
    setBusy(null);
    if (!res.ok) {
      toast({ tone: "danger", title: "Could not approve the draft", description: res.error });
      return;
    }
    toast({
      tone: "success",
      title: edited ? `Edited and approved for ${r.personLabel}` : `Approved for ${r.personLabel}`,
      description: res.result.learned ? `${languageName} Voice Profile learnt: ${res.result.learned}` : "Scheduled in the next sending window.",
    });
  };

  const redraft = async () => {
    setBusy("redraft");
    const res = await act("redraftMessage", { recipientId: r.id, messageId: m.id });
    setBusy(null);
    if (!res.ok) toast({ tone: "danger", title: "Could not redraft", description: res.error });
    else toast({ tone: "info", title: "New draft written", description: "The Outreach Agent used another Signal as the hook." });
  };

  const remove = async () => {
    setBusy("remove");
    const res = await act("removeRecipient", { recipientId: r.id });
    setBusy(null);
    setConfirmRemove(false);
    if (!res.ok) toast({ tone: "danger", title: "Could not remove the recipient", description: res.error });
    else toast({ tone: "success", title: `${r.personLabel} removed`, description: "No email will be sent to them from this Campaign and your Claim is released." });
  };

  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {person?.href ? (
              <Link href={person.href} className="text-base font-semibold text-zinc-900 hover:text-indigo-700">
                {r.personLabel}
              </Link>
            ) : (
              <span className="text-base font-semibold text-zinc-900">{r.personLabel}</span>
            )}
            <RecipientStateBadge state={r.state} />
            {person?.deleteOn ? <RetentionBadge deleteOn={person.deleteOn} today={state.clock.today} onHold={person.retentionHold} /> : null}
          </div>
          <div className="text-sm text-zinc-500">{person?.subtitle}</div>
        </div>
        <div className="text-xs text-zinc-500 sm:text-right">
          Email {m.step} of {campaign.sequence.length}
          <div className="mt-0.5">{campaign.sequence.find((s) => s.step === m.step)?.instruction}</div>
        </div>
      </div>

      {risk ? (
        <Callout
          tone="warning"
          role="status"
          className="mt-4"
          icon={<Hourglass className="size-4 text-amber-600" aria-hidden />}
          title={
            risk.kind === "approve_today"
              ? `Approve today: ${r.personLabel} is deleted on ${formatDate(risk.deleteOn)} unless the first email is sent`
              : `${r.personLabel} is deleted on ${formatDate(risk.deleteOn)}, before this email can be sent`
          }
        >
          {risk.kind === "approve_today"
            ? `Never-Contacted Candidates are deleted after 25 days. Approved today, the first email leaves on the next sending day${notRunning}; approved later, it comes too late.`
            : `The next sending day of this Campaign is ${formatWeekdayDate(risk.sendsOn)}. Never-Contacted Candidates are deleted after 25 days, so this draft will not reach them.`}
        </Callout>
      ) : null}

      <dl className="mt-4 grid grid-cols-[48px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-zinc-500">From</dt>
        <dd className="min-w-0 truncate text-zinc-800">
          {m.footer.senderName} <SenderAddress address={mailbox?.address || m.footer.senderEmail} />
        </dd>
        <dt className="text-zinc-500">To</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-zinc-800">
          <span className="truncate">{person?.email?.value ?? r.toAddress ?? "-"}</span>
          {person?.email ? <VerificationBadge value={person.email} /> : null}
          <LanguageChip language={m.language} />
        </dd>
      </dl>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor={`subject-${m.id}`} className="text-xs font-medium text-zinc-600">
            Subject
          </label>
          <TextInput id={`subject-${m.id}`} className="mt-1 w-full" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <label htmlFor={`body-${m.id}`} className="text-xs font-medium text-zinc-600">
            Body
          </label>
          <TextArea id={`body-${m.id}`} className="mt-1 min-h-[260px] w-full text-[13.5px]" rows={12} value={body} onChange={(e) => setBody(e.target.value)} disabled={!canEdit} />
        </div>
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <div className="border-b border-zinc-200 bg-white px-4 py-1.5 text-[11px] font-medium text-zinc-500">Footer, added to every email and not editable</div>
          <EmailFooterBlock footer={m.footer} />
        </div>
      </div>

      {edited ? (
        <Callout tone="indigo" className="mt-3" action={<Button size="sm" variant="ghost" onClick={() => { setSubject(m.subject); setBody(m.body); }}>Undo edits</Button>}>
          Your edits teach your {languageName} Voice Profile, so the next drafts need fewer of them.
        </Callout>
      ) : null}

      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="danger-ghost" size="sm" icon={<UserMinus className="size-3.5" aria-hidden />} onClick={() => setConfirmRemove(true)} disabled={busy !== null}>
              Remove from Campaign
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<RotateCcw className="size-3.5" aria-hidden />} loading={busy === "redraft"} disabled={busy !== null || edited} onClick={() => void redraft()} title={edited ? "Undo your edits to redraft" : undefined}>
              Redraft
            </Button>
            <Button variant="primary" icon={<CheckCheck className="size-3.5" aria-hidden />} loading={busy === "approve"} disabled={busy !== null || !subject.trim() || !body.trim()} onClick={() => void approve()}>
              {edited ? "Save edits and approve" : "Approve"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 border-t border-zinc-100 pt-4 text-xs text-zinc-500">Only the owner of this Campaign reviews its drafts, since they are sent in their name.</p>
      )}
      {m.step > 1 ? <p className="mt-2 text-xs text-zinc-500">{followUpDueNote(state, campaign, r, m.step)}</p> : null}

      <Modal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        size="sm"
        title={`Remove ${r.personLabel}?`}
        description="No email from this Campaign is sent to them, and your Claim is released so another Recruiter can contact them."
        footer={
          <>
            <Button onClick={() => setConfirmRemove(false)}>Cancel</Button>
            <Button variant="danger" loading={busy === "remove"} onClick={() => void remove()}>
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}
