// When a recipient's next Campaign email leaves: one rule for every screen that shows it (the
// recipients table and thread, the review queue, the Prospect and Candidate pages), matching the
// dummy backend's sending pass. Pure and deterministic: safe to call during render.

import { addDays, isBefore, isOnOrBefore, nextSendingDay } from "@/lib/dates";
import { PRICES } from "@/lib/pricing";
import type { AppState, Campaign, ISODate, Recipient, SendingMailbox } from "@/lib/types";

export type NextSend =
  /** The Campaign is paused or still a draft: nothing leaves until it is resumed or launched. */
  | { kind: "on_hold"; campaignStatus: "paused" | "draft" }
  /**
   * It cannot leave on any date yet: no Sending Mailbox can send it (every one of the Campaign is
   * paused, or the thread's mailbox is), or the balance does not cover one more email and auto
   * top-up is off. Shown as "Waiting for a Sending Mailbox", "Waiting for Credits".
   */
  | { kind: "waiting"; reason: "mailbox" | "credits"; waitsFor: "a Sending Mailbox" | "Credits" }
  | { kind: "on"; date: ISODate };

/** True while an Out of Office holds the Sequence: it resumes the day after `pausedUntil`. */
export function isOutOfOfficePaused(r: Recipient, today: ISODate): boolean {
  return (r.state === "scheduled" || r.state === "sent") && r.pausedUntil !== null && isOnOrBefore(today, r.pausedUntil);
}

/**
 * The day the recipient's next email leaves when nothing holds it back, seen from `today`. A day's
 * sending pass runs when the simulated day starts, so nothing more leaves today: an email due today
 * or earlier that is still unsent (approved late, held by caps, Credits or a paused Sending Mailbox,
 * or a Campaign launched or resumed since) leaves on the next sending day after today. Never before
 * the recipient's own next send date, never during an Out of Office.
 */
export function nextSendDay(campaign: Campaign, r: Recipient, today: ISODate): ISODate {
  let from = addDays(today, 1);
  if (r.nextSendOn && isBefore(from, r.nextSendOn)) from = r.nextSendOn;
  if (r.pausedUntil && isOnOrBefore(from, r.pausedUntil)) from = addDays(r.pausedUntil, 1);
  return nextSendingDay(from, campaign.sendingWindow.days);
}

function canSend(m: SendingMailbox | undefined): boolean {
  return m !== undefined && (m.status === "active" || m.status === "warming");
}

/**
 * When the email of Sequence `step` leaves for this recipient, or why it cannot: the Campaign is not
 * running, no Sending Mailbox can send it (a first email may leave from any mailbox of the Campaign,
 * a follow-up only from the one that started its thread), or the Credits ran out.
 */
export function nextSend(state: AppState, campaign: Campaign, r: Recipient, step: number): NextSend {
  if (campaign.status !== "active") return { kind: "on_hold", campaignStatus: campaign.status };
  const mailbox = (id: string) => state.mailboxes.find((m) => m.id === id);
  const mailboxReady = step > 1 ? canSend(mailbox(r.mailboxId)) : [r.mailboxId, ...campaign.mailboxIds].some((id) => canSend(mailbox(id)));
  if (!mailboxReady) return { kind: "waiting", reason: "mailbox", waitsFor: "a Sending Mailbox" };
  const ws = state.workspace;
  const autoTopUp = ws !== null && ws.plan === "paid" && ws.autoTopUp.enabled;
  if (ws && ws.credits < PRICES.emailSent && !autoTopUp) return { kind: "waiting", reason: "credits", waitsFor: "Credits" };
  return { kind: "on", date: nextSendDay(campaign, r, state.clock.today) };
}
