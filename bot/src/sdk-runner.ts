import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRunner, TurnRequest, TurnResult } from "./engine.ts";
import { decideAllowance, type Allowances } from "./allowance.ts";
import { decideTool } from "./desk-guard.ts";
import { exaErrorsIn } from "./tool-errors.ts";

export interface SdkRunnerOptions {
  /** Absolute path of `plugins/auto-recruit`, loaded as it is. */
  pluginPath: string;
  exaApiKey: string;
  model?: string;
  /** Stops a turn from starting a Batch or buying a number past the Recruiter's Allowance. */
  allowances?: Allowances;
  /** Called for each Exa tool call that errored during a turn. */
  onExaError?: (desk: string, tool: string, message: string) => void;
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
          let decision = decideTool(desk, tool, input);
          if (decision.behavior === "allow" && this.options.allowances) {
            decision = decideAllowance(desk, this.options.allowances, tool, input);
          }
          return decision.behavior === "allow" ? { behavior: "allow", updatedInput: input } : decision;
        },
      },
    });

    const pendingExa = new Map<string, string>();
    for await (const message of turn) {
      for (const error of exaErrorsIn(message, pendingExa)) this.options.onExaError?.(desk, error.tool, error.message);
      if (message.type !== "result") continue;
      if (message.subtype !== "success") throw new Error(`Agent turn failed: ${message.subtype}`);
      return { text: message.result, sessionId: message.session_id };
    }
    throw new Error("Agent turn ended without a result");
  }
}
