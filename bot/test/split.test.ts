import { describe, expect, it } from "vitest";
import { splitMessage } from "../src/split.ts";

describe("splitMessage", () => {
  it("keeps a short answer whole", () => {
    expect(splitMessage("bonjour", 4096)).toEqual(["bonjour"]);
  });

  it("splits a long answer under the limit, at line breaks", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`.padEnd(20, "x"));
    const parts = splitMessage(lines.join("\n"), 200);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 200)).toBe(true);
    expect(parts.join("\n")).toBe(lines.join("\n"));
  });

  it("cuts a line longer than the limit", () => {
    const parts = splitMessage("a".repeat(250), 100);
    expect(parts.map((p) => p.length)).toEqual([100, 100, 50]);
  });

  it("never returns an empty message", () => {
    expect(splitMessage("  \n ", 100)).toEqual([]);
  });
});
