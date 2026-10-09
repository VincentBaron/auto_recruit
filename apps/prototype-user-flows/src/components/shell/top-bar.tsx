"use client";

// Top bar: Workspace name, simulated date, Credits balance and the "Ask" button. Below the lg
// breakpoint it also opens the sidebar as a drawer.

import Link from "next/link";
import { CalendarDays, Coins, Menu, Sparkles } from "lucide-react";
import { formatCredits, formatWeekdayDate } from "@/lib/format";
import type { ClientState } from "@/lib/types";

export function TopBar({ state, onMenu, onAsk, askOpen }: { state: ClientState | null; onMenu: () => void; onAsk: () => void; askOpen: boolean }) {
  const ws = state?.workspace ?? null;
  const lowBalance = ws !== null && ws.plan === "paid" && ws.credits < 200;

  return (
    <header className="sticky top-7 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white/95 px-3 backdrop-blur sm:gap-3 sm:px-4 lg:px-6">
      <button
        type="button"
        onClick={onMenu}
        className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-[18px]" aria-hidden />
      </button>
      <Link href={ws ? "/feed" : "/"} className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-[11px] font-bold text-white shadow-sm lg:hidden" aria-label="Auto Recruit">
        AR
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {state === null ? (
          <span className="h-3.5 w-32 animate-pulse rounded bg-zinc-200" aria-hidden />
        ) : ws ? (
          <>
            <span className="truncate text-sm font-semibold text-zinc-900" title="Workspace">
              {ws.name}
            </span>
            {ws.plan === "free_trial" ? (
              <span className="hidden shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 sm:inline">Free trial</span>
            ) : null}
          </>
        ) : (
          <span className="truncate text-sm text-zinc-500">No Workspace yet</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {state ? (
          <span className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-zinc-600 md:inline-flex" title="Simulated date (advance it from the simulator bar)">
            <CalendarDays className="size-4 text-zinc-400" aria-hidden />
            <span className="tabular-nums">{formatWeekdayDate(state.clock.today)}</span>
          </span>
        ) : null}
        {ws ? (
          <Link
            href="/credits"
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium tabular-nums shadow-xs transition-colors ${
              lowBalance ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
            }`}
            title="Credits balance"
          >
            <Coins className={`size-4 ${lowBalance ? "text-amber-600" : "text-zinc-400"}`} aria-hidden />
            {formatCredits(ws.credits)}
            <span className="hidden font-normal text-zinc-500 sm:inline">Credits</span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onAsk}
          aria-expanded={askOpen}
          aria-controls="ask-panel"
          className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-white shadow-sm transition-colors ${
            askOpen ? "bg-indigo-700" : "bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          <Sparkles className="size-4" aria-hidden />
          Ask
        </button>
      </div>
    </header>
  );
}
