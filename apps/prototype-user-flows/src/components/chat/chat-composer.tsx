"use client";

import { useEffect, type RefObject } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  sending: boolean;
  /** State not loaded yet: same neutral composer on server and client. */
  loading: boolean;
  signedIn: boolean;
  /** "Acting as Vincent Baron": the Recruiter Claims and Credit spending are attributed to. */
  actingAs: string | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

const MAX_HEIGHT_PX = 144;

export function ChatComposer({ value, onChange, onSubmit, sending, loading, signedIn, actingAs, textareaRef }: ChatComposerProps) {
  const disabled = loading || !signedIn;
  // Grow with the text up to six lines, shrink back after sending.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value, textareaRef]);

  const canSend = !disabled && !sending && value.trim().length > 0;

  return (
    <form
      className="shrink-0 border-t border-zinc-200 bg-white px-3 pb-3 pt-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <div className="flex items-end gap-2 rounded-xl border border-zinc-300 bg-white py-1.5 pl-3 pr-1.5 shadow-xs transition-colors focus-within:border-indigo-400 focus-within:ring-3 focus-within:ring-indigo-100">
        <label htmlFor="ask-composer" className="sr-only">
          Message the agent
        </label>
        <textarea
          id="ask-composer"
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSubmit();
            }
          }}
          placeholder={!loading && !signedIn ? "Create a Workspace to use Ask" : "Ask a question or say what to do..."}
          className="block max-h-36 min-h-7 flex-1 resize-none bg-transparent py-1 text-[13px] leading-5 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:shadow-none"
        >
          {sending ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <ArrowUp size={15} aria-hidden />}
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[11px] leading-4 text-zinc-400">
        <span className="min-w-0 truncate">{loading ? "\u00a0" : actingAs ? `Acting as ${actingAs}` : "Not signed in"}</span>
        <span className="hidden shrink-0 sm:inline">
          <kbd className="font-sans">Enter</kbd> to send, <kbd className="font-sans">Shift+Enter</kbd> for a new line
        </span>
      </div>
    </form>
  );
}
