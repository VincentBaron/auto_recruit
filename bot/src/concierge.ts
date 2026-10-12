import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseAdminCommand, type AdminCommand } from "./admin.ts";
import type { Allowances } from "./allowance.ts";
import type { Engine, Input, Reply, TurnHooks } from "./engine.ts";
import type { Invites } from "./invites.ts";
import { writeJsonAtomic } from "./json-file.ts";
import type { Partnerships } from "./partnership.ts";
import { DEFAULT_TIMEZONE, type Registry } from "./registry.ts";

/** Who is writing, as the channel knows them. */
export interface Sender {
  /** Display name on the channel. */
  name: string;
  username?: string;
  /** Language code the channel reports, such as `fr` or `en-GB`. */
  language?: string;
}

export interface ConciergeOptions {
  channel: string;
  engine: Engine;
  registry: Registry;
  invites: Invites;
  allowances: Allowances;
  /** The user id of Vincent on the channel: the only account whose admin lines count. */
  adminId: string;
  /** Pings Vincent. */
  notifyAdmin: (text: string) => Promise<void>;
  /** The handle of the bot, for the personal links. */
  botUsername: string;
  /** Where new Desks are created, one numbered folder each. */
  desksDir: string;
  /** Where the failures already counted are kept. */
  failuresFile: string;
  /** The URL of the data processing agreement; set by configuration, never guessed. */
  dpaUrl: string;
  partnerships: Partnerships;
  /** Sends a file to a Recruiter, such as their Desk as a zip. */
  sendDocument: (userId: string, name: string, data: Buffer, caption: string) => Promise<void>;
  /** After an erasure changed a Desk: commit it and drop the older history, locally and on the backup. */
  afterErase?: (desk: string) => Promise<void>;
  now?: () => Date;
}

const START = /^\/start(?:@\w+)?(?: (\S+))?$/;
const NOT_FOUND = /^- Phone: not found \(Exa, (\d{4}-\d{2}-\d{2})\)/m;

const languageOf = (sender: Sender) => (sender.language ?? "fr").split("-")[0].toLowerCase();

const STRANGER_REPLY: Record<string, string> = {
  fr: "Bonjour 👋 Auto Recruit n'est ouvert que sur invitation pour l'instant. On vous recontacte très vite!",
  en: "Hello 👋 Auto Recruit is invitation-only for now. We will get back to you very soon!",
};

/** The first message of a new Desk: it ends with the first question of the niche discussion, and promises nothing about timing. */
const WELCOME: Record<string, (name: string) => string> = {
  fr: (name) =>
    [
      `Bonjour ${name} 👋`,
      "Je suis Auto Recruit. Je trouve les entreprises qui recrutent et les candidats prêts à bouger dans votre niche, je trouve leur portable et je vous prépare quoi dire. Vous, vous appelez.",
      "",
      "Comment ça marche:",
      "1. Vous me dites ce que vous placez - 5 minutes, ici, à l'écrit ou en vocal.",
      "2. Je vous propose une vingtaine de personnes à appeler, chacune avec la raison de l'appeler maintenant. Vous gardez ou écartez d'un tap.",
      "3. Je trouve leurs numéros et je vous envoie chaque fiche d'appel. Vous appelez, vous me racontez en vocal, je note tout et je prépare la suite.",
      "",
      "Chaque matin à 8h30, vos appels du jour arrivent ici.",
      "On commence? Qu'est-ce que vous placez, et où? (ex: « des Forward Deployed Engineers à Paris, pour des startups IA série A à C »)",
    ].join("\n"),
  en: (name) =>
    [
      `Hello ${name} 👋`,
      "I am Auto Recruit. I find the companies that are hiring and the candidates ready to move in your niche, I find their mobile numbers and I prepare what to say. You make the calls.",
      "",
      "How it works:",
      "1. You tell me what you place - 5 minutes, here, in writing or by voice note.",
      "2. I suggest about twenty people to call, each with the reason to call them now. You keep or skip each with a tap.",
      "3. I find their numbers and send you each Call Sheet. You call, tell me about it by voice note, I write it all down and prepare what comes next.",
      "",
      "Every morning at 8:30, your calls of the day arrive here.",
      "Shall we start? What do you place, and where? (e.g. \"Forward Deployed Engineers in Paris, for Series A to C AI startups\")",
    ].join("\n"),
};

/** What the agent is told once, before the Recruiter's first answer, so the niche skill runs as a chat. */
const NICHE_CHAT_NOTICE =
  "This Recruiter just got the welcome message, which asked what they place and where. Their next message is the answer: run the niche skill as a chat from it. " +
  "Ask one question per message with your recommended answer, short enough for a phone; they write or say their answers. " +
  "For the calibration, show real people as short cards (name, title and company, the full LinkedIn URL on its own line), never a long list. " +
  "When the Niche is settled, write niches/<slug>.md exactly in the DESK.md format and say you wrote it; the bot then offers an approve button. " +
  "Do not start the Batch yourself: the bot starts it when the Recruiter approves.";

/**
 * The front door of the bot: who gets in, who is turned away, Vincent's admin lines and the pings he gets.
 * Messages from Recruiters go on to the engine. It knows nothing about the channel's wire format.
 */
export class Concierge {
  private readonly turnedAway = new Set<string>();

  constructor(private readonly options: ConciergeOptions) {}

  /** Sends each reply through `send`; stays silent for an unknown user, unless it is an invite or a stranger's first line. */
  async handle(
    userId: string,
    input: Input,
    sender: Sender,
    send: (reply: Reply) => Promise<void>,
    hooks: TurnHooks = {},
  ): Promise<void> {
    const { channel, registry } = this.options;
    const say = async (text: string | null) => {
      if (text !== null) await send({ text });
    };
    const text = input.kind === "text" ? input.text : "";
    if (input.kind === "text" && userId === this.options.adminId) {
      const command = parseAdminCommand(text);
      if (command !== null) return say(await this.admin(command));
    }
    const start = START.exec(text.trim());
    const known = registry.find(channel, userId);
    if (known === undefined) {
      if (input.kind === "tap") return;
      const invited = start?.[1] === undefined ? undefined : this.options.invites.redeem(start[1], userId);
      return say(invited === undefined ? await this.turnAway(userId, sender) : await this.welcome(userId, invited, sender));
    }
    if (start !== null) return;
    await this.options.engine.handle(channel, userId, input, send, hooks);
    await this.afterTurn(known.desk, known.name ?? userId).catch((error) => console.error("after-turn checks failed", error));
  }

  /** An Exa run that errored during a turn of this Desk. */
  async exaFailed(desk: string, tool: string, message: string): Promise<void> {
    const who = this.nameOf(desk);
    await this.options.notifyAdmin(`⚠️ Exa error for ${who} (${tool.replace("mcp__exa__", "")}): ${message}`);
  }

  private nameOf(desk: string): string {
    return this.options.registry.all().find((r) => r.desk === desk)?.name ?? desk;
  }

  private async turnAway(userId: string, sender: Sender): Promise<string> {
    if (!this.turnedAway.has(userId)) {
      this.turnedAway.add(userId);
      const handle = sender.username === undefined ? "no username" : `@${sender.username}`;
      await this.options
        .notifyAdmin(`🚪 A stranger started the bot: ${sender.name} (${handle}, id ${userId})`)
        .catch((error) => console.error("could not notify the admin", error));
    }
    return STRANGER_REPLY[languageOf(sender)] ?? STRANGER_REPLY.fr;
  }

  private async welcome(userId: string, name: string, sender: Sender): Promise<string> {
    const { channel, registry, desksDir } = this.options;
    mkdirSync(desksDir, { recursive: true });
    let n = registry.all().length + 1;
    while (existsSync(join(desksDir, String(n)))) n++;
    const desk = join(desksDir, String(n));
    mkdirSync(desk, { mode: 0o700 });
    const language = languageOf(sender);
    registry.add({ channel, userId, desk, name, timezone: DEFAULT_TIMEZONE, language });
    await this.options.notifyAdmin(`✅ ${name} opened their invite: Desk #${n} created.`).catch(() => {});
    this.options.engine.tell(desk, NICHE_CHAT_NOTICE);
    const firstName = sender.name.trim().split(/\s+/)[0] || name.split(/\s+/)[0];
    return (WELCOME[language] ?? WELCOME.fr)(firstName);
  }

  private async admin(command: AdminCommand): Promise<string> {
    if (command.kind === "invite") {
      const code = this.options.invites.create(command.name);
      return `Invitation for ${command.name}: https://t.me/${this.options.botUsername}?start=${code}`;
    }
    const matches = this.options.registry.byName(command.name);
    if (matches.length === 0) return `No Recruiter called ${command.name}.`;
    if (matches.length > 1) return `Several Recruiters match ${command.name}: ${matches.map((r) => r.name).join(", ")}. Use the full name.`;
    const { desk, name } = matches[0];
    if (command.kind === "end-partnership") return "";
    if (command.kind === "raise-batches") {
      this.options.allowances.setBatches(desk, command.batches);
      return `${name} now has ${command.batches} Batches a month.`;
    }
    this.options.allowances.addEuros(desk, command.euros);
    return `${name} now has €${this.options.allowances.limits(desk).euros} of phone numbers a month.`;
  }

  /** The pings Vincent gets after a turn: an Allowance at 75% or 100%, and Enrichment failing twice for a person. */
  private async afterTurn(desk: string, who: string): Promise<void> {
    const { notifyAdmin, allowances } = this.options;
    for (const percent of allowances.newlyCrossed(desk)) {
      const usage = allowances.usage(desk);
      const limits = allowances.limits(desk);
      await notifyAdmin(
        `📈 ${who} reached ${percent}% of the Allowance this month: ${usage.batches}/${limits.batches} Batches, €${usage.euros}/€${limits.euros} of numbers.`,
      );
    }
    for (const file of this.newEnrichmentFailures(desk)) {
      await notifyAdmin(`⚠️ Enrichment failed twice for ${file} on ${who}'s Desk.`);
    }
  }

  /** People whose file now shows a second failed Enrichment, on a different day from the first. Each is returned once. */
  private newEnrichmentFailures(desk: string): string[] {
    const store: Record<string, { dates: string[]; pinged?: boolean }> = existsSync(this.options.failuresFile)
      ? JSON.parse(readFileSync(this.options.failuresFile, "utf8"))
      : {};
    const twice: string[] = [];
    for (const folder of ["prospects", "candidates"]) {
      const dir = join(desk, folder);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        const found = NOT_FOUND.exec(readFileSync(join(dir, name), "utf8"));
        if (found === null) continue;
        const key = `${desk}:${relative(desk, join(dir, name))}`;
        const entry = Object.hasOwn(store, key) ? store[key] : { dates: [] };
        if (!entry.dates.includes(found[1])) entry.dates.push(found[1]);
        if (entry.dates.length >= 2 && !entry.pinged) {
          entry.pinged = true;
          twice.push(relative(desk, join(dir, name)));
        }
        store[key] = entry;
      }
    }
    writeJsonAtomic(this.options.failuresFile, store);
    return twice;
  }
}
