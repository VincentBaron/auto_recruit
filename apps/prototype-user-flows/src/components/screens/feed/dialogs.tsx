"use client";

// Dialogs behind the Feed's multi-select actions. Every Credit-spending action shows its cost
// before the Recruiter confirms (Enrichment, Campaign sends).

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, Coins, Info, Lock, Mail, Smartphone, X } from "lucide-react";
import { PriceHint } from "@/components/ui/price-hint";
import { formatCredits, formatCreditsLabel, plural } from "@/lib/format";
import { AUDIENCE_LABELS, CAMPAIGN_STATUS_LABELS, DISMISS_REASONS, DISMISS_REASON_LABELS } from "@/lib/labels";
import { PRICES, emailKindFor } from "@/lib/pricing";
import type { ActionResult, Candidate, DismissReason, FeedItemRef, HiringContact, ISODate, PersonKind, PersonRef } from "@/lib/types";
import { act } from "@/lib/api";
import { type EnrichRequest, useFeed } from "./context";
import { setModalOpen } from "./keys";
import {
  campaignsFor,
  claimInfo,
  enrichBlocker,
  enrichEstimate,
  getPerson,
  hasEmail,
  hasMobile,
  nicheShortName,
  personNicheIds,
} from "./model";
import { ClaimBadge, ContactValueRow, VerificationBadge } from "./parts";
import { Badge, Button, ButtonLink, Checkbox, cx } from "./ui";

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  width = "max-w-2xl",
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    setModalOpen(true);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      setModalOpen(false);
      previous?.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl ring-1 ring-zinc-200 outline-none sm:rounded-xl",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-zinc-900">
              {title}
            </h2>
            {description ? <div className="mt-1 text-sm text-zinc-500">{description}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mt-1 -mr-2 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-zinc-200 bg-zinc-50 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

function Note({ icon, children, tone = "neutral" }: { icon?: ReactNode; children: ReactNode; tone?: "neutral" | "warning" | "danger" }) {
  return (
    <p
      className={cx(
        "flex items-start gap-2 rounded-md px-3 py-2 text-xs",
        tone === "danger" ? "bg-rose-50 text-rose-800" : tone === "warning" ? "bg-amber-50 text-amber-900" : "bg-zinc-50 text-zinc-600",
      )}
    >
      <span className="mt-px shrink-0">{icon ?? <Info className="size-3.5" aria-hidden />}</span>
      <span>{children}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Enrich                                                              */
/* ------------------------------------------------------------------ */

type Choice = { selected: boolean; mobile: boolean };
const refKey = (r: PersonRef) => `${r.kind}:${r.id}`;

/** Who a row is about, as it was when the dialog opened (a person may be deleted while it is open). */
interface Snapshot {
  name: string;
  detail: string;
  deleteOn: ISODate | null;
}

function personDetail(person: HiringContact | Candidate, kind: PersonKind): string {
  return kind === "hiring_contact" ? `${(person as HiringContact).title} · rank ${(person as HiringContact).rank}` : (person as Candidate).currentTitle;
}

/** Why a person the dialog opened with is no longer stored. */
function goneReason(kind: PersonKind, snap: Snapshot, today: ISODate): string {
  if (kind === "candidate" && snap.deleteOn && snap.deleteOn <= today) return "Deleted under the 25-day retention rule";
  return "No longer stored: deleted from this Workspace";
}

interface EnrichRow {
  ref: PersonRef;
  /** Null once the person is no longer stored. */
  person: HiringContact | Candidate | null;
  snap: Snapshot;
  blocker: string | null;
}

export function EnrichDialog({ request, onClose }: { request: EnrichRequest; onClose: () => void }) {
  const { model, run, notify, openAddToCampaign } = useFeed();
  const [choices, setChoices] = useState<Record<string, Choice>>(() => {
    const init: Record<string, Choice> = {};
    for (const g of request.groups) {
      for (const p of g.people) init[refKey(p.ref)] = { selected: p.selected ?? true, mobile: p.mobile ?? false };
    }
    return init;
  });
  // The rows the dialog opened with stay listed: someone deleted, claimed or suppressed meanwhile is
  // shown disabled with the reason instead of vanishing.
  const [snapshots] = useState<Map<string, Snapshot>>(() => {
    const m = new Map<string, Snapshot>();
    for (const g of request.groups) {
      for (const p of g.people) {
        const person = getPerson(model, p.ref);
        if (person) m.set(refKey(p.ref), { name: person.name, detail: personDetail(person, p.ref.kind), deleteOn: p.ref.kind === "candidate" ? (person as Candidate).deleteOn : null });
      }
    }
    return m;
  });
  const [phase, setPhase] = useState<"choose" | "running" | "done">("choose");
  const [result, setResult] = useState<ActionResult<"enrich"> | null>(null);
  const [quote, setQuote] = useState<{ key: string; data: ActionResult<"quoteEnrichment"> } | null>(null);

  const rows = useMemo(
    () =>
      request.groups.map((g) => ({
        ...g,
        people: g.people
          .map((p): EnrichRow | null => {
            const snap = snapshots.get(refKey(p.ref));
            if (!snap) return null;
            const person = getPerson(model, p.ref) ?? null;
            const blocker = person ? enrichBlocker(model, person, p.ref.kind) : goneReason(p.ref.kind, snap, model.today);
            return { ref: p.ref, person, snap, blocker };
          })
          .filter((x): x is EnrichRow => x !== null),
      })),
    [request, model, snapshots],
  );

  // A person counts when there is something to find: the email, or a ticked mobile.
  const selected = rows.flatMap((g) =>
    g.people.flatMap((p) => {
      const c = choices[refKey(p.ref)];
      if (!p.person || p.blocker || !c?.selected || (hasEmail(p.person, p.ref.kind) && !c.mobile)) return [];
      return [{ ref: p.ref, person: p.person, mobile: c.mobile }];
    }),
  );
  const payload = selected.map((p) => ({ kind: p.ref.kind, id: p.ref.id, mobile: p.mobile }));
  const payloadKey = JSON.stringify(payload);
  const localTotal = selected.reduce((sum, p) => sum + enrichEstimate(p.person, p.ref.kind, p.mobile), 0);
  const serverQuote = quote && quote.key === payloadKey ? quote.data : null;
  const total = serverQuote ? serverQuote.total : localTotal;
  const skippedByServer = new Map((serverQuote?.lines ?? []).filter((l) => l.skipped).map((l) => [`${l.kind}:${l.id}`, l.skipped as string]));

  // Server quote (same rules as `enrich`), debounced; the local estimate shows meanwhile.
  useEffect(() => {
    if (phase !== "choose" || payloadKey === "[]") return;
    const people = JSON.parse(payloadKey) as { kind: PersonKind; id: string; mobile: boolean }[];
    let cancelled = false;
    const t = setTimeout(() => {
      void act("quoteEnrichment", { people }).then((res) => {
        if (res.ok && !cancelled) setQuote({ key: payloadKey, data: res.result });
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [payloadKey, phase]);

  const ws = model.state.workspace;
  const autoTopUp = ws?.autoTopUp.enabled && ws.plan === "paid";
  const insufficient = total > model.credits && !autoTopUp;
  const hasCandidates = rows.some((g) => g.people.some((p) => p.ref.kind === "candidate"));

  const toggle = (key: string, patch: Partial<Choice>) =>
    setChoices((c) => {
      const prev = c[key] ?? { selected: false, mobile: false };
      const next = { ...prev, ...patch };
      if (patch.selected === false) next.mobile = false;
      if (patch.mobile === true) next.selected = true;
      return { ...c, [key]: next };
    });

  const confirm = async () => {
    // Who already held an email: only newly found emails count in the toast.
    const hadEmail = new Set(selected.filter((p) => hasEmail(p.person, p.ref.kind)).map((p) => refKey(p.ref)));
    setPhase("running");
    const res = await run("enrich", { people: payload });
    if (!res) {
      setPhase("choose");
      return;
    }
    setResult(res);
    setPhase("done");
    request.onDone?.();
    const emails = res.results.filter((r) => r.email && !hadEmail.has(`${r.kind}:${r.id}`)).length;
    const mobiles = res.results.filter((r) => r.mobile).length;
    const found = mobiles > 0 ? `${plural(emails, "email")} and ${plural(mobiles, "mobile")} found` : `${plural(emails, "email")} found`;
    notify({
      tone: "success",
      title: `Enriched ${plural(res.results.length, "person", "people")}`,
      description: `${found} - ${formatCreditsLabel(res.creditsCharged)} charged`,
    });
  };

  if (phase === "done" && result) {
    const enrichedRefs: PersonRef[] = result.results.filter((r) => r.email).map((r) => ({ kind: r.kind, id: r.id }));
    const sameKind = enrichedRefs.length > 0 && enrichedRefs.every((r) => r.kind === enrichedRefs[0].kind);
    return (
      <Modal
        title="Enrichment done"
        description={
          <>
            {formatCreditsLabel(result.creditsCharged)} charged, only for values found. Balance {formatCredits(result.balance)}.
          </>
        }
        onClose={onClose}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {sameKind ? (
              <Button
                onClick={() => {
                  onClose();
                  openAddToCampaign(enrichedRefs);
                }}
              >
                Add to a Campaign
              </Button>
            ) : null}
            <Button tone="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        }
      >
        <ul className="divide-y divide-zinc-100">
          {result.results.map((r) => (
            <li key={`${r.kind}:${r.id}`} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-zinc-900">{r.name}</p>
                <span className="shrink-0 text-xs text-zinc-500 tabular-nums">{formatCreditsLabel(r.creditsCharged)}</span>
              </div>
              {r.email ? (
                <ContactValueRow value={r.email} today={model.today} />
              ) : (
                <p className="py-2 text-xs text-zinc-500">No {r.kind === "candidate" ? "personal" : "work"} email found. Nothing charged for it.</p>
              )}
              {r.mobile ? <ContactValueRow value={r.mobile} today={model.today} /> : null}
              {r.note ? <p className="text-xs text-zinc-500">{r.note}</p> : null}
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  const count = selected.length;
  return (
    <Modal
      title="Enrich contact details"
      description="Find verified contact details for the people you tick. Mobile numbers are ticked per person, never by default."
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-zinc-600">
            <p className="flex items-center gap-1.5">
              <Coins className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
              <span>
                Up to <span className="font-semibold text-zinc-900 tabular-nums">{formatCreditsLabel(total)}</span>, charged only for values found
              </span>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-5 text-zinc-500">
              <span className="tabular-nums">Balance {formatCreditsLabel(model.credits)}</span>
              <span aria-hidden>·</span>
              <PriceHint />
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button tone="primary" onClick={confirm} disabled={count === 0 || insufficient} loading={phase === "running"}>
              Enrich {count > 0 ? plural(count, "person", "people") : ""} - {formatCreditsLabel(total)}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {rows.map((g, gi) => (
          <section key={g.title ?? `group-${gi}`}>
            {g.title ? (
              <div className="mb-1 flex items-baseline gap-2">
                <h3 className="text-sm font-semibold text-zinc-900">{g.title}</h3>
                {g.subtitle ? <span className="truncate text-xs text-zinc-500">{g.subtitle}</span> : null}
              </div>
            ) : null}
            {g.people.length === 0 ? (
              <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500">No Hiring Contact found at this Prospect yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-lg ring-1 ring-zinc-200">
                {g.people.map(({ ref, person, snap, blocker }) => {
                  const key = refKey(ref);
                  const c = choices[key] ?? { selected: false, mobile: false };
                  const emailKind = emailKindFor(ref.kind);
                  const gotEmail = person ? hasEmail(person, ref.kind) : false;
                  const gotMobile = person ? hasMobile(person) : false;
                  const existingEmail = person?.contactValues.find((v) => v.kind === emailKind && v.verification !== "invalid");
                  const claim = person ? claimInfo(model, person.claim) : null;
                  const skipped = skippedByServer.get(key);
                  const disabled = Boolean(blocker);
                  const cost = !person || disabled || !c.selected ? 0 : enrichEstimate(person, ref.kind, c.mobile);
                  // "Already Enriched" shows the values instead; a Claim shows its badge.
                  const reason = blocker && blocker !== "Already Enriched" && claim?.kind !== "other" ? blocker : null;
                  return (
                    <li key={key} className={cx("flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center", disabled && "bg-zinc-50/70")}>
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="pt-0.5">
                          <Checkbox
                            checked={!disabled && c.selected && (!gotEmail || c.mobile)}
                            disabled={disabled}
                            onChange={(v) => toggle(key, gotEmail ? { selected: v, mobile: v } : { selected: v })}
                            label={`Enrich ${snap.name}`}
                          />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={cx("truncate text-sm font-medium", disabled ? "text-zinc-500" : "text-zinc-900")}>{snap.name}</span>
                            <span className="truncate text-xs text-zinc-500">{snap.detail}</span>
                            {claim ? <ClaimBadge info={claim} /> : null}
                          </div>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                            {reason ? <span className="text-amber-700">{reason}</span> : null}
                            {claim?.kind === "other" ? <span>Cannot be enriched or contacted by you.</span> : null}
                            {existingEmail ? (
                              <>
                                <span className="truncate">{existingEmail.value}</span>
                                <VerificationBadge verification={existingEmail.verification} />
                              </>
                            ) : null}
                            {skipped && !blocker ? <span className="text-amber-700">{skipped}</span> : null}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-4 pl-7 sm:justify-end sm:pl-0">
                        <span className={cx("inline-flex items-center gap-1 text-xs whitespace-nowrap", gotEmail || disabled ? "text-zinc-400" : "text-zinc-600")}>
                          <Mail className="size-3.5" aria-hidden />
                          <span className="sm:hidden">Email</span>
                          <span className="hidden sm:inline">{ref.kind === "candidate" ? "Personal email" : "Work email"}</span>
                          <span className="tabular-nums">{gotEmail ? "found" : `+${PRICES.verifiedEmail}`}</span>
                        </span>
                        <label
                          className={cx(
                            "inline-flex items-center gap-1.5 text-xs whitespace-nowrap",
                            disabled || gotMobile ? "text-zinc-400" : "cursor-pointer text-zinc-700",
                          )}
                        >
                          <Checkbox
                            checked={c.mobile && !disabled && !gotMobile}
                            disabled={disabled || gotMobile}
                            onChange={(v) => toggle(key, { mobile: v })}
                            label={`Also find a mobile number for ${snap.name}`}
                          />
                          <Smartphone className="size-3.5" aria-hidden />
                          Mobile
                          <span className="tabular-nums">{gotMobile ? "found" : `+${PRICES.mobile}`}</span>
                        </label>
                        <span className="w-16 text-right text-xs font-semibold text-zinc-900 tabular-nums">{cost > 0 ? formatCreditsLabel(cost) : "-"}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
        <div className="space-y-2">
          {hasCandidates ? (
            <Note icon={<Lock className="size-3.5" aria-hidden />}>
              Work emails are not offered for Candidates: a Candidate is never emailed at their current employer&apos;s address.
            </Note>
          ) : null}
          <Note>
            Every value keeps its Provenance: the provider or public page it came from, when, and how. Prices: verified email{" "}
            {formatCreditsLabel(PRICES.verifiedEmail)}, mobile {formatCreditsLabel(PRICES.mobile)} <PriceHint />
          </Note>
          {insufficient ? (
            <Note tone="danger" icon={<CircleAlert className="size-3.5" aria-hidden />}>
              Not enough Credits: this costs up to {formatCreditsLabel(total)} and the balance is {formatCredits(model.credits)}.{" "}
              <Link href="/credits" className="font-medium underline">
                Buy Credits
              </Link>
            </Note>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Dismiss                                                             */
/* ------------------------------------------------------------------ */

function itemName(model: ReturnType<typeof useFeed>["model"], ref: FeedItemRef): string {
  if (ref.kind === "prospect") return model.prospectById.get(ref.id)?.name ?? "Prospect";
  return getPerson(model, { kind: ref.kind, id: ref.id })?.name ?? "Person";
}

function itemNoun(items: FeedItemRef[]): string {
  const kinds = new Set(items.map((i) => i.kind));
  const n = items.length;
  if (kinds.size === 1 && kinds.has("prospect")) return plural(n, "Prospect");
  if (kinds.size === 1 && kinds.has("candidate")) return plural(n, "Candidate");
  return plural(n, "item");
}

/** Reasons that only make sense for a company. */
const PROSPECT_ONLY_REASONS = new Set<DismissReason>(["wrong_size", "already_client"]);

/**
 * The dismiss reasons offered for these items: every reason for Prospects; for Candidates (and a mixed
 * selection, which the Feed never builds) only the reasons that apply to a person.
 */
export function dismissReasonsFor(kinds: FeedItemRef["kind"][]): DismissReason[] {
  const onlyProspects = kinds.length > 0 && kinds.every((k) => k === "prospect");
  return onlyProspects ? DISMISS_REASONS : DISMISS_REASONS.filter((r) => !PROSPECT_ONLY_REASONS.has(r));
}

export function DismissDialog({ items, onClose, onDone }: { items: FeedItemRef[]; onClose: () => void; onDone?: () => void }) {
  const { model, run, notify } = useFeed();
  const [reasons] = useState(() => dismissReasonsFor(items.map((i) => i.kind)));
  const reasonsRef = useRef(reasons);
  const [reason, setReason] = useState<DismissReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const names = items.map((i) => itemName(model, i));
  const noun = itemNoun(items);

  const confirm = async (r: DismissReason | null = reason) => {
    if (!r || busy) return;
    setBusy(true);
    const res = await run("dismiss", { items, reason: r, note: note.trim() || undefined });
    setBusy(false);
    if (!res) return;
    onClose();
    onDone?.();
    notify({
      tone: "info",
      title: `${noun} dismissed`,
      description: DISMISS_REASON_LABELS[r],
      action: {
        label: "Undo",
        onClick: () => {
          void run("undismiss", { items });
        },
      },
    });
  };
  const confirmRef = useRef(confirm);
  useEffect(() => {
    confirmRef.current = confirm;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.tagName === "TEXTAREA" || (el instanceof HTMLInputElement && el.type !== "radio"))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      const list = reasonsRef.current;
      if (Number.isInteger(n) && n >= 1 && n <= list.length) {
        e.preventDefault();
        setReason(list[n - 1]);
      } else if (e.key === "Enter" && !(el instanceof HTMLButtonElement)) {
        e.preventDefault();
        void confirmRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Modal
      title={`Dismiss ${noun}`}
      width="max-w-lg"
      description={
        <span className="block truncate">
          {names.slice(0, 3).join(", ")}
          {names.length > 3 ? ` and ${names.length - 3} more` : ""}
        </span>
      }
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">Dismissals stay inside this Workspace. You can undo them.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button tone="dark" disabled={!reason} loading={busy} onClick={() => void confirm()}>
              Dismiss {noun}
            </Button>
          </div>
        </div>
      }
    >
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-zinc-700">Reason</legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {reasons.map((r, i) => (
            <label
              key={r}
              className={cx(
                "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm ring-1 ring-inset",
                reason === r ? "bg-indigo-50 text-indigo-900 ring-indigo-300" : "text-zinc-700 ring-zinc-200 hover:bg-zinc-50",
              )}
            >
              <input type="radio" name="dismiss-reason" className="accent-indigo-600" checked={reason === r} onChange={() => setReason(r)} />
              <span className="flex-1">{DISMISS_REASON_LABELS[r]}</span>
              <span className="text-[11px] text-zinc-400 tabular-nums">{i + 1}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-4 block">
        <span className="text-xs font-medium text-zinc-700">Note (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="For example: placed by us in 2024"
          className="mt-1 block w-full resize-none rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
      </label>
      <p className="mt-3 text-[11px] text-zinc-400">Press 1-{reasons.length} to pick a reason, Enter to confirm.</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Add to Campaign                                                     */
/* ------------------------------------------------------------------ */

export function AddToCampaignDialog({ people, onClose }: { people: PersonRef[]; onClose: () => void }) {
  const { model, run, notify } = useFeed();
  const kind: PersonKind = people[0]?.kind ?? "candidate";
  const nicheIds = useMemo(() => Array.from(new Set(people.flatMap((p) => personNicheIds(model, p)))), [people, model]);
  const campaigns = campaignsFor(model, kind, nicheIds);
  const firstEligible = campaigns.find((c) => nicheIds.includes(c.nicheId));
  const [campaignId, setCampaignId] = useState<string | null>(firstEligible?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult<"addRecipients"> | null>(null);
  const campaign = campaignId ? model.campaignById.get(campaignId) ?? null : null;

  const rows = people
    .map((ref) => {
      const person = getPerson(model, ref);
      if (!person) return null;
      const claim = claimInfo(model, person.claim);
      let blocker: string | null = null;
      if (claim.kind === "other") blocker = `Claimed by ${claim.recruiterName}: cannot be added`;
      else if (!hasEmail(person, ref.kind)) blocker = "Not Enriched yet: enrich first";
      else if (campaign && model.state.recipients.some((r) => r.campaignId === campaign.id && r.personId === ref.id && r.personKind === ref.kind))
        blocker = "Already in this Campaign";
      return { ref, person, claim, blocker };
    })
    .filter((x) => x !== null);
  const eligible = rows.filter((r) => !r.blocker);
  const steps = campaign?.sequence.length ?? 1;
  const owner = campaign ? model.recruiterById.get(campaign.ownerId)?.name ?? "the Campaign owner" : "the Campaign owner";

  const confirm = async () => {
    if (!campaign || eligible.length === 0) return;
    setBusy(true);
    const res = await run("addRecipients", { campaignId: campaign.id, people: eligible.map((e) => e.ref) });
    setBusy(false);
    if (!res) return;
    setResult(res);
    notify({
      tone: "success",
      title: `${plural(res.added.length, "recipient")} added to ${campaign.name}`,
      description: res.skipped.length > 0 ? `${res.skipped.length} skipped` : undefined,
      link: { label: "Open Campaign", href: `/campaigns/${campaign.id}` },
    });
  };

  if (result && campaign) {
    return (
      <Modal
        title="Added to the Campaign"
        description={campaign.name}
        onClose={onClose}
        width="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <ButtonLink href={`/campaigns/${campaign.id}`}>Open Campaign</ButtonLink>
            <Button tone="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        }
      >
        <p className="text-sm text-zinc-700">
          {plural(result.added.length, "person", "people")} added. Each now carries a Claim for {owner}.
        </p>
        {result.skipped.length > 0 ? (
          <ul className="mt-3 divide-y divide-zinc-100 rounded-lg ring-1 ring-zinc-200">
            {result.skipped.map((s) => (
              <li key={`${s.kind}:${s.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="truncate font-medium text-zinc-900">{s.name}</span>
                <span className="shrink-0 text-xs text-zinc-500">{s.reason}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Modal>
    );
  }

  return (
    <Modal
      title="Add to a Campaign"
      description={`Campaigns to ${AUDIENCE_LABELS[kind === "candidate" ? "candidates" : "hiring_contacts"]} in the same Niche. Adding someone takes a Claim: other Recruiters see who claimed them and cannot add them.`}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-zinc-600">
            <Coins className="size-3.5 text-zinc-400" aria-hidden />
            {campaign ? (
              <span>
                Up to <span className="font-semibold text-zinc-900 tabular-nums">{formatCreditsLabel(eligible.length * steps * PRICES.emailSent)}</span> as emails
                are sent ({formatCreditsLabel(PRICES.emailSent)} per email) <PriceHint />
              </span>
            ) : (
              <span>Pick a Campaign to see the cost.</span>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button tone="primary" disabled={!campaign || eligible.length === 0} loading={busy} onClick={() => void confirm()}>
              Add {plural(eligible.length, "person", "people")}
            </Button>
          </div>
        </div>
      }
    >
      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center">
          <p className="text-sm font-medium text-zinc-900">No Campaign to {AUDIENCE_LABELS[kind === "candidate" ? "candidates" : "hiring_contacts"]} yet</p>
          <p className="mt-1 text-sm text-zinc-500">Create one with a Brief and a Sequence, then add these people.</p>
          <ButtonLink href="/campaigns/new" tone="primary" size="sm" className="mt-3">
            Create a Campaign
          </ButtonLink>
        </div>
      ) : (
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-zinc-700">Campaign</legend>
          <div className="space-y-1.5">
            {campaigns.map((c) => {
              const sameNiche = nicheIds.includes(c.nicheId);
              const recipients = model.state.recipients.filter((r) => r.campaignId === c.id).length;
              return (
                <label
                  key={c.id}
                  className={cx(
                    "flex items-start gap-3 rounded-md px-3 py-2.5 ring-1 ring-inset",
                    !sameNiche ? "cursor-not-allowed opacity-50 ring-zinc-200" : campaignId === c.id ? "cursor-pointer bg-indigo-50 ring-indigo-300" : "cursor-pointer ring-zinc-200 hover:bg-zinc-50",
                  )}
                >
                  <input
                    type="radio"
                    name="campaign"
                    className="mt-1 accent-indigo-600"
                    disabled={!sameNiche}
                    checked={campaignId === c.id}
                    onChange={() => setCampaignId(c.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-zinc-900">{c.name}</span>
                      <Badge tone={c.status === "active" ? "success" : c.status === "paused" ? "warning" : "neutral"}>{CAMPAIGN_STATUS_LABELS[c.status]}</Badge>
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {nicheShortName(model.nicheById.get(c.nicheId))} · {model.recruiterById.get(c.ownerId)?.name ?? "Unknown"} · {plural(c.sequence.length, "step")} ·{" "}
                      {plural(recipients, "recipient")}
                      {!sameNiche ? " · different Niche" : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-zinc-700">People</p>
        <ul className="divide-y divide-zinc-100 rounded-lg ring-1 ring-zinc-200">
          {rows.map((r) => (
            <li key={refKey(r.ref)} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cx("truncate text-sm font-medium", r.blocker ? "text-zinc-400" : "text-zinc-900")}>{r.person.name}</span>
                <ClaimBadge info={r.claim} compact />
              </span>
              <span className={cx("shrink-0 text-xs", r.blocker ? "text-amber-700" : "text-emerald-700")}>{r.blocker ?? "Ready"}</span>
            </li>
          ))}
        </ul>
      </div>
      {kind === "candidate" ? (
        <div className="mt-3">
          <Note icon={<Lock className="size-3.5" aria-hidden />}>
            Candidates are emailed at their personal email only. The first email carries the Article 14 Notice in its footer.
          </Note>
        </div>
      ) : null}
    </Modal>
  );
}
