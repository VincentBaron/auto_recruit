import type { CallListEntry } from "./call-list.ts";
import type { Screen } from "./review.ts";

/** The Morning Rundown comes at 08:30, and is still sent until 09:30 if the bot was down at 08:30. */
export const RUNDOWN_FROM = 8 * 60 + 30;
export const RUNDOWN_UNTIL = 9 * 60 + 30;
/** Fewer calls due today than this and the Call List is running low (the call skill offers a Batch below it). */
export const LOW_CALL_LIST = 10;
/** The share of the Allowance used from which the Rundown says so. */
export const LOW_ALLOWANCE = 0.75;
/** A Callback's Call Sheet is sent this long before it is due. */
export const NUDGE_MINUTES = 10;

export interface RundownFacts {
  /** Entries due today or earlier. */
  due: CallListEntry[];
  /** Entries due today at an exact time. */
  callbacks: CallListEntry[];
  /** Slugs of the Batches waiting for review. */
  batches: string[];
  allowanceUsed: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The Morning Rundown, or null when nothing is due (a low Call List or Allowance never speaks alone). */
export function composeRundown(facts: RundownFacts): Screen | null {
  const { due, callbacks, batches } = facts;
  if (due.length === 0 && batches.length === 0) return null;
  const lines = ["Good morning, here is your day:"];
  if (due.length > 0) lines.push(`- ${plural(due.length, "call")} due today`);
  for (const entry of [...callbacks].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))) {
    lines.push(`- Callback ${entry.time} ${entry.who}`);
  }
  if (batches.length > 0) lines.push(`- ${plural(batches.length, "Batch", "Batches")} waiting for review`);
  if (due.length < LOW_CALL_LIST) lines.push("Your Call List is running low: start a new Batch to fill it.");
  if (facts.allowanceUsed >= LOW_ALLOWANCE) {
    lines.push(`You have used ${Math.floor(facts.allowanceUsed * 100)}% of your Allowance this month.`);
  }
  return { text: lines.join("\n"), buttons: batches.map((slug) => [{ label: "Review", data: `o:${slug}` }]) };
}
