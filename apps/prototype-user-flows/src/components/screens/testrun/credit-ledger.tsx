"use client";

// The Credit ledger grouped by day and reason, newest day first. A reason with several entries
// (one per Niche run or Campaign) expands to show each one.

import { useMemo, useState } from "react";
import {
  Building,
  ChevronDown,
  CreditCard,
  FlaskConical,
  Mail,
  ReceiptText,
  RefreshCw,
  Send,
  Smartphone,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Select } from "@/components/ui/select";
import { formatCredits, formatDelta, formatRelative, formatWeekdayDate } from "@/lib/format";
import { CREDIT_REASON_LABELS } from "@/lib/pricing";
import type { CreditLedgerEntry, CreditReason, ISODate, Niche } from "@/lib/types";
import { Badge, Button, Card, CardHeader, cx, EmptyState, Segmented } from "./ui";

const REASON_ICONS: Record<CreditReason, LucideIcon> = {
  pack_purchase: CreditCard,
  auto_top_up: RefreshCw,
  surfaced_prospect: Building,
  surfaced_candidate: UserRound,
  hiring_contact_found: Users,
  verified_email: Mail,
  mobile: Smartphone,
  email_sent: Send,
  free_test_run: FlaskConical,
};

/** Quantity unit per reason, for "x 12 Prospects". */
const REASON_UNITS: Partial<Record<CreditReason, [string, string]>> = {
  surfaced_prospect: ["Prospect", "Prospects"],
  surfaced_candidate: ["Candidate", "Candidates"],
  hiring_contact_found: ["Hiring Contact", "Hiring Contacts"],
  verified_email: ["email", "emails"],
  mobile: ["number", "numbers"],
  email_sent: ["email", "emails"],
};

const PAGE_DAYS = 10;

type Kind = "all" | "purchases" | "spending";

function isPurchase(e: CreditLedgerEntry): boolean {
  return e.reason === "pack_purchase" || e.reason === "auto_top_up";
}

interface RefLine {
  ref: string;
  delta: number;
  quantity: number;
}

interface ReasonGroup {
  reason: CreditReason;
  delta: number;
  quantity: number;
  refs: RefLine[];
}

interface DayGroup {
  on: ISODate;
  delta: number;
  balanceAfter: number | null;
  reasons: ReasonGroup[];
}

function groupByDay(entries: CreditLedgerEntry[], all: CreditLedgerEntry[]): DayGroup[] {
  const endBalance = new Map<ISODate, number>();
  for (const e of all) endBalance.set(e.on, e.balanceAfter);
  const days = new Map<ISODate, Map<CreditReason, ReasonGroup>>();
  for (const e of entries) {
    let reasons = days.get(e.on);
    if (!reasons) {
      reasons = new Map();
      days.set(e.on, reasons);
    }
    let group = reasons.get(e.reason);
    if (!group) {
      group = { reason: e.reason, delta: 0, quantity: 0, refs: [] };
      reasons.set(e.reason, group);
    }
    group.delta += e.delta;
    group.quantity += e.quantity;
    const line = group.refs.find((r) => r.ref === e.ref);
    if (line) {
      line.delta += e.delta;
      line.quantity += e.quantity;
    } else group.refs.push({ ref: e.ref, delta: e.delta, quantity: e.quantity });
  }
  return Array.from(days.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([on, reasons]) => {
      const groups = Array.from(reasons.values()).sort((a, b) => {
        const pa = a.delta > 0 ? 1 : 0;
        const pb = b.delta > 0 ? 1 : 0;
        return pb - pa || Math.abs(b.delta) - Math.abs(a.delta);
      });
      return { on, delta: groups.reduce((s, g) => s + g.delta, 0), balanceAfter: endBalance.get(on) ?? null, reasons: groups };
    });
}

function quantityText(reason: CreditReason, quantity: number): string | null {
  const unit = REASON_UNITS[reason];
  if (!unit) return null;
  return `${formatCredits(quantity)} ${quantity === 1 ? unit[0] : unit[1]}`;
}

function DeltaText({ delta, className }: { delta: number; className?: string }) {
  return <span className={cx("tabular-nums", delta > 0 ? "text-emerald-700" : delta < 0 ? "text-zinc-900" : "text-zinc-500", className)}>{formatDelta(delta)}</span>;
}

export function CreditLedger({ entries, niches, today }: { entries: CreditLedgerEntry[]; niches: Niche[]; today: ISODate }) {
  const [kind, setKind] = useState<Kind>("all");
  const [nicheFilter, setNicheFilter] = useState<string>("all");
  const [daysShown, setDaysShown] = useState(PAGE_DAYS);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (kind === "purchases" && !isPurchase(e)) return false;
        if (kind === "spending" && isPurchase(e)) return false;
        if (nicheFilter === "none") return e.nicheId === null;
        if (nicheFilter !== "all") return e.nicheId === nicheFilter;
        return true;
      }),
    [entries, kind, nicheFilter],
  );
  const days = useMemo(() => groupByDay(filtered, entries), [filtered, entries]);
  const visible = days.slice(0, daysShown);
  const hidden = days.length - visible.length;

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader icon={ReceiptText} title="Ledger" description="Every Credit added or spent, grouped by day and reason." />
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
        <Segmented
          label="Entry type"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setDaysShown(PAGE_DAYS);
          }}
          options={[
            { value: "all", label: "All" },
            { value: "purchases", label: "Purchases" },
            { value: "spending", label: "Spending" },
          ]}
        />
        <Select
          aria-label="Filter by Niche"
          value={nicheFilter}
          onChange={(e) => {
            setNicheFilter(e.target.value);
            setDaysShown(PAGE_DAYS);
          }}
          className="w-64 max-w-full min-w-0"
        >
          <option value="all">All Niches</option>
          {niches.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
          <option value="none">Not tied to a Niche</option>
        </Select>
      </div>

      {days.length === 0 ? (
        <EmptyState icon={ReceiptText} title={entries.length === 0 ? "No Credit activity yet" : "No entry for these filters"}>
          {entries.length === 0 ? "Purchases and spending appear here, one line per day and reason." : "Change the entry type or the Niche to see more."}
        </EmptyState>
      ) : (
        <div>
          {visible.map((day) => (
            <section key={day.on} aria-label={formatWeekdayDate(day.on)}>
              <div className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50/80 px-4 py-1.5 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-semibold text-zinc-700">{formatWeekdayDate(day.on)}</span>
                  <span className="truncate text-zinc-400">{formatRelative(day.on, today)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <DeltaText delta={day.delta} className="font-semibold" />
                  {day.balanceAfter !== null && <span className="hidden text-zinc-400 tabular-nums sm:inline">balance {formatCredits(day.balanceAfter)}</span>}
                </span>
              </div>
              <ul className="divide-y divide-zinc-100 border-b border-zinc-100">
                {day.reasons.map((g) => {
                  const key = `${day.on}|${g.reason}`;
                  const Icon = REASON_ICONS[g.reason];
                  const open = expanded.has(key);
                  const qty = quantityText(g.reason, g.quantity);
                  const many = g.refs.length > 1;
                  return (
                    <li key={key}>
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <span
                          className={cx(
                            "flex size-7 shrink-0 items-center justify-center rounded-md",
                            g.delta > 0 ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-500",
                          )}
                          aria-hidden
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-x-2 text-sm text-zinc-900">
                            <span className="font-medium">{CREDIT_REASON_LABELS[g.reason]}</span>
                            {qty && <span className="text-xs text-zinc-500 tabular-nums">{qty}</span>}
                            {g.reason === "free_test_run" && <Badge tone="indigo">Free</Badge>}
                          </p>
                          <p className="truncate text-xs text-zinc-500" title={g.refs.map((r) => r.ref).join("\n")}>
                            {many ? `${g.refs.length} entries: ${g.refs.map((r) => r.ref).join(" · ")}` : g.refs[0]?.ref}
                          </p>
                        </div>
                        {many && (
                          <button
                            type="button"
                            onClick={() => toggle(key)}
                            aria-expanded={open}
                            className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                            aria-label={open ? "Hide entries" : "Show entries"}
                          >
                            <ChevronDown className={cx("size-4 transition-transform", open && "rotate-180")} aria-hidden />
                          </button>
                        )}
                        <DeltaText delta={g.delta} className="w-16 shrink-0 text-right text-sm font-medium" />
                      </div>
                      {many && open && (
                        <ul className="pb-2">
                          {g.refs.map((r) => (
                            <li key={r.ref} className="flex items-center gap-3 py-1 pr-4 pl-14 text-xs">
                              <span className="min-w-0 flex-1 truncate text-zinc-600" title={r.ref}>
                                {r.ref}
                              </span>
                              {quantityText(g.reason, r.quantity) && <span className="shrink-0 text-zinc-400 tabular-nums">{quantityText(g.reason, r.quantity)}</span>}
                              <DeltaText delta={r.delta} className="w-16 shrink-0 text-right" />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {hidden > 0 && (
            <div className="flex items-center justify-center px-4 py-3">
              <Button size="sm" variant="ghost" onClick={() => setDaysShown((n) => n + PAGE_DAYS)}>
                Show {Math.min(PAGE_DAYS, hidden)} more {Math.min(PAGE_DAYS, hidden) === 1 ? "day" : "days"} ({hidden} left)
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
