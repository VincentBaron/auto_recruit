import { describe, expect, it } from "vitest";
import type { Input, Reply } from "../src/engine.ts";
import { TelegramAdapter, type TelegramApi, type TelegramUpdate } from "../src/telegram.ts";

function fakeApi(batches: TelegramUpdate[][]) {
  const calls: Array<[string, unknown]> = [];
  const remaining = [...batches];
  const api: TelegramApi = {
    async call(method, params) {
      calls.push([method, params]);
      if (method === "getUpdates") return remaining.shift() ?? [];
      return true;
    },
  };
  return { api, calls };
}

const message = (update_id: number, userId: number, text?: string): TelegramUpdate => ({
  update_id,
  message: { chat: { id: userId }, from: { id: userId }, text },
});

const tapUpdate = (update_id: number, userId: number, data: string): TelegramUpdate => ({
  update_id,
  callback_query: { id: `cb${update_id}`, from: { id: userId }, data, message: { message_id: 55, chat: { id: userId } } },
});

/** An engine stand-in that says one fixed thing back. */
const saying =
  (...replies: Reply[]) =>
  async (_user: string, _input: Input, _typing: unknown, send: (r: Reply) => Promise<void>) => {
    for (const reply of replies) await send(reply);
  };

const sent = (calls: Array<[string, unknown]>) =>
  calls.filter(([m]) => m === "sendMessage").map(([, p]) => p as { chat_id: number; text: string; reply_markup?: any });

describe("TelegramAdapter", () => {
  it("answers a message in its chat and acknowledges the update", async () => {
    const { api, calls } = fakeApi([[message(7, 42, "hello")]]);
    const adapter = new TelegramAdapter(api, async (userId, input, _typing, send) => {
      await send({ text: `echo ${userId} ${input.kind === "text" ? input.text : ""}` });
    });
    await adapter.poll();
    expect(sent(calls)).toMatchObject([{ chat_id: 42, text: "echo 42 hello" }]);
    await adapter.poll();
    expect(calls.find(([m, p]) => m === "getUpdates" && (p as { offset?: number }).offset === 8)).toBeDefined();
  });

  it("splits a long answer under Telegram's limit, buttons on the last part only", async () => {
    const { api, calls } = fakeApi([[message(1, 42, "long")]]);
    const buttons = [[{ label: "Undo", data: "undo:abc" }]];
    await new TelegramAdapter(api, saying({ text: "x".repeat(5000), buttons })).poll();
    const parts = sent(calls);
    expect(parts.map((p) => p.text.length)).toEqual([4096, 904]);
    expect(parts[0].reply_markup?.inline_keyboard).toBeUndefined();
    expect(parts[1].reply_markup.inline_keyboard).toHaveLength(1);
  });

  it("sends nothing to unknown users", async () => {
    const { api, calls } = fakeApi([[message(1, 99, "hi")]]);
    await new TelegramAdapter(api, saying()).poll();
    expect(sent(calls)).toEqual([]);
  });

  it("shows typing while the turn runs", async () => {
    const { api, calls } = fakeApi([[message(1, 42, "hi")]]);
    await new TelegramAdapter(api, async (_user, _input, typing, send) => {
      typing.start();
      await send({ text: "ok" });
    }).poll();
    expect(calls.filter(([m]) => m === "sendChatAction")[0]).toEqual(["sendChatAction", { chat_id: 42, action: "typing" }]);
  });

  it("ignores updates that are not text messages or taps, and survives a failing turn", async () => {
    const { api, calls } = fakeApi([[{ update_id: 1 }, message(2, 42, undefined), message(3, 42, "boom")]]);
    const adapter = new TelegramAdapter(api, async () => {
      throw new Error("agent down");
    });
    await adapter.poll();
    expect(sent(calls)).toHaveLength(1);
  });

  it("keeps the menu under the keyboard on plain messages", async () => {
    const { api, calls } = fakeApi([[message(1, 42, "hi")]]);
    await new TelegramAdapter(api, saying({ text: "ok" })).poll();
    expect(sent(calls)[0].reply_markup).toEqual({
      keyboard: [[{ text: "📞 Prochain appel" }], [{ text: "📋 Liste d'appels" }, { text: "➕ Nouveau Batch" }]],
      resize_keyboard: true,
      is_persistent: true,
    });
  });

  it("renders buttons inline, with a copy-number button that copies to the clipboard", async () => {
    const { api, calls } = fakeApi([[message(1, 42, "hi")]]);
    const buttons = [
      [{ label: "No Answer", data: "recap:No Answer" }],
      [{ label: "Copy number", copy: "+33612345678" }],
    ];
    await new TelegramAdapter(api, saying({ text: "📞 card", buttons })).poll();
    expect(sent(calls)[0].reply_markup).toEqual({
      inline_keyboard: [
        [{ text: "No Answer", callback_data: "recap:No Answer" }],
        [{ text: "Copy number", copy_text: { text: "+33612345678" } }],
      ],
    });
  });

  it("hands a tap to the engine, stops the spinner and removes the tapped buttons", async () => {
    const { api, calls } = fakeApi([[tapUpdate(1, 42, "recap:Voicemail")]]);
    const seen: Array<[string, Input]> = [];
    await new TelegramAdapter(api, async (user, input, _typing, send) => {
      seen.push([user, input]);
      await send({ text: "✓" });
    }).poll();
    expect(seen).toEqual([["42", { kind: "tap", data: "recap:Voicemail" }]]);
    expect(calls).toContainEqual(["answerCallbackQuery", { callback_query_id: "cb1" }]);
    expect(calls).toContainEqual([
      "editMessageReplyMarkup",
      { chat_id: 42, message_id: 55, reply_markup: { inline_keyboard: [] } },
    ]);
    expect(sent(calls)).toHaveLength(1);
  });

  it("asks Telegram for taps as well as messages", async () => {
    const { api, calls } = fakeApi([[]]);
    await new TelegramAdapter(api, saying()).poll();
    expect(calls[0][1]).toMatchObject({ allowed_updates: ["message", "callback_query"] });
  });
});
