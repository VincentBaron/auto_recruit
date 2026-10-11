import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { BatchReview } from "../src/review.ts";

let desk: string;
let approved: Array<[string, string]>;
let review: BatchReview;

const person = (n: number, kind: "Hiring Contact" | "Candidate", name: string, decision = "Surfaced") =>
  `### ${n}. ${name}, CTO at Co${n} (Paris)\n\n- LinkedIn: https://www.linkedin.com/in/p${n}\n- Why Now: Reason ${n}.\n- Decision: ${decision}\n\n`;

const writeBatch = (people: string[], status = "Proposed") =>
  writeFileSync(
    join(desk, "batches", "fde.md"),
    `# Batch - fde\n\nStatus: ${status}\nSearch run: run_1\n\n## Hiring Contacts\n\n${people.join("")}`,
  );
const batchText = () => readFileSync(join(desk, "batches", "fde.md"), "utf8");

beforeEach(() => {
  desk = mkdtempSync(join(tmpdir(), "review-"));
  mkdirSync(join(desk, "batches"));
  approved = [];
  review = new BatchReview((d, slug) => void approved.push([d, slug]));
  writeBatch([person(1, "Hiring Contact", "Ana"), person(2, "Hiring Contact", "Ben"), person(3, "Hiring Contact", "Cleo")]);
});

describe("BatchReview", () => {
  it("shows one card: position, person, Why Now, LinkedIn, with Keep, Skip and Keep the rest", () => {
    const screen = review.press(desk, "o:fde");
    expect(screen.text).toBe("1/3\nAna\nCTO, Co1 (Paris)\nReason 1.\nhttps://www.linkedin.com/in/p1");
    expect(screen.buttons).toEqual([
      [
        { label: "Keep", data: "k:fde:1" },
        { label: "Skip", data: "s:fde:1" },
      ],
      [{ label: "Keep the rest", data: "r:fde" }],
    ]);
  });

  it("writes Keep to the Batch file and moves to the next card", () => {
    const screen = review.press(desk, "k:fde:1");
    expect(batchText()).toContain("### 1. Ana");
    expect(batchText()).toMatch(/Decision: Approved/);
    expect(screen.text.startsWith("2/3\nBen")).toBe(true);
  });

  it("asks why after Skip, then records the reason and shows the next card", () => {
    const ask = review.press(desk, "s:fde:1");
    expect(ask.text).toContain("Ana");
    expect(ask.text).toContain("why? (optional)");
    expect(ask.buttons).toEqual([[{ label: "No reason", data: "x:fde" }]]);
    expect(batchText()).toMatch(/Decision: Dropped\n/);
    const next = review.reason(desk, "too junior");
    expect(batchText()).toContain("Decision: Dropped - too junior");
    expect(next?.text.startsWith("2/3\nBen")).toBe(true);
  });

  it("takes 'no reason' as text or as the button", () => {
    review.press(desk, "s:fde:1");
    expect(review.reason(desk, "No reason")?.text.startsWith("2/3")).toBe(true);
    expect(batchText()).toMatch(/Decision: Dropped\n/);
    review.press(desk, "s:fde:2");
    expect(review.press(desk, "x:fde").text.startsWith("3/3")).toBe(true);
  });

  it("ignores text when no reason is awaited", () => {
    expect(review.reason(desk, "hello")).toBeNull();
  });

  it("resumes at the next undecided card after a restart", () => {
    review.press(desk, "k:fde:1");
    review.press(desk, "k:fde:2");
    const afterRestart = new BatchReview(() => {});
    expect(afterRestart.press(desk, "o:fde").text.startsWith("3/3\nCleo")).toBe(true);
  });

  it("ignores a tap on a card already decided and shows the current card", () => {
    review.press(desk, "k:fde:1");
    const screen = review.press(desk, "s:fde:1");
    expect(batchText()).not.toMatch(/Decision: Dropped/);
    expect(screen.text.startsWith("2/3\nBen")).toBe(true);
  });

  it("approves the Batch when the last card is decided", () => {
    review.press(desk, "k:fde:1");
    review.press(desk, "k:fde:2");
    const done = review.press(desk, "k:fde:3");
    expect(batchText()).toContain("Status: Approved");
    expect(approved).toEqual([[desk, "fde"]]);
    expect(done.text).toContain("3");
    expect(done.buttons).toEqual([]);
  });

  it("Keep the rest approves everyone not yet reviewed and ends the review", () => {
    review.press(desk, "s:fde:1");
    review.reason(desk, "no reason");
    review.press(desk, "r:fde");
    expect(batchText().match(/Decision: Approved/g)).toHaveLength(2);
    expect(batchText()).toContain("Status: Approved");
    expect(approved).toHaveLength(1);
  });

  it("does not approve twice", () => {
    review.press(desk, "r:fde");
    review.press(desk, "r:fde");
    expect(approved).toHaveLength(1);
  });

  it("says when there is nothing to review", () => {
    writeBatch([person(1, "Hiring Contact", "Ana")], "Searching");
    expect(review.press(desk, "o:fde").buttons).toEqual([]);
  });
});
