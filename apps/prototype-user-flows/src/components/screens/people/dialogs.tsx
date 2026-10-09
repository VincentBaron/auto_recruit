"use client";

// Confirmation dialogs: Enrichment (cost before confirming, mobile ticked per person, never by
// default), Dismiss with a reason, Add to Campaign (creates a Claim, cost per email sent). The
// Enrichment rows read like the Feed's Enrichment dialog.

import Link from "next/link";
import { CircleAlert, Coins, Info, Lock, Mail, Megaphone, Smartphone } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PriceHint } from "@/components/ui/price-hint";
import { formatCreditsLabel, formatDate, plural } from "@/lib/format";
import { AUDIENCE_LABELS, CAMPAIGN_STATUS_LABELS, DISMISS_REASONS, DISMISS_REASON_LABELS } from "@/lib/labels";
import { PRICES } from "@/lib/pricing";
import type { Candidate, ClientState, DismissReason, FeedItemRef, HiringContact, PersonKind } from "@/lib/types";
import { campaignsForPerson, currentRecruiterId, enrichBlocker, mobileOf, recruiterName, usableEmail } from "./derive";
import { useAction, useToast } from "./feedback";
import { ClaimBadge, VerificationBadge } from "./parts";
import { Badge, Button, ButtonLink, Dialog, cx, inputClass } from "./ui";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Note({ icon, children, tone = "neutral" }: { icon?: ReactNode; children: ReactNode; tone?: "neutral" | "warning" | "danger" }) {
  return (
    <div
      className={cx(
        "flex items-start gap-2 rounded-md px-3 py-2 text-xs leading-5",
        tone === "danger" ? "bg-rose-50 text-rose-800" : tone === "warning" ? "bg-amber-50 text-amber-900" : "bg-zinc-50 text-zinc-600",
      )}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:size-3.5">{icon ?? <Info aria-hidden />}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Checkbox({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      title={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 shrink-0 cursor-pointer rounded border-zinc-300 accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

/** "Up to X Credits ..." then the balance and the placeholder price hint, left of a dialog's buttons. */
function CostNote({ children, balance }: { children: ReactNode; balance: number }) {
  return (
    <>
      <p className="flex items-start gap-1.5">
        <Coins className="mt-0.5 size-3.5 shrink-0 text-zinc-400" aria-hidden />
        <span>{children}</span>
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 pl-5 text-zinc-500">
        <span className="whitespace-nowrap tabular-nums">Balance {formatCreditsLabel(balance)}</span>
        <PriceHint />
      </p>
    </>
  );
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-200" role="alert">
      {error}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Enrichment                                                          */
/* ------------------------------------------------------------------ */

export interface EnrichTarget {
  kind: PersonKind;
  id: string;
}

type Choice = { selected: boolean; mobile: boolean };
const keyOf = (t: { kind: PersonKind; id: string }) => `${t.kind}:${t.id}`;

function findPerson(state: ClientState, t: EnrichTarget): HiringContact | Candidate | undefined {
  return t.kind === "candidate" ? state.candidates.find((c) => c.id === t.id) : state.hiringContacts.find((h) => h.id === t.id);
}

/**
 * Explicit, multi-select Enrichment (ADR-0005). Email always (work email for Hiring Contacts,
 * personal email for Candidates), a mobile number only when ticked for that person. `mode="mobile"`
 * is the "Find mobile number" shortcut for one person who already has an email: the mobile is the
 * one thing asked for, so it starts ticked. Render with a `key` that changes per opening.
 */
export function EnrichDialog({
  state,
  open,
  targets,
  mode = "enrich",
  onClose,
}: {
  state: ClientState;
  open: boolean;
  targets: EnrichTarget[];
  mode?: "enrich" | "mobile";
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(targets.map((t) => [keyOf(t), { selected: true, mobile: mode === "mobile" }])),
  );
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();
  const toast = useToast();
  const ws = state.workspace;
  const credits = ws?.credits ?? 0;
  const autoTopUp = Boolean(ws?.autoTopUp.enabled && ws.plan === "paid");

  const rows = targets.map((t) => {
    const person = findPerson(state, t);
    const blocker = person ? enrichBlocker(state, person, t.kind) : "No longer stored";
    const email = person ? usableEmail(person, t.kind) : null;
    const gotMobile = person ? Boolean(mobileOf(person)) : false;
    const c = choices[keyOf(t)] ?? { selected: false, mobile: false };
    const wantsMobile = !blocker && c.mobile && !gotMobile;
    const active = !blocker && c.selected && (!email || wantsMobile);
    const cost = active ? (email ? 0 : PRICES.verifiedEmail) + (wantsMobile ? PRICES.mobile : 0) : 0;
    return { t, person, blocker, email, gotMobile, c, wantsMobile, active, cost };
  });
  const chosen = rows.filter((r) => r.active);
  const total = chosen.reduce((sum, r) => sum + r.cost, 0);
  const short = total > credits;
  const blocked = short && !autoTopUp;
  const hasCandidates = targets.some((t) => t.kind === "candidate");
  const onlyCandidates = targets.every((t) => t.kind === "candidate");
  const single = targets.length === 1 ? rows[0] : null;
  const singleName = single?.person?.name ?? "this person";
  const mobileMode = mode === "mobile" && single !== null;

  const toggle = (key: string, patch: Partial<Choice>) =>
    setChoices((prev) => {
      const next = { ...(prev[key] ?? { selected: false, mobile: false }), ...patch };
      if (patch.selected === false) next.mobile = false;
      if (patch.mobile === true) next.selected = true;
      return { ...prev, [key]: next };
    });

  async function confirm() {
    setError(null);
    const res = await run("enrich", { people: chosen.map((r) => ({ kind: r.t.kind, id: r.t.id, mobile: r.wantsMobile })) });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const { results, creditsCharged, balance } = res.result;
    const hadEmail = new Set(rows.filter((r) => r.email).map((r) => keyOf(r.t)));
    const lines = results.map((r) => {
      // Only what this Enrichment found: an email the person already had is not news.
      const found = [r.email && !hadEmail.has(keyOf(r)) ? r.email.value : null, r.mobile?.value ?? null].filter((v): v is string => Boolean(v));
      if (found.length > 0) return `${r.name}: ${found.join(", ")}${r.note ? `. ${r.note}` : ""}`;
      return `${r.name} - ${r.note ?? "Nothing new found: no Credits charged"}`;
    });
    const enriched = results.filter((r) => r.creditsCharged > 0).length;
    // A searched person comes back with their email; a skipped one (Claim, Suppression List...) without.
    const searched = results.some((r) => r.email);
    toast({
      tone: creditsCharged > 0 ? "success" : "info",
      title:
        creditsCharged > 0
          ? mobileMode
            ? `Mobile number found - ${formatCreditsLabel(creditsCharged)} charged`
            : `Enriched ${plural(enriched, "person", "people")} - ${formatCreditsLabel(creditsCharged)} charged`
          : mobileMode && searched
            ? "No mobile number found - no Credits charged"
            : "Not enriched - no Credits charged",
      lines: [...lines, `Balance: ${formatCreditsLabel(balance)}`],
    });
    onClose();
  }

  const emailWord = onlyCandidates ? "A personal email" : hasCandidates ? "A work email for Hiring Contacts and a personal email for Candidates" : "A work email";
  const title = mobileMode ? `Find a mobile number for ${singleName}` : single ? `Enrich ${singleName}` : `Enrich ${targets.length} people`;
  const description = mobileMode
    ? `${singleName.split(" ")[0]} already has an email. A mobile number is searched only because you asked for it, and charged only if found. Every value keeps its Provenance.`
    : `${emailWord} is searched${single ? "" : " for each person"}, and a mobile number only ${single ? "if you tick it" : "for the people you tick"}. Credits are charged only for values found, and every value keeps its Provenance.`;
  const confirmLabel =
    chosen.length === 0
      ? "Nothing to enrich"
      : mobileMode
        ? `Find mobile · up to ${formatCreditsLabel(total)}`
        : `Enrich${single ? "" : ` ${plural(chosen.length, "person", "people")}`} · up to ${formatCreditsLabel(total)}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="sm:max-w-2xl"
      title={title}
      description={description}
      footerNote={
        <CostNote balance={credits}>
          Up to <span className="font-semibold text-zinc-900 tabular-nums">{formatCreditsLabel(total)}</span>, only for values found
        </CostNote>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={mobileMode ? <Smartphone /> : <Coins />} loading={pending === "enrich"} disabled={chosen.length === 0 || blocked} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-zinc-100 rounded-lg ring-1 ring-zinc-200">
        {rows.map(({ t, person, blocker, email, gotMobile, c, wantsMobile, cost }) => {
          const key = keyOf(t);
          const disabled = blocker !== null;
          const name = person?.name ?? "Deleted person";
          const subtitle = !person
            ? null
            : t.kind === "hiring_contact"
              ? `${(person as HiringContact).title} - rank ${(person as HiringContact).rank}`
              : (person as Candidate).currentTitle;
          return (
            <li key={key} className={cx("flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center", disabled && "bg-zinc-50/70")}>
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="pt-0.5">
                  <Checkbox
                    checked={!disabled && c.selected && (!email || c.mobile)}
                    disabled={disabled}
                    onChange={(v) => toggle(key, email ? { selected: v, mobile: v } : { selected: v })}
                    label={`Enrich ${name}`}
                  />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cx("min-w-0 truncate text-sm font-medium", disabled ? "text-zinc-500" : "text-zinc-900")}>{name}</span>
                    {person && <ClaimBadge state={state} claim={person.claim} />}
                  </div>
                  {subtitle && <p className="truncate text-xs text-zinc-500">{subtitle}</p>}
                  {(blocker || email) && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      {blocker ? (
                        <span>{blocker}</span>
                      ) : email ? (
                        <>
                          <span className="min-w-0 truncate">{email.value}</span>
                          <VerificationBadge verification={email.verification} />
                        </>
                      ) : null}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-4 pl-7 sm:justify-end sm:pl-0">
                <span className={cx("inline-flex items-center gap-1 whitespace-nowrap text-xs", email ? "text-zinc-400" : "text-zinc-600")}>
                  <Mail className="size-3.5" aria-hidden />
                  <span className="sm:hidden">Email</span>
                  <span className="hidden sm:inline">{t.kind === "candidate" ? "Personal email" : "Work email"}</span>
                  <span className="tabular-nums">{email ? "found" : `+${PRICES.verifiedEmail}`}</span>
                </span>
                <label
                  className={cx("inline-flex items-center gap-1.5 whitespace-nowrap text-xs", disabled || gotMobile ? "text-zinc-400" : "cursor-pointer text-zinc-700")}
                >
                  <Checkbox
                    checked={wantsMobile}
                    disabled={disabled || gotMobile}
                    onChange={(v) => toggle(key, { mobile: v })}
                    label={`Also find a mobile number for ${name}`}
                  />
                  <Smartphone className="size-3.5" aria-hidden />
                  Mobile
                  <span className="tabular-nums">{gotMobile ? "found" : `+${PRICES.mobile}`}</span>
                </label>
                <span className="w-[4.5rem] text-right text-xs font-semibold text-zinc-900 tabular-nums">{cost > 0 ? formatCreditsLabel(cost) : "-"}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 space-y-2">
        {hasCandidates && (
          <Note icon={<Lock aria-hidden />}>
            Work emails are not offered for Candidates: a Candidate is never emailed at their current employer&apos;s address.
          </Note>
        )}
        <Note>
          Every value keeps its Provenance: the provider or public page it came from, when, and how. Prices: verified email {formatCreditsLabel(PRICES.verifiedEmail)},
          mobile {formatCreditsLabel(PRICES.mobile)} <PriceHint />. Mobile numbers are never searched unless ticked.
        </Note>
        {short &&
          (blocked ? (
            <Note tone="danger" icon={<CircleAlert aria-hidden />}>
              Not enough Credits: this costs up to {formatCreditsLabel(total)} and the balance is {formatCreditsLabel(credits)}.{" "}
              <Link href="/credits" className="font-medium underline">
                Buy Credits
              </Link>
            </Note>
          ) : (
            <Note tone="warning" icon={<CircleAlert aria-hidden />}>
              The balance is short: auto top-up adds a {formatCreditsLabel(ws?.autoTopUp.packCredits ?? 0)} pack before charging.
            </Note>
          ))}
      </div>
      <ErrorNote error={error} />
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Dismiss                                                             */
/* ------------------------------------------------------------------ */

export function DismissDialog({
  open,
  onClose,
  items,
  label,
}: {
  open: boolean;
  onClose: () => void;
  items: FeedItemRef[];
  label: string;
}) {
  const [reason, setReason] = useState<DismissReason>("not_a_fit");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();
  const toast = useToast();

  async function confirm() {
    setError(null);
    const res = await run("dismiss", { items, reason, note: note.trim() || undefined });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast({ tone: "success", title: `${label} Dismissed`, lines: [`Reason: ${DISMISS_REASON_LABELS[reason]}. The agents learn from it.`] });
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Dismiss ${label}`}
      description="Dismissed items leave the Feed. The reason helps the agents tune the Niche Profile."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending === "dismiss"} onClick={confirm}>
            Dismiss
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="text-xs font-medium text-zinc-700">Reason</legend>
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {DISMISS_REASONS.map((r) => (
            <label
              key={r}
              className={cx(
                "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ring-1 ring-inset",
                reason === r ? "bg-indigo-50 text-indigo-900 ring-indigo-300" : "text-zinc-700 ring-zinc-200 hover:bg-zinc-50",
              )}
            >
              <input type="radio" name="dismiss-reason" className="accent-indigo-600" checked={reason === r} onChange={() => setReason(r)} />
              {DISMISS_REASON_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-4 block">
        <span className="text-xs font-medium text-zinc-700">Note (optional)</span>
        <textarea className={cx(inputClass, "mt-1.5 min-h-[64px] resize-y")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: placed by us in 2024" />
      </label>
      <ErrorNote error={error} />
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Add to Campaign                                                     */
/* ------------------------------------------------------------------ */

export function AddToCampaignDialog({
  state,
  open,
  onClose,
  person,
  nicheIds,
}: {
  state: ClientState;
  open: boolean;
  onClose: () => void;
  person: { kind: PersonKind; id: string; name: string };
  nicheIds: string[];
}) {
  const audience = person.kind === "candidate" ? "candidates" : "hiring_contacts";
  const me = currentRecruiterId(state);
  const campaigns = campaignsForPerson(state, person.kind, nicheIds);
  const mine = campaigns.filter((c) => c.ownerId === me);
  const [selected, setSelected] = useState<string | null>(mine[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();
  const toast = useToast();
  const campaign = selected ? state.campaigns.find((c) => c.id === selected) ?? null : null;
  const steps = campaign?.sequence.length ?? 0;
  const credits = state.workspace?.credits ?? 0;

  async function confirm() {
    if (!campaign) return;
    setError(null);
    const res = await run("addRecipients", { campaignId: campaign.id, people: [{ kind: person.kind, id: person.id }] });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.result.skipped.length > 0) {
      setError(res.result.skipped.map((s) => `${s.name}: ${s.reason}`).join(" "));
      return;
    }
    toast({
      tone: "success",
      title: `${person.name} added to ${campaign.name}`,
      lines: ["Claim taken: only you can contact them until it lapses after 90 days without activity."],
      link: { label: "Open the Campaign", href: `/campaigns/${campaign.id}` },
    });
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="sm:max-w-2xl"
      title={`Add ${person.name} to a Campaign`}
      description={`Campaigns to ${AUDIENCE_LABELS[audience]} in this Niche. Adding someone takes a Claim, so no other Recruiter can contact them.`}
      footerNote={
        campaigns.length === 0 ? undefined : campaign ? (
          <CostNote balance={credits}>
            Up to <span className="font-semibold text-zinc-900 tabular-nums">{formatCreditsLabel(steps * PRICES.emailSent)}</span> as emails are sent (
            {formatCreditsLabel(PRICES.emailSent)} per email)
          </CostNote>
        ) : (
          <CostNote balance={credits}>Pick a Campaign to see the cost.</CostNote>
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Megaphone />} disabled={!campaign} loading={pending === "addRecipients"} onClick={confirm}>
            Add and take the Claim
          </Button>
        </>
      }
    >
      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center">
          <p className="text-sm font-medium text-zinc-900">No Campaign to {AUDIENCE_LABELS[audience]} in this Niche yet</p>
          <p className="mt-1 text-sm text-zinc-500">Create one, then add {person.name} from here or from the Feed.</p>
          <ButtonLink href="/campaigns/new" variant="secondary" size="sm" className="mt-3">
            Create a Campaign
          </ButtonLink>
        </div>
      ) : (
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-zinc-700">Campaign</legend>
          <ul className="space-y-1.5">
            {campaigns.map((c) => {
              const owned = c.ownerId === me;
              const count = state.recipients.filter((r) => r.campaignId === c.id).length;
              return (
                <li key={c.id}>
                  <label
                    className={cx(
                      "flex items-start gap-3 rounded-lg px-3 py-2.5 ring-1 ring-inset",
                      !owned ? "cursor-not-allowed bg-zinc-50 ring-zinc-200" : selected === c.id ? "cursor-pointer bg-indigo-50 ring-indigo-300" : "cursor-pointer ring-zinc-200 hover:bg-zinc-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="campaign"
                      className="mt-1 accent-indigo-600"
                      disabled={!owned}
                      checked={selected === c.id}
                      onChange={() => setSelected(c.id)}
                    />
                    <span className="block min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cx("text-sm font-medium", owned ? "text-zinc-900" : "text-zinc-500")}>{c.name}</span>
                        <Badge tone={c.status === "active" ? "green" : c.status === "paused" ? "amber" : "neutral"}>{CAMPAIGN_STATUS_LABELS[c.status]}</Badge>
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        {owned ? (
                          "Your Campaign"
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Lock className="size-3" /> {recruiterName(state, c.ownerId)}&apos;s Campaign: only they can add people
                          </span>
                        )}{" "}
                        · {plural(c.sequence.length, "email")} in the Sequence · {plural(count, "recipient")} · since {formatDate(c.createdOn)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
      <div className="mt-4 space-y-2">
        {person.kind === "candidate" && (
          <Note icon={<Lock aria-hidden />}>Candidates are emailed at their personal email only. The first email carries the Article 14 Notice in its footer.</Note>
        )}
        <Note>Emails go out within the Campaign&apos;s sending window and Sending Mailbox caps. Credits are charged only when an email leaves, never for drafts.</Note>
      </div>
      <ErrorNote error={error} />
    </Dialog>
  );
}
