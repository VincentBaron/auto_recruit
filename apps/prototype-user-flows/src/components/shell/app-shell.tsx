"use client";

// App chrome around every page: the PROTOTYPE banner, the sidebar and top bar (not on the landing
// page, sign-up and the public Consent Page), background notices, the "Ask" panel, and the simulator
// bar. Pages bring their own container and padding (PageContainer): <main> adds none.
// The chrome is chosen from the route tree (useSelectedLayoutSegments), never from the URL, so the
// server render and hydration always agree, including on 404 pages for unknown URLs.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { X } from "lucide-react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useAppState } from "@/lib/api";
import { isBareSegment } from "./nav";
import { NoticeStack } from "./notice-stack";
import { SidebarContent } from "./sidebar";
import { SimulatorBar } from "./simulator-bar";
import { TopBar } from "./top-bar";

function PrototypeBanner() {
  return (
    <div role="note" className="sticky top-0 z-40 flex h-7 items-center justify-center gap-2 bg-zinc-900 px-4 text-[11px] font-medium tracking-wide text-zinc-300">
      <span className="size-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
      <span className="truncate">PROTOTYPE - dummy backend, nothing here is real</span>
    </div>
  );
}

function MobileNav({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <button type="button" className="absolute inset-0 cursor-default bg-zinc-950/30" aria-label="Close navigation" onClick={onClose} tabIndex={-1} />
      <div className="relative h-full w-72 max-w-[85vw] border-r border-zinc-200 bg-zinc-50 shadow-xl">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 z-10 inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900"
          aria-label="Close navigation"
        >
          <X className="size-4" aria-hidden />
        </button>
        {children}
      </div>
    </div>
  );
}

function ProductChrome({ pathname, children }: { pathname: string; children: ReactNode }) {
  const state = useAppState();
  const [askOpen, setAskOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const closeAsk = useCallback(() => setAskOpen(false), []);

  return (
    <>
      <div className="flex min-h-[calc(100dvh-1.75rem)]">
        <aside className="sticky top-7 hidden h-[calc(100dvh-1.75rem)] w-60 shrink-0 border-r border-zinc-200 bg-zinc-100/70 pb-14 lg:block">
          <SidebarContent state={state} pathname={pathname} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar state={state} onMenu={() => setNavOpen(true)} onAsk={() => setAskOpen((o) => !o)} askOpen={askOpen} />
          <NoticeStack state={state} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      <MobileNav open={navOpen} onClose={closeNav}>
        <SidebarContent state={state} pathname={pathname} onNavigate={closeNav} />
      </MobileNav>
      <ChatPanel open={askOpen} onClose={closeAsk} />
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // The active route segments below the root layout: [] for "/", ["prospects", "pr_1"] for a Prospect.
  const segments = useSelectedLayoutSegments();
  const route = `/${segments.join("/")}`;
  return (
    <>
      <PrototypeBanner />
      {isBareSegment(segments[0] ?? null) ? children : <ProductChrome pathname={route}>{children}</ProductChrome>}
      <SimulatorBar />
    </>
  );
}
