// Niche setup (chat and wizard), Niche Profile edits, schedule, Test Run, activation.

import { formatCreditsLabel, plural } from "@/lib/format";
import { nicheDeletionImpact } from "@/lib/niche-impact";
import { PAID_TEST_RUN_COST, PRICES } from "@/lib/pricing";
import { nicheFieldLabel, nicheLabel } from "@/lib/labels";
import { openDataRequestFor } from "@/lib/retention";
import type { Niche, NicheProfile, NicheSchedule, SetupMessage } from "@/lib/types";
import { WEEKDAYS } from "@/lib/types";
import { applyWizardInput, emptyProfile, greeting, searchStrategyFor, setupAgentReply, suggestFromDescription } from "../agents";
import type { HandlerMap } from "../handler-types";
import { audit, canSpend, deleteCandidate, deleteHiringContact, fail, getPerson, requireNiche, requireRecruiter, requireWorkspace, spend } from "../helpers";
import { newId } from "../runtime";
import { rescoreNiche } from "../scoring";
import { applyAdjustment, computeAdjustments, initialSteps, prepareTestRun, TEST_RUN_STEPS } from "../sim";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The most a paid Test Run can cost: 10 Prospects, 10 Candidates and up to 20 Hiring Contacts. */
const PAID_TEST_RUN_MAX = PAID_TEST_RUN_COST + 20 * PRICES.hiringContactFound;

export const DEFAULT_SCHEDULE: NicheSchedule = { days: ["mon", "tue", "wed", "thu", "fri"], time: "07:00", prospectsPerRun: 25, candidatesPerRun: 40 };

function requireOwnNicheOrOwner(state: Parameters<typeof requireRecruiter>[0], niche: Niche): void {
  const me = requireRecruiter(state);
  if (niche.ownerId !== me.id && me.role !== "owner") fail(`Only ${state.recruiters.find((r) => r.id === niche.ownerId)?.name ?? "its owner"} or an Owner can change this Niche.`);
}

function validateProfile(p: Partial<NicheProfile>): void {
  if (p.fitThreshold !== undefined && !(Number.isFinite(p.fitThreshold) && p.fitThreshold >= 0 && p.fitThreshold <= 100)) fail("The Fit threshold must be between 0 and 100.");
  if (p.companySize !== undefined) {
    const { min, max } = p.companySize;
    if (!(Number.isFinite(min) && Number.isFinite(max) && min >= 1 && max > min)) fail("Company size: the maximum must be above the minimum.");
  }
  if (p.signalWeights !== undefined) {
    for (const w of p.signalWeights) {
      if (!Number.isFinite(w.weight) || Math.abs(w.weight) > 100) fail(`The weight of "${w.label}" must be between -100 and 100.`);
      if (!Number.isFinite(w.halfLifeDays) || w.halfLifeDays < 1 || w.halfLifeDays > 730) fail(`The half-life of "${w.label}" must be between 1 and 730 days.`);
    }
  }
}

function validateSchedule(s: NicheSchedule): void {
  if (!Array.isArray(s.days) || s.days.some((d) => !WEEKDAYS.includes(d))) fail("Pick the days the agents run.");
  if (!TIME_RE.test(s.time)) fail("The run time must look like 07:00.");
  if (!Number.isInteger(s.prospectsPerRun) || s.prospectsPerRun < 0 || s.prospectsPerRun > 500) fail("Prospects per run must be between 0 and 500.");
  if (!Number.isInteger(s.candidatesPerRun) || s.candidatesPerRun < 0 || s.candidatesPerRun > 500) fail("Candidates per run must be between 0 and 500.");
}

type NicheAction =
  | "createNiche"
  | "nicheChatMessage"
  | "suggestNicheFields"
  | "draftNicheProfile"
  | "updateNiche"
  | "updateNicheProfile"
  | "updateSignalWeight"
  | "setSchedule"
  | "launchTestRun"
  | "labelTestRunItem"
  | "acceptAdjustments"
  | "dismissAdjustment"
  | "activateNiche"
  | "pauseNiche"
  | "deleteNiche";

export const nicheHandlers: HandlerMap<NicheAction> = {
  createNiche(state, p) {
    requireWorkspace(state);
    const me = requireRecruiter(state);
    const today = state.clock.today;
    const niche: Niche = {
      id: newId("ni"),
      ownerId: me.id,
      name: (p.name ?? "").trim(),
      nameCustomised: (p.name ?? "").trim().length > 0,
      status: "draft",
      profile: emptyProfile(),
      schedule: { ...DEFAULT_SCHEDULE, days: [...DEFAULT_SCHEDULE.days] },
      setupMessages: [greeting(state)],
      setupComplete: false,
      setupStage: "basics",
      testRun: null,
      lastRunOn: null,
      createdOn: today,
      activatedOn: null,
    };
    state.niches.push(niche);
    audit(state, me.name, "Started a Niche setup", nicheLabel(niche), { kind: "niche", id: niche.id });
    return { nicheId: niche.id };
  },

  nicheChatMessage(state, p) {
    const niche = requireNiche(state, p.nicheId);
    requireOwnNicheOrOwner(state, niche);
    const text = (p.text ?? "").trim();
    if (!text) fail("Write a message first.");
    const message: SetupMessage = { id: newId("sm"), role: "recruiter", text, on: state.clock.today, suggestions: [], updatedFields: [] };
    niche.setupMessages.push(message);
    const wasComplete = niche.setupComplete;
    const answer = setupAgentReply(state, niche, text);
    niche.setupMessages.push(answer.reply);
    rescoreNiche(state, niche.id);
    if (answer.complete && !wasComplete) audit(state, "Setup agent", "Drafted a Niche Profile", nicheLabel(niche), { kind: "niche", id: niche.id });
    return answer;
  },

  suggestNicheFields(_state, p) {
    return suggestFromDescription(p.description ?? "");
  },

  draftNicheProfile(state, p) {
    const niche = requireNiche(state, p.nicheId);
    requireOwnNicheOrOwner(state, niche);
    const input = p.input;
    if (!input || input.sectors.length === 0) fail("Add at least one sector.");
    if (input.roleTypes.length === 0) fail("Add at least one role type.");
    if (input.locations.length === 0) fail("Add at least one location.");
    validateProfile({ companySize: input.companySize });
    applyWizardInput(niche, input);
    rescoreNiche(state, niche.id);
    audit(state, "Setup agent", "Drafted a Niche Profile", nicheLabel(niche), { kind: "niche", id: niche.id });
    return { profile: niche.profile };
  },

  updateNiche(state, p) {
    const niche = requireNiche(state, p.nicheId);
    requireOwnNicheOrOwner(state, niche);
    const me = requireRecruiter(state);
    if (p.name !== undefined) {
      const name = p.name.trim();
      if (name.length < 3) fail("Give the Niche a name of at least 3 characters.");
      if (name !== niche.name) {
        audit(state, me.name, "Renamed a Niche", `${nicheLabel(niche)} to ${name}`, { kind: "niche", id: niche.id });
        // A name the Recruiter chose is never overwritten by the setup agent again.
        niche.nameCustomised = true;
      }
      niche.name = name;
    }
    if (p.ownerId !== undefined && p.ownerId !== niche.ownerId) {
      if (me.role !== "owner") fail("Only an Owner can change who owns a Niche.");
      const next = requireRecruiter(state, p.ownerId);
      if (next.status !== "active") fail(`${next.name} has not joined the Workspace yet.`);
      niche.ownerId = next.id;
      audit(state, me.name, "Changed a Niche owner", `${nicheLabel(niche)}: now owned by ${next.name}`, { kind: "niche", id: niche.id });
    }
    return {};
  },

  updateNicheProfile(state, p) {
    const niche = requireNiche(state, p.nicheId);
    requireOwnNicheOrOwner(state, niche);
    const patch = p.profile ?? {};
    validateProfile(patch);
    const before = niche.profile;
    // Keep the values exactly as sent (the screen compares its draft with the saved profile).
    niche.profile = { ...niche.profile, ...patch };
    if (patch.searchStrategy === undefined) niche.profile.searchStrategy = searchStrategyFor(niche.profile);
    rescoreNiche(state, niche.id);
    // While the setup runs, "Started a Niche setup" and "Drafted a Niche Profile" cover the edits.
    const changed = (Object.keys(patch) as (keyof NicheProfile)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(patch[k]));
    if (niche.setupComplete && changed.length > 0) {
      const me = requireRecruiter(state);
      audit(state, me.name, "Edited a Niche Profile", `${nicheLabel(niche)}: ${changed.map(nicheFieldLabel).join(", ")}`, { kind: "niche", id: niche.id });
    }
    return { profile: niche.profile };
  },

  updateSignalWeight(state, p) {
    const niche = requireNiche(state, p.nicheId);
    requireOwnNicheOrOwner(state, niche);
    const w = niche.profile.signalWeights.find((x) => x.type === p.signalType);
    if (!w) fail("Unknown Signal.");
    const next = { ...w, ...p.patch };
    validateProfile({ signalWeights: [next] });
    Object.assign(w, p.patch);
    rescoreNiche(state, niche.id);
    return {};
  },

  setSchedule(state, p) {
    const niche = requireNiche(state, p.nicheId);
    requireOwnNicheOrOwner(state, niche);
    const next: NicheSchedule = { ...niche.schedule, ...p.schedule };
    validateSchedule(next);
    niche.schedule = next;
    const me = requireRecruiter(state);
    audit(state, me.name, "Changed a Niche schedule", `${nicheLabel(niche)}: ${next.days.length} days at ${next.time}, ${next.prospectsPerRun} Prospects and ${next.candidatesPerRun} Candidates per run`, { kind: "niche", id: niche.id });
    return { schedule: niche.schedule };
  },

  launchTestRun(state, p, ctx) {
    const ws = requireWorkspace(state);
    const niche = requireNiche(state, p.nicheId);
    requireOwnNicheOrOwner(state, niche);
    const me = requireRecruiter(state);
    if (!niche.setupComplete) fail("Finish the Niche setup first: the Test Run works from a drafted Niche Profile.");
    if (niche.testRun?.status === "running") fail("A Test Run is already running for this Niche.");
    const free = ws.freeTestRunUsedBy === null;
    if (!free) {
      if (ws.plan === "free_trial") fail(`${ws.freeTestRunUsedBy} already used its free Test Run (one per Main Domain). Buy Credits to run another one.`);
      if (!canSpend(state, PAID_TEST_RUN_MAX)) fail(`A Test Run can cost up to ${formatCreditsLabel(PAID_TEST_RUN_MAX)} and the balance is ${formatCreditsLabel(ws.credits)}. Buy Credits first.`);
    }
    const ref = `${free ? "Free Test Run" : "Test Run"} - ${nicheLabel(niche)}`;
    if (free) {
      ws.freeTestRunUsedBy = ws.mainDomains[0] ?? null;
      spend(state, 0, "free_test_run", ref, { nicheId: niche.id });
    }
    const testRunId = newId("tr");
    // The results are decided now (companies looked at, those above the Fit threshold, the top 10 kept),
    // so the live steps show the real counts; they are stored and charged when the run completes.
    const stats = prepareTestRun(state, niche, testRunId);
    niche.testRun = {
      id: testRunId,
      status: "running",
      free,
      startedAtMs: ctx.nowMs,
      startedOn: state.clock.today,
      completedOn: null,
      step: 0,
      progress: 0,
      steps: initialSteps(TEST_RUN_STEPS),
      items: [],
      adjustments: [],
      creditsCharged: 0,
      stats,
    };
    if (niche.status === "draft") niche.status = "testing";
    audit(state, me.name, free ? "Launched the free Test Run" : "Launched a Test Run", free ? `${nicheLabel(niche)} (0 Credits, ${ws.freeTestRunUsedBy})` : `${nicheLabel(niche)} (up to ${formatCreditsLabel(PAID_TEST_RUN_MAX)})`, { kind: "niche", id: niche.id });
    return { testRunId, free, costCredits: free ? 0 : PAID_TEST_RUN_MAX };
  },

  labelTestRunItem(state, p) {
    const niche = requireNiche(state, p.nicheId);
    const tr = niche.testRun;
    if (!tr || tr.status !== "done") fail("The Test Run has no results yet.");
    const item = tr.items.find((i) => i.id === p.itemId);
    if (!item) fail("Test Run result not found.");
    if (p.label !== null && p.label !== "good" && p.label !== "bad") fail("Label a result good or bad.");
    item.label = p.label;
    tr.adjustments = computeAdjustments(state, niche);
    return { adjustments: tr.adjustments };
  },

  acceptAdjustments(state, p) {
    const niche = requireNiche(state, p.nicheId);
    requireOwnNicheOrOwner(state, niche);
    const tr = niche.testRun;
    if (!tr) fail("This Niche has no Test Run.");
    const me = requireRecruiter(state);
    let applied = 0;
    for (const id of p.adjustmentIds ?? []) {
      const a = tr.adjustments.find((x) => x.id === id && x.status === "proposed");
      if (!a) continue;
      applyAdjustment(state, niche, a);
      audit(state, me.name, "Accepted a Niche Profile adjustment", `${nicheLabel(niche)}: ${a.title}`, { kind: "niche", id: niche.id });
      applied++;
    }
    if (applied === 0) fail("These adjustments were already decided.");
    niche.profile.searchStrategy = searchStrategyFor(niche.profile);
    rescoreNiche(state, niche.id);
    return { applied };
  },

  dismissAdjustment(state, p) {
    const niche = requireNiche(state, p.nicheId);
    const a = niche.testRun?.adjustments.find((x) => x.id === p.adjustmentId);
    if (!a) fail("Adjustment not found.");
    a.status = "dismissed";
    return {};
  },

  activateNiche(state, p) {
    const ws = requireWorkspace(state);
    const niche = requireNiche(state, p.nicheId);
    requireOwnNicheOrOwner(state, niche);
    const me = requireRecruiter(state);
    if (ws.plan === "free_trial") fail("Buy Credits to switch the agents on: in the free trial agents never run on a schedule and people are Previews only.");
    if (!niche.setupComplete) fail("Finish the Niche setup first.");
    if (niche.status === "active") fail("This Niche is already active.");
    const wasPaused = niche.status === "paused";
    niche.status = "active";
    niche.activatedOn ??= state.clock.today;
    audit(state, me.name, wasPaused ? "Resumed a Niche" : "Activated a Niche", nicheLabel(niche), { kind: "niche", id: niche.id });
    return {};
  },

  pauseNiche(state, p) {
    const niche = requireNiche(state, p.nicheId);
    requireOwnNicheOrOwner(state, niche);
    const me = requireRecruiter(state);
    if (niche.status !== "active") fail("Only an active Niche can be paused.");
    niche.status = "paused";
    audit(state, me.name, "Paused a Niche", nicheLabel(niche), { kind: "niche", id: niche.id });
    return {};
  },

  deleteNiche(state, p) {
    const niche = requireNiche(state, p.nicheId);
    requireOwnNicheOrOwner(state, niche);
    const me = requireRecruiter(state);
    if (niche.status === "active") fail("Pause the agents first: they still run for this Niche.");
    const impact = nicheDeletionImpact(state, niche.id);
    if (impact.campaignsWithSends.length > 0) {
      const names = impact.campaignsWithSends.map((c) => `"${c.name}"`).join(", ");
      fail(`Campaigns of this Niche have sent emails (${names}). Their history stays for the audit trail, so this Niche cannot be deleted: pause its agents instead.`);
    }
    // An open Data Request is a legal hold on the people it concerns.
    const held = [
      ...impact.candidateIds.map((id) => ({ kind: "candidate" as const, id })),
      ...impact.hiringContactIds.map((id) => ({ kind: "hiring_contact" as const, id })),
    ]
      .map((ref) => openDataRequestFor(state, ref))
      .find((dr) => dr !== null);
    if (held) fail(`The open Data Request of ${held.personQuery} concerns people of this Niche: complete it before deleting the Niche.`);
    // Campaigns that never sent an email go with the Niche: recipients removed, Claims released.
    for (const c of impact.campaignsToDelete) {
      const recipients = state.recipients.filter((r) => r.campaignId === c.id);
      for (const r of recipients) {
        const person = getPerson(state, { kind: r.personKind, id: r.personId });
        if (person?.claim?.campaignId === c.id) person.claim = null;
        if (r.prospectId) {
          const prospect = state.prospects.find((x) => x.id === r.prospectId);
          if (prospect?.status === "in_campaign") prospect.status = "surfaced";
        }
      }
      state.recipients = state.recipients.filter((r) => r.campaignId !== c.id);
      state.campaigns = state.campaigns.filter((x) => x.id !== c.id);
      audit(state, me.name, "Deleted a Campaign with its Niche", `${c.name}: never sent an email, ${plural(recipients.length, "recipient")} removed and their Claims released`, null);
    }
    // People and companies found only for this Niche go with it; nothing is kept for them.
    for (const id of impact.candidateIds) deleteCandidate(state, id, null);
    for (const id of impact.hiringContactIds) deleteHiringContact(state, id, null);
    const goneProspects = new Set(impact.prospectIds);
    state.prospects = state.prospects.filter((x) => !goneProspects.has(x.id));
    state.detectedRoles = state.detectedRoles.filter((r) => !goneProspects.has(r.prospectId));
    for (const x of state.prospects) x.nicheIds = x.nicheIds.filter((n) => n !== niche.id);
    for (const c of state.candidates) c.nicheIds = c.nicheIds.filter((n) => n !== niche.id);
    state.previews = state.previews.filter((x) => x.nicheId !== niche.id);
    state.niches = state.niches.filter((n) => n.id !== niche.id);
    audit(
      state,
      me.name,
      "Deleted a Niche",
      `${nicheLabel(niche)}: ${plural(impact.prospectIds.length, "Prospect")}, ${plural(impact.hiringContactIds.length, "Hiring Contact")} (${impact.hiringContactsEnriched} Enriched), ${plural(impact.candidateIds.length, "Candidate")} (${impact.candidatesEnriched} Enriched)`,
      null,
    );
    return {};
  },
};
