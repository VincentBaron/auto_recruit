"use client";

// The list of replies, grouped by Reply Category when no category is picked. The selected reply,
// when it does not match the filters, is listed first in a group of its own.

import { Check, CornerUpLeft, Pin } from "lucide-react";
import { formatDateShort, formatRelative } from "@/lib/format";
import { diffDays } from "@/lib/dates";
import { REPLY_CATEGORY_LABELS } from "@/lib/labels";
import type { ReplyCategory } from "@/lib/types";
import { CategoryBadge, CategoryDot } from "./category";
import { snippet, type ReplyView } from "./model";
import { Avatar, Badge, cx } from "./ui";

export interface ReplyGroup {
  key: string;
  /**
   * A Reply Category with its count; the selected reply with the filter it is outside of
   * ("Needs action"), so it is never counted with the replies that match; or no header.
   */
  header: { kind: "category"; category: ReplyCategory } | { kind: "selected"; outsideOf: string } | null;
  items: ReplyView[];
}

const HEADER = "z-10 flex items-center gap-2 border-b border-zinc-100 bg-zinc-50/95 px-4 py-1.5 text-xs font-semibold text-zinc-700 backdrop-blur lg:sticky lg:top-0";

function GroupHeader({ header, count }: { header: NonNullable<ReplyGroup["header"]>; count: number }) {
  if (header.kind === "selected") {
    return (
      <h2 className={HEADER}>
        {/* Negative margins keep the 12px icon in the 8px slot of the category dots, so the labels line up. */}
        <Pin className="-mx-0.5 size-3 shrink-0 text-zinc-400" aria-hidden />
        Selected reply
        <span className="font-medium text-zinc-400">not in {header.outsideOf}</span>
      </h2>
    );
  }
  return (
    <h2 className={HEADER}>
      <CategoryDot category={header.category} />
      {REPLY_CATEGORY_LABELS[header.category]}
      <span className="font-medium tabular-nums text-zinc-400">{count}</span>
    </h2>
  );
}

function groupLabel(header: ReplyGroup["header"]): string {
  if (!header) return "Replies";
  return header.kind === "selected" ? `Selected reply, not in ${header.outsideOf}` : REPLY_CATEGORY_LABELS[header.category];
}

function receivedLabel(iso: string, today: string): string {
  return Math.abs(diffDays(today, iso)) <= 6 ? formatRelative(iso, today) : formatDateShort(iso);
}

function StatusTag({ view }: { view: ReplyView }) {
  const { reply } = view;
  if (reply.responseSentOn) {
    return (
      <Badge tone="green" icon={CornerUpLeft}>
        Response sent
      </Badge>
    );
  }
  if (reply.handled) {
    return (
      <Badge tone="neutral" icon={Check}>
        {reply.category === "bounce" ? "Handled automatically" : "Handled"}
      </Badge>
    );
  }
  return <Badge tone="indigo">Needs action</Badge>;
}

function ReplyRow({
  view,
  selected,
  selectionExplicit,
  today,
  showCategory,
  onSelect,
}: {
  view: ReplyView;
  selected: boolean;
  selectionExplicit: boolean;
  today: string;
  showCategory: boolean;
  onSelect: () => void;
}) {
  const { reply } = view;
  const context =
    reply.personKind === "hiring_contact"
      ? `Hiring Contact${view.prospect ? ` · ${view.prospect.name}` : ""}`
      : `Candidate${view.candidate ? ` · ${view.candidate.currentTitle}` : ""}`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cx(
        "flex w-full gap-3 border-l-2 px-4 py-3 text-left transition-colors",
        // On small screens the detail pane is hidden until a reply is picked, so the default selection is only marked on large screens.
        selected && selectionExplicit && "border-indigo-500 bg-indigo-50/70",
        selected && !selectionExplicit && "border-transparent hover:bg-zinc-50 lg:border-indigo-500 lg:bg-indigo-50/70 lg:hover:bg-indigo-50/70",
        !selected && "border-transparent hover:bg-zinc-50",
      )}
    >
      <span className="relative">
        <Avatar name={reply.personLabel} />
        {!reply.handled ? <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-indigo-500 ring-2 ring-white" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cx("truncate text-sm", reply.handled ? "font-medium text-zinc-700" : "font-semibold text-zinc-900")}>{reply.personLabel}</span>
          <span className="shrink-0 text-xs tabular-nums text-zinc-500">{receivedLabel(reply.receivedOn, today)}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-zinc-500">{context}</span>
        <span className={cx("mt-1 block truncate text-sm", reply.handled ? "text-zinc-500" : "text-zinc-700")}>{snippet(reply.body)}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {showCategory ? <CategoryBadge category={reply.category} /> : null}
          <StatusTag view={view} />
        </span>
      </span>
    </button>
  );
}

export function ReplyList({
  groups,
  filterCategory,
  selectedId,
  selectionExplicit,
  today,
  onSelect,
}: {
  groups: ReplyGroup[];
  /** The category picked in the filter, or null when showing every category. */
  filterCategory: ReplyCategory | null;
  selectedId: string | null;
  /** True once the Recruiter picked a reply (the detail pane is open on small screens). */
  selectionExplicit: boolean;
  today: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      {groups.map((group) => {
        // The badge is left out where the header or the category filter already names the category.
        const named = group.header?.kind === "category" ? group.header.category : filterCategory;
        return (
          <section key={group.key} aria-label={groupLabel(group.header)}>
            {group.header ? <GroupHeader header={group.header} count={group.items.length} /> : null}
            <ul className="divide-y divide-zinc-100">
              {group.items.map((view) => (
                <li key={view.reply.id} data-reply-row={view.reply.id} className="scroll-mt-9">
                  <ReplyRow
                    view={view}
                    selected={view.reply.id === selectedId}
                    selectionExplicit={selectionExplicit}
                    today={today}
                    showCategory={view.reply.category !== named}
                    onSelect={() => onSelect(view.reply.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
