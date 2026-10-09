"use client";

// The steps of the "New Campaign" wizard. Each step edits the shared WizardDraft.

import Link from "next/link";
import { useId, useMemo, type ReactNode } from "react";
import {
  ArrowUpRight,
  Briefcase,
  Building,
  Check,
  Globe,
  Plus,
  Reply,
  ShieldCheck,
  Sparkles,
  Trash,
  UserRound,
} from "lucide-react";
import { formatDate, formatNumber, formatRelative, formatWeekdays, weekdayShort } from "@/lib/format";
import { AUTONOMY_DESCRIPTIONS, AUTONOMY_LABELS, NICHE_STATUS_LABELS, SENDING_LIMITS } from "@/lib/labels";
import { PRICES } from "@/lib/pricing";
import type { Autonomy, CampaignAudience, ClientState, SendingMailbox, Weekday } from "@/lib/types";
import { WEEKDAYS } from "@/lib/types";
import { dailyCapacity, eligiblePeople, isUsableMailbox, recruiterName } from "./derive";
import { RecipientPicker, pickerFocus, useEligible } from "./recipient-picker";
import { MailboxStatusBadge } from "./shared";
import { Badge, Callout, Checkbox, Field, PriceHint, TextArea, TextInput, Toggle, cx } from "./ui";
import {
  DEFAULT_INSTRUCTIONS,
  SENDING_DAYS,
  angleSuggestions,
  ctaSuggestions,
  newSequenceStep,
  suggestedName,
  type WizardDraft,
  type WizardSequenceStep,
} from "./wizard-model";

export interface StepProps {
  state: ClientState;
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function RadioCard({
  checked,
  onSelect,
  disabled,
  children,
  className,
  name,
  extra,
}: {
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  name: string;
  /** Controls shown under the card's text, outside its label (a label holds only its own radio). */
  extra?: ReactNode;
}) {
  return (
    <div
      className={cx(
        "relative min-w-0 rounded-lg border bg-white transition-colors",
        checked ? "border-indigo-500 ring-1 ring-indigo-500" : "border-zinc-200 hover:border-zinc-300",
        disabled && "bg-zinc-50 opacity-60 hover:border-zinc-200",
        className,
      )}
    >
      <label className={cx("flex min-w-0 gap-3 p-3.5", disabled ? "cursor-not-allowed" : "cursor-pointer", extra ? "pb-2" : "")}>
        <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onSelect} className="mt-0.5 size-4 shrink-0 accent-indigo-600" />
        <span className="min-w-0 flex-1">{children}</span>
      </label>
      {extra ? <div className="px-3.5 pb-3.5 pl-10">{extra}</div> : null}
    </div>
  );
}

function Chip({ onClick, children, active }: { onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "max-w-full rounded-md border px-2 py-1 text-left text-xs leading-5 transition-colors",
        active ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-zinc-200 bg-white text-zinc-700 hover:border-indigo-300 hover:bg-indigo-50/50",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Niche and audience                                               */
/* ------------------------------------------------------------------ */

export function NicheStep({ state, draft, update }: StepProps) {
  const name = useId();
  const audienceName = useId();
  const nameId = useId();
  const counts = useMemo(() => {
    const out: Record<string, { hiring_contacts: number; candidates: number }> = {};
    for (const n of state.niches) {
      const count = (audience: CampaignAudience) =>
        eligiblePeople(state, { nicheId: n.id, audience, recruiterId: state.session.recruiterId }).filter((p) => !p.blocked).length;
      out[n.id] = { hiring_contacts: count("hiring_contacts"), candidates: count("candidates") };
    }
    return out;
  }, [state]);

  const choose = (patch: Partial<WizardDraft>) => {
    const next = { ...draft, ...patch };
    const role = next.detectedRoleId ? state.detectedRoles.find((r) => r.id === next.detectedRoleId) : undefined;
    const roleProspect = role ? state.prospects.find((p) => p.id === role.prospectId) : undefined;
    const detectedRoleId = roleProspect && next.nicheId && roleProspect.nicheIds.includes(next.nicheId) ? next.detectedRoleId : null;
    const changedScope = next.nicheId !== draft.nicheId || next.audience !== draft.audience;
    update({
      ...patch,
      detectedRoleId,
      selected: changedScope ? [] : draft.selected,
      name: draft.nameTouched ? draft.name : suggestedName(state, { nicheId: next.nicheId, audience: next.audience, detectedRoleId }),
    });
  };

  const current = draft.nicheId ? counts[draft.nicheId] : undefined;

  return (
    <div className="space-y-7">
      <Field label="Niche" hint="The Campaign uses this Niche's Enriched people, Detected Roles and Signals.">
        {state.niches.length === 0 ? (
          <Callout tone="warning" title="No Niche yet">
            A Campaign works from a Niche&apos;s Enriched people.{" "}
            <Link href="/onboarding/niche" className="font-medium underline">
              Set up a Niche
            </Link>
          </Callout>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {state.niches.map((n) => {
              const c = counts[n.id];
              const disabled = n.status === "draft";
              return (
                <RadioCard key={n.id} name={name} checked={draft.nicheId === n.id} disabled={disabled} onSelect={() => choose({ nicheId: n.id })}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="block min-w-0 text-sm font-medium leading-5 text-zinc-900">{n.name}</span>
                    <Badge tone={n.status === "active" ? "green" : n.status === "paused" ? "amber" : "neutral"}>{NICHE_STATUS_LABELS[n.status]}</Badge>
                  </span>
                  <span className="block mt-1 text-xs text-zinc-500">
                    Owned by {recruiterName(state, n.ownerId)}
                    {n.ownerId === state.session.recruiterId ? " (you)" : ""}
                  </span>
                  <span className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                    {disabled ? (
                      <span>Finish the Niche setup first</span>
                    ) : (
                      <>
                        <span>
                          <span className="font-medium tabular-nums text-zinc-900">{c?.hiring_contacts ?? 0}</span> Hiring Contacts ready
                        </span>
                        <span>
                          <span className="font-medium tabular-nums text-zinc-900">{c?.candidates ?? 0}</span> Candidates ready
                        </span>
                      </>
                    )}
                  </span>
                </RadioCard>
              );
            })}
          </div>
        )}
      </Field>

      <Field label="Audience" hint="One Campaign never mixes the two: Candidates and Hiring Contacts are kept apart, even for the same person.">
        <div className="grid gap-3 sm:grid-cols-2">
          <RadioCard name={audienceName} checked={draft.audience === "hiring_contacts"} onSelect={() => choose({ audience: "hiring_contacts" })}>
            <span className="flex items-center gap-2 text-sm font-medium text-zinc-900">
              <Building className="size-4 text-blue-600" aria-hidden /> Hiring Contacts
              {current ? <span className="ml-auto text-xs font-normal tabular-nums text-zinc-500">{current.hiring_contacts} ready</span> : null}
            </span>
            <span className="block mt-1 text-xs leading-5 text-zinc-500">
              Founders, CTOs and Heads of Talent at Prospects, at their work email. One Hiring Contact per Prospect in an active Sequence; a reply from anyone
              there stops outreach to the whole Prospect.
            </span>
          </RadioCard>
          <RadioCard name={audienceName} checked={draft.audience === "candidates"} onSelect={() => choose({ audience: "candidates" })}>
            <span className="flex items-center gap-2 text-sm font-medium text-zinc-900">
              <UserRound className="size-4 text-violet-600" aria-hidden /> Candidates
              {current ? <span className="ml-auto text-xs font-normal tabular-nums text-zinc-500">{current.candidates} ready</span> : null}
            </span>
            <span className="block mt-1 text-xs leading-5 text-zinc-500">
              People likely to move, only at a personal email, never at their current employer. The first email carries the Article 14 Notice, and replies
              include the Consent Page link.
            </span>
          </RadioCard>
        </div>
      </Field>

      <Field label="Campaign name" hint="Only your team sees it." htmlFor={nameId}>
        <TextInput id={nameId} value={draft.name} onChange={(e) => update({ name: e.target.value, nameTouched: true })} className="w-full max-w-xl" />
      </Field>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Brief                                                            */
/* ------------------------------------------------------------------ */

export function BriefStep({ state, draft, update }: StepProps) {
  const angleId = useId();
  const ctaId = useId();
  const roleName = useId();
  const niche = state.niches.find((n) => n.id === draft.nicheId);
  const roles = state.detectedRoles
    .map((r) => ({ role: r, prospect: state.prospects.find((p) => p.id === r.prospectId) }))
    .filter((x) => x.prospect && draft.nicheId && x.prospect.nicheIds.includes(draft.nicheId))
    .sort((a, b) => (a.role.postedOn < b.role.postedOn ? 1 : -1));
  const selectedRole = roles.find((r) => r.role.id === draft.detectedRoleId);
  const angles = angleSuggestions(niche, draft.audience, selectedRole?.role.title ?? null);

  const setRole = (id: string | null) =>
    update({ detectedRoleId: id, name: draft.nameTouched ? draft.name : suggestedName(state, { nicheId: draft.nicheId, audience: draft.audience, detectedRoleId: id }) });

  return (
    <div className="space-y-7">
      <Field
        label="Angle"
        htmlFor={angleId}
        hint="Why you are writing and what you offer. The Outreach Agent adapts it to each recipient, opens with their strongest Signal and writes in your Voice Profile."
      >
        <TextArea id={angleId} rows={3} value={draft.angle} onChange={(e) => update({ angle: e.target.value })} placeholder="What you offer, in one or two sentences" className="w-full" />
        <div className="mt-2 flex flex-col items-start gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
            <Sparkles className="size-3.5 text-indigo-500" aria-hidden /> Suggested by the Outreach Agent
          </span>
          {angles.map((a) => (
            <Chip key={a} onClick={() => update({ angle: a })} active={draft.angle === a}>
              {a}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Call to action" htmlFor={ctaId} hint="What you ask the recipient for. Keep it small.">
        <TextInput id={ctaId} value={draft.callToAction} onChange={(e) => update({ callToAction: e.target.value })} placeholder="a 15-minute call this week" className="w-full max-w-xl" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ctaSuggestions(draft.audience).map((c) => (
            <Chip key={c} onClick={() => update({ callToAction: c })} active={draft.callToAction === c}>
              {c}
            </Chip>
          ))}
        </div>
      </Field>

      <Field
        label="Detected Role"
        optional
        hint={
          draft.audience === "candidates"
            ? "Anchor the emails on one open role. Candidates see the role with the company's sector, stage and city, not its name."
            : "Anchor the emails on one open role at a Prospect of this Niche: the first email opens with its job posting."
        }
      >
        <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200">
          <label className={cx("flex cursor-pointer items-center gap-3 px-3.5 py-3", draft.detectedRoleId === null ? "bg-indigo-50/50" : "hover:bg-zinc-50")}>
            <input type="radio" name={roleName} checked={draft.detectedRoleId === null} onChange={() => setRole(null)} className="size-4 accent-indigo-600" />
            <span className="block">
              <span className="block text-sm font-medium text-zinc-900">No Detected Role</span>
              <span className="block text-xs text-zinc-500">The Niche at large</span>
            </span>
          </label>
          {roles.map(({ role, prospect }) => (
            <label key={role.id} className={cx("flex cursor-pointer items-start gap-3 px-3.5 py-3", draft.detectedRoleId === role.id ? "bg-indigo-50/50" : "hover:bg-zinc-50")}>
              <input type="radio" name={roleName} checked={draft.detectedRoleId === role.id} onChange={() => setRole(role.id)} className="mt-0.5 size-4 accent-indigo-600" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Briefcase className="size-3.5 text-zinc-400" aria-hidden />
                  <span className="text-sm font-medium text-zinc-900">{role.title}</span>
                  <span className="text-sm text-zinc-500">at {prospect?.name}</span>
                  {role.stale ? <Badge tone="amber">Open 30+ days</Badge> : null}
                </span>
                <span className="block mt-0.5 text-xs text-zinc-500">
                  {role.location} - posted {formatRelative(role.postedOn, state.clock.today)} - {role.sourcedCandidateIds.length} Candidates sourced for it
                </span>
              </span>
            </label>
          ))}
        </div>
        {roles.length === 0 ? <p className="mt-2 text-xs text-zinc-500">No Detected Role at the Prospects of this Niche yet.</p> : null}
      </Field>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Sequence                                                         */
/* ------------------------------------------------------------------ */

export function SequenceStepView({ draft, update }: StepProps) {
  const seq = draft.sequence;
  const dayOf = (i: number) => seq.slice(1, i + 1).reduce((s, x) => s + (Number.isFinite(x.delayDays) ? x.delayDays : 0), 0);

  const set = (uid: string, patch: Partial<WizardSequenceStep>) => update({ sequence: seq.map((s) => (s.uid === uid ? { ...s, ...patch } : s)) });
  const remove = (uid: string) => update({ sequence: seq.filter((s) => s.uid !== uid) });
  const add = () => update({ sequence: [...seq, newSequenceStep(seq.length)] });

  return (
    <div className="space-y-5">
      <ol className="relative space-y-3">
        {seq.map((s, i) => (
          <li key={s.uid} className="relative flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{i + 1}</span>
              {i < seq.length - 1 ? <span className="mt-1 block w-px flex-1 bg-zinc-200" aria-hidden /> : null}
            </div>
            <div className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900">{i === 0 ? "First email" : `Follow-up ${i}`}</span>
                  <Badge tone="neutral">Day {dayOf(i)}</Badge>
                </div>
                {i > 0 ? (
                  <button
                    type="button"
                    onClick={() => remove(s.uid)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-zinc-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash className="size-3.5" aria-hidden /> Remove
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                <div>
                  <label className="text-xs font-medium text-zinc-600" htmlFor={`instr-${s.uid}`}>
                    Instruction for the Outreach Agent
                  </label>
                  <TextInput
                    id={`instr-${s.uid}`}
                    className="mt-1 w-full"
                    value={s.instruction}
                    placeholder={DEFAULT_INSTRUCTIONS[i]}
                    onChange={(e) => set(s.uid, { instruction: e.target.value })}
                  />
                </div>
                <div>
                  {i === 0 ? (
                    <>
                      <p className="text-xs font-medium text-zinc-600">Sent</p>
                      <p className="mt-1 flex h-8 items-center text-sm text-zinc-500">When the recipient joins</p>
                    </>
                  ) : (
                    <>
                      <label className="text-xs font-medium text-zinc-600" htmlFor={`delay-${s.uid}`}>
                        Days after email {i}
                      </label>
                      <TextInput
                        id={`delay-${s.uid}`}
                        type="number"
                        min={1}
                        max={30}
                        className="mt-1 w-full tabular-nums"
                        value={Number.isFinite(s.delayDays) ? s.delayDays : ""}
                        onChange={(e) => set(s.uid, { delayDays: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
                      />
                    </>
                  )}
                </div>
              </div>
              {i > 0 ? <p className="mt-2 text-xs text-zinc-500">Only sent if there is no reply, from the same Sending Mailbox, in the same thread.</p> : null}
            </div>
          </li>
        ))}
      </ol>
      {seq.length < 3 ? (
        <button
          type="button"
          onClick={add}
          className="ml-10 inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:border-indigo-400 hover:text-indigo-700"
        >
          <Plus className="size-4" aria-hidden /> Add a follow-up
        </button>
      ) : (
        <p className="ml-10 text-xs text-zinc-500">A Sequence has at most three emails.</p>
      )}
      <Callout tone="info">
        Follow-ups stop as soon as the recipient replies. An Out of Office reply pauses the Sequence until the return date, and a Bounce tries the next
        provider before anything else is sent.
      </Callout>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Sending                                                          */
/* ------------------------------------------------------------------ */

function rampNote(m: SendingMailbox): string {
  if (m.status === "warming") return `Ramping up: ${m.dailyCap} a day today, ${SENDING_LIMITS.perMailboxPerDay} from about day ${SENDING_LIMITS.rampDays}`;
  if (m.status === "active") return `${m.dailyCap} a day`;
  return "Not sending";
}

export function SendingStep({ state, draft, update }: StepProps) {
  const me = state.session.recruiterId;
  const mine = state.mailboxes.filter((m) => m.recruiterId === me);
  const othersCount = state.mailboxes.filter((m) => m.recruiterId !== me && isUsableMailbox(m)).length;
  const selected = mine.filter((m) => draft.mailboxIds.includes(m.id) && isUsableMailbox(m));
  const capacity = dailyCapacity(selected, SENDING_LIMITS.perDomainPerDay);

  const toggleMailbox = (id: string, on: boolean) => update({ mailboxIds: on ? [...draft.mailboxIds, id] : draft.mailboxIds.filter((x) => x !== id) });
  const toggleDay = (d: Weekday) =>
    update({ days: draft.days.includes(d) ? draft.days.filter((x) => x !== d) : WEEKDAYS.filter((x) => x === d || draft.days.includes(x)) });

  return (
    <div className="space-y-7">
      <Field
        label="Sending Mailboxes"
        hint={`Your own Google Workspace or Microsoft 365 mailboxes, never on a Main Domain. At most ${SENDING_LIMITS.perMailboxPerDay} emails per mailbox and ${SENDING_LIMITS.perDomainPerDay} per domain a day, fewer while a new mailbox ramps up.`}
      >
        {mine.length === 0 ? (
          <Callout
            tone="warning"
            title="No Sending Mailbox yet"
            action={
              <Link href="/settings/mailboxes" target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 text-sm font-medium text-amber-900 underline">
                Connect a mailbox <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            }
          >
            Campaign emails are sent from your own mailboxes on a lookalike domain. Connect one, or let us set one up for you: it opens in a new tab,
            and this draft waits here.
          </Callout>
        ) : (
          <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200">
            {mine.map((m) => {
              const usable = isUsableMailbox(m);
              const checked = usable && draft.mailboxIds.includes(m.id);
              return (
                <label key={m.id} className={cx("flex gap-3 px-3.5 py-3", usable ? "cursor-pointer hover:bg-zinc-50" : "cursor-not-allowed bg-zinc-50/70")}>
                  <Checkbox checked={checked} disabled={!usable} onChange={(v) => toggleMailbox(m.id, v)} label={m.address} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cx("break-all text-sm font-medium", usable ? "text-zinc-900" : "text-zinc-500")}>{m.address}</span>
                      <MailboxStatusBadge status={m.status} rampDay={m.rampDay} />
                      <span className="text-xs text-zinc-400">{m.provider === "google" ? "Google Workspace" : "Microsoft 365"}</span>
                    </span>
                    {usable ? (
                      <span className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-500">
                        <span>{rampNote(m)}</span>
                        <span className="tabular-nums">
                          {m.sentToday} / {m.dailyCap} sent today
                        </span>
                        <span className="tabular-nums">{m.bounceRate}% bounces</span>
                        {m.health.inboxPlacement !== null ? <span className="tabular-nums">{m.health.inboxPlacement}% inbox placement</span> : null}
                      </span>
                    ) : (
                      <span className={cx("block mt-1 text-xs leading-5", m.status === "refused" ? "text-red-700" : "text-amber-800")}>{m.statusReason}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <span>
            {selected.length > 0 ? (
              <>
                Up to <span className="font-medium tabular-nums text-zinc-900">{capacity}</span> emails a day from {selected.length === 1 ? "this mailbox" : `these ${selected.length} mailboxes`}.
              </>
            ) : (
              "Select at least one mailbox."
            )}
            {othersCount > 0 ? " Mailboxes of other Recruiters are not listed: each Sending Mailbox belongs to one Recruiter." : ""}
          </span>
          <Link href="/settings/mailboxes" target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 font-medium text-indigo-600 hover:text-indigo-500">
            Manage Sending Mailboxes <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        </div>
      </Field>

      <Field label="Sending window" hint="Emails go out on these days and hours, in each recipient's own time zone. Never on weekends.">
        <div className="flex flex-wrap items-center gap-1.5">
          {WEEKDAYS.map((d) => {
            const weekend = !SENDING_DAYS.includes(d);
            const on = draft.days.includes(d);
            return (
              <button
                key={d}
                type="button"
                disabled={weekend}
                aria-pressed={on}
                onClick={() => toggleDay(d)}
                title={weekend ? "Campaign emails are never sent on weekends" : undefined}
                className={cx(
                  "h-8 w-11 rounded-md border text-xs font-medium transition-colors",
                  weekend
                    ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-300"
                    : on
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
                )}
              >
                {weekdayShort(d)}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-700">
          <span className="inline-flex items-center gap-2">
            <span>From</span>
            <TextInput type="time" value={draft.start} onChange={(e) => update({ start: e.target.value })} className="w-28 tabular-nums" aria-label="Window start" />
            <span>to</span>
            <TextInput type="time" value={draft.end} onChange={(e) => update({ end: e.target.value })} className="w-28 tabular-nums" aria-label="Window end" />
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
            <Globe className="size-3.5" aria-hidden /> In each recipient&apos;s time zone
          </span>
        </div>
        <p className="mt-2 text-xs text-zinc-500">{formatWeekdays(draft.days)}, {draft.start} to {draft.end}.</p>
      </Field>

      <Callout tone="indigo">
        Each email sent costs{" "}
        <span className="whitespace-nowrap">
          {PRICES.emailSent} Credit <PriceHint />.
        </span>{" "}
        Credits are charged when an email leaves, never for drafts.
      </Callout>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Autonomy                                                         */
/* ------------------------------------------------------------------ */

export function AutonomyStep({ state, draft, update }: StepProps) {
  const name = useId();
  const me = state.session.recruiterId;
  const voices = state.voiceProfiles.filter((v) => v.recruiterId === me);
  const options: Autonomy[] = ["review_all", "review_first_n", "auto"];
  return (
    <div className="space-y-7">
      <div className="grid gap-3">
        {options.map((a) => (
          <RadioCard
            key={a}
            name={name}
            checked={draft.autonomy === a}
            onSelect={() => update({ autonomy: a })}
            extra={
              a === "review_first_n" && draft.autonomy === "review_first_n" ? (
                <div className="flex items-center gap-2 text-sm text-zinc-700">
                  <span>Review the first</span>
                  <TextInput
                    type="number"
                    min={1}
                    max={100}
                    value={Number.isFinite(draft.reviewFirstN) ? draft.reviewFirstN : ""}
                    onChange={(e) => update({ reviewFirstN: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
                    className="w-20 tabular-nums"
                    aria-label="Number of first emails to review"
                  />
                  <span>emails</span>
                </div>
              ) : null
            }
          >
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-900">
              {AUTONOMY_LABELS[a]}
              {a === "review_first_n" ? <Badge tone="indigo">Recommended</Badge> : null}
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-zinc-500">
              {AUTONOMY_DESCRIPTIONS[a].replace("first N", `first ${Number.isFinite(draft.reviewFirstN) ? draft.reviewFirstN : "N"}`)}
            </span>
          </RadioCard>
        ))}
      </div>

      <Callout tone="indigo" icon={<Reply className="size-4 text-indigo-500" aria-hidden />} title="Replies always wait for you">
        Our agents never send a reply. Every reply lands in your Inbox with a suggested next step and a drafted response that you edit and send yourself.
      </Callout>

      <div>
        <div className="text-sm font-medium text-zinc-800">Your Voice Profiles</div>
        <p className="mt-0.5 text-xs leading-5 text-zinc-500">
          Drafts are written in French for French recipients and in English otherwise. Every edit you make while reviewing teaches the Voice Profile of that
          language.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(["fr", "en"] as const).map((lang) => {
            const v = voices.find((x) => x.language === lang);
            return (
              <div key={lang} className="rounded-lg border border-zinc-200 px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-900">{lang === "fr" ? "French" : "English"}</span>
                  {v ? (
                    <Badge tone="green" icon={<Check className="size-3" aria-hidden />}>
                      Ready
                    </Badge>
                  ) : (
                    <Badge tone="amber">Missing</Badge>
                  )}
                </div>
                {v ? (
                  <div className="mt-1 text-xs leading-5 text-zinc-500">
                    {v.source === "mailbox_scan" ? `Learnt from ${formatNumber(v.emailsAnalysed)} sent emails` : "Learnt from pasted examples"}, {v.learnedFromEdits.length}{" "}
                    {v.learnedFromEdits.length === 1 ? "edit" : "edits"} learnt. Updated {formatDate(v.updatedOn)}.
                  </div>
                ) : (
                  <div className="mt-1 text-xs leading-5 text-zinc-500">
                    Drafts in this language use a neutral style.{" "}
                    <Link href="/settings/voice" target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 font-medium text-indigo-600 hover:text-indigo-500">
                      Add a Voice Profile <ArrowUpRight className="size-3" aria-hidden />
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Recipients                                                       */
/* ------------------------------------------------------------------ */

export function RecipientsStep({ state, draft, update }: StepProps) {
  const people = useEligible(state, draft.nicheId ?? "", draft.audience);
  const aboveRule = people.filter((p) => !p.blocked && p.info.signalStrength >= draft.autoAddMin).length;
  return (
    <div className="space-y-6">
      <RecipientPicker
        state={state}
        people={people}
        audience={draft.audience}
        selected={draft.selected}
        onChange={(selected) => update({ selected })}
        focus={pickerFocus(state, draft.audience, draft.detectedRoleId)}
      />

      <div className="rounded-lg border border-zinc-200 p-3.5">
        <div className="flex items-start gap-3">
          <Toggle checked={draft.autoAdd} onChange={(v) => update({ autoAdd: v })} label="Auto-add newly Enriched people" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-zinc-900">Auto-add newly Enriched people</div>
            <p className="mt-0.5 text-xs leading-5 text-zinc-500">
              When you enrich someone in this Niche whose Signal Strength is at or above the threshold, they join this Campaign with the same review rules.
            </p>
            {draft.autoAdd ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-xs text-zinc-600">Minimum Signal Strength</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={draft.autoAddMin}
                  onChange={(e) => update({ autoAddMin: Number(e.target.value) })}
                  className="w-48 accent-indigo-600"
                  aria-label="Minimum Signal Strength"
                />
                <span className="w-8 text-sm font-medium tabular-nums text-zinc-900">{draft.autoAddMin}</span>
                <span className="text-xs text-zinc-500">
                  {aboveRule} available {aboveRule === 1 ? "person is" : "people are"} at or above it today.
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small summary helpers used by the nav and the last step            */
/* ------------------------------------------------------------------ */

export function sequenceSummary(draft: WizardDraft): string {
  let day = 0;
  const days = draft.sequence.map((s, i) => {
    if (i > 0) day += Number.isFinite(s.delayDays) ? s.delayDays : 0;
    return day;
  });
  return `${draft.sequence.length} ${draft.sequence.length === 1 ? "email" : "emails"}, day ${days.join(", ")}`;
}

export function ShieldNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-5 text-zinc-500">
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
