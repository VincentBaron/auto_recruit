// Pure, deterministic calendar arithmetic on ISO dates (`YYYY-MM-DD`).
// No Date objects, no time zones: safe to call during React render on server and client.

import type { ISODate, Weekday } from "./types";

const WEEKDAY_KEYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(n: number): [number, number, number] {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return [y, m, d];
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Parses `YYYY-MM-DD` (or a longer ISO string, using its first 10 chars). */
export function parseISODate(iso: ISODate): [number, number, number] {
  const s = iso.slice(0, 10);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  return [y, m, d];
}

export function toDayNumber(iso: ISODate): number {
  const [y, m, d] = parseISODate(iso);
  return daysFromCivil(y, m, d);
}

export function fromDayNumber(n: number): ISODate {
  const [y, m, d] = civilFromDays(n);
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(iso) + days);
}

/** Whole days from `b` to `a` (a - b). Positive when `a` is later. */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNumber(a) - toDayNumber(b);
}

export function addMonths(iso: ISODate, months: number): ISODate {
  const [y, m, d] = parseISODate(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = civilFromDays(daysFromCivil(nm === 12 ? ny + 1 : ny, nm === 12 ? 1 : nm + 1, 1) - 1)[2];
  return `${ny}-${pad(nm)}-${pad(Math.min(d, lastDay))}`;
}

export function addYears(iso: ISODate, years: number): ISODate {
  return addMonths(iso, years * 12);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(iso: ISODate): number {
  const n = toDayNumber(iso);
  return (((n + 3) % 7) + 7) % 7;
}

export function weekdayOf(iso: ISODate): Weekday {
  return WEEKDAY_KEYS[weekdayIndex(iso)];
}

export function isWeekend(iso: ISODate): boolean {
  return weekdayIndex(iso) >= 5;
}

/**
 * The first date on or after `from` that is a sending day: a weekday (Mon-Fri) listed in `days`.
 * Falls back to the first weekday when `days` lists no weekday at all.
 */
export function nextSendingDay(from: ISODate, days: Weekday[]): ISODate {
  const allowed: Weekday[] = days.filter((d) => d !== "sat" && d !== "sun");
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (isWeekend(d)) continue;
    if (allowed.length === 0 || allowed.includes(weekdayOf(d))) return d;
  }
  return from;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return toDayNumber(a) <= toDayNumber(b) ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return toDayNumber(a) >= toDayNumber(b) ? a : b;
}

export function isBefore(a: ISODate, b: ISODate): boolean {
  return toDayNumber(a) < toDayNumber(b);
}

export function isOnOrBefore(a: ISODate, b: ISODate): boolean {
  return toDayNumber(a) <= toDayNumber(b);
}
