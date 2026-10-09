"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Ban, Check, CircleCheck, LoaderCircle, Mail, TriangleAlert, Wallet, WandSparkles } from "lucide-react";
import type { ChatProposal } from "@/lib/types";
import { formatCreditsLabel } from "@/lib/format";
import { PLACEHOLDER_PRICE_HINT } from "@/lib/pricing";
import { toolName } from "./chat-context";

interface ProposalCardProps {
  proposal: ChatProposal;
  /** Current Workspace balance, to show the balance after confirming. */
  balance: number;
  busy: boolean;
  /** Another proposal is being confirmed or cancelled. */
  locked: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * An action the agent proposes. Nothing that spends Credits or contacts people happens until the
 * Recruiter confirms here, with the cost shown first.
 */
export function ProposalCard({ proposal, balance, busy, locked, onConfirm, onCancel }: ProposalCardProps) {
  const pending = proposal.status === "pending";
  const cost = proposal.costCredits;
  const insufficient = pending && cost > balance;
  // Once run, the card shows what was actually charged (nothing when the action failed: a failed
  // action changes nothing). The outcome itself is the agent's next message, so it is not repeated here.
  const ran = proposal.status === "confirmed" || proposal.status === "failed";
  const Icon = proposal.contactsPeople ? Mail : cost > 0 ? Wallet : WandSparkles;

  return (
    <div
      className={`mt-2.5 overflow-hidden rounded-xl border bg-white ${
        pending ? "border-indigo-200 shadow-sm ring-1 ring-indigo-50" : "border-zinc-200"
      }`}
    >
      <div className="flex items-start gap-2.5 px-3.5 pt-3">
        <span
          className={`mt-px grid size-6 shrink-0 place-items-center rounded-md ${
            pending ? "bg-indigo-50 text-indigo-600" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          <Icon size={14} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-5 text-zinc-900">{proposal.title}</p>
          <p className="mt-0.5 text-xs leading-[18px] text-zinc-500">{proposal.description}</p>
        </div>
        <StatusBadge status={proposal.status} />
      </div>

      <dl className="mx-3.5 mt-3 divide-y divide-zinc-200/70 rounded-lg bg-zinc-50 px-3 text-xs">
        <Row label={ran ? "Charged" : "Cost"}>
          <span className="font-semibold tabular-nums text-zinc-900">
            {ran ? formatCreditsLabel(proposal.creditsCharged ?? 0) : cost > 0 ? `Up to ${formatCreditsLabel(cost)}` : formatCreditsLabel(0)}
          </span>
          <span className="ml-1.5 text-[11px] text-zinc-400">{PLACEHOLDER_PRICE_HINT}</span>
        </Row>
        {pending && cost > 0 && !insufficient ? (
          <Row label="Balance after">
            <span className="tabular-nums text-zinc-700">At least {formatCreditsLabel(balance - cost)}</span>
          </Row>
        ) : null}
        <Row label="Contacts people">
          {proposal.contactsPeople ? (
            <span className="font-medium text-amber-700">Yes, from your Sending Mailboxes</span>
          ) : (
            <span className="text-zinc-700">No</span>
          )}
        </Row>
        <Row label="MCP tool">
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 ring-1 ring-zinc-200">
            {toolName(proposal.actionName)}
          </code>
        </Row>
      </dl>

      {insufficient ? (
        <p className="mx-3.5 mt-2.5 flex items-start gap-1.5 text-xs leading-[18px] text-red-600">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Not enough Credits: this needs up to {formatCreditsLabel(cost)} and the balance is {formatCreditsLabel(balance)}.{" "}
            <Link href="/credits" className="font-medium underline underline-offset-2 hover:text-red-700">
              Buy Credits
            </Link>
          </span>
        </p>
      ) : null}

      {pending ? (
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-3.5 py-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy || locked}
            className="h-7 rounded-md px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || locked || insufficient}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none"
          >
            {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
            {confirmLabel(proposal)}
          </button>
        </div>
      ) : proposal.status === "cancelled" && proposal.resultText ? (
        <p className="mt-3 border-t border-zinc-100 bg-zinc-50/60 px-3.5 py-2.5 text-xs leading-[18px] text-zinc-600">
          {proposal.resultText}
        </p>
      ) : (
        <div className="h-3.5" />
      )}
    </div>
  );
}

function confirmLabel(proposal: ChatProposal): string {
  if (proposal.costCredits > 0) return `Spend up to ${formatCreditsLabel(proposal.costCredits)}`;
  if (proposal.contactsPeople) return "Confirm and contact";
  return "Confirm";
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: ChatProposal["status"] }) {
  if (status === "pending") return null;
  if (status === "confirmed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
        <CircleCheck size={11} aria-hidden />
        Done
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-red-100">
        <TriangleAlert size={11} aria-hidden />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
      <Ban size={11} aria-hidden />
      Cancelled
    </span>
  );
}
