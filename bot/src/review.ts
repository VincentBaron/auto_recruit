import { existsSync } from "node:fs";
import { batchPath, editBatch, readBatch, setDecision, setStatus, type Person } from "./batch-file.ts";

export interface Button {
  label: string;
  data: string;
}

/** What the Recruiter sees: a text and rows of buttons, whatever the channel. */
export interface Screen {
  text: string;
  buttons: Button[][];
}

const NO_REASON = /^\s*(no reason|none|sans raison|aucune|non)\s*\.?\s*$/i;

/**
 * The one-person-at-a-time review of a Batch. Every Keep and Skip is written to the Batch file as it
 * happens, so a review stops and resumes at the next undecided card. Button data is `<action>:<slug>[:<n>]`.
 */
export class BatchReview {
  /** The Skip waiting for its optional reason, per Desk. */
  private readonly awaiting = new Map<string, { slug: string; number: number }>();

  /** Called once, when the last card is decided and the Batch is `Approved`, to apply it. */
  constructor(private readonly onApproved: (desk: string, slug: string) => void) {}

  /** A tap on a button. */
  press(desk: string, data: string): Screen {
    const [action, slug = "", n] = data.split(":");
    this.awaiting.delete(desk);
    if (!existsSync(batchPath(desk, slug))) return { text: "This Batch is closed.", buttons: [] };
    if (action === "k" || action === "s") {
      const person = this.surfaced(desk, slug).find((p) => p.number === Number(n));
      if (person !== undefined) return this.decide(desk, slug, person, action === "k");
    }
    if (action === "r") return this.keepTheRest(desk, slug);
    return this.card(desk, slug);
  }

  /** A text sent while a reason is awaited: records it and shows the next card; null when none is awaited. */
  reason(desk: string, text: string): Screen | null {
    const pending = this.awaiting.get(desk);
    if (pending === undefined) return null;
    this.awaiting.delete(desk);
    if (!NO_REASON.test(text)) {
      editBatch(desk, pending.slug, (md) => setDecision(md, pending.number, "Dropped", text.replace(/\s+/g, " ").trim()));
    }
    return this.card(desk, pending.slug);
  }

  private surfaced(desk: string, slug: string): Person[] {
    const batch = readBatch(desk, slug);
    return batch.status === "Proposed" ? batch.people.filter((p) => p.decision === "Surfaced") : [];
  }

  private decide(desk: string, slug: string, person: Person, keep: boolean): Screen {
    editBatch(desk, slug, (md) => setDecision(md, person.number, keep ? "Approved" : "Dropped"));
    if (keep) return this.card(desk, slug);
    this.awaiting.set(desk, { slug, number: person.number });
    return {
      text: `Skipped: ${person.name}\nwhy? (optional) Send a message, or tap No reason.`,
      buttons: [[{ label: "No reason", data: `x:${slug}` }]],
    };
  }

  private keepTheRest(desk: string, slug: string): Screen {
    for (const person of this.surfaced(desk, slug)) {
      editBatch(desk, slug, (md) => setDecision(md, person.number, "Approved"));
    }
    return this.card(desk, slug);
  }

  /** The next undecided card, or, when every card is decided, the approval of the Batch. */
  private card(desk: string, slug: string): Screen {
    const batch = readBatch(desk, slug);
    if (batch.status !== "Proposed") {
      return { text: `This Batch is not waiting for review (${batch.status.toLowerCase()}).`, buttons: [] };
    }
    const index = batch.people.findIndex((p) => p.decision === "Surfaced");
    if (index < 0) return this.approve(desk, slug);
    const person = batch.people[index]!;
    return {
      text: `${index + 1}/${batch.people.length}\n${person.name}\n${person.title}, ${person.company}\n${person.whyNow}\n${person.linkedin}`,
      buttons: [
        [
          { label: "Keep", data: `k:${slug}:${person.number}` },
          { label: "Skip", data: `s:${slug}:${person.number}` },
        ],
        [{ label: "Keep the rest", data: `r:${slug}` }],
      ],
    };
  }

  private approve(desk: string, slug: string): Screen {
    editBatch(desk, slug, (md) => setStatus(md, "Approved"));
    const people = readBatch(desk, slug).people;
    const kept = people.filter((p) => p.decision === "Approved").length;
    this.onApproved(desk, slug);
    return {
      text: `Batch reviewed: ${kept} kept, ${people.length - kept} skipped. I'm finding their numbers and I'll send you the report.`,
      buttons: [],
    };
  }
}
