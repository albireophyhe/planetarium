import { describe, expect, it } from "vitest";
import {
  loadIersEarthOrientationSnapshot,
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
      lastSampleMjdUtc: 61_624,
      recordCount: 19_941,
      polarMotion: {
        iersThroughMjdUtc: 61_251,
        predictionStartsMjdUtc: 61_252,
        iersCount: 19_568,
        predictedCount: 373
      },
      dut1: {
        iersThroughMjdUtc: 61_251,
        predictionStartsMjdUtc: 61_252,
        iersCount: 19_568,
        predictedCount: 373,
        leapSecondBoundaryCount: 25
      }
    });
    expect(service.source.sourceSha256).toBe(
      "4b828090fc94114168014b61439fa5e6ec0bdfda518075a32baffea90110954d"
    );
  });

  it("returns exact official xp, yp, DUT1 and reported errors", async () => {
    const estimate = await lookupIersEarthOrientation(
      dateFromMjd(41_684)
    );

    expect(estimate?.dut1).toEqual({
      seconds: 0.808418,
      reportedErrorSeconds: 0.000271,
      source: "observed",
      quality: "observed"
    });
    expect(estimate?.polarMotion).toEqual({
      xpRadians: 0.120733 * ARCSECONDS_TO_RADIANS,
      ypRadians: 0.136966 * ARCSECONDS_TO_RADIANS,
      xpReportedErrorRadians:
        0.009786 * ARCSECONDS_TO_RADIANS,
      ypReportedErrorRadians:
        0.015902 * ARCSECONDS_TO_RADIANS,
      source: "observed",
      usesPrediction: false,
      quality: "observed"
    });
  });

  it("uses conservative prediction provenance at the I/P boundary", async () => {
    const coverage =
      (await loadIersEarthOrientationService()).coverage;
    const observedThrough =
      coverage.dut1.iersThroughMjdUtc;
    const predictionStarts =
      coverage.dut1.predictionStartsMjdUtc;
    expect(coverage.polarMotion.iersThroughMjdUtc).toBe(
      observedThrough
    );
    expect(coverage.polarMotion.predictionStartsMjdUtc).toBe(
      predictionStarts
    );

    const exactObserved = await lookupIersEarthOrientation(
      dateFromMjd(observedThrough)
    );
    const interpolated = await lookupIersEarthOrientation(
      dateFromMjd(observedThrough + 0.5)
    );
    const exactPredicted = await lookupIersEarthOrientation(
      dateFromMjd(predictionStarts)
    );

    expect(exactObserved?.dut1.source).toBe("observed");
    expect(exactObserved?.polarMotion.source).toBe("observed");
    expect(interpolated?.dut1.source).toBe("predicted");
    expect(interpolated?.polarMotion.source).toBe("predicted");
    expect(interpolated?.dut1.quality).toBe("mixed");
    expect(interpolated?.polarMotion.quality).toBe("mixed");
    expect(
      interpolated?.polarMotion.usesPrediction
    ).toBe(true);
    expect(exactPredicted?.dut1.source).toBe("predicted");
    expect(exactPredicted?.polarMotion.source).toBe("predicted");
  });

  it("fails closed outside the last exact sample", async () => {
    const coverage =
      (await loadIersEarthOrientationService()).coverage;
    expect(
      await lookupIersEarthOrientation(
        dateFromMjd(coverage.firstSampleMjdUtc - 0.001)
      )
    ).toBeNull();
    expect(
      await lookupIersEarthOrientation(
        dateFromMjd(coverage.lastSampleMjdUtc)
      )
    ).not.toBeNull();
    expect(
      await lookupIersEarthOrientation(
        dateFromMjd(coverage.lastSampleMjdUtc + 0.001)
      )
    ).toBeNull();
  });

  it("loads a real chunk-boundary interval for synchronous lookup", async () => {
    const start = dateFromMjd(45_779.75);
    const end = dateFromMjd(45_780.25);
    const snapshot = await loadIersEarthOrientationSnapshot(
      start,
      end
    );

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.sourceSha256).toBe(
      (await loadIersEarthOrientationService()).source.sourceSha256
    );
    expect(snapshot.retrievedAt).toBe(
      (await loadIersEarthOrientationService()).source.retrievedAt
    );
    expect(
      snapshot.lookup(dateFromMjd(45_779.9))
    ).toEqual(
      await lookupIersEarthOrientation(dateFromMjd(45_779.9))
    );
    expect(
      snapshot.lookup(dateFromMjd(45_780.1))
    ).toEqual(
      await lookupIersEarthOrientation(dateFromMjd(45_780.1))
    );
    expect(snapshot.lookup(dateFromMjd(45_779.7))).toBeNull();
    expect(snapshot.lookup(dateFromMjd(45_780.3))).toBeNull();
  });
});
