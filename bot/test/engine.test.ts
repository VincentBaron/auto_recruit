import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Engine, type AgentRunner, type TurnRequest } from "../src/engine.ts";
import { loadRegistry } from "../src/registry.ts";

let root: string;
let desk: string;
let dataDir: string;
const commits: Array<{ desk: string; message: string }> = [];

const makeEngine = (runner: AgentRunner) =>
  new Engine({
    registry: loadRegistry(join(dataDir, "recruiters.json")),
    runner,
    sessionsFile: join(dataDir, "sessions.json"),
    commit: async (d, message) => {
      commits.push({ desk: d, message });
      return true;
    },
  });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "engine-"));
  desk = join(root, "desk1");
  dataDir = join(root, "data");
  mkdirSync(desk);
  mkdirSync(dataDir);
  writeFileSync(join(dataDir, "recruiters.json"), JSON.stringify([{ channel: "telegram", userId: "42", desk }]));
  commits.length = 0;
});

const ok = (text: string, sessionId = "s1") => ({ text, sessionId });

describe("Engine", () => {
  it("runs a message as a turn in the Recruiter's Desk and returns the answer", async () => {
    const seen: TurnRequest[] = [];
    const engine = makeEngine({ run: async (r) => (seen.push(r), ok("Voici votre liste")) });
    expect(await engine.handle("telegram", "42", "what is on my Call List?")).toBe("Voici votre liste");
    expect(seen[0]).toMatchObject({ desk, prompt: "what is on my Call List?", sessionId: undefined });
  });

  it("ignores users without a Desk", async () => {
    const engine = makeEngine({ run: async () => ok("never") });
    expect(await engine.handle("telegram", "999", "hello")).toBeNull();
    expect(await engine.handle("whatsapp", "42", "hello")).toBeNull();
  });

  it("resumes the Recruiter's session on the next message, even after a restart", async () => {
    const seen: TurnRequest[] = [];
    const runner: AgentRunner = { run: async (r) => (seen.push(r), ok("a", "session-A")) };
    await makeEngine(runner).handle("telegram", "42", "one");
    await makeEngine(runner).handle("telegram", "42", "two");
    expect(seen[1].sessionId).toBe("session-A");
  });

  it("handles messages one after the other for the same Desk", async () => {
    const events: string[] = [];
    const engine = makeEngine({
      run: async (r) => {
        events.push(`start ${r.prompt}`);
        await new Promise((resolve) => setTimeout(resolve, r.prompt === "first" ? 40 : 1));
        events.push(`end ${r.prompt}`);
        return ok(r.prompt);
      },
    });
    const answers = await Promise.all([
      engine.handle("telegram", "42", "first"),
      engine.handle("telegram", "42", "second"),
    ]);
    expect(answers).toEqual(["first", "second"]);
    expect(events).toEqual(["start first", "end first", "start second", "end second"]);
  });

  it("commits the Desk after each turn", async () => {
    const engine = makeEngine({ run: async () => ok("done") });
    await engine.handle("telegram", "42", "add a todo");
    expect(commits).toEqual([{ desk, message: "Turn: add a todo" }]);
  });

  it("keeps the queue going and still commits when a turn fails", async () => {
    let n = 0;
    const engine = makeEngine({
      run: async () => {
        if (n++ === 0) throw new Error("boom");
        return ok("fine");
      },
    });
    await expect(engine.handle("telegram", "42", "one")).rejects.toThrow("boom");
    expect(commits).toHaveLength(1);
    expect(await engine.handle("telegram", "42", "two")).toBe("fine");
  });

  it("notifies when a turn starts and ends", async () => {
    const events: string[] = [];
    const engine = makeEngine({ run: async () => (events.push("run"), ok("x")) });
    await engine.handle("telegram", "42", "hi", {
      onTurnStart: () => events.push("start"),
      onTurnEnd: () => events.push("end"),
    });
    expect(events).toEqual(["start", "run", "end"]);
  });
});

describe("loadRegistry", () => {
  it("returns no Desk when the file is missing", () => {
    expect(loadRegistry(join(dataDir, "nope.json")).deskFor("telegram", "42")).toBeUndefined();
  });

  it("maps a channel user to a Desk folder", () => {
    expect(loadRegistry(join(dataDir, "recruiters.json")).deskFor("telegram", "42")).toBe(desk);
    expect(readFileSync(join(dataDir, "recruiters.json"), "utf8")).toContain("42");
  });
});
