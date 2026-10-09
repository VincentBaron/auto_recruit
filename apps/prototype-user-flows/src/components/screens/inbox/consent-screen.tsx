"use client";

// Public, Candidate-facing Consent Page, in the Workspace's name (no app chrome).
// Three choices: Talent Pool, this opportunity only, delete. FR/EN toggle.
// Links that match no Candidate (unknown, used to delete, truncated) get a neutral Auto Recruit page
// that names no Workspace, address or contact email.

import { useEffect, useState, type ReactNode } from "react";
import { Check, CircleCheck, CloudOff, Globe, Link2Off, Mail, MessageSquare, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { formatDateIn, initials } from "@/lib/format";
import { PROVIDER_LABELS } from "@/lib/labels";
import type { ConsentChoice, Language } from "@/lib/types";
import { act, refetch, useAppState, useBackendError } from "@/lib/api";
import { CONSENT_COPY } from "./consent-copy";
import { Skeleton, cx } from "./ui";

const CHOICES: ConsentChoice[] = ["talent_pool", "this_opportunity", "delete"];

/** "12 Oct 2028" or "1er oct. 2026", kept on one line inside running text. */
function dateText(iso: string | null | undefined, language: Language): string {
  return formatDateIn(iso, language).replace(/ /g, " ");
}

interface Recorded {
  choice: ConsentChoice;
  candidateName: string;
  workspaceName: string;
  retainUntil: string | null;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

/** The tab title and the document language follow the language the Candidate reads in. */
function useDocumentLanguage(language: Language, title: string): void {
  useEffect(() => {
    document.title = title;
    document.documentElement.lang = language;
  }, [language, title]);
  useEffect(
    () => () => {
      document.documentElement.lang = "en";
    },
    [],
  );
}

/** Who the page speaks for: the Workspace, nobody yet (loading), or neutral Auto Recruit. */
type Identity = { kind: "workspace"; name: string } | { kind: "loading" } | { kind: "neutral" };

function ConsentLayout({
  language,
  onLanguage,
  identity,
  legal,
  children,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  identity: Identity;
  legal: string | null;
  children: ReactNode;
}) {
  const t = CONSENT_COPY[language];
  return (
    <div lang={language} className="flex min-h-[calc(100dvh-1.75rem)] flex-col bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="flex min-w-0 items-center gap-2.5">
            {identity.kind === "workspace" ? (
              <>
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white">
                  {initials(identity.name)}
                </span>
                <span className="truncate text-sm font-semibold">{identity.name}</span>
              </>
            ) : identity.kind === "neutral" ? (
              <>
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                  AR
                </span>
                <span className="truncate text-sm font-semibold">Auto Recruit</span>
              </>
            ) : (
              <Skeleton className="h-6 w-36" />
            )}
          </span>
          <div role="group" aria-label="Language" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-100 p-0.5">
            <Globe className="ml-1.5 size-3.5 text-zinc-500" aria-hidden />
            {(["en", "fr"] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={language === l}
                aria-label={CONSENT_COPY[l].languageName}
                onClick={() => onLanguage(l)}
                className={cx(
                  "h-7 rounded-md px-2.5 text-xs font-semibold uppercase transition-colors",
                  language === l ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-900/5" : "text-zinc-500 hover:text-zinc-900",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className={cx("mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-12", identity.kind === "neutral" && "pb-24 lg:pb-12")}>{children}</main>
      {identity.kind === "neutral" ? null : (
        <footer className="border-t border-zinc-200 bg-white">
          <div className="mx-auto max-w-2xl space-y-1.5 px-4 pt-5 pb-20 text-xs leading-relaxed text-zinc-500 sm:px-6 lg:pb-5">
            {legal ? <p>{legal}</p> : null}
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" aria-hidden />
              {t.poweredBy}
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}

function MessageCard({ icon: Icon, title, body, action }: { icon: typeof Link2Off; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center">
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
        <Icon className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-zinc-600">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function InvalidLink({ language, onLanguage }: { language: Language; onLanguage: (language: Language) => void }) {
  const t = CONSENT_COPY[language];
  return (
    <ConsentLayout language={language} onLanguage={onLanguage} identity={{ kind: "neutral" }} legal={null}>
      <MessageCard icon={Link2Off} title={t.invalidTitle} body={t.invalidBody} />
    </ConsentLayout>
  );
}

/** A Consent Page link with no token (copied incompletely): the same neutral invalid-link page. */
export function ConsentInvalidScreen() {
  const [language, setLanguage] = useState<Language>("en");
  useDocumentLanguage(language, CONSENT_COPY[language].invalidTitle);
  return <InvalidLink language={language} onLanguage={setLanguage} />;
}

export function ConsentScreen({ token }: { token: string }) {
  const state = useAppState();
  const backendError = useBackendError();
  const [lang, setLang] = useState<Language | null>(null);
  const [selected, setSelected] = useState<ConsentChoice | null>(null);
  const [editing, setEditing] = useState(false);
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const record = state?.consentTokens.find((t) => t.token === token);
  const candidate = record ? state?.candidates.find((c) => c.id === record.candidateId) : undefined;
  const reply = record?.replyId ? state?.replies.find((r) => r.id === record.replyId) : undefined;
  const campaign = reply ? state?.campaigns.find((c) => c.id === reply.campaignId) : undefined;
  const recruiter = state?.recruiters.find((r) => r.id === (campaign?.ownerId ?? state?.session.recruiterId));
  const role = campaign?.brief.detectedRoleId ? state?.detectedRoles.find((r) => r.id === campaign.brief.detectedRoleId)?.title ?? null : null;
  const workspace = state?.workspace ?? null;

  const language: Language = lang ?? candidate?.language ?? reply?.language ?? "en";
  const t = CONSENT_COPY[language];
  const workspaceName = workspace?.name ?? recorded?.workspaceName ?? "";

  // Only this screen sets the tab title and document language (never a child), so they always match what it shows.
  const invalid = !!state && !(recorded && !editing) && !(record && candidate && workspace);
  useDocumentLanguage(language, invalid ? t.invalidTitle : t.documentTitle);

  function startEditing(choice: ConsentChoice) {
    setSelected(choice);
    setEditing(true);
    setSaveFailed(false);
  }

  async function submit() {
    if (!selected) return;
    // Keep the language the Candidate is reading in, even if their record is deleted.
    setLang(language);
    setBusy(true);
    setSaveFailed(false);
    const res = await act("recordConsent", { token, choice: selected });
    setBusy(false);
    if (!res.ok) {
      // Never show backend wording to a Candidate: if the link stopped matching, the page turns into the invalid-link page.
      setSaveFailed(true);
      return;
    }
    setRecorded({ choice: selected, ...res.result });
    setEditing(false);
  }

  if (!state) {
    if (backendError) {
      return (
        <ConsentLayout language={language} onLanguage={setLang} identity={{ kind: "neutral" }} legal={null}>
          <div role="alert">
            <MessageCard
              icon={CloudOff}
              title={t.unavailableTitle}
              body={t.unavailableBody}
              action={
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  {t.retry}
                </button>
              }
            />
          </div>
        </ConsentLayout>
      );
    }
    return (
      <ConsentLayout language={language} onLanguage={setLang} identity={{ kind: "loading" }} legal={null}>
        <div aria-busy="true" aria-label={t.loading} className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-6 h-28 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </ConsentLayout>
    );
  }

  const legal = workspace && recruiter ? t.legal({ workspace: workspace.name, address: workspace.address, email: recruiter.email }) : null;
  const shell = (children: ReactNode) => (
    <ConsentLayout language={language} onLanguage={setLang} identity={{ kind: "workspace", name: workspaceName }} legal={legal}>
      {children}
    </ConsentLayout>
  );

  const first = (candidate?.name ?? recorded?.candidateName ?? "").split(" ")[0];

  // Just recorded in this session (also covers "delete", after which the record no longer exists).
  if (recorded && !editing) {
    return shell(
      <Done
        choice={recorded.choice}
        retainUntil={recorded.retainUntil}
        recordedOn={state.clock.today}
        first={first}
        language={language}
        workspaceName={workspaceName}
        onChange={recorded.choice === "delete" || !candidate ? null : () => startEditing(recorded.choice)}
      />,
    );
  }

  if (!record || !candidate || !workspace) {
    return <InvalidLink language={language} onLanguage={setLang} />;
  }

  const current = candidate.consent ?? record.choice;
  if (current && !editing) {
    return shell(
      <Done
        choice={current}
        retainUntil={candidate.retainUntil}
        recordedOn={candidate.consentRecordedOn ?? record.usedOn}
        first={first}
        language={language}
        workspaceName={workspace.name}
        onChange={() => startEditing(current)}
      />,
    );
  }

  const email = candidate.contactValues.find((v) => v.kind === "personal_email" && v.verification !== "invalid") ?? candidate.contactValues.find((v) => v.kind === "personal_email");
  const choice = selected;

  return shell(
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{t.title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-700">
        {t.intro({ first, recruiter: recruiter?.name ?? workspace.name, workspace: workspace.name, role })}
      </p>
      <p className="mt-1 text-sm text-zinc-500">{t.changeAnyTime}</p>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.whatWeHold}</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-700">
          <li className="flex gap-2.5">
            <UserRound className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
            {t.heldName}
          </li>
          {email ? (
            <li className="flex gap-2.5">
              <Mail className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
              {t.heldEmail({ email: maskEmail(email.value), provider: PROVIDER_LABELS[email.provenance.provider], date: dateText(email.provenance.foundOn, language) })}
            </li>
          ) : null}
          <li className="flex gap-2.5">
            <MessageSquare className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
            {t.heldMessages}
          </li>
        </ul>
      </section>

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold text-zinc-900">{t.chooseLabel}</legend>
        {editing && current ? <p className="mt-1 text-xs text-zinc-500">{t.current(dateText(candidate.consentRecordedOn ?? record.usedOn, language))}</p> : null}
        <div className="mt-3 space-y-2.5">
          {CHOICES.map((c) => {
            const active = choice === c;
            const destructive = c === "delete";
            return (
              <label
                key={c}
                className={cx(
                  "flex cursor-pointer gap-3.5 rounded-xl border bg-white px-4 py-4 transition-colors",
                  active ? (destructive ? "border-rose-500 ring-1 ring-rose-500" : "border-zinc-900 ring-1 ring-zinc-900") : "border-zinc-200 hover:border-zinc-300",
                )}
              >
                <input
                  type="radio"
                  name="consent-choice"
                  value={c}
                  checked={active}
                  onChange={() => {
                    setSelected(c);
                    setSaveFailed(false);
                  }}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={cx(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2",
                    active ? (destructive ? "border-rose-600 bg-rose-600" : "border-zinc-900 bg-zinc-900") : "border-zinc-300 bg-white",
                  )}
                >
                  {active ? <Check className="size-3 text-white" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0">
                  <span className={cx("block text-[15px] font-semibold", destructive && active ? "text-rose-700" : "text-zinc-900")}>{t.choices[c].title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-zinc-600">{t.choices[c].description(workspace.name)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {saveFailed ? (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-600/20">
          {t.saveFailed}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {editing ? (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setSelected(null);
              setSaveFailed(false);
            }}
            className="h-10 rounded-lg px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          >
            {t.cancel}
          </button>
        ) : null}
        <button
          type="button"
          disabled={!choice || busy}
          aria-busy={busy || undefined}
          onClick={() => void submit()}
          className={cx(
            "h-10 rounded-lg px-5 text-sm font-semibold transition-colors",
            !choice
              ? "cursor-not-allowed bg-zinc-200 text-zinc-500"
              : choice === "delete"
                ? "bg-rose-600 text-white shadow-sm hover:bg-rose-500"
                : "bg-zinc-900 text-white shadow-sm hover:bg-zinc-700",
            busy && "cursor-wait opacity-80",
          )}
        >
          {busy ? t.saving : editing ? t.update : t.confirm}
        </button>
      </div>
    </div>,
  );
}

function Done({
  choice,
  retainUntil,
  recordedOn,
  first,
  language,
  workspaceName,
  onChange,
}: {
  choice: ConsentChoice;
  retainUntil: string | null;
  recordedOn: string | null;
  first: string;
  language: Language;
  workspaceName: string;
  onChange: (() => void) | null;
}) {
  const t = CONSENT_COPY[language];
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center sm:px-10">
      <span className={cx("mx-auto flex size-12 items-center justify-center rounded-full", choice === "delete" ? "bg-zinc-100 text-zinc-600" : "bg-emerald-50 text-emerald-600")}>
        <CircleCheck className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-zinc-900">{t.doneTitle[choice]}</h1>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-zinc-600">
        {t.doneBody[choice]({ first, workspace: workspaceName, until: dateText(retainUntil, language) })}
      </p>
      {recordedOn && choice !== "delete" ? <p className="mt-3 text-xs text-zinc-500">{t.current(dateText(recordedOn, language))}</p> : null}
      {onChange ? (
        <button
          type="button"
          onClick={onChange}
          className="mt-6 h-9 rounded-lg bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
        >
          {t.change}
        </button>
      ) : null}
    </div>
  );
}
