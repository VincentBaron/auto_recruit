/**
 * The agents and the bot write messages in a small Markdown subset (see MESSAGES.md in the plugin):
 * **bold**, *italic*, [text](https://url) and "> " quote lines, with a backslash to show a marker as typed.
 * A channel adapter turns it into its own markup; anything that is not in the subset is shown as typed.
 */
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (text: string) => escapeHtml(text).replace(/"/g, "&quot;");

const INLINE = /\\([\\*[\]>])|\[((?:\\.|[^\]\\\n])+)\]\((https?:\/\/[^\s)]+)\)|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*/g;

function inline(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    out += escapeHtml(text.slice(last, m.index));
    if (m[1] !== undefined) out += escapeHtml(m[1]);
    else if (m[2] !== undefined) out += `<a href="${escapeAttr(m[3]!)}">${inline(m[2])}</a>`;
    else if (m[4] !== undefined) out += `<b>${inline(m[4])}</b>`;
    else out += `<i>${inline(m[5]!)}</i>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

/** The message as Telegram HTML. */
export function toTelegramHtml(markdown: string): string {
  const out: string[] = [];
  let quote: string[] = [];
  const flush = () => {
    if (quote.length > 0) out.push(`<blockquote>${quote.join("\n")}</blockquote>`);
    quote = [];
  };
  for (const line of markdown.split("\n")) {
    const q = /^>\s?(.*)$/.exec(line);
    if (q) quote.push(inline(q[1]!));
    else {
      flush();
      out.push(inline(line));
    }
  }
  flush();
  return out.join("\n");
}

/** The message in a chat that shows no markup: the same words, links kept as `name (url)`. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/\[((?:\\.|[^\]\\\n])+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*\\])\*([^*\s][^*]*?)\*/g, "$1$2")
    .replace(/^>\s?/gm, "")
    .replace(/\\([\\*[\]>])/g, "$1");
}

/** A name, title or any text from a file, safe to put in a message: none of its characters is read as a marker. */
export const mdEscape = (text: string) => text.replace(/[\\*[\]]/g, "\\$&").replace(/^>/gm, "\\>");
