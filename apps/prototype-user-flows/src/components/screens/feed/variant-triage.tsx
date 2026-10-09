"use client";

// Variant C "Triage": one Surfaced item at a time, decided with the keyboard. Marking for
// Enrichment fills a tray; the Recruiter confirms the whole tray, with its cost, in one go.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCheck, ChevronLeft, ChevronRight, CircleSlash, Keyboard, Mail, Smartphone, Sparkles, Trash, Undo2 } from "lucide-react";
import { PriceHint } from "@/components/ui/price-hint";
import { formatCreditsLabel, plural } from "@/lib/format";
import { PRICES } from "@/lib/pricing";
import type { PersonRef } from "@/lib/types";
import { type EnrichGroup, useFeed } from "./context";
import { ItemDetail } from "./detail";
import { dismissReasonsFor } from "./dialogs";
import { shouldIgnoreShortcut } from "./keys";
import { type FeedRow, type FeedTab, type FeedView, claimInfo, enrichBlocker, enrichEstimate, getPerson, rowKey, topEnrichableContact } from "./model";
import { Button, ButtonLink, EmptyState, Kbd, cx } from "./ui";

interface Mark {
  ref: PersonRef;
  name: string;
  context: string;
  mobile: boolean;
}

export function TriageVariant({ rows, tab, view }: { rows: FeedRow[]; tab: FeedTab; view: FeedView }) {
  const { model, openEnrich, openDismiss, restore } = useFeed();
  const router = useRouter();
  // Triage only walks the items nobody acted on yet.
  const queue = rows.filter((r) =>
    view === "dismissed"
      ? true
      : r.kind === "prospect"
        ? r.prospect.status === "surfaced"
        : r.kind === "candidate"
          ? r.candidate.lifecycle === "surfaced"
          : true,
  );
  const skippedOpen = rows.length - queue.length;

  const [cursorKey, setCursorKey] = useState<string | null>(null);
  const [lastIndex, setLastIndex] = useState(0);
  const [marks, setMarks] = useState<Map<string, Mark>>(() => new Map());

  let index = cursorKey ? queue.findIndex((r) => rowKey(r) === cursorKey) : -1;
  if (index === -1) index = Math.min(lastIndex, queue.length - 1);
  const current = index >= 0 ? queue[index] : null;
  const currentKey = current ? rowKey(current) : null;

  const go = (i: number) => {
    if (queue.length === 0) return;
    const clamped = Math.max(0, Math.min(queue.length - 1, i));
    setCursorKey(rowKey(queue[clamped]));
    setLastIndex(clamped);
  };

  /** The person E marks for the current item: the Candidate, or the best Hiring Contact to enrich. */
  const markTarget = (row: FeedRow | null): Mark | null => {
    if (!row || model.isFreeTrial) return null;
    if (row.kind === "candidate") {
      const c = row.candidate;
      if (enrichBlocker(model, c, "candidate")) return null;
      return { ref: { kind: "candidate", id: c.id }, name: c.name, context: `${c.currentTitle} at ${c.currentEmployer}`, mobile: false };
    }
    if (row.kind === "prospect") {
      const h = topEnrichableContact(model, row.prospect.id);
      if (!h) return null;
      return { ref: { kind: "hiring_contact", id: h.id }, name: h.name, context: `${h.title} at ${row.prospect.name}`, mobile: false };
    }
    return null;
  };
  const target = view === "open" ? markTarget(current) : null;
  const isMarked = currentKey ? marks.has(currentKey) : false;

  /** Keyboard E: mark (keeping a ticked mobile) and go to the next; already marked just moves on. */
  const markAndNext = () => {
    if (!currentKey) return;
    if (!marks.has(currentKey)) {
      if (!target) return;
      setMarks((m) => new Map(m).set(currentKey, target));
    }
    go(index + 1);
  };

  const unmark = (key: string | null) => {
    if (!key) return;
    setMarks((m) => {
      if (!m.has(key)) return m;
      const next = new Map(m);
      next.delete(key);
      return next;
    });
  };

  /** Mouse: the button toggles. */
  const toggleMark = () => {
    if (!currentKey) return;
    if (marks.has(currentKey)) unmark(currentKey);
    else markAndNext();
  };

  const toggleMobile = (key: string | null) => {
    if (!key) return;
    setMarks((m) => {
      const existing = m.get(key);
      const next = new Map(m);
      if (existing) next.set(key, { ...existing, mobile: !existing.mobile });
      else if (key === currentKey && target) next.set(key, { ...target, mobile: true });
      return next;
    });
  };

  const markedList = Array.from(marks.entries()).filter(([, m]) => getPerson(model, m.ref) !== undefined);
  const trayCost = markedList.reduce((sum, [, m]) => {
    const person = getPerson(model, m.ref);
    return sum + (person ? enrichEstimate(person, m.ref.kind, m.mobile) : 0);
  }, 0);

  const enrichTray = () => {
    if (markedList.length === 0) return;
    const groups: EnrichGroup[] = [{ title: null, people: markedList.map(([, m]) => ({ ref: m.ref, selected: true, mobile: m.mobile })) }];
    openEnrich({ groups, onDone: () => setMarks(new Map()) });
  };

  const dismissCurrent = () => {
    if (!current || current.kind === "preview" || view !== "open") return;
    if (current.kind === "candidate" && claimInfo(model, current.candidate.claim).kind !== "none") return;
    openDismiss([{ kind: current.kind, id: current.id }]);
  };

  const restoreCurrent = () => {
    if (!current || current.kind === "preview" || view !== "dismissed") return;
    void restore([{ kind: current.kind, id: current.id }]);
  };

  const openCurrent = () => {
    if (!current || current.kind === "preview") return;
    router.push(current.kind === "prospect" ? `/prospects/${current.id}` : `/candidates/${current.id}`);
  };

  const handlers = useRef({ go, index, markAndNext, unmark, toggleMobile, currentKey, dismissCurrent, restoreCurrent, openCurrent, enrichTray });
  useEffect(() => {
    handlers.current = { go, index, markAndNext, unmark, toggleMobile, currentKey, dismissCurrent, restoreCurrent, openCurrent, enrichTray };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e, { allowShift: true })) return;
      const h = handlers.current;
      const k = e.key;
      if (e.shiftKey && (k === "E" || k === "e")) {
        e.preventDefault();
        h.enrichTray();
        return;
      }
      if (e.shiftKey) return;
      switch (k) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          h.go(h.index + 1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          h.go(h.index - 1);
          break;
        case "e":
          e.preventDefault();
          h.markAndNext();
          break;
        case "x":
          e.preventDefault();
          h.unmark(h.currentKey);
          break;
        case "m":
          e.preventDefault();
          h.toggleMobile(h.currentKey);
          break;
        case "d":
          e.preventDefault();
          h.dismissCurrent();
          break;
        case "r":
          e.preventDefault();
          h.restoreCurrent();
          break;
        case "o":
          e.preventDefault();
          h.openCurrent();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const noun = tab === "prospects" ? "Prospect" : "Candidate";

  if (queue.length === 0 || !current) {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-xl bg-white ring-1 ring-zinc-200">
          <EmptyState
            icon={<CheckCheck className="size-5" aria-hidden />}
            title={view === "dismissed" ? `No dismissed ${noun}s here` : `All caught up: no Surfaced ${noun}s left to review`}
            action={
              view === "open" && skippedOpen > 0 ? (
                <ButtonLink href={`/feed?variant=B&tab=${tab}`} size="sm">
                  See the {plural(skippedOpen, "item")} already acted on
                </ButtonLink>
              ) : undefined
            }
          >
            {view === "open" ? "New items arrive when the agents next run for your Niches." : "Dismissed items you restore come back to the Feed."}
          </EmptyState>
        </div>
        <Tray marks={markedList} cost={trayCost} onEnrich={enrichTray} onRemove={(k) => setMarks((m) => { const n = new Map(m); n.delete(k); return n; })} onMobile={toggleMobile} />
      </div>
    );
  }

  const progress = Math.round(((index + 1) / queue.length) * 100);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* overflow-clip keeps the rounded corners without making the card a scroll container, so the
          action bar below sticks to the viewport. */}
      <div className="relative min-w-0 overflow-clip rounded-xl bg-white ring-1 ring-zinc-200">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-sm font-medium text-zinc-900 tabular-nums">
              {index + 1} <span className="font-normal text-zinc-400">of</span> {queue.length}
            </span>
            <span className="hidden text-xs text-zinc-500 sm:inline">
              {view === "dismissed" ? `Dismissed ${noun}s` : `Surfaced ${noun}s to review`}
              {view === "open" && skippedOpen > 0 ? `, ${skippedOpen} already acted on are not shown` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" tone="ghost" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous (K)">
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button size="sm" tone="ghost" onClick={() => go(index + 1)} disabled={index >= queue.length - 1} aria-label="Next (J)">
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <div className="h-0.5 bg-zinc-100" aria-hidden>
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div key={currentKey} className="p-4 sm:p-6">
          <ItemDetail row={current} layout="card" showActions={false} />
        </div>
        {/* Sticks above the prototype pills: the variant switcher sits at bottom-16 below sm and
            bottom-4 from sm (36px tall), the simulator pill at bottom-4. */}
        <div className="sticky bottom-[6.75rem] z-10 flex flex-wrap items-center gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3 shadow-[0_-6px_12px_-10px_rgb(0_0_0/0.25)] sm:bottom-16 sm:px-5">
          {view === "dismissed" ? (
            <ShortcutButton keyLabel="R" onClick={restoreCurrent} tone="primary" icon={<Undo2 className="size-3.5" aria-hidden />}>
              Restore to the Feed
            </ShortcutButton>
          ) : current.kind === "preview" ? (
            <ButtonLink href="/credits" tone="primary" size="sm">
              <Sparkles className="size-3.5" aria-hidden />
              Buy Credits to reveal people
            </ButtonLink>
          ) : (
            <>
              {model.isFreeTrial ? (
                <ButtonLink href="/credits" tone="primary" size="sm">
                  <Sparkles className="size-3.5" aria-hidden />
                  Buy Credits to reveal Hiring Contacts
                </ButtonLink>
              ) : (
                <ShortcutButton
                  keyLabel="E"
                  pressed={isMarked}
                  tone="primary"
                  onClick={toggleMark}
                  disabled={!isMarked && !target}
                  title={!isMarked && !target ? "Nothing to enrich here" : target ? `Mark ${target.name} (${target.context}) for Enrichment` : undefined}
                  icon={<Mail className="size-3.5" aria-hidden />}
                >
                  {isMarked ? "Marked for Enrichment" : current.kind === "prospect" && target ? `Mark ${target.name}` : "Mark for Enrichment"}
                </ShortcutButton>
              )}
              {!model.isFreeTrial ? (
                <ShortcutButton
                  keyLabel="M"
                  onClick={() => toggleMobile(currentKey)}
                  disabled={!isMarked && !target}
                  pressed={marks.get(currentKey ?? "")?.mobile ?? false}
                  icon={<Smartphone className="size-3.5" aria-hidden />}
                >
                  Mobile +{PRICES.mobile}
                </ShortcutButton>
              ) : null}
              <ShortcutButton
                keyLabel="D"
                onClick={dismissCurrent}
                disabled={current.kind === "candidate" && claimInfo(model, current.candidate.claim).kind !== "none"}
                icon={<CircleSlash className="size-3.5" aria-hidden />}
              >
                Dismiss
              </ShortcutButton>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <ShortcutButton keyLabel="J" tone="ghost" onClick={() => go(index + 1)} disabled={index >= queue.length - 1}>
              Skip
            </ShortcutButton>
            {current.kind !== "preview" ? (
              <ShortcutButton keyLabel="O" tone="ghost" onClick={openCurrent}>
                Open
              </ShortcutButton>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-[calc(var(--chrome-h)+1rem)] lg:self-start">
        <Tray
          marks={markedList}
          cost={trayCost}
          onEnrich={enrichTray}
          onRemove={(k) =>
            setMarks((m) => {
              const n = new Map(m);
              n.delete(k);
              return n;
            })
          }
          onMobile={toggleMobile}
        />
        <ShortcutLegend view={view} reasons={dismissReasonsFor([tab === "prospects" ? "prospect" : "candidate"]).length} />
      </div>
    </div>
  );
}

function ShortcutButton({
  keyLabel,
  children,
  icon,
  tone = "secondary",
  pressed,
  ...rest
}: {
  keyLabel: string;
  children: ReactNode;
  icon?: ReactNode;
  tone?: "primary" | "secondary" | "ghost";
  pressed?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button size="sm" tone={pressed ? "selected" : tone} aria-pressed={pressed} {...rest}>
      {icon}
      <span className="max-w-[260px] truncate">{children}</span>
      <Kbd dark={tone === "primary" && !pressed}>{keyLabel}</Kbd>
    </Button>
  );
}

function Tray({
  marks,
  cost,
  onEnrich,
  onRemove,
  onMobile,
}: {
  marks: [string, Mark][];
  cost: number;
  onEnrich: () => void;
  onRemove: (key: string) => void;
  onMobile: (key: string) => void;
}) {
  const { model } = useFeed();
  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-zinc-900">Marked for Enrichment</h3>
        <span className="rounded-full bg-zinc-100 px-1.5 text-[11px] leading-[18px] font-semibold text-zinc-600 tabular-nums">{marks.length}</span>
      </div>
      {marks.length === 0 ? (
        <p className="px-4 py-5 text-sm text-zinc-500">
          {model.isFreeTrial ? "Enrichment starts once you buy Credits." : (
            <>
              Press <Kbd>E</Kbd> to mark the person on screen. Nothing is charged until you confirm the tray.
            </>
          )}
        </p>
      ) : (
        <ul className="relative max-h-[320px] divide-y divide-zinc-100 overflow-y-auto">
          {marks.map(([key, m]) => (
            <li key={key} className="flex items-center gap-2 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">{m.name}</p>
                <p className="truncate text-xs text-zinc-500">{m.context}</p>
              </div>
              <button
                type="button"
                onClick={() => onMobile(key)}
                aria-pressed={m.mobile}
                title={m.mobile ? `Mobile ticked (+${formatCreditsLabel(PRICES.mobile)})` : `Tick to also find a mobile (+${formatCreditsLabel(PRICES.mobile)})`}
                className={cx(
                  "inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium ring-1 ring-inset",
                  m.mobile ? "bg-indigo-50 text-indigo-700 ring-indigo-200" : "text-zinc-400 ring-zinc-200 hover:text-zinc-700",
                )}
              >
                <Smartphone className="size-3" aria-hidden />
                {m.mobile ? "Mobile" : "+ Mobile"}
              </button>
              <button type="button" onClick={() => onRemove(key)} className="rounded p-1 text-zinc-300 hover:text-rose-600" aria-label={`Remove ${m.name}`}>
                <Trash className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-zinc-200 bg-zinc-50/60 px-4 py-3">
        <div className="flex items-baseline justify-between text-xs text-zinc-600">
          <span>Up to</span>
          <span className="text-sm font-semibold text-zinc-900 tabular-nums">{formatCreditsLabel(cost)}</span>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-zinc-500">
          Email {PRICES.verifiedEmail}, mobile {PRICES.mobile}, charged only for values found <PriceHint />
        </p>
        <Button tone="primary" size="sm" className="mt-2.5 w-full" disabled={marks.length === 0} onClick={onEnrich}>
          Review and enrich {marks.length > 0 ? plural(marks.length, "person", "people") : ""}
          <Kbd dark>Shift E</Kbd>
        </Button>
      </div>
    </div>
  );
}

function ShortcutLegend({ view, reasons }: { view: FeedView; reasons: number }) {
  const items: [string, string][] =
    view === "dismissed"
      ? [
          ["R", "Restore to the Feed"],
          ["J / Down", "Next"],
          ["K / Up", "Previous"],
          ["O", "Open the full page"],
        ]
      : [
          ["E", "Mark for Enrichment and go to the next"],
          ["M", "Tick or untick the mobile"],
          ["X", "Remove from the tray"],
          ["D", `Dismiss with a reason (1-${reasons}, Enter)`],
          ["J / Down", "Skip to the next"],
          ["K / Up", "Previous"],
          ["O", "Open the full page"],
          ["Shift E", "Review and enrich the tray"],
        ];
  return (
    <div className="hidden rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-200 md:block">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
        <Keyboard className="size-3.5 text-zinc-400" aria-hidden />
        Shortcuts
      </h3>
      <dl className="space-y-1.5">
        {items.map(([k, label]) => (
          <div key={k} className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-zinc-600">{label}</dt>
            <dd>
              <Kbd>{k}</Kbd>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 border-t border-zinc-100 pt-2 text-[11px] text-zinc-400">Left and right arrows switch the prototype variant.</p>
    </div>
  );
}
