// Shared typing for action handlers. Each handler mutates the state and returns its typed result.

import type { ActionName, ActionPayload, ActionResult, AppState } from "@/lib/types";

export interface Ctx {
  /** Server wall-clock, only for animations. */
  nowMs: number;
  /**
   * Runs another action inside the same request (used by the chat panel's confirmed proposals).
   * Rolls its own changes back before rethrowing when it fails.
   */
  dispatch: <K extends ActionName>(name: K, payload: ActionPayload<K>) => ActionResult<K>;
  /** Replaces the whole state (scenario load, reset, sign-up from an existing Workspace). */
  replaceState: (next: AppState) => AppState;
  /** Adds a line to the "What changed" list of the State drawer. */
  note: (line: string) => void;
}

export type Handler<K extends ActionName> = (state: AppState, payload: ActionPayload<K>, ctx: Ctx) => ActionResult<K>;

export type HandlerMap<K extends ActionName> = { [P in K]: Handler<P> };
