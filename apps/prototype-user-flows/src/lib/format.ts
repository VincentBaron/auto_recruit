// Deterministic, locale-independent formatting. Use these everywhere instead of toLocale* or Intl,
// so server and client render identical text (no hydration mismatches).

import { diffDays, parseISODate, weekdayIndex } from "./dates";
import type { ISODate, Language, Weekday } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** French month abbreviations (fixed table, no Intl, so server and client agree). */
const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_ORDER: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Narrow no-break space: a thin, non-wrapping thousands separator. */
export const THIN_SPACE = " ";

/** Keeps each " - " separator on the line of the word before it, so no wrapped line starts with "-". */
export function keepDashesAttached(text: string): string {
  return text.replace(/ - /g, "\u00a0- ");
}

/** Invoice number shown to the Recruiter: "INV-2026-00CA" (from the invoice's date and id). */
export function formatInvoiceNumber(invoice: { id: string; on: ISODate }): string {
  const suffix = invoice.id.replace(/^[a-z]+_/i, "").toUpperCase().padStart(4, "0");
  return `INV-${invoice.on.slice(0, 4)}-${suffix}`;
}

/** "12 Oct 2026". Returns "-" for null/empty. */
export function formatDate(iso: ISODate | null | undefined): string {
  if (!iso) return "-";
  const [y, m, d] = parseISODate(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** French date: "1er oct. 2026", "12 oct. 2028". Returns "-" for null/empty. */
export function formatDateFr(iso: ISODate | null | undefined): string {
  if (!iso) return "-";
  const [y, m, d] = parseISODate(iso);
  return `${d === 1 ? "1er" : d} ${MONTHS_FR[m - 1]} ${y}`;
}

/** The date in the language of an email or page: "12 Oct 2026" or "12 oct. 2026". */
export function formatDateIn(iso: ISODate | null | undefined, language: Language): string {
  return language === "fr" ? formatDateFr(iso) : formatDate(iso);
}

/** "12 Oct". */
export function formatDateShort(iso: ISODate | null | undefined): string {
  if (!iso) return "-";
  const [, m, d] = parseISODate(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Mon 12 Oct 2026". */
export function formatWeekdayDate(iso: ISODate | null | undefined): string {
  if (!iso) return "-";
  return `${WEEKDAY_SHORT[weekdayIndex(iso)]} ${formatDate(iso)}`;
}

/** "Oct 2026". */
export function formatMonthYear(iso: ISODate | null | undefined): string {
  if (!iso) return "-";
  const [y, m] = parseISODate(iso);
  return `${MONTHS[m - 1]} ${y}`;
}

/**
 * Relative to the simulated today: "today", "yesterday", "tomorrow", "3 days ago", "in 18 days",
 * then months and years for longer spans ("in 2 months", "2 years ago").
 */
export function formatRelative(iso: ISODate | null | undefined, today: ISODate): string {
  if (!iso) return "-";
  const n = diffDays(iso, today);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  const abs = Math.abs(n);
  let phrase: string;
  if (abs < 45) phrase = `${abs} days`;
  else if (abs < 365) {
    const months = Math.round(abs / 30.4);
    phrase = `${months} month${months === 1 ? "" : "s"}`;
  } else {
    const years = Math.round(abs / 365);
    phrase = `${years} year${years === 1 ? "" : "s"}`;
  }
  return n > 0 ? `in ${phrase}` : `${phrase} ago`;
}

/** Whole days until `iso` from today (negative when past). */
export function daysUntil(iso: ISODate, today: ISODate): number {
  return diffDays(iso, today);
}

/** "1 840", "-22", "12 000" with a thin space. */
export function formatNumber(n: number): string {
  const negative = n < 0;
  const abs = Math.abs(Math.round(n));
  const digits = String(abs);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i;
    out += digits[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) out += THIN_SPACE;
  }
  return negative ? `-${out}` : out;
}

/** Credits amount without unit: "1 840". */
export function formatCredits(n: number): string {
  return formatNumber(n);
}

/** "1 840 Credits", "1 Credit". */
export function formatCreditsLabel(n: number): string {
  return `${formatNumber(n)} ${Math.abs(n) === 1 ? "Credit" : "Credits"}`;
}

/** Signed delta for ledgers: "+500", "-22". */
export function formatDelta(n: number): string {
  return n > 0 ? `+${formatNumber(n)}` : formatNumber(n);
}

/** "€1 490" or "€1 490.00" with `cents`. */
export function formatEuros(amount: number, cents = false): string {
  if (!cents) return `€${formatNumber(amount)}`;
  const whole = Math.trunc(amount);
  const frac = Math.round(Math.abs(amount - whole) * 100);
  return `€${formatNumber(whole)}.${frac < 10 ? `0${frac}` : frac}`;
}

/** Large money amounts: "€32M", "€4.5M", "€800k". */
export function formatEurosCompact(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `€${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (amount >= 1_000) return `€${Math.round(amount / 1_000)}k`;
  return `€${amount}`;
}

/** "4.2%". */
export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${formatNumber(n)} ${n === 1 ? singular : pluralForm ?? `${singular}s`}`;
}

/** "2 yrs 4 mos", "8 mos". */
export function formatTenure(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} mo${m === 1 ? "" : "s"}`;
  if (m === 0) return `${y} yr${y === 1 ? "" : "s"}`;
  return `${y} yr${y === 1 ? "" : "s"} ${m} mo${m === 1 ? "" : "s"}`;
}

/** "sha256:3f9a1c0b...e07b". */
export function truncateHash(hash: string): string {
  const clean = hash.replace(/^sha256:/, "");
  return `sha256:${clean.slice(0, 8)}...${clean.slice(-4)}`;
}

/** Weekday set: "Mon-Fri", "Every day", "Mon, Wed, Fri". */
export function formatWeekdays(days: Weekday[]): string {
  if (days.length === 0) return "No days";
  if (days.length === 7) return "Every day";
  const idx = days.map((d) => WEEKDAY_ORDER.indexOf(d)).sort((a, b) => a - b);
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous && idx.length >= 3) return `${WEEKDAY_SHORT[idx[0]]}-${WEEKDAY_SHORT[idx[idx.length - 1]]}`;
  return idx.map((i) => WEEKDAY_SHORT[i]).join(", ");
}

export function weekdayShort(day: Weekday): string {
  return WEEKDAY_SHORT[WEEKDAY_ORDER.indexOf(day)];
}

/** "Signal Strength 78" helpers: rounds and clamps to 0-100. */
export function formatScore(n: number): string {
  return String(Math.max(0, Math.min(100, Math.round(n))));
}

/** Initials for avatars: "Vincent Baron" -> "VB". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
