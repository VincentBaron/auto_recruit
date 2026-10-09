// UI labels for every enum, in the exact domain language of CONTEXT.md. Import these instead of
// hand-writing labels in screens, so wording stays consistent.

import type {
  ActionName,
  Autonomy,
  CampaignAudience,
  CampaignStatus,
  ConsentChoice,
  ContactKind,
  DataRequestKind,
  DismissReason,
  Lifecycle,
  MailboxStatus,
  Niche,
  NicheProfile,
  NicheStatus,
  PersonKind,
  ProspectStatus,
  ProvenanceMethod,
  ProvenanceProvider,
  RecipientState,
  ReplyCategory,
  SignalType,
  SuppressionReason,
  Verification,
} from "./types";

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  surfaced: "Surfaced",
  dismissed: "Dismissed",
  enriched: "Enriched",
  contacted: "Contacted",
  replied: "Replied",
  consented: "Consented",
  suppressed: "Suppressed",
};

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  surfaced: "Surfaced",
  dismissed: "Dismissed",
  in_campaign: "In a Campaign",
  replied: "Replied",
  closed: "Closed",
};

export const NICHE_STATUS_LABELS: Record<NicheStatus, string> = {
  draft: "Draft",
  testing: "Testing",
  active: "Active",
  paused: "Paused",
};

/** A Niche's name, or "Untitled Niche" while it has none (a setup that has not drafted a profile yet). */
export function nicheLabel(niche: Pick<Niche, "name">): string {
  return niche.name.trim() || "Untitled Niche";
}

/** Niche Profile fields in running text ("Edited a Niche Profile: sectors, Fit threshold"). */
export const NICHE_PROFILE_FIELD_LABELS: Record<keyof NicheProfile | "name", string> = {
  name: "name",
  sectors: "sectors",
  companySize: "company size",
  fundingStages: "funding stages",
  locations: "locations",
  roleTypes: "role types",
  seniority: "seniority",
  candidateProfile: "Candidate profile",
  fitThreshold: "Fit threshold",
  signalWeights: "Signal weights",
  searchStrategy: "search strategy",
};

/** The label of a Niche Profile field key, or the key itself when unknown. */
export function nicheFieldLabel(key: string): string {
  return (NICHE_PROFILE_FIELD_LABELS as Record<string, string>)[key] ?? key;
}

export const REPLY_CATEGORY_LABELS: Record<ReplyCategory, string> = {
  interested: "Interested",
  not_now: "Not Now",
  not_interested: "Not Interested",
  opt_out: "Opt-out",
  out_of_office: "Out of Office",
  referral: "Referral",
  bounce: "Bounce",
};

const SHARED_REPLY_CATEGORY_EFFECTS: Record<"not_now" | "out_of_office" | "referral" | "bounce", string> = {
  not_now: "The Sequence stops. A follow-up date is suggested.",
  out_of_office: "The Sequence is paused until the return date.",
  referral: "The referred person is proposed as a new Hiring Contact.",
  bounce: "The email is marked invalid and the next provider is tried (Credits charged only if found). The Sending Mailbox pauses above a 3% bounce rate.",
};

/** What happens automatically for a Reply Category, for the kind of person who replied (shown in the Inbox). */
export function replyCategoryEffect(category: ReplyCategory, personKind: PersonKind): string {
  const candidate = personKind === "candidate";
  switch (category) {
    case "interested":
      return candidate
        ? "The Sequence to this Candidate stops. Send the drafted response yourself; it includes the Consent Page link."
        : "Outreach to everyone at this Prospect stops. Send the drafted response yourself.";
    case "not_interested":
      return candidate ? "Candidate data deleted immediately; only the hash stays on the Suppression List." : "The Prospect is closed for 6 months.";
    case "opt_out":
      return candidate
        ? "Candidate data deleted immediately; only the hash stays on the Suppression List, so no Workspace contacts them again."
        : "Added to the Suppression List immediately, across all Workspaces.";
    default:
      return SHARED_REPLY_CATEGORY_EFFECTS[category];
  }
}

export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  job_posting: "Job posting",
  job_posting_stale: "Job posting open 30+ days",
  funding_round: "Funding round",
  new_leader: "New leader",
  headcount_growth: "Headcount growth",
  expansion: "Expansion",
  layoffs: "Layoffs",
  tenure_sweet_spot: "Tenure sweet spot",
  employer_turbulence: "Employer turbulence",
  title_stagnation: "Title stagnation",
  recently_started: "Recently started",
  recently_promoted: "Recently promoted",
};

export const DISMISS_REASON_LABELS: Record<DismissReason, string> = {
  not_in_niche: "Not in this Niche",
  wrong_size: "Wrong company size",
  wrong_location: "Wrong location",
  already_client: "Already a Client",
  already_known: "Already known to us",
  bad_timing: "Bad timing",
  not_a_fit: "Not a Fit",
  other: "Other",
};

export const DISMISS_REASONS: DismissReason[] = [
  "not_in_niche",
  "wrong_size",
  "wrong_location",
  "already_client",
  "already_known",
  "bad_timing",
  "not_a_fit",
  "other",
];

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  work_email: "Work email",
  personal_email: "Personal email",
  mobile: "Mobile",
};

export const VERIFICATION_LABELS: Record<Verification, string> = {
  valid: "Valid",
  catch_all: "Catch-all",
  invalid: "Invalid",
  unverified: "Unverified",
};

export const PROVIDER_LABELS: Record<ProvenanceProvider, string> = {
  exa: "Exa",
  dropcontact: "Dropcontact",
  fullenrich: "FullEnrich",
  bettercontact: "BetterContact",
};

export const METHOD_LABELS: Record<ProvenanceMethod, string> = {
  cited_public_page: "Cited public page, re-fetched",
  pattern_and_smtp_check: "Pattern and SMTP check",
  provider_waterfall: "Provider waterfall",
};

export const MAILBOX_STATUS_LABELS: Record<MailboxStatus, string> = {
  warming: "Ramping up",
  active: "Active",
  paused: "Paused",
  refused: "Refused",
};

export const RECIPIENT_STATE_LABELS: Record<RecipientState, string> = {
  awaiting_review: "Awaiting review",
  scheduled: "Scheduled",
  sent: "Sent",
  replied: "Replied",
  stopped: "Stopped",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
};

export const AUDIENCE_LABELS: Record<CampaignAudience, string> = {
  hiring_contacts: "Hiring Contacts",
  candidates: "Candidates",
};

export const AUTONOMY_LABELS: Record<Autonomy, string> = {
  review_all: "Review every email",
  review_first_n: "Review the first emails",
  auto: "Automatic",
};

export const AUTONOMY_DESCRIPTIONS: Record<Autonomy, string> = {
  review_all: "Every email, first emails and follow-ups, waits for your approval before it is scheduled.",
  review_first_n: "You approve the first N emails; once the drafts look right, the rest are scheduled automatically.",
  auto: "Emails are scheduled as soon as recipients join. Replies always wait for you.",
};

export const CONSENT_LABELS: Record<ConsentChoice, string> = {
  talent_pool: "Talent Pool",
  this_opportunity: "This opportunity only",
  delete: "Delete my data",
};

export const DATA_REQUEST_KIND_LABELS: Record<DataRequestKind, string> = {
  access: "Access",
  export: "Export",
  delete: "Delete",
};

export const SUPPRESSION_REASON_LABELS: Record<SuppressionReason, string> = {
  opt_out: "Opt-out",
  not_interested: "Not Interested (Candidate data deleted)",
  data_request_delete: "Data Request: delete",
  manual: "Added manually",
};

/** OAuth scopes requested at sign-in: identity only (ADR-0014). */
export const IDENTITY_SCOPES: Record<"google" | "microsoft", string[]> = {
  google: ["openid", "email", "profile"],
  microsoft: ["openid", "email", "profile", "User.Read"],
};

/** Separate consent when connecting a Sending Mailbox (send and detect replies on that mailbox). */
export const MAILBOX_SCOPES: Record<"google" | "microsoft", string[]> = {
  google: ["gmail.send", "gmail.readonly (reply and bounce detection)"],
  microsoft: ["Mail.Send", "Mail.Read (reply and bounce detection)"],
};

/** Separate read-only consent to learn a Voice Profile from sent emails. */
export const VOICE_SCAN_SCOPES: Record<"google" | "microsoft", string[]> = {
  google: ["gmail.readonly (sent folder only, last 12 months)"],
  microsoft: ["Mail.Read (Sent Items only, last 12 months)"],
};

/** Sending caps (ADR-0017). */
export const SENDING_LIMITS = {
  perMailboxPerDay: 30,
  perDomainPerDay: 60,
  rampStartPerDay: 5,
  rampDays: 21,
  bounceRatePausePercent: 3,
} as const;

/**
 * Candidate retention (ADR-0019): 25 days after being Surfaced while never Contacted, 90 days after the
 * first email without Consent (a reply does not extend it), and 2 years from the Talent Pool choice (6
 * months for this opportunity only). An Opt-out or "Delete my data" deletes at once, keeping only the
 * hash. One constant per rule: the simulation, the seed and the Article 14 Notice all read these.
 */
export const RETENTION = {
  surfacedCandidateDays: 25,
  contactedNoConsentDays: 90,
  talentPoolYears: 2,
  thisOpportunityMonths: 6,
  claimInactivityDays: 90,
  dataRequestDueDays: 30,
} as const;

/** The Digest lists best new Feed items only at or above this Signal Strength. */
export const DIGEST_MIN_SIGNAL_STRENGTH = 30;

/** The "Tenure sweet spot" Candidate Signal: months in the current role. */
export const TENURE_SWEET_SPOT_MONTHS = { min: 18, max: 36 } as const;

/** Tool names of the MCP server for the actions an AI client (or a chat proposal) can run. */
export const MCP_TOOL_NAMES: Partial<Record<ActionName, string>> = {
  findMoreLike: "find_more_like",
  quoteEnrichment: "quote_enrichment",
  enrich: "enrich_people",
  createCampaign: "create_campaign",
  sendReplyResponse: "send_reply_response",
  exportPerson: "export_person",
  addRecipients: "add_recipients",
  launchCampaign: "launch_campaign",
  sourceForDetectedRole: "source_for_detected_role",
};

export const MCP_SERVER_URL = "https://mcp.autorecruit.example/v1";
export const API_BASE_URL = "https://api.autorecruit.example/v1";
