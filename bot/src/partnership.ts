import { existsSync, readFileSync } from "node:fs";
import { writeJsonAtomic } from "./json-file.ts";
import { isQuietHours } from "./quiet-hours.ts";
import { DEFAULT_TIMEZONE, type Registry } from "./registry.ts";

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

/** The endings, kept in `partnerships.json` by Desk; read on each call, so two writers never hold stale copies. */
export function loadPartnerships(file: string): Partnerships {
  const read = (): Record<string, PartnershipRecord> => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});
  return {
    end(record) {
      const all = read();
      all[record.desk] = { ...record, remindersSent: 0 };
      writeJsonAtomic(file, all);
    },
    get: (desk) => (Object.hasOwn(read(), desk) ? read()[desk] : undefined),
    all: () => Object.values(read()),
    save(record) {
      writeJsonAtomic(file, { ...read(), [record.desk]: record });
    },
  };
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of an instant where the Recruiter lives. */
export const dateIn = (at: Date, timezone: string): string => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);

/** The day the Desk of a partnership that ended at `endedAt` is deleted. */
export const deletionDate = (endedAt: string, timezone: string): string =>
  dateIn(new Date(new Date(endedAt).getTime() + DELETION_DAYS * DAY_MS), timezone);

const REMINDER: Record<string, (date: string, n: number) => string> = {
  fr: (date, n) =>
    `Rappel ${n}/${REMINDER_DAYS.length}: votre Desk sera supprimé de notre serveur et de sa sauvegarde le ${date}. Vous l'avez reçu en fichiers markdown (le zip plus haut dans cette conversation): gardez-le avant cette date.`,
  en: (date, n) =>
    `Reminder ${n}/${REMINDER_DAYS.length}: your Desk will be deleted from our server and its backup on ${date}. You got it as markdown files (the zip earlier in this chat): keep it before that date.`,
};

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

  private readonly alerted = new Set<string>();

  async tick(): Promise<void> {
    for (const record of this.options.partnerships.all()) {
      if (record.deletedAt !== undefined) continue;
      const days = (this.options.now().getTime() - new Date(record.endedAt).getTime()) / DAY_MS;
      if (days >= DELETION_DAYS) await this.delete(record);
      else await this.remind(record, days);
    }
  }

  private timezoneOf(desk: string): string {
    return this.options.registry.all().find((r) => r.desk === desk)?.timezone ?? DEFAULT_TIMEZONE;
  }

  /** Sends the reminder that is due, if any, never between 20:00 and 08:00; one message even after a long silence. */
  private async remind(record: PartnershipRecord, days: number): Promise<void> {
    const due = REMINDER_DAYS.filter((d) => days >= d).length;
    const timezone = this.timezoneOf(record.desk);
    if (due <= record.remindersSent || isQuietHours(this.options.now(), timezone)) return;
    const text = (REMINDER[record.language ?? "fr"] ?? REMINDER.fr)(deletionDate(record.endedAt, timezone), due);
    await this.options.remind(record.userId, text);
    this.options.partnerships.save({ ...record, remindersSent: due });
  }

  /** Deletes the backup repo first, then the server folder; a failure stops there, tells Vincent once and is retried at the next tick. */
  private async delete(record: PartnershipRecord): Promise<void> {
    const { deleter, partnerships, registry, notifyAdmin } = this.options;
    try {
      if (record.backupDeleted !== true) {
        await deleter.deleteBackup(record.desk);
        record = { ...record, backupDeleted: true };
        partnerships.save(record);
      }
      await deleter.deleteDesk(record.desk);
      registry.remove(record.desk);
      this.options.forget(record.desk);
      partnerships.save({ ...record, deletedAt: this.options.now().toISOString() });
      await notifyAdmin(`🗑️ ${record.name}'s Desk is deleted from the server and its backup repo.`).catch(() => {});
    } catch (error) {
      console.error(`deleting the Desk of ${record.name} failed`, error);
      if (!this.alerted.has(record.desk)) {
        this.alerted.add(record.desk);
        await notifyAdmin(`⚠️ Could not delete ${record.name}'s Desk, due since ${record.endedAt.slice(0, 10)}: ${String(error)}. It is retried every minute.`).catch(() => {});
      }
    }
  }
}
