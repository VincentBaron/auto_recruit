import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Allowances } from "../src/allowance.ts";
import { Concierge, type Sender } from "../src/concierge.ts";
import { Engine, type TurnRequest } from "../src/engine.ts";
import { loadInvites } from "../src/invites.ts";
import { loadRegistry } from "../src/registry.ts";

const ADMIN = "1";
let data: string;
let pings: string[];
let turns: TurnRequest[];
let now: Date;

const camille: Sender = { name: "Camille D.", username: "camille", language: "fr" };

function build() {
  const registry = loadRegistry(join(data, "recruiters.json"));
  const allowances = new Allowances({
    file: join(data, "allowances.json"),
    timezoneOf: () => "Europe/Paris",
    now: () => now,
    phonePriceEur: 1,
  });
  const engine = new Engine({
    registry,
    runner: { run: async (r) => (turns.push(r), { text: "ok", sessionId: "s" }) },
    sessionsFile: join(data, "sessions.json"),
    commit: async () => true,
    versions: { head: async () => null, addsAttempt: async () => false, undo: async () => false },
  });
  const concierge = new Concierge({
    channel: "telegram",
    engine,
    registry,
    invites: loadInvites(join(data, "invites.json")),
    allowances,
    adminId: ADMIN,
    notifyAdmin: async (text) => void pings.push(text),
    botUsername: "AutoRecruitBot",
    desksDir: join(data, "desks"),
    failuresFile: join(data, "failures.json"),
  });
  return { concierge, registry, allowances };
}

beforeEach(() => {
  data = mkdtempSync(join(tmpdir(), "concierge-"));
  pings = [];
  turns = [];
  now = new Date("2026-10-12T10:00:00Z");
});

/** What the Concierge said back to one text, or null when it stayed silent. */
async function ask(c: Concierge, user: string, text: string, sender: Sender): Promise<string | null> {
  const said: string[] = [];
  await c.handle(user, { kind: "text", text }, sender, async (reply) => void said.push(reply.text));
  return said.length === 0 ? null : said.join("\n");
}

async function invite(c: Concierge, name = "Camille Dupont") {
  const reply = await ask(c, ADMIN, `invite ${name}`, { name: "Vincent" });
  return /start=(\S+)$/.exec(reply!)![1];
}

describe("invites", () => {
  it("gives Vincent a personal link whose code is 1-64 characters of A-Za-z0-9_-", async () => {
    const { concierge } = build();
    const reply = await ask(concierge, ADMIN, "invite Camille Dupont", { name: "Vincent" });
    expect(reply).toMatch(/^Invitation for Camille Dupont: https:\/\/t\.me\/AutoRecruitBot\?start=[A-Za-z0-9_-]{1,64}$/);
  });

  it("creates a new empty Desk, ties it to the account and records name, timezone and language", async () => {
    const { concierge, registry } = build();
    const code = await invite(concierge);
    const reply = await ask(concierge, "42", `/start ${code}`, camille);
    expect(reply).toContain("Camille");
    const recruiter = registry.find("telegram", "42")!;
    expect(recruiter).toMatchObject({ name: "Camille Dupont", timezone: "Europe/Paris", language: "fr" });
    expect(statSync(recruiter.desk).isDirectory()).toBe(true);
    expect(statSync(recruiter.desk).mode & 0o777).toBe(0o700);
    // and the registry on disk survives a restart
    expect(loadRegistry(join(data, "recruiters.json")).deskFor("telegram", "42")).toBe(recruiter.desk);
  });

  it("creates a Desk exactly once: reusing the link does nothing", async () => {
    const { concierge, registry } = build();
    const code = await invite(concierge);
    await ask(concierge, "42", `/start ${code}`, camille);
    expect(await ask(concierge, "42", `/start ${code}`, camille)).toBeNull();
    const reply = await ask(concierge, "77", `/start ${code}`, { name: "Someone", language: "en" });
    expect(reply).toContain("invitation-only");
    expect(registry.all()).toHaveLength(1);
    expect(registry.find("telegram", "77")).toBeUndefined();
  });

  it("does not let a code made of other characters through", async () => {
    const { concierge, registry } = build();
    await ask(concierge, "42", "/start ../../etc", camille);
    expect(registry.all()).toHaveLength(0);
  });

  it("gives each Recruiter their own Desk", async () => {
    const { concierge, registry } = build();
    await ask(concierge, "42", `/start ${await invite(concierge)}`, camille);
    await ask(concierge, "43", `/start ${await invite(concierge, "Paul Girard")}`, { name: "Paul" });
    expect(registry.find("telegram", "42")!.desk).not.toBe(registry.find("telegram", "43")!.desk);
  });
});

describe("strangers", () => {
  it("never get a Desk, get a warm answer in their language, and Vincent hears of them", async () => {
    const { concierge, registry } = build();
    const fr = await ask(concierge, "99", "/start", { name: "Jean Martin", username: "jmartin", language: "fr" });
    expect(fr).toContain("On vous recontacte");
    const en = await ask(concierge, "98", "hello", { name: "Ann", language: "en-GB" });
    expect(en).toContain("get back to you");
    expect(registry.all()).toHaveLength(0);
    expect(existsSync(join(data, "desks"))).toBe(false);
    expect(pings[0]).toContain("Jean Martin");
    expect(pings[0]).toContain("@jmartin");
  });

  it("do not make Vincent's phone buzz again for each message", async () => {
    const { concierge } = build();
    for (let i = 0; i < 3; i++) await ask(concierge, "99", "hi", camille);
    expect(pings).toHaveLength(1);
    expect(turns).toHaveLength(0);
  });
});

describe("admin lines only work from Vincent's account", () => {
  it("ignores them from a Recruiter or a stranger", async () => {
    const { concierge } = build();
    await ask(concierge, "42", `/start ${await invite(concierge)}`, camille);
    turns.length = 0;
    expect(await ask(concierge, "42", "invite Mallory", camille)).toBe("ok");
    expect(turns[0].prompt).toBe("invite Mallory");
    const reply = await ask(concierge, "99", "invite Mallory", { name: "Mallory", language: "en" });
    expect(reply).toContain("invitation-only");
  });

  it("raises a Batch limit and adds euros for a named Recruiter", async () => {
    const { concierge, registry, allowances } = build();
    await ask(concierge, "42", `/start ${await invite(concierge)}`, camille);
    const desk = registry.find("telegram", "42")!.desk;
    expect(await ask(concierge, ADMIN, "raise Camille to 6 Batches", { name: "V" })).toContain("6 Batches");
    expect(await ask(concierge, ADMIN, "give Camille €30 more for numbers", { name: "V" })).toContain("€80");
    expect(allowances.limits(desk)).toEqual({ batches: 6, euros: 80 });
    expect(await ask(concierge, ADMIN, "raise Nobody to 6 Batches", { name: "V" })).toContain("No Recruiter");
  });
});

describe("Allowance pings", () => {
  it("tells Vincent once at 75% and once at 100%", async () => {
    const { concierge, registry, allowances } = build();
    await ask(concierge, "42", `/start ${await invite(concierge)}`, camille);
    pings.length = 0;
    const desk = registry.find("telegram", "42")!.desk;
    for (let i = 0; i < 3; i++) allowances.recordBatchStart(desk);
    await ask(concierge, "42", "hello", camille);
    await ask(concierge, "42", "hello again", camille);
    expect(pings).toHaveLength(1);
    expect(pings[0]).toContain("75%");
    allowances.recordBatchStart(desk);
    await ask(concierge, "42", "hello", camille);
    expect(pings).toHaveLength(2);
    expect(pings[1]).toContain("100%");
  });
});

describe("failures", () => {
  it("pings Vincent when Enrichment fails twice for the same person, once", async () => {
    const { concierge, registry } = build();
    await ask(concierge, "42", `/start ${await invite(concierge)}`, camille);
    pings.length = 0;
    const desk = registry.find("telegram", "42")!.desk;
    mkdirSync(join(desk, "candidates"));
    const file = join(desk, "candidates", "hugo-martin.md");
    writeFileSync(file, "# Hugo Martin\n\n- Phone: not found (Exa, 2026-10-12)\n");
    await ask(concierge, "42", "go", camille);
    expect(pings).toHaveLength(0);
    writeFileSync(file, readFileSync(file, "utf8").replace("2026-10-12", "2026-10-14"));
    await ask(concierge, "42", "go", camille);
    await ask(concierge, "42", "go", camille);
    expect(pings).toHaveLength(1);
    expect(pings[0]).toContain("candidates/hugo-martin.md");
  });

  it("pings Vincent with the Recruiter's name when an Exa run errors", async () => {
    const { concierge } = build();
    const code = await invite(concierge);
    await ask(concierge, "42", `/start ${code}`, camille);
    pings.length = 0;
    const { registry } = build();
    await concierge.exaFailed(registry.find("telegram", "42")!.desk, "mcp__exa__agent_run", "rate limited");
    expect(pings[0]).toContain("Camille Dupont");
    expect(pings[0]).toContain("agent_run");
  });
});
