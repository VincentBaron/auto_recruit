"use client";

// Pure helpers and the action runner shared by the Settings screens.

import { useCallback, useState } from "react";
import { SENDING_LIMITS } from "@/lib/labels";
import type { ActionName, ActionPayload, ActionResult, AppState, PersonKind } from "@/lib/types";
import { act } from "@/lib/api";
import type { FlashMessage } from "./ui";

/** Same ramp as the dummy backend: 5 a day on day 1 to 30 a day from about day 21 (ADR-0017). */
export function rampCap(rampDay: number): number {
  const { rampStartPerDay, perMailboxPerDay, rampDays } = SENDING_LIMITS;
  if (rampDay >= rampDays) return perMailboxPerDay;
  return Math.min(perMailboxPerDay, Math.round(rampStartPerDay + ((perMailboxPerDay - rampStartPerDay) * (Math.max(1, rampDay) - 1)) / (rampDays - 1)));
}

export function recruiterName(s: AppState, id: string | null | undefined): string {
  return s.recruiters.find((r) => r.id === id)?.name ?? "Unknown Recruiter";
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return (at >= 0 ? address.slice(at + 1) : address).trim().toLowerCase();
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** "Élise Marchand" -> "elise.marchand". */
export function localPart(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
}

export const PERSON_KIND_LABELS: Record<PersonKind, string> = {
  hiring_contact: "Hiring Contact",
  candidate: "Candidate",
};

export function personName(s: AppState, kind: PersonKind, id: string): string | null {
  if (kind === "candidate") return s.candidates.find((c) => c.id === id)?.name ?? null;
  return s.hiringContacts.find((h) => h.id === id)?.name ?? null;
}

export function personHref(kind: PersonKind, id: string, s: AppState): string | null {
  if (kind === "candidate") return s.candidates.some((c) => c.id === id) ? `/candidates/${id}` : null;
  const hc = s.hiringContacts.find((h) => h.id === id);
  return hc ? `/prospects/${hc.prospectId}` : null;
}

type Describe<K extends ActionName> = (result: ActionResult<K>, changes: string[]) => FlashMessage | string | null;

/**
 * Runs an action, tracks which control is pending, and reports the outcome as a flash message.
 * Returns the typed result, or null when the backend refused the action.
 */
export function useRunner(setFlash: (m: FlashMessage | null) => void) {
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(
    async <K extends ActionName>(key: string, name: K, payload: ActionPayload<K>, describe?: Describe<K>): Promise<ActionResult<K> | null> => {
      setPending(key);
      try {
        const res = await act(name, payload);
        if (!res.ok) {
          setFlash({ tone: "danger", text: res.error });
          return null;
        }
        const d = describe ? describe(res.result, res.changes) : null;
        if (typeof d === "string") setFlash({ tone: "success", text: d });
        else if (d) setFlash(d);
        return res.result;
      } finally {
        setPending(null);
      }
    },
    [setFlash],
  );
  return { pending, run };
}
