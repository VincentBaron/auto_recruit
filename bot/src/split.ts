/** Splits an answer into messages of at most `limit` characters, cutting at line breaks when it can. */
export function splitMessage(text: string, limit: number): string[] {
  const parts: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim() !== "") parts.push(current);
    current = "";
  };
  for (const line of text.trim().split("\n")) {
    if (line.length > limit) {
      flush();
      for (let i = 0; i < line.length; i += limit) parts.push(line.slice(i, i + limit));
      continue;
    }
    if (current !== "" && current.length + 1 + line.length > limit) flush();
    current = current === "" ? line : `${current}\n${line}`;
  }
  flush();
  return parts;
}
