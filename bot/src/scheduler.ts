import { openBatches, readBatch } from "./batch-file.ts";
import { isQuietHours } from "./quiet-hours.ts";
import type { Recruiter } from "./registry.ts";
import type { Screen } from "./review.ts";

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
  now(): Date;
}

/**
 * The background work: polls the Search run saved in each Batch file, lets the agent rank the
 * people once it ends, and tells the Recruiter the Batch is ready, but never between 20:00 and 08:00.
 */
export class Scheduler {
  private readonly busy = new Set<string>();
  private readonly failed = new Set<string>();

  constructor(private readonly options: SchedulerOptions) {}

  async tick(): Promise<void> {
    await Promise.all(this.options.recruiters().map((recruiter) => this.tickDesk(recruiter)));
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
