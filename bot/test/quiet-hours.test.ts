import { describe, expect, it } from "vitest";
import { isQuietHours } from "../src/quiet-hours.ts";

describe("isQuietHours", () => {
  it("is quiet from 20:00 to 08:00 in the Recruiter's timezone", () => {
    // 2026-10-12 is CEST (UTC+2)
    expect(isQuietHours(new Date("2026-10-12T05:59:00Z"), "Europe/Paris")).toBe(true); // 07:59
    expect(isQuietHours(new Date("2026-10-12T06:00:00Z"), "Europe/Paris")).toBe(false); // 08:00
    expect(isQuietHours(new Date("2026-10-12T17:59:00Z"), "Europe/Paris")).toBe(false); // 19:59
    expect(isQuietHours(new Date("2026-10-12T18:00:00Z"), "Europe/Paris")).toBe(true); // 20:00
    expect(isQuietHours(new Date("2026-10-12T22:30:00Z"), "Europe/Paris")).toBe(true); // 00:30 next day
  });

  it("follows the timezone, not the server", () => {
    const noonUtc = new Date("2026-10-12T12:00:00Z");
    expect(isQuietHours(noonUtc, "Europe/Paris")).toBe(false);
    expect(isQuietHours(noonUtc, "Asia/Tokyo")).toBe(true); // 21:00
  });
});
