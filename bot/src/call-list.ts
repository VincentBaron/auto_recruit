import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** One row of `CALL_LIST.md`, the only index of what is due (`DESK.md`). */
export interface CallListEntry {
  number: number;
  who: string;
  /** `YYYY-MM-DD`, in the Recruiter's timezone. */
  date: string;
  /** `HH:MM` for a Callback with an exact time. */
  time?: string;
  /** `am` or `pm` when the slot is half a day. */
  slot?: "am" | "pm";
}

const DUE = /^(\d{4}-\d{2}-\d{2}) (am|pm|\d{2}:\d{2})$/;

/** Reads both sections of a `CALL_LIST.md`; a row it cannot read is left out rather than failing the rest. */
export function parseCallList(markdown: string): CallListEntry[] {
  const entries: CallListEntry[] = [];
  let columns: string[] = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) {
      columns = [];
      continue;
    }
    const cells = line.slice(1, line.lastIndexOf("|")).split("|").map((c) => c.trim());
    if (cells[0] === "#") {
      columns = cells;
      continue;
    }
    const due = DUE.exec(cells[columns.indexOf("Due")] ?? "");
    const number = Number(cells[0]);
    if (due === null || !Number.isInteger(number)) continue;
    const who = (cells[columns.indexOf("Who")] ?? "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    const slot = due[2]!;
    entries.push({ number, who, date: due[1]!, ...(slot === "am" || slot === "pm" ? { slot } : { time: slot }) });
  }
  return entries;
}

/** The entries of a Desk's Call List; none when it has no `CALL_LIST.md` yet. */
export function readCallList(desk: string): CallListEntry[] {
  const file = join(desk, "CALL_LIST.md");
  return existsSync(file) ? parseCallList(readFileSync(file, "utf8")) : [];
}
