// Retention rules shared by the dummy backend and the screens. An open Data Request is a legal hold:
// the person it matches is never deleted by retention until the request is answered.

import type { DataRequest, PersonRef } from "./types";

/** The open (not completed) Data Request whose matches include `ref`, or null. */
export function openDataRequestFor(state: { dataRequests: DataRequest[] }, ref: PersonRef): DataRequest | null {
  return state.dataRequests.find((dr) => dr.status !== "completed" && dr.matches.some((m) => m.kind === ref.kind && m.id === ref.id)) ?? null;
}
