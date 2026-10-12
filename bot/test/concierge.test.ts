import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Allowances } from "../src/allowance.ts";
import { Concierge, type Sender } from "../src/concierge.ts";
import { Engine, type Reply, type TurnRequest } from "../src/engine.ts";
import { loadInvites } from "../src/invites.ts";
import { loadPartnerships } from "../src/partnership.ts";
import { loadRegistry } from "../src/registry.ts";

const ADMIN = "1";
let data: string;
let pings: string[];
let turns: TurnRequest[];
let now: Date;
let documents: Array<{ userId: string; name: string; data: Buffer; caption: string }>;
let erased: string[];
let sendFails: boolean;

const camille: Sender = { name: "Camille D.", username: "camille", language: "fr" };

function build() {
  const registry = loadRegistry(join(data, "recruiters.json"));
  const allowances = new Allowances({
    file: join(data, "allowances.json"),
    timezoneOf: () => "Europe/Paris",
    now: () => now,
    phonePriceEur: 1,
  });
  const partnerships = loadPartnerships(join(data, "partnerships.json"));
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
    dpaUrl: "https://dpa.example/dpa",
    partnerships,
    sendDocument: async (userId, name, bytes, caption) => {
      if (sendFails) throw new Error("telegram down");
      documents.push({ userId, name, data: bytes, caption });
    },
    afterErase: async (desk) => void erased.push(desk),
    now: () => now,
  });
  return { concierge, registry, allowances, partnerships, engine };
}

beforeEach(() => {
  data = mkdtempSync(join(tmpdir(), "concierge-"));
  pings = [];
  turns = [];
  documents = [];
  erased = [];
  sendFails = false;
  now = new Date("2026-10-12T10:00:00Z");
});

/** What the Concierge said back to one text, or null when it stayed silent. */
async function ask(c: Concierge, user: string, text: string, sender: Sender): Promise<string | null> {
  const said: string[] = [];
  await c.handle(user, { kind: "text", text }, sender, async (reply) => void said.push(reply.text));
  return said.length === 0 ? null : said.join("\n");
}

/** Everything the Concierge said back, with its buttons. */
async function exchange(c: Concierge, user: string, input: { kind: "text"; text: string } | { kind: "tap"; data: string }, sender: Sender): Promise<Reply[]> {
  const said: Reply[] = [];
  await c.handle(user, input, sender, async (reply) => void said.push(reply));
  return said;
}
const tap = (c: Concierge, user: string, data: string, sender: Sender) => exchange(c, user, { kind: "tap", data }, sender);

/** A Recruiter who opened their invite and accepted the DPA, so the Niche discussion can start. */
async function onboard(c: Concierge, user = "42", name = "Camille Dupont", sender: Sender = camille): Promise<void> {
  await ask(c, user, `/start ${await invite(c, name)}`, sender);
  await tap(c, user, "dpa:accept", sender);
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

describe("the welcome message", () => {
  it("CH-5.S1 greets the Recruiter by their Telegram first name and follows the PRD text, ending with the first question", async () => {
    const { concierge } = build();
    const reply = await ask(concierge, "42", `/start ${await invite(concierge, "Marie Curie")}`, camille);
    expect(reply).toMatch(/^Bonjour Camille 👋\nJe suis Auto Recruit\./);
    expect(reply).toContain("Comment ça marche");
    expect(reply).toContain("Chaque matin à 8h30");
  });

  it("CH-5.S1 ends with the first question once the DPA is accepted", async () => {
    const { concierge } = build();
    await ask(concierge, "42", `/start ${await invite(concierge)}`, camille);
    const replies = await tap(concierge, "42", "dpa:accept", camille);
    expect(replies.map((r) => r.text).join("\n").trimEnd()).toMatch(/Qu'est-ce que vous placez, et où\?.*$/s);
  });

  it("CH-5.S1 makes no promise about timing", async () => {
    const { concierge } = build();
    const reply = await ask(concierge, "42", `/start ${await invite(concierge)}`, camille);
    expect(reply).not.toMatch(/dans (les )?\d+|d'ici|prêt[es]? (dans|en|d'ici)|sous \d+|rapidement|immédiatement|within|in a few/i);
  });

  it("CH-5.S1 speaks the Telegram language of the Recruiter and defaults to French", async () => {
    const { concierge } = build();
    const sam: Sender = { name: "Sam Lee", language: "en-GB" };
    const en = await ask(concierge, "42", `/start ${await invite(concierge)}`, sam);
    expect(en).toMatch(/^Hello Sam 👋/);
    expect((await tap(concierge, "42", "dpa:accept", sam)).map((r) => r.text).join("\n")).toContain("What do you place, and where?");
    const unknown = await ask(concierge, "43", `/start ${await invite(concierge, "Paul Girard")}`, { name: "Paul R", language: "de" });
    expect(unknown).toMatch(/^Bonjour Paul 👋/);
    const none = await ask(concierge, "44", `/start ${await invite(concierge, "Lea Morel")}`, { name: "Léa" });
    expect(none).toMatch(/^Bonjour Léa 👋/);
  });

  it("CH-5.S1 runs the niche skill as a chat from the Recruiter's first answer", async () => {
    const { concierge } = build();
    await onboard(concierge);
    await ask(concierge, "42", "Des FDE à Paris pour des startups IA", camille);
    expect(turns).toHaveLength(1);
    expect(turns[0].prompt).toContain("niche skill");
    expect(turns[0].prompt).toContain("one question per message");
    expect(turns[0].prompt).toContain("Des FDE à Paris pour des startups IA");
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
    expect(turns[0].prompt).toContain("invite Mallory");
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

const DPA = "https://dpa.example/dpa";

describe("the DPA gate", () => {
  it("CH-12.S1 links the DPA in the welcome message and asks the Recruiter to accept it with a button", async () => {
    const { concierge } = build();
    const replies = await exchange(concierge, "42", { kind: "text", text: `/start ${await invite(concierge)}` }, camille);
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toContain(DPA);
    expect(replies[0].text).not.toMatch(/Qu'est-ce que vous placez/);
    expect(replies[0].buttons).toEqual([[{ label: expect.stringMatching(/accepte/i), data: "dpa:accept" }]]);
  });

  it("CH-12.S1 speaks English to an English-speaking Recruiter", async () => {
    const { concierge } = build();
    const [welcome] = await exchange(concierge, "42", { kind: "text", text: `/start ${await invite(concierge)}` }, { name: "Sam", language: "en" });
    expect(welcome.text).toContain(DPA);
    expect(welcome.buttons![0][0].label).toMatch(/accept/i);
  });

  it("CH-12.S1 starts no Niche discussion before the DPA is accepted, and says why each time", async () => {
    const { concierge } = build();
    await ask(concierge, "42", `/start ${await invite(concierge)}`, camille);
    for (let i = 0; i < 2; i++) {
      const [reply] = await exchange(concierge, "42", { kind: "text", text: "Des FDE à Paris pour des startups IA" }, camille);
      expect(reply.text).toContain(DPA);
      expect(reply.buttons).toEqual([[{ label: expect.any(String), data: "dpa:accept" }]]);
    }
    expect(await tap(concierge, "42", "recap:skip", camille)).toHaveLength(1);
    expect(await ask(concierge, "42", "aide", camille)).toContain(DPA);
    expect(turns).toHaveLength(0);
  });

  it("CH-12.S1 records the acceptance with its date, on disk", async () => {
    const { concierge, registry } = build();
    await ask(concierge, "42", `/start ${await invite(concierge)}`, camille);
    expect(registry.find("telegram", "42")!.dpaAcceptedAt).toBeUndefined();
    now = new Date("2026-10-13T08:15:00Z");
    await tap(concierge, "42", "dpa:accept", camille);
    expect(registry.find("telegram", "42")!.dpaAcceptedAt).toBe("2026-10-13T08:15:00.000Z");
    expect(loadRegistry(join(data, "recruiters.json")).find("telegram", "42")!.dpaAcceptedAt).toBe("2026-10-13T08:15:00.000Z");
  });

  it("CH-12.S1 lets Vincent know the DPA was accepted", async () => {
    const { concierge } = build();
    await onboard(concierge);
    expect(pings.some((p) => p.includes("Camille Dupont") && /DPA/.test(p))).toBe(true);
  });

  it("CH-12.S1 accepts a typed 'j'accepte' as well as the button", async () => {
    const { concierge, registry } = build();
    await ask(concierge, "42", `/start ${await invite(concierge)}`, camille);
    const reply = await ask(concierge, "42", "J'accepte", camille);
    expect(reply).toMatch(/Qu'est-ce que vous placez, et où\?/);
    expect(registry.find("telegram", "42")!.dpaAcceptedAt).toBeDefined();
    expect(turns).toHaveLength(0);
  });

  it("CH-12.S1 starts the Niche discussion from the first answer after the acceptance", async () => {
    const { concierge } = build();
    await onboard(concierge);
    expect(turns).toHaveLength(0);
    await ask(concierge, "42", "Des FDE à Paris", camille);
    expect(turns).toHaveLength(1);
    expect(turns[0].prompt).toContain("niche skill");
  });

  it("CH-12.S1 records the acceptance once: a second tap changes nothing and starts no turn", async () => {
    const { concierge, registry } = build();
    await onboard(concierge);
    const first = registry.find("telegram", "42")!.dpaAcceptedAt;
    now = new Date("2026-10-20T08:00:00Z");
    expect(await tap(concierge, "42", "dpa:accept", camille)).toEqual([]);
    expect(registry.find("telegram", "42")!.dpaAcceptedAt).toBe(first);
    expect(turns).toHaveLength(0);
  });

  it("CH-12.S1 gates a Recruiter who was registered before the DPA existed", async () => {
    writeFileSync(
      join(data, "recruiters.json"),
      JSON.stringify([{ channel: "telegram", userId: "7", desk: join(data, "desks", "1"), name: "Vincent Baron", timezone: "Europe/Paris" }]),
    );
    const { concierge } = build();
    const reply = await ask(concierge, "7", "montre mes appels", camille);
    expect(reply).toContain(DPA);
    expect(turns).toHaveLength(0);
  });

  it("CH-12.S1 keeps the stranger's door closed: the accept button opens nothing for them", async () => {
    const { concierge, registry } = build();
    expect(await tap(concierge, "99", "dpa:accept", camille)).toEqual([]);
    expect(registry.all()).toEqual([]);
  });
});

describe("erasure", () => {
  async function deskWithSophie() {
    const { concierge, registry } = build();
    await onboard(concierge);
    const desk = registry.find("telegram", "42")!.desk;
    mkdirSync(join(desk, "candidates"));
    writeFileSync(join(desk, "candidates", "sophie-leroy.md"), "# Sophie Leroy\n\n- LinkedIn: https://www.linkedin.com/in/sophieleroy\n- Phone: +33611223344 (Exa, 2026-10-12)\n");
    writeFileSync(join(desk, "CALL_LIST.md"), "| 1 | [Sophie Leroy](candidates/sophie-leroy.md) | 2026-10-13 am | x |\n| 2 | Léa Morel | 2026-10-13 pm | y |\n");
    return { concierge, desk };
  }

  it("CH-12.S2 erases the person from the Desk and confirms in one line, without an agent turn", async () => {
    const { concierge, desk } = await deskWithSophie();
    const reply = await ask(concierge, "42", "Efface Sophie Leroy", camille);
    expect(reply).toContain("Sophie Leroy");
    expect(reply).not.toContain("\n");
    expect(reply).toMatch(/effac/i);
    expect(turns).toHaveLength(0);
    expect(existsSync(join(desk, "candidates", "sophie-leroy.md"))).toBe(false);
    expect(readFileSync(join(desk, "CALL_LIST.md"), "utf8")).not.toMatch(/Sophie|Leroy/);
    expect(readFileSync(join(desk, "CALL_LIST.md"), "utf8")).toContain("Léa Morel");
    expect(readFileSync(join(desk, "DO_NOT_CALL.md"), "utf8")).toContain("Sophie Leroy");
  });

  it("CH-12.S2 confirms in English for an English-speaking Recruiter", async () => {
    const { concierge, registry } = build();
    await onboard(concierge, "42", "Sam Lee", { name: "Sam", language: "en" });
    const desk = registry.find("telegram", "42")!.desk;
    writeFileSync(join(desk, "SKIPPED.md"), "# Skipped\n\n- 2026-10-12 - Sophie Leroy - https://www.linkedin.com/in/sophieleroy - fde - x\n");
    const reply = await ask(concierge, "42", "forget Sophie Leroy", { name: "Sam", language: "en" });
    expect(reply).toMatch(/^Erased Sophie Leroy/);
    expect(reply).not.toContain("\n");
  });

  it("CH-12.S2 then has the history rewritten and the backup updated, and starts the agent's next session fresh", async () => {
    const { concierge, desk } = await deskWithSophie();
    await ask(concierge, "42", "bonjour", camille);
    expect(JSON.parse(readFileSync(join(data, "sessions.json"), "utf8"))[desk]).toBe("s");
    await ask(concierge, "42", "Efface Sophie Leroy", camille);
    expect(erased).toEqual([desk]);
    expect(JSON.parse(readFileSync(join(data, "sessions.json"), "utf8"))[desk]).toBeUndefined();
  });

  it("CH-12.S2 says so, and changes nothing, when nobody of that name is on the Desk", async () => {
    const { concierge, desk } = await deskWithSophie();
    const reply = await ask(concierge, "42", "Efface Paul Inconnu", camille);
    expect(reply).toContain("Paul Inconnu");
    expect(reply).not.toContain("\n");
    expect(reply).toMatch(/personne|pas/i);
    expect(erased).toEqual([]);
    expect(existsSync(join(desk, "DO_NOT_CALL.md"))).toBe(false);
    expect(existsSync(join(desk, "candidates", "sophie-leroy.md"))).toBe(true);
  });

  it("CH-12.S2 only erases from the sender's own Desk", async () => {
    const { concierge, registry } = build();
    await onboard(concierge, "42", "Camille Dupont", camille);
    await onboard(concierge, "43", "Paul Girard", { name: "Paul", language: "fr" });
    const other = registry.find("telegram", "43")!.desk;
    writeFileSync(join(other, "SKIPPED.md"), "- 2026-10-12 - Sophie Leroy - x\n");
    await ask(concierge, "42", "Efface Sophie Leroy", camille);
    expect(readFileSync(join(other, "SKIPPED.md"), "utf8")).toContain("Sophie Leroy");
    expect(existsSync(join(other, "DO_NOT_CALL.md"))).toBe(false);
  });

  it("CH-12.S2 leaves any other line, such as a question about a person, to the agent", async () => {
    const { concierge } = await deskWithSophie();
    await ask(concierge, "42", "Qui est Sophie Leroy?", camille);
    expect(turns).toHaveLength(1);
    expect(erased).toEqual([]);
  });
});

describe("end of partnership", () => {
  async function camilleWithDesk() {
    const { concierge, registry, partnerships } = build();
    await onboard(concierge);
    const desk = registry.find("telegram", "42")!.desk;
    writeFileSync(join(desk, "CALL_LIST.md"), "# Call List\n");
    turns.length = 0;
    return { concierge, registry, partnerships, desk };
  }
  const vincent: Sender = { name: "Vincent" };

  it("CH-12.S3 sends Camille her Desk as a zip of markdown files and tells Vincent when it will be deleted", async () => {
    const { concierge, partnerships, desk } = await camilleWithDesk();
    const reply = await ask(concierge, ADMIN, "end Camille's partnership", vincent);
    expect(documents).toHaveLength(1);
    expect(documents[0].userId).toBe("42");
    expect(documents[0].name).toMatch(/\.zip$/);
    expect(documents[0].data.subarray(0, 2).toString()).toBe("PK");
    expect(documents[0].data.includes("CALL_LIST.md")).toBe(true);
    expect(documents[0].caption).toMatch(/2026-11-11/);
    expect(partnerships.get(desk)).toMatchObject({ userId: "42", name: "Camille Dupont", endedAt: now.toISOString(), remindersSent: 0 });
    expect(reply).toContain("Camille Dupont");
    expect(reply).toContain("2026-11-11");
  });

  it("CH-12.S3 understands the line with a full name, a typographic apostrophe, any case", async () => {
    const { concierge, partnerships, desk } = await camilleWithDesk();
    await ask(concierge, ADMIN, "End Camille Dupont’s partnership", vincent);
    expect(partnerships.get(desk)).toBeDefined();
  });

  it("CH-12.S3 is Vincent's line only", async () => {
    const { concierge, partnerships, desk } = await camilleWithDesk();
    await ask(concierge, "42", "end Camille's partnership", camille);
    expect(documents).toEqual([]);
    expect(partnerships.get(desk)).toBeUndefined();
    expect(turns).toHaveLength(1);
  });

  it("CH-12.S3 names no Recruiter that does not exist, and never ends a partnership twice", async () => {
    const { concierge } = await camilleWithDesk();
    expect(await ask(concierge, ADMIN, "end Nobody's partnership", vincent)).toContain("No Recruiter");
    await ask(concierge, ADMIN, "end Camille's partnership", vincent);
    expect(await ask(concierge, ADMIN, "end Camille's partnership", vincent)).toMatch(/already/i);
    expect(documents).toHaveLength(1);
  });

  it("CH-12.S3 ends nothing when the zip cannot be sent, and tells Vincent", async () => {
    const { concierge, partnerships, desk } = await camilleWithDesk();
    sendFails = true;
    const reply = await ask(concierge, ADMIN, "end Camille's partnership", vincent);
    expect(reply).toMatch(/could not|failed/i);
    expect(partnerships.get(desk)).toBeUndefined();
  });

  it("CH-12.S3 stops the agents for Camille while her Desk waits for its deletion, and tells her why", async () => {
    const { concierge } = await camilleWithDesk();
    await ask(concierge, ADMIN, "end Camille's partnership", vincent);
    const reply = await ask(concierge, "42", "montre mes appels", camille);
    expect(reply).toContain("2026-11-11");
    expect(turns).toHaveLength(0);
  });
});
