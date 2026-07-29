import type {
  Dut1Estimate,
  IersDut1ServiceV1,
} from "./dut1";
import {
  loadIersEarthOrientationService,
  lookupIersEarthOrientation,
} from "./earthOrientationDataLoader";

let servicePromise: Promise<IersDut1ServiceV1> | undefined;

/**
 * Load the small IERS manifest. Daily values remain in independent chunks and
 * are fetched from the app bundle only when a requested date needs them.
 */
export function loadIersDut1Service(): Promise<IersDut1ServiceV1> {
  servicePromise ??= loadIersEarthOrientationService()
    .then((service) =>
      Object.freeze({
        coverage: Object.freeze({
          firstMjdUtc: service.coverage.firstSampleMjdUtc,
          lastMjdUtc: service.coverage.lastSampleMjdUtc,
          observedThroughMjdUtc:
            service.coverage.dut1.iersThroughMjdUtc,
          predictionStartsMjdUtc:
            service.coverage.dut1.predictionStartsMjdUtc,
          recordCount: service.coverage.recordCount,
          observedCount: service.coverage.dut1.iersCount,
          predictedCount: service.coverage.dut1.predictedCount,
          missingUt1TailRows:
            service.coverage.dut1.missingTailRows,
          leapSecondBoundaryCount:
            service.coverage.dut1.leapSecondBoundaryCount,
        }),
        source: service.source,
        lookup: lookupIersDut1,
      }),
    )
    .catch((error: unknown) => {
      servicePromise = undefined;
      throw error;
    });
  return servicePromise;
}

export async function lookupIersDut1(
  date: Date,
): Promise<Dut1Estimate | null> {
  const estimate = await lookupIersEarthOrientation(date);
  return estimate
    ? Object.freeze({
        dut1Seconds: estimate.dut1.seconds,
        source: estimate.dut1.source,
        uncertaintySeconds:
          estimate.dut1.reportedErrorSeconds,
      })
    : null;
}
