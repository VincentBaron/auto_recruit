// Simulation engine of the dummy backend: wall-clock animation of agent runs (Test Runs, role
// sourcing, assisted setup), and the simulated day (agent runs, retention, sending within caps,
// scripted replies with their automatic effects, mailbox ramps, Claim expiry, the Digest).

import { addDays, diffDays, isOnOrBefore, isWeekend, maxDate, nextSendingDay, weekdayOf } from "@/lib/dates";
import { formatCreditsLabel, formatDate, formatNumber, plural, truncateHash } from "@/lib/format";
import { PRICES } from "@/lib/pricing";
import { DIGEST_MIN_SIGNAL_STRENGTH, nicheLabel, PROVIDER_LABELS, REPLY_CATEGORY_LABELS, RETENTION, SENDING_LIMITS } from "@/lib/labels";
import { openDataRequestFor } from "@/lib/retention";
import type {
  AgentJob,
  AgentRun,
  AgentStep,
  AppState,
  AutomaticEffect,
  CampaignSendingBlock,
  Candidate,
  Digest,
  DigestDataRequestLine,
  DigestReplyGroup,
  HiringContact,
  ISODate,
  Message,
  Niche,
  ProfileAdjustment,
  Prospect,
  Recipient,
  Reply,
  ReplyCategory,
  SendingBlockReason,
  SendingMailbox,
  TestRunItem,
  Weekday,
} from "@/lib/types";
import { REPLY_CATEGORIES } from "@/lib/types";
import { consentLinkLine, consentToken, consentUrl, draftMessage, draftResponse, replyBody, replySubject, suggestedNextStep, type ReplyContext } from "./drafts";
import {
  type CandidateSeed,
  type ProspectSeed,
  createCandidate,
  createCandidatePreview,
  createHiringContact,
  createHiringContactPreview,
  createProspect,
  ensureDetectedRoleForSignal,
  findContactValue,
  generateCandidateSeed,
  generateHiringContactSeeds,
  generateProspectSeed,
  languageFor,
  personName,
  prospectSignal,
} from "./generate";
import {
  ActionError,
  audit,
  canSpend,
  deleteCandidate,
  deleteObjectingCandidate,
  fail,
  getPerson,
  isSuppressed,
  notify,
  NOTICE_LINKS,
  recruiterName,
  spend,
  suppress,
  touchClaim,
  usableEmail,
} from "./helpers";
import { hashString, rngFor, unit } from "./rng";
import { holder, newId } from "./runtime";
import { rescoreAll, rescoreNiche, rescoreProspect, roleMatch } from "./scoring";

/* ------------------------------------------------------------------ */
/* Ramps and caps                                                      */
/* ------------------------------------------------------------------ */

/** Ramp from 5 a day on day 1 to 30 a day from about day 21 (ADR-0017). */
export function rampCap(rampDay: number): number {
  const { rampStartPerDay, perMailboxPerDay, rampDays } = SENDING_LIMITS;
  if (rampDay >= rampDays) return perMailboxPerDay;
  return Math.min(perMailboxPerDay, Math.round(rampStartPerDay + ((perMailboxPerDay - rampStartPerDay) * (Math.max(1, rampDay) - 1)) / (rampDays - 1)));
}

function domainSentToday(state: AppState, domain: string): number {
  return state.mailboxes.filter((m) => m.domain === domain).reduce((s, m) => s + m.sentToday, 0);
}

/**
 * The day an email scheduled now leaves. A day's sending pass runs when the simulated day starts, so
 * anything scheduled during today leaves on the next sending day after today, and never before
 * `earliest` (the recipient's own next send date, for example after an Out of Office).
 */
export function nextSendingPass(state: AppState, days: Weekday[], earliest?: ISODate | null): ISODate {
  const tomorrow = addDays(state.clock.today, 1);
  return nextSendingDay(earliest ? maxDate(earliest, tomorrow) : tomorrow, days);
}

/* ------------------------------------------------------------------ */
/* Wall-clock animations                                               */
/* ------------------------------------------------------------------ */

export const TEST_RUN_STEPS = ["Searching with Exa", "Extracting Signals", "Judging Fit", "Scoring", "Finding Hiring Contacts"];
export const TEST_RUN_STEP_MS = 1200;
export const ROLE_SOURCING_STEPS = ["Searching with Exa", "Extracting Signals", "Judging Fit", "Scoring"];

export function initialSteps(labels: string[]): AgentStep[] {
  return labels.map((label, i) => ({ key: `s${i}`, label, status: i === 0 ? "running" : "pending", detail: null }));
}

function animateSteps(steps: AgentStep[], elapsed: number, stepMs: number, details: string[]): number {
  const idx = Math.min(steps.length, Math.floor(elapsed / stepMs));
  steps.forEach((s, i) => {
    s.status = i < idx ? "done" : i === idx ? "running" : "pending";
    s.detail = i < idx ? details[i] ?? null : null;
  });
  return idx;
}

/** Advances every running animation. Returns true when something changed. */
export function tick(state: AppState, nowMs: number): boolean {
  let changed = false;
  for (const niche of state.niches) {
    const tr = niche.testRun;
    if (!tr || tr.status !== "running") continue;
    const elapsed = nowMs - tr.startedAtMs;
    const details = [
      `${plural(tr.stats.searched, "company", "companies")} looked at`,
      `${plural(tr.stats.signalsExtracted, "Signal")} extracted`,
      `${formatNumber(tr.stats.aboveThreshold)} above the Fit threshold`,
      "Signal Strength computed with your weights",
      `${plural(tr.stats.hiringContactsFound, "Hiring Contact")} found`,
    ];
    const step = animateSteps(tr.steps, elapsed, TEST_RUN_STEP_MS, details);
    const progress = Math.min(1, elapsed / (TEST_RUN_STEP_MS * TEST_RUN_STEPS.length));
    if (step !== tr.step || progress !== tr.progress) changed = true;
    tr.step = step;
    tr.progress = progress;
    if (elapsed >= TEST_RUN_STEP_MS * TEST_RUN_STEPS.length) {
      completeTestRun(state, niche);
      changed = true;
    }
  }
  for (const job of state.jobs) {
    if (job.status !== "running") continue;
    const elapsed = nowMs - job.startedAtMs;
    const stepMs = job.durationMs / job.steps.length;
    animateSteps(job.steps, elapsed, stepMs, job.steps.map(() => "Done"));
    job.progress = Math.min(1, elapsed / job.durationMs);
    changed = true;
    if (elapsed >= job.durationMs) completeJob(state, job);
  }
  for (const setup of state.assistedSetups) {
    if (setup.status !== "running") continue;
    const elapsed = nowMs - setup.startedAtMs;
    animateSteps(setup.steps, elapsed, 1500, ["Registered", "SPF, DKIM and DMARC published", `${plural(setup.mailboxAddresses.length, "mailbox", "mailboxes")} created`, "Ramp-up started at 5 emails a day"]);
    setup.progress = Math.min(1, elapsed / 6000);
    changed = true;
    if (elapsed >= 6000) completeAssistedSetup(state, setup.id);
  }
  return changed;
}

/* ------------------------------------------------------------------ */
/* Test Run                                                            */
/* ------------------------------------------------------------------ */

function discardProspect(state: AppState, p: Prospect): void {
  state.prospects = state.prospects.filter((x) => x.id !== p.id);
  state.detectedRoles = state.detectedRoles.filter((r) => r.prospectId !== p.id);
}

/** At most this many Prospects and this many Candidates are kept by a Test Run. */
export const TEST_RUN_SHOWN = 10;
/** A Test Run looks at more companies when its first batch has fewer than 10 above the Fit threshold, up to this many. */
const TEST_RUN_MAX_SEARCHED = 120;

/** What a Test Run keeps, decided at launch (server only, like Preview seeds): best Signal Strength first. */
interface TestRunPlan {
  prospects: ProspectSeed[];
  candidates: CandidateSeed[];
}

function testRunPlanKey(testRunId: string): string {
  return `testrun:${testRunId}`;
}

/**
 * Looks at `searched` companies and a pool of people for the Niche, scores each one with throwaway
 * records (nothing is stored), and keeps the seeds of the top 10 above the Fit threshold by Signal
 * Strength, for Prospects and for Candidates.
 */
function planTestRun(state: AppState, niche: Niche, testRunId: string): { stats: NonNullable<Niche["testRun"]>["stats"]; plan: TestRunPlan } {
  const rng = rngFor("testrun-plan", niche.id, testRunId);
  // A Test Run searches wide: a realistic share of the companies looked at miss the Niche Profile, so
  // about a quarter to a half end above the Fit threshold, and still at least the 10 it shows.
  let searched = rng.int(48, 72);
  const peoplePool = rng.int(28, 40);
  let signals = 0;
  // Throwaway records stay in the state until the end, so generated names never repeat.
  const prospects: { seed: ProspectSeed; prospect: Prospect }[] = [];
  const lookAt = () => {
    const seed = generateProspectSeed(state, niche, rng, { breadth: "wide" });
    prospects.push({ seed, prospect: createProspect(state, niche.id, seed, state.clock.today) });
  };
  for (let i = 0; i < searched; i++) lookAt();
  // The search goes on until it has the 10 Prospects it shows (within a limit).
  while (prospects.filter((x) => x.prospect.fit.aboveThreshold).length < TEST_RUN_SHOWN && searched < TEST_RUN_MAX_SEARCHED) {
    lookAt();
    searched++;
  }
  const candidates: { seed: CandidateSeed; candidate: Candidate }[] = [];
  for (let i = 0; i < peoplePool; i++) {
    const seed = generateCandidateSeed(state, niche, rng);
    candidates.push({ seed, candidate: createCandidate(state, niche.id, seed, state.clock.today) });
  }
  for (const x of prospects) signals += x.prospect.signals.length;
  for (const x of candidates) signals += x.candidate.signals.length;
  const aboveP = prospects.filter((x) => x.prospect.fit.aboveThreshold).sort((a, b) => b.prospect.signalStrength - a.prospect.signalStrength);
  const aboveC = candidates.filter((x) => x.candidate.fit.aboveThreshold).sort((a, b) => b.candidate.signalStrength - a.candidate.signalStrength);
  for (const x of prospects) discardProspect(state, x.prospect);
  const throwaway = new Set(candidates.map((x) => x.candidate.id));
  state.candidates = state.candidates.filter((c) => !throwaway.has(c.id));
  return {
    stats: { searched, signalsExtracted: signals, aboveThreshold: aboveP.length, shown: Math.min(TEST_RUN_SHOWN, aboveP.length), hiringContactsFound: 0 },
    plan: { prospects: aboveP.slice(0, TEST_RUN_SHOWN).map((x) => x.seed), candidates: aboveC.slice(0, TEST_RUN_SHOWN).map((x) => x.seed) },
  };
}

/** Decides a Test Run's results at launch, so the live steps show the real counts. Returns its stats. */
export function prepareTestRun(state: AppState, niche: Niche, testRunId: string): NonNullable<Niche["testRun"]>["stats"] {
  const { stats, plan } = planTestRun(state, niche, testRunId);
  holder().previewSeeds[testRunPlanKey(testRunId)] = plan;
  return stats;
}

export function completeTestRun(state: AppState, niche: Niche): void {
  const tr = niche.testRun;
  if (!tr) return;
  const ws = state.workspace;
  const paid = ws?.plan === "paid";
  const seeds = holder().previewSeeds;
  const stored = seeds[testRunPlanKey(tr.id)] as TestRunPlan | undefined;
  const plan = stored ?? planTestRun(state, niche, tr.id).plan;
  delete seeds[testRunPlanKey(tr.id)];
  const rng = rngFor("testrun", niche.id, tr.id);
  let credits = 0;
  let hcFound = 0;
  let stopped: string | null = null;
  const ref = `Test Run - ${nicheLabel(niche)}`;

  // Prospects: shown in full, from shared company data (ADR-0018). Only those above the Fit threshold
  // now (the profile may have changed during the run) are stored and, for a paid run, charged.
  const prospects: Prospect[] = [];
  for (const seed of plan.prospects) {
    // A company surfaced meanwhile (another run) is not stored twice.
    if (state.prospects.some((x) => x.domain === seed.domain)) continue;
    const p = createProspect(state, niche.id, seed, state.clock.today);
    if (!p.fit.aboveThreshold) {
      discardProspect(state, p);
      continue;
    }
    if (!tr.free) {
      if (!canSpend(state, PRICES.surfacedProspect)) {
        discardProspect(state, p);
        stopped = "Credits ran out";
        break;
      }
      spend(state, PRICES.surfacedProspect, "surfaced_prospect", ref, { nicheId: niche.id });
      credits += PRICES.surfacedProspect;
    }
    prospects.push(p);
  }
  prospects.sort((a, b) => b.signalStrength - a.signalStrength);
  const items: TestRunItem[] = [];
  for (const p of prospects) {
    items.push({ id: newId("ti"), kind: "prospect", prospectId: p.id, candidateId: null, previewId: null, label: null });
    for (const s of generateHiringContactSeeds(state, niche, p, rng.int(1, 2), rng)) {
      if (paid) {
        if (!canSpend(state, PRICES.hiringContactFound)) {
          stopped ??= "Credits ran out";
          break;
        }
        spend(state, PRICES.hiringContactFound, "hiring_contact_found", ref, { nicheId: niche.id });
        credits += PRICES.hiringContactFound;
        createHiringContact(state, p, s, state.clock.today);
      } else {
        createHiringContactPreview(state, niche, p, s);
      }
      hcFound++;
    }
  }

  // Candidates: Previews in the free trial, stored people once Credits were bought. Same rule: only
  // above the Fit threshold, best Signal Strength first.
  const people: { item: TestRunItem; strength: number }[] = [];
  for (const seed of plan.candidates) {
    if (paid) {
      if (!canSpend(state, PRICES.surfacedCandidate)) {
        stopped ??= "Credits ran out";
        break;
      }
      if (state.candidates.some((x) => x.name === seed.name) || state.hiringContacts.some((x) => x.name === seed.name)) {
        seed.name = personName(state, rngFor("testrun-rename", tr.id, seed.name), seed.language);
      }
      const c = createCandidate(state, niche.id, seed, state.clock.today);
      if (!c.fit.aboveThreshold) {
        state.candidates = state.candidates.filter((x) => x.id !== c.id);
        continue;
      }
      spend(state, PRICES.surfacedCandidate, "surfaced_candidate", ref, { nicheId: niche.id });
      credits += PRICES.surfacedCandidate;
      people.push({ item: { id: newId("ti"), kind: "candidate", prospectId: null, candidateId: c.id, previewId: null, label: null }, strength: c.signalStrength });
    } else {
      const pv = createCandidatePreview(state, niche, rng, null, undefined, seed);
      if (!pv) continue;
      people.push({ item: { id: newId("ti"), kind: "candidate", prospectId: null, candidateId: null, previewId: pv.id, label: null }, strength: pv.signalStrength });
    }
  }
  people.sort((a, b) => b.strength - a.strength);
  items.push(...people.map((x) => x.item));

  tr.items = items;
  tr.status = "done";
  tr.step = TEST_RUN_STEPS.length;
  tr.progress = 1;
  tr.completedOn = state.clock.today;
  tr.creditsCharged = credits;
  tr.stats.shown = prospects.length;
  tr.stats.hiringContactsFound = hcFound;
  tr.steps.forEach((s) => (s.status = "done"));
  if (niche.status === "draft") niche.status = "testing";
  niche.lastRunOn = state.clock.today;
  state.agentRuns.push({
    id: newId("run"),
    nicheId: niche.id,
    on: state.clock.today,
    kind: "test_run",
    prospectsSurfaced: prospects.length,
    candidatesSurfaced: people.length,
    hiringContactsFound: hcFound,
    newSignals: 0,
    belowThreshold: Math.max(0, tr.stats.searched - tr.stats.aboveThreshold),
    creditsSpent: credits,
    stoppedReason: stopped,
  });
  if (stopped) notify(state, "danger", `Credits ran out: the Test Run of "${nicheLabel(niche)}" stopped after ${plural(items.length, "result")}.`, NOTICE_LINKS.buyCredits);
  audit(state, "Prospection Agent", "Test Run completed", `${nicheLabel(niche)}: ${plural(prospects.length, "Prospect")} and ${plural(people.length, "Candidate")} shown, ${tr.stats.aboveThreshold} of ${plural(tr.stats.searched, "company", "companies")} above the Fit threshold${tr.free ? " (free)" : ""}`, { kind: "niche", id: niche.id });
}

/** Proposed Niche Profile adjustments from the good / bad labels of the Test Run. */
export function computeAdjustments(state: AppState, niche: Niche): ProfileAdjustment[] {
  const tr = niche.testRun;
  if (!tr) return [];
  const previous = new Map(tr.adjustments.map((a) => [a.id, a]));
  const labelled = tr.items.filter((i) => i.label !== null);
  const keepDecided = tr.adjustments.filter((a) => a.status !== "proposed");
  if (labelled.length < 3) return keepDecided;
  const p = niche.profile;
  const out: ProfileAdjustment[] = [];
  const push = (a: Omit<ProfileAdjustment, "status">) => {
    const prev = previous.get(a.id);
    out.push({ ...a, status: prev?.status ?? "proposed" });
  };
  const prospectsOf = (label: "good" | "bad") =>
    tr.items
      .filter((i) => i.kind === "prospect" && i.label === label)
      .map((i) => state.prospects.find((x) => x.id === i.prospectId))
      .filter((x): x is Prospect => Boolean(x));
  const good = prospectsOf("good");
  const bad = prospectsOf("bad");
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  if (bad.length > 0) {
    const badBig = bad.filter((b) => b.headcount > p.companySize.max * 0.8 || b.headcount > (good.length ? Math.max(...good.map((g) => g.headcount)) : p.companySize.max));
    if (badBig.length > 0 && (good.length === 0 || avg(bad.map((b) => b.headcount)) > avg(good.map((g) => g.headcount)) * 1.2)) {
      const newMax = Math.max(p.companySize.min + 20, Math.ceil((good.length ? Math.max(...good.map((g) => g.headcount)) * 1.1 : p.companySize.max * 0.7) / 10) * 10);
      if (newMax < p.companySize.max)
        push({
          id: `adj_size_${newMax}`,
          title: `Lower the maximum company size to ${newMax}`,
          rationale: `${badBig.length} of the Prospects you marked bad have more than ${newMax} people.`,
          from: `${p.companySize.min}-${p.companySize.max} people`,
          to: `${p.companySize.min}-${newMax} people`,
          change: { kind: "company_size", min: p.companySize.min, max: newMax },
        });
    }
    const badLocations = Array.from(new Set(bad.map((b) => b.location.split(",")[0].trim())));
    const goodLocations = new Set(good.map((g) => g.location.split(",")[0].trim()));
    const toRemove = p.locations.find((l) => badLocations.includes(l) && !goodLocations.has(l) && p.locations.length > 1);
    if (toRemove)
      push({
        id: `adj_loc_${toRemove}`,
        title: `Remove ${toRemove} from the locations`,
        rationale: `Every Prospect you marked bad in ${toRemove} was a miss.`,
        from: p.locations.join(", "),
        to: p.locations.filter((l) => l !== toRemove).join(", "),
        change: { kind: "remove_location", value: toRemove },
      });
  }
  const share = (ps: Prospect[], type: string) => (ps.length ? ps.filter((x) => x.signals.some((s) => s.type === type)).length / ps.length : 0);
  for (const type of ["funding_round", "job_posting", "new_leader"] as const) {
    const w = p.signalWeights.find((x) => x.type === type);
    if (!w) continue;
    if (good.length >= 2 && share(good, type) - share(bad, type) >= 0.34 && w.weight < 60) {
      push({
        id: `adj_w_${type}_${w.weight + 10}`,
        title: `Increase the weight of "${w.label}" to ${w.weight + 10}`,
        rationale: `${Math.round(share(good, type) * 100)}% of the Prospects you marked good have this Signal, against ${Math.round(share(bad, type) * 100)}% of the bad ones.`,
        from: `${w.weight} points`,
        to: `${w.weight + 10} points`,
        change: { kind: "signal_weight", signalType: type, weight: w.weight + 10 },
      });
      break;
    }
  }
  // Candidates, stored or still Previews (free trial): their title, seniority and location.
  const peopleOf = (label: "good" | "bad") =>
    tr.items
      .filter((i) => i.kind === "candidate" && i.label === label)
      .map((i) => {
        if (i.candidateId) {
          const c = state.candidates.find((x) => x.id === i.candidateId);
          return c ? { label: c.name, title: c.currentTitle, seniority: c.seniority, location: c.location } : null;
        }
        const pv = state.previews.find((x) => x.id === i.previewId);
        return pv ? { label: `the ${pv.title} in ${pv.location.split(",")[0]}`, title: pv.title, seniority: pv.seniority, location: pv.location } : null;
      })
      .filter((x): x is { label: string; title: string; seniority: string; location: string } => x !== null);
  const goodPeople = peopleOf("good");
  const badPeople = peopleOf("bad");
  const offRole = goodPeople.find((c) => roleMatch(c.title, p.roleTypes) !== "yes");
  if (offRole) {
    const core = offRole.title.replace(/^(Senior|Staff|Lead|Principal)\s+/, "").replace(/\s*[(-].*$/, "").trim();
    if (core && !p.roleTypes.includes(core))
      push({
        id: `adj_role_${core}`,
        title: `Add "${core}" to the role types`,
        rationale: `You marked ${offRole.label} good although the title is not in your role types.`,
        from: p.roleTypes.join(", "),
        to: [...p.roleTypes, core].join(", "),
        change: { kind: "add_role_type", value: core },
      });
  }
  const offSeniority = goodPeople.find((c) => p.seniority.length > 0 && !p.seniority.includes(c.seniority) && c.seniority !== "Head");
  if (offSeniority)
    push({
      id: `adj_sen_${offSeniority.seniority}`,
      title: `Add "${offSeniority.seniority}" to the seniority`,
      rationale: `You marked ${offSeniority.label} good although "${offSeniority.seniority}" is not in your seniority.`,
      from: p.seniority.join(", "),
      to: [...p.seniority, offSeniority.seniority].join(", "),
      change: { kind: "add_seniority", value: offSeniority.seniority },
    });
  if (!out.some((a) => a.change.kind === "remove_location") && badPeople.length > 0 && p.locations.length > 1) {
    const goodCities = new Set([...good.map((g) => g.location.split(",")[0].trim()), ...goodPeople.map((g) => g.location.split(",")[0].trim())]);
    const badCities = badPeople.map((b) => b.location.split(",")[0].trim());
    const toRemove = p.locations.find((l) => badCities.includes(l) && !goodCities.has(l));
    if (toRemove)
      push({
        id: `adj_loc_${toRemove}`,
        title: `Remove ${toRemove} from the locations`,
        rationale: `The Candidates you marked bad in ${toRemove} were misses, and none you marked good is there.`,
        from: p.locations.join(", "),
        to: p.locations.filter((l) => l !== toRemove).join(", "),
        change: { kind: "remove_location", value: toRemove },
      });
  }
  const badCount = labelled.filter((i) => i.label === "bad").length;
  if (out.length === 0 && badCount > 0 && p.fitThreshold <= 90) {
    push({
      id: `adj_fit_${p.fitThreshold + 5}`,
      title: `Raise the Fit threshold to ${p.fitThreshold + 5}`,
      rationale: `${badCount} of the ${labelled.length} results you labelled were bad and most were close to the threshold.`,
      from: String(p.fitThreshold),
      to: String(p.fitThreshold + 5),
      change: { kind: "fit_threshold", value: p.fitThreshold + 5 },
    });
  }
  for (const d of keepDecided) if (!out.some((o) => o.id === d.id)) out.push(d);
  return out;
}

export function applyAdjustment(state: AppState, niche: Niche, a: ProfileAdjustment): void {
  const p = niche.profile;
  const ch = a.change;
  switch (ch.kind) {
    case "company_size":
      p.companySize = { min: ch.min, max: ch.max };
      break;
    case "signal_weight": {
      const w = p.signalWeights.find((x) => x.type === ch.signalType);
      if (w) w.weight = ch.weight;
      break;
    }
    case "enable_signal": {
      const w = p.signalWeights.find((x) => x.type === ch.signalType);
      if (w) w.enabled = ch.enabled;
      break;
    }
    case "fit_threshold":
      p.fitThreshold = ch.value;
      break;
    case "add_role_type":
      if (!p.roleTypes.includes(ch.value)) p.roleTypes.push(ch.value);
      break;
    case "remove_location":
      p.locations = p.locations.filter((l) => l !== ch.value);
      break;
    case "add_seniority":
      if (!p.seniority.includes(ch.value)) p.seniority.push(ch.value);
      break;
  }
  a.status = "accepted";
  rescoreNiche(state, niche.id);
}

/* ------------------------------------------------------------------ */
/* Jobs: sourcing for a Detected Role, assisted setup                  */
/* ------------------------------------------------------------------ */

export function startRoleSourcing(state: AppState, roleId: string, nowMs: number): AgentJob {
  const role = state.detectedRoles.find((r) => r.id === roleId);
  if (!role) fail("Detected Role not found.");
  const job: AgentJob = {
    id: newId("job"),
    kind: "role_sourcing",
    targetId: roleId,
    label: `Sourcing Candidates for ${role.title}`,
    startedAtMs: nowMs,
    durationMs: 4000,
    steps: initialSteps(ROLE_SOURCING_STEPS),
    progress: 0,
    status: "running",
    result: null,
  };
  state.jobs.push(job);
  role.sourcing = { status: "running", jobId: job.id, lastSourcedOn: role.sourcing.lastSourcedOn };
  return job;
}

function completeJob(state: AppState, job: AgentJob): void {
  job.status = "done";
  job.progress = 1;
  job.steps.forEach((s) => (s.status = "done"));
  if (job.kind !== "role_sourcing") return;
  const role = state.detectedRoles.find((r) => r.id === job.targetId);
  if (!role) return;
  const prospect = state.prospects.find((p) => p.id === role.prospectId);
  const niche = state.niches.find((n) => prospect?.nicheIds.includes(n.id));
  if (!prospect || !niche) return;
  const rng = rngFor("role-sourcing", role.id, state.clock.today, job.id);
  const paid = state.workspace?.plan === "paid";
  const count = rng.int(4, 6);
  let surfaced = 0;
  let credits = 0;
  let stopped: string | null = null;
  const ref = `Sourcing Agent - ${role.title} at ${prospect.name}`;
  for (let i = 0; i < count; i++) {
    if (paid) {
      if (!canSpend(state, PRICES.surfacedCandidate)) {
        stopped = "Credits ran out";
        notify(state, "danger", `Credits ran out: the Sourcing Agent stopped after ${plural(surfaced, "Candidate")} for ${role.title}.`, NOTICE_LINKS.buyCredits);
        break;
      }
      const seed = generateCandidateSeed(state, niche, rng, { roleTitle: role.title, location: rng.chance(0.7) ? prospect.location : undefined });
      const c = createCandidate(state, niche.id, seed, state.clock.today, role.id);
      if (!c.fit.aboveThreshold) {
        state.candidates = state.candidates.filter((x) => x.id !== c.id);
        continue;
      }
      spend(state, PRICES.surfacedCandidate, "surfaced_candidate", ref, { nicheId: niche.id });
      credits += PRICES.surfacedCandidate;
      role.sourcedCandidateIds.push(c.id);
    } else {
      // Previews follow the same rule: only people above the Fit threshold.
      const pv = createCandidatePreview(state, niche, rng, role.id, role.title);
      if (!pv) continue;
      role.sourcedPreviewIds.push(pv.id);
    }
    surfaced++;
  }
  role.sourcing = { status: "done", jobId: job.id, lastSourcedOn: state.clock.today };
  job.result = paid
    ? `${plural(surfaced, "Candidate")} Surfaced for ${role.title} (${formatCreditsLabel(credits)}).`
    : `${plural(surfaced, "Candidate Preview")} for ${role.title}. Buy Credits to reveal who they are.`;
  state.agentRuns.push({
    id: newId("run"),
    nicheId: niche.id,
    on: state.clock.today,
    kind: "role_sourcing",
    prospectsSurfaced: 0,
    candidatesSurfaced: surfaced,
    hiringContactsFound: 0,
    newSignals: 0,
    belowThreshold: stopped ? 0 : count - surfaced,
    creditsSpent: credits,
    stoppedReason: stopped,
  });
  audit(state, "Sourcing Agent", "Sourced Candidates for a Detected Role", `${role.title} at ${prospect.name}: ${plural(surfaced, "Candidate")}`, { kind: "prospect", id: prospect.id });
}

export function completeAssistedSetup(state: AppState, setupId: string): void {
  const setup = state.assistedSetups.find((s) => s.id === setupId);
  if (!setup || setup.status === "done") return;
  setup.status = "done";
  setup.progress = 1;
  setup.steps.forEach((s) => (s.status = "done"));
  const ws = state.workspace;
  if (!state.sendingDomains.some((d) => d.domain === setup.domain)) {
    state.sendingDomains.push({
      domain: setup.domain,
      registeredOn: state.clock.today,
      registeredFor: ws?.name ?? "Workspace",
      provider: setup.provider,
      assisted: true,
      dailyCap: SENDING_LIMITS.perDomainPerDay,
      sentToday: 0,
      dns: { spf: true, dkim: true, dmarc: true },
    });
  }
  for (const address of setup.mailboxAddresses) {
    const id = newId("mb");
    state.mailboxes.push({
      id,
      recruiterId: setup.recruiterId,
      address,
      displayName: recruiterName(state, setup.recruiterId),
      provider: setup.provider,
      domain: setup.domain,
      health: { spf: true, dkim: true, dmarc: true, domainAgeDays: 0, blocklisted: false, inboxPlacement: null },
      rampDay: 1,
      dailyCap: rampCap(1),
      sentToday: 0,
      sentTotal: 0,
      bouncesTotal: 0,
      bounceRate: 0,
      status: "warming",
      statusReason: "New mailbox: ramping up from 5 emails a day, measured with our seed mailboxes.",
      connectedOn: state.clock.today,
      setup: "assisted",
      alreadyWarmed: false,
    });
    setup.createdMailboxIds.push(id);
  }
  audit(state, recruiterName(state, setup.recruiterId), "Assisted setup completed", `${setup.domain}: ${setup.mailboxAddresses.join(", ")}`, null);
  notify(state, "success", `${setup.domain} is ready: ${plural(setup.mailboxAddresses.length, "Sending Mailbox", "Sending Mailboxes")} ramping up.`);
}

/* ------------------------------------------------------------------ */
/* Scheduled agent runs                                                */
/* ------------------------------------------------------------------ */

export function runNicheAgents(state: AppState, niche: Niche, kind: AgentRun["kind"]): string {
  const ws = state.workspace;
  if (!ws || ws.plan !== "paid") return `${nicheLabel(niche)}: skipped, the free trial does not run agents.`;
  const rng = rngFor("run", niche.id, state.clock.today, kind, state.agentRuns.length);
  const targetP = Math.min(niche.schedule.prospectsPerRun, rng.int(2, 5));
  const targetC = Math.min(niche.schedule.candidatesPerRun, rng.int(3, 7));
  const ref = `${kind === "manual" ? "Manual run" : "Scheduled run"} - ${nicheLabel(niche)}`;
  let prospects = 0;
  let candidates = 0;
  let contacts = 0;
  let below = 0;
  let credits = 0;
  let stopped: string | null = null;

  try {
    for (let attempt = 0; attempt < targetP * 3 && prospects < targetP; attempt++) {
      const seed = generateProspectSeed(state, niche, rng);
      const p = createProspect(state, niche.id, seed, state.clock.today);
      if (!p.fit.aboveThreshold) {
        discardProspect(state, p);
        below++;
        continue;
      }
      try {
        spend(state, PRICES.surfacedProspect, "surfaced_prospect", ref, { nicheId: niche.id });
      } catch (e) {
        discardProspect(state, p);
        throw e;
      }
      credits += PRICES.surfacedProspect;
      prospects++;
      for (const s of generateHiringContactSeeds(state, niche, p, rng.int(1, 3), rng)) {
        spend(state, PRICES.hiringContactFound, "hiring_contact_found", ref, { nicheId: niche.id });
        credits += PRICES.hiringContactFound;
        createHiringContact(state, p, s, state.clock.today);
        contacts++;
      }
    }
    for (let attempt = 0; attempt < targetC * 3 && candidates < targetC; attempt++) {
      const c = createCandidate(state, niche.id, generateCandidateSeed(state, niche, rng), state.clock.today);
      if (!c.fit.aboveThreshold) {
        state.candidates = state.candidates.filter((x) => x.id !== c.id);
        below++;
        continue;
      }
      try {
        spend(state, PRICES.surfacedCandidate, "surfaced_candidate", ref, { nicheId: niche.id });
      } catch (e) {
        state.candidates = state.candidates.filter((x) => x.id !== c.id);
        throw e;
      }
      credits += PRICES.surfacedCandidate;
      candidates++;
    }
  } catch (e) {
    if (!(e instanceof ActionError)) throw e;
    stopped = "Credits ran out";
    notify(state, "danger", `Credits ran out: the agents stopped for "${nicheLabel(niche)}" after ${plural(prospects, "Prospect")} and ${plural(candidates, "Candidate")}. Buy Credits or switch on auto top-up.`, NOTICE_LINKS.buyCredits);
    audit(state, "Prospection Agent", "Run stopped: Credits ran out", nicheLabel(niche), { kind: "niche", id: niche.id });
  }

  // New Signals on existing Prospects (company data, free).
  let newSignals = 0;
  const existing = state.prospects.filter((p) => p.nicheIds.includes(niche.id) && p.status !== "dismissed" && p.surfacedOn !== state.clock.today);
  for (const p of rng.sample(existing, rng.int(1, 2))) {
    const type = rng.pick(["job_posting", "headcount_growth", "new_leader", "expansion"] as const);
    const role = niche.profile.roleTypes[0] ?? "Engineer";
    const label =
      type === "job_posting"
        ? `Hiring a ${rng.pick(niche.profile.seniority.length ? niche.profile.seniority : ["Senior"])} ${role}`
        : type === "headcount_growth"
          ? `Headcount up ${rng.int(15, 40)}% in 6 months`
          : type === "new_leader"
            ? rng.pick(["New CTO joined", "New VP Engineering joined", "New Head of Product joined"])
            : `Opening an office in ${rng.pick(["Madrid", "Berlin", "Milan", "Amsterdam", "Lisbon"])}`;
    const signal = prospectSignal(state.clock.today, p, { type, ageDays: 0, label }, { roleTitle: label.replace(/^Hiring an? /, "") });
    p.signals.push(signal);
    // A job posting is the evidence of a Detected Role.
    if (type === "job_posting") ensureDetectedRoleForSignal(state, p, signal);
    p.hasNewSignal = true;
    rescoreProspect(state, p);
    newSignals++;
  }

  niche.lastRunOn = state.clock.today;
  state.agentRuns.push({
    id: newId("run"),
    nicheId: niche.id,
    on: state.clock.today,
    kind,
    prospectsSurfaced: prospects,
    candidatesSurfaced: candidates,
    hiringContactsFound: contacts,
    newSignals,
    belowThreshold: below,
    creditsSpent: credits,
    stoppedReason: stopped,
  });
  audit(state, "Prospection Agent", "Surfaced Prospects", `${nicheLabel(niche)}: ${plural(prospects, "Prospect")}, ${plural(contacts, "Hiring Contact")}, ${plural(newSignals, "new Signal")}`, { kind: "niche", id: niche.id });
  audit(state, "Sourcing Agent", "Surfaced Candidates", `${nicheLabel(niche)}: ${plural(candidates, "Candidate")}`, { kind: "niche", id: niche.id });
  return `${nicheLabel(niche)}: ${plural(prospects, "Prospect")}, ${plural(candidates, "Candidate")}, ${plural(contacts, "Hiring Contact")}, ${plural(newSignals, "new Signal")}, ${formatCreditsLabel(credits)}${stopped ? ` (stopped: ${stopped})` : ""}.`;
}

/* ------------------------------------------------------------------ */
/* Retention                                                           */
/* ------------------------------------------------------------------ */

function wasContacted(state: AppState, candidateId: string): boolean {
  return state.recipients.some((r) => r.personKind === "candidate" && r.personId === candidateId && r.messages.some((m) => m.status === "sent"));
}

export interface RetentionResult {
  /** Deleted under the 25-day rule: Surfaced and never Contacted. */
  surfaced: number;
  /** Deleted at the end of their retention after Contact (with or without Consent). */
  afterContact: number;
}

/**
 * Deletes never-Contacted Candidates on their deleteOn date (25 days), and every Candidate whose
 * retainUntil date has come: 90 days after the first email without Consent to the Talent Pool, or
 * the end of the consented retention. A Candidate matched by an open Data Request is on legal hold:
 * nothing is deleted until the request is answered.
 */
export function applyRetention(state: AppState): RetentionResult {
  const today = state.clock.today;
  const result: RetentionResult = { surfaced: 0, afterContact: 0 };
  for (const c of [...state.candidates]) {
    if (openDataRequestFor(state, { kind: "candidate", id: c.id })) continue;
    const neverContacted = (c.lifecycle === "surfaced" || c.lifecycle === "dismissed" || c.lifecycle === "enriched") && c.consent === null && !wasContacted(state, c.id);
    if (neverContacted && c.deleteOn && isOnOrBefore(c.deleteOn, today)) {
      deleteCandidate(state, c.id, null);
      audit(state, "System", "Deleted under the 25-day retention rule", `A Candidate Surfaced on ${formatDate(c.surfacedOn)} and never Contacted (nothing kept)`, null);
      result.surfaced++;
    } else if (c.retainUntil && isOnOrBefore(c.retainUntil, today)) {
      // Nothing kept: a Candidate who opted out was deleted at once, with their hash on the Suppression List.
      deleteCandidate(state, c.id, null);
      if (c.consent === null) {
        audit(state, "System", "Deleted at the end of retention", `A Candidate Contacted on ${formatDate(c.article14NoticeSentOn)} without Consent to the Talent Pool (nothing kept)`, null);
      } else {
        audit(state, "System", "Deleted at the end of the consented retention", `A Candidate who consented on ${formatDate(c.consentRecordedOn)} (nothing kept)`, null);
      }
      result.afterContact++;
    }
  }
  return result;
}

/** Flash and change-summary lines for a retention pass. */
export function retentionLines(r: RetentionResult): string[] {
  const lines: string[] = [];
  if (r.surfaced > 0) lines.push(`${plural(r.surfaced, "Candidate")} deleted under the 25-day retention rule.`);
  if (r.afterContact > 0) lines.push(`${plural(r.afterContact, "Candidate")} deleted at the end of their retention after Contact.`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

export function prospectHasReply(state: AppState, prospectId: string | null): boolean {
  if (!prospectId) return false;
  return state.replies.some((r) => r.prospectId === prospectId && r.category !== "out_of_office" && r.category !== "bounce");
}

interface BlockedCounts {
  credits: number;
  /** Due emails with no Sending Mailbox at all: none left, or only removed or refused ones. */
  noMailbox: number;
  /**
   * Addresses of the Campaign's Sending Mailboxes when every one of them is paused (or otherwise not
   * sending), so nothing can be sent until one is resumed.
   */
  allPaused: string[];
  /** Follow-ups waiting for their paused mailbox while other mailboxes of the Campaign still send, per address. */
  paused: Map<string, number>;
  /** Follow-ups whose thread started from a Sending Mailbox removed or refused since: they cannot leave. */
  orphaned: number;
  caps: number;
}

function hasCapacity(state: AppState, m: { domain: string; sentToday: number; dailyCap: number }): boolean {
  return m.sentToday < m.dailyCap && domainSentToday(state, m.domain) < SENDING_LIMITS.perDomainPerDay;
}

function isSendingMailbox(m: { status: string } | undefined): boolean {
  return m !== undefined && (m.status === "active" || m.status === "warming");
}

function addUnique(list: string[], values: string[]): void {
  for (const v of values) if (!list.includes(v)) list.push(v);
}

/** The real reason due emails did not leave, most severe first; null when nothing was blocked. */
function sendingBlockOf(blocked: BlockedCounts): Omit<CampaignSendingBlock, "on"> | null {
  const parts: { reason: SendingBlockReason; text: string }[] = [];
  if (blocked.credits > 0) parts.push({ reason: "credits", text: `Credits ran out: ${plural(blocked.credits, "email")} not sent. Buy Credits or switch on auto top-up` });
  if (blocked.noMailbox > 0) parts.push({ reason: "no_mailbox", text: "No Sending Mailbox: nothing can be sent" });
  // A Campaign whose mailboxes are all paused still has mailboxes: it is not "No Sending Mailbox".
  if (blocked.allPaused.length > 0) {
    const list = blocked.allPaused.join(", ");
    parts.push({
      reason: "mailbox_paused",
      text:
        blocked.allPaused.length === 1
          ? `The Sending Mailbox of this Campaign is paused (${list}): nothing can be sent until it is resumed`
          : `All Sending Mailboxes of this Campaign are paused (${list}): nothing can be sent until one is resumed`,
    });
  }
  if (blocked.orphaned > 0) {
    parts.push({
      reason: "no_mailbox",
      text: `${plural(blocked.orphaned, "follow-up")} cannot leave: the Sending Mailbox that started ${blocked.orphaned === 1 ? "its" : "their"} thread was removed or refused`,
    });
  }
  for (const [address, n] of blocked.paused) {
    parts.push({ reason: "mailbox_paused", text: `${plural(n, "follow-up")} ${n === 1 ? "waits" : "wait"} for ${address}, paused: follow-ups stay on the mailbox that started the thread` });
  }
  if (blocked.caps > 0) {
    parts.push({ reason: "caps", text: `${plural(blocked.caps, "email")} ${blocked.caps === 1 ? "waits" : "wait"}: Sending Mailbox caps reached for today (30 per mailbox, 60 per domain, lower while ramping)` });
  }
  if (parts.length === 0) return null;
  const mailboxStop = blocked.noMailbox > 0 ? "none" : blocked.allPaused.length > 0 ? "all_paused" : null;
  return { reason: parts[0].reason, text: parts.map((x) => x.text).join("; "), mailboxStop };
}

/**
 * Sends due emails for every active Campaign, within mailbox and domain caps, on the Campaign's
 * sending days (weekdays only). Each Campaign records why due emails could not leave
 * (`sendingBlocked`), so a Campaign that cannot send never looks like it is sending.
 */
export function sendingPass(state: AppState): string[] {
  const today = state.clock.today;
  const lines: string[] = [];
  if (isWeekend(today)) return ["Weekend: no Campaign emails sent."];
  const day = weekdayOf(today);
  for (const campaign of state.campaigns) {
    if (campaign.status !== "active") {
      campaign.sendingBlocked = null;
      continue;
    }
    if (!campaign.sendingWindow.days.includes(day)) continue;
    let sent = 0;
    let creditsOut = false;
    const blocked: BlockedCounts = { credits: 0, noMailbox: 0, allPaused: [], paused: new Map(), orphaned: 0, caps: 0 };
    const mailboxOf = (id: string) => state.mailboxes.find((m) => m.id === id);
    const campaignMailboxes = campaign.mailboxIds.map(mailboxOf).filter((m): m is SendingMailbox => m !== undefined);
    // Paused (or otherwise not sending) but still there: resuming one lets the Campaign send again.
    const isHeldBack = (m: SendingMailbox) => !isSendingMailbox(m) && m.status !== "refused";
    const campaignCanSend = campaignMailboxes.some(isSendingMailbox);
    const recipients = state.recipients.filter((r) => r.campaignId === campaign.id).sort((a, b) => (a.addedOn < b.addedOn ? -1 : 1));
    for (const r of recipients) {
      if (r.state !== "scheduled" && r.state !== "sent") continue;
      if (r.pausedUntil && !isOnOrBefore(r.pausedUntil, addDays(today, -1))) continue;
      const msg = r.messages.find((m) => m.origin === "campaign" && m.status !== "sent");
      if (!msg || msg.status !== "approved") continue;
      if (r.nextSendOn && !isOnOrBefore(r.nextSendOn, today)) continue;
      const person = getPerson(state, { kind: r.personKind, id: r.personId });
      if (!person) continue;
      const email = usableEmail(person, r.personKind);
      if (!email) {
        r.state = "stopped";
        r.stopReason = "No valid email left";
        continue;
      }
      if (person.lifecycle === "suppressed" || isSuppressed(state, email.value)) {
        r.state = "stopped";
        r.stopReason = "On the Suppression List";
        continue;
      }
      if (r.personKind === "hiring_contact" && prospectHasReply(state, r.prospectId)) {
        r.state = "stopped";
        r.stopReason = "Someone at this Prospect replied: outreach to the Prospect stops";
        continue;
      }
      // Mailbox: follow-ups stay on the mailbox that started the thread; first emails may move to
      // another mailbox of the Campaign with capacity.
      const pinned = mailboxOf(r.mailboxId);
      let mb: SendingMailbox | undefined;
      if (msg.step > 1) {
        if (!pinned || pinned.status === "refused") {
          blocked.orphaned++;
          continue;
        }
        if (!isSendingMailbox(pinned)) {
          // Every mailbox of the Campaign is paused: nothing can be sent, not only this thread.
          if (!campaignCanSend) addUnique(blocked.allPaused, [...campaignMailboxes, pinned].filter(isHeldBack).map((m) => m.address));
          else blocked.paused.set(pinned.address, (blocked.paused.get(pinned.address) ?? 0) + 1);
          continue;
        }
        mb = hasCapacity(state, pinned) ? pinned : undefined;
      } else {
        const own = pinned ? [pinned] : [];
        const options = [...own, ...campaignMailboxes.filter((m) => m.id !== r.mailboxId)].filter(isSendingMailbox);
        if (options.length === 0) {
          // Mailboxes still there but all paused, or no mailbox at all (none, removed or refused).
          const heldBack = [...campaignMailboxes, ...own].filter(isHeldBack);
          if (heldBack.length > 0) addUnique(blocked.allPaused, heldBack.map((m) => m.address));
          else blocked.noMailbox++;
          continue;
        }
        mb = options.find((m) => hasCapacity(state, m));
      }
      if (!mb) {
        blocked.caps++;
        continue;
      }
      if (creditsOut || !canSpend(state, PRICES.emailSent)) {
        if (!creditsOut) notify(state, "danger", `Credits ran out: Campaign "${campaign.name}" stopped sending today.`, NOTICE_LINKS.buyCredits);
        creditsOut = true;
        blocked.credits++;
        continue;
      }
      spend(state, PRICES.emailSent, "email_sent", `Emails sent - ${campaign.name}`, { nicheId: campaign.nicheId });
      r.mailboxId = mb.id;
      mb.sentToday++;
      mb.sentTotal++;
      const domain = state.sendingDomains.find((d) => d.domain === mb.domain);
      if (domain) domain.sentToday++;
      msg.status = "sent";
      msg.sentOn = today;
      msg.footer.senderEmail = mb.address;
      r.toAddress = email.value;
      r.state = "sent";
      r.currentStep = msg.step;
      touchClaim(state, person.claim);
      if (person.lifecycle === "enriched" || person.lifecycle === "surfaced") person.lifecycle = "contacted";
      if (r.personKind === "candidate") {
        const c = person as Candidate;
        c.article14NoticeSentOn ??= today;
        c.deleteOn = null;
        c.retainUntil ??= addDays(today, RETENTION.contactedNoConsentDays);
      }
      const nextStep = campaign.sequence.find((st) => st.step === msg.step + 1);
      if (nextStep) {
        // One message per step: a re-sent email (after a bounce) never adds a second follow-up.
        if (!r.messages.some((m) => m.origin === "campaign" && m.step === nextStep.step)) {
          const follow = draftMessage(state, campaign, person, r.personKind, nextStep.step, mb.address);
          follow.status = campaign.autonomy === "review_all" ? "draft" : "approved";
          r.messages.push(follow);
        }
        r.nextSendOn = nextSendingDay(addDays(today, nextStep.delayDays), campaign.sendingWindow.days);
      } else {
        r.nextSendOn = null;
      }
      sent++;
      audit(state, "Outreach Agent", `Sent step ${msg.step}`, `${r.personLabel} from ${mb.address}`, { kind: r.personKind, id: r.personId });
    }
    const block = sendingBlockOf(blocked);
    const previous = campaign.sendingBlocked;
    campaign.sendingBlocked = block ? { on: today, ...block } : null;
    // Once when the Campaign enters "nothing can be sent" (or its cause changes), never every day.
    if (block?.mailboxStop && block.mailboxStop !== previous?.mailboxStop) {
      if (block.mailboxStop === "none") {
        notify(state, "warning", `Campaign "${campaign.name}" cannot send: it has no Sending Mailbox.`, { label: "Open the Campaign", href: `/campaigns/${campaign.id}` });
      } else {
        const one = blocked.allPaused.length === 1;
        notify(state, "warning", `Campaign "${campaign.name}" cannot send: ${one ? "its Sending Mailbox is paused" : "its Sending Mailboxes are paused"}.`, NOTICE_LINKS.mailboxes);
      }
    }
    if (sent > 0) lines.push(`${campaign.name}: ${plural(sent, "email")} sent.`);
    if (block) lines.push(`${campaign.name}: ${block.text}.`);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Replies                                                             */
/* ------------------------------------------------------------------ */

const CANDIDATE_REPLY_PLAN: ReplyCategory[] = ["interested", "not_interested", "opt_out", "interested", "not_now", "out_of_office", "bounce"];
const HIRING_CONTACT_REPLY_PLAN: ReplyCategory[] = ["interested", "not_now", "not_interested", "opt_out", "out_of_office", "referral", "bounce", "interested"];

function replyPlan(r: Recipient): { category: ReplyCategory; afterDays: number } | null {
  if (unit("reply", r.id) > 0.42) return null;
  const plan = r.personKind === "candidate" ? CANDIDATE_REPLY_PLAN : HIRING_CONTACT_REPLY_PLAN;
  const category = plan[hashString(`cat|${r.id}`) % plan.length];
  return { category, afterDays: category === "bounce" ? 0 : 1 + (hashString(`d|${r.id}`) % 4) };
}

export function generateReplies(state: AppState): string[] {
  const lines: string[] = [];
  for (const r of [...state.recipients]) {
    if (r.state !== "sent") continue;
    if (state.replies.some((x) => x.recipientId === r.id)) continue;
    const first = r.messages.find((m) => m.origin === "campaign" && m.status === "sent");
    if (!first?.sentOn) continue;
    const plan = replyPlan(r);
    if (!plan) continue;
    if (diffDays(state.clock.today, first.sentOn) < plan.afterDays) continue;
    const reply = applyReply(state, r, plan.category);
    // After the reply's effects: a Candidate who opted out is already "Deleted Candidate".
    lines.push(`Reply from ${reply.personLabel}: ${REPLY_CATEGORY_LABELS[reply.category]}.`);
  }
  return lines;
}

/** The day a Sequence paused by an Out of Office resumes: the first sending day after the return date. */
export function resumeDateAfter(state: AppState, r: Recipient, until: string): string {
  const campaign = state.campaigns.find((c) => c.id === r.campaignId);
  return nextSendingDay(addDays(until, 1), campaign?.sendingWindow.days ?? ["mon", "tue", "wed", "thu", "fri"]);
}

function replyContext(state: AppState, r: Recipient, person: HiringContact | Candidate | undefined, outOfOfficeUntil: string, referral: ReplyContext["referral"]): ReplyContext {
  const campaign = state.campaigns.find((c) => c.id === r.campaignId);
  const prospect = r.prospectId ? state.prospects.find((p) => p.id === r.prospectId) : undefined;
  return {
    personName: person?.name ?? r.personLabel,
    personKind: r.personKind,
    language: person?.language ?? "en",
    senderName: recruiterName(state, campaign?.ownerId),
    company: prospect?.name ?? null,
    address: r.toAddress,
    today: state.clock.today,
    outOfOfficeUntil,
    resumeOn: resumeDateAfter(state, r, outOfOfficeUntil),
    referral,
    variantKey: r.id,
  };
}

function stopColleagues(state: AppState, r: Recipient, reason: string): number {
  if (r.personKind !== "hiring_contact" || !r.prospectId) return 0;
  let n = 0;
  for (const other of state.recipients) {
    if (other.id === r.id || other.prospectId !== r.prospectId) continue;
    if (other.state === "awaiting_review" || other.state === "scheduled" || other.state === "sent") {
      other.state = "stopped";
      other.stopReason = reason;
      n++;
    }
  }
  return n;
}

/**
 * An Opt-out or Not Interested reply from a Candidate deletes their data immediately, through the same
 * path as "Delete my data" on the Consent Page: only the hash stays on the Suppression List (ADR-0019).
 * A reply recategorized after the deletion deletes nothing more.
 */
function deleteCandidateAfterObjection(
  state: AppState,
  reply: Reply,
  reason: "opt_out" | "not_interested",
  effect: (kind: AutomaticEffect["kind"], description: string) => void,
): void {
  const hash = deleteObjectingCandidate(state, reply.personId, reason);
  reply.personLabel = "Deleted Candidate";
  if (hash) {
    effect("candidate_deleted", `Candidate data deleted immediately; only the hash (${truncateHash(hash)}) stays on the Suppression List, so no Workspace contacts them again.`);
  } else if (!reply.effects.some((e) => e.kind === "candidate_deleted")) {
    effect("candidate_deleted", "The Candidate's data was already deleted: nothing about them is stored.");
  }
}

/** Applies the automatic effects of a Reply Category. Used for new replies and recategorization. */
export function applyCategoryEffects(state: AppState, reply: Reply, r: Recipient): void {
  const today = state.clock.today;
  const person = getPerson(state, { kind: r.personKind, id: r.personId });
  const prospect = r.prospectId ? state.prospects.find((p) => p.id === r.prospectId) : undefined;
  const effects: AutomaticEffect[] = [];
  const effect = (kind: AutomaticEffect["kind"], description: string) => effects.push({ kind, description, on: today });
  const realReply = reply.category !== "out_of_office" && reply.category !== "bounce";
  // Categories whose suggested next step is "Nothing to do" leave "Needs action" right away.
  if (reply.category === "opt_out" || reply.category === "not_interested" || reply.category === "out_of_office" || reply.category === "bounce") reply.handled = true;

  if (realReply) {
    r.state = "replied";
    r.nextSendOn = null;
    r.pausedUntil = null;
    if (person && person.lifecycle !== "consented" && person.lifecycle !== "suppressed") person.lifecycle = "replied";
    if (prospect && prospect.status !== "closed") prospect.status = "replied";
    const stopped = stopColleagues(state, r, `${reply.personLabel} at ${prospect?.name ?? "this Prospect"} replied: outreach to the Prospect stops`);
    if (stopped > 0) effect("outreach_stopped", `Outreach to ${stopped} other ${stopped === 1 ? "person" : "people"} at ${prospect?.name} stopped: a reply from anyone at a Prospect stops all outreach to it.`);
    if (person) touchClaim(state, person.claim);
  }

  let bounceFound: { provider: string } | null = null;
  switch (reply.category) {
    case "opt_out": {
      if (r.personKind === "candidate") {
        deleteCandidateAfterObjection(state, reply, "opt_out", effect);
      } else {
        // A Hiring Contact stays stored as B2B prospect data, on the Suppression List.
        let hash = "";
        if (person) {
          for (const v of person.contactValues.filter((x) => x.kind !== "mobile")) hash = suppress(state, v.value, "opt_out");
          person.lifecycle = "suppressed";
        } else if (r.toAddress) hash = suppress(state, r.toAddress, "opt_out");
        effect("suppression_list", `Added to the Suppression List${hash ? ` (${truncateHash(hash)})` : ""}: never contacted again, by any Workspace.`);
      }
      r.state = "stopped";
      r.stopReason = "Opted out";
      break;
    }
    case "not_interested": {
      if (r.personKind === "hiring_contact" && prospect) {
        prospect.status = "closed";
        prospect.closedUntil = addDays(today, 182);
        effect("prospect_closed", `${prospect.name} is closed until ${formatDate(prospect.closedUntil)}: no outreach to anyone there for 6 months.`);
      } else if (r.personKind === "candidate") {
        deleteCandidateAfterObjection(state, reply, "not_interested", effect);
        r.state = "replied";
        r.stopReason = null;
      }
      break;
    }
    case "out_of_office": {
      const until = reply.outOfOfficeUntil ?? addDays(today, 4 + (hashString(`ooo|${r.id}`) % 7));
      const resumeOn = resumeDateAfter(state, r, until);
      reply.outOfOfficeUntil = until;
      r.pausedUntil = until;
      r.nextSendOn = resumeOn;
      effect("sequence_paused", `Sequence paused until ${formatDate(until)}; it resumes on ${formatDate(resumeOn)}, the next sending day.`);
      break;
    }
    case "referral": {
      if (!reply.referral && prospect) {
        const rng = rngFor("referral", reply.id);
        const name = personName(state, rng, languageFor(prospect.location));
        const title = rng.pick(["Head of Talent", "VP Engineering", "Talent Acquisition Lead"]);
        const h = createHiringContact(state, prospect, { name, title, rank: prospect.hiringContactIds.length + 1, location: prospect.location, language: languageFor(prospect.location), yearsInRole: 2 }, today);
        h.origin = "referral";
        h.proposed = true;
        h.referredByReplyId = reply.id;
        reply.referral = { name, title, hiringContactId: h.id };
      }
      if (reply.referral) {
        const referred = reply.referral.hiringContactId ? state.hiringContacts.find((h) => h.id === reply.referral?.hiringContactId) : undefined;
        effect(
          "hiring_contact_proposed",
          referred && !referred.proposed
            ? `${reply.referral.name} (${reply.referral.title}) proposed as a new Hiring Contact at ${prospect?.name ?? "this Prospect"}.`
            : `${reply.referral.name} (${reply.referral.title}) proposed as a new Hiring Contact at ${prospect?.name ?? "this Prospect"}. Accept to add them (${formatCreditsLabel(PRICES.hiringContactFound)}).`,
        );
      }
      break;
    }
    case "bounce": {
      const emailKind = r.personKind === "candidate" ? "personal_email" : "work_email";
      const current = person?.contactValues.find((v) => v.kind === emailKind && v.value === r.toAddress) ?? person?.contactValues.find((v) => v.kind === emailKind && v.verification !== "invalid");
      if (current) current.verification = "invalid";
      let found = null;
      if (person) {
        for (let attempt = 1; attempt <= 2 && !found; attempt++) {
          const v = findContactValue(state, person, r.personKind, emailKind, attempt);
          if (v && v.value !== current?.value && !isSuppressed(state, v.value)) found = v;
        }
      }
      if (found && person && canSpend(state, PRICES.verifiedEmail)) {
        spend(state, PRICES.verifiedEmail, "verified_email", `Next provider after a bounce - ${reply.personLabel}`, { nicheId: null });
        found.creditsCharged = PRICES.verifiedEmail;
        person.contactValues.push(found);
        bounceFound = { provider: PROVIDER_LABELS[found.provenance.provider] };
        // The bounced email stays in the thread as sent; the same email is sent again to the new
        // address, and the follow-ups drafted after it are dropped (they follow the re-sent email).
        const bounced = [...r.messages].reverse().find((m) => m.origin === "campaign" && m.status === "sent");
        if (bounced) {
          r.messages = r.messages.filter((m) => !(m.origin === "campaign" && m.status !== "sent" && m.step > bounced.step));
          const resend: Message = {
            ...bounced,
            id: newId("msg"),
            footer: { ...bounced.footer },
            status: "approved",
            sentOn: null,
            origin: "campaign",
          };
          r.messages.push(resend);
        }
        const campaign = state.campaigns.find((c) => c.id === r.campaignId);
        const resendOn = nextSendingDay(addDays(today, 1), campaign?.sendingWindow.days ?? ["mon", "tue", "wed", "thu", "fri"]);
        r.toAddress = found.value;
        r.state = "scheduled";
        r.nextSendOn = resendOn;
        // Nothing was delivered by this email: the person is Enriched again. Their retention date from
        // the bounced send stays, so they are never left without one.
        if (person.lifecycle === "contacted") person.lifecycle = "enriched";
        effect("next_provider_tried", `Email marked invalid. ${bounceFound.provider} found a new verified email (${formatCreditsLabel(PRICES.verifiedEmail)} charged); the email is sent again on ${formatDate(resendOn)}, the next sending day.`);
      } else {
        r.state = "stopped";
        r.stopReason = "Bounced, no other email found";
        if (person && person.lifecycle === "contacted") person.lifecycle = "enriched";
        effect("next_provider_tried", "Email marked invalid. FullEnrich and BetterContact found nothing: no Credits charged, outreach to this person stopped.");
      }
      const mb = state.mailboxes.find((m) => m.id === r.mailboxId);
      if (mb) {
        mb.bouncesTotal++;
        mb.bounceRate = Math.round((1000 * mb.bouncesTotal) / Math.max(mb.sentTotal, 1)) / 10;
        if (mb.bounceRate > SENDING_LIMITS.bounceRatePausePercent && (mb.status === "active" || mb.status === "warming")) {
          mb.status = "paused";
          mb.statusReason = `Paused automatically on ${formatDate(today)}: bounce rate ${mb.bounceRate}% (threshold ${SENDING_LIMITS.bounceRatePausePercent}%).`;
          effect("mailbox_paused", `${mb.address} paused automatically: bounce rate ${mb.bounceRate}% is over ${SENDING_LIMITS.bounceRatePausePercent}%.`);
          notify(state, "warning", `${mb.address} paused automatically: bounce rate ${mb.bounceRate}% (threshold ${SENDING_LIMITS.bounceRatePausePercent}%). Its follow-ups wait until you resume it.`, NOTICE_LINKS.mailboxes);
          audit(state, "System", "Sending Mailbox paused automatically", mb.address, { kind: "mailbox", id: mb.id });
        }
      }
      break;
    }
    default:
      break;
  }

  const ctx = replyContext(state, r, person, reply.outOfOfficeUntil ?? today, reply.referral ? { name: reply.referral.name, title: reply.referral.title } : null);
  let link: string | null = null;
  if (r.personKind === "candidate" && realReply && reply.category !== "not_interested" && reply.category !== "opt_out" && state.candidates.some((c) => c.id === r.personId)) {
    if (!reply.consentToken) {
      reply.consentToken = consentToken(reply.id);
      state.consentTokens.push({ token: reply.consentToken, candidateId: r.personId, replyId: reply.id, createdOn: today, usedOn: null, choice: null });
    }
    link = consentUrl(reply.consentToken);
  }
  let draft = draftResponse(reply.category, ctx, link);
  if (draft && link && !draft.includes(link)) draft += `\n\n${consentLinkLine(ctx.language, link)}`;
  reply.draftResponse = draft;
  reply.suggestedNextStep = suggestedNextStep(reply.category, { ...ctx, closedUntil: prospect?.closedUntil ?? undefined, bounceFound });
  // Deleted data never comes back: a recategorized reply keeps listing the effect that deleted the Candidate.
  reply.effects = [...reply.effects.filter((e) => e.description.startsWith("Recategorized") || e.kind === "candidate_deleted"), ...effects];
}

/** Creates a reply for a Contacted recipient and applies its automatic effects. */
export function applyReply(state: AppState, r: Recipient, category: ReplyCategory): Reply {
  const today = state.clock.today;
  const person = getPerson(state, { kind: r.personKind, id: r.personId });
  const last = [...r.messages].reverse().find((m) => m.status === "sent");
  if (!last) fail("Only Contacted recipients can reply.");
  const id = newId("rp");
  const ooo = addDays(today, 4 + (hashString(`ooo|${r.id}`) % 7));
  let referral: ReplyContext["referral"] = null;
  if (category === "referral") {
    const rng = rngFor("referral-name", r.id);
    const prospect = state.prospects.find((p) => p.id === r.prospectId);
    referral = { name: personName(state, rng, prospect ? languageFor(prospect.location) : "en"), title: rng.pick(["Head of Talent", "VP Engineering", "Talent Acquisition Lead"]) };
  }
  const ctx = replyContext(state, r, person, ooo, referral);
  const reply: Reply = {
    id,
    recipientId: r.id,
    campaignId: r.campaignId,
    personKind: r.personKind,
    personId: r.personId,
    personLabel: r.personLabel,
    prospectId: r.prospectId,
    receivedOn: today,
    language: ctx.language,
    subject: replySubject(category, last.subject, ctx.language),
    body: replyBody(category, ctx),
    category,
    recategorizedFrom: null,
    suggestedNextStep: "",
    draftResponse: null,
    consentToken: null,
    handled: false,
    responseSentOn: null,
    responseBody: null,
    effects: [],
    outOfOfficeUntil: category === "out_of_office" ? ooo : null,
    referral: null,
  };
  state.replies.push(reply);
  if (referral && category === "referral") {
    const prospect = state.prospects.find((p) => p.id === r.prospectId);
    if (prospect) {
      const h = createHiringContact(state, prospect, { name: referral.name, title: referral.title, rank: prospect.hiringContactIds.length + 1, location: prospect.location, language: languageFor(prospect.location), yearsInRole: 2 }, today);
      h.origin = "referral";
      h.proposed = true;
      h.referredByReplyId = id;
      reply.referral = { ...referral, hiringContactId: h.id };
    }
  }
  applyCategoryEffects(state, reply, r);
  audit(state, "Outreach Agent", `Reply received: ${REPLY_CATEGORY_LABELS[category]}`, reply.personLabel, { kind: "reply", id });
  return reply;
}

/* ------------------------------------------------------------------ */
/* Claims, mailboxes, Digest                                           */
/* ------------------------------------------------------------------ */

export function expireClaims(state: AppState): string[] {
  const lines: string[] = [];
  const today = state.clock.today;
  for (const person of [...state.candidates, ...state.hiringContacts]) {
    if (person.claim && isOnOrBefore(person.claim.expiresOn, addDays(today, -1))) {
      lines.push(`Claim on ${person.name} by ${recruiterName(state, person.claim.recruiterId)} lapsed after 90 days without activity.`);
      audit(state, "System", "Claim lapsed after 90 days of inactivity", person.name, null);
      person.claim = null;
    }
  }
  return lines;
}

export function advanceMailboxRamps(state: AppState): void {
  for (const m of state.mailboxes) {
    if (m.status === "refused") continue;
    m.health.domainAgeDays++;
    // A paused mailbox does not ramp: it resumes from the ramp day it was paused on.
    if (m.status !== "warming" && m.status !== "active") continue;
    m.rampDay++;
    if (m.status === "warming") {
      m.dailyCap = rampCap(m.rampDay);
      if (m.rampDay >= SENDING_LIMITS.rampDays) {
        m.status = "active";
        m.statusReason = null;
        m.dailyCap = SENDING_LIMITS.perMailboxPerDay;
      }
      if (m.health.inboxPlacement === null && m.rampDay >= 3) m.health.inboxPlacement = 86 + (hashString(m.id) % 8);
    }
  }
}

/** Digests kept per Recruiter (the oldest go first). */
const DIGESTS_PER_RECRUITER = 60;

function replyGroups(state: AppState, replies: Reply[]): DigestReplyGroup[] {
  return REPLY_CATEGORIES.map((category) => ({
    category,
    items: replies
      .filter((r) => r.category === category)
      .map((r) => ({
        replyId: r.id,
        personLabel: r.personLabel,
        prospectName: r.prospectId ? state.prospects.find((p) => p.id === r.prospectId)?.name ?? null : null,
        suggestedNextStep: r.suggestedNextStep,
      })),
  })).filter((g) => g.items.length > 0);
}

/** Open Data Requests due within 7 days or overdue that a Recruiter should see. */
function dataRequestsDueFor(state: AppState, recruiterId: string, nicheIds: Set<string>): DigestDataRequestLine[] {
  const today = state.clock.today;
  const recruiter = state.recruiters.find((r) => r.id === recruiterId);
  const isOwner = recruiter?.role === "owner";
  const inMyNiches = (m: { kind: string; id: string }) => {
    if (m.kind === "candidate") return state.candidates.find((c) => c.id === m.id)?.nicheIds.some((n) => nicheIds.has(n)) ?? false;
    const h = state.hiringContacts.find((x) => x.id === m.id);
    return state.prospects.find((p) => p.id === h?.prospectId)?.nicheIds.some((n) => nicheIds.has(n)) ?? false;
  };
  return state.dataRequests
    .filter((dr) => dr.status !== "completed" && diffDays(dr.dueOn, today) <= 7)
    .filter((dr) => isOwner || dr.matches.length === 0 || dr.matches.some(inMyNiches))
    .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0))
    .map((dr) => ({ id: dr.id, personQuery: dr.personQuery, dueOn: dr.dueOn, overdue: isOnOrBefore(dr.dueOn, addDays(today, -1)) }));
}

export function buildDigests(state: AppState, retention: RetentionResult, sentYesterday: Record<string, number>): void {
  const today = state.clock.today;
  const yesterday = addDays(today, -1);
  for (const recruiter of state.recruiters.filter((r) => r.status === "active")) {
    const campaignIds = new Set(state.campaigns.filter((c) => c.ownerId === recruiter.id).map((c) => c.id));
    const nicheIds = new Set(state.niches.filter((n) => n.ownerId === recruiter.id).map((n) => n.id));
    // "New" means received since this Recruiter's previous Digest (yesterday when there is none yet),
    // and not already listed as new in it.
    const previous = state.digests.find((d) => d.recruiterId === recruiter.id && d.on !== today);
    const listedBefore = new Set(previous ? previous.newReplies.flatMap((g) => g.items.map((i) => i.replyId)) : []);
    const since = previous ? previous.on : yesterday;
    const mine = state.replies.filter((r) => campaignIds.has(r.campaignId));
    const fresh = mine.filter((r) => isOnOrBefore(since, r.receivedOn) && !listedBefore.has(r.id));
    const freshIds = new Set(fresh.map((r) => r.id));
    const waiting = mine.filter((r) => !r.handled && !freshIds.has(r.id));
    const recentP = state.prospects.filter((p) => p.nicheIds.some((n) => nicheIds.has(n)) && p.status === "surfaced" && p.fit.aboveThreshold && (diffDays(today, p.surfacedOn) <= 3 || p.hasNewSignal));
    const recentC = state.candidates.filter((c) => c.nicheIds.some((n) => nicheIds.has(n)) && c.lifecycle === "surfaced" && c.fit.aboveThreshold && diffDays(today, c.surfacedOn) <= 3);
    const best = [
      ...recentP.map((p) => ({ kind: "prospect" as const, id: p.id, name: p.name, signalStrength: p.signalStrength, headline: p.hasNewSignal ? `New Signal: ${p.signals[p.signals.length - 1]?.label ?? ""}` : `${p.sector}, ${p.headcount} people, ${p.location.split(",")[0]}` })),
      ...recentC.map((c) => ({ kind: "candidate" as const, id: c.id, name: c.name, signalStrength: c.signalStrength, headline: c.headline })),
    ]
      .filter((x) => x.signalStrength >= DIGEST_MIN_SIGNAL_STRENGTH)
      .sort((a, b) => b.signalStrength - a.signalStrength)
      .slice(0, 6);
    const mailboxes = state.mailboxes
      .filter((m) => m.recruiterId === recruiter.id)
      .map((m) => ({
        mailboxId: m.id,
        address: m.address,
        status: m.status,
        sentYesterday: sentYesterday[m.id] ?? 0,
        dailyCap: m.dailyCap,
        note:
          m.status === "refused"
            ? "Refused: on a Main Domain"
            : m.status === "paused"
              ? m.statusReason ?? "Paused"
              : m.status === "warming"
                ? `Ramp day ${m.rampDay}: up to ${m.dailyCap} emails a day`
                : `Healthy: bounce rate ${m.bounceRate}%, inbox placement ${m.health.inboxPlacement ?? "-"}%`,
      }));
    const spent = state.creditLedger.filter((e) => e.on === yesterday && e.delta < 0).reduce((s, e) => s - e.delta, 0);
    const notes = state.notices.filter((n) => n.on === today || n.on === yesterday).map((n) => n.text);
    const digest: Digest = {
      id: newId("dg"),
      on: today,
      recruiterId: recruiter.id,
      newReplies: replyGroups(state, fresh),
      waitingReplies: replyGroups(state, waiting),
      bestNewFeedItems: best,
      mailboxHealth: mailboxes,
      creditsRemaining: state.workspace?.credits ?? 0,
      creditsSpentYesterday: spent,
      deletedByRetention: retention.surfaced,
      deletedAtRetentionEnd: retention.afterContact,
      dataRequestsDue: dataRequestsDueFor(state, recruiter.id, nicheIds),
      notes,
    };
    state.digests = state.digests.filter((d) => !(d.recruiterId === recruiter.id && d.on === today));
    state.digests.unshift(digest);
  }
  // Keep the last 60 Digests of each Recruiter (newest first).
  const kept = new Map<string, number>();
  state.digests = state.digests.filter((d) => {
    const n = (kept.get(d.recruiterId) ?? 0) + 1;
    kept.set(d.recruiterId, n);
    return n <= DIGESTS_PER_RECRUITER;
  });
}

/* ------------------------------------------------------------------ */
/* Day loop                                                            */
/* ------------------------------------------------------------------ */

export function advanceOneDay(state: AppState): string[] {
  const lines: string[] = [];
  const sentYesterday: Record<string, number> = {};
  for (const m of state.mailboxes) sentYesterday[m.id] = m.sentToday;
  state.clock.today = addDays(state.clock.today, 1);
  const today = state.clock.today;
  lines.push(`Simulated date: ${formatDate(today)}.`);
  for (const m of state.mailboxes) m.sentToday = 0;
  for (const d of state.sendingDomains) d.sentToday = 0;
  advanceMailboxRamps(state);
  for (const r of state.recruiters) {
    if (r.status === "invited" && r.invitedOn && diffDays(today, r.invitedOn) >= 1) {
      r.status = "active";
      r.joinedOn = today;
      lines.push(`${r.name} accepted the invitation.`);
      audit(state, r.name, "Joined the Workspace", state.workspace?.name ?? "", null);
    }
  }
  for (const p of state.prospects) {
    if (p.status === "closed" && p.closedUntil && isOnOrBefore(p.closedUntil, today)) {
      p.status = "surfaced";
      p.closedUntil = null;
      lines.push(`${p.name} reopened after 6 months closed.`);
    }
  }
  rescoreAll(state);
  const weekday = weekdayOf(today);
  for (const niche of state.niches) {
    if (niche.status === "active" && niche.schedule.days.includes(weekday)) lines.push(runNicheAgents(state, niche, "scheduled"));
  }
  // Sending first: a first email due on a Candidate's deleteOn day goes out, and they are Contacted.
  lines.push(...sendingPass(state));
  const retention = applyRetention(state);
  lines.push(...retentionLines(retention));
  lines.push(...generateReplies(state));
  lines.push(...expireClaims(state));
  buildDigests(state, retention, sentYesterday);
  return lines;
}

export function advance(state: AppState, days: number): string[] {
  const n = Math.max(1, Math.min(60, Math.round(days)));
  const lines: string[] = [];
  for (let i = 0; i < n; i++) lines.push(...advanceOneDay(state));
  return n > 1 ? [`Advanced ${n} days to ${formatDate(state.clock.today)}.`, ...lines.filter((l) => !l.startsWith("Simulated date"))].slice(0, 60) : lines;
}

export function runAgentsNow(state: AppState, nicheId?: string): string[] {
  const lines: string[] = [];
  const niches = state.niches.filter((n) => (nicheId ? n.id === nicheId : n.status === "active"));
  if (nicheId && niches[0] && niches[0].status !== "active") fail("Activate the Niche first: agents only run for active Niches.");
  if (niches.length === 0) lines.push("No active Niche: activate one to run the agents.");
  for (const n of niches) lines.push(runNicheAgents(state, n, "manual"));
  lines.push(...sendingPass(state));
  lines.push(...generateReplies(state));
  rescoreAll(state);
  return lines;
}
