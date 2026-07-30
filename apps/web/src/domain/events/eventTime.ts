import {
  DAYS_PER_JULIAN_CENTURY,
  J2000_JULIAN_DATE,
  SECONDS_PER_DAY,
} from "../precision/constants";

/**
 * Compact geocentric TT→TDB approximation.
 *
 * The dominant annual terms keep DE evaluation within roughly 0.1 ms of a
 * full Fairhead-Bretagnon implementation for this application's event timing
 * needs. Observer-dependent topocentric TDB terms are below the current
 * average-lunar-limb error budget and are tracked as an omitted correction.
 */
export function tdbMinusTtSeconds(ttJulianDate: number): number {
  if (!Number.isFinite(ttJulianDate)) {
    throw new RangeError("TT Julian date must be finite");
  }
  const centuries =
    (ttJulianDate - J2000_JULIAN_DATE) / DAYS_PER_JULIAN_CENTURY;
  const meanAnomaly =
    (357.527_723_3 + 35_999.050_34 * centuries) * (Math.PI / 180);
  return (
    0.001_657 * Math.sin(meanAnomaly) +
    0.000_013_85 * Math.sin(2 * meanAnomaly)
  );
}
export function ttToTdbJulianDate(ttJulianDate: number): number {
  return ttJulianDate + tdbMinusTtSeconds(ttJulianDate) / SECONDS_PER_DAY;
}
