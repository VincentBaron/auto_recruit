// Credits: packs bought through the simulated checkout (VAT line), auto top-up, and revealing the
// free trial's Previews on the first pack, charged at the normal price (ADR-0018).

import { formatCredits, formatCreditsLabel } from "@/lib/format";
import { nicheLabel } from "@/lib/labels";
import { CREDIT_PACKS, packPrice, PRICES, REVEAL_LEDGER_REF, revealCost, revealedPeopleText, VAT_RATE } from "@/lib/pricing";
import type { AppState, Invoice, PersonKind, RevealOutcome } from "@/lib/types";
import { revealPreview } from "../generate";
import type { HandlerMap } from "../handler-types";
import { addCredits, audit, fail, requireRecruiter, requireWorkspace, spend } from "../helpers";
import { newId } from "../runtime";

const REVEAL_ORDER: Record<PersonKind, number> = { hiring_contact: 0, candidate: 1 };

/**
 * Turns every Preview into a stored person, points Test Run items and Detected Roles at them, and
 * charges each one at the normal price: a Hiring Contact found or a Surfaced Candidate. Previews are
 * taken Niche by Niche, Hiring Contacts first, so the charges merge into one ledger entry per Niche
 * and reason, like the agents' own charges.
 */
function revealPreviews(state: AppState): RevealOutcome {
  const outcome: RevealOutcome = { hiringContacts: 0, candidates: 0, credits: 0 };
  const nicheOrder = new Map(state.niches.map((n, i) => [n.id, i]));
  const previews = [...state.previews].sort(
    (a, b) => (nicheOrder.get(a.nicheId) ?? -1) - (nicheOrder.get(b.nicheId) ?? -1) || REVEAL_ORDER[a.kind] - REVEAL_ORDER[b.kind],
  );
  for (const preview of previews) {
    const niche = state.niches.find((n) => n.id === preview.nicheId);
    const person = niche ? revealPreview(state, preview) : null;
    if (!niche || !person) continue;
    const ref = `${REVEAL_LEDGER_REF} - ${nicheLabel(niche)}`;
    if (preview.kind === "candidate") {
      spend(state, PRICES.surfacedCandidate, "surfaced_candidate", ref, { nicheId: niche.id });
      outcome.credits += PRICES.surfacedCandidate;
      outcome.candidates++;
      for (const n of state.niches) {
        for (const item of n.testRun?.items ?? []) {
          if (item.previewId !== preview.id) continue;
          item.previewId = null;
          item.candidateId = person.id;
        }
      }
      for (const role of state.detectedRoles) {
        if (!role.sourcedPreviewIds.includes(preview.id)) continue;
        role.sourcedPreviewIds = role.sourcedPreviewIds.filter((id) => id !== preview.id);
        role.sourcedCandidateIds.push(person.id);
      }
    } else {
      spend(state, PRICES.hiringContactFound, "hiring_contact_found", ref, { nicheId: niche.id });
      outcome.credits += PRICES.hiringContactFound;
      outcome.hiringContacts++;
    }
  }
  state.previews = [];
  return outcome;
}

export const creditHandlers: HandlerMap<"purchaseCredits" | "setAutoTopUp"> = {
  purchaseCredits(state, p, ctx) {
    const ws = requireWorkspace(state);
    const me = requireRecruiter(state);
    if (me.role !== "owner") fail("Only an Owner can buy Credits.");
    const pack = CREDIT_PACKS.find((x) => x.credits === p.pack);
    if (!pack) fail("Pick a Credit pack.");
    const firstPack = ws.plan === "free_trial";
    if (firstPack) {
      // The checkout showed this cost before payment: revealing never leaves the balance negative.
      const cost = revealCost({
        hiringContacts: state.previews.filter((x) => x.kind === "hiring_contact").length,
        candidates: state.previews.filter((x) => x.kind === "candidate").length,
      });
      if (ws.credits + pack.credits < cost) fail(`Revealing your Previews costs ${formatCreditsLabel(cost)}, more than this pack. Pick a bigger pack.`);
    }
    addCredits(state, pack.credits, "pack_purchase", `${pack.label} pack: ${formatCredits(pack.credits)} Credits`);
    const price = packPrice(pack.credits);
    const invoice: Invoice = { id: newId("inv"), on: state.clock.today, credits: pack.credits, netEur: price.netEur, vatRate: VAT_RATE, vatEur: price.vatEur, totalEur: price.totalEur };
    state.invoices.push(invoice);
    audit(state, me.name, "Bought Credits", `${pack.label} pack: ${formatCreditsLabel(pack.credits)}`, { kind: "workspace", id: ws.id });

    // The checkout confirms the purchase on the Credits page itself, so no background notice repeats it.
    let revealed: RevealOutcome = { hiringContacts: 0, candidates: 0, credits: 0 };
    if (firstPack) {
      ws.plan = "paid";
      revealed = revealPreviews(state);
      if (revealed.hiringContacts + revealed.candidates > 0) {
        const charged = `${formatCreditsLabel(revealed.credits)} charged`;
        audit(state, "System", "Revealed people from the free trial's Previews", `${revealedPeopleText(revealed)}, ${charged}`, { kind: "workspace", id: ws.id });
        ctx.note(`Revealed ${revealedPeopleText(revealed)} from their Previews: ${charged} from the ${pack.label} pack, at the normal price.`);
      }
    }
    return { invoice, revealed, firstPack };
  },

  setAutoTopUp(state, p) {
    const ws = requireWorkspace(state);
    const me = requireRecruiter(state);
    if (me.role !== "owner") fail("Only an Owner can change auto top-up.");
    const next = { ...ws.autoTopUp, enabled: Boolean(p.enabled) };
    if (p.thresholdCredits !== undefined) {
      if (!Number.isInteger(p.thresholdCredits) || p.thresholdCredits < 0 || p.thresholdCredits > 100_000) fail("The threshold must be a whole number of Credits.");
      next.thresholdCredits = p.thresholdCredits;
    }
    if (p.packCredits !== undefined) {
      if (!CREDIT_PACKS.some((x) => x.credits === p.packCredits)) fail("Pick a Credit pack.");
      next.packCredits = p.packCredits;
    }
    if (next.enabled && ws.plan !== "paid") fail("Buy a first Credit pack before switching on auto top-up.");
    const changedEnabled = next.enabled !== ws.autoTopUp.enabled;
    ws.autoTopUp = next;
    audit(
      state,
      me.name,
      changedEnabled ? (next.enabled ? "Switched on auto top-up" : "Switched off auto top-up") : "Changed auto top-up",
      `${formatCreditsLabel(next.packCredits)} when the balance drops below ${formatCreditsLabel(next.thresholdCredits)}`,
      { kind: "workspace", id: ws.id },
    );
    return {};
  },
};
