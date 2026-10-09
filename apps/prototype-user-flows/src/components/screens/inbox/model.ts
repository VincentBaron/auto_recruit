// Pure derivations for the Inbox: joins a Reply with its Recipient, Campaign, person and Sending
// Mailbox, and builds the thread. No React, no clock: everything comes from the state snapshot.

import { diffDays } from "@/lib/dates";
import { REPLY_CATEGORIES } from "@/lib/types";
import type {
  Campaign,
  Candidate,
  ClientState,
  ConsentToken,
  EmailFooter,
  HiringContact,
  Language,
  Message,
  Prospect,
  Recipient,
  Recruiter,
  Reply,
  ReplyCategory,
  SendingMailbox,
} from "@/lib/types";

export type StatusFilter = "needs_action" | "handled" | "all";
export type CategoryFilter = ReplyCategory | "all";
/** "mine" (the default): the current Recruiter's own Campaigns; "all"; or one Campaign id. */
export type CampaignFilter = string;

const STATUS_FILTERS: StatusFilter[] = ["needs_action", "handled", "all"];

export function parseStatus(value: string | null): StatusFilter {
  return STATUS_FILTERS.find((s) => s === value) ?? "needs_action";
}

export function parseCategory(value: string | null): CategoryFilter {
  return REPLY_CATEGORIES.find((c) => c === value) ?? "all";
}

/** The Recruiter's unsent text for one reply, with the name it was written to (kept if the data is deleted). */
export interface DraftRecord {
  text: string;
  personLabel: string;
}

export interface ReplyView {
  reply: Reply;
  recipient: Recipient | undefined;
  campaign: Campaign | undefined;
  owner: Recruiter | undefined;
  candidate: Candidate | undefined;
  hiringContact: HiringContact | undefined;
  prospect: Prospect | undefined;
  mailbox: SendingMailbox | undefined;
  consent: ConsentToken | undefined;
  /** The current Recruiter owns the Campaign, so they can send the response from their mailbox. */
  isMine: boolean;
}

export function currentRecruiterOf(state: ClientState): Recruiter | undefined {
  return state.derived?.currentRecruiter ?? state.recruiters.find((r) => r.id === state.session.recruiterId);
}

export function buildReplyViews(state: ClientState): ReplyView[] {
  const me = currentRecruiterOf(state);
  return state.replies.map((reply) => {
    const recipient = state.recipients.find((r) => r.id === reply.recipientId);
    const campaign = state.campaigns.find((c) => c.id === reply.campaignId);
    const owner = campaign ? state.recruiters.find((r) => r.id === campaign.ownerId) : undefined;
    const candidate = reply.personKind === "candidate" ? state.candidates.find((c) => c.id === reply.personId) : undefined;
    const hiringContact = reply.personKind === "hiring_contact" ? state.hiringContacts.find((h) => h.id === reply.personId) : undefined;
    const prospectId = reply.prospectId ?? hiringContact?.prospectId ?? null;
    const prospect = prospectId ? state.prospects.find((p) => p.id === prospectId) : undefined;
    const mailbox = recipient ? state.mailboxes.find((m) => m.id === recipient.mailboxId) : undefined;
    const consent = reply.consentToken ? state.consentTokens.find((t) => t.token === reply.consentToken) : undefined;
    return {
      reply,
      recipient,
      campaign,
      owner,
      candidate,
      hiringContact,
      prospect,
      mailbox,
      consent,
      isMine: !!me && !!campaign && campaign.ownerId === me.id,
    };
  });
}

/** Newest first, then unhandled first within the same day. */
export function sortReplies(views: ReplyView[]): ReplyView[] {
  return [...views].sort((a, b) => {
    const d = diffDays(b.reply.receivedOn, a.reply.receivedOn);
    if (d !== 0) return d;
    if (a.reply.handled !== b.reply.handled) return a.reply.handled ? 1 : -1;
    return a.reply.id < b.reply.id ? 1 : -1;
  });
}

export function matchesStatus(view: ReplyView, status: StatusFilter): boolean {
  if (status === "all") return true;
  return status === "handled" ? view.reply.handled : !view.reply.handled;
}

/** One line of the reply for the list: skips greetings and empty lines. */
export function snippet(body: string): string {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const greeting = /^(hi|hello|dear|bonjour|bonsoir|salut)\b/i;
  const line = lines.find((l, i) => !(i === 0 && greeting.test(l))) ?? lines[0] ?? "";
  return line;
}

export function personDeleted(view: ReplyView): boolean {
  return view.recipient?.personDeleted ?? (view.reply.personKind === "candidate" ? !view.candidate : !view.hiringContact);
}

export function personSubtitle(view: ReplyView): string {
  if (view.reply.personKind === "hiring_contact") {
    const title = view.hiringContact?.title;
    const company = view.prospect?.name;
    if (title && company) return `${title} at ${company}`;
    return company ?? "Hiring Contact";
  }
  if (view.candidate) return `${view.candidate.currentTitle} at ${view.candidate.currentEmployer}`;
  return "Data deleted, hash kept on the Suppression List";
}

export function personHref(view: ReplyView): string | null {
  if (view.reply.personKind === "candidate") return view.candidate ? `/candidates/${view.candidate.id}` : null;
  return view.prospect ? `/prospects/${view.prospect.id}` : null;
}

export function bounceSender(mailbox: SendingMailbox | undefined): string {
  return mailbox?.provider === "microsoft" ? "postmaster@outlook.com" : "mailer-daemon@googlemail.com";
}

/* ------------------------------------------------------------------ */
/* Thread                                                              */
/* ------------------------------------------------------------------ */

export type ThreadItem =
  | { kind: "message"; key: string; date: string; message: Message }
  | { kind: "reply"; key: string; date: string; reply: Reply };

const RANK: Record<string, number> = { campaign: 0, reply: 1, response: 2 };

/** Sent Campaign emails, the replies of this recipient and the Recruiter's responses, in order. */
export function buildThread(view: ReplyView, allReplies: Reply[]): ThreadItem[] {
  const items: ThreadItem[] = [];
  const messages = view.recipient?.messages ?? [];
  for (const m of messages) {
    if (m.status !== "sent" || !m.sentOn) continue;
    items.push({ kind: "message", key: m.id, date: m.sentOn, message: m });
  }
  const replies = allReplies.filter((r) => r.recipientId === view.reply.recipientId);
  for (const r of replies) {
    items.push({ kind: "reply", key: r.id, date: r.receivedOn, reply: r });
    const hasResponseMessage = messages.some((m) => m.origin === "response" && m.status === "sent" && m.sentOn === r.responseSentOn);
    if (r.responseSentOn && r.responseBody && !hasResponseMessage) {
      const base = messages.find((m) => m.origin === "campaign");
      items.push({
        kind: "message",
        key: `${r.id}-response`,
        date: r.responseSentOn,
        message: {
          id: `${r.id}-response`,
          step: base?.step ?? 1,
          language: r.language,
          subject: r.subject,
          body: r.responseBody,
          footer: base ? responseFooter(base.footer, r.language) : emptyFooter(),
          status: "sent",
          sentOn: r.responseSentOn,
          editedByRecruiter: r.responseBody !== r.draftResponse,
          originalBody: null,
          origin: "response",
        },
      });
    }
  }
  const rank = (i: ThreadItem) => (i.kind === "reply" ? RANK.reply : RANK[i.message.origin]);
  const step = (i: ThreadItem) => (i.kind === "message" ? i.message.step : 0);
  return items.sort((a, b) => diffDays(a.date, b.date) || rank(a) - rank(b) || step(a) - step(b));
}

/** Footer of a response: same sender identity and opt-out; the Article 14 Notice was already sent. */
export function responseFooter(base: EmailFooter, language: Language): EmailFooter {
  return {
    ...base,
    article14Notice: null,
    aiNote:
      language === "fr"
        ? `Rédigé avec l'aide d'une IA et relu par ${base.senderName}.`
        : `Drafted with AI assistance and reviewed by ${base.senderName}.`,
  };
}

function emptyFooter(): EmailFooter {
  return {
    senderName: "",
    senderTitle: "",
    senderEmail: "",
    workspaceName: "",
    workspaceAddress: "",
    optOutUrl: "",
    optOutLabel: "",
    article14Notice: null,
    aiNote: "",
  };
}

/** The footer the response will carry, built from the last Campaign email of this recipient. */
export function footerForResponse(view: ReplyView): EmailFooter | null {
  const base = [...(view.recipient?.messages ?? [])].reverse().find((m) => m.origin === "campaign");
  return base ? responseFooter(base.footer, view.reply.language) : null;
}

export function consentPath(token: string): string {
  return `/consent/${token}`;
}
