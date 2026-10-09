// Visual language of Reply Categories and automatic effects, shared by the Inbox and the Digest.

import {
  Ban,
  CalendarX,
  CircleSlash,
  Hourglass,
  MailWarning,
  MailX,
  Plane,
  ShieldBan,
  ThumbsUp,
  TriangleAlert,
  Trash,
  UserPlus,
  CirclePause,
  type LucideIcon,
} from "lucide-react";
import { REPLY_CATEGORY_LABELS } from "@/lib/labels";
import type { AutomaticEffectKind, ReplyCategory } from "@/lib/types";
import { cx } from "./ui";

interface CategoryStyle {
  icon: LucideIcon;
  dot: string;
  badge: string;
  soft: string;
}

export const CATEGORY_STYLES: Record<ReplyCategory, CategoryStyle> = {
  interested: {
    icon: ThumbsUp,
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    soft: "text-emerald-700",
  },
  not_now: {
    icon: Hourglass,
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-800 ring-amber-600/20",
    soft: "text-amber-700",
  },
  not_interested: {
    icon: CircleSlash,
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-700 ring-zinc-500/20",
    soft: "text-zinc-600",
  },
  opt_out: {
    icon: ShieldBan,
    dot: "bg-rose-500",
    badge: "bg-rose-50 text-rose-700 ring-rose-600/20",
    soft: "text-rose-700",
  },
  out_of_office: {
    icon: Plane,
    dot: "bg-sky-500",
    badge: "bg-sky-50 text-sky-700 ring-sky-600/20",
    soft: "text-sky-700",
  },
  referral: {
    icon: UserPlus,
    dot: "bg-violet-500",
    badge: "bg-violet-50 text-violet-700 ring-violet-600/20",
    soft: "text-violet-700",
  },
  bounce: {
    icon: MailX,
    dot: "bg-orange-500",
    badge: "bg-orange-50 text-orange-700 ring-orange-600/20",
    soft: "text-orange-700",
  },
};

export function CategoryDot({ category, className }: { category: ReplyCategory; className?: string }) {
  return <span aria-hidden className={cx("inline-block size-2 shrink-0 rounded-full", CATEGORY_STYLES[category].dot, className)} />;
}

export function CategoryBadge({ category, className }: { category: ReplyCategory; className?: string }) {
  const style = CATEGORY_STYLES[category];
  const Icon = style.icon;
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        style.badge,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {REPLY_CATEGORY_LABELS[category]}
    </span>
  );
}

export const EFFECT_STYLES: Record<AutomaticEffectKind, { icon: LucideIcon; label: string; tone: string }> = {
  suppression_list: { icon: ShieldBan, label: "Suppression List", tone: "bg-rose-50 text-rose-600" },
  sequence_paused: { icon: CirclePause, label: "Sequence paused", tone: "bg-sky-50 text-sky-600" },
  hiring_contact_proposed: { icon: UserPlus, label: "Hiring Contact proposed", tone: "bg-violet-50 text-violet-600" },
  next_provider_tried: { icon: MailWarning, label: "Next provider tried", tone: "bg-orange-50 text-orange-600" },
  mailbox_paused: { icon: TriangleAlert, label: "Sending Mailbox paused", tone: "bg-amber-50 text-amber-600" },
  prospect_closed: { icon: CalendarX, label: "Prospect closed", tone: "bg-zinc-100 text-zinc-600" },
  candidate_deleted: { icon: Trash, label: "Candidate data deleted", tone: "bg-zinc-100 text-zinc-600" },
  outreach_stopped: { icon: Ban, label: "Outreach stopped", tone: "bg-zinc-100 text-zinc-600" },
};
