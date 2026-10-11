import { existsSync, readFileSync } from "node:fs";
import { writeJsonAtomic } from "./json-file.ts";

export interface Recruiter {
  channel: string;
  userId: string;
  desk: string;
  name?: string;
  timezone?: string;
  language?: string;
}

export const DEFAULT_TIMEZONE = "Europe/Paris";

export interface Registry {
  /** The Desk folder of a Recruiter, from their id on a channel; undefined for anyone unknown. */
  deskFor(channel: string, userId: string): string | undefined;
  find(channel: string, userId: string): Recruiter | undefined;
  /** Recruiters whose name matches: the full name or a first name, ignoring case and accents. */
  byName(name: string): Recruiter[];
  all(): Recruiter[];
  /** Ties a new Desk to a Recruiter and saves the registry. */
  add(recruiter: Recruiter): void;
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Reads the Recruiter registry: a JSON list of `{ channel, userId, desk, name?, timezone?, language? }`. */
export function loadRegistry(file: string): Registry {
  const entries: Recruiter[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  const find = (channel: string, userId: string) => entries.find((e) => e.channel === channel && e.userId === userId);
  return {
    deskFor: (channel, userId) => find(channel, userId)?.desk,
    find,
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
  };
}
