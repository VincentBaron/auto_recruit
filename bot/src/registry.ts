import { existsSync, readFileSync } from "node:fs";

export const DEFAULT_TIMEZONE = "Europe/Paris";

export interface Recruiter {
  channel: string;
  userId: string;
  desk: string;
  /** IANA timezone of the Recruiter, for the hours the bot may speak first. */
  timezone: string;
}

export interface Registry {
  /** The Desk folder of a Recruiter, from their id on a channel; undefined for anyone unknown. */
  deskFor(channel: string, userId: string): string | undefined;
  /** Every Recruiter on a channel. */
  recruiters(channel: string): Recruiter[];
}

/** Reads the Recruiter registry: a JSON list of `{ channel, userId, desk, timezone? }`. */
export function loadRegistry(file: string): Registry {
  const raw: Array<Omit<Recruiter, "timezone"> & { timezone?: string }> = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : [];
  const entries: Recruiter[] = raw.map((e) => ({ ...e, timezone: e.timezone ?? DEFAULT_TIMEZONE }));
  return {
    deskFor: (channel, userId) => entries.find((e) => e.channel === channel && e.userId === userId)?.desk,
    recruiters: (channel) => entries.filter((e) => e.channel === channel),
  };
}
