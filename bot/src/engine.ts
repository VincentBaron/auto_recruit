import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contextTerms } from "./transcribe.ts";
import { checkNiche } from "./niche-file.ts";
import type { Registry } from "./registry.ts";

export interface TurnRequest {
  desk: string;
  prompt: string;
  /** The session to resume, when the Recruiter has talked to the agents before. */
  sessionId?: string;
}

export interface TurnResult {
  text: string;
  sessionId: string;
}

export interface AgentRunner {
  run(request: TurnRequest): Promise<TurnResult>;
}

export interface TurnHooks {
  onTurnStart?: () => void;
  onTurnEnd?: () => void;
}

/** A button under a message: a tap the engine gets back as `data`, or a number to copy to the clipboard. */
export type Button = { label: string; data: string } | { label: string; copy: string };

/** What the engine says back: some text and, optionally, rows of buttons. */
export interface Reply {
  text: string;
  buttons?: Button[][];
}

/** What a Recruiter did: typed (or said) something, or tapped a button of an earlier reply. */
export type Input =
  | { kind: "text"; text: string }
  | { kind: "tap"; data: string }
  /** A voice note, downloaded only once the sender is known to have a Desk. */
  | { kind: "voice"; audio: () => Promise<Buffer> };

/** The Desk's git history, as far as the engine needs it to offer Undo. */
export interface DeskVersions {
  /** The last commit of the Desk, or null when it has none. */
  head(desk: string): Promise<string | null>;
  /** Whether the last commit added an Attempt to a person's file. */
  addsAttempt(desk: string): Promise<boolean>;
  /** Restores the Desk as it was before commit `sha`; false when `sha` is no longer the last commit. */
  undo(desk: string, sha: string): Promise<boolean>;
}

export interface EngineOptions {
  registry: Registry;
  runner: AgentRunner;
  /** Where each Desk's session id is kept, so the conversation survives a restart. */
  sessionsFile: string;
  /** Commits what a turn changed in a Desk. */
  commit: (desk: string, message: string) => Promise<boolean>;
  versions: DeskVersions;
  /** Turns a voice note into text; without it voice notes are refused. */
  voice?: { transcribe(download: () => Promise<Buffer>, contextBias: string[]): Promise<string> };
}

/** The fixed menu under the keyboard. */
export const MENU = {
  next: "📞 Prochain appel",
  list: "📋 Liste d'appels",
  batch: "➕ Nouveau Batch",
};

const NEXT_CALL_PROMPT =
  "Show the next due Call Sheet as a card, as the call skill says. Record nothing unless a check of the skill fails.";
const MORE_PROMPT =
  "More: show the card of the person just shown again, expanded with their Signals, their previous Attempts and the Pitch's objections.";
const RECAPS: Record<string, string> = {
  "recap:No Answer": "Recap of the call just shown: No Answer.",
  "recap:Voicemail": "Recap of the call just shown: Voicemail.",
  "recap:skip":
    "Skip for now, for the person just shown: record no Attempt, push them to the next slot on the Call List, and answer with one line.",
};
const MENU_PROMPTS: Record<string, string> = {
  [MENU.next]: NEXT_CALL_PROMPT,
  [MENU.list]: "Show the Call List, as the call skill says.",
  [MENU.batch]: "Start a new Batch for my Niche, as the batch skill says.",
};

const HELP = [
  "Voici ce que je sais faire:",
  `${MENU.next}: la fiche du prochain appel, avec son numéro à toucher.`,
  `${MENU.list}: qui appeler et quand.`,
  `${MENU.batch}: une nouvelle sélection de personnes à appeler.`,
  "Après un appel, touchez No Answer, Voicemail ou Skip for now, ou racontez-moi en quelques mots. Undo annule la dernière note.",
  "Envoyez un numéro trouvé ailleurs pour le noter. « stop » arrête l'enchaînement des fiches.",
  "Tout le reste, écrivez-le simplement: une nouvelle niche, qui est Léa, etc.",
].join("\n");

const VOICE_FAILED = "Je n'ai pas pu comprendre ce vocal. Renvoyez-le, ou écrivez-le en quelques mots.";

const APPROVE_COPY: Record<string, { button: string; started: string }> = {
  fr: { button: "✅ Valider cette niche", started: "C'est validé. Je lance votre première sélection et je vous écris dès qu'elle est prête." },
  en: { button: "✅ Approve this Niche", started: "Approved. I am starting your first Batch and I will write to you as soon as it is ready." },
};
const NICHE_TAP = /^niche:([a-z0-9][a-z0-9-]*)$/;

const HELP_REQUEST = /^\/?(aide|\?|help)$/i;
const STOP_REQUEST = /^(stop|arrête|arrete|assez)$/i;
const PHONE_NUMBER = /^\+\d{8,15}$/m; // the number sits alone on its line on a card
const CARD_MARK = "📞";

/**
 * The conversation engine: one message in, one agent turn in the sender's Desk, replies out.
 * It knows nothing about the channel; an adapter maps its updates to `handle` calls (ADR 0026).
 */
export class Engine {
  private readonly queues = new Map<string, Promise<unknown>>();
  /** Inputs of a Desk accepted and not yet started, so a card is not chained over a waiting message. */
  private readonly waiting = new Map<string, number>();
  /** Desks where the Recruiter said stop: no card arrives by itself until they ask for the next call. */
  private readonly stopped = new Set<string>();
  /** What the agent must be told before its next turn, such as an Undo it did not see. */
  private readonly notices = new Map<string, string>();
  /** The last Call Sheet card shown in each Desk: a voice note that follows is most likely about that person. */
  private readonly cards = new Map<string, string>();

  constructor(private readonly options: EngineOptions) {}

  /** Tells the agent something before its next turn in this Desk, such as the welcome message the Recruiter just got. */
  tell(desk: string, notice: string): void {
    this.notices.set(desk, notice);
  }

  /**
   * Handles one input and sends each reply as soon as it is ready.
   * Returns false, sending nothing, when the sender has no Desk. One input at a time per Desk.
   */
  async handle(
    channel: string,
    userId: string,
    input: Input,
    send: (reply: Reply) => Promise<void>,
    hooks: TurnHooks = {},
  ): Promise<boolean> {
    const desk = this.options.registry.deskFor(channel, userId);
    if (desk === undefined) return false;
    this.waiting.set(desk, (this.waiting.get(desk) ?? 0) + 1);
    const previous = this.queues.get(desk) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(() => {
      this.waiting.set(desk, (this.waiting.get(desk) ?? 1) - 1);
      return this.dispatch(desk, input, send, hooks);
    });
    this.queues.set(desk, run);
    await run;
    return true;
  }

  private async dispatch(desk: string, input: Input, send: (reply: Reply) => Promise<void>, hooks: TurnHooks): Promise<void> {
    if (input.kind === "voice") {
      const text = await this.transcribe(desk, input.audio, hooks);
      return text === null ? send({ text: VOICE_FAILED }) : this.dispatch(desk, { kind: "text", text }, send, hooks);
    }
    if (input.kind === "tap" && input.data.startsWith("undo:")) return this.undo(desk, input.data.slice(5), send, hooks);

    if (input.kind === "tap" && input.data.startsWith("niche:")) return this.approveNiche(desk, input.data, send, hooks);

    const text = input.kind === "text" ? input.text.trim() : "";
    if (HELP_REQUEST.test(text)) return send({ text: HELP });
    if (STOP_REQUEST.test(text)) {
      this.stopped.add(desk);
      return send({ text: `D'accord, j'arrête les fiches. ${MENU.next} pour reprendre.` });
    }

    const menuPrompt = MENU_PROMPTS[text];
    if (menuPrompt === MENU_PROMPTS[MENU.next]) this.stopped.delete(desk);
    const isMore = input.kind === "tap" && input.data === "more";
    const prompt = input.kind === "tap" ? (isMore ? MORE_PROMPT : RECAPS[input.data]) : (menuPrompt ?? text);
    if (prompt === undefined) return;

    const label = input.kind === "tap" ? input.data : text;
    const niches = menuPrompt === undefined && input.kind === "text" ? readNiches(desk) : undefined;
    const answer = await this.turn(desk, prompt, label, hooks);
    const isRecap =
      menuPrompt === undefined &&
      !isMore &&
      answer.sha !== null &&
      (input.kind === "tap" || (await this.options.versions.addsAttempt(desk)));

    if (!isRecap) {
      return niches === undefined
        ? send(this.remember(desk, toReply(answer.text, isMore)))
        : this.afterNicheTurn(desk, niches, answer.text, send, hooks);
    }
    await send({ text: answer.text, buttons: [[{ label: "Undo", data: `undo:${answer.sha}` }]] });
    if (!this.stopped.has(desk) && (this.waiting.get(desk) ?? 0) === 0) await this.sendNextCard(desk, send, hooks);
  }

  /** After a turn that wrote a Niche: it must match `DESK.md` (the agent gets one chance to fix it), then the Recruiter can approve it. */
  private async afterNicheTurn(
    desk: string,
    before: Map<string, string>,
    text: string,
    send: (reply: Reply) => Promise<void>,
    hooks: TurnHooks,
  ): Promise<void> {
    const changed = () => [...readNiches(desk)].filter(([slug, content]) => before.get(slug) !== content);
    let reply = text;
    const wrong = changed().flatMap(([slug, content]) => checkNiche(content).map((problem) => `niches/${slug}.md: ${problem}`));
    if (wrong.length > 0) {
      const fix = `The Niche file you just wrote does not match the format of DESK.md:\n- ${wrong.join("\n- ")}\nFix the file, then give the Recruiter your next message as before.`;
      reply = (await this.turn(desk, fix, "fix niche", hooks)).text;
    }
    const ready = changed().filter(([, content]) => checkNiche(content).length === 0);
    if (ready.length === 0) return send(toReply(reply, false));
    const slug = ready[ready.length - 1][0];
    return send({ text: reply, buttons: [[{ label: this.copy(desk).button, data: `niche:${slug}` }]] });
  }

  /** The Recruiter approved a Niche Profile: the first Batch starts and they are told they will hear when it is ready. */
  private async approveNiche(desk: string, data: string, send: (reply: Reply) => Promise<void>, hooks: TurnHooks): Promise<void> {
    const slug = NICHE_TAP.exec(data)?.[1];
    if (slug === undefined || !existsSync(join(desk, "niches", `${slug}.md`))) return;
    const answer = await this.turn(
      desk,
      `The Recruiter approved the Niche Profile of ${slug}. Start its first Batch now: run the search of the batch skill (step 1) for ${slug}, then stop once the search is running; the bot tells the Recruiter when it is ready.`,
      `approve niche ${slug}`,
      hooks,
    );
    await send({ text: existsSync(join(desk, "batches", `${slug}.md`)) ? this.copy(desk).started : answer.text });
  }

  private copy(desk: string) {
    const language = this.options.registry.all().find((r) => r.desk === desk)?.language;
    return APPROVE_COPY[language ?? "fr"] ?? APPROVE_COPY.fr;
  }

  private async undo(desk: string, sha: string, send: (reply: Reply) => Promise<void>, hooks: TurnHooks): Promise<void> {
    if (!(await this.options.versions.undo(desk, sha))) {
      return send({ text: "Trop tard pour annuler: le Desk a changé depuis cette note." });
    }
    this.notices.set(desk, "The Recruiter tapped Undo: the Desk is back exactly as before your last Recap. Forget that Recap.");
    await send({ text: "↩️ Annulé." });
    await this.sendNextCard(desk, send, hooks);
  }

  private async sendNextCard(desk: string, send: (reply: Reply) => Promise<void>, hooks: TurnHooks): Promise<void> {
    const answer = await this.turn(desk, NEXT_CALL_PROMPT, "next call", hooks);
    await send(this.remember(desk, toReply(answer.text, false)));
  }

  private remember(desk: string, reply: Reply): Reply {
    if (reply.text.startsWith(CARD_MARK)) this.cards.set(desk, reply.text);
    return reply;
  }

  /** The words of a voice note, or null when there is no transcriber, it failed or heard nothing. */
  private async transcribe(desk: string, audio: () => Promise<Buffer>, hooks: TurnHooks): Promise<string | null> {
    const voice = this.options.voice;
    if (voice === undefined) return null;
    hooks.onTurnStart?.();
    try {
      const text = await voice.transcribe(audio, contextTerms(this.cards.get(desk), this.nicheTexts(desk)));
      return text.trim() === "" ? null : text.trim();
    } catch (error) {
      console.error(`transcription failed for ${desk}`, error instanceof Error ? error.message : error);
      return null;
    } finally {
      hooks.onTurnEnd?.();
    }
  }

  private nicheTexts(desk: string): string[] {
    const dir = join(desk, "niches");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort()
      .map((name) => readFileSync(join(dir, name), "utf8"));
  }

  /** Runs one agent turn and commits it; `sha` is the commit it made, or null when it changed nothing. */
  private async turn(desk: string, prompt: string, label: string, hooks: TurnHooks): Promise<{ text: string; sha: string | null }> {
    hooks.onTurnStart?.();
    const notice = this.notices.get(desk);
    let result: TurnResult;
    let committed = false;
    try {
      const sessions = this.readSessions();
      result = await this.options.runner.run({
        desk,
        prompt: notice === undefined ? prompt : `[${notice}]\n\n${prompt}`,
        sessionId: sessions[desk],
      });
      this.notices.delete(desk);
      this.writeSessions({ ...this.readSessions(), [desk]: result.sessionId });
    } finally {
      hooks.onTurnEnd?.();
      committed = await this.options.commit(desk, `Turn: ${label.replace(/\s+/g, " ").slice(0, 72)}`).catch((error) => {
        console.error(`commit failed for ${desk}`, error);
        return false;
      });
    }
    return { text: result.text, sha: committed ? await this.options.versions.head(desk) : null };
  }

  private readSessions(): Record<string, string> {
    return existsSync(this.options.sessionsFile) ? JSON.parse(readFileSync(this.options.sessionsFile, "utf8")) : {};
  }

  private writeSessions(sessions: Record<string, string>): void {
    const tmp = `${this.options.sessionsFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(sessions, null, 2));
    renameSync(tmp, this.options.sessionsFile);
  }
}

/** A card (marked 📞) gets the call buttons, and a copy-number button when the Desk has a number to give. */
function toReply(text: string, expanded: boolean): Reply {
  if (!text.startsWith(CARD_MARK)) return { text };
  const rows: Button[][] = [
    [
      { label: "No Answer", data: "recap:No Answer" },
      { label: "Voicemail", data: "recap:Voicemail" },
    ],
    [{ label: "Skip for now", data: "recap:skip" }, ...(expanded ? [] : [{ label: "More", data: "more" }])],
  ];
  const number = PHONE_NUMBER.exec(text)?.[0];
  if (number !== undefined) rows.push([{ label: "Copy number", copy: number }]);
  return { text, buttons: rows };
}

/** The Niche files of a Desk, by slug. */
function readNiches(desk: string): Map<string, string> {
  const dir = join(desk, "niches");
  const niches = new Map<string, string>();
  if (!existsSync(dir)) return niches;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) niches.set(file.slice(0, -3), readFileSync(join(dir, file), "utf8"));
  return niches;
}
