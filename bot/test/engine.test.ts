import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Engine, MENU, type AgentRunner, type DeskVersions, type Reply, type TurnRequest } from "../src/engine.ts";
import { loadRegistry } from "../src/registry.ts";
import { NICHE } from "./fixtures/niche.ts";

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
    for (const text of ["aide", "?", "Aide", "/help"]) {
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

describe("Voice notes", () => {
  const voiceOf = (data = "audio") => ({ kind: "voice" as const, audio: async () => Buffer.from(data) });
  const speak = async (engine: Engine, user = "42") => {
    const replies: Reply[] = [];
    const known = await engine.handle("telegram", user, voiceOf(), async (r) => void replies.push(r));
    return known ? replies : null;
  };
  const makeVoiceEngine = (runner: AgentRunner, transcribe: (terms: string[]) => Promise<string>, calls: string[][] = []) =>
    new Engine({
      registry: loadRegistry(join(dataDir, "recruiters.json")),
      runner,
      sessionsFile: join(dataDir, "sessions.json"),
      commit: async () => true,
      versions,
      voice: { transcribe: async (download, terms) => (await download(), calls.push(terms), transcribe(terms)) },
    });

  it("S1 runs the transcript as the Recruiter's message", async () => {
    const seen: TurnRequest[] = [];
    const engine = makeVoiceEngine(
      { run: async (r) => (seen.push(r), ok("Noté")) },
      async () => "J'ai eu Léa Morel, CTO chez Acme, elle est intéressée",
    );
    expect(await speak(engine)).toEqual([{ text: "Noté" }]);
    expect(seen[0].prompt).toBe("J'ai eu Léa Morel, CTO chez Acme, elle est intéressée");
  });

  it("S2 biases the transcript with the person on the last Call Sheet and the Niche's job titles", async () => {
    mkdirSync(join(desk, "niches"));
    writeFileSync(join(desk, "niches", "fde.md"), "# FDE\n\n## Hiring Contacts\n\n- CTO\n\n## Candidates\n\n- Forward Deployed Engineer\n");
    const calls: string[][] = [];
    const engine = makeVoiceEngine(
      { run: async (r) => ok(r.prompt === "Show the Call List, as the call skill says." ? "liste" : CARD) },
      async () => "voicemail",
      calls,
    );
    await say(engine, MENU.next);
    await speak(engine);
    expect(calls[0]).toEqual(["Léa Morel", "CTO", "Acme", "Forward Deployed Engineer"]);
  });

  it("S2 passes only the Niche titles when no Call Sheet was shown", async () => {
    mkdirSync(join(desk, "niches"));
    writeFileSync(join(desk, "niches", "fde.md"), "# FDE\n\n## Hiring Contacts\n\n- CTO\n");
    const calls: string[][] = [];
    const engine = makeVoiceEngine({ run: async () => ok("ok") }, async () => "bonjour", calls);
    await speak(engine);
    expect(calls[0]).toEqual(["CTO"]);
  });

  it("S3 treats a spoken Recap like a typed one: Undo and the next card follow", async () => {
    history.head = "sha2";
    history.recap = true;
    const prompts: string[] = [];
    const engine = makeVoiceEngine(
      { run: async (r) => (prompts.push(r.prompt), ok(prompts.length === 1 ? "Noté: Voicemail" : CARD)) },
      async () => "j'ai laissé un message",
    );
    const replies = (await speak(engine))!;
    expect(replies[0].buttons?.[0][0]).toEqual({ label: "Undo", data: "undo:sha2" });
    expect(replies[1].text).toBe(CARD);
    expect(prompts[0]).toBe("j'ai laissé un message");
  });

  it("S4 asks to try again, with no turn, when the transcription fails or comes back empty", async () => {
    const turns: string[] = [];
    const runner: AgentRunner = { run: async (r) => (turns.push(r.prompt), ok("x")) };
    for (const transcribe of [async () => Promise.reject(new Error("503")), async () => "  "]) {
      const replies = (await speak(makeVoiceEngine(runner, transcribe)))!;
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toMatch(/vocal/);
    }
    expect(turns).toEqual([]);
  });

  it("S5 does not download the voice note of someone with no Desk", async () => {
    const calls: string[][] = [];
    const engine = makeVoiceEngine({ run: async () => ok("x") }, async () => "x", calls);
    expect(await speak(engine, "999")).toBeNull();
    expect(calls).toEqual([]);
  });

  it("S6 says voice notes are off when no transcriber is set up", async () => {
    const turns: string[] = [];
    const engine = makeEngine({ run: async (r) => (turns.push(r.prompt), ok("x")) });
    const replies = (await speak(engine))!;
    expect(replies[0].text).toMatch(/vocal/);
    expect(turns).toEqual([]);
  });
});

describe("Niche discussion", () => {
  const writeNiche = (d: string, slug = "fde", content = NICHE) => {
    mkdirSync(join(d, "niches"), { recursive: true });
    writeFileSync(join(d, "niches", `${slug}.md`), content);
  };
  const approve = (replies: Reply[]) => replies.flatMap((r) => r.buttons?.flat() ?? []).find((b) => "data" in b && b.data.startsWith("niche:"));

  it("CH-5.S2 offers to approve a Niche written in the DESK.md format", async () => {
    const engine = makeEngine({ run: async (r) => (writeNiche(r.desk), ok("Voici votre niche. On la valide?")) });
    const replies = (await say(engine, "oui, FDE à Paris"))!;
    expect(replies[0].text).toBe("Voici votre niche. On la valide?");
    expect(approve(replies)).toMatchObject({ data: "niche:fde" });
  });

  it("CH-5.S2 sends a Niche that does not match the format back to the agent once, with what is wrong", async () => {
    const prompts: string[] = [];
    const engine = makeEngine({
      run: async (r) => {
        prompts.push(r.prompt);
        writeNiche(r.desk, "fde", prompts.length === 1 ? NICHE.replace("Calls in: French\n", "") : NICHE);
        return ok(prompts.length === 1 ? "premier jet" : "corrigé");
      },
    });
    const replies = (await say(engine, "FDE"))!;
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Calls in");
    expect(prompts[1]).toContain("DESK.md");
    expect(replies.map((r) => r.text)).toEqual(["corrigé"]);
    expect(approve(replies)).toBeDefined();
  });

  it("CH-5.S2 never offers approval for a Niche still wrong after the fix, and stops asking", async () => {
    let turns = 0;
    const engine = makeEngine({ run: async (r) => (turns++, writeNiche(r.desk, "fde", "# Broken\n"), ok("hmm")) });
    const replies = (await say(engine, "FDE"))!;
    expect(turns).toBe(2);
    expect(approve(replies)).toBeUndefined();
  });

  it("CH-5.S2 offers nothing while the Niche file did not change in the turn", async () => {
    writeNiche(desk);
    const engine = makeEngine({ run: async () => ok("ok, noted") });
    expect(approve((await say(engine, "merci"))!)).toBeUndefined();
  });

  it("CH-5.S3 starts the first Batch when the Niche is approved, and says it will write when the Batch is ready", async () => {
    writeNiche(desk);
    const seen: string[] = [];
    const engine = makeEngine({
      run: async (r) => {
        seen.push(r.prompt);
        mkdirSync(join(r.desk, "batches"), { recursive: true });
        writeFileSync(join(r.desk, "batches", "fde.md"), "# Batch\n\nStatus: Searching\n");
        return ok("Search run started");
      },
    });
    const replies = await tap(engine, "niche:fde");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("batch skill");
    expect(seen[0]).toContain("fde");
    expect(replies.map((r) => r.text).join("\n")).toMatch(/je vous écris/i);
    expect(replies.map((r) => r.text).join("\n")).not.toMatch(/\d+ ?(min|h|heure)|demain|ce soir/i);
  });

  it("CH-5.S3 tells the Recruiter what the agent said when no Batch could start", async () => {
    writeNiche(desk);
    const engine = makeEngine({ run: async () => ok("Allowance used up.") });
    const replies = await tap(engine, "niche:fde");
    expect(replies.map((r) => r.text)).toEqual(["Allowance used up."]);
  });

  it("CH-5.S3 ignores an approval for a Niche that does not exist", async () => {
    let turns = 0;
    const engine = makeEngine({ run: async () => (turns++, ok("x")) });
    expect(await tap(engine, "niche:../../etc")).toEqual([]);
    expect(await tap(engine, "niche:ghost")).toEqual([]);
    expect(turns).toBe(0);
    expect(existsSync(join(desk, "batches"))).toBe(false);
  });

  it("CH-5.S1 passes a notice from the concierge to the agent before the next turn only", async () => {
    const seen: string[] = [];
    const engine = makeEngine({ run: async (r) => (seen.push(r.prompt), ok("x")) });
    engine.tell(desk, "Welcome sent");
    await say(engine, "one");
    await say(engine, "two");
    expect(seen[0]).toContain("Welcome sent");
    expect(seen[0]).toContain("one");
    expect(seen[1]).toBe("two");
  });
});
