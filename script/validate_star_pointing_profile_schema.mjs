import { readFile } from "node:fs/promises";

import {
  formatStarPointingProfileErrors,
  validateStarPointingProfile
} from "./validate_star_pointing_profile.mjs";

function webProfile() {
  return {
    schemaVersion: 1,
    profileId: "planetarium.precision-pointing.full-v1",
    target: {
      catalog: "BSC5P",
      hd: 172_167,
      hr: 7_001,
      catalogName: "3Alp Lyr",
      nameJapanese: "ベガ",
      nameEnglish: "Vega",
      aliases: ["Alpha Lyrae"],
      constellation: "Lyr",
      visualMagnitude: 0.03,
      catalogKinematics: {
        status: "three-dimensional",
        spaceMotionMode: "three-dimensional",
        properMotionStatus: "applied",
        properMotionRaCosDecArcsecondsPerYear: 0.201,
        properMotionDecArcsecondsPerYear: 0.286,
        parallaxArcseconds: 0.13,
        parallaxStatus: "applied",
        radialVelocityKilometersPerSecond: -13.9,
        radialVelocityStatus: "applied"
      }
    },
    observation: {
      utc: "2026-07-31T03:00:00.000Z",
      timeZone: "Asia/Tokyo",
      localDateTime: "2026-07-31T12:00:00",
      location: {
        status: "available",
        referenceFrame: "WGS84",
        latitudeDegrees: 35.681236,
        longitudeDegrees: 139.767125,
        heightMeters: 44.5,
        name: "東京",
        source: "manual",
        horizontalAccuracyMeters: 3,
        horizontalAccuracyStatus: "available"
      }
    },
    coordinates: {
      catalogJ2000: {
        status: "calculated",
        frame: "FK5",
        origin: "catalog-direction",
        equinox: "J2000.0",
        epoch: "J2000.0",
        units: "radian",
        rightAscensionRadians: 4.873565,
        declinationRadians: 0.676903
      },
      geocentricApparent: {
        status: "calculated",
        frame: "true-equator-and-equinox-of-date",
        origin: "geocenter",
        equinox: "observation-date",
        units: "radian",
        rightAscensionRadians: 4.879,
        declinationRadians: 0.677
      },
      vacuumTopocentric: {
        altitudeDegrees: 42.1111114,
        azimuthDegrees: 181.9999996,
        azimuthStatus: "defined",
        status: "calculated",
        frame: "local-ENU",
        origin: "WGS84-observer",
        units: "degree",
        azimuthConvention: "north-zero-east-positive",
        atmosphere: "vacuum"
      },
      observedTopocentric: {
        altitudeDegrees: 42.1234567,
        azimuthDegrees: 181.9999996,
        azimuthStatus: "defined",
        status: "refraction-applied",
        frame: "local-ENU",
        origin: "WGS84-observer",
        units: "degree",
        azimuthConvention: "north-zero-east-positive",
        refractionMode: "applied"
      }
    },
    timeScales: {
      status: "available",
      jdUTC: 2_461_252.625,
      jdUT1: 2_461_252.625000143,
      jdTT: 2_461_252.625800741,
      dut1Seconds: 0.012345,
      dut1UncertaintySeconds: 0.00012,
      dut1Source: "iers-predicted",
      taiMinusUTCSeconds: 37,
      taiMinusUTCSource: "iers-history"
    },
    earthOrientation: {
      status: "iers",
      sourceIdentifier: "IERS finals2000A; sha256=test-eop",
      sourceIdentifierStatus: "available",
      appliedDut1Seconds: 0.012345,
      dut1Status: "available",
      dut1Source: "iers-predicted",
      dut1Quality: "predicted",
      dut1ReportedErrorSeconds: 0.00012,
      dut1MetadataMatchesAppliedValue: true,
      estimateStatus: "available",
      polarMotionStatus: "available",
      polarMotionSource: "predicted",
      polarMotionQuality: "predicted",
      polarMotionMetadataMatchesAppliedValue: true,
      xpAppliedRadians: 0.000001,
      ypAppliedRadians: -0.000002,
      xpReportedErrorRadians: 1e-9,
      ypReportedErrorRadians: 2e-9,
      usesPrediction: true,
      consistencyIssues: []
    },
    units: {
      rightAscension: "radian",
      declination: "radian",
      altitude: "degree",
      azimuth: "degree",
      polarMotion: "radian",
      properMotion: "arcsecond/year",
      parallax: "arcsecond",
      radialVelocity: "kilometer/second",
      dut1: "second",
      julianDate: "day",
      siteHeight: "meter"
    },
    conventions: {
      azimuth: {
        zeroDirection: "true-north",
        positiveDirection: "clockwise-toward-east",
        rangeDegrees: "[0,360)",
        undefinedRepresentation: null,
        undefinedWhen: "zenith-or-nadir"
      },
      altitude: {
        zeroPlane: "mathematical-horizon",
        positiveDirection: "up",
        rangeDegrees: "[-90,90]"
      },
      longitude: {
        positiveDirection: "east",
        rangeDegrees: "[-180,180]"
      },
      rightAscension: {
        positiveDirection: "east",
        rangeRadians: "[0,2pi)"
      }
    },
    diagnostics: {
      status: "precision-model-v2",
      modelId: "planetarium-precision-v2",
      omittedCorrections: [
        "stellar-diurnal-parallax",
        "planetary-light-deflection",
        "subdaily-polar-motion-tides"
      ],
      refraction: {
        mode: "applied",
        status: "refraction-applied",
        description: "標準大気モデル（真空幾何高度5°以上で適用）",
        parametersStatus: "configured",
        parameters: {
          inputSource: "standard",
          pressureHpa: 1013.25,
          temperatureCelsius: 10,
          relativeHumidity: 0.5,
          wavelengthMicrometers: 0.55,
          minimumGeometricAltitudeDegrees: 5
        }
      },
      timeScaleWarnings: [],
      models: {
        calculationModel: "v2",
        catalogFrame: "J2000.0 FK5",
        frameConnectionModel:
          "SOFA FK5-to-Hipparcos J2000 rotation and spin",
        precessionModel: "IAU 2006 Fukushima-Williams",
        nutationModel: "IAU 2000B 77-term",
        siderealTimeModel:
          "IAU 2006 GMST + IAU 2000B leading equation of equinoxes",
        spaceMotionMode: "three-dimensional",
        radialVelocityAssumedZero: false,
        annualParallaxMode:
          "truncated-vsop2000-heliocentric-earth",
        annualAberrationMode:
          "truncated-vsop2000-heliocentric-earth",
        solarLightDeflectionMode:
          "truncated-vsop2000-heliocentric-earth",
        diurnalAberrationMode: "wgs84-observer",
        polarMotionMode: "iers-predicted",
        refractionMode: "applied"
      },
      approximations: {
        simplifiedPositionModel: false,
        apparentCoordinatesUnavailable: false,
        timeScalesUnavailable: false,
        earthOrientationEstimateUnavailable: false,
        earthOrientationNotApplied: false,
        dut1AssumedZero: false,
        polarMotionAssumedZero: false,
        properMotionMissing: false,
        properMotionUnavailable: false,
        radialVelocityAssumedZero: false,
        approximateEarthEphemeris: true,
        refractionOutsideModelDomain: false,
        refractionParametersUnavailable: false
      },
      warnings: [
        "catalog-fk5-precision-limited",
        "annual-parallax-approximate-ephemeris",
        "solar-light-deflection-approximate-ephemeris",
        "aberration-approximate-ephemeris"
      ],
      precisionStatement:
        "Digits preserve calculation inputs and outputs; they do not guarantee measurement accuracy."
    }
  };
}

function macProfile() {
  return structuredClone(webProfile());
}

function assumedZeroProfile() {
  const profile = webProfile();
  profile.timeScales.status =
    "available-with-assumed-zero-dut1";
  profile.timeScales.dut1Seconds = 0;
  profile.timeScales.dut1UncertaintySeconds = null;
  profile.timeScales.dut1Source = "assumed-zero";
  profile.timeScales.jdUT1 = profile.timeScales.jdUTC;

  profile.earthOrientation = {
    status: "assumed-zero",
    sourceIdentifier: null,
    sourceIdentifierStatus: "unavailable",
    appliedDut1Seconds: 0,
    dut1Status: "assumed-zero",
    dut1Source: "assumed-zero",
    dut1Quality: null,
    dut1ReportedErrorSeconds: null,
    dut1MetadataMatchesAppliedValue: null,
    estimateStatus: "unavailable",
    polarMotionStatus: "assumed-zero",
    polarMotionSource: "assumed-zero",
    polarMotionQuality: null,
    polarMotionMetadataMatchesAppliedValue: null,
    xpAppliedRadians: 0,
    ypAppliedRadians: 0,
    xpReportedErrorRadians: null,
    ypReportedErrorRadians: null,
    usesPrediction: null,
    consistencyIssues: []
  };
  profile.coordinates.observedTopocentric.status =
    "refraction-disabled";
  profile.coordinates.observedTopocentric.refractionMode =
    "disabled";
  profile.coordinates.observedTopocentric.altitudeDegrees =
    profile.coordinates.vacuumTopocentric.altitudeDegrees;
  profile.coordinates.observedTopocentric.azimuthDegrees =
    profile.coordinates.vacuumTopocentric.azimuthDegrees;
  profile.coordinates.observedTopocentric.azimuthStatus =
    profile.coordinates.vacuumTopocentric.azimuthStatus;
  profile.diagnostics.refraction = {
    mode: "disabled",
    status: "refraction-disabled",
    description:
      "なし（観測座標は真空幾何座標と同値）",
    parametersStatus: "not-configured",
    parameters: null
  };
  profile.diagnostics.models.polarMotionMode = "assumed-zero";
  profile.diagnostics.models.refractionMode = "disabled";
  profile.diagnostics.approximations
    .earthOrientationEstimateUnavailable = true;
  profile.diagnostics.approximations.dut1AssumedZero = true;
  profile.diagnostics.approximations.polarMotionAssumedZero = true;
  profile.diagnostics.warnings.push(
    "dut1-assumed-zero",
    "polar-motion-assumed-zero",
    "refraction-disabled"
  );
  return profile;
}

function julianDateToleranceProfile() {
  const profile = webProfile();
  const toleratedOffsetDays = 1.9 / 86_400_000;
  profile.timeScales.jdUTC += toleratedOffsetDays;
  profile.timeScales.jdUT1 += toleratedOffsetDays;
  return profile;
}

function unmatchedMetadataProfile() {
  const profile = webProfile();
  profile.earthOrientation.sourceIdentifier = null;
  profile.earthOrientation.sourceIdentifierStatus = "unavailable";
  profile.earthOrientation.estimateStatus = "unavailable";
  profile.earthOrientation.dut1Status =
    "applied-without-matching-estimate-metadata";
  profile.earthOrientation.dut1Quality = null;
  profile.earthOrientation.dut1ReportedErrorSeconds = null;
  profile.earthOrientation.dut1MetadataMatchesAppliedValue = null;
  profile.earthOrientation.polarMotionStatus =
    "applied-without-matching-estimate-metadata";
  profile.earthOrientation.polarMotionQuality = null;
  profile.earthOrientation.polarMotionMetadataMatchesAppliedValue =
    null;
  profile.earthOrientation.consistencyIssues = [
    "Applied DUT1 does not have a matching IERS estimate snapshot.",
    "Applied polar motion does not have a matching IERS estimate snapshot."
  ];
  profile.diagnostics.approximations
    .earthOrientationEstimateUnavailable = true;
  return profile;
}

function assumedZeroRadialVelocityProfile() {
  const profile = webProfile();
  profile.target.catalogKinematics.radialVelocityKilometersPerSecond =
    null;
  profile.target.catalogKinematics.radialVelocityStatus =
    "assumed-zero";
  profile.diagnostics.models.radialVelocityAssumedZero = true;
  profile.diagnostics.approximations.radialVelocityAssumedZero =
    true;
  return profile;
}

async function expectValid(label, profile) {
  const result = await validateStarPointingProfile(profile);
  if (!result.valid) {
    throw new Error(
      `${label}を拒否しました:\n` +
        formatStarPointingProfileErrors(result.errors)
    );
  }
}

async function expectInvalid(label, mutate) {
  const profile = webProfile();
  mutate(profile);
  const result = await validateStarPointingProfile(profile);
  if (result.valid) {
    throw new Error(`${label}を誤って受理しました`);
  }
}

const positiveCases = [
  ["Webの完全精度payload", webProfile()],
  ["macOSの完全精度payload", macProfile()],
  ["assumed-zero fallback payload", assumedZeroProfile()],
  ["UTC/JD UTC許容差内payload", julianDateToleranceProfile()],
  [
    "照合metadataのないapplied EOP payload",
    unmatchedMetadataProfile()
  ],
  [
    "視線速度assumed-zero payload",
    assumedZeroRadialVelocityProfile()
  ]
];
for (const [label, profile] of positiveCases) {
  await expectValid(label, profile);
}

const macProductionFixtureFiles = [
  "star-pointing-profile-v1-macos-iers-standard.json",
  "star-pointing-profile-v1-macos-assumed-zero-disabled.json",
  "star-pointing-profile-v1-macos-manual.json",
  "star-pointing-profile-v1-macos-below-domain-missing-kinematics.json"
];
for (const file of macProductionFixtureFiles) {
  const profile = JSON.parse(
    await readFile(
      new URL(`../shared/fixtures/${file}`, import.meta.url),
      "utf8"
    )
  );
  await expectValid(`macOS production fixture ${file}`, profile);
}

const negativeCases = [
  [
    "未知のroot property",
    (profile) => {
      profile.unknown = true;
    }
  ],
  [
    "異なるprofile ID",
    (profile) => {
      profile.profileId = "planetarium.precision-pointing.full-v2";
    }
  ],
  [
    "2π以上の赤経",
    (profile) => {
      profile.coordinates.catalogJ2000.rightAscensionRadians =
        2 * Math.PI;
    }
  ],
  [
    "定義済み方位角のnull",
    (profile) => {
      profile.coordinates.vacuumTopocentric.azimuthDegrees = null;
    }
  ],
  [
    "利用不可精度statusと数値の混在",
    (profile) => {
      profile.observation.location.horizontalAccuracyStatus =
        "unavailable";
    }
  ],
  [
    "assumed-zero DUT1の非ゼロ値",
    (profile) => {
      profile.earthOrientation.dut1Status = "assumed-zero";
      profile.earthOrientation.dut1Source = "assumed-zero";
    }
  ],
  [
    "assumed-zero time scaleの非ゼロ値",
    (profile) => {
      profile.timeScales.status =
        "available-with-assumed-zero-dut1";
      profile.timeScales.dut1Source = "assumed-zero";
    }
  ],
  [
    "applied statusとdisabled refraction modeの混在",
    (profile) => {
      profile.coordinates.observedTopocentric.refractionMode =
        "disabled";
    }
  ],
  [
    "標準大気sourceの改変値",
    (profile) => {
      profile.diagnostics.refraction.parameters.pressureHpa = 1000;
    }
  ],
  [
    "大気差parameterの欠落",
    (profile) => {
      delete profile.diagnostics.refraction.parameters
        .relativeHumidity;
    }
  ],
  [
    "未知の警告token",
    (profile) => {
      profile.diagnostics.warnings.push("unknown-warning");
    }
  ],
  [
    "available statusとassumed-zero DUT1 sourceの混在",
    (profile) => {
      profile.timeScales.status = "available";
      profile.timeScales.dut1Seconds = 0;
      profile.timeScales.dut1UncertaintySeconds = null;
      profile.timeScales.dut1Source = "assumed-zero";
      profile.timeScales.jdUT1 = profile.timeScales.jdUTC;
    }
  ],
  [
    "IERS全体statusと利用不可の要素statusの混在",
    (profile) => {
      profile.earthOrientation.dut1Status = "unavailable";
      profile.earthOrientation.polarMotionStatus = "unavailable";
    }
  ],
  [
    "利用可能source statusとnull identifierの混在",
    (profile) => {
      profile.earthOrientation.sourceIdentifier = null;
      profile.earthOrientation.sourceIdentifierStatus = "available";
    }
  ],
  [
    "照合不能metadataとsource identifierの混在",
    (profile) => {
      profile.earthOrientation.dut1Status =
        "applied-without-matching-estimate-metadata";
      profile.earthOrientation.dut1Quality = null;
      profile.earthOrientation.dut1ReportedErrorSeconds = null;
      profile.earthOrientation.dut1MetadataMatchesAppliedValue =
        null;
      profile.earthOrientation.polarMotionStatus =
        "applied-without-matching-estimate-metadata";
      profile.earthOrientation.polarMotionQuality = null;
      profile.earthOrientation
        .polarMotionMetadataMatchesAppliedValue = null;
      profile.earthOrientation.consistencyIssues = [
        "Applied DUT1 does not have a matching IERS estimate snapshot.",
        "Applied polar motion does not have a matching IERS estimate snapshot."
      ];
    }
  ],
  [
    "照合不能statusとconsistency issue欠落の混在",
    (profile) => {
      profile.earthOrientation.sourceIdentifier = null;
      profile.earthOrientation.sourceIdentifierStatus = "unavailable";
      profile.earthOrientation.dut1Status =
        "applied-without-matching-estimate-metadata";
      profile.earthOrientation.dut1Quality = null;
      profile.earthOrientation.dut1ReportedErrorSeconds = null;
      profile.earthOrientation.dut1MetadataMatchesAppliedValue =
        null;
    }
  ],
  [
    "IERS適用とassumed-zero診断flagの混在",
    (profile) => {
      profile.diagnostics.approximations.dut1AssumedZero = true;
    }
  ],
  [
    "大気差diagnosticsと観測座標の混在",
    (profile) => {
      profile.diagnostics.refraction = {
        mode: "disabled",
        status: "refraction-disabled",
        description: "なし",
        parametersStatus: "not-configured",
        parameters: null
      };
      profile.diagnostics.models.refractionMode = "disabled";
    }
  ],
  [
    "UTCとJD UTCの不一致",
    (profile) => {
      profile.timeScales.jdUTC += 0.01;
    }
  ],
  [
    "JD UT1とDUT1式の不一致",
    (profile) => {
      profile.timeScales.jdUT1 += 0.01;
    }
  ],
  [
    "time zoneとlocal date-timeの不一致",
    (profile) => {
      profile.observation.localDateTime =
        "2026-07-31T12:00:01";
    }
  ],
  [
    "未対応IANA time zone",
    (profile) => {
      profile.observation.timeZone = "Mars/Olympus_Mons";
    }
  ],
  [
    "time scalesとEOP適用DUT1値の不一致",
    (profile) => {
      profile.earthOrientation.appliedDut1Seconds += 0.1;
    }
  ],
  [
    "time scalesとEOP DUT1 sourceの不一致",
    (profile) => {
      profile.earthOrientation.dut1Source = "iers-observed";
    }
  ],
  [
    "大気差diagnosticsとmodelの不一致",
    (profile) => {
      profile.diagnostics.models.refractionMode = "disabled";
    }
  ],
  [
    "大気差modeと近似診断flagの不一致",
    (profile) => {
      profile.diagnostics.approximations
        .refractionOutsideModelDomain = true;
    }
  ],
  [
    "固有運動の近似診断flag間の不一致",
    (profile) => {
      profile.diagnostics.approximations.properMotionMissing =
        true;
    }
  ],
  [
    "視線速度statusと近似診断flagの不一致",
    (profile) => {
      profile.diagnostics.approximations
        .radialVelocityAssumedZero = true;
    }
  ]
];
for (const [label, mutate] of negativeCases) {
  await expectInvalid(label, mutate);
}

console.log(
  "精密導入JSON Schema検証OK: " +
    `${positiveCases.length}合成正例 + ` +
    `${macProductionFixtureFiles.length} macOS実出力 / ` +
    `${negativeCases.length}負例`
);
