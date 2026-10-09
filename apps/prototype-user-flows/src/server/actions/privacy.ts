// Data and privacy (ADR-0003, ADR-0015, ADR-0016): Data Requests due within a month, finding a person
// (Candidates and Hiring Contacts searched separately, never linked), export with Provenance, deletion
// that keeps only the hash on the Suppression List, and manual Suppression List entries.

import { addDays } from "@/lib/dates";
import { truncateHash } from "@/lib/format";
import { DATA_REQUEST_KIND_LABELS, RETENTION } from "@/lib/labels";
import type { AppState, AuditEvent, Candidate, DataRequestKind, HiringContact, PersonExport, PersonKind, PersonRef, SuppressionReason } from "@/lib/types";
import type { HandlerMap } from "../handler-types";
import { audit, deleteCandidate, deleteHiringContact, fail, forgetDataRequester, getPerson, hashValue, isSuppressed, requirePersonRef, requireRecruiter, requireWorkspace, suppress } from "../helpers";
import { isActiveRecipient } from "../outreach";
import { newId } from "../runtime";
import { norm } from "../scoring";

const KINDS: DataRequestKind[] = ["access", "export", "delete"];
const SUPPRESSION_REASONS: SuppressionReason[] = ["opt_out", "not_interested", "data_request_delete", "manual"];
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Match {
  kind: PersonKind;
  id: string;
  name: string;
  detail: string;
  matchedOn: string;
}

function matchOn(person: Candidate | HiringContact, q: string): string | null {
  if (norm(person.name).includes(q)) return "name";
  for (const v of person.contactValues) {
    const value = norm(v.value).replace(/\s+/g, "");
    if (value === q.replace(/\s+/g, "") || (q.length >= 5 && value.includes(q.replace(/\s+/g, "")))) {
      return v.kind === "personal_email" ? "personal email" : v.kind === "work_email" ? "work email" : "mobile number";
    }
  }
  if (q.length >= 8 && norm(person.profileUrl).includes(q)) return "profile URL";
  return null;
}

/** Candidates and Hiring Contacts are searched separately and never cross-linked (ADR-0003). */
function searchPeople(state: AppState, query: string): Match[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const out: Match[] = [];
  for (const c of state.candidates) {
    const on = matchOn(c, q);
    if (on) out.push({ kind: "candidate", id: c.id, name: c.name, detail: `${c.currentTitle} at ${c.currentEmployer}`, matchedOn: on });
  }
  for (const h of state.hiringContacts) {
    const on = matchOn(h, q);
    const prospect = state.prospects.find((p) => p.id === h.prospectId);
    if (on) out.push({ kind: "hiring_contact", id: h.id, name: h.name, detail: `${h.title} at ${prospect?.name ?? "a Prospect"}`, matchedOn: on });
  }
  return out;
}

function personAudit(state: AppState, ref: PersonRef, name: string): AuditEvent[] {
  return state.auditLog.filter((e) => {
    const t = e.targetRef;
    if (t && t.kind === ref.kind && t.id === ref.id) return true;
    // Events about the other kind of person are never included, even with the same name (ADR-0003).
    if (t && (t.kind === "candidate" || t.kind === "hiring_contact")) return false;
    return e.target.includes(name);
  });
}

type PrivacyAction = "findPerson" | "createDataRequest" | "exportPerson" | "deletePerson" | "resolveDataRequest" | "addToSuppressionList";

export const privacyHandlers: HandlerMap<PrivacyAction> = {
  findPerson(state, p) {
    requireWorkspace(state);
    const me = requireRecruiter(state);
    const query = (p.query ?? "").trim();
    if (query.length < 2) fail("Search with a name, an email or a phone number.");
    const matches = searchPeople(state, query);
    const looksLikeContact = EMAIL_RE.test(query) || DOMAIN_RE.test(query.toLowerCase());
    const onSuppressionList =
      (looksLikeContact && isSuppressed(state, query)) ||
      matches.some((m) => getPerson(state, m)?.contactValues.some((v) => v.kind !== "mobile" && isSuppressed(state, v.value)) ?? false);
    audit(state, me.name, "Searched for a person (Data Request)", `"${query}": ${matches.length} ${matches.length === 1 ? "match" : "matches"}`, null);
    return { matches, onSuppressionList };
  },

  createDataRequest(state, p) {
    requireWorkspace(state);
    const me = requireRecruiter(state);
    const personQuery = (p.personQuery ?? "").trim();
    if (personQuery.length < 2) fail("Who is asking? Add a name or an email.");
    if (!KINDS.includes(p.kind)) fail("Pick the kind of request.");
    const requesterEmail = (p.requesterEmail ?? (EMAIL_RE.test(personQuery) ? personQuery : "")).trim().toLowerCase();
    if (requesterEmail && !EMAIL_RE.test(requesterEmail)) fail("The requester's email is not valid.");
    const id = newId("dr");
    const today = state.clock.today;
    state.dataRequests.unshift({
      id,
      personQuery,
      requesterEmail,
      channel: "email",
      receivedOn: today,
      dueOn: addDays(today, RETENTION.dataRequestDueDays),
      kind: p.kind,
      status: "open",
      resolution: null,
      completedOn: null,
      matches: searchPeople(state, personQuery).map((m) => ({ kind: m.kind, id: m.id })),
      deletedCandidate: false,
    });
    audit(state, me.name, `Recorded a Data Request (${DATA_REQUEST_KIND_LABELS[p.kind].toLowerCase()})`, personQuery, { kind: "data_request", id });
    return { dataRequestId: id };
  },

  exportPerson(state, payload) {
    const ws = requireWorkspace(state);
    const me = requireRecruiter(state);
    const p = { ...payload, person: requirePersonRef(payload.person) };
    const person = getPerson(state, p.person);
    if (!person) fail("This person is no longer stored.");
    const { contactValues, ...rest } = person;
    const signals = p.person.kind === "candidate" ? (person as Candidate).signals : [];
    const campaigns = state.recipients
      .filter((r) => r.personKind === p.person.kind && r.personId === person.id)
      .map((r) => ({
        campaign: state.campaigns.find((c) => c.id === r.campaignId)?.name ?? "Deleted Campaign",
        messages: r.messages.filter((m) => m.status === "sent").map((m) => ({ subject: m.subject, sentOn: m.sentOn })),
      }));
    const data: PersonExport = {
      generatedOn: state.clock.today,
      workspace: ws.name,
      controller: `${ws.name} (data controller), ${ws.address}. Auto Recruit processes this data on its behalf, in the EU.`,
      person: rest as unknown as Record<string, unknown>,
      contactValues,
      signals,
      campaigns,
      auditTrail: personAudit(state, p.person, person.name),
    };
    audit(state, me.name, "Exported a person's data", `${p.person.kind === "candidate" ? "Candidate" : "Hiring Contact"} ${person.name}`, { kind: p.person.kind, id: person.id });
    return { export: data };
  },

  deletePerson(state, payload) {
    requireWorkspace(state);
    const me = requireRecruiter(state);
    const p = { ...payload, person: requirePersonRef(payload.person) };
    const person = getPerson(state, p.person);
    if (!person) fail("This person is no longer stored.");
    const label = p.person.kind === "candidate" ? "Candidate" : "Hiring Contact";
    const hash = p.person.kind === "candidate" ? deleteCandidate(state, person.id, "data_request_delete") : deleteHiringContact(state, person.id, "data_request_delete");
    if (!hash) fail("This person is no longer stored.");
    if (p.dataRequestId) {
      const dr = state.dataRequests.find((d) => d.id === p.dataRequestId);
      if (dr) dr.matches = dr.matches.filter((m) => !(m.kind === p.person.kind && m.id === p.person.id));
    }
    audit(state, me.name, "Deleted a person's data (Data Request)", `${label} deleted, ${truncateHash(hash)} kept on the Suppression List`, p.dataRequestId ? { kind: "data_request", id: p.dataRequestId } : null);
    return { hash };
  },

  resolveDataRequest(state, p) {
    const me = requireRecruiter(state);
    const dr = state.dataRequests.find((d) => d.id === p.dataRequestId);
    if (!dr) fail("Data Request not found.");
    if (dr.status === "completed") fail("This Data Request is already completed.");
    const resolution = (p.resolution ?? "").trim();
    if (resolution.length < 5) fail("Describe what was done.");
    dr.status = "completed";
    dr.completedOn = state.clock.today;
    dr.resolution = resolution;
    forgetDataRequester(state, dr);
    audit(state, me.name, `Completed a Data Request (${DATA_REQUEST_KIND_LABELS[dr.kind].toLowerCase()})`, dr.personQuery, { kind: "data_request", id: dr.id });
    return {};
  },

  addToSuppressionList(state, p) {
    requireWorkspace(state);
    const me = requireRecruiter(state);
    const value = (p.value ?? "").trim().toLowerCase();
    const kind = value.includes("@") ? "email" : "domain";
    if (kind === "email" ? !EMAIL_RE.test(value) : !DOMAIN_RE.test(value)) fail("Enter an email address or a domain.");
    const reason = p.reason ?? "manual";
    if (!SUPPRESSION_REASONS.includes(reason)) fail("Unknown reason.");
    const existing = hashValue(value);
    if (state.suppressionList.some((e) => e.hash === existing)) fail(`Already on the Suppression List (${truncateHash(existing)}).`);
    const hash = suppress(state, value, reason, kind);
    // Anyone using that address (or domain) stops being contacted right away.
    let stopped = 0;
    for (const person of [...state.candidates, ...state.hiringContacts]) {
      const hit = person.contactValues.some((v) => v.kind !== "mobile" && (kind === "email" ? v.value.toLowerCase() === value : v.value.toLowerCase().endsWith(`@${value}`)));
      if (!hit) continue;
      person.lifecycle = "suppressed";
      for (const r of state.recipients) {
        if (r.personId !== person.id || !isActiveRecipient(r)) continue;
        r.state = "stopped";
        r.stopReason = "On the Suppression List";
        r.messages = r.messages.filter((m) => m.status === "sent");
        stopped++;
      }
    }
    audit(state, me.name, "Added to the Suppression List", `${kind === "email" ? "An email" : "A domain"} (${truncateHash(hash)})${stopped > 0 ? `, ${stopped} Sequence${stopped === 1 ? "" : "s"} stopped` : ""}`, null);
    return { hash };
  },
};
