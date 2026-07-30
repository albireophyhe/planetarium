import { describe, expect, it } from "vitest";
import fixtureJson from "../../../../../shared/fixtures/event-earth-rotation-model.v1.json";
import {
  eventEarthRotationFallback,
  nasaDeltaTPolynomialSeconds,
} from "./eventEarthRotation";

type FallbackExpected = {
  readonly outcome: "fallback";
  readonly deltaTSeconds: number;
  readonly dut1Seconds: number;
  readonly deltaTUncertaintySeconds: number;
  readonly pathUncertaintyKilometers: number;
  readonly assumedTaiMinusUtcSeconds: number;
  readonly eopId: string;
  readonly deltaTModel: string;
};

type CoverageErrorExpected = {
  readonly outcome: "inside-bundled-eop-coverage-error";
};

type EventEarthRotationFixture = {
  readonly schemaVersion: number;
  readonly bundledEopCoverage: {
    readonly firstSampleUtc: string;
    readonly lastSampleUtc: string;
    readonly interval: "closed";
  };
  readonly tolerances: {
    readonly seconds: number;
    readonly kilometers: number;
    readonly polynomialSeconds: number;
  };
  readonly fallbackCases: readonly {
    readonly id: string;
    readonly observedAtUtc: string;
    readonly expected:
      | FallbackExpected
      | CoverageErrorExpected;
  }[];
  readonly nasaPolynomialBoundaryCases: readonly {
    readonly id: string;
    readonly boundaryDecimalYear: number;
    readonly epsilonYears: number;
    readonly expectedSeconds: {
      readonly before: number;
      readonly at: number;
      readonly after: number;
    };
  }[];
};

const fixture =
  fixtureJson as EventEarthRotationFixture;

describe("event earth-rotation shared parity fixture", () => {
  it("locks fallback results and in-coverage rejection", () => {
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.bundledEopCoverage).toEqual({
      firstSampleUtc: "1973-01-02T00:00:00.000Z",
      lastSampleUtc: "2027-07-31T00:00:00.000Z",
      interval: "closed",
    });
    expect(fixture.fallbackCases.map(({ id }) => id)).toEqual([
      "historical-1900",
      "historical-1950",
      "historical-1955",
      "inside-eop-2005",
      "inside-eop-2026",
      "eop-last-sample-minus-1ms",
      "eop-last-sample",
      "eop-last-sample-plus-1ms",
      "future-2050",
      "future-2100",
    ]);

    for (const vector of fixture.fallbackCases) {
      const date = new Date(vector.observedAtUtc);
      expect(
        Number.isFinite(date.getTime()),
        vector.id,
      ).toBe(true);

      if (
        vector.expected.outcome ===
        "inside-bundled-eop-coverage-error"
      ) {
        expect(
          () => eventEarthRotationFallback(date),
          vector.id,
        ).toThrowError(RangeError);
        continue;
      }

      const actual = eventEarthRotationFallback(date);
      const expected = vector.expected;
      expect(
        Math.abs(
          actual.deltaTSeconds - expected.deltaTSeconds,
        ),
        `${vector.id} ΔT`,
      ).toBeLessThanOrEqual(fixture.tolerances.seconds);
      expect(
        Math.abs(actual.dut1Seconds - expected.dut1Seconds),
        `${vector.id} DUT1`,
      ).toBeLessThanOrEqual(fixture.tolerances.seconds);
      expect(
        Math.abs(
          actual.deltaTUncertaintySeconds -
            expected.deltaTUncertaintySeconds,
        ),
        `${vector.id} ΔT uncertainty`,
      ).toBeLessThanOrEqual(fixture.tolerances.seconds);
      expect(
        Math.abs(
          actual.pathUncertaintyKilometers -
            expected.pathUncertaintyKilometers,
        ),
        `${vector.id} path uncertainty`,
      ).toBeLessThanOrEqual(fixture.tolerances.kilometers);
      expect(actual.assumedTaiMinusUtcSeconds).toBe(
        expected.assumedTaiMinusUtcSeconds,
      );
      expect(actual.eopId).toBe(expected.eopId);
      expect(actual.deltaTModel).toBe(expected.deltaTModel);
    }
  });

  it("locks every NASA polynomial piece boundary", () => {
    expect(
      fixture.nasaPolynomialBoundaryCases.map(({ id }) => id),
    ).toEqual([
      "nasa-piece-1920",
      "nasa-piece-1941",
      "nasa-piece-1961",
      "nasa-piece-1986",
      "nasa-piece-2005",
      "nasa-piece-2050",
    ]);

    for (
      const vector of fixture.nasaPolynomialBoundaryCases
    ) {
      const actual = {
        before: nasaDeltaTPolynomialSeconds(
          vector.boundaryDecimalYear - vector.epsilonYears,
        ),
        at: nasaDeltaTPolynomialSeconds(
          vector.boundaryDecimalYear,
        ),
        after: nasaDeltaTPolynomialSeconds(
          vector.boundaryDecimalYear + vector.epsilonYears,
        ),
      };

      for (
        const side of ["before", "at", "after"] as const
      ) {
        expect(
          Math.abs(
            actual[side] - vector.expectedSeconds[side],
          ),
          `${vector.id} ${side}`,
        ).toBeLessThanOrEqual(
          fixture.tolerances.polynomialSeconds,
        );
      }
    }
  });
});
