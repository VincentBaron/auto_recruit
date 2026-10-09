"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Ban, CircleCheck, Globe, Mail, Plus, ScrollText, Search, ShieldCheck } from "lucide-react";
import { formatDate, formatRelative, truncateHash } from "@/lib/format";
import { SUPPRESSION_REASON_LABELS } from "@/lib/labels";
import type { AuditEvent, ClientState, SuppressionEntry, SuppressionReason } from "@/lib/types";
import { domainOf, type useRunner } from "./shared";
import { Badge, Button, Callout, Card, EmptyState, Input, Select, type Tone, cx } from "./ui";

type Runner = ReturnType<typeof useRunner>["run"];

/* ------------------------------------------------------------------ */
/* Suppression List                                                    */
/* ------------------------------------------------------------------ */

const REASON_TONE: Record<SuppressionReason, Tone> = {
  opt_out: "amber",
  not_interested: "neutral",
  data_request_delete: "red",
  manual: "neutral",
};

/** sha256 of the trimmed, lowercased value, computed in the browser (same rule as the backend). */
async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function SuppressionList({ s, pending, run }: { s: ClientState; pending: string | null; run: Runner }) {
  const [value, setValue] = useState("");
  const [check, setCheck] = useState<{ value: string; entry: SuppressionEntry | null; via: "email" | "domain" | null; error?: string } | null>(null);
  const [filter, setFilter] = useState<"all" | SuppressionReason>("all");
  const entries = [...s.suppressionList].sort((a, b) => (a.addedOn < b.addedOn ? 1 : a.addedOn > b.addedOn ? -1 : 0));
  const rows = filter === "all" ? entries : entries.filter((e) => e.reason === filter);
  const clean = value.trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(clean);

  const runCheck = async () => {
    if (!valid) return;
    if (!globalThis.crypto?.subtle) {
      setCheck({ value: clean, entry: null, via: null, error: "This browser cannot compute the hash here (it needs localhost or HTTPS)." });
      return;
    }
    const own = await sha256(clean);
    const byValue = s.suppressionList.find((e) => e.hash === own) ?? null;
    if (byValue) return setCheck({ value: clean, entry: byValue, via: clean.includes("@") ? "email" : "domain" });
    if (clean.includes("@")) {
      const dom = await sha256(domainOf(clean));
      const byDomain = s.suppressionList.find((e) => e.hash === dom) ?? null;
      if (byDomain) return setCheck({ value: clean, entry: byDomain, via: "domain" });
    }
    setCheck({ value: clean, entry: null, via: null });
  };

  return (
    <div className="flex flex-col gap-4">
      <Callout tone="indigo" icon={ShieldCheck} title="Opt-outs apply across all Workspaces">
        Personal data is never shared between Workspaces, with one exception: anyone who opts out is never contacted again by any Workspace. Only a hash is kept, never the email
        itself, and a Candidate who opts out has their data deleted at once.
      </Callout>

      <Card title="Check or add an address" description="Paste an email or a domain. Checking computes the hash in your browser; nothing is sent.">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void runCheck();
          }}
        >
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setCheck(null);
            }}
            placeholder="name@example.eu or example.eu"
            aria-label="Email or domain"
            className="sm:max-w-sm"
          />
          <div className="flex gap-2">
            <Button type="submit" icon={Search} disabled={!valid}>
              Check
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              disabled={!valid}
              loading={pending === "suppress"}
              onClick={async () => {
                const v = clean;
                const r = await run("suppress", "addToSuppressionList", { value: v, reason: "manual" }, (res) => ({
                  tone: "success",
                  text: `${v} will never be contacted again. Kept as ${truncateHash(res.hash)}.`,
                }));
                if (r) {
                  setValue("");
                  setCheck(null);
                }
              }}
            >
              Add to the Suppression List
            </Button>
          </div>
        </form>
        {check ? (
          check.error ? (
            <Callout tone="danger" className="mt-3">
              {check.error}
            </Callout>
          ) : check.entry ? (
            <Callout tone="warning" icon={Ban} className="mt-3" title={`${check.value} is on the Suppression List`}>
              {check.via === "domain" && check.value.includes("@") ? "Its whole domain is suppressed. " : ""}
              {SUPPRESSION_REASON_LABELS[check.entry.reason]}, added {formatDate(check.entry.addedOn)} by {check.entry.addedBy === "this_workspace" ? "this Workspace" : "another Workspace"}.
            </Callout>
          ) : (
            <Callout tone="success" icon={CircleCheck} className="mt-3" title={`${check.value} is not on the Suppression List`}>
              It can be contacted, within the usual rules.
            </Callout>
          )
        ) : null}
      </Card>

      <Card
        title="Suppression List"
        description={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}, all applied across all Workspaces.`}
        actions={
          <Select value={filter} onChange={(e) => setFilter(e.target.value as "all" | SuppressionReason)} aria-label="Filter by reason" className="w-56">
            <option value="all">All reasons</option>
            {(Object.keys(SUPPRESSION_REASON_LABELS) as SuppressionReason[]).map((r) => (
              <option key={r} value={r}>
                {SUPPRESSION_REASON_LABELS[r]}
              </option>
            ))}
          </Select>
        }
        bodyClassName="p-0"
      >
        {rows.length === 0 ? (
          <EmptyState icon={Ban} title={entries.length === 0 ? "The Suppression List is empty" : "No entry for this reason"} description="Opt-outs land here automatically, the moment the reply is received." />
        ) : (
          <>
          <ul className="divide-y divide-zinc-100 sm:hidden">
            {rows.map((e) => (
              <li key={e.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <code className="truncate font-mono text-xs text-zinc-700">{truncateHash(e.hash)}</code>
                  <Badge tone={REASON_TONE[e.reason]}>{SUPPRESSION_REASON_LABELS[e.reason]}</Badge>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {e.kind === "email" ? "Email" : "Domain"} - added by {e.addedBy === "this_workspace" ? "this Workspace" : "another Workspace"} {formatRelative(e.addedOn, s.clock.today)} - applies to all Workspaces
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                  <th className="px-5 py-2 font-medium">Hash</th>
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Added by</th>
                  <th className="px-3 py-2 font-medium">Applies to</th>
                  <th className="px-5 py-2 text-right font-medium">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <code className="font-mono text-xs text-zinc-700" title={e.hash}>
                        {truncateHash(e.hash)}
                      </code>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-zinc-600">
                      <span className="inline-flex items-center gap-1.5">
                        {e.kind === "email" ? <Mail className="size-3.5 text-zinc-400" aria-hidden /> : <Globe className="size-3.5 text-zinc-400" aria-hidden />}
                        {e.kind === "email" ? "Email" : "Domain"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Badge tone={REASON_TONE[e.reason]}>{SUPPRESSION_REASON_LABELS[e.reason]}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-zinc-600">{e.addedBy === "this_workspace" ? "This Workspace" : "Another Workspace"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-zinc-600">All Workspaces</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-zinc-500" title={formatDate(e.addedOn)}>
                      {formatRelative(e.addedOn, s.clock.today)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

type ActorKind = "all" | "recruiter" | "agent" | "system" | "api_key" | "candidate";

const ACTOR_KIND_LABELS: Record<ActorKind, string> = {
  all: "All actors",
  recruiter: "Recruiters",
  agent: "Agents",
  system: "System",
  api_key: "API Keys",
  candidate: "Candidates (Consent Page)",
};

function actorKind(actor: string, recruiterNames: Set<string>): Exclude<ActorKind, "all"> {
  if (recruiterNames.has(actor)) return "recruiter";
  if (actor.startsWith("API Key")) return "api_key";
  if (actor.startsWith("Candidate")) return "candidate";
  if (/Agent$/.test(actor)) return "agent";
  return "system";
}

const ACTOR_DOT: Record<Exclude<ActorKind, "all">, string> = {
  recruiter: "bg-indigo-500",
  agent: "bg-sky-500",
  system: "bg-zinc-400",
  api_key: "bg-amber-500",
  candidate: "bg-emerald-500",
};

function targetHref(e: AuditEvent, s: ClientState): string | null {
  const ref = e.targetRef;
  if (!ref) return null;
  switch (ref.kind) {
    case "prospect":
      return s.prospects.some((p) => p.id === ref.id) ? `/prospects/${ref.id}` : null;
    case "candidate":
      return s.candidates.some((c) => c.id === ref.id) ? `/candidates/${ref.id}` : null;
    case "hiring_contact": {
      const h = s.hiringContacts.find((x) => x.id === ref.id);
      return h ? `/prospects/${h.prospectId}` : null;
    }
    case "campaign":
      return s.campaigns.some((c) => c.id === ref.id) ? `/campaigns/${ref.id}` : null;
    case "niche":
      return s.niches.some((n) => n.id === ref.id) ? `/niches/${ref.id}` : null;
    case "mailbox":
      return "/settings/mailboxes";
    case "api_key":
      return "/settings/api";
    case "reply":
      return "/inbox";
    default:
      return null;
  }
}

const PAGE = 50;

export function AuditLog({ s }: { s: ClientState }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ActorKind>("all");
  const [limit, setLimit] = useState(PAGE);
  const names = useMemo(() => new Set(s.recruiters.map((r) => r.name)), [s.recruiters]);
  const all = useMemo(() => [...s.auditLog].sort((a, b) => b.seq - a.seq), [s.auditLog]);
  const q = query.trim().toLowerCase();
  const rows = all.filter(
    (e) => (kind === "all" || actorKind(e.actor, names) === kind) && (!q || `${e.actor} ${e.action} ${e.target}`.toLowerCase().includes(q)),
  );
  const shown = rows.slice(0, limit);

  return (
    <div className="flex flex-col gap-4">
      <Callout tone="info" icon={ScrollText}>
        Every read or export of personal data and every outreach action is logged: who, when and what. Data Requests and inspections rely on this trail.
      </Callout>
      <Card
        title="Audit log"
        description={`${rows.length} of ${all.length} events, newest first.`}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative min-w-0 sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-zinc-400" aria-hidden />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
                placeholder="Search events"
                aria-label="Search the audit log"
                className="pl-8"
              />
            </div>
            <Select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as ActorKind);
                setLimit(PAGE);
              }}
              aria-label="Filter by actor"
              className="w-full sm:w-52"
            >
              {(Object.keys(ACTOR_KIND_LABELS) as ActorKind[]).map((k) => (
                <option key={k} value={k}>
                  {ACTOR_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
        }
        bodyClassName="p-0"
      >
        {shown.length === 0 ? (
          <EmptyState icon={ScrollText} title={all.length === 0 ? "No events yet" : "No event matches"} description={all.length === 0 ? "Actions appear here as soon as they happen." : "Try another search or actor."} />
        ) : (
          <>
            <ul className="divide-y divide-zinc-100 sm:hidden">
              {shown.map((e) => {
                const k = actorKind(e.actor, names);
                const href = targetHref(e, s);
                return (
                  <li key={e.id} className="px-4 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-zinc-800">
                        <span className={cx("size-1.5 shrink-0 rounded-full", ACTOR_DOT[k])} aria-hidden />
                        <span className="truncate">{e.actor}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-zinc-500">{formatDate(e.on)}</span>
                    </div>
                    <p className="mt-0.5 text-zinc-700">{e.action}</p>
                    {e.target ? (
                      href ? (
                        <Link href={href} className="mt-0.5 block text-xs text-zinc-500 hover:text-indigo-600">
                          {e.target}
                        </Link>
                      ) : (
                        <p className="mt-0.5 text-xs text-zinc-500">{e.target}</p>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                    <th className="w-32 px-5 py-2 font-medium">Date</th>
                    <th className="w-48 px-3 py-2 font-medium">Actor</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-5 py-2 font-medium">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {shown.map((e) => {
                    const k = actorKind(e.actor, names);
                    const href = targetHref(e, s);
                    return (
                      <tr key={e.id} className="align-top">
                        <td className="whitespace-nowrap px-5 py-2 tabular-nums text-zinc-500">{formatDate(e.on)}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2 text-zinc-800">
                            <span className={cx("size-1.5 shrink-0 rounded-full", ACTOR_DOT[k])} aria-hidden />
                            {e.actor}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-700">{e.action}</td>
                        <td className="px-5 py-2 text-zinc-600">
                          {href ? (
                            <Link href={href} className="hover:text-indigo-600 hover:underline">
                              {e.target}
                            </Link>
                          ) : (
                            e.target || "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > shown.length ? (
              <div className="border-t border-zinc-100 px-5 py-3 text-center">
                <Button size="sm" variant="ghost" onClick={() => setLimit(limit + PAGE)}>
                  Show {Math.min(PAGE, rows.length - shown.length)} more of {rows.length - shown.length}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
