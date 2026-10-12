import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { commitTurn, deskVersions, pushDesk, squashHistory } from "../src/desk-git.ts";

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

describe("deskVersions", () => {
  const person = (attempts: string) => `# Léa Morel\n\n## Attempts\n\n${attempts}`;

  async function deskWithOneCall() {
    mkdirSync(join(desk, "prospects"));
    writeFileSync(join(desk, "CALL_LIST.md"), "| 1 | Léa | due 2026-10-13 am |\n");
    writeFileSync(join(desk, "prospects", "acme-com.md"), person("- 2026-10-12 11:05 - No Answer\n"));
    await commitTurn(desk, "setup");
  }

  it("sees an Attempt added to a person's file, and nothing else", async () => {
    await deskWithOneCall();
    writeFileSync(join(desk, "TODO.md"), "# TODO\n");
    await commitTurn(desk, "todo");
    expect(await deskVersions.addsAttempt(desk)).toBe(false);
    writeFileSync(join(desk, "prospects", "acme-com.md"), person("- 2026-10-12 11:05 - No Answer\n- 2026-10-13 10:20 - Voicemail\n"));
    await commitTurn(desk, "recap");
    expect(await deskVersions.addsAttempt(desk)).toBe(true);
  });

  it("undoes the last turn and leaves the Desk exactly as before it", async () => {
    await deskWithOneCall();
    const before = git(desk, "rev-parse", "HEAD");
    writeFileSync(join(desk, "prospects", "acme-com.md"), person("- 2026-10-13 10:20 - Voicemail\n"));
    writeFileSync(join(desk, "CALL_LIST.md"), "| 1 | Léa | due 2026-10-14 pm |\n");
    writeFileSync(join(desk, "DO_NOT_CALL.md"), "# Do Not Call\n");
    await commitTurn(desk, "recap");
    const sha = (await deskVersions.head(desk))!;
    expect(await deskVersions.undo(desk, sha)).toBe(true);
    expect(git(desk, "rev-parse", "HEAD")).toBe(before);
    expect(git(desk, "status", "--porcelain")).toBe("");
    expect(git(desk, "diff", before)).toBe("");
  });

  it("refuses to undo a commit that is no longer the last one", async () => {
    await deskWithOneCall();
    writeFileSync(join(desk, "TODO.md"), "one");
    await commitTurn(desk, "recap");
    const sha = (await deskVersions.head(desk))!;
    writeFileSync(join(desk, "TODO.md"), "two");
    await commitTurn(desk, "later");
    expect(await deskVersions.undo(desk, sha)).toBe(false);
    expect(git(desk, "rev-list", "--count", "HEAD")).toBe("3");
  });

  it("has no head in a Desk that is not versioned yet", async () => {
    expect(await deskVersions.head(desk)).toBeNull();
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

describe("squashHistory", () => {
  it("CH-12.S2 leaves one commit with the present files, and no older commit holds what was erased", async () => {
    writeFileSync(join(desk, "CALL_LIST.md"), "Sophie Leroy\n");
    await commitTurn(desk, "first");
    const old = git(desk, "rev-parse", "HEAD");
    writeFileSync(join(desk, "CALL_LIST.md"), "Léa Morel\n");
    await commitTurn(desk, "second");
    await squashHistory(desk);
    expect(git(desk, "rev-list", "--count", "--all")).toBe("1");
    expect(git(desk, "log", "--all", "-p")).not.toContain("Sophie");
    expect(git(desk, "show", "HEAD:CALL_LIST.md")).toBe("Léa Morel");
    expect(() => git(desk, "cat-file", "-e", old)).toThrow();
    expect(git(desk, "status", "--porcelain")).toBe("");
  });

  it("CH-12.S2 keeps the branch and the origin, so the backup can be replaced", async () => {
    const remote = mkdtempSync(join(tmpdir(), "remote-"));
    git(remote, "init", "--bare", "-b", "main");
    writeFileSync(join(desk, "a.md"), "Sophie Leroy\n");
    await commitTurn(desk, "first");
    git(desk, "remote", "add", "origin", remote);
    await pushDesk(desk);
    writeFileSync(join(desk, "a.md"), "nobody\n");
    await commitTurn(desk, "second");
    await squashHistory(desk);
    expect(git(desk, "remote", "get-url", "origin")).toBe(remote);
    expect(git(desk, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    await pushDesk(desk);
    expect(git(remote, "rev-list", "--count", "main")).toBe("1");
    expect(git(remote, "log", "main", "-p")).not.toContain("Sophie");
  });

  it("CH-12.S2 does nothing to a folder that is not a repo", async () => {
    await squashHistory(desk);
    expect(existsSync(join(desk, ".git"))).toBe(false);
  });
});
