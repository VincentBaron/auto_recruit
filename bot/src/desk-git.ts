import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

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

/** Pushes the Desk to its backup repo (`origin`); throws when there is none or the push fails. */
export async function pushDesk(desk: string): Promise<void> {
  await git(desk, "push", "origin", "HEAD");
}
