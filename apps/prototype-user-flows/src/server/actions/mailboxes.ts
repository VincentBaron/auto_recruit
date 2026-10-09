// Sending Mailboxes (ADR-0009, ADR-0017) and Voice Profiles (ADR-0014): connect with a separate
// consent, Main Domain refusal, assisted setup on a lookalike domain, ramp, pause; mailbox scan and
// pasted examples for the Voice Profile.

import { isOnMainDomain } from "@/lib/domains";
import { formatDate, plural } from "@/lib/format";
import { MAILBOX_SCOPES, SENDING_LIMITS, VOICE_SCAN_SCOPES } from "@/lib/labels";
import type { AppState, Language, SendingMailbox, VoiceExample, VoiceProfile } from "@/lib/types";
import type { HandlerMap } from "../handler-types";
import { audit, domainOf, fail, recruiterName, requireRecruiter, requireWorkspace } from "../helpers";
import { hashString } from "../rng";
import { newId } from "../runtime";
import { initialSteps, rampCap } from "../sim";
import { SCANNED_STYLE, scannedExamples } from "../voice";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCAL_RE = /^[a-z0-9]([a-z0-9._-]{0,40}[a-z0-9])?$/;
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export const ASSISTED_SETUP_STEPS = [
  "Registering the domain in your name",
  "Configuring SPF, DKIM and DMARC",
  "Creating mailboxes in your tenant",
  "Starting the ramp-up",
];

const PROVIDER_PRODUCT = { google: "Google Workspace", microsoft: "Microsoft 365" } as const;

function requireMailbox(state: AppState, id: string): SendingMailbox {
  const m = state.mailboxes.find((x) => x.id === id);
  if (!m) fail("Sending Mailbox not found.");
  return m;
}

function requireMailboxManager(state: AppState, m: SendingMailbox): string {
  const me = requireRecruiter(state);
  if (m.recruiterId !== me.id && me.role !== "owner") fail(`Only ${recruiterName(state, m.recruiterId)} or an Owner can change this Sending Mailbox.`);
  return me.name;
}

function targetRecruiter(state: AppState, recruiterId: string | undefined, what: string) {
  const me = requireRecruiter(state);
  const r = requireRecruiter(state, recruiterId ?? me.id);
  if (r.id !== me.id && me.role !== "owner") fail(`Only an Owner can ${what} for another Recruiter.`);
  if (r.status !== "active") fail(`${r.name} has not joined the Workspace yet.`);
  return { me, r };
}

/* ------------------------------------------------------------------ */
/* Voice Profile helpers                                               */
/* ------------------------------------------------------------------ */

function parseExample(raw: string): VoiceExample {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const m = text.match(/^(?:subject|objet)\s*:\s*(.+)\n+([\s\S]*)$/i);
  return m ? { subject: m[1].trim(), body: m[2].trim(), origin: "pasted" } : { subject: null, body: text, origin: "pasted" };
}

/** Style rules inferred from pasted emails (the canned equivalent of the Outreach Agent's analysis). */
function styleFromExamples(examples: VoiceExample[], language: Language): string[] {
  const rules: string[] = [];
  const bodies = examples.map((e) => e.body);
  const firstLines = bodies.map((b) => b.split("\n")[0]?.trim() ?? "");
  const greeting = firstLines.map((l) => l.split(/[\s,]/)[0]).find(Boolean);
  if (greeting) rules.push(language === "fr" ? `Opens with « ${greeting} » and the first name` : `Opens with "${greeting}" and the first name`);
  const avgWords = Math.round(bodies.reduce((s, b) => s + b.split(/\s+/).filter(Boolean).length, 0) / Math.max(1, bodies.length));
  rules.push(`Short emails, about ${Math.max(40, Math.ceil(avgWords / 10) * 10)} words`);
  if (bodies.filter((b) => /\?\s*\n/.test(b) || /\?\s*$/.test(b.split("\n\n").slice(-2, -1)[0] ?? "")).length >= Math.ceil(bodies.length / 2)) rules.push("Ends with one question proposing a next step");
  const lastLines = bodies.map((b) => b.trim().split("\n").slice(-2, -1)[0]?.trim() ?? "").filter((l) => l.length > 0 && l.length < 30);
  if (lastLines[0]) rules.push(language === "fr" ? `Signs off with « ${lastLines[0]} »` : `Signs off with "${lastLines[0]}"`);
  if (language === "fr") rules.push(bodies.some((b) => /\btu\b|\bte\b|\bton\b/i.test(b)) ? "Uses « tu » with people already known" : "Uses « vous »");
  return rules;
}

function mergeRules(existing: string[], add: string[]): string[] {
  const out = [...existing];
  for (const r of add) {
    const key = r.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
    if (!out.some((x) => x.toLowerCase().startsWith(key))) out.push(r);
  }
  return out;
}

function findOrCreateProfile(state: AppState, recruiterId: string, language: Language, source: VoiceProfile["source"]): VoiceProfile {
  let vp = state.voiceProfiles.find((v) => v.recruiterId === recruiterId && v.language === language);
  if (!vp) {
    vp = { id: newId("vp"), recruiterId, language, source, styleGuide: [], examples: [], learnedFromEdits: [], emailsAnalysed: 0, updatedOn: state.clock.today };
    state.voiceProfiles.push(vp);
  }
  return vp;
}

type MailboxAction =
  | "connectMailbox"
  | "suggestLookalikeDomains"
  | "startAssistedSetup"
  | "pauseMailbox"
  | "resumeMailbox"
  | "removeMailbox"
  | "scanVoiceProfile"
  | "pasteVoiceExamples"
  | "updateVoiceProfile"
  | "revokeMailboxScan";

export const mailboxHandlers: HandlerMap<MailboxAction> = {
  connectMailbox(state, p) {
    const ws = requireWorkspace(state);
    const { me, r } = targetRecruiter(state, p.recruiterId, "connect a Sending Mailbox");
    if (!p.termsRiskAcknowledged) fail(`Acknowledge the ${PROVIDER_PRODUCT[p.provider] ?? "provider"} terms risk first.`);
    const address = (p.address ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(address)) fail("This email address is not valid.");
    const existing = state.mailboxes.find((m) => m.address === address);
    if (existing?.status === "refused") fail(`${address} was already refused: it is on a Main Domain. Use a lookalike domain instead.`);
    if (existing) fail(`${address} is already connected.`);
    const domain = domainOf(address);
    const today = state.clock.today;
    const h = hashString(address);
    const product = PROVIDER_PRODUCT[p.provider];
    const base: SendingMailbox = {
      id: newId("mb"),
      recruiterId: r.id,
      address,
      displayName: r.name,
      provider: p.provider,
      domain,
      health: { spf: true, dkim: true, dmarc: h % 5 !== 0, domainAgeDays: 30 + (h % 900), blocklisted: false, inboxPlacement: null },
      rampDay: 1,
      dailyCap: rampCap(1),
      sentToday: 0,
      sentTotal: 0,
      bouncesTotal: 0,
      bounceRate: 0,
      status: "warming",
      statusReason: "New mailbox: ramping up from 5 emails a day, measured with our seed mailboxes.",
      connectedOn: today,
      setup: "connected",
      alreadyWarmed: Boolean(p.alreadyWarmed),
    };
    // The Main Domain check comes first: a refused address never gets send access.
    if (isOnMainDomain(domain, ws.mainDomains)) {
      const main = ws.mainDomains.find((d) => isOnMainDomain(domain, [d])) ?? domain;
      const reason =
        main === domain
          ? `${domain} is a Main Domain of ${ws.name}. Campaign emails are never sent from a Main Domain, so a cold-email complaint can never hurt your everyday email. Use a lookalike domain instead.`
          : `${domain} is on ${main}, a Main Domain of ${ws.name}. Campaign emails are never sent from a Main Domain or its subdomains, so a cold-email complaint can never hurt your everyday email. Use a lookalike domain instead.`;
      state.mailboxes.push({ ...base, status: "refused", statusReason: reason, dailyCap: 0, rampDay: 0 });
      audit(state, "System", "Sending Mailbox refused: Main Domain", address, { kind: "mailbox", id: base.id });
      return { mailboxId: base.id, status: "refused", reason };
    }
    audit(state, me.name, `Granted send access to a Sending Mailbox (${MAILBOX_SCOPES[p.provider].join(", ")})`, `${address}, separate from sign-in`, null);

    const mailbox: SendingMailbox = p.alreadyWarmed
      ? { ...base, status: "active", statusReason: null, rampDay: SENDING_LIMITS.rampDays, dailyCap: SENDING_LIMITS.perMailboxPerDay, health: { ...base.health, inboxPlacement: 85 + (h % 10) } }
      : base;
    state.mailboxes.push(mailbox);
    if (!state.sendingDomains.some((d) => d.domain === domain)) {
      state.sendingDomains.push({
        domain,
        registeredOn: today,
        registeredFor: ws.name,
        provider: p.provider,
        assisted: false,
        dailyCap: SENDING_LIMITS.perDomainPerDay,
        sentToday: 0,
        dns: { spf: mailbox.health.spf, dkim: mailbox.health.dkim, dmarc: mailbox.health.dmarc },
      });
    }
    audit(state, me.name, `Connected a Sending Mailbox (${product} terms risk acknowledged)`, `${address} for ${r.name}${p.alreadyWarmed ? ", already warmed: 30 a day" : ", ramping up from 5 a day"}`, { kind: "mailbox", id: mailbox.id });
    return { mailboxId: mailbox.id, status: mailbox.status, reason: mailbox.statusReason };
  },

  suggestLookalikeDomains(state, p) {
    const ws = requireWorkspace(state);
    const main = (p.mainDomain ?? ws.mainDomains[0] ?? "").toLowerCase();
    const brand = main.split(".")[0]?.replace(/[^a-z0-9-]/g, "") || "agency";
    const taken = new Set([...state.sendingDomains.map((d) => d.domain), ...ws.mainDomains]);
    const ideas = [`get${brand}.com`, `${brand}-hq.com`, `try${brand}.com`, `${brand}team.com`, `meet${brand}.com`, `hello${brand}.com`];
    const fresh = ideas.filter((d) => !taken.has(d));
    // One name is always registered by someone else, to show what an unavailable domain looks like.
    const unavailable = fresh[hashString(brand) % Math.min(3, fresh.length)] ?? null;
    const domains = fresh.slice(0, 4).map((domain) => ({ domain, available: domain !== unavailable, priceEurPerYear: domain.endsWith(".com") ? 12 : 15 }));
    return { domains };
  },

  startAssistedSetup(state, p, ctx) {
    const ws = requireWorkspace(state);
    const { me, r } = targetRecruiter(state, p.recruiterId, "set up Sending Mailboxes");
    if (!p.termsRiskAcknowledged) fail(`Acknowledge the ${PROVIDER_PRODUCT[p.provider] ?? "provider"} terms risk first.`);
    const domain = (p.domain ?? "").trim().toLowerCase();
    if (!DOMAIN_RE.test(domain)) fail("Pick a lookalike domain.");
    if (isOnMainDomain(domain, ws.mainDomains)) fail(`${domain} is on a Main Domain of ${ws.name}: Campaign emails are never sent from a Main Domain or its subdomains. Pick a lookalike domain.`);
    if (state.assistedSetups.some((s) => s.domain === domain && s.status === "running")) fail(`The setup of ${domain} is already running.`);
    const locals = (p.mailboxLocalParts ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean);
    if (locals.length === 0) fail("Name at least one mailbox.");
    const onDomain = state.mailboxes.filter((m) => m.domain === domain && m.status !== "refused").length;
    if (locals.length + onDomain > 2) fail(`At most 2 mailboxes per domain: ${SENDING_LIMITS.perDomainPerDay} emails a day per domain, ${SENDING_LIMITS.perMailboxPerDay} per mailbox.`);
    const bad = locals.find((l) => !LOCAL_RE.test(l));
    if (bad) fail(`"${bad}" is not a valid mailbox name.`);
    const addresses = locals.map((l) => `${l}@${domain}`);
    const dup = addresses.find((a) => state.mailboxes.some((m) => m.address === a));
    if (dup) fail(`${dup} already exists.`);
    const setup = {
      id: newId("as"),
      recruiterId: r.id,
      provider: p.provider,
      domain,
      mailboxAddresses: addresses,
      status: "running" as const,
      startedAtMs: ctx.nowMs,
      startedOn: state.clock.today,
      steps: initialSteps(ASSISTED_SETUP_STEPS),
      progress: 0,
      adminConsentGrantedOn: state.clock.today,
      termsRiskAcknowledged: true,
      createdMailboxIds: [],
    };
    state.assistedSetups.push(setup);
    audit(state, me.name, `Started an assisted setup (${PROVIDER_PRODUCT[p.provider]} admin consent, terms risk acknowledged)`, `${domain} registered in the name of ${ws.name}: ${addresses.join(", ")}`, null);
    return { setupId: setup.id };
  },

  pauseMailbox(state, p) {
    const m = requireMailbox(state, p.mailboxId);
    const who = requireMailboxManager(state, m);
    if (m.status !== "active" && m.status !== "warming") fail(`${m.address} is not sending.`);
    m.status = "paused";
    m.statusReason = `Paused by ${who} on ${formatDate(state.clock.today)}.`;
    audit(state, who, "Paused a Sending Mailbox", m.address, { kind: "mailbox", id: m.id });
    return {};
  },

  resumeMailbox(state, p) {
    const m = requireMailbox(state, p.mailboxId);
    const who = requireMailboxManager(state, m);
    if (m.status !== "paused") fail(`${m.address} is not paused.`);
    const ramping = m.rampDay < SENDING_LIMITS.rampDays && !m.alreadyWarmed;
    m.status = ramping ? "warming" : "active";
    m.dailyCap = ramping ? rampCap(m.rampDay) : SENDING_LIMITS.perMailboxPerDay;
    m.statusReason = ramping ? `Ramping up again: day ${m.rampDay} of ${SENDING_LIMITS.rampDays}, resumed after a pause.` : null;
    audit(state, who, "Resumed a Sending Mailbox", m.address, { kind: "mailbox", id: m.id });
    return {};
  },

  removeMailbox(state, p) {
    const m = requireMailbox(state, p.mailboxId);
    const who = requireMailboxManager(state, m);
    state.mailboxes = state.mailboxes.filter((x) => x.id !== m.id);
    for (const c of state.campaigns) c.mailboxIds = c.mailboxIds.filter((id) => id !== m.id);
    // Recipients on this mailbox move to another Sending Mailbox of their Campaign, and their unsent
    // emails show it as From. With none left, the Campaign reports "No Sending Mailbox" and the
    // drafts show no From address, never the removed one.
    let moved = 0;
    for (const r of state.recipients) {
      if (r.mailboxId !== m.id) continue;
      const campaign = state.campaigns.find((c) => c.id === r.campaignId);
      const next = campaign?.mailboxIds.map((id) => state.mailboxes.find((x) => x.id === id)).find((x) => x && x.status !== "refused");
      r.mailboxId = next?.id ?? "";
      for (const msg of r.messages) if (msg.status !== "sent") msg.footer.senderEmail = next?.address ?? "";
      moved++;
    }
    if (!state.mailboxes.some((x) => x.domain === m.domain)) {
      state.sendingDomains = state.sendingDomains.filter((d) => d.domain !== m.domain || d.assisted);
    }
    audit(state, who, "Removed a Sending Mailbox", `${m.address}${moved > 0 ? ` (${plural(moved, "recipient")} moved)` : ""}`, null);
    return {};
  },

  scanVoiceProfile(state, p) {
    requireWorkspace(state);
    const me = requireRecruiter(state);
    const recruiterId = p.recruiterId ?? me.id;
    if (recruiterId !== me.id) fail(`Only ${recruiterName(state, recruiterId)} can grant read-only access to their own sent emails.`);
    if (p.language !== "fr" && p.language !== "en") fail("Pick a language.");
    const scopes = [...VOICE_SCAN_SCOPES[p.provider]];
    const existing = state.mailboxScanConsents.find((c) => c.recruiterId === me.id);
    if (existing) Object.assign(existing, { provider: p.provider, scopes, grantedOn: state.clock.today, revokedOn: null });
    else state.mailboxScanConsents.push({ recruiterId: me.id, provider: p.provider, scopes, grantedOn: state.clock.today, revokedOn: null });
    const emailsAnalysed = (p.language === "fr" ? 140 : 60) + (hashString(`${me.id}|${p.language}|${state.clock.today}`) % 120);
    const vp = findOrCreateProfile(state, me.id, p.language, "mailbox_scan");
    vp.source = "mailbox_scan";
    vp.styleGuide = mergeRules(vp.styleGuide, SCANNED_STYLE[p.language]);
    // A new scan replaces the previous scan's examples and keeps the pasted ones.
    vp.examples = [...scannedExamples(p.language, me.name.split(" ")[0]), ...vp.examples.filter((e) => e.origin === "pasted")];
    vp.emailsAnalysed = Math.max(vp.emailsAnalysed, emailsAnalysed);
    vp.updatedOn = state.clock.today;
    audit(state, me.name, `Granted read-only access to sent emails for the Voice Profile (${scopes.join(", ")})`, `${plural(vp.emailsAnalysed, "email")} analysed (${p.language.toUpperCase()})`, null);
    return { voiceProfileId: vp.id, emailsAnalysed: vp.emailsAnalysed };
  },

  pasteVoiceExamples(state, p) {
    requireWorkspace(state);
    const { me, r } = targetRecruiter(state, p.recruiterId, "add examples");
    if (p.language !== "fr" && p.language !== "en") fail("Pick a language.");
    const examples = (p.examples ?? []).map(parseExample).filter((e) => e.body.length >= 20);
    if (examples.length === 0) fail("Paste at least one full email (20 characters or more).");
    const vp = findOrCreateProfile(state, r.id, p.language, "pasted_examples");
    vp.examples = [...vp.examples, ...examples];
    vp.styleGuide = mergeRules(vp.styleGuide, styleFromExamples(vp.examples, p.language));
    vp.emailsAnalysed += examples.length;
    vp.updatedOn = state.clock.today;
    audit(state, me.name, "Added examples to a Voice Profile", `${r.name} (${p.language.toUpperCase()}): ${plural(examples.length, "email")}`, null);
    return { voiceProfileId: vp.id };
  },

  updateVoiceProfile(state, p) {
    const me = requireRecruiter(state);
    const vp = state.voiceProfiles.find((v) => v.id === p.voiceProfileId);
    if (!vp) fail("Voice Profile not found.");
    if (vp.recruiterId !== me.id && me.role !== "owner") fail(`Only ${recruiterName(state, vp.recruiterId)} or an Owner can edit this Voice Profile.`);
    const rules = (p.styleGuide ?? []).map((s) => s.trim()).filter(Boolean);
    if (rules.length === 0) fail("Keep at least one style rule.");
    vp.styleGuide = rules;
    vp.updatedOn = state.clock.today;
    audit(state, me.name, "Edited a Voice Profile", `${recruiterName(state, vp.recruiterId)} (${vp.language.toUpperCase()}): ${plural(rules.length, "style rule")}`, null);
    return {};
  },

  revokeMailboxScan(state, p) {
    const me = requireRecruiter(state);
    const recruiterId = p.recruiterId ?? me.id;
    if (recruiterId !== me.id && me.role !== "owner") fail("Only an Owner can revoke access for another Recruiter.");
    const consent = state.mailboxScanConsents.find((c) => c.recruiterId === recruiterId && c.revokedOn === null);
    if (!consent) fail("There is no read-only access to revoke.");
    consent.revokedOn = state.clock.today;
    audit(state, me.name, "Revoked read-only access to sent emails", recruiterName(state, recruiterId), null);
    return {};
  },
};
