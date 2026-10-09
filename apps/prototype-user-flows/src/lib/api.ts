"use client";

// The UI's only seam to the dummy backend (API-first, ADR-0008: no component imports the store).
// One shared store for the whole app:
// - `useAppState()` fetches /api/state after mount, refetches every 2 seconds (every 500 ms while a
//   screen asks for fast polling) and after every action, and returns null until loaded, so the
//   server render and the first client render show the same skeleton.
// - `act(name, payload)` POSTs /api/actions/<name>, never throws, and resolves once the refreshed
//   state has landed, so the caller's next render already shows the change.

import { useEffect, useSyncExternalStore } from "react";
import type { ActionName, ActionPayload, ActionResult, ActResponse, ClientState } from "@/lib/types";

const POLL_MS = 2000;
const FAST_POLL_MS = 500;

interface Snapshot {
  state: ClientState | null;
  error: string | null;
}

const SERVER_SNAPSHOT: Snapshot = { state: null, error: null };

let snapshot: Snapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let fastRequests = 0;
/** Request ordering: a slow poll that started before an action never overwrites the newer state. */
let requestSeq = 0;
let appliedSeq = 0;

function emit(next: Snapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

async function load(): Promise<void> {
  const seq = ++requestSeq;
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) throw new Error(`The dummy backend answered ${res.status}.`);
    const state = (await res.json()) as ClientState;
    if (seq < appliedSeq) return;
    appliedSeq = seq;
    // Same version and no error to clear: nothing changed, keep the same snapshot (no re-render).
    if (snapshot.state && snapshot.error === null && snapshot.state.version === state.version) return;
    emit({ state, error: null });
  } catch (e) {
    if (seq < appliedSeq) return;
    appliedSeq = seq;
    const error = e instanceof Error && e.message ? e.message : "Could not reach the dummy backend.";
    if (snapshot.error !== error) emit({ state: snapshot.state, error });
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (listeners.size === 0) return;
  timer = setTimeout(
    () => {
      if (document.hidden) {
        schedule();
        return;
      }
      void load().then(schedule);
    },
    fastRequests > 0 ? FAST_POLL_MS : POLL_MS,
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    void load();
    schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => SERVER_SNAPSHOT;

/** Full state of the dummy backend, or null until the first fetch after mount. */
export function useAppState(): ClientState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).state;
}

/** Last fetch error (backend down), or null. Lets screens show an error instead of an endless skeleton. */
export function useBackendError(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).error;
}

/** Fetches the state now. Resolves once it has landed. */
export function refetch(): Promise<void> {
  return load();
}

/** Polls every 500 ms while `active` (live agent steps), then back to every 2 seconds. */
export function useFastPolling(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    fastRequests += 1;
    schedule();
    return () => {
      fastRequests -= 1;
      schedule();
    };
  }, [active]);
}

/** Runs a named action on the dummy backend, then refetches the state. Never throws. */
export async function act<K extends ActionName>(name: K, payload: ActionPayload<K>): Promise<ActResponse<K>> {
  let response: ActResponse<K>;
  try {
    const res = await fetch(`/api/actions/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; error?: string; changes?: string[] } | null;
    response =
      body && body.ok
        ? { ok: true, result: (body.result ?? {}) as ActionResult<K>, changes: body.changes ?? [] }
        : { ok: false, error: body?.error ?? `The action "${name}" failed (${res.status}).` };
  } catch {
    response = { ok: false, error: "Could not reach the dummy backend. Is the prototype server running?" };
  }
  await load();
  return response;
}
