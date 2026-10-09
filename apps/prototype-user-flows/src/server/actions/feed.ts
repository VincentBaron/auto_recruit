// Feed actions: dismiss and restore, new Signals seen, Enrichment (quote and charge), sourcing for a
// Detected Role, finding more Prospects like one, accepting a referred Hiring Contact, releasing a Claim.

import { formatCreditsLabel, plural } from "@/lib/format";
import { DISMISS_REASONS, nicheLabel } from "@/lib/labels";
import { emailKindFor, PRICES, ROLE_SOURCING_MAX_COST } from "@/lib/pricing";
import type { AppState, Candidate, ContactValue, EnrichPersonResult, HiringContact, PersonKind, PersonRef } from "@/lib/types";
import { createProspect, findContactValue, generateProspectSeed, pickLocation } from "../generate";
import type { HandlerMap } from "../handler-types";
import {
  audit,
  canSpend,
  fail,
  getPerson,
  isSuppressed,
  recruiterName,
  requireArray,
  requirePersonRef,
  requireRecruiter,
  requireWorkspace,
  spend,
  usableEmail,
} from "../helpers";
import { autoAddAfterEnrichment, isActiveRecipient } from "../outreach";
import { rngFor } from "../rng";
import { newId } from "../runtime";
import { startRoleSourcing } from "../sim";

interface EnrichRequest {
  kind: PersonKind;
  id: string;
  mobile: boolean;
}

interface EnrichPlan {
  person: HiringContact | Candidate | undefined;
  name: string;
  needEmail: boolean;
  needMobile: boolean;
  credits: number;
  skipped: string | null;
}

function nicheOf(state: AppState, ref: PersonRef): string | null {
  const person = getPerson(state, ref);
  if (!person) return null;
  if (ref.kind === "candidate") return (person as Candidate).nicheIds[0] ?? null;
  return state.prospects.find((p) => p.id === (person as HiringContact).prospectId)?.nicheIds[0] ?? null;
}

/** Validates the people of an Enrichment payload (422 with a readable message, never a crash). */
function enrichRequests(value: unknown): EnrichRequest[] {
  return requireArray(value, "people").map((x) => ({ ...requirePersonRef(x), mobile: Boolean((x as { mobile?: unknown }).mobile) }));
}

/** Same rules for the quote and the charge: email always (if missing), mobile only when ticked. */
function planEnrichment(state: AppState, req: EnrichRequest, meId: string): EnrichPlan {
  const person = getPerson(state, req);
  const name = person?.name ?? "Deleted person";
  const base = { person, name, needEmail: false, needMobile: false, credits: 0 };
  if (!person) return { ...base, skipped: "No longer stored" };
  if (person.claim && person.claim.recruiterId !== meId) return { ...base, skipped: `Claimed by ${recruiterName(state, person.claim.recruiterId)}` };
  if (req.kind === "hiring_contact" && (person as HiringContact).proposed) return { ...base, skipped: "Proposed by a Referral: accept them first" };
  if (person.lifecycle === "suppressed") return { ...base, skipped: "On the Suppression List" };
  if (person.lifecycle === "dismissed") return { ...base, skipped: "Dismissed: restore them first" };
  const needEmail = usableEmail(person, req.kind) === null;
  const needMobile = req.mobile && !person.contactValues.some((v) => v.kind === "mobile" && v.verification !== "invalid");
  if (!needEmail && !needMobile) return { ...base, skipped: req.mobile ? "Already Enriched, mobile number included" : "Already Enriched" };
  const credits = (needEmail ? PRICES.verifiedEmail : 0) + (needMobile ? PRICES.mobile : 0);
  return { person, name, needEmail, needMobile, credits, skipped: null };
}

function findEmail(state: AppState, person: HiringContact | Candidate, kind: PersonKind): ContactValue | null {
  const emailKind = emailKindFor(kind);
  const invalid = new Set(person.contactValues.filter((v) => v.verification === "invalid").map((v) => v.value));
  for (let attempt = 0; attempt <= 2; attempt++) {
    const v = findContactValue(state, person, kind, emailKind, attempt);
    if (v && !invalid.has(v.value)) return v;
  }
  return null;
}

function findMobile(state: AppState, person: HiringContact | Candidate, kind: PersonKind): ContactValue | null {
  for (let attempt = 0; attempt <= 1; attempt++) {
    const v = findContactValue(state, person, kind, "mobile", attempt);
    if (v) return v;
  }
  return null;
}

type FeedAction =
  | "dismiss"
  | "undismiss"
  | "markSignalsSeen"
  | "quoteEnrichment"
  | "enrich"
  | "sourceForDetectedRole"
  | "findMoreLike"
  | "acceptReferral"
  | "releaseClaim";

export const feedHandlers: HandlerMap<FeedAction> = {
  dismiss(state, p) {
    requireWorkspace(state);
    const me = requireRecruiter(state);
    if (!DISMISS_REASONS.includes(p.reason)) fail("Pick a reason.");
    const note = p.note?.trim() || null;
    let dismissed = 0;
    for (const item of p.items ?? []) {
      if (item.kind === "prospect") {
        const prospect = state.prospects.find((x) => x.id === item.id);
        if (!prospect || prospect.status !== "surfaced") continue;
        prospect.status = "dismissed";
        prospect.dismissReason = p.reason;
        prospect.dismissNote = note;
        prospect.hasNewSignal = false;
        audit(state, me.name, "Dismissed a Prospect", prospect.name, item);
      } else {
        const person = getPerson(state, { kind: item.kind, id: item.id });
        if (!person || (person.lifecycle !== "surfaced" && person.lifecycle !== "enriched")) continue;
        if (person.claim && person.claim.recruiterId !== me.id) continue;
        if (state.recipients.some((r) => r.personKind === item.kind && r.personId === item.id && isActiveRecipient(r))) continue;
        person.lifecycle = "dismissed";
        person.dismissReason = p.reason;
        if (item.kind === "candidate") (person as Candidate).dismissNote = note;
        audit(state, me.name, item.kind === "candidate" ? "Dismissed a Candidate" : "Dismissed a Hiring Contact", person.name, item);
      }
      dismissed++;
    }
    if (dismissed === 0) fail("Nothing to dismiss: these items are no longer Surfaced.");
    return { dismissed };
  },

  undismiss(state, p) {
    const me = requireRecruiter(state);
    let restored = 0;
    for (const item of p.items ?? []) {
      if (item.kind === "prospect") {
        const prospect = state.prospects.find((x) => x.id === item.id);
        if (!prospect || prospect.status !== "dismissed") continue;
        prospect.status = "surfaced";
        prospect.dismissReason = null;
        prospect.dismissNote = null;
        audit(state, me.name, "Restored a Prospect", prospect.name, item);
      } else {
        const person = getPerson(state, { kind: item.kind, id: item.id });
        if (!person || person.lifecycle !== "dismissed") continue;
        person.lifecycle = usableEmail(person, item.kind) ? "enriched" : "surfaced";
        person.dismissReason = null;
        if (item.kind === "candidate") (person as Candidate).dismissNote = null;
        audit(state, me.name, item.kind === "candidate" ? "Restored a Candidate" : "Restored a Hiring Contact", person.name, item);
      }
      restored++;
    }
    if (restored === 0) fail("Nothing to restore.");
    return { restored };
  },

  markSignalsSeen(state, p) {
    for (const id of p.prospectIds ?? []) {
      const prospect = state.prospects.find((x) => x.id === id);
      if (prospect) prospect.hasNewSignal = false;
    }
    return {};
  },

  quoteEnrichment(state, p) {
    const ws = requireWorkspace(state);
    const me = requireRecruiter(state);
    if (ws.plan === "free_trial") fail("Buy Credits to reveal people before enriching them: the free trial only shows Previews.");
    const lines = enrichRequests(p.people).map((req) => {
      const plan = planEnrichment(state, req, me.id);
      return { kind: req.kind, id: req.id, name: plan.name, credits: plan.credits, skipped: plan.skipped };
    });
    return { lines, total: lines.reduce((s, l) => s + l.credits, 0) };
  },

  enrich(state, p, ctx) {
    const ws = requireWorkspace(state);
    const me = requireRecruiter(state);
    if (ws.plan === "free_trial") fail("Buy Credits to reveal people before enriching them: the free trial only shows Previews.");
    const requests = enrichRequests(p.people);
    if (requests.length === 0) fail("Select the people to enrich.");
    const plans = requests.map((req) => ({ req, plan: planEnrichment(state, req, me.id) }));
    const maxCost = plans.reduce((s, x) => s + x.plan.credits, 0);
    if (maxCost > 0 && !canSpend(state, maxCost)) {
      fail(`This Enrichment can cost up to ${formatCreditsLabel(maxCost)} and the balance is ${formatCreditsLabel(ws.credits)}. Buy Credits or switch on auto top-up.`);
    }
    const ref = `Enrichment by ${me.name}`;
    const results: EnrichPersonResult[] = [];
    let creditsCharged = 0;
    let emails = 0;
    let mobiles = 0;
    let candidates = 0;
    let contacts = 0;
    for (const { req, plan } of plans) {
      const person = plan.person;
      if (!person || plan.skipped) {
        results.push({ kind: req.kind, id: req.id, name: plan.name, email: null, mobile: null, creditsCharged: 0, note: plan.skipped });
        continue;
      }
      const nicheId = nicheOf(state, req);
      const notes: string[] = [];
      let email: ContactValue | null = null;
      let mobile: ContactValue | null = null;
      let charged = 0;
      if (plan.needEmail) {
        const found = findEmail(state, person, req.kind);
        if (!found) notes.push("No verifiable email found: no Credits charged");
        else if (isSuppressed(state, found.value)) notes.push("The email found is on the Suppression List: not stored, no Credits charged");
        else {
          spend(state, PRICES.verifiedEmail, "verified_email", ref, { nicheId });
          found.creditsCharged = PRICES.verifiedEmail;
          person.contactValues.push(found);
          email = found;
          charged += PRICES.verifiedEmail;
          emails++;
        }
      } else {
        email = usableEmail(person, req.kind);
      }
      if (plan.needMobile) {
        const found = findMobile(state, person, req.kind);
        if (!found) notes.push("No mobile number found: no Credits charged");
        else {
          spend(state, PRICES.mobile, "mobile", ref, { nicheId });
          found.creditsCharged = PRICES.mobile;
          person.contactValues.push(found);
          mobile = found;
          charged += PRICES.mobile;
          mobiles++;
        }
      }
      if (email && person.lifecycle === "surfaced") person.lifecycle = "enriched";
      if (req.kind === "candidate") candidates++;
      else contacts++;
      creditsCharged += charged;
      if (plan.needEmail && email) {
        const joined = autoAddAfterEnrichment(state, req);
        if (joined.length > 0) notes.push(`Added to "${joined[0]}" by its auto-add rule`);
      }
      results.push({ kind: req.kind, id: req.id, name: person.name, email, mobile, creditsCharged: charged, note: notes.length > 0 ? notes.join(". ") : null });
    }
    if (candidates + contacts > 0) {
      const who = [contacts > 0 ? plural(contacts, "Hiring Contact") : "", candidates > 0 ? plural(candidates, "Candidate") : ""].filter(Boolean).join(", ");
      audit(state, me.name, "Enriched people", `${who}: ${plural(emails, "email")} and ${plural(mobiles, "mobile number")} found, ${formatCreditsLabel(creditsCharged)}`, null);
      ctx.note(`Enrichment: ${plural(emails, "email")} and ${plural(mobiles, "mobile number")} found, ${formatCreditsLabel(creditsCharged)} charged.`);
    }
    return { results, creditsCharged, balance: ws.credits };
  },

  sourceForDetectedRole(state, p, ctx) {
    const ws = requireWorkspace(state);
    const me = requireRecruiter(state);
    const role = state.detectedRoles.find((r) => r.id === p.detectedRoleId);
    if (!role) fail("Detected Role not found.");
    if (role.sourcing.status === "running") fail("The Sourcing Agent is already working on this Detected Role.");
    const prospect = state.prospects.find((x) => x.id === role.prospectId);
    const paid = ws.plan === "paid";
    if (paid && !canSpend(state, ROLE_SOURCING_MAX_COST)) {
      fail(`Sourcing for this role can cost up to ${formatCreditsLabel(ROLE_SOURCING_MAX_COST)} and the balance is ${formatCreditsLabel(ws.credits)}. Buy Credits first.`);
    }
    const job = startRoleSourcing(state, role.id, ctx.nowMs);
    audit(state, me.name, "Asked the Sourcing Agent to source for a Detected Role", `${role.title} at ${prospect?.name ?? "a Prospect"}`, { kind: "prospect", id: role.prospectId });
    return { jobId: job.id, costCredits: paid ? ROLE_SOURCING_MAX_COST : 0 };
  },

  findMoreLike(state, p, ctx) {
    const ws = requireWorkspace(state);
    const me = requireRecruiter(state);
    if (ws.plan === "free_trial") fail("Finding more Prospects spends Credits: buy Credits first.");
    const target = state.prospects.find((x) => x.id === p.prospectId);
    if (!target) fail("Prospect not found.");
    const niche = state.niches.find((n) => target.nicheIds.includes(n.id));
    if (!niche) fail("This Prospect has no Niche.");
    const count = Math.max(1, Math.min(25, Math.round(Number(p.count) || 10)));
    const maxCost = count * PRICES.surfacedProspect;
    if (!canSpend(state, maxCost)) fail(`This search can cost up to ${formatCreditsLabel(maxCost)} and the balance is ${formatCreditsLabel(ws.credits)}. Buy Credits first.`);
    const rng = rngFor("find-more", target.id, state.clock.today, state.agentRuns.length);
    const ref = `Find more like ${target.name} - ${nicheLabel(niche)}`;
    const surfaced: string[] = [];
    let below = 0;
    for (let attempt = 0; attempt < count * 3 && surfaced.length < count; attempt++) {
      const seed = generateProspectSeed(state, niche, rng);
      // Look-alikes: same sector, a comparable size and mostly the same city.
      seed.sector = target.sector;
      seed.headcount = Math.max(8, Math.round(target.headcount * (0.6 + rng.next() * 0.9)));
      if (rng.chance(0.7)) seed.location = target.location;
      else seed.location = pickLocation(niche.profile, rng);
      seed.tags = [...target.tags.slice(0, 1), ...seed.tags].slice(0, 2);
      const prospect = createProspect(state, niche.id, seed, state.clock.today);
      if (!prospect.fit.aboveThreshold) {
        state.prospects = state.prospects.filter((x) => x.id !== prospect.id);
        state.detectedRoles = state.detectedRoles.filter((r) => r.prospectId !== prospect.id);
        below++;
        continue;
      }
      spend(state, PRICES.surfacedProspect, "surfaced_prospect", ref, { nicheId: niche.id });
      surfaced.push(prospect.id);
    }
    const creditsCharged = surfaced.length * PRICES.surfacedProspect;
    state.agentRuns.push({
      id: newId("run"),
      nicheId: niche.id,
      on: state.clock.today,
      kind: "find_more",
      prospectsSurfaced: surfaced.length,
      candidatesSurfaced: 0,
      hiringContactsFound: 0,
      newSignals: 0,
      belowThreshold: below,
      creditsSpent: creditsCharged,
      stoppedReason: null,
    });
    audit(state, "Prospection Agent", `Found Prospects like ${target.name}`, `${plural(surfaced.length, "Prospect")} Surfaced for ${me.name}, ${formatCreditsLabel(creditsCharged)}`, { kind: "niche", id: niche.id });
    ctx.note(`${plural(surfaced.length, "Prospect")} like ${target.name} Surfaced (${below} below the Fit threshold were not kept).`);
    return { surfacedProspectIds: surfaced, creditsCharged };
  },

  acceptReferral(state, p) {
    requireWorkspace(state);
    const me = requireRecruiter(state);
    const reply = state.replies.find((r) => r.id === p.replyId);
    if (!reply) fail("Reply not found.");
    const id = reply.referral?.hiringContactId;
    const h = id ? state.hiringContacts.find((x) => x.id === id) : undefined;
    if (!h) fail("The referred person is no longer stored.");
    if (!h.proposed) fail(`${h.name} was already accepted.`);
    const prospect = state.prospects.find((x) => x.id === h.prospectId);
    spend(state, PRICES.hiringContactFound, "hiring_contact_found", `Referral accepted - ${h.name}`, { nicheId: prospect?.nicheIds[0] ?? null });
    h.proposed = false;
    const at = prospect?.name ?? "this Prospect";
    // The reply no longer asks to accept them: the next step is enriching them. Accepting is the
    // Recruiter's own action (audit log, Credit ledger), not an automatic effect of the reply.
    reply.suggestedNextStep = `Enrich ${h.name} at ${at}, then add them to the Campaign.`;
    for (const e of reply.effects) {
      if (e.kind === "hiring_contact_proposed") e.description = `${h.name} (${h.title}) proposed as a new Hiring Contact at ${at}.`;
    }
    audit(state, me.name, "Accepted a referred Hiring Contact", `${h.name} (${h.title}) at ${at}`, { kind: "hiring_contact", id: h.id });
    return { hiringContactId: h.id };
  },

  releaseClaim(state, p) {
    const me = requireRecruiter(state);
    const ref = requirePersonRef(p.person);
    const person = getPerson(state, ref);
    if (!person) fail("This person is no longer stored.");
    const claim = person.claim;
    if (!claim) fail(`${person.name} has no Claim.`);
    if (claim.recruiterId !== me.id && me.role !== "owner") fail(`Only ${recruiterName(state, claim.recruiterId)} or an Owner can release this Claim.`);
    person.claim = null;
    for (const r of state.recipients) {
      if (r.personKind !== ref.kind || r.personId !== person.id || !isActiveRecipient(r)) continue;
      r.state = "stopped";
      r.stopReason = `Claim released by ${me.name}`;
      r.messages = r.messages.filter((m) => m.status === "sent");
      r.nextSendOn = null;
      if (r.prospectId && !state.recipients.some((o) => o.id !== r.id && o.prospectId === r.prospectId && isActiveRecipient(o))) {
        const prospect = state.prospects.find((x) => x.id === r.prospectId);
        if (prospect?.status === "in_campaign") prospect.status = "surfaced";
      }
    }
    audit(state, me.name, "Released a Claim", `${person.name} (held by ${recruiterName(state, claim.recruiterId)})`, { kind: ref.kind, id: person.id });
    return {};
  },
};
