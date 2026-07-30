import { describe, expect, it } from "vitest";
import {
  resolveTimeScales,
  type PrecisionStar,
} from "../precision";
import { unitVectorToEquatorial } from "../precision/vector";
import { calculateApparentBody } from "./apparentBody";
import { ttToTdbJulianDate } from "./eventTime";
import {
  calculateLocalLunarOccultation,
  lunarOccultationBoundaryUncertaintyRadians,
  lunarLimbPositionAngleRadians,
  solveLunarOccultationGeometry,
  type LunarOccultationSample,
} from "./lunarOccultation";
import type {
  EphemerisState,
  ApparentBodyState,
  EventEphemerisProvider,
  EventSummary,
  GeocentricEphemerisState,
} from "./types";

const AU_KILOMETERS = 149_597_870.7;

function normalized(
  direction: readonly [number, number, number],
): readonly [number, number, number] {
  const length = Math.hypot(...direction);
  return [
    direction[0] / length,
    direction[1] / length,
    direction[2] / length,
  ];
}

function moonBody(
  direction: readonly [number, number, number],
  angularRadiusRadians = 0.004,
): ApparentBodyState {
  const unit = normalized(direction);
  return {
    body: "moon",
    tdbJulianDate: 2_460_000,
    lightTimeSeconds: 1.28,
    distanceKilometers: 384_400,
    angularRadiusRadians,
    icrfDirection: unit,
    cirsDirection: unit,
    horizontal: {
      altitude: 0.5,
      azimuth: 2,
      azimuthDefined: true,
    },
  };
}

function syntheticPass(
  centerMilliseconds: number,
  options: {
    readonly rateRadiansPerSecond?: number;
    readonly northOffsetRadians?: number;
    readonly moonRadiusRadians?: number;
  } = {},
): (instantMilliseconds: number) => LunarOccultationSample {
  const rate = options.rateRadiansPerSecond ?? 0.000_002;
  const northOffset = options.northOffsetRadians ?? 0;
  const moonRadius = options.moonRadiusRadians ?? 0.004;
  return (instantMilliseconds) => {
    const seconds =
      (instantMilliseconds - centerMilliseconds) / 1_000;
    return {
      instantMilliseconds,
      moon: moonBody([1, 0, 0], moonRadius),
      target: {
        starHR: 1,
        cirsDirection: normalized([
          1,
          Math.tan(rate * seconds),
          Math.tan(northOffset),
        ]),
        horizontal: {
          altitude: 0.5,
          azimuth: 2,
          azimuthDefined: true,
        },
        precisionWarnings: [],
      },
    };
  };
}

function state(
  positionKilometers: readonly [number, number, number],
  velocityKilometersPerDay: readonly [number, number, number] = [
    0, 0, 0,
  ],
): EphemerisState {
  return { positionKilometers, velocityKilometersPerDay };
}

describe("lunar-occultation geometry", () => {
  it("solves disappearance and reappearance for a known linear pass", () => {
    const center = Date.UTC(2028, 0, 1);
    const result = solveLunarOccultationGeometry(
      center,
      syntheticPass(center),
      {
        halfWindowMilliseconds: 60 * 60 * 1_000,
        scanStepMilliseconds: 60_000,
      },
    );

    expect(result).not.toBeNull();
    expect(result?.boundaryUncertain).toBe(false);
    expect(result?.numericallyTangent).toBe(false);
    expect(result?.limbContacts).toHaveLength(2);
    expect(result?.maximum.instantMilliseconds).toBeCloseTo(
      center,
      -1,
    );
    expect(
      (result?.limbContacts[0]?.instantMilliseconds ?? center) -
        center,
    ).toBeCloseTo(-2_000_000, -2);
    expect(
      (result?.limbContacts[1]?.instantMilliseconds ?? center) -
        center,
    ).toBeCloseTo(2_000_000, -2);
    expect(
      lunarLimbPositionAngleRadians(
        result?.limbContacts[0]?.moon.cirsDirection ?? [1, 0, 0],
        result?.limbContacts[0]?.target.cirsDirection ?? [1, 0, 0],
      ),
    ).toBeCloseTo((3 * Math.PI) / 2, 8);
    expect(
      lunarLimbPositionAngleRadians(
        result?.limbContacts[1]?.moon.cirsDirection ?? [1, 0, 0],
        result?.limbContacts[1]?.target.cirsDirection ?? [1, 0, 0],
      ),
    ).toBeCloseTo(Math.PI / 2, 8);
  });

  it("preserves both contacts in a coverage-clipped asymmetric window", () => {
    const center = Date.UTC(2028, 0, 1);
    const sampledMilliseconds: number[] = [];
    const sample = syntheticPass(center);
    const searchBounds = {
      startUtcMilliseconds: center - 2_500_000,
      endUtcMilliseconds: center + 3_000_000,
    };
    const result = solveLunarOccultationGeometry(
      center,
      (instantMilliseconds) => {
        sampledMilliseconds.push(instantMilliseconds);
        return sample(instantMilliseconds);
      },
      {
        halfWindowMilliseconds: 60 * 60 * 1_000,
        scanStepMilliseconds: 60_000,
        searchBounds,
      },
    );

    expect(result?.boundaryUncertain).toBe(false);
    expect(result?.limbContacts).toHaveLength(2);
    expect(
      result?.limbContacts[0]?.instantMilliseconds,
    ).toBeGreaterThan(searchBounds.startUtcMilliseconds);
    expect(
      result?.limbContacts[1]?.instantMilliseconds,
    ).toBeLessThan(searchBounds.endUtcMilliseconds);
    expect(Math.min(...sampledMilliseconds)).toBeGreaterThanOrEqual(
      searchBounds.startUtcMilliseconds,
    );
    expect(Math.max(...sampledMilliseconds)).toBeLessThanOrEqual(
      searchBounds.endUtcMilliseconds,
    );
  });

  it("returns null for a local miss", () => {
    const center = Date.UTC(2028, 0, 1);
    expect(
      solveLunarOccultationGeometry(
        center,
        syntheticPass(center, {
          northOffsetRadians: 0.01,
        }),
        {
          halfWindowMilliseconds: 60 * 60 * 1_000,
        },
      ),
    ).toBeNull();
  });

  it("keeps numerical tangency separate from the physical band", () => {
    const center = Date.UTC(2028, 0, 1);
    const result = solveLunarOccultationGeometry(
      center,
      syntheticPass(center, {
        northOffsetRadians: 0.004,
      }),
      {
        halfWindowMilliseconds: 60 * 60 * 1_000,
      },
    );

    expect(result?.boundaryUncertain).toBe(true);
    expect(result?.numericallyTangent).toBe(true);
    expect(result?.limbContacts).toHaveLength(1);
    expect(Math.abs(result?.minimumClearanceRadians ?? 1)).toBeLessThan(
      5e-10,
    );
  });

  it("classifies both sides of the physical band conservatively", () => {
    const center = Date.UTC(2028, 0, 1);
    const moonRadius = 0.004;
    const boundaryBand =
      lunarOccultationBoundaryUncertaintyRadians(384_400);
    const solveAtClearance = (clearanceRadians: number) =>
      solveLunarOccultationGeometry(
        center,
        syntheticPass(center, {
          northOffsetRadians: moonRadius + clearanceRadians,
        }),
        {
          halfWindowMilliseconds: 60 * 60 * 1_000,
          scanStepMilliseconds: 60_000,
        },
      );

    const nearMiss = solveAtClearance(0.5 * boundaryBand);
    const shallowMeanLimbHit = solveAtClearance(
      -0.5 * boundaryBand,
    );
    const clearOccultation = solveAtClearance(
      -1.5 * boundaryBand,
    );
    const farMiss = solveAtClearance(1.5 * boundaryBand);

    expect(boundaryBand).toBeGreaterThan(1e-5);
    expect(nearMiss?.boundaryUncertain).toBe(true);
    expect(nearMiss?.numericallyTangent).toBe(false);
    expect(nearMiss?.limbContacts).toHaveLength(1);
    expect(shallowMeanLimbHit?.boundaryUncertain).toBe(true);
    expect(shallowMeanLimbHit?.limbContacts).toHaveLength(1);
    expect(clearOccultation?.boundaryUncertain).toBe(false);
    expect(clearOccultation?.limbContacts).toHaveLength(2);
    expect(farMiss).toBeNull();
  });

  it("adds known observer horizontal accuracy to the band", () => {
    const center = Date.UTC(2028, 0, 1);
    const moonRadius = 0.004;
    const baseBand =
      lunarOccultationBoundaryUncertaintyRadians(384_400);
    const pass = syntheticPass(center, {
      northOffsetRadians: moonRadius + 1.2 * baseBand,
    });

    expect(
      solveLunarOccultationGeometry(center, pass, {
        halfWindowMilliseconds: 60 * 60 * 1_000,
      }),
    ).toBeNull();
    const withKnownAccuracy = solveLunarOccultationGeometry(
      center,
      pass,
      {
        halfWindowMilliseconds: 60 * 60 * 1_000,
        horizontalAccuracyMeters: 5_000,
      },
    );

    expect(withKnownAccuracy?.boundaryUncertain).toBe(true);
    expect(
      withKnownAccuracy?.boundaryUncertaintyRadians ?? 0,
    ).toBeCloseTo(
      lunarOccultationBoundaryUncertaintyRadians(384_400, 5_000),
      12,
    );
  });

  it("adds Earth-rotation path uncertainty to the physical band", () => {
    const center = Date.UTC(2100, 0, 1);
    const moonRadius = 0.004;
    const baseBand =
      lunarOccultationBoundaryUncertaintyRadians(384_400);
    const pass = syntheticPass(center, {
      northOffsetRadians: moonRadius + 1.2 * baseBand,
    });

    expect(
      solveLunarOccultationGeometry(center, pass, {
        halfWindowMilliseconds: 60 * 60 * 1_000,
      }),
    ).toBeNull();
    const withEarthRotation = solveLunarOccultationGeometry(
      center,
      pass,
      {
        earthRotationPathUncertaintyKilometers: 5,
        halfWindowMilliseconds: 60 * 60 * 1_000,
      },
    );

    expect(withEarthRotation?.boundaryUncertain).toBe(true);
    expect(
      withEarthRotation?.boundaryUncertaintyRadians ?? 0,
    ).toBeCloseTo(
      lunarOccultationBoundaryUncertaintyRadians(
        384_400,
        undefined,
        5,
      ),
      12,
    );
  });

  it("resolves the Earth-rotation path envelope at closest approach", () => {
    const candidate = Date.UTC(2100, 0, 1);
    const physicalMaximum = candidate + 60_000;
    const resolvedAt: number[] = [];
    const result = solveLunarOccultationGeometry(
      candidate,
      syntheticPass(physicalMaximum, {
        northOffsetRadians: 0,
      }),
      {
        earthRotationPathUncertaintyKilometersAt: (date) => {
          resolvedAt.push(date.getTime());
          return 0.25;
        },
        halfWindowMilliseconds: 60 * 60 * 1_000,
      },
    );

    expect(result?.earthRotationPathUncertaintyKilometers).toBe(0.25);
    expect(resolvedAt).toHaveLength(1);
    expect(resolvedAt[0]).toBeCloseTo(physicalMaximum, -1);
    expect(Math.abs((resolvedAt[0] ?? 0) - candidate)).toBeGreaterThan(
      50_000,
    );
  });

  it("supports cancellation and rejects non-finite or excessive ranges", () => {
    const center = Date.UTC(2028, 0, 1);
    let calls = 0;
    expect(() =>
      solveLunarOccultationGeometry(
        center,
        syntheticPass(center),
        {
          shouldCancel: () => {
            calls += 1;
            return calls > 3;
          },
        },
      ),
    ).toThrow(/cancelled/);

    expect(() =>
      solveLunarOccultationGeometry(
        Number.NaN,
        syntheticPass(center),
      ),
    ).toThrow(/finite/);
    expect(() =>
      solveLunarOccultationGeometry(
        center,
        syntheticPass(center),
        { halfWindowMilliseconds: 3 * 24 * 60 * 60 * 1_000 },
      ),
    ).toThrow(/out of range/);
    expect(() =>
      solveLunarOccultationGeometry(
        center,
        syntheticPass(center),
        { scanStepMilliseconds: Number.NaN },
      ),
    ).toThrow(/out of range/);
    expect(() =>
      solveLunarOccultationGeometry(
        center,
        (instantMilliseconds) => ({
          ...syntheticPass(center)(instantMilliseconds),
          target: {
            ...syntheticPass(center)(instantMilliseconds).target,
            cirsDirection: [1, Number.NaN, 0],
          },
        }),
      ),
    ).toThrow(/finite/);
  });
});

describe("local lunar-occultation circumstances", () => {
  it("uses the precision-star pipeline and returns reference provenance", () => {
    const candidate = new Date("2000-01-01T12:00:00.000Z");
    const location = {
      latitude: 90,
      longitude: 0,
      timeZone: "UTC",
    };
    const earthOrientation = {
      dut1Seconds: 0,
      dut1Source: "caller" as const,
    };
    const timeScales = resolveTimeScales(
      candidate,
      earthOrientation,
    );
    const centerTdbJulianDate = ttToTdbJulianDate(
      timeScales.ttJulianDate,
    );
    const moonDistanceKilometers = 4_000_000;
    const moonSpeedKilometersPerDay = 1_000_000;
    const ephemeris: EventEphemerisProvider = {
      id: "synthetic-linear-moon",
      sourceSha256: "a".repeat(64),
      stateCoverage: {
        startJulianDateTdb: centerTdbJulianDate - 1,
        endJulianDateTdb: centerTdbJulianDate + 1,
        endIsIncluded: true,
      },
      state(tdbJulianDate: number): GeocentricEphemerisState {
        return {
          tdbJulianDate,
          earthBarycentric: state([0, 0, 0]),
          moonGeocentric: state(
            [
              moonDistanceKilometers,
              moonSpeedKilometersPerDay *
                (tdbJulianDate - centerTdbJulianDate),
              0,
            ],
            [0, moonSpeedKilometersPerDay, 0],
          ),
          sunGeocentric: state([AU_KILOMETERS, 0, 0]),
        };
      },
    };
    const moonAtCenter = calculateApparentBody(
      ephemeris,
      "moon",
      timeScales.ttJulianDate,
      timeScales.ut1JulianDate,
      location,
    );
    const centerCoordinates = unitVectorToEquatorial(
      moonAtCenter.cirsDirection,
    );
    const target: PrecisionStar = {
      hr: 42,
      hd: 42,
      raRad: centerCoordinates.rightAscension,
      decRad: centerCoordinates.declination,
      vMagnitude: 2,
      bvColor: 0,
      catalogName: "Synthetic target",
      spectralType: "A0V",
      pmRaCosDecArcsecPerYear: 0,
      pmDecArcsecPerYear: 0,
      parallaxArcsec: null,
      radialVelocityKmPerSecond: null,
    };
    const event: EventSummary = {
      id: "occultation-test-42",
      kind: "lunar-occultation",
      title: "月による合成恒星の掩蔽",
      canonicalEpochUtc: candidate,
      globalClassification: "occultation",
      targetStarHR: 42,
      dataVersion: "synthetic-v1",
    };
    const earthOrientationDates: number[] = [];
    const earthOrientationProvenanceDates: number[] = [];

    const result = calculateLocalLunarOccultation(
      ephemeris,
      event,
      target,
      location,
      {
        earthOrientation,
        earthOrientationAt: (date) => {
          earthOrientationDates.push(date.getTime());
          return earthOrientation;
        },
        earthOrientationProvenanceAt: (date) => {
          earthOrientationProvenanceDates.push(date.getTime());
          return {
            dut1Quality: "mixed",
            eopRetrievedAt: "2026-07-29T04:05:06.000Z",
            eopSourceSha256: "e".repeat(64),
            polarMotionQuality: "predicted",
          };
        },
        eopId: "synthetic-eop",
        halfWindowMilliseconds: 15 * 60 * 1_000,
        scanStepMilliseconds: 10_000,
        horizontalAccuracyMeters: 5,
        earthRotationPathUncertaintyKilometers: 0.000_465,
        timingUncertaintySeconds: 3,
      },
    );

    expect(result).not.toBeNull();
    expect(
      Math.min(...earthOrientationDates),
    ).toBeLessThan(candidate.getTime());
    expect(
      Math.max(...earthOrientationDates),
    ).toBeGreaterThan(candidate.getTime());
    expect(result?.contacts.map(({ phase }) => phase)).toEqual([
      "occultation-disappearance",
      "maximum",
      "occultation-reappearance",
    ]);
    expect(result?.contacts[0]?.positionAngleRadians).not.toBeNull();
    expect(result?.contacts[2]?.positionAngleRadians).not.toBeNull();
    expect(result?.uncertainty.tier).toBe("reference");
    expect(result?.uncertainty.timingSeconds).toBe(3);
    const moonDistance =
      result?.maximum.bodies.moon?.distanceKilometers ?? 0;
    expect(result?.uncertainty.pathKilometers).toBeCloseTo(
      lunarOccultationBoundaryUncertaintyRadians(
        moonDistance,
        5,
        0.000_465,
      ) * moonDistance,
      9,
    );
    expect(result?.visibility).toBe("below-horizon");
    expect(
      result?.contacts.every(({ aboveHorizon }) => !aboveHorizon),
    ).toBe(true);
    expect(result?.provenance).toMatchObject({
      algorithmVersion:
        "event-occultation-v1-bsc5p-mean-limb-boundary-band",
      dut1Quality: "mixed",
      ephemerisId: "synthetic-linear-moon",
      eopId: "synthetic-eop",
      eopRetrievedAt: "2026-07-29T04:05:06.000Z",
      eopSourceSha256: "e".repeat(64),
      lunarRadiusModel: "mean-spherical-limb",
      limbProfileId: null,
      polarMotionQuality: "predicted",
    });
    expect(earthOrientationProvenanceDates).toEqual([
      result?.maximum.instantUtc.getTime(),
    ]);
    expect(
      result?.uncertainty.dominantContributors.join(" "),
    ).toContain("BSC5P");
    expect(
      result?.uncertainty.dominantContributors.join(" "),
    ).toContain("24.5 m");
    expect(
      result?.uncertainty.dominantContributors.join(" "),
    ).toContain("水平精度を境界帯");
    expect(
      result?.uncertainty.dominantContributors.join(" "),
    ).toContain("地球回転・姿勢モデルの経路幅");
    expect(result?.warnings.join(" ")).toContain("参考予報");
    expect(result?.warnings.join(" ")).toContain("±11 km");
    expect(result?.warnings.join(" ")).toContain("経路±0.47 m");
    expect(result?.warnings.join(" ")).toContain("総経路境界幅");
  });

  it("rejects mismatched targets and invalid uncertainty inputs", () => {
    const event: EventSummary = {
      id: "bad-target",
      kind: "lunar-occultation",
      title: "Bad target",
      canonicalEpochUtc: new Date("2028-01-01T00:00:00Z"),
      globalClassification: "occultation",
      targetStarHR: 1,
      dataVersion: "test",
    };
    const target: PrecisionStar = {
      hr: 2,
      hd: null,
      raRad: 0,
      decRad: 0,
      vMagnitude: 1,
      bvColor: null,
      catalogName: null,
      spectralType: null,
      pmRaCosDecArcsecPerYear: 0,
      pmDecArcsecPerYear: 0,
      parallaxArcsec: null,
      radialVelocityKmPerSecond: null,
    };
    const ephemeris: EventEphemerisProvider = {
      id: "unused",
      sourceSha256: "0".repeat(64),
      stateCoverage: {
        startJulianDateTdb: 2_415_020.5,
        endJulianDateTdb: 2_488_434.5,
        endIsIncluded: true,
      },
      state(tdbJulianDate: number): GeocentricEphemerisState {
        return {
          tdbJulianDate,
          earthBarycentric: state([0, 0, 0]),
          moonGeocentric: state([384_400, 0, 0]),
          sunGeocentric: state([AU_KILOMETERS, 0, 0]),
        };
      },
    };

    expect(() =>
      calculateLocalLunarOccultation(
        ephemeris,
        event,
        target,
        { latitude: 0, longitude: 0, timeZone: "UTC" },
      ),
    ).toThrow(/same HR number/);

    expect(() =>
      calculateLocalLunarOccultation(
        ephemeris,
        { ...event, targetStarHR: 2 },
        target,
        { latitude: 0, longitude: 0, timeZone: "UTC" },
        { horizontalAccuracyMeters: Number.NaN },
      ),
    ).toThrow(/finite and non-negative/);

    expect(() =>
      calculateLocalLunarOccultation(
        ephemeris,
        { ...event, targetStarHR: 2 },
        target,
        { latitude: 0, longitude: 0, timeZone: "UTC" },
        { earthRotationPathUncertaintyKilometers: -1 },
      ),
    ).toThrow(/finite and non-negative/);
  });
});
