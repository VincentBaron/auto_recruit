import { describe, expect, it } from "vitest";
import { parseBatch, setDecision, setStatus } from "../src/batch-file.ts";

export const FILE = `# Batch - fde-paris

Started 2026-10-12 18:20.
Status: Proposed
Search run: run_8f2c

## Hiring Contacts

### 1. Léa Morel, CTO at Acme (Paris)

- LinkedIn: https://www.linkedin.com/in/leamorel
- Prospect: acme.com - AI infrastructure
- Why Now: Two FDE postings since the Series B.
- Signals:
  - 2026-09-30 - Posted "FDE" - https://x
- Decision: Surfaced

## Candidates

### 2. Marc Dupuis, Solutions Engineer at Alan (Paris)

- LinkedIn: https://www.linkedin.com/in/marcdupuis
- Why Now: 3 years in role.
- Decision: Dropped - too junior
`;

describe("parseBatch", () => {
  it("reads the status, the run and each person with their decision", () => {
    const batch = parseBatch(FILE);
    expect(batch.status).toBe("Proposed");
    expect(batch.searchRun).toBe("run_8f2c");
    expect(batch.people).toEqual([
      {
        number: 1,
        kind: "Hiring Contact",
        name: "Léa Morel",
        title: "CTO",
        company: "Acme (Paris)",
        linkedin: "https://www.linkedin.com/in/leamorel",
        whyNow: "Two FDE postings since the Series B.",
        decision: "Surfaced",
      },
      {
        number: 2,
        kind: "Candidate",
        name: "Marc Dupuis",
        title: "Solutions Engineer",
        company: "Alan (Paris)",
        linkedin: "https://www.linkedin.com/in/marcdupuis",
        whyNow: "3 years in role.",
        decision: "Dropped",
        reason: "too junior",
      },
    ]);
  });
});

describe("setDecision", () => {
  it("rewrites only the Decision line of that person", () => {
    const next = setDecision(FILE, 1, "Dropped");
    expect(next).toContain("- Decision: Dropped\n\n## Candidates");
    expect(next).toContain("- Decision: Dropped - too junior");
    expect(setDecision(next, 1, "Dropped", "no agencies")).toContain("- Decision: Dropped - no agencies\n\n## Candidates");
  });
});

describe("setStatus", () => {
  it("rewrites the Status line", () => {
    expect(setStatus(FILE, "Approved")).toContain("\nStatus: Approved\n");
  });
});
