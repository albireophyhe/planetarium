/*
 * This is a TypeScript derived work based on computations in the IAU SOFA
 * 2023-10-11 C routines nut00b, obl06, pfw06, fw2m, era00 and gmst06.
 * It is not software provided by or endorsed by SOFA. Differences from the
 * originals are documented in SOFA-NOTICE.md and astronomy-model-v2.md.
 */
import type { EquatorialCoordinates } from "../types";
import {
  ARCSECONDS_TO_RADIANS,
  DAYS_PER_JULIAN_CENTURY,
  J2000_JULIAN_DATE,
  MILLIARCSECONDS_TO_RADIANS,
  TWO_PI,
  assertFinite,
  normalizeAngle
} from "./constants";
import {
  composeRotations,
  equatorialToVector,
  multiplyMatrixVector,
  rotationX,
  rotationZ,
  vectorToEquatorial
} from "./vector";
import type { Matrix3 } from "./vector";

type NutationTerm = readonly [
  moonAnomaly: number,
  sunAnomaly: number,
  moonLatitude: number,
  elongation: number,
  ascendingNode: number,
  longitudeSine: number,
  longitudeSineRate: number,
  longitudeCosine: number,
  obliquityCosine: number,
  obliquityCosineRate: number,
  obliquitySine: number
];

/*
 * MHB_2000_SHORT, 77 luni-solar terms. Coefficients are in 0.1 µas and
 * 0.1 µas/Julian-century, as in the SOFA 2023-10-11 implementation.
 */
const NUTATION_2000B_TERMS: readonly NutationTerm[] = [
  [0, 0, 0, 0, 1, -172064161, -174666, 33386, 92052331, 9086, 15377],
  [0, 0, 2, -2, 2, -13170906, -1675, -13696, 5730336, -3015, -4587],
  [0, 0, 2, 0, 2, -2276413, -234, 2796, 978459, -485, 1374],
  [0, 0, 0, 0, 2, 2074554, 207, -698, -897492, 470, -291],
  [0, 1, 0, 0, 0, 1475877, -3633, 11817, 73871, -184, -1924],
  [0, 1, 2, -2, 2, -516821, 1226, -524, 224386, -677, -174],
  [1, 0, 0, 0, 0, 711159, 73, -872, -6750, 0, 358],
  [0, 0, 2, 0, 1, -387298, -367, 380, 200728, 18, 318],
  [1, 0, 2, 0, 2, -301461, -36, 816, 129025, -63, 367],
  [0, -1, 2, -2, 2, 215829, -494, 111, -95929, 299, 132],
  [0, 0, 2, -2, 1, 128227, 137, 181, -68982, -9, 39],
  [-1, 0, 2, 0, 2, 123457, 11, 19, -53311, 32, -4],
  [-1, 0, 0, 2, 0, 156994, 10, -168, -1235, 0, 82],
  [1, 0, 0, 0, 1, 63110, 63, 27, -33228, 0, -9],
  [-1, 0, 0, 0, 1, -57976, -63, -189, 31429, 0, -75],
  [-1, 0, 2, 2, 2, -59641, -11, 149, 25543, -11, 66],
  [1, 0, 2, 0, 1, -51613, -42, 129, 26366, 0, 78],
  [-2, 0, 2, 0, 1, 45893, 50, 31, -24236, -10, 20],
  [0, 0, 0, 2, 0, 63384, 11, -150, -1220, 0, 29],
  [0, 0, 2, 2, 2, -38571, -1, 158, 16452, -11, 68],
  [0, -2, 2, -2, 2, 32481, 0, 0, -13870, 0, 0],
  [-2, 0, 0, 2, 0, -47722, 0, -18, 477, 0, -25],
  [2, 0, 2, 0, 2, -31046, -1, 131, 13238, -11, 59],
  [1, 0, 2, -2, 2, 28593, 0, -1, -12338, 10, -3],
  [-1, 0, 2, 0, 1, 20441, 21, 10, -10758, 0, -3],
  [2, 0, 0, 0, 0, 29243, 0, -74, -609, 0, 13],
  [0, 0, 2, 0, 0, 25887, 0, -66, -550, 0, 11],
  [0, 1, 0, 0, 1, -14053, -25, 79, 8551, -2, -45],
  [-1, 0, 0, 2, 1, 15164, 10, 11, -8001, 0, -1],
  [0, 2, 2, -2, 2, -15794, 72, -16, 6850, -42, -5],
  [0, 0, -2, 2, 0, 21783, 0, 13, -167, 0, 13],
  [1, 0, 0, -2, 1, -12873, -10, -37, 6953, 0, -14],
  [0, -1, 0, 0, 1, -12654, 11, 63, 6415, 0, 26],
  [-1, 0, 2, 2, 1, -10204, 0, 25, 5222, 0, 15],
  [0, 2, 0, 0, 0, 16707, -85, -10, 168, -1, 10],
  [1, 0, 2, 2, 2, -7691, 0, 44, 3268, 0, 19],
  [-2, 0, 2, 0, 0, -11024, 0, -14, 104, 0, 2],
  [0, 1, 2, 0, 2, 7566, -21, -11, -3250, 0, -5],
  [0, 0, 2, 2, 1, -6637, -11, 25, 3353, 0, 14],
  [0, -1, 2, 0, 2, -7141, 21, 8, 3070, 0, 4],
  [0, 0, 0, 2, 1, -6302, -11, 2, 3272, 0, 4],
  [1, 0, 2, -2, 1, 5800, 10, 2, -3045, 0, -1],
  [2, 0, 2, -2, 2, 6443, 0, -7, -2768, 0, -4],
  [-2, 0, 0, 2, 1, -5774, -11, -15, 3041, 0, -5],
  [2, 0, 2, 0, 1, -5350, 0, 21, 2695, 0, 12],
  [0, -1, 2, -2, 1, -4752, -11, -3, 2719, 0, -3],
  [0, 0, 0, -2, 1, -4940, -11, -21, 2720, 0, -9],
  [-1, -1, 0, 2, 0, 7350, 0, -8, -51, 0, 4],
  [2, 0, 0, -2, 1, 4065, 0, 6, -2206, 0, 1],
  [1, 0, 0, 2, 0, 6579, 0, -24, -199, 0, 2],
  [0, 1, 2, -2, 1, 3579, 0, 5, -1900, 0, 1],
  [1, -1, 0, 0, 0, 4725, 0, -6, -41, 0, 3],
  [-2, 0, 2, 0, 2, -3075, 0, -2, 1313, 0, -1],
  [3, 0, 2, 0, 2, -2904, 0, 15, 1233, 0, 7],
  [0, -1, 0, 2, 0, 4348, 0, -10, -81, 0, 2],
  [1, -1, 2, 0, 2, -2878, 0, 8, 1232, 0, 4],
  [0, 0, 0, 1, 0, -4230, 0, 5, -20, 0, -2],
  [-1, -1, 2, 2, 2, -2819, 0, 7, 1207, 0, 3],
  [-1, 0, 2, 0, 0, -4056, 0, 5, 40, 0, -2],
  [0, -1, 2, 2, 2, -2647, 0, 11, 1129, 0, 5],
  [-2, 0, 0, 0, 1, -2294, 0, -10, 1266, 0, -4],
  [1, 1, 2, 0, 2, 2481, 0, -7, -1062, 0, -3],
  [2, 0, 0, 0, 1, 2179, 0, -2, -1129, 0, -2],
  [-1, 1, 0, 1, 0, 3276, 0, 1, -9, 0, 0],
  [1, 1, 0, 0, 0, -3389, 0, 5, 35, 0, -2],
  [1, 0, 2, 0, 0, 3339, 0, -13, -107, 0, 1],
  [-1, 0, 2, -2, 1, -1987, 0, -6, 1073, 0, -2],
  [1, 0, 0, 0, 2, -1981, 0, 0, 854, 0, 0],
  [-1, 0, 0, 1, 0, 4026, 0, -353, -553, 0, -139],
  [0, 0, 2, 1, 2, 1660, 0, -5, -710, 0, -2],
  [-1, 0, 2, 4, 2, -1521, 0, 9, 647, 0, 4],
  [-1, 1, 0, 1, 1, 1314, 0, 0, -700, 0, 0],
  [0, -2, 2, -2, 1, -1283, 0, 0, 672, 0, 0],
  [1, 0, 2, 2, 1, -1331, 0, 8, 663, 0, 4],
  [-2, 0, 2, 2, 2, 1383, 0, -2, -594, 0, -2],
  [-1, 0, 0, 0, 2, 1405, 0, 4, -610, 0, 2],
  [1, 1, 2, -2, 2, 1290, 0, 0, -556, 0, 0]
];

export interface NutationAngles {
  readonly longitude: number;
  readonly obliquity: number;
}

export interface FukushimaWilliamsAngles {
  readonly gamma: number;
  readonly phi: number;
  readonly psi: number;
  readonly obliquity: number;
}

export interface PreparedEarthOrientation2006B {
  readonly precessionNutationMatrix: Matrix3;
  readonly greenwichApparentSiderealTime: number;
}

function julianCenturies(ttJulianDate: number): number {
  return (
    (assertFinite(ttJulianDate, "TT Julian date") -
      J2000_JULIAN_DATE) /
    DAYS_PER_JULIAN_CENTURY
  );
}

export function meanObliquity2006(ttJulianDate: number): number {
  const t = julianCenturies(ttJulianDate);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  return (
    (84_381.406 -
      46.836769 * t -
      0.0001831 * t2 +
      0.0020034 * t3 -
      0.000000576 * t4 -
      0.0000000434 * t5) *
    ARCSECONDS_TO_RADIANS
  );
}

export function nutation2000B(ttJulianDate: number): NutationAngles {
  const t = julianCenturies(ttJulianDate);
  const turnArcseconds = 1_296_000;
  const arcsecondArgument = (base: number, rate: number): number =>
    ((base + rate * t) % turnArcseconds) * ARCSECONDS_TO_RADIANS;

  const moonAnomaly = arcsecondArgument(
    485_868.249036,
    1_717_915_923.2178
  );
  const sunAnomaly = arcsecondArgument(
    1_287_104.79305,
    129_596_581.0481
  );
  const moonLatitude = arcsecondArgument(
    335_779.526232,
    1_739_527_262.8478
  );
  const elongation = arcsecondArgument(
    1_072_260.70369,
    1_602_961_601.209
  );
  const ascendingNode = arcsecondArgument(
    450_160.398036,
    -6_962_890.5431
  );

  let longitude = 0;
  let obliquity = 0;
  for (let index = NUTATION_2000B_TERMS.length - 1; index >= 0; index -= 1) {
    const term = NUTATION_2000B_TERMS[index];
    const argument =
      (term[0] * moonAnomaly +
        term[1] * sunAnomaly +
        term[2] * moonLatitude +
        term[3] * elongation +
        term[4] * ascendingNode) %
      TWO_PI;
    const sine = Math.sin(argument);
    const cosine = Math.cos(argument);
    longitude +=
      (term[5] + term[6] * t) * sine + term[7] * cosine;
    obliquity +=
      (term[8] + term[9] * t) * cosine + term[10] * sine;
  }

  const unitsToRadians = ARCSECONDS_TO_RADIANS / 10_000_000;
  return {
    longitude:
      longitude * unitsToRadians -
      0.135 * MILLIARCSECONDS_TO_RADIANS,
    obliquity:
      obliquity * unitsToRadians +
      0.388 * MILLIARCSECONDS_TO_RADIANS
  };
}

export function fukushimaWilliams2006(
  ttJulianDate: number
): FukushimaWilliamsAngles {
  const t = julianCenturies(ttJulianDate);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  const gamma =
    (-0.052928 +
      10.556378 * t +
      0.4932044 * t2 -
      0.00031238 * t3 -
      0.000002788 * t4 +
      0.000000026 * t5) *
    ARCSECONDS_TO_RADIANS;
  const phi =
    (84_381.412819 +
      -46.811016 * t +
      0.0511268 * t2 +
      0.00053289 * t3 -
      0.00000044 * t4 -
      0.0000000176 * t5) *
    ARCSECONDS_TO_RADIANS;
  const psi =
    (-0.041775 +
      5_038.481484 * t +
      1.5584175 * t2 -
      0.00018522 * t3 -
      0.000026452 * t4 -
      0.0000000148 * t5) *
    ARCSECONDS_TO_RADIANS;
  return {
    gamma,
    phi,
    psi,
    obliquity: meanObliquity2006(ttJulianDate)
  };
}

/**
 * GCRS-like J2000 to true equator/equinox-of-date matrix. The deliberate
 * v2 compromise is IAU 2006 bias/precession combined with the abridged
 * IAU 2000B nutation rather than the full, formally matched 2000A series.
 */
export function precessionNutationMatrix2006B(
  ttJulianDate: number
): Matrix3 {
  const angles = fukushimaWilliams2006(ttJulianDate);
  const nutation = nutation2000B(ttJulianDate);
  return matrixFromFukushimaWilliamsAndNutation(angles, nutation);
}

function matrixFromFukushimaWilliamsAndNutation(
  angles: FukushimaWilliamsAngles,
  nutation: NutationAngles
): Matrix3 {
  return composeRotations(
    rotationZ(angles.gamma),
    rotationX(angles.phi),
    rotationZ(-angles.psi - nutation.longitude),
    rotationX(-angles.obliquity - nutation.obliquity)
  );
}

export function applyPrecessionNutation2006B(
  coordinates: EquatorialCoordinates,
  ttJulianDate: number
): EquatorialCoordinates {
  return vectorToEquatorial(
    multiplyMatrixVector(
      precessionNutationMatrix2006B(ttJulianDate),
      equatorialToVector(coordinates)
    )
  );
}

/**
 * Earth Rotation Angle, IAU 2000 expression used by the IAU 2006 sidereal
 * model. Supplying UT1 rather than UTC is significant.
 */
export function earthRotationAngle(ut1JulianDate: number): number {
  const daysSinceJ2000 =
    assertFinite(ut1JulianDate, "UT1 Julian date") -
    J2000_JULIAN_DATE;
  const fraction = daysSinceJ2000 % 1;
  return normalizeAngle(
    TWO_PI *
      (fraction +
        0.779057273264 +
        0.00273781191135448 * daysSinceJ2000)
  );
}

export function greenwichMeanSiderealTime2006(
  ut1JulianDate: number,
  ttJulianDate: number
): number {
  const t = julianCenturies(ttJulianDate);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  const polynomialArcseconds =
    0.014506 +
    4_612.156534 * t +
    1.3915817 * t2 -
    0.00000044 * t3 -
    0.000029956 * t4 -
    0.0000000368 * t5;
  return normalizeAngle(
    earthRotationAngle(ut1JulianDate) +
      polynomialArcseconds * ARCSECONDS_TO_RADIANS
  );
}

/**
 * Apparent sidereal time for the v2 abridged model. The complementary terms
 * in the equation of the equinoxes are deliberately omitted and measured
 * against the official SOFA C oracle in the v2 accuracy fixture.
 */
export function greenwichApparentSiderealTime2006B(
  ut1JulianDate: number,
  ttJulianDate: number
): number {
  const nutation = nutation2000B(ttJulianDate);
  return normalizeAngle(
    greenwichMeanSiderealTime2006(ut1JulianDate, ttJulianDate) +
      nutation.longitude * Math.cos(meanObliquity2006(ttJulianDate))
  );
}

/**
 * Prepare both products used by a rendered frame while evaluating the
 * 77-term nutation series and Fukushima-Williams angles only once.
 */
export function prepareEarthOrientation2006B(
  ut1JulianDate: number,
  ttJulianDate: number
): PreparedEarthOrientation2006B {
  const angles = fukushimaWilliams2006(ttJulianDate);
  const nutation = nutation2000B(ttJulianDate);
  return {
    precessionNutationMatrix:
      matrixFromFukushimaWilliamsAndNutation(angles, nutation),
    greenwichApparentSiderealTime: normalizeAngle(
      greenwichMeanSiderealTime2006(
        ut1JulianDate,
        ttJulianDate
      ) +
        nutation.longitude * Math.cos(angles.obliquity)
    )
  };
}
