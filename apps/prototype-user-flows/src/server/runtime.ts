// The single in-memory state of the dummy backend, kept on globalThis so it survives hot reloads
// and is shared by every route handler bundle in the same Node process.

import type { AppState } from "@/lib/types";

export interface Holder {
  state: AppState;
  idSeq: number;
  auditSeq: number;
  /**
   * Server-only generation seeds behind each Preview, so a person revealed after buying Credits
   * matches the Preview that was shown. Never sent to the client.
   */
  previewSeeds: Record<string, unknown>;
}

type GlobalWithStore = typeof globalThis & { __autoRecruitPrototype?: Holder };

export function peekHolder(): Holder | undefined {
  return (globalThis as GlobalWithStore).__autoRecruitPrototype;
}

export function setHolder(holder: Holder): void {
  (globalThis as GlobalWithStore).__autoRecruitPrototype = holder;
}

export function holder(): Holder {
  const h = peekHolder();
  if (!h) throw new Error("Store not initialised");
  return h;
}

/** Short deterministic ids: "<prefix>_<base36 counter>". */
export function newId(prefix: string): string {
  const h = holder();
  h.idSeq += 1;
  return `${prefix}_${h.idSeq.toString(36)}`;
}

export function nextAuditSeq(): number {
  const h = holder();
  h.auditSeq += 1;
  return h.auditSeq;
}
