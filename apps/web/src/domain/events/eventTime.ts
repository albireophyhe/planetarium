import {
  DAYS_PER_JULIAN_CENTURY,
  J2000_JULIAN_DATE,
  SECONDS_PER_DAY,
} from "../precision/constants";
import { resolveTimeScales } from "../precision/timeScales";

const UNIX_EPOCH_JULIAN_DATE = 2_440_587.5;
const MILLISECONDS_PER_DAY = 86_400_000;

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

export function utcDateToTdbJulianDate(date: Date): number {
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("UTC date must be valid");
  }
  return ttToTdbJulianDate(resolveTimeScales(date).ttJulianDate);
}

/**
 * Returns the proleptic-Gregorian year of a TDB-labelled Julian date.
 *
 * This deliberately does not convert TDB to UTC. Candidate chunks are
 * partitioned by their TDB calendar year, while their public filtering is
 * performed later against converted UTC instants.
 */
export function tdbCalendarYear(tdbJulianDate: number): number {
  if (!Number.isFinite(tdbJulianDate)) {
    throw new RangeError("TDB Julian date must be finite");
  }
  const tdbLabelMilliseconds =
    (tdbJulianDate - UNIX_EPOCH_JULIAN_DATE) *
    MILLISECONDS_PER_DAY;
  const year = new Date(tdbLabelMilliseconds).getUTCFullYear();
  if (!Number.isFinite(year)) {
    throw new RangeError("TDB Julian date is outside the Date range");
  }
  return year;
}

/**
 * Inverts this application's UTC→TT→TDB model for candidate seed times.
 *
 * Eclipse candidates are stored in TDB because that is DE442s' independent
 * variable. The returned UTC Date follows the same leap-second assumptions
 * as `resolveTimeScales`, so a round trip stays deterministic and the local
 * contact solver receives a correctly centered search window.
 */
export function tdbJulianDateToUtcDate(tdbJulianDate: number): Date {
  if (!Number.isFinite(tdbJulianDate)) {
    throw new RangeError("TDB Julian date must be finite");
  }

  let utcMilliseconds =
    (tdbJulianDate - UNIX_EPOCH_JULIAN_DATE) *
      MILLISECONDS_PER_DAY -
    69_184;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const candidate = new Date(utcMilliseconds);
    const computedTdb = ttToTdbJulianDate(
      resolveTimeScales(candidate).ttJulianDate,
    );
    const correctionMilliseconds =
      (tdbJulianDate - computedTdb) * MILLISECONDS_PER_DAY;
    utcMilliseconds += correctionMilliseconds;
    if (Math.abs(correctionMilliseconds) < 0.001) {
      break;
    }
  }

  const result = new Date(utcMilliseconds);
  if (!Number.isFinite(result.getTime())) {
    throw new RangeError("TDB Julian date is outside the Date range");
  }
  return result;
}
