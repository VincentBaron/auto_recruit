import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DELETION_DAYS, loadPartnerships, PartnershipEnder, REMINDER_DAYS, type DeskDeleter } from "../src/partnership.ts";
import { loadRegistry } from "../src/registry.ts";

const ENDED = new Date("2026-10-12T10:00:00Z");
const after = (days: number, hours = 0) => new Date(ENDED.getTime() + days * 86_400_000 + hours * 3_600_000);

let data: string;
let desk: string;
let now: Date;
let events: string[];
let reminders: Array<{ userId: string; text: string }>;
let pings: string[];
let backupError: Error | null;

const deleter: DeskDeleter = {
  async deleteBackup(d) {
    events.push(`backup ${d}`);
    if (backupError !== null) throw backupError;
  },
  async deleteDesk(d) {
    events.push(`desk ${d}`);
  },
};

function build() {
  const registry = loadRegistry(join(data, "recruiters.json"));
  const partnerships = loadPartnerships(join(data, "partnerships.json"));
  const ender = new PartnershipEnder({
    partnerships,
    registry,
    deleter,
    remind: async (userId, text) => void reminders.push({ userId, text }),
    notifyAdmin: async (text) => void pings.push(text),
    forget: (d) => void events.push(`forget ${d}`),
    now: () => now,
  });
  return { registry, partnerships, ender };
}

beforeEach(() => {
  data = mkdtempSync(join(tmpdir(), "partnership-"));
  desk = join(data, "desks", "1");
  mkdirSync(desk, { recursive: true });
  events = [];
  reminders = [];
  pings = [];
  backupError = null;
  now = ENDED;
  const { registry, partnerships } = build();
  registry.add({ channel: "telegram", userId: "42", desk, name: "Camille Dupont", timezone: "Europe/Paris", language: "fr" });
  partnerships.end({ desk, userId: "42", name: "Camille Dupont", language: "fr", endedAt: ENDED.toISOString() });
});

describe("the schedule", () => {
  it("CH-12.S3 sends two reminders and deletes at 30 days", () => {
    expect(REMINDER_DAYS).toHaveLength(2);
    expect(Math.max(...REMINDER_DAYS)).toBeLessThan(DELETION_DAYS);
    expect(DELETION_DAYS).toBe(30);
  });

  it("CH-12.S3 keeps the ending on disk", () => {
    expect(loadPartnerships(join(data, "partnerships.json")).get(desk)).toMatchObject({ userId: "42", remindersSent: 0, endedAt: ENDED.toISOString() });
  });
});

describe("the reminders", () => {
  it("CH-12.S3 sends nothing before the first reminder day", async () => {
    now = after(REMINDER_DAYS[0], -3);
    await build().ender.tick();
    expect(reminders).toEqual([]);
  });

  it("CH-12.S3 sends each of the two reminders once, in the Recruiter's language, with the deletion date", async () => {
    const { ender } = build();
    now = after(REMINDER_DAYS[0], 1);
    await ender.tick();
    await ender.tick();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].userId).toBe("42");
    expect(reminders[0].text).toContain("2026-11-11");
    expect(reminders[0].text).toMatch(/supprim/i);
    now = after(REMINDER_DAYS[1], 1);
    await ender.tick();
    await build().ender.tick(); // a restart does not repeat it
    expect(reminders).toHaveLength(2);
    expect(events).toEqual([]);
  });

  it("CH-12.S3 does not wake the Recruiter at night: the reminder waits for the morning", async () => {
    const { ender } = build();
    now = new Date("2026-10-27T21:00:00Z"); // 22:00 in Paris, day 15
    await ender.tick();
    expect(reminders).toEqual([]);
    now = new Date("2026-10-28T07:30:00Z"); // 08:30 in Paris
    await ender.tick();
    expect(reminders).toHaveLength(1);
  });
});

describe("the deletion", () => {
  it("CH-12.S3 keeps the Desk until the 30th day", async () => {
    now = after(DELETION_DAYS, -1);
    await build().ender.tick();
    expect(events).toEqual([]);
  });

  it("CH-12.S3 deletes the backup repo, then the server folder, then forgets the Recruiter, 30 days after the end", async () => {
    const { ender, registry, partnerships } = build();
    now = after(DELETION_DAYS);
    await ender.tick();
    expect(events).toEqual([`backup ${desk}`, `desk ${desk}`, `forget ${desk}`]);
    expect(registry.find("telegram", "42")).toBeUndefined();
    expect(loadRegistry(join(data, "recruiters.json")).all()).toEqual([]);
    expect(partnerships.get(desk)?.deletedAt).toBe(now.toISOString());
    expect(pings.join("\n")).toContain("Camille Dupont");
    expect(pings.join("\n")).toMatch(/deleted/i);
    await ender.tick();
    expect(events).toHaveLength(3);
  });

  it("CH-12.S3 deletes at night too, and sends no reminder once the Desk is due", async () => {
    now = after(DELETION_DAYS + 1, 12);
    await build().ender.tick();
    expect(events[0]).toBe(`backup ${desk}`);
    expect(reminders).toEqual([]);
  });

  it("CH-12.S3 keeps the server folder when the backup repo cannot be deleted, tells Vincent once, and retries", async () => {
    const { ender, partnerships } = build();
    backupError = new Error("HTTP 403: Must have admin rights");
    now = after(DELETION_DAYS);
    await ender.tick();
    await ender.tick();
    expect(events).toEqual([`backup ${desk}`, `backup ${desk}`]);
    expect(pings).toHaveLength(1);
    expect(pings[0]).toContain("Camille Dupont");
    expect(partnerships.get(desk)?.deletedAt).toBeUndefined();
    backupError = null;
    await ender.tick();
    expect(events.slice(2)).toEqual([`backup ${desk}`, `desk ${desk}`, `forget ${desk}`]);
  });

  it("CH-12.S3 does not delete the backup again once it is gone and only the folder removal failed", async () => {
    const { ender } = build();
    let failDesk = true;
    const original = deleter.deleteDesk;
    deleter.deleteDesk = async (d) => {
      if (failDesk) throw new Error("EBUSY");
      return original(d);
    };
    now = after(DELETION_DAYS);
    await ender.tick();
    failDesk = false;
    await ender.tick();
    deleter.deleteDesk = original;
    expect(events.filter((e) => e.startsWith("backup"))).toHaveLength(1);
    expect(events).toContain(`desk ${desk}`);
  });
});
