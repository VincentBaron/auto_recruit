import type { Screen } from "./review.ts";
import type { Sender } from "./concierge.ts";
import { splitMessage } from "./split.ts";

const TELEGRAM_LIMIT = 4096;
const TYPING_REFRESH_MS = 4000;
const ERROR_REPLY = "Désolé, une erreur est survenue de mon côté. Réessayez dans un instant.";

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number }; from?: TelegramUser; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { message_id: number; chat: { id: number } } };
}

/** What the adapter asks the review of a Batch; null when the user has no Desk or nothing is awaited. */
export interface ReviewPort {
  press(userId: string, data: string): Screen | null;
  reason(userId: string, text: string): Screen | null;
}

const keyboard = (screen: Screen) => ({
  inline_keyboard: screen.buttons.map((row) => row.map((b) => ({ text: b.label, callback_data: b.data }))),
});

export interface TelegramApi {
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

/** Answers one message from a user: the text to send back, or null to stay silent (unknown user). */
export type OnMessage = (
  userId: string,
  text: string,
  typing: { start(): void; stop(): void },
  sender: Sender,
) => Promise<string | null>;

/** The Bot API over HTTPS: long polling needs no webhook and no domain (ADR 0028). */
export function botApi(token: string): TelegramApi {
  return {
    async call(method, params = {}) {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
      });
      const body = (await response.json()) as { ok: boolean; result: unknown; description?: string };
      if (!body.ok) throw new Error(`Telegram ${method} failed: ${body.description}`);
      return body.result;
    },
  };
}

function senderOf(user: TelegramUser): Sender {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return { name: name || user.username || String(user.id), username: user.username, language: user.language_code };
}

/** The Telegram channel adapter: turns updates into messages for the engine and answers back. */
export class TelegramAdapter {
  private offset = 0;
  /** The card each user is looking at, so a reason typed later edits it in place. */
  private readonly cards = new Map<string, { chatId: number; messageId: number }>();

  constructor(
    private readonly api: TelegramApi,
    private readonly onMessage: OnMessage,
    private readonly review?: ReviewPort,
  ) {}

  /** Speaks first to a user (in a private chat the chat id is the user id). */
  async push(userId: string, screen: Screen): Promise<void> {
    const parts = splitMessage(screen.text, TELEGRAM_LIMIT);
    for (const [i, text] of parts.entries()) {
      const last = i === parts.length - 1 && screen.buttons.length > 0;
      await this.api.call("sendMessage", {
        chat_id: Number(userId),
        text,
        ...(last ? { reply_markup: keyboard(screen) } : {}),
      });
    }
  }

  /** One long-polling round: fetches updates and handles them. Turns of different Desks run in parallel. */
  async poll(timeoutSeconds = 0): Promise<void> {
    const updates = (await this.api.call("getUpdates", {
      offset: this.offset,
      timeout: timeoutSeconds,
      allowed_updates: ["message", "callback_query"],
    })) as TelegramUpdate[];
    for (const update of updates) this.offset = Math.max(this.offset, update.update_id + 1);
    await Promise.all(updates.map((update) => this.handle(update)));
  }

  /** Polls until `signal` aborts, backing off after a network error. */
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.poll(50);
      } catch (error) {
        console.error("poll failed", error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async handleTap(query: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
    await this.api.call("answerCallbackQuery", { callback_query_id: query.id }).catch(() => {});
    const where = query.message;
    if (this.review === undefined || query.data === undefined || where === undefined) return;
    const userId = String(query.from.id);
    const screen = this.review.press(userId, query.data);
    if (screen === null) return;
    const card = { chatId: where.chat.id, messageId: where.message_id };
    this.cards.set(userId, card);
    await this.edit(card, screen);
  }

  private async edit(card: { chatId: number; messageId: number }, screen: Screen): Promise<void> {
    await this.api.call("editMessageText", {
      chat_id: card.chatId,
      message_id: card.messageId,
      text: screen.text,
      reply_markup: keyboard(screen),
    });
  }

  private async handle(update: TelegramUpdate): Promise<void> {
    if (update.callback_query !== undefined) {
      await this.handleTap(update.callback_query).catch((error) => console.error("tap failed", error));
      return;
    }
    const message = update.message;
    if (message?.text === undefined || message.from === undefined) return;
    const chatId = message.chat.id;
    const reasonScreen = this.review?.reason(String(message.from.id), message.text) ?? null;
    if (reasonScreen !== null) {
      const card = this.cards.get(String(message.from.id));
      await (card === undefined ? this.push(String(chatId), reasonScreen) : this.edit(card, reasonScreen)).catch((error) =>
        console.error("reason failed", error),
      );
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    const typing = {
      start: () => {
        const send = () => void this.api.call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
        send();
        timer = setInterval(send, TYPING_REFRESH_MS);
      },
      stop: () => clearInterval(timer),
    };
    try {
      const answer = await this.onMessage(String(message.from.id), message.text, typing, senderOf(message.from));
      if (answer === null) return;
      await this.send(chatId, answer);
    } catch (error) {
      console.error("turn failed", error);
      await this.send(chatId, ERROR_REPLY).catch(() => {});
    } finally {
      typing.stop();
    }
  }

  private async send(chatId: number, text: string): Promise<void> {
    for (const part of splitMessage(text, TELEGRAM_LIMIT)) {
      await this.api.call("sendMessage", { chat_id: chatId, text: part });
    }
  }
}
