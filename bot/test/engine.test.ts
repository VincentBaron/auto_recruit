import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Engine, MENU, type AgentRunner, type DeskVersions, type Reply, type TurnRequest } from "../src/engine.ts";
import { loadRegistry } from "../src/registry.ts";

let root: string;
let desk: string;
let dataDir: string;
const commits: Array<{ desk: string; message: string }> = [];

/** A fake Desk history: `head` is the last commit, `recap` says whether it added an Attempt. */
const history = { head: "sha1", recap: false, undone: [] as string[] };

const versions: DeskVersions = {
  head: async () => history.head,
  addsAttempt: async () => history.recap,
  undo: async (_desk, sha) => {
    if (sha !== history.head) return false;
    history.undone.push(sha);
    return true;
  },
};

const makeEngine = (runner: AgentRunner) =>
  new Engine({
    registry: loadRegistry(join(dataDir, "recruiters.json")),
    runner,
    sessionsFile: join(dataDir, "sessions.json"),
    commit: async (d, message) => {
      commits.push({ desk: d, message });
      return true;
    },
    versions,
  });

/** Sends one text to the engine and collects every reply it produced; null when the sender has no Desk. */
async function say(engine: Engine, text: string, user = "42"): Promise<Reply[] | null> {
  const replies: Reply[] = [];
  const known = await engine.handle("telegram", user, { kind: "text", text }, async (r) => void replies.push(r));
  return known ? replies : null;
}

async function tap(engine: Engine, data: string): Promise<Reply[]> {
  const replies: Reply[] = [];
  await engine.handle("telegram", "42", { kind: "tap", data }, async (r) => void replies.push(r));
  return replies;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "engine-"));
  desk = join(root, "desk1");
  dataDir = join(root, "data");
  mkdirSync(desk);
  mkdirSync(dataDir);
  writeFileSync(join(dataDir, "recruiters.json"), JSON.stringify([{ channel: "telegram", userId: "42", desk }]));
  commits.length = 0;
  Object.assign(history, { head: "sha1", recap: false, undone: [] });
});

const ok = (text: string, sessionId = "s1") => ({ text, sessionId });

describe("Engine", () => {
  it("runs a message as a turn in the Recruiter's Desk and returns the answer", async () => {
    const seen: TurnRequest[] = [];
    const engine = makeEngine({ run: async (r) => (seen.push(r), ok("Voici votre liste")) });
    expect(await say(engine, "what is on my Call List?")).toEqual([{ text: "Voici votre liste" }]);
    expect(seen[0]).toMatchObject({ desk, prompt: "what is on my Call List?", sessionId: undefined });
  });

  it("ignores users without a Desk", async () => {
    const engine = makeEngine({ run: async () => ok("never") });
    expect(await say(engine, "hello", "999")).toBeNull();
    const send = async () => {};
    expect(await engine.handle("whatsapp", "42", { kind: "text", text: "hello" }, send)).toBe(false);
  });

  it("resumes the Recruiter's session on the next message, even after a restart", async () => {
    const seen: TurnRequest[] = [];
    const runner: AgentRunner = { run: async (r) => (seen.push(r), ok("a", "session-A")) };
    await say(makeEngine(runner), "one");
    await say(makeEngine(runner), "two");
    expect(seen[1].sessionId).toBe("session-A");
  });

  it("handles messages one after the other for the same Desk", async () => {
    const events: string[] = [];
    const engine = makeEngine({
      run: async (r) => {
        events.push(`start ${r.prompt}`);
        await new Promise((resolve) => setTimeout(resolve, r.prompt === "first" ? 40 : 1));
        events.push(`end ${r.prompt}`);
        return ok(r.prompt);
      },
    });
    const answers = await Promise.all([say(engine, "first"), say(engine, "second")]);
    expect(answers).toEqual([[{ text: "first" }], [{ text: "second" }]]);
    expect(events).toEqual(["start first", "end first", "start second", "end second"]);
  });

  it("commits the Desk after each turn", async () => {
    const engine = makeEngine({ run: async () => ok("done") });
    await say(engine, "add a todo");
    expect(commits).toEqual([{ desk, message: "Turn: add a todo" }]);
  });

  it("keeps the queue going and still commits when a turn fails", async () => {
    let n = 0;
    const engine = makeEngine({
      run: async () => {
        if (n++ === 0) throw new Error("boom");
        return ok("fine");
      },
    });
    await expect(say(engine, "one")).rejects.toThrow("boom");
    expect(commits).toHaveLength(1);
    expect(await say(engine, "two")).toEqual([{ text: "fine" }]);
  });

  it("notifies when a turn starts and ends", async () => {
    const events: string[] = [];
    const engine = makeEngine({ run: async () => (events.push("run"), ok("x")) });
    await engine.handle("telegram", "42", { kind: "text", text: "hi" }, async () => {}, {
      onTurnStart: () => events.push("start"),
      onTurnEnd: () => events.push("end"),
    });
    expect(events).toEqual(["start", "run", "end"]);
  });
});

const CARD = "📞 Léa Morel - CTO, Acme\nWhy Now: two FDE postings.\n+33612345678";
const labels = (reply: Reply) => reply.buttons?.flat().map((b) => b.label);

describe("Call Sheet cards", () => {
  it("turns each menu button into a turn of the call and batch skills", async () => {
    const seen: string[] = [];
    const engine = makeEngine({ run: async (r) => (seen.push(r.prompt), ok("x")) });
    await say(engine, MENU.next);
    await say(engine, MENU.list);
    await say(engine, MENU.batch);
    expect(seen[0]).toMatch(/next due Call Sheet/);
    expect(seen[1]).toMatch(/Call List/);
    expect(seen[2]).toMatch(/Batch/);
  });

  it("puts No Answer, Voicemail, Skip for now and More under a card, with a copy-number fallback", async () => {
    const engine = makeEngine({ run: async () => ok(CARD) });
    const [card] = (await say(engine, MENU.next))!;
    expect(labels(card)).toEqual(["No Answer", "Voicemail", "Skip for now", "More", "Copy number"]);
    expect(card.buttons!.flat().find((b) => b.label === "Copy number")).toEqual({
      label: "Copy number",
      copy: "+33612345678",
    });
  });

  it("flags a card without a number and offers no copy button", async () => {
    const engine = makeEngine({ run: async () => ok("📞 Paul Girard, Nexo\n⚠️ No working number") });
    const [card] = (await say(engine, MENU.next))!;
    expect(labels(card)).toEqual(["No Answer", "Voicemail", "Skip for now", "More"]);
  });

  it("adds no buttons to an answer that is not a card", async () => {
    const engine = makeEngine({ run: async () => ok("Rien à appeler pour le moment.") });
    expect(await say(engine, MENU.next)).toEqual([{ text: "Rien à appeler pour le moment." }]);
  });

  it("expands a card with More, without offering More again", async () => {
    const seen: string[] = [];
    const engine = makeEngine({ run: async (r) => (seen.push(r.prompt), ok(CARD)) });
    const [card] = await tap(engine, "more");
    expect(seen[0]).toMatch(/Signals.*previous Attempts.*objections/s);
    expect(labels(card)).not.toContain("More");
  });
});

describe("Recap, Undo and the next call", () => {
  const recapEngine = (answers: string[]) => {
    const prompts: string[] = [];
    const engine = makeEngine({
      run: async (r) => {
        prompts.push(r.prompt);
        return ok(answers.shift() ?? "…");
      },
    });
    return { engine, prompts };
  };

  it("writes a tapped Recap, answers in one line with Undo, then sends the next card by itself", async () => {
    history.recap = true;
    const { engine, prompts } = recapEngine(["✓ Léa Morel - No Answer", CARD]);
    const replies = await tap(engine, "recap:No Answer");
    expect(prompts[0]).toMatch(/No Answer/);
    expect(replies[0]).toEqual({
      text: "✓ Léa Morel - No Answer",
      buttons: [[{ label: "Undo", data: "undo:sha1" }]],
    });
    expect(prompts[1]).toMatch(/next due Call Sheet/);
    expect(labels(replies[1])).toContain("Voicemail");
  });

  it("treats a typed Recap the same way once it added an Attempt", async () => {
    history.recap = true;
    const { engine } = recapEngine(["✓ Léa Morel - Callback mar. 10:00. 2 tâches ajoutées.", CARD]);
    const replies = (await say(engine, "elle rappelle mardi 10h, envoyer 2 profils"))!;
    expect(labels(replies[0])).toEqual(["Undo"]);
    expect(replies).toHaveLength(2);
  });

  it("offers Undo after Skip for now, which records no Attempt", async () => {
    const { engine, prompts } = recapEngine(["✓ Léa Morel - reportée", CARD]);
    const replies = await tap(engine, "recap:skip");
    expect(prompts[0]).toMatch(/Skip for now/);
    expect(labels(replies[0])).toEqual(["Undo"]);
    expect(replies).toHaveLength(2);
  });

  it("asks its one question without Undo and without a next card", async () => {
    const { engine, prompts } = recapEngine(["Rappel ou pas intéressé?"]);
    expect(await say(engine, "bof, il hésite")).toEqual([{ text: "Rappel ou pas intéressé?" }]);
    expect(prompts).toHaveLength(1);
  });

  it("stops chaining when the Recruiter says stop, until they ask for the next call", async () => {
    history.recap = true;
    const { engine, prompts } = recapEngine(["✓ one", "✓ two", CARD, "✓ three", CARD]);
    expect(await say(engine, "stop")).toHaveLength(1);
    expect(prompts).toHaveLength(0);
    expect(await say(engine, "no answer")).toHaveLength(1);
    await say(engine, MENU.next);
    expect(await say(engine, "no answer")).toHaveLength(2);
  });

  it("does not chain the next card while another message is waiting", async () => {
    const prompts: string[] = [];
    const engine = makeEngine({
      run: async (r) => {
        prompts.push(r.prompt);
        history.recap = r.prompt === "no answer";
        return ok("✓");
      },
    });
    const [first, second] = await Promise.all([say(engine, "no answer"), say(engine, "merci")]);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(prompts).toEqual(["no answer", "merci"]);
  });

  it("undoes the last Recap, tells the agent, and shows the person's card again", async () => {
    history.recap = true;
    const { engine, prompts } = recapEngine(["✓ one", CARD, CARD]);
    await tap(engine, "recap:Voicemail");
    const replies = await tap(engine, "undo:sha1");
    expect(history.undone).toEqual(["sha1"]);
    expect(replies[0].text).toMatch(/Annulé/);
    expect(prompts[2]).toMatch(/tapped Undo/);
    expect(labels(replies[1])).toContain("No Answer");
  });

  it("refuses an Undo once the Desk has moved on, and changes nothing", async () => {
    const { engine, prompts } = recapEngine([]);
    history.head = "sha2";
    const replies = await tap(engine, "undo:sha1");
    expect(history.undone).toEqual([]);
    expect(replies[0].text).toMatch(/trop tard/i);
    expect(prompts).toHaveLength(0);
  });

  it("runs a whole session of five calls from taps and short texts", async () => {
    history.recap = true;
    const people = ["Léa", "Paul", "Hugo", "Marc", "Sophie"];
    let shown = 0;
    const engine = makeEngine({
      run: async (r) => {
        if (/next due Call Sheet/.test(r.prompt)) {
          return ok(shown < people.length ? `📞 ${people[shown++]}\n+3361234567${shown}` : "Plus rien à appeler aujourd'hui.");
        }
        return ok(`✓ ${people[shown - 1]}`);
      },
    });
    await say(engine, MENU.next);
    const last = [
      await tap(engine, "recap:No Answer"),
      await tap(engine, "recap:Voicemail"),
      (await say(engine, "callback jeudi 14h"))!,
      (await say(engine, "pas intéressé"))!,
      await tap(engine, "recap:skip"),
    ];
    expect(last.map((r) => r[0].text)).toEqual(people.map((p) => `✓ ${p}`));
    expect(last[4][1].text).toMatch(/Plus rien/);
  });
});

describe("Help", () => {
  it('lists what the bot can do for "aide" and "?" without running a turn', async () => {
    const engine = makeEngine({
      run: async () => {
        throw new Error("no turn expected");
      },
    });
    for (const text of ["aide", "?", "Aide"]) {
      const [reply] = (await say(engine, text))!;
      expect(reply.text).toContain(MENU.next);
      expect(reply.text).toContain(MENU.list);
      expect(reply.text).toContain(MENU.batch);
    }
    expect(commits).toEqual([]);
  });
});

describe("loadRegistry", () => {
  it("returns no Desk when the file is missing", () => {
    expect(loadRegistry(join(dataDir, "nope.json")).deskFor("telegram", "42")).toBeUndefined();
  });

  it("maps a channel user to a Desk folder", () => {
    expect(loadRegistry(join(dataDir, "recruiters.json")).deskFor("telegram", "42")).toBe(desk);
    expect(readFileSync(join(dataDir, "recruiters.json"), "utf8")).toContain("42");
  });
});
