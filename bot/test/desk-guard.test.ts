import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { decideTool } from "../src/desk-guard.ts";

let root: string;
let desk: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "guard-")));
  desk = join(root, "desk1");
  mkdirSync(join(desk, "prospects"), { recursive: true });
  mkdirSync(join(root, "desk2"));
  writeFileSync(join(root, "desk2", "CALL_LIST.md"), "secret");
  writeFileSync(join(desk, "CALL_LIST.md"), "mine");
});

const allowed = (tool: string, input: Record<string, unknown>) => decideTool(desk, tool, input).behavior === "allow";

describe("a turn stays inside its Desk folder", () => {
  it("reads and writes files in the Desk, by relative or absolute path", () => {
    expect(allowed("Read", { file_path: join(desk, "CALL_LIST.md") })).toBe(true);
    expect(allowed("Write", { file_path: join(desk, "prospects", "acme-com.md") })).toBe(true);
    expect(allowed("Edit", { file_path: "CALL_LIST.md" })).toBe(true);
    expect(allowed("Glob", { pattern: "prospects/*.md" })).toBe(true);
    expect(allowed("Grep", { pattern: "linkedin", path: desk })).toBe(true);
    expect(allowed("Grep", { pattern: "linkedin" })).toBe(true);
  });

  it("refuses another Desk, parent folders and system files", () => {
    expect(allowed("Read", { file_path: join(root, "desk2", "CALL_LIST.md") })).toBe(false);
    expect(allowed("Read", { file_path: "../desk2/CALL_LIST.md" })).toBe(false);
    expect(allowed("Write", { file_path: "/etc/passwd" })).toBe(false);
    expect(allowed("Read", { file_path: join(root, "desk1-evil", "x") })).toBe(false);
    expect(allowed("Glob", { pattern: "../desk2/*" })).toBe(false);
    expect(allowed("Glob", { pattern: "/etc/*" })).toBe(false);
    expect(allowed("Glob", { pattern: "*", path: join(root, "desk2") })).toBe(false);
    expect(allowed("Grep", { pattern: "x", path: root })).toBe(false);
  });

  it("refuses a symlink that leaves the Desk", () => {
    symlinkSync(join(root, "desk2"), join(desk, "link"));
    expect(allowed("Read", { file_path: "link/CALL_LIST.md" })).toBe(false);
    expect(allowed("Write", { file_path: "link/new.md" })).toBe(false);
  });

  it("refuses the Desk's git folder", () => {
    expect(allowed("Write", { file_path: ".git/config" })).toBe(false);
  });

  it("refuses a missing path", () => {
    expect(allowed("Read", {})).toBe(false);
  });
});

describe("the only shell is reading the date", () => {
  it("allows date, with a format", () => {
    expect(allowed("Bash", { command: "date" })).toBe(true);
    expect(allowed("Bash", { command: 'date "+%Y-%m-%d %H:%M %A"' })).toBe(true);
  });

  it("refuses everything else", () => {
    for (const command of [
      "ls",
      "cat /etc/passwd",
      "date; cat /etc/passwd",
      'date "+%Y" && id',
      'date "+$(id)"',
      "date `id`",
      "date | sh",
      "date -s '2020-01-01'",
      "date > x",
    ]) {
      expect(allowed("Bash", { command }), command).toBe(false);
    }
  });
});

describe("other tools", () => {
  it("allows the Skill tool and Exa", () => {
    expect(allowed("Skill", { skill: "auto-recruit:call" })).toBe(true);
    expect(allowed("mcp__exa__web_search_exa", { query: "x" })).toBe(true);
  });

  it("refuses web fetch, other MCP servers, agents and unknown tools", () => {
    for (const tool of ["WebFetch", "WebSearch", "Agent", "mcp__other__x", "NotebookEdit", "Whatever"]) {
      expect(allowed(tool, {}), tool).toBe(false);
    }
  });
});
