// Loading a seed scenario into the single in-memory store, with deterministic ids from a fresh counter.

import type { AppState, ScenarioKey } from "@/lib/types";
import { holder } from "./runtime";
import { buildScenario } from "./seed";

/** Default scenario when the server starts: the richest one, so every screen has data to show. */
export const DEFAULT_SCENARIO: ScenarioKey = "established";

/**
 * Builds a scenario from scratch. Ids restart from the same counter, so a reset gives the same ids as
 * a fresh server. `version` keeps increasing so clients always see the new state.
 */
export function freshScenario(key: ScenarioKey, previousVersion: number): AppState {
  const h = holder();
  h.idSeq = 0;
  h.auditSeq = 0;
  h.previewSeeds = {};
  const state = buildScenario(key);
  h.auditSeq = state.auditLog.reduce((max, e) => Math.max(max, e.seq), 0);
  state.version = previousVersion + 1;
  return state;
}
