import { describe, expect, it } from "vitest";
import { resolveTimeScales } from "../precision";
import {
  EVENT_EOP_ANCHOR_DELTA_T_SECONDS,
  EVENT_EOP_LAST_SAMPLE_UTC,
  de442sLunarAccelerationCorrectionSeconds,
  eventEarthOrientationReportedUncertainty,
  eventEarthRotationFallback,
  nasaDeltaTDecimalYear,
  nasaDeltaTPolynomialSeconds,
} from "./eventEarthRotation";

describe("eventEarthRotationFallback", () => {
  it("keeps IERS reported-error components separate from total event uncertainty", () => {
    const result = eventEarthOrientationReportedUncertainty({
      dut1: {
        reportedErrorSeconds: 0.000_701,
        seconds: 0,
        source: "predicted",
      },
      polarMotion: {
        source: "predicted",
        usesPrediction: true,
        xpRadians: 0,
        xpReportedErrorRadians:
          (0.001_819 * Math.PI) / (180 * 3_600),
        ypRadians: 0,
        ypReportedErrorRadians:
          (0.001_624 * Math.PI) / (180 * 3_600),
      },
    });

    expect(result.dut1ReportedErrorSeconds).toBe(0.000_701);
    expect(result.dut1PathMeters).toBeCloseTo(0.326_036, 5);
    expect(result.polarMotionPathMeters).toBeCloseTo(
      0.106_465,
      5,
    );
    expect(result.combinedPathMeters).toBeCloseTo(
      0.432_501,
      5,
    );
    expect(result.semantics).toBe(
      "iers-reported-error-linear-envelope",
    );
  });

  it("reproduces the NASA historical polynomial at 1900 and 1950", () => {
    const at1900 = eventEarthRotationFallback(
      new Date("1900-01-01T00:00:00Z"),
    );
    const at1950 = eventEarthRotationFallback(
      new Date("1950-01-01T00:00:00Z"),
    );

    expect(at1900.deltaTSeconds).toBeCloseTo(
      -2.745_453_410_866,
      8,
    );
    expect(at1950.deltaTSeconds).toBeCloseTo(
      29.086_807_614_268,
      8,
    );
    expect(at1900.deltaTUncertaintySeconds).toBe(1);
    expect(at1900.assumedTaiMinusUtcSeconds).toBe(0);
    expect(at1900.dut1Seconds).toBeCloseTo(
      34.929_453_410_866,
      8,
    );
    expect(at1900.warnings.join(" ")).toContain("1972年以前");
  });

  it("allows fallback only immediately outside the closed IERS coverage", () => {
    const immediatelyBeforeFirst = new Date(
      "1973-01-01T23:59:59.999Z",
    );
    const firstSample = new Date("1973-01-02T00:00:00.000Z");
    const lastSample = new Date(EVENT_EOP_LAST_SAMPLE_UTC.getTime());
    const immediatelyAfterLast = new Date(
      EVENT_EOP_LAST_SAMPLE_UTC.getTime() + 1,
    );

    expect(
      eventEarthRotationFallback(immediatelyBeforeFirst).eopId,
    ).toBe("outside-IERS-coverage-historical-delta-t-model");
    expect(() =>
      eventEarthRotationFallback(firstSample),
    ).toThrowError(/inside bundled IERS EOP coverage/);
    expect(() =>
      eventEarthRotationFallback(lastSample),
    ).toThrowError(/inside bundled IERS EOP coverage/);
    expect(
      eventEarthRotationFallback(immediatelyAfterLast).eopId,
    ).toBe("outside-IERS-coverage-future-delta-t-model");
  });

  it("anchors future values continuously to the final bundled EOP sample", () => {
    const immediatelyAfter = eventEarthRotationFallback(
      new Date(EVENT_EOP_LAST_SAMPLE_UTC.getTime() + 1),
    );

    expect(immediatelyAfter.deltaTSeconds).toBeCloseTo(
      EVENT_EOP_ANCHOR_DELTA_T_SECONDS,
      6,
    );
    expect(immediatelyAfter.deltaTModel).toContain(
      "anchored-to-IERS",
    );
  });

  it("locks the 2050 and 2100 envelope and path conversion", () => {
    const at2050 = eventEarthRotationFallback(
      new Date("2050-01-01T00:00:00Z"),
    );
    const at2100 = eventEarthRotationFallback(
      new Date("2100-01-01T00:00:00Z"),
    );

    expect(at2050.deltaTSeconds).toBeCloseTo(
      86.261_907_565_724,
      9,
    );
    expect(at2100.deltaTSeconds).toBeCloseTo(
      195.945_273_317_19,
      9,
    );
    expect(at2050.deltaTUncertaintySeconds).toBeCloseTo(
      16.856_265_525_244,
      10,
    );
    expect(at2100.deltaTUncertaintySeconds).toBeCloseTo(
      49.308_650_402_183,
      10,
    );
    expect(at2050.pathUncertaintyKilometers).toBeCloseTo(
      7.839_867_637_683,
      10,
    );
    expect(at2100.pathUncertaintyKilometers).toBeCloseTo(
      22.933_507_541_571,
      10,
    );
    expect(at2100.deltaTUncertaintySeconds).toBeGreaterThan(
      at2050.deltaTUncertaintySeconds,
    );
    expect(at2100.assumedTaiMinusUtcSeconds).toBe(37);
    expect(at2100.dut1Seconds).toBeCloseTo(
      -126.761_273_317_19,
      9,
    );
    expect(at2100.warnings.join(" ")).toContain(
      "TAI−UTC=37秒",
    );
    expect(at2100.warnings.join(" ")).toContain(
      "含みません",
    );
  });

  it("makes TT−UT1 equal the modeled ΔT in the precision pipeline", () => {
    const date = new Date("2100-01-01T00:00:00Z");
    const fallback = eventEarthRotationFallback(date);
    const scales = resolveTimeScales(
      date,
      fallback.earthOrientation,
    );
    const resolvedDeltaTSeconds =
      (scales.ttJulianDate - scales.ut1JulianDate) * 86_400;

    expect(resolvedDeltaTSeconds).toBeCloseTo(
      fallback.deltaTSeconds,
      4,
    );
    expect(scales.taiMinusUtcSeconds).toBe(37);
    expect(scales.dut1Seconds).toBeCloseTo(
      fallback.dut1Seconds,
      9,
    );
  });

  it("uses NASA's published month-centered decimal year convention", () => {
    const date = new Date("2027-07-31T23:59:59Z");
    const decimalYear = nasaDeltaTDecimalYear(date);

    expect(decimalYear).toBeCloseTo(2027 + 6.5 / 12, 12);
    expect(
      nasaDeltaTPolynomialSeconds(decimalYear),
    ).toBeCloseTo(76.032_597_828, 8);
  });

  it("locks every NASA piece boundary on both sides", () => {
    const epsilonYear = 1e-9;
    const fixtures = [
      {
        boundary: 1920,
        before: 21.187_619_999_77,
        at: 21.2,
        after: 21.200_000_000_845,
      },
      {
        boundary: 1941,
        before: 24.772_259_599_581,
        at: 24.773_141_433_749,
        after: 24.773_141_434_329,
      },
      {
        boundary: 1961,
        before: 33.550_262_273_937,
        at: 33.579_880_865_652,
        after: 33.579_880_866_008,
      },
      {
        boundary: 1986,
        before: 54.867_854_938_456,
        at: 54.877_737_538_24,
        after: 54.877_737_538_686,
      },
      {
        boundary: 2005,
        before: 64.720_646_218_49,
        at: 64.670_575,
        after: 64.670_575_000_378,
      },
      {
        boundary: 2050,
        before: 93.000_999_999_119,
        at: 93,
        after: 93.000_000_002_035,
      },
    ] as const;

    for (const fixture of fixtures) {
      expect(
        nasaDeltaTPolynomialSeconds(
          fixture.boundary - epsilonYear,
        ),
      ).toBeCloseTo(fixture.before, 9);
      expect(
        nasaDeltaTPolynomialSeconds(fixture.boundary),
      ).toBeCloseTo(fixture.at, 9);
      expect(
        nasaDeltaTPolynomialSeconds(
          fixture.boundary + epsilonYear,
        ),
      ).toBeCloseTo(fixture.after, 9);
    }
  });

  it("matches NASA's lunar-acceleration conversion for DE442s", () => {
    expect(
      de442sLunarAccelerationCorrectionSeconds(1900),
    ).toBeCloseTo(-0.017_631_539_2, 10);
    expect(
      de442sLunarAccelerationCorrectionSeconds(1980),
    ).toBe(0);
    expect(
      de442sLunarAccelerationCorrectionSeconds(2100),
    ).toBeCloseTo(-0.122_546_483_2, 10);
  });
});
