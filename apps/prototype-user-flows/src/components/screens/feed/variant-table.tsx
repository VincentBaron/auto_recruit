"use client";

// Variant A "Table": a dense multi-select table. Click a row to expand its explanation inline;
// sort by any score column (the number under each checkbox always shows the Signal Strength rank, as
// in the Split list). Below md the rows
// become stacked cards, so nothing scrolls sideways on a phone.

import { Fragment, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Lock, Mail, Smartphone } from "lucide-react";
import { FitMeter } from "@/components/domain/person-badges";
import { Select } from "@/components/ui/select";
import { formatDateShort, formatNumber, formatRelative, plural } from "@/lib/format";
import { DISMISS_REASON_LABELS } from "@/lib/labels";
import type { Candidate, Prospect } from "@/lib/types";
import { useFeed } from "./context";
import { ItemDetail } from "./detail";
import { SignalChips } from "./explain";
import { type FeedModel, type FeedRow, type FeedSort, type FeedTab, type FeedView, claimInfo, hasEmail, hasMobile, newestSignalId, rowKey } from "./model";
import { CandidateRetentionBadge, ClaimBadge, NicheDot, ProspectStatusBadge, RoleChips } from "./parts";
import { Badge, Checkbox, NewSignalBadge, SignalStrengthMeter, cx } from "./ui";

const SORT_LABELS: Record<FeedSort, string> = {
  signal: "Signal Strength",
  fit: "Fit",
  surfaced: "Surfaced, newest first",
  name: "Name",
};

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: FeedSort;
  sort: FeedSort;
  onSort: (s: FeedSort) => void;
  className?: string;
}) {
  const active = sort === sortKey;
  const Icon = sortKey === "name" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={cx("px-1.5 py-2 font-medium whitespace-nowrap", className)} aria-sort={active ? (sortKey === "name" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cx("inline-flex items-center gap-1 rounded hover:text-zinc-900", active ? "text-zinc-900" : "text-zinc-500")}
      >
        {label}
        <Icon className={cx("size-3", active ? "opacity-100" : "opacity-0")} aria-hidden />
      </button>
    </th>
  );
}

function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cx("px-1.5 py-2 font-medium whitespace-nowrap text-zinc-500", className)}>
      {children}
    </th>
  );
}

function isSelectable(model: FeedModel, row: FeedRow): boolean {
  return row.kind !== "preview" && !(row.kind === "candidate" && claimInfo(model, row.candidate.claim).kind === "other");
}

export function TableVariant({
  rows,
  tab,
  view,
  selected,
  onSelect,
  sort,
  onSort,
}: {
  rows: FeedRow[];
  tab: FeedTab;
  view: FeedView;
  selected: Set<string>;
  onSelect: (keys: string[], on: boolean) => void;
  sort: FeedSort;
  onSort: (s: FeedSort) => void;
}) {
  const { model } = useFeed();
  const [expanded, setExpanded] = useState<string | null>(null);
  const selectableKeys = rows.filter((r) => isSelectable(model, r)).map(rowKey);
  const selectedHere = selectableKeys.filter((k) => selected.has(k));
  const allOn = selectableKeys.length > 0 && selectedHere.length === selectableKeys.length;
  const prospects = tab === "prospects";
  const colCount = prospects ? 9 : 8;
  const toggle = (key: string) => setExpanded((e) => (e === key ? null : key));
  const selectAll = (
    <Checkbox checked={allOn} indeterminate={selectedHere.length > 0} disabled={selectableKeys.length === 0} onChange={(v) => onSelect(selectableKeys, v)} label="Select all" />
  );

  return (
    <div className="overflow-clip rounded-xl bg-white ring-1 ring-zinc-200">
      {/* Below md: one stacked card per item. */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50/80 py-2 pr-3 pl-4">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-600">
            {selectAll}
            Select all
          </label>
          <Select value={sort} onChange={(e) => onSort(e.target.value as FeedSort)} aria-label="Sort by" className="w-[190px]">
            {(prospects ? (["signal", "fit", "surfaced", "name"] as const) : (["signal", "fit", "name"] as const)).map((k) => (
              <option key={k} value={k}>
                Sort: {SORT_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
        <ul className="divide-y divide-zinc-100" aria-label={prospects ? "Prospects" : "Candidates"}>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <RowCard
                key={key}
                row={row}
                view={view}
                open={expanded === key}
                onToggle={() => toggle(key)}
                isSelected={selected.has(key)}
                onSelect={(on) => onSelect([key], on)}
                onDismissed={() => setExpanded(null)}
              />
            );
          })}
        </ul>
      </div>

      {/* From md: the table. It only scrolls sideways between md and the 1280px the prototype targets. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[940px] table-fixed text-left text-sm">
          {/* Widths fit each header, meter and badge exactly (cells pad 6px a side), so the name column
              keeps the rest: at 1280px the Prospect and Candidate lines fit on one line. Long Signal and
              Detected Role chips wrap below 1400px and get one line from there. */}
          <colgroup>
            <col className="w-9" />
            <col />
            <col className="w-[116px]" />
            <col className="w-[100px]" />
            <col className={prospects ? "w-[126px] min-[1400px]:w-[196px]" : "w-[160px]"} />
            <col className={prospects ? "w-[156px] min-[1400px]:w-[232px]" : "w-[170px]"} />
            <col className={prospects ? "w-[104px]" : "w-[58px]"} />
            {prospects ? <col className="w-[80px]" /> : null}
            <col className="w-6" />
          </colgroup>
          <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs">
            <tr>
              <th scope="col" className="py-2 pl-4">
                {selectAll}
              </th>
              <SortHeader label={prospects ? "Prospect" : "Candidate"} sortKey="name" sort={sort} onSort={onSort} />
              <SortHeader label="Signal Strength" sortKey="signal" sort={sort} onSort={onSort} />
              <SortHeader label="Fit" sortKey="fit" sort={sort} onSort={onSort} />
              <Th>Top Signals</Th>
              {prospects ? <Th>Detected Roles</Th> : <Th>Retention</Th>}
              {prospects ? <Th>Hiring Contacts</Th> : <Th>Contact</Th>}
              {prospects ? <SortHeader label="Surfaced" sortKey="surfaced" sort={sort} onSort={onSort} /> : null}
              <Th>
                <span className="sr-only">Expand</span>
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => {
              const key = rowKey(row);
              const open = expanded === key;
              const isSelected = selected.has(key);
              return (
                <Fragment key={key}>
                  <tr
                    onClick={() => toggle(key)}
                    className={cx("group cursor-pointer align-middle transition-colors", isSelected ? "bg-indigo-50/50" : open ? "bg-zinc-50" : "hover:bg-zinc-50/70")}
                    aria-expanded={open}
                  >
                    <RowCells row={row} isSelected={isSelected} onSelect={(on) => onSelect([key], on)} view={view} />
                    <td className="py-2.5 pr-1.5 text-zinc-400">
                      <ChevronRight className={cx("size-4 transition-transform", open && "rotate-90 text-zinc-700")} aria-hidden />
                    </td>
                  </tr>
                  {open ? (
                    <tr className="bg-zinc-50">
                      <td colSpan={colCount} className="border-t border-zinc-100 px-4 pt-3 pb-5 sm:pr-6 sm:pl-[42px]">
                        <ItemDetail row={row} layout="inline" showHeader={false} onDismissed={() => setExpanded(null)} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/60 px-4 py-2 text-xs text-zinc-500">
        <span>{plural(rows.length, prospects ? "Prospect" : "Candidate")}</span>
        <span className="md:hidden">Tap an item for its explanation</span>
        <span className="hidden md:inline">Click a row for its explanation</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared row content                                                  */
/* ------------------------------------------------------------------ */

function prospectMeta(p: Prospect): string {
  return `${p.sector} · ${formatNumber(p.headcount)} people · ${p.location.split(",")[0]}`;
}

function candidateMeta(c: Candidate): string {
  return `${c.currentTitle} at ${c.currentEmployer}`;
}

/** The Niche dot and a meta line that wraps rather than being cut. */
function MetaLine({ nicheId, children, title }: { nicheId: string | undefined; children: ReactNode; title?: string }) {
  const { model } = useFeed();
  return (
    <p className="mt-0.5 flex min-w-0 items-start gap-1.5 text-xs text-zinc-500" title={title}>
      <NicheDot niche={nicheId ? model.nicheById.get(nicheId) : undefined} className="mt-[5px]" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

function DismissedLine({ reason }: { reason: string }) {
  return <p className="mt-0.5 text-xs text-zinc-500">Dismissed: {reason}</p>;
}

function ContactIcons({ c }: { c: Candidate }) {
  const email = hasEmail(c, "candidate");
  const mobile = hasMobile(c);
  return (
    <span className="inline-flex items-center gap-1.5" title={email ? "Enriched" : "Not Enriched yet"}>
      <Mail className={cx("size-3.5", email ? "text-emerald-600" : "text-zinc-300")} aria-label={email ? "Personal email found" : "No email yet"} />
      <Smartphone className={cx("size-3.5", mobile ? "text-emerald-600" : "text-zinc-300")} aria-label={mobile ? "Mobile found" : "No mobile"} />
    </span>
  );
}

function HiringContactsSummary({ p }: { p: Prospect }) {
  const { model } = useFeed();
  const contacts = model.contactsByProspect.get(p.id) ?? [];
  const previews = model.hcPreviewsByProspect.get(p.id) ?? [];
  if (model.isFreeTrial) {
    return previews.length === 0 ? (
      <span className="text-zinc-400">None yet</span>
    ) : (
      <span className="inline-flex items-center gap-1 text-violet-700" title="Previews only in the free trial">
        <Lock className="size-3" aria-hidden />
        {plural(previews.length, "Preview")}
      </span>
    );
  }
  if (contacts.length === 0) return <span className="text-zinc-400">None yet</span>;
  const enriched = contacts.filter((h) => hasEmail(h, "hiring_contact")).length;
  const claimed = contacts.filter((h) => h.claim).length;
  return (
    <span className="flex flex-col leading-tight" title={claimed > 0 ? `${claimed} in a Campaign (claimed)` : undefined}>
      <span className="text-zinc-800 tabular-nums">{Math.min(3, contacts.length)} ranked</span>
      <span className={cx("inline-flex items-center gap-1 tabular-nums", enriched > 0 ? "text-emerald-700" : "text-zinc-400")}>
        {enriched} Enriched
        {claimed > 0 ? <Lock className="size-3 text-indigo-500" aria-label={`${claimed} claimed`} /> : null}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Table cells (md and up)                                             */
/* ------------------------------------------------------------------ */

/** The selection control with the Signal Strength rank under it. */
function SelectCell({ rank, children }: { rank: number; children: ReactNode }) {
  return (
    <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex w-4 flex-col items-center gap-1">
        {children}
        <span className="text-[11px] leading-4 text-zinc-400 tabular-nums" title="Rank by Signal Strength">
          {rank}
        </span>
      </div>
    </td>
  );
}

function RowCells({ row, isSelected, onSelect, view }: { row: FeedRow; isSelected: boolean; onSelect: (on: boolean) => void; view: FeedView }) {
  const { model } = useFeed();

  if (row.kind === "preview") {
    const pv = row.preview;
    return (
      <>
        <SelectCell rank={row.rank}>
          <Lock className="size-4 text-violet-400" aria-label="Preview: not selectable" />
        </SelectCell>
        <td className="min-w-0 px-1.5 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-zinc-800">Anonymised Candidate</span>
            <Badge tone="violet">Preview</Badge>
          </div>
          <MetaLine nicheId={pv.nicheId}>{pv.summary}</MetaLine>
        </td>
        <td className="px-1.5 py-2.5">
          <SignalStrengthMeter value={pv.signalStrength} />
        </td>
        <td className="px-1.5 py-2.5">
          <FitMeter score={pv.fit} threshold={pv.fitDetail.threshold} />
        </td>
        <td className="px-1.5 py-2.5">
          <SignalChips breakdown={pv.breakdown} max={1} wrap />
        </td>
        <td className="px-1.5 py-2.5 text-xs text-zinc-400">Not stored</td>
        <td className="px-1.5 py-2.5 text-xs text-zinc-400">-</td>
      </>
    );
  }

  if (row.kind === "prospect") {
    const p = row.prospect;
    return (
      <>
        <SelectCell rank={row.rank}>
          <Checkbox checked={isSelected} onChange={onSelect} label={`Select ${p.name}`} />
        </SelectCell>
        <td className="min-w-0 px-1.5 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium break-words text-zinc-900">{p.name}</span>
            {p.hasNewSignal ? <NewSignalBadge compact /> : null}
            {p.status !== "dismissed" ? <ProspectStatusBadge status={p.status} /> : null}
          </div>
          <MetaLine nicheId={p.nicheIds[0]}>{prospectMeta(p)}</MetaLine>
          {view === "dismissed" && p.dismissReason ? <DismissedLine reason={DISMISS_REASON_LABELS[p.dismissReason]} /> : null}
        </td>
        <td className="px-1.5 py-2.5">
          <SignalStrengthMeter value={p.signalStrength} />
        </td>
        <td className="px-1.5 py-2.5">
          <FitMeter score={p.fit.score} threshold={p.fit.threshold} />
        </td>
        <td className="px-1.5 py-2.5">
          <SignalChips breakdown={p.breakdown} max={1} newSignalId={newestSignalId(p)} wrap />
        </td>
        <td className="px-1.5 py-2.5">
          <RoleChips roles={model.rolesByProspect.get(p.id) ?? []} max={1} today={model.today} wrap />
        </td>
        <td className="px-1.5 py-2.5 text-xs">
          <HiringContactsSummary p={p} />
        </td>
        <td className="px-1.5 py-2.5 text-xs whitespace-nowrap text-zinc-500 tabular-nums" title={`Surfaced ${formatRelative(p.surfacedOn, model.today)}`}>
          {formatDateShort(p.surfacedOn)}
        </td>
      </>
    );
  }

  const c = row.candidate;
  const claim = claimInfo(model, c.claim);
  const lockedOut = claim.kind === "other";
  return (
    <>
      <SelectCell rank={row.rank}>
        <Checkbox
          checked={isSelected && !lockedOut}
          disabled={lockedOut}
          onChange={onSelect}
          label={`Select ${c.name}`}
          title={lockedOut ? `Claimed by ${claim.recruiterName}: cannot be selected` : undefined}
        />
      </SelectCell>
      <td className="min-w-0 px-1.5 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium break-words text-zinc-900">{c.name}</span>
          <ClaimBadge info={claim} />
        </div>
        <MetaLine nicheId={c.nicheIds[0]} title={`${candidateMeta(c)} · ${c.location}`}>
          {candidateMeta(c)}
        </MetaLine>
        {view === "dismissed" && c.dismissReason ? <DismissedLine reason={DISMISS_REASON_LABELS[c.dismissReason]} /> : null}
      </td>
      <td className="px-1.5 py-2.5">
        <SignalStrengthMeter value={c.signalStrength} />
      </td>
      <td className="px-1.5 py-2.5">
        <FitMeter score={c.fit.score} threshold={c.fit.threshold} />
      </td>
      <td className="px-1.5 py-2.5">
        <SignalChips breakdown={c.breakdown} max={1} wrap />
      </td>
      <td className="px-1.5 py-2.5">
        <CandidateRetentionBadge candidate={c} model={model} />
      </td>
      <td className="px-1.5 py-2.5">
        <ContactIcons c={c} />
      </td>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked cards (below md)                                            */
/* ------------------------------------------------------------------ */

function Scores({ signal, fit, threshold }: { signal: number; fit: number; threshold: number }) {
  return (
    <dl className="mt-2 grid w-fit grid-cols-[auto_auto] items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
      <dt>Signal Strength</dt>
      <dd>
        <SignalStrengthMeter value={signal} />
      </dd>
      <dt>Fit</dt>
      <dd>
        <FitMeter score={fit} threshold={threshold} />
      </dd>
    </dl>
  );
}

function RowCard({
  row,
  view,
  open,
  onToggle,
  isSelected,
  onSelect,
  onDismissed,
}: {
  row: FeedRow;
  view: FeedView;
  open: boolean;
  onToggle: () => void;
  isSelected: boolean;
  onSelect: (on: boolean) => void;
  onDismissed: () => void;
}) {
  const { model } = useFeed();
  let name: string;
  let control: ReactNode;
  let badges: ReactNode = null;
  let body: ReactNode;

  if (row.kind === "preview") {
    const pv = row.preview;
    name = "Anonymised Candidate";
    control = <Lock className="size-4 text-violet-400" aria-label="Preview: not selectable" />;
    badges = <Badge tone="violet">Preview</Badge>;
    body = (
      <>
        <MetaLine nicheId={pv.nicheId}>{pv.summary}</MetaLine>
        <Scores signal={pv.signalStrength} fit={pv.fit} threshold={pv.fitDetail.threshold} />
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1">
          <SignalChips breakdown={pv.breakdown} max={1} wrap />
        </div>
      </>
    );
  } else if (row.kind === "prospect") {
    const p = row.prospect;
    name = p.name;
    control = <Checkbox checked={isSelected} onChange={onSelect} label={`Select ${p.name}`} />;
    if (p.hasNewSignal || p.status !== "dismissed") {
      badges = (
        <>
          {p.hasNewSignal ? <NewSignalBadge compact /> : null}
          {p.status !== "dismissed" ? <ProspectStatusBadge status={p.status} /> : null}
        </>
      );
    }
    const roles = model.rolesByProspect.get(p.id) ?? [];
    body = (
      <>
        <MetaLine nicheId={p.nicheIds[0]}>{prospectMeta(p)}</MetaLine>
        {view === "dismissed" && p.dismissReason ? <DismissedLine reason={DISMISS_REASON_LABELS[p.dismissReason]} /> : null}
        <Scores signal={p.signalStrength} fit={p.fit.score} threshold={p.fit.threshold} />
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1">
          <SignalChips breakdown={p.breakdown} max={1} newSignalId={newestSignalId(p)} wrap />
          <RoleChips roles={roles} max={1} today={model.today} empty={false} wrap />
        </div>
      </>
    );
  } else {
    const c = row.candidate;
    const claim = claimInfo(model, c.claim);
    const lockedOut = claim.kind === "other";
    name = c.name;
    control = (
      <Checkbox
        checked={isSelected && !lockedOut}
        disabled={lockedOut}
        onChange={onSelect}
        label={`Select ${c.name}`}
        title={lockedOut ? `Claimed by ${claim.recruiterName}: cannot be selected` : undefined}
      />
    );
    badges = (
      <>
        <ClaimBadge info={claim} />
        <CandidateRetentionBadge candidate={c} model={model} />
      </>
    );
    body = (
      <>
        <MetaLine nicheId={c.nicheIds[0]}>{`${candidateMeta(c)} · ${c.location}`}</MetaLine>
        {view === "dismissed" && c.dismissReason ? <DismissedLine reason={DISMISS_REASON_LABELS[c.dismissReason]} /> : null}
        <Scores signal={c.signalStrength} fit={c.fit.score} threshold={c.fit.threshold} />
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <SignalChips breakdown={c.breakdown} max={1} wrap />
          <ContactIcons c={c} />
        </div>
      </>
    );
  }

  return (
    <li className={cx("transition-colors", isSelected ? "bg-indigo-50/50" : open && "bg-zinc-50")}>
      <div className="flex cursor-pointer gap-3 py-3 pr-2 pl-4" onClick={onToggle}>
        <div className="flex flex-col items-center gap-1.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
          {control}
          <span className="text-[11px] text-zinc-400 tabular-nums">{row.rank}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words text-zinc-900">{name}</p>
          {badges ? <div className="mt-1 flex flex-wrap items-center gap-1">{badges}</div> : null}
          {body}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-expanded={open}
          aria-label={open ? `Hide the explanation for ${name}` : `Show the explanation for ${name}`}
          className="flex size-8 shrink-0 items-center justify-center self-start rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <ChevronRight className={cx("size-4 transition-transform", open && "rotate-90 text-zinc-700")} aria-hidden />
        </button>
      </div>
      {open ? (
        <div className="border-t border-zinc-100 bg-zinc-50 px-4 pt-3 pb-5">
          <ItemDetail row={row} layout="inline" showHeader={false} onDismissed={onDismissed} />
        </div>
      ) : null}
    </li>
  );
}
