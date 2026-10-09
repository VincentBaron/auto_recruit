// Team (Recruiters, Owners) and API Keys acting for a named Recruiter (ADR-0008).

import { formatDate } from "@/lib/format";
import type { HandlerMap } from "../handler-types";
import { audit, fail, recruiterName, requireRecruiter, requireWorkspace } from "../helpers";
import { isActiveRecipient } from "../outreach";
import { hashString } from "../rng";
import { newId } from "../runtime";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function keyChars(seed: string, n: number): string {
  let out = "";
  let h = hashString(seed);
  for (let i = 0; i < n; i++) {
    h = hashString(`${h}|${i}|${seed}`);
    out += KEY_CHARS[h % KEY_CHARS.length];
  }
  return out;
}

function requireOwner(state: Parameters<typeof requireRecruiter>[0]) {
  const me = requireRecruiter(state);
  if (me.role !== "owner") fail("Only an Owner can manage the team and API Keys.");
  return me;
}

type TeamAction = "inviteRecruiter" | "updateRecruiterRole" | "removeRecruiter" | "createApiKey" | "revokeApiKey";

export const teamHandlers: HandlerMap<TeamAction> = {
  inviteRecruiter(state, p) {
    const ws = requireWorkspace(state);
    const me = requireOwner(state);
    const name = (p.name ?? "").trim();
    const email = (p.email ?? "").trim().toLowerCase();
    if (name.length < 2) fail("Add the Recruiter's name.");
    if (!EMAIL_RE.test(email)) fail("This email address is not valid.");
    if (state.recruiters.some((r) => r.email === email)) fail(`${email} is already in ${ws.name}.`);
    if (p.role !== "owner" && p.role !== "recruiter") fail("Pick a role.");
    const id = newId("rc");
    state.recruiters.push({ id, name, email, role: p.role, title: p.role === "owner" ? "Owner" : "Recruiter", status: "invited", invitedOn: state.clock.today, joinedOn: null });
    audit(state, me.name, "Invited a Recruiter", `${name} (${p.role === "owner" ? "Owner" : "Recruiter"})`, { kind: "workspace", id: ws.id });
    return { recruiterId: id };
  },

  updateRecruiterRole(state, p) {
    const me = requireOwner(state);
    const r = requireRecruiter(state, p.recruiterId);
    if (p.role !== "owner" && p.role !== "recruiter") fail("Pick a role.");
    if (r.role === p.role) return {};
    if (r.role === "owner" && p.role === "recruiter") {
      const owners = state.recruiters.filter((x) => x.role === "owner" && x.status === "active");
      if (owners.length <= 1 && r.status === "active") fail(`${r.name} is the last Owner: make someone else an Owner first.`);
    }
    r.role = p.role;
    if (r.title === "Owner" || r.title === "Recruiter") r.title = p.role === "owner" ? "Owner" : "Recruiter";
    audit(state, me.name, "Changed a Recruiter's role", `${r.name}: now ${p.role === "owner" ? "an Owner" : "a Recruiter"}`, null);
    return {};
  },

  removeRecruiter(state, p) {
    const me = requireOwner(state);
    const r = requireRecruiter(state, p.recruiterId);
    if (r.id === me.id) fail("You cannot remove yourself. Ask another Owner.");
    const niches = state.niches.filter((n) => n.ownerId === r.id);
    if (niches.length > 0) fail(`${r.name} owns ${niches.length === 1 ? `the Niche "${niches[0].name}"` : `${niches.length} Niches`}: give them to someone else first.`);
    if (r.role === "owner" && state.recruiters.filter((x) => x.role === "owner" && x.status === "active").length <= 1) fail(`${r.name} is the last Owner.`);
    const today = state.clock.today;
    // Their Claims are released and their Campaigns stop sending: nobody else can send as them.
    let claims = 0;
    for (const person of [...state.candidates, ...state.hiringContacts]) {
      if (person.claim?.recruiterId !== r.id) continue;
      person.claim = null;
      claims++;
    }
    for (const c of state.campaigns) {
      if (c.ownerId !== r.id) continue;
      if (c.status === "active") c.status = "paused";
      c.ownerId = me.id;
      for (const rc of state.recipients) {
        if (rc.campaignId !== c.id || !isActiveRecipient(rc)) continue;
        rc.state = "stopped";
        rc.stopReason = `${r.name} left the Workspace`;
        rc.messages = rc.messages.filter((m) => m.status === "sent");
      }
    }
    for (const m of state.mailboxes) {
      if (m.recruiterId !== r.id || m.status === "refused") continue;
      m.status = "paused";
      m.statusReason = `Paused on ${formatDate(today)}: ${r.name} was removed from the Workspace.`;
    }
    for (const k of state.apiKeys) if (k.recruiterId === r.id && !k.revokedOn) k.revokedOn = today;
    state.recruiters = state.recruiters.filter((x) => x.id !== r.id);
    if (state.session.recruiterId === r.id) state.session.recruiterId = me.id;
    audit(state, me.name, "Removed a Recruiter", `${r.name}: ${claims} Claims released, Sending Mailboxes paused, API Keys revoked`, null);
    return {};
  },

  createApiKey(state, p) {
    const ws = requireWorkspace(state);
    const me = requireOwner(state);
    const name = (p.name ?? "").trim();
    if (name.length < 2) fail("Name the API Key after the integration that uses it.");
    const actsFor = requireRecruiter(state, p.recruiterId);
    if (actsFor.status !== "active") fail(`${actsFor.name} has not joined the Workspace yet.`);
    const id = newId("ak");
    const prefix = `ar_live_${keyChars(`${id}|prefix|${ws.id}`, 4)}`;
    const fullKey = `${prefix}${keyChars(`${id}|secret|${ws.id}|${state.clock.today}`, 28)}`;
    state.apiKeys.unshift({ id, name, recruiterId: actsFor.id, prefix, createdOn: state.clock.today, createdById: me.id, lastUsedOn: null, revokedOn: null });
    audit(state, me.name, "Created an API Key", `${name} (acts for ${actsFor.name})`, { kind: "api_key", id });
    return { apiKeyId: id, fullKey };
  },

  revokeApiKey(state, p) {
    const me = requireOwner(state);
    const key = state.apiKeys.find((k) => k.id === p.apiKeyId);
    if (!key) fail("API Key not found.");
    if (key.revokedOn) fail("This API Key is already revoked.");
    key.revokedOn = state.clock.today;
    audit(state, me.name, "Revoked an API Key", `${key.name} (acted for ${recruiterName(state, key.recruiterId)})`, { kind: "api_key", id: key.id });
    return {};
  },
};
