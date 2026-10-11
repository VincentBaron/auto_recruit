import { renameSync, writeFileSync } from "node:fs";

/** Writes JSON so a crash never leaves half a file: to a sibling, then renamed over the target. */
export function writeJsonAtomic(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}
