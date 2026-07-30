import type {
  ObserverLocation,
  RefractionInputSource,
  StarViewModel,
} from "../../app/types";
import {
  formatAzimuthDegrees,
  formatDeclination,
  formatRightAscension,
  formatSignedDegrees,
} from "../../app/astronomicalFormatting";
import {
  atmosphereValueSummary,
  STANDARD_VISUAL_ATMOSPHERE,
} from "../../app/standardAtmosphere";
import type {
  Atmosphere,
  IersEarthOrientationEstimateV1,
  PolarMotionMode,
  ResolvedTimeScales,
} from "../../domain";
import {
  applyVisualRefractionWithCoefficients,
  formatZonedDateTimeInput,
  greenwichApparentSiderealTime2006B,
  refractionCoefficients,
} from "../../domain";

export type StarPointingPayloadInput = {
  earthOrientationEstimate: IersEarthOrientationEstimateV1 | null;
  earthOrientationSourceIdentifier?: string | null;
  location: ObserverLocation;
  observationDate: Date;
  polarMotionSnapshot?: AppliedPolarMotionSnapshot | null;
  refractionAtmosphere: Atmosphere | null;
  refractionInputSource: RefractionInputSource | null;
  star: StarViewModel;
  timeScales: ResolvedTimeScales | null;
};

export type AppliedPolarMotionSnapshot = Readonly<{
  mode: PolarMotionMode;
  xpRadians: number;
  xpReportedErrorRadians: number | null;
  ypRadians: number;
  ypReportedErrorRadians: number | null;
}>;

export const STAR_POINTING_PROFILE_ID =
  "planetarium.precision-pointing.full-v1";
export const STAR_POINTING_PROFILE_SCHEMA_VERSION = 1;

const TWO_PI = 2 * Math.PI;
const SECONDS_PER_SIDEREAL_DAY = 86_400;
const SECONDS_PER_HOUR = 3_600;

function normalizeSignedRadians(radians: number) {
  return (
    ((radians + Math.PI) % TWO_PI + TWO_PI) % TWO_PI -
    Math.PI
  );
}

function formatSignedHourAngle(
  radians: number,
  fractionDigits = 2,
) {
  if (
    !Number.isFinite(radians) ||
    !Number.isInteger(fractionDigits) ||
    fractionDigits < 0 ||
    fractionDigits > 6
  ) {
    return "—";
  }

  const normalized = normalizeSignedRadians(radians);
  const scale = 10 ** fractionDigits;
  const maximumUnits =
    12 * SECONDS_PER_HOUR * scale;
  const roundedUnits = Math.min(
    maximumUnits,
    Math.round(
      (Math.abs(normalized) / TWO_PI) *
        SECONDS_PER_SIDEREAL_DAY *
        scale,
    ),
  );
  const hours = Math.floor(
    roundedUnits / (SECONDS_PER_HOUR * scale),
  );
  const afterHours =
    roundedUnits - hours * SECONDS_PER_HOUR * scale;
  const minutes = Math.floor(afterHours / (60 * scale));
  const secondsUnits =
    afterHours - minutes * 60 * scale;
  const seconds = (secondsUnits / scale)
    .toFixed(fractionDigits)
    .padStart(
      fractionDigits === 0
        ? 2
        : 3 + fractionDigits,
      "0",
    );
  const roundedToNegativeTwelveHours =
    roundedUnits === maximumUnits;
  const sign =
    roundedToNegativeTwelveHours ||
    (normalized < 0 && roundedUnits > 0)
      ? "−"
      : "+";

  return `${sign}${String(hours).padStart(2, "0")}h ${String(
    minutes,
  ).padStart(2, "0")}m ${seconds}s`;
}

function apparentSiderealLines(
  star: StarViewModel,
  timeScales: ResolvedTimeScales | null,
  longitudeDegrees: number,
) {
  const unavailable =
    star.calculationModel === "v2"
      ? "利用不可（時刻尺度または見かけ赤経なし）"
      : "利用不可（簡易モデル）";
  if (
    star.calculationModel !== "v2" ||
    timeScales === null ||
    !Number.isFinite(timeScales.ut1JulianDate) ||
    !Number.isFinite(timeScales.ttJulianDate) ||
    star.apparentRaRad === null ||
    !Number.isFinite(star.apparentRaRad) ||
    !Number.isFinite(longitudeDegrees)
  ) {
    return [
      `地方見かけ恒星時（GAST＋入力東経、極運動前）: ${unavailable}`,
      `地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: ${unavailable}`,
    ];
  }

  const greenwichApparentSiderealTime =
    greenwichApparentSiderealTime2006B(
      timeScales.ut1JulianDate,
      timeScales.ttJulianDate,
    );
  const localApparentSiderealTime =
    greenwichApparentSiderealTime +
    (longitudeDegrees * Math.PI) / 180;
  const apparentHourAngle =
    localApparentSiderealTime - star.apparentRaRad;

  return [
    `地方見かけ恒星時（GAST＋入力東経、極運動前）: ${formatRightAscension(
      localApparentSiderealTime,
      2,
    )}`,
    `地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: ${formatSignedHourAngle(
      apparentHourAngle,
      2,
    )}`,
  ];
}

function qualityLabel(
  earthOrientationEstimate: IersEarthOrientationEstimateV1 | null,
) {
  if (!earthOrientationEstimate) {
    return "収録外または未取得（DUT1=0秒・xp/yp=0近似）";
  }

  const qualities = new Set([
    earthOrientationEstimate.dut1.quality ??
      earthOrientationEstimate.dut1.source,
    earthOrientationEstimate.polarMotion.quality ??
      earthOrientationEstimate.polarMotion.source,
  ]);
  if (qualities.size === 1 && qualities.has("observed")) {
    return "IERS観測値";
  }
  if (qualities.size === 1 && qualities.has("predicted")) {
    return "IERS予測値";
  }
  return "IERS観測値・予測値の混在";
}

function horizontalLine(
  altitudeDeg: number,
  azimuthDeg: number,
  azimuthDefined: boolean,
) {
  const azimuth = azimuthDefined
    ? formatAzimuthDegrees(azimuthDeg, 6)
    : "不定（天頂または天底）";
  return `高度 ${formatSignedDegrees(altitudeDeg, 6)} / 方位 ${azimuth}`;
}

function locationSourceLabel(
  source: ObserverLocation["locationSource"],
) {
  switch (source) {
    case "bundled-city":
      return "収録都市";
    case "manual":
      return "手動入力";
    case "device-geolocation":
      return "端末の位置情報";
  }
}

function refractionLabel(
  star: StarViewModel,
  inputSource: RefractionInputSource | null,
) {
  const configuredModel =
    inputSource === "manual" ? "手動大気差" : "標準大気差";
  switch (star.refractionMode) {
    case "applied":
      return `${configuredModel}を適用`;
    case "below-model-altitude":
      return `幾何高度（${configuredModel}の適用域外）`;
    case "disabled":
      return "幾何高度（大気差なし）";
    case null:
      return "簡易モデルの幾何高度";
  }
}

export function buildStarPointingPayload({
  earthOrientationEstimate,
  location,
  observationDate,
  refractionAtmosphere,
  refractionInputSource,
  star,
  timeScales,
}: StarPointingPayloadInput) {
  const apparent =
    star.apparentRaRad === null || star.apparentDecRad === null
      ? "利用不可（簡易モデル）"
      : `${formatRightAscension(star.apparentRaRad, 2)} / ${formatDeclination(
          star.apparentDecRad,
          1,
        )}`;
  const localDateTime = formatZonedDateTimeInput(
    observationDate,
    location.timeZone,
  ).replace("T", " ");
  const timeScaleLines = timeScales
    ? [
        `DUT1: ${timeScales.dut1Seconds.toFixed(6)} s (${timeScales.dut1Source})`,
        `JD(UT1): ${timeScales.ut1JulianDate.toFixed(9)}`,
        `JD(TT): ${timeScales.ttJulianDate.toFixed(9)}`,
      ]
    : ["DUT1 / JD(UT1) / JD(TT): 利用不可（簡易モデル）"];
  const siderealLines = apparentSiderealLines(
    star,
    timeScales,
    location.longitude,
  );

  return [
    "Planetarium 精密導入データ",
    `対象: ${star.japaneseName} / ${star.englishName} / HR ${star.hr}`,
    `UTC: ${observationDate.toISOString()}`,
    `現地時刻: ${localDateTime} [${location.timeZone}]`,
    `地点: ${location.name} / 緯度 ${location.latitude.toFixed(
      6,
    )}° / 経度 ${location.longitude.toFixed(
      6,
    )}° / WGS84楕円体高 ${location.heightMeters.toFixed(1)} m`,
    `地点由来: ${locationSourceLabel(location.locationSource)} / ${
      location.horizontalAccuracyMeters === null
        ? "水平精度は未指定"
        : `水平精度 ±${location.horizontalAccuracyMeters.toFixed(0)} m`
    }`,
    `大気差: ${refractionLabel(star, refractionInputSource)}${
      refractionAtmosphere
        ? ` / ${atmosphereValueSummary(refractionAtmosphere)}`
        : ""
    }`,
    `見かけ赤経・赤緯（観測日）: ${apparent}`,
    ...siderealLines,
    `幾何高度・方位（真空）: ${horizontalLine(
      star.geometricAltitudeDeg,
      star.geometricAzimuthDeg,
      star.geometricAzimuthDefined,
    )}`,
    `観測高度・方位（大気差設定反映）: ${horizontalLine(
      star.altitudeDeg,
      star.azimuthDeg,
      star.azimuthDefined,
    )}`,
    `星表赤経・赤緯（J2000.0）: ${formatRightAscension(
      star.raRad,
      2,
    )} / ${formatDeclination(star.decRad, 1)}`,
    ...timeScaleLines,
    `EOP品質: ${qualityLabel(earthOrientationEstimate)}`,
    `計算モデル: ${star.calculationModel === "v2" ? "精密モデル v2" : "簡易モデル v1"}`,
    "注記: 表示桁は計算条件の再現用であり、同じ桁までの実測精度を保証しません。",
  ].join("\n");
}

function finiteOrNull(value: number | null | undefined) {
  return value !== null &&
    value !== undefined &&
    Number.isFinite(value)
    ? value
    : null;
}

function nullableCatalogValue(
  value: number | null,
  star: StarViewModel,
) {
  return star.calculationModel === "v2"
    ? finiteOrNull(value)
    : null;
}

function horizontalProfile(
  altitudeDegrees: number,
  azimuthDegrees: number,
  azimuthDefined: boolean,
) {
  const altitude = finiteOrNull(altitudeDegrees);
  const azimuth = azimuthDefined
    ? finiteOrNull(azimuthDegrees)
    : null;
  return {
    altitudeDegrees: altitude,
    azimuthDegrees: azimuth,
    azimuthStatus: azimuthDefined
      ? azimuth === null
        ? "invalid"
        : "defined"
      : "undefined-at-zenith-or-nadir",
    status:
      altitude !== null &&
      (!azimuthDefined || azimuth !== null)
        ? "available"
        : "invalid",
  } as const;
}

function refractionCoordinateStatus(star: StarViewModel) {
  if (star.calculationModel !== "v2") {
    return "approximate-simple-model";
  }
  switch (star.refractionMode) {
    case "applied":
      return "refraction-applied";
    case "below-model-altitude":
      return "refraction-not-applied-outside-model-domain";
    case "disabled":
      return "refraction-disabled";
    case null:
      return "unavailable";
  }
}

function expectedIersSource(
  source: "observed" | "predicted",
) {
  return source === "observed"
    ? "iers-observed"
    : "iers-predicted";
}

function valuesMatch(left: number, right: number) {
  return (
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    Math.abs(left - right) <= 1e-15
  );
}

function nullableValuesMatch(
  left: number | null,
  right: number | null,
) {
  return left === null && right === null
    ? true
    : left !== null &&
        right !== null &&
        valuesMatch(left, right);
}

function standardAtmosphereMatches(
  atmosphere: Atmosphere,
) {
  return (
    atmosphere.pressureHpa ===
      STANDARD_VISUAL_ATMOSPHERE.pressureHpa &&
    atmosphere.temperatureCelsius ===
      STANDARD_VISUAL_ATMOSPHERE.temperatureCelsius &&
    atmosphere.relativeHumidity ===
      STANDARD_VISUAL_ATMOSPHERE.relativeHumidity &&
    atmosphere.wavelengthMicrometers ===
      STANDARD_VISUAL_ATMOSPHERE.wavelengthMicrometers &&
    (atmosphere.minimumGeometricAltitudeDegrees ?? 5) ===
      (STANDARD_VISUAL_ATMOSPHERE.minimumGeometricAltitudeDegrees ??
        5)
  );
}

function isValidAppliedAtmosphere(atmosphere: Atmosphere) {
  try {
    const minimumGeometricAltitudeDegrees =
      atmosphere.minimumGeometricAltitudeDegrees ?? 5;
    applyVisualRefractionWithCoefficients(
      (minimumGeometricAltitudeDegrees * Math.PI) / 180,
      refractionCoefficients(atmosphere),
      minimumGeometricAltitudeDegrees,
    );
    return true;
  } catch {
    return false;
  }
}

export function hasFullPrecisionPointingSnapshot({
  location,
  observationDate,
  polarMotionSnapshot = null,
  refractionAtmosphere,
  refractionInputSource,
  star,
  timeScales,
}: StarPointingPayloadInput) {
  const refractionInputsMatch =
    star.refractionMode === "disabled"
      ? refractionAtmosphere === null &&
        refractionInputSource === null
      : (star.refractionMode === "applied" ||
            star.refractionMode === "below-model-altitude") &&
          refractionAtmosphere !== null &&
          refractionInputSource !== null &&
          isValidAppliedAtmosphere(refractionAtmosphere) &&
          (refractionInputSource === "manual" ||
            standardAtmosphereMatches(refractionAtmosphere));
  return (
    star.calculationModel === "v2" &&
    star.apparentRaRad !== null &&
    Number.isFinite(star.apparentRaRad) &&
    star.apparentDecRad !== null &&
    Number.isFinite(star.apparentDecRad) &&
    star.annualAberrationMode !== null &&
    star.annualParallaxMode !== null &&
    star.diurnalAberrationMode !== null &&
    star.refractionMode !== null &&
    star.solarLightDeflectionMode !== null &&
    star.spaceMotionMode !== null &&
    timeScales !== null &&
    Number.isFinite(timeScales.utcJulianDate) &&
    Number.isFinite(timeScales.ut1JulianDate) &&
    Number.isFinite(timeScales.ttJulianDate) &&
    polarMotionSnapshot !== null &&
    polarMotionSnapshot.mode === star.polarMotionMode &&
    Number.isFinite(polarMotionSnapshot.xpRadians) &&
    Number.isFinite(polarMotionSnapshot.ypRadians) &&
    Number.isFinite(observationDate.getTime()) &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    Number.isFinite(location.heightMeters) &&
    refractionInputsMatch
  );
}

function earthOrientationProfile(
  star: StarViewModel,
  timeScales: ResolvedTimeScales | null,
  estimate: IersEarthOrientationEstimateV1 | null,
  polarMotionSnapshot: AppliedPolarMotionSnapshot | null,
  sourceIdentifier: string | null,
) {
  if (star.calculationModel !== "v2") {
    return {
      appliedDut1Seconds: null,
      dut1MetadataMatchesAppliedValue: null,
      dut1Quality: null,
      dut1ReportedErrorSeconds: null,
      dut1Source: null,
      dut1Status: "not-applied-simple-model",
      estimateStatus: estimate
        ? "available-not-applied"
        : "unavailable",
      polarMotionMetadataMatchesAppliedValue: null,
      polarMotionQuality: null,
      polarMotionSource: null,
      polarMotionStatus: "not-applied-simple-model",
      sourceIdentifier: null,
      sourceIdentifierStatus:
        "unavailable-from-render-snapshot",
      status: "not-applied-simple-model",
      usesPrediction: null,
      xpAppliedRadians: null,
      xpReportedErrorRadians: null,
      ypAppliedRadians: null,
      ypReportedErrorRadians: null,
      consistencyIssues: [] as string[],
    };
  }

  const consistencyIssues: string[] = [];
  const appliedDut1Seconds = timeScales
    ? finiteOrNull(timeScales.dut1Seconds)
    : null;
  const dut1IsAssumedZero =
    timeScales?.dut1Source === "assumed-zero";
  const dut1IsIers =
    timeScales?.dut1Source === "iers-observed" ||
    timeScales?.dut1Source === "iers-predicted";
  const dut1MetadataMatchesAppliedValue =
    dut1IsIers && estimate
      ? timeScales.dut1Source ===
          expectedIersSource(estimate.dut1.source) &&
        appliedDut1Seconds !== null &&
        valuesMatch(
          appliedDut1Seconds,
          estimate.dut1.seconds,
        ) &&
        nullableValuesMatch(
          finiteOrNull(timeScales.dut1UncertaintySeconds),
          finiteOrNull(estimate.dut1.reportedErrorSeconds),
        )
      : null;
  let dut1Status:
    | "assumed-zero"
    | "available"
    | "applied-without-matching-estimate-metadata"
    | "caller"
    | "invalid-assumed-zero-value"
    | "unavailable";
  if (!timeScales || appliedDut1Seconds === null) {
    dut1Status = "unavailable";
  } else if (dut1IsAssumedZero) {
    dut1Status =
      appliedDut1Seconds === 0
        ? "assumed-zero"
        : "invalid-assumed-zero-value";
  } else if (dut1IsIers) {
    dut1Status =
      dut1MetadataMatchesAppliedValue === true
        ? "available"
        : "applied-without-matching-estimate-metadata";
  } else {
    dut1Status = "caller";
  }
  if (dut1Status === "invalid-assumed-zero-value") {
    consistencyIssues.push(
      "DUT1 source is assumed-zero but its applied value is non-zero.",
    );
  } else if (
    dut1Status ===
    "applied-without-matching-estimate-metadata"
  ) {
    consistencyIssues.push(
      "Applied DUT1 does not have a matching IERS estimate snapshot.",
    );
  }

  const polarMotionIsIers =
    star.polarMotionMode === "iers-observed" ||
    star.polarMotionMode === "iers-predicted";
  const appliedPolarMotion =
    polarMotionSnapshot &&
    polarMotionSnapshot.mode === star.polarMotionMode &&
    Number.isFinite(polarMotionSnapshot.xpRadians) &&
    Number.isFinite(polarMotionSnapshot.ypRadians)
      ? polarMotionSnapshot
      : null;
  const polarMotionMetadataMatchesAppliedValue =
    polarMotionIsIers && estimate && appliedPolarMotion
      ? star.polarMotionMode ===
          expectedIersSource(estimate.polarMotion.source) &&
        valuesMatch(
          appliedPolarMotion.xpRadians,
          estimate.polarMotion.xpRadians,
        ) &&
        valuesMatch(
          appliedPolarMotion.ypRadians,
          estimate.polarMotion.ypRadians,
        ) &&
        nullableValuesMatch(
          appliedPolarMotion.xpReportedErrorRadians,
          finiteOrNull(
            estimate.polarMotion.xpReportedErrorRadians,
          ),
        ) &&
        nullableValuesMatch(
          appliedPolarMotion.ypReportedErrorRadians,
          finiteOrNull(
            estimate.polarMotion.ypReportedErrorRadians,
          ),
        )
      : null;
  let polarMotionStatus:
    | "assumed-zero"
    | "available"
    | "applied-without-matching-estimate-metadata"
    | "invalid-assumed-zero-value"
    | "unavailable";
  let xpAppliedRadians: number | null = null;
  let ypAppliedRadians: number | null = null;
  if (star.polarMotionMode === "assumed-zero") {
    if (
      appliedPolarMotion &&
      appliedPolarMotion.xpRadians === 0 &&
      appliedPolarMotion.ypRadians === 0
    ) {
      polarMotionStatus = "assumed-zero";
      xpAppliedRadians = 0;
      ypAppliedRadians = 0;
    } else {
      polarMotionStatus = "invalid-assumed-zero-value";
      consistencyIssues.push(
        "Polar-motion mode is assumed-zero but its applied values are unavailable or non-zero.",
      );
    }
  } else if (polarMotionIsIers) {
    if (appliedPolarMotion) {
      xpAppliedRadians = appliedPolarMotion.xpRadians;
      ypAppliedRadians = appliedPolarMotion.ypRadians;
      polarMotionStatus =
        polarMotionMetadataMatchesAppliedValue === true
          ? "available"
          : "applied-without-matching-estimate-metadata";
      if (polarMotionMetadataMatchesAppliedValue !== true) {
        consistencyIssues.push(
          "Applied polar motion does not have a matching IERS estimate snapshot.",
        );
      }
    } else {
      polarMotionStatus = "unavailable";
      consistencyIssues.push(
        "Applied polar-motion values are unavailable from the render snapshot.",
      );
    }
  } else if (star.polarMotionMode === "caller") {
    polarMotionStatus = appliedPolarMotion
      ? "available"
      : "unavailable";
    xpAppliedRadians = appliedPolarMotion?.xpRadians ?? null;
    ypAppliedRadians = appliedPolarMotion?.ypRadians ?? null;
  } else if (star.polarMotionMode === "disabled") {
    polarMotionStatus = "unavailable";
  } else {
    polarMotionStatus = "unavailable";
  }

  const status =
    dut1IsIers &&
    polarMotionIsIers &&
    appliedDut1Seconds !== null &&
    appliedPolarMotion !== null
      ? "iers"
      : dut1Status === "assumed-zero" &&
          polarMotionStatus === "assumed-zero"
        ? "assumed-zero"
        : !timeScales &&
            star.polarMotionMode === null
          ? "unavailable"
          : "partial";
  const matchingDut1Estimate =
    dut1MetadataMatchesAppliedValue === true
      ? estimate
      : null;
  const matchingPolarMotionEstimate =
    polarMotionMetadataMatchesAppliedValue === true &&
    polarMotionStatus === "available"
      ? estimate
      : null;

  return {
    appliedDut1Seconds:
      dut1Status === "invalid-assumed-zero-value"
        ? null
        : appliedDut1Seconds,
    dut1MetadataMatchesAppliedValue,
    dut1Quality: matchingDut1Estimate
      ? (matchingDut1Estimate.dut1.quality ??
        matchingDut1Estimate.dut1.source)
      : null,
    dut1ReportedErrorSeconds: matchingDut1Estimate
      ? finiteOrNull(timeScales?.dut1UncertaintySeconds)
      : null,
    dut1Source: timeScales?.dut1Source ?? null,
    dut1Status,
    estimateStatus: estimate ? "available" : "unavailable",
    polarMotionMetadataMatchesAppliedValue,
    polarMotionQuality: matchingPolarMotionEstimate
      ? (matchingPolarMotionEstimate.polarMotion.quality ??
        matchingPolarMotionEstimate.polarMotion.source)
      : null,
    polarMotionSource:
      star.polarMotionMode === "iers-observed"
        ? "observed"
        : star.polarMotionMode === "iers-predicted"
          ? "predicted"
          : star.polarMotionMode,
    polarMotionStatus,
    sourceIdentifier:
      dut1MetadataMatchesAppliedValue === true &&
      polarMotionMetadataMatchesAppliedValue === true
        ? sourceIdentifier
        : null,
    sourceIdentifierStatus:
      dut1MetadataMatchesAppliedValue === true &&
      polarMotionMetadataMatchesAppliedValue === true &&
      sourceIdentifier
        ? "available"
        : "unavailable",
    status,
    usesPrediction: matchingPolarMotionEstimate
      ? matchingPolarMotionEstimate.polarMotion
          .usesPrediction
      : star.polarMotionMode === "iers-predicted"
        ? true
        : star.polarMotionMode === "iers-observed"
          ? false
          : null,
    xpAppliedRadians,
    xpReportedErrorRadians:
      appliedPolarMotion &&
      star.polarMotionMode !== "assumed-zero"
        ? finiteOrNull(
            appliedPolarMotion.xpReportedErrorRadians,
          )
        : null,
    ypAppliedRadians,
    ypReportedErrorRadians:
      appliedPolarMotion &&
      star.polarMotionMode !== "assumed-zero"
        ? finiteOrNull(
            appliedPolarMotion.ypReportedErrorRadians,
          )
        : null,
    consistencyIssues,
  };
}

function refractionProfile(
  star: StarViewModel,
  atmosphere: Atmosphere | null,
  inputSource: RefractionInputSource | null,
) {
  const mode = star.refractionMode;
  if (star.calculationModel !== "v2") {
    return {
      description: "簡易モデル（大気差は未適用）",
      mode,
      parameters: null,
      parametersStatus: "not-applied-simple-model",
      status: refractionCoordinateStatus(star),
    };
  }
  if (mode === "disabled") {
    return {
      description:
        "なし（観測座標は真空幾何座標と同値）",
      mode,
      parameters: null,
      parametersStatus: "not-configured",
      status: refractionCoordinateStatus(star),
    };
  }
  if (
    mode !== "applied" &&
    mode !== "below-model-altitude"
  ) {
    return {
      description: "大気差設定を利用できません",
      mode,
      parameters: null,
      parametersStatus: "unavailable",
      status: refractionCoordinateStatus(star),
    };
  }
  if (!atmosphere || !inputSource) {
    return {
      description:
        "大気差は計算済みですが、入力パラメータを利用できません",
      mode,
      parameters: null,
      parametersStatus: "unavailable-from-render-snapshot",
      status: refractionCoordinateStatus(star),
    };
  }
  const parameters = {
    inputSource,
    minimumGeometricAltitudeDegrees: finiteOrNull(
      atmosphere.minimumGeometricAltitudeDegrees ?? 5,
    ),
    pressureHpa: finiteOrNull(
      atmosphere.pressureHpa,
    ),
    relativeHumidity: finiteOrNull(
      atmosphere.relativeHumidity,
    ),
    temperatureCelsius: finiteOrNull(
      atmosphere.temperatureCelsius,
    ),
    wavelengthMicrometers: finiteOrNull(
      atmosphere.wavelengthMicrometers,
    ),
  };
  const parametersAvailable = Object.values(parameters).every(
    (value) => value !== null,
  );
  const cutoff =
    parameters.minimumGeometricAltitudeDegrees;
  return {
    description: parametersAvailable
      ? `${
          inputSource === "standard"
            ? "標準大気モデル"
            : "手動大気モデル"
        }（真空幾何高度${cutoff}°以上で適用）`
      : "大気差入力パラメータが不正です",
    mode,
    parameters,
    parametersStatus: parametersAvailable
      ? "configured"
      : "invalid",
    status: refractionCoordinateStatus(star),
  };
}

function omittedCorrections(star: StarViewModel) {
  if (star.calculationModel !== "v2") {
    return ["precision-pipeline"];
  }
  const omitted: string[] = [];
  if (
    star.annualParallaxMode === "disabled" ||
    star.annualParallaxMode === "unavailable" ||
    star.annualParallaxMode === null
  ) {
    omitted.push(
      "annual-parallax",
      "stellar-diurnal-parallax",
    );
  } else if (
    star.annualParallaxMode !== "caller-observer-position"
  ) {
    omitted.push("stellar-diurnal-parallax");
  }
  omitted.push("planetary-light-deflection");
  if (star.solarLightDeflectionMode === "disabled") {
    omitted.push("solar-light-deflection");
  }
  if (star.annualAberrationMode === "disabled") {
    omitted.push("annual-aberration");
  }
  if (star.diurnalAberrationMode === "disabled") {
    omitted.push("diurnal-aberration");
  }
  if (
    star.polarMotionMode === "disabled" ||
    star.polarMotionMode === "assumed-zero"
  ) {
    omitted.push("polar-motion");
  } else {
    omitted.push("subdaily-polar-motion-tides");
  }
  return omitted;
}

function precisionWarnings(
  star: StarViewModel,
  timeScales: ResolvedTimeScales | null,
  refraction: ReturnType<typeof refractionProfile>,
  earthOrientation: ReturnType<
    typeof earthOrientationProfile
  >,
) {
  if (star.calculationModel !== "v2") {
    return [];
  }
  const warnings = new Set<string>(
    timeScales?.warnings ?? [],
  );
  warnings.add("catalog-fk5-precision-limited");
  if (star.spaceMotionMode === "none") {
    warnings.add("proper-motion-missing");
  }
  if (
    star.parallaxArcsec !== null &&
    star.parallaxArcsec > 0 &&
    star.radialVelocityKmPerSecond === null
  ) {
    warnings.add("radial-velocity-missing-assumed-zero");
  }
  if (star.annualParallaxMode === "disabled") {
    warnings.add("annual-parallax-disabled");
  } else if (star.annualParallaxMode === "unavailable") {
    warnings.add("annual-parallax-unavailable");
  } else if (
    star.annualParallaxMode ===
      "truncated-vsop2000-heliocentric-earth" ||
    star.annualParallaxMode ===
      "jpl-approximate-earth-moon-barycenter"
  ) {
    warnings.add(
      "annual-parallax-approximate-ephemeris",
    );
  }
  if (star.solarLightDeflectionMode === "disabled") {
    warnings.add("solar-light-deflection-disabled");
  } else if (
    star.solarLightDeflectionMode ===
      "truncated-vsop2000-heliocentric-earth" ||
    star.solarLightDeflectionMode ===
      "jpl-approximate-earth-moon-barycenter"
  ) {
    warnings.add(
      "solar-light-deflection-approximate-ephemeris",
    );
  }
  if (star.annualAberrationMode === "disabled") {
    warnings.add("aberration-disabled");
  } else if (
    star.annualAberrationMode ===
      "truncated-vsop2000-heliocentric-earth" ||
    star.annualAberrationMode ===
      "jpl-approximate-earth-moon-barycenter"
  ) {
    warnings.add("aberration-approximate-ephemeris");
  }
  if (star.diurnalAberrationMode === "disabled") {
    warnings.add("diurnal-aberration-disabled");
  }
  if (star.polarMotionMode === "assumed-zero") {
    warnings.add("polar-motion-assumed-zero");
  }
  if (star.refractionMode === "disabled") {
    warnings.add("refraction-disabled");
  } else if (
    star.refractionMode === "below-model-altitude"
  ) {
    warnings.add("refraction-below-model-altitude");
  }
  if (refraction.parametersStatus === "invalid") {
    warnings.add("refraction-parameters-invalid");
  }
  for (const issue of earthOrientation.consistencyIssues) {
    warnings.add(`earth-orientation-inconsistent: ${issue}`);
  }
  return [...warnings];
}

function catalogKinematicsStatus(star: StarViewModel) {
  if (star.calculationModel !== "v2") {
    return "unavailable-simple-model";
  }
  switch (star.spaceMotionMode) {
    case "three-dimensional":
      return "three-dimensional";
    case "angular-proper-motion":
      return "angular-proper-motion";
    case "none":
      return "catalog-position-only";
    case null:
      return "unavailable";
  }
}

/**
 * Versioned, machine-readable counterpart to the human pointing readout.
 *
 * Numeric values are intentionally not rounded for presentation. Unavailable
 * precision fields stay null and carry a status instead of silently becoming
 * zero; an explicit zero is emitted only when the calculation actually used
 * an assumed-zero Earth-orientation input.
 */
export function buildStarPointingJsonProfile({
  earthOrientationEstimate,
  earthOrientationSourceIdentifier = null,
  location,
  observationDate,
  polarMotionSnapshot = null,
  refractionAtmosphere,
  refractionInputSource,
  star,
  timeScales,
}: StarPointingPayloadInput) {
  const input = {
    earthOrientationEstimate,
    earthOrientationSourceIdentifier,
    location,
    observationDate,
    polarMotionSnapshot,
    refractionAtmosphere,
    refractionInputSource,
    star,
    timeScales,
  };
  if (!hasFullPrecisionPointingSnapshot(input)) {
    throw new TypeError(
      "A complete precision-v2 render snapshot is required for the precision pointing profile.",
    );
  }
  const apparentRightAscension = finiteOrNull(
    star.apparentRaRad,
  );
  const apparentDeclination = finiteOrNull(
    star.apparentDecRad,
  );
  const apparentCoordinatesAvailable =
    star.calculationModel === "v2" &&
    apparentRightAscension !== null &&
    apparentDeclination !== null;
  const catalogRightAscension = finiteOrNull(star.raRad);
  const catalogDeclination = finiteOrNull(star.decRad);
  const catalogCoordinatesAvailable =
    catalogRightAscension !== null &&
    catalogDeclination !== null;
  const geometricHorizontal = horizontalProfile(
    star.geometricAltitudeDeg,
    star.geometricAzimuthDeg,
    star.geometricAzimuthDefined,
  );
  const observedHorizontal = horizontalProfile(
    star.altitudeDeg,
    star.azimuthDeg,
    star.azimuthDefined,
  );
  const precisionModel = star.calculationModel === "v2";
  const properMotionUnavailable =
    precisionModel && star.spaceMotionMode === "none";
  const radialVelocityAssumedZero =
    precisionModel &&
    star.parallaxArcsec !== null &&
    star.parallaxArcsec > 0 &&
    star.radialVelocityKmPerSecond === null;
  const earthOrientation = earthOrientationProfile(
    star,
    timeScales,
    earthOrientationEstimate,
    polarMotionSnapshot,
    earthOrientationSourceIdentifier,
  );
  const refraction = refractionProfile(
    star,
    refractionAtmosphere,
    refractionInputSource,
  );
  const warnings = precisionWarnings(
    star,
    timeScales,
    refraction,
    earthOrientation,
  );
  const localDateTime = formatZonedDateTimeInput(
    observationDate,
    location.timeZone,
  );

  return {
    schemaVersion: STAR_POINTING_PROFILE_SCHEMA_VERSION,
    profileId: STAR_POINTING_PROFILE_ID,
    target: {
      catalog: "BSC5P",
      hd: star.hd,
      hr: star.hr,
      catalogName: star.catalogName,
      nameJapanese: star.japaneseName,
      nameEnglish: star.englishName,
      aliases: [...star.aliases],
      constellation: star.constellation || null,
      visualMagnitude: finiteOrNull(star.vMagnitude),
      catalogKinematics: {
        status: catalogKinematicsStatus(star),
        spaceMotionMode: star.spaceMotionMode,
        properMotionStatus:
          star.calculationModel !== "v2"
            ? "unavailable-simple-model"
            : star.spaceMotionMode === "none"
              ? "not-applied-missing"
              : star.spaceMotionMode === null
                ? "unavailable"
                : "applied",
        properMotionRaCosDecArcsecondsPerYear:
          nullableCatalogValue(
            star.pmRaCosDecArcsecPerYear,
            star,
          ),
        properMotionDecArcsecondsPerYear:
          nullableCatalogValue(
            star.pmDecArcsecPerYear,
            star,
          ),
        parallaxArcseconds: nullableCatalogValue(
          star.parallaxArcsec,
          star,
        ),
        parallaxStatus:
          star.calculationModel !== "v2"
            ? "unavailable-simple-model"
            : star.annualParallaxMode === "unavailable"
              ? "not-applied-missing"
              : star.annualParallaxMode === "disabled"
                ? "disabled"
                : star.annualParallaxMode === null
                  ? "unavailable"
                  : "applied",
        radialVelocityKilometersPerSecond:
          nullableCatalogValue(
            star.radialVelocityKmPerSecond,
            star,
          ),
        radialVelocityStatus:
          star.calculationModel !== "v2"
            ? "unavailable-simple-model"
            : star.parallaxArcsec !== null &&
                star.parallaxArcsec > 0 &&
                star.radialVelocityKmPerSecond === null
              ? "assumed-zero"
              : star.radialVelocityKmPerSecond !== null &&
                  star.parallaxArcsec !== null &&
                  star.parallaxArcsec > 0
                ? "applied"
                : star.radialVelocityKmPerSecond !== null
                  ? "not-applied-without-distance"
                  : "unavailable-not-required",
      },
    },
    observation: {
      utc: observationDate.toISOString(),
      timeZone: location.timeZone,
      localDateTime,
      location: {
        status:
          finiteOrNull(location.latitude) !== null &&
          finiteOrNull(location.longitude) !== null &&
          finiteOrNull(location.heightMeters) !== null
            ? "available"
            : "invalid",
        referenceFrame: "WGS84",
        latitudeDegrees: finiteOrNull(location.latitude),
        longitudeDegrees: finiteOrNull(location.longitude),
        heightMeters: finiteOrNull(
          location.heightMeters,
        ),
        name: location.name,
        source: location.locationSource,
        horizontalAccuracyMeters: finiteOrNull(
          location.horizontalAccuracyMeters,
        ),
        horizontalAccuracyStatus:
          finiteOrNull(
            location.horizontalAccuracyMeters,
          ) === null
            ? "unavailable"
            : "available",
      },
    },
    coordinates: {
      catalogJ2000: {
        status: catalogCoordinatesAvailable
          ? "calculated"
          : "invalid",
        frame: "FK5",
        origin: "catalog-direction",
        equinox: "J2000.0",
        epoch: "J2000.0",
        units: "radian",
        rightAscensionRadians: catalogCoordinatesAvailable
          ? catalogRightAscension
          : null,
        declinationRadians: catalogCoordinatesAvailable
          ? catalogDeclination
          : null,
      },
      geocentricApparent: {
        status: apparentCoordinatesAvailable
          ? "calculated"
          : precisionModel
            ? "unavailable"
            : "unavailable-simple-model",
        origin: "geocenter",
        frame:
          "true-equator-and-equinox-of-date",
        equinox: "observation-date",
        units: "radian",
        rightAscensionRadians: apparentCoordinatesAvailable
          ? apparentRightAscension
          : null,
        declinationRadians: apparentCoordinatesAvailable
          ? apparentDeclination
          : null,
      },
      vacuumTopocentric: {
        ...geometricHorizontal,
        status:
          geometricHorizontal.status === "available"
            ? precisionModel
              ? "calculated"
              : "approximate-simple-model"
            : geometricHorizontal.status,
        frame: "local-ENU",
        origin: "WGS84-observer",
        units: "degree",
        azimuthConvention: "north-zero-east-positive",
        atmosphere: "vacuum",
      },
      observedTopocentric: {
        ...observedHorizontal,
        status:
          observedHorizontal.status === "available"
            ? refractionCoordinateStatus(star)
            : observedHorizontal.status,
        frame: "local-ENU",
        origin: "WGS84-observer",
        units: "degree",
        azimuthConvention: "north-zero-east-positive",
        refractionMode: star.refractionMode,
      },
    },
    timeScales: {
      status: !precisionModel
        ? "not-applied-simple-model"
        : timeScales
        ? timeScales.dut1Source === "assumed-zero"
          ? "available-with-assumed-zero-dut1"
          : "available"
        : "unavailable",
      jdUTC: precisionModel && timeScales
        ? finiteOrNull(timeScales.utcJulianDate)
        : null,
      jdUT1: precisionModel && timeScales
        ? finiteOrNull(timeScales.ut1JulianDate)
        : null,
      jdTT: precisionModel && timeScales
        ? finiteOrNull(timeScales.ttJulianDate)
        : null,
      dut1Seconds: precisionModel && timeScales
        ? finiteOrNull(timeScales.dut1Seconds)
        : null,
      dut1UncertaintySeconds:
        precisionModel
          ? finiteOrNull(
              timeScales?.dut1UncertaintySeconds,
            )
          : null,
      dut1Source:
        precisionModel
          ? timeScales?.dut1Source ?? null
          : null,
      taiMinusUTCSeconds: precisionModel && timeScales
        ? finiteOrNull(timeScales.taiMinusUtcSeconds)
        : null,
      taiMinusUTCSource:
        precisionModel
          ? timeScales?.taiMinusUtcSource ?? null
          : null,
    },
    earthOrientation,
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
      siteHeight: "meter",
    },
    conventions: {
      azimuth: {
        zeroDirection: "true-north",
        positiveDirection: "clockwise-toward-east",
        rangeDegrees: "[0,360)",
        undefinedRepresentation: null,
        undefinedWhen: "zenith-or-nadir",
      },
      altitude: {
        zeroPlane: "mathematical-horizon",
        positiveDirection: "up",
        rangeDegrees: "[-90,90]",
      },
      longitude: {
        positiveDirection: "east",
        rangeDegrees: "[-180,180]",
      },
      rightAscension: {
        positiveDirection: "east",
        rangeRadians: "[0,2pi)",
      },
    },
    diagnostics: {
      status: precisionModel
        ? "precision-model-v2"
        : "approximate-simple-model-v1",
      modelId: precisionModel
        ? "planetarium-precision-v2"
        : "planetarium-simple-v1",
      omittedCorrections: omittedCorrections(star),
      refraction,
      timeScaleWarnings: timeScales
        ? precisionModel
          ? [...timeScales.warnings]
          : []
        : [],
      models: {
        calculationModel: star.calculationModel,
        catalogFrame: "J2000.0 FK5",
        frameConnectionModel: precisionModel
          ? "SOFA FK5-to-Hipparcos J2000 rotation and spin"
          : null,
        precessionModel: precisionModel
          ? "IAU 2006 Fukushima-Williams"
          : null,
        nutationModel: precisionModel
          ? "IAU 2000B 77-term"
          : null,
        siderealTimeModel: precisionModel
          ? "IAU 2006 GMST + IAU 2000B leading equation of equinoxes"
          : null,
        spaceMotionMode: star.spaceMotionMode,
        radialVelocityAssumedZero,
        annualParallaxMode: star.annualParallaxMode,
        annualAberrationMode: star.annualAberrationMode,
        solarLightDeflectionMode:
          star.solarLightDeflectionMode,
        diurnalAberrationMode: star.diurnalAberrationMode,
        polarMotionMode: star.polarMotionMode,
        refractionMode: star.refractionMode,
      },
      approximations: {
        simplifiedPositionModel: !precisionModel,
        apparentCoordinatesUnavailable:
          !apparentCoordinatesAvailable,
        timeScalesUnavailable: timeScales === null,
        earthOrientationEstimateUnavailable:
          earthOrientationEstimate === null,
        earthOrientationNotApplied:
          earthOrientation.status ===
          "not-applied-simple-model",
        dut1AssumedZero:
          earthOrientation.dut1Status === "assumed-zero",
        polarMotionAssumedZero:
          earthOrientation.polarMotionStatus ===
          "assumed-zero",
        properMotionMissing:
          properMotionUnavailable,
        properMotionUnavailable,
        radialVelocityAssumedZero,
        approximateEarthEphemeris:
          star.annualParallaxMode ===
            "truncated-vsop2000-heliocentric-earth" ||
          star.annualParallaxMode ===
            "jpl-approximate-earth-moon-barycenter" ||
          star.solarLightDeflectionMode ===
            "truncated-vsop2000-heliocentric-earth" ||
          star.solarLightDeflectionMode ===
            "jpl-approximate-earth-moon-barycenter" ||
          star.annualAberrationMode ===
            "truncated-vsop2000-heliocentric-earth" ||
          star.annualAberrationMode ===
            "jpl-approximate-earth-moon-barycenter",
        refractionOutsideModelDomain:
          star.refractionMode === "below-model-altitude",
        refractionParametersUnavailable:
          refraction.parametersStatus ===
            "unavailable-from-render-snapshot" ||
          refraction.parametersStatus === "unavailable",
      },
      warnings,
      precisionStatement:
        "Digits preserve calculation inputs and outputs; they do not guarantee measurement accuracy.",
    },
  } as const;
}

export type StarPointingJsonProfileV1 = ReturnType<
  typeof buildStarPointingJsonProfile
>;

export function serializeStarPointingJsonProfile(
  input: StarPointingPayloadInput,
) {
  return `${JSON.stringify(buildStarPointingJsonProfile(input), null, 2)}\n`;
}
