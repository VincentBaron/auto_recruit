// State primitives shared by store.ts (actions) and sim.ts (simulation): errors, audit events,
// Credits, Claims, hashing for the Suppression List, deletion that keeps only the hash.

import { createHash } from "node:crypto";
import { addDays } from "@/lib/dates";
import { RETENTION } from "@/lib/labels";
import type {
  AppState,
  AuditEvent,
  Candidate,
  Claim,
  ContactValue,
  CreditReason,
  DataRequest,
  HiringContact,
  Niche,
  Notice,
  PersonRef,
  Recruiter,
  SuppressionReason,
  Workspace,
} from "@/lib/types";
import { CREDIT_PACKS } from "@/lib/pricing";
import { newId, nextAuditSeq } from "./runtime";

export class ActionError extends Error {}

export function fail(message: string): never {
  throw new ActionError(message);
}

/* ------------------------------------------------------------------ */
/* Payload validation (malformed payloads answer 422, never 500)       */
/* ------------------------------------------------------------------ */

/** A `{ kind, id }` person reference from a payload, or a readable 422. */
export function requirePersonRef(value: unknown, what = "person"): PersonRef {
  const v = value as { kind?: unknown; id?: unknown } | null | undefined;
  if (!v || typeof v !== "object") fail(`Pick the ${what}: a Candidate or a Hiring Contact.`);
  if (v.kind !== "candidate" && v.kind !== "hiring_contact") fail(`Pick the ${what}: a Candidate or a Hiring Contact.`);
  if (typeof v.id !== "string" || v.id.length === 0) fail(`Pick the ${what}: the id is missing.`);
  return { kind: v.kind, id: v.id };
}

/** An array from a payload, or a readable 422 naming the field. */
export function requireArray<T = unknown>(value: unknown, name: string): T[] {
  if (!Array.isArray(value)) fail(`"${name}" must be a list.`);
  return value as T[];
}

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export function requireWorkspace(state: AppState): Workspace {
  if (!state.workspace) fail("No Workspace yet: sign up first.");
  return state.workspace;
}

export function currentRecruiter(state: AppState): Recruiter | null {
  return state.recruiters.find((r) => r.id === state.session.recruiterId) ?? null;
}

export function requireRecruiter(state: AppState, id?: string): Recruiter {
  const rid = id ?? state.session.recruiterId;
  const r = state.recruiters.find((x) => x.id === rid);
  if (!r) fail("No Recruiter is signed in.");
  return r;
}

export function recruiterName(state: AppState, id: string | null | undefined): string {
  return state.recruiters.find((r) => r.id === id)?.name ?? "Unknown Recruiter";
}

export function actorName(state: AppState): string {
  return currentRecruiter(state)?.name ?? "System";
}

export function requireNiche(state: AppState, id: string): Niche {
  const n = state.niches.find((x) => x.id === id);
  if (!n) fail("Niche not found.");
  return n;
}

export function getPerson(state: AppState, ref: PersonRef): HiringContact | Candidate | undefined {
  return ref.kind === "candidate"
    ? state.candidates.find((c) => c.id === ref.id)
    : state.hiringContacts.find((h) => h.id === ref.id);
}

export function requirePerson(state: AppState, ref: PersonRef): HiringContact | Candidate {
  const p = getPerson(state, ref);
  if (!p) fail(ref.kind === "candidate" ? "Candidate not found." : "Hiring Contact not found.");
  return p;
}

export function personLabel(state: AppState, ref: PersonRef): string {
  return getPerson(state, ref)?.name ?? (ref.kind === "candidate" ? "Deleted Candidate" : "Deleted Hiring Contact");
}

/** The usable email: work_email for Hiring Contacts, personal_email for Candidates, never invalid. */
export function usableEmail(person: HiringContact | Candidate, kind: "hiring_contact" | "candidate"): ContactValue | null {
  const wanted = kind === "candidate" ? "personal_email" : "work_email";
  return (
    person.contactValues.find((v) => v.kind === wanted && v.verification === "valid") ??
    person.contactValues.find((v) => v.kind === wanted && v.verification === "catch_all") ??
    null
  );
}

/* ------------------------------------------------------------------ */
/* Audit and notices                                                   */
/* ------------------------------------------------------------------ */

export function audit(
  state: AppState,
  actor: string,
  action: string,
  target: string,
  targetRef: AuditEvent["targetRef"] = null,
): void {
  state.auditLog.push({ id: newId("ev"), seq: nextAuditSeq(), on: state.clock.today, actor, action, target, targetRef });
}

/** Links used by background notices. */
export const NOTICE_LINKS = {
  buyCredits: { label: "Buy Credits", href: "/credits" },
  mailboxes: { label: "Open Sending Mailboxes", href: "/settings/mailboxes" },
} as const;

/** A background notice shown in the notice stack under the top bar (and in the Digest notes). */
export function notify(state: AppState, tone: Notice["tone"], text: string, link: Notice["link"] = null): void {
  state.notices.unshift({ id: newId("nt"), on: state.clock.today, tone, text, link: link ? { ...link } : null, dismissedOn: null });
  if (state.notices.length > 30) state.notices.length = 30;
}

/* ------------------------------------------------------------------ */
/* Credits                                                             */
/* ------------------------------------------------------------------ */

function pushLedger(state: AppState, delta: number, reason: CreditReason, ref: string, nicheId: string | null, quantity: number): void {
  const ws = requireWorkspace(state);
  const last = state.creditLedger[state.creditLedger.length - 1];
  if (last && last.on === state.clock.today && last.reason === reason && last.ref === ref && last.nicheId === nicheId && delta <= 0 && last.delta <= 0) {
    last.delta += delta;
    last.quantity += quantity;
    last.balanceAfter = ws.credits;
    return;
  }
  state.creditLedger.push({ id: newId("cl"), on: state.clock.today, delta, reason, quantity, ref, nicheId, balanceAfter: ws.credits });
}

export function addCredits(state: AppState, amount: number, reason: CreditReason, ref: string): void {
  const ws = requireWorkspace(state);
  ws.credits += amount;
  pushLedger(state, amount, reason, ref, null, 1);
}

function autoTopUp(state: AppState): boolean {
  const ws = requireWorkspace(state);
  if (!ws.autoTopUp.enabled || ws.plan !== "paid") return false;
  const pack = CREDIT_PACKS.find((p) => p.credits === ws.autoTopUp.packCredits) ?? CREDIT_PACKS[0];
  addCredits(state, pack.credits, "auto_top_up", `Auto top-up: ${pack.credits} Credits pack`);
  const total = Math.round(pack.priceEur * 1.2 * 100) / 100;
  state.invoices.push({ id: newId("inv"), on: state.clock.today, credits: pack.credits, netEur: pack.priceEur, vatRate: 0.2, vatEur: Math.round(pack.priceEur * 0.2 * 100) / 100, totalEur: total });
  audit(state, "System", "Auto top-up", `${pack.credits} Credits added`, { kind: "workspace", id: ws.id });
  notify(state, "info", `Auto top-up added ${pack.credits} Credits.`, { label: "Open Credits", href: "/credits" });
  return true;
}

/** True when the Workspace can pay `amount` now (counting one auto top-up). */
export function canSpend(state: AppState, amount: number): boolean {
  const ws = state.workspace;
  if (!ws) return false;
  if (ws.credits >= amount) return true;
  if (ws.autoTopUp.enabled && ws.plan === "paid") {
    const pack = CREDIT_PACKS.find((p) => p.credits === ws.autoTopUp.packCredits) ?? CREDIT_PACKS[0];
    return ws.credits + pack.credits >= amount;
  }
  return false;
}

/** Charges Credits or throws an ActionError with a clear message. Records a ledger entry (merged per day/reason/ref). */
export function spend(
  state: AppState,
  amount: number,
  reason: CreditReason,
  ref: string,
  opts: { nicheId?: string | null; quantity?: number } = {},
): void {
  const ws = requireWorkspace(state);
  if (amount < 0) fail("Invalid amount.");
  if (ws.credits < amount) autoTopUp(state);
  if (ws.credits < amount) {
    fail(`Not enough Credits: this costs ${amount} and the balance is ${ws.credits}. Buy Credits to continue.`);
  }
  ws.credits -= amount;
  pushLedger(state, -amount, reason, ref, opts.nicheId ?? null, opts.quantity ?? 1);
  if (ws.autoTopUp.enabled && ws.credits < ws.autoTopUp.thresholdCredits) autoTopUp(state);
}

/* ------------------------------------------------------------------ */
/* Claims                                                              */
/* ------------------------------------------------------------------ */

export function makeClaim(state: AppState, recruiterId: string, campaignId: string): Claim {
  const today = state.clock.today;
  return { recruiterId, campaignId, since: today, lastActivityOn: today, expiresOn: addDays(today, RETENTION.claimInactivityDays) };
}

export function touchClaim(state: AppState, claim: Claim | null): void {
  if (!claim) return;
  claim.lastActivityOn = state.clock.today;
  claim.expiresOn = addDays(state.clock.today, RETENTION.claimInactivityDays);
}

/* ------------------------------------------------------------------ */
/* Suppression List and deletion                                       */
/* ------------------------------------------------------------------ */

export function hashValue(value: string): string {
  return `sha256:${createHash("sha256").update(value.trim().toLowerCase()).digest("hex")}`;
}

export function isSuppressed(state: AppState, value: string): boolean {
  const h = hashValue(value);
  const domain = value.includes("@") ? hashValue(value.split("@")[1]) : null;
  return state.suppressionList.some((e) => e.hash === h || (domain !== null && e.hash === domain));
}

export function suppress(state: AppState, value: string, reason: SuppressionReason, kind: "email" | "domain" = "email"): string {
  const hash = hashValue(value);
  if (!state.suppressionList.some((e) => e.hash === hash)) {
    state.suppressionList.unshift({ id: newId("sup"), hash, kind, addedOn: state.clock.today, reason, scope: "all_workspaces", addedBy: "this_workspace" });
  }
  return hash;
}

function emailsOf(person: HiringContact | Candidate): string[] {
  return person.contactValues.filter((v) => v.kind !== "mobile").map((v) => v.value);
}

/** What every stored string says instead of a deleted Candidate's name or contact values. */
export const DELETED_CANDIDATE_LABEL = "Deleted Candidate";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces whole-word mentions of any of `needles` (case-insensitive) with `label`. */
function mentionRewriter(needles: string[], label: string): (s: string) => string {
  const parts = [...new Set(needles.map((n) => n.trim()).filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length).map(escapeRegExp);
  if (parts.length === 0) return (s) => s;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  return (s) => s.replace(re, label);
}

/** Rewrites every string inside `value` (objects and arrays, in place). */
function rewriteStrings<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === "string") return fn(value) as T;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = rewriteStrings(value[i], fn);
    return value;
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const k of Object.keys(o)) o[k] = rewriteStrings(o[k], fn);
  }
  return value;
}

/**
 * Makes every stored string that names a Candidate being deleted say "Deleted Candidate" instead of
 * their name or contact values: past audit events, notices, Digests, the chat, the Credit ledger,
 * Voice Profile edits, completed Data Requests, and their own emails and replies (ADR-0019). An open
 * Data Request keeps the requester's name and address until it is answered, then stops naming them.
 * Records about Hiring Contacts are never touched, even for the same human (ADR-0003).
 */
function forgetCandidateMentions(state: AppState, c: Candidate): void {
  const label = DELETED_CANDIDATE_LABEL;
  const needles = [c.name, c.profileUrl, ...c.contactValues.map((v) => v.value)];
  const everywhere = mentionRewriter(needles, label);
  // In their own emails and replies, the first name alone names them too ("Bonjour Léa,"), unless a
  // Recruiter shares it (the signature).
  const first = firstName(c.name);
  const sharedWithRecruiter = state.recruiters.some((r) => firstName(r.name).toLowerCase() === first.toLowerCase());
  const ownMentions = sharedWithRecruiter ? everywhere : mentionRewriter([...needles, first], label);
  // A greeting loses the name rather than reading "Bonjour Deleted Candidate,": "Bonjour," is enough.
  const greeting = new RegExp(
    `(?<![\\p{L}\\p{N}])(Bonjour|Bonsoir|Salut|Cher|Chère|Hello|Hi|Hey|Dear)\\s+(?:${[c.name, first].filter((n) => n.trim().length >= 2).map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );
  const own = (s: string): string => ownMentions(s.replace(greeting, "$1"));

  for (const e of state.auditLog) {
    const ref = e.targetRef;
    if (ref?.kind === "hiring_contact" || (ref?.kind === "candidate" && ref.id !== c.id)) continue;
    e.action = everywhere(e.action);
    e.target = everywhere(e.target);
  }
  const ownReplyIds = new Set<string>();
  for (const rep of state.replies) {
    if (rep.personKind !== "candidate" || rep.personId !== c.id) continue;
    ownReplyIds.add(rep.id);
    rep.personLabel = label;
    rep.subject = own(rep.subject);
    rep.body = own(rep.body);
    rep.suggestedNextStep = own(rep.suggestedNextStep);
    if (rep.draftResponse !== null) rep.draftResponse = own(rep.draftResponse);
    if (rep.responseBody !== null) rep.responseBody = own(rep.responseBody);
    for (const effect of rep.effects) effect.description = everywhere(effect.description);
  }
  for (const r of state.recipients) {
    if (r.personKind !== "candidate" || r.personId !== c.id) continue;
    if (r.stopReason) r.stopReason = everywhere(r.stopReason);
    for (const m of r.messages) {
      m.subject = own(m.subject);
      m.body = own(m.body);
      if (m.originalBody !== null) m.originalBody = own(m.originalBody);
    }
  }
  for (const d of state.digests) {
    for (const g of [...d.newReplies, ...d.waitingReplies]) {
      for (const item of g.items) if (ownReplyIds.has(item.replyId)) item.personLabel = label;
    }
    for (const item of d.bestNewFeedItems) {
      if (item.kind === "candidate" && item.id === c.id) {
        item.name = label;
        item.headline = "Data deleted: nothing about them is kept";
      }
    }
    rewriteStrings(d, everywhere);
  }
  rewriteStrings(state.notices, everywhere);
  rewriteStrings(state.chat, everywhere);
  rewriteStrings(state.jobs, everywhere);
  if (state.lastChange) rewriteStrings(state.lastChange.lines, everywhere);
  for (const entry of state.creditLedger) entry.ref = everywhere(entry.ref);
  for (const vp of state.voiceProfiles) rewriteStrings(vp.learnedFromEdits, everywhere);
  for (const dr of state.dataRequests) {
    const linked = dr.matches.some((m) => m.kind === "candidate" && m.id === c.id) || everywhere(dr.personQuery) !== dr.personQuery || everywhere(dr.requesterEmail) !== dr.requesterEmail;
    if (dr.status === "open") {
      // The answer still has to reach the requester: the request stops naming them once completed.
      if (linked) dr.deletedCandidate = true;
      continue;
    }
    if (everywhere(dr.requesterEmail) !== dr.requesterEmail) dr.requesterEmail = "";
    dr.personQuery = everywhere(dr.personQuery);
    if (dr.resolution) dr.resolution = everywhere(dr.resolution);
  }
}

/**
 * Once a Data Request about a deleted Candidate is answered, it stops naming them: the person query,
 * the requester's address, the resolution and the audit events about the request say "Deleted
 * Candidate" (ADR-0019).
 */
export function forgetDataRequester(state: AppState, dr: DataRequest): void {
  if (!dr.deletedCandidate) return;
  const rewrite = mentionRewriter([dr.personQuery, dr.requesterEmail], DELETED_CANDIDATE_LABEL);
  for (const e of state.auditLog) {
    if (e.targetRef?.kind === "data_request" && e.targetRef.id === dr.id) e.target = rewrite(e.target);
  }
  if (dr.resolution) dr.resolution = rewrite(dr.resolution);
  dr.personQuery = DELETED_CANDIDATE_LABEL;
  dr.requesterEmail = "";
}

/**
 * Deletes a Candidate. When `reason` is given, the email hashes stay on the Suppression List
 * (Opt-out, Not Interested, Data Request); retention deletions keep nothing.
 */
export function deleteCandidate(state: AppState, id: string, reason: SuppressionReason | null): string | null {
  const c = state.candidates.find((x) => x.id === id);
  if (!c) return null;
  let firstHash: string | null = null;
  if (reason) {
    const emails = emailsOf(c);
    for (const e of emails) {
      const h = suppress(state, e, reason);
      firstHash ??= h;
    }
    if (!firstHash) firstHash = suppress(state, `${c.name}|${c.profileUrl}`, reason);
  }
  forgetCandidateMentions(state, c);
  state.candidates = state.candidates.filter((x) => x.id !== id);
  for (const r of state.recipients) {
    if (r.personKind === "candidate" && r.personId === id) {
      r.personLabel = DELETED_CANDIDATE_LABEL;
      r.personDeleted = true;
      r.toAddress = null;
      // Drafts never sent go with the data; the sent emails stay for the Campaign's history.
      r.messages = r.messages.filter((m) => m.status === "sent");
      if (r.state === "awaiting_review" || r.state === "scheduled" || r.state === "sent") {
        r.state = "stopped";
        r.stopReason = "Candidate data deleted";
      }
    }
  }
  for (const rep of state.replies) if (rep.personKind === "candidate" && rep.personId === id) rep.personLabel = DELETED_CANDIDATE_LABEL;
  for (const role of state.detectedRoles) role.sourcedCandidateIds = role.sourcedCandidateIds.filter((x) => x !== id);
  for (const n of state.niches) if (n.testRun) n.testRun.items = n.testRun.items.filter((i) => i.candidateId !== id);
  state.consentTokens = state.consentTokens.filter((t) => t.candidateId !== id);
  for (const dr of state.dataRequests) dr.matches = dr.matches.filter((m) => !(m.kind === "candidate" && m.id === id));
  return firstHash;
}

/**
 * Deletes a Candidate who objected: an Opt-out or Not Interested reply, or "Delete my data" on the
 * Consent Page. The data goes immediately, because an objection ends the legitimate interest; their
 * replies need nothing more, and only the email hashes stay on the Suppression List so no Workspace
 * contacts them again (ADR-0019). Returns the first hash, or null when the Candidate is no longer stored.
 */
export function deleteObjectingCandidate(state: AppState, id: string, reason: SuppressionReason): string | null {
  if (!state.candidates.some((c) => c.id === id)) return null;
  for (const rep of state.replies) if (rep.personKind === "candidate" && rep.personId === id) rep.handled = true;
  return deleteCandidate(state, id, reason);
}

export function deleteHiringContact(state: AppState, id: string, reason: SuppressionReason | null): string | null {
  const h = state.hiringContacts.find((x) => x.id === id);
  if (!h) return null;
  let firstHash: string | null = null;
  if (reason) {
    for (const e of emailsOf(h)) {
      const hh = suppress(state, e, reason);
      firstHash ??= hh;
    }
    if (!firstHash) firstHash = suppress(state, `${h.name}|${h.profileUrl}`, reason);
  }
  state.hiringContacts = state.hiringContacts.filter((x) => x.id !== id);
  for (const p of state.prospects) p.hiringContactIds = p.hiringContactIds.filter((x) => x !== id);
  for (const r of state.recipients) {
    if (r.personKind === "hiring_contact" && r.personId === id) {
      r.personLabel = "Deleted Hiring Contact";
      r.personDeleted = true;
      r.toAddress = null;
      if (r.state === "awaiting_review" || r.state === "scheduled" || r.state === "sent") {
        r.state = "stopped";
        r.stopReason = "Hiring Contact data deleted";
      }
    }
  }
  for (const rep of state.replies) if (rep.personKind === "hiring_contact" && rep.personId === id) rep.personLabel = "Deleted Hiring Contact";
  for (const dr of state.dataRequests) dr.matches = dr.matches.filter((m) => !(m.kind === "hiring_contact" && m.id === id));
  return firstHash;
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function firstName(name: string): string {
  return name.split(" ")[0];
}

export function domainOf(email: string): string {
  return email.includes("@") ? email.split("@")[1].toLowerCase().trim() : email.toLowerCase().trim();
}

export function nicheOwnerName(state: AppState, niche: Niche): string {
  return recruiterName(state, niche.ownerId);
}
