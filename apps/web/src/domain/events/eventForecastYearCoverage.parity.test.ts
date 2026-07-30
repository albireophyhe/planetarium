import { describe, expect, it } from "vitest";
import fixtureJson from "../../../../../shared/fixtures/event-forecast-year-coverage.v1.json";
import {
  EVENT_FORECAST_SAFE_END_UTC,
  EVENT_FORECAST_SAFE_START_UTC,
  eventForecastYearCoverageGap,
} from "./eventForecastYearCoverage";

type Fixture = {
  readonly schemaVersion: 1;
  readonly safeReceptionCoverage: {
    readonly startUtc: string;
    readonly endUtc: string;
    readonly interval: "closed";
  };
  readonly cases: readonly {
    readonly id: string;
    readonly year: number;
    readonly utcOffsetSecondsAtYearStart: number;
    readonly utcOffsetSecondsAtNextYearStart: number;
    readonly expected: null | {
      readonly edge: "local-year-start" | "local-year-end";
      readonly resourceBoundaryUtc: string;
      readonly missingDurationMilliseconds: number;
      readonly approximateMinutes: number;
    };
  }[];
};

const fixture = fixtureJson as Fixture;

describe("event forecast local-year coverage parity", () => {
  it("matches the shared edge-year fixture", () => {
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.safeReceptionCoverage).toEqual({
      endUtc: EVENT_FORECAST_SAFE_END_UTC,
      interval: "closed",
      startUtc: EVENT_FORECAST_SAFE_START_UTC,
    });

    for (const vector of fixture.cases) {
      const actual = eventForecastYearCoverageGap(
        vector.year,
        vector.utcOffsetSecondsAtYearStart,
        vector.utcOffsetSecondsAtNextYearStart,
      );
      expect(
        actual
          ? {
              approximateMinutes: actual.approximateMinutes,
              edge: actual.edge,
              missingDurationMilliseconds:
                actual.missingDurationMilliseconds,
              resourceBoundaryUtc:
                actual.resourceBoundaryUtc.toISOString(),
            }
          : null,
        vector.id,
      ).toEqual(vector.expected);
    }
  });

  it("rejects unsupported years and offsets", () => {
    expect(() =>
      eventForecastYearCoverageGap(1899, 0, 0),
    ).toThrow(RangeError);
    expect(() =>
      eventForecastYearCoverageGap(2101, 0, 0),
    ).toThrow(RangeError);
    expect(() =>
      eventForecastYearCoverageGap(1900, 14 * 60 * 60 + 1, 0),
    ).toThrow(RangeError);
    expect(() =>
      eventForecastYearCoverageGap(2100, 0, -12 * 60 * 60 - 1),
    ).toThrow(RangeError);
  });
});
