import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openBatches, readBatch } from "./batch-file.ts";
import { commitTurn } from "./desk-git.ts";
import { Engine } from "./engine.ts";
import { loadRegistry } from "./registry.ts";
import { BatchReview } from "./review.ts";
import { Scheduler, type SearchStatus } from "./scheduler.ts";
import { SdkRunner } from "./sdk-runner.ts";
import { botApi, TelegramAdapter } from "./telegram.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const CHANNEL = "telegram";
const POLL_EVERY_MS = 60_000;

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.AUTO_RECRUIT_DATA ?? join(here, "..", "data"));
const pluginPath = resolve(here, "..", "..", "plugins", "auto-recruit");
const exaApiKey = required("EXA_API_KEY");

const registry = loadRegistry(join(dataDir, "recruiters.json"));
const runner = new SdkRunner({ pluginPath, exaApiKey });
const engine = new Engine({
  registry,
  runner,
  sessionsFile: join(dataDir, "sessions.json"),
  commit: commitTurn,
});
const userOfDesk = (desk: string) => registry.recruiters(CHANNEL).find((r) => r.desk === desk)?.userId;

let adapter: TelegramAdapter;

const applyBatch = (desk: string, slug: string) => {
  const userId = userOfDesk(desk);
  if (userId === undefined) return;
  // Applying is an agent turn, so it waits its turn in the Desk's queue like any other.
  const prompt = `The Recruiter has finished reviewing the Batch of Niche ${slug}: it is Approved. Apply it (steps 3 and 4 of the batch skill) and give the report.`;
  engine
    .handle(CHANNEL, userId, prompt)
    .then((text) => adapter.push(userId, { text: text ?? "", buttons: [] }))
    .catch((error) => console.error(`applying ${slug} failed`, error));
};
const review = new BatchReview(applyBatch);

adapter = new TelegramAdapter(
  botApi(required("TELEGRAM_BOT_TOKEN")),
  (userId, text, typing) => engine.handle(CHANNEL, userId, text, { onTurnStart: typing.start, onTurnEnd: typing.stop }),
  {
    press: (userId, data) => {
      const desk = registry.deskFor(CHANNEL, userId);
      return desk === undefined ? null : review.press(desk, data);
    },
    reason: (userId, text) => {
      const desk = registry.deskFor(CHANNEL, userId);
      return desk === undefined ? null : review.reason(desk, text);
    },
  },
);

// Checking whether an Exa run ended is a short read-only question to a small model, outside the Desk's queue,
// so the Recruiter is never kept waiting while a search runs.
const scratch = join(dataDir, "scratch");
mkdirSync(scratch, { recursive: true });
const checker = new SdkRunner({ pluginPath, exaApiKey, model: "claude-haiku-4-5-20251001" });
const notifiedFile = join(dataDir, "notified.json");
const readNotified = (): string[] => {
  try {
    return existsSync(notifiedFile) ? JSON.parse(readFileSync(notifiedFile, "utf8")) : [];
  } catch {
    return [];
  }
};

const scheduler = new Scheduler({
  recruiters: () => registry.recruiters(CHANNEL),
  searchStatus: async (runId) => {
    const { text } = await checker.run({
      desk: scratch,
      prompt: `Call agent_run once with runId "${runId}" and nothing else. Answer with one word: RUNNING, FINISHED or FAILED.`,
    });
    const word = /RUNNING|FINISHED|FAILED/.exec(text.toUpperCase())?.[0];
    return ({ FINISHED: "finished", FAILED: "failed" } as Record<string, SearchStatus>)[word ?? ""] ?? "running";
  },
  finishSearch: async (desk, slug) => {
    const userId = userOfDesk(desk);
    if (userId === undefined) return;
    await engine.handle(CHANNEL, userId, `/auto-recruit:batch --resume ${slug}`);
  },
  notify: (userId, screen) => adapter.push(userId, screen),
  onFailure: (desk, slug, error) => console.error(`search failed for ${slug} in ${desk}`, error),
  notified: {
    has: (key) => readNotified().includes(key),
    add: (key) => writeFileSync(notifiedFile, JSON.stringify([...readNotified(), key])),
  },
  now: () => new Date(),
});

// A Batch left `Approved` by a restart is applied again; the skill skips people already `Applied`.
for (const { desk } of registry.recruiters(CHANNEL)) {
  for (const slug of openBatches(desk)) if (readBatch(desk, slug).status === "Approved") applyBatch(desk, slug);
}

const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => stop.abort());
await Promise.all([adapter.run(stop.signal), scheduler.run(stop.signal, POLL_EVERY_MS)]);
