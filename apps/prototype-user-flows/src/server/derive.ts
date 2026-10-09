// Values computed on every GET /api/state so screens never recompute them (and all agree).

import { diffDays } from "@/lib/dates";
import { nicheLabel, SENDING_LIMITS } from "@/lib/labels";
import type { AppState, Candidate, ClientState, Derived, Lifecycle, Prospect, ProspectStatus, ReplyCategory } from "@/lib/types";
import { REPLY_CATEGORIES } from "@/lib/types";

const LIFECYCLES: Lifecycle[] = ["surfaced", "dismissed", "enriched", "contacted", "replied", "consented", "suppressed"];
const PROSPECT_STATUSES: ProspectStatus[] = ["surfaced", "dismissed", "in_campaign", "replied", "closed"];

/** The Feed's order: Signal Strength, then Fit, then name. */
export function byRank(a: Prospect | Candidate, b: Prospect | Candidate): number {
  return b.signalStrength - a.signalStrength || b.fit.score - a.fit.score || a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}

/** The Prospects tab of the Feed across every Niche: Surfaced or in a Campaign, at or above the Fit threshold, best first. */
export function rankedProspects(state: AppState): Prospect[] {
  return state.prospects.filter((p) => (p.status === "surfaced" || p.status === "in_campaign") && p.fit.aboveThreshold).sort(byRank);
}

/** The Candidates tab of the Feed across every Niche: Surfaced or Enriched, at or above the Fit threshold, best first. */
export function rankedCandidates(state: AppState): Candidate[] {
  return state.candidates.filter((c) => (c.lifecycle === "surfaced" || c.lifecycle === "enriched") && c.fit.aboveThreshold).sort(byRank);
}

function zeroed<K extends string>(keys: K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

export function derive(state: AppState): Derived {
  const ws = state.workspace;
  const today = state.clock.today;
  const currentRecruiter = state.recruiters.find((r) => r.id === state.session.recruiterId) ?? null;

  const unhandledRepliesByCategory = zeroed<ReplyCategory>(REPLY_CATEGORIES);
  let unhandledReplies = 0;
  for (const r of state.replies) {
    if (r.handled) continue;
    unhandledReplies++;
    unhandledRepliesByCategory[r.category]++;
  }

  const creditsUsedLast7DaysByNiche: Record<string, number> = {};
  for (const n of state.niches) creditsUsedLast7DaysByNiche[n.id] = 0;
  for (const e of state.creditLedger) {
    if (e.delta >= 0 || !e.nicheId) continue;
    if (diffDays(today, e.on) >= 7) continue;
    creditsUsedLast7DaysByNiche[e.nicheId] = (creditsUsedLast7DaysByNiche[e.nicheId] ?? 0) - e.delta;
  }

  const candidateLifecycleCounts = zeroed<Lifecycle>(LIFECYCLES);
  for (const c of state.candidates) candidateLifecycleCounts[c.lifecycle]++;
  const hiringContactLifecycleCounts = zeroed<Lifecycle>(LIFECYCLES);
  for (const h of state.hiringContacts) hiringContactLifecycleCounts[h.lifecycle]++;
  const prospectStatusCounts = zeroed<ProspectStatus>(PROSPECT_STATUSES);
  for (const p of state.prospects) prospectStatusCounts[p.status]++;

  const domains = new Map<string, { domain: string; sentToday: number; cap: number }>();
  for (const d of state.sendingDomains) domains.set(d.domain, { domain: d.domain, sentToday: 0, cap: d.dailyCap });
  for (const m of state.mailboxes) {
    if (m.status === "refused") continue;
    const entry = domains.get(m.domain) ?? { domain: m.domain, sentToday: 0, cap: SENDING_LIMITS.perDomainPerDay };
    entry.sentToday += m.sentToday;
    domains.set(m.domain, entry);
  }

  const runningJobs: Derived["runningJobs"] = [];
  for (const n of state.niches) {
    if (n.testRun?.status === "running") runningJobs.push({ kind: "test_run", id: n.testRun.id, label: `Test Run - ${nicheLabel(n)}`, progress: n.testRun.progress });
  }
  for (const j of state.jobs) if (j.status === "running") runningJobs.push({ kind: j.kind, id: j.id, label: j.label, progress: j.progress });
  for (const s of state.assistedSetups) {
    if (s.status === "running") runningJobs.push({ kind: "assisted_setup", id: s.id, label: `Assisted setup - ${s.domain}`, progress: s.progress });
  }

  const latestDigest = state.digests.find((d) => d.recruiterId === currentRecruiter?.id) ?? null;

  return {
    currentRecruiter,
    isFreeTrial: ws?.plan === "free_trial",
    freeTestRunAvailable: ws !== null && ws.freeTestRunUsedBy === null,
    unhandledReplies,
    unhandledRepliesByCategory,
    creditsUsedLast7DaysByNiche,
    candidateLifecycleCounts,
    hiringContactLifecycleCounts,
    prospectStatusCounts,
    rankedProspectIds: rankedProspects(state).map((p) => p.id),
    domainUsage: Array.from(domains.values()),
    runningJobs,
    latestDigestId: latestDigest?.id ?? null,
  };
}

export function toClientState(state: AppState): ClientState {
  return { ...state, derived: derive(state) };
}
