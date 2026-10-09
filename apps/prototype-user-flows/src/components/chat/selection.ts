// A tiny shared store for "what is selected right now", so the Ask panel can act on "these"
// (for example "enrich these 5" after ticking five Candidates in the Feed).
// Screens with a multi-select call `setChatSelection` whenever their selection changes,
// and `clearChatSelection` when they unmount.

import { useSyncExternalStore } from "react";
import type { FeedItemRef } from "@/lib/types";

const EMPTY: FeedItemRef[] = [];

let current: FeedItemRef[] = EMPTY;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function sameItems(a: FeedItemRef[], b: FeedItemRef[]): boolean {
  return a.length === b.length && a.every((item, i) => item.kind === b[i].kind && item.id === b[i].id);
}

/** Publishes the current multi-select (Feed rows, Test Run items...) to the Ask panel. */
export function setChatSelection(items: FeedItemRef[]): void {
  const next = items.length === 0 ? EMPTY : items.map((item) => ({ kind: item.kind, id: item.id }));
  if (sameItems(next, current)) return;
  current = next;
  emit();
}

export function clearChatSelection(): void {
  setChatSelection(EMPTY);
}

/** The published selection. Always empty during server rendering, so hydration matches. */
export function useChatSelection(): FeedItemRef[] {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => EMPTY,
  );
}
