// Pure, deterministic derivations over the client state for the campaigns screens.
// No Date, no randomness: safe to call during render.

import { addDays, isBefore } from "@/lib/dates";
import { formatDate, formatDateShort } from "@/lib/format";
import { PRICES } from "@/lib/pricing";
import { openDataRequestFor } from "@/lib/retention";
import type {
  AppState,
  Campaign,
  CampaignAudience,
  Candidate,
  Claim,
  ContactValue,
  HiringContact,
  ISODate,
  Language,
  Lifecycle,
  Message,
  PersonKind,
  PersonRef,
  Prospect,
  Recipient,
  RecipientState,
  Reply,
  SendingBlockReason,
  SendingMailbox,
} from "@/lib/types";
import { nextSendDay } from "./next-send";

export const RECIPIENT_STATES: RecipientState[] = ["awaiting_review", "scheduled", "sent", "replied", "stopped"];
export const ACTIVE_RECIPIENT_STATES: RecipientState[] = ["awaiting_review", "scheduled", "sent"];

export function personKey(ref: { kind: PersonKind; id: string }): string {
  return `${ref.kind}:${ref.id}`;
}

export function parsePersonKey(key: string): PersonRef | null {
  const [kind, id] = key.split(":");
  if (!id || (kind !== "candidate" && kind !== "hiring_contact")) return null;
  return { kind, id };
}

export function recipientsOf(state: AppState, campaignId: string): Recipient[] {
  return state.recipients.filter((r) => r.campaignId === campaignId);
}

export function repliesOf(state: AppState, campaignId: string): Reply[] {
  return state.replies.filter((r) => r.campaignId === campaignId);
}

export function stateCounts(recipients: Recipient[]): Record<RecipientState, number> {
  const counts: Record<RecipientState, number> = { awaiting_review: 0, scheduled: 0, sent: 0, replied: 0, stopped: 0 };
  for (const r of recipients) counts[r.state] += 1;
  return counts;
}

export function sentCount(recipients: Recipient[]): number {
  let n = 0;
  for (const r of recipients) for (const m of r.messages) if (m.origin === "campaign" && m.status === "sent") n++;
  return n;
}

/**
 * How many Sequence steps reached the recipient: an email re-sent after a bounce is the same step
 * sent again, so it counts once.
 */
export function sentSteps(r: Recipient): number {
  return new Set(r.messages.filter((m) => m.origin === "campaign" && m.status === "sent").map((m) => m.step)).size;
}

/** The next Sequence email that has not been sent yet. */
export function nextCampaignMessage(r: Recipient): Message | null {
  return r.messages.find((m) => m.origin === "campaign" && m.status !== "sent") ?? null;
}

export interface ReviewItem {
  recipient: Recipient;
  message: Message;
}

/** Drafts waiting for the Recruiter's approval, first emails before follow-ups. */
export function reviewQueue(state: AppState, campaignId: string): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const r of recipientsOf(state, campaignId)) {
    if (!ACTIVE_RECIPIENT_STATES.includes(r.state) || r.personDeleted) continue;
    const m = nextCampaignMessage(r);
    if (m && m.status === "draft") items.push({ recipient: r, message: m });
  }
  return items.sort((a, b) => {
    const ra = a.recipient.state === "awaiting_review" ? 0 : 1;
    const rb = b.recipient.state === "awaiting_review" ? 0 : 1;
    if (ra !== rb) return ra - rb;
    if (a.message.step !== b.message.step) return a.message.step - b.message.step;
    return a.recipient.addedOn < b.recipient.addedOn ? -1 : a.recipient.addedOn > b.recipient.addedOn ? 1 : 0;
  });
}

/** First emails already approved or sent (how far "review the first N" has gone). */
export function firstEmailsReviewed(recipients: Recipient[]): number {
  let n = 0;
  for (const r of recipients) {
    const first = r.messages.find((m) => m.origin === "campaign" && m.step === 1);
    if (first && first.status !== "draft") n++;
  }
  return n;
}

export function mailboxById(state: AppState, id: string): SendingMailbox | undefined {
  return state.mailboxes.find((m) => m.id === id);
}

export function recruiterName(state: AppState, id: string | null | undefined): string {
  return state.recruiters.find((r) => r.id === id)?.name ?? "Unknown Recruiter";
}

export function nicheName(state: AppState, id: string): string {
  return state.niches.find((n) => n.id === id)?.name ?? "Deleted Niche";
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

/** Email used for outreach: work email for Hiring Contacts, personal email for Candidates, never invalid. */
export function outreachEmail(person: HiringContact | Candidate, kind: PersonKind): ContactValue | null {
  const wanted = kind === "candidate" ? "personal_email" : "work_email";
  return (
    person.contactValues.find((v) => v.kind === wanted && v.verification === "valid") ??
    person.contactValues.find((v) => v.kind === wanted && v.verification === "catch_all") ??
    null
  );
}

export interface PersonInfo {
  kind: PersonKind;
  id: string;
  name: string;
  subtitle: string;
  href: string | null;
  language: Language;
  lifecycle: Lifecycle;
  email: ContactValue | null;
  signalStrength: number;
  fit: number;
  claim: Claim | null;
  prospect: Prospect | null;
  location: string;
  /** Candidates never Contacted: the day the 25-day retention rule deletes them, else null. */
  deleteOn: ISODate | null;
  /** An open Data Request concerns them: nothing is deleted until it is answered. */
  retentionHold: boolean;
}

export function personInfo(state: AppState, kind: PersonKind, id: string): PersonInfo | null {
  if (kind === "hiring_contact") {
    const h = state.hiringContacts.find((x) => x.id === id);
    if (!h) return null;
    const p = state.prospects.find((x) => x.id === h.prospectId) ?? null;
    return {
      kind,
      id,
      name: h.name,
      subtitle: p ? `${h.title} at ${p.name}` : h.title,
      href: p ? `/prospects/${p.id}` : null,
      language: h.language,
      lifecycle: h.lifecycle,
      email: outreachEmail(h, kind),
      signalStrength: p?.signalStrength ?? 0,
      fit: p?.fit.score ?? 0,
      claim: h.claim,
      prospect: p,
      location: h.location,
      deleteOn: null,
      retentionHold: false,
    };
  }
  const c = state.candidates.find((x) => x.id === id);
  if (!c) return null;
  return {
    kind,
    id,
    name: c.name,
    subtitle: `${c.currentTitle} at ${c.currentEmployer}`,
    href: `/candidates/${c.id}`,
    language: c.language,
    lifecycle: c.lifecycle,
    email: outreachEmail(c, kind),
    signalStrength: c.signalStrength,
    fit: c.fit.score,
    claim: c.claim,
    prospect: null,
    location: c.location,
    deleteOn: c.deleteOn,
    retentionHold: c.deleteOn !== null && openDataRequestFor(state, { kind: "candidate", id: c.id }) !== null,
  };
}

export function recipientPerson(state: AppState, r: Recipient): PersonInfo | null {
  if (r.personDeleted) return null;
  return personInfo(state, r.personKind, r.personId);
}

/* ------------------------------------------------------------------ */
/* Eligibility for a Campaign                                          */
/* ------------------------------------------------------------------ */

export interface EligiblePerson {
  info: PersonInfo;
  /** Why the person cannot be added, or null when they can. */
  blocked: string | null;
  /** Set when another Recruiter holds the Claim. */
  claimedBy: string | null;
}

/**
 * Enriched people of a Niche for one audience, with the reason any of them cannot be added:
 * Claim by another Recruiter, already in a Campaign, no verified email, Prospect closed or already
 * in conversation, or a colleague at the same Prospect already in an active Sequence.
 */
export function eligiblePeople(
  state: AppState,
  opts: { nicheId: string; audience: CampaignAudience; recruiterId: string | null; campaignId?: string },
): EligiblePerson[] {
  const activeByPerson = new Map<string, Recipient>();
  const activeProspects = new Map<string, Recipient>();
  for (const r of state.recipients) {
    if (!ACTIVE_RECIPIENT_STATES.includes(r.state)) continue;
    activeByPerson.set(personKey({ kind: r.personKind, id: r.personId }), r);
    if (r.prospectId) activeProspects.set(r.prospectId, r);
  }
  const campaignName = (id: string) => state.campaigns.find((c) => c.id === id)?.name ?? "another Campaign";
  const inThisCampaign = new Set(
    opts.campaignId ? state.recipients.filter((r) => r.campaignId === opts.campaignId).map((r) => personKey({ kind: r.personKind, id: r.personId })) : [],
  );

  const out: EligiblePerson[] = [];
  const consider = (info: PersonInfo | null) => {
    if (!info) return;
    const key = personKey(info);
    let blocked: string | null = null;
    let claimedBy: string | null = null;
    if (info.claim && info.claim.recruiterId !== opts.recruiterId) {
      claimedBy = recruiterName(state, info.claim.recruiterId);
      blocked = `Claimed by ${claimedBy}`;
    } else if (inThisCampaign.has(key)) {
      blocked = "Already in this Campaign";
    } else if (activeByPerson.has(key)) {
      blocked = `In "${campaignName(activeByPerson.get(key)!.campaignId)}"`;
    } else if (!info.email) {
      blocked = "No verified email";
    } else if (info.prospect && info.prospect.status === "closed") {
      blocked = `${info.prospect.name} is closed until ${formatDate(info.prospect.closedUntil)}`;
    } else if (info.prospect && info.prospect.status === "replied") {
      blocked = `Someone at ${info.prospect.name} replied`;
    } else if (info.prospect && activeProspects.has(info.prospect.id)) {
      const other = activeProspects.get(info.prospect.id)!;
      blocked = `${other.personLabel} at ${info.prospect.name} is in an active Sequence`;
    }
    out.push({ info, blocked, claimedBy });
  };

  if (opts.audience === "hiring_contacts") {
    const prospectIds = new Set(state.prospects.filter((p) => p.nicheIds.includes(opts.nicheId) && p.status !== "dismissed").map((p) => p.id));
    for (const h of state.hiringContacts) {
      if (!prospectIds.has(h.prospectId) || h.proposed || h.lifecycle !== "enriched") continue;
      consider(personInfo(state, "hiring_contact", h.id));
    }
  } else {
    for (const c of state.candidates) {
      if (!c.nicheIds.includes(opts.nicheId) || c.lifecycle !== "enriched") continue;
      consider(personInfo(state, "candidate", c.id));
    }
  }
  return out.sort((a, b) => {
    if ((a.blocked === null) !== (b.blocked === null)) return a.blocked === null ? -1 : 1;
    if (b.info.signalStrength !== a.info.signalStrength) return b.info.signalStrength - a.info.signalStrength;
    return a.info.name < b.info.name ? -1 : a.info.name > b.info.name ? 1 : 0;
  });
}

/** Daily capacity of a set of Sending Mailboxes: their caps, at most 60 per domain. */
export function dailyCapacity(mailboxes: SendingMailbox[], perDomain: number): number {
  const byDomain = new Map<string, number>();
  for (const m of mailboxes) {
    if (m.status !== "active" && m.status !== "warming") continue;
    byDomain.set(m.domain, (byDomain.get(m.domain) ?? 0) + m.dailyCap);
  }
  let total = 0;
  for (const v of byDomain.values()) total += Math.min(v, perDomain);
  return total;
}

export function isUsableMailbox(m: SendingMailbox): boolean {
  return m.status === "active" || m.status === "warming";
}

export function campaignOwnerIsMe(state: AppState, c: Campaign): boolean {
  return state.session.recruiterId === c.ownerId;
}

export function usableMailboxes(state: AppState, c: Campaign): SendingMailbox[] {
  return c.mailboxIds.map((id) => mailboxById(state, id)).filter((m): m is SendingMailbox => m !== undefined && isUsableMailbox(m));
}

/* ------------------------------------------------------------------ */
/* Why an active Campaign is not sending                               */
/* ------------------------------------------------------------------ */

export interface SendingProblem {
  reason: SendingBlockReason;
  /** The full explanation, as the dummy backend recorded it (or as derived from the mailboxes now). */
  text: string;
  /** The sending day it was recorded on, or null when derived now from the Campaign's mailboxes. */
  on: ISODate | null;
  /** The cause is gone since (Credits bought, a mailbox chosen or resumed): the waiting emails go out on the next sending day. */
  resolved: boolean;
  /** "Sending stopped today: Credits ran out". */
  summary: string;
  /** "Sending stopped today", "Emails waiting today". */
  lead: string;
  /** "Credits ran out", "No Sending Mailbox", "Sending Mailboxes paused". */
  short: string;
  /**
   * Nothing at all can be sent: Credits ran out, no Sending Mailbox, or every Sending Mailbox of the
   * Campaign is paused. The other reasons only hold some emails back.
   */
  severe: boolean;
  /** Every Sending Mailbox of the Campaign is paused: resuming one is the way out. */
  allPaused: boolean;
  /** Follow-ups whose thread started from a Sending Mailbox removed since: they stay on it, so they cannot leave. */
  orphanedFollowUps: number;
}

const SHORT_REASON: Record<SendingBlockReason, string> = {
  credits: "Credits ran out",
  no_mailbox: "No Sending Mailbox",
  mailbox_paused: "Sending Mailbox paused",
  caps: "Daily caps reached",
};

/**
 * Why an active Campaign does not send, so it never looks like it is sending: the reason the dummy
 * backend recorded on the last sending day (`sendingBlocked`), or, before any sending day has run,
 * a Campaign left without an active or ramping Sending Mailbox.
 */
export function sendingProblem(state: AppState, c: Campaign): SendingProblem | null {
  if (c.status !== "active") return null;
  const today = state.clock.today;
  const mailboxes = c.mailboxIds.map((id) => mailboxById(state, id)).filter((m): m is SendingMailbox => m !== undefined);
  const usable = mailboxes.filter(isUsableMailbox);
  let reason: SendingBlockReason;
  let text: string;
  let on: ISODate | null;
  if (c.sendingBlocked) {
    ({ reason, text, on } = c.sendingBlocked);
  } else if (usable.length === 0) {
    const paused = mailboxes.filter((m) => m.status === "paused");
    on = null;
    if (paused.length > 0) {
      reason = "mailbox_paused";
      text = `${paused.length === 1 ? "The Sending Mailbox" : "The Sending Mailboxes"} ${paused.map((m) => m.address).join(", ")} ${paused.length === 1 ? "is" : "are"} paused: nothing can be sent until ${paused.length === 1 ? "it is" : "one is"} resumed`;
    } else {
      reason = "no_mailbox";
      text = "No active or ramping Sending Mailbox: nothing can be sent";
    }
  } else {
    return null;
  }
  const waiting = state.recipients.filter((r) => r.campaignId === c.id && (r.state === "scheduled" || r.state === "sent") && !r.personDeleted);
  const pinnedPaused = waiting.some((r) => mailboxById(state, r.mailboxId)?.status === "paused");
  const orphanedFollowUps = waiting.filter((r) => (nextCampaignMessage(r)?.step ?? 1) > 1 && !mailboxById(state, r.mailboxId)).length;
  const resolved =
    on !== null &&
    (reason === "credits"
      ? (state.workspace?.credits ?? 0) >= PRICES.emailSent
      : reason === "no_mailbox"
        ? usable.length > 0 && orphanedFollowUps === 0
        : reason === "mailbox_paused"
          ? usable.length > 0 && !pinnedPaused
          : false);
  const allPaused = reason === "mailbox_paused" && usable.length === 0;
  const stopsEverything = reason === "credits" || reason === "no_mailbox" || allPaused;
  const when = on === null ? "" : on === today ? " today" : ` on ${formatDateShort(on)}`;
  const lead = `${stopsEverything ? "Sending stopped" : "Emails waiting"}${when}`;
  const short = allPaused && mailboxes.filter((m) => m.status === "paused").length > 1 ? "Sending Mailboxes paused" : SHORT_REASON[reason];
  return { reason, text, on, resolved, summary: `${lead}: ${short}`, lead, short, severe: stopsEverything, allPaused, orphanedFollowUps };
}

/* ------------------------------------------------------------------ */
/* Retention against the sending days                                  */
/* ------------------------------------------------------------------ */

export type RetentionRisk = { kind: "too_late"; deleteOn: ISODate; sendsOn: ISODate } | { kind: "approve_today"; deleteOn: ISODate } | null;

/**
 * For a Candidate never Contacted, whether waiting costs them: "too_late" when even an approval
 * today sends after the 25-day deletion, "approve_today" when an approval tomorrow would.
 * (On the deletion day itself, the sending pass runs before retention.)
 */
export function retentionRisk(state: AppState, c: Campaign, r: Recipient, person: PersonInfo | null): RetentionRisk {
  if (!person || person.kind !== "candidate" || !person.deleteOn || person.retentionHold) return null;
  const today = state.clock.today;
  // A first email approved on a day leaves on the next sending day after it (see nextSendDay).
  const ifToday = nextSendDay(c, r, today);
  if (isBefore(person.deleteOn, ifToday)) return { kind: "too_late", deleteOn: person.deleteOn, sendsOn: ifToday };
  const ifTomorrow = nextSendDay(c, r, addDays(today, 1));
  if (isBefore(person.deleteOn, ifTomorrow)) return { kind: "approve_today", deleteOn: person.deleteOn };
  return null;
}
