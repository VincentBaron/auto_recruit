import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DeskDeleter } from "./partnership.ts";

/** Runs a command and returns its output; throws when it fails. */
export type Exec = (command: string, args: string[], options?: { cwd?: string }) => Promise<string>;

const GITHUB_REMOTE = /^(?:https:\/\/(?:[^@/\s]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;

/** `owner/name` of a GitHub remote URL (https or ssh), or null when it is not one. */
export function repoOfRemote(url: string): string | null {
  const match = GITHUB_REMOTE.exec(url.trim());
  return match === null ? null : `${match[1]}/${match[2]}`;
}

/** What `gh repo delete` says about a repo that is already gone. */
const ALREADY_GONE = /Could not resolve to a Repository|HTTP 404|Not Found/i;

/**
 * The real deleter: the folder directly under `desksDir`, and the backup repo through `gh`.
 * It deletes nothing it cannot name: a folder elsewhere, or an origin that is not a GitHub repo, is refused.
 */
export function realDeskDeleter({ desksDir, exec }: { desksDir: string; exec: Exec }): DeskDeleter {
  return {
    async deleteBackup(desk) {
      let url: string;
      try {
        url = await exec("git", ["remote", "get-url", "origin"], { cwd: desk });
      } catch {
        return; // no origin: there is no backup
      }
      const repo = repoOfRemote(url);
      if (repo === null) throw new Error(`the backup remote of ${desk} is not a GitHub repo; refusing to guess what to delete`);
      try {
        await exec("gh", ["repo", "delete", repo, "--yes"]);
      } catch (error) {
        if (!ALREADY_GONE.test(String(error instanceof Error ? error.message : error))) throw error;
      }
    },

    async deleteDesk(desk) {
      const path = resolve(desk);
      if (dirname(path) !== resolve(desksDir)) throw new Error(`${desk} is not a Desk folder under ${desksDir}; refusing to delete it`);
      await rm(path, { recursive: true, force: true });
    },
  };
}
