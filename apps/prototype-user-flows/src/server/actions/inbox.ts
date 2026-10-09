// Inbox and Consent Page: the Recruiter sends the drafted response (agents never send a reply,
// ADR-0002), recategorizes replies, and Candidates record their choice on the Consent Page.

import { addDays, addMonths, addYears } from "@/lib/dates";
import { formatCreditsLabel, truncateHash } from "@/lib/format";
import { CONSENT_LABELS, REPLY_CATEGORY_LABELS, RETENTION } from "@/lib/labels";
import { PRICES } from "@/lib/pricing";
import type { Message } from "@/lib/types";
import { REPLY_CATEGORIES } from "@/lib/types";
import { consentLinkLine, consentUrl, nextStepAfterInterestedResponse } from "../drafts";
import type { HandlerMap } from "../handler-types";
import { audit, DELETED_CANDIDATE_LABEL, deleteObjectingCandidate, fail, getPerson, isSuppressed, recruiterName, requireRecruiter, requireWorkspace, spend, touchClaim, usableEmail } from "../helpers";
import { newId } from "../runtime";
import { applyCategoryEffects } from "../sim";

const CONSENT_ACTOR = "Candidate (Consent Page)";

export const inboxHandlers: HandlerMap<"sendReplyResponse" | "recategorizeReply" | "markReplyHandled" | "recordConsent"> = {
  sendReplyResponse(state, p) {
    requireWorkspace(state);
    const me = requireRecruiter(state);
    const reply = state.replies.find((r) => r.id === p.replyId);
    if (!reply) fail("Reply not found.");
    const campaign = state.campaigns.find((c) => c.id === reply.campaignId);
    const recipient = state.recipients.find((r) => r.id === reply.recipientId);
    if (!campaign || !recipient) fail("The Campaign of this reply no longer exists.");
    if (campaign.ownerId !== me.id) fail(`Only ${recruiterName(state, campaign.ownerId)} can send this response: it goes out from their Sending Mailbox.`);
    if (reply.responseSentOn) fail("A response was already sent to this reply.");
    if (recipient.personDeleted) fail("This person's data was deleted: there is nobody to answer.");
    // Never contact someone on the Suppression List, even after their Opt-out was recategorized.
    const person = getPerson(state, { kind: reply.personKind, id: reply.personId });
    const email = person ? usableEmail(person, reply.personKind)?.value ?? null : null;
    if (person?.lifecycle === "suppressed" || [recipient.toAddress, email].some((a) => a && isSuppressed(state, a))) {
      fail(`${reply.personLabel} is on the Suppression List: never contacted again.`);
    }
    let body = (p.body ?? "").replace(/\s+$/, "");
    if (body.trim().length === 0) fail("The response is empty.");

    let link: string | null = null;
    if (reply.personKind === "candidate" && reply.consentToken) {
      link = consentUrl(reply.consentToken);
      if (!body.includes(reply.consentToken)) body += `\n\n${consentLinkLine(reply.language, link)}`;
    }

    spend(state, PRICES.emailSent, "email_sent", `Emails sent - ${campaign.name}`, { nicheId: campaign.nicheId });
    const lastCampaign = [...recipient.messages].reverse().find((m) => m.origin === "campaign" && m.status === "sent") ?? recipient.messages[0];
    const fr = reply.language === "fr";
    const message: Message = {
      id: newId("msg"),
      step: lastCampaign?.step ?? 1,
      language: reply.language,
      subject: reply.subject,
      body,
      footer: {
        ...(lastCampaign?.footer ?? {
          senderName: me.name,
          senderTitle: me.title,
          senderEmail: state.mailboxes.find((m) => m.id === recipient.mailboxId)?.address ?? me.email,
          workspaceName: state.workspace?.name ?? "",
          workspaceAddress: state.workspace?.address ?? "",
          optOutUrl: "",
          optOutLabel: "",
          article14Notice: null,
          aiNote: "",
        }),
        article14Notice: null,
        aiNote: fr ? `Rédigé avec l'aide d'une IA et relu par ${me.name}.` : `Drafted with AI assistance and reviewed by ${me.name}.`,
      },
      status: "sent",
      sentOn: state.clock.today,
      editedByRecruiter: reply.draftResponse !== null && body !== reply.draftResponse,
      originalBody: reply.draftResponse !== null && body !== reply.draftResponse ? reply.draftResponse : null,
      origin: "response",
    };
    recipient.messages.push(message);
    reply.responseSentOn = state.clock.today;
    reply.responseBody = body;
    reply.handled = true;
    if (reply.category === "interested") reply.suggestedNextStep = nextStepAfterInterestedResponse(reply.personKind, reply.personLabel, reply.recipientId);
    if (person) touchClaim(state, person.claim);
    audit(state, me.name, "Sent a response", `${reply.personLabel} (${formatCreditsLabel(PRICES.emailSent)})`, { kind: "reply", id: reply.id });
    return { consentUrl: link };
  },

  recategorizeReply(state, p) {
    requireWorkspace(state);
    const me = requireRecruiter(state);
    const reply = state.replies.find((r) => r.id === p.replyId);
    if (!reply) fail("Reply not found.");
    if (!REPLY_CATEGORIES.includes(p.category)) fail("Pick a Reply Category.");
    if (reply.category === p.category) fail(`This reply is already ${REPLY_CATEGORY_LABELS[p.category]}.`);
    const campaign = state.campaigns.find((c) => c.id === reply.campaignId);
    if (campaign && campaign.ownerId !== me.id && me.role !== "owner") fail(`Only ${recruiterName(state, campaign.ownerId)} can recategorize replies to this Campaign.`);
    const recipient = state.recipients.find((r) => r.id === reply.recipientId);
    if (!recipient) fail("The recipient of this reply no longer exists.");
    const from = reply.category;
    reply.recategorizedFrom = from;
    reply.category = p.category;
    reply.handled = false;
    applyCategoryEffects(state, reply, recipient);
    audit(state, me.name, "Recategorized a reply", `${reply.personLabel}: ${REPLY_CATEGORY_LABELS[from]} to ${REPLY_CATEGORY_LABELS[p.category]}`, { kind: "reply", id: reply.id });
    return { effects: reply.effects };
  },

  markReplyHandled(state, p) {
    const me = requireRecruiter(state);
    const reply = state.replies.find((r) => r.id === p.replyId);
    if (!reply) fail("Reply not found.");
    const campaign = state.campaigns.find((c) => c.id === reply.campaignId);
    if (campaign && campaign.ownerId !== me.id && me.role !== "owner") fail(`Only ${recruiterName(state, campaign.ownerId)} can mark replies to this Campaign as handled.`);
    reply.handled = Boolean(p.handled);
    audit(state, me.name, reply.handled ? "Marked a reply as handled" : "Marked a reply as needing action", reply.personLabel, { kind: "reply", id: reply.id });
    return {};
  },

  recordConsent(state, p) {
    const token = state.consentTokens.find((t) => t.token === p.token);
    const candidate = token ? state.candidates.find((c) => c.id === token.candidateId) : undefined;
    const ws = state.workspace;
    if (!token || !candidate || !ws) fail("This link is no longer valid.");
    if (p.choice !== "talent_pool" && p.choice !== "this_opportunity" && p.choice !== "delete") fail("Choose one of the three options.");
    const today = state.clock.today;
    const name = candidate.name;
    token.usedOn = today;
    token.choice = p.choice;

    if (p.choice === "delete") {
      // Their replies record where the deletion came from; the rest no longer names them (ADR-0019).
      for (const rep of state.replies) {
        if (rep.personKind !== "candidate" || rep.personId !== candidate.id || rep.effects.some((e) => e.kind === "candidate_deleted")) continue;
        rep.effects.push({ kind: "candidate_deleted", description: "They chose \"Delete my data\" on the Consent Page: their data was deleted at once and only the hash stays on the Suppression List.", on: today, viaConsentPage: true });
      }
      const hash = deleteObjectingCandidate(state, candidate.id, "data_request_delete");
      state.dataRequests.unshift({
        id: newId("dr"),
        personQuery: DELETED_CANDIDATE_LABEL,
        requesterEmail: "",
        channel: "consent_page",
        receivedOn: today,
        dueOn: addDays(today, RETENTION.dataRequestDueDays),
        kind: "delete",
        status: "completed",
        resolution: `Deleted from the Consent Page by the Candidate. Only the hash${hash ? ` (${truncateHash(hash)})` : ""} stays on the Suppression List so they are never contacted again.`,
        completedOn: today,
        matches: [],
        deletedCandidate: true,
      });
      audit(state, CONSENT_ACTOR, "Asked to delete their data", "Deleted Candidate (hash kept on the Suppression List)", null);
      return { candidateName: name, workspaceName: ws.name, retainUntil: null };
    }

    candidate.consent = p.choice;
    candidate.consentRecordedOn = today;
    candidate.deleteOn = null;
    if (p.choice === "talent_pool") {
      candidate.retainUntil = addYears(today, RETENTION.talentPoolYears);
      candidate.lifecycle = "consented";
    } else {
      candidate.retainUntil = addMonths(today, RETENTION.thisOpportunityMonths);
      if (candidate.lifecycle === "consented") candidate.lifecycle = "replied";
    }
    audit(state, CONSENT_ACTOR, p.choice === "talent_pool" ? "Joined the Talent Pool" : `Chose "${CONSENT_LABELS[p.choice]}"`, name, { kind: "candidate", id: candidate.id });
    return { candidateName: name, workspaceName: ws.name, retainUntil: candidate.retainUntil };
  },
};
