"use client";

import type { ReactNode } from "react";
import { CircleSlash, Mail, Sparkles, Undo2, UserPlus, X } from "lucide-react";
import { formatCreditsLabel, plural } from "@/lib/format";
import { PRICES } from "@/lib/pricing";
import type { FeedItemRef } from "@/lib/types";
import { useFeed } from "./context";
import { type FeedTab, type FeedView, hasEmail, topEnrichableContact } from "./model";
import { candidateAddable, enrichRequestForCandidates, enrichRequestForProspects, prospectEnrichable } from "./requests";
import { Button, ButtonLink } from "./ui";

/** Floating bar for the multi-select actions (Enrich, Add to a Campaign, Dismiss, Restore). */
export function SelectionBar({
  tab,
  view,
  selected,
  onClear,
}: {
  tab: FeedTab;
  view: FeedView;
  /** Selected Prospect or Candidate ids of the current tab (Previews are never selectable). */
  selected: string[];
  onClear: () => void;
}) {
  const { model, openEnrich, openDismiss, openAddToCampaign, restore } = useFeed();
  if (selected.length === 0) return null;
  const kind = tab === "prospects" ? "prospect" : "candidate";
  const refs: FeedItemRef[] = selected.map((id) => ({ kind, id }));
  const noun = plural(selected.length, tab === "prospects" ? "Prospect" : "Candidate");

  let actions: ReactNode;
  if (view === "dismissed") {
    actions = (
      <Button
        size="sm"
        tone="primary"
        onClick={async () => {
          await restore(refs);
          onClear();
        }}
      >
        <Undo2 className="size-3.5" aria-hidden />
        Restore {noun}
      </Button>
    );
  } else if (tab === "prospects") {
    const enrichable = selected.filter((id) => prospectEnrichable(model, id));
    const estimate = selected.reduce((sum, id) => sum + (topEnrichableContact(model, id) ? PRICES.verifiedEmail : 0), 0);
    actions = (
      <>
        {model.isFreeTrial ? (
          <ButtonLink href="/credits" size="sm" tone="primary">
            <Sparkles className="size-3.5" aria-hidden />
            Buy Credits to reveal Hiring Contacts
          </ButtonLink>
        ) : (
          <Button
            size="sm"
            tone="primary"
            disabled={enrichable.length === 0}
            onClick={() => openEnrich(enrichRequestForProspects(model, enrichable, onClear))}
            title="Choose which Hiring Contacts to enrich at each Prospect"
          >
            <Mail className="size-3.5" aria-hidden />
            Enrich Hiring Contacts
            {estimate > 0 ? <span className="font-normal text-indigo-100">- up to {formatCreditsLabel(estimate)}</span> : null}
          </Button>
        )}
        <Button size="sm" onClick={() => openDismiss(refs, onClear)}>
          <CircleSlash className="size-3.5" aria-hidden />
          Dismiss
        </Button>
      </>
    );
  } else {
    const candidates = selected.map((id) => model.state.candidates.find((c) => c.id === id)).filter((c) => c !== undefined);
    const claimedByOther = candidates.filter((c) => c.claim && c.claim.recruiterId !== model.me?.id);
    const toEnrich = candidates.filter((c) => !claimedByOther.includes(c) && !hasEmail(c, "candidate"));
    const addable = candidates.filter((c) => candidateAddable(model, c.id) && !c.claim);
    const dismissable = candidates.filter((c) => !c.claim);
    actions = (
      <>
        <Button
          size="sm"
          tone="primary"
          disabled={toEnrich.length === 0}
          onClick={() =>
            openEnrich(
              enrichRequestForCandidates(
                model,
                candidates.filter((c) => !claimedByOther.includes(c)).map((c) => c.id),
                onClear,
              ),
            )
          }
        >
          <Mail className="size-3.5" aria-hidden />
          Enrich {toEnrich.length > 0 ? toEnrich.length : ""}
          {toEnrich.length > 0 ? <span className="font-normal text-indigo-100">- up to {formatCreditsLabel(toEnrich.length * PRICES.verifiedEmail)}</span> : null}
        </Button>
        <Button size="sm" disabled={addable.length === 0} onClick={() => openAddToCampaign(addable.map((c) => ({ kind: "candidate", id: c.id })))}>
          <UserPlus className="size-3.5" aria-hidden />
          Add to a Campaign{addable.length > 0 && addable.length < candidates.length ? ` (${addable.length})` : ""}
        </Button>
        <Button
          size="sm"
          disabled={dismissable.length === 0}
          onClick={() => openDismiss(dismissable.map((c) => ({ kind: "candidate", id: c.id })), onClear)}
        >
          <CircleSlash className="size-3.5" aria-hidden />
          Dismiss
        </Button>
        {claimedByOther.length > 0 ? (
          <span className="text-xs text-amber-700">{plural(claimedByOther.length, "is", "are")} claimed by another Recruiter</span>
        ) : null}
      </>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center px-4 sm:bottom-20">
      <div
        role="toolbar"
        aria-label="Selection actions"
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-xl ring-1 ring-zinc-200"
      >
        <span className="px-1 text-sm font-semibold text-zinc-900 tabular-nums">{noun} selected</span>
        <span className="h-5 w-px bg-zinc-200" aria-hidden />
        {actions}
        <button type="button" onClick={onClear} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Clear selection" title="Clear selection (Esc)">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
