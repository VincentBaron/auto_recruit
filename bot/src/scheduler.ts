import { openBatches, readBatch } from "./batch-file.ts";
import { readCallList, type CallListEntry } from "./call-list.ts";
import { localTime } from "./local-time.ts";
import { isQuietHours } from "./quiet-hours.ts";
import type { Recruiter } from "./registry.ts";
import type { Screen } from "./review.ts";
import { composeRundown, NUDGE_MINUTES, RUNDOWN_FROM, RUNDOWN_UNTIL } from "./rundown.ts";

export type SearchStatus = "running" | "finished" | "failed";

export interface SchedulerOptions {
  recruiters(): Recruiter[];
  /** Whether the Exa run behind a Batch has ended; cheap, never an agent turn that blocks the Desk. */
  searchStatus(runId: string): Promise<SearchStatus>;
  /** The agent turn that ranks the people of a finished search and moves the Batch to `Proposed`. */
  finishSearch(desk: string, slug: string): Promise<void>;
  notify(userId: string, screen: Screen): Promise<void>;
  onFailure(desk: string, slug: string, error: unknown): void;
  /** Which Batches the Recruiter was already told about, kept across restarts. */
  notified: { has(key: string): boolean; add(key: string): void };
  /** Sends the Call Sheet card of one Call List entry (an agent turn in the Desk's queue). */
  sendCallSheet(recruiter: Recruiter, entry: CallListEntry): Promise<void>;
  /** How much of this month's Allowance the Desk has used, 0 to 1. */
  allowanceUsed(desk: string): number;
  now(): Date;
}

/**
 * The background work: polls the Search run saved in each Batch file, lets the agent rank the
 * people once it ends, and tells the Recruiter the Batch is ready, but never between 20:00 and 08:00.
 * The only other messages it sends first are the Morning Rundown and the Call Sheet of a Callback (ADR 0026).
 */
export class Scheduler {
  private readonly busy = new Set<string>();
  private readonly failed = new Set<string>();

  constructor(private readonly options: SchedulerOptions) {}

  async tick(): Promise<void> {
    await Promise.all(
      this.options.recruiters().map(async (recruiter) => {
        await this.tickDesk(recruiter);
        await this.tickCallList(recruiter);
      }),
    );
  }

  /** Ticks every `everyMs` until `signal` aborts. */
  async run(signal: AbortSignal, everyMs: number): Promise<void> {
    while (!signal.aborted) {
      await this.tick().catch((error) => console.error("scheduler tick failed", error));
      await new Promise((resolve) => setTimeout(resolve, everyMs));
    }
  }

  private async tickDesk(recruiter: Recruiter): Promise<void> {
    for (const slug of openBatches(recruiter.desk)) {
      const key = `${recruiter.desk}|${slug}`;
      if (this.busy.has(key)) continue;
      this.busy.add(key);
      try {
        await this.tickBatch(recruiter, slug, key);
      } catch (error) {
        console.error(`scheduler failed on ${key}`, error);
      } finally {
        this.busy.delete(key);
      }
    }
  }

  /** The Morning Rundown and the Callback nudges, read from the Desk's `CALL_LIST.md` and nothing else. */
  private async tickCallList(recruiter: Recruiter): Promise<void> {
    try {
      const at = localTime(this.options.now(), recruiter.timezone);
      const entries = readCallList(recruiter.desk);
      await this.rundown(recruiter, at, entries);
      for (const entry of entries) {
        if (entry.time === undefined || entry.date !== at.date) continue;
        const [hours = 0, minutes = 0] = entry.time.split(":").map(Number);
        const wait = hours * 60 + minutes - at.minutes;
        const key = `${recruiter.desk}|nudge|${entry.date} ${entry.time}|${entry.who}`;
        if (wait < 0 || wait > NUDGE_MINUTES || this.options.notified.has(key) || this.failed.has(key)) continue;
        // One try only: a failing turn is reported, never repeated every minute.
        try {
          await this.options.sendCallSheet(recruiter, entry);
          this.options.notified.add(key);
        } catch (error) {
          this.failed.add(key);
          console.error(`Call Sheet nudge failed for ${key}`, error);
        }
      }
    } catch (error) {
      console.error(`scheduler failed on the Call List of ${recruiter.desk}`, error);
    }
  }

  private async rundown(recruiter: Recruiter, at: ReturnType<typeof localTime>, entries: CallListEntry[]): Promise<void> {
    const key = `${recruiter.desk}|rundown|${at.date}`;
    const workingDay = at.weekday >= 1 && at.weekday <= 5;
    if (!workingDay || at.minutes < RUNDOWN_FROM || at.minutes >= RUNDOWN_UNTIL || this.options.notified.has(key)) return;
    const due = entries.filter((e) => e.date <= at.date);
    const batches = openBatches(recruiter.desk).filter((slug) => readBatch(recruiter.desk, slug).status === "Proposed");
    const screen = composeRundown({
      due,
      callbacks: due.filter((e) => e.date === at.date && e.time !== undefined),
      batches,
      allowanceUsed: this.options.allowanceUsed(recruiter.desk),
    });
    if (screen === null) return;
    await this.options.notify(recruiter.userId, screen);
    this.options.notified.add(key);
  }

  private async tickBatch(recruiter: Recruiter, slug: string, key: string): Promise<void> {
    let batch = readBatch(recruiter.desk, slug);
    if (batch.status === "Searching" && batch.searchRun !== undefined) {
      if (this.failed.has(`${key}|${batch.searchRun}`)) return;
      const status = await this.options.searchStatus(batch.searchRun);
      if (status === "running") return;
      if (status === "failed") {
        this.failed.add(`${key}|${batch.searchRun}`);
        this.options.onFailure(recruiter.desk, slug, new Error(`Search run ${batch.searchRun} failed`));
        return;
      }
      // One try only: a turn that fails or leaves the Batch unranked is reported, never repeated every minute.
      try {
        await this.options.finishSearch(recruiter.desk, slug);
        batch = readBatch(recruiter.desk, slug);
        if (batch.status === "Searching") throw new Error(`Batch ${slug} is still Searching after its search ended`);
      } catch (error) {
        this.failed.add(`${key}|${batch.searchRun}`);
        this.options.onFailure(recruiter.desk, slug, error);
        return;
      }
    }
    if (batch.status !== "Proposed") return;
    const announced = `${key}|${batch.searchRun ?? ""}`;
    if (this.options.notified.has(announced) || isQuietHours(this.options.now(), recruiter.timezone)) return;
    await this.options.notify(recruiter.userId, {
      text: "Your Batch is ready to review.",
      buttons: [[{ label: "Review", data: `o:${slug}` }]],
    });
    this.options.notified.add(announced);
  }
}
