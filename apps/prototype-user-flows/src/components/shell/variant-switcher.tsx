"use client";

// Prototype chrome, not product design: the bottom-centre pill on routes with variants
// (left arrow, "A (Table)", right arrow). The keyboard arrows cycle too when no field is focused and
// no dialog is open. Updates `?variant=` with router.replace and keeps the other query parameters.

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSimulatorOverlayOpen } from "./floating";

export interface VariantOption {
  key: string;
  label: string;
}

function ignoreKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return true;
  const fields = [e.target, document.activeElement];
  for (const el of fields) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return true;
  }
  return document.querySelector('[aria-modal="true"]') !== null;
}

export function VariantSwitcher({ variants, current, label }: { variants: VariantOption[]; current: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const index = Math.max(0, variants.findIndex((v) => v.key === current));

  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length];
    const sp = new URLSearchParams(params.toString());
    sp.set("variant", next.key);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (ignoreKey(e)) return;
      e.preventDefault();
      goRef.current(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const v = variants[index];
  // Below sm it sits above the simulator pill (both would overlap side by side at 390px) and steps
  // aside while the simulator menu or its result card is open; from sm it sits at the bottom next to
  // the pill, under any selection bar of the page.
  const overlay = useSimulatorOverlayOpen();
  return (
    <div className={`pointer-events-none fixed inset-x-0 bottom-16 z-40 justify-center sm:bottom-4 ${overlay ? "hidden sm:flex" : "flex"}`}>
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-zinc-900 p-1 text-white shadow-lg ring-1 ring-black/10" role="group" aria-label="Prototype variant">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous variant"
          title="Previous variant (Left arrow)"
          className="flex size-7 items-center justify-center rounded-full text-zinc-300 hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <div className="flex min-w-[118px] flex-col items-center px-1 leading-none">
          <span className="text-[9px] font-medium tracking-wider text-zinc-400 uppercase">{label}</span>
          <span className="mt-0.5 text-xs font-semibold tabular-nums">
            {v.key} ({v.label})
          </span>
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next variant"
          title="Next variant (Right arrow)"
          className="flex size-7 items-center justify-center rounded-full text-zinc-300 hover:bg-white/10 hover:text-white"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
