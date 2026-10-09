// What deleting a Niche removes, computed the same way by the dummy backend (deleteNiche) and by the
// confirm dialog: the Prospects, Hiring Contacts and Candidates found only for this Niche, and its
// Campaigns. A Campaign that sent emails keeps its history for the audit trail, so its Niche stays.

import type { Campaign, Candidate, HiringContact, Prospect, Recipient } from "./types";

export interface NicheDeletionImpact {
  /** Prospects found only for this Niche (their Detected Roles and Hiring Contacts go with them). */
  prospectIds: string[];
  hiringContactIds: string[];
  /** Hiring Contacts holding contact values (an Enrichment was paid for them). */
  hiringContactsEnriched: number;
  /** Candidates found only for this Niche. */
  candidateIds: string[];
  candidatesEnriched: number;
  /** Campaigns of the Niche that never sent an email: deleted with it, their Claims released. */
  campaignsToDelete: Campaign[];
  /** Campaigns of the Niche that sent emails: the Niche cannot be deleted. */
  campaignsWithSends: Campaign[];
}

interface ImpactState {
  prospects: Prospect[];
  hiringContacts: HiringContact[];
  candidates: Candidate[];
  campaigns: Campaign[];
  recipients: Recipient[];
}

const holdsContactValues = (p: { contactValues: unknown[] }) => p.contactValues.length > 0;

export function nicheDeletionImpact(state: ImpactState, nicheId: string): NicheDeletionImpact {
  const only = (ids: string[]) => ids.length > 0 && ids.every((n) => n === nicheId);
  const prospectIds = state.prospects.filter((p) => only(p.nicheIds)).map((p) => p.id);
  const goneProspects = new Set(prospectIds);
  const hiringContacts = state.hiringContacts.filter((h) => goneProspects.has(h.prospectId));
  const candidates = state.candidates.filter((c) => only(c.nicheIds));
  const campaigns = state.campaigns.filter((c) => c.nicheId === nicheId);
  const sent = (c: Campaign) => state.recipients.some((r) => r.campaignId === c.id && r.messages.some((m) => m.status === "sent"));
  return {
    prospectIds,
    hiringContactIds: hiringContacts.map((h) => h.id),
    hiringContactsEnriched: hiringContacts.filter(holdsContactValues).length,
    candidateIds: candidates.map((c) => c.id),
    candidatesEnriched: candidates.filter(holdsContactValues).length,
    campaignsToDelete: campaigns.filter((c) => !sent(c)),
    campaignsWithSends: campaigns.filter(sent),
  };
}
