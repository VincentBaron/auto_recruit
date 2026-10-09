"use client";

// Prototype chrome, clearly not product design: a compact dark pill bottom-left, inside the sidebar
// column on large screens, with the simulated date, "Advance 1 day" and a menu for everything else
// (advance 7 days, run agents now, inject a reply, the State drawer, load a scenario, reset).
// After each action a result card lists what happened, most important first.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, ChevronDown, Ellipsis, FastForward, FlaskConical, LoaderCircle, MessageSquareReply, PanelRight, Play, RotateCcw, UserRound, X } from "lucide-react";
import { act, useAppState } from "@/lib/api";
import { weekdayOf } from "@/lib/dates";
import { formatDateShort, weekdayShort } from "@/lib/format";
import type { ActionName, ActionPayload, ScenarioKey } from "@/lib/types";
import { setSimulatorOverlayOpen } from "./floating";
import { InjectReplyDialog } from "./inject-reply-dialog";
import { StateDrawer } from "./state-drawer";

interface Flash {
  tone: "ok" | "error";
  title: string;
  lines: string[];
}

type Confirm = { kind: "scenario"; scenario: ScenarioKey } | { kind: "reset" };

/** Lines shown before "+N more". */
const FLASH_LINES = 6;

/**
 * Most important first: Campaign sends, replies, Credits and other stops, retention, then agent
 * runs and the rest. Within a group the original order is kept.
 */
function linePriority(line: string): number {
  if (/emails? sent\.$|^Weekend: no Campaign emails/.test(line)) return 0;
  if (/^Reply from /.test(line)) return 1;
  if (/Credits ran out|stopped|No Sending Mailbox|waits? for|caps reached|not sent|paused/i.test(line)) return 2;
  if (/retention/i.test(line)) return 3;
  if (/Prospects?, .*Candidates?/.test(line)) return 4;
  return 5;
}

export function orderFlashLines(lines: string[]): string[] {
  return lines
    .map((line, i) => ({ line, i, p: linePriority(line) }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.line);
}

function MenuItem({ icon, children, hint, onClick, disabled }: { icon: ReactNode; children: ReactNode; hint?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-zinc-400 [&>svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="shrink-0 text-[11px] text-zinc-500">{hint}</span> : null}
    </button>
  );
}

export function SimulatorBar() {
  const state = useAppState();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [injectOpen, setInjectOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The variant switcher steps aside on small screens while the menu or the result card is open.
  useEffect(() => {
    setSimulatorOverlayOpen(menuOpen || flash !== null);
  }, [menuOpen, flash]);
  useEffect(() => () => setSimulatorOverlayOpen(false), []);

  const hasWorkspace = Boolean(state?.workspace);

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirm(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setConfirm(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Results fade after a few seconds, unless the Recruiter reads them (expanded or hovered).
  useEffect(() => {
    if (!flash || expanded || hovered) return;
    const t = setTimeout(() => setFlash(null), flash.tone === "error" ? 7000 : 6000);
    return () => clearTimeout(t);
  }, [flash, expanded, hovered]);

  const run = useCallback(async <K extends ActionName>(key: string, name: K, payload: ActionPayload<K>, title: string): Promise<boolean> => {
    setBusy(key);
    setMenuOpen(false);
    setConfirm(null);
    const res = await act(name, payload);
    setBusy(null);
    setExpanded(false);
    if (!res.ok) {
      setFlash({ tone: "error", title: "The simulator could not do that", lines: [res.error] });
      return false;
    }
    setFlash({ tone: "ok", title, lines: orderFlashLines(res.changes.filter((l) => !l.startsWith("Audit:"))) });
    return true;
  }, []);

  const loadScenario = async (scenario: ScenarioKey) => {
    const ok = await run(`scenario:${scenario}`, "loadScenario", { scenario }, scenario === "new_user" ? "New user scenario loaded" : "Established workspace loaded");
    if (!ok) return;
    if (scenario === "new_user") router.push("/");
    else if (pathname === "/" || pathname.startsWith("/signup")) router.push("/feed");
  };

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closeInject = useCallback(() => setInjectOpen(false), []);
  const today = state?.clock.today ?? null;

  const shown = flash ? (expanded ? flash.lines : flash.lines.slice(0, FLASH_LINES)) : [];
  const more = flash ? flash.lines.length - FLASH_LINES : 0;

  return (
    <>
      <div ref={rootRef} className="pointer-events-none fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2">
        {flash ? (
          <div
            role="status"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`pointer-events-auto w-[min(340px,calc(100vw-2rem))] rounded-xl py-2.5 pr-2 pl-3.5 text-xs shadow-lg ring-1 ${
              flash.tone === "error" ? "bg-red-950 text-red-100 ring-red-900" : "bg-zinc-900 text-zinc-300 ring-black/20"
            }`}
          >
            <div className="flex items-start gap-2">
              <p className={`min-w-0 flex-1 pt-0.5 font-medium ${flash.tone === "error" ? "text-red-50" : "text-white"}`}>{flash.title}</p>
              <button
                type="button"
                onClick={() => setFlash(null)}
                aria-label="Close the simulator result"
                title="Close"
                className="-mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
            {shown.length > 0 ? (
              <ul className={`mt-1 space-y-0.5 pr-1.5 leading-relaxed ${expanded ? "max-h-64 overflow-y-auto overscroll-contain" : ""}`}>
                {shown.map((l, i) => (
                  <li key={i} className="break-words">
                    {l}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pr-1.5">
              {more > 0 ? (
                <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} className="inline-flex items-center gap-1 font-medium text-zinc-100 hover:text-white">
                  <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
                  {expanded ? "Show less" : `+${more} more`}
                </button>
              ) : null}
              {flash.tone === "ok" ? (
                <button type="button" onClick={() => setDrawerOpen(true)} className="font-medium text-amber-300 hover:text-amber-200">
                  See what changed in State
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {menuOpen ? (
          <div role="menu" aria-label="Simulator" className="pointer-events-auto w-64 max-w-[calc(100vw-2rem)] rounded-xl lg:w-52 bg-zinc-900 p-1.5 text-white shadow-xl ring-1 ring-black/20">
            {confirm ? (
              <div className="px-2.5 py-2">
                <p className="text-[13px] font-medium text-white">
                  {confirm.kind === "reset" ? "Reset the scenario?" : confirm.scenario === "new_user" ? "Load the New user scenario?" : "Load the Established workspace?"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">This replaces the whole state of the dummy backend. Nothing else is affected.</p>
                <div className="mt-2.5 flex justify-end gap-1.5">
                  <button type="button" onClick={() => setConfirm(null)} className="h-7 rounded-md px-2.5 text-xs font-medium text-zinc-300 hover:bg-white/10">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => (confirm.kind === "reset" ? void run("reset", "reset", {}, "Scenario reset") : void loadScenario(confirm.scenario))}
                    className="h-7 rounded-md bg-amber-400 px-2.5 text-xs font-semibold text-zinc-900 hover:bg-amber-300"
                  >
                    {confirm.kind === "reset" ? "Reset" : "Load"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="px-2.5 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Simulated time</p>
                <MenuItem icon={<FastForward />} hint="+1" disabled={!hasWorkspace} onClick={() => void run("advance1", "advance", { days: 1 }, "Advanced 1 day")}>
                  Advance 1 day
                </MenuItem>
                <MenuItem icon={<FastForward />} hint="+7" disabled={!hasWorkspace} onClick={() => void run("advance7", "advance", { days: 7 }, "Advanced 7 days")}>
                  Advance 7 days
                </MenuItem>
                <MenuItem icon={<Play />} disabled={!hasWorkspace} onClick={() => void run("agents", "runAgentsNow", {}, "Agents ran")}>
                  Run agents now
                </MenuItem>
                <MenuItem
                  icon={<MessageSquareReply />}
                  disabled={!hasWorkspace}
                  onClick={() => {
                    setMenuOpen(false);
                    setInjectOpen(true);
                  }}
                >
                  Inject reply...
                </MenuItem>
                <MenuItem
                  icon={<PanelRight />}
                  onClick={() => {
                    setMenuOpen(false);
                    setDrawerOpen(true);
                  }}
                >
                  State
                </MenuItem>
                <div className="my-1.5 h-px bg-white/10" />
                <p className="px-2.5 pt-0.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Load scenario</p>
                <MenuItem icon={<UserRound />} onClick={() => setConfirm({ kind: "scenario", scenario: "new_user" })}>
                  New user
                </MenuItem>
                <MenuItem icon={<Building2 />} onClick={() => setConfirm({ kind: "scenario", scenario: "established" })}>
                  Established workspace
                </MenuItem>
                <MenuItem icon={<RotateCcw />} onClick={() => setConfirm({ kind: "reset" })}>
                  Reset
                </MenuItem>
              </>
            )}
          </div>
        ) : null}

        <div role="toolbar" aria-label="Simulator (prototype only)" className="pointer-events-auto flex h-9 max-w-[208px] items-center gap-0.5 rounded-full bg-zinc-900 py-1 pr-1 pl-3 text-xs text-white shadow-lg ring-1 ring-black/10">
          <span className="flex min-w-0 items-center gap-1.5 pr-1 font-medium whitespace-nowrap tabular-nums" title="Simulated date">
            <FlaskConical className="size-3.5 shrink-0 text-amber-300" aria-hidden />
            {today ? `${weekdayShort(weekdayOf(today))} ${formatDateShort(today)}` : <span className="h-3 w-16 animate-pulse rounded bg-white/15" aria-hidden />}
          </span>
          <button
            type="button"
            disabled={!hasWorkspace || busy !== null}
            onClick={() => void run("advance1", "advance", { days: 1 }, "Advanced 1 day")}
            aria-label="Advance 1 day"
            title="Advance 1 day: agents run, emails go out within caps, replies arrive"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-zinc-100 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {busy === "advance1" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FastForward className="size-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen((o) => !o);
              setConfirm(null);
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More simulator actions"
            title="More simulator actions"
            className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-zinc-200 hover:bg-white/10 ${menuOpen ? "bg-white/15" : ""}`}
          >
            {busy && busy !== "advance1" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Ellipsis className="size-4" aria-hidden />}
          </button>
        </div>
      </div>

      <StateDrawer open={drawerOpen} onClose={closeDrawer} state={state} />
      {injectOpen && state ? <InjectReplyDialog state={state} onClose={closeInject} /> : null}
    </>
  );
}
