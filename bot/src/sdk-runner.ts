import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRunner, TurnRequest, TurnResult } from "./engine.ts";
import { decideTool } from "./desk-guard.ts";

export interface SdkRunnerOptions {
  /** Absolute path of `plugins/auto-recruit`, loaded as it is. */
  pluginPath: string;
  exaApiKey: string;
  model?: string;
}

const LANGUAGE_RULE =
  "You are talking to a Recruiter in a chat on their phone. Answer in the language they write in, briefly, in plain text without markdown tables.";

/** Runs a turn on the Claude Agent SDK, inside one Desk folder, with only the tools the Desk guard allows. */
export class SdkRunner implements AgentRunner {
  constructor(private readonly options: SdkRunnerOptions) {}

  async run({ desk, prompt, sessionId }: TurnRequest): Promise<TurnResult> {
    const turn = query({
      prompt,
      options: {
        cwd: desk,
        model: this.options.model ?? "claude-opus-5-5",
        resume: sessionId,
        plugins: [{ type: "local", path: this.options.pluginPath }],
        settingSources: [],
        tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Skill"],
        mcpServers: {
          exa: { type: "http", url: "https://mcp.exa.ai/mcp", headers: { "x-api-key": this.options.exaApiKey } },
        },
        systemPrompt: { type: "preset", preset: "claude_code", append: LANGUAGE_RULE },
        permissionMode: "default",
        canUseTool: async (tool, input) => {
          const decision = decideTool(desk, tool, input);
          return decision.behavior === "allow" ? { behavior: "allow", updatedInput: input } : decision;
        },
      },
    });

    for await (const message of turn) {
      if (message.type !== "result") continue;
      if (message.subtype !== "success") throw new Error(`Agent turn failed: ${message.subtype}`);
      return { text: message.result, sessionId: message.session_id };
    }
    throw new Error("Agent turn ended without a result");
  }
}
