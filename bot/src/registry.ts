import { existsSync, readFileSync } from "node:fs";

export interface Registry {
  /** The Desk folder of a Recruiter, from their id on a channel; undefined for anyone unknown. */
  deskFor(channel: string, userId: string): string | undefined;
}

interface Entry {
  channel: string;
  userId: string;
  desk: string;
}

/** Reads the Recruiter registry: a JSON list of `{ channel, userId, desk }`. */
export function loadRegistry(file: string): Registry {
  const entries: Entry[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  return {
    deskFor: (channel, userId) => entries.find((e) => e.channel === channel && e.userId === userId)?.desk,
  };
}
