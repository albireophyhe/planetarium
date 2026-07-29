import { describe, expect, it } from "vitest";
import {
  OBSERVATION_DATE_RANGE_ERROR,
  observationInputRange,
  parseObservationDateInput,
  shiftObservationDate,
} from "./observationTime";

describe("observation time UI safeguards", () => {
  it("provides timezone-local input bounds for the supported instants", () => {
    expect(observationInputRange("UTC")).toEqual({
      maximum: "2100-12-31T23:59",
      minimum: "1900-01-01T00:00",
    });
  });

  it.each([
    ["Europe/Paris", "1900-01-01T00:10", "1900-01-01T00:09"],
    ["Asia/Colombo", "1900-01-01T05:20", "1900-01-01T05:19"],
  ])(
    "ceils the minimum local minute for historical sub-minute offsets in %s",
    (timeZone, expectedMinimum, precedingMinute) => {
      const range = observationInputRange(timeZone);
      expect(range.minimum).toBe(expectedMinimum);

      const minimumResult = parseObservationDateInput(
        range.minimum,
        timeZone,
      );
      expect(minimumResult.ok).toBe(true);
      if (minimumResult.ok) {
        expect(minimumResult.date.getTime()).toBeGreaterThanOrEqual(
          Date.parse("1900-01-01T00:00:00.000Z"),
        );
      }
      expect(
        parseObservationDateInput(precedingMinute, timeZone),
      ).toEqual({
        date: null,
        error: OBSERVATION_DATE_RANGE_ERROR,
        ok: false,
      });
    },
  );

  it("advertises round-trippable bounds in every supported IANA zone", () => {
    for (const timeZone of Intl.supportedValuesOf("timeZone")) {
      const range = observationInputRange(timeZone);
      const minimum = parseObservationDateInput(
        range.minimum,
        timeZone,
      );
      const maximum = parseObservationDateInput(
        range.maximum,
        timeZone,
      );

      expect(minimum, `${timeZone} minimum`).toMatchObject({
        ok: true,
      });
      expect(maximum, `${timeZone} maximum`).toMatchObject({
        ok: true,
      });
    }
  });

  it("rejects a typed date outside the astronomy model range", () => {
    expect(parseObservationDateInput("1899-12-31T23:59", "UTC")).toEqual({
      date: null,
      error: OBSERVATION_DATE_RANGE_ERROR,
      ok: false,
    });
  });

  it.each([
    [
      new Date("1900-01-01T00:30:00.000Z"),
      -1,
      new Date("1900-01-01T00:00:00.000Z"),
      "minimum",
    ],
    [
      new Date("2100-12-31T23:30:00.000Z"),
      1,
      new Date("2100-12-31T23:59:59.999Z"),
      "maximum",
    ],
  ] as const)(
    "clamps a manual step at the %s supported boundary",
    (current, hours, expectedDate, reachedBoundary) => {
      expect(shiftObservationDate(current, hours)).toEqual({
        date: expectedDate,
        error: null,
        ok: true,
        reachedBoundary,
      });
    },
  );
});
