"use client";

// Variant B "Split": a ranked list on the left, the full explanation of the focused item on the
// right. J / K or the up and down arrows move through the list. On a phone the list and the detail
// take turns.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, Lock } from "lucide-react";
import { FitMeter } from "@/components/domain/person-badges";
import { formatNumber } from "@/lib/format";
import { useFeed } from "./context";
import { ItemDetail } from "./detail";
import { SignalChips } from "./explain";
import { shouldIgnoreShortcut } from "./keys";
import { type FeedRow, claimInfo, newestSignalId, rowKey } from "./model";
import { CandidateRetentionBadge, ClaimBadge, NicheDot, PersonLifecycleBadge, ProspectStatusBadge, RoleChips } from "./parts";
import { Badge, Checkbox, Kbd, NewSignalBadge, SignalStrengthMeter, cx } from "./ui";

export function SplitVariant({
  rows,
  selected,
  onSelect,
}: {
  rows: FeedRow[];
  selected: Set<string>;
  onSelect: (keys: string[], on: boolean) => void;
}) {
  const { model } = useFeed();
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [lastIndex, setLastIndex] = useState(0);
  const [mobileDetail, setMobileDetail] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  let index = focusKey ? rows.findIndex((r) => rowKey(r) === focusKey) : -1;
  if (index === -1) index = Math.min(lastIndex, rows.length - 1);
  const focused = index >= 0 ? rows[index] : null;
  const focusedKey = focused ? rowKey(focused) : null;

  const go = (i: number, scroll = true) => {
    const target = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (!target) return;
    setFocusKey(rowKey(target));
    setLastIndex(Math.max(0, Math.min(rows.length - 1, i)));
    if (scroll) {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-key="${rowKey(target)}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  };
  const goRef = useRef(go);
  const indexRef = useRef(index);
  useEffect(() => {
    goRef.current = go;
    indexRef.current = index;
  });

  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [focusedKey]);

  // Room at the end of both panes so the last row and the last Signal scroll clear of the prototype
  // pills, and of the floating selection bar while something is selected.
  const anySelected = rows.some((r) => selected.has(rowKey(r)));
  const paneBottom = anySelected ? "lg:pb-32" : "lg:pb-16";

  // From lg the panes fill the viewport below the card's top, ending 16px above the bottom edge; the
  // panes' lg:pb-16 then lets the last row and the last Signal scroll clear of the prototype pills.
  // Measured after every render, since notices or the free trial banner above can change height.
  // The server render and the first client render use the CSS fallback, so hydration matches.
  const boxRef = useRef<HTMLDivElement>(null);
  const [paneHeight, setPaneHeight] = useState<number | null>(null);
  useEffect(() => {
    const fit = () => {
      const el = boxRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const next = Math.max(400, Math.round(window.innerHeight - top - 16));
      setPaneHeight((prev) => (prev === next ? prev : next));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e)) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        goRef.current(indexRef.current + 1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        goRef.current(indexRef.current - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={boxRef}
      style={paneHeight ? ({ "--split-h": `${paneHeight}px` } as CSSProperties) : undefined}
      className="relative overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 lg:grid lg:h-[var(--split-h,calc(100dvh-20rem))] lg:min-h-[400px] lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]"
    >
      <div className={cx("min-h-0 flex-col border-zinc-200 lg:flex lg:border-r", mobileDetail ? "hidden" : "flex")}>
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/80 px-4 py-2 text-[11px] text-zinc-500">
          <span>Ranked by Signal Strength</span>
          <span className="hidden items-center gap-1 lg:inline-flex">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd>
            to move
          </span>
        </div>
        <ul ref={listRef} className={cx("relative min-h-0 flex-1 divide-y divide-zinc-100 overflow-y-auto", paneBottom)} aria-label="Feed items">
          {rows.map((row, i) => {
            const key = rowKey(row);
            return (
              <ListItem
                key={key}
                row={row}
                active={key === focusedKey}
                isSelected={selected.has(key)}
                onSelect={(on) => onSelect([key], on)}
                onOpen={() => {
                  go(i, false);
                  setMobileDetail(true);
                }}
                selectable={row.kind !== "preview" && !(row.kind === "candidate" && claimInfo(model, row.candidate.claim).kind === "other")}
              />
            );
          })}
        </ul>
      </div>
      <div ref={detailRef} className={cx("relative min-h-0 overflow-y-auto lg:block", mobileDetail ? "block" : "hidden")}>
        <div className="sticky top-0 z-10 flex items-center border-b border-zinc-200 bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setMobileDetail(false)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
            <ChevronLeft className="size-4" aria-hidden />
            Back to the list
          </button>
        </div>
        {focused ? (
          <div className={cx("px-4 pt-4 pb-4 sm:px-6 sm:pt-6 sm:pb-6", paneBottom)}>
            <ItemDetail row={focused} layout="pane" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ListItem({
  row,
  active,
  isSelected,
  selectable,
  onSelect,
  onOpen,
}: {
  row: FeedRow;
  active: boolean;
  isSelected: boolean;
  selectable: boolean;
  onSelect: (on: boolean) => void;
  onOpen: () => void;
}) {
  const { model } = useFeed();
  let title: string;
  let sub: string;
  let badges: ReactNode = null;
  let extra: ReactNode = null;
  let signal: number;
  let fit: number;
  let threshold: number;
  if (row.kind === "prospect") {
    const p = row.prospect;
    title = p.name;
    sub = `${p.sector} · ${formatNumber(p.headcount)} people · ${p.location.split(",")[0]}`;
    badges = (
      <>
        {p.hasNewSignal ? <NewSignalBadge compact /> : null}
        <ProspectStatusBadge status={p.status} />
      </>
    );
    extra = (
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
        <SignalChips breakdown={p.breakdown} max={2} newSignalId={newestSignalId(p)} />
        <RoleChips roles={model.rolesByProspect.get(p.id) ?? []} max={1} today={model.today} empty={false} />
      </div>
    );
    signal = p.signalStrength;
    fit = p.fit.score;
    threshold = p.fit.threshold;
  } else if (row.kind === "candidate") {
    const c = row.candidate;
    title = c.name;
    sub = `${c.currentTitle} at ${c.currentEmployer}`;
    badges = <PersonLifecycleBadge lifecycle={c.lifecycle} />;
    const claim = claimInfo(model, c.claim);
    extra = (
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
        <CandidateRetentionBadge candidate={c} model={model} />
        {claim.kind !== "none" ? <ClaimBadge info={claim} /> : <SignalChips breakdown={c.breakdown} max={1} />}
      </div>
    );
    signal = c.signalStrength;
    fit = c.fit.score;
    threshold = c.fit.threshold;
  } else {
    const pv = row.preview;
    title = "Anonymised Candidate";
    sub = pv.summary;
    badges = (
      <Badge tone="violet" icon={<Lock className="size-3" aria-hidden />}>
        Preview
      </Badge>
    );
    extra = (
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
        <SignalChips breakdown={pv.breakdown} max={2} />
      </div>
    );
    signal = pv.signalStrength;
    fit = pv.fit;
    threshold = pv.fitDetail.threshold;
  }
  const nicheId = row.kind === "prospect" ? row.prospect.nicheIds[0] : row.kind === "candidate" ? row.candidate.nicheIds[0] : row.preview.nicheId;
  return (
    <li
      data-key={rowKey(row)}
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      className={cx(
        "relative flex cursor-pointer gap-3 px-4 py-3 transition-colors",
        active ? "bg-indigo-50/70" : isSelected ? "bg-indigo-50/30" : "hover:bg-zinc-50",
      )}
    >
      {active ? <span className="absolute inset-y-0 left-0 w-0.5 bg-indigo-600" aria-hidden /> : null}
      <div className="flex flex-col items-center gap-2 pt-0.5">
        {selectable ? (
          <Checkbox checked={isSelected} onChange={onSelect} label={`Select ${title}`} />
        ) : (
          <Lock className="size-4 text-zinc-300" aria-label="Not selectable" />
        )}
        <span className="text-[11px] text-zinc-400 tabular-nums">{row.rank}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* Badges wrap under the name rather than cutting it. */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
              <NicheDot niche={model.nicheById.get(nicheId)} />
              <span className={cx("text-sm font-medium break-words", active ? "text-indigo-950" : "text-zinc-900")}>{title}</span>
              {badges}
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500">{sub}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <SignalStrengthMeter value={signal} />
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
              Fit <FitMeter score={fit} threshold={threshold} />
            </span>
          </div>
        </div>
        {extra}
      </div>
    </li>
  );
}
