"use client";

import { useState } from "react";
import { ArrowRight, Ban, CircleCheck, Plus, Trash, WandSparkles } from "lucide-react";
import { addDays } from "@/lib/dates";
import { isOnMainDomain } from "@/lib/domains";
import { formatDate, formatEuros } from "@/lib/format";
import { MAILBOX_SCOPES, SENDING_LIMITS } from "@/lib/labels";
import type { ActionResult, AuthProvider, ClientState } from "@/lib/types";
import { act } from "@/lib/api";
import { SetupProgress, TERMS_RISK_TEXT } from "./mailbox-parts";
import { domainOf, isEmail, localPart, rampCap } from "./shared";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  ConsentScreen,
  EmailAddress,
  Field,
  Input,
  Modal,
  OptionCard,
  PROVIDER_PRODUCT,
  ProviderMark,
  Select,
  Skeleton,
  Steps,
} from "./ui";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function ProviderChoice({ value, onChange, describe }: { value: AuthProvider; onChange: (p: AuthProvider) => void; describe: (p: AuthProvider) => string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(["google", "microsoft"] as const).map((p) => (
        <OptionCard
          key={p}
          selected={value === p}
          onSelect={() => onChange(p)}
          title={
            <span className="flex items-center gap-2">
              <ProviderMark provider={p} />
              {PROVIDER_PRODUCT[p]}
            </span>
          }
          description={describe(p)}
        />
      ))}
    </div>
  );
}

function TermsAcknowledgement({ checked, onChange, workspaceName, provider }: { checked: boolean; onChange: (v: boolean) => void; workspaceName: string; provider: AuthProvider }) {
  return (
    <div className="space-y-4">
      <Callout tone="warning" title="Risk of tenant suspension">
        {TERMS_RISK_TEXT}
      </Callout>
      <ul className="grid gap-2 text-sm text-zinc-700 sm:grid-cols-3">
        <li className="rounded-md border border-zinc-200 px-3 py-2">
          <span className="block text-lg font-semibold text-zinc-900">{SENDING_LIMITS.perMailboxPerDay}</span>
          <span className="text-xs text-zinc-500">emails per mailbox per day</span>
        </li>
        <li className="rounded-md border border-zinc-200 px-3 py-2">
          <span className="block text-lg font-semibold text-zinc-900">{SENDING_LIMITS.perDomainPerDay}</span>
          <span className="text-xs text-zinc-500">emails per domain per day</span>
        </li>
        <li className="rounded-md border border-zinc-200 px-3 py-2">
          <span className="block text-lg font-semibold text-zinc-900">{SENDING_LIMITS.bounceRatePausePercent}%</span>
          <span className="text-xs text-zinc-500">bounce rate that pauses a mailbox</span>
        </li>
      </ul>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-3">
        <Checkbox checked={checked} onChange={onChange} description="Required to continue. Shown once per mailbox setup and recorded in the audit log.">
          I understand the risk, and that {workspaceName} is responsible for following {PROVIDER_PRODUCT[provider]}&apos;s rules.
        </Checkbox>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Connect a mailbox                                                   */
/* ------------------------------------------------------------------ */

const MAILBOX_SCOPE_DESCRIPTIONS = ["Send Campaign emails and your responses from this mailbox", "Read incoming messages, only to detect replies and bounces"];

export function ConnectMailboxDialog(props: { open: boolean; s: ClientState; onClose: () => void; onAssisted: () => void }) {
  if (!props.open) return null;
  return <ConnectMailboxInner {...props} />;
}

function ConnectMailboxInner({ s, onClose, onAssisted }: { s: ClientState; onClose: () => void; onAssisted: () => void }) {
  const ws = s.workspace!;
  const me = s.derived.currentRecruiter;
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<AuthProvider>(s.session.provider ?? "google");
  const [address, setAddress] = useState("");
  const [recruiterId, setRecruiterId] = useState(me?.id ?? s.recruiters[0]?.id ?? "");
  const [alreadyWarmed, setAlreadyWarmed] = useState(false);
  const [termsAck, setTermsAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult<"connectMailbox"> | null>(null);

  const trimmed = address.trim().toLowerCase();
  const domain = domainOf(trimmed);
  // Same rule as the backend (ADR-0017): a Main Domain or any subdomain of it, such as mail.<main>.
  // Refused here, before the terms and the OAuth consent: a refused mailbox never gets send access.
  const onMainDomain = isEmail(trimmed) && isOnMainDomain(domain, ws.mainDomains);
  const mainDomain = onMainDomain ? (ws.mainDomains.find((d) => isOnMainDomain(domain, [d])) ?? domain) : null;
  const existing = s.mailboxes.find((m) => m.address.toLowerCase() === trimmed) ?? null;
  const addressError =
    existing?.status === "refused"
      ? onMainDomain
        ? "Already refused: it is on a Main Domain."
        : "Refused earlier, when its domain was a Main Domain. Remove it from Refused first, then connect it again."
      : existing
        ? "This mailbox is already connected."
        : address && !isEmail(trimmed)
          ? "Enter a full email address."
          : null;
  const canContinue = isEmail(trimmed) && existing === null && !onMainDomain && recruiterId !== "";

  const connect = async () => {
    setBusy(true);
    setError(null);
    const res = await act("connectMailbox", { provider, address: trimmed, recruiterId, alreadyWarmed, termsRiskAcknowledged: true });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.result);
    setStep(3);
  };

  const footer =
    step === 0 ? (
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={ArrowRight} disabled={!canContinue} onClick={() => setStep(1)}>
          Continue
        </Button>
      </>
    ) : step === 1 ? (
      <>
        <Button onClick={() => setStep(0)}>Back</Button>
        <Button variant="primary" icon={ArrowRight} disabled={!termsAck} onClick={() => setStep(2)}>
          Continue to {PROVIDER_PRODUCT[provider]}
        </Button>
      </>
    ) : step === 2 ? (
      <>
        <Button onClick={() => setStep(1)} disabled={busy}>
          Back
        </Button>
        <Button variant="primary" loading={busy} onClick={() => void connect()}>
          Allow
        </Button>
      </>
    ) : (
      <>
        {result?.status === "refused" ? (
          <Button
            icon={WandSparkles}
            onClick={() => {
              onClose();
              onAssisted();
            }}
          >
            Set up a lookalike domain
          </Button>
        ) : null}
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </>
    );

  return (
    <Modal open onClose={onClose} title="Connect a Sending Mailbox" description="A Google Workspace or Microsoft 365 mailbox that Campaign emails are sent from." footer={footer}>
      <Steps steps={["Mailbox", "Terms", "Consent"]} current={step} />

      {step === 0 ? (
        <div className="space-y-4">
          <ProviderChoice value={provider} onChange={setProvider} describe={(p) => `A mailbox in your own ${PROVIDER_PRODUCT[p]} tenant.`} />
          <Field label="Mailbox address" error={addressError} hint="Use a lookalike domain, never the domain of your website and everyday email.">
            {(id) => <Input id={id} type="email" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={`${localPart((me?.name ?? "name").split(" ")[0])}@${s.sendingDomains[0]?.domain ?? "your-lookalike-domain.com"}`} autoComplete="off" />}
          </Field>
          {onMainDomain ? (
            <Callout
              tone="danger"
              icon={Ban}
              title={mainDomain === domain ? `Refused: ${domain} is a Main Domain of ${ws.name}` : `Refused: ${domain} is on ${mainDomain}, a Main Domain of ${ws.name}`}
              actions={
                <Button
                  variant="primary"
                  icon={WandSparkles}
                  onClick={() => {
                    onClose();
                    onAssisted();
                  }}
                >
                  Set up a lookalike domain
                </Button>
              }
            >
              Campaign emails are never sent from a Main Domain{mainDomain === domain ? "" : " or its subdomains"}, so a cold-email complaint can never hurt your everyday email.
              Assisted setup registers a lookalike domain in your name instead.
            </Callout>
          ) : null}
          <Field label="Belongs to" hint="Campaign emails from this mailbox are sent in this Recruiter's name, with their Voice Profile.">
            {(id) => (
              <Select id={id} value={recruiterId} onChange={(e) => setRecruiterId(e.target.value)}>
                {s.recruiters
                  .filter((r) => r.status === "active")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.id === me?.id ? " (you)" : ""}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Checkbox
            checked={alreadyWarmed}
            onChange={setAlreadyWarmed}
            description={`It has sent cold email at volume for several weeks. It starts at ${SENDING_LIMITS.perMailboxPerDay} a day instead of ramping up from ${SENDING_LIMITS.rampStartPerDay}.`}
          >
            This mailbox is already warmed
          </Checkbox>
        </div>
      ) : null}

      {step === 1 ? <TermsAcknowledgement checked={termsAck} onChange={setTermsAck} workspaceName={ws.name} provider={provider} /> : null}

      {step === 2 ? (
        <div className="space-y-3">
          <ConsentScreen
            provider={provider}
            heading={
              <>
                Auto Recruit wants to access <EmailAddress address={trimmed} />
              </>
            }
            scopes={MAILBOX_SCOPES[provider].map((scope, i) => ({ scope, description: MAILBOX_SCOPE_DESCRIPTIONS[i] ?? scope }))}
            note={
              <>
                This is a separate consent from signing in, which only shared your name and email address. Revoke it at any time from your {PROVIDER_PRODUCT[provider]} settings or by removing
                the mailbox here.
              </>
            }
          />
          {error ? <Callout tone="danger">{error}</Callout> : null}
        </div>
      ) : null}

      {step === 3 && result ? (
        result.status === "refused" ? (
          <Callout tone="danger" icon={Ban} title={`Refused: ${domain} is a Main Domain`}>
            {result.reason ??
              `${domain} is a Main Domain of ${ws.name}. Campaign emails are never sent from a Main Domain, so a cold-email complaint can never hurt your everyday email. Use a lookalike domain instead.`}
          </Callout>
        ) : (
          <div className="space-y-3">
            <Callout tone="success" icon={CircleCheck} title={`${trimmed} is connected`}>
              {result.status === "active"
                ? `Already warmed: it sends up to ${SENDING_LIMITS.perMailboxPerDay} Campaign emails a day from today.`
                : `Ramping up: ${rampCap(1)} Campaign emails a day today, rising to ${SENDING_LIMITS.perMailboxPerDay} a day from day ${SENDING_LIMITS.rampDays} (${formatDate(addDays(s.clock.today, SENDING_LIMITS.rampDays - 1))}).`}
            </Callout>
            {result.reason ? <p className="text-sm text-zinc-600">{result.reason}</p> : null}
            <p className="text-sm text-zinc-600">Add it to a Campaign from the Campaign&apos;s Sending Mailboxes step. Its health and ramp show on this page.</p>
          </div>
        )
      ) : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Assisted setup                                                      */
/* ------------------------------------------------------------------ */

type DomainSuggestion = ActionResult<"suggestLookalikeDomains">["domains"][number];

const ADMIN_SCOPES: Record<AuthProvider, { scope: string; description: (domain: string, n: number) => string }[]> = {
  google: [
    { scope: "admin.directory.domain", description: (d) => `Add and verify ${d} in your Google Workspace tenant` },
    { scope: "admin.directory.user", description: (_d, n) => `Create ${n === 1 ? "the Sending Mailbox" : `the ${n} Sending Mailboxes`} in your tenant` },
    { scope: "siteverification", description: (d) => `Prove ownership of ${d} with a DNS record` },
  ],
  microsoft: [
    { scope: "Domain.ReadWrite.All", description: (d) => `Add and verify ${d} in your Microsoft 365 tenant` },
    { scope: "User.ReadWrite.All", description: (_d, n) => `Create ${n === 1 ? "the Sending Mailbox" : `the ${n} Sending Mailboxes`} in your tenant` },
    { scope: "Directory.ReadWrite.All", description: () => "Assign mailbox licences you already pay for" },
  ],
};

export function AssistedSetupDialog(props: { open: boolean; s: ClientState; onClose: () => void }) {
  if (!props.open) return null;
  return <AssistedSetupInner {...props} />;
}

function defaultLocalParts(name: string): string[] {
  const parts = name.trim().split(/\s+/);
  const first = localPart(parts[0] ?? "");
  const full = localPart(name.replace(/\s+/g, "."));
  return [first, full].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 2);
}

function AssistedSetupInner({ s, onClose }: { s: ClientState; onClose: () => void }) {
  const ws = s.workspace!;
  const me = s.derived.currentRecruiter;
  const active = s.recruiters.filter((r) => r.status === "active");
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<AuthProvider>(s.session.provider ?? "google");
  const [domains, setDomains] = useState<DomainSuggestion[] | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [recruiterId, setRecruiterId] = useState(me?.id ?? active[0]?.id ?? "");
  const [locals, setLocals] = useState<string[]>(() => defaultLocalParts(me?.name ?? active[0]?.name ?? "contact"));
  const [termsAck, setTermsAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupId, setSetupId] = useState<string | null>(null);

  const setup = setupId ? s.assistedSetups.find((a) => a.id === setupId) ?? null : null;
  const chosen = domains?.find((d) => d.domain === domain) ?? null;
  const localsClean = locals.map((l) => l.trim().toLowerCase());
  const localsValid = localsClean.length > 0 && localsClean.every((l) => /^[a-z0-9]+([.-][a-z0-9]+)*$/.test(l)) && new Set(localsClean).size === localsClean.length;

  const loadDomains = async () => {
    setStep(1);
    if (domains) return;
    const res = await act("suggestLookalikeDomains", { mainDomain: ws.mainDomains[0] });
    if (!res.ok) {
      setError(res.error);
      setDomains([]);
      return;
    }
    setDomains(res.result.domains);
    setDomain(res.result.domains.find((d) => d.available)?.domain ?? null);
  };

  const start = async () => {
    if (!domain) return;
    setBusy(true);
    setError(null);
    const res = await act("startAssistedSetup", { provider, domain, mailboxLocalParts: localsClean, recruiterId, termsRiskAcknowledged: true });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSetupId(res.result.setupId);
    setStep(4);
  };

  const footer =
    step === 0 ? (
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={ArrowRight} onClick={() => void loadDomains()}>
          Continue
        </Button>
      </>
    ) : step === 1 ? (
      <>
        <Button onClick={() => setStep(0)}>Back</Button>
        <Button variant="primary" icon={ArrowRight} disabled={!chosen?.available} onClick={() => setStep(2)}>
          Continue
        </Button>
      </>
    ) : step === 2 ? (
      <>
        <Button onClick={() => setStep(1)}>Back</Button>
        <Button variant="primary" icon={ArrowRight} disabled={!localsValid} onClick={() => setStep(3)}>
          Continue
        </Button>
      </>
    ) : step === 3 ? (
      <>
        <Button onClick={() => setStep(2)} disabled={busy}>
          Back
        </Button>
        <Button variant="primary" disabled={!termsAck} loading={busy} onClick={() => void start()}>
          Grant admin consent and start
        </Button>
      </>
    ) : (
      <Button variant="primary" onClick={onClose}>
        {setup?.status === "done" ? "Done" : "Close and continue in the background"}
      </Button>
    );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Assisted setup"
      description="We register a lookalike domain in your name, configure its DNS and create Sending Mailboxes in your own tenant, through your admin consent."
      footer={footer}
    >
      <Steps steps={["Provider", "Domain", "Mailboxes", "Admin consent", "Setup"]} current={step} />

      {step === 0 ? (
        <div className="space-y-4">
          <ProviderChoice value={provider} onChange={setProvider} describe={(p) => `Mailboxes are created in your own ${PROVIDER_PRODUCT[p]} tenant.`} />
          <Callout tone="indigo" title="Everything stays yours">
            {ws.name} owns and pays for its {PROVIDER_PRODUCT[provider]} tenant. The domain is registered in {ws.name}&apos;s name and the mailboxes are ordinary mailboxes in your tenant. Auto
            Recruit never resells mailboxes or domains.
          </Callout>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-zinc-600">
            Campaign emails never leave from {ws.mainDomains.join(", ") || "your Main Domain"}. A lookalike domain keeps your brand recognisable while protecting your everyday email.
          </p>
          {domains === null ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : domains.length === 0 ? (
            <Callout tone="danger">{error ?? "No lookalike domain could be suggested."}</Callout>
          ) : (
            <div className="space-y-2">
              {domains.map((d) => (
                <OptionCard
                  key={d.domain}
                  selected={domain === d.domain}
                  onSelect={() => setDomain(d.domain)}
                  disabled={!d.available}
                  title={<span className="[overflow-wrap:anywhere] font-mono text-[13px]">{d.domain}</span>}
                  description={d.available ? `Registered in ${ws.name}'s name` : "Already taken"}
                  aside={
                    d.available ? (
                      <span className="block">
                        <span className="block text-sm font-medium tabular-nums text-zinc-900">{formatEuros(d.priceEurPerYear)}</span>
                        <span>per year</span>
                      </span>
                    ) : (
                      <Badge>Taken</Badge>
                    )
                  }
                />
              ))}
            </div>
          )}
          <p className="text-xs leading-5 text-zinc-500">The registrar bills {ws.name} directly. Auto Recruit takes no margin and never holds the domain.</p>
        </div>
      ) : null}

      {step === 2 && domain ? (
        <div className="space-y-4">
          <Field label="Sending Mailboxes for" hint="Campaign emails from these mailboxes are sent in this Recruiter's name.">
            {(id) => (
              <Select
                id={id}
                value={recruiterId}
                onChange={(e) => {
                  setRecruiterId(e.target.value);
                  setLocals(defaultLocalParts(s.recruiters.find((r) => r.id === e.target.value)?.name ?? "contact"));
                }}
              >
                {active.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.id === me?.id ? " (you)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div>
            <p className="text-xs font-medium text-zinc-700">Mailboxes</p>
            <ul className="mt-1.5 space-y-2">
              {locals.map((l, i) => (
                <li key={i} className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-zinc-300 bg-white shadow-xs focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
                    <input
                      value={l}
                      onChange={(e) => setLocals(locals.map((x, j) => (j === i ? e.target.value : x)))}
                      aria-label={`Mailbox ${i + 1} name`}
                      className="h-8 min-w-0 flex-1 bg-transparent px-2.5 text-sm text-zinc-900 focus:outline-none"
                    />
                    <span className="max-w-[55%] shrink-0 truncate border-l border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-xs text-zinc-500">@{domain}</span>
                  </div>
                  {locals.length > 1 ? (
                    <Button size="sm" variant="ghost" icon={Trash} aria-label={`Remove mailbox ${i + 1}`} onClick={() => setLocals(locals.filter((_, j) => j !== i))} />
                  ) : null}
                </li>
              ))}
            </ul>
            {!localsValid ? <p className="mt-1.5 text-xs text-red-600">Use lowercase letters, digits, dots or dashes, and different names.</p> : null}
            {locals.length < 2 ? (
              <Button className="mt-2" size="sm" variant="ghost" icon={Plus} onClick={() => setLocals([...locals, ""])}>
                Add a mailbox
              </Button>
            ) : null}
          </div>
          <Callout tone="info">
            Each mailbox ramps from {SENDING_LIMITS.rampStartPerDay} to {SENDING_LIMITS.perMailboxPerDay} Campaign emails a day over about {SENDING_LIMITS.rampDays} days. A domain sends at most{" "}
            {SENDING_LIMITS.perDomainPerDay} a day, so two mailboxes per domain is the useful maximum.
          </Callout>
        </div>
      ) : null}

      {step === 3 && domain ? (
        <div className="space-y-4">
          <ConsentScreen
            provider={provider}
            heading={`Grant admin consent to Auto Recruit for the ${ws.name} ${PROVIDER_PRODUCT[provider]} tenant`}
            scopes={ADMIN_SCOPES[provider].map((a) => ({ scope: a.scope, description: a.description(domain, localsClean.length) }))}
            note={
              <>
                Then Auto Recruit registers {domain} in {ws.name}&apos;s name{chosen ? ` (${formatEuros(chosen.priceEurPerYear)} a year)` : ""}, publishes SPF, DKIM and DMARC, and creates{" "}
                {localsClean.map((l) => `${l}@${domain}`).join(" and ")}. You can revoke the admin consent once setup is done.
              </>
            }
          />
          <TermsAcknowledgement checked={termsAck} onChange={setTermsAck} workspaceName={ws.name} provider={provider} />
          {error ? <Callout tone="danger">{error}</Callout> : null}
        </div>
      ) : null}

      {step === 4 ? (
        setup ? (
          <div className="space-y-4">
            <SetupProgress steps={setup.steps} progress={setup.progress} />
            {setup.status === "done" ? (
              <Callout tone="success" title={`${setup.domain} is ready`}>
                {setup.mailboxAddresses.join(" and ")} {setup.mailboxAddresses.length === 1 ? "is" : "are"} ramping up from {SENDING_LIMITS.rampStartPerDay} emails a day. They are now on this page
                and can be picked in any Campaign.
              </Callout>
            ) : (
              <p className="text-sm text-zinc-500">This takes a few seconds in the prototype. You can close this window: progress also shows on the Sending Mailboxes page.</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )
      ) : null}
    </Modal>
  );
}
