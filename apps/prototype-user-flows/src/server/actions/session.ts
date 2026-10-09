// Session, Workspace and simulator actions.

import { isOnMainDomain, isPersonalEmailDomain } from "@/lib/domains";
import { formatDate } from "@/lib/format";
import { IDENTITY_SCOPES, REPLY_CATEGORY_LABELS } from "@/lib/labels";
import type { AppState } from "@/lib/types";
import { REPLY_CATEGORIES } from "@/lib/types";
import type { HandlerMap } from "../handler-types";
import { actorName, audit, domainOf, fail, requireRecruiter, requireWorkspace } from "../helpers";
import { newId } from "../runtime";
import { freshScenario } from "../scenario";
import { emptyState, USED_FREE_TEST_RUN_DOMAINS } from "../seed";
import { advance, applyReply, runAgentsNow } from "../sim";

/** A postal address on one line, as footers print it: "18 rue de Paradis\n75010 Paris" becomes "18 rue de Paradis, 75010 Paris". */
function oneLineAddress(raw: string): string {
  return raw
    .split(/\n+/)
    .map((line) => line.trim().replace(/\s+/g, " ").replace(/,$/, ""))
    .filter(Boolean)
    .join(", ");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function normaliseDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

/** Sending Mailboxes that end up on a Main Domain are refused, with the reason (ADR-0017). */
export function refuseMailboxesOnMainDomains(state: AppState): void {
  const ws = state.workspace;
  if (!ws) return;
  for (const m of state.mailboxes) {
    if (m.status === "refused" || !isOnMainDomain(m.domain, ws.mainDomains)) continue;
    m.status = "refused";
    m.dailyCap = 0;
    m.statusReason = `${m.domain} is a Main Domain of ${ws.name}. Campaign emails are never sent from a Main Domain, so a cold-email complaint can never hurt your everyday email. Use a lookalike domain instead.`;
    audit(state, "System", "Sending Mailbox refused: Main Domain", m.address, { kind: "mailbox", id: m.id });
  }
}

type SessionAction =
  | "signUp"
  | "signOut"
  | "switchRecruiter"
  | "updateWorkspace"
  | "advance"
  | "runAgentsNow"
  | "injectReply"
  | "loadScenario"
  | "reset"
  | "dismissNotice";

export const sessionHandlers: HandlerMap<SessionAction> = {
  signUp(input, p, ctx) {
    const fullName = (p.fullName ?? "").trim();
    const email = (p.email ?? "").trim().toLowerCase();
    const workspaceName = (p.workspaceName ?? "").trim();
    const address = oneLineAddress(p.address ?? "");
    if (p.provider !== "google" && p.provider !== "microsoft") fail("Sign in with Google or Microsoft.");
    if (fullName.length < 2) fail("Your name is missing.");
    if (!EMAIL_RE.test(email)) fail("This email address is not valid.");
    // The free Test Run is limited to work accounts (ADR-0018).
    if (isPersonalEmailDomain(domainOf(email))) fail("This is a personal account. The free Test Run needs a work account on your company's domain.");
    if (workspaceName.length < 2) fail("Give your Workspace a name.");
    if (p.mainDomains !== undefined && !Array.isArray(p.mainDomains)) fail("Main Domains must be a list.");
    const declared = [...(p.mainDomains ?? []), ...(p.mainDomain ? [p.mainDomain] : [])].map((d) => ({ raw: String(d), domain: normaliseDomain(String(d)) }));
    for (const { raw, domain } of declared) {
      if (!domain) continue;
      if (!DOMAIN_RE.test(domain)) fail(`"${raw.trim()}" is not a valid domain.`);
      if (isPersonalEmailDomain(domain)) fail(`"${domain}" is a personal email provider, not your company's domain.`);
    }
    if (address.length < 8) fail("Enter the postal address of your business: it appears in every email and in the Article 14 Notice.");
    // The sign-in email's domain is by definition an everyday-email domain: always a Main Domain, first.
    const emailDomain = domainOf(email);
    const mainDomains = Array.from(new Set([emailDomain, ...declared.map((d) => d.domain)].filter(Boolean)));

    // Signing up again from a populated prototype starts from an empty state (one Workspace at a time).
    const state = input.workspace ? ctx.replaceState({ ...emptyState("new_user"), version: input.version, clock: { ...input.clock } }) : input;
    const today = state.clock.today;
    const recruiterId = newId("rc");
    const workspaceId = newId("ws");
    // One free Test Run per Main Domain: the email domain and every declared Main Domain count.
    const usedBy = mainDomains.find((d) => USED_FREE_TEST_RUN_DOMAINS.includes(d)) ?? null;
    const usedBefore = usedBy !== null;
    state.scenario = "new_user";
    state.workspace = {
      id: workspaceId,
      name: workspaceName,
      plan: "free_trial",
      credits: 0,
      autoTopUp: { enabled: false, thresholdCredits: 200, packCredits: 2000 },
      mainDomains,
      freeTestRunUsedBy: usedBy,
      address,
      createdOn: today,
    };
    state.recruiters = [
      { id: recruiterId, name: fullName, email, role: "owner", title: "Founder, recruiter", status: "active", invitedOn: null, joinedOn: today },
    ];
    state.session = { signedIn: true, recruiterId, provider: p.provider, scopes: [...IDENTITY_SCOPES[p.provider]], signedInOn: today };
    // The Workspace's Ask conversation starts empty (anything asked before sign-up only pointed here).
    state.chat = [];
    const providerName = p.provider === "google" ? "Google" : "Microsoft";
    audit(state, fullName, `Signed up with ${providerName} (identity scopes only)`, workspaceName, { kind: "workspace", id: workspaceId });
    for (const d of mainDomains) audit(state, fullName, "Declared a Main Domain", d, { kind: "workspace", id: workspaceId });
    if (usedBy) ctx.note(`${usedBy} already used its free Test Run: the next one needs Credits.`);
    return { workspaceId, recruiterId, freeTestRunAvailable: !usedBefore };
  },

  signOut(state) {
    const name = actorName(state);
    if (state.session.signedIn) audit(state, name, "Signed out", state.workspace?.name ?? "", null);
    state.session = { signedIn: false, recruiterId: null, provider: null, scopes: [], signedInOn: null };
    return {};
  },

  switchRecruiter(state, p) {
    requireWorkspace(state);
    const r = requireRecruiter(state, p.recruiterId);
    if (r.status !== "active") fail(`${r.name} has not accepted the invitation yet.`);
    state.session = { ...state.session, signedIn: true, recruiterId: r.id };
    return {};
  },

  updateWorkspace(state, p, ctx) {
    const ws = requireWorkspace(state);
    const me = requireRecruiter(state);
    if (me.role !== "owner") fail("Only an Owner can change the Workspace.");
    if (p.name !== undefined) {
      const name = p.name.trim();
      if (name.length < 2) fail("Give your Workspace a name.");
      ws.name = name;
    }
    if (p.address !== undefined) {
      const address = oneLineAddress(p.address);
      if (address.length < 8) fail("Enter the postal address of your business: it appears in every email and in the Article 14 Notice.");
      ws.address = address;
    }
    if (p.mainDomains !== undefined) {
      if (!Array.isArray(p.mainDomains)) fail("Main Domains must be a list.");
      const domains = p.mainDomains.map((d) => normaliseDomain(String(d))).filter(Boolean);
      if (domains.length === 0) fail("Declare at least one Main Domain.");
      const invalid = domains.find((d) => !DOMAIN_RE.test(d));
      if (invalid) fail(`"${invalid}" is not a valid domain.`);
      const personal = domains.find(isPersonalEmailDomain);
      if (personal) fail(`"${personal}" is a personal email provider, not your company's domain.`);
      const unique = Array.from(new Set(domains));
      const added = unique.filter((d) => !ws.mainDomains.includes(d));
      const removed = ws.mainDomains.filter((d) => !unique.includes(d));
      // A Recruiter's sign-in email domain is an everyday-email domain: it stays a Main Domain.
      for (const d of removed) {
        const user = state.recruiters.find((r) => domainOf(r.email) === d);
        if (user) fail(`${d} is the domain of ${user.name}'s sign-in email, so it stays a Main Domain.`);
      }
      ws.mainDomains = unique;
      for (const d of added) audit(state, me.name, "Declared a Main Domain", d, { kind: "workspace", id: ws.id });
      for (const d of removed) audit(state, me.name, "Removed a Main Domain", d, { kind: "workspace", id: ws.id });
      // One free Test Run per Main Domain: a domain that already used it, declared later, uses it up here
      // too. Removing a domain never gives the free Test Run back.
      const usedBy = ws.freeTestRunUsedBy === null ? added.find((d) => USED_FREE_TEST_RUN_DOMAINS.includes(d)) : undefined;
      if (usedBy) {
        ws.freeTestRunUsedBy = usedBy;
        ctx.note(`${usedBy} already used its free Test Run: the next one needs Credits.`);
        audit(state, "System", "Free Test Run already used", usedBy, { kind: "workspace", id: ws.id });
      }
      refuseMailboxesOnMainDomains(state);
    }
    return {};
  },

  advance(state, p, ctx) {
    requireWorkspace(state);
    const days = Number(p.days);
    if (!Number.isFinite(days) || days < 1) fail("Advance by at least one day.");
    const lines = advance(state, days);
    // The date change itself is listed by the change summary.
    for (const l of lines.filter((x) => !x.startsWith("Simulated date") && !x.startsWith("Advanced "))) ctx.note(l);
    return { today: state.clock.today, lines };
  },

  runAgentsNow(state, p, ctx) {
    requireWorkspace(state);
    const lines = runAgentsNow(state, p.nicheId);
    for (const l of lines) ctx.note(l);
    return { lines };
  },

  injectReply(state, p, ctx) {
    requireWorkspace(state);
    if (!REPLY_CATEGORIES.includes(p.category)) fail("Pick a Reply Category.");
    const r = state.recipients.find((x) => x.id === p.recipientId);
    if (!r) fail("Recipient not found.");
    if (r.personDeleted) fail("This person's data was deleted.");
    if (!r.messages.some((m) => m.origin === "campaign" && m.status === "sent")) fail("Only Contacted recipients can reply: no email was sent to this recipient yet.");
    if (state.replies.some((x) => x.recipientId === r.id && x.category !== "out_of_office" && x.category !== "bounce")) {
      fail(`${r.personLabel} already replied.`);
    }
    const reply = applyReply(state, r, p.category);
    audit(state, "Simulator", `Injected a reply: ${REPLY_CATEGORY_LABELS[p.category]}`, reply.personLabel, { kind: "reply", id: reply.id });
    for (const e of reply.effects) ctx.note(`Automatic effect: ${e.description}`);
    return { replyId: reply.id };
  },

  loadScenario(state, p, ctx) {
    if (p.scenario !== "new_user" && p.scenario !== "established") fail("Unknown scenario.");
    const next = ctx.replaceState(freshScenario(p.scenario, state.version));
    ctx.note(p.scenario === "established" ? `Loaded the Established workspace (${formatDate(next.clock.today)}).` : "Loaded the New user scenario: nothing exists yet.");
    return {};
  },

  dismissNotice(state, p) {
    requireWorkspace(state);
    const notice = state.notices.find((n) => n.id === p.noticeId);
    if (!notice) fail("This notice no longer exists.");
    notice.dismissedOn ??= state.clock.today;
    return {};
  },

  reset(state, _p, ctx) {
    ctx.replaceState(freshScenario(state.scenario, state.version));
    ctx.note(`Reset to the start of the ${state.scenario === "established" ? "Established workspace" : "New user"} scenario.`);
    return {};
  },
};

