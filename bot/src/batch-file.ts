import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Decision = "Surfaced" | "Approved" | "Dropped" | "Applied";

export interface Person {
  number: number;
  kind: "Hiring Contact" | "Candidate";
  name: string;
  title: string;
  company: string;
  linkedin: string;
  whyNow: string;
  decision: Decision;
  /** Why the Recruiter dropped them, when they said. */
  reason?: string;
}

export interface Batch {
  status: string;
  searchRun?: string;
  people: Person[];
}

const field = (block: string, label: string) => new RegExp(`^- ${label}: (.*)$`, "m").exec(block)?.[1]?.trim() ?? "";

/** Reads a Batch file in the `DESK.md` format. */
export function parseBatch(markdown: string): Batch {
  const status = /^Status: (.*)$/m.exec(markdown)?.[1]?.trim() ?? "";
  const searchRun = /^Search run: (.*)$/m.exec(markdown)?.[1]?.trim();
  const people: Person[] = [];
  let kind: Person["kind"] = "Hiring Contact";
  for (const section of markdown.split(/^(?=## |### )/m)) {
    if (section.startsWith("## ")) kind = section.startsWith("## Candidates") ? "Candidate" : "Hiring Contact";
    const heading = /^### (\d+)\. (.+?), (.+?) at (.+)$/m.exec(section);
    if (!section.startsWith("### ") || heading === null) continue;
    const decision = /^(\w+)(?: - (.*))?$/.exec(field(section, "Decision"));
    people.push({
      number: Number(heading[1]),
      kind,
      name: heading[2]!,
      title: heading[3]!,
      company: heading[4]!.trim(),
      linkedin: field(section, "LinkedIn"),
      whyNow: field(section, "Why Now"),
      decision: (decision?.[1] ?? "Surfaced") as Decision,
      ...(decision?.[2] ? { reason: decision[2] } : {}),
    });
  }
  return { status, ...(searchRun ? { searchRun } : {}), people };
}

/** Rewrites the Decision line of person `number`, with ` - reason` when given. */
export function setDecision(markdown: string, number: number, decision: Decision, reason?: string): string {
  const parts = markdown.split(/^(?=## |### )/m);
  const at = parts.findIndex((part) => part.startsWith(`### ${number}. `));
  if (at < 0) throw new Error(`No person ${number} in the Batch`);
  parts[at] = parts[at]!.replace(/^- Decision: .*$/m, `- Decision: ${decision}${reason ? ` - ${reason}` : ""}`);
  return parts.join("");
}

export function setStatus(markdown: string, status: string): string {
  return markdown.replace(/^Status: .*$/m, `Status: ${status}`);
}

/** The slugs of the Desk's open Batches, from `batches/<niche-slug>.md`. */
export function openBatches(desk: string): string[] {
  const dir = join(desk, "batches");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .sort();
}

export const batchPath = (desk: string, slug: string) => join(desk, "batches", `${slug}.md`);

export function readBatch(desk: string, slug: string): Batch {
  return parseBatch(readFileSync(batchPath(desk, slug), "utf8"));
}

/** Edits a Batch file in place, the moment a decision is made. */
export function editBatch(desk: string, slug: string, edit: (markdown: string) => string): void {
  const file = batchPath(desk, slug);
  writeFileSync(file, edit(readFileSync(file, "utf8")));
}
