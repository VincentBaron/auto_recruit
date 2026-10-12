import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseAdminCommand, type AdminCommand } from "./admin.ts";
import type { Allowances } from "./allowance.ts";
import { afterAcceptance, DPA_TAP, dpaAsk, isDpaAcceptance } from "./dpa.ts";
import type { Engine, Input, Reply, TurnHooks } from "./engine.ts";
import { eraseFromDesk, parseErasure } from "./erasure.ts";
import type { Invites } from "./invites.ts";
import { writeJsonAtomic } from "./json-file.ts";
import { dateIn, deletionDate, type PartnershipRecord, type Partnerships } from "./partnership.ts";
import { DEFAULT_TIMEZONE, type Recruiter, type Registry } from "./registry.ts";
import { zipDesk } from "./zip.ts";

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

/** The first message of a new Desk, which promises nothing about timing; the DPA ask follows it, and the first question of the niche discussion follows the acceptance. */
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
    ].join("\n"),
};

const ENDED_REPLY: Record<string, (date: string) => string> = {
  fr: (date) => `Votre partenariat avec Auto Recruit est terminé. Votre Desk sera supprimé le ${date}; vous l'avez reçu en zip.`,
  en: (date) => `Your partnership with Auto Recruit has ended. Your Desk will be deleted on ${date}; you got it as a zip.`,
};
const ERASED: Record<string, (name: string) => string> = {
  fr: (name) => `Effacé: ${name} n'est plus dans votre Desk; seul son nom reste dans la liste Ne pas appeler.`,
  en: (name) => `Erased ${name} from your Desk; only their name stays, on the Do-Not-Call List.`,
};
const NOT_FOUND_REPLY: Record<string, (name: string) => string> = {
  fr: (name) => `Je ne trouve personne du nom de ${name} sur votre Desk.`,
  en: (name) => `I cannot find anyone called ${name} on your Desk.`,
};
const ZIP_CAPTION: Record<string, (date: string) => string> = {
  fr: (date) => `Votre Desk en fichiers markdown, comme convenu. Il sera supprimé de notre serveur et de sa sauvegarde le ${date}; je vous écris deux fois d'ici là.`,
  en: (date) => `Your Desk as markdown files, as agreed. It will be deleted from our server and its backup on ${date}; I will write to you twice before then.`,
};
const pick = <T>(table: Record<string, T>, language: string | undefined): T => table[language ?? "fr"] ?? table.fr;

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
      if (invited === undefined) return say(await this.turnAway(userId, sender));
      return send(await this.welcome(userId, invited, sender));
    }
    if (start !== null) return;
    const ended = this.options.partnerships.get(known.desk);
    if (ended !== undefined) return say(pick(ENDED_REPLY, known.language)(deletionDate(ended.endedAt, known.timezone)));
    if (known.dpaAcceptedAt === undefined) return this.dpaGate(known, input, send);
    if (input.kind === "tap" && input.data === DPA_TAP) return;
    const erasure = input.kind === "text" ? parseErasure(input.text) : null;
    if (erasure !== null) return say(await this.erase(known, erasure));
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

  private get now(): Date {
    return this.options.now?.() ?? new Date();
  }

  /** Until the DPA is accepted nothing reaches the agents: the Recruiter is shown the DPA again, or the acceptance is recorded. */
  private async dpaGate(known: Recruiter, input: Input, send: (reply: Reply) => Promise<void>): Promise<void> {
    const accepted = (input.kind === "tap" && input.data === DPA_TAP) || (input.kind === "text" && isDpaAcceptance(input.text));
    if (!accepted) return send(dpaAsk(known.language, this.options.dpaUrl));
    this.options.registry.acceptDpa(known.channel, known.userId, this.now.toISOString());
    await this.options.notifyAdmin(`📝 ${known.name ?? known.userId} accepted the DPA.`).catch(() => {});
    const niches = join(known.desk, "niches");
    await send({ text: afterAcceptance(known.language, existsSync(niches) && readdirSync(niches).length > 0) });
  }

  /** "Efface Sophie Leroy": done on the Desk at once, between two agent turns, and confirmed in one line. */
  private async erase(known: Recruiter, name: string): Promise<string> {
    const { engine, afterErase, notifyAdmin } = this.options;
    const today = dateIn(this.now, known.timezone);
    const found = await engine.exclusive(known.desk, async () => {
      if (!eraseFromDesk(known.desk, name, today)) return false;
      engine.forgetSession(known.desk);
      await afterErase?.(known.desk).catch(async (error) => {
        console.error(`history rewrite after an erasure failed for ${known.desk}`, error);
        await notifyAdmin(`⚠️ ${known.name ?? known.userId}: an erasure left the Desk's older history untouched (${String(error)}).`).catch(() => {});
      });
      return true;
    });
    return pick(found ? ERASED : NOT_FOUND_REPLY, known.language)(name);
  }

  private async welcome(userId: string, name: string, sender: Sender): Promise<Reply> {
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
    const ask = dpaAsk(language, this.options.dpaUrl);
    return { text: `${(WELCOME[language] ?? WELCOME.fr)(firstName)}\n\n${ask.text}`, buttons: ask.buttons };
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
    if (command.kind === "end-partnership") return this.endPartnership(matches[0]);
    if (command.kind === "raise-batches") {
      this.options.allowances.setBatches(desk, command.batches);
      return `${name} now has ${command.batches} Batches a month.`;
    }
    this.options.allowances.addEuros(desk, command.euros);
    return `${name} now has €${this.options.allowances.limits(desk).euros} of phone numbers a month.`;
  }

  /** Sends the Recruiter their Desk as a zip, then starts the countdown to its deletion; nothing starts when the zip cannot be sent. */
  private async endPartnership(recruiter: Recruiter): Promise<string> {
    const { engine, partnerships, sendDocument } = this.options;
    const name = recruiter.name ?? recruiter.userId;
    const previous = partnerships.get(recruiter.desk);
    if (previous !== undefined) {
      return `${name}'s partnership already ended on ${previous.endedAt.slice(0, 10)}; the Desk is deleted on ${deletionDate(previous.endedAt, recruiter.timezone)}.`;
    }
    const endedAt = this.now.toISOString();
    const date = deletionDate(endedAt, recruiter.timezone);
    try {
      await engine.exclusive(recruiter.desk, () =>
        sendDocument(recruiter.userId, `desk-${name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.zip`, zipDesk(recruiter.desk), pick(ZIP_CAPTION, recruiter.language)(date)),
      );
    } catch (error) {
      return `Could not send ${name} their Desk (${String(error)}): the partnership is not ended.`;
    }
    const record: Omit<PartnershipRecord, "remindersSent"> = { desk: recruiter.desk, userId: recruiter.userId, name, language: recruiter.language, endedAt };
    partnerships.end(record);
    return `${name}'s partnership is ended: their Desk went to them as a zip and will be deleted from the server and its backup on ${date}, after two reminders.`;
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
