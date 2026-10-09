// The hint every placeholder Credit price carries, usable inline in a sentence.

import { PLACEHOLDER_PRICE_HINT } from "@/lib/pricing";
import { cx } from "./cx";

export function PriceHint({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-1.5 py-px text-[11px] font-medium text-amber-700 ring-1 ring-amber-200",
        className,
      )}
    >
      {PLACEHOLDER_PRICE_HINT}
    </span>
  );
}
