import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

export interface EngineOptions {
  registry: Registry;
  runner: AgentRunner;
  /** Where each Desk's session id is kept, so the conversation survives a restart. */
  sessionsFile: string;
  /** Commits what a turn changed in a Desk. */
  commit: (desk: string, message: string) => Promise<boolean>;
}

/**
 * The conversation engine: one message in, one agent turn in the sender's Desk, one answer out.
 * It knows nothing about the channel; an adapter maps its updates to `handle` calls (ADR 0026).
 */
export class Engine {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly options: EngineOptions) {}

  /** Returns the answer, or null when the sender has no Desk. One turn at a time per Desk. */
  async handle(channel: string, userId: string, text: string, hooks: TurnHooks = {}): Promise<string | null> {
    const desk = this.options.registry.deskFor(channel, userId);
    if (desk === undefined) return null;
    const previous = this.queues.get(desk) ?? Promise.resolve();
    const turn = previous.catch(() => {}).then(() => this.turn(desk, text, hooks));
    this.queues.set(desk, turn);
    return turn;
  }

  private async turn(desk: string, text: string, hooks: TurnHooks): Promise<string> {
    hooks.onTurnStart?.();
    try {
      const sessions = this.readSessions();
      const result = await this.options.runner.run({ desk, prompt: text, sessionId: sessions[desk] });
      this.writeSessions({ ...this.readSessions(), [desk]: result.sessionId });
      return result.text;
    } finally {
      hooks.onTurnEnd?.();
      await this.options.commit(desk, `Turn: ${text.replace(/\s+/g, " ").slice(0, 72)}`).catch((error) => {
        console.error(`commit failed for ${desk}`, error);
      });
    }
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
