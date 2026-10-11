import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { ToolDecision } from "./desk-guard.ts";

export const DEFAULT_BATCHES = 4;
export const DEFAULT_EUROS = 50;
/** What one phone number found by Exa costs us; counted from the Phone Source lines (DESK.md). */
export const PHONE_PRICE_EUR = 0.5;

interface DeskAllowance {
  batches: number;
  euros: number;
  /** Batches started, by month `YYYY-MM`. */
  started: Record<string, number>;
  /** Thresholds (75, 100) already pinged, by month. */
  pinged: Record<string, number[]>;
}

export interface Usage {
  batches: number;
  euros: number;
}

export interface AllowanceOptions {
  file: string;
  /** The month is the Recruiter's own, so it resets on the 1st in their timezone. */
  timezoneOf: (desk: string) => string;
  now?: () => Date;
  phonePriceEur?: number;
}

const PHONE_LINE = /^- Phone: \+\d+ \(Exa, (\d{4}-\d{2})-\d{2}\)/gm;

/** Each Recruiter's monthly Allowance: Batches and money for phone numbers (CONTEXT.md). */
export class Allowances {
  constructor(private readonly options: AllowanceOptions) {}

  limits(desk: string): { batches: number; euros: number } {
    const { batches, euros } = this.read(desk);
    return { batches, euros };
  }

  /** "Raise Camille to 6 Batches". */
  setBatches(desk: string, batches: number): void {
    this.update(desk, (a) => void (a.batches = batches));
  }

  /** "Give Camille €30 more for numbers". */
  addEuros(desk: string, euros: number): void {
    this.update(desk, (a) => void (a.euros += euros));
  }

  usage(desk: string): Usage {
    const month = this.month(desk);
    return { batches: this.read(desk).started[month] ?? 0, euros: this.phoneSpend(desk, month) };
  }

  recordBatchStart(desk: string): void {
    const month = this.month(desk);
    this.update(desk, (a) => void (a.started[month] = (a.started[month] ?? 0) + 1));
  }

  /** One line for the Recruiter when a Batch may not start; null when it may. */
  refusalForBatch(desk: string): string | null {
    const { batches } = this.limits(desk);
    return this.usage(desk).batches >= batches
      ? `Vous avez utilisé vos ${batches} Batches du mois: Vincent peut relever votre limite, sinon elle repart le 1er. / You have used your ${batches} Batches this month: Vincent can raise it, or it resets on the 1st.`
      : null;
  }

  /** One line for the Recruiter when a number may not be bought; null when it may. */
  refusalForNumber(desk: string): string | null {
    const { euros } = this.limits(desk);
    return this.usage(desk).euros >= euros
      ? `Vous avez utilisé vos ${euros} € de numéros du mois: Vincent peut relever votre limite, sinon elle repart le 1er. / You have used your €${euros} of phone numbers this month: Vincent can raise it, or it resets on the 1st.`
      : null;
  }

  /** The 75% and 100% thresholds crossed since the last call, once each per month. */
  newlyCrossed(desk: string): number[] {
    const month = this.month(desk);
    const { batches, euros } = this.limits(desk);
    const usage = this.usage(desk);
    const used = Math.max(batches > 0 ? usage.batches / batches : 1, euros > 0 ? usage.euros / euros : 1);
    const already = this.read(desk).pinged[month] ?? [];
    const crossed = [75, 100].filter((t) => used * 100 >= t && !already.includes(t));
    if (crossed.length > 0) this.update(desk, (a) => void (a.pinged[month] = [...already, ...crossed]));
    return crossed;
  }

  private month(desk: string): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: this.options.timezoneOf(desk),
      year: "numeric",
      month: "2-digit",
    }).formatToParts((this.options.now ?? (() => new Date()))());
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}`;
  }

  private phoneSpend(desk: string, month: string): number {
    let numbers = 0;
    for (const folder of ["prospects", "candidates"]) {
      const dir = join(desk, folder);
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir)) {
        for (const match of readFileSync(join(dir, file), "utf8").matchAll(PHONE_LINE)) {
          if (match[1] === month) numbers++;
        }
      }
    }
    return numbers * (this.options.phonePriceEur ?? PHONE_PRICE_EUR);
  }

  private readAll(): Record<string, DeskAllowance> {
    return existsSync(this.options.file) ? JSON.parse(readFileSync(this.options.file, "utf8")) : {};
  }

  private read(desk: string): DeskAllowance {
    const all = this.readAll();
    const stored = Object.hasOwn(all, desk) ? all[desk] : undefined;
    return { batches: DEFAULT_BATCHES, euros: DEFAULT_EUROS, started: {}, pinged: {}, ...stored };
  }

  private update(desk: string, change: (allowance: DeskAllowance) => void): void {
    const all = this.readAll();
    const allowance = this.read(desk);
    change(allowance);
    all[desk] = allowance;
    const tmp = `${this.options.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2));
    renameSync(tmp, this.options.file);
  }
}

const allow: ToolDecision = { behavior: "allow" };
const BATCH_FILE = /^batches\/[^/]+\.md$/;

/**
 * Stops a turn from spending past the Allowance: creating a Batch file starts a Batch (so does an Exa search
 * with no Batch open), and an Exa run asking for `phone` buys numbers. Anything else passes. Files are already vetted by the Desk guard.
 */
export function decideAllowance(
  desk: string,
  allowances: Allowances,
  tool: string,
  input: Record<string, unknown>,
): ToolDecision {
  if (tool === "Write" && typeof input.file_path === "string") {
    const rel = relative(desk, resolve(desk, input.file_path));
    if (BATCH_FILE.test(rel) && !existsSync(join(desk, rel))) {
      const refusal = allowances.refusalForBatch(desk);
      if (refusal !== null) return { behavior: "deny", message: refusal };
      allowances.recordBatchStart(desk);
    }
    return allow;
  }
  if (tool === "mcp__exa__agent_run") {
    const buysNumbers = JSON.stringify(input).includes('"phone"');
    const openBatch = existsSync(join(desk, "batches")) && readdirSync(join(desk, "batches")).length > 0;
    const refusal = buysNumbers
      ? allowances.refusalForNumber(desk)
      : openBatch
        ? null // resuming a Batch already counted
        : allowances.refusalForBatch(desk);
    if (refusal !== null) return { behavior: "deny", message: refusal };
  }
  return allow;
}
