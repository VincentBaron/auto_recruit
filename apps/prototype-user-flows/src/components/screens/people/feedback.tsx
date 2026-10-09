"use client";

// Action runner and toasts for the people screens. Every mutation goes through `act()` (API-first,
// ADR-0008); the result is reported in a small toast at the bottom right.

import Link from "next/link";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { act } from "@/lib/api";
import type { ActionName, ActionPayload, ActResponse } from "@/lib/types";
import { cx } from "./ui";

export interface ToastInput {
  tone: "success" | "error" | "info";
  title: string;
  lines?: string[];
  link?: { label: string; href: string };
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => undefined);

export function useToast(): (t: ToastInput) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const push = useCallback((t: ToastInput) => {
    counter.current += 1;
    const id = counter.current;
    setToasts((prev) => [...prev.slice(-2), { ...t, id }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-20 right-4 z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onClose }: { toast: ToastItem; onClose: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onClose(toast.id), toast.tone === "error" ? 9000 : 6000);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.tone, onClose]);

  const Icon = toast.tone === "success" ? CircleCheck : toast.tone === "error" ? CircleAlert : Info;
  return (
    <div className="pointer-events-auto flex gap-3 rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-zinc-200">
      <Icon
        className={cx(
          "mt-0.5 size-4 shrink-0",
          toast.tone === "success" ? "text-emerald-600" : toast.tone === "error" ? "text-rose-600" : "text-indigo-600",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-zinc-900">{toast.title}</p>
        {toast.lines && toast.lines.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs leading-5 text-zinc-600">
            {toast.lines.map((l, i) => (
              <li key={i} className="break-words">
                {l}
              </li>
            ))}
          </ul>
        )}
        {toast.link && (
          <Link href={toast.link.href} className="mt-1.5 inline-block text-xs font-medium text-indigo-600 hover:text-indigo-500">
            {toast.link.label}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        className="-mr-1 -mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        aria-label="Dismiss notification"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Runs dummy-backend actions and tracks which one is pending (by key) for button spinners. */
export function useAction() {
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(async <K extends ActionName>(name: K, payload: ActionPayload<K>, key?: string): Promise<ActResponse<K>> => {
    setPending(key ?? name);
    try {
      return await act(name, payload);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "The dummy backend did not answer." };
    } finally {
      setPending(null);
    }
  }, []);
  return { pending, run };
}
