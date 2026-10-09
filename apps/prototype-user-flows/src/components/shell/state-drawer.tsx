"use client";

// Prototype chrome: the full dummy-backend state as readable sections, with "What changed" after
// the last action. Opened from the simulator bar.

import { useEffect, useRef, type ReactNode } from "react";
import { Database, X } from "lucide-react";
import { formatCredits, formatDate, formatDateShort, formatPercent, formatWeekdayDate, formatWeekdays, truncateHash } from "@/lib/format";
import {
  AUDIENCE_LABELS,
  CAMPAIGN_STATUS_LABELS,
  DATA_REQUEST_KIND_LABELS,
  LIFECYCLE_LABELS,
  MAILBOX_STATUS_LABELS,
  NICHE_STATUS_LABELS,
  nicheLabel,
  PROSPECT_STATUS_LABELS,
  RECIPIENT_STATE_LABELS,
  SUPPRESSION_REASON_LABELS,
} from "@/lib/labels";
import type { ClientState, Lifecycle, ProspectStatus, RecipientState } from "@/lib/types";

const LIFECYCLES: Lifecycle[] = ["surfaced", "dismissed", "enriched", "contacted", "replied", "consented", "suppressed"];
const PROSPECT_STATUSES: ProspectStatus[] = ["surfaced", "dismissed", "in_campaign", "replied", "closed"];
const RECIPIENT_STATES: RecipientState[] = ["awaiting_review", "scheduled", "sent", "replied", "stopped"];

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="border-b border-zinc-200 px-4 py-4 sm:px-5">
      <h3 className="mb-2.5 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {title}
        {count !== undefined ? <span className="font-medium normal-case tracking-normal text-zinc-400 tabular-nums">{count}</span> : null}
      </h3>
      {children}
    </section>
  );
}

function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate text-zinc-500">{k}</dt>
          <dd className="min-w-0 break-words text-zinc-900 tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-zinc-400">{empty}</p>;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead>
          <tr className="text-zinc-500">
            {head.map((h) => (
              <th key={h} className="px-1 pb-1.5 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r, i) => (
            <tr key={i} className="align-top text-zinc-800">
              {r.map((c, j) => (
                <td key={j} className="px-1 py-1.5 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Counts({ label, counts }: { label: string; counts: [string, number][] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-zinc-700">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {counts.map(([k, n]) => (
          <li key={k} className={`rounded-md px-2 py-0.5 text-xs tabular-nums ring-1 ring-inset ${n > 0 ? "bg-white text-zinc-800 ring-zinc-200" : "bg-zinc-50 text-zinc-400 ring-zinc-100"}`}>
            {k} <span className="font-semibold">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StateDrawer({ open, onClose, state }: { open: boolean; onClose: () => void; state: ClientState | null }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const s = state;
  const name = (id: string) => s?.recruiters.find((r) => r.id === id)?.name ?? "Unknown Recruiter";
  const claimed = s
    ? [
        ...s.hiringContacts.filter((h) => h.claim).map((h) => ({ who: h.name, kind: "Hiring Contact", claim: h.claim! })),
        ...s.candidates.filter((c) => c.claim).map((c) => ({ who: c.name, kind: "Candidate", claim: c.claim! })),
      ]
    : [];
  const audit = s ? [...s.auditLog].sort((a, b) => b.seq - a.seq).slice(0, 30) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="state-drawer-title">
      <button type="button" className="absolute inset-0 cursor-default bg-zinc-950/25" aria-label="Close the State drawer" onClick={onClose} tabIndex={-1} />
      <div className="relative flex h-full w-full flex-col bg-white shadow-2xl sm:w-[540px]">
        <header className="flex h-12 shrink-0 items-center gap-2.5 bg-zinc-900 pr-2 pl-4 text-white sm:pl-5">
          <Database className="size-4 text-amber-300" aria-hidden />
          <h2 id="state-drawer-title" className="flex-1 truncate text-sm font-semibold">
            State <span className="font-normal text-zinc-400">- dummy backend, prototype only</span>
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} className="inline-flex size-8 items-center justify-center rounded-md text-zinc-300 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>
        </header>

        {s === null ? (
          <div className="space-y-3 p-5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-100" />
            ))}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <Section title="What changed">
              {s.lastChange ? (
                <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-inset ring-zinc-200">
                  <p className="mb-1.5 text-xs text-zinc-500">
                    <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-zinc-800 ring-1 ring-zinc-200">{s.lastChange.action}</code> on {formatWeekdayDate(s.lastChange.on)}
                  </p>
                  {s.lastChange.lines.length > 0 ? (
                    <ul className="space-y-1 text-xs leading-relaxed text-zinc-800">
                      {s.lastChange.lines.map((l, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-zinc-400" aria-hidden />
                          <span className="min-w-0 break-words">{l}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-zinc-500">No visible change.</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-400">No action since the scenario was loaded.</p>
              )}
            </Section>

            <Section title="Workspace and Credits">
              {s.workspace ? (
                <KV
                  rows={[
                    ["Scenario", s.scenario === "established" ? "Established workspace" : "New user"],
                    ["Simulated date", formatWeekdayDate(s.clock.today)],
                    ["Workspace", s.workspace.name],
                    ["Plan", s.workspace.plan === "paid" ? "Paid" : "Free trial"],
                    ["Credits", formatCredits(s.workspace.credits)],
                    ["Auto top-up", s.workspace.autoTopUp.enabled ? `On: ${formatCredits(s.workspace.autoTopUp.packCredits)} below ${formatCredits(s.workspace.autoTopUp.thresholdCredits)}` : "Off"],
                    ["Main Domains", s.workspace.mainDomains.join(", ")],
                    ["Free Test Run", s.workspace.freeTestRunUsedBy ? `Used by ${s.workspace.freeTestRunUsedBy}` : "Available"],
                    ["Signed in as", s.derived.currentRecruiter ? `${s.derived.currentRecruiter.name} (${s.derived.currentRecruiter.role === "owner" ? "Owner" : "Recruiter"})` : "Nobody"],
                    ["Sign-in scopes", s.session.scopes.join(", ") || "-"],
                    ["Recruiters", s.recruiters.map((r) => `${r.name}${r.status === "invited" ? " (invited)" : ""}`).join(", ")],
                  ]}
                />
              ) : (
                <KV
                  rows={[
                    ["Scenario", s.scenario === "established" ? "Established workspace" : "New user"],
                    ["Simulated date", formatWeekdayDate(s.clock.today)],
                    ["Workspace", "None yet: sign up from the landing page"],
                  ]}
                />
              )}
            </Section>

            <Section title="Niches" count={s.niches.length}>
              {(() => {
                const rows = s.niches.map((n) => ({
                  id: n.id,
                  name: nicheLabel(n),
                  cells: [
                    NICHE_STATUS_LABELS[n.status],
                    name(n.ownerId),
                    `${formatWeekdays(n.schedule.days)} ${n.schedule.time}`,
                    `${n.schedule.prospectsPerRun} / ${n.schedule.candidatesPerRun}`,
                    formatDateShort(n.lastRunOn),
                    n.testRun ? (n.testRun.status === "running" ? `Running ${Math.round(n.testRun.progress * 100)}%` : `Done${n.testRun.free ? " (free)" : ""}`) : "-",
                  ],
                }));
                const head = ["Status", "Owner", "Schedule", "Per run", "Last run", "Test Run"];
                return (
                  <>
                    {/* Below sm, one definition list per Niche: every column stays readable at 390px. */}
                    <div className="space-y-2 sm:hidden">
                      {rows.length === 0 ? <p className="text-xs text-zinc-400">No Niche yet.</p> : null}
                      {rows.map((r) => (
                        <div key={r.id} className="rounded-lg bg-zinc-50 p-3 ring-1 ring-inset ring-zinc-200">
                          <p className="mb-1.5 text-xs font-medium break-words text-zinc-900">{r.name}</p>
                          <KV rows={head.map((h, i) => [h, r.cells[i]] as [string, ReactNode])} />
                        </div>
                      ))}
                    </div>
                    <div className="hidden sm:block">
                      <Table head={["Niche", ...head]} empty="No Niche yet." rows={rows.map((r) => [<span key="n" className="font-medium">{r.name}</span>, ...r.cells])} />
                    </div>
                  </>
                );
              })()}
            </Section>

            <Section title="People and companies">
              <div className="space-y-3">
                <Counts label={`Prospects (${s.prospects.length})`} counts={PROSPECT_STATUSES.map((k) => [PROSPECT_STATUS_LABELS[k], s.derived.prospectStatusCounts[k]])} />
                <Counts label={`Candidates (${s.candidates.length})`} counts={LIFECYCLES.map((k) => [LIFECYCLE_LABELS[k], s.derived.candidateLifecycleCounts[k]])} />
                <Counts label={`Hiring Contacts (${s.hiringContacts.length})`} counts={LIFECYCLES.map((k) => [LIFECYCLE_LABELS[k], s.derived.hiringContactLifecycleCounts[k]])} />
                <p className="text-xs text-zinc-500">
                  Previews (free trial): <span className="font-semibold text-zinc-800 tabular-nums">{s.previews.length}</span> · Detected Roles: <span className="font-semibold text-zinc-800 tabular-nums">{s.detectedRoles.length}</span>
                </p>
              </div>
            </Section>

            <Section title="Claims" count={claimed.length}>
              <Table
                head={["Person", "Claimed by", "Campaign", "Since", "Lapses"]}
                empty="No Claims."
                rows={claimed.map((c) => [
                  <span key="p">
                    {c.who} <span className="text-zinc-400">({c.kind})</span>
                  </span>,
                  name(c.claim.recruiterId),
                  s.campaigns.find((x) => x.id === c.claim.campaignId)?.name ?? "-",
                  formatDateShort(c.claim.since),
                  formatDate(c.claim.expiresOn),
                ])}
              />
            </Section>

            <Section title="Campaigns" count={s.campaigns.length}>
              <Table
                head={["Campaign", "Status", "Audience", ...RECIPIENT_STATES.map((k) => RECIPIENT_STATE_LABELS[k])]}
                empty="No Campaign yet."
                rows={s.campaigns.map((c) => {
                  const rs = s.recipients.filter((r) => r.campaignId === c.id);
                  return [
                    <span key="c" className="font-medium">{c.name}</span>,
                    CAMPAIGN_STATUS_LABELS[c.status],
                    AUDIENCE_LABELS[c.audience],
                    ...RECIPIENT_STATES.map((k) => rs.filter((r) => r.state === k).length),
                  ];
                })}
              />
            </Section>

            <Section title="Sending Mailboxes" count={s.mailboxes.length}>
              <Table
                head={["Mailbox", "Status", "Ramp day", "Sent today", "Bounce rate"]}
                empty="No Sending Mailbox yet."
                rows={s.mailboxes.map((m) => [
                  // The table scrolls sideways on narrow screens: an address stays whole instead of squeezing its column.
                  <span key="m" className="whitespace-nowrap">{m.address}</span>,
                  MAILBOX_STATUS_LABELS[m.status],
                  m.status === "refused" ? "-" : m.rampDay,
                  m.status === "refused" ? "-" : `${m.sentToday} / ${m.dailyCap}`,
                  formatPercent(m.bounceRate),
                ])}
              />
              {s.derived.domainUsage.length > 0 ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Per domain today: {s.derived.domainUsage.map((d) => `${d.domain} ${d.sentToday} / ${d.cap}`).join(" · ")}
                </p>
              ) : null}
            </Section>

            <Section title="Suppression List" count={s.suppressionList.length}>
              <Table
                head={["Hash", "Kind", "Reason", "Added", "By"]}
                empty="The Suppression List is empty."
                rows={s.suppressionList.map((e) => [
                  <code key="h" className="font-mono text-[11px]">{truncateHash(e.hash)}</code>,
                  e.kind === "email" ? "Email" : "Domain",
                  SUPPRESSION_REASON_LABELS[e.reason],
                  formatDateShort(e.addedOn),
                  e.addedBy === "this_workspace" ? "This Workspace" : "Another Workspace",
                ])}
              />
            </Section>

            <Section title="Data Requests" count={s.dataRequests.length}>
              <Table
                head={["Person", "Kind", "Status", "Received", "Due"]}
                empty="No Data Request."
                rows={s.dataRequests.map((d) => [
                  d.personQuery,
                  DATA_REQUEST_KIND_LABELS[d.kind],
                  d.status === "open" ? "Open" : "Completed",
                  formatDateShort(d.receivedOn),
                  formatDate(d.dueOn),
                ])}
              />
            </Section>

            <Section title="Audit log" count={s.auditLog.length}>
              <ol className="space-y-1.5">
                {audit.map((e) => (
                  <li key={e.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 text-xs leading-relaxed">
                    <span className="text-zinc-400 tabular-nums">{formatDateShort(e.on)}</span>
                    <span className="min-w-0 break-words text-zinc-800">
                      <span className="font-medium">{e.actor}</span> {e.action}
                      {e.target ? <span className="text-zinc-500"> - {e.target}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
              {s.auditLog.length > 30 ? <p className="mt-2 text-xs text-zinc-400">Last 30 of {s.auditLog.length} events.</p> : null}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
