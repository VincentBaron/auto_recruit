import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { DeskVersions } from "./engine.ts";

const run = promisify(execFile);

const git = (desk: string, ...args: string[]) =>
  run("git", ["-c", "user.name=Auto Recruit", "-c", "user.email=bot@auto-recruit.invalid", ...args], { cwd: desk });

/** Commits whatever the turn changed in the Desk, if anything; returns whether a commit was made. */
export async function commitTurn(desk: string, message: string): Promise<boolean> {
  if (!existsSync(join(desk, ".git"))) await git(desk, "init", "-b", "main");
  await git(desk, "add", "-A");
  const { stdout } = await git(desk, "status", "--porcelain");
  if (stdout.trim() === "") return false;
  await git(desk, "commit", "-m", message);
  return true;
}

const ATTEMPT_LINE = /^\+- \d{4}-\d{2}-\d{2} \d{2}:\d{2} - /m;

/** The Desk's history, which is how a Recap is undone: each turn is one commit. */
export const deskVersions: DeskVersions = {
  async head(desk) {
    if (!existsSync(join(desk, ".git"))) return null;
    try {
      return (await git(desk, "rev-parse", "HEAD")).stdout.trim();
    } catch {
      return null; // a repo with no commit yet
    }
  },

  async addsAttempt(desk) {
    const { stdout } = await git(desk, "show", "--format=", "-U0", "HEAD", "--", "prospects", "candidates");
    return ATTEMPT_LINE.test(stdout);
  },

  async undo(desk, sha) {
    if ((await this.head(desk)) !== sha) return false;
    try {
      await git(desk, "reset", "--hard", `${sha}~1`);
      return true;
    } catch {
      return false; // the first commit has nothing before it
    }
  },
};

/** Pushes the Desk to its backup repo (`origin`); throws when there is none or the push fails. */
export async function pushDesk(desk: string): Promise<void> {
  // An Undo rewinds the Desk's last commit, which may already be on the backup: the lease lets the push replace it.
  await git(desk, "push", "--force-with-lease", "origin", "HEAD");
}

/** Replaces the Desk's whole history with one commit of its present files, so an erased person is in no older commit. */
export async function squashHistory(_desk: string): Promise<void> {}
