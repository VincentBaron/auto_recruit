"use client";

// The global "Ask" slide-over. A canned agent that answers and acts across the Workspace through the
// same actions as every screen (ADR-0008), and always shows the Credit cost and waits for the
// Recruiter's confirmation before spending Credits or contacting people.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LoaderCircle, MessageSquarePlus, Sparkles, TriangleAlert, X } from "lucide-react";
import { act, useAppState } from "@/lib/api";
import type { ChatMessage, ClientState } from "@/lib/types";
import { formatCreditsLabel } from "@/lib/format";
import { chatContext } from "./chat-context";
import { ChatComposer } from "./chat-composer";
import { ChatEmptyState, ChatSkeleton, ChatThread } from "./chat-thread";
import { useChatSelection } from "./selection";

export interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

interface PendingSend {
  text: string;
  /** Number of chat messages when sent: the optimistic bubble hides once the server's copy arrives. */
  baseLength: number;
}

const BACKEND_DOWN = "The dummy backend did not answer. Check that the prototype server is running, then try again.";

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const state: ClientState | null = useAppState();
  const pathname = usePathname() ?? "/";
  const feedSelection = useChatSelection();

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingSend | null>(null);
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messages: ChatMessage[] = state?.chat ?? [];
  const showPending = pending !== null && messages.length <= pending.baseLength;
  const busyProposal = busyProposalId ? messages.find((m) => m.id === busyProposalId)?.proposal : null;
  const proposalBusy = busyProposal?.status === "pending";
  const context = chatContext(state, pathname, feedSelection);
  const signedIn = state?.workspace != null;
  const proposalSignature = messages.map((m) => m.proposal?.status ?? "-").join("");

  // Drop the optimistic bubble and the busy flag once the server's state has caught up.
  useEffect(() => {
    if (pending && messages.length > pending.baseLength) setPending(null);
  }, [pending, messages.length]);
  useEffect(() => {
    if (busyProposalId && !proposalBusy) setBusyProposalId(null);
  }, [busyProposalId, proposalBusy]);

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages.length, showPending, proposalSignature, error]);

  // Focus the composer when the panel opens (again once the slide-in ends: a panel still hidden
  // at its first frame cannot take focus); Escape closes it unless a modal dialog is open.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusComposer = () => textareaRef.current?.focus();
    const frame = requestAnimationFrame(focusComposer);
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target === panel && !panel?.contains(document.activeElement)) focusComposer();
    };
    panel?.addEventListener("transitionend", onTransitionEnd);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const typingElsewhere = target !== null && !panel?.contains(target) && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (!typingElsewhere) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      panel?.removeEventListener("transitionend", onTransitionEnd);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || !state || !signedIn || showPending) return;
    setError(null);
    setPending({ text, baseLength: state.chat.length });
    setDraft("");
    try {
      const res = await act("sendChatMessage", { text, context: { route: pathname, selection: context.selection } });
      if (!res.ok) {
        setPending(null);
        setDraft(text);
        setError(res.error);
      }
    } catch {
      setPending(null);
      setDraft(text);
      setError(BACKEND_DOWN);
    }
  }

  async function decide(messageId: string, decision: "confirm" | "cancel") {
    if (busyProposalId) return;
    setError(null);
    setBusyProposalId(messageId);
    try {
      const res =
        decision === "confirm"
          ? await act("confirmChatProposal", { messageId })
          : await act("cancelChatProposal", { messageId });
      if (!res.ok) {
        setBusyProposalId(null);
        setError(res.error);
      }
    } catch {
      setBusyProposalId(null);
      setError(BACKEND_DOWN);
    }
  }

  async function clearConversation() {
    if (clearing) return;
    setError(null);
    setPending(null);
    setClearing(true);
    try {
      const res = await act("clearChat", {});
      if (!res.ok) setError(res.error);
    } catch {
      setError(BACKEND_DOWN);
    } finally {
      setClearing(false);
      textareaRef.current?.focus();
    }
  }

  /** On a phone the panel covers the page, so following a link closes it. */
  function closeIfCovering() {
    if (window.matchMedia("(max-width: 639px)").matches) onClose();
  }

  return (
    <aside
      ref={panelRef}
      id="ask-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ask-panel-title"
      inert={!open}
      className={`fixed inset-y-0 right-0 z-[60] flex w-full flex-col border-l border-zinc-200 bg-white shadow-[-16px_0_40px_-16px_rgba(24,24,27,0.22)] transition-[transform,visibility] duration-200 ease-out sm:w-[420px] ${
        open ? "visible translate-x-0" : "invisible translate-x-full"
      }`}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 pl-4 pr-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white shadow-sm">
          <Sparkles size={15} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="ask-panel-title" className="text-sm font-semibold leading-5 text-zinc-900">
            Ask
          </h2>
          <p className="truncate text-xs leading-4 text-zinc-500">Confirms every Credit cost before acting</p>
        </div>
        <IconButton
          label="New conversation"
          onClick={clearConversation}
          disabled={!signedIn || clearing || messages.length === 0 || busyProposalId !== null}
        >
          {clearing ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <MessageSquarePlus size={16} aria-hidden />}
        </IconButton>
        <IconButton label="Close Ask" onClick={onClose}>
          <X size={16} aria-hidden />
        </IconButton>
      </header>

      <ContextBar state={state} pageLabel={context.pageLabel} selectionLabel={context.selectionLabel} />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {state === null ? (
          <ChatSkeleton />
        ) : messages.length === 0 && !showPending ? (
          <ChatEmptyState
            suggestions={context.suggestions}
            signedIn={signedIn}
            freeTrial={state.derived.isFreeTrial}
            onSuggestion={(s) => void send(s)}
            onNavigate={closeIfCovering}
          />
        ) : (
          <ChatThread
            messages={messages}
            today={state.clock.today}
            balance={state.workspace?.credits ?? 0}
            pendingText={showPending && pending ? pending.text : null}
            busyProposalId={busyProposalId}
            suggestions={context.suggestions}
            onSuggestion={(s) => void send(s)}
            onConfirm={(id) => void decide(id, "confirm")}
            onCancel={(id) => void decide(id, "cancel")}
            onNavigate={closeIfCovering}
          />
        )}
      </div>

      <RunningJobs state={state} />

      {error ? (
        <div role="alert" className="flex shrink-0 items-start gap-2 border-t border-red-100 bg-red-50 px-4 py-2.5 text-xs leading-[18px] text-red-700">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss the error"
            className="-mr-1 grid size-5 shrink-0 place-items-center rounded text-red-500 hover:bg-red-100 hover:text-red-700"
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      ) : null}

      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => void send(draft)}
        sending={showPending}
        loading={state === null}
        signedIn={signedIn}
        actingAs={state?.derived.currentRecruiter?.name ?? null}
        textareaRef={textareaRef}
      />
    </aside>
  );
}

export default ChatPanel;

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function IconButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ContextBar({ state, pageLabel, selectionLabel }: { state: ClientState | null; pageLabel: string; selectionLabel: string | null }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-100 bg-zinc-50/80 px-4 text-xs">
      {state === null ? (
        <>
          <span className="h-3 w-28 animate-pulse rounded bg-zinc-200/70" />
          <span className="ml-auto h-3 w-20 animate-pulse rounded bg-zinc-200/70" />
        </>
      ) : (
        <>
          <span className="shrink-0 text-zinc-400">On</span>
          <span className="min-w-0 truncate font-medium text-zinc-700" title={pageLabel}>
            {pageLabel}
          </span>
          {selectionLabel ? (
            <span
              className="min-w-0 max-w-[45%] shrink truncate rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-100"
              title={`"these" means: ${selectionLabel}`}
            >
              {selectionLabel}
            </span>
          ) : null}
          {state.workspace ? (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-zinc-600">
              <span className="font-medium tabular-nums">{formatCreditsLabel(state.workspace.credits)}</span>
              {state.derived.isFreeTrial ? (
                <span className="rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-amber-700 ring-1 ring-amber-100">
                  Free trial
                </span>
              ) : null}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Agent work started from the panel (or elsewhere) that is still running, with live progress. */
function RunningJobs({ state }: { state: ClientState | null }) {
  const jobs = (state?.derived.runningJobs ?? []).filter((j) => j.kind === "find_more" || j.kind === "role_sourcing");
  if (jobs.length === 0) return null;
  return (
    <ul className="shrink-0 border-t border-zinc-100 bg-white">
      {jobs.map((job) => {
        const pct = Math.max(0, Math.min(100, Math.round(job.progress * 100)));
        return (
          <li key={job.id} className="flex items-center gap-2.5 px-4 py-2 text-xs">
            <LoaderCircle size={13} className="shrink-0 animate-spin text-indigo-600" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-zinc-700">{job.label}</span>
            <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-zinc-100">
              <span className="block h-full rounded-full bg-indigo-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </span>
            <span className="w-8 shrink-0 text-right tabular-nums text-zinc-500">{pct}%</span>
          </li>
        );
      })}
    </ul>
  );
}
