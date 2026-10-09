"use client";

import { useState } from "react";
import { Bot, KeyRound, Lock, Plus, ShieldCheck, Terminal, TriangleAlert } from "lucide-react";
import { formatDate, formatRelative, plural } from "@/lib/format";
import { API_BASE_URL, MCP_SERVER_URL, MCP_TOOL_NAMES } from "@/lib/labels";
import { PLACEHOLDER_PRICE_HINT, PRICES, ROLE_SOURCING_MAX_CANDIDATES } from "@/lib/pricing";
import type { ActionName, ApiKey, ClientState } from "@/lib/types";
import { useAppState, useBackendError } from "@/lib/api";
import { recruiterName, useRunner } from "./shared";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CopyButton,
  EmptyState,
  Field,
  Flash,
  Input,
  Modal,
  NoWorkspace,
  Select,
  SettingsPage,
  SettingsSkeleton,
  Tabs,
  cx,
  useFlash,
} from "./ui";

const TITLE = "API & MCP";
const DESCRIPTION =
  "The app runs on the same public API your integrations use, with no private endpoints. Integrations and AI clients get exactly what you get, billed in the same Credits.";

type Runner = ReturnType<typeof useRunner>["run"];

export function ApiScreen() {
  const s = useAppState();
  const loadError = useBackendError();
  const [flash, setFlash] = useFlash();
  const { pending, run } = useRunner(setFlash);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  if (!s) return <SettingsSkeleton title={TITLE} description={DESCRIPTION} error={loadError} />;
  if (!s.workspace) return <NoWorkspace title={TITLE} description={DESCRIPTION} what="create API Keys and connect AI clients" />;

  const me = s.derived.currentRecruiter;
  const isOwner = me?.role === "owner";
  const keys = [...s.apiKeys].sort((a, b) => {
    const aActive = a.revokedOn === null;
    const bActive = b.revokedOn === null;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return a.createdOn < b.createdOn ? 1 : a.createdOn > b.createdOn ? -1 : 0;
  });
  const activeKeys = keys.filter((k) => k.revokedOn === null);

  return (
    <SettingsPage
      title={TITLE}
      description={DESCRIPTION}
      actions={
        <Button variant="primary" icon={Plus} disabled={!isOwner} title={isOwner ? undefined : "Only an Owner creates API Keys"} onClick={() => setCreating(true)}>
          Create an API Key
        </Button>
      }
    >
      <Flash flash={flash} onClose={() => setFlash(null)} />

      <Callout tone="indigo" icon={ShieldCheck} title={`${s.workspace.name} is accountable for its integrations`}>
        An API Key can do everything the app can, including sending responses to replies. Whenever it contacts people, it acts for the Recruiter it names: their Sending Mailboxes, their
        Voice Profile, their Claims. Every call is in the audit log under the key&apos;s name.
      </Callout>

      <Card
        title="API Keys"
        description={`${plural(activeKeys.length, "active key")}. ${isOwner ? "The full value is shown once, when the key is created." : "Only an Owner creates and revokes API Keys."}`}
        bodyClassName={keys.length === 0 ? undefined : "divide-y divide-zinc-100"}
      >
        {keys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API Keys yet"
            description="Create one to connect a CRM, a script or an AI client."
            action={
              isOwner ? (
                <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                  Create an API Key
                </Button>
              ) : null
            }
          />
        ) : (
          keys.map((k) => <KeyRow key={k.id} s={s} k={k} canManage={isOwner} onRevoke={() => setRevoking(k)} />)
        )}
      </Card>

      <McpCard />

      <ApiActivity s={s} />

      <CreateKeyDialog open={creating} s={s} busy={pending === "create"} run={run} onClose={() => setCreating(false)} />

      <Modal
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        size="sm"
        title={revoking ? `Revoke "${revoking.name}"?` : "Revoke"}
        description={revoking ? `${revoking.prefix}... - acts for ${recruiterName(s, revoking.recruiterId)}` : undefined}
        footer={
          <>
            <Button onClick={() => setRevoking(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={revoking !== null && pending === `revoke:${revoking.id}`}
              onClick={async () => {
                if (!revoking) return;
                const k = revoking;
                const r = await run(`revoke:${k.id}`, "revokeApiKey", { apiKeyId: k.id }, () => `"${k.name}" revoked. Calls with it now fail.`);
                if (r) setRevoking(null);
              }}
            >
              Revoke key
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-zinc-700">Calls made with this key fail from now on. Anything it already did stays, with its audit trail. This cannot be undone: create a new key instead.</p>
      </Modal>
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* API Keys                                                            */
/* ------------------------------------------------------------------ */

function KeyRow({ s, k, canManage, onRevoke }: { s: ClientState; k: ApiKey; canManage: boolean; onRevoke: () => void }) {
  const revoked = k.revokedOn !== null;
  const actsFor = recruiterName(s, k.recruiterId);
  return (
    <div className={cx("flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5", revoked && "bg-zinc-50/60")}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={cx("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md", revoked ? "bg-zinc-100 text-zinc-400" : "bg-indigo-50 text-indigo-600")}>
          <KeyRound className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("text-sm font-medium", revoked ? "text-zinc-500" : "text-zinc-900")}>{k.name}</span>
            {revoked ? <Badge>Revoked {formatDate(k.revokedOn)}</Badge> : <Badge tone="green">Active</Badge>}
          </div>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">
            {k.prefix}
            <span aria-hidden>{"•".repeat(8)}</span>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Created {formatDate(k.createdOn)} by {recruiterName(s, k.createdById)} - {k.lastUsedOn ? `last used ${formatRelative(k.lastUsedOn, s.clock.today)}` : "never used"}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-11 sm:pl-0">
        <span className="flex items-center gap-1.5 text-xs text-zinc-600">
          <span className="text-zinc-400">Acts for</span>
          <Avatar name={actsFor} size="sm" />
          <span className="font-medium text-zinc-800">{actsFor}</span>
        </span>
        {canManage && !revoked ? (
          <Button size="sm" variant="danger-ghost" onClick={onRevoke}>
            Revoke
          </Button>
        ) : (
          <span className="hidden w-[60px] sm:block" aria-hidden />
        )}
      </div>
    </div>
  );
}

function CreateKeyDialog({ open, s, busy, run, onClose }: { open: boolean; s: ClientState; busy: boolean; run: Runner; onClose: () => void }) {
  const me = s.derived.currentRecruiter;
  const active = s.recruiters.filter((r) => r.status === "active");
  const [name, setName] = useState("");
  const [recruiterId, setRecruiterId] = useState(me?.id ?? active[0]?.id ?? "");
  const [created, setCreated] = useState<{ name: string; fullKey: string } | null>(null);
  const close = () => {
    setName("");
    setCreated(null);
    setRecruiterId(me?.id ?? active[0]?.id ?? "");
    onClose();
  };
  const actsFor = recruiterName(s, recruiterId);
  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={created === null}
      title={created ? "Copy your API Key now" : "Create an API Key"}
      description={created ? `"${created.name}" acts for ${actsFor}.` : "For a CRM sync, a script or an AI client connected over MCP."}
      footer={
        created ? (
          <Button variant="primary" onClick={close}>
            I have copied it
          </Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="primary"
              icon={KeyRound}
              disabled={name.trim().length < 2 || !recruiterId}
              loading={busy}
              onClick={async () => {
                const r = await run("create", "createApiKey", { name: name.trim(), recruiterId });
                if (r) setCreated({ name: name.trim(), fullKey: r.fullKey });
              }}
            >
              Create key
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all font-mono text-sm text-zinc-900">{created.fullKey}</code>
            <CopyButton value={created.fullKey} />
          </div>
          <Callout tone="warning" icon={TriangleAlert}>
            This is the only time the full API Key is shown. Store it where only your integration can read it. If you lose it, revoke it and create a new one.
          </Callout>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Name" hint="Shown in the audit log next to everything this key does.">
            {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="CRM sync, AI client, export script..." autoComplete="off" />}
          </Field>
          <Field label="Acts for" hint="The named Recruiter the key acts for whenever it contacts people.">
            {(id) => (
              <Select id={id} value={recruiterId} onChange={(e) => setRecruiterId(e.target.value)}>
                {active.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.id === me?.id ? " (you)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Callout tone="info">
            Emails it sends leave from {actsFor}&apos;s Sending Mailboxes, in {actsFor}&apos;s Voice Profile, and the people it adds to Campaigns are claimed by {actsFor}. Credits come from
            the Workspace balance.
          </Callout>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* MCP and REST                                                        */
/* ------------------------------------------------------------------ */

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-lg bg-zinc-950">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-[11px] font-medium text-zinc-400">{label}</span>
        <CopyButton value={code} dark />
      </div>
      <pre className="overflow-x-auto px-3 py-3 font-mono text-xs leading-5 text-zinc-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** What each MCP tool does and costs, by the action it runs. Tool names come from MCP_TOOL_NAMES. */
const MCP_TOOL_DETAILS: Partial<Record<ActionName, { does: string; cost: string }>> = {
  findMoreLike: { does: "Surface more Prospects like one you name", cost: `${PRICES.surfacedProspect} per Surfaced Prospect` },
  quoteEnrichment: { does: "Cost of an Enrichment before running it", cost: "Free" },
  enrich: { does: "Verified emails; mobile numbers only when asked per person", cost: `${PRICES.verifiedEmail} per email, ${PRICES.mobile} per mobile` },
  sourceForDetectedRole: {
    does: `Find up to ${ROLE_SOURCING_MAX_CANDIDATES} Candidates for a Detected Role`,
    cost: `${PRICES.surfacedCandidate} per Surfaced Candidate`,
  },
  createCampaign: { does: "Draft a Campaign from a Niche, a Brief and a Sequence", cost: "Free" },
  addRecipients: { does: "Add Enriched people to a Campaign, claiming them for the key's Recruiter", cost: "Free" },
  launchCampaign: { does: "Launch a Campaign; emails leave within the Sending Mailbox caps", cost: `${PRICES.emailSent} per email sent` },
  sendReplyResponse: { does: "Send a response to a reply, as the key's Recruiter", cost: `${PRICES.emailSent} per email sent` },
  exportPerson: { does: "Answer a Data Request with Provenance", cost: "Free" },
};

/** Reading the Feed is not an action, so it has no entry in MCP_TOOL_NAMES. */
const READ_FEED_TOOL = { name: "search_feed", does: "Ranked Prospects and Candidates, with line-by-line Signal Strength and Fit explanations", cost: "Free" };

const MCP_TOOLS: { name: string; does: string; cost: string }[] = [
  READ_FEED_TOOL,
  ...(Object.keys(MCP_TOOL_DETAILS) as ActionName[]).flatMap((action) => {
    const name = MCP_TOOL_NAMES[action];
    const details = MCP_TOOL_DETAILS[action];
    return name && details ? [{ name, ...details }] : [];
  }),
];

type McpTab = "config" | "remote" | "rest";

function McpCard() {
  const [tab, setTab] = useState<McpTab>("config");
  const config = JSON.stringify(
    {
      mcpServers: {
        "auto-recruit": {
          url: MCP_SERVER_URL,
          headers: { Authorization: "Bearer <your API Key>" },
        },
      },
    },
    null,
    2,
  );
  const remote = `Server URL     ${MCP_SERVER_URL}\nTransport      Streamable HTTP\nHeader         Authorization: Bearer <your API Key>`;
  const rest = `curl ${API_BASE_URL}/feed?kind=prospect&limit=10 \\\n  -H "Authorization: Bearer <your API Key>"`;
  return (
    <Card title="MCP server" description="Connect an AI client to your Workspace. It uses the same tools as the chat panel in this app.">
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:flex-row sm:items-center">
        <Bot className="hidden size-4 shrink-0 text-zinc-500 sm:block" aria-hidden />
        <code className="min-w-0 flex-1 break-all font-mono text-sm text-zinc-900">{MCP_SERVER_URL}</code>
        <CopyButton value={MCP_SERVER_URL} label="Copy URL" />
      </div>

      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          { n: 1, title: "Create an API Key", text: "Name it after the client and choose the Recruiter it acts for." },
          { n: 2, title: "Add the server", text: "Paste the URL and the key into your AI client's MCP settings." },
          { n: 3, title: "Ask in plain language", text: '"Find 10 more fintechs like Fintory" or "draft a Campaign for my fintech Niche".' },
        ].map((st) => (
          <li key={st.n} className="flex gap-3 rounded-lg border border-zinc-200 p-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">{st.n}</span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zinc-900">{st.title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{st.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <Tabs<McpTab>
          label="How to connect"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "config", label: "JSON config" },
            { key: "remote", label: "Remote server" },
            { key: "rest", label: "REST API" },
          ]}
        />
        <div className="mt-3">
          {tab === "config" ? <CodeBlock label="mcp.json" code={config} /> : null}
          {tab === "remote" ? <CodeBlock label="Settings" code={remote} /> : null}
          {tab === "rest" ? (
            <div className="space-y-2">
              <CodeBlock label="Shell" code={rest} />
              <p className="text-xs leading-5 text-zinc-500">
                Base URL <code className="font-mono text-zinc-700">{API_BASE_URL}</code>. The OpenAPI 3.1 description is the source of truth for every endpoint.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">Tools</h3>
          <span className="text-xs text-zinc-500">Credits, {PLACEHOLDER_PRICE_HINT}</span>
        </div>
        <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {MCP_TOOLS.map((t) => (
            <li key={t.name} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[13rem_1fr_auto] sm:items-baseline">
              <code className="font-mono text-xs text-zinc-800">{t.name}</code>
              <span className="col-span-2 row-start-2 text-zinc-600 sm:col-span-1 sm:row-start-auto">{t.does}</span>
              <span className="col-start-2 row-start-1 whitespace-nowrap text-right text-xs tabular-nums text-zinc-500 sm:col-start-auto sm:row-start-auto">{t.cost}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-zinc-500">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Tools that spend Credits or contact people return their cost and wait for a confirmation, as the chat panel does.
        </p>
      </div>
    </Card>
  );
}

function ApiActivity({ s }: { s: ClientState }) {
  const events = s.auditLog
    .filter((e) => e.actor.startsWith("API Key") || e.targetRef?.kind === "api_key" || /API Key/.test(e.action))
    .sort((a, b) => b.seq - a.seq)
    .slice(0, 10);
  return (
    <Card title="API Key activity" description="Calls made with API Keys, and keys created or revoked, from the audit log." bodyClassName={events.length === 0 ? undefined : "p-0"}>
      {events.length === 0 ? (
        <EmptyState icon={Terminal} title="No API activity yet" description="Calls made with an API Key show here and in Data & privacy, under the key's name." />
      ) : (
        <ul className="divide-y divide-zinc-100">
          {events.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 px-5 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4">
              <span className="w-24 shrink-0 text-xs tabular-nums text-zinc-500">{formatDate(e.on)}</span>
              <span className="shrink-0 font-medium text-zinc-800">{e.actor}</span>
              <span className="min-w-0 truncate text-zinc-600">
                {e.action}
                {e.target ? <span className="text-zinc-400"> - {e.target}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

