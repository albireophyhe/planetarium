/*
 * This TypeScript derived work adapts the IAU SOFA 2023-10-11 C routines
 * pom00 and sp00. It is not software provided by or endorsed by SOFA.
 *
 * Differences from SOFA:
 * - immutable tuple matrices are returned instead of mutating C arrays;
 * - inputs are rejected outside conservative planetarium guardrails; and
 * - TT is accepted as one Julian Date because the supported 1900–2100 range
 *   does not need SOFA's arbitrary two-part representation at this accuracy.
 */
import {
  ARCSECONDS_TO_RADIANS,
  DAYS_PER_JULIAN_CENTURY,
  J2000_JULIAN_DATE
} from "./constants";
import {
  composeRotations,
  rotationX,
  rotationY,
  rotationZ
} from "./vector";
import type { Matrix3 } from "./vector";

const MAX_POLE_COORDINATE_RADIANS =
  10 * ARCSECONDS_TO_RADIANS;
const MAX_TIO_LOCATOR_RADIANS = ARCSECONDS_TO_RADIANS;

function assertPoleCoordinate(value: number, name: string): void {
  if (
    !Number.isFinite(value) ||
    Math.abs(value) > MAX_POLE_COORDINATE_RADIANS
  ) {
    throw new RangeError(
      `${name} must be finite and within ±10 arcseconds`
    );
  }
}

/**
 * Approximate the TIO locator s′ using the IERS/SOFA secular term
 * −47 microarcseconds per TT Julian century from J2000.0.
 */
export function approximateTioLocator(
  ttJulianDate: number
): number {
  if (!Number.isFinite(ttJulianDate)) {
    throw new RangeError("TT Julian Date must be finite");
  }
  const centuries =
    (ttJulianDate - J2000_JULIAN_DATE) /
    DAYS_PER_JULIAN_CENTURY;
  return -47e-6 * centuries * ARCSECONDS_TO_RADIANS;
}

/**
 * Form the IAU 2000 polar-motion matrix in the SOFA convention
 * V(ITRS) = matrix × V(TIRS/CIP).
 *
 * xp is measured along the 0° meridian and yp along 90° west.
 */
export function polarMotionMatrix2000(
  xpRadians: number,
  ypRadians: number,
  tioLocatorRadians: number
): Matrix3 {
  assertPoleCoordinate(xpRadians, "xp");
  assertPoleCoordinate(ypRadians, "yp");
  if (
    !Number.isFinite(tioLocatorRadians) ||
    Math.abs(tioLocatorRadians) > MAX_TIO_LOCATOR_RADIANS
  ) {
    throw new RangeError(
      "TIO locator must be finite and within ±1 arcsecond"
    );
  }

  // SOFA builds the matrix by Rz(s′), Ry(−xp), then Rx(−yp).
  return composeRotations(
    rotationZ(tioLocatorRadians),
    rotationY(-xpRadians),
    rotationX(-ypRadians)
  );
}
