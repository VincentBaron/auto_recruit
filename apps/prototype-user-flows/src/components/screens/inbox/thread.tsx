"use client";

// The thread of one reply: Campaign emails (collapsed), the reply, and the Recruiter's responses.
// Every email shows its footer: sender identity, one-click opt-out, Article 14 Notice on emails to
// Candidates and the AI-assistance note (ADR-0002, ADR-0005).

import { useState } from "react";
import { ChevronDown, ChevronRight, CornerUpLeft, PenLine } from "lucide-react";
import { EmailFooterBlock } from "@/components/domain/email-footer";
import { formatDate } from "@/lib/format";
import type { Message, Reply } from "@/lib/types";
import { CategoryBadge } from "./category";
import { bounceSender, snippet, type ReplyView, type ThreadItem } from "./model";
import { Avatar, Badge, cx } from "./ui";

function OutgoingMessage({ message, view, defaultOpen }: { message: Message; view: ReplyView; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const sender = message.footer.senderName || view.owner?.name || "Recruiter";
  const from = view.mailbox?.address ?? message.footer.senderEmail;
  const isResponse = message.origin === "response";
  return (
    <article className={cx("overflow-hidden rounded-lg border bg-white", isResponse ? "border-indigo-200" : "border-zinc-200")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <Avatar name={sender} size="sm" tone="indigo" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-zinc-900">{sender}</span>
            {isResponse ? (
              <Badge tone="indigo" icon={CornerUpLeft}>
                Your response
              </Badge>
            ) : (
              <span className="text-xs text-zinc-500">Step {message.step}</span>
            )}
            {message.editedByRecruiter ? (
              <Badge tone="neutral" icon={PenLine}>
                Edited by you
              </Badge>
            ) : null}
          </span>
          {open ? (
            <span className="mt-0.5 block truncate text-xs text-zinc-500">
              {from ? `From ${from}` : null}
              {view.recipient?.toAddress ? ` to ${view.recipient.toAddress}` : null}
            </span>
          ) : (
            <span className="mt-0.5 block truncate text-xs text-zinc-500">
              <span className="text-zinc-700">{message.subject}</span> - {snippet(message.body)}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-zinc-500">
          {formatDate(message.sentOn)}
          {open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
        </span>
      </button>
      {open ? (
        <>
          <div className="px-4 pb-4 sm:pl-[3.25rem]">
            <p className="text-sm font-medium text-zinc-900">{message.subject}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-700">{message.body}</p>
          </div>
          {/* The same footer block as the Campaign previews, edge to edge at the bottom of the email. */}
          {message.footer.senderName ? <EmailFooterBlock footer={message.footer} compact /> : null}
        </>
      ) : null}
    </article>
  );
}

function IncomingReply({ reply, view, current }: { reply: Reply; view: ReplyView; current: boolean }) {
  const isBounce = reply.category === "bounce";
  const name = isBounce ? "Mail Delivery Subsystem" : reply.personLabel;
  const from = isBounce ? bounceSender(view.mailbox) : view.recipient?.toAddress ?? null;
  return (
    <article className={cx("rounded-lg border bg-white", current ? "border-zinc-300 shadow-sm" : "border-zinc-200")}>
      <div className="flex items-start gap-3 px-4 py-3">
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-zinc-900">{name}</span>
            <CategoryBadge category={reply.category} />
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {from ? `From ${from}${view.mailbox ? ` to ${view.mailbox.address}` : ""}` : "Sender address deleted, hash kept on the Suppression List"}
          </p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500">{formatDate(reply.receivedOn)}</span>
      </div>
      <div className="px-4 pb-4 sm:pl-[3.25rem]">
        <p className="text-sm font-medium text-zinc-900">{reply.subject}</p>
        <p
          className={cx(
            "mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-700",
            isBounce && "rounded-md bg-zinc-50 p-3 font-mono text-xs text-zinc-600",
          )}
        >
          {reply.body}
        </p>
      </div>
    </article>
  );
}

export function Thread({ items, view }: { items: ThreadItem[]; view: ReplyView }) {
  const lastCampaignIndex = items.reduce((acc, item, i) => (item.kind === "message" && item.message.origin === "campaign" ? i : acc), -1);
  const hasReplyAfter = (i: number) => items.slice(i + 1).some((it) => it.kind === "reply");
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={item.key}>
          {item.kind === "reply" ? (
            <IncomingReply reply={item.reply} view={view} current={item.reply.id === view.reply.id} />
          ) : (
            <OutgoingMessage
              message={item.message}
              view={view}
              defaultOpen={item.message.origin === "response" || (i === lastCampaignIndex && !hasReplyAfter(i))}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
