import type { Registry } from "./registry.ts";

/** Days after the end of a partnership when the two reminders go out. */
export const REMINDER_DAYS = [15, 27];
/** Days after the end of a partnership when the Desk is deleted. */
export const DELETION_DAYS = 30;

export interface PartnershipRecord {
  desk: string;
  userId: string;
  name: string;
  language?: string;
  /** ISO date-time Vincent ended the partnership. */
  endedAt: string;
  remindersSent: number;
  /** The backup repo is gone: set before the server folder is removed, so a retry never repeats it. */
  backupDeleted?: boolean;
  /** ISO date-time the Desk was deleted from the server and its backup. */
  deletedAt?: string;
}

export interface Partnerships {
  /** Records that a partnership ended now. */
  end(record: Omit<PartnershipRecord, "remindersSent">): void;
  /** The record of a Desk, ended or deleted. */
  get(desk: string): PartnershipRecord | undefined;
  all(): PartnershipRecord[];
  save(record: PartnershipRecord): void;
}

export function loadPartnerships(_file: string): Partnerships {
  return { end() {}, get: () => undefined, all: () => [], save() {} };
}

/** What deletes a Desk for good: both calls are idempotent, and a Desk with no backup is fine. */
export interface DeskDeleter {
  /** Deletes the private GitHub repo that backs the Desk up. */
  deleteBackup(desk: string): Promise<void>;
  /** Deletes the Desk's folder on the server. */
  deleteDesk(desk: string): Promise<void>;
}

export interface EnderOptions {
  partnerships: Partnerships;
  registry: Registry;
  deleter: DeskDeleter;
  /** Writes to the Recruiter. */
  remind(userId: string, text: string): Promise<void>;
  notifyAdmin(text: string): Promise<void>;
  /** Called once a Desk is gone, to drop what the bot kept about it (its session). */
  forget(desk: string): void;
  now(): Date;
}

/** Sends the two reminders and, 30 days after the end, deletes the Desk from the server and its backup. */
export class PartnershipEnder {
  constructor(private readonly options: EnderOptions) {}

  async tick(): Promise<void> {
    void this.options;
  }
}
