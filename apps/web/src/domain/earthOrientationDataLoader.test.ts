import { describe, expect, it } from "vitest";
import {
  loadIersEarthOrientationService,
  lookupIersEarthOrientation
} from "./earthOrientationDataLoader";

const MILLISECONDS_PER_DAY = 86_400_000;
const UNIX_EPOCH_MJD = 40_587;
const ARCSECONDS_TO_RADIANS = Math.PI / (180 * 3_600);

function dateFromMjd(mjd: number): Date {
  return new Date(
    (mjd - UNIX_EPOCH_MJD) * MILLISECONDS_PER_DAY
  );
}

describe("bundled integrated IERS Earth-orientation service", () => {
  it("loads once and exposes immutable independent coverage", async () => {
    const first = loadIersEarthOrientationService();
    const second = loadIersEarthOrientationService();
    expect(first).toBe(second);

    const service = await first;
    expect(Object.isFrozen(service)).toBe(true);
    expect(Object.isFrozen(service.coverage)).toBe(true);
    expect(Object.isFrozen(service.coverage.polarMotion)).toBe(true);
    expect(Object.isFrozen(service.coverage.dut1)).toBe(true);
    expect(service.coverage).toMatchObject({
      firstSampleMjdUtc: 41_684,
      lastSampleMjdUtc: 61_617,
      recordCount: 19_934,
      polarMotion: {
        iersThroughMjdUtc: 61_244,
        predictionStartsMjdUtc: 61_245,
        iersCount: 19_561,
        predictedCount: 373
      },
      dut1: {
        iersThroughMjdUtc: 61_244,
        predictionStartsMjdUtc: 61_245,
        iersCount: 19_561,
        predictedCount: 373,
        leapSecondBoundaryCount: 25
      }
    });
    expect(service.source.sourceSha256).toBe(
      "f707ea5031a467f1a3b2f0645fac2f627095ed0cb41d34c515b495cb81a5a25d"
    );
  });

  it("returns exact official xp, yp, DUT1 and reported errors", async () => {
    const estimate = await lookupIersEarthOrientation(
      dateFromMjd(41_684)
    );

    expect(estimate?.dut1).toEqual({
      seconds: 0.808418,
      reportedErrorSeconds: 0.000271,
      source: "observed"
    });
    expect(estimate?.polarMotion).toEqual({
      xpRadians: 0.120733 * ARCSECONDS_TO_RADIANS,
      ypRadians: 0.136966 * ARCSECONDS_TO_RADIANS,
      xpReportedErrorRadians:
        0.009786 * ARCSECONDS_TO_RADIANS,
      ypReportedErrorRadians:
        0.015902 * ARCSECONDS_TO_RADIANS,
      source: "observed",
      usesPrediction: false
    });
  });

  it("uses conservative prediction provenance at the I/P boundary", async () => {
    const exactObserved = await lookupIersEarthOrientation(
      dateFromMjd(61_244)
    );
    const interpolated = await lookupIersEarthOrientation(
      dateFromMjd(61_244.5)
    );
    const exactPredicted = await lookupIersEarthOrientation(
      dateFromMjd(61_245)
    );

    expect(exactObserved?.dut1.source).toBe("observed");
    expect(exactObserved?.polarMotion.source).toBe("observed");
    expect(interpolated?.dut1.source).toBe("predicted");
    expect(interpolated?.polarMotion.source).toBe("predicted");
    expect(
      interpolated?.polarMotion.usesPrediction
    ).toBe(true);
    expect(exactPredicted?.dut1.source).toBe("predicted");
    expect(exactPredicted?.polarMotion.source).toBe("predicted");
  });

  it("fails closed outside the last exact sample", async () => {
    expect(
      await lookupIersEarthOrientation(dateFromMjd(41_683.999))
    ).toBeNull();
    expect(
      await lookupIersEarthOrientation(dateFromMjd(61_617))
    ).not.toBeNull();
    expect(
      await lookupIersEarthOrientation(dateFromMjd(61_617.001))
    ).toBeNull();
  });
});
