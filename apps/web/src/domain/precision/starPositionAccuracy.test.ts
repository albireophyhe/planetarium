import { describe, expect, it } from "vitest";
import catalog from "../../../../../shared/catalog/bright-stars.v2.json";
import fixtures from "../../../../../shared/fixtures/astro-test-vectors.v2.json";
import { lookupIersEarthOrientation } from "../earthOrientationDataLoader";
import type { IersEarthOrientationEstimateV1 } from "../earthOrientation";
import { precisionStarByHR } from "../precisionData";
import {
  calculateApparentStarPositionV2,
  greenwichApparentSiderealTime2006B,
  resolveTimeScales,
} from "./index";
import type { Vector3 } from "./vector";

const RADIANS_TO_MILLIARCSECONDS =
  (180 * 3_600_000) / Math.PI;
const RADIANS_TO_ARCSECONDS = (180 * 3_600) / Math.PI;
const SIDEREAL_ARCSECONDS_PER_UT1_SECOND =
  15 * 1.0027378119113546;

function wrappedAngleDifference(left: number, right: number): number {
  return (
    ((left - right + Math.PI) % (2 * Math.PI) +
      2 * Math.PI) %
      (2 * Math.PI) -
    Math.PI
  );
}

function sphericalSeparation(
  rightAscensionA: number,
  declinationA: number,
  rightAscensionB: number,
  declinationB: number,
): number {
  const cosineA = Math.cos(declinationA);
  const cosineB = Math.cos(declinationB);
  const first: Vector3 = [
    cosineA * Math.cos(rightAscensionA),
    cosineA * Math.sin(rightAscensionA),
    Math.sin(declinationA),
  ];
  const second: Vector3 = [
    cosineB * Math.cos(rightAscensionB),
    cosineB * Math.sin(rightAscensionB),
    Math.sin(declinationB),
  ];
  const cross: Vector3 = [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
  return Math.atan2(
    Math.hypot(cross[0], cross[1], cross[2]),
    first[0] * second[0] +
      first[1] * second[1] +
      first[2] * second[2],
  );
}

function vector3(values: readonly number[]): Vector3 {
  if (values.length !== 3) {
    throw new Error(`Expected 3 vector components, received ${values.length}`);
  }
  return [values[0]!, values[1]!, values[2]!];
}

function eopReportedErrorEnvelopeArcseconds(
  estimate: IersEarthOrientationEstimateV1,
): number {
  return (
    estimate.dut1.reportedErrorSeconds *
      SIDEREAL_ARCSECONDS_PER_UT1_SECOND +
    estimate.polarMotion.xpReportedErrorRadians *
      RADIANS_TO_ARCSECONDS +
    estimate.polarMotion.ypReportedErrorRadians *
      RADIANS_TO_ARCSECONDS
  );
}

describe("star-position accuracy budget", () => {
  it("keeps the composed star pipeline within milliarcseconds of the SOFA oracle", () => {
    let maximumAstrometric = 0;
    let maximumApparent = 0;
    let maximumSidereal = 0;
    let maximumHorizontal = 0;

    for (const vector of fixtures.composedApparentPositions) {
      const star = precisionStarByHR.get(vector.starHR);
      if (!star) {
        throw new Error(`Missing fixture star HR ${vector.starHR}`);
      }
      const result = calculateApparentStarPositionV2(
        star,
        new Date(vector.iso),
        vector.location,
        {
          earthOrientation: vector.earthOrientation,
          annualParallax: false,
          solarLightDeflection: false,
          aberration: {
            observerBarycentricVelocityC:
              vector3(
                vector.aberration.observerBarycentricVelocityC,
              ),
            sunObserverDistanceAu:
              vector.aberration.sunObserverDistanceAu,
          },
          diurnalAberration: false,
          refraction: false,
        },
      );
      const timeScales = resolveTimeScales(
        new Date(vector.iso),
        vector.earthOrientation,
      );
      const sidereal = greenwichApparentSiderealTime2006B(
        timeScales.ut1JulianDate,
        timeScales.ttJulianDate,
      );

      maximumAstrometric = Math.max(
        maximumAstrometric,
        sphericalSeparation(
          result.astrometricJ2000.rightAscension,
          result.astrometricJ2000.declination,
          vector.expected.astrometricRightAscension,
          vector.expected.astrometricDeclination,
        ) * RADIANS_TO_MILLIARCSECONDS,
      );
      maximumApparent = Math.max(
        maximumApparent,
        sphericalSeparation(
          result.apparentEquatorial.rightAscension,
          result.apparentEquatorial.declination,
          vector.expected.apparentRightAscension,
          vector.expected.apparentDeclination,
        ) * RADIANS_TO_MILLIARCSECONDS,
      );
      maximumSidereal = Math.max(
        maximumSidereal,
        Math.abs(
          wrappedAngleDifference(
            sidereal,
            vector.expected.greenwichApparentSiderealTime,
          ),
        ) * RADIANS_TO_MILLIARCSECONDS,
      );
      maximumHorizontal = Math.max(
        maximumHorizontal,
        sphericalSeparation(
          result.geometricHorizontal.azimuth,
          result.geometricHorizontal.altitude,
          vector.expected.azimuth,
          vector.expected.altitude,
        ) * RADIANS_TO_MILLIARCSECONDS,
      );
    }

    // Current maxima are 0.003831 mas astrometric, 0.003833 mas
    // apparent, 2.5683 mas sidereal, and 2.4192 mas horizontal.
    expect(maximumAstrometric).toBeLessThanOrEqual(0.005);
    expect(maximumApparent).toBeLessThanOrEqual(0.005);
    expect(maximumSidereal).toBeLessThanOrEqual(2.65);
    expect(maximumHorizontal).toBeLessThanOrEqual(2.5);
  });

  it("locks the input granularity that limits catalog-only claims", () => {
    expect(catalog.astrometry.catalogCoordinateResolution).toEqual({
      rightAscension: "0.1 second of time",
      declination: "1 arcsecond",
    });
    expect(catalog.stars).toHaveLength(8_404);
  });

  it("locks the current bundled EOP reported-error envelope", async () => {
    const estimateAtMidnight = await lookupIersEarthOrientation(
      new Date("2026-07-30T00:00:00.000Z"),
    );
    const estimateAtNoon = await lookupIersEarthOrientation(
      new Date("2026-07-30T12:00:00.000Z"),
    );
    const estimateAtCoverageEnd = await lookupIersEarthOrientation(
      new Date("2027-07-31T00:00:00.000Z"),
    );
    if (
      !estimateAtMidnight ||
      !estimateAtNoon ||
      !estimateAtCoverageEnd
    ) {
      throw new Error("Missing bundled EOP for MJD 61251");
    }

    const xpReportedErrorArcseconds =
      estimateAtMidnight.polarMotion.xpReportedErrorRadians *
      RADIANS_TO_ARCSECONDS;
    const ypReportedErrorArcseconds =
      estimateAtMidnight.polarMotion.ypReportedErrorRadians *
      RADIANS_TO_ARCSECONDS;
    const conservativeEnvelopeArcseconds =
      eopReportedErrorEnvelopeArcseconds(estimateAtMidnight);
    const interpolatedEnvelopeArcseconds =
      eopReportedErrorEnvelopeArcseconds(estimateAtNoon);
    const coverageEndEnvelopeArcseconds =
      eopReportedErrorEnvelopeArcseconds(estimateAtCoverageEnd);

    expect(estimateAtMidnight.dut1.source).toBe("predicted");
    expect(estimateAtMidnight.polarMotion.source).toBe("predicted");
    expect(estimateAtMidnight.dut1.reportedErrorSeconds).toBe(
      0.000701,
    );
    expect(xpReportedErrorArcseconds).toBeCloseTo(0.001819, 12);
    expect(ypReportedErrorArcseconds).toBeCloseTo(0.001624, 12);
    // The source does not define a confidence level or covariance, so this
    // is a linear reported-error envelope rather than a statistical sigma.
    expect(conservativeEnvelopeArcseconds).toBeCloseTo(
      0.013986788,
      8,
    );
    expect(conservativeEnvelopeArcseconds).toBeLessThan(0.014);
    expect(interpolatedEnvelopeArcseconds).toBeCloseTo(
      0.015775238,
      8,
    );
    expect(interpolatedEnvelopeArcseconds).toBeLessThan(0.016);
    expect(coverageEndEnvelopeArcseconds).toBeCloseTo(
      0.428165517,
      8,
    );
  });
});
