import {
  resolveTimeScales,
  type EarthOrientationOptions,
} from "../precision";
import type { IersEarthOrientationEstimateV1 } from "../earthOrientation";
import type { EventEarthOrientationReportedUncertainty } from "./types";

const TT_MINUS_TAI_SECONDS = 32.184;
const EARTH_EQUATORIAL_ROTATION_KILOMETERS_PER_SECOND = 0.465_101_1;
const EARTH_EQUATORIAL_RADIUS_KILOMETERS = 6_378.137;
const NASA_DELTA_T_LUNAR_ACCELERATION_ARCSECONDS_PER_CENTURY_SQUARED =
  -26;
const DE44X_LUNAR_ACCELERATION_ARCSECONDS_PER_CENTURY_SQUARED =
  -25.936;
const EVENT_EOP_FIRST_SAMPLE_MILLISECONDS = Date.parse(
  "1973-01-02T00:00:00.000Z",
);
const EVENT_EOP_LAST_SAMPLE_MILLISECONDS = Date.parse(
  "2027-08-07T00:00:00.000Z",
);

/**
 * The final paired DUT1/polar-motion prediction sample in the bundled
 * finals2000A snapshot (MJD 61624).
 */
export const EVENT_EOP_LAST_SAMPLE_UTC = new Date(
  EVENT_EOP_LAST_SAMPLE_MILLISECONDS,
);

/**
 * ΔT = TT−UT1 at the final bundled EOP sample:
 * TAI−UTC (37 s) + 32.184 s − DUT1 (−0.055965 s).
 */
export const EVENT_EOP_ANCHOR_DELTA_T_SECONDS = 69.239_965;

const EVENT_EOP_ANCHOR_REPORTED_ERROR_SECONDS = 0.025_410;

export type EventEarthRotationFallback = {
  readonly deltaTSeconds: number;
  readonly deltaTUncertaintySeconds: number;
  readonly assumedTaiMinusUtcSeconds: number;
  readonly dut1Seconds: number;
  readonly earthOrientation: EarthOrientationOptions;
  readonly eopId: string;
  readonly deltaTModel: string;
  readonly pathUncertaintyKilometers: number;
  readonly dominantContributors: readonly string[];
  readonly warnings: readonly string[];
};

/**
 * Converts the IERS-published error columns into explicit event components.
 *
 * The source does not define these columns as a statistical sigma and does
 * not publish covariance here, so absolute xp/yp surface displacements are
 * added linearly to the DUT1 equatorial displacement.
 */
export function eventEarthOrientationReportedUncertainty(
  estimate: IersEarthOrientationEstimateV1,
): EventEarthOrientationReportedUncertainty {
  const dut1ReportedErrorSeconds = Math.abs(
    estimate.dut1.reportedErrorSeconds,
  );
  const xpReportedErrorRadians = Math.abs(
    estimate.polarMotion.xpReportedErrorRadians,
  );
  const ypReportedErrorRadians = Math.abs(
    estimate.polarMotion.ypReportedErrorRadians,
  );
  if (
    !Number.isFinite(dut1ReportedErrorSeconds) ||
    !Number.isFinite(xpReportedErrorRadians) ||
    !Number.isFinite(ypReportedErrorRadians)
  ) {
    throw new RangeError(
      "IERS reported errors must be finite",
    );
  }
  const dut1PathMeters =
    dut1ReportedErrorSeconds *
    EARTH_EQUATORIAL_ROTATION_KILOMETERS_PER_SECOND *
    1_000;
  const polarMotionPathMeters =
    (xpReportedErrorRadians + ypReportedErrorRadians) *
    EARTH_EQUATORIAL_RADIUS_KILOMETERS *
    1_000;
  return Object.freeze({
    dut1ReportedErrorSeconds,
    dut1PathMeters,
    polarMotionPathMeters,
    combinedPathMeters:
      dut1PathMeters + polarMotionPathMeters,
    semantics: "iers-reported-error-linear-envelope",
  });
}

function assertValidDate(date: Date): void {
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Event earth-rotation date must be valid");
  }
}

/**
 * Decimal year convention used by NASA's published ΔT polynomials:
 * year + (month − 0.5) / 12.
 */
export function nasaDeltaTDecimalYear(date: Date): number {
  assertValidDate(date);
  return (
    date.getUTCFullYear() +
    (date.getUTCMonth() + 0.5) / 12
  );
}

/**
 * NASA polynomial approximation of ΔT for the app's supported 1900–2100
 * interval, before matching its assumed lunar secular acceleration to the
 * DE44x ephemeris family.
 */
export function nasaDeltaTPolynomialSeconds(
  decimalYear: number,
): number {
  if (!Number.isFinite(decimalYear)) {
    throw new RangeError("ΔT decimal year must be finite");
  }
  if (decimalYear < 1900 || decimalYear > 2101) {
    throw new RangeError(
      "ΔT polynomial is supported only for 1900–2100",
    );
  }

  if (decimalYear < 1920) {
    const t = decimalYear - 1900;
    return (
      -2.79 +
      1.494_119 * t -
      0.059_893_9 * t ** 2 +
      0.006_196_6 * t ** 3 -
      0.000_197 * t ** 4
    );
  }
  if (decimalYear < 1941) {
    const t = decimalYear - 1920;
    return (
      21.2 +
      0.844_93 * t -
      0.076_1 * t ** 2 +
      0.002_093_6 * t ** 3
    );
  }
  if (decimalYear < 1961) {
    const t = decimalYear - 1950;
    return (
      29.07 +
      0.407 * t -
      t ** 2 / 233 +
      t ** 3 / 2_547
    );
  }
  if (decimalYear < 1986) {
    const t = decimalYear - 1975;
    return (
      45.45 +
      1.067 * t -
      t ** 2 / 260 -
      t ** 3 / 718
    );
  }
  if (decimalYear < 2005) {
    const t = decimalYear - 2000;
    return (
      63.86 +
      0.334_5 * t -
      0.060_374 * t ** 2 +
      0.001_727_5 * t ** 3 +
      0.000_651_814 * t ** 4 +
      0.000_023_735_99 * t ** 5
    );
  }
  if (decimalYear < 2050) {
    const t = decimalYear - 2000;
    return 62.92 + 0.322_17 * t + 0.005_589 * t ** 2;
  }
  return (
    -20 +
    32 * ((decimalYear - 1820) / 100) ** 2 -
    0.562_8 * (2150 - decimalYear)
  );
}

/**
 * Adjusts NASA's −26 arcsec/cy² ΔT convention to the DE440/441/442
 * lunar secular acceleration of approximately −25.936 arcsec/cy².
 *
 * NASA specifies c = −0.91072 × (ṅ + 26) × ((y−1955)/100)² seconds.
 * The 1955–2005 observations are independent of a lunar ephemeris, so no
 * correction is applied inside that interval.
 */
export function de442sLunarAccelerationCorrectionSeconds(
  decimalYear: number,
): number {
  if (!Number.isFinite(decimalYear)) {
    throw new RangeError("ΔT decimal year must be finite");
  }
  if (decimalYear >= 1955 && decimalYear <= 2005) {
    return 0;
  }
  const centuriesFrom1955 = (decimalYear - 1955) / 100;
  return (
    -0.910_72 *
    (DE44X_LUNAR_ACCELERATION_ARCSECONDS_PER_CENTURY_SQUARED -
      NASA_DELTA_T_LUNAR_ACCELERATION_ARCSECONDS_PER_CENTURY_SQUARED) *
    centuriesFrom1955 ** 2
  );
}

/**
 * Published long-range standard-error fit (seconds) for future ΔT.
 * It is used as a conservative growth envelope, not as a confidence claim.
 */
export function nasaFutureDeltaTUncertaintySeconds(
  decimalYear: number,
): number {
  if (!Number.isFinite(decimalYear)) {
    throw new RangeError("ΔT decimal year must be finite");
  }
  const elapsedYears = Math.max(0, decimalYear - 2005);
  return (
    (365.25 *
      elapsedYears *
      Math.sqrt(
        (elapsedYears * 0.058) / 3 *
          (1 + elapsedYears / 2_500),
      )) /
    1_000
  );
}

/**
 * Supplies TT−UT1 outside bundled IERS coverage.
 *
 * JavaScript Date retains the app's explicit UTC convention: pre-1972 uses
 * the documented TAI−UTC=0 approximation and dates after the announced leap-
 * second horizon keep the latest known TAI−UTC. DUT1 is allowed to diverge
 * from UTC and is derived from ΔT, keeping TT−UT1 physically consistent
 * without relabelling a UT1 instant as civil UTC.
 *
 * Dates in the bundled IERS EOP closed interval are rejected. A missing or
 * corrupt in-coverage lookup must fail closed instead of being disguised as
 * an out-of-coverage polynomial fallback.
 */
export function eventEarthRotationFallback(
  date: Date,
): EventEarthRotationFallback {
  assertValidDate(date);
  const dateMilliseconds = date.getTime();
  if (
    dateMilliseconds >= EVENT_EOP_FIRST_SAMPLE_MILLISECONDS &&
    dateMilliseconds <= EVENT_EOP_LAST_SAMPLE_MILLISECONDS
  ) {
    throw new RangeError(
      "Event earth-rotation fallback is unavailable inside bundled IERS EOP coverage",
    );
  }
  const decimalYear = nasaDeltaTDecimalYear(date);
  const anchorYear = nasaDeltaTDecimalYear(
    new Date(EVENT_EOP_LAST_SAMPLE_MILLISECONDS),
  );
  const isFuture =
    dateMilliseconds > EVENT_EOP_LAST_SAMPLE_MILLISECONDS;

  let deltaTSeconds: number;
  let deltaTUncertaintySeconds: number;
  let deltaTModel: string;
  let dominantContributors: readonly string[];
  let warnings: readonly string[];

  if (isFuture) {
    const anchorPolynomial =
      nasaDeltaTPolynomialSeconds(anchorYear);
    const anchorLunarAccelerationCorrection =
      de442sLunarAccelerationCorrectionSeconds(anchorYear);
    deltaTSeconds =
      EVENT_EOP_ANCHOR_DELTA_T_SECONDS +
      nasaDeltaTPolynomialSeconds(decimalYear) -
      anchorPolynomial +
      de442sLunarAccelerationCorrectionSeconds(decimalYear) -
      anchorLunarAccelerationCorrection;
    deltaTUncertaintySeconds =
      Math.abs(
        anchorPolynomial -
          EVENT_EOP_ANCHOR_DELTA_T_SECONDS,
      ) +
      Math.max(
        0,
        nasaFutureDeltaTUncertaintySeconds(decimalYear) -
          nasaFutureDeltaTUncertaintySeconds(anchorYear),
      ) +
      EVENT_EOP_ANCHOR_REPORTED_ERROR_SECONDS;
    deltaTModel =
      "NASA-2004-polynomial-anchored-to-IERS-EOP-2027-08-07";
    dominantContributors = Object.freeze([
      "NASA ΔT多項式（同梱IERS予測最終sampleへ連続補正）",
      "DE442s月永年加速度への補正",
      "将来の地球自転",
      "UTC制度はTAI−UTC=37秒固定シナリオ（数値幅外）",
      "極運動xp・ypを0と仮定",
    ]);
    warnings = Object.freeze([
      "IERS EOP収録後のため、地球自転はNASA ΔT多項式を同梱IERS予測最終sampleへ連続補正して予測しています。",
      "表示時刻はTAI−UTC=37秒を固定した連続UTCシナリオです。将来の公式UTC制度が異なる場合の差は、数値の時刻不確かさに含みません。",
      "極運動は0として計算しています。",
    ]);
  } else {
    deltaTSeconds =
      nasaDeltaTPolynomialSeconds(decimalYear) +
      de442sLunarAccelerationCorrectionSeconds(decimalYear);
    // NASA reports about 0.1 s near 1900 and below 0.1 s near 1950.
    // One second is retained as a conservative app-level model envelope.
    deltaTUncertaintySeconds = 1;
    deltaTModel = "NASA-2004-historical-polynomial-DE442s";
    dominantContributors = Object.freeze([
      "NASA ΔT多項式（IERS収録前）",
      "DE442s月永年加速度への補正",
      "1972年以前のUTCはTAI−UTC=0秒近似（数値幅外）",
      "極運動xp・ypを0と仮定",
    ]);
    warnings = Object.freeze([
      "IERS EOP収録前のため、地球自転はNASAの歴史的ΔT多項式で近似しています。",
      "1972年以前の表示時刻はTAI−UTC=0秒のproleptic UTC近似です。歴史的なUTC復元誤差は、数値の時刻不確かさに含みません。",
      "極運動は0として計算しています。",
    ]);
  }

  const assumedTaiMinusUtcSeconds =
    resolveTimeScales(date).taiMinusUtcSeconds;
  const dut1Seconds =
    assumedTaiMinusUtcSeconds +
    TT_MINUS_TAI_SECONDS -
    deltaTSeconds;

  return Object.freeze({
    deltaTSeconds,
    deltaTUncertaintySeconds,
    assumedTaiMinusUtcSeconds,
    dut1Seconds,
    earthOrientation: Object.freeze({
      dut1Seconds,
      dut1Source: "caller",
      dut1UncertaintySeconds: deltaTUncertaintySeconds,
      polarMotion: Object.freeze({
        source: "assumed-zero",
        xpRadians: 0,
        ypRadians: 0,
      }),
      taiMinusUtcSeconds: assumedTaiMinusUtcSeconds,
    }),
    eopId: isFuture
      ? "outside-IERS-coverage-future-delta-t-model"
      : "outside-IERS-coverage-historical-delta-t-model",
    deltaTModel,
    pathUncertaintyKilometers:
      EARTH_EQUATORIAL_ROTATION_KILOMETERS_PER_SECOND *
      deltaTUncertaintySeconds,
    dominantContributors,
    warnings,
  });
}
