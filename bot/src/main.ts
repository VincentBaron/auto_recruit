import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Allowances } from "./allowance.ts";
import { Concierge } from "./concierge.ts";
import { commitTurn } from "./desk-git.ts";
import { Engine } from "./engine.ts";
import { loadInvites } from "./invites.ts";
import { DEFAULT_TIMEZONE, loadRegistry } from "./registry.ts";
import { SdkRunner } from "./sdk-runner.ts";
import { botApi, TelegramAdapter } from "./telegram.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.AUTO_RECRUIT_DATA ?? join(here, "..", "data"));

const api = botApi(required("TELEGRAM_BOT_TOKEN"));
const adminId = required("ADMIN_TELEGRAM_ID");
const botUsername = ((await api.call("getMe")) as { username: string }).username;

const registry = loadRegistry(join(dataDir, "recruiters.json"));
const allowances = new Allowances({
  file: join(dataDir, "allowances.json"),
  timezoneOf: (desk) => registry.all().find((r) => r.desk === desk)?.timezone ?? DEFAULT_TIMEZONE,
  phonePriceEur: process.env.PHONE_PRICE_EUR ? Number(process.env.PHONE_PRICE_EUR) : undefined,
});

// Vincent's chat id on Telegram is his user id; the concierge exists once the runner has been given its error hook.
let concierge: Concierge | undefined;
const notifyAdmin = async (text: string) => void (await api.call("sendMessage", { chat_id: adminId, text }));

const engine = new Engine({
  registry,
  runner: new SdkRunner({
    pluginPath: resolve(here, "..", "..", "plugins", "auto-recruit"),
    exaApiKey: required("EXA_API_KEY"),
    allowances,
    onExaError: (desk, tool, message) => void concierge?.exaFailed(desk, tool, message).catch(() => {}),
  }),
  sessionsFile: join(dataDir, "sessions.json"),
  commit: commitTurn,
});

concierge = new Concierge({
  channel: "telegram",
  engine,
  registry,
  invites: loadInvites(join(dataDir, "invites.json")),
  allowances,
  adminId,
  notifyAdmin,
  botUsername,
  desksDir: join(dataDir, "desks"),
  failuresFile: join(dataDir, "enrichment-failures.json"),
});

const adapter = new TelegramAdapter(api, (userId, text, typing, sender) =>
  concierge!.handle(userId, text, sender, { onTurnStart: typing.start, onTurnEnd: typing.stop }),
);

const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => stop.abort());
await adapter.run(stop.signal);
