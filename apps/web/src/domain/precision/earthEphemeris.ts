/*
 * This TypeScript module uses coefficients and computations derived from the
 * IAU SOFA ANSI C 2023-10-11 epv00 routine. It is not software provided by
 * or endorsed by SOFA.
 *
 * Differences from the original routine:
 * - only the heliocentric Sun-to-Earth position is evaluated;
 * - 100 of 1,323 position terms are retained using the documented
 *   century-wide contribution rule in the shared canonical artifact;
 * - TT is used as a TDB proxy;
 * - the implementation and identifiers are native TypeScript.
 *
 * The complete derived-work notice and SOFA Software License are distributed
 * at shared/licenses/IAU-SOFA-derived-work-notice.md.
 */
import ephemerisArtifact from "../../../../../shared/ephemeris/truncated-earth-heliocentric.v1.json";
import {
  DAYS_PER_JULIAN_YEAR,
  J2000_JULIAN_DATE,
} from "./constants";
import { multiplyMatrixVector } from "./vector";
import type { Matrix3, Vector3 } from "./vector";

type HarmonicTerm = readonly [
  amplitudeAu: number,
  phaseRadians: number,
  frequencyRadiansPerJulianYear: number,
];

type EphemerisSeries = Readonly<
  Record<
    | "e0x"
    | "e0y"
    | "e0z"
    | "e1x"
    | "e1y"
    | "e1z"
    | "e2x"
    | "e2y"
    | "e2z",
    readonly HarmonicTerm[]
  >
>;

const series =
  ephemerisArtifact.series as unknown as EphemerisSeries;
const bcrsOrientationMatrix =
  ephemerisArtifact.bcrsOrientationMatrix as unknown as Matrix3;

export interface TruncatedEarthHeliocentricState {
  readonly positionAu: Vector3;
  readonly velocityAuPerDay: Vector3;
}

interface EvaluatedTerms {
  readonly positionAu: number;
  readonly derivativeAuPerJulianYear: number;
}

function evaluateTerms(
  terms: readonly HarmonicTerm[],
  julianYearsSinceJ2000: number,
): EvaluatedTerms {
  let positionAu = 0;
  let derivativeAuPerJulianYear = 0;
  for (const [amplitude, phase, frequency] of terms) {
    const argument = phase + frequency * julianYearsSinceJ2000;
    positionAu += amplitude * Math.cos(argument);
    derivativeAuPerJulianYear -=
      amplitude * frequency * Math.sin(argument);
  }
  return { positionAu, derivativeAuPerJulianYear };
}

function evaluateComponent(
  axis: "x" | "y" | "z",
  julianYearsSinceJ2000: number,
): EvaluatedTerms {
  const constant = evaluateTerms(
    series[`e0${axis}`],
    julianYearsSinceJ2000,
  );
  const linear = evaluateTerms(
    series[`e1${axis}`],
    julianYearsSinceJ2000,
  );
  const quadratic = evaluateTerms(
    series[`e2${axis}`],
    julianYearsSinceJ2000,
  );
  const t = julianYearsSinceJ2000;
  return {
    positionAu:
      constant.positionAu +
      t * linear.positionAu +
      t * t * quadratic.positionAu,
    derivativeAuPerJulianYear:
      constant.derivativeAuPerJulianYear +
      linear.positionAu +
      t * linear.derivativeAuPerJulianYear +
      2 * t * quadratic.positionAu +
      t * t * quadratic.derivativeAuPerJulianYear,
  };
}

/**
 * Heliocentric Sun-to-Earth position and analytic velocity in BCRS-oriented
 * axes. The coefficient truncation is audited for the app's 1900–2100
 * support interval; callers must not use it as a general-purpose ephemeris.
 */
export function truncatedEarthHeliocentricState(
  ttJulianDate: number,
): TruncatedEarthHeliocentricState {
  if (!Number.isFinite(ttJulianDate)) {
    throw new RangeError("TT Julian date must be finite");
  }
  const julianYearsSinceJ2000 =
    (ttJulianDate - J2000_JULIAN_DATE) / DAYS_PER_JULIAN_YEAR;
  const x = evaluateComponent("x", julianYearsSinceJ2000);
  const y = evaluateComponent("y", julianYearsSinceJ2000);
  const z = evaluateComponent("z", julianYearsSinceJ2000);
  const positionAu = multiplyMatrixVector(
    bcrsOrientationMatrix,
    [x.positionAu, y.positionAu, z.positionAu],
  );
  const velocityAuPerDay = multiplyMatrixVector(
    bcrsOrientationMatrix,
    [
      x.derivativeAuPerJulianYear / DAYS_PER_JULIAN_YEAR,
      y.derivativeAuPerJulianYear / DAYS_PER_JULIAN_YEAR,
      z.derivativeAuPerJulianYear / DAYS_PER_JULIAN_YEAR,
    ],
  );
  return {
    positionAu,
    velocityAuPerDay,
  };
}

export function truncatedEarthHeliocentricPosition(
  ttJulianDate: number,
): Vector3 {
  return truncatedEarthHeliocentricState(ttJulianDate).positionAu;
}
