import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseAdminCommand, type AdminCommand } from "./admin.ts";
import type { Allowances } from "./allowance.ts";
import type { Engine, TurnHooks } from "./engine.ts";
import type { Invites } from "./invites.ts";
import { writeJsonAtomic } from "./json-file.ts";
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
}

const START = /^\/start(?:@\w+)?(?: (\S+))?$/;
const NOT_FOUND = /^- Phone: not found \(Exa, (\d{4}-\d{2}-\d{2})\)/m;

const languageOf = (sender: Sender) => (sender.language ?? "fr").split("-")[0].toLowerCase();

const STRANGER_REPLY: Record<string, string> = {
  fr: "Bonjour 👋 Auto Recruit n'est ouvert que sur invitation pour l'instant. On vous recontacte très vite!",
  en: "Hello 👋 Auto Recruit is invitation-only for now. We will get back to you very soon!",
};

const WELCOME: Record<string, (name: string) => string> = {
  fr: (name) => `Bonjour ${name} 👋 Votre espace Auto Recruit est prêt.`,
  en: (name) => `Hello ${name} 👋 Your Auto Recruit Desk is ready.`,
};

/**
 * The front door of the bot: who gets in, who is turned away, Vincent's admin lines and the pings he gets.
 * Messages from Recruiters go on to the engine. It knows nothing about the channel's wire format.
 */
export class Concierge {
  private readonly turnedAway = new Set<string>();

  constructor(private readonly options: ConciergeOptions) {}

  /** Returns the answer, or null to stay silent. */
  async handle(userId: string, text: string, sender: Sender, hooks: TurnHooks = {}): Promise<string | null> {
    const { channel, registry } = this.options;
    const isAdmin = userId === this.options.adminId;
    if (isAdmin) {
      const command = parseAdminCommand(text);
      if (command !== null) return this.admin(command);
    }
    const start = START.exec(text.trim());
    const known = registry.find(channel, userId);
    if (known === undefined) {
      const invited = start?.[1] === undefined ? undefined : this.options.invites.redeem(start[1], userId);
      return invited === undefined ? this.turnAway(userId, sender) : this.welcome(userId, invited, sender);
    }
    if (start !== null) return null;
    const answer = await this.options.engine.handle(channel, userId, text, hooks);
    await this.afterTurn(known.desk, known.name ?? userId).catch((error) => console.error("after-turn checks failed", error));
    return answer;
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
    return (WELCOME[language] ?? WELCOME.fr)(name.split(/\s+/)[0]);
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
