import { describe, expect, it } from "vitest";
import { checkNiche } from "../src/niche-file.ts";
import { NICHE } from "./fixtures/niche.ts";

describe("checkNiche", () => {
  it("CH-5.S2 accepts a Niche in the DESK.md format", () => {
    expect(checkNiche(NICHE)).toEqual([]);
  });

  it("CH-5.S2 names a missing title, a missing language line and a missing section", () => {
    expect(checkNiche(NICHE.replace(/^# .*\n/, ""))).toContainEqual(expect.stringContaining("title"));
    expect(checkNiche(NICHE.replace("Calls in: French\n", ""))).toContainEqual(expect.stringContaining("Calls in"));
    expect(checkNiche(NICHE.replace("## Candidates", "## Talent"))).toContainEqual(expect.stringContaining("## Candidates"));
  });

  it("CH-5.S2 names an empty section and a Pitch line left empty", () => {
    expect(checkNiche(NICHE.replace(/AI startups, Series A.*\n/, ""))).toContainEqual(expect.stringContaining("## Prospects"));
    expect(checkNiche(NICHE.replace("- The ask: A 15-minute call this week.", "- The ask:"))).toContainEqual(
      expect.stringContaining("The ask"),
    );
  });

  it("CH-5.S2 wants the sections in the order of DESK.md", () => {
    const swapped = NICHE.replace("## Pitch to Hiring Contacts", "## TMP").replace("## Pitch to Candidates", "## Pitch to Hiring Contacts").replace("## TMP", "## Pitch to Candidates");
    expect(checkNiche(swapped)).not.toEqual([]);
  });
});
