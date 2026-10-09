// Builds the Enrich dialog requests from a Feed selection. The Recruiter still confirms every
// person and ticks mobiles one by one (ADR-0005).

import type { EnrichRequest } from "./context";
import { type FeedModel, enrichBlocker, hasEmail, topEnrichableContact } from "./model";

/** One group per Prospect with its ranked Hiring Contacts; the best one not yet Enriched is pre-ticked. */
export function enrichRequestForProspects(model: FeedModel, prospectIds: string[], onDone?: () => void): EnrichRequest {
  return {
    onDone,
    groups: prospectIds.map((id) => {
      const p = model.prospectById.get(id);
      const contacts = (model.contactsByProspect.get(id) ?? []).slice(0, 3);
      const top = topEnrichableContact(model, id);
      return {
        title: p?.name ?? "Prospect",
        subtitle: p ? `${p.domain} · ${p.sector}` : null,
        people: contacts.map((h) => ({ ref: { kind: "hiring_contact" as const, id: h.id }, selected: top?.id === h.id, mobile: false })),
      };
    }),
  };
}

/** One person (a Hiring Contact from a Prospect detail, or a single Candidate). */
export function enrichRequestForHiringContact(model: FeedModel, hiringContactId: string): EnrichRequest {
  const h = model.state.hiringContacts.find((x) => x.id === hiringContactId);
  const p = h ? model.prospectById.get(h.prospectId) : undefined;
  return {
    groups: [
      {
        title: p?.name ?? null,
        subtitle: p ? `${p.domain} · ${p.sector}` : null,
        people: [{ ref: { kind: "hiring_contact", id: hiringContactId }, selected: true, mobile: false }],
      },
    ],
  };
}

export function enrichRequestForCandidates(model: FeedModel, candidateIds: string[], onDone?: () => void, mobiles?: Set<string>): EnrichRequest {
  return {
    onDone,
    groups: [
      {
        title: null,
        people: candidateIds.map((id) => {
          const c = model.state.candidates.find((x) => x.id === id);
          const blocked = c ? enrichBlocker(model, c, "candidate") !== null : true;
          const mobile = mobiles?.has(id) ?? false;
          // Someone who already holds a personal email is only ticked when a mobile is wanted.
          return { ref: { kind: "candidate" as const, id }, selected: !blocked && (mobile || (c ? !hasEmail(c, "candidate") : false)), mobile };
        }),
      },
    ],
  };
}

/** True when at least one Hiring Contact of the Prospect can still be enriched by the current Recruiter. */
export function prospectEnrichable(model: FeedModel, prospectId: string): boolean {
  return (model.contactsByProspect.get(prospectId) ?? []).some((h) => enrichBlocker(model, h, "hiring_contact") === null);
}

/** True when a Candidate can be added to a Campaign by the current Recruiter. */
export function candidateAddable(model: FeedModel, candidateId: string): boolean {
  const c = model.state.candidates.find((x) => x.id === candidateId);
  if (!c || !hasEmail(c, "candidate")) return false;
  return !(c.claim && c.claim.recruiterId !== model.me?.id);
}
