import { existsSync, readFileSync } from "node:fs";
import { writeJsonAtomic } from "./json-file.ts";

export const DEFAULT_TIMEZONE = "Europe/Paris";

export interface Recruiter {
  channel: string;
  userId: string;
  desk: string;
  name?: string;
  /** IANA timezone of the Recruiter, for the hours the bot may speak first. */
  timezone: string;
  language?: string;
  /** When the Recruiter accepted the DPA (ISO date-time); absent until they do, and no Niche discussion starts before (ADR 0029). */
  dpaAcceptedAt?: string;
}

export interface Registry {
  /** The Desk folder of a Recruiter, from their id on a channel; undefined for anyone unknown. */
  deskFor(channel: string, userId: string): string | undefined;
  find(channel: string, userId: string): Recruiter | undefined;
  /** Every Recruiter on a channel. */
  recruiters(channel: string): Recruiter[];
  /** Recruiters whose name matches: the full name or a first name, ignoring case and accents. */
  byName(name: string): Recruiter[];
  all(): Recruiter[];
  /** Ties a new Desk to a Recruiter and saves the registry. */
  add(recruiter: Recruiter): void;
  /** Records the acceptance of the DPA, with its date, and saves the registry. */
  acceptDpa(channel: string, userId: string, at: string): void;
  /** Forgets the Recruiter whose Desk is this folder, and saves the registry. */
  remove(desk: string): void;
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Reads the Recruiter registry: a JSON list of `{ channel, userId, desk, name?, timezone?, language? }`. */
export function loadRegistry(file: string): Registry {
  const raw: Array<Omit<Recruiter, "timezone"> & { timezone?: string }> = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : [];
  const entries: Recruiter[] = raw.map((e) => ({ ...e, timezone: e.timezone ?? DEFAULT_TIMEZONE }));
  const find = (channel: string, userId: string) => entries.find((e) => e.channel === channel && e.userId === userId);
  return {
    deskFor: (channel, userId) => find(channel, userId)?.desk,
    find,
    recruiters: (channel) => entries.filter((e) => e.channel === channel),
    byName(name) {
      const wanted = fold(name);
      if (wanted === "") return [];
      return entries.filter((e) => {
        if (e.name === undefined) return false;
        const full = fold(e.name);
        return full === wanted || full.split(/\s+/)[0] === wanted;
      });
    },
    all: () => [...entries],
    add(recruiter) {
      entries.push(recruiter);
      writeJsonAtomic(file, entries);
    },
    acceptDpa(channel, userId, at) {
      const entry = find(channel, userId);
      if (entry === undefined || entry.dpaAcceptedAt !== undefined) return;
      entry.dpaAcceptedAt = at;
      writeJsonAtomic(file, entries);
    },
    remove(desk) {
      const kept = entries.filter((e) => e.desk !== desk);
      entries.splice(0, entries.length, ...kept);
      writeJsonAtomic(file, entries);
    },
  };
}
