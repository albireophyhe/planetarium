import { describe, expect, it } from "vitest";
import {
  assertSupportedObservationDate,
  clampObservationDate,
  equatorialToHorizontal,
  isSupportedObservationDate,
  ObservationDateValidationError,
  SUPPORTED_OBSERVATION_DATE_RANGE,
  validateObservationDate
} from "./index";

describe("supported observation date", () => {
  it("accepts the documented inclusive 1900–2100 range", () => {
    for (const iso of [
      SUPPORTED_OBSERVATION_DATE_RANGE.minimum,
      "2000-01-01T12:00:00.000Z",
      SUPPORTED_OBSERVATION_DATE_RANGE.maximum
    ]) {
      const date = new Date(iso);
      expect(isSupportedObservationDate(date)).toBe(true);
      expect(validateObservationDate(date)).toEqual({
        ok: true,
        value: date,
        issues: []
      });
    }
  });

  it("returns distinct invalid and unsupported results", () => {
    expect(validateObservationDate(new Date(Number.NaN))).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "invalid-date"
        })
      ]
    });
    expect(
      validateObservationDate(new Date("1899-12-31T23:59:59.999Z"))
    ).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "date-out-of-supported-range"
        })
      ]
    });
    expect(
      validateObservationDate(new Date("2101-01-01T00:00:00.000Z"))
    ).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "date-out-of-supported-range"
        })
      ]
    });
  });

  it("clamps untrusted clock values while retaining supported dates", () => {
    const supported = new Date("2026-07-29T00:00:00.000Z");
    expect(clampObservationDate(supported)).toBe(supported);
    expect(
      clampObservationDate(new Date(Number.NaN)).toISOString(),
    ).toBe(SUPPORTED_OBSERVATION_DATE_RANGE.minimum);
    expect(
      clampObservationDate(
        new Date("1899-12-31T23:59:59.999Z"),
      ).toISOString(),
    ).toBe(SUPPORTED_OBSERVATION_DATE_RANGE.minimum);
    expect(
      clampObservationDate(
        new Date("2101-01-01T00:00:00.000Z"),
      ).toISOString(),
    ).toBe(SUPPORTED_OBSERVATION_DATE_RANGE.maximum);
  });

  it("throws a typed error at observation calculation boundaries", () => {
    const unsupported = new Date("2200-01-01T00:00:00.000Z");
    expect(() => assertSupportedObservationDate(unsupported)).toThrow(
      ObservationDateValidationError
    );
    expect(() =>
      equatorialToHorizontal(
        { rightAscension: 0, declination: 0 },
        unsupported,
        { latitude: 0, longitude: 0, timeZone: "UTC" }
      )
    ).toThrow(/between 1900-01-01/);
  });
});
