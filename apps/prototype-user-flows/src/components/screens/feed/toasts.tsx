"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import type { ToastInput } from "./context";
import { cx } from "./ui";

interface Toast extends ToastInput {
  id: number;
}

const TTL_MS = 6000;

export function useToasts(): { toasts: Toast[]; notify: (t: ToastInput) => void; dismiss: (id: number) => void } {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const notify = useCallback((t: ToastInput) => {
    seq.current += 1;
    const id = seq.current;
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
  }, []);
  return { toasts, notify, dismiss };
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });
  useEffect(() => {
    const t = setTimeout(() => dismissRef.current(), TTL_MS);
    return () => clearTimeout(t);
  }, []);
  const tone = toast.tone ?? "info";
  const Icon = tone === "success" ? CircleCheck : tone === "danger" ? CircleAlert : Info;
  return (
    <div role="status" className="pointer-events-auto flex w-full items-start gap-3 rounded-lg bg-white p-3 shadow-lg ring-1 ring-zinc-200">
      <Icon
        className={cx("mt-0.5 size-4 shrink-0", tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-rose-600" : "text-indigo-600")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900">{toast.title}</p>
        {toast.description ? <p className="mt-0.5 text-xs text-zinc-500">{toast.description}</p> : null}
      </div>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
        >
          {toast.action.label}
        </button>
      ) : null}
      {toast.link ? (
        <Link href={toast.link.href} className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">
          {toast.link.label}
        </Link>
      ) : null}
      <button type="button" onClick={onDismiss} className="-mt-0.5 -mr-1 shrink-0 rounded p-1 text-zinc-400 hover:text-zinc-700" aria-label="Dismiss notification">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-3 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-4 sm:w-[360px]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}
