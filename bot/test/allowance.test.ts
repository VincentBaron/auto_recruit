import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Allowances, decideAllowance } from "../src/allowance.ts";
import { parseAdminCommand } from "../src/admin.ts";
import { exaErrorsIn } from "../src/tool-errors.ts";

let root: string;
let desk: string;
let now: Date;
let allowances: Allowances;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "allowance-"));
  desk = join(root, "desk");
  mkdirSync(join(desk, "prospects"), { recursive: true });
  now = new Date("2026-10-12T10:00:00Z");
  allowances = new Allowances({ file: join(root, "a.json"), timezoneOf: () => "Europe/Paris", now: () => now, phonePriceEur: 5 });
});

const person = (file: string, source: string) =>
  writeFileSync(join(desk, "prospects", file), `# P\n\n### Léa\n\n- Phone: ${source}\n`);

describe("Allowance", () => {
  it("defaults to 4 Batches and €50 and counts spend from the Phone Source lines of the month", () => {
    expect(allowances.limits(desk)).toEqual({ batches: 4, euros: 50 });
    person("a.md", "+33612345678 (Exa, 2026-10-12)");
    person("b.md", "+33612345679 (Exa, 2026-10-01)");
    person("c.md", "+33612345670 (Recruiter, 2026-10-12)");
    person("d.md", "+33612345671 (Exa, 2026-09-30)");
    person("e.md", "not found (Exa, 2026-10-12)");
    expect(allowances.usage(desk)).toEqual({ batches: 0, euros: 10 });
  });

  it("refuses a Batch and a number once used up, and resets on the 1st", () => {
    for (let i = 0; i < 4; i++) allowances.recordBatchStart(desk);
    for (let i = 0; i < 10; i++) person(`p${i}.md`, "+33612345678 (Exa, 2026-10-12)");
    expect(allowances.refusalForBatch(desk)).toContain("4 Batches");
    expect(allowances.refusalForNumber(desk)).toContain("50");
    now = new Date("2026-11-01T09:00:00Z");
    expect(allowances.refusalForBatch(desk)).toBeNull();
    expect(allowances.refusalForNumber(desk)).toBeNull();
  });

  it("resets on the 1st in the Recruiter's timezone", () => {
    allowances = new Allowances({ file: join(root, "b.json"), timezoneOf: () => "Europe/Paris", now: () => now });
    for (let i = 0; i < 4; i++) allowances.recordBatchStart(desk);
    now = new Date("2026-10-31T23:30:00Z"); // already November 1st in Paris
    expect(allowances.usage(desk).batches).toBe(0);
  });

  it("tells how much of the Allowance is used, the Batches or the money, whichever is higher", () => {
    expect(allowances.fractionUsed(desk)).toBe(0);
    allowances.recordBatchStart(desk);
    allowances.recordBatchStart(desk);
    allowances.recordBatchStart(desk);
    expect(allowances.fractionUsed(desk)).toBe(0.75);
    for (let i = 0; i < 9; i++) person(`${i}.md`, "+33612345678 (Exa, 2026-10-12)"); // 9 x €5 of €50
    expect(allowances.fractionUsed(desk)).toBe(0.9);
  });

  it("lets Vincent raise it", () => {
    for (let i = 0; i < 4; i++) allowances.recordBatchStart(desk);
    allowances.setBatches(desk, 6);
    expect(allowances.refusalForBatch(desk)).toBeNull();
  });
});

describe("the Allowance gate on a turn", () => {
  const writeBatch = { file_path: "batches/fde-paris.md" };

  it("starts counting a Batch when its file is created, not when it is edited", () => {
    expect(decideAllowance(desk, allowances, "Write", writeBatch).behavior).toBe("allow");
    expect(allowances.usage(desk).batches).toBe(1);
    mkdirSync(join(desk, "batches"));
    writeFileSync(join(desk, "batches", "fde-paris.md"), "x");
    decideAllowance(desk, allowances, "Write", writeBatch);
    decideAllowance(desk, allowances, "Edit", writeBatch);
    expect(allowances.usage(desk).batches).toBe(1);
  });

  it("stops a new Batch, by file or by Exa search, once the Allowance is used up", () => {
    for (let i = 0; i < 4; i++) allowances.recordBatchStart(desk);
    const write = decideAllowance(desk, allowances, "Write", { file_path: join(desk, "batches", "new.md") });
    expect(write.behavior).toBe("deny");
    const search = decideAllowance(desk, allowances, "mcp__exa__agent_run", { query: "find CTOs" });
    expect(search.behavior).toBe("deny");
  });

  it("lets an open Batch resume its search and other files through", () => {
    for (let i = 0; i < 4; i++) allowances.recordBatchStart(desk);
    mkdirSync(join(desk, "batches"));
    writeFileSync(join(desk, "batches", "fde-paris.md"), "x");
    expect(decideAllowance(desk, allowances, "mcp__exa__agent_run", { runId: "run_1" }).behavior).toBe("allow");
    expect(decideAllowance(desk, allowances, "Write", { file_path: "TODO.md" }).behavior).toBe("allow");
  });

  it("stops a number purchase once the money is used up", () => {
    allowances.addEuros(desk, -45);
    person("a.md", "+33612345678 (Exa, 2026-10-12)");
    const phone = { input: [{ name: "Léa" }], fields: [{ name: "phone", format: "phone" }] };
    expect(decideAllowance(desk, allowances, "mcp__exa__agent_run", phone).behavior).toBe("deny");
    expect(decideAllowance(desk, allowances, "mcp__exa__web_search_advanced_exa", {}).behavior).toBe("allow");
  });
});

describe("admin lines", () => {
  it("reads invite, raise and give", () => {
    expect(parseAdminCommand("invite Camille Dupont")).toEqual({ kind: "invite", name: "Camille Dupont" });
    expect(parseAdminCommand("raise Camille to 6 Batches")).toEqual({ kind: "raise-batches", name: "Camille", batches: 6 });
    expect(parseAdminCommand("give Camille €30 more for numbers")).toEqual({ kind: "add-euros", name: "Camille", euros: 30 });
    expect(parseAdminCommand("give Camille 12,5 euros more")).toEqual({ kind: "add-euros", name: "Camille", euros: 12.5 });
    expect(parseAdminCommand("bonjour")).toBeNull();
  });
});

describe("Exa errors in the SDK stream", () => {
  it("reports an Exa tool result flagged as error, and nothing else", () => {
    const pending = new Map<string, string>();
    const use = (id: string, name: string) => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name }] } });
    const result = (id: string, is_error: boolean) => ({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: id, is_error, content: [{ type: "text", text: "boom" }] }] },
    });
    expect(exaErrorsIn(use("1", "mcp__exa__agent_run"), pending)).toEqual([]);
    expect(exaErrorsIn(use("2", "Read"), pending)).toEqual([]);
    expect(exaErrorsIn(result("2", true), pending)).toEqual([]);
    expect(exaErrorsIn(result("1", true), pending)).toEqual([{ tool: "mcp__exa__agent_run", message: "boom" }]);
  });
});
