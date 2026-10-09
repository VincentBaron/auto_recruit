"use client";

// Prototype chrome: simulate a reply from a Contacted recipient, with a Reply Category.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MessageSquareReply, X } from "lucide-react";
import { act } from "@/lib/api";
import { Select } from "@/components/ui/select";
import { REPLY_CATEGORY_LABELS, replyCategoryEffect } from "@/lib/labels";
import type { ClientState, ReplyCategory } from "@/lib/types";
import { REPLY_CATEGORIES } from "@/lib/types";

export function InjectReplyDialog({ state, onClose }: { state: ClientState; onClose: () => void }) {
  const groups = useMemo(() => {
    const replied = new Set(state.replies.filter((r) => r.category !== "out_of_office" && r.category !== "bounce").map((r) => r.recipientId));
    return state.campaigns
      .map((c) => ({
        campaign: c,
        recipients: state.recipients.filter(
          (r) => r.campaignId === c.id && !r.personDeleted && !replied.has(r.id) && r.messages.some((m) => m.origin === "campaign" && m.status === "sent"),
        ),
      }))
      .filter((g) => g.recipients.length > 0);
  }, [state]);

  const [recipientId, setRecipientId] = useState(groups[0]?.recipients[0]?.id ?? "");
  const [category, setCategory] = useState<ReplyCategory>("interested");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ replyId: string; label: string } | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  // The chosen recipient may disappear once they replied: fall back to the first one left.
  const selectedId = groups.some((g) => g.recipients.some((r) => r.id === recipientId)) ? recipientId : (groups[0]?.recipients[0]?.id ?? "");
  const selectedKind = state.recipients.find((r) => r.id === selectedId)?.personKind ?? "hiring_contact";

  useEffect(() => {
    selectRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    const label = state.recipients.find((r) => r.id === selectedId)?.personLabel ?? "The recipient";
    const res = await act("injectReply", { recipientId: selectedId, category });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone({ replyId: res.result.replyId, label });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="inject-title">
      <button type="button" className="absolute inset-0 cursor-default bg-zinc-950/40" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-zinc-900/10">
        <header className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4">
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-amber-300">
            <MessageSquareReply className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="inject-title" className="text-sm font-semibold text-zinc-900">
              Inject a reply
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">Simulator only. A Contacted recipient replies now, and the automatic effects of the Reply Category apply.</p>
          </div>
          <button type="button" onClick={onClose} className="-mr-1 inline-flex size-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>
        </header>

        {done ? (
          <div className="px-5 py-5 text-sm text-zinc-700">
            <p>
              <span className="font-medium text-zinc-900">{done.label}</span> replied: <span className="font-medium text-zinc-900">{REPLY_CATEGORY_LABELS[category]}</span>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDone(null)} className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white px-3 text-[13px] font-medium text-zinc-800 shadow-xs hover:bg-zinc-50">
                Inject another
              </button>
              <Link href={`/inbox?reply=${done.replyId}`} onClick={onClose} className="inline-flex h-8 items-center rounded-md bg-indigo-600 px-3 text-[13px] font-medium text-white shadow-sm hover:bg-indigo-700">
                Open in the Inbox
              </Link>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <div className="px-5 py-6 text-sm leading-relaxed text-zinc-600">
            Nobody can reply yet: no Campaign email was sent to a recipient without a reply. Launch a Campaign and advance a day so emails go out.
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={onClose} className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white px-3 text-[13px] font-medium text-zinc-800 shadow-xs hover:bg-zinc-50">
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 px-5 py-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-700">Contacted recipient</span>
                <Select ref={selectRef} value={selectedId} onChange={(e) => setRecipientId(e.target.value)} className="w-full">
                  {groups.map((g) => (
                    <optgroup key={g.campaign.id} label={g.campaign.name}>
                      {g.recipients.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.personLabel}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </label>
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-zinc-700">Reply Category</legend>
                <div className="flex flex-wrap gap-1.5">
                  {REPLY_CATEGORIES.map((c) => (
                    <label
                      key={c}
                      className={`inline-flex h-7 cursor-pointer items-center rounded-full px-2.5 text-xs font-medium ring-1 ring-inset transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${
                        category === c ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50"
                      }`}
                    >
                      <input type="radio" name="inject-category" value={c} checked={category === c} onChange={() => setCategory(c)} className="sr-only" />
                      {REPLY_CATEGORY_LABELS[c]}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">{replyCategoryEffect(category, selectedKind)}</p>
              </fieldset>
              {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-inset ring-red-200">{error}</p> : null}
            </div>
            <footer className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">
              <button type="button" onClick={onClose} className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white px-3 text-[13px] font-medium text-zinc-800 shadow-xs hover:bg-zinc-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !selectedId}
                className="inline-flex h-8 items-center rounded-md bg-zinc-900 px-3 text-[13px] font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
              >
                {busy ? "Injecting..." : "Inject reply"}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
