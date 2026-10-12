import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERB = String.raw`(?:efface|effacer|effacez|supprime|supprimer|supprimez|oublie|oublier|oubliez|erase|delete|forget|remove)`;
const POLITE = String.raw`(?:(?:please|s'il te pla[iî]t|s'il vous pla[iî]t)[, ]+)?`;
const NAME_TOKEN = String.raw`\p{Lu}[\p{L}'’.-]*`;
const PARTICLE = String.raw`(?:de|du|des|la|le|van|von|der|di|da|el|al|d['’]|ben)`;
/** At least two words, the first and the last capitalised: a lone word such as "Acme" or "it" is never taken for a person. */
const NAME = String.raw`${NAME_TOKEN}(?:\s+(?:${PARTICLE}\s*)*${NAME_TOKEN})+`;
const TAIL = String.raw`(?:\s+(?:de mon|de ma|from my|from the)\s+\S+)?`;
const ERASURE = new RegExp(String.raw`^${POLITE}${VERB}\s+(${NAME}?)${TAIL}$`, "iu");
const STRICT_NAME = new RegExp(String.raw`^${NAME}$`, "u");

/** The name in a Recruiter's erasure request ("Efface Sophie Leroy", "forget Sophie Leroy"), or null when the line is not one. */
export function parseErasure(text: string): string | null {
  const line = text.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  const name = ERASURE.exec(line)?.[1];
  return name !== undefined && STRICT_NAME.test(name) ? name : null;
}

const strip = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const slugOf = (text: string) => strip(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches the name in text normalised to NFD, ignoring case and accents. */
function nameRegex(name: string): RegExp {
  const letters = strip(name)
    .trim()
    .split("")
    .map((c) => (/\s/.test(c) ? String.raw`\s+` : `${escape(c)}\\p{M}*`))
    .join("");
  return new RegExp(String.raw`(?<![\p{L}\p{M}])${letters}(?![\p{L}])`, "iu");
}

const URL = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s)>\]|]+/gi;
const HEADING = /^(#{1,6})\s+(.*)$/;
const ITEM = /^\s*(?:[-*+]\s|\|)/;

function markdownFiles(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(dir, base), { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = base === "" ? entry.name : `${base}/${entry.name}`;
    if (entry.isDirectory()) out.push(...markdownFiles(dir, path));
    else if (entry.name.endsWith(".md") && path !== "DO_NOT_CALL.md") out.push(path);
  }
  return out;
}

/** The file is about the person when its name or its first title is theirs: it goes whole. */
function isAboutThem(path: string, content: string, nameRe: RegExp, slug: string): boolean {
  if (path.split("/").pop()!.slice(0, -3) === slug) return true;
  const title = content.split("\n").map((l) => HEADING.exec(l)).find((m) => m !== null && m[1] === "#");
  if (title === undefined || title === null) return false;
  const heading = title[2].normalize("NFD").trim();
  const match = nameRe.exec(heading);
  return match !== null && match[0].length === heading.length;
}

/** Takes the person out of one file: the sections about them, the list items and rows that name them, the name anywhere else. */
function scan(content: string, matches: (line: string) => boolean, nameRe: RegExp): { kept: string; removed: string[] } {
  const kept: string[] = [];
  const removed: string[] = [];
  let skipLevel = 0;
  for (const line of content.split("\n")) {
    const heading = HEADING.exec(line);
    if (skipLevel > 0) {
      if (heading === null || heading[1].length > skipLevel) {
        removed.push(line);
        continue;
      }
      skipLevel = 0;
    }
    if (!matches(line)) {
      kept.push(line);
      continue;
    }
    removed.push(line);
    if (heading !== null) skipLevel = heading[1].length;
    else if (!ITEM.test(line)) kept.push(line.normalize("NFD").replace(nameRe, "a contact").replace(URL, "").normalize("NFC"));
  }
  return { kept: kept.join("\n"), removed };
}

/**
 * Erases a person from a Desk: their files, their sections and lines everywhere, keeping one line in `DO_NOT_CALL.md`.
 * `today` is `YYYY-MM-DD`. Returns false, changing nothing, when the Desk has nobody of that name.
 */
export function eraseFromDesk(desk: string, name: string, today: string): boolean {
  const nameRe = nameRegex(name);
  const hasName = (line: string) => nameRe.test(line.normalize("NFD"));
  const files = markdownFiles(desk).map((path) => ({ path, content: readFileSync(join(desk, path), "utf8") }));
  const slug = slugOf(name);
  const aboutThem = (path: string, content: string) => isAboutThem(path, content, nameRe, slug);

  // First pass: what the Desk says about them, to learn their LinkedIn URLs and how their name is written.
  const material = files.flatMap(({ path, content }) => (aboutThem(path, content) ? [content] : scan(content, hasName, nameRe).removed));
  if (material.length === 0) return false;
  const text = material.join("\n");
  const urls = [...new Set(text.match(URL) ?? [])];
  const written = nameRe.exec(text.normalize("NFD"))?.[0].normalize("NFC") ?? name;
  const urlRe = (line: string) => urls.some((u) => line.includes(u));
  const matches = (line: string) => hasName(line) || urlRe(line);

  // Second pass: the same, with their URLs counting as much as their name.
  for (const { path, content } of files) {
    if (aboutThem(path, content)) {
      rmSync(join(desk, path));
      continue;
    }
    const { kept } = scan(content, matches, nameRe);
    if (kept !== content) writeFileSync(join(desk, path), kept);
  }

  const file = join(desk, "DO_NOT_CALL.md");
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (!existing.split("\n").some(hasName)) {
    const entry = [today, written, ...urls.slice(0, 1), "asked to be erased"].join(" - ");
    const head = existing.trim() === "" ? "# Do Not Call\n\n" : existing.replace(/\n*$/, "\n");
    writeFileSync(file, `${head}- ${entry}\n`);
  }
  return true;
}
