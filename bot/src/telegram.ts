import { MENU, type Button, type Input, type Reply } from "./engine.ts";
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

export interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number }; from?: { id: number }; text?: string };
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}

export interface TelegramApi {
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

/** Handles one input from a user, sending each reply as soon as it is ready; sends nothing to an unknown user. */
export type OnInput = (
  userId: string,
  input: Input,
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

/** The Telegram channel adapter: turns updates into inputs for the engine and answers back. */
export class TelegramAdapter {
  private offset = 0;

  constructor(
    private readonly api: TelegramApi,
    private readonly onInput: OnInput,
  ) {}

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

  private async handle(update: TelegramUpdate): Promise<void> {
    const tap = update.callback_query;
    const message = update.message;
    let chatId: number;
    let userId: number;
    let input: Input;
    if (tap?.data !== undefined && tap.message !== undefined) {
      chatId = tap.message.chat.id;
      userId = tap.from.id;
      input = { kind: "tap", data: tap.data };
      // Stop the spinner on the button and take the buttons off, so a card is answered once.
      void this.api.call("answerCallbackQuery", { callback_query_id: tap.id }).catch(() => {});
      void this.api
        .call("editMessageReplyMarkup", { chat_id: chatId, message_id: tap.message.message_id, reply_markup: { inline_keyboard: [] } })
        .catch(() => {});
    } else if (message?.text !== undefined && message.from !== undefined) {
      chatId = message.chat.id;
      userId = message.from.id;
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
      await this.onInput(String(userId), input, typing, (reply) => this.send(chatId, reply));
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
