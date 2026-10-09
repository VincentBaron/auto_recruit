// Shared Campaign rules: who can be added (Claims, one Hiring Contact per Prospect, Suppression List,
// usable email), how first emails are reviewed (autonomy), and the auto-add rule after Enrichment.

import { formatDate } from "@/lib/format";
import { AUDIENCE_LABELS } from "@/lib/labels";
import type { AppState, Campaign, Candidate, HiringContact, PersonKind, PersonRef, Recipient } from "@/lib/types";
import { draftMessage } from "./drafts";
import { audit, getPerson, isSuppressed, makeClaim, recruiterName, usableEmail } from "./helpers";
import { newId } from "./runtime";
import { nextSendingPass, prospectHasReply } from "./sim";

export const ACTIVE_RECIPIENT_STATES: Recipient["state"][] = ["awaiting_review", "scheduled", "sent"];

export function isActiveRecipient(r: Recipient): boolean {
  return ACTIVE_RECIPIENT_STATES.includes(r.state);
}

/** First emails already approved or sent in a Campaign (counts toward "review the first N"). */
function reviewedFirstEmails(state: AppState, campaign: Campaign): number {
  return state.recipients
    .filter((r) => r.campaignId === campaign.id)
    .filter((r) => r.messages.some((m) => m.origin === "campaign" && m.step === 1 && (m.status === "approved" || m.status === "sent"))).length;
}

/** Whether a new first email waits for the Recruiter's review under the Campaign's autonomy. */
export function firstEmailNeedsReview(state: AppState, campaign: Campaign): boolean {
  if (campaign.autonomy === "review_all") return true;
  if (campaign.autonomy === "auto") return false;
  return reviewedFirstEmails(state, campaign) < campaign.reviewFirstN;
}

/**
 * "Review the first N": once N first emails are approved, the remaining first-email drafts are
 * scheduled automatically. Returns how many drafts were approved.
 */
export function applyAutonomy(state: AppState, campaign: Campaign): number {
  if (campaign.autonomy === "review_all") return 0;
  if (campaign.autonomy === "review_first_n" && reviewedFirstEmails(state, campaign) < campaign.reviewFirstN) return 0;
  let approved = 0;
  for (const r of state.recipients) {
    if (r.campaignId !== campaign.id || r.state !== "awaiting_review") continue;
    const draft = r.messages.find((m) => m.origin === "campaign" && m.status === "draft");
    if (!draft) continue;
    draft.status = "approved";
    r.state = "scheduled";
    r.nextSendOn = nextSendingPass(state, campaign.sendingWindow.days, r.nextSendOn);
    approved++;
  }
  return approved;
}

export interface SkippedPerson {
  kind: PersonKind;
  id: string;
  name: string;
  reason: string;
}

/** Why a person cannot join this Campaign, or null when they can. */
export function blockReason(state: AppState, campaign: Campaign, ref: PersonRef, pendingProspects: Set<string>): string | null {
  const person = getPerson(state, ref);
  if (!person) return "No longer stored";
  const wantedKind: PersonKind = campaign.audience === "candidates" ? "candidate" : "hiring_contact";
  if (ref.kind !== wantedKind) return `This Campaign is for ${AUDIENCE_LABELS[campaign.audience]}`;
  const nicheIds =
    ref.kind === "candidate" ? (person as Candidate).nicheIds : (state.prospects.find((p) => p.id === (person as HiringContact).prospectId)?.nicheIds ?? []);
  if (!nicheIds.includes(campaign.nicheId)) return "Not in this Campaign's Niche";
  if (person.claim && person.claim.recruiterId !== campaign.ownerId) return `Claimed by ${recruiterName(state, person.claim.recruiterId)}`;
  if (ref.kind === "hiring_contact" && (person as HiringContact).proposed) return "Proposed by a Referral: accept them first";
  if (person.lifecycle === "suppressed") return "On the Suppression List";
  if (person.lifecycle === "dismissed") return "Dismissed";
  const email = usableEmail(person, ref.kind);
  if (!email) return ref.kind === "candidate" ? "No verified personal email: enrich them first" : "No verified email: enrich them first";
  if (isSuppressed(state, email.value)) return "On the Suppression List";
  const mine = state.recipients.filter((r) => r.personKind === ref.kind && r.personId === ref.id);
  const active = mine.find(isActiveRecipient);
  if (active) {
    const other = state.campaigns.find((c) => c.id === active.campaignId);
    return active.campaignId === campaign.id ? "Already in this Campaign" : `Already in the Campaign "${other?.name ?? "another Campaign"}"`;
  }
  if (mine.some((r) => r.state === "replied")) return "Already replied to a Campaign";
  if (ref.kind === "hiring_contact") {
    const h = person as HiringContact;
    const prospect = state.prospects.find((p) => p.id === h.prospectId);
    if (prospect?.status === "closed") return `${prospect.name} is closed until ${formatDate(prospect.closedUntil)}`;
    if (prospect && (prospect.status === "replied" || prospectHasReply(state, prospect.id))) return `${prospect.name} replied: outreach to it stops`;
    const colleague = state.recipients.find((r) => r.personKind === "hiring_contact" && r.prospectId === h.prospectId && r.personId !== h.id && isActiveRecipient(r));
    if (colleague) return `${colleague.personLabel} at ${prospect?.name ?? "this Prospect"} is already in an active Sequence (one Hiring Contact per Prospect)`;
    if (pendingProspects.has(h.prospectId)) return `Someone else at ${prospect?.name ?? "this Prospect"} is in this batch (one Hiring Contact per Prospect)`;
  }
  return null;
}

/**
 * Adds people to a Campaign: each one gets a Claim for the Campaign owner, a first email drafted by
 * the Outreach Agent (waiting for review or scheduled, per the autonomy) and a round-robin mailbox.
 */
export function addPeopleToCampaign(state: AppState, campaign: Campaign, refs: PersonRef[], actor: string): { added: string[]; skipped: SkippedPerson[] } {
  const added: string[] = [];
  const skipped: SkippedPerson[] = [];
  const mailboxes = campaign.mailboxIds.map((id) => state.mailboxes.find((m) => m.id === id)).filter((m) => m !== undefined);
  const pendingProspects = new Set<string>();
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const person = getPerson(state, ref);
    const name = person?.name ?? (ref.kind === "candidate" ? "Deleted Candidate" : "Deleted Hiring Contact");
    const reason = blockReason(state, campaign, ref, pendingProspects);
    if (reason || !person) {
      skipped.push({ kind: ref.kind, id: ref.id, name, reason: reason ?? "No longer stored" });
      continue;
    }
    const email = usableEmail(person, ref.kind);
    const inCampaign = state.recipients.filter((r) => r.campaignId === campaign.id).length;
    const mailbox = mailboxes[inCampaign % Math.max(1, mailboxes.length)];
    const message = draftMessage(state, campaign, person, ref.kind, 1, mailbox?.address ?? "");
    const review = firstEmailNeedsReview(state, campaign);
    message.status = review ? "draft" : "approved";
    const prospectId = ref.kind === "hiring_contact" ? (person as HiringContact).prospectId : null;
    const recipient: Recipient = {
      id: newId("rcp"),
      campaignId: campaign.id,
      personKind: ref.kind,
      personId: person.id,
      personLabel: person.name,
      personDeleted: false,
      prospectId,
      mailboxId: mailbox?.id ?? "",
      state: review ? "awaiting_review" : "scheduled",
      currentStep: 0,
      messages: [message],
      stopReason: null,
      addedOn: state.clock.today,
      // Today's sending pass already ran when the day started: the first email leaves on the next one.
      nextSendOn: nextSendingPass(state, campaign.sendingWindow.days),
      pausedUntil: null,
      toAddress: email?.value ?? null,
    };
    state.recipients.push(recipient);
    person.claim = makeClaim(state, campaign.ownerId, campaign.id);
    if (prospectId) {
      pendingProspects.add(prospectId);
      const prospect = state.prospects.find((p) => p.id === prospectId);
      if (prospect && prospect.status === "surfaced") prospect.status = "in_campaign";
    }
    audit(state, actor, "Added to a Campaign (Claim taken)", `${person.name} to ${campaign.name}`, { kind: ref.kind, id: person.id });
    added.push(recipient.id);
  }
  return { added, skipped };
}

/** The auto-add rule: a newly Enriched person joins every matching active Campaign of their Niche. */
export function autoAddAfterEnrichment(state: AppState, ref: PersonRef): string[] {
  const person = getPerson(state, ref);
  if (!person || person.lifecycle !== "enriched") return [];
  const strength =
    ref.kind === "candidate"
      ? (person as Candidate).signalStrength
      : (state.prospects.find((p) => p.id === (person as HiringContact).prospectId)?.signalStrength ?? 0);
  const nicheIds =
    ref.kind === "candidate" ? (person as Candidate).nicheIds : (state.prospects.find((p) => p.id === (person as HiringContact).prospectId)?.nicheIds ?? []);
  const audience = ref.kind === "candidate" ? "candidates" : "hiring_contacts";
  const joined: string[] = [];
  for (const campaign of state.campaigns) {
    if (campaign.status !== "active" || campaign.audience !== audience || !nicheIds.includes(campaign.nicheId)) continue;
    if (!campaign.autoAddRule || strength < campaign.autoAddRule.minSignalStrength) continue;
    if (person.claim && person.claim.recruiterId !== campaign.ownerId) continue;
    const { added } = addPeopleToCampaign(state, campaign, [ref], "Outreach Agent (auto-add rule)");
    if (added.length > 0) joined.push(campaign.name);
    if (joined.length > 0) break;
  }
  return joined;
}
