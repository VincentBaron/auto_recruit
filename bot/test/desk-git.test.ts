import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { commitTurn, pushDesk } from "../src/desk-git.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

let desk: string;
beforeEach(() => {
  desk = mkdtempSync(join(tmpdir(), "desk-"));
});

describe("commitTurn", () => {
  it("versions a Desk that is not a repo yet, with one commit for the turn", async () => {
    writeFileSync(join(desk, "CALL_LIST.md"), "one");
    expect(await commitTurn(desk, "Turn: what is on my Call List?")).toBe(true);
    expect(git(desk, "rev-list", "--count", "HEAD")).toBe("1");
    expect(git(desk, "log", "-1", "--format=%s")).toBe("Turn: what is on my Call List?");
  });

  it("makes no commit for a turn that changed nothing", async () => {
    writeFileSync(join(desk, "CALL_LIST.md"), "one");
    await commitTurn(desk, "first");
    expect(await commitTurn(desk, "second")).toBe(false);
    expect(git(desk, "rev-list", "--count", "HEAD")).toBe("1");
  });

  it("makes one more commit per turn that changed the Desk", async () => {
    writeFileSync(join(desk, "CALL_LIST.md"), "one");
    await commitTurn(desk, "first");
    writeFileSync(join(desk, "CALL_LIST.md"), "two");
    await commitTurn(desk, "second");
    expect(git(desk, "rev-list", "--count", "HEAD")).toBe("2");
  });
});

describe("pushDesk", () => {
  it("pushes the Desk to its backup repo", async () => {
    const backup = mkdtempSync(join(tmpdir(), "backup-"));
    git(backup, "init", "--bare", "-b", "main");
    writeFileSync(join(desk, "CALL_LIST.md"), "one");
    await commitTurn(desk, "first");
    git(desk, "remote", "add", "origin", backup);
    await pushDesk(desk);
    expect(git(backup, "log", "-1", "--format=%s", "main")).toBe("first");
  });

  it("fails loudly when the Desk has no backup repo", async () => {
    writeFileSync(join(desk, "CALL_LIST.md"), "one");
    await commitTurn(desk, "first");
    await expect(pushDesk(desk)).rejects.toThrow();
  });
});
