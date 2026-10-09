"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, CircleCheck, Download, ExternalLink, FileDown, FileText, Search, ShieldOff, Trash, UserRound } from "lucide-react";
import { addDays } from "@/lib/dates";
import { daysUntil, formatDate, formatMonthYear, formatRelative, formatTenure, plural, truncateHash } from "@/lib/format";
import {
  CONSENT_LABELS,
  CONTACT_KIND_LABELS,
  DATA_REQUEST_KIND_LABELS,
  DISMISS_REASON_LABELS,
  LIFECYCLE_LABELS,
  METHOD_LABELS,
  PROVIDER_LABELS,
  RETENTION,
  VERIFICATION_LABELS,
} from "@/lib/labels";
import type {
  ClientState,
  ConsentChoice,
  DataRequest,
  DataRequestKind,
  DismissReason,
  Language,
  Lifecycle,
  PersonExport,
  PersonKind,
  PersonRef,
  WorkHistoryEntry,
} from "@/lib/types";
import { PERSON_KIND_LABELS, personHref, personName, type useRunner } from "./shared";
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  OptionCard,
  Textarea,
  type Tone,
  cx,
} from "./ui";

type Runner = ReturnType<typeof useRunner>["run"];

type Match = { kind: PersonKind; id: string; name: string; detail: string; matchedOn: string };

interface Progress {
  search: { query: string; matches: Match[]; onSuppressionList: boolean } | null;
  exported: string[];
  /** Simulated date of the latest export. */
  exportedOn: string | null;
  deleted: { name: string; kind: PersonKind; hash: string; on: string }[];
}

const EMPTY_PROGRESS: Progress = { search: null, exported: [], exportedOn: null, deleted: [] };

const KIND_DESCRIPTIONS: Record<DataRequestKind, string> = {
  access: "Tell the person what data the Workspace holds about them and where it came from.",
  export: "Send them a copy of their data, with the Provenance of every contact value.",
  delete: "Delete their record. Only a hash stays on the Suppression List so they are never contacted again.",
};

const CHANNEL_LABELS: Record<DataRequest["channel"], string> = {
  email: "by email",
  consent_page: "from the Consent Page",
  postal: "by post",
};

const refKey = (r: PersonRef) => `${r.kind}:${r.id}`;

export function dueTone(dr: DataRequest, today: string): Tone {
  if (dr.status === "completed") return "green";
  const d = daysUntil(dr.dueOn, today);
  if (d < 0 || d <= 3) return "red";
  if (d <= 10) return "amber";
  return "neutral";
}

function dueLabel(dr: DataRequest, today: string): string {
  if (dr.status === "completed") return `Completed ${formatDate(dr.completedOn)}`;
  const d = daysUntil(dr.dueOn, today);
  if (d < 0) return `Overdue by ${plural(-d, "day")}`;
  if (d === 0) return "Due today";
  return `Due ${formatRelative(dr.dueOn, today)}`;
}

/* ------------------------------------------------------------------ */
/* Data Requests list                                                  */
/* ------------------------------------------------------------------ */

export function DataRequests({
  s,
  pending,
  run,
  expanded,
  setExpanded,
  onRecord,
}: {
  s: ClientState;
  pending: string | null;
  run: Runner;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  onRecord: () => void;
}) {
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [exportView, setExportView] = useState<{ name: string; data: PersonExport } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ dr: DataRequest | null; match: Match } | null>(null);

  const today = s.clock.today;
  const open = s.dataRequests.filter((d) => d.status === "open").sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
  const done = s.dataRequests.filter((d) => d.status === "completed").sort((a, b) => ((a.completedOn ?? "") < (b.completedOn ?? "") ? 1 : -1));
  const patch = (id: string, p: Partial<Progress>) => setProgress((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_PROGRESS), ...p } }));

  const exportPerson = async (dr: DataRequest | null, m: Match) => {
    const r = await run(`export:${m.kind}:${m.id}`, "exportPerson", { person: { kind: m.kind, id: m.id }, dataRequestId: dr?.id }, () => null);
    if (!r) return;
    setExportView({ name: m.name, data: r.export });
    if (dr) patch(dr.id, { exported: [...new Set([...(progress[dr.id]?.exported ?? []), refKey(m)])], exportedOn: r.export.generatedOn });
  };

  return (
    <div className="flex flex-col gap-4">
      {s.dataRequests.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="No Data Requests"
            description={`When someone asks to access, export or delete their data, record it here. It is due within ${RETENTION.dataRequestDueDays} days.`}
            action={
              <Button variant="primary" onClick={onRecord}>
                Record a Data Request
              </Button>
            }
          />
        </Card>
      ) : null}

      {open.map((dr) => (
        <RequestCard
          key={dr.id}
          s={s}
          dr={dr}
          expanded={expanded === dr.id}
          onToggle={() => setExpanded(expanded === dr.id ? null : dr.id)}
        >
          <RequestWorkflow
            s={s}
            dr={dr}
            progress={progress[dr.id] ?? EMPTY_PROGRESS}
            pending={pending}
            onSearch={async (query) => {
              const r = await run(`find:${dr.id}`, "findPerson", { query }, () => null);
              if (r) patch(dr.id, { search: { query, matches: r.matches, onSuppressionList: r.onSuppressionList } });
            }}
            onExport={(m) => void exportPerson(dr, m)}
            onDelete={(m) => setConfirmDelete({ dr, match: m })}
            onResolve={(resolution) =>
              run(`resolve:${dr.id}`, "resolveDataRequest", { dataRequestId: dr.id, resolution }, () => `Data Request from ${dr.personQuery} completed ${daysUntil(dr.dueOn, today) >= 0 ? "on time" : "late"}.`)
            }
          />
        </RequestCard>
      ))}

      {done.length > 0 ? (
        <div className="mt-2 flex flex-col gap-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Completed</h3>
          {done.map((dr) => (
            <RequestCard key={dr.id} s={s} dr={dr} expanded={expanded === dr.id} onToggle={() => setExpanded(expanded === dr.id ? null : dr.id)}>
              <div className="flex gap-3 text-sm leading-6 text-zinc-700">
                <CircleCheck className="mt-1 size-4 shrink-0 text-emerald-600" aria-hidden />
                <p>{dr.resolution ?? "Completed."}</p>
              </div>
            </RequestCard>
          ))}
        </div>
      ) : null}

      <ExportDialog s={s} view={exportView} onClose={() => setExportView(null)} />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        size="sm"
        title={confirmDelete ? `Delete ${confirmDelete.match.name}?` : "Delete"}
        description={confirmDelete ? `${PERSON_KIND_LABELS[confirmDelete.match.kind]} record - ${confirmDelete.match.detail}` : undefined}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              icon={Trash}
              loading={confirmDelete !== null && pending === `delete:${confirmDelete.match.kind}:${confirmDelete.match.id}`}
              onClick={async () => {
                if (!confirmDelete) return;
                const { dr, match } = confirmDelete;
                const r = await run(`delete:${match.kind}:${match.id}`, "deletePerson", { person: { kind: match.kind, id: match.id }, dataRequestId: dr?.id }, (res) => ({
                  tone: "success",
                  text: `${match.name} deleted. Only ${truncateHash(res.hash)} stays on the Suppression List.`,
                }));
                if (!r) return;
                if (dr) {
                  const p = progress[dr.id] ?? EMPTY_PROGRESS;
                  patch(dr.id, {
                    deleted: [...p.deleted, { name: match.name, kind: match.kind, hash: r.hash, on: s.clock.today }],
                    search: p.search ? { ...p.search, matches: p.search.matches.filter((x) => !(x.kind === match.kind && x.id === match.id)) } : null,
                  });
                }
                setConfirmDelete(null);
              }}
            >
              Delete and keep the hash
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm leading-6 text-zinc-700">
          <div>
            <p className="font-medium text-zinc-900">Deleted</p>
            <p>Profile, contact values and their Provenance, Signals, messages and Campaign membership.</p>
          </div>
          <div>
            <p className="font-medium text-zinc-900">Kept</p>
            <p>A hash of their email on the Suppression List, so no Workspace ever contacts them again. The audit log keeps that the deletion happened.</p>
          </div>
          {confirmDelete?.match.kind === "candidate" ? (
            <p className="text-xs text-zinc-500">A Hiring Contact record for the same person, if any, is separate and must be handled on its own.</p>
          ) : (
            <p className="text-xs text-zinc-500">A Candidate record for the same person, if any, is separate and must be handled on its own.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function RequestCard({ s, dr, expanded, onToggle, children }: { s: ClientState; dr: DataRequest; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  const today = s.clock.today;
  const tone = dueTone(dr, today);
  return (
    <section className={cx("min-w-0 rounded-xl border bg-white shadow-xs", expanded ? "border-zinc-300" : "border-zinc-200")}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className={cx("flex w-full min-w-0 items-start gap-3 px-4 py-3.5 text-left hover:bg-zinc-50/60 sm:px-5", expanded ? "rounded-t-xl" : "rounded-xl")}>
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500">
          <UserRound className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-900">{dr.personQuery}</span>
            <Badge tone={dr.kind === "delete" ? "red" : "neutral"}>{DATA_REQUEST_KIND_LABELS[dr.kind]}</Badge>
          </span>
          <span className="mt-0.5 block truncate text-xs text-zinc-500">
            Received {formatDate(dr.receivedOn)} {CHANNEL_LABELS[dr.channel]}
            {dr.requesterEmail ? ` - ${dr.requesterEmail}` : ""}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={tone}>{dueLabel(dr, today)}</Badge>
          {dr.status === "open" ? <span className="text-xs tabular-nums text-zinc-500">{formatDate(dr.dueOn)}</span> : null}
        </span>
        <ChevronDown className={cx("mt-1.5 size-4 shrink-0 text-zinc-400 transition-transform", expanded && "rotate-180")} aria-hidden />
      </button>
      {expanded ? <div className="border-t border-zinc-100 px-4 py-4 sm:px-5">{children}</div> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Workflow: find, export, delete, resolve                             */
/* ------------------------------------------------------------------ */

function RequestWorkflow({
  s,
  dr,
  progress,
  pending,
  onSearch,
  onExport,
  onDelete,
  onResolve,
}: {
  s: ClientState;
  dr: DataRequest;
  progress: Progress;
  pending: string | null;
  onSearch: (query: string) => Promise<void>;
  onExport: (m: Match) => void;
  onDelete: (m: Match) => void;
  onResolve: (resolution: string) => Promise<unknown>;
}) {
  const [query, setQuery] = useState(dr.personQuery);
  const linked: Match[] = dr.matches
    .map((m) => {
      const name = personName(s, m.kind, m.id);
      if (!name) return null;
      const detail =
        m.kind === "candidate"
          ? (() => {
              const c = s.candidates.find((x) => x.id === m.id)!;
              return `${c.currentTitle} at ${c.currentEmployer}`;
            })()
          : (() => {
              const h = s.hiringContacts.find((x) => x.id === m.id)!;
              return `${h.title} at ${s.prospects.find((p) => p.id === h.prospectId)?.name ?? "a Prospect"}`;
            })();
      return { kind: m.kind, id: m.id, name, detail, matchedOn: "Linked when the request was received" };
    })
    .filter((m): m is Match => m !== null);
  const matches = progress.search ? progress.search.matches.map((m) => ({ ...m, matchedOn: `Matched on ${m.matchedOn}` })) : linked;
  const candidates = matches.filter((m) => m.kind === "candidate");
  const contacts = matches.filter((m) => m.kind === "hiring_contact");
  const searched = progress.search !== null;

  const suggestion = suggestResolution(dr, s, progress);
  const [resolution, setResolution] = useState<string | null>(null);
  const text = resolution ?? suggestion;

  return (
    <ol className="space-y-6">
      <WorkflowStep n={1} title="Find the person" done={searched || linked.length > 0}>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) void onSearch(query.trim());
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-zinc-400" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" aria-label="Name or email to search" placeholder="Name or email" />
          </div>
          <Button type="submit" icon={Search} loading={pending === `find:${dr.id}`} disabled={!query.trim()}>
            Search Candidates and Hiring Contacts
          </Button>
        </form>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Searched separately. A Candidate and a Hiring Contact are never linked, even when they are the same person, so each record is answered on its own. The search is recorded in the
          audit log.
        </p>
        {progress.search?.onSuppressionList ? (
          <Callout tone="info" icon={ShieldOff} className="mt-3">
            This person is already on the Suppression List: nobody can contact them again.
          </Callout>
        ) : null}
        {searched || linked.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <MatchGroup title="Candidates" singular="Candidate" matches={candidates} s={s} pending={pending} exported={progress.exported} onExport={onExport} onDelete={onDelete} />
            <MatchGroup title="Hiring Contacts" singular="Hiring Contact" matches={contacts} s={s} pending={pending} exported={progress.exported} onExport={onExport} onDelete={onDelete} />
          </div>
        ) : null}
      </WorkflowStep>

      <WorkflowStep n={2} title={dr.kind === "delete" ? "Delete, keeping only the hash" : "Export with Provenance"} done={progress.exported.length > 0 || progress.deleted.length > 0}>
        <p className="text-sm leading-6 text-zinc-600">{KIND_DESCRIPTIONS[dr.kind]}</p>
        {progress.deleted.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {progress.deleted.map((d) => (
              <li key={d.hash} className="flex flex-wrap items-center gap-2 text-sm">
                <CircleCheck className="size-4 text-emerald-600" aria-hidden />
                <span className="text-zinc-800">
                  {d.name} ({PERSON_KIND_LABELS[d.kind]}) deleted
                </span>
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-600">{truncateHash(d.hash)}</code>
                <span className="text-xs text-zinc-500">kept on the Suppression List</span>
              </li>
            ))}
          </ul>
        ) : null}
        {progress.exported.length > 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-zinc-800">
            <CircleCheck className="size-4 text-emerald-600" aria-hidden />
            {plural(progress.exported.length, "export")} generated with Provenance.
          </p>
        ) : null}
      </WorkflowStep>

      <WorkflowStep n={3} title="Answer and complete" done={false} last>
        <Field label={dr.requesterEmail ? `Resolution, sent to ${dr.requesterEmail}` : "Resolution"} hint={`Due ${formatDate(dr.dueOn)}, one month after it was received.`}>
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              value={text}
              onChange={(e) => setResolution(e.target.value)}
              placeholder={`What you answered, for example: Sent ${dr.personQuery} an export of their data with Provenance on ${formatDate(s.clock.today)}.`}
            />
          )}
        </Field>
        <div className="mt-3 flex justify-end">
          <Button
            variant="primary"
            icon={CircleCheck}
            disabled={!text.trim()}
            loading={pending === `resolve:${dr.id}`}
            onClick={() => void onResolve(text.trim())}
          >
            Mark as completed
          </Button>
        </div>
      </WorkflowStep>
    </ol>
  );
}

/** "the Candidate record", "2 Candidate records", "the Candidate and Hiring Contact records". */
function deletedRecords(deleted: Progress["deleted"]): string {
  const kinds = [...new Set(deleted.map((d) => PERSON_KIND_LABELS[d.kind]))];
  if (deleted.length === 1) return `the ${kinds[0]} record`;
  if (kinds.length === 1) return `${deleted.length} ${kinds[0]} records`;
  return `the ${kinds.join(" and ")} records`;
}

/** The prefilled answer, combining everything done for this request (export, then deletion). */
function suggestResolution(dr: DataRequest, s: ClientState, p: Progress): string {
  const today = formatDate(s.clock.today);
  const exportedOn = formatDate(p.exportedOn ?? s.clock.today);
  // An access request is answered with the same export: a copy of the data, with its Provenance.
  const sent = p.exported.length > 0 ? `Sent ${dr.personQuery} an export of their data with Provenance on ${exportedOn}` : null;
  if (p.deleted.length > 0) {
    const records = deletedRecords(p.deleted);
    const hashes = new Set(p.deleted.map((d) => d.hash)).size > 1 ? "only the hashes stay" : "only the hash stays";
    if (sent) return `${sent}, then deleted ${records}; ${hashes} on the Suppression List.`;
    const deletedOn = formatDate(p.deleted[p.deleted.length - 1].on);
    return `Deleted ${records} on ${deletedOn}; ${hashes} on the Suppression List, so ${dr.personQuery} is never contacted again.`;
  }
  if (sent) return `${sent}.`;
  if (p.search && p.search.matches.length === 0) {
    return `No Candidate or Hiring Contact record matches ${dr.personQuery}. Answered on ${today} that the Workspace holds no data about them.`;
  }
  return "";
}

function WorkflowStep({ n, title, done, last = false, children }: { n: number; title: string; done: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-3">
      {!last ? <span className="absolute bottom-[-20px] left-3 top-8 w-px bg-zinc-200" aria-hidden /> : null}
      <span
        className={cx(
          "relative flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
          done ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
        )}
      >
        {done ? <CircleCheck className="size-3.5" aria-hidden /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}

function MatchGroup({
  title,
  singular,
  matches,
  s,
  pending,
  exported,
  onExport,
  onDelete,
}: {
  title: string;
  singular: string;
  matches: Match[];
  s: ClientState;
  pending: string | null;
  exported: string[];
  onExport: (m: Match) => void;
  onDelete: (m: Match) => void;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200">
      <p className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/60 px-3 py-2 text-xs font-medium text-zinc-600">
        {title}
        <span className="tabular-nums text-zinc-400">{matches.length}</span>
      </p>
      {matches.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-zinc-500">No {singular} record matches.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {matches.map((m) => {
            const href = personHref(m.kind, m.id, s);
            const wasExported = exported.includes(refKey(m));
            return (
              <li key={refKey(m)} className="px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  {href ? (
                    <Link href={href} className="truncate text-sm font-medium text-zinc-900 hover:text-indigo-600">
                      {m.name}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium text-zinc-900">{m.name}</span>
                  )}
                  {wasExported ? <Badge tone="green">Exported</Badge> : null}
                </div>
                <p className="truncate text-xs text-zinc-500">{m.detail}</p>
                <p className="truncate text-[11px] text-zinc-400">{m.matchedOn}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" icon={FileDown} loading={pending === `export:${m.kind}:${m.id}`} onClick={() => onExport(m)}>
                    Export with Provenance
                  </Button>
                  <Button size="sm" variant="danger-ghost" icon={Trash} onClick={() => onDelete(m)}>
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Export viewer                                                       */
/* ------------------------------------------------------------------ */

function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

const LANGUAGE_NAMES: Record<Language, string> = { fr: "French", en: "English" };

type FieldValue = string | string[] | null;

interface ExportField {
  label: string;
  /** Turns the stored value into what the person reads; null hides the row. */
  format?: (v: unknown, s: ClientState) => FieldValue;
  /** Shown when the value is empty; without it, empty rows are hidden. */
  empty?: string;
  link?: boolean;
}

const date = (v: unknown) => (typeof v === "string" && v ? formatDate(v) : null);

/**
 * The personal data of an export, in the glossary's words and in reading order. Internal ids and
 * scoring internals are not personal data the person can read: they stay in the JSON download only.
 * `null` hides a field.
 */
const EXPORT_FIELDS: Record<string, ExportField | null> = {
  name: { label: "Name" },
  headline: { label: "Headline" },
  title: { label: "Title" },
  currentTitle: { label: "Current title" },
  currentEmployer: { label: "Current employer" },
  prospectId: { label: "Prospect", format: (v, s) => s.prospects.find((p) => p.id === v)?.name ?? null },
  rank: { label: "Rank among the Prospect's Hiring Contacts", format: (v) => (typeof v === "number" ? `${v}` : null) },
  seniority: { label: "Seniority" },
  location: { label: "Location" },
  language: { label: "Emails in", format: (v) => LANGUAGE_NAMES[v as Language] ?? null },
  tenureMonths: { label: "Time in current role", format: (v) => (typeof v === "number" ? formatTenure(v) : null) },
  yearsExperience: { label: "Years of experience" },
  skills: { label: "Skills", format: (v) => (Array.isArray(v) && v.length > 0 ? v.join(", ") : null) },
  workHistory: {
    label: "Work history",
    format: (v) =>
      Array.isArray(v) && v.length > 0
        ? (v as WorkHistoryEntry[]).map((w) => `${w.title} at ${w.employer}, ${formatMonthYear(w.from)} - ${w.to ? formatMonthYear(w.to) : "now"}`)
        : null,
  },
  signalStrength: { label: "Signal Strength" },
  lifecycle: { label: "Lifecycle", format: (v) => LIFECYCLE_LABELS[v as Lifecycle] ?? null },
  surfacedOn: { label: "Surfaced on", format: date },
  deleteOn: { label: "Deleted on, unless Contacted", format: date },
  forDetectedRoleId: {
    label: "Sourced for the Detected Role",
    format: (v, s) => {
      const role = s.detectedRoles.find((r) => r.id === v);
      if (!role) return null;
      const prospect = s.prospects.find((p) => p.id === role.prospectId);
      return prospect ? `${role.title} at ${prospect.name}` : role.title;
    },
  },
  consent: { label: "Consent", format: (v) => CONSENT_LABELS[v as ConsentChoice] ?? null, empty: "None recorded" },
  consentRecordedOn: { label: "Consent recorded on", format: date },
  retainUntil: { label: "Kept until", format: date },
  article14NoticeSentOn: { label: "Article 14 Notice sent on", format: date, empty: "Not sent yet" },
  origin: { label: "Found by", format: (v) => (v === "referral" ? "A Referral reply" : v === "agent" ? "The Prospection Agent" : null) },
  profileUrl: { label: "Profile URL", link: true },
  dismissReason: { label: "Dismissed because", format: (v) => DISMISS_REASON_LABELS[v as DismissReason] ?? null },
  dismissNote: { label: "Dismiss note" },
  // Internal: ids, flags and scoring details (Fit, Signals and contact values have their own sections).
  id: null,
  nicheIds: null,
  breakdown: null,
  fit: null,
  signals: null,
  contactValues: null,
  claim: null,
  proposed: null,
  referredByReplyId: null,
};

function exportRows(person: Record<string, unknown>, s: ClientState): { key: string; label: string; value: string | string[]; link: boolean }[] {
  const known = Object.keys(EXPORT_FIELDS).filter((k) => k in person);
  // A field the backend adds later still shows, unless it looks like an internal id.
  const extra = Object.keys(person).filter((k) => !(k in EXPORT_FIELDS) && !/(Id|Ids)$/.test(k));
  const rows: { key: string; label: string; value: string | string[]; link: boolean }[] = [];
  for (const key of [...known, ...extra]) {
    const spec: ExportField | null = key in EXPORT_FIELDS ? EXPORT_FIELDS[key] : { label: humanize(key) };
    if (!spec) continue;
    const raw = person[key];
    const empty = raw === null || raw === undefined || raw === "";
    const value: FieldValue = empty ? null : spec.format ? spec.format(raw, s) : renderValue(raw);
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      if (spec.empty) rows.push({ key, label: spec.label, value: spec.empty, link: false });
      continue;
    }
    rows.push({ key, label: spec.label, value, link: Boolean(spec.link) && typeof value === "string" });
  }
  return rows;
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v) : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "-";
    return v.map((x) => (x !== null && typeof x === "object" ? Object.values(x as Record<string, unknown>).filter((y) => typeof y === "string" || typeof y === "number").map((y) => renderValue(y)).join(", ") : renderValue(x))).join(" | ");
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, y]) => typeof y !== "object" || y === null)
      .map(([k, y]) => `${humanize(k)}: ${renderValue(y)}`)
      .join(", ");
  }
  return String(v);
}

function ExportDialog({ s, view, onClose }: { s: ClientState; view: { name: string; data: PersonExport } | null; onClose: () => void }) {
  if (!view) return null;
  const exp = view.data;
  const personRows = exportRows(exp.person, s);
  const download = () => {
    const blob = new Blob([JSON.stringify(exp, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${view.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")}-${exp.generatedOn}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking right away can cancel the download in some browsers: give it a moment to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Export for ${view.name}`}
      description={`Generated ${formatDate(exp.generatedOn)} by ${exp.controller}`}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={Download} onClick={download}>
            Download JSON
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <ExportSection title="Personal data">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {personRows.map((row) => (
              <div key={row.key} className={cx("min-w-0", Array.isArray(row.value) && "sm:col-span-2")}>
                <dt className="text-xs text-zinc-500">{row.label}</dt>
                <dd className="break-words text-sm text-zinc-800">
                  {Array.isArray(row.value) ? (
                    <ul className="space-y-0.5">
                      {row.value.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  ) : row.link ? (
                    <a href={row.value} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 break-all text-indigo-600 hover:text-indigo-500">
                      {row.value}
                      <ExternalLink className="size-3 shrink-0" aria-hidden />
                    </a>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </ExportSection>

        <ExportSection title="Contact values and their Provenance" count={exp.contactValues.length}>
          {exp.contactValues.length === 0 ? (
            <p className="text-sm text-zinc-500">No contact values held: this person was never Enriched.</p>
          ) : (
            <ul className="space-y-2">
              {exp.contactValues.map((cv) => (
                <li key={cv.id} className="rounded-lg border border-zinc-200 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-zinc-500">{CONTACT_KIND_LABELS[cv.kind]}</span>
                    <span className="[overflow-wrap:anywhere] font-mono text-sm text-zinc-900">{cv.value}</span>
                    <Badge tone={cv.verification === "valid" ? "green" : cv.verification === "invalid" ? "red" : "amber"}>{VERIFICATION_LABELS[cv.verification]}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-zinc-600">
                    {PROVIDER_LABELS[cv.provenance.provider]} - {METHOD_LABELS[cv.provenance.method]} - found {formatDate(cv.provenance.foundOn)} -{" "}
                    <a href={cv.provenance.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 break-all text-indigo-600 hover:text-indigo-500">
                      {cv.provenance.sourceUrl}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ExportSection>

        <ExportSection title="Signals" count={exp.signals.length}>
          {exp.signals.length === 0 ? (
            <p className="text-sm text-zinc-500">No Signals.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {exp.signals.map((sg) => (
                <li key={sg.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-3">
                  <span className="w-24 shrink-0 text-xs tabular-nums text-zinc-500">{formatDate(sg.date)}</span>
                  <span className="min-w-0 flex-1 text-zinc-800">{sg.label}</span>
                  <a href={sg.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-0.5 text-xs text-indigo-600 hover:text-indigo-500">
                    {sg.source}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </ExportSection>

        <ExportSection title="Campaigns and emails" count={exp.campaigns.length}>
          {exp.campaigns.length === 0 ? (
            <p className="text-sm text-zinc-500">Never contacted.</p>
          ) : (
            <ul className="space-y-2">
              {exp.campaigns.map((c, i) => (
                <li key={i} className="rounded-lg border border-zinc-200 px-3 py-2">
                  <p className="text-sm font-medium text-zinc-900">{c.campaign}</p>
                  <ul className="mt-1 space-y-0.5">
                    {c.messages.map((m, j) => (
                      <li key={j} className="flex gap-3 text-xs text-zinc-600">
                        <span className="w-24 shrink-0 tabular-nums text-zinc-500">{m.sentOn ? formatDate(m.sentOn) : "Not sent"}</span>
                        <span className="min-w-0 truncate">{m.subject}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </ExportSection>

        <ExportSection title="Audit trail" count={exp.auditTrail.length}>
          {exp.auditTrail.length === 0 ? (
            <p className="text-sm text-zinc-500">No events.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {exp.auditTrail.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 px-3 py-2 text-xs sm:flex-row sm:gap-3">
                  <span className="w-24 shrink-0 tabular-nums text-zinc-500">{formatDate(e.on)}</span>
                  <span className="shrink-0 font-medium text-zinc-700">{e.actor}</span>
                  <span className="min-w-0 text-zinc-600">{e.action}</span>
                </li>
              ))}
            </ul>
          )}
        </ExportSection>
      </div>
    </Modal>
  );
}

function ExportSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
        {count !== undefined ? <span className="rounded-full bg-zinc-100 px-1.5 py-px font-medium normal-case tabular-nums text-zinc-600">{count}</span> : null}
      </h3>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Record a Data Request                                               */
/* ------------------------------------------------------------------ */

export function RecordRequestDialog({
  open,
  s,
  initialPerson,
  initialKind,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  s: ClientState;
  initialPerson: string;
  initialKind: DataRequestKind;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: { personQuery: string; kind: DataRequestKind; requesterEmail?: string }) => Promise<boolean>;
}) {
  if (!open) return null;
  return <RecordRequestInner s={s} initialPerson={initialPerson} initialKind={initialKind} busy={busy} onClose={onClose} onSubmit={onSubmit} />;
}

function RecordRequestInner({
  s,
  initialPerson,
  initialKind,
  busy,
  onClose,
  onSubmit,
}: {
  s: ClientState;
  initialPerson: string;
  initialKind: DataRequestKind;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: { personQuery: string; kind: DataRequestKind; requesterEmail?: string }) => Promise<boolean>;
}) {
  const [person, setPerson] = useState(initialPerson);
  const [kind, setKind] = useState<DataRequestKind>(initialKind);
  const [email, setEmail] = useState("");
  const due = addDays(s.clock.today, RETENTION.dataRequestDueDays);
  return (
    <Modal
      open
      onClose={onClose}
      title="Record a Data Request"
      description={`Received today, ${formatDate(s.clock.today)}. Due within one month: ${formatDate(due)}.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={person.trim().length < 2}
            loading={busy}
            onClick={async () => {
              const ok = await onSubmit({ personQuery: person.trim(), kind, requesterEmail: email.trim() || undefined });
              if (ok) onClose();
            }}
          >
            Record request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Person" hint="Name or email, as given in the request.">
            {(id) => <Input id={id} value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Full name or email" autoComplete="off" />}
          </Field>
          <Field label="Reply to (optional)" hint="Where the answer is sent.">
            {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.eu" autoComplete="off" />}
          </Field>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-700">They ask to</p>
          <div className="mt-1.5 grid gap-2">
            {(["access", "export", "delete"] as const).map((k) => (
              <OptionCard key={k} selected={kind === k} onSelect={() => setKind(k)} title={DATA_REQUEST_KIND_LABELS[k]} description={KIND_DESCRIPTIONS[k]} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
