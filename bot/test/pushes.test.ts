import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Scheduler } from "../src/scheduler.ts";
import type { Recruiter } from "../src/registry.ts";
import type { Screen } from "../src/review.ts";

let desk: string;
let now: Date;
let timezone: string;
let allowanceUsed: number;
let sent: Array<[string, Screen]>;
let sheets: Array<[string, number]>;
let notified: Set<string>;

const row = (n: number, who: string, due: string) => `| ${n} | ${who} | [Acme](prospects/acme-com.md) | ${due} | Why |`;
const callList = (...rows: string[]) =>
  `# Call List\n\nUpdated 2026-10-12 18:40.\n\n## Hiring Contacts\n\n| # | Who | Prospect | Due | Why Now |\n|---|---|---|---|---|\n${rows.join("\n")}\n`;
const writeList = (...rows: string[]) => writeFileSync(join(desk, "CALL_LIST.md"), callList(...rows));
/** `n` rows due on 2026-10-12 in the morning. */
const manyDue = (n: number) => Array.from({ length: n }, (_, i) => row(i + 1, `Person ${i + 1}, CTO`, "2026-10-12 am"));

const scheduler = () =>
  new Scheduler({
    recruiters: () => [{ channel: "telegram", userId: "42", desk, timezone } as Recruiter],
    searchStatus: async () => "running",
    finishSearch: async () => {},
    notify: async (userId, screen) => void sent.push([userId, screen]),
    onFailure: () => {},
    notified: { has: (k) => notified.has(k), add: (k) => void notified.add(k) },
    sendCallSheet: async (_recruiter, entry) => void sheets.push(["42", entry.number]),
    allowanceUsed: () => allowanceUsed,
    now: () => now,
  });

beforeEach(() => {
  desk = mkdtempSync(join(tmpdir(), "pushes-"));
  mkdirSync(join(desk, "batches"));
  timezone = "Europe/Paris";
  allowanceUsed = 0;
  sent = [];
  sheets = [];
  notified = new Set();
  now = new Date("2026-10-12T06:30:00Z"); // Monday 08:30 in Paris
});

describe("the Morning Rundown", () => {
  it("is sent at 08:30 on a working day with the calls due today and the Callbacks with their times", async () => {
    writeList(...manyDue(9), row(10, "Léa Morel, CTO", "2026-10-12 14:30"), row(11, "Later, CTO", "2026-10-13 am"));
    await scheduler().tick();
    expect(sent).toHaveLength(1);
    expect(sent[0]![0]).toBe("42");
    const text = sent[0]![1].text;
    expect(text).toContain("10 calls due today");
    expect(text).toContain("14:30 Léa Morel, CTO");
    expect(text).not.toContain("Later");
    expect(text).not.toContain("running low");
  });

  it("is not sent before 08:30", async () => {
    writeList(...manyDue(10));
    now = new Date("2026-10-12T06:29:00Z"); // 08:29
    await scheduler().tick();
    expect(sent).toEqual([]);
  });

  it("is sent once a day, even across restarts", async () => {
    writeList(...manyDue(10));
    await scheduler().tick();
    await scheduler().tick();
    now = new Date("2026-10-12T06:31:00Z");
    await scheduler().tick();
    expect(sent).toHaveLength(1);
    now = new Date("2026-10-13T06:30:00Z"); // next day
    await scheduler().tick();
    expect(sent).toHaveLength(2);
  });

  it("is not sent on a Saturday or a Sunday, even with calls due", async () => {
    writeList(row(1, "Léa Morel, CTO", "2026-10-17 am"));
    now = new Date("2026-10-17T06:30:00Z"); // Saturday
    await scheduler().tick();
    now = new Date("2026-10-18T06:30:00Z"); // Sunday
    await scheduler().tick();
    expect(sent).toEqual([]);
  });

  it("is not sent when nothing is due, nor when there is no Call List", async () => {
    await scheduler().tick();
    writeList(row(1, "Léa Morel, CTO", "2026-10-13 am"));
    await scheduler().tick();
    expect(sent).toEqual([]);
  });

  it("counts a call that was due earlier and not made", async () => {
    writeList(row(1, "Léa Morel, CTO", "2026-10-09 pm"));
    await scheduler().tick();
    expect(sent[0]![1].text).toContain("1 call due today");
  });

  it("is sent for a Batch waiting for review alone, with a button to review it", async () => {
    writeFileSync(join(desk, "batches", "fde.md"), "# Batch - fde\n\nStatus: Proposed\nSearch run: run_1\n");
    writeFileSync(join(desk, "batches", "ops.md"), "# Batch - ops\n\nStatus: Searching\nSearch run: run_2\n");
    notified.add(`${desk}|fde|run_1`); // "ready to review" already said at 08:00
    await scheduler().tick();
    expect(sent).toHaveLength(1);
    expect(sent[0]![1].text).toContain("1 Batch waiting for review");
    expect(sent[0]![1].buttons).toEqual([[{ label: "Review", data: "o:fde" }]]);
  });

  it("warns when fewer than 10 calls are due today", async () => {
    writeList(...manyDue(3));
    await scheduler().tick();
    expect(sent[0]![1].text).toContain("Call List is running low");
  });

  it("warns when 75% of the Allowance is used, and not before", async () => {
    writeList(...manyDue(10));
    allowanceUsed = 0.74;
    await scheduler().tick();
    expect(sent[0]![1].text).not.toContain("Allowance");
    notified.clear();
    allowanceUsed = 0.75;
    await scheduler().tick();
    expect(sent[1]![1].text).toContain("75% of your Allowance");
  });

  it("is never sent for a low Call List or Allowance alone", async () => {
    allowanceUsed = 1;
    await scheduler().tick();
    expect(sent).toEqual([]);
  });

  it("comes at 08:30 where the Recruiter is, not where the server is", async () => {
    timezone = "Asia/Tokyo";
    writeList(...manyDue(10));
    now = new Date("2026-10-12T06:30:00Z"); // 15:30 in Tokyo: too late
    await scheduler().tick();
    expect(sent).toEqual([]);
    writeList(row(1, "Léa Morel, CTO", "2026-10-12 am"));
    now = new Date("2026-10-11T23:30:00Z"); // Monday 08:30 in Tokyo
    await scheduler().tick();
    expect(sent).toHaveLength(1);
  });
});

describe("the Callback nudge", () => {
  it("sends the Call Sheet of a Callback at 10:00 at 09:50", async () => {
    writeList(row(1, "Paul Girard, CTO", "2026-10-12 pm"), row(2, "Léa Morel, CTO", "2026-10-12 10:00"));
    now = new Date("2026-10-12T07:49:00Z"); // 09:49
    await scheduler().tick();
    expect(sheets).toEqual([]);
    now = new Date("2026-10-12T07:50:00Z"); // 09:50
    await scheduler().tick();
    expect(sheets).toEqual([["42", 2]]);
  });

  it("sends it once", async () => {
    writeList(row(1, "Léa Morel, CTO", "2026-10-12 10:00"));
    now = new Date("2026-10-12T07:50:00Z");
    await scheduler().tick();
    now = new Date("2026-10-12T07:55:00Z");
    await scheduler().tick();
    await scheduler().tick();
    expect(sheets).toHaveLength(1);
  });

  it("does not send it for an am or pm slot, nor for another day's Callback", async () => {
    writeList(row(1, "Paul Girard, CTO", "2026-10-12 am"), row(2, "Léa Morel, CTO", "2026-10-13 10:00"));
    now = new Date("2026-10-12T07:55:00Z");
    await scheduler().tick();
    expect(sheets).toEqual([]);
  });

  it("does not send it once the Callback time has passed", async () => {
    writeList(row(1, "Léa Morel, CTO", "2026-10-12 10:00"));
    now = new Date("2026-10-12T08:01:00Z"); // 10:01
    await scheduler().tick();
    expect(sheets).toEqual([]);
  });

  it("follows the Recruiter's own timezone", async () => {
    timezone = "America/New_York";
    writeList(row(1, "Léa Morel, CTO", "2026-10-12 10:00"));
    now = new Date("2026-10-12T07:50:00Z"); // 09:50 in Paris, 03:50 in New York
    await scheduler().tick();
    expect(sheets).toEqual([]);
    now = new Date("2026-10-12T13:50:00Z"); // 09:50 in New York
    await scheduler().tick();
    expect(sheets).toEqual([["42", 1]]);
  });

  it("is sent even on a weekend or in quiet hours, because the Recruiter asked for that Callback", async () => {
    writeList(row(1, "Léa Morel, CTO", "2026-10-17 07:30"));
    now = new Date("2026-10-17T05:20:00Z"); // Saturday 07:20 in Paris
    await scheduler().tick();
    expect(sheets).toHaveLength(1);
  });

  it("is tried once only when the Call Sheet fails, instead of every minute", async () => {
    writeList(row(1, "Léa Morel, CTO", "2026-10-12 10:00"));
    let tries = 0;
    const s = new Scheduler({
      recruiters: () => [{ channel: "telegram", userId: "42", desk, timezone } as Recruiter],
      searchStatus: async () => "running",
      finishSearch: async () => {},
      notify: async () => {},
      onFailure: () => {},
      notified: { has: (k) => notified.has(k), add: (k) => void notified.add(k) },
      sendCallSheet: async () => {
        tries++;
        throw new Error("agent down");
      },
      allowanceUsed: () => 0,
      now: () => now,
    });
    now = new Date("2026-10-12T07:50:00Z");
    await s.tick();
    await s.tick();
    expect(tries).toBe(1);
  });
});
