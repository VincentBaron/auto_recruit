// Domain types for the throwaway user-flow prototype.
// Every term follows CONTEXT.md at the repo root. Every action name and payload is declared once
// here (see `Actions` at the bottom) so screens get autocompletion through `act()`.

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** Calendar date, ISO `YYYY-MM-DD`. Format with `formatDate` / `formatRelative` from `@/lib/format`. */
export type ISODate = string;
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export type ScenarioKey = "new_user" | "established";
export type AuthProvider = "google" | "microsoft";
export type Plan = "free_trial" | "paid";
export type Language = "fr" | "en";
export type RecruiterRole = "owner" | "recruiter";
export type CreditPackSize = 500 | 2000 | 10000;

/** A reference to a person record. Candidate and Hiring Contact are never linked (ADR-0003). */
export type PersonKind = "hiring_contact" | "candidate";
export interface PersonRef {
  kind: PersonKind;
  id: string;
}
/** A Feed item reference: a Prospect (company) or a person. */
export type FeedItemKind = "prospect" | PersonKind;
export interface FeedItemRef {
  kind: FeedItemKind;
  id: string;
}

/* ------------------------------------------------------------------ */
/* Tenancy                                                             */
/* ------------------------------------------------------------------ */

export interface AutoTopUp {
  enabled: boolean;
  /** Top up when the balance falls below this many Credits. */
  thresholdCredits: number;
  packCredits: CreditPackSize;
}

export interface Workspace {
  id: string;
  name: string;
  plan: Plan;
  credits: number;
  autoTopUp: AutoTopUp;
  /** Domains used for the website and everyday email. Campaign emails are never sent from them. */
  mainDomains: string[];
  /** Main Domain that used the one free Test Run, or null when still available. */
  freeTestRunUsedBy: string | null;
  /** Postal address printed in every email footer (sender identity). */
  address: string;
  createdOn: ISODate;
}

export interface Recruiter {
  id: string;
  name: string;
  email: string;
  role: RecruiterRole;
  title: string;
  status: "active" | "invited";
  invitedOn: ISODate | null;
  joinedOn: ISODate | null;
}

export interface Session {
  signedIn: boolean;
  recruiterId: string | null;
  provider: AuthProvider | null;
  /** OAuth scopes granted at sign-in: identity only, never mailbox access (ADR-0014). */
  scopes: string[];
  signedInOn: ISODate | null;
}

/* ------------------------------------------------------------------ */
/* Niches                                                              */
/* ------------------------------------------------------------------ */

export type NicheStatus = "draft" | "testing" | "active" | "paused";

export interface NicheSchedule {
  days: Weekday[];
  /** Local time, `HH:MM`. */
  time: string;
  prospectsPerRun: number;
  candidatesPerRun: number;
}

export interface CompanySizeRange {
  min: number;
  max: number;
}

export type ProspectSignalType =
  | "job_posting"
  | "job_posting_stale"
  | "funding_round"
  | "new_leader"
  | "headcount_growth"
  | "expansion"
  | "layoffs";
export type CandidateSignalType =
  | "tenure_sweet_spot"
  | "employer_turbulence"
  | "title_stagnation"
  | "recently_started"
  | "recently_promoted";
export type SignalType = ProspectSignalType | CandidateSignalType;

export interface SignalWeight {
  type: SignalType;
  label: string;
  description: string;
  appliesTo: "prospect" | "candidate";
  /** Points before decay. Negative Signals carry a negative weight. */
  weight: number;
  halfLifeDays: number;
  enabled: boolean;
  negative: boolean;
}

export interface NicheProfile {
  sectors: string[];
  companySize: CompanySizeRange;
  /** Funding stages targeted, for example "Series A". Empty means any stage. */
  fundingStages: string[];
  locations: string[];
  roleTypes: string[];
  seniority: string[];
  candidateProfile: string;
  /** 0-100. Only items with Fit at or above it are Surfaced. */
  fitThreshold: number;
  signalWeights: SignalWeight[];
  /** Plain-language descriptions of the queries the agents run. */
  searchStrategy: string[];
}

export interface SetupMessage {
  id: string;
  role: "agent" | "recruiter";
  text: string;
  on: ISODate;
  /** Quick replies the Recruiter can click (agent messages only). */
  suggestions: string[];
  /** Niche Profile fields this message updated, for highlighting the live draft. */
  updatedFields: string[];
}

export interface AgentStep {
  key: string;
  label: string;
  status: "pending" | "running" | "done";
  detail: string | null;
}

export type TestRunLabel = "good" | "bad";

export interface TestRunItem {
  id: string;
  kind: "prospect" | "candidate";
  prospectId: string | null;
  /** Set once the person is revealed (paid Workspace). */
  candidateId: string | null;
  /** Set while the person is only a Preview (free trial). */
  previewId: string | null;
  label: TestRunLabel | null;
}

export type AdjustmentChange =
  | { kind: "company_size"; min: number; max: number }
  | { kind: "signal_weight"; signalType: SignalType; weight: number }
  | { kind: "enable_signal"; signalType: SignalType; enabled: boolean }
  | { kind: "fit_threshold"; value: number }
  | { kind: "add_role_type"; value: string }
  | { kind: "remove_location"; value: string }
  | { kind: "add_seniority"; value: string };

export interface ProfileAdjustment {
  id: string;
  title: string;
  rationale: string;
  from: string;
  to: string;
  change: AdjustmentChange;
  status: "proposed" | "accepted" | "dismissed";
}

export interface TestRun {
  id: string;
  status: "running" | "done";
  /** True when it was the Workspace's free Test Run (0 Credits). */
  free: boolean;
  /** Server wall-clock, only used to animate the steps (about 6 seconds). */
  startedAtMs: number;
  startedOn: ISODate;
  completedOn: ISODate | null;
  /** Index of the running step (0-4), 5 when done. */
  step: number;
  /** 0..1, for a progress bar. */
  progress: number;
  steps: AgentStep[];
  items: TestRunItem[];
  adjustments: ProfileAdjustment[];
  creditsCharged: number;
  /**
   * searched: companies looked at; aboveThreshold: those at or above the Fit threshold; shown: the
   * Prospects kept (the top 10 above the threshold by Signal Strength).
   */
  stats: { searched: number; signalsExtracted: number; aboveThreshold: number; shown: number; hiringContactsFound: number };
}

export interface Niche {
  id: string;
  ownerId: string;
  name: string;
  /** True once the Recruiter renamed the Niche: chat changes then stop regenerating the name. */
  nameCustomised: boolean;
  status: NicheStatus;
  profile: NicheProfile;
  schedule: NicheSchedule;
  /** Transcript with the setup agent (variant A "Chat"). */
  setupMessages: SetupMessage[];
  /** True once the setup agent (chat or wizard) has drafted a complete Niche Profile. */
  setupComplete: boolean;
  /** Where the setup conversation is: basics (sectors, roles, locations), size, candidate profile, done. */
  setupStage: "basics" | "size" | "candidate" | "done";
  testRun: TestRun | null;
  lastRunOn: ISODate | null;
  createdOn: ISODate;
  activatedOn: ISODate | null;
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

export interface Signal {
  id: string;
  type: SignalType;
  label: string;
  date: ISODate;
  evidenceUrl: string;
  /** Human name of the evidence, e.g. "Fintory careers page". */
  source: string;
  /** Weight before decay (from the Niche's Signal weights; negative for negative Signals). */
  points: number;
}

export interface BreakdownLine {
  signalId: string;
  type: SignalType;
  label: string;
  date: ISODate;
  ageDays: number;
  points: number;
  halfLifeDays: number;
  /** 0.5 ^ (ageDays / halfLifeDays). */
  decay: number;
  /** points x decay, 0 when the Signal weight is disabled. */
  contribution: number;
  enabled: boolean;
  negative: boolean;
}

/** Line-by-line explanation of a Signal Strength (ADR-0006). */
export interface SignalBreakdown {
  lines: BreakdownLine[];
  rawTotal: number;
  /** clamp(0, 100, rawTotal), rounded. Equals `signalStrength`. */
  total: number;
  formula: string;
}

export interface FitReason {
  label: string;
  matched: "yes" | "partial" | "no";
  points: number;
  maxPoints: number;
}

export interface Fit {
  score: number;
  threshold: number;
  aboveThreshold: boolean;
  reasons: FitReason[];
  summary: string;
}

/* ------------------------------------------------------------------ */
/* Companies and people                                                */
/* ------------------------------------------------------------------ */

export type ProspectStatus = "surfaced" | "dismissed" | "in_campaign" | "replied" | "closed";

export type DismissReason =
  | "not_in_niche"
  | "wrong_size"
  | "wrong_location"
  | "already_client"
  | "already_known"
  | "bad_timing"
  | "not_a_fit"
  | "other";

export interface FundingRound {
  round: string;
  amountEur: number;
  on: ISODate;
}

export interface Prospect {
  id: string;
  nicheIds: string[];
  name: string;
  domain: string;
  sector: string;
  tags: string[];
  description: string;
  headcount: number;
  location: string;
  founded: number;
  latestFunding: FundingRound | null;
  fit: Fit;
  signals: Signal[];
  signalStrength: number;
  breakdown: SignalBreakdown;
  detectedRoleIds: string[];
  hiringContactIds: string[];
  status: ProspectStatus;
  /** Set when closed (for example Not interested): no outreach until this date. */
  closedUntil: ISODate | null;
  dismissReason: DismissReason | null;
  dismissNote: string | null;
  hasNewSignal: boolean;
  surfacedOn: ISODate;
}

export interface DetectedRole {
  id: string;
  prospectId: string;
  title: string;
  location: string;
  postedOn: ISODate;
  sourceUrl: string;
  /** Open more than 30 days or reposted. */
  stale: boolean;
  sourcedCandidateIds: string[];
  /** Preview ids sourced for this role while in the free trial. */
  sourcedPreviewIds: string[];
  sourcing: { status: "idle" | "running" | "done"; jobId: string | null; lastSourcedOn: ISODate | null };
}

export type Lifecycle = "surfaced" | "dismissed" | "enriched" | "contacted" | "replied" | "consented" | "suppressed";

export type ContactKind = "work_email" | "personal_email" | "mobile";
export type Verification = "valid" | "catch_all" | "invalid" | "unverified";
export type ProvenanceProvider = "exa" | "dropcontact" | "fullenrich" | "bettercontact";
export type ProvenanceMethod = "cited_public_page" | "pattern_and_smtp_check" | "provider_waterfall";

export interface Provenance {
  provider: ProvenanceProvider;
  method: ProvenanceMethod;
  /** Public page or provider record the value came from (ADR-0005). */
  sourceUrl: string;
  foundOn: ISODate;
}

export interface ContactValue {
  id: string;
  kind: ContactKind;
  value: string;
  verification: Verification;
  provenance: Provenance;
  creditsCharged: number;
}

export interface Claim {
  recruiterId: string;
  campaignId: string;
  since: ISODate;
  lastActivityOn: ISODate;
  /** 90 days after the last activity. */
  expiresOn: ISODate;
}

export interface HiringContact {
  id: string;
  prospectId: string;
  name: string;
  title: string;
  /** 1 is the best person to contact at this Prospect. */
  rank: number;
  location: string;
  language: Language;
  lifecycle: Lifecycle;
  contactValues: ContactValue[];
  claim: Claim | null;
  profileUrl: string;
  surfacedOn: ISODate;
  /** "referral" when proposed by a Referral reply; must be accepted before use. */
  origin: "agent" | "referral";
  proposed: boolean;
  referredByReplyId: string | null;
  dismissReason: DismissReason | null;
}

export interface WorkHistoryEntry {
  employer: string;
  employerSector: string;
  title: string;
  from: ISODate;
  /** null = current role. */
  to: ISODate | null;
}

export type ConsentChoice = "talent_pool" | "this_opportunity" | "delete";

export interface Candidate {
  id: string;
  nicheIds: string[];
  name: string;
  headline: string;
  currentTitle: string;
  currentEmployer: string;
  seniority: string;
  location: string;
  language: Language;
  tenureMonths: number;
  yearsExperience: number;
  skills: string[];
  workHistory: WorkHistoryEntry[];
  fit: Fit;
  signals: Signal[];
  signalStrength: number;
  breakdown: SignalBreakdown;
  lifecycle: Lifecycle;
  /** Never a work_email: Candidates are never emailed at their current employer (ADR-0005). */
  contactValues: ContactValue[];
  surfacedOn: ISODate;
  /** surfacedOn + 25 days while never Contacted; null once Contacted or Consented. */
  deleteOn: ISODate | null;
  consent: ConsentChoice | null;
  consentRecordedOn: ISODate | null;
  retainUntil: ISODate | null;
  article14NoticeSentOn: ISODate | null;
  claim: Claim | null;
  /** Set when sourced for a Detected Role. */
  forDetectedRoleId: string | null;
  profileUrl: string;
  dismissReason: DismissReason | null;
  dismissNote: string | null;
}

/** Anonymised, unstored summary of a person shown in the free trial (ADR-0018). */
export interface Preview {
  id: string;
  kind: PersonKind;
  nicheId: string;
  /** For Hiring Contact Previews. */
  prospectId: string | null;
  /** For Candidate Previews sourced for a Detected Role. */
  forDetectedRoleId: string | null;
  /** e.g. "Senior Backend Engineer, 6 years, fintech, Paris - strong move signals". */
  summary: string;
  fit: number;
  signalStrength: number;
  /** Anonymised like `signalLabels`: no employer or person names. */
  signalLabels: string[];
  /** Line-by-line Signal Strength explanation, labels anonymised like `signalLabels`. */
  breakdown: SignalBreakdown;
  /** Fit explanation, with no employer or person names. */
  fitDetail: Fit;
  /** Structured attributes (Candidate: current title; Hiring Contact: role title). */
  title: string;
  seniority: string;
  location: string;
  /** Candidate: years of experience; Hiring Contact: years in the role. */
  years: number;
  createdOn: ISODate;
}

/* ------------------------------------------------------------------ */
/* Outreach                                                            */
/* ------------------------------------------------------------------ */

export type CampaignAudience = "hiring_contacts" | "candidates";
export type Autonomy = "review_all" | "review_first_n" | "auto";
export type CampaignStatus = "draft" | "active" | "paused";

export interface Brief {
  angle: string;
  callToAction: string;
  detectedRoleId: string | null;
}

export interface SequenceStep {
  /** 1-based. */
  step: number;
  /** Days after the previous email (0 for the first email). */
  delayDays: number;
  /** Short instruction for the Outreach Agent, e.g. "Short nudge, add one new fact". */
  instruction: string;
}

export interface SendingWindow {
  days: Weekday[];
  start: string;
  end: string;
  recipientTimezone: true;
}

export interface Campaign {
  id: string;
  nicheId: string;
  ownerId: string;
  name: string;
  audience: CampaignAudience;
  brief: Brief;
  sequence: SequenceStep[];
  sendingWindow: SendingWindow;
  autonomy: Autonomy;
  reviewFirstN: number;
  mailboxIds: string[];
  /** Automatically add newly Enriched people above this Signal Strength. */
  autoAddRule: { minSignalStrength: number } | null;
  status: CampaignStatus;
  createdOn: ISODate;
  launchedOn: ISODate | null;
  /**
   * Set on a sending day when at least one due email could not leave, with the real reason;
   * cleared on the next sending day when nothing is blocked.
   */
  sendingBlocked: CampaignSendingBlock | null;
}

export type SendingBlockReason = "credits" | "no_mailbox" | "mailbox_paused" | "caps";

export interface CampaignSendingBlock {
  on: ISODate;
  reason: SendingBlockReason;
  text: string;
  /**
   * Set when no Sending Mailbox of the Campaign can send, so nothing at all can leave: "none" (no
   * mailbox left, or only removed or refused ones) or "all_paused". Null when only some emails wait.
   */
  mailboxStop: "none" | "all_paused" | null;
}

export type RecipientState = "awaiting_review" | "scheduled" | "sent" | "replied" | "stopped";

export interface EmailFooter {
  senderName: string;
  senderTitle: string;
  senderEmail: string;
  workspaceName: string;
  workspaceAddress: string;
  optOutUrl: string;
  optOutLabel: string;
  /** Only on emails to Candidates (the first one at the latest). */
  article14Notice: string | null;
  aiNote: string;
}

export interface Message {
  id: string;
  /** Sequence step (1-3). Responses to replies keep the step of the email that was answered. */
  step: number;
  /** French for French recipients, English otherwise. */
  language: Language;
  subject: string;
  body: string;
  footer: EmailFooter;
  status: "draft" | "approved" | "sent";
  sentOn: ISODate | null;
  editedByRecruiter: boolean;
  /** The Outreach Agent's original body, kept when the Recruiter edited it. */
  originalBody: string | null;
  /** "campaign" for Sequence emails, "response" for a Recruiter's answer to a reply. */
  origin: "campaign" | "response";
}

export interface Recipient {
  id: string;
  campaignId: string;
  personKind: PersonKind;
  personId: string;
  /** Snapshot of the person's name (kept as "Deleted Candidate" after deletion). */
  personLabel: string;
  personDeleted: boolean;
  /** Prospect of a Hiring Contact (one Hiring Contact per Prospect in an active Sequence). */
  prospectId: string | null;
  mailboxId: string;
  state: RecipientState;
  currentStep: number;
  messages: Message[];
  stopReason: string | null;
  addedOn: ISODate;
  nextSendOn: ISODate | null;
  /** Out of Office: Sequence paused until this date. */
  pausedUntil: ISODate | null;
  /** Address the emails go to. */
  toAddress: string | null;
}

export type ReplyCategory =
  | "interested"
  | "not_now"
  | "not_interested"
  | "opt_out"
  | "out_of_office"
  | "referral"
  | "bounce";

export const REPLY_CATEGORIES: ReplyCategory[] = [
  "interested",
  "not_now",
  "not_interested",
  "opt_out",
  "out_of_office",
  "referral",
  "bounce",
];

export type AutomaticEffectKind =
  | "suppression_list"
  | "sequence_paused"
  | "hiring_contact_proposed"
  | "next_provider_tried"
  | "mailbox_paused"
  | "prospect_closed"
  | "candidate_deleted"
  | "outreach_stopped";

export interface AutomaticEffect {
  kind: AutomaticEffectKind;
  description: string;
  on: ISODate;
  /** Set on "candidate_deleted" when the Candidate chose "Delete my data" on the Consent Page. */
  viaConsentPage?: boolean;
}

export interface Reply {
  id: string;
  recipientId: string;
  campaignId: string;
  personKind: PersonKind;
  personId: string;
  personLabel: string;
  prospectId: string | null;
  receivedOn: ISODate;
  language: Language;
  subject: string;
  body: string;
  category: ReplyCategory;
  recategorizedFrom: ReplyCategory | null;
  suggestedNextStep: string;
  /** Drafted by the agent; the Recruiter edits and sends it (ADR-0002). Null when no response is needed. */
  draftResponse: string | null;
  /** Consent Page link included in responses to Candidates. */
  consentToken: string | null;
  handled: boolean;
  responseSentOn: ISODate | null;
  responseBody: string | null;
  effects: AutomaticEffect[];
  outOfOfficeUntil: ISODate | null;
  referral: { name: string; title: string; hiringContactId: string | null } | null;
}

/* ------------------------------------------------------------------ */
/* Sending Mailboxes and Voice Profiles                                */
/* ------------------------------------------------------------------ */

export type MailboxStatus = "warming" | "active" | "paused" | "refused";

export interface MailboxHealth {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  domainAgeDays: number;
  blocklisted: boolean;
  /** Inbox placement measured with our own seed mailboxes (ADR-0017), percent. */
  inboxPlacement: number | null;
}

export interface SendingMailbox {
  id: string;
  recruiterId: string;
  address: string;
  displayName: string;
  provider: AuthProvider;
  domain: string;
  health: MailboxHealth;
  /** Day of the ramp (1 = first day). Ramp goes from 5 to 30 a day over about 21 days. */
  rampDay: number;
  dailyCap: number;
  sentToday: number;
  sentTotal: number;
  bouncesTotal: number;
  /** Percent over the last sends. Auto-pause above 3%. */
  bounceRate: number;
  status: MailboxStatus;
  statusReason: string | null;
  connectedOn: ISODate;
  setup: "connected" | "assisted";
  alreadyWarmed: boolean;
}

export interface SendingDomain {
  domain: string;
  registeredOn: ISODate;
  /** Registered in the Workspace's name, never resold (ADR-0017). */
  registeredFor: string;
  provider: AuthProvider;
  assisted: boolean;
  dailyCap: number;
  sentToday: number;
  dns: { spf: boolean; dkim: boolean; dmarc: boolean };
}

export interface AssistedSetup {
  id: string;
  recruiterId: string;
  provider: AuthProvider;
  domain: string;
  mailboxAddresses: string[];
  status: "running" | "done";
  startedAtMs: number;
  startedOn: ISODate;
  steps: AgentStep[];
  progress: number;
  adminConsentGrantedOn: ISODate;
  termsRiskAcknowledged: boolean;
  createdMailboxIds: string[];
}

export interface VoiceExample {
  subject: string | null;
  body: string;
  /** "scan" examples are replaced by each new mailbox scan; "pasted" ones are kept. */
  origin: "scan" | "pasted";
}

export interface LearnedEdit {
  id: string;
  on: ISODate;
  campaignId: string | null;
  before: string;
  after: string;
  lesson: string;
}

export interface VoiceProfile {
  id: string;
  recruiterId: string;
  language: Language;
  source: "mailbox_scan" | "pasted_examples";
  /** Bullet list of style rules (the Voice Profile itself; never called "tone"). */
  styleGuide: string[];
  examples: VoiceExample[];
  learnedFromEdits: LearnedEdit[];
  emailsAnalysed: number;
  updatedOn: ISODate;
}

/** Separate, explicit read-only consent to scan sent emails (ADR-0014). */
export interface MailboxScanConsent {
  recruiterId: string;
  provider: AuthProvider;
  scopes: string[];
  grantedOn: ISODate;
  revokedOn: ISODate | null;
}

/* ------------------------------------------------------------------ */
/* Credits, compliance, audit                                          */
/* ------------------------------------------------------------------ */

export type CreditReason =
  | "pack_purchase"
  | "auto_top_up"
  | "surfaced_prospect"
  | "surfaced_candidate"
  | "hiring_contact_found"
  | "verified_email"
  | "mobile"
  | "email_sent"
  | "free_test_run";

export interface CreditLedgerEntry {
  id: string;
  on: ISODate;
  /** Positive for purchases, negative for spending. */
  delta: number;
  reason: CreditReason;
  quantity: number;
  /** Human reference, e.g. "Prospection Agent run - Fintech backend engineers". */
  ref: string;
  nicheId: string | null;
  balanceAfter: number;
}

export interface Invoice {
  id: string;
  on: ISODate;
  credits: number;
  netEur: number;
  vatRate: number;
  vatEur: number;
  totalEur: number;
}

/**
 * The people the first Credit pack revealed from the free trial's Previews, and the Credits charged
 * for them at the normal price per Hiring Contact found and per Surfaced Candidate (ADR-0018).
 */
export interface RevealOutcome {
  hiringContacts: number;
  candidates: number;
  credits: number;
}

export type SuppressionReason = "opt_out" | "not_interested" | "data_request_delete" | "manual";

export interface SuppressionEntry {
  id: string;
  /** sha256 of the normalised email or domain. Display truncated (see `truncateHash`). */
  hash: string;
  kind: "email" | "domain";
  addedOn: ISODate;
  reason: SuppressionReason;
  scope: "all_workspaces";
  /** "This Workspace" or "Another Workspace": opt-outs apply across all Workspaces (ADR-0004). */
  addedBy: "this_workspace" | "another_workspace";
}

export type DataRequestKind = "access" | "export" | "delete";

export interface DataRequest {
  id: string;
  personQuery: string;
  requesterEmail: string;
  channel: "email" | "consent_page" | "postal";
  receivedOn: ISODate;
  /** receivedOn + 30 days. */
  dueOn: ISODate;
  kind: DataRequestKind;
  status: "open" | "completed";
  resolution: string | null;
  completedOn: ISODate | null;
  matches: PersonRef[];
  /**
   * True once a Candidate this request concerns was deleted while it was open. The request keeps the
   * requester's name and address until it is answered, then says "Deleted Candidate" (ADR-0019).
   */
  deletedCandidate: boolean;
}

export interface AuditEvent {
  id: string;
  seq: number;
  on: ISODate;
  /** Recruiter name, agent name ("Prospection Agent"), "System", "API Key ..." or "Candidate". */
  actor: string;
  action: string;
  target: string;
  targetRef: FeedItemRef | { kind: "campaign" | "niche" | "mailbox" | "data_request" | "api_key" | "workspace" | "reply"; id: string } | null;
}

export interface DigestReplyGroup {
  category: ReplyCategory;
  items: { replyId: string; personLabel: string; prospectName: string | null; suggestedNextStep: string }[];
}

export interface DigestFeedItem {
  kind: "prospect" | "candidate";
  id: string;
  name: string;
  signalStrength: number;
  headline: string;
}

export interface DigestMailboxLine {
  mailboxId: string;
  address: string;
  status: MailboxStatus;
  sentYesterday: number;
  dailyCap: number;
  note: string;
}

export interface DigestDataRequestLine {
  id: string;
  personQuery: string;
  dueOn: ISODate;
  overdue: boolean;
}

export interface Digest {
  id: string;
  on: ISODate;
  recruiterId: string;
  /** Replies to the Recruiter's Campaigns received since their previous Digest. */
  newReplies: DigestReplyGroup[];
  /** Older replies to the Recruiter's Campaigns that are still unhandled. */
  waitingReplies: DigestReplyGroup[];
  /** Signal Strength at or above DIGEST_MIN_SIGNAL_STRENGTH, best first, at most 6. */
  bestNewFeedItems: DigestFeedItem[];
  mailboxHealth: DigestMailboxLine[];
  creditsRemaining: number;
  creditsSpentYesterday: number;
  /** Candidates deleted under the 25-day retention rule (never Contacted) on the Digest's day. */
  deletedByRetention: number;
  /** Candidates deleted at the end of their retention after Contact or Consent on the Digest's day. */
  deletedAtRetentionEnd: number;
  /**
   * Open Data Requests due within 7 days or overdue. The Owner sees every one; a Recruiter sees those
   * matching people of their own Niches (and those with no match yet, which anyone may need to answer).
   */
  dataRequestsDue: DigestDataRequestLine[];
  notes: string[];
}

export interface ApiKey {
  id: string;
  name: string;
  /** The Recruiter this key acts for whenever it contacts people. */
  recruiterId: string;
  /** Displayed prefix, e.g. "ar_live_7Hk2". The full value is shown once at creation. */
  prefix: string;
  createdOn: ISODate;
  createdById: string;
  lastUsedOn: ISODate | null;
  revokedOn: ISODate | null;
}

export interface ConsentToken {
  token: string;
  candidateId: string;
  replyId: string | null;
  createdOn: ISODate;
  usedOn: ISODate | null;
  choice: ConsentChoice | null;
}

/* ------------------------------------------------------------------ */
/* Chat panel, jobs, sim                                               */
/* ------------------------------------------------------------------ */

export interface ChatProposal {
  id: string;
  title: string;
  description: string;
  /** Always shown before confirming (0 for actions that only contact people or draft). */
  costCredits: number;
  contactsPeople: boolean;
  actionName: ActionName;
  actionPayload: unknown;
  status: "pending" | "confirmed" | "cancelled" | "failed";
  resultText: string | null;
  /** Credits actually charged once confirmed (0 when nothing was charged); null while pending, failed or cancelled. */
  creditsCharged: number | null;
}

export interface ChatMessage {
  id: string;
  role: "recruiter" | "agent";
  text: string;
  on: ISODate;
  proposal: ChatProposal | null;
  links: { label: string; href: string }[];
}

export interface AgentJob {
  id: string;
  kind: "role_sourcing" | "find_more";
  targetId: string;
  label: string;
  startedAtMs: number;
  durationMs: number;
  steps: AgentStep[];
  progress: number;
  status: "running" | "done";
  result: string | null;
}

export interface AgentRun {
  id: string;
  nicheId: string;
  on: ISODate;
  kind: "scheduled" | "manual" | "test_run" | "role_sourcing" | "find_more";
  prospectsSurfaced: number;
  candidatesSurfaced: number;
  hiringContactsFound: number;
  newSignals: number;
  belowThreshold: number;
  creditsSpent: number;
  stoppedReason: string | null;
}

export interface Notice {
  id: string;
  on: ISODate;
  tone: "info" | "warning" | "danger" | "success";
  text: string;
  /** Where to act on it, e.g. { label: "Buy Credits", href: "/credits" }. */
  link: { label: string; href: string } | null;
  /** Set once a Recruiter dismissed it from the notice stack. */
  dismissedOn: ISODate | null;
}

export interface ChangeSummary {
  action: string;
  seq: number;
  on: ISODate;
  lines: string[];
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export interface AppState {
  /** Increments on every mutation. */
  version: number;
  scenario: ScenarioKey;
  clock: { today: ISODate };
  session: Session;
  workspace: Workspace | null;
  recruiters: Recruiter[];
  niches: Niche[];
  prospects: Prospect[];
  detectedRoles: DetectedRole[];
  hiringContacts: HiringContact[];
  candidates: Candidate[];
  previews: Preview[];
  campaigns: Campaign[];
  recipients: Recipient[];
  replies: Reply[];
  mailboxes: SendingMailbox[];
  sendingDomains: SendingDomain[];
  assistedSetups: AssistedSetup[];
  voiceProfiles: VoiceProfile[];
  mailboxScanConsents: MailboxScanConsent[];
  creditLedger: CreditLedgerEntry[];
  invoices: Invoice[];
  suppressionList: SuppressionEntry[];
  dataRequests: DataRequest[];
  auditLog: AuditEvent[];
  digests: Digest[];
  apiKeys: ApiKey[];
  consentTokens: ConsentToken[];
  chat: ChatMessage[];
  jobs: AgentJob[];
  agentRuns: AgentRun[];
  notices: Notice[];
  lastChange: ChangeSummary | null;
}

/** Values computed by the server on every GET, so screens do not recompute them. */
export interface Derived {
  currentRecruiter: Recruiter | null;
  isFreeTrial: boolean;
  freeTestRunAvailable: boolean;
  unhandledReplies: number;
  unhandledRepliesByCategory: Record<ReplyCategory, number>;
  creditsUsedLast7DaysByNiche: Record<string, number>;
  candidateLifecycleCounts: Record<Lifecycle, number>;
  hiringContactLifecycleCounts: Record<Lifecycle, number>;
  prospectStatusCounts: Record<ProspectStatus, number>;
  /** Ids of the Prospects tab of the Feed across every Niche, in the Feed's order (Signal Strength, then Fit, then name), as the chat agent ranks them. */
  rankedProspectIds: string[];
  /** Sent today per sending domain, against the 60 per domain cap. */
  domainUsage: { domain: string; sentToday: number; cap: number }[];
  runningJobs: { kind: "test_run" | "role_sourcing" | "find_more" | "assisted_setup"; id: string; label: string; progress: number }[];
  latestDigestId: string | null;
}

export interface ClientState extends AppState {
  derived: Derived;
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export type EmptyPayload = Record<string, never>;
export type EmptyResult = Record<string, never>;

export interface NicheWizardInput {
  name?: string;
  sectors: string[];
  companySize: CompanySizeRange;
  fundingStages: string[];
  locations: string[];
  roleTypes: string[];
  seniority: string[];
  candidateProfile: string;
}

export interface NicheSuggestions {
  name: string;
  sectors: string[];
  companySize: CompanySizeRange;
  fundingStages: string[];
  locations: string[];
  roleTypes: string[];
  seniority: string[];
  candidateProfile: string;
  searchStrategy: string[];
}

export interface CampaignInput {
  nicheId: string;
  name: string;
  audience: CampaignAudience;
  brief: Brief;
  sequence: SequenceStep[];
  sendingWindow: SendingWindow;
  autonomy: Autonomy;
  reviewFirstN: number;
  mailboxIds: string[];
  autoAddRule: { minSignalStrength: number } | null;
}

export interface EnrichPersonResult {
  kind: PersonKind;
  id: string;
  name: string;
  email: ContactValue | null;
  mobile: ContactValue | null;
  creditsCharged: number;
  note: string | null;
}

export interface PersonExport {
  generatedOn: ISODate;
  workspace: string;
  controller: string;
  person: Record<string, unknown>;
  contactValues: ContactValue[];
  signals: Signal[];
  campaigns: { campaign: string; messages: { subject: string; sentOn: ISODate | null }[] }[];
  auditTrail: AuditEvent[];
}

export interface DraftPreview {
  person: PersonRef;
  personLabel: string;
  toAddress: string | null;
  messages: Message[];
}

export interface Actions {
  // Session and Workspace
  signUp: {
    /**
     * `address`: the business's postal address, printed in every email footer and in the Article 14 Notice.
     * Main Domains: the sign-in email's domain always counts (first); add more with `mainDomains` (all at
     * once, so the free Test Run check covers every one) or the single `mainDomain`.
     */
    payload: {
      provider: AuthProvider;
      fullName: string;
      email: string;
      workspaceName: string;
      mainDomain?: string;
      mainDomains?: string[];
      address: string;
    };
    result: { workspaceId: string; recruiterId: string; freeTestRunAvailable: boolean };
  };
  signOut: { payload: EmptyPayload; result: EmptyResult };
  /** Prototype convenience: act as another Recruiter (e.g. Camille) to see Claims from the other side. */
  switchRecruiter: { payload: { recruiterId: string }; result: EmptyResult };
  updateWorkspace: { payload: { name?: string; mainDomains?: string[]; address?: string }; result: EmptyResult };

  // Niche setup
  createNiche: { payload: { name?: string }; result: { nicheId: string } };
  nicheChatMessage: {
    payload: { nicheId: string; text: string };
    result: { reply: SetupMessage; updatedFields: string[]; complete: boolean };
  };
  /** Pure: agent suggestions for the Wizard from a free-text description. */
  suggestNicheFields: { payload: { description: string }; result: NicheSuggestions };
  draftNicheProfile: { payload: { nicheId: string; input: NicheWizardInput }; result: { profile: NicheProfile } };
  updateNiche: { payload: { nicheId: string; name?: string; ownerId?: string }; result: EmptyResult };
  updateNicheProfile: { payload: { nicheId: string; profile: Partial<NicheProfile> }; result: { profile: NicheProfile } };
  updateSignalWeight: {
    payload: { nicheId: string; signalType: SignalType; patch: Partial<Pick<SignalWeight, "weight" | "halfLifeDays" | "enabled">> };
    result: EmptyResult;
  };
  setSchedule: { payload: { nicheId: string; schedule: Partial<NicheSchedule> }; result: { schedule: NicheSchedule } };
  launchTestRun: { payload: { nicheId: string }; result: { testRunId: string; free: boolean; costCredits: number } };
  labelTestRunItem: {
    payload: { nicheId: string; itemId: string; label: TestRunLabel | null };
    result: { adjustments: ProfileAdjustment[] };
  };
  acceptAdjustments: { payload: { nicheId: string; adjustmentIds: string[] }; result: { applied: number } };
  dismissAdjustment: { payload: { nicheId: string; adjustmentId: string }; result: EmptyResult };
  activateNiche: { payload: { nicheId: string }; result: EmptyResult };
  pauseNiche: { payload: { nicheId: string }; result: EmptyResult };
  deleteNiche: { payload: { nicheId: string }; result: EmptyResult };

  // Credits
  purchaseCredits: {
    payload: { pack: CreditPackSize };
    /** `firstPack`: this purchase ended the free trial (people revealed, agents can be switched on). */
    result: { invoice: Invoice; revealed: RevealOutcome; firstPack: boolean };
  };
  setAutoTopUp: {
    payload: { enabled: boolean; thresholdCredits?: number; packCredits?: CreditPackSize };
    result: EmptyResult;
  };

  // Feed, Enrichment, Detected Roles
  dismiss: { payload: { items: FeedItemRef[]; reason: DismissReason; note?: string }; result: { dismissed: number } };
  undismiss: { payload: { items: FeedItemRef[] }; result: { restored: number } };
  markSignalsSeen: { payload: { prospectIds: string[] }; result: EmptyResult };
  /** Pure: Credit quote for an Enrichment, same rules as `enrich`. */
  quoteEnrichment: {
    payload: { people: { kind: PersonKind; id: string; mobile: boolean }[] };
    result: { lines: { kind: PersonKind; id: string; name: string; credits: number; skipped: string | null }[]; total: number };
  };
  /** Email always (work_email for Hiring Contacts, personal_email for Candidates), mobile only when ticked. */
  enrich: {
    payload: { people: { kind: PersonKind; id: string; mobile: boolean }[] };
    result: { results: EnrichPersonResult[]; creditsCharged: number; balance: number };
  };
  sourceForDetectedRole: { payload: { detectedRoleId: string }; result: { jobId: string; costCredits: number } };
  findMoreLike: {
    payload: { prospectId: string; count: number };
    result: { surfacedProspectIds: string[]; creditsCharged: number };
  };
  acceptReferral: { payload: { replyId: string }; result: { hiringContactId: string } };
  releaseClaim: { payload: { person: PersonRef }; result: EmptyResult };

  // Campaigns
  createCampaign: { payload: CampaignInput; result: { campaignId: string } };
  updateCampaign: { payload: { campaignId: string; patch: Partial<CampaignInput> }; result: EmptyResult };
  /** Pure: Outreach Agent drafts for up to three recipients (uses Enriched people of the Niche if none given). */
  previewDrafts: {
    payload: { nicheId: string; audience: CampaignAudience; brief: Brief; sequence: SequenceStep[]; people?: PersonRef[] };
    result: { drafts: DraftPreview[] };
  };
  addRecipients: {
    payload: { campaignId: string; people: PersonRef[] };
    result: { added: string[]; skipped: { kind: PersonKind; id: string; name: string; reason: string }[] };
  };
  removeRecipient: { payload: { recipientId: string }; result: EmptyResult };
  approveMessage: {
    payload: { recipientId: string; messageId: string; subject?: string; body?: string };
    result: { learned: string | null };
  };
  approveAll: { payload: { campaignId: string }; result: { approved: number } };
  redraftMessage: { payload: { recipientId: string; messageId: string }; result: EmptyResult };
  launchCampaign: { payload: { campaignId: string }; result: { scheduled: number; awaitingReview: number } };
  pauseCampaign: { payload: { campaignId: string }; result: EmptyResult };
  resumeCampaign: { payload: { campaignId: string }; result: EmptyResult };

  // Inbox and Consent Page
  /** The Recruiter sends the (edited) drafted response. Candidate responses get the Consent Page link. */
  sendReplyResponse: { payload: { replyId: string; body: string }; result: { consentUrl: string | null } };
  recategorizeReply: { payload: { replyId: string; category: ReplyCategory }; result: { effects: AutomaticEffect[] } };
  markReplyHandled: { payload: { replyId: string; handled: boolean }; result: EmptyResult };
  /** Public: called from /consent/[token]. */
  recordConsent: {
    payload: { token: string; choice: ConsentChoice };
    result: { candidateName: string; workspaceName: string; retainUntil: ISODate | null };
  };

  // Sending Mailboxes
  connectMailbox: {
    payload: { provider: AuthProvider; address: string; recruiterId?: string; alreadyWarmed?: boolean; termsRiskAcknowledged: boolean };
    result: { mailboxId: string; status: MailboxStatus; reason: string | null };
  };
  /** Pure: lookalike domain ideas for assisted setup. */
  suggestLookalikeDomains: {
    payload: { mainDomain?: string };
    result: { domains: { domain: string; available: boolean; priceEurPerYear: number }[] };
  };
  /** Assisted setup: lookalike domain registered in the Workspace's name, DNS, mailboxes in its own tenant. */
  startAssistedSetup: {
    payload: { provider: AuthProvider; domain: string; mailboxLocalParts: string[]; recruiterId?: string; termsRiskAcknowledged: boolean };
    result: { setupId: string };
  };
  pauseMailbox: { payload: { mailboxId: string }; result: EmptyResult };
  resumeMailbox: { payload: { mailboxId: string }; result: EmptyResult };
  removeMailbox: { payload: { mailboxId: string }; result: EmptyResult };

  // Voice Profile
  /** Separate read-only consent to scan sent emails (ADR-0014). */
  scanVoiceProfile: {
    payload: { language: Language; provider: AuthProvider; recruiterId?: string };
    result: { voiceProfileId: string; emailsAnalysed: number };
  };
  pasteVoiceExamples: {
    payload: { language: Language; examples: string[]; recruiterId?: string };
    result: { voiceProfileId: string };
  };
  updateVoiceProfile: { payload: { voiceProfileId: string; styleGuide: string[] }; result: EmptyResult };
  revokeMailboxScan: { payload: { recruiterId?: string }; result: EmptyResult };

  // Team and API
  inviteRecruiter: { payload: { name: string; email: string; role: RecruiterRole }; result: { recruiterId: string } };
  updateRecruiterRole: { payload: { recruiterId: string; role: RecruiterRole }; result: EmptyResult };
  removeRecruiter: { payload: { recruiterId: string }; result: EmptyResult };
  createApiKey: { payload: { name: string; recruiterId: string }; result: { apiKeyId: string; fullKey: string } };
  revokeApiKey: { payload: { apiKeyId: string }; result: EmptyResult };

  // Data and privacy
  /** Searches Candidates and Hiring Contacts separately (never cross-linked) for a Data Request. Audited. */
  findPerson: {
    payload: { query: string };
    result: {
      matches: { kind: PersonKind; id: string; name: string; detail: string; matchedOn: string }[];
      onSuppressionList: boolean;
    };
  };
  createDataRequest: {
    payload: { personQuery: string; kind: DataRequestKind; requesterEmail?: string };
    result: { dataRequestId: string };
  };
  exportPerson: { payload: { person: PersonRef; dataRequestId?: string }; result: { export: PersonExport } };
  /** Deletes the record and keeps only the hash on the Suppression List. */
  deletePerson: { payload: { person: PersonRef; dataRequestId?: string }; result: { hash: string } };
  resolveDataRequest: { payload: { dataRequestId: string; resolution: string }; result: EmptyResult };
  addToSuppressionList: { payload: { value: string; reason?: SuppressionReason }; result: { hash: string } };

  // Chat panel agent (canned)
  sendChatMessage: {
    payload: { text: string; context?: { route?: string; selection?: FeedItemRef[] } };
    result: { reply: ChatMessage };
  };
  confirmChatProposal: { payload: { messageId: string }; result: { reply: ChatMessage } };
  cancelChatProposal: { payload: { messageId: string }; result: EmptyResult };
  clearChat: { payload: EmptyPayload; result: EmptyResult };

  // Simulator
  advance: { payload: { days: number }; result: { today: ISODate; lines: string[] } };
  runAgentsNow: { payload: { nicheId?: string }; result: { lines: string[] } };
  injectReply: { payload: { recipientId: string; category: ReplyCategory }; result: { replyId: string } };
  loadScenario: { payload: { scenario: ScenarioKey }; result: EmptyResult };
  reset: { payload: EmptyPayload; result: EmptyResult };

  // Notices (background stops: Credits ran out, mailbox paused, auto top-up...)
  dismissNotice: { payload: { noticeId: string }; result: EmptyResult };
}

export type ActionName = keyof Actions;
export type ActionPayload<K extends ActionName> = Actions[K]["payload"];
export type ActionResult<K extends ActionName> = Actions[K]["result"];
export type ActResponse<K extends ActionName> =
  | { ok: true; result: ActionResult<K>; changes: string[] }
  | { ok: false; error: string };
