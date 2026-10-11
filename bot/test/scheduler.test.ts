import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Scheduler, type SearchStatus } from "../src/scheduler.ts";
import type { Screen } from "../src/review.ts";

let desk: string;
let now: Date;
let status: SearchStatus;
let finished: string[];
let sent: Array<[string, Screen]>;
let failures: string[];
let notified: Set<string>;

const writeBatch = (batchStatus: string) =>
  writeFileSync(join(desk, "batches", "fde.md"), `# Batch - fde\n\nStatus: ${batchStatus}\nSearch run: run_1\n`);

const scheduler = () =>
  new Scheduler({
    recruiters: () => [{ channel: "telegram", userId: "42", desk, timezone: "Europe/Paris" }],
    searchStatus: async () => status,
    // the agent turn that ranks the people and moves the Batch to Proposed
    finishSearch: async (d, slug) => {
      finished.push(slug);
      writeBatch("Proposed");
    },
    notify: async (userId, screen) => void sent.push([userId, screen]),
    onFailure: (_d, slug) => void failures.push(slug),
    notified: { has: (k) => notified.has(k), add: (k) => void notified.add(k) },
    now: () => now,
  });

beforeEach(() => {
  desk = mkdtempSync(join(tmpdir(), "sched-"));
  mkdirSync(join(desk, "batches"));
  writeBatch("Searching");
  status = "running";
  finished = [];
  sent = [];
  failures = [];
  notified = new Set();
  now = new Date("2026-10-12T10:00:00Z"); // 12:00 in Paris
});

describe("Scheduler", () => {
  it("leaves a running search alone and says nothing", async () => {
    await scheduler().tick();
    expect(finished).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("tells the Recruiter the Batch is ready once the search ends, with a button to review it", async () => {
    status = "finished";
    const s = scheduler();
    await s.tick();
    expect(finished).toEqual(["fde"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]![0]).toBe("42");
    expect(sent[0]![1].text).toBe("Your Batch is ready to review.");
    expect(sent[0]![1].buttons).toEqual([[{ label: "Review", data: "o:fde" }]]);
    await s.tick();
    expect(sent).toHaveLength(1);
  });

  it("sends no Batch ready message between 20:00 and 08:00, and sends it once the quiet hours end", async () => {
    status = "finished";
    now = new Date("2026-10-12T18:30:00Z"); // 20:30 in Paris
    const s = scheduler();
    await s.tick();
    expect(finished).toEqual(["fde"]);
    expect(sent).toEqual([]);
    now = new Date("2026-10-13T03:00:00Z"); // 05:00
    await s.tick();
    expect(sent).toEqual([]);
    now = new Date("2026-10-13T06:00:00Z"); // 08:00
    await s.tick();
    expect(sent).toHaveLength(1);
  });

  it("does not announce a Batch the Recruiter already has under review again after a restart", async () => {
    writeBatch("Proposed");
    notified.add(`${desk}|fde|run_1`);
    await scheduler().tick();
    expect(sent).toEqual([]);
  });

  it("reports a failed search and stops polling it", async () => {
    status = "failed";
    const s = scheduler();
    await s.tick();
    await s.tick();
    expect(failures).toEqual(["fde"]);
    expect(sent).toEqual([]);
  });

  it("reports a failing ranking turn once instead of retrying it every minute", async () => {
    status = "finished";
    const s = new Scheduler({
      recruiters: () => [{ channel: "telegram", userId: "42", desk, timezone: "Europe/Paris" }],
      searchStatus: async () => status,
      finishSearch: async () => {
        finished.push("fde");
        throw new Error("agent down");
      },
      notify: async () => {},
      onFailure: (_d, slug) => void failures.push(slug),
      notified: { has: () => false, add: () => {} },
      now: () => now,
    });
    await s.tick();
    await s.tick();
    expect(finished).toEqual(["fde"]);
    expect(failures).toEqual(["fde"]);
  });

  it("does not poll the same search twice at once", async () => {
    status = "finished";
    const s = scheduler();
    await Promise.all([s.tick(), s.tick()]);
    expect(finished).toEqual(["fde"]);
  });
});
