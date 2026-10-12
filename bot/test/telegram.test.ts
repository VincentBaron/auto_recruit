import { describe, expect, it } from "vitest";
import type { Screen } from "../src/review.ts";
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

describe("TelegramAdapter", () => {
  it("answers a message in its chat and acknowledges the update", async () => {
    const { api, calls } = fakeApi([[message(7, 42, "hello")]]);
    const adapter = new TelegramAdapter(api, async (userId, text) => `echo ${userId} ${text}`);
    await adapter.poll();
    expect(calls.filter(([m]) => m === "sendMessage")).toEqual([
      ["sendMessage", { chat_id: 42, text: "echo 42 hello" }],
    ]);
    await adapter.poll();
    expect(calls.find(([m, p]) => m === "getUpdates" && (p as { offset?: number }).offset === 8)).toBeDefined();
  });

  it("splits a long answer under Telegram's limit", async () => {
    const { api, calls } = fakeApi([[message(1, 42, "long")]]);
    await new TelegramAdapter(api, async () => "x".repeat(5000)).poll();
    const sent = calls.filter(([m]) => m === "sendMessage").map(([, p]) => (p as { text: string }).text);
    expect(sent.map((t) => t.length)).toEqual([4096, 904]);
  });

  it("sends nothing to unknown users", async () => {
    const { api, calls } = fakeApi([[message(1, 99, "hi")]]);
    await new TelegramAdapter(api, async () => null).poll();
    expect(calls.some(([m]) => m === "sendMessage")).toBe(false);
  });

  it("shows typing while the turn runs", async () => {
    const { api, calls } = fakeApi([[message(1, 42, "hi")]]);
    await new TelegramAdapter(api, async (_user, _text, typing) => (typing.start(), "ok")).poll();
    expect(calls.filter(([m]) => m === "sendChatAction")[0]).toEqual([
      "sendChatAction",
      { chat_id: 42, action: "typing" },
    ]);
  });

  it("ignores updates that are not text messages and survives a failing turn", async () => {
    const { api, calls } = fakeApi([[{ update_id: 1 }, message(2, 42, undefined), message(3, 42, "boom")]]);
    const adapter = new TelegramAdapter(api, async () => {
      throw new Error("agent down");
    });
    await adapter.poll();
    expect(calls.filter(([m]) => m === "sendMessage")).toHaveLength(1);
  });

  describe("review cards", () => {
    const card = { text: "1/2\nAna", buttons: [[{ label: "Keep", data: "k:fde:1" }]] };
    const tap = (update_id: number, userId: number, data: string): TelegramUpdate => ({
      update_id,
      callback_query: { id: `cb${update_id}`, from: { id: userId }, data, message: { message_id: 77, chat: { id: userId } } },
    });
    const port = (screens: Array<Screen | null>) => ({
      press: (_user: string, _data: string) => screens.shift() ?? null,
      reason: (_user: string, _text: string) => screens.shift() ?? null,
    });

    it("edits the card in place with its buttons when one is tapped", async () => {
      const { api, calls } = fakeApi([[tap(1, 42, "o:fde")]]);
      await new TelegramAdapter(api, async () => null, port([card])).poll();
      expect(calls.find(([m]) => m === "answerCallbackQuery")?.[1]).toEqual({ callback_query_id: "cb1" });
      expect(calls.find(([m]) => m === "editMessageText")?.[1]).toEqual({
        chat_id: 42,
        message_id: 77,
        text: "1/2\nAna",
        reply_markup: { inline_keyboard: [[{ text: "Keep", callback_data: "k:fde:1" }]] },
      });
    });

    it("ignores taps from users the review does not know", async () => {
      const { api, calls } = fakeApi([[tap(1, 99, "k:fde:1")]]);
      await new TelegramAdapter(api, async () => null, port([null])).poll();
      expect(calls.some(([m]) => m === "editMessageText")).toBe(false);
    });

    it("takes a text as the reason of a Skip and edits the card, without running an agent turn", async () => {
      const { api, calls } = fakeApi([[tap(1, 42, "s:fde:1")], [message(2, 42, "too junior")]]);
      let turns = 0;
      const adapter = new TelegramAdapter(api, async () => (turns++, "x"), port([{ text: "why?", buttons: [] }, card]));
      await adapter.poll();
      await adapter.poll();
      expect(turns).toBe(0);
      const edits = calls.filter(([m]) => m === "editMessageText").map(([, p]) => p as { message_id: number; text: string });
      expect(edits.map((e) => [e.message_id, e.text])).toEqual([[77, "why?"], [77, "1/2\nAna"]]);
    });

    it("lets a text through to the agents when no reason is awaited", async () => {
      const { api, calls } = fakeApi([[message(1, 42, "hello")]]);
      await new TelegramAdapter(api, async () => "hi", port([null])).poll();
      expect(calls.find(([m]) => m === "sendMessage")?.[1]).toEqual({ chat_id: 42, text: "hi" });
    });

    it("pushes a message with buttons to a user", async () => {
      const { api, calls } = fakeApi([]);
      await new TelegramAdapter(api, async () => null).push("42", card);
      expect(calls[0]).toEqual([
        "sendMessage",
        { chat_id: 42, text: "1/2\nAna", reply_markup: { inline_keyboard: [[{ text: "Keep", callback_data: "k:fde:1" }]] } },
      ]);
    });
  });

  it("tells the handler who is writing, with their name, username and language", async () => {
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        chat: { id: 5 },
        from: { id: 5, first_name: "Jean", last_name: "Martin", username: "jmartin", language_code: "en" },
        text: "/start abc",
      },
    };
    const { api } = fakeApi([[update]]);
    let seen: unknown;
    await new TelegramAdapter(api, async (_u, _t, _typing, sender) => ((seen = sender), null)).poll();
    expect(seen).toEqual({ name: "Jean Martin", username: "jmartin", language: "en" });
  });
});
