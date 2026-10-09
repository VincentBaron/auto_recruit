"use client";

// Sign-up: simulated Google / Microsoft OAuth consent (identity scopes only, ADR-0014), Workspace name,
// Main Domain declaration, then on to Niche setup.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, CircleUserRound, Coins, FlaskConical, Globe, MailX, ShieldCheck } from "lucide-react";
import { IDENTITY_SCOPES } from "@/lib/labels";
import type { AuthProvider } from "@/lib/types";
import { act, useAppState, useBackendError } from "@/lib/api";
import { PROVIDER_NAMES, ProductMark, ProviderMark } from "./shared";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Callout,
  ChipInput,
  ErrorText,
  Field,
  Skeleton,
  buttonClass,
  cx,
  inputClass,
  textareaClass,
} from "./ui";

type Step = "account" | "consent" | "workspace" | "result";

interface Account {
  name: string;
  email: string;
}

const DEMO_ACCOUNTS: (Account & { note: string; personal: boolean })[] = [
  { name: "Vincent Baron", email: "vincent@baron-recrutement.fr", note: "Work account", personal: false },
  { name: "Vincent Baron", email: "v.baron@recrutonic.fr", note: "Work account, previous agency", personal: false },
  { name: "Vincent Baron", email: "vincent.baron@nuvomail.fr", note: "Personal account", personal: true },
];

/** Consumer mailbox domains: free Test Runs are limited to work accounts (ADR-0018). */
const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "live.com",
  "live.fr",
  "yahoo.com",
  "yahoo.fr",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "orange.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "wanadoo.fr",
  "gmx.fr",
  "gmx.de",
  "web.de",
  "nuvomail.fr",
  "postelle.eu",
  "mailbloc.com",
  "kourriel.fr",
]);

const SCOPE_TEXT: Record<string, string> = {
  openid: "Associate you with your account",
  email: "See your email address",
  profile: "See your name and profile picture",
  "User.Read": "Sign you in and read your basic profile",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function domainOf(email: string): string {
  return email.split("@")[1]?.toLowerCase().trim() ?? "";
}

function isPersonal(email: string): boolean {
  return PERSONAL_DOMAINS.has(domainOf(email));
}

/** "baron-recrutement.fr" -> "Baron Recrutement". */
function workspaceNameFrom(domain: string): string {
  const base = domain.split(".")[0] ?? "";
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function StepRail({ step }: { step: Step }) {
  const items = ["Sign in", "Workspace", "Niche"];
  const current = step === "account" || step === "consent" ? 0 : step === "workspace" ? 1 : 2;
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Sign-up steps">
      {items.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={cx(
              "inline-flex items-center gap-1.5 font-medium",
              i === current ? "text-zinc-900" : i < current ? "text-zinc-500" : "text-zinc-400",
            )}
            aria-current={i === current ? "step" : undefined}
          >
            <span
              className={cx(
                "inline-flex size-4 items-center justify-center rounded-full text-[10px] font-semibold",
                i === current ? "bg-indigo-600 text-white" : i < current ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-500",
              )}
            >
              {i < current ? <Check className="size-2.5" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            {label}
          </span>
          {i < items.length - 1 ? <span className="h-px w-4 bg-zinc-300" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

/** `step` null hides the sign-up steps (already signed in: there is nothing left to walk through). */
function Shell({ step, children }: { step: Step | null; children: ReactNode }) {
  return (
    <div className="min-h-full bg-zinc-50">
      <header className="border-b border-zinc-200/70 bg-white">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Auto Recruit home">
            <ProductMark />
          </Link>
          {step ? (
            <div className="hidden sm:block">
              <StepRail step={step} />
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1120px] flex-col items-center px-4 pb-28 pt-10 sm:px-6 sm:pt-14">{children}</main>
    </div>
  );
}

function ProviderChoice() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Start free</h1>
      <p className="mt-1 text-sm text-zinc-500">Sign in with your work account. We only ask who you are, never for your mailbox.</p>
      <div className="mt-5 flex flex-col gap-2">
        {(["google", "microsoft"] as const).map((p) => (
          <Link key={p} href={`/signup?provider=${p}`} className={buttonClass("secondary", "lg", "w-full")}>
            <ProviderMark provider={p} className="size-3.5" />
            Continue with {PROVIDER_NAMES[p]}
          </Link>
        ))}
      </div>
    </div>
  );
}

function SimulatedProviderCard({ provider, children }: { provider: AuthProvider; children: ReactNode }) {
  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        Simulated {PROVIDER_NAMES[provider]} sign-in
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3 text-sm text-zinc-600">
          <ProviderMark provider={provider} />
          Sign in with {PROVIDER_NAMES[provider]}
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function AccountStep({ provider, onPick }: { provider: AuthProvider; onPick: (a: Account) => void }) {
  const [other, setOther] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submitOther = (e: FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (name.trim().length < 2) return setError("Enter your full name.");
    if (!EMAIL_RE.test(em)) return setError("Enter a valid email address.");
    if (isPersonal(em)) return setError("This is a personal account. The free Test Run needs a work account on your company's domain.");
    setError(null);
    onPick({ name: name.trim(), email: em });
  };

  return (
    <SimulatedProviderCard provider={provider}>
      <h1 className="text-xl font-normal text-zinc-900">Choose an account</h1>
      <p className="mt-1 text-sm text-zinc-500">to continue to Auto Recruit</p>
      {!other ? (
        <ul className="mt-5 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                disabled={a.personal}
                onClick={() => onPick({ name: a.name, email: a.email })}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Avatar name={a.name} size="md" />
                <span className="min-w-0 flex-1">
                  <span className={cx("block truncate text-sm font-medium", a.personal ? "text-zinc-400" : "text-zinc-900")}>{a.name}</span>
                  <span className={cx("block truncate text-xs", a.personal ? "text-zinc-400" : "text-zinc-500")}>{a.email}</span>
                  {a.personal ? (
                    <span className="mt-1 block text-[11px] text-amber-700">Personal account: the free trial needs a work account</span>
                  ) : (
                    <span className="mt-0.5 block text-[11px] text-zinc-400">{a.note}</span>
                  )}
                </span>
                {!a.personal ? <ArrowRight className="size-4 shrink-0 text-zinc-300" aria-hidden /> : null}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setOther(true)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <CircleUserRound className="size-8 text-zinc-300" strokeWidth={1.25} aria-hidden />
              Use another account
            </button>
          </li>
        </ul>
      ) : (
        <form onSubmit={submitOther} className="mt-5 space-y-3">
          <Field label="Full name" htmlFor="su-name">
            <input id="su-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Camille Durand" />
          </Field>
          <Field label="Work email" htmlFor="su-email">
            <input
              id="su-email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder="camille@your-agency.fr"
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" onClick={() => setOther(false)}>
              <ArrowLeft aria-hidden />
              Back
            </Button>
            <Button type="submit" variant="primary">
              Next
            </Button>
          </div>
        </form>
      )}
    </SimulatedProviderCard>
  );
}

function ConsentStep({ provider, account, onBack, onAllow }: { provider: AuthProvider; account: Account; onBack: () => void; onAllow: () => void }) {
  const scopes = IDENTITY_SCOPES[provider];
  return (
    <SimulatedProviderCard provider={provider}>
      <h1 className="text-xl font-normal text-zinc-900">Auto Recruit wants to sign you in</h1>
      <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-200 py-1 pl-1 pr-3">
        <Avatar name={account.name} size="xs" />
        <span className="truncate text-xs text-zinc-700">{account.email}</span>
      </div>
      <p className="mt-5 text-sm text-zinc-700">This will allow Auto Recruit to:</p>
      <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
        {scopes.map((s) => (
          <li key={s} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <span className="text-sm text-zinc-800">{SCOPE_TEXT[s] ?? s}</span>
            <code className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500">{s}</code>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-emerald-50 px-3.5 py-3 text-[13px] leading-relaxed text-emerald-900">
        <MailX className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
        <span>
          <span className="font-medium">No mailbox access is requested.</span> Connecting a Sending Mailbox or learning your Voice Profile from sent emails each asks for its own consent later, and can be revoked separately.
        </span>
      </div>
      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onAllow}>
          Continue
        </Button>
      </div>
    </SimulatedProviderCard>
  );
}

/** The signed-in account heading the Workspace card: identity only, never the mailbox. */
function AccountRow({ provider, account }: { provider: AuthProvider; account: Account }) {
  return (
    <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-3.5">
      <Avatar name={account.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-zinc-900">{account.name}</div>
        <div className="truncate text-xs text-zinc-500">{account.email}</div>
      </div>
      <Badge tone="emerald">
        <ProviderMark provider={provider} className="size-3" />
        Identity only
      </Badge>
    </div>
  );
}

function WorkspaceStep({
  provider,
  account,
  onBack,
  onDone,
}: {
  provider: AuthProvider;
  account: Account;
  onBack: () => void;
  onDone: (freeTestRunAvailable: boolean) => void;
}) {
  const emailDomain = domainOf(account.email);
  const [workspaceName, setWorkspaceName] = useState(workspaceNameFrom(emailDomain));
  /** Main Domains added by the Recruiter. The sign-in email's domain is always one, locked first. */
  const [extraDomains, setExtraDomains] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const extra = Array.from(new Set(extraDomains.map((d) => d.toLowerCase()))).filter((d) => d !== emailDomain);
  const invalid = extra.filter((d) => !DOMAIN_RE.test(d));
  const personal = extra.filter((d) => PERSONAL_DOMAINS.has(d));
  // One line in email footers: the lines of the address joined with commas.
  const postalAddress = address
    .split("\n")
    .map((l) => l.trim().replace(/,$/, ""))
    .filter(Boolean)
    .join(", ");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (workspaceName.trim().length < 2) return setError("Give your Workspace a name.");
    if (invalid.length > 0) return setError(`"${invalid[0]}" is not a valid domain.`);
    if (personal.length > 0) return setError(`"${personal[0]}" is a personal email provider, not your company's domain.`);
    if (postalAddress.length < 8) return setError("Enter the postal address of your business: it appears in every email and in the Article 14 Notice.");
    setError(null);
    setBusy(true);
    // Every Main Domain comes with sign-up, so the free Test Run check covers all of them at once.
    const res = await act("signUp", {
      provider,
      fullName: account.name,
      email: account.email,
      workspaceName: workspaceName.trim(),
      mainDomains: [emailDomain, ...extra],
      mainDomain: extra[0] ?? emailDomain,
      address: postalAddress,
    });
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    onDone(res.result.freeTestRunAvailable);
  };

  return (
    <form onSubmit={submit} className="w-full max-w-[520px]">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Create your Workspace</h1>
      <p className="mt-1 text-sm text-zinc-500">Your recruiting business in Auto Recruit: its Recruiters, Niches, Credits and outreach.</p>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white shadow-xs">
        <AccountRow provider={provider} account={account} />
        <div className="space-y-5 px-5 py-5">
          <Field label="Workspace name" htmlFor="ws-name" hint="Shown to Candidates on the Consent Page and in every email footer.">
            <input id="ws-name" className={inputClass} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Baron Recrutement" />
          </Field>
          <Field
            label="Main Domains"
            hint="The domains of your website and everyday email. Campaign emails are never sent from a Main Domain: a Sending Mailbox on one is refused, so your everyday email keeps its reputation."
          >
            <ChipInput
              values={extraDomains}
              onChange={setExtraDomains}
              locked={emailDomain ? [{ value: emailDomain, reason: "Your sign-in email's domain is always a Main Domain" }] : []}
              ariaLabel="Add a Main Domain"
              placeholder="your-agency.fr"
            />
          </Field>
          <Field label="Postal address" htmlFor="ws-address" hint="Shown as the sender identity in every email and as the controller's address in the Article 14 Notice.">
            <textarea
              id="ws-address"
              rows={2}
              aria-required="true"
              className={cx(textareaClass, "resize-none")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={"18 rue de Paradis\n75010 Paris, France"}
              autoComplete="street-address"
            />
          </Field>
          <div className="flex items-start gap-2.5 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3.5 py-3 text-[13px] leading-relaxed text-indigo-950">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-indigo-500" aria-hidden />
            <span>
              One free Test Run per Main Domain, if it was not used before: 0&nbsp;Credits, no card. Checked for{" "}
              <span className="font-medium [overflow-wrap:anywhere]">{emailDomain}</span> and every domain you add.
            </span>
          </div>
          <ErrorText>{error}</ErrorText>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">
          <Button variant="ghost" onClick={onBack} disabled={busy}>
            <ArrowLeft aria-hidden />
            Back
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Create Workspace
            {!busy ? <ArrowRight aria-hidden /> : null}
          </Button>
        </div>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-zinc-500">
        <Globe className="mt-px size-3.5 shrink-0 text-zinc-400" aria-hidden />
        You can add Main Domains and invite Recruiters later in Settings.
      </p>
    </form>
  );
}

/**
 * The Workspace step's outcome when a Main Domain already used its free Test Run (with a free one left,
 * sign-up goes straight on to Niche setup). Same frame as the Workspace step.
 */
function WorkspaceReady({
  provider,
  account,
  workspaceName,
  usedBy,
}: {
  provider: AuthProvider;
  account: Account;
  workspaceName: string;
  usedBy: string;
}) {
  return (
    <div className="w-full max-w-[520px]">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Your Workspace is ready</h1>
      <p className="mt-1 text-sm text-zinc-500 [overflow-wrap:anywhere]">
        <span className="font-medium text-zinc-700">{workspaceName}</span> is created, with you as its Owner.
      </p>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white shadow-xs">
        <AccountRow provider={provider} account={account} />
        <div className="px-5 py-5">
          <Callout tone="warning" className="text-pretty" title={<span className="[overflow-wrap:anywhere]">{usedBy} already used its free Test Run</span>}>
            Free Test Runs are limited to one per Main Domain, so your next Test Run needs Credits. Set up your Niche now, and buy Credits when you are
            ready to run a Test Run.
          </Callout>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">
          <ButtonLink href="/credits">
            <Coins aria-hidden />
            See Credit packs
          </ButtonLink>
          <ButtonLink href="/onboarding/niche" variant="primary">
            Set up a Niche
            <ArrowRight aria-hidden />
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

function AlreadySignedIn() {
  const state = useAppState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state) return null;
  const me = state.derived.currentRecruiter;
  return (
    <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar name={me?.name ?? "?"} size="md" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900">You are signed in as {me?.name ?? "a Recruiter"}</div>
          <div className="text-xs text-zinc-500 [overflow-wrap:anywhere]">
            {me?.email} · Workspace {state.workspace?.name}
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink href="/feed" variant="primary">
          Open the Feed
        </ButtonLink>
        <ButtonLink href="/onboarding/niche">Set up a Niche</ButtonLink>
      </div>
      <div className="mt-6 border-t border-zinc-100 pt-4">
        <p className="text-xs text-zinc-500">Prototype: walk through sign-up again from an empty state.</p>
        <Button
          className="mt-2"
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const res = await act("loadScenario", { scenario: "new_user" });
            setBusy(false);
            if (!res.ok) setError(res.error);
          }}
        >
          Start over (New user scenario)
        </Button>
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      </div>
    </div>
  );
}

/** Loading state, also used as the Suspense fallback of /signup (same markup on server and client). */
export function SignupSkeleton() {
  return (
    <Shell step="account">
      <div className="w-full max-w-[420px] space-y-3">
        <Skeleton className="mx-auto h-3 w-40" />
        <Skeleton className="h-80" />
      </div>
    </Shell>
  );
}

export function SignupFlow() {
  const state = useAppState();
  const backendError = useBackendError();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("provider");
  const provider: AuthProvider | null = raw === "google" || raw === "microsoft" ? raw : null;
  const [step, setStep] = useState<Step>("account");
  const [account, setAccount] = useState<Account | null>(null);
  const [finishing, setFinishing] = useState(false);

  if (state === null) {
    if (!backendError) return <SignupSkeleton />;
    return (
      <Shell step={null}>
        <div className="w-full max-w-[640px]">
          <BackendErrorState error={backendError} />
        </div>
      </Shell>
    );
  }

  if (state.session.signedIn && state.workspace && step === "account" && !finishing) {
    // Already signed in: the card only offers the Feed and Niche setup, so no sign-up steps are shown.
    return (
      <Shell step={null}>
        <AlreadySignedIn />
      </Shell>
    );
  }

  if (!provider) {
    return (
      <Shell step="account">
        <ProviderChoice />
      </Shell>
    );
  }

  return (
    <Shell step={step}>
      {step === "account" || !account ? (
        <AccountStep
          provider={provider}
          onPick={(a) => {
            setAccount(a);
            setStep("consent");
          }}
        />
      ) : step === "consent" ? (
        <ConsentStep provider={provider} account={account} onBack={() => setStep("account")} onAllow={() => setStep("workspace")} />
      ) : step === "workspace" ? (
        <WorkspaceStep
          provider={provider}
          account={account}
          onBack={() => setStep("consent")}
          onDone={(available) => {
            setFinishing(true);
            if (available) router.push("/onboarding/niche");
            else setStep("result");
          }}
        />
      ) : (
        <WorkspaceReady
          provider={provider}
          account={account}
          workspaceName={state.workspace?.name ?? workspaceNameFrom(domainOf(account.email))}
          usedBy={state.workspace?.freeTestRunUsedBy ?? domainOf(account.email)}
        />
      )}
      <p className="mt-6 flex max-w-[420px] items-start gap-1.5 text-center text-xs text-zinc-400">
        <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
        Signing in never grants access to your mailbox.
      </p>
    </Shell>
  );
}
