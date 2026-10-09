// The page frame every product screen uses: one container (same width, gutters and bottom room for
// the simulator pill on every page) and one header (eyebrow, h1, description, actions).

import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

export function PageContainer({ width = "default", className, children }: { width?: "default" | "wide"; className?: string; children: ReactNode }) {
  return (
    <div className={cx("mx-auto w-full min-w-0 px-4 pt-6 pb-28 sm:px-6 lg:px-8", width === "wide" ? "max-w-[1400px]" : "max-w-[1200px]", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  leading,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="min-w-0">
          {eyebrow ? <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">{eyebrow}</div> : null}
          <h1 className="break-words text-xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          {description ? <div className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">{description}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
