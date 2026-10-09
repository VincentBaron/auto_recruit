// Seed scenarios: "New user" (nothing exists) and "Established workspace" (Atelier Talent), built
// deterministically. The Established workspace exercises every state the screens display.

import { addDays, addYears, diffDays, isOnOrBefore, isWeekend, maxDate, weekdayOf } from "@/lib/dates";
import { plural } from "@/lib/format";
import { IDENTITY_SCOPES, RETENTION, VOICE_SCAN_SCOPES } from "@/lib/labels";
import { PRICES } from "@/lib/pricing";
import type {
  AppState,
  Campaign,
  Candidate,
  ContactValue,
  CreditLedgerEntry,
  CreditReason,
  HiringContact,
  Niche,
  NicheProfile,
  Prospect,
  Recipient,
  RecipientState,
  ReplyCategory,
  ScenarioKey,
  SignalType,
} from "@/lib/types";
import { emptyProfile, searchStrategyFor } from "./agents";
import { consentToken, draftMessage, fr } from "./drafts";
import {
  type CandidateSeed,
  type ProspectSeed,
  createCandidate,
  createHiringContact,
  createProspect,
  findContactValue,
  generateCandidateSeed,
  generateHiringContactSeeds,
  emailFor,
  phoneFor,
} from "./generate";
import { audit, hashValue, makeClaim, NOTICE_LINKS } from "./helpers";
import { Rng, rngFor } from "./rng";
import { newId } from "./runtime";
import { defaultSignalWeights, rescoreAll } from "./scoring";
import { applyReply, buildDigests, initialSteps, rampCap, sendingPass, TEST_RUN_STEPS } from "./sim";
import { scannedExamples } from "./voice";

export const START_DATE = "2026-10-12";

/** Main Domains that already used their free Test Run (to demo the once-per-Main-Domain rule). */
export const USED_FREE_TEST_RUN_DOMAINS = ["recrutonic.fr", "ateliertalent.fr"];

export function emptyState(scenario: ScenarioKey): AppState {
  return {
    version: 1,
    scenario,
    clock: { today: START_DATE },
    session: { signedIn: false, recruiterId: null, provider: null, scopes: [], signedInOn: null },
    workspace: null,
    recruiters: [],
    niches: [],
    prospects: [],
    detectedRoles: [],
    hiringContacts: [],
    candidates: [],
    previews: [],
    campaigns: [],
    recipients: [],
    replies: [],
    mailboxes: [],
    sendingDomains: [],
    assistedSetups: [],
    voiceProfiles: [],
    mailboxScanConsents: [],
    creditLedger: [],
    invoices: [],
    suppressionList: [],
    dataRequests: [],
    auditLog: [],
    digests: [],
    apiKeys: [],
    consentTokens: [],
    chat: [],
    jobs: [],
    agentRuns: [],
    notices: [],
    lastChange: null,
  };
}

export function buildScenario(key: ScenarioKey): AppState {
  return key === "established" ? buildEstablished() : emptyState("new_user");
}

/* ------------------------------------------------------------------ */
/* Established workspace                                               */
/* ------------------------------------------------------------------ */

type SigSpec = [SignalType, number, string?];

interface ProspectSpec {
  key: string;
  niche: "fin" | "health";
  seed: ProspectSeed;
  surfacedAgo: number;
  contacts: [string, string][];
}

function ps(
  key: string,
  niche: "fin" | "health",
  name: string,
  domain: string,
  sector: string,
  tags: string[],
  description: string,
  headcount: number,
  location: string,
  founded: number,
  funding: [string, number, number] | null,
  signals: SigSpec[],
  surfacedAgo: number,
  contacts: [string, string][] = [],
  roles: [string, number, boolean?][] = [],
): ProspectSpec {
  return {
    key,
    niche,
    surfacedAgo,
    contacts,
    seed: {
      name,
      domain,
      sector,
      tags,
      description,
      headcount,
      location,
      founded,
      funding: funding ? { round: funding[0], amountEur: funding[1] * 1_000_000, ageDays: funding[2] } : null,
      signals: signals.map(([type, ageDays, label]) => ({ type, ageDays, label })),
      roles: roles.map(([title, ageDays, stale]) => ({ title, ageDays, stale })),
    },
  };
}

const PROSPECTS: ProspectSpec[] = [
  ps("fintory", "fin", "Fintory", "fintory.io", "Fintech", ["Treasury", "B2B SaaS"], "Treasury automation for mid-market finance teams", 85, "Paris, France", 2019, ["Series B", 32, 24],
    [["headcount_growth", 1, "Headcount up 38% in 6 months"], ["job_posting", 6, "Hiring a Senior Backend Engineer (Go)"], ["funding_round", 24], ["new_leader", 41, "New CTO joined from a payments scale-up"]], 27,
    [["Julien Garnier", "CTO"], ["Anaïs Duval", "Head of Talent"], ["Bastien Moulin", "Engineering Manager"]], [["Senior Backend Engineer (Go)", 6]]),
  ps("ledgerwise", "fin", "Ledgerwise", "ledgerwise.fr", "Fintech", ["Accounting", "SMB"], "Real-time accounting for SMEs", 140, "Paris, France", 2018, ["Series B", 45, 120],
    [["job_posting_stale", 9, "Staff Backend Engineer - Payments posting open 43 days, reposted"], ["funding_round", 120], ["headcount_growth", 30, "Headcount up 22% in 6 months"]], 40,
    [["Romain Colin", "CTO"]], [["Staff Backend Engineer - Payments", 43, true]]),
  ps("paymiel", "fin", "Paymiel", "paymiel.com", "Payments", ["Embedded payments", "Marketplace"], "Embedded payments for marketplaces", 60, "Paris, France", 2021, ["Series A", 12, 35],
    [["funding_round", 35], ["job_posting", 12, "Hiring a Senior Platform Engineer"], ["headcount_growth", 20, "Headcount up 45% in 6 months"]], 33,
    [["Margaux Fontaine", "CTO"], ["Victor Hamel", "Head of Talent"]]),
  ps("kapsula", "fin", "Kapsula Finance", "kapsula.finance", "Fintech", ["Savings", "B2C"], "Savings products for freelancers", 45, "Paris, France", 2022, ["Series A", 9, 70],
    [["funding_round", 70], ["new_leader", 18, "New VP Engineering joined"]], 36, [["Rayan Mercier", "Co-founder & CEO"]]),
  ps("tresoria", "fin", "Tresoria", "tresoria.io", "Fintech", ["Cash forecasting"], "Cash forecasting for CFOs", 110, "Paris, France", 2017, ["Series C", 60, 200],
    [["job_posting", 3, "Hiring a Lead Backend Engineer"], ["expansion", 25, "Opening an office in Milan"], ["funding_round", 200]], 20,
    [["Nora Haddad", "CTO"], ["Lucas Fabre", "Head of Talent"]]),
  ps("billora", "fin", "Billora", "billora.com", "Fintech", ["Invoicing", "Collections"], "B2B invoicing and collections", 72, "Paris, France", 2020, ["Series A", 15, 300],
    [["job_posting", 20, "Hiring a Senior Backend Engineer (Kotlin)"], ["headcount_growth", 40, "Headcount up 31% in 6 months"]], 30, [["Élise Marchand", "VP Engineering"]]),
  ps("clearmint", "fin", "Clearmint", "clearmint.eu", "Regtech", ["KYC", "Compliance", "Fintech"], "Compliance automation for banks and fintechs", 190, "Paris, France", 2016, ["Series C", 70, 95],
    [["job_posting", 8, "Hiring a Staff Software Engineer"], ["funding_round", 95], ["new_leader", 60, "New CTO joined"]], 25,
    [["Adrien Lacroix", "VP Engineering"], ["Justine Carpentier", "Head of Talent"]]),
  ps("kreditio", "fin", "Kreditio", "kreditio.fr", "Fintech", ["Lending", "Revenue-based financing"], "Revenue-based financing for SaaS", 38, "Paris, France", 2022, ["Seed", 4, 150],
    [["job_posting", 14, "Hiring a Senior Backend Engineer"]], 38, [["Quentin Brunet", "Co-founder & CEO"]]),
  ps("vaultique", "fin", "Vaultique", "vaultique.io", "Fintech", ["Custody", "Infrastructure"], "Custody infrastructure for digital assets", 95, "Paris, France", 2019, ["Series B", 28, 45],
    [["funding_round", 45], ["job_posting", 26, "Hiring a Senior Backend Engineer (Go)"], ["layoffs", 30, "Reported a 12% reduction in staff"]], 29, [["Damien Joly", "CTO"]]),
  ps("monarelle", "fin", "Monarelle", "monarelle.com", "Fintech", ["Spend management"], "Expense cards for field teams", 230, "Paris, France", 2018, ["Series C", 85, 260],
    [["headcount_growth", 10, "Headcount up 26% in 6 months"], ["job_posting_stale", 5, "Senior Backend Engineer posting open 52 days, reposted"]], 34, [["Thomas Perrin", "VP Engineering"]]),
  ps("payrolio", "fin", "Payrolio", "payrolio.fr", "Fintech", ["Payroll API"], "Payroll API for HR software", 55, "Lyon, France", 2021, ["Series A", 11, 60],
    [["funding_round", 60], ["job_posting", 4, "Hiring a Backend Engineer (Go)"]], 12),
  ps("cashwell", "fin", "Cashwell Labs", "cashwell.io", "Fintech", ["Cash management"], "Cash management for e-commerce brands", 28, "Paris, France", 2023, ["Seed", 3, 40],
    [["funding_round", 40], ["new_leader", 22, "New Head of Engineering joined"]], 26, [["Mehdi Lemaire", "Head of Engineering"]]),
  ps("fiscalis", "fin", "Fiscalis", "fiscalis.app", "Fintech", ["Tax engine", "E-commerce"], "Tax engine for e-commerce platforms", 66, "Paris, France", 2020, ["Series A", 14, 180],
    [["job_posting", 2, "Hiring a Senior Platform Engineer"], ["headcount_growth", 35, "Headcount up 28% in 6 months"]], 31, [["Océane Leroy", "CTO"]]),
  ps("bancobo", "fin", "Bancobo", "bancobo.com", "Banking-as-a-service", ["Fintech", "Infrastructure"], "Banking-as-a-service for brands", 310, "Paris, France", 2015, ["Series D", 110, 400],
    [["layoffs", 15, "Reported a 15% reduction in staff"], ["job_posting", 50, "Hiring a Senior Backend Engineer"]], 52),
  ps("rembo", "fin", "Rembo", "rembo.eu", "Insurtech", ["Embedded insurance", "Lending"], "Embedded insurance for lenders", 150, "Paris, France", 2019, ["Series B", 38, 140],
    [["funding_round", 140], ["job_posting", 11, "Hiring a Senior Backend Engineer"], ["expansion", 33, "Opening an office in Madrid"]], 32, [["Pauline Masson", "CTO"]]),
  ps("quantelle", "fin", "Quantelle", "quantelle.fr", "Wealthtech", ["Portfolio analytics", "Fintech"], "Portfolio analytics for private banks", 80, "Paris, France", 2020, ["Series A", 10, 210],
    [["job_posting", 28, "Hiring a Senior Software Engineer"], ["headcount_growth", 55, "Headcount up 19% in 6 months"]], 35, [["Antoine Poirier", "CTO"]]),
  ps("carevia", "health", "Carevia", "carevia.health", "Healthtech", ["Remote monitoring"], "Remote patient monitoring for cardiology", 120, "Berlin, Germany", 2019, ["Series B", 40, 30],
    [["funding_round", 30], ["job_posting", 5, "Hiring a Senior Product Designer"]], 9,
    [["Lukas Meyer", "VP Product"], ["Anna Schulz", "Talent Acquisition Lead"]], [["Senior Product Designer", 5]]),
  ps("medilune", "health", "Medilune", "medilune.com", "Healthtech", ["Telehealth", "Sleep"], "Telehealth for sleep disorders", 75, "Paris, France", 2020, ["Series A", 16, 80],
    [["job_posting", 9, "Hiring a Lead Product Designer"], ["new_leader", 25, "New Head of Design joined"]], 14, [["Zoé Faure", "Head of Design"]]),
  ps("nurseo", "health", "Nurseo", "nurseo.eu", "Healthtech", ["Hospital scheduling"], "Shift scheduling for hospitals", 48, "Amsterdam, Netherlands", 2021, ["Seed", 5, 50],
    [["funding_round", 50], ["headcount_growth", 12, "Headcount up 40% in 6 months"]], 16),
  ps("vitalune", "health", "Vitalune", "vitalune.io", "Digital health", ["Physiotherapy", "Healthtech"], "Digital physiotherapy programmes", 90, "Barcelona, Spain", 2020, ["Series A", 18, 110],
    [["job_posting", 16, "Hiring a Product Designer"], ["expansion", 40, "Opening an office in Lisbon"]], 21),
  ps("healora", "health", "Healora", "healora.com", "Healthtech", ["Mental health", "Benefits"], "Mental health benefits for employers", 160, "Lisbon, Portugal", 2018, ["Series B", 35, 160],
    [["headcount_growth", 8, "Headcount up 24% in 6 months"], ["new_leader", 35, "New Chief Product Officer joined"]], 18),
  ps("clinicalm", "health", "Clinicalm", "clinicalm.de", "Healthtech", ["Clinical trials"], "Clinical trial recruitment for hospitals", 64, "Munich, Germany", 2021, ["Series A", 12, 20],
    [["funding_round", 20], ["job_posting", 7, "Hiring a Senior UX Designer"]], 11),
  ps("orthoverse", "health", "Orthoverse", "orthoverse.io", "Medtech", ["Orthodontics", "3D", "Healthtech"], "3D treatment planning for orthodontists", 35, "Paris, France", 2022, ["Seed", 4, 90],
    [["job_posting", 22, "Hiring a Product Designer"]], 24),
  ps("dokara", "health", "Dokara", "dokara.health", "Healthtech", ["Pharmacy logistics"], "Pharmacy inventory and logistics", 210, "Stockholm, Sweden", 2017, ["Series C", 65, 240],
    [["layoffs", 45, "Reported a 10% reduction in staff"], ["job_posting", 30, "Hiring a Senior Product Designer"]], 44),
  ps("pulsewise", "health", "Pulsewise", "pulsewise.eu", "Healthtech", ["Wearables", "Cardiology"], "Wearable cardiology monitoring", 58, "Dublin, Ireland", 2021, ["Series A", 13, 65],
    [["funding_round", 65], ["job_posting", 13, "Hiring a Senior Product Designer"], ["headcount_growth", 28, "Headcount up 33% in 6 months"]], 7),
];

function cand(
  name: string,
  location: string,
  title: string,
  employer: string,
  employerSector: string,
  tenureMonths: number,
  years: number,
  skills: string[],
  previous: [string, string, string, number][],
  signals: SigSpec[],
): CandidateSeed {
  return {
    name,
    language: location.endsWith("France") ? "fr" : "en",
    location,
    currentTitle: title,
    currentEmployer: employer,
    employerSector,
    tenureMonths,
    yearsExperience: years,
    skills,
    previous: previous.map(([e, sector, t, months]) => ({ employer: e, employerSector: sector, title: t, months })),
    signals: signals.map(([type, ageDays, label]) => ({ type, ageDays, label })),
  };
}

function finProfile(): NicheProfile {
  const p: NicheProfile = {
    ...emptyProfile(),
    sectors: ["Fintech", "Payments"],
    companySize: { min: 20, max: 300 },
    fundingStages: ["Series A", "Series B", "Series C"],
    locations: ["Paris"],
    roleTypes: ["Backend Engineer", "Platform Engineer", "Software Engineer"],
    seniority: ["Senior", "Staff", "Lead"],
    candidateProfile:
      "5+ years building backend systems in Go, Kotlin or Python, ideally from payments, banking or fintech. Has owned services in production with PostgreSQL and Kafka.",
    fitThreshold: 60,
    signalWeights: defaultSignalWeights(),
  };
  p.searchStrategy = searchStrategyFor(p);
  return p;
}

function healthProfile(): NicheProfile {
  const p: NicheProfile = {
    ...emptyProfile(),
    sectors: ["Healthtech", "Digital health"],
    companySize: { min: 30, max: 400 },
    fundingStages: ["Seed", "Series A", "Series B"],
    locations: ["Remote EU"],
    roleTypes: ["Product Designer", "UX Designer"],
    seniority: ["Senior", "Lead", "Staff"],
    candidateProfile:
      "Product designers with 5+ years, strong in Figma and design systems, who have shipped B2B SaaS or healthcare products and run user research with clinicians.",
    fitThreshold: 55,
    signalWeights: defaultSignalWeights(),
  };
  const funding = p.signalWeights.find((w) => w.type === "funding_round");
  if (funding) funding.weight = 30;
  const stale = p.signalWeights.find((w) => w.type === "job_posting_stale");
  if (stale) stale.enabled = false;
  p.searchStrategy = searchStrategyFor(p);
  return p;
}

/** A mobile number for a person that no other contact value in the Workspace uses. */
function uniqueMobile(s: AppState, person: HiringContact | Candidate): string {
  const used = new Set([...s.candidates, ...s.hiringContacts].flatMap((p) => p.contactValues.filter((v) => v.kind === "mobile").map((v) => v.value)));
  for (let attempt = 0; ; attempt++) {
    const value = phoneFor(person.language, rngFor("seed-mobile", person.id, attempt));
    if (!used.has(value)) return value;
  }
}

function seedValue(s: AppState, person: HiringContact | Candidate, kind: "hiring_contact" | "candidate", which: "email" | "mobile", foundAgo: number): ContactValue {
  const ck = which === "mobile" ? "mobile" : kind === "candidate" ? "personal_email" : "work_email";
  let v: ContactValue | null = null;
  for (let attempt = 0; attempt < 4 && !v; attempt++) v = findContactValue(s, person, kind, ck, attempt);
  if (!v) {
    // Pattern and SMTP check only fits work emails on a company domain; personal emails and mobiles
    // come from a provider waterfall.
    const work = ck === "work_email";
    const provider = work ? "dropcontact" : person.id.length % 2 === 0 ? "fullenrich" : "bettercontact";
    const companyDomain = kind === "hiring_contact" ? s.prospects.find((p) => p.id === (person as HiringContact).prospectId)?.domain : undefined;
    v = {
      id: newId("cv"),
      kind: ck,
      value: which === "mobile" ? uniqueMobile(s, person) : emailFor(person.name, kind === "candidate" ? "nuvomail.fr" : companyDomain ?? "example.com"),
      verification: "valid",
      provenance: work
        ? { provider, method: "pattern_and_smtp_check", sourceUrl: `https://app.dropcontact.example/records/${person.id}`, foundOn: s.clock.today }
        : { provider, method: "provider_waterfall", sourceUrl: `https://app.${provider}.example/records/${person.id}${which === "mobile" ? "-m" : ""}`, foundOn: s.clock.today },
      creditsCharged: 0,
    };
  }
  v.verification = v.verification === "invalid" ? "valid" : v.verification;
  // Found by an Enrichment after the person was Surfaced (and before any Campaign added them).
  v.provenance.foundOn = maxDate(person.surfacedOn, addDays(START_DATE, -foundAgo));
  v.creditsCharged = which === "mobile" ? 8 : 2;
  person.contactValues.push(v);
  return v;
}

function withDate<T>(s: AppState, daysAgo: number, fn: () => T): T {
  const saved = s.clock.today;
  s.clock.today = addDays(START_DATE, -daysAgo);
  try {
    return fn();
  } finally {
    s.clock.today = saved;
  }
}

function buildEstablished(): AppState {
  const s = emptyState("established");
  const today = START_DATE;
  const ago = (n: number) => addDays(today, -n);
  const rng = new Rng("established-v1");
  /** The same day or the closest earlier day the Niche's agents run on (people are Surfaced by scheduled runs). */
  const onSchedule = (niche: Niche, daysAgo: number) => {
    let a = daysAgo;
    while (!niche.schedule.days.includes(weekdayOf(ago(a))) && a < daysAgo + 7) a++;
    return a;
  };

  s.workspace = {
    id: "ws_atelier",
    name: "Atelier Talent",
    plan: "paid",
    credits: 100_000,
    autoTopUp: { enabled: false, thresholdCredits: 200, packCredits: 2000 },
    mainDomains: ["ateliertalent.fr"],
    freeTestRunUsedBy: "ateliertalent.fr",
    address: "18 rue de Paradis, 75010 Paris, France",
    createdOn: ago(62),
  };
  s.recruiters = [
    { id: "rc_vincent", name: "Vincent Baron", email: "vincent@ateliertalent.fr", role: "owner", title: "Founder, tech recruiter", status: "active", invitedOn: null, joinedOn: ago(62) },
    { id: "rc_camille", name: "Camille Martin", email: "camille@ateliertalent.fr", role: "recruiter", title: "Senior Recruiter, Product & Design", status: "active", invitedOn: ago(45), joinedOn: ago(44) },
  ];
  s.session = { signedIn: true, recruiterId: "rc_vincent", provider: "google", scopes: IDENTITY_SCOPES.google, signedInOn: ago(62) };

  const fin: Niche = {
    id: "ni_fintech",
    ownerId: "rc_vincent",
    name: "Fintech backend engineers - Series A-C - Paris",
    nameCustomised: false,
    status: "active",
    profile: finProfile(),
    schedule: { days: ["mon", "tue", "wed", "thu", "fri"], time: "07:00", prospectsPerRun: 25, candidatesPerRun: 40 },
    setupMessages: [],
    setupComplete: true,
    setupStage: "done",
    testRun: null,
    lastRunOn: ago(3),
    createdOn: ago(61),
    activatedOn: ago(58),
  };
  const health: Niche = {
    id: "ni_health",
    ownerId: "rc_camille",
    name: "Healthtech product designers - remote EU",
    // Camille shortened the generated name ("... - Seed to Series B - remote EU").
    nameCustomised: true,
    status: "active",
    profile: healthProfile(),
    schedule: { days: ["mon", "wed", "fri"], time: "07:30", prospectsPerRun: 15, candidatesPerRun: 20 },
    setupMessages: [],
    setupComplete: true,
    setupStage: "done",
    testRun: null,
    lastRunOn: ago(3),
    createdOn: ago(43),
    activatedOn: ago(41),
  };
  s.niches = [fin, health];
  fin.setupMessages = [
    { id: newId("sm"), role: "agent", text: "Hi Vincent, I'm the setup agent. Describe the placements you make: sectors, roles, locations and seniority.", on: ago(61), suggestions: [], updatedFields: [] },
    { id: newId("sm"), role: "recruiter", text: "I place senior backend engineers in Series A to C fintechs in Paris", on: ago(61), suggestions: [], updatedFields: [] },
    { id: newId("sm"), role: "agent", text: "Got it. Which company sizes do you usually place into?", on: ago(61), suggestions: [], updatedFields: ["sectors", "roleTypes", "locations", "seniority", "fundingStages"] },
    { id: newId("sm"), role: "recruiter", text: "20 to 300 people", on: ago(61), suggestions: [], updatedFields: [] },
    { id: newId("sm"), role: "agent", text: "Noted. What makes a Candidate a good Fit for you beyond the title?", on: ago(61), suggestions: [], updatedFields: ["companySize"] },
    { id: newId("sm"), role: "recruiter", text: fin.profile.candidateProfile, on: ago(61), suggestions: [], updatedFields: [] },
    { id: newId("sm"), role: "agent", text: "Your Niche Profile is drafted. Review it, then launch your free Test Run.", on: ago(61), suggestions: [], updatedFields: ["candidateProfile", "searchStrategy", "name"] },
  ];

  // Prospects (shared company data) and their Hiring Contacts.
  const P: Record<string, Prospect> = {};
  const HC: Record<string, HiringContact> = {};
  for (const spec of PROSPECTS) {
    const niche = spec.niche === "fin" ? fin : health;
    const p = createProspect(s, niche.id, spec.seed, ago(onSchedule(niche, spec.surfacedAgo)));
    P[spec.key] = p;
    spec.contacts.forEach(([name, title], i) => {
      const h = createHiringContact(s, p, { name, title, rank: i + 1, location: p.location, language: p.location.endsWith("France") ? "fr" : "en", yearsInRole: 2 + i }, p.surfacedOn);
      HC[name] = h;
    });
  }

  // Hand-written Candidates.
  const C: Record<string, Candidate> = {};
  const addCand = (niche: Niche, seed: CandidateSeed, surfacedAgo: number) => {
    const c = createCandidate(s, niche.id, seed, ago(onSchedule(niche, surfacedAgo)));
    C[seed.name] = c;
    return c;
  };
  addCand(fin, cand("Léa Morel", "Paris, France", "Senior Backend Engineer (Go)", "Coralis Bank", "Fintech", 28, 8, ["Go", "PostgreSQL", "Kafka", "gRPC"], [["Mondia Pay", "Payments", "Backend Engineer", 30], ["Datavelle", "SaaS", "Software Engineer", 20]], [["employer_turbulence", 12, "Coralis Bank lost its CTO"], ["tenure_sweet_spot", 20]]), 8);
  addCand(fin, cand("Hugo Lefèvre", "Paris, France", "Staff Software Engineer - Payments", "Orbipay", "Payments", 34, 11, ["Kotlin", "Event sourcing", "PostgreSQL", "AWS"], [["Banque Orsay", "Banking", "Software Engineer", 40]], [["tenure_sweet_spot", 40]]), 7);
  addCand(fin, cand("Inès Benali", "Paris, France", "Senior Backend Engineer", "Nexaro", "Fintech", 26, 7, ["Python", "PostgreSQL", "Kafka", "Kubernetes"], [["Kordo", "Fintech", "Backend Engineer", 28]], [["employer_turbulence", 30, "Nexaro froze hiring for two quarters"], ["tenure_sweet_spot", 35]]), 12);
  addCand(fin, cand("Arthur Roche", "Paris, France", "Lead Backend Developer", "Banque Orsay", "Banking", 44, 12, ["Kotlin", "Kafka", "AWS"], [["Vantiel", "Banking", "Developer", 36]], [["title_stagnation", 50], ["employer_turbulence", 15, "Banque Orsay announced a restructuring"]]), 9);
  addCand(fin, cand("Sarah Dumont", "Paris, France", "Senior Platform Engineer", "Trelliq", "Fintech", 22, 6, ["Go", "Kubernetes", "AWS", "PostgreSQL"], [["Lumicor", "SaaS", "DevOps Engineer", 26]], [["tenure_sweet_spot", 10]]), 11);
  addCand(fin, cand("Nathan Picard", "Paris, France", "Senior Backend Engineer (Kotlin)", "Selvane", "Payments", 30, 9, ["Kotlin", "gRPC", "PostgreSQL"], [["Brumeo", "E-commerce", "Software Engineer", 32]], [["tenure_sweet_spot", 25], ["employer_turbulence", 40, "Selvane postponed its funding round"]]), 6);
  addCand(fin, cand("Chloé Aubert", "Paris, France", "Senior Backend Engineer", "Kordo", "Fintech", 20, 6, ["Go", "PostgreSQL", "Kafka"], [["Atrium Labs", "SaaS", "Backend Engineer", 30]], [["tenure_sweet_spot", 5]]), 5);
  addCand(fin, cand("Maxime Riviere", "Paris, France", "Staff Software Engineer", "Vantiel", "Banking", 38, 13, ["Go", "Event sourcing", "Kafka", "AWS"], [["Mondia Pay", "Payments", "Senior Software Engineer", 36]], [["title_stagnation", 20], ["employer_turbulence", 18, "Vantiel was acquired by a larger group"]]), 4);
  addCand(fin, cand("Florian Tessier", "Paris, France", "Senior Backend Engineer", "Mondia Pay", "Payments", 25, 7, ["Python", "PostgreSQL", "AWS"], [["Datavelle", "SaaS", "Software Engineer", 24]], [["tenure_sweet_spot", 14]]), 22);
  addCand(health, cand("Freya Lindqvist", "Stockholm, Sweden", "Senior Product Designer", "Medvia", "Healthtech", 27, 8, ["Figma", "Design systems", "User research", "B2B SaaS"], [["Pixelharbor", "Agency", "Product Designer", 34]], [["tenure_sweet_spot", 15], ["employer_turbulence", 21, "Medvia lost its CTO"]]), 10);

  // Generated Candidates, kept only above the Fit threshold.
  const genCand = (niche: Niche, daysAgo: number, roleTitle?: string, roleId?: string, location?: string) => {
    // Sourcing for a Detected Role is asked by a Recruiter, any day; scheduled runs follow the Niche's days.
    const surfacedAgo = roleId ? daysAgo : onSchedule(niche, daysAgo);
    for (let i = 0; i < 25; i++) {
      const c = createCandidate(s, niche.id, generateCandidateSeed(s, niche, rng, { roleTitle, location }), ago(surfacedAgo), roleId ?? null);
      if (c.fit.aboveThreshold) return c;
      s.candidates = s.candidates.filter((x) => x.id !== c.id);
    }
    return createCandidate(s, niche.id, generateCandidateSeed(s, niche, rng, { roleTitle }), ago(surfacedAgo), roleId ?? null);
  };
  const fintoryRole = s.detectedRoles.find((r) => r.prospectId === P.fintory.id)!;
  const sourced = [3, 3, 3].map((a) => genCand(fin, a, fintoryRole.title, fintoryRole.id, "Paris, France"));
  fintoryRole.sourcedCandidateIds = sourced.map((c) => c.id);
  fintoryRole.sourcing = { status: "done", jobId: null, lastSourcedOn: ago(3) };
  const finEnriched = [genCand(fin, 15), genCand(fin, 17)];
  const finDismissed = [genCand(fin, 13), genCand(fin, 19)];
  for (const a of [24, 21, 18, 16, 14, 10, 6, 2, 1, 1]) genCand(fin, a);
  const healthEnriched = [genCand(health, 12), genCand(health, 6)];
  const healthDismissed = [genCand(health, 15)];
  for (const a of [23, 20, 17, 13, 9, 8, 5, 3, 2, 1]) genCand(health, a);

  // Generated Hiring Contacts for Prospects without hand-written ones; extra ones elsewhere.
  for (const spec of PROSPECTS) {
    const p = P[spec.key];
    const niche = spec.niche === "fin" ? fin : health;
    const missing = spec.contacts.length === 0 ? rng.int(1, 3) : spec.contacts.length === 1 && rng.chance(0.5) ? 1 : 0;
    if (missing > 0) {
      const seeds = generateHiringContactSeeds(s, niche, p, missing + spec.contacts.length, rng).slice(spec.contacts.length);
      for (const sd of seeds) createHiringContact(s, p, sd, p.surfacedOn);
    }
  }

  // Enrichment (contact values with Provenance).
  const enrichHC = (name: string, foundAgo: number, mobile = false) => {
    const h = HC[name];
    seedValue(s, h, "hiring_contact", "email", foundAgo);
    if (mobile) seedValue(s, h, "hiring_contact", "mobile", foundAgo);
    h.lifecycle = "enriched";
    return h;
  };
  const enrichC = (c: Candidate, foundAgo: number, mobile = false) => {
    seedValue(s, c, "candidate", "email", foundAgo);
    if (mobile) seedValue(s, c, "candidate", "mobile", foundAgo);
    c.lifecycle = "enriched";
    return c;
  };
  enrichHC("Julien Garnier", 5, true);
  for (const n of ["Nora Haddad", "Adrien Lacroix", "Élise Marchand", "Rayan Mercier", "Margaux Fontaine", "Océane Leroy", "Mehdi Lemaire", "Thomas Perrin", "Pauline Masson", "Quentin Brunet", "Romain Colin", "Damien Joly", "Antoine Poirier"]) enrichHC(n, 15);
  enrichHC("Lukas Meyer", 6);
  enrichHC("Zoé Faure", 8, true);
  for (const n of ["Léa Morel", "Hugo Lefèvre", "Inès Benali", "Arthur Roche", "Sarah Dumont", "Nathan Picard", "Chloé Aubert", "Maxime Riviere", "Florian Tessier"]) enrichC(C[n], 11, n === "Léa Morel");
  enrichC(C["Freya Lindqvist"], 7, true);
  finEnriched.forEach((c, i) => enrichC(c, 3 + i));
  healthEnriched.forEach((c, i) => enrichC(c, 2 + i, i === 0));

  // Dismissals.
  finDismissed[0].lifecycle = "dismissed";
  finDismissed[0].dismissReason = "already_known";
  finDismissed[0].dismissNote = "Placed by us in 2024";
  finDismissed[1].lifecycle = "dismissed";
  finDismissed[1].dismissReason = "not_a_fit";
  healthDismissed[0].lifecycle = "dismissed";
  healthDismissed[0].dismissReason = "wrong_location";
  P.bancobo.status = "dismissed";
  P.bancobo.dismissReason = "wrong_size";
  P.bancobo.dismissNote = "Over 300 people and cutting staff";

  // Sending Mailboxes and domains.
  s.sendingDomains = [
    { domain: "ateliertalent-hq.com", registeredOn: ago(40), registeredFor: "Atelier Talent", provider: "google", assisted: true, dailyCap: 60, sentToday: 0, dns: { spf: true, dkim: true, dmarc: true } },
    { domain: "getateliertalent.com", registeredOn: ago(5), registeredFor: "Atelier Talent", provider: "google", assisted: true, dailyCap: 60, sentToday: 0, dns: { spf: true, dkim: true, dmarc: true } },
  ];
  s.mailboxes = [
    { id: "mb_hq_vincent", recruiterId: "rc_vincent", address: "vincent@ateliertalent-hq.com", displayName: "Vincent Baron", provider: "google", domain: "ateliertalent-hq.com", health: { spf: true, dkim: true, dmarc: true, domainAgeDays: 40, blocklisted: false, inboxPlacement: 94 }, rampDay: 26, dailyCap: 30, sentToday: 0, sentTotal: 212, bouncesTotal: 3, bounceRate: 1.4, status: "active", statusReason: null, connectedOn: ago(25), setup: "assisted", alreadyWarmed: false },
    { id: "mb_get_vincent", recruiterId: "rc_vincent", address: "vincent.baron@getateliertalent.com", displayName: "Vincent Baron", provider: "google", domain: "getateliertalent.com", health: { spf: true, dkim: true, dmarc: true, domainAgeDays: 5, blocklisted: false, inboxPlacement: 88 }, rampDay: 6, dailyCap: rampCap(6), sentToday: 0, sentTotal: 34, bouncesTotal: 0, bounceRate: 0, status: "warming", statusReason: "New mailbox: ramping up from 5 emails a day, measured with our seed mailboxes.", connectedOn: ago(5), setup: "assisted", alreadyWarmed: false },
    { id: "mb_hq_camille", recruiterId: "rc_camille", address: "camille@ateliertalent-hq.com", displayName: "Camille Martin", provider: "google", domain: "ateliertalent-hq.com", health: { spf: true, dkim: true, dmarc: true, domainAgeDays: 40, blocklisted: false, inboxPlacement: 81 }, rampDay: 30, dailyCap: 30, sentToday: 0, sentTotal: 96, bouncesTotal: 4, bounceRate: 4.2, status: "paused", statusReason: `Paused automatically on 9 Oct 2026: bounce rate 4.2% (threshold 3%).`, connectedOn: ago(30), setup: "assisted", alreadyWarmed: false },
    { id: "mb_main_vincent", recruiterId: "rc_vincent", address: "vincent@ateliertalent.fr", displayName: "Vincent Baron", provider: "google", domain: "ateliertalent.fr", health: { spf: true, dkim: true, dmarc: false, domainAgeDays: 2900, blocklisted: false, inboxPlacement: null }, rampDay: 0, dailyCap: 0, sentToday: 0, sentTotal: 0, bouncesTotal: 0, bounceRate: 0, status: "refused", statusReason: "ateliertalent.fr is a Main Domain of Atelier Talent. Campaign emails are never sent from a Main Domain, so a cold-email complaint can never hurt your everyday email. Use a lookalike domain instead.", connectedOn: ago(26), setup: "connected", alreadyWarmed: true },
  ];

  // Campaigns.
  const c1: Campaign = {
    id: "cp_hc_q4",
    nicheId: fin.id,
    ownerId: "rc_vincent",
    name: "Fintech CTOs - Q4 backend hiring",
    audience: "hiring_contacts",
    brief: { angle: "I place senior backend engineers with fintech teams in Paris, and two strong Go engineers are available now", callToAction: "a 15-minute call this week", detectedRoleId: null },
    sequence: [
      { step: 1, delayDays: 0, instruction: "First email, one Signal as the hook" },
      { step: 2, delayDays: 4, instruction: "Short nudge with one new fact" },
      { step: 3, delayDays: 7, instruction: "Last note, easy way out" },
    ],
    sendingWindow: { days: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "17:30", recipientTimezone: true },
    autonomy: "review_first_n",
    // 10 first emails are already approved or sent: 2 drafts still wait in the review queue.
    reviewFirstN: 15,
    mailboxIds: ["mb_hq_vincent", "mb_get_vincent"],
    autoAddRule: { minSignalStrength: 60 },
    status: "active",
    createdOn: ago(17),
    launchedOn: ago(14),
    sendingBlocked: null,
  };
  const c2: Campaign = {
    id: "cp_cand_backend",
    nicheId: fin.id,
    ownerId: "rc_vincent",
    name: "Senior backend engineers open to a move",
    audience: "candidates",
    brief: { angle: "I work with Series A-C fintechs in Paris hiring senior backend engineers, with salary bands shared upfront", callToAction: "a 20-minute call this week", detectedRoleId: fintoryRole.id },
    sequence: [
      { step: 1, delayDays: 0, instruction: "First email with the Detected Role" },
      { step: 2, delayDays: 5, instruction: "Short follow-up" },
    ],
    sendingWindow: { days: ["mon", "tue", "wed", "thu", "fri"], start: "09:30", end: "18:30", recipientTimezone: true },
    autonomy: "review_all",
    reviewFirstN: 5,
    mailboxIds: ["mb_hq_vincent"],
    autoAddRule: null,
    status: "active",
    createdOn: ago(12),
    launchedOn: ago(10),
    sendingBlocked: null,
  };
  const c3: Campaign = {
    id: "cp_camille_design",
    nicheId: health.id,
    ownerId: "rc_camille",
    name: "Senior product designers - healthtech Q4",
    audience: "candidates",
    brief: { angle: "I work with healthtech teams across Europe hiring senior product designers, fully remote", callToAction: "a short call next week", detectedRoleId: null },
    sequence: [
      { step: 1, delayDays: 0, instruction: "First email" },
      { step: 2, delayDays: 6, instruction: "Short follow-up" },
    ],
    sendingWindow: { days: ["mon", "tue", "wed", "thu"], start: "10:00", end: "17:00", recipientTimezone: true },
    autonomy: "review_all",
    reviewFirstN: 5,
    mailboxIds: ["mb_hq_camille"],
    autoAddRule: null,
    status: "draft",
    createdOn: ago(3),
    launchedOn: null,
    sendingBlocked: null,
  };
  s.campaigns = [c1, c2, c3];

  const addRecipient = (
    campaign: Campaign,
    person: HiringContact | Candidate,
    kind: "hiring_contact" | "candidate",
    state: RecipientState,
    sentAgo: number[],
    opts: { addedAgo: number; nextSendIn?: number | null; nextApproved?: boolean; stopReason?: string; mailboxId?: string },
  ): Recipient => {
    const mailboxId = opts.mailboxId ?? campaign.mailboxIds[0];
    const mb = s.mailboxes.find((m) => m.id === mailboxId)!;
    const email = person.contactValues.find((v) => v.kind !== "mobile");
    const r: Recipient = {
      id: newId("rcp"),
      campaignId: campaign.id,
      personKind: kind,
      personId: person.id,
      personLabel: person.name,
      personDeleted: false,
      prospectId: kind === "hiring_contact" ? (person as HiringContact).prospectId : null,
      mailboxId,
      state,
      currentStep: sentAgo.length,
      messages: [],
      stopReason: opts.stopReason ?? null,
      addedOn: ago(opts.addedAgo),
      nextSendOn: opts.nextSendIn === undefined || opts.nextSendIn === null ? null : addDays(today, opts.nextSendIn),
      pausedUntil: null,
      toAddress: email?.value ?? null,
    };
    sentAgo.forEach((a, i) => {
      const m = withDate(s, a, () => draftMessage(s, campaign, person, kind, i + 1, mb.address));
      m.status = "sent";
      m.sentOn = ago(a);
      if (i === 0 && kind === "hiring_contact" && campaign.id === "cp_hc_q4" && person.name === "Margaux Fontaine") {
        m.originalBody = m.body;
        m.body = m.body.replace(/\n\n[^\n]*\?\n\n/, `\n\n${fr("Un appel de 15 minutes jeudi ou vendredi ?")}\n\n`);
        m.editedByRecruiter = m.body !== m.originalBody;
        if (!m.editedByRecruiter) m.originalBody = null;
      }
      r.messages.push(m);
    });
    const nextStep = campaign.sequence.find((st) => st.step === sentAgo.length + 1);
    if (nextStep && (state === "awaiting_review" || state === "scheduled" || state === "sent")) {
      const m = draftMessage(s, campaign, person, kind, nextStep.step, mb.address);
      m.status = opts.nextApproved === false || state === "awaiting_review" ? "draft" : "approved";
      r.messages.push(m);
    }
    person.claim = makeClaim(s, campaign.ownerId, campaign.id);
    person.claim.since = ago(opts.addedAgo);
    const lastActivity = sentAgo.length > 0 ? Math.min(...sentAgo) : opts.addedAgo;
    person.claim.lastActivityOn = ago(lastActivity);
    person.claim.expiresOn = addDays(ago(lastActivity), 90);
    if (sentAgo.length > 0) {
      person.lifecycle = "contacted";
      if (kind === "candidate") {
        const c = person as Candidate;
        // Kept until 90 days after the first email, as the Article 14 Notice says.
        c.article14NoticeSentOn = ago(Math.max(...sentAgo));
        c.deleteOn = null;
        c.retainUntil = addDays(ago(Math.max(...sentAgo)), RETENTION.contactedNoConsentDays);
      }
    }
    if (kind === "hiring_contact") {
      const p = s.prospects.find((x) => x.id === (person as HiringContact).prospectId);
      if (p && p.status === "surfaced" && state !== "stopped") p.status = "in_campaign";
    }
    s.recipients.push(r);
    return r;
  };

  // Campaign 1 to Hiring Contacts: every recipient state. Every send, reply and response is on a
  // weekday (today is Monday 12 Oct), and follow-ups keep the Sequence's delays. Today's sending pass
  // runs below, as it did when the day started: the first emails approved today (Élise, Rayan and
  // Maxime) leave on the next one, Tuesday 13 Oct.
  addRecipient(c1, HC["Nora Haddad"], "hiring_contact", "awaiting_review", [], { addedAgo: 0 });
  addRecipient(c1, HC["Adrien Lacroix"], "hiring_contact", "awaiting_review", [], { addedAgo: 0 });
  addRecipient(c1, HC["Élise Marchand"], "hiring_contact", "scheduled", [], { addedAgo: 3, nextSendIn: 1 });
  addRecipient(c1, HC["Rayan Mercier"], "hiring_contact", "scheduled", [], { addedAgo: 3, nextSendIn: 1, mailboxId: "mb_get_vincent" });
  addRecipient(c1, HC["Margaux Fontaine"], "hiring_contact", "sent", [3], { addedAgo: 5, nextSendIn: 1 });
  addRecipient(c1, HC["Océane Leroy"], "hiring_contact", "sent", [10, 6], { addedAgo: 11, nextSendIn: 1 });
  addRecipient(c1, HC["Mehdi Lemaire"], "hiring_contact", "sent", [3], { addedAgo: 4, nextSendIn: 1, mailboxId: "mb_get_vincent" });
  const rThomas = addRecipient(c1, HC["Thomas Perrin"], "hiring_contact", "sent", [7, 3], { addedAgo: 13, nextSendIn: 4 });
  const rPauline = addRecipient(c1, HC["Pauline Masson"], "hiring_contact", "sent", [7], { addedAgo: 13, nextSendIn: -3 });
  const rQuentin = addRecipient(c1, HC["Quentin Brunet"], "hiring_contact", "sent", [5], { addedAgo: 12, nextSendIn: 0 });
  const rRomain = addRecipient(c1, HC["Romain Colin"], "hiring_contact", "sent", [6], { addedAgo: 12, nextSendIn: 0 });
  const rDamien = addRecipient(c1, HC["Damien Joly"], "hiring_contact", "sent", [3], { addedAgo: 4, nextSendIn: 4 });
  addRecipient(c1, HC["Antoine Poirier"], "hiring_contact", "stopped", [], { addedAgo: 10, stopReason: "Removed from the Campaign by Vincent Baron" });
  HC["Antoine Poirier"].claim = null;

  // Campaign 2 to Candidates.
  const rLea = addRecipient(c2, C["Léa Morel"], "candidate", "sent", [5], { addedAgo: 7, nextSendIn: 0, nextApproved: false });
  const rHugo = addRecipient(c2, C["Hugo Lefèvre"], "candidate", "sent", [4], { addedAgo: 7, nextSendIn: 1, nextApproved: false });
  const rInes = addRecipient(c2, C["Inès Benali"], "candidate", "sent", [10], { addedAgo: 10, nextSendIn: -5 });
  addRecipient(c2, C["Arthur Roche"], "candidate", "sent", [4], { addedAgo: 7, nextSendIn: 1, nextApproved: false });
  addRecipient(c2, C["Sarah Dumont"], "candidate", "sent", [10, 5], { addedAgo: 10 });
  addRecipient(c2, C["Nathan Picard"], "candidate", "sent", [3], { addedAgo: 5, nextSendIn: 2, nextApproved: false });
  addRecipient(c2, C["Chloé Aubert"], "candidate", "awaiting_review", [], { addedAgo: 0 });
  addRecipient(c2, C["Maxime Riviere"], "candidate", "scheduled", [], { addedAgo: 3, nextSendIn: 1 });

  // Camille's draft Campaign: one Candidate claimed by Camille.
  addRecipient(c3, C["Freya Lindqvist"], "candidate", "awaiting_review", [], { addedAgo: 3 });

  // Replies (generated at their dates so every automatic effect is applied).
  const reply = (r: Recipient, cat: ReplyCategory, daysAgo: number) => withDate(s, daysAgo, () => applyReply(s, r, cat));
  const inesReply = reply(rInes, "interested", 7);
  reply(rQuentin, "out_of_office", 4);
  reply(rRomain, "referral", 3);
  reply(rPauline, "not_interested", 3);
  // Hugo opts out: his data is deleted at once and only the hash stays on the Suppression List (ADR-0019).
  reply(rHugo, "opt_out", 3);
  reply(rDamien, "bounce", 3);
  reply(rThomas, "not_now", 0);
  reply(rLea, "interested", 0);

  // Inès: response sent with the Consent Page link, then Talent Pool consent.
  inesReply.handled = true;
  inesReply.responseSentOn = ago(6);
  inesReply.responseBody = inesReply.draftResponse;
  const token = inesReply.consentToken ?? consentToken(inesReply.id);
  const inesToken = s.consentTokens.find((t) => t.token === token);
  if (inesToken) {
    inesToken.usedOn = ago(4);
    inesToken.choice = "talent_pool";
  }
  const ines = C["Inès Benali"];
  ines.consent = "talent_pool";
  ines.consentRecordedOn = ago(4);
  ines.retainUntil = addYears(ago(4), 2);
  ines.lifecycle = "consented";
  ines.deleteOn = null;
  rInes.messages.push({
    id: newId("msg"),
    step: 1,
    language: "fr",
    subject: inesReply.subject,
    body: inesReply.draftResponse ?? "",
    footer: rInes.messages[0].footer,
    status: "sent",
    sentOn: ago(6),
    editedByRecruiter: false,
    originalBody: null,
    origin: "response",
  });

  // Test Runs (both done, labelled).
  const finProspects = ["fintory", "ledgerwise", "paymiel", "kapsula", "tresoria", "billora", "clearmint", "kreditio", "bancobo", "monarelle"].map((k) => P[k]);
  const finLabels: Record<string, "good" | "bad" | null> = { fintory: "good", ledgerwise: "good", paymiel: "good", kapsula: null, tresoria: "good", billora: "good", clearmint: "good", kreditio: "bad", bancobo: "bad", monarelle: null };
  fin.testRun = {
    id: "tr_fin",
    status: "done",
    free: true,
    startedAtMs: 0,
    startedOn: ago(60),
    completedOn: ago(60),
    step: TEST_RUN_STEPS.length,
    progress: 1,
    steps: initialSteps(TEST_RUN_STEPS).map((st) => ({ ...st, status: "done" as const, detail: "Done" })),
    items: [
      ...finProspects.map((p) => ({ id: newId("ti"), kind: "prospect" as const, prospectId: p.id, candidateId: null, previewId: null, label: finLabels[Object.keys(P).find((k) => P[k] === p) ?? ""] ?? null })),
      ...[C["Inès Benali"], C["Arthur Roche"], C["Sarah Dumont"], C["Maxime Riviere"]].map((c, i) => ({ id: newId("ti"), kind: "candidate" as const, prospectId: null, candidateId: c.id, previewId: null, label: i === 3 ? null : ("good" as const) })),
    ],
    adjustments: [
      { id: "adj_size_300", title: "Lower the maximum company size to 300", rationale: "2 of the Prospects you marked bad have more than 300 people.", from: "20-500 people", to: "20-300 people", change: { kind: "company_size", min: 20, max: 300 }, status: "accepted" },
      { id: "adj_w_funding_round_45", title: 'Increase the weight of "Funding round" to 45', rationale: "67% of the Prospects you marked good have this Signal, against 0% of the bad ones.", from: "35 points", to: "45 points", change: { kind: "signal_weight", signalType: "funding_round", weight: 45 }, status: "dismissed" },
    ],
    creditsCharged: 0,
    stats: { searched: 52, signalsExtracted: 148, aboveThreshold: 21, shown: 10, hiringContactsFound: 17 },
  };
  const healthProspects = ["carevia", "medilune", "nurseo", "vitalune", "healora", "clinicalm", "orthoverse", "dokara", "pulsewise"].map((k) => P[k]);
  health.testRun = {
    id: "tr_health",
    status: "done",
    free: false,
    startedAtMs: 0,
    startedOn: ago(42),
    completedOn: ago(42),
    step: TEST_RUN_STEPS.length,
    progress: 1,
    steps: initialSteps(TEST_RUN_STEPS).map((st) => ({ ...st, status: "done" as const, detail: "Done" })),
    items: [
      ...healthProspects.map((p, i) => ({ id: newId("ti"), kind: "prospect" as const, prospectId: p.id, candidateId: null, previewId: null, label: i === 7 ? ("bad" as const) : i < 5 ? ("good" as const) : null })),
      ...[C["Freya Lindqvist"], ...healthEnriched].map((c) => ({ id: newId("ti"), kind: "candidate" as const, prospectId: null, candidateId: c.id, previewId: null, label: "good" as const })),
    ],
    adjustments: [
      { id: "adj_fit_55", title: "Lower the Fit threshold to 55", rationale: "Several designers you marked good were just under 60.", from: "60", to: "55", change: { kind: "fit_threshold", value: 55 }, status: "accepted" },
    ],
    creditsCharged: 20,
    stats: { searched: 38, signalsExtracted: 97, aboveThreshold: 16, shown: 9, hiringContactsFound: 12 },
  };

  // Voice Profiles.
  s.mailboxScanConsents = [{ recruiterId: "rc_vincent", provider: "google", scopes: VOICE_SCAN_SCOPES.google, grantedOn: ago(58), revokedOn: null }];
  s.voiceProfiles = [
    {
      id: "vp_vincent_fr",
      recruiterId: "rc_vincent",
      language: "fr",
      source: "mailbox_scan",
      styleGuide: [
        "Opens with « Bonjour » and the first name, never « Cher » or « Madame, Monsieur »",
        "Three short paragraphs, under 120 words",
        "One concrete fact about the company in the first sentence",
        "Uses « vous », never « tu », in first emails",
        "Ends with one question proposing a short call",
        "Signs off with « Belle journée, » and the first name only",
      ],
      // The same examples a mailbox scan finds, so a rescan replaces them instead of adding near-duplicates.
      examples: scannedExamples("fr", "Vincent"),
      learnedFromEdits: [
        {
          id: newId("le"),
          on: ago(6),
          campaignId: c1.id,
          before: fr("J'accompagne des équipes fintech à Paris sur le recrutement de Senior Backend Engineers, et deux candidat(e)s Go solides sont disponibles en ce moment. N'hésitez pas à me dire si vous souhaitez en savoir plus !"),
          after: "Deux candidat(e)s Go seniors sont disponibles en ce moment.",
          lesson: "Keeps French emails shorter: cut 64% of the draft",
        },
        { id: newId("le"), on: ago(3), campaignId: c1.id, before: fr("Seriez-vous disponible pour un appel de 15 minutes cette semaine ?"), after: fr("Un appel de 15 minutes jeudi ou vendredi ?"), lesson: "Proposes two concrete days instead of an open question" },
      ],
      emailsAnalysed: 214,
      updatedOn: ago(3),
    },
    {
      id: "vp_vincent_en",
      recruiterId: "rc_vincent",
      language: "en",
      source: "pasted_examples",
      styleGuide: [
        'Opens with "Hi" and the first name',
        "Short paragraphs, under 110 words",
        "Mentions one Signal (funding, posting, new leader) as the reason for writing",
        "Ends with a single question proposing a call",
        'Signs off with "Best," and the first name',
      ],
      // Pasted by Vincent (not from a scan): a scan would add its own examples next to these.
      examples: [
        { subject: "Platform team in Dublin", body: "Hi Aoife,\n\nSaw the new VP Engineering joined last month. New engineering leaders often rebuild the platform team first, and I know two senior Go engineers who just left a payments scale-up.\n\nOpen to a short call on Thursday?\n\nBest,\nVincent", origin: "pasted" },
        { subject: "Your Kotlin hire", body: "Hi Pieter,\n\nYour Senior Kotlin Engineer role was reposted this week. I recruit only backend engineers for fintechs, and I can introduce three candidates who have shipped card platforms.\n\nWould a 15-minute call help?\n\nBest,\nVincent", origin: "pasted" },
      ],
      learnedFromEdits: [{ id: newId("le"), on: ago(9), campaignId: null, before: "I hope this email finds you well!", after: "", lesson: "Never opens with pleasantries" }],
      emailsAnalysed: 2,
      updatedOn: ago(9),
    },
  ];

  // API Keys.
  s.apiKeys = [
    { id: "ak_crm", name: "CRM sync", recruiterId: "rc_vincent", prefix: "ar_live_7Hk2", createdOn: ago(30), createdById: "rc_vincent", lastUsedOn: ago(1), revokedOn: null },
    { id: "ak_export", name: "Weekly export script", recruiterId: "rc_camille", prefix: "ar_live_Qm9x", createdOn: ago(40), createdById: "rc_vincent", lastUsedOn: ago(13), revokedOn: ago(12) },
  ];

  // Data Requests: one open (due in 9 days), one completed.
  const florian = C["Florian Tessier"];
  s.dataRequests = [
    { id: "dr_florian", personQuery: "Florian Tessier", requesterEmail: florian.contactValues[0]?.value ?? "florian.tessier@postelle.eu", channel: "email", receivedOn: ago(21), dueOn: addDays(ago(21), 30), kind: "access", status: "open", resolution: null, completedOn: null, matches: [{ kind: "candidate", id: florian.id }], deletedCandidate: false },
    // A Candidate who chose "Delete my data": the request no longer names them (ADR-0019).
    { id: "dr_old", personQuery: "Deleted Candidate", requesterEmail: "", channel: "consent_page", receivedOn: ago(48), dueOn: addDays(ago(48), 30), kind: "delete", status: "completed", resolution: "Deleted the Candidate record. Only the email hash is kept on the Suppression List, so they are never contacted again.", completedOn: ago(45), matches: [], deletedCandidate: true },
  ];

  // Suppression List: 4 entries (the opt-out reply above added one).
  s.suppressionList.push(
    { id: newId("sup"), hash: hashValue("mathis.girard@kourriel.fr"), kind: "email", addedOn: ago(45), reason: "data_request_delete", scope: "all_workspaces", addedBy: "this_workspace" },
    { id: newId("sup"), hash: hashValue("j.keller@postelle.eu"), kind: "email", addedOn: ago(30), reason: "opt_out", scope: "all_workspaces", addedBy: "another_workspace" },
    { id: newId("sup"), hash: hashValue("ombrapay.io"), kind: "domain", addedOn: ago(70), reason: "opt_out", scope: "all_workspaces", addedBy: "another_workspace" },
  );
  s.suppressionList.sort((a, b) => (a.addedOn < b.addedOn ? 1 : -1));

  // Today's day-start sending pass has run: it sends Damien Joly's email again to the address found
  // after Friday's bounce, and nothing else is due today. Its Credit charge is replaced by the ledger
  // history built below.
  const noticesBeforePass = s.notices.length;
  sendingPass(s);
  assertDayStartPassRan(s, noticesBeforePass);

  // The ramping mailbox: connected on Wednesday 7 Oct (ramp day 1), so it has had three sending days
  // whose caps add up to 19 emails. Its total stays within them.
  const getMailbox = s.mailboxes.find((m) => m.id === "mb_get_vincent")!;
  const sentFromGet = s.recipients.filter((r) => r.mailboxId === getMailbox.id).flatMap((r) => r.messages).filter((m) => m.status === "sent").length;
  let rampCapacity = 0;
  for (let d = getMailbox.connectedOn; d < today; d = addDays(d, 1)) if (!isWeekend(d)) rampCapacity += rampCap(diffDays(d, getMailbox.connectedOn) + 1);
  getMailbox.sentTotal = Math.max(sentFromGet, rampCapacity - 2);
  getMailbox.bounceRate = Math.round((1000 * getMailbox.bouncesTotal) / Math.max(getMailbox.sentTotal, 1)) / 10;

  // Credits ledger and agent runs history (balance ends at 1 840).
  buildLedger(s, fin, health, rng);

  // History events, then the Digest for today.
  const history: [number, string, string, string][] = [
    [62, "Vincent Baron", "Signed up with Google (identity scopes only)", "Atelier Talent"],
    [62, "Vincent Baron", "Declared a Main Domain", "ateliertalent.fr"],
    [61, "Vincent Baron", "Created a Niche", fin.name],
    [60, "Prospection Agent", "Test Run completed", testRunAuditTarget(fin, SEED_TEST_RUN_CANDIDATES.fin)],
    [58, "Vincent Baron", "Granted read-only mailbox access for the Voice Profile", "Gmail, sent folder only"],
    [58, "Vincent Baron", "Activated a Niche", fin.name],
    [45, "Vincent Baron", "Invited a Recruiter", "Camille Martin"],
    [45, "Vincent Baron", "Completed a Data Request (delete)", "Candidate deleted, hash kept"],
    [43, "Camille Martin", "Created a Niche", health.name],
    [42, "Prospection Agent", "Test Run completed", testRunAuditTarget(health, SEED_TEST_RUN_CANDIDATES.health)],
    [41, "Camille Martin", "Activated a Niche", health.name],
    [40, "System", "Assisted setup completed", "ateliertalent-hq.com: 2 Sending Mailboxes"],
    [30, "Vincent Baron", "Created an API Key", "CRM sync (acts for Vincent Baron)"],
    [26, "System", "Sending Mailbox refused: Main Domain", "vincent@ateliertalent.fr"],
    [21, "System", "Data Request received (access)", "Florian Tessier"],
    [14, "Vincent Baron", "Launched a Campaign", c1.name],
    [12, "Vincent Baron", "Revoked an API Key", "Weekly export script"],
    [10, "Vincent Baron", "Launched a Campaign", c2.name],
    [5, "System", "Assisted setup completed", "getateliertalent.com: 1 Sending Mailbox"],
    [6, "Vincent Baron", "Sent a response", "Inès Benali"],
    [4, "Candidate (Consent Page)", "Joined the Talent Pool", "Inès Benali"],
    [3, "System", "Sending Mailbox paused automatically", "camille@ateliertalent-hq.com: bounce rate 4.2% (threshold 3%)"],
    [3, "Camille Martin", "Added to a Campaign (Claim taken)", "Freya Lindqvist"],
    [3, "Vincent Baron", "Enriched people", "2 Hiring Contacts, 3 Candidates"],
  ];
  for (const [a, actor, action, target] of history) withDate(s, a, () => audit(s, actor, action, target, null));
  s.auditLog.sort((a, b) => (a.on === b.on ? a.seq - b.seq : a.on < b.on ? -1 : 1));
  s.auditLog.forEach((e, i) => (e.seq = i + 1));

  s.notices = [
    {
      id: newId("nt"),
      on: ago(3),
      tone: "warning",
      text: "camille@ateliertalent-hq.com paused automatically: bounce rate 4.2% (threshold 3%). Its follow-ups wait until you resume it.",
      link: { ...NOTICE_LINKS.mailboxes },
      dismissedOn: null,
    },
  ];
  rescoreAll(s);
  // One Prospect with a new Signal: Fintory's headcount growth, reported yesterday.
  P.fintory.hasNewSignal = true;
  // Emails sent yesterday (a Sunday: none), per Sending Mailbox, for today's Digest.
  const yesterday = ago(1);
  const sentYesterday: Record<string, number> = {};
  for (const m of s.mailboxes) sentYesterday[m.id] = 0;
  for (const r of s.recipients) for (const m of r.messages) if (m.status === "sent" && m.sentOn === yesterday) sentYesterday[r.mailboxId] = (sentYesterday[r.mailboxId] ?? 0) + 1;
  buildDigests(s, { surfaced: 0, afterContact: 0 }, sentYesterday);
  return s;
}

/**
 * Candidates the seeded Test Runs showed when they ran (the free one as Previews). Their results lists
 * are shorter now: Candidates never contacted were deleted under the retention rule since.
 */
const SEED_TEST_RUN_CANDIDATES = { fin: 10, health: 11 } as const;

/** The "Test Run completed" audit target, as the simulation writes it. */
function testRunAuditTarget(niche: Niche, candidatesShown: number): string {
  const tr = niche.testRun;
  if (!tr) return niche.name;
  return `${niche.name}: ${plural(tr.stats.shown, "Prospect")} and ${plural(candidatesShown, "Candidate")} shown, ${tr.stats.aboveThreshold} of ${plural(tr.stats.searched, "company", "companies")} above the Fit threshold${tr.free ? " (free)" : ""}`;
}

/**
 * The Established start state must look like Monday's day-start sending pass already ran: it sent only
 * Damien Joly's email again (after Friday's bounce), left no approved email due today, and raised no
 * notice and no sending block. Throws when the seed drifts from that, so it never loads inconsistent.
 */
function assertDayStartPassRan(s: AppState, noticesBeforePass: number): void {
  const today = s.clock.today;
  const problems: string[] = [];
  const sentToday = s.recipients.filter((r) => r.messages.some((m) => m.origin === "campaign" && m.sentOn === today)).map((r) => r.personLabel);
  if (sentToday.length !== 1 || sentToday[0] !== "Damien Joly") problems.push(`sent today: ${sentToday.join(", ") || "nothing"} (expected only Damien Joly)`);
  const active = new Set(s.campaigns.filter((c) => c.status === "active").map((c) => c.id));
  for (const r of s.recipients) {
    if (!active.has(r.campaignId) || (r.state !== "scheduled" && r.state !== "sent")) continue;
    if (r.pausedUntil && !isOnOrBefore(r.pausedUntil, addDays(today, -1))) continue;
    const next = r.messages.find((m) => m.origin === "campaign" && m.status !== "sent");
    if (next?.status === "approved" && (!r.nextSendOn || isOnOrBefore(r.nextSendOn, today))) problems.push(`${r.personLabel} still has an approved email due on ${r.nextSendOn ?? "no date"}`);
  }
  for (const c of s.campaigns) if (c.sendingBlocked) problems.push(`"${c.name}" is blocked: ${c.sendingBlocked.text}`);
  if (s.notices.length !== noticesBeforePass) problems.push(`the pass raised ${s.notices.length - noticesBeforePass} notice(s)`);
  if (problems.length > 0) throw new Error(`Established seed: today's sending pass is inconsistent: ${problems.join("; ")}.`);
}

/* ------------------------------------------------------------------ */
/* Ledger history                                                      */
/* ------------------------------------------------------------------ */

function buildLedger(s: AppState, fin: Niche, health: Niche, rng: Rng): void {
  const today = START_DATE;
  const ago = (n: number) => addDays(today, -n);
  type Row = { daysAgo: number; delta: number; reason: CreditReason; quantity: number; ref: string; nicheId: string | null };
  const rows: Row[] = [];
  const charge = (daysAgo: number, reason: CreditReason, quantity: number, credits: number, ref: string, nicheId: string | null) => {
    if (quantity > 0) rows.push({ daysAgo, delta: -quantity * credits, reason, quantity, ref, nicheId });
  };
  rows.push({ daysAgo: 62, delta: 2000, reason: "pack_purchase", quantity: 1, ref: "Team pack: 2 000 Credits", nicheId: null });
  rows.push({ daysAgo: 60, delta: 0, reason: "free_test_run", quantity: 1, ref: `Free Test Run - ${fin.name}`, nicheId: fin.id });
  rows.push({ daysAgo: 18, delta: 500, reason: "pack_purchase", quantity: 1, ref: "Starter pack: 500 Credits", nicheId: null });
  charge(42, "surfaced_prospect", 9, 1, `Test Run - ${health.name}`, health.id);
  charge(42, "surfaced_candidate", SEED_TEST_RUN_CANDIDATES.health, 1, `Test Run - ${health.name}`, health.id);

  // Fixed spending first: enrichment, emails, the healthtech Niche.
  const enrichDays: [number, number, number][] = [[33, 6, 1], [27, 8, 0], [21, 5, 1], [14, 9, 0], [11, 10, 1], [7, 4, 1], [5, 3, 0], [3, 5, 0]];
  for (const [d, emails, mobiles] of enrichDays) {
    charge(d, "verified_email", emails, 2, "Enrichment by Vincent Baron", null);
    charge(d, "mobile", mobiles, 8, "Enrichment by Vincent Baron", null);
  }
  charge(3, "verified_email", 1, 2, "Next provider after a bounce - Damien Joly", null);
  for (let d = 14; d >= 1; d--) {
    const date = ago(d);
    if (isWeekend(date)) continue;
    charge(d, "email_sent", rng.int(5, 9), 1, "Emails sent - Fintech CTOs - Q4 backend hiring", fin.id);
    if (d <= 10) charge(d, "email_sent", rng.int(2, 4), 1, "Emails sent - Senior backend engineers open to a move", fin.id);
  }
  // Today's day-start sending pass ran before this history is built: its emails are charged here.
  for (const c of s.campaigns) {
    const sentToday = s.recipients
      .filter((r) => r.campaignId === c.id)
      .flatMap((r) => r.messages)
      .filter((m) => m.origin === "campaign" && m.sentOn === today).length;
    charge(0, "email_sent", sentToday, PRICES.emailSent, `Emails sent - ${c.name}`, c.nicheId);
  }
  for (let d = 41; d >= 3; d--) {
    const date = ago(d);
    if (!health.schedule.days.includes(weekdayOf(date))) continue;
    const ref = `Scheduled run - ${health.name}`;
    charge(d, "surfaced_prospect", rng.int(0, 2), 1, ref, health.id);
    charge(d, "hiring_contact_found", rng.int(0, 2), 1, ref, health.id);
    charge(d, "surfaced_candidate", rng.int(1, 3), 1, ref, health.id);
  }

  // The fintech Niche's daily runs use what is left, so the balance ends at exactly 1 840.
  const target = 2000 + 500 - 1840;
  const fixed = rows.filter((r) => r.delta < 0).reduce((s2, r) => s2 - r.delta, 0);
  let budget = target - fixed;
  const finDays: number[] = [];
  for (let d = 57; d >= 3; d--) if (fin.schedule.days.includes(weekdayOf(ago(d)))) finDays.push(d);
  finDays.forEach((d, i) => {
    const left = finDays.length - i;
    const share = left === 1 ? budget : Math.max(0, Math.min(budget, Math.round(budget / left) + rng.int(-2, 2)));
    budget -= share;
    const p = Math.round(share * 0.3);
    const h = Math.round(share * 0.3);
    const c = share - p - h;
    const ref = `Scheduled run - ${fin.name}`;
    charge(d, "surfaced_prospect", p, 1, ref, fin.id);
    charge(d, "hiring_contact_found", h, 1, ref, fin.id);
    charge(d, "surfaced_candidate", c, 1, ref, fin.id);
    s.agentRuns.push({ id: newId("run"), nicheId: fin.id, on: ago(d), kind: "scheduled", prospectsSurfaced: p, candidatesSurfaced: c, hiringContactsFound: h, newSignals: rng.int(0, 2), belowThreshold: rng.int(3, 12), creditsSpent: share, stoppedReason: null });
  });
  for (let d = 41; d >= 3; d--) {
    if (!health.schedule.days.includes(weekdayOf(ago(d)))) continue;
    const dayRows = rows.filter((r) => r.daysAgo === d && r.nicheId === health.id);
    const q = (reason: CreditReason) => dayRows.filter((r) => r.reason === reason).reduce((a, r) => a + r.quantity, 0);
    s.agentRuns.push({ id: newId("run"), nicheId: health.id, on: ago(d), kind: "scheduled", prospectsSurfaced: q("surfaced_prospect"), candidatesSurfaced: q("surfaced_candidate"), hiringContactsFound: q("hiring_contact_found"), newSignals: rng.int(0, 1), belowThreshold: rng.int(2, 8), creditsSpent: dayRows.reduce((a, r) => a - r.delta, 0), stoppedReason: null });
  }
  s.agentRuns.sort((a, b) => (a.on < b.on ? -1 : 1));

  rows.sort((a, b) => b.daysAgo - a.daysAgo || (b.delta > 0 ? 1 : 0) - (a.delta > 0 ? 1 : 0));
  let balance = 0;
  const ledger: CreditLedgerEntry[] = [];
  for (const r of rows) {
    balance += r.delta;
    ledger.push({ id: newId("cl"), on: ago(r.daysAgo), delta: r.delta, reason: r.reason, quantity: r.quantity, ref: r.ref, nicheId: r.nicheId, balanceAfter: balance });
  }
  s.creditLedger = ledger;
  s.invoices = [
    { id: "inv_1", on: ago(62), credits: 2000, netEur: 349, vatRate: 0.2, vatEur: 69.8, totalEur: 418.8 },
    { id: "inv_2", on: ago(18), credits: 500, netEur: 99, vatRate: 0.2, vatEur: 19.8, totalEur: 118.8 },
  ];
  if (s.workspace) s.workspace.credits = balance;
}
