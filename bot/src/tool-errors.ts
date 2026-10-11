export interface ExaError {
  tool: string;
  message: string;
}

interface Block {
  type?: string;
  id?: string;
  name?: string;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
}

const blocksOf = (message: unknown): Block[] => {
  const content = (message as { message?: { content?: unknown } })?.message?.content;
  return Array.isArray(content) ? (content as Block[]) : [];
};

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => (part as { text?: string })?.text ?? "").join(" ")
      : "";

/**
 * Follows the SDK's message stream and returns the Exa tool calls that came back as errors.
 * `pending` remembers the Exa calls seen so far (tool use id to tool name) across messages of one turn.
 */
export function exaErrorsIn(message: unknown, pending: Map<string, string>): ExaError[] {
  const errors: ExaError[] = [];
  for (const block of blocksOf(message)) {
    if (block.type === "tool_use" && block.id && block.name?.startsWith("mcp__exa__")) {
      pending.set(block.id, block.name);
    } else if (block.type === "tool_result" && block.tool_use_id && pending.has(block.tool_use_id)) {
      if (block.is_error) errors.push({ tool: pending.get(block.tool_use_id)!, message: textOf(block.content).slice(0, 300) });
      pending.delete(block.tool_use_id);
    }
  }
  return errors;
}
