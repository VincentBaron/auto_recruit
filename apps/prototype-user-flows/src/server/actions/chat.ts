// The "Ask" panel's canned agent: answers, and proposes actions that run only once the Recruiter
// confirms them with their Credit cost shown (ADR-0008: the same actions as every screen).

import { formatCreditsLabel, plural } from "@/lib/format";
import type { ActionName, ActionResult, AppState, ChatMessage } from "@/lib/types";
import { chatAnswer, chatMessage } from "../agents";
import type { HandlerMap } from "../handler-types";
import { ActionError, fail, requireRecruiter } from "../helpers";
import { newId } from "../runtime";

function creditsSpent(state: AppState): number {
  return state.creditLedger.reduce((sum, e) => (e.delta < 0 ? sum - e.delta : sum), 0);
}

interface Outcome {
  text: string;
  links: ChatMessage["links"];
}

function outcomeOf(name: ActionName, result: unknown): Outcome {
  switch (name) {
    case "findMoreLike": {
      const r = result as ActionResult<"findMoreLike">;
      return {
        text: `Surfaced ${plural(r.surfacedProspectIds.length, "Prospect")}, ${formatCreditsLabel(r.creditsCharged)} charged.`,
        links: [{ label: "Open the Feed", href: "/feed?tab=prospects" }, ...(r.surfacedProspectIds[0] ? [{ label: "Open the first one", href: `/prospects/${r.surfacedProspectIds[0]}` }] : [])],
      };
    }
    case "enrich": {
      const r = result as ActionResult<"enrich">;
      const found = r.results.filter((x) => x.email).length;
      const kinds = new Set(r.results.map((x) => x.kind));
      const who = kinds.size === 1 && kinds.has("candidate") ? "Candidate" : kinds.size === 1 ? "Hiring Contact" : "person";
      const whoPlural = who === "person" ? "people" : `${who}s`;
      return {
        text: `Enriched ${r.results.length} ${r.results.length === 1 ? who : whoPlural}: ${plural(found, "email")} found, ${formatCreditsLabel(r.creditsCharged)} charged.`,
        links: [{ label: "Open the Feed", href: "/feed?tab=candidates" }],
      };
    }
    case "createCampaign": {
      const r = result as ActionResult<"createCampaign">;
      return { text: "Draft Campaign created. Add recipients, review the drafts, then launch it.", links: [{ label: "Open the Campaign", href: `/campaigns/${r.campaignId}` }] };
    }
    default:
      return { text: "Done.", links: [] };
  }
}

export const chatHandlers: HandlerMap<"sendChatMessage" | "confirmChatProposal" | "cancelChatProposal" | "clearChat"> = {
  sendChatMessage(state, p) {
    // Anyone can ask: before sign-up the agent only explains the free trial and points to sign-up.
    const text = (p.text ?? "").trim();
    if (!text) fail("Write a message first.");
    state.chat.push(chatMessage(state, "recruiter", text));
    const answer = chatAnswer(state, text, p.context);
    const reply = chatMessage(state, "agent", answer.text, {
      links: answer.links,
      proposal: answer.proposal ? { ...answer.proposal, id: newId("pr"), status: "pending", resultText: null, creditsCharged: null } : null,
    });
    state.chat.push(reply);
    return { reply };
  },

  confirmChatProposal(state, p, ctx) {
    requireRecruiter(state);
    const pending = state.chat.find((m) => m.id === p.messageId)?.proposal;
    if (!pending) fail("This proposal no longer exists.");
    if (pending.status !== "pending") fail("This proposal was already decided.");
    const { actionName, actionPayload } = pending;
    let outcome: Outcome;
    let failed = false;
    // Credits charged = Credits spent during the action (from the ledger, so an auto top-up in the
    // middle of it never hides a charge).
    const spentBefore = creditsSpent(state);
    try {
      outcome = outcomeOf(actionName, ctx.dispatch(actionName, actionPayload as never));
    } catch (e) {
      if (!(e instanceof ActionError)) throw e;
      failed = true;
      outcome = { text: e.message, links: /Credits/.test(e.message) ? [{ label: "Buy Credits", href: "/credits" }] : [] };
    }
    // A failed dispatch restores the state in place: look the proposal up again.
    const proposal = state.chat.find((m) => m.id === p.messageId)?.proposal;
    if (proposal) {
      proposal.status = failed ? "failed" : "confirmed";
      proposal.resultText = outcome.text;
      proposal.creditsCharged = failed ? null : Math.max(0, creditsSpent(state) - spentBefore);
    }
    const reply = chatMessage(state, "agent", failed ? `I could not do it: ${outcome.text}` : outcome.text, { links: outcome.links });
    state.chat.push(reply);
    return { reply };
  },

  cancelChatProposal(state, p) {
    const proposal = state.chat.find((m) => m.id === p.messageId)?.proposal;
    if (!proposal) fail("This proposal no longer exists.");
    if (proposal.status !== "pending") fail("This proposal was already decided.");
    proposal.status = "cancelled";
    proposal.resultText = "Cancelled: nothing was spent and nobody was contacted.";
    return {};
  },

  clearChat(state) {
    state.chat = [];
    return {};
  },
};
