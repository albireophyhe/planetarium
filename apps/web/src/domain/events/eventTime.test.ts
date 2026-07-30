import { describe, expect, it } from "vitest";
import {
  tdbMinusTtSeconds,
  ttToTdbJulianDate,
} from "./eventTime";

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
  });
});
