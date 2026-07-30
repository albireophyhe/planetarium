import { describe, expect, it } from "vitest";
import {
  tdbCalendarYear,
  tdbMinusTtSeconds,
  tdbJulianDateToUtcDate,
  ttToTdbJulianDate,
  utcDateToTdbJulianDate,
} from "./eventTime";
import { resolveTimeScales } from "../precision";

describe("event time scales", () => {
  it("keeps the periodic TDB−TT correction within its physical bound", () => {
    for (let year = 1900; year <= 2100; year += 1) {
      const jd = 2_415_020.5 + (year - 1900) * 365.2425;
      expect(Math.abs(tdbMinusTtSeconds(jd))).toBeLessThan(0.001_8);
    }
  });

  it("adds the correction in Julian days", () => {
    const tt = 2_451_545;
    const correction = tdbMinusTtSeconds(tt);
    expect(
      Math.abs((ttToTdbJulianDate(tt) - tt) * 86_400 - correction),
    ).toBeLessThan(0.000_02);
  });

  it("rejects non-finite time", () => {
    expect(() => tdbMinusTtSeconds(Number.NaN)).toThrow(/finite/);
    expect(() => tdbJulianDateToUtcDate(Number.POSITIVE_INFINITY)).toThrow(
      /finite/,
    );
  });

  it.each([
    "1972-01-01T00:00:00.000Z",
    "2000-01-01T12:00:00.000Z",
    "2026-08-12T17:45:53.800Z",
    "2100-12-30T23:59:59.000Z",
  ])("round-trips the application time-scale model at %s", (iso) => {
    const utc = new Date(iso);
    const tdb = ttToTdbJulianDate(
      resolveTimeScales(utc).ttJulianDate,
    );
    expect(
      Math.abs(tdbJulianDateToUtcDate(tdb).getTime() - utc.getTime()),
    ).toBeLessThanOrEqual(1);
  });

  it("keeps TDB chunk years distinct from UTC at a year boundary", () => {
    const utc = new Date("2024-12-31T23:59:30.000Z");
    const tdb = utcDateToTdbJulianDate(utc);

    expect(utc.getUTCFullYear()).toBe(2024);
    expect(tdbCalendarYear(tdb)).toBe(2025);
    expect(
      Math.abs(tdbJulianDateToUtcDate(tdb).getTime() - utc.getTime()),
    ).toBeLessThanOrEqual(1);
  });
});
