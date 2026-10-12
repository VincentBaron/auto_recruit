import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCallList, readCallList } from "../src/call-list.ts";
import { localTime } from "../src/local-time.ts";

const CALL_LIST = `# Call List

Updated 2026-10-12 18:40.

## Hiring Contacts

| # | Who | Prospect | Due | Why Now |
|---|---|---|---|---|
| 1 | Léa Morel, CTO | [Acme](prospects/acme-com.md) | 2026-10-13 10:00 | Callback she asked for |
| 2 | Paul Girard, Head of Talent | [Nexo](prospects/nexo-io.md) | 2026-10-13 am | Posted 2 FDE roles |

## Candidates

| # | Who | Now | Due | Why Now |
|---|---|---|---|---|
| 3 | [Hugo Martin](candidates/hugo-martin.md) | Solutions Engineer, Qonto | 2026-10-12 pm | Team reorganised |
`;

describe("parseCallList", () => {
  it("reads the number, who and due slot of each row of both sections", () => {
    expect(parseCallList(CALL_LIST)).toEqual([
      { number: 1, who: "Léa Morel, CTO", date: "2026-10-13", time: "10:00" },
      { number: 2, who: "Paul Girard, Head of Talent", date: "2026-10-13", slot: "am" },
      { number: 3, who: "Hugo Martin", date: "2026-10-12", slot: "pm" },
    ]);
  });

  it("reads an empty list as no entries", () => {
    expect(parseCallList("# Call List\n")).toEqual([]);
  });

  it("skips a row whose due slot it cannot read instead of failing", () => {
    expect(parseCallList(CALL_LIST.replace("2026-10-13 am", "soon"))).toHaveLength(2);
  });
});

describe("readCallList", () => {
  it("is empty when the Desk has no CALL_LIST.md", () => {
    expect(readCallList(mkdtempSync(join(tmpdir(), "cl-")))).toEqual([]);
  });

  it("reads the Desk's CALL_LIST.md, the only index of what is due", () => {
    const desk = mkdtempSync(join(tmpdir(), "cl-"));
    writeFileSync(join(desk, "CALL_LIST.md"), CALL_LIST);
    expect(readCallList(desk)).toHaveLength(3);
  });
});

describe("localTime", () => {
  it("gives the date, minutes since midnight and weekday where the Recruiter is", () => {
    const at = new Date("2026-10-12T22:30:00Z"); // Monday evening UTC
    expect(localTime(at, "Europe/Paris")).toEqual({ date: "2026-10-13", minutes: 30, weekday: 2 }); // Tuesday 00:30
    expect(localTime(at, "America/New_York")).toEqual({ date: "2026-10-12", minutes: 18 * 60 + 30, weekday: 1 });
  });
});
