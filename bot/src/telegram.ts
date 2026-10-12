import { MENU, type Button, type Input, type Reply } from "./engine.ts";
import type { Sender } from "./concierge.ts";
import type { Screen } from "./review.ts";
import { splitMessage } from "./split.ts";

const TELEGRAM_LIMIT = 4096;
const TYPING_REFRESH_MS = 4000;
const ERROR_REPLY = "Désolé, une erreur est survenue de mon côté. Réessayez dans un instant.";

/** The fixed menu under the keyboard (stories 22 to 24 of the PRD). */
const MENU_KEYBOARD = {
  keyboard: [[{ text: MENU.next }], [{ text: MENU.list }, { text: MENU.batch }]],
  resize_keyboard: true,
  is_persistent: true,
};

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number }; from?: TelegramUser; text?: string; voice?: { file_id: string; duration?: number } };
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
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
  /** The bytes of a file Telegram holds, by its file id. */
  download?(fileId: string): Promise<Buffer>;
}

/** Handles one input from a user, sending each reply as soon as it is ready; sends nothing to an unknown user. */
export type OnInput = (
  userId: string,
  input: Input,
  sender: Sender,
  typing: { start(): void; stop(): void },
  send: (reply: Reply) => Promise<void>,
) => Promise<unknown>;

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

/** The Telegram channel adapter: turns updates into inputs for the engine and answers back. */
export class TelegramAdapter {
  private offset = 0;
  /** The card each user is looking at, so a reason typed later edits it in place. */
  private readonly cards = new Map<string, { chatId: number; messageId: number }>();

  constructor(
    private readonly api: TelegramApi,
    private readonly onInput: OnInput,
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

  private async edit(card: { chatId: number; messageId: number }, screen: Screen): Promise<void> {
    await this.api.call("editMessageText", {
      chat_id: card.chatId,
      message_id: card.messageId,
      text: screen.text,
      reply_markup: keyboard(screen),
    });
  }

  private async handle(update: TelegramUpdate): Promise<void> {
    const tap = update.callback_query;
    const message = update.message;
    let chatId: number;
    let from: TelegramUser;
    let input: Input;
    if (tap?.data !== undefined && tap.message !== undefined) {
      chatId = tap.message.chat.id;
      from = tap.from;
      input = { kind: "tap", data: tap.data };
      // Stop the spinner on the button.
      void this.api.call("answerCallbackQuery", { callback_query_id: tap.id }).catch(() => {});
      // A tap on a Batch card edits that card in place.
      const screen = this.review?.press(String(from.id), tap.data) ?? null;
      if (screen !== null) {
        const card = { chatId, messageId: tap.message.message_id };
        this.cards.set(String(from.id), card);
        await this.edit(card, screen).catch((error) => console.error("tap failed", error));
        return;
      }
      // Any other card is answered once: take its buttons off.
      void this.api
        .call("editMessageReplyMarkup", { chat_id: chatId, message_id: tap.message.message_id, reply_markup: { inline_keyboard: [] } })
        .catch(() => {});
    } else if (message?.text !== undefined && message.from !== undefined) {
      chatId = message.chat.id;
      from = message.from;
      const reasonScreen = this.review?.reason(String(from.id), message.text) ?? null;
      if (reasonScreen !== null) {
        const card = this.cards.get(String(from.id));
        await (card === undefined ? this.push(String(chatId), reasonScreen) : this.edit(card, reasonScreen)).catch((error) =>
          console.error("reason failed", error),
        );
        return;
      }
      input = { kind: "text", text: message.text };
    } else {
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
      await this.onInput(String(from.id), input, senderOf(from), typing, (reply) => this.send(chatId, reply));
    } catch (error) {
      console.error("turn failed", error);
      await this.send(chatId, { text: ERROR_REPLY }).catch(() => {});
    } finally {
      typing.stop();
    }
  }

  private async send(chatId: number, reply: Reply): Promise<void> {
    const parts = splitMessage(reply.text, TELEGRAM_LIMIT);
    for (const [i, part] of parts.entries()) {
      const markup = i < parts.length - 1 ? undefined : reply.buttons ? { inline_keyboard: inline(reply.buttons) } : MENU_KEYBOARD;
      await this.api.call("sendMessage", { chat_id: chatId, text: part, ...(markup && { reply_markup: markup }) });
    }
  }
}

function inline(rows: Button[][]) {
  return rows.map((row) =>
    row.map((button) =>
      "copy" in button
        ? { text: button.label, copy_text: { text: button.copy } }
        : { text: button.label, callback_data: button.data },
    ),
  );
}
