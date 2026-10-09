"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardPaste, Eye, Languages, MessageSquareQuote, PenLine, ScanText, ShieldCheck, Sparkles, Unplug } from "lucide-react";
import { formatDate, formatNumber, formatRelative, plural } from "@/lib/format";
import { VOICE_SCAN_SCOPES } from "@/lib/labels";
import type { AuthProvider, ClientState, Language, VoiceProfile } from "@/lib/types";
import { useAppState, useBackendError } from "@/lib/api";
import { recruiterName, useRunner } from "./shared";
import {
  Badge,
  Button,
  Callout,
  Card,
  ConsentScreen,
  EmptyState,
  Field,
  Flash,
  Modal,
  NoWorkspace,
  OptionCard,
  PROVIDER_PRODUCT,
  ProviderMark,
  Select,
  SettingsPage,
  SettingsSkeleton,
  StatGrid,
  Tabs,
  Textarea,
  cx,
  useFlash,
} from "./ui";

const TITLE = "Voice Profile";
const DESCRIPTION =
  "How the Outreach Agent writes in your name. One Voice Profile per language, learnt from the emails you sent and from your edits to its drafts.";

const LANGUAGE_LABELS: Record<Language, string> = { fr: "French", en: "English" };
const LANGUAGE_USE: Record<Language, string> = {
  fr: "Used for every draft to a French recipient.",
  en: "Used for every draft to a recipient who is not French.",
};

type Runner = ReturnType<typeof useRunner>["run"];

export function VoiceScreen() {
  const s = useAppState();
  const loadError = useBackendError();
  const [flash, setFlash] = useFlash();
  const { pending, run } = useRunner(setFlash);
  const [language, setLanguage] = useState<Language>("fr");
  const [viewing, setViewing] = useState<string | null>(null);
  const [consentFor, setConsentFor] = useState<Language | null>(null);

  if (!s) return <SettingsSkeleton title={TITLE} description={DESCRIPTION} error={loadError} />;
  if (!s.workspace) return <NoWorkspace title={TITLE} description={DESCRIPTION} what="set up your Voice Profile" />;

  const me = s.derived.currentRecruiter;
  const active = s.recruiters.filter((r) => r.status === "active");
  const recruiterId = viewing ?? me?.id ?? active[0]?.id ?? "";
  const isMe = recruiterId === me?.id;
  const who = recruiterName(s, recruiterId);
  const profiles = s.voiceProfiles.filter((v) => v.recruiterId === recruiterId);
  const profile = profiles.find((v) => v.language === language) ?? null;
  const consent = s.mailboxScanConsents.find((c) => c.recruiterId === recruiterId && c.revokedOn === null) ?? null;
  const revoked = s.mailboxScanConsents.find((c) => c.recruiterId === recruiterId && c.revokedOn !== null) ?? null;

  const scan = (lang: Language, provider: AuthProvider) =>
    run(`scan:${lang}`, "scanVoiceProfile", { language: lang, provider, recruiterId }, (r) => ({
      tone: "success",
      text: `Analysed ${plural(r.emailsAnalysed, "sent email")}. The ${LANGUAGE_LABELS[lang]} Voice Profile is up to date.`,
    }));

  return (
    <SettingsPage
      title={TITLE}
      description={DESCRIPTION}
      actions={
        active.length > 1 ? (
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
            <span className="whitespace-nowrap">Voice Profiles of</span>
            <Select value={recruiterId} onChange={(e) => setViewing(e.target.value)} className="w-56">
              {active.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.id === me?.id ? " (you)" : ""}
                </option>
              ))}
            </Select>
          </label>
        ) : null
      }
    >
      <Flash flash={flash} onClose={() => setFlash(null)} />

      <ScanConsentCard
        s={s}
        who={who}
        isMe={isMe}
        consent={consent}
        revokedOn={revoked?.revokedOn ?? null}
        pending={pending}
        onRevoke={() =>
          void run("revoke", "revokeMailboxScan", { recruiterId }, () => ({
            tone: "success",
            text: "Read-only access revoked. The Voice Profiles stay, and keep learning from your edits to drafts.",
          }))
        }
        onGrant={() => setConsentFor(language)}
      />

      <div>
        <Tabs<Language>
          label="Voice Profile language"
          value={language}
          onChange={setLanguage}
          tabs={(["fr", "en"] as const).map((l) => {
            const p = profiles.find((v) => v.language === l);
            return {
              key: l,
              label: (
                <span className="flex items-center gap-2">
                  <span className="rounded bg-zinc-100 px-1 font-mono text-[10px] font-semibold uppercase text-zinc-600">{l}</span>
                  {LANGUAGE_LABELS[l]}
                </span>
              ),
              badge: p ? null : <span className="text-xs font-normal text-zinc-400">Not set up</span>,
            };
          })}
        />
      </div>

      {profile ? (
        <ProfileView
          key={profile.id}
          s={s}
          profile={profile}
          consentGranted={consent !== null}
          pending={pending}
          run={run}
          onRescan={() => (consent ? void scan(profile.language, consent.provider) : setConsentFor(profile.language))}
        />
      ) : (
        <NoProfile
          key={`${recruiterId}-${language}`}
          language={language}
          who={isMe ? "you" : who}
          signer={who.split(" ")[0]}
          consentGranted={consent !== null}
          pending={pending}
          onScan={() => (consent ? void scan(language, consent.provider) : setConsentFor(language))}
          onPaste={(examples) =>
            run(`paste:${language}`, "pasteVoiceExamples", { language, examples, recruiterId }, () => ({
              tone: "success",
              text: `${LANGUAGE_LABELS[language]} Voice Profile drafted from ${plural(examples.length, "example")}.`,
            }))
          }
        />
      )}

      <ScanConsentDialog
        open={consentFor !== null}
        language={consentFor ?? language}
        defaultProvider={s.session.provider ?? "google"}
        who={who}
        isMe={isMe}
        busy={pending?.startsWith("scan:") ?? false}
        onClose={() => setConsentFor(null)}
        onAllow={async (provider) => {
          const lang = consentFor ?? language;
          const r = await scan(lang, provider);
          if (r) {
            setConsentFor(null);
            setLanguage(lang);
          }
        }}
      />
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* Read-only mailbox scan consent                                      */
/* ------------------------------------------------------------------ */

function ScanConsentCard({
  s,
  who,
  isMe,
  consent,
  revokedOn,
  pending,
  onRevoke,
  onGrant,
}: {
  s: ClientState;
  who: string;
  isMe: boolean;
  consent: ClientState["mailboxScanConsents"][number] | null;
  revokedOn: string | null;
  pending: string | null;
  onRevoke: () => void;
  onGrant: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg", consent ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-500")}>
          {consent ? <ShieldCheck className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">Read-only access to sent emails</h2>
            {consent ? <Badge tone="green">Granted</Badge> : revokedOn ? <Badge tone="neutral">Revoked {formatDate(revokedOn)}</Badge> : <Badge tone="neutral">Not granted</Badge>}
          </div>
          {consent ? (
            <>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                {isMe ? "You" : who} granted it on {formatDate(consent.grantedOn)} with {PROVIDER_PRODUCT[consent.provider]}. Auto Recruit reads sent emails only, to learn the style rules
                below; it never reads replies here and never sends from this access.
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {consent.scopes.map((sc) => (
                  <li key={sc} className="flex items-center gap-1.5 rounded-md bg-zinc-50 px-2 py-1 font-mono text-[11px] text-zinc-600 ring-1 ring-inset ring-zinc-200">
                    <ProviderMark provider={consent.provider} />
                    {sc}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Optional. Scanning sent emails gives the most faithful Voice Profile. It is a separate, read-only consent: signing in never asked for it, and it is independent from
              connecting a Sending Mailbox. You can paste examples instead.
            </p>
          )}
          <p className="mt-2 text-xs text-zinc-500">Separate from signing in ({s.session.scopes.join(", ") || "identity only"}) and from Sending Mailboxes.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {consent ? (
            <Button variant="danger-ghost" icon={Unplug} loading={pending === "revoke"} onClick={onRevoke}>
              Revoke access
            </Button>
          ) : (
            <Button variant="primary" icon={ScanText} onClick={onGrant}>
              Scan sent emails
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ScanConsentDialog({
  open,
  language,
  defaultProvider,
  who,
  isMe,
  busy,
  onClose,
  onAllow,
}: {
  open: boolean;
  language: Language;
  defaultProvider: AuthProvider;
  who: string;
  isMe: boolean;
  busy: boolean;
  onClose: () => void;
  onAllow: (provider: AuthProvider) => void;
}) {
  const [provider, setProvider] = useState<AuthProvider>(defaultProvider);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Learn the ${LANGUAGE_LABELS[language]} Voice Profile from sent emails`}
      description={isMe ? "A separate, read-only consent. You can revoke it at any time." : `${who} grants this read-only consent for their own mailbox.`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => onAllow(provider)}>
            Allow read-only access
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {(["google", "microsoft"] as const).map((p) => (
            <OptionCard
              key={p}
              selected={provider === p}
              onSelect={() => setProvider(p)}
              title={
                <span className="flex items-center gap-2">
                  <ProviderMark provider={p} />
                  {PROVIDER_PRODUCT[p]}
                </span>
              }
            />
          ))}
        </div>
        <ConsentScreen
          provider={provider}
          heading="Auto Recruit wants read-only access to your sent emails"
          scopes={VOICE_SCAN_SCOPES[provider].map((scope) => ({ scope, description: "Read the emails you sent, without changing, deleting or sending anything" }))}
          note={
            <>
              Only your sent emails are read, to extract style rules and a few anonymised examples. Recipients&apos; data is not kept. This consent is independent from signing in and from
              any Sending Mailbox.
            </>
          }
        />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* A Voice Profile                                                     */
/* ------------------------------------------------------------------ */

function ProfileView({
  s,
  profile,
  consentGranted,
  pending,
  run,
  onRescan,
}: {
  s: ClientState;
  profile: VoiceProfile;
  consentGranted: boolean;
  pending: string | null;
  run: Runner;
  onRescan: () => void;
}) {
  const today = s.clock.today;
  const lang = LANGUAGE_LABELS[profile.language];
  return (
    <>
      <StatGrid>
        <MiniStat label="Learnt from" value={profile.source === "mailbox_scan" ? "Sent emails" : "Pasted examples"} />
        <MiniStat label={profile.source === "mailbox_scan" ? "Sent emails analysed" : "Examples analysed"} value={formatNumber(profile.emailsAnalysed)} />
        <MiniStat label="Edits learned" value={formatNumber(profile.learnedFromEdits.length)} />
        <MiniStat label="Updated" value={formatRelative(profile.updatedOn, today)} hint={formatDate(profile.updatedOn)} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <StyleGuideCard profile={profile} pending={pending} run={run} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <EditsLearnedCard s={s} profile={profile} />
        </div>
      </div>

      <Card
        title="Examples"
        description={`${plural(profile.examples.length, "email")} the Outreach Agent imitates for ${lang} drafts.`}
        actions={
          <Button size="sm" icon={ScanText} loading={pending === `scan:${profile.language}`} onClick={onRescan}>
            {consentGranted ? "Rescan sent emails" : "Scan sent emails"}
          </Button>
        }
      >
        {profile.examples.length === 0 ? (
          <EmptyState icon={MessageSquareQuote} title="No examples yet" description="Paste a few emails you sent, or scan your sent emails." />
        ) : (
          <div className={cx("grid gap-3", exampleColumns(profile.examples.length))}>
            {profile.examples.map((ex, i) => (
              <article key={i} className="flex min-w-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50/50">
                <header className="border-b border-zinc-100 px-3.5 py-2">
                  <p className="truncate text-xs text-zinc-500">
                    Subject: {ex.subject ? <span className="font-medium text-zinc-800">{ex.subject}</span> : <span className="italic">none (follow-up in the same thread)</span>}
                  </p>
                </header>
                <p className="whitespace-pre-line px-3.5 py-3 text-[13px] leading-5 text-zinc-700">{ex.body}</p>
              </article>
            ))}
          </div>
        )}
      </Card>

      <PasteExamplesCard
        language={profile.language}
        signer={recruiterName(s, profile.recruiterId).split(" ")[0]}
        busy={pending === `paste:${profile.language}`}
        onSubmit={(examples) =>
          run(`paste:${profile.language}`, "pasteVoiceExamples", { language: profile.language, examples, recruiterId: profile.recruiterId }, () => ({
            tone: "success",
            text: `Learnt from ${plural(examples.length, "more example")}. The ${lang} style rules are updated.`,
          }))
        }
      />
    </>
  );
}

/**
 * Example emails: one column below xl, then as many columns as fill whole rows (3 examples sit on
 * one row of 3, 2 or 4 on rows of 2), so a lone card never trails half a row.
 */
function exampleColumns(n: number): string {
  if (n <= 1) return "";
  if (n % 3 === 0) return "xl:grid-cols-3";
  if (n % 2 === 0) return "xl:grid-cols-2";
  return "xl:grid-cols-3";
}

/** The shared stat tile's frame, with a smaller value: these tiles hold words ("Pasted examples"), not only numbers. */
function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white p-4 shadow-xs ring-1 ring-zinc-200">
      <div className="truncate text-xs font-medium text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-base font-semibold tracking-tight text-zinc-900">{value}</div>
      {hint ? <div className="mt-1 truncate text-xs text-zinc-500">{hint}</div> : null}
    </div>
  );
}

function StyleGuideCard({ profile, pending, run }: { profile: VoiceProfile; pending: string | null; run: Runner }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.styleGuide.join("\n"));
  const rules = draft
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
  return (
    <Card
      title="Style rules"
      description={`${LANGUAGE_USE[profile.language]} Rules come from your emails and your edits; you can rewrite them.`}
      actions={
        editing ? null : (
          <Button
            size="sm"
            icon={PenLine}
            onClick={() => {
              setDraft(profile.styleGuide.join("\n"));
              setEditing(true);
            }}
          >
            Edit rules
          </Button>
        )
      }
    >
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run("style", "updateVoiceProfile", { voiceProfileId: profile.id, styleGuide: rules }, () => "Style rules saved. The next drafts follow them.");
            if (r) setEditing(false);
          }}
        >
          <Field label="One rule per line" hint={`${plural(rules.length, "rule")}. Keep each rule short and concrete.`}>
            {(id) => <Textarea id={id} rows={Math.max(6, rules.length + 2)} value={draft} onChange={(e) => setDraft(e.target.value)} />}
          </Field>
          <div className="mt-3 flex justify-end gap-2">
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={rules.length === 0} loading={pending === "style"}>
              Save rules
            </Button>
          </div>
        </form>
      ) : profile.styleGuide.length === 0 ? (
        <EmptyState icon={Sparkles} title="No rules yet" description="Rules appear once the Voice Profile has learnt from a few emails." />
      ) : (
        <ol className="space-y-2">
          {profile.styleGuide.map((rule, i) => (
            <li key={i} className="flex gap-3 text-sm leading-6 text-zinc-800">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-semibold tabular-nums text-indigo-700">{i + 1}</span>
              <span className="min-w-0">{rule}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function EditsLearnedCard({ s, profile }: { s: ClientState; profile: VoiceProfile }) {
  const edits = [...profile.learnedFromEdits].sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
  return (
    <Card title="Edits learned" description="Each edit you make to a draft before approving it teaches the Voice Profile.">
      {edits.length === 0 ? (
        <EmptyState
          icon={PenLine}
          title="No edits learned yet"
          description={
            <>
              Edit a draft in a Campaign&apos;s review queue and the lesson shows here. <Link href="/campaigns" className="font-medium text-indigo-600 hover:text-indigo-500">Open Campaigns</Link>
            </>
          }
        />
      ) : (
        <ol className="space-y-4">
          {edits.map((e) => {
            const campaign = e.campaignId ? s.campaigns.find((c) => c.id === e.campaignId) : null;
            return (
              <li key={e.id} className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">{e.lesson}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {formatDate(e.on)}
                  {campaign ? (
                    <>
                      {" - "}
                      <Link href={`/campaigns/${campaign.id}`} className="hover:text-zinc-800 hover:underline">
                        {campaign.name}
                      </Link>
                    </>
                  ) : (
                    " - outside a Campaign"
                  )}
                </p>
                <div className="mt-2 overflow-hidden rounded-md border border-zinc-200 text-xs leading-5">
                  <p className="border-b border-zinc-200 bg-red-50/60 px-2.5 py-1.5 text-red-900">
                    <span className="mr-1.5 font-mono text-red-500" aria-hidden>
                      -
                    </span>
                    <span className="sr-only">Draft: </span>
                    {e.before}
                  </p>
                  <p className="bg-emerald-50/60 px-2.5 py-1.5 text-emerald-900">
                    <span className="mr-1.5 font-mono text-emerald-600" aria-hidden>
                      +
                    </span>
                    <span className="sr-only">Your edit: </span>
                    {e.after ? e.after : <span className="italic text-emerald-700">removed</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Pasting examples, empty language                                    */
/* ------------------------------------------------------------------ */

function splitExamples(text: string): string[] {
  return text
    .split(/^\s*---\s*$/m)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function PasteForm({
  language,
  signer,
  busy,
  onSubmit,
  compact = false,
}: {
  language: Language;
  signer: string;
  busy: boolean;
  onSubmit: (examples: string[]) => Promise<unknown>;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const examples = splitExamples(text);
  const placeholder =
    language === "fr"
      ? `Bonjour Claire,\n\nJ'ai vu que vous recrutez...\n\nBelle journée,\n${signer}\n---\nBonjour Marc,\n...`
      : `Hi Jonas,\n\nCongrats on the Series B...\n\nBest,\n${signer}\n---\nHi Marta,\n...`;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (examples.length === 0) return;
        const r = await onSubmit(examples);
        if (r) setText("");
      }}
    >
      <Field
        label={`Emails you wrote in ${LANGUAGE_LABELS[language]}`}
        hint={
          examples.length === 0
            ? "Separate emails with a line containing only ---. Three or more give the best result."
            : `${plural(examples.length, "email")} detected. Names of recipients are not kept.`
        }
      >
        {(id) => <Textarea id={id} rows={compact ? 6 : 8} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="font-mono text-[13px]" />}
      </Field>
      <div className="mt-3 flex justify-end">
        <Button type="submit" variant={compact ? "secondary" : "primary"} icon={ClipboardPaste} disabled={examples.length === 0} loading={busy}>
          {examples.length > 0 ? `Learn from ${plural(examples.length, "email")}` : "Learn from these emails"}
        </Button>
      </div>
    </form>
  );
}

function PasteExamplesCard({ language, signer, busy, onSubmit }: { language: Language; signer: string; busy: boolean; onSubmit: (examples: string[]) => Promise<unknown> }) {
  return (
    <Card title="Paste examples" description="Add emails you are proud of. They join the examples and refine the style rules.">
      <PasteForm language={language} signer={signer} busy={busy} onSubmit={onSubmit} compact />
    </Card>
  );
}

function NoProfile({
  language,
  who,
  signer,
  consentGranted,
  pending,
  onScan,
  onPaste,
}: {
  language: Language;
  who: string;
  signer: string;
  consentGranted: boolean;
  pending: string | null;
  onScan: () => void;
  onPaste: (examples: string[]) => Promise<unknown>;
}) {
  const lang = LANGUAGE_LABELS[language];
  return (
    <Card>
      <EmptyState
        icon={Languages}
        title={`No ${lang} Voice Profile yet`}
        description={`Until there is one, ${lang} drafts for ${who} use a neutral, concise style. ${LANGUAGE_USE[language]}`}
      />
      <div className="grid gap-4 border-t border-zinc-100 pt-5 lg:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2">
            <ScanText className="size-4 text-indigo-600" aria-hidden />
            <h3 className="text-sm font-semibold text-zinc-900">Scan sent emails</h3>
            <Badge tone="indigo">Most faithful</Badge>
          </div>
          <p className="mt-1.5 text-sm leading-6 text-zinc-600">
            Learns from your last 12 months of sent {lang} emails.{" "}
            {consentGranted ? "Uses the read-only access already granted." : "Asks for a separate, read-only consent first."}
          </p>
          <Callout tone="info" className="mt-3">
            Read-only, sent folder only. Never part of signing in, and independent from Sending Mailboxes.
          </Callout>
          <div className="mt-auto flex justify-end pt-3">
            <Button variant="primary" icon={ScanText} loading={pending === `scan:${language}`} onClick={onScan}>
              {consentGranted ? `Scan ${lang} sent emails` : "Grant read-only access and scan"}
            </Button>
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="size-4 text-indigo-600" aria-hidden />
            <h3 className="text-sm font-semibold text-zinc-900">Paste examples</h3>
            <Badge>No mailbox access</Badge>
          </div>
          <div className="mt-3">
            <PasteForm language={language} signer={signer} busy={pending === `paste:${language}`} onSubmit={onPaste} compact />
          </div>
        </div>
      </div>
    </Card>
  );
}
