import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commitTurn } from "./desk-git.ts";
import { Engine } from "./engine.ts";
import { loadRegistry } from "./registry.ts";
import { SdkRunner } from "./sdk-runner.ts";
import { botApi, TelegramAdapter } from "./telegram.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.AUTO_RECRUIT_DATA ?? join(here, "..", "data"));

const engine = new Engine({
  registry: loadRegistry(join(dataDir, "recruiters.json")),
  runner: new SdkRunner({
    pluginPath: resolve(here, "..", "..", "plugins", "auto-recruit"),
    exaApiKey: required("EXA_API_KEY"),
  }),
  sessionsFile: join(dataDir, "sessions.json"),
  commit: commitTurn,
});

const adapter = new TelegramAdapter(botApi(required("TELEGRAM_BOT_TOKEN")), (userId, text, typing) =>
  engine.handle("telegram", userId, text, { onTurnStart: typing.start, onTurnEnd: typing.stop }),
);

const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => stop.abort());
await adapter.run(stop.signal);
