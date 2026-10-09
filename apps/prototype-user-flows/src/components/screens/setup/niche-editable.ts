// The editable slice of a Niche on /niches/[id]: name, Niche Profile fields and schedule.
// Kept as a local draft while the Recruiter edits, saved through updateNiche / updateNicheProfile / setSchedule.

import type { Niche, NicheProfile, NicheSchedule } from "@/lib/types";

export type EditableProfile = Pick<
  NicheProfile,
  "sectors" | "companySize" | "fundingStages" | "locations" | "roleTypes" | "seniority" | "candidateProfile" | "fitThreshold" | "signalWeights"
>;

export interface Editable {
  name: string;
  profile: EditableProfile;
  schedule: NicheSchedule;
}

const PROFILE_KEYS: (keyof EditableProfile)[] = [
  "sectors",
  "companySize",
  "fundingStages",
  "locations",
  "roleTypes",
  "seniority",
  "candidateProfile",
  "fitThreshold",
  "signalWeights",
];

export function editableFrom(n: Niche): Editable {
  const p = n.profile;
  return {
    name: n.name,
    profile: {
      sectors: [...p.sectors],
      companySize: { ...p.companySize },
      fundingStages: [...p.fundingStages],
      locations: [...p.locations],
      roleTypes: [...p.roleTypes],
      seniority: [...p.seniority],
      candidateProfile: p.candidateProfile,
      fitThreshold: p.fitThreshold,
      signalWeights: p.signalWeights.map((w) => ({ ...w })),
    },
    schedule: { ...n.schedule, days: [...n.schedule.days] },
  };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isSame(a: Editable, b: Editable): boolean {
  return same(a, b);
}

export function diff(base: Editable, next: Editable): { name: string | null; profile: Partial<NicheProfile> | null; schedule: NicheSchedule | null } {
  const profile: Partial<NicheProfile> = {};
  let profileChanged = false;
  for (const key of PROFILE_KEYS) {
    if (!same(base.profile[key], next.profile[key])) {
      (profile as Record<string, unknown>)[key] = next.profile[key];
      profileChanged = true;
    }
  }
  return {
    name: next.name.trim() !== base.name ? next.name.trim() : null,
    profile: profileChanged ? profile : null,
    schedule: same(base.schedule, next.schedule) ? null : next.schedule,
  };
}

/** First problem that blocks saving, or null. */
export function validate(e: Editable): string | null {
  if (e.name.trim().length < 3) return "Give the Niche a name of at least 3 characters.";
  const p = e.profile;
  if (p.sectors.length === 0) return "Add at least one sector.";
  if (p.locations.length === 0) return "Add at least one location.";
  if (p.roleTypes.length === 0) return "Add at least one role type.";
  if (!(p.companySize.min >= 1) || !(p.companySize.max > p.companySize.min)) return "Company size: the maximum must be above the minimum.";
  if (p.candidateProfile.trim().length < 12) return "Describe the Candidate profile in a sentence or more.";
  const s = e.schedule;
  if (s.prospectsPerRun < 0 || s.prospectsPerRun > 200) return "Prospects per run must be between 0 and 200.";
  if (s.candidatesPerRun < 0 || s.candidatesPerRun > 200) return "Candidates per run must be between 0 and 200.";
  if (!/^\d{2}:\d{2}$/.test(s.time)) return "Pick a run time.";
  return null;
}
