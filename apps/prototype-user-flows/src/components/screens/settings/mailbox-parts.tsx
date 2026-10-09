"use client";

import { CircleCheck, LoaderCircle } from "lucide-react";
import { SENDING_LIMITS } from "@/lib/labels";
import type { AgentStep, SendingMailbox } from "@/lib/types";
import { Meter, cx } from "./ui";

export const TERMS_RISK_TEXT =
  "Cold email from your own Google Workspace or Microsoft 365 tenant is common practice, but it sits uneasily with Google's and Microsoft's terms. Your provider could suspend the tenant. Your Workspace remains responsible for following its provider's rules.";

/**
 * Where a Sending Mailbox is on its ramp, read from its live daily cap and status: the ramp is
 * complete only once the mailbox sends at the full per-mailbox cap. A paused mailbox keeps its ramp
 * day and cap (the ramp does not advance while paused) and continues from there when resumed.
 */
export function rampProgress(m: SendingMailbox): { complete: boolean; day: number; cap: number } {
  const complete = m.status !== "warming" && m.dailyCap >= SENDING_LIMITS.perMailboxPerDay;
  return { complete, day: Math.max(1, Math.min(SENDING_LIMITS.rampDays, m.rampDay)), cap: m.dailyCap };
}

/** Live steps of an assisted setup (animated by the dummy backend). */
export function SetupProgress({ steps, progress }: { steps: AgentStep[]; progress: number }) {
  return (
    <div>
      <Meter value={Math.round(progress * 100)} max={100} label="Assisted setup progress" />
      <ol className="mt-4 space-y-2.5">
        {steps.map((st) => (
          <li key={st.key} className="flex items-center gap-2.5 text-sm">
            {st.status === "done" ? (
              <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
            ) : st.status === "running" ? (
              <LoaderCircle className="size-4 shrink-0 animate-spin text-indigo-600" aria-hidden />
            ) : (
              <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
                <span className="size-2 rounded-full bg-zinc-300" />
              </span>
            )}
            <span className={cx(st.status === "pending" ? "text-zinc-400" : "text-zinc-800", st.status === "running" && "font-medium")}>{st.label}</span>
            {st.detail && st.status === "done" ? <span className="text-xs text-zinc-500">{st.detail}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
