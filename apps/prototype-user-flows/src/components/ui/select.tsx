// The native select with the app's look: the class name sizes the wrapper, the chevron is drawn.

import type { Ref, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "./cx";

export function Select({ className, ref, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <span className={cx("relative inline-flex", className)}>
      <select
        ref={ref}
        {...props}
        className="h-8 w-full min-w-0 appearance-none truncate rounded-md border border-zinc-300 bg-white pr-8 pl-2.5 text-sm text-zinc-900 shadow-xs hover:border-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
    </span>
  );
}
