import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { realDeskDeleter, repoOfRemote, type Exec } from "../src/desk-deletion.ts";

describe("repoOfRemote", () => {
  it("CH-12.S3 reads owner/name from a GitHub remote, whatever its form", () => {
    expect(repoOfRemote("https://github.com/Studio/desk-1.git")).toBe("Studio/desk-1");
    expect(repoOfRemote("https://github.com/Studio/desk-1")).toBe("Studio/desk-1");
    expect(repoOfRemote("git@github.com:Studio/desk-1.git")).toBe("Studio/desk-1");
    expect(repoOfRemote("https://x-access-token:secret@github.com/Studio/desk-1.git\n")).toBe("Studio/desk-1");
  });

  it("CH-12.S3 refuses anything that is not a GitHub repo", () => {
    expect(repoOfRemote("https://gitlab.com/Studio/desk-1.git")).toBeNull();
    expect(repoOfRemote("/srv/backup/desk-1.git")).toBeNull();
    expect(repoOfRemote("https://github.com/Studio")).toBeNull();
    expect(repoOfRemote("")).toBeNull();
  });
});

describe("realDeskDeleter, with a fake shell and temp folders", () => {
  let desksDir: string;
  let desk: string;
  let calls: Array<{ command: string; args: string[]; cwd?: string }>;
  let origin: string | Error;
  let gh: Error | null;

  const exec: Exec = async (command, args, options) => {
    calls.push({ command, args, cwd: options?.cwd });
    if (command === "git") {
      if (origin instanceof Error) throw origin;
      return `${origin}\n`;
    }
    if (gh !== null) throw gh;
    return "";
  };
  const deleter = () => realDeskDeleter({ desksDir, exec });

  beforeEach(() => {
    desksDir = mkdtempSync(join(tmpdir(), "desks-"));
    desk = join(desksDir, "2");
    mkdirSync(join(desk, "prospects"), { recursive: true });
    writeFileSync(join(desk, "CALL_LIST.md"), "x");
    calls = [];
    origin = "git@github.com:Studio/desk-2.git";
    gh = null;
  });

  it("CH-12.S3 deletes the backup repo named by the Desk's origin, through gh and with nothing else", async () => {
    await deleter().deleteBackup(desk);
    expect(calls[0]).toMatchObject({ command: "git", args: ["remote", "get-url", "origin"], cwd: desk });
    expect(calls[1]).toMatchObject({ command: "gh", args: ["repo", "delete", "Studio/desk-2", "--yes"] });
    expect(calls).toHaveLength(2);
    expect(existsSync(desk)).toBe(true);
  });

  it("CH-12.S3 has nothing to delete for a Desk with no origin", async () => {
    origin = new Error("error: No such remote 'origin'");
    await deleter().deleteBackup(desk);
    expect(calls.map((c) => c.command)).toEqual(["git"]);
  });

  it("CH-12.S3 counts a repo already gone as deleted, but not any other failure", async () => {
    gh = new Error("GraphQL: Could not resolve to a Repository with the name 'Studio/desk-2'. (deleteRepository)");
    await expect(deleter().deleteBackup(desk)).resolves.toBeUndefined();
    gh = new Error("HTTP 403: Must have admin rights to Repository");
    await expect(deleter().deleteBackup(desk)).rejects.toThrow("403");
  });

  it("CH-12.S3 never calls gh for an origin that is not on GitHub", async () => {
    origin = "https://gitlab.com/Studio/desk-2.git";
    await expect(deleter().deleteBackup(desk)).rejects.toThrow();
    expect(calls.map((c) => c.command)).toEqual(["git"]);
  });

  it("CH-12.S3 removes the Desk folder, and is fine when it is already gone", async () => {
    await deleter().deleteDesk(desk);
    expect(existsSync(desk)).toBe(false);
    expect(existsSync(desksDir)).toBe(true);
    await expect(deleter().deleteDesk(desk)).resolves.toBeUndefined();
  });

  it("CH-12.S3 refuses to remove anything that is not a Desk folder under the Desks folder", async () => {
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    writeFileSync(join(outside, "keep.md"), "x");
    await expect(deleter().deleteDesk(outside)).rejects.toThrow();
    await expect(deleter().deleteDesk(desksDir)).rejects.toThrow();
    await expect(deleter().deleteDesk(join(desk, ".."))).rejects.toThrow();
    await expect(deleter().deleteDesk(join(desksDir, "2", "..", "..", outside.split("/").pop()!))).rejects.toThrow();
    expect(existsSync(join(outside, "keep.md"))).toBe(true);
    expect(existsSync(desksDir)).toBe(true);
  });
});
