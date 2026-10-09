"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, MailX, PlugZap, Sparkles, Wallet } from "lucide-react";
import type { ChatMessage, ISODate } from "@/lib/types";
import { formatRelative, formatWeekdayDate } from "@/lib/format";
import { ProposalCard } from "./proposal-card";

interface ChatThreadProps {
  messages: ChatMessage[];
  today: ISODate;
  balance: number;
  /** Text of the message being sent, shown until the server's copy arrives. */
  pendingText: string | null;
  busyProposalId: string | null;
  suggestions: string[];
  onSuggestion: (text: string) => void;
  onConfirm: (messageId: string) => void;
  onCancel: (messageId: string) => void;
  onNavigate: () => void;
}

export function ChatThread({
  messages,
  today,
  balance,
  pendingText,
  busyProposalId,
  suggestions,
  onSuggestion,
  onConfirm,
  onCancel,
  onNavigate,
}: ChatThreadProps) {
  const awaitingDecision = messages.some((m) => m.proposal?.status === "pending");
  const last = messages[messages.length - 1];
  // Never offer again a prompt the Recruiter already asked in this conversation.
  const asked = new Set(messages.filter((m) => m.role === "recruiter").map((m) => m.text.trim().toLowerCase()));
  const followUps = suggestions.filter((s) => !asked.has(s.toLowerCase())).slice(0, 3);
  const showFollowUps = pendingText === null && !awaitingDecision && last?.role === "agent" && followUps.length > 0;

  return (
    <ol className="flex flex-col gap-4" aria-live="polite" aria-relevant="additions">
      {messages.map((message, i) => {
        const showDay = i === 0 || messages[i - 1].on !== message.on;
        return (
          <li key={message.id} className="flex flex-col gap-4">
            {showDay ? <DayDivider on={message.on} today={today} /> : null}
            {message.role === "recruiter" ? (
              <RecruiterBubble text={message.text} />
            ) : (
              <AgentMessage
                message={message}
                balance={balance}
                busy={busyProposalId === message.id}
                locked={busyProposalId !== null && busyProposalId !== message.id}
                onConfirm={() => onConfirm(message.id)}
                onCancel={() => onCancel(message.id)}
                onNavigate={onNavigate}
              />
            )}
          </li>
        );
      })}

      {pendingText !== null ? (
        <li className="flex flex-col gap-4">
          {last === undefined || last.on !== today ? <DayDivider on={today} today={today} /> : null}
          <RecruiterBubble text={pendingText} sending />
          <TypingIndicator />
        </li>
      ) : null}

      {showFollowUps ? (
        <li className="pl-[34px]">
          <div className="flex flex-wrap gap-1.5">
            {followUps.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestion(s)}
                className="max-w-full truncate rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700"
              >
                {s}
              </button>
            ))}
          </div>
        </li>
      ) : null}
    </ol>
  );
}

function DayDivider({ on, today }: { on: ISODate; today: ISODate }) {
  const relative = formatRelative(on, today);
  const label = relative === "today" || relative === "yesterday" ? `${capitalize(relative)} · ${formatWeekdayDate(on)}` : formatWeekdayDate(on);
  return (
    <div className="flex items-center gap-3 text-[11px] font-medium text-zinc-400" role="separator">
      <span className="h-px flex-1 bg-zinc-200" />
      <span className="tabular-nums">{label}</span>
      <span className="h-px flex-1 bg-zinc-200" />
    </div>
  );
}

function RecruiterBubble({ text, sending = false }: { text: string; sending?: boolean }) {
  return (
    <div className="flex justify-end pl-10">
      <p
        className={`max-w-full whitespace-pre-line break-words rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2 text-[13px] leading-5 text-white ${
          sending ? "opacity-70" : ""
        }`}
      >
        {text}
      </p>
    </div>
  );
}

function AgentAvatar() {
  return (
    <span className="mt-px grid size-6 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
      <Sparkles size={13} aria-hidden />
    </span>
  );
}

function AgentMessage({
  message,
  balance,
  busy,
  locked,
  onConfirm,
  onCancel,
  onNavigate,
}: {
  message: ChatMessage;
  balance: number;
  busy: boolean;
  locked: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="flex gap-2.5">
      <AgentAvatar />
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line break-words text-[13px] leading-5 text-zinc-800">{message.text}</p>
        {message.proposal ? (
          <ProposalCard
            proposal={message.proposal}
            balance={balance}
            busy={busy}
            locked={locked}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        ) : null}
        {message.links.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.links.map((link) => (
              <Link
                key={`${link.href}-${link.label}`}
                href={link.href}
                onClick={onNavigate}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 shadow-xs hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
              >
                {link.label}
                <ArrowRight size={12} className="text-zinc-400" aria-hidden />
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2.5" aria-label="The agent is answering">
      <AgentAvatar />
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-2">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="size-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty and loading states                                            */
/* ------------------------------------------------------------------ */

export function ChatEmptyState({
  suggestions,
  signedIn,
  freeTrial,
  onSuggestion,
  onNavigate,
}: {
  suggestions: string[];
  signedIn: boolean;
  freeTrial: boolean;
  onSuggestion: (text: string) => void;
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center px-2 pt-4 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
          <Sparkles size={18} aria-hidden />
        </span>
        <h3 className="mt-3 text-sm font-semibold text-zinc-900">Ask about your Niches, Feed and Campaigns</h3>
        <p className="mt-1 max-w-[320px] text-[13px] leading-5 text-zinc-500">
          The agent answers and acts for you. Before anything that spends Credits or contacts people, it shows the cost and
          waits for your confirmation.
        </p>
        {!signedIn ? (
          <Link
            href="/signup"
            onClick={onNavigate}
            className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white shadow-sm hover:bg-indigo-500"
          >
            Create your Workspace
            <ArrowRight size={13} aria-hidden />
          </Link>
        ) : null}
      </div>

      {signedIn && freeTrial ? (
        <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-[18px] text-amber-800 ring-1 ring-amber-100">
          Free trial: Hiring Contacts and Candidates are Previews only.{" "}
          <Link href="/credits" onClick={onNavigate} className="font-medium underline underline-offset-2 hover:text-amber-900">
            Buy Credits
          </Link>{" "}
          to reveal them and let the agent enrich people and find more Prospects.
        </p>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="mt-6">
          <p className="mb-2 px-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">Try</p>
          <ul className="flex flex-col gap-1.5">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => onSuggestion(s)}
                  className="group flex w-full items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-[13px] leading-5 text-zinc-700 hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-800"
                >
                  <span className="min-w-0 flex-1 truncate">{s}</span>
                  <ArrowUpRight size={14} className="shrink-0 text-zinc-300 group-hover:text-indigo-500" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="mt-6 flex flex-col gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50/70 px-3.5 py-3 text-xs leading-[18px] text-zinc-600">
        <Rule icon={<Wallet size={13} aria-hidden />}>
          Shows the Credit cost and waits for you before spending Credits or contacting anyone.
        </Rule>
        <Rule icon={<MailX size={13} aria-hidden />}>
          Never sends a reply: you send every response yourself, with the drafted response pre-filled.
        </Rule>
        <Rule icon={<PlugZap size={13} aria-hidden />}>Uses the same API and MCP tools as any AI client of your Workspace.</Rule>
      </ul>
    </div>
  );
}

function Rule({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-zinc-400">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading the conversation">
      {[
        ["w-4/5", "w-3/5"],
        ["w-2/3", "w-1/2"],
        ["w-11/12", "w-2/5"],
      ].map(([a, b], i) => (
        <div key={i} className="flex gap-2.5">
          <span className="size-6 shrink-0 animate-pulse rounded-full bg-zinc-100" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <span className={`h-3 animate-pulse rounded bg-zinc-100 ${a}`} />
            <span className={`h-3 animate-pulse rounded bg-zinc-100 ${b}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
