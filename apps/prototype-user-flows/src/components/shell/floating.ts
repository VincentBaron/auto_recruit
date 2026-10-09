"use client";

// Which prototype overlay is open at the bottom of the screen (the simulator menu or its result card),
// so the variant switcher steps aside on small screens instead of piling up under it.

import { useSyncExternalStore } from "react";

let overlayOpen = false;
const listeners = new Set<() => void>();

export function setSimulatorOverlayOpen(open: boolean): void {
  if (overlayOpen === open) return;
  overlayOpen = open;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** False on the server and on the first client render (no overlay is open before any interaction). */
export function useSimulatorOverlayOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => overlayOpen,
    () => false,
  );
}
