// Campaigns: create and edit, draft previews, recipients (Claims), the review queue (edits teach the
// Voice Profile), launch, pause and resume.

import { isBefore } from "@/lib/dates";
import { formatCreditsLabel, plural } from "@/lib/format";
import { AUTONOMY_LABELS } from "@/lib/labels";
import type { AppState, Campaign, CampaignInput, DraftPreview, HiringContact, Language, LearnedEdit, Message, PersonRef, Recipient, VoiceProfile } from "@/lib/types";
import { WEEKDAYS } from "@/lib/types";
import { draftMessage } from "../drafts";
import type { HandlerMap } from "../handler-types";
import { audit, fail, getPerson, recruiterName, requireNiche, requireRecruiter, requireWorkspace, touchClaim, usableEmail } from "../helpers";
import { addPeopleToCampaign, applyAutonomy, isActiveRecipient } from "../outreach";
import { newId } from "../runtime";
import { nextSendingPass } from "../sim";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function requireCampaign(state: AppState, id: string): Campaign {
  const c = state.campaigns.find((x) => x.id === id);
  if (!c) fail("Campaign not found.");
  return c;
}

function requireOwnCampaign(state: AppState, campaign: Campaign): void {
  const me = requireRecruiter(state);
  if (campaign.ownerId !== me.id) fail(`Only ${recruiterName(state, campaign.ownerId)} can change this Campaign: it sends from their Sending Mailboxes.`);
}

function validateMailboxes(state: AppState, ownerId: string, ids: string[]): void {
  for (const id of ids) {
    const m = state.mailboxes.find((x) => x.id === id);
    if (!m) fail("A selected Sending Mailbox no longer exists.");
    if (m.recruiterId !== ownerId) fail(`${m.address} belongs to ${recruiterName(state, m.recruiterId)}: a Campaign only sends from its owner's Sending Mailboxes.`);
    if (m.status === "refused") fail(`${m.address} is refused: it is on a Main Domain.`);
    if (m.status === "paused") fail(`${m.address} is paused${m.statusReason ? `: ${m.statusReason}` : "."}`);
  }
}

function validateInput(state: AppState, input: Partial<CampaignInput>, ownerId: string): void {
  if (input.name !== undefined && input.name.trim().length < 3) fail("Give the Campaign a name of at least 3 characters.");
  if (input.brief !== undefined) {
    if (input.brief.angle.trim().length < 10) fail("Describe the angle of the Brief in a sentence.");
    if (input.brief.callToAction.trim().length < 3) fail("Add a call to action to the Brief.");
    if (input.brief.detectedRoleId && !state.detectedRoles.some((r) => r.id === input.brief?.detectedRoleId)) fail("The Detected Role of the Brief no longer exists.");
  }
  if (input.sequence !== undefined) {
    if (input.sequence.length < 1 || input.sequence.length > 3) fail("A Sequence has 1 to 3 emails.");
    input.sequence.forEach((s, i) => {
      if (s.step !== i + 1) fail("Sequence steps must be numbered 1, 2, 3.");
      if (i > 0 && (!Number.isInteger(s.delayDays) || s.delayDays < 1 || s.delayDays > 30)) fail("Follow-ups wait 1 to 30 days.");
    });
  }
  if (input.sendingWindow !== undefined) {
    const w = input.sendingWindow;
    if (w.days.length === 0 || w.days.some((d) => !WEEKDAYS.includes(d))) fail("Pick the sending days.");
    if (w.days.some((d) => d === "sat" || d === "sun")) fail("Campaign emails are sent on weekdays only.");
    if (!TIME_RE.test(w.start) || !TIME_RE.test(w.end) || w.start >= w.end) fail("The sending window must start before it ends.");
  }
  if (input.reviewFirstN !== undefined && (!Number.isInteger(input.reviewFirstN) || input.reviewFirstN < 1 || input.reviewFirstN > 100)) fail("Review between 1 and 100 first emails.");
  if (input.autoAddRule && !(input.autoAddRule.minSignalStrength >= 0 && input.autoAddRule.minSignalStrength <= 100)) fail("The auto-add Signal Strength must be between 0 and 100.");
  if (input.mailboxIds !== undefined) validateMailboxes(state, ownerId, input.mailboxIds);
}

/* ------------------------------------------------------------------ */
/* Learning from edits (Voice Profile)                                 */
/* ------------------------------------------------------------------ */

function words(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function paragraphs(s: string): string[] {
  return s.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
}

type ParagraphChange = { kind: "insert" | "delete" | "replace"; index: number; before: string; after: string };

/**
 * The first change between two drafts, paragraph by paragraph (longest common subsequence), so an
 * inserted paragraph reads as an insertion, never as a rewrite of the paragraph that follows it.
 */
function firstParagraphChange(a: string[], b: string[]): ParagraphChange | null {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  let i = 0;
  let j = 0;
  while (i < n && j < m && a[i] === b[j]) {
    i++;
    j++;
  }
  if (i === n && j === m) return null;
  // Walk the first differing region up to the next common paragraph.
  const deleted: string[] = [];
  const inserted: string[] = [];
  let x = i;
  let y = j;
  while (x < n || y < m) {
    if (x < n && y < m && a[x] === b[y]) break;
    if (y < m && (x === n || lcs[x][y + 1] >= lcs[x + 1][y])) inserted.push(b[y++]);
    else deleted.push(a[x++]);
  }
  if (deleted.length === 0) return { kind: "insert", index: i, before: "", after: inserted[0] };
  if (inserted.length === 0) return { kind: "delete", index: i, before: deleted[0], after: "" };
  return { kind: "replace", index: i, before: deleted[0], after: inserted[0] };
}

function quote(s: string): string {
  return s.length > 70 ? `${s.slice(0, 67)}...` : s;
}

/** The first paragraph change, before and after, plus a one-line lesson for the Voice Profile. */
function lessonFrom(before: string, after: string, language: Language): { before: string; after: string; lesson: string } {
  const change = firstParagraphChange(paragraphs(before), paragraphs(after));
  const lang = language === "fr" ? "French" : "English";
  const cut = words(before) - words(after);
  const share = Math.round((Math.abs(cut) / Math.max(1, words(before))) * 100);
  if (!change) return { before: "", after: "", lesson: `Prefers their own wording in ${lang} emails` };
  let lesson: string;
  if (change.kind === "insert") lesson = `Adds a line of context in ${lang} emails`;
  else if (change.kind === "delete") lesson = share >= 15 ? `Keeps ${lang} emails shorter: cut ${share}% of the draft` : `Removes a line from ${lang} emails`;
  else if (/\?\s*$/.test(change.before) && /\?\s*$/.test(change.after)) lesson = `Rewrites the call to action in ${lang} emails: "${quote(change.after)}"`;
  else if (cut > 0 && share >= 15) lesson = `Keeps ${lang} emails shorter: cut ${share}% of the draft`;
  else if (cut < 0 && share >= 15) lesson = `Adds more context than the draft in ${lang} emails (${share}% longer)`;
  else if (change.index <= 1) lesson = `Prefers another opening line in ${lang} emails`;
  else lesson = `Prefers their own wording in ${lang} emails`;
  return { before: change.before, after: change.after, lesson };
}

function voiceProfileFor(state: AppState, recruiterId: string, language: Language): VoiceProfile {
  let vp = state.voiceProfiles.find((v) => v.recruiterId === recruiterId && v.language === language);
  if (!vp) {
    vp = { id: newId("vp"), recruiterId, language, source: "pasted_examples", styleGuide: [], examples: [], learnedFromEdits: [], emailsAnalysed: 0, updatedOn: state.clock.today };
    state.voiceProfiles.push(vp);
  }
  return vp;
}

/* ------------------------------------------------------------------ */
/* Draft previews                                                      */
/* ------------------------------------------------------------------ */

function topEnrichedPeople(state: AppState, nicheId: string, audience: Campaign["audience"], meId: string): PersonRef[] {
  if (audience === "candidates") {
    return state.candidates
      .filter((c) => c.nicheIds.includes(nicheId) && c.lifecycle === "enriched" && usableEmail(c, "candidate") && (!c.claim || c.claim.recruiterId === meId))
      .sort((a, b) => b.signalStrength - a.signalStrength)
      .slice(0, 3)
      .map((c) => ({ kind: "candidate" as const, id: c.id }));
  }
  const strength = (h: HiringContact) => state.prospects.find((p) => p.id === h.prospectId)?.signalStrength ?? 0;
  return state.hiringContacts
    .filter((h) => {
      const prospect = state.prospects.find((p) => p.id === h.prospectId);
      return prospect?.nicheIds.includes(nicheId) && h.lifecycle === "enriched" && usableEmail(h, "hiring_contact") && (!h.claim || h.claim.recruiterId === meId);
    })
    .sort((a, b) => strength(b) - strength(a))
    .slice(0, 3)
    .map((h) => ({ kind: "hiring_contact" as const, id: h.id }));
}

/**
 * After an approval, when the recipient's next email leaves. Today's sending pass already ran when the
 * day started, so a first email approved now, or a follow-up approved after its due date, leaves on the
 * next sending day (never before the recipient's own next send date).
 */
function scheduleApproved(state: AppState, campaign: Campaign, r: Recipient): void {
  const next = r.messages.find((m) => m.origin === "campaign" && m.status !== "sent");
  if (!next || next.status !== "approved") return;
  if (r.state === "awaiting_review") {
    r.state = "scheduled";
    r.nextSendOn = nextSendingPass(state, campaign.sendingWindow.days, r.nextSendOn);
  } else if ((r.state === "scheduled" || r.state === "sent") && r.nextSendOn && isBefore(r.nextSendOn, nextSendingPass(state, campaign.sendingWindow.days))) {
    r.nextSendOn = nextSendingPass(state, campaign.sendingWindow.days, r.nextSendOn);
  }
}

type CampaignAction =
  | "createCampaign"
  | "updateCampaign"
  | "previewDrafts"
  | "addRecipients"
  | "removeRecipient"
  | "approveMessage"
  | "approveAll"
  | "redraftMessage"
  | "launchCampaign"
  | "pauseCampaign"
  | "resumeCampaign";

export const campaignHandlers: HandlerMap<CampaignAction> = {
  createCampaign(state, input) {
    const ws = requireWorkspace(state);
    const me = requireRecruiter(state);
    if (ws.plan === "free_trial") fail("Buy Credits to run Campaigns.");
    requireNiche(state, input.nicheId);
    if (input.audience !== "candidates" && input.audience !== "hiring_contacts") fail("Pick an audience.");
    validateInput(state, input, me.id);
    const campaign: Campaign = {
      id: newId("cp"),
      nicheId: input.nicheId,
      ownerId: me.id,
      name: input.name.trim(),
      audience: input.audience,
      brief: { ...input.brief, angle: input.brief.angle.trim(), callToAction: input.brief.callToAction.trim() },
      sequence: input.sequence,
      sendingWindow: input.sendingWindow,
      autonomy: input.autonomy,
      reviewFirstN: input.reviewFirstN,
      mailboxIds: input.mailboxIds,
      autoAddRule: input.autoAddRule,
      status: "draft",
      createdOn: state.clock.today,
      launchedOn: null,
      sendingBlocked: null,
    };
    state.campaigns.push(campaign);
    audit(state, me.name, "Created a Campaign", campaign.name, { kind: "campaign", id: campaign.id });
    return { campaignId: campaign.id };
  },

  updateCampaign(state, p) {
    const campaign = requireCampaign(state, p.campaignId);
    requireOwnCampaign(state, campaign);
    const me = requireRecruiter(state);
    const patch = p.patch ?? {};
    const hasRecipients = state.recipients.some((r) => r.campaignId === campaign.id);
    if (hasRecipients && patch.audience !== undefined && patch.audience !== campaign.audience) fail("The audience cannot change once the Campaign has recipients.");
    if (hasRecipients && patch.nicheId !== undefined && patch.nicheId !== campaign.nicheId) fail("The Niche cannot change once the Campaign has recipients.");
    validateInput(state, patch, campaign.ownerId);
    const changed: string[] = [];
    for (const key of Object.keys(patch) as (keyof CampaignInput)[]) {
      if (JSON.stringify(patch[key]) !== JSON.stringify(campaign[key])) changed.push(key);
    }
    Object.assign(campaign, patch);
    if (patch.name !== undefined) campaign.name = patch.name.trim();
    const autoApproved = changed.some((k) => k === "autonomy" || k === "reviewFirstN") ? applyAutonomy(state, campaign) : 0;
    if (changed.length > 0) {
      const what = changed.includes("autonomy") ? `autonomy now "${AUTONOMY_LABELS[campaign.autonomy]}"` : changed.join(", ");
      audit(state, me.name, "Changed a Campaign", `${campaign.name}: ${what}${autoApproved > 0 ? `, ${plural(autoApproved, "draft")} scheduled` : ""}`, { kind: "campaign", id: campaign.id });
    }
    return {};
  },

  previewDrafts(state, p) {
    requireWorkspace(state);
    const me = requireRecruiter(state);
    requireNiche(state, p.nicheId);
    const mailbox = state.mailboxes.find((m) => m.recruiterId === me.id && (m.status === "active" || m.status === "warming"));
    const senderEmail = mailbox?.address ?? me.email;
    const people = (p.people && p.people.length > 0 ? p.people : topEnrichedPeople(state, p.nicheId, p.audience, me.id)).slice(0, 3);
    const campaignLike = { nicheId: p.nicheId, ownerId: me.id, audience: p.audience, brief: p.brief, sequence: p.sequence };
    const drafts: DraftPreview[] = [];
    for (const ref of people) {
      const person = getPerson(state, ref);
      if (!person) continue;
      const messages: Message[] = p.sequence.map((s) => draftMessage(state, campaignLike, person, ref.kind, s.step, senderEmail));
      drafts.push({ person: ref, personLabel: person.name, toAddress: usableEmail(person, ref.kind)?.value ?? null, messages });
    }
    return { drafts };
  },

  addRecipients(state, p, ctx) {
    const ws = requireWorkspace(state);
    const campaign = requireCampaign(state, p.campaignId);
    requireOwnCampaign(state, campaign);
    const me = requireRecruiter(state);
    if (ws.plan === "free_trial") fail("Buy Credits to reveal people and run Campaigns.");
    if (campaign.mailboxIds.length === 0) fail("Choose a Sending Mailbox for this Campaign first.");
    const result = addPeopleToCampaign(state, campaign, p.people ?? [], me.name);
    if (result.added.length > 0) ctx.note(`${plural(result.added.length, "recipient")} added to ${campaign.name}, each with a Claim for ${me.name}.`);
    if (result.skipped.length > 0) ctx.note(`${plural(result.skipped.length, "person", "people")} skipped: ${result.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}.`);
    return result;
  },

  removeRecipient(state, p) {
    const r = state.recipients.find((x) => x.id === p.recipientId);
    if (!r) fail("Recipient not found.");
    const campaign = requireCampaign(state, r.campaignId);
    requireOwnCampaign(state, campaign);
    const me = requireRecruiter(state);
    if (!isActiveRecipient(r)) fail(`${r.personLabel} is no longer in an active Sequence.`);
    r.state = "stopped";
    r.stopReason = `Removed from the Campaign by ${me.name}`;
    r.messages = r.messages.filter((m) => m.status === "sent");
    r.nextSendOn = null;
    const person = getPerson(state, { kind: r.personKind, id: r.personId });
    if (person?.claim && person.claim.campaignId === campaign.id) person.claim = null;
    if (r.prospectId && !state.recipients.some((o) => o.id !== r.id && o.prospectId === r.prospectId && isActiveRecipient(o))) {
      const prospect = state.prospects.find((x) => x.id === r.prospectId);
      if (prospect?.status === "in_campaign") prospect.status = "surfaced";
    }
    audit(state, me.name, "Removed from a Campaign (Claim released)", `${r.personLabel} from ${campaign.name}`, { kind: r.personKind, id: r.personId });
    return {};
  },

  approveMessage(state, p, ctx) {
    const r = state.recipients.find((x) => x.id === p.recipientId);
    if (!r) fail("Recipient not found.");
    const campaign = requireCampaign(state, r.campaignId);
    requireOwnCampaign(state, campaign);
    const me = requireRecruiter(state);
    const msg = r.messages.find((m) => m.id === p.messageId);
    if (!msg) fail("Draft not found.");
    if (msg.status === "sent") fail("This email was already sent.");
    let learned: string | null = null;
    const subject = p.subject?.trim();
    const body = p.body?.replace(/\s+$/, "");
    if (subject !== undefined && subject.length === 0) fail("The subject is empty.");
    if (body !== undefined && body.trim().length === 0) fail("The email is empty.");
    const bodyChanged = body !== undefined && body !== msg.body;
    const subjectChanged = subject !== undefined && subject !== msg.subject;
    if (bodyChanged || subjectChanged) {
      if (bodyChanged) {
        const previous = msg.body;
        msg.originalBody ??= previous;
        msg.body = body;
        const edit = lessonFrom(previous, body, msg.language);
        const vp = voiceProfileFor(state, campaign.ownerId, msg.language);
        const entry: LearnedEdit = { id: newId("le"), on: state.clock.today, campaignId: campaign.id, before: edit.before, after: edit.after, lesson: edit.lesson };
        vp.learnedFromEdits.unshift(entry);
        vp.updatedOn = state.clock.today;
        learned = edit.lesson;
        ctx.note(`Voice Profile (${msg.language.toUpperCase()}) learned: ${edit.lesson}.`);
      }
      if (subjectChanged) msg.subject = subject;
      msg.editedByRecruiter = true;
    }
    msg.status = "approved";
    scheduleApproved(state, campaign, r);
    const person = getPerson(state, { kind: r.personKind, id: r.personId });
    if (person) touchClaim(state, person.claim);
    audit(state, me.name, bodyChanged || subjectChanged ? "Edited and approved a draft" : "Approved a draft", `Step ${msg.step} to ${r.personLabel}`, { kind: "campaign", id: campaign.id });
    const autoApproved = applyAutonomy(state, campaign);
    if (autoApproved > 0) {
      audit(state, "Outreach Agent", `Scheduled the remaining first emails (${AUTONOMY_LABELS[campaign.autonomy]})`, `${plural(autoApproved, "draft")} in ${campaign.name}`, { kind: "campaign", id: campaign.id });
    }
    return { learned };
  },

  approveAll(state, p) {
    const campaign = requireCampaign(state, p.campaignId);
    requireOwnCampaign(state, campaign);
    const me = requireRecruiter(state);
    let approved = 0;
    for (const r of state.recipients) {
      if (r.campaignId !== campaign.id || !isActiveRecipient(r)) continue;
      let any = false;
      for (const m of r.messages) {
        if (m.status !== "draft") continue;
        m.status = "approved";
        approved++;
        any = true;
      }
      if (any) scheduleApproved(state, campaign, r);
    }
    if (approved === 0) fail("No draft is waiting for review.");
    audit(state, me.name, "Approved all drafts", `${plural(approved, "draft")} in ${campaign.name} (${formatCreditsLabel(approved)} when sent)`, { kind: "campaign", id: campaign.id });
    return { approved };
  },

  redraftMessage(state, p) {
    const r = state.recipients.find((x) => x.id === p.recipientId);
    if (!r) fail("Recipient not found.");
    const campaign = requireCampaign(state, r.campaignId);
    requireOwnCampaign(state, campaign);
    const me = requireRecruiter(state);
    const index = r.messages.findIndex((m) => m.id === p.messageId);
    const msg = r.messages[index];
    if (!msg) fail("Draft not found.");
    if (msg.status === "sent") fail("This email was already sent.");
    const person = getPerson(state, { kind: r.personKind, id: r.personId });
    if (!person) fail("This person's data was deleted.");
    const mailbox = state.mailboxes.find((m) => m.id === r.mailboxId);
    let next: Message | null = null;
    for (let variant = 1; variant <= 4 && !next; variant++) {
      const candidate = draftMessage(state, campaign, person, r.personKind, msg.step, mailbox?.address ?? msg.footer.senderEmail, variant);
      if (candidate.body !== msg.body) next = candidate;
    }
    next ??= draftMessage(state, campaign, person, r.personKind, msg.step, mailbox?.address ?? msg.footer.senderEmail, 1);
    next.id = msg.id;
    next.status = "draft";
    r.messages[index] = next;
    if (r.state === "scheduled" && msg.step === 1) r.state = "awaiting_review";
    audit(state, me.name, "Asked the Outreach Agent for a new draft", `Step ${msg.step} to ${r.personLabel} (another Signal as the hook)`, { kind: "campaign", id: campaign.id });
    return {};
  },

  launchCampaign(state, p) {
    const ws = requireWorkspace(state);
    const campaign = requireCampaign(state, p.campaignId);
    requireOwnCampaign(state, campaign);
    const me = requireRecruiter(state);
    if (ws.plan === "free_trial") fail("Buy Credits to launch Campaigns.");
    if (campaign.status !== "draft") fail("This Campaign was already launched.");
    if (campaign.mailboxIds.length === 0) fail("Choose at least one Sending Mailbox.");
    validateMailboxes(state, campaign.ownerId, campaign.mailboxIds);
    campaign.status = "active";
    campaign.launchedOn = state.clock.today;
    const recipients = state.recipients.filter((r) => r.campaignId === campaign.id);
    // Scheduled first emails leave on the next sending pass (today's already ran).
    for (const r of recipients) scheduleApproved(state, campaign, r);
    const scheduled = recipients.filter((r) => r.state === "scheduled").length;
    const awaitingReview = recipients.filter((r) => r.state === "awaiting_review").length;
    audit(state, me.name, "Launched a Campaign", `${campaign.name}: ${scheduled} scheduled, ${awaitingReview} awaiting review`, { kind: "campaign", id: campaign.id });
    return { scheduled, awaitingReview };
  },

  pauseCampaign(state, p) {
    const campaign = requireCampaign(state, p.campaignId);
    requireOwnCampaign(state, campaign);
    const me = requireRecruiter(state);
    if (campaign.status !== "active") fail("Only an active Campaign can be paused.");
    campaign.status = "paused";
    audit(state, me.name, "Paused a Campaign", campaign.name, { kind: "campaign", id: campaign.id });
    return {};
  },

  resumeCampaign(state, p) {
    const campaign = requireCampaign(state, p.campaignId);
    requireOwnCampaign(state, campaign);
    const me = requireRecruiter(state);
    if (campaign.status !== "paused") fail("Only a paused Campaign can be resumed.");
    campaign.status = "active";
    // Emails that fell due while it was paused leave on the next sending pass (today's already ran).
    for (const r of state.recipients) if (r.campaignId === campaign.id) scheduleApproved(state, campaign, r);
    audit(state, me.name, "Resumed a Campaign", campaign.name, { kind: "campaign", id: campaign.id });
    return {};
  },
};
