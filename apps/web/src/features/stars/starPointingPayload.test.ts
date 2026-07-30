import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import pointingProfileContract from "../../../../../shared/fixtures/star-pointing-profile-v1-contract.json";
import pointingProfileSchema from "../../../../../shared/schema/star-pointing-profile-v1.schema.json";
import type { ObserverLocation, StarViewModel } from "../../app/types";
import {
  greenwichApparentSiderealTime2006B,
  type ResolvedTimeScales,
} from "../../domain";
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

const TWO_PI = 2 * Math.PI;
const SECONDS_PER_SIDEREAL_DAY = 86_400;

function normalizedRadians(radians: number) {
  return ((radians % TWO_PI) + TWO_PI) % TWO_PI;
}

function signedRadians(radians: number) {
  return (
    ((radians + Math.PI) % TWO_PI + TWO_PI) % TWO_PI -
    Math.PI
  );
}

function precisionInputWithSiderealAngles(
  localSiderealSeconds: number,
  hourAngleSeconds: number,
) {
  const localSiderealRadians =
    (localSiderealSeconds / SECONDS_PER_SIDEREAL_DAY) *
    TWO_PI;
  const hourAngleRadians =
    (hourAngleSeconds / SECONDS_PER_SIDEREAL_DAY) *
    TWO_PI;
  const greenwichApparentSiderealTime =
    greenwichApparentSiderealTime2006B(
      TIME_SCALES.ut1JulianDate,
      TIME_SCALES.ttJulianDate,
    );
  const longitudeRadians = signedRadians(
    localSiderealRadians -
      greenwichApparentSiderealTime,
  );

  return precisionInput({
    location: {
      ...LOCATION,
      longitude: (longitudeRadians * 180) / Math.PI,
    },
    star: {
      ...STAR,
      apparentRaRad: normalizedRadians(
        localSiderealRadians - hourAngleRadians,
      ),
    },
  });
}

function timeScalesWithGreenwichSiderealSeconds(
  greenwichSiderealSeconds: number,
): ResolvedTimeScales {
  const target = normalizedRadians(
    (greenwichSiderealSeconds /
      SECONDS_PER_SIDEREAL_DAY) *
      TWO_PI,
  );
  let ut1JulianDate = TIME_SCALES.ut1JulianDate;
  let ttJulianDate = TIME_SCALES.ttJulianDate;
  let utcJulianDate = TIME_SCALES.utcJulianDate;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const current = greenwichApparentSiderealTime2006B(
      ut1JulianDate,
      ttJulianDate,
    );
    const correctionDays =
      signedRadians(target - current) /
      (TWO_PI * 1.0027378119113546);
    ut1JulianDate += correctionDays;
    ttJulianDate += correctionDays;
    utcJulianDate += correctionDays;
  }

  return {
    ...TIME_SCALES,
    ttJulianDate,
    utcJulianDate,
    ut1JulianDate,
  };
}

function precisionInputAtGreenwichSiderealTime(
  greenwichSiderealSeconds: number,
  longitudeDegrees: number,
  apparentRightAscensionSeconds: number,
) {
  return precisionInput({
    location: { ...LOCATION, longitude: longitudeDegrees },
    star: {
      ...STAR,
      apparentRaRad: normalizedRadians(
        (apparentRightAscensionSeconds /
          SECONDS_PER_SIDEREAL_DAY) *
          TWO_PI,
      ),
    },
    timeScales: timeScalesWithGreenwichSiderealSeconds(
      greenwichSiderealSeconds,
    ),
  });
}

function siderealPayloadLines(payload: string) {
  return payload.split("\n").filter(
    (line) =>
      line.startsWith("地方見かけ恒星時") ||
      line.startsWith("地心見かけ時角"),
  );
}

const pointingProfileAjv = new Ajv2020({
  allErrors: true,
  strict: true,
});
addFormats(pointingProfileAjv);
const validatePointingProfile = pointingProfileAjv.compile(
  pointingProfileSchema,
);

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
    refractionInputSource: "standard",
    star: STAR,
    timeScales: TIME_SCALES,
    ...overrides,
  };
}

function expectSchemaValid(input: StarPointingPayloadInput) {
  const profile = JSON.parse(
    serializeStarPointingJsonProfile(input),
  ) as unknown;
  const valid = validatePointingProfile(profile);
  expect(
    valid,
    JSON.stringify(validatePointingProfile.errors, null, 2),
  ).toBe(true);
}

describe("buildStarPointingPayload", () => {
  it.each([
    {
      input: precisionInput(),
      label: "IERS ready / standard refraction",
    },
    {
      input: precisionInput({
        refractionInputSource: "manual",
      }),
      label: "IERS ready / manual refraction",
    },
    {
      input: precisionInput({
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
        refractionInputSource: null,
        star: {
          ...STAR,
          altitudeDeg: STAR.geometricAltitudeDeg,
          azimuthDeg: STAR.geometricAzimuthDeg,
          polarMotionMode: "assumed-zero",
          refractionMode: "disabled",
        },
        timeScales: {
          ...TIME_SCALES,
          dut1Seconds: 0,
          dut1Source: "assumed-zero",
          dut1UncertaintySeconds: null,
        },
      }),
      label: "assumed-zero EOP / disabled refraction",
    },
  ])(
    "keeps the production JSON serializer inside the shared schema: $label",
    ({ input }) => {
      expectSchemaValid(input);
    },
  );

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
      refractionInputSource: "standard",
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
    expect(payload).toContain(
      "1,013.25 hPa・10°C・湿度50%・0.55 µm・高度5°以上",
    );
    expect(payload).toContain("幾何高度・方位（真空）: 高度 42.111111°");
    expect(payload).toContain(
      "観測高度・方位（大気差設定反映）: 高度 42.123457°",
    );
    expect(payload).toContain(
      "地方見かけ恒星時（GAST＋入力東経、極運動前）:",
    );
    expect(payload).toContain(
      "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）:",
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
      refractionInputSource: null,
      star: {
        ...STAR,
        apparentDecRad: null,
        apparentRaRad: null,
        calculationModel: "v1",
      },
      timeScales: null,
    });

    expect(payload).toContain("見かけ赤経・赤緯（観測日）: 利用不可");
    expect(payload).toContain(
      "地方見かけ恒星時（GAST＋入力東経、極運動前）: 利用不可（簡易モデル）",
    );
    expect(payload).toContain(
      "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: 利用不可（簡易モデル）",
    );
    expect(payload).toContain("DUT1 / JD(UT1) / JD(TT): 利用不可");
    expect(payload).toContain(
      "EOP品質: 収録外または未取得（DUT1=0秒・xp/yp=0近似）",
    );
  });

  it.each([
    {
      input: precisionInput({ timeScales: null }),
      label: "time scales are missing",
    },
    {
      input: precisionInput({
        star: { ...STAR, apparentRaRad: null },
      }),
      label: "apparent right ascension is missing",
    },
  ])(
    "does not publish sidereal values when $label",
    ({ input }) => {
      const payload = buildStarPointingPayload(input);

      expect(payload).toContain(
        "地方見かけ恒星時（GAST＋入力東経、極運動前）: 利用不可（時刻尺度または見かけ赤経なし）",
      );
      expect(payload).toContain(
        "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: 利用不可（時刻尺度または見かけ赤経なし）",
      );
    },
  );

  it("formats LAST and signed west-positive apparent hour angle deterministically", () => {
    const payload = buildStarPointingPayload(
      precisionInputWithSiderealAngles(
        5 * 3_600 + 6 * 60 + 7.891,
        1 * 3_600 + 2 * 60 + 3.456,
      ),
    );

    expect(payload).toContain(
      "地方見かけ恒星時（GAST＋入力東経、極運動前）: 05h 06m 07.89s",
    );
    expect(payload).toContain(
      "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: +01h 02m 03.46s",
    );
  });

  it("carries rounded LAST and both signed hour-angle boundaries", () => {
    const roundedPositive = buildStarPointingPayload(
      precisionInputWithSiderealAngles(
        SECONDS_PER_SIDEREAL_DAY - 0.004,
        12 * 3_600 - 0.004,
      ),
    );
    const roundedNegative = buildStarPointingPayload(
      precisionInputWithSiderealAngles(
        0.004,
        -(12 * 3_600 - 0.004),
      ),
    );

    expect(roundedPositive).toContain(
      "地方見かけ恒星時（GAST＋入力東経、極運動前）: 00h 00m 00.00s",
    );
    expect(roundedPositive).toContain(
      "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: −12h 00m 00.00s",
    );
    expect(roundedNegative).toContain(
      "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: −12h 00m 00.00s",
    );
  });

  it("canonicalizes exact antipodes and a rounded negative zero", () => {
    const exactPositivePi = buildStarPointingPayload(
      precisionInputWithSiderealAngles(
        18 * 3_600,
        12 * 3_600,
      ),
    );
    const exactNegativePi = buildStarPointingPayload(
      precisionInputWithSiderealAngles(
        6 * 3_600,
        -12 * 3_600,
      ),
    );
    const roundedNegativeZero = buildStarPointingPayload(
      precisionInputWithSiderealAngles(
        1 * 3_600,
        -0.004,
      ),
    );

    for (const payload of [exactPositivePi, exactNegativePi]) {
      expect(payload).toContain(
        "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: −12h 00m 00.00s",
      );
    }
    expect(roundedNegativeZero).toContain(
      "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: +00h 00m 00.00s",
    );
  });

  it("adds east longitude across 24h and keeps the west-positive hour-angle sign", () => {
    const eastLongitude = buildStarPointingPayload(
      precisionInputAtGreenwichSiderealTime(
        23 * 3_600,
        30,
        23 * 3_600,
      ),
    );
    const reverseHourAngle = buildStarPointingPayload(
      precisionInputAtGreenwichSiderealTime(
        23 * 3_600,
        0,
        1 * 3_600,
      ),
    );

    expect(siderealPayloadLines(eastLongitude)).toEqual([
      "地方見かけ恒星時（GAST＋入力東経、極運動前）: 01h 00m 00.00s",
      "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: +02h 00m 00.00s",
    ]);
    expect(siderealPayloadLines(reverseHourAngle)).toEqual([
      "地方見かけ恒星時（GAST＋入力東経、極運動前）: 23h 00m 00.00s",
      "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: −02h 00m 00.00s",
    ]);
  });

  it("treats east +180 degrees and east -180 degrees as the same meridian", () => {
    const positive = buildStarPointingPayload(
      precisionInputAtGreenwichSiderealTime(
        4 * 3_600,
        180,
        14 * 3_600,
      ),
    );
    const negative = buildStarPointingPayload(
      precisionInputAtGreenwichSiderealTime(
        4 * 3_600,
        -180,
        14 * 3_600,
      ),
    );

    expect(siderealPayloadLines(positive)).toEqual([
      "地方見かけ恒星時（GAST＋入力東経、極運動前）: 16h 00m 00.00s",
      "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: +02h 00m 00.00s",
    ]);
    expect(siderealPayloadLines(negative)).toEqual(
      siderealPayloadLines(positive),
    );
  });

  it("advances LAST and hour angle by one hour per 15 degrees east", () => {
    const atGreenwich = buildStarPointingPayload(
      precisionInputAtGreenwichSiderealTime(
        10 * 3_600,
        0,
        8 * 3_600,
      ),
    );
    const fifteenDegreesEast = buildStarPointingPayload(
      precisionInputAtGreenwichSiderealTime(
        10 * 3_600,
        15,
        8 * 3_600,
      ),
    );

    expect(siderealPayloadLines(atGreenwich)).toEqual([
      "地方見かけ恒星時（GAST＋入力東経、極運動前）: 10h 00m 00.00s",
      "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: +02h 00m 00.00s",
    ]);
    expect(siderealPayloadLines(fifteenDegreesEast)).toEqual([
      "地方見かけ恒星時（GAST＋入力東経、極運動前）: 11h 00m 00.00s",
      "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: +03h 00m 00.00s",
    ]);
  });

  it("keeps scalar LAST and hour angle independent of non-longitude observer inputs", () => {
    const base = precisionInputAtGreenwichSiderealTime(
      10 * 3_600,
      15,
      8 * 3_600,
    );
    const expected = siderealPayloadLines(
      buildStarPointingPayload(base),
    );
    const variants: StarPointingPayloadInput[] = [
      {
        ...base,
        location: {
          ...base.location,
          heightMeters: 2_000,
          latitude: -20,
        },
      },
      {
        ...base,
        earthOrientationEstimate: {
          ...EOP_ESTIMATE,
          polarMotion: {
            ...EOP_ESTIMATE.polarMotion,
            xpRadians: -3e-6,
            ypRadians: 4e-6,
          },
        },
        polarMotionSnapshot: {
          ...POLAR_MOTION_SNAPSHOT,
          xpRadians: -3e-6,
          ypRadians: 4e-6,
        },
      },
      {
        ...base,
        refractionAtmosphere: {
          minimumGeometricAltitudeDegrees: 3,
          pressureHpa: 900,
          relativeHumidity: 0.8,
          temperatureCelsius: 20,
          wavelengthMicrometers: 0.65,
        },
        refractionInputSource: "manual",
      },
    ];

    expect(expected).toEqual([
      "地方見かけ恒星時（GAST＋入力東経、極運動前）: 11h 00m 00.00s",
      "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: +03h 00m 00.00s",
    ]);
    for (const variant of variants) {
      expect(
        siderealPayloadLines(
          buildStarPointingPayload(variant),
        ),
      ).toEqual(expected);
    }
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
          radialVelocityAssumedZero: false,
          spaceMotionMode: "three-dimensional",
        },
        approximations: {
          properMotionMissing: false,
          properMotionUnavailable: false,
          radialVelocityAssumedZero: false,
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

  it("publishes radial-velocity assumed-zero parity in models and approximations", () => {
    const profile = buildStarPointingJsonProfile(precisionInput({
      star: {
        ...STAR,
        radialVelocityKmPerSecond: null,
        spaceMotionMode: "angular-proper-motion",
      },
    }));

    expect(profile.target.catalogKinematics).toMatchObject({
      radialVelocityStatus: "assumed-zero",
      spaceMotionMode: "angular-proper-motion",
    });
    expect(profile.diagnostics.models).toMatchObject({
      radialVelocityAssumedZero: true,
      spaceMotionMode: "angular-proper-motion",
    });
    expect(profile.diagnostics.approximations).toMatchObject({
      properMotionMissing: false,
      properMotionUnavailable: false,
      radialVelocityAssumedZero: true,
    });
  });

  it("preserves an explicit manual source even when its values equal the standard preset", () => {
    const input = precisionInput({
      refractionInputSource: "manual",
    });

    const profile = buildStarPointingJsonProfile(input);

    expect(profile.diagnostics.refraction).toMatchObject({
      description: "手動大気モデル（真空幾何高度5°以上で適用）",
      parameters: {
        inputSource: "manual",
        pressureHpa: STANDARD_ATMOSPHERE.pressureHpa,
      },
    });
    expect(buildStarPointingPayload(input)).toContain(
      "大気差: 手動大気差を適用 / 1,013.25 hPa・10°C・湿度50%・0.55 µm・高度5°以上",
    );
  });

  it("fails closed when the applied atmosphere has no explicit source", () => {
    const input = precisionInput({
      refractionInputSource: null,
    });

    expect(hasFullPrecisionPointingSnapshot(input)).toBe(false);
    expect(() => buildStarPointingJsonProfile(input)).toThrow(
      /complete precision-v2 render snapshot/,
    );
  });

  it("fails closed when a standard source carries non-standard values", () => {
    const input = precisionInput({
      refractionAtmosphere: {
        ...STANDARD_ATMOSPHERE,
        pressureHpa: STANDARD_ATMOSPHERE.pressureHpa - 10,
      },
      refractionInputSource: "standard",
    });

    expect(hasFullPrecisionPointingSnapshot(input)).toBe(false);
    expect(() => buildStarPointingJsonProfile(input)).toThrow(
      /complete precision-v2 render snapshot/,
    );
  });

  it.each([
    {
      label: "out-of-range pressure",
      atmosphere: {
        ...STANDARD_ATMOSPHERE,
        pressureHpa: 1_200,
      },
    },
    {
      label: "non-finite humidity",
      atmosphere: {
        ...STANDARD_ATMOSPHERE,
        relativeHumidity: Number.NaN,
      },
    },
    {
      label: "invalid cutoff",
      atmosphere: {
        ...STANDARD_ATMOSPHERE,
        minimumGeometricAltitudeDegrees: 4,
      },
    },
    {
      label: "singular vapor pressure",
      atmosphere: {
        ...STANDARD_ATMOSPHERE,
        pressureHpa: 1,
        relativeHumidity: 1,
      },
    },
  ])("fails closed for a manual $label", ({ atmosphere }) => {
    const input = precisionInput({
      refractionAtmosphere: atmosphere,
      refractionInputSource: "manual",
    });

    expect(hasFullPrecisionPointingSnapshot(input)).toBe(false);
    expect(() => buildStarPointingJsonProfile(input)).toThrow(
      /complete precision-v2 render snapshot/,
    );
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
      refractionInputSource: null,
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
      refractionInputSource: "standard",
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
      refractionInputSource: null,
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
      refractionInputSource: null,
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
    expect(profile.diagnostics.models).toMatchObject({
      radialVelocityAssumedZero: false,
      spaceMotionMode: "none",
    });
    expect(profile.diagnostics.approximations).toMatchObject({
      properMotionMissing: true,
      properMotionUnavailable: true,
      radialVelocityAssumedZero: false,
    });
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
      refractionInputSource: "standard",
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
    expect(
      pointingProfileContract.refractionInputSources,
    ).toContain(
      profile.diagnostics.refraction.parameters?.inputSource,
    );
    for (const token of profile.diagnostics.omittedCorrections) {
      expect(
        pointingProfileContract.omittedCorrectionTokens,
      ).toContain(token);
    }
  });
});
