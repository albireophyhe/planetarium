import { describe, expect, it } from "vitest";
import pointingProfileContract from "../../../../../shared/fixtures/star-pointing-profile-v1-contract.json";
import type { ObserverLocation, StarViewModel } from "../../app/types";
import type { ResolvedTimeScales } from "../../domain";
import {
  buildStarPointingJsonProfile,
  buildStarPointingPayload,
  hasFullPrecisionPointingSnapshot,
  serializeStarPointingJsonProfile,
  type StarPointingPayloadInput,
} from "./starPointingPayload";

const LOCATION: ObserverLocation = {
  heightMeters: 44.5,
  horizontalAccuracyMeters: 3,
  id: "manual",
  latitude: 35.681236,
  locationSource: "manual",
  longitude: 139.767125,
  name: "東京",
  timeZone: "Asia/Tokyo",
};

const STAR: StarViewModel = {
  aliases: [],
  altitudeDeg: 42.1234567,
  annualAberrationMode:
    "truncated-vsop2000-heliocentric-earth",
  apparentDecRad: -0.2196045987,
  apparentRaRad: 3.2940754526,
  annualParallaxMode: "truncated-vsop2000-heliocentric-earth",
  azimuthDefined: true,
  azimuthDeg: 181.9876543,
  calculationModel: "v2",
  catalogName: "Vega",
  constellation: "こと座",
  decRad: 0.6769030684,
  diurnalAberrationMode: "wgs84-observer",
  englishName: "Vega",
  geometricAltitudeDeg: 42.1111114,
  geometricAzimuthDefined: true,
  geometricAzimuthDeg: 181.9999996,
  hd: 172167,
  hr: 7001,
  japaneseName: "ベガ",
  parallaxArcsec: 0.13,
  pmDecArcsecPerYear: 0.286,
  pmRaCosDecArcsecPerYear: 0.201,
  polarMotionMode: "iers-predicted",
  raRad: 4.873565508,
  radialVelocityKmPerSecond: -13.9,
  refractionMode: "applied",
  solarLightDeflectionMode:
    "truncated-vsop2000-heliocentric-earth",
  spaceMotionMode: "three-dimensional",
  vMagnitude: 0.03,
};

const TIME_SCALES: ResolvedTimeScales = {
  dut1Seconds: 0.012345,
  dut1Source: "iers-predicted",
  dut1UncertaintySeconds: 0.00012,
  taiMinusUtcSeconds: 37,
  taiMinusUtcSource: "iers-history",
  ttJulianDate: 2_461_253.625800741,
  utcJulianDate: 2_461_253.625,
  ut1JulianDate: 2_461_253.625000143,
  warnings: [],
};

const STANDARD_ATMOSPHERE = {
  minimumGeometricAltitudeDegrees: 5,
  pressureHpa: 1_013.25,
  relativeHumidity: 0.5,
  temperatureCelsius: 10,
  wavelengthMicrometers: 0.55,
} as const;

const EOP_ESTIMATE = {
  dut1: {
    quality: "mixed" as const,
    reportedErrorSeconds: 0.00012,
    seconds: 0.012345,
    source: "predicted" as const,
  },
  polarMotion: {
    quality: "predicted" as const,
    source: "predicted" as const,
    usesPrediction: true,
    xpRadians: 1e-6,
    xpReportedErrorRadians: 1e-9,
    ypRadians: -2e-6,
    ypReportedErrorRadians: 2e-9,
  },
};

const POLAR_MOTION_SNAPSHOT = {
  mode: "iers-predicted" as const,
  xpRadians: 1e-6,
  xpReportedErrorRadians: 1e-9,
  ypRadians: -2e-6,
  ypReportedErrorRadians: 2e-9,
};

function precisionInput(
  overrides: Partial<StarPointingPayloadInput> = {},
): StarPointingPayloadInput {
  return {
    earthOrientationEstimate: EOP_ESTIMATE,
    earthOrientationSourceIdentifier:
      "IERS finals2000A; sha256=test-eop",
    location: LOCATION,
    observationDate: new Date("2026-07-31T03:00:00.000Z"),
    polarMotionSnapshot: POLAR_MOTION_SNAPSHOT,
    refractionAtmosphere: STANDARD_ATMOSPHERE,
    star: STAR,
    timeScales: TIME_SCALES,
    ...overrides,
  };
}

describe("buildStarPointingPayload", () => {
  it("exports reproducible pointing inputs and distinct horizontal coordinates", () => {
    const payload = buildStarPointingPayload({
      earthOrientationEstimate: {
        dut1: {
          quality: "mixed",
          reportedErrorSeconds: 0.00012,
          seconds: 0.012345,
          source: "predicted",
        },
        polarMotion: {
          quality: "predicted",
          source: "predicted",
          usesPrediction: true,
          xpRadians: 1e-6,
          xpReportedErrorRadians: 1e-9,
          ypRadians: -2e-6,
          ypReportedErrorRadians: 2e-9,
        },
      },
      location: LOCATION,
      observationDate: new Date("2026-07-31T03:00:00.000Z"),
      refractionAtmosphere: STANDARD_ATMOSPHERE,
      star: STAR,
      timeScales: TIME_SCALES,
    });

    expect(payload).toContain("UTC: 2026-07-31T03:00:00.000Z");
    expect(payload).toContain(
      "現地時刻: 2026-07-31 12:00:00 [Asia/Tokyo]",
    );
    expect(payload).toContain(
      "緯度 35.681236° / 経度 139.767125° / WGS84楕円体高 44.5 m",
    );
    expect(payload).toContain("地点由来: 手動入力 / 水平精度 ±3 m");
    expect(payload).toContain("大気差: 標準大気差を適用");
    expect(payload).toContain("幾何高度・方位（真空）: 高度 42.111111°");
    expect(payload).toContain(
      "観測高度・方位（大気差設定反映）: 高度 42.123457°",
    );
    expect(payload).toContain("DUT1: 0.012345 s (iers-predicted)");
    expect(payload).toContain("EOP品質: IERS観測値・予測値の混在");
    expect(payload).toContain("表示桁は計算条件の再現用");
  });

  it("keeps fallback assumptions explicit", () => {
    const payload = buildStarPointingPayload({
      earthOrientationEstimate: null,
      location: LOCATION,
      observationDate: new Date("2026-07-31T03:00:00.000Z"),
      refractionAtmosphere: null,
      star: {
        ...STAR,
        apparentDecRad: null,
        apparentRaRad: null,
        calculationModel: "v1",
      },
      timeScales: null,
    });

    expect(payload).toContain("見かけ赤経・赤緯（観測日）: 利用不可");
    expect(payload).toContain("DUT1 / JD(UT1) / JD(TT): 利用不可");
    expect(payload).toContain(
      "EOP品質: 収録外または未取得（DUT1=0秒・xp/yp=0近似）",
    );
  });

  it("exports the cross-platform versioned precision JSON profile without presentation rounding", () => {
    const input = precisionInput();

    const profile = buildStarPointingJsonProfile(input);

    expect(profile).toMatchObject({
      profileId: "planetarium.precision-pointing.full-v1",
      schemaVersion: 1,
      target: {
        hd: STAR.hd,
        catalogKinematics: {
          spaceMotionMode: "three-dimensional",
        },
      },
      observation: {
        utc: "2026-07-31T03:00:00.000Z",
        timeZone: "Asia/Tokyo",
        location: {
          referenceFrame: "WGS84",
          latitudeDegrees: 35.681236,
          longitudeDegrees: 139.767125,
          heightMeters: 44.5,
        },
      },
      coordinates: {
        catalogJ2000: {
          frame: "FK5",
          origin: "catalog-direction",
          equinox: "J2000.0",
          rightAscensionRadians: STAR.raRad,
          declinationRadians: STAR.decRad,
          units: "radian",
        },
        geocentricApparent: {
          frame: "true-equator-and-equinox-of-date",
          origin: "geocenter",
          rightAscensionRadians: STAR.apparentRaRad,
          declinationRadians: STAR.apparentDecRad,
        },
        vacuumTopocentric: {
          frame: "local-ENU",
          origin: "WGS84-observer",
          altitudeDegrees: STAR.geometricAltitudeDeg,
          azimuthDegrees: STAR.geometricAzimuthDeg,
          azimuthConvention: "north-zero-east-positive",
        },
        observedTopocentric: {
          altitudeDegrees: STAR.altitudeDeg,
          azimuthDegrees: STAR.azimuthDeg,
          refractionMode: "applied",
        },
      },
      timeScales: {
        jdUTC: TIME_SCALES.utcJulianDate,
        jdUT1: TIME_SCALES.ut1JulianDate,
        jdTT: TIME_SCALES.ttJulianDate,
        dut1Seconds: TIME_SCALES.dut1Seconds,
        taiMinusUTCSeconds: TIME_SCALES.taiMinusUtcSeconds,
      },
      earthOrientation: {
        status: "iers",
        sourceIdentifier: "IERS finals2000A; sha256=test-eop",
        xpAppliedRadians: 1e-6,
        ypAppliedRadians: -2e-6,
        dut1ReportedErrorSeconds: 0.00012,
      },
      diagnostics: {
        modelId: "planetarium-precision-v2",
        status: "precision-model-v2",
        refraction: {
          mode: "applied",
          parametersStatus: "configured",
          parameters: {
            inputSource: "standard",
            minimumGeometricAltitudeDegrees: 5,
            pressureHpa: 1_013.25,
            relativeHumidity: 0.5,
            temperatureCelsius: 10,
            wavelengthMicrometers: 0.55,
          },
        },
        models: {
          annualAberrationMode:
            "truncated-vsop2000-heliocentric-earth",
        },
      },
    });
    expect(profile.coordinates.vacuumTopocentric.altitudeDegrees).toBe(
      42.1111114,
    );
    expect(profile.units.azimuth).toBe("degree");
    expect(profile.conventions.azimuth).toMatchObject({
      positiveDirection: "clockwise-toward-east",
      zeroDirection: "true-north",
    });
    expect(
      JSON.parse(serializeStarPointingJsonProfile(input)),
    ).toEqual(profile);
  });

  it("fails closed instead of publishing the precision profile from the simple model", () => {
    const simpleStar: StarViewModel = {
      ...STAR,
      annualAberrationMode: null,
      apparentDecRad: null,
      apparentRaRad: null,
      annualParallaxMode: null,
      calculationModel: "v1",
      diurnalAberrationMode: null,
      parallaxArcsec: null,
      pmDecArcsecPerYear: null,
      pmRaCosDecArcsecPerYear: null,
      polarMotionMode: null,
      radialVelocityKmPerSecond: null,
      refractionMode: null,
      solarLightDeflectionMode: null,
      spaceMotionMode: null,
    };
    const input = {
      earthOrientationEstimate: null,
      location: LOCATION,
      observationDate: new Date("2026-07-31T03:00:00.000Z"),
      refractionAtmosphere: null,
      star: simpleStar,
      timeScales: null,
    } satisfies StarPointingPayloadInput;

    expect(hasFullPrecisionPointingSnapshot(input)).toBe(false);
    expect(() => buildStarPointingJsonProfile(input)).toThrow(
      /complete precision-v2 render snapshot/,
    );
    expect(() => serializeStarPointingJsonProfile(input)).toThrow(
      /complete precision-v2 render snapshot/,
    );
  });

  it("does not let an available EOP estimate make a simple-model snapshot exportable", () => {
    const input = {
      earthOrientationEstimate: EOP_ESTIMATE,
      location: LOCATION,
      observationDate: new Date("2026-07-31T03:00:00.000Z"),
      refractionAtmosphere: STANDARD_ATMOSPHERE,
      star: {
        ...STAR,
        annualAberrationMode: null,
        annualParallaxMode: null,
        apparentDecRad: null,
        apparentRaRad: null,
        calculationModel: "v1",
        diurnalAberrationMode: null,
        polarMotionMode: null,
        refractionMode: null,
        solarLightDeflectionMode: null,
        spaceMotionMode: null,
      },
      timeScales: TIME_SCALES,
    } satisfies StarPointingPayloadInput;

    expect(hasFullPrecisionPointingSnapshot(input)).toBe(false);
    expect(() => buildStarPointingJsonProfile(input)).toThrow(
      /complete precision-v2 render snapshot/,
    );
  });

  it("drops inconsistent IERS uncertainty metadata instead of pairing it with the applied DUT1", () => {
    const profile = buildStarPointingJsonProfile(precisionInput({
      timeScales: {
        ...TIME_SCALES,
        dut1UncertaintySeconds:
          (TIME_SCALES.dut1UncertaintySeconds ?? 0) + 0.001,
      },
    }));

    expect(profile.earthOrientation).toMatchObject({
      status: "iers",
      dut1Status:
        "applied-without-matching-estimate-metadata",
      dut1MetadataMatchesAppliedValue: false,
      dut1Quality: null,
      dut1ReportedErrorSeconds: null,
      sourceIdentifier: null,
    });
    expect(profile.earthOrientation.consistencyIssues).toContain(
      "Applied DUT1 does not have a matching IERS estimate snapshot.",
    );
  });

  it("keeps applied polar-motion values but drops mismatched IERS error metadata", () => {
    const profile = buildStarPointingJsonProfile(precisionInput({
      polarMotionSnapshot: {
        ...POLAR_MOTION_SNAPSHOT,
        xpReportedErrorRadians:
          POLAR_MOTION_SNAPSHOT.xpReportedErrorRadians + 1e-9,
      },
    }));

    expect(profile.earthOrientation).toMatchObject({
      status: "iers",
      polarMotionStatus:
        "applied-without-matching-estimate-metadata",
      polarMotionMetadataMatchesAppliedValue: false,
      polarMotionQuality: null,
      sourceIdentifier: null,
      xpAppliedRadians: POLAR_MOTION_SNAPSHOT.xpRadians,
      xpReportedErrorRadians: 2e-9,
    });
    expect(profile.earthOrientation.consistencyIssues).toContain(
      "Applied polar motion does not have a matching IERS estimate snapshot.",
    );
  });

  it("keeps disabled polar motion and refraction unavailable rather than turning them into zero", () => {
    const profile = buildStarPointingJsonProfile(precisionInput({
      earthOrientationEstimate: null,
      earthOrientationSourceIdentifier: null,
      polarMotionSnapshot: {
        mode: "disabled",
        xpRadians: 0,
        xpReportedErrorRadians: null,
        ypRadians: 0,
        ypReportedErrorRadians: null,
      },
      refractionAtmosphere: null,
      star: {
        ...STAR,
        altitudeDeg: STAR.geometricAltitudeDeg,
        azimuthDeg: STAR.geometricAzimuthDeg,
        polarMotionMode: "disabled",
        refractionMode: "disabled",
      },
      timeScales: {
        ...TIME_SCALES,
        dut1Seconds: 0,
        dut1Source: "assumed-zero",
        dut1UncertaintySeconds: null,
      },
    }));

    expect(profile.earthOrientation).toMatchObject({
      status: "partial",
      dut1Status: "assumed-zero",
      appliedDut1Seconds: 0,
      polarMotionStatus: "unavailable",
      xpAppliedRadians: null,
      ypAppliedRadians: null,
    });
    expect(profile.diagnostics.refraction).toEqual({
      description:
        "なし（観測座標は真空幾何座標と同値）",
      mode: "disabled",
      parameters: null,
      parametersStatus: "not-configured",
      status: "refraction-disabled",
    });
  });

  it("reports omissions and warnings from the selected star's actual correction modes", () => {
    const profile = buildStarPointingJsonProfile(precisionInput({
      earthOrientationEstimate: null,
      earthOrientationSourceIdentifier: null,
      polarMotionSnapshot: {
        mode: "assumed-zero",
        xpRadians: 0,
        xpReportedErrorRadians: null,
        ypRadians: 0,
        ypReportedErrorRadians: null,
      },
      refractionAtmosphere: null,
      star: {
        ...STAR,
        annualAberrationMode: "disabled",
        annualParallaxMode: "unavailable",
        diurnalAberrationMode: "disabled",
        parallaxArcsec: null,
        pmDecArcsecPerYear: null,
        pmRaCosDecArcsecPerYear: null,
        polarMotionMode: "assumed-zero",
        radialVelocityKmPerSecond: null,
        refractionMode: "disabled",
        solarLightDeflectionMode: "disabled",
        spaceMotionMode: "none",
      },
      timeScales: {
        ...TIME_SCALES,
        dut1Seconds: 0,
        dut1Source: "assumed-zero",
        dut1UncertaintySeconds: null,
      },
    }));

    expect(profile.diagnostics.omittedCorrections).toEqual(
      expect.arrayContaining([
        "annual-parallax",
        "stellar-diurnal-parallax",
        "solar-light-deflection",
        "annual-aberration",
        "diurnal-aberration",
        "polar-motion",
      ]),
    );
    expect(profile.diagnostics.warnings).toEqual(
      expect.arrayContaining([
        "proper-motion-missing",
        "annual-parallax-unavailable",
        "solar-light-deflection-disabled",
        "aberration-disabled",
        "diurnal-aberration-disabled",
        "polar-motion-assumed-zero",
        "refraction-disabled",
      ]),
    );
  });

  it("emits zero only when Earth orientation explicitly used the assumed-zero approximation", () => {
    const profile = buildStarPointingJsonProfile(precisionInput({
      earthOrientationEstimate: null,
      earthOrientationSourceIdentifier: null,
      polarMotionSnapshot: {
        mode: "assumed-zero",
        xpRadians: 0,
        xpReportedErrorRadians: null,
        ypRadians: 0,
        ypReportedErrorRadians: null,
      },
      refractionAtmosphere: STANDARD_ATMOSPHERE,
      star: {
        ...STAR,
        polarMotionMode: "assumed-zero",
      },
      timeScales: {
        ...TIME_SCALES,
        dut1Seconds: 0,
        dut1Source: "assumed-zero",
        dut1UncertaintySeconds: null,
      },
    }));

    expect(profile.earthOrientation).toMatchObject({
      status: "assumed-zero",
      appliedDut1Seconds: 0,
      dut1Status: "assumed-zero",
      polarMotionStatus: "assumed-zero",
      xpAppliedRadians: 0,
      ypAppliedRadians: 0,
    });
  });

  it("keeps emitted shared enum and omission tokens inside the cross-platform v1 contract", () => {
    const profile = buildStarPointingJsonProfile(precisionInput());

    expect(
      pointingProfileContract.catalogKinematicsStatuses,
    ).toContain(profile.target.catalogKinematics.status);
    expect(
      pointingProfileContract.earthOrientationStatuses,
    ).toContain(profile.earthOrientation.status);
    expect(
      pointingProfileContract.dut1Statuses,
    ).toContain(profile.earthOrientation.dut1Status);
    expect(
      pointingProfileContract.polarMotionStatuses,
    ).toContain(profile.earthOrientation.polarMotionStatus);
    for (const token of profile.diagnostics.omittedCorrections) {
      expect(
        pointingProfileContract.omittedCorrectionTokens,
      ).toContain(token);
    }
  });
});
