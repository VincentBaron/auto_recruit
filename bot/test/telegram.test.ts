import { describe, expect, it } from "vitest";
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
});
