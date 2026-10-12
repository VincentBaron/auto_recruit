import type { DeskDeleter } from "./partnership.ts";

/** Runs a command and returns its output; throws when it fails. */
export type Exec = (command: string, args: string[], options?: { cwd?: string }) => Promise<string>;

/** `owner/name` of a GitHub remote URL (https or ssh), or null when it is not one. */
export function repoOfRemote(_url: string): string | null {
  return null;
}

/** The real deleter: the folder under `desksDir` and the backup repo through `gh`. Tests use fakes or temp folders. */
export function realDeskDeleter(_options: { desksDir: string; exec: Exec }): DeskDeleter {
  return { async deleteBackup() {}, async deleteDesk() {} };
}
