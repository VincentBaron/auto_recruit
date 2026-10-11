import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deskGuardHook } from "../src/sdk-runner.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "hook-")));
const desk = join(root, "desk1");
const plugin = join(root, "plugin");
mkdirSync(desk);
mkdirSync(plugin);

async function decide(tool_name: string, tool_input: Record<string, unknown>) {
  const output = await deskGuardHook(desk, plugin)(
    { hook_event_name: "PreToolUse", tool_name, tool_input, tool_use_id: "t", session_id: "s", transcript_path: "", cwd: desk },
    "t",
    { signal: new AbortController().signal },
  );
  return (output as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision;
}

describe("the Desk guard runs as a PreToolUse hook", () => {
  it("denies a shell command a skill pre-approves, like date reading a file outside the Desk", async () => {
    expect(await decide("Bash", { command: "date -f /etc/auto-recruit/env" })).toBe("deny");
  });

  it("allows what the Desk guard allows", async () => {
    expect(await decide("Read", { file_path: join(desk, "CALL_LIST.md") })).toBe("allow");
    expect(await decide("Bash", { command: "date" })).toBe("allow");
    expect(await decide("Read", { file_path: join(plugin, "DESK.md") })).toBe("allow");
  });
});
