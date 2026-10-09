// The dummy backend's single entry point: the in-memory state (on globalThis, see runtime.ts), the
// GET snapshot with derived values, and every action run atomically: a failed action leaves the
// state exactly as it was, and a successful one records "What changed" for the State drawer.

import { formatCredits, formatDelta, formatWeekdayDate } from "@/lib/format";
import { LIFECYCLE_LABELS, PROSPECT_STATUS_LABELS } from "@/lib/labels";
import type { ActionName, ActionPayload, ActResponse, AppState, ClientState, Lifecycle, ProspectStatus } from "@/lib/types";
import { handlers, isActionName, PURE_ACTIONS } from "./actions";
import { toClientState } from "./derive";
import type { Ctx, Handler } from "./handler-types";
import { ActionError } from "./helpers";
import { type Holder, peekHolder, setHolder } from "./runtime";
import { DEFAULT_SCENARIO, freshScenario } from "./scenario";
import { emptyState } from "./seed";
import { tick } from "./sim";

function getHolder(): Holder {
  const existing = peekHolder();
  if (existing) return existing;
  const h: Holder = { state: emptyState(DEFAULT_SCENARIO), idSeq: 0, auditSeq: 0, previewSeeds: {} };
  setHolder(h);
  h.state = freshScenario(DEFAULT_SCENARIO, 0);
  return h;
}

/** Full state for GET /api/state, after advancing the wall-clock animations (Test Runs, jobs, setups). */
export function readClientState(nowMs: number): ClientState {
  const h = getHolder();
  if (tick(h.state, nowMs)) h.state.version += 1;
  return toClientState(h.state);
}

/* ------------------------------------------------------------------ */
/* Change summary ("What changed" in the State drawer)                 */
/* ------------------------------------------------------------------ */

const COUNTED: [keyof AppState, string][] = [
  ["niches", "Niches"],
  ["prospects", "Prospects"],
  ["hiringContacts", "Hiring Contacts"],
  ["candidates", "Candidates"],
  ["previews", "Previews"],
  ["campaigns", "Campaigns"],
  ["recipients", "Recipients"],
  ["replies", "Replies"],
  ["mailboxes", "Sending Mailboxes"],
  ["suppressionList", "Suppression List entries"],
  ["dataRequests", "Data Requests"],
  ["apiKeys", "API Keys"],
  ["voiceProfiles", "Voice Profiles"],
  ["recruiters", "Recruiters"],
];

function countBy<T extends string>(items: { [k: string]: unknown }[], key: string): Map<T, number> {
  const m = new Map<T, number>();
  for (const it of items) m.set(it[key] as T, (m.get(it[key] as T) ?? 0) + 1);
  return m;
}

function diffCounts<T extends string>(label: string, before: Map<T, number>, after: Map<T, number>, labels: Record<T, string>): string[] {
  const keys = new Set<T>([...before.keys(), ...after.keys()]);
  const out: string[] = [];
  for (const k of keys) {
    const b = before.get(k) ?? 0;
    const a = after.get(k) ?? 0;
    if (a !== b) out.push(`${label} ${labels[k] ?? k}: ${b} to ${a}`);
  }
  return out;
}

function summarise(before: AppState, after: AppState): string[] {
  const lines: string[] = [];
  if (before.clock.today !== after.clock.today) lines.push(`Simulated date: ${formatWeekdayDate(before.clock.today)} to ${formatWeekdayDate(after.clock.today)}`);
  const bc = before.workspace?.credits ?? 0;
  const ac = after.workspace?.credits ?? 0;
  if (after.workspace && bc !== ac) lines.push(`Credits: ${formatCredits(bc)} to ${formatCredits(ac)} (${formatDelta(ac - bc)})`);
  if (after.workspace && before.workspace?.plan !== after.workspace.plan) lines.push(`Plan: ${after.workspace.plan === "paid" ? "paid" : "free trial"}`);
  for (const [key, label] of COUNTED) {
    const b = (before[key] as unknown[]).length;
    const a = (after[key] as unknown[]).length;
    if (a !== b) lines.push(`${label}: ${b} to ${a}`);
  }
  lines.push(
    ...diffCounts<Lifecycle>("Candidates", countBy(before.candidates as never, "lifecycle"), countBy(after.candidates as never, "lifecycle"), LIFECYCLE_LABELS),
    ...diffCounts<Lifecycle>("Hiring Contacts", countBy(before.hiringContacts as never, "lifecycle"), countBy(after.hiringContacts as never, "lifecycle"), LIFECYCLE_LABELS),
    ...diffCounts<ProspectStatus>("Prospects", countBy(before.prospects as never, "status"), countBy(after.prospects as never, "status"), PROSPECT_STATUS_LABELS),
  );
  const lastSeq = before.auditLog.reduce((max, e) => Math.max(max, e.seq), 0);
  const events = after.auditLog.filter((e) => e.seq > lastSeq);
  for (const e of events.slice(-12)) lines.push(`Audit: ${e.actor} - ${e.action}${e.target ? ` (${e.target})` : ""}`);
  if (events.length > 12) lines.push(`Audit: ${events.length - 12} more events`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export interface ActionOutcome {
  status: number;
  body: ActResponse<ActionName>;
}

/** Puts every top-level field of `snapshot` back into `target`, keeping the object identity. */
function restoreInPlace(target: AppState, snapshot: AppState): void {
  Object.assign(target, snapshot);
}

export function runAction(name: string, payload: unknown, nowMs: number): ActionOutcome {
  const h = getHolder();
  if (!isActionName(name)) return { status: 404, body: { ok: false, error: `Unknown action "${name}".` } };
  // Animations first, so an action sees a Test Run that finished a second ago.
  tick(h.state, nowMs);

  const before = structuredClone(h.state);
  const counters = { idSeq: h.idSeq, auditSeq: h.auditSeq, previewSeeds: { ...h.previewSeeds } };
  const restore = () => {
    h.state = before;
    h.idSeq = counters.idSeq;
    h.auditSeq = counters.auditSeq;
    h.previewSeeds = counters.previewSeeds;
  };
  const notes: string[] = [];
  const initial = h.state;
  let current = initial;

  const ctx: Ctx = {
    nowMs,
    note: (line) => notes.push(line),
    replaceState: (next) => {
      h.state = next;
      current = next;
      return next;
    },
    dispatch: (nested, nestedPayload) => {
      if (!isActionName(nested)) throw new ActionError(`Unknown action "${nested}".`);
      const snapshot = structuredClone(current);
      const nestedCounters = { idSeq: h.idSeq, auditSeq: h.auditSeq, previewSeeds: { ...h.previewSeeds } };
      try {
        return (handlers[nested] as Handler<typeof nested>)(current, nestedPayload, ctx);
      } catch (e) {
        restoreInPlace(current, snapshot);
        h.idSeq = nestedCounters.idSeq;
        h.auditSeq = nestedCounters.auditSeq;
        h.previewSeeds = nestedCounters.previewSeeds;
        throw e;
      }
    },
  };

  try {
    const handler = handlers[name] as Handler<ActionName>;
    const result = handler(current, (payload ?? {}) as ActionPayload<ActionName>, ctx);
    // Serialise now: the result may point into the state.
    const plainResult = JSON.parse(JSON.stringify(result ?? {}));
    if (PURE_ACTIONS.has(name)) {
      restore();
      return { status: 200, body: { ok: true, result: plainResult, changes: [] } };
    }
    const after = h.state;
    after.version = Math.max(after.version, before.version + 1);
    const replaced = after !== initial;
    const changes = [...notes, ...(replaced ? [] : summarise(before, after))].slice(0, 80);
    after.lastChange = { action: name, seq: after.version, on: after.clock.today, lines: changes };
    return { status: 200, body: { ok: true, result: plainResult, changes } };
  } catch (e) {
    restore();
    if (e instanceof ActionError) return { status: 422, body: { ok: false, error: e.message } };
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[dummy backend] action ${name} crashed:`, e);
    return { status: 500, body: { ok: false, error: `The dummy backend failed on "${name}": ${message}` } };
  }
}
