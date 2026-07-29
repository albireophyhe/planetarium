export const TWO_PI = 2 * Math.PI;
export const J2000_JULIAN_DATE = 2_451_545;
export const DAYS_PER_JULIAN_CENTURY = 36_525;
export const DAYS_PER_JULIAN_YEAR = 365.25;
export const SECONDS_PER_DAY = 86_400;
export const ARCSECONDS_TO_RADIANS = Math.PI / (180 * 3_600);
export const MILLIARCSECONDS_TO_RADIANS =
  ARCSECONDS_TO_RADIANS / 1_000;
export const ASTRONOMICAL_UNIT_KILOMETERS = 149_597_870.7;
export const SPEED_OF_LIGHT_KILOMETERS_PER_SECOND = 299_792.458;
export const SPEED_OF_LIGHT_AU_PER_DAY =
  (SPEED_OF_LIGHT_KILOMETERS_PER_SECOND * SECONDS_PER_DAY) /
  ASTRONOMICAL_UNIT_KILOMETERS;
/**
 * Twice the solar gravitational radius in AU, named SRS in IAU SOFA.
 * Shared by the SOFA-derived annual-aberration and solar-deflection terms.
 */
export const SOLAR_SCHWARZSCHILD_RADIUS_AU = 1.97412574336e-8;

export function normalizeAngle(value: number): number {
  const normalized = value % TWO_PI;
  return normalized < 0 ? normalized + TWO_PI : normalized;
}

export function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function assertFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
  return value;
}
