"use client";

// Left sidebar: Feed, Inbox (unhandled count), Digest, Campaigns, Niches, Credits, then Settings.
// The same content is used in the mobile drawer.

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { diffDays } from "@/lib/dates";
import { initials, plural } from "@/lib/format";
import type { ClientState } from "@/lib/types";
import { isActive, MAIN_NAV, type NavItem, SETTINGS_NAV } from "./nav";

interface NavCount {
  count: number;
  tone: "indigo" | "amber" | "red";
  label: string;
}

const COUNT_TONES: Record<NavCount["tone"], string> = {
  indigo: "bg-indigo-600 text-white",
  amber: "bg-amber-400 text-amber-950",
  red: "bg-rose-600 text-white",
};

/** The count shown next to a navigation item, or null (also null while the state loads). */
function navCount(state: ClientState | null, item: NavItem): NavCount | null {
  if (!state || !item.badge) return null;
  if (item.badge === "unhandledReplies") {
    // Only replies to the current Recruiter's own Campaigns need their action.
    const me = state.derived.currentRecruiter?.id;
    const mine = new Set(state.campaigns.filter((c) => c.ownerId === me).map((c) => c.id));
    const count = state.replies.filter((r) => !r.handled && mine.has(r.campaignId)).length;
    return count > 0 ? { count, tone: "indigo", label: `${plural(count, "unhandled reply", "unhandled replies")} to your Campaigns` } : null;
  }
  const today = state.clock.today;
  const due = state.dataRequests.filter((dr) => dr.status !== "completed" && diffDays(dr.dueOn, today) <= 7);
  if (due.length === 0) return null;
  const overdue = due.filter((dr) => diffDays(dr.dueOn, today) < 0).length;
  return {
    count: due.length,
    tone: overdue > 0 ? "red" : "amber",
    label: `${plural(due.length, "Data Request")} due within 7 days${overdue > 0 ? `, ${overdue} overdue` : ""}`,
  };
}

export function ProductMark() {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-zinc-900">
      <span className="inline-flex size-6 items-center justify-center rounded-md bg-indigo-600 text-[11px] font-bold text-white shadow-sm">AR</span>
      Auto Recruit
    </span>
  );
}

function NavLink({ item, pathname, count, onNavigate }: { item: NavItem; pathname: string; count: NavCount | null; onNavigate?: () => void }) {
  const active = isActive(item, pathname);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors ${
          active ? "bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200" : "text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
        }`}
      >
        <Icon className={`size-4 shrink-0 ${active ? "text-indigo-600" : "text-zinc-400 group-hover:text-zinc-500"}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {count ? (
          <span
            title={count.label}
            className={cx("ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums", COUNT_TONES[count.tone])}
          >
            <span aria-hidden>{count.count}</span>
            <span className="sr-only">{count.label}</span>
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export function SidebarContent({ state, pathname, onNavigate }: { state: ClientState | null; pathname: string; onNavigate?: () => void }) {
  const me = state?.derived.currentRecruiter ?? null;
  const ws = state?.workspace ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-zinc-200/80 px-4">
        <Link href={ws ? "/feed" : "/"} onClick={onNavigate} className="rounded-md">
          <ProductMark />
        </Link>
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        <ul className="space-y-0.5">
          {MAIN_NAV.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} count={navCount(state, item)} onNavigate={onNavigate} />
          ))}
        </ul>
        <p className="mt-6 mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Settings</p>
        <ul className="space-y-0.5">
          {SETTINGS_NAV.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} count={navCount(state, item)} onNavigate={onNavigate} />
          ))}
        </ul>
      </nav>

      <div className="shrink-0 space-y-2 border-t border-zinc-200/80 p-2.5">
        {state?.derived.isFreeTrial ? (
          <Link
            href="/credits"
            onClick={onNavigate}
            className="block rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs leading-relaxed text-indigo-950 hover:border-indigo-300"
          >
            <span className="flex items-center gap-1.5 font-semibold text-indigo-700">
              <Sparkles className="size-3.5" aria-hidden />
              Free trial
            </span>
            <span className="mt-0.5 block text-indigo-900/80">Buy Credits to reveal people and switch agents on.</span>
          </Link>
        ) : null}
        {state === null ? (
          <div className="flex items-center gap-2.5 px-1.5 py-1" aria-hidden>
            <span className="size-8 animate-pulse rounded-full bg-zinc-200" />
            <span className="h-3 w-28 animate-pulse rounded bg-zinc-200" />
          </div>
        ) : me && ws ? (
          <Link href="/settings/team" onClick={onNavigate} className="flex items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-zinc-200/60">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">{initials(me.name)}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium text-zinc-900">{me.name}</span>
              <span className="block truncate text-xs text-zinc-500">
                {me.role === "owner" ? "Owner" : "Recruiter"} · {ws.name}
              </span>
            </span>
          </Link>
        ) : (
          <div className="px-1.5 py-1 text-xs leading-relaxed text-zinc-500">
            <p className="font-medium text-zinc-700">Not signed in</p>
            <Link href="/signup?provider=google" onClick={onNavigate} className="font-medium text-indigo-600 hover:text-indigo-700">
              Start free with a work account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
