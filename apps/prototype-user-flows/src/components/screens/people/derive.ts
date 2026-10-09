// Pure, deterministic derivations from the client state for the people screens.
// Candidate and Hiring Contact records are never linked here (ADR-0003): every helper works on one kind.

import { nextSend } from "@/components/screens/campaigns/next-send";
import { diffDays } from "@/lib/dates";
import { formatDate, formatRelative } from "@/lib/format";
import { CONTACT_KIND_LABELS, CONSENT_LABELS, DATA_REQUEST_KIND_LABELS, PROVIDER_LABELS, REPLY_CATEGORY_LABELS } from "@/lib/labels";
import type {
  AuditEvent,
  Campaign,
  Candidate,
  ClientState,
  ContactValue,
  HiringContact,
  ISODate,
  PersonKind,
  Prospect,
  Recipient,
} from "@/lib/types";

export function currentRecruiterId(state: ClientState): string | null {
  return state.derived.currentRecruiter?.id ?? state.session.recruiterId;
}

export function recruiterName(state: ClientState, id: string | null | undefined): string {
  return state.recruiters.find((r) => r.id === id)?.name ?? "another Recruiter";
}

export function campaignName(state: ClientState, id: string | null | undefined): string {
  return state.campaigns.find((c) => c.id === id)?.name ?? "a Campaign";
}

export function nicheName(state: ClientState, id: string): string {
  return state.niches.find((n) => n.id === id)?.name ?? "Unknown Niche";
}

/** The usable email: work email for Hiring Contacts, personal email for Candidates, never an invalid one. */
export function usableEmail(person: HiringContact | Candidate, kind: PersonKind): ContactValue | null {
  const wanted = kind === "candidate" ? "personal_email" : "work_email";
  return (
    person.contactValues.find((v) => v.kind === wanted && v.verification === "valid") ??
    person.contactValues.find((v) => v.kind === wanted && v.verification === "catch_all") ??
    null
  );
}

export function mobileOf(person: HiringContact | Candidate): ContactValue | null {
  return person.contactValues.find((v) => v.kind === "mobile" && v.verification !== "invalid") ?? null;
}

/**
 * Why the current Recruiter cannot enrich this person at all, or null. Same rules as the dummy
 * backend's Enrichment: someone else's Claim, a Referral not accepted yet, Dismissed, Suppressed.
 */
export function enrichBlocker(state: ClientState, person: HiringContact | Candidate, kind: PersonKind): string | null {
  if (person.claim && person.claim.recruiterId !== currentRecruiterId(state)) {
    return `Claimed by ${recruiterName(state, person.claim.recruiterId)}: cannot be enriched or contacted by you`;
  }
  if (kind === "hiring_contact" && (person as HiringContact).proposed) return "Proposed by a Referral: accept them first";
  if (person.lifecycle === "suppressed") return "On the Suppression List: never contacted again";
  if (person.lifecycle === "dismissed") return "Dismissed: restore them first";
  return null;
}

/** Enrichment is offered when nothing blocks it and the person still misses an email or a mobile. */
export function canEnrich(state: ClientState, person: HiringContact | Candidate, kind: PersonKind): boolean {
  if (enrichBlocker(state, person, kind) !== null) return false;
  return !usableEmail(person, kind) || !mobileOf(person);
}

export function recipientsFor(state: ClientState, kind: PersonKind, id: string): Recipient[] {
  return state.recipients.filter((r) => r.personKind === kind && r.personId === id);
}

const ACTIVE_RECIPIENT_STATES = new Set(["awaiting_review", "scheduled", "sent"]);

export function isInActiveSequence(r: Recipient): boolean {
  return ACTIVE_RECIPIENT_STATES.has(r.state);
}

/**
 * When the next Campaign email to a scheduled or sent recipient leaves, or why it waits, on the same
 * rule as the Campaign's recipients table: "next email in 3 days", "next email awaits your review",
 * "first email waiting for a Sending Mailbox", "on hold while the Campaign is paused". Null when
 * nothing is left to send.
 */
export function nextEmailNote(state: ClientState, r: Recipient): string | null {
  if (r.state !== "scheduled" && r.state !== "sent") return null;
  const next = r.messages.find((m) => m.origin === "campaign" && m.status !== "sent");
  const campaign = state.campaigns.find((c) => c.id === r.campaignId);
  if (!next || !campaign) return null;
  const what = r.messages.some((m) => m.origin === "campaign" && m.status === "sent") ? "next email" : "first email";
  if (next.status === "draft") return `${what} awaits your review`;
  const send = nextSend(state, campaign, r, next.step);
  switch (send.kind) {
    case "on_hold":
      return send.campaignStatus === "paused" ? "on hold while the Campaign is paused" : "on hold until the Campaign is launched";
    case "waiting":
      return `${what} waiting for ${send.waitsFor}`;
    case "on":
      return `${what} ${formatRelative(send.date, state.clock.today)}`;
  }
}

export interface AddToCampaignCheck {
  allowed: boolean;
  reason: string | null;
}

/** Why a person can or cannot be added to a Campaign right now (Claims, Enrichment, Prospect rules). */
export function addToCampaignCheck(
  state: ClientState,
  person: HiringContact | Candidate,
  kind: PersonKind,
  prospect?: Prospect | null,
): AddToCampaignCheck {
  const me = currentRecruiterId(state);
  if (person.claim && person.claim.recruiterId !== me) {
    return { allowed: false, reason: `Claimed by ${recruiterName(state, person.claim.recruiterId)}: cannot be added until the Claim lapses.` };
  }
  if (person.claim && person.claim.recruiterId === me) {
    return { allowed: false, reason: `Already in ${campaignName(state, person.claim.campaignId)}.` };
  }
  if (person.lifecycle === "suppressed") return { allowed: false, reason: "On the Suppression List: never contacted again." };
  if (person.lifecycle === "dismissed") return { allowed: false, reason: "Dismissed: restore first." };
  if (!usableEmail(person, kind)) return { allowed: false, reason: "Enrich first: no verified email yet." };
  if (kind === "hiring_contact" && prospect) {
    if (prospect.status === "closed") return { allowed: false, reason: `${prospect.name} is closed until ${formatDate(prospect.closedUntil)}: no outreach until then.` };
    if (prospect.status === "replied") return { allowed: false, reason: `Someone at ${prospect.name} replied: outreach to this Prospect has stopped.` };
    const busy = state.recipients.find(
      (r) => r.personKind === "hiring_contact" && r.prospectId === prospect.id && r.personId !== person.id && isInActiveSequence(r),
    );
    if (busy) return { allowed: false, reason: `${busy.personLabel} is already in an active Sequence: one Hiring Contact per Prospect at a time.` };
  }
  return { allowed: true, reason: null };
}

export function campaignsForPerson(state: ClientState, kind: PersonKind, nicheIds: string[]): Campaign[] {
  const audience = kind === "candidate" ? "candidates" : "hiring_contacts";
  const me = currentRecruiterId(state);
  return state.campaigns
    .filter((c) => c.audience === audience && nicheIds.includes(c.nicheId))
    .sort((a, b) => Number(b.ownerId === me) - Number(a.ownerId === me) || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/** Whole months between two ISO dates (to defaults to today). */
export function monthsBetween(from: ISODate, to: ISODate): number {
  return Math.max(1, Math.round(diffDays(to, from) / 30.44));
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export type ActivityKind = "surfaced" | "enriched" | "campaign" | "email" | "reply" | "response" | "consent" | "role" | "closed" | "data_request";

export interface ActivityItem {
  key: string;
  on: ISODate;
  kind: ActivityKind;
  text: string;
  detail: string | null;
  href: string | null;
  /** Secondary order within one day (later steps of the same day first). */
  order: number;
}

function sortActivity(items: ActivityItem[]): ActivityItem[] {
  return items.sort((a, b) => (a.on === b.on ? b.order - a.order : a.on < b.on ? 1 : -1));
}

function contactValueActivity(prefix: string, values: ContactValue[], order: number): ActivityItem[] {
  return values.map((v) => ({
    key: `${prefix}-cv-${v.id}`,
    on: v.provenance.foundOn,
    kind: "enriched" as const,
    text: `${CONTACT_KIND_LABELS[v.kind]} found`,
    detail: `${PROVIDER_LABELS[v.provenance.provider]}, ${v.verification === "valid" ? "verified" : v.verification.replace("_", "-")}`,
    href: null,
    order,
  }));
}

function recipientActivity(state: ClientState, r: Recipient, label: string | null): ActivityItem[] {
  const items: ActivityItem[] = [];
  const name = campaignName(state, r.campaignId);
  const who = label ? `${label} added to ${name}` : `Added to ${name}`;
  const campaign = state.campaigns.find((c) => c.id === r.campaignId);
  items.push({
    key: `rc-${r.id}`,
    on: r.addedOn,
    kind: "campaign",
    text: who,
    detail: campaign ? `Claim taken by ${recruiterName(state, campaign.ownerId)}` : null,
    href: `/campaigns/${r.campaignId}`,
    order: 3,
  });
  for (const m of r.messages) {
    if (m.status !== "sent" || !m.sentOn) continue;
    items.push({
      key: `msg-${m.id}`,
      on: m.sentOn,
      kind: m.origin === "response" ? "response" : "email",
      text:
        m.origin === "response"
          ? `${label ? `Response sent to ${label}` : "Response sent"} by the Recruiter`
          : `${label ? `Email ${m.step} sent to ${label}` : `Email ${m.step} sent`}`,
      detail: m.subject,
      href: `/campaigns/${r.campaignId}`,
      order: 4,
    });
  }
  return items;
}

function replyActivity(state: ClientState, recipientIds: Set<string>, withName: boolean): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const rep of state.replies) {
    if (!recipientIds.has(rep.recipientId)) continue;
    items.push({
      key: `rep-${rep.id}`,
      on: rep.receivedOn,
      kind: "reply",
      text: `${withName ? `${rep.personLabel} replied` : "Replied"}: ${REPLY_CATEGORY_LABELS[rep.category]}`,
      detail: rep.suggestedNextStep,
      href: "/inbox",
      order: 5,
    });
    if (rep.responseSentOn) {
      items.push({
        key: `rep-resp-${rep.id}`,
        on: rep.responseSentOn,
        kind: "response",
        text: `Response sent${withName ? ` to ${rep.personLabel}` : ""} by the Recruiter`,
        detail: rep.personKind === "candidate" ? "Included the Consent Page link" : null,
        href: "/inbox",
        order: 6,
      });
    }
  }
  return items;
}

export function prospectActivity(state: ClientState, prospect: Prospect): ActivityItem[] {
  const items: ActivityItem[] = [];
  const niches = prospect.nicheIds.map((id) => nicheName(state, id));
  items.push({
    key: "surfaced",
    on: prospect.surfacedOn,
    kind: "surfaced",
    text: "Surfaced by the Prospection Agent",
    detail: niches.join(", ") || null,
    href: null,
    order: 0,
  });
  const contacts = state.hiringContacts.filter((h) => h.prospectId === prospect.id);
  for (const h of contacts) {
    items.push({
      key: `hc-${h.id}`,
      on: h.surfacedOn,
      kind: "surfaced",
      text: h.origin === "referral" ? `${h.name} proposed by a Referral reply` : `Hiring Contact found: ${h.name}`,
      detail: h.title,
      href: null,
      order: 1,
    });
    items.push(...contactValueActivity(`hc-${h.id}`, h.contactValues, 2).map((a) => ({ ...a, text: `${a.text} for ${h.name}` })));
  }
  for (const role of state.detectedRoles.filter((r) => r.prospectId === prospect.id)) {
    items.push({ key: `role-${role.id}`, on: role.postedOn, kind: "role", text: `Detected Role: ${role.title}`, detail: role.location, href: null, order: 0 });
    if (role.sourcing.lastSourcedOn) {
      const n = role.sourcedCandidateIds.length + role.sourcedPreviewIds.length;
      items.push({
        key: `role-src-${role.id}`,
        on: role.sourcing.lastSourcedOn,
        kind: "role",
        text: `Sourcing Agent ran for ${role.title}`,
        detail: `${n} Candidate${n === 1 ? "" : "s"} sourced`,
        href: null,
        order: 2,
      });
    }
  }
  const recipients = state.recipients.filter(
    (r) => r.personKind === "hiring_contact" && (r.prospectId === prospect.id || contacts.some((h) => h.id === r.personId)),
  );
  for (const r of recipients) items.push(...recipientActivity(state, r, r.personLabel));
  items.push(...replyActivity(state, new Set(recipients.map((r) => r.id)), true));
  return sortActivity(items);
}

export function candidateActivity(state: ClientState, c: Candidate): ActivityItem[] {
  const items: ActivityItem[] = [];
  const role = c.forDetectedRoleId ? state.detectedRoles.find((r) => r.id === c.forDetectedRoleId) : null;
  const roleProspect = role ? state.prospects.find((p) => p.id === role.prospectId) : null;
  items.push({
    key: "surfaced",
    on: c.surfacedOn,
    kind: "surfaced",
    text: role ? `Sourced for ${role.title}${roleProspect ? ` at ${roleProspect.name}` : ""}` : "Surfaced by the Sourcing Agent",
    detail: c.nicheIds.map((id) => nicheName(state, id)).join(", ") || null,
    href: roleProspect ? `/prospects/${roleProspect.id}` : null,
    order: 0,
  });
  items.push(...contactValueActivity("c", c.contactValues, 1));
  const recipients = recipientsFor(state, "candidate", c.id);
  for (const r of recipients) {
    const acts = recipientActivity(state, r, null);
    const firstSent = r.messages.filter((m) => m.status === "sent" && m.origin === "campaign").sort((a, b) => a.step - b.step)[0];
    for (const a of acts) {
      if (firstSent && a.key === `msg-${firstSent.id}`) a.detail = `${a.detail ?? ""} - with the Article 14 Notice`.replace(/^ - /, "");
    }
    items.push(...acts);
  }
  items.push(...replyActivity(state, new Set(recipients.map((r) => r.id)), false));
  if (c.consent && c.consentRecordedOn) {
    items.push({
      key: "consent",
      on: c.consentRecordedOn,
      kind: "consent",
      text: `Chose "${CONSENT_LABELS[c.consent]}" on the Consent Page`,
      detail: c.retainUntil ? `Kept until ${formatDate(c.retainUntil)}` : null,
      href: null,
      order: 7,
    });
  }
  for (const dr of dataRequestsFor(state, c)) {
    items.push({
      key: `dr-${dr.id}`,
      on: dr.receivedOn,
      kind: "data_request",
      text: `Data Request received (${DATA_REQUEST_KIND_LABELS[dr.kind].toLowerCase()})`,
      detail: dr.status === "completed" ? dr.resolution : `Due ${formatDate(dr.dueOn)}`,
      href: "/settings/privacy",
      order: 8,
    });
  }
  return sortActivity(items);
}

export function dataRequestsFor(state: ClientState, c: Candidate) {
  const name = c.name.toLowerCase();
  return state.dataRequests.filter(
    (dr) => dr.matches.some((m) => m.kind === "candidate" && m.id === c.id) || dr.personQuery.trim().toLowerCase() === name,
  );
}

/** Audit events about these records, newest first. Matches on target reference, then on names (never across person kinds). */
export function auditFor(state: ClientState, ids: string[], names: string[], otherKind: PersonKind | null): AuditEvent[] {
  const idSet = new Set(ids);
  const lowered = names.filter((n) => n.length > 2).map((n) => n.toLowerCase());
  return state.auditLog
    .filter((e) => {
      if (e.targetRef && idSet.has(e.targetRef.id)) return true;
      // Never pull in events about the other kind of person record (ADR-0003).
      if (e.targetRef && otherKind && e.targetRef.kind === otherKind) return false;
      const target = e.target.toLowerCase();
      return lowered.some((n) => target.includes(n));
    })
    .sort((a, b) => b.seq - a.seq);
}
