"use client";

// Background stops the Recruiter must see (Credits ran out for agents or Campaigns, a Sending Mailbox
// paused automatically, an auto top-up...): up to 3 undismissed notices of the last 7 simulated days,
// newest first, under the top bar. Keyed by notice id, so the 2-second poll never shifts them.

import { useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { act } from "@/lib/api";
import { diffDays } from "@/lib/dates";
import type { ClientState, Notice } from "@/lib/types";

const TONES: Record<Notice["tone"], { box: string; icon: LucideIcon; iconClass: string; link: string; close: string }> = {
  danger: { box: "border-rose-200 bg-rose-50 text-rose-950", icon: CircleAlert, iconClass: "text-rose-600", link: "text-rose-800 decoration-rose-300", close: "text-rose-500 hover:bg-rose-100 hover:text-rose-800" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: TriangleAlert, iconClass: "text-amber-600", link: "text-amber-900 decoration-amber-300", close: "text-amber-600 hover:bg-amber-100 hover:text-amber-900" },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: CircleCheck, iconClass: "text-emerald-600", link: "text-emerald-800 decoration-emerald-300", close: "text-emerald-600 hover:bg-emerald-100 hover:text-emerald-900" },
  info: { box: "border-indigo-200 bg-indigo-50 text-indigo-950", icon: Info, iconClass: "text-indigo-600", link: "text-indigo-800 decoration-indigo-300", close: "text-indigo-500 hover:bg-indigo-100 hover:text-indigo-800" },
};

const MAX_NOTICES = 3;
const NOTICE_DAYS = 7;

export function NoticeStack({ state }: { state: ClientState | null }) {
  // Dismissed here before the backend confirms, so the notice leaves at once.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  if (!state?.workspace) return null;
  const today = state.clock.today;
  const notices = state.notices
    .filter((n) => n.dismissedOn === null && !hidden.has(n.id) && diffDays(today, n.on) < NOTICE_DAYS && diffDays(today, n.on) >= 0)
    .slice(0, MAX_NOTICES);
  if (notices.length === 0) return null;

  const dismiss = (id: string) => {
    setHidden((prev) => new Set(prev).add(id));
    void act("dismissNotice", { noticeId: id });
  };

  return (
    <section aria-label="Notices" className="space-y-px border-b border-zinc-200 bg-zinc-200">
      {notices.map((n) => {
        const t = TONES[n.tone];
        const Icon = t.icon;
        return (
          <div key={n.id} role={n.tone === "danger" ? "alert" : "status"} className={cx("flex items-start gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8", t.box)}>
            <Icon className={cx("mt-0.5 size-4 shrink-0", t.iconClass)} aria-hidden />
            <p className="min-w-0 flex-1 leading-6">
              <span className="break-words">{n.text}</span>
              {n.link ? (
                <>
                  {" "}
                  <Link href={n.link.href} className={cx("font-medium whitespace-nowrap underline underline-offset-2 hover:no-underline", t.link)}>
                    {n.link.label}
                  </Link>
                </>
              ) : null}
            </p>
            <button type="button" onClick={() => dismiss(n.id)} aria-label="Dismiss notice" title="Dismiss" className={cx("-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md", t.close)}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </section>
  );
}
