"use client";

// One reply: who answered, its Reply Category (recategorize), the suggested next step, the automatic
// effects already applied, the thread and the drafted response the Recruiter edits and sends
// (agents never send a reply, ADR-0002).

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Copy,
  ExternalLink,
  Info,
  Lock,
  Mail,
  Megaphone,
  RotateCcw,
  Send,
  ShieldBan,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { EmailFooterBlock } from "@/components/domain/email-footer";
import { formatCreditsLabel, formatDate, formatRelative, plural } from "@/lib/format";
import { CONSENT_LABELS, REPLY_CATEGORY_LABELS, replyCategoryEffect } from "@/lib/labels";
import { PLACEHOLDER_PRICE_HINT, PRICES } from "@/lib/pricing";
import {
  REPLY_CATEGORIES,
  type ActionName,
  type ActionPayload,
  type ActionResult,
  type AutomaticEffectKind,
  type ClientState,
  type ISODate,
  type PersonKind,
  type Prospect,
  type ReplyCategory,
  type SuppressionEntry,
} from "@/lib/types";
import { act } from "@/lib/api";
import { CATEGORY_STYLES, CategoryBadge, EFFECT_STYLES } from "./category";
import { consentPath, currentRecruiterOf, footerForResponse, personDeleted, personHref, personSubtitle, type DraftRecord, type ReplyView, type ThreadItem } from "./model";
import { useSuppressionEntry } from "./suppression";
import { Thread } from "./thread";
import { Avatar, Badge, Button, InlineError, SectionTitle, cx } from "./ui";

type Busy = null | "send" | "handled" | "recategorize" | "referral";

interface ReplyDetailProps {
  view: ReplyView;
  state: ClientState;
  thread: ThreadItem[];
  /** The Recruiter's edited text, or undefined while untouched. */
  draft: DraftRecord | undefined;
  onDraftChange: (text: string) => void;
  onDraftReset: () => void;
  /** Keeps this reply selected (and in the list) whatever an action changes. */
  onActed: () => void;
  onBack: () => void;
}

const DESTRUCTIVE: ReplyCategory[] = ["opt_out", "not_interested"];

export function ReplyDetail({ view, state, thread, draft, onDraftChange, onDraftReset, onActed, onBack }: ReplyDetailProps) {
  const { reply, campaign, owner, prospect } = view;
  const today = state.clock.today;
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState<ReplyCategory | null>(null);

  // Reply triage follows the backend rule: the Campaign's owner, or an Owner of the Workspace.
  const me = currentRecruiterOf(state);
  const canTriage = view.isMine || me?.role === "owner";
  const ownerName = owner?.name ?? "the Campaign owner";
  const triageHint =
    !owner || owner.role === "owner" ? `Only ${ownerName} can act on replies to this Campaign.` : `Only ${ownerName}, or an Owner, can act on replies to this Campaign.`;

  // On the Suppression List: the person's lifecycle says so, or one of their addresses is listed.
  const person = view.candidate ?? view.hiringContact;
  const suppressionEntry = useSuppressionEntry(
    [view.recipient?.toAddress, ...(person?.contactValues ?? []).filter((v) => v.kind !== "mobile").map((v) => v.value)],
    state.suppressionList,
  );
  const suppressed = person?.lifecycle === "suppressed" || suppressionEntry !== null;

  /** Runs an action; `then` runs in the same tick as the busy flag is cleared, so nothing flashes in between. */
  async function run<K extends ActionName>(
    kind: Exclude<Busy, null>,
    name: K,
    payload: ActionPayload<K>,
    success?: (result: ActionResult<K>) => string | null,
    then?: () => void,
  ): Promise<void> {
    setBusy(kind);
    setError(null);
    setNotice(null);
    onActed();
    const res = await act(name, payload);
    if (!res.ok) {
      setBusy(null);
      setError(res.error);
      return;
    }
    then?.();
    setBusy(null);
    const message = success ? success(res.result) : null;
    if (message) setNotice(message);
  }

  const deleted = personDeleted(view);
  const href = personHref(view);
  const kindLabel = reply.personKind === "candidate" ? "Candidate" : "Hiring Contact";
  const categoryOptions = REPLY_CATEGORIES.filter((c) => c !== "referral" || reply.personKind === "hiring_contact" || c === reply.category);
  // The select shows the category being confirmed, in that category's colours.
  const categoryStyle = CATEGORY_STYLES[pendingCategory ?? reply.category];
  const CategoryIcon = categoryStyle.icon;
  const triageDisabled = busy !== null || !canTriage;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/60">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-4 py-4 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 mb-3 inline-flex items-center gap-1 rounded px-1 text-sm font-medium text-zinc-600 hover:text-zinc-900 lg:hidden"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All replies
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Avatar name={reply.personLabel} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {href ? (
                  <Link href={href} className="text-base font-semibold text-zinc-900 hover:underline">
                    {reply.personLabel}
                  </Link>
                ) : (
                  <span className="text-base font-semibold text-zinc-900">{reply.personLabel}</span>
                )}
                <Badge tone={reply.personKind === "candidate" ? "indigo" : "neutral"}>{kindLabel}</Badge>
              </div>
              <p className="mt-0.5 truncate text-sm text-zinc-600">{personSubtitle(view)}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Megaphone className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
                  {campaign ? (
                    <Link href={`/campaigns/${campaign.id}`} className="truncate font-medium text-zinc-700 hover:underline">
                      {campaign.name}
                    </Link>
                  ) : (
                    <span>Campaign removed</span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <Clock className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
                  Received {formatDate(reply.receivedOn)} ({formatRelative(reply.receivedOn, today)})
                </span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
            <div className="relative inline-flex items-center" title={canTriage ? "Recategorize this reply" : triageHint}>
              <CategoryIcon className={cx("pointer-events-none absolute left-2 size-3.5", categoryStyle.soft)} aria-hidden />
              <select
                aria-label="Reply Category: recategorize this reply"
                value={pendingCategory ?? reply.category}
                disabled={triageDisabled}
                onChange={(e) => {
                  const next = e.target.value as ReplyCategory;
                  setPendingCategory(next === reply.category ? null : next);
                  setError(null);
                }}
                className={cx(
                  "h-7 cursor-pointer appearance-none rounded-md py-0 pl-7 pr-7 text-xs font-medium ring-1 ring-inset focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60",
                  categoryStyle.badge,
                )}
              >
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {REPLY_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <ChevronDown className={cx("pointer-events-none absolute right-2 size-3.5", categoryStyle.soft, !canTriage && "opacity-60")} aria-hidden />
            </div>
            {reply.handled ? (
              <Button
                size="sm"
                variant="ghost"
                icon={Undo2}
                disabled={triageDisabled}
                title={canTriage ? undefined : triageHint}
                onClick={() => void run("handled", "markReplyHandled", { replyId: reply.id, handled: false }, () => "Moved back to Needs action.")}
              >
                Mark as needing action
              </Button>
            ) : (
              <Button
                size="sm"
                icon={Check}
                disabled={triageDisabled}
                title={canTriage ? undefined : triageHint}
                onClick={() => void run("handled", "markReplyHandled", { replyId: reply.id, handled: true }, () => "Marked as handled.")}
              >
                Mark as handled
              </Button>
            )}
          </div>
        </div>
        {reply.recategorizedFrom ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
            <Info className="size-3.5 shrink-0" aria-hidden />
            Recategorized from {REPLY_CATEGORY_LABELS[reply.recategorizedFrom]} to {REPLY_CATEGORY_LABELS[reply.category]}.
          </p>
        ) : null}
        {!canTriage ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            {triageHint}
          </p>
        ) : null}
      </header>

      {pendingCategory && canTriage ? (
        <RecategorizeConfirm
          from={reply.category}
          to={pendingCategory}
          personKind={reply.personKind}
          personLabel={reply.personLabel}
          prospect={prospect}
          suppressed={suppressed}
          deleted={deleted}
          busy={busy === "recategorize"}
          onCancel={() => setPendingCategory(null)}
          onConfirm={() => {
            const target = pendingCategory;
            void run(
              "recategorize",
              "recategorizeReply",
              { replyId: reply.id, category: target },
              () => `Recategorized as ${REPLY_CATEGORY_LABELS[target]}. Automatic effects updated.`,
              () => {
                setPendingCategory(null);
                onDraftReset();
              },
            );
          }}
        />
      ) : null}

      <div className="space-y-4 p-4 sm:p-5">
        {notice ? (
          <p role="status" className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            {notice}
          </p>
        ) : null}
        <InlineError message={error} />

        <NextStepCard view={view} deleted={deleted} suppressed={suppressed} />
        <EffectsCard view={view} deleted={deleted} suppressed={suppressed} suppressionEntry={suppressionEntry} />
        {reply.referral ? (
          <ReferralCard
            view={view}
            state={state}
            busy={busy === "referral"}
            onAccept={() => void run("referral", "acceptReferral", { replyId: reply.id }, () => `${reply.referral?.name} added as a Hiring Contact.`)}
          />
        ) : null}
        {/* Nobody on the Suppression List ever receives the Consent Page link, unless it was sent before. */}
        {reply.personKind === "candidate" && (reply.responseSentOn || (reply.consentToken && !suppressed)) ? <ConsentCard view={view} /> : null}

        <section aria-label="Thread">
          <SectionTitle icon={Mail} aside={<span className="text-xs tabular-nums text-zinc-400">{plural(thread.length, "email")}</span>}>
            Thread
          </SectionTitle>
          <div className="mt-2.5">
            <Thread items={thread} view={view} />
          </div>
        </section>

        <ResponseSection
          view={view}
          state={state}
          deleted={deleted}
          suppressed={suppressed}
          draft={draft}
          busy={busy}
          ownerName={ownerName}
          onDraftChange={onDraftChange}
          onDraftReset={onDraftReset}
          onSend={(body) =>
            void run("send", "sendReplyResponse", { replyId: reply.id, body }, (r) => (r.consentUrl ? "Response sent, with the Consent Page link." : "Response sent."), onDraftReset)
          }
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recategorize                                                        */
/* ------------------------------------------------------------------ */

/** What stays in place whatever the new Reply Category: closed Prospect, deleted data, Suppression List. */
function lastingEffectNote({
  from,
  personKind,
  personLabel,
  prospect,
  suppressed,
  deleted,
}: {
  from: ReplyCategory;
  personKind: PersonKind;
  personLabel: string;
  prospect: Prospect | undefined;
  suppressed: boolean;
  deleted: boolean;
}): string | null {
  const notes: string[] = [];
  if (from === "not_interested" && personKind === "hiring_contact" && prospect?.status === "closed" && prospect.closedUntil) {
    notes.push(`${prospect.name} stays closed until ${formatDate(prospect.closedUntil)}.`);
  }
  if (personKind === "candidate" && deleted) notes.push("The Candidate's data stays deleted: only the hash is kept on the Suppression List.");
  else if (suppressed) notes.push(`${personLabel} stays on the Suppression List: never contacted again, by any Workspace.`);
  return notes.length > 0 ? notes.join(" ") : null;
}

function RecategorizeConfirm({
  from,
  to,
  personKind,
  personLabel,
  prospect,
  suppressed,
  deleted,
  busy,
  onCancel,
  onConfirm,
}: {
  from: ReplyCategory;
  to: ReplyCategory;
  personKind: PersonKind;
  personLabel: string;
  prospect: Prospect | undefined;
  suppressed: boolean;
  deleted: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const destructive = DESTRUCTIVE.includes(to);
  const lasting = lastingEffectNote({ from, personKind, personLabel, prospect, suppressed, deleted });
  return (
    <div className={cx("border-b px-4 py-3.5 sm:px-5", destructive ? "border-rose-200 bg-rose-50/60" : "border-indigo-100 bg-indigo-50/50")}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-zinc-900">
        Recategorize as
        <span className="inline-flex items-center">
          <CategoryBadge category={to} />
          <span aria-hidden>?</span>
        </span>
      </p>
      <p className="mt-1.5 text-sm text-zinc-700">
        <span className="font-medium">What happens automatically: </span>
        {replyCategoryEffect(to, personKind)}
      </p>
      {lasting ? (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-zinc-500">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          {lasting}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant={destructive ? "danger" : "primary"} disabled={busy} onClick={onConfirm}>
          {busy ? "Recategorizing..." : `Recategorize as ${REPLY_CATEGORY_LABELS[to]}`}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary cards                                                       */
/* ------------------------------------------------------------------ */

function NextStepCard({ view, deleted, suppressed }: { view: ReplyView; deleted: boolean; suppressed: boolean }) {
  const { reply } = view;
  // A suggestion written before the person's data was deleted (for example from the Consent Page), or
  // before they landed on the Suppression List, no longer applies.
  const suggestion =
    deleted && !reply.responseSentOn && reply.draftResponse !== null
      ? "Nothing else to do: the data is deleted and only the hash is kept on the Suppression List."
      : suppressed && !reply.responseSentOn && reply.draftResponse !== null
        ? `Nothing to send: ${reply.personLabel} is on the Suppression List and is never contacted again.`
        : reply.suggestedNextStep || "No suggestion for this reply.";
  return (
    <section className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3.5">
      <SectionTitle
        icon={Sparkles}
        aside={
          reply.responseSentOn ? (
            <Badge tone="green" icon={Check}>
              Response sent
            </Badge>
          ) : reply.handled ? (
            <Badge tone="neutral" icon={Check}>
              Handled
            </Badge>
          ) : null
        }
      >
        Suggested next step
      </SectionTitle>
      <p className="mt-1.5 text-sm text-zinc-800">{suggestion}</p>
    </section>
  );
}

interface EffectLine {
  kind: AutomaticEffectKind;
  description: string;
  on: ISODate | null;
  /** Applied earlier (before a recategorization) and still in place. */
  lasting: boolean;
}

function EffectsCard({
  view,
  deleted,
  suppressed,
  suppressionEntry,
}: {
  view: ReplyView;
  deleted: boolean;
  suppressed: boolean;
  suppressionEntry: SuppressionEntry | null;
}) {
  const { reply, prospect } = view;
  const lines: EffectLine[] = reply.effects.map((e) => ({ ...e, lasting: false }));
  const has = (kind: AutomaticEffectKind) => lines.some((l) => l.kind === kind);
  // Recategorizing replaces the listed effects, but some never undo: keep them listed.
  if (reply.personKind === "candidate" && deleted && reply.recategorizedFrom && DESTRUCTIVE.includes(reply.recategorizedFrom) && !has("candidate_deleted")) {
    lines.push({ kind: "candidate_deleted", description: "Candidate data deleted immediately; only the hash stays on the Suppression List.", on: null, lasting: true });
  } else if (suppressed && !has("suppression_list") && !has("candidate_deleted")) {
    lines.push({
      kind: "suppression_list",
      description: `${reply.personLabel} is on the Suppression List: never contacted again, by any Workspace.`,
      on: suppressionEntry?.addedOn ?? null,
      lasting: true,
    });
  }
  if (reply.recategorizedFrom === "not_interested" && reply.personKind === "hiring_contact" && prospect?.status === "closed" && prospect.closedUntil && !has("prospect_closed")) {
    lines.push({ kind: "prospect_closed", description: `${prospect.name} stays closed until ${formatDate(prospect.closedUntil)}: no outreach to anyone there.`, on: null, lasting: true });
  }
  return (
    <section className="rounded-lg border border-zinc-200 bg-white px-4 py-3.5">
      <SectionTitle icon={Zap}>What happened automatically</SectionTitle>
      {lines.length > 0 ? (
        <ul className="mt-2.5 space-y-2.5">
          {lines.map((effect, i) => {
            const style = EFFECT_STYLES[effect.kind] ?? { icon: Info, label: "Automatic effect", tone: "bg-zinc-100 text-zinc-600" };
            const Icon = style.icon;
            const when = effect.lasting ? (effect.on ? `since ${formatDate(effect.on)}` : "still in place") : formatDate(effect.on);
            return (
              <li key={`${effect.kind}-${i}`} className="flex gap-2.5">
                <span className={cx("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md", style.tone)}>
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-800">{effect.description}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {style.label} · {when}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-zinc-500">Nothing beyond the rule below.</p>
      )}
      <p className="mt-3 border-t border-zinc-100 pt-2.5 text-xs leading-relaxed text-zinc-500">
        <span className="font-medium text-zinc-700">Rule for {REPLY_CATEGORY_LABELS[reply.category]}: </span>
        {replyCategoryEffect(reply.category, reply.personKind)}
      </p>
    </section>
  );
}

function ReferralCard({ view, state, busy, onAccept }: { view: ReplyView; state: ClientState; busy: boolean; onAccept: () => void }) {
  const referral = view.reply.referral;
  if (!referral) return null;
  const contact = referral.hiringContactId ? state.hiringContacts.find((h) => h.id === referral.hiringContactId) : undefined;
  const prospectName = view.prospect?.name ?? "this Prospect";
  const credits = state.workspace?.credits ?? 0;
  const canAfford = credits >= PRICES.hiringContactFound;
  return (
    <section className="rounded-lg border border-violet-200 bg-white px-4 py-3.5">
      <SectionTitle icon={UserPlus}>Proposed Hiring Contact</SectionTitle>
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <div className="flex min-w-[12rem] flex-1 items-center gap-3">
          <Avatar name={referral.name} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900">{referral.name}</p>
            <p className="text-xs text-zinc-500">
              {referral.title} at {prospectName}
            </p>
          </div>
        </div>
        {contact && contact.proposed ? (
          <Button variant="primary" size="sm" icon={UserPlus} disabled={busy || !canAfford} onClick={onAccept}>
            {busy ? "Adding..." : `Accept · ${formatCreditsLabel(PRICES.hiringContactFound)}`}
          </Button>
        ) : contact ? (
          <Badge tone="green" icon={Check}>
            Accepted
          </Badge>
        ) : (
          <Badge tone="neutral">No longer available</Badge>
        )}
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-zinc-500">
        Referred by {view.reply.personLabel}.{" "}
        {contact && contact.proposed ? (
          <>
            Accepting adds them to {prospectName} as a Hiring Contact for {formatCreditsLabel(PRICES.hiringContactFound)} ({PLACEHOLDER_PRICE_HINT}).
            {canAfford ? null : <span className="text-rose-600"> Not enough Credits.</span>}
          </>
        ) : contact && view.prospect ? (
          <>
            Now a Hiring Contact at{" "}
            <Link href={`/prospects/${view.prospect.id}`} className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900">
              {prospectName}
            </Link>
            : enrich them there, then add them to the Campaign.
          </>
        ) : null}
      </p>
    </section>
  );
}

function ConsentCard({ view }: { view: ReplyView }) {
  const { reply, candidate, consent } = view;
  const first = reply.personLabel.split(" ")[0];
  let status: ReactNode;
  if (!candidate) {
    status = <span>The Candidate&apos;s data was deleted: only the hash is kept on the Suppression List.</span>;
  } else if (candidate.consent) {
    status = (
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone={candidate.consent === "delete" ? "neutral" : "green"} icon={ShieldCheck}>
          {candidate.consent === "talent_pool" ? "Consented" : CONSENT_LABELS[candidate.consent]}
        </Badge>
        <span>
          {candidate.consent === "talent_pool" ? "Talent Pool" : "For this opportunity only"}, chosen on {formatDate(candidate.consentRecordedOn)}
          {candidate.retainUntil ? `, kept until ${formatDate(candidate.retainUntil)}` : ""}.
        </span>
      </span>
    );
  } else if (reply.responseSentOn) {
    status = (
      <span>
        Link sent on {formatDate(reply.responseSentOn)}. Waiting for {first}&apos;s choice: Talent Pool, this opportunity only, or delete.
      </span>
    );
  } else {
    status = <span>The link is in the drafted response below. {first} chooses there: Talent Pool, this opportunity only, or delete.</span>;
  }
  return (
    <section className="rounded-lg border border-zinc-200 bg-white px-4 py-3.5">
      <SectionTitle
        icon={ShieldCheck}
        aside={
          reply.consentToken && candidate && !consent?.choice ? (
            <a
              href={consentPath(reply.consentToken)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500"
            >
              Open as {first} sees it
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : reply.consentToken && candidate ? (
            <a
              href={consentPath(reply.consentToken)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800"
            >
              Open the Consent Page
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null
        }
      >
        Consent Page
      </SectionTitle>
      <div className="mt-1.5 text-sm text-zinc-700">{status}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Response                                                            */
/* ------------------------------------------------------------------ */

const NO_RESPONSE_REASONS: Partial<Record<ReplyCategory, string>> = {
  out_of_office: "This is an automatic reply. The Sequence is paused and resumes on its own.",
  bounce: "The email never reached anyone, so there is nobody to answer.",
};

/** Why a reply needs no response: a Candidate who opts out is deleted, a Hiring Contact is only suppressed. */
function noResponseReason(category: ReplyCategory, personKind: PersonKind): string {
  if (category === "opt_out") {
    return personKind === "candidate"
      ? "They opted out: their data is deleted and only the hash stays on the Suppression List, so no one can email them again, including you."
      : "They opted out: their address is on the Suppression List, so no one can email them again, including you.";
  }
  return NO_RESPONSE_REASONS[category] ?? "No response is needed for this reply.";
}

/** The Recruiter's text that could not be sent, kept readable and copyable instead of being lost. */
export function UnsentDraft({ text, onDiscard }: { text: string; onDiscard: () => void }) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  function selectText() {
    const el = textRef.current;
    const selection = window.getSelection();
    if (!el || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function copy() {
    if (!navigator.clipboard) {
      selectText();
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => selectText(),
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 py-1 pr-1 pl-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Your unsent response</span>
        <span className="flex items-center gap-1">
          <Button size="sm" variant="ghost" icon={copied ? Check : Copy} onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" variant="ghost" icon={Trash2} onClick={onDiscard}>
            Discard
          </Button>
        </span>
      </div>
      <p ref={textRef} className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-relaxed text-zinc-700">
        {text}
      </p>
    </div>
  );
}

/** Shown where the composer was when something outside this pane made the Recruiter's text unsendable. */
function InterruptedResponse({ icon: Icon, title, children, draft, onDiscard }: { icon: LucideIcon; title: string; children: ReactNode; draft: string; onDiscard: () => void }) {
  return (
    <section aria-label="Your response" className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3.5">
      <div role="status" className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-zinc-900">{title}</p>
          <p className="mt-0.5 text-zinc-600">{children}</p>
        </div>
      </div>
      <UnsentDraft text={draft} onDiscard={onDiscard} />
    </section>
  );
}

function NoResponse({ icon: Icon = Info, tone = "neutral", title, children }: { icon?: LucideIcon; tone?: "neutral" | "rose"; title: string; children: ReactNode }) {
  return (
    <section className={cx("flex items-start gap-3 rounded-lg border px-4 py-3.5", tone === "rose" ? "border-rose-200 bg-rose-50/60" : "border-zinc-200 bg-white")}>
      <Icon className={cx("mt-0.5 size-4 shrink-0", tone === "rose" ? "text-rose-600" : "text-zinc-400")} aria-hidden />
      <div className="text-sm">
        <p className="font-medium text-zinc-900">{title}</p>
        <p className="mt-0.5 text-zinc-600">{children}</p>
      </div>
    </section>
  );
}

function ResponseSection({
  view,
  state,
  deleted,
  suppressed,
  draft,
  busy,
  ownerName,
  onDraftChange,
  onDraftReset,
  onSend,
}: {
  view: ReplyView;
  state: ClientState;
  deleted: boolean;
  suppressed: boolean;
  draft: DraftRecord | undefined;
  busy: Busy;
  ownerName: string;
  onDraftChange: (text: string) => void;
  onDraftReset: () => void;
  onSend: (body: string) => void;
}) {
  const { reply, recipient, mailbox, isMine } = view;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const original = reply.draftResponse ?? "";
  const body = draft?.text ?? original;
  const edited = draft !== undefined && draft.text !== original;
  // The name the Recruiter was writing to, even once the data is deleted.
  const name = draft?.personLabel ?? reply.personLabel;
  // While this pane's own action runs, the state may already show its result: never call that an interruption.
  const interrupted = edited && busy === null;

  // Grow the textarea with its content so the whole drafted response is visible without scrolling.
  // Refit when its width changes too (the pane starts hidden on small screens, and text rewraps). The
  // refit waits for the next frame, so resizing inside the observer callback never loops.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    let lastWidth = el.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [body]);

  if (reply.responseSentOn) {
    if (interrupted && draft) {
      return (
        <InterruptedResponse icon={TriangleAlert} title="This reply was handled elsewhere" draft={draft.text} onDiscard={onDraftReset}>
          A response to {name} was already sent on {formatDate(reply.responseSentOn)}, so yours was not sent. It is kept below if you need it.
        </InterruptedResponse>
      );
    }
    return (
      <section className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3.5">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        <div className="text-sm">
          <p className="font-medium text-zinc-900">Response sent on {formatDate(reply.responseSentOn)}</p>
          <p className="mt-0.5 text-zinc-600">
            Sent by {ownerName}
            {mailbox ? ` from ${mailbox.address}` : ""}. It is the last email in the thread above.
          </p>
        </div>
      </section>
    );
  }

  if (deleted) {
    if (interrupted && draft) {
      const fromConsentPage = reply.effects.some((e) => e.kind === "candidate_deleted" && e.viaConsentPage);
      return (
        <InterruptedResponse icon={Trash2} title={fromConsentPage ? `${name} deleted their data` : `${name}'s data was deleted`} draft={draft.text} onDiscard={onDraftReset}>
          {fromConsentPage ? "They chose to delete it on the Consent Page" : "It was deleted"} while you were writing: the address is gone and only the hash stays on the
          Suppression List, so nothing can be sent. Your text is kept below if you need it.
        </InterruptedResponse>
      );
    }
    if (reply.draftResponse !== null) {
      return <NoResponse title="No response to send">The data was deleted, including the address: nothing else to send.</NoResponse>;
    }
  }

  if (suppressed) {
    if (interrupted && draft) {
      return (
        <InterruptedResponse icon={ShieldBan} title={`${name} is on the Suppression List`} draft={draft.text} onDiscard={onDraftReset}>
          They were added while you were writing: never contacted again, so your response cannot be sent. It is kept below if you need it.
        </InterruptedResponse>
      );
    }
    return (
      <NoResponse icon={ShieldBan} tone="rose" title={`${reply.personLabel} is on the Suppression List: never contacted again.`}>
        Whatever the Reply Category, no email can reach them from any Workspace, including a response from you.
      </NoResponse>
    );
  }

  if (reply.draftResponse === null) {
    if (interrupted && draft) {
      return (
        <InterruptedResponse icon={TriangleAlert} title="This reply was recategorized elsewhere" draft={draft.text} onDiscard={onDraftReset}>
          It is now {REPLY_CATEGORY_LABELS[reply.category]}, which needs no response, so yours was not sent. It is kept below if you need it.
        </InterruptedResponse>
      );
    }
    return <NoResponse title="No response to send">{noResponseReason(reply.category, reply.personKind)}</NoResponse>;
  }

  const footer = footerForResponse(view);
  const isCandidate = reply.personKind === "candidate";
  const consentMissing = isCandidate && !!reply.consentToken && !body.includes(reply.consentToken);
  const credits = state.workspace?.credits ?? 0;
  const canAfford = credits >= PRICES.emailSent;
  const firstNoticeOn = recipient?.messages.find((m) => m.origin === "campaign" && m.status === "sent")?.sentOn ?? null;
  const disabledReason = !isMine
    ? `Only ${ownerName} can send this response: it goes from their Sending Mailbox and they hold the Claim.`
    : !canAfford
      ? "Not enough Credits to send an email."
      : body.trim().length === 0
        ? "Write a response first."
        : null;

  return (
    <section aria-label="Your response" className="overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <Send className="size-3.5 text-zinc-500" aria-hidden />
          Your response
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="indigo" icon={Sparkles}>
            Drafted by the Outreach Agent
          </Badge>
          <Badge tone="neutral">{reply.language === "fr" ? "French" : "English"}</Badge>
          {edited ? <Badge tone="amber">Edited</Badge> : null}
        </div>
      </div>

      <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 border-b border-zinc-100 px-4 py-2.5 text-xs">
        <dt className="text-zinc-500">From</dt>
        <dd className="truncate text-zinc-800">
          {ownerName}
          {mailbox ? <span className="text-zinc-500"> &lt;{mailbox.address}&gt;</span> : null}
        </dd>
        <dt className="text-zinc-500">To</dt>
        <dd className="truncate text-zinc-800">
          {reply.personLabel}
          {recipient?.toAddress ? <span className="text-zinc-500"> &lt;{recipient.toAddress}&gt;</span> : null}
        </dd>
        <dt className="text-zinc-500">Subject</dt>
        <dd className="truncate text-zinc-800">{reply.subject}</dd>
      </dl>

      <div className="px-4 pt-3">
        <label htmlFor={`response-${reply.id}`} className="sr-only">
          Response to {reply.personLabel}
        </label>
        <textarea
          ref={textareaRef}
          id={`response-${reply.id}`}
          value={body}
          rows={8}
          disabled={!isMine || busy === "send"}
          onChange={(e) => onDraftChange(e.target.value)}
          className="block max-h-[32rem] min-h-32 w-full resize-y rounded-md border-0 bg-zinc-50 px-3 py-2.5 text-sm leading-relaxed text-zinc-900 ring-1 ring-inset ring-zinc-200 placeholder:text-zinc-400 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:text-zinc-500"
        />
        {consentMissing ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            The Consent Page link is missing from your text. Responses to Candidates always include it, so it is added back at the end when you send.
          </p>
        ) : isCandidate && reply.consentToken ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-zinc-500">
            <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
            Includes the Consent Page link, where {reply.personLabel.split(" ")[0]} chooses: Talent Pool, this opportunity only, or delete.
          </p>
        ) : null}
        {footer ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200">
            <div className="border-b border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-500">Footer, added to this response and not editable</div>
            <EmailFooterBlock footer={footer} compact />
          </div>
        ) : null}
        {isCandidate && firstNoticeOn ? (
          <p className="mt-2 text-xs text-zinc-500">Article 14 Notice: already sent with the first email on {formatDate(firstNoticeOn)}.</p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-zinc-500">
          {disabledReason ?? (
            <>
              Agents never send replies: you do. Sending costs {formatCreditsLabel(PRICES.emailSent)} ({PLACEHOLDER_PRICE_HINT}).
            </>
          )}
          {!canAfford && isMine ? (
            <>
              {" "}
              <Link href="/credits" className="font-medium text-indigo-600 hover:text-indigo-500">
                Buy Credits
              </Link>
            </>
          ) : null}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {edited ? (
            <Button size="md" variant="ghost" icon={RotateCcw} disabled={busy === "send"} onClick={onDraftReset}>
              Reset draft
            </Button>
          ) : null}
          <Button variant="primary" icon={Send} disabled={disabledReason !== null || busy !== null} onClick={() => onSend(body)}>
            {busy === "send" ? "Sending..." : `Send · ${formatCreditsLabel(PRICES.emailSent)}`}
          </Button>
        </div>
      </div>
    </section>
  );
}
