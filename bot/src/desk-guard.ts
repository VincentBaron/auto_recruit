import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export type ToolDecision = { behavior: "allow" } | { behavior: "deny"; message: string };

const DATE_COMMAND = /^date(?: "\+[A-Za-z0-9%:\-_ ./,]*")?$/;
const FILE_TOOLS = new Set(["Read", "Write", "Edit"]);
const SEARCH_TOOLS = new Set(["Glob", "Grep"]);

const deny = (message: string): ToolDecision => ({ behavior: "deny", message });
const allow: ToolDecision = { behavior: "allow" };

/** Real path of a file that may not exist yet: resolve the deepest existing parent, then re-append the rest. */
function realPathOf(path: string): string {
  let existing = path;
  while (!existsSync(existing)) existing = dirname(existing);
  return join(realpathSync(existing), relative(existing, path));
}

function insideDesk(desk: string, path: string): boolean {
  const root = realpathSync(desk);
  const rel = relative(root, realPathOf(resolve(desk, path)));
  if (rel === "") return true;
  if (rel.startsWith("..") || isAbsolute(rel)) return false;
  return rel.split("/")[0] !== ".git";
}

/** Whether a glob pattern could match outside the Desk: absolute, or going through a parent folder. */
function escapingPattern(pattern: string): boolean {
  return isAbsolute(pattern) || pattern.split("/").includes("..");
}

/** The one place that decides what a turn may do: its Desk folder, the date, the Skill tool and Exa (ADR 0028). */
export function decideTool(desk: string, tool: string, input: Record<string, unknown>): ToolDecision {
  if (FILE_TOOLS.has(tool)) {
    const path = input.file_path;
    if (typeof path !== "string" || path === "") return deny("A file path is required.");
    return insideDesk(desk, path) ? allow : deny("Files outside your Desk are off limits.");
  }
  if (SEARCH_TOOLS.has(tool)) {
    const path = input.path;
    if (path !== undefined && (typeof path !== "string" || !insideDesk(desk, path))) {
      return deny("Files outside your Desk are off limits.");
    }
    const pattern = input.pattern;
    if (tool === "Glob" && (typeof pattern !== "string" || escapingPattern(pattern))) {
      return deny("Files outside your Desk are off limits.");
    }
    return allow;
  }
  if (tool === "Bash") {
    const command = input.command;
    return typeof command === "string" && DATE_COMMAND.test(command)
      ? allow
      : deny("The only shell command allowed is date.");
  }
  if (tool === "Skill" || tool.startsWith("mcp__exa__")) return allow;
  return deny(`${tool} is not available.`);
}
