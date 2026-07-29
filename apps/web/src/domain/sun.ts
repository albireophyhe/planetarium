import {
  degreesToRadians,
  normalizeDegrees,
  normalizeRadians
} from "./angles";
import {
  equatorialToHorizontal,
  julianDate
} from "./coordinates";
import type {
  EquatorialCoordinates,
  HorizontalCoordinates,
  ObservingLocation,
  TwilightPhase
} from "./types";
import { assertSupportedObservationDate } from "./observationDate";

const J2000_JULIAN_DATE = 2_451_545;

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/**
 * Low-precision apparent geocentric solar coordinates. The approximation is
 * sufficient for classifying daylight and twilight in this application.
 */
export function sunEquatorial(
  dateOrJulianDate: Date | number
): EquatorialCoordinates {
  const jd =
    dateOrJulianDate instanceof Date
      ? julianDate(assertSupportedObservationDate(dateOrJulianDate))
      : dateOrJulianDate;
  if (!Number.isFinite(jd)) {
    throw new RangeError("Solar Julian date must be finite");
  }
  const daysSinceJ2000 = jd - J2000_JULIAN_DATE;
  const meanLongitude = normalizeDegrees(
    280.46 + 0.9856474 * daysSinceJ2000
  );
  const meanAnomaly = degreesToRadians(
    normalizeDegrees(357.528 + 0.9856003 * daysSinceJ2000)
  );
  const eclipticLongitude = degreesToRadians(
    normalizeDegrees(
      meanLongitude +
        1.915 * Math.sin(meanAnomaly) +
        0.02 * Math.sin(2 * meanAnomaly)
    )
  );
  const obliquity = degreesToRadians(
    23.439 - 0.0000004 * daysSinceJ2000
  );
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude)
  );

  const result = {
    rightAscension: normalizeRadians(rightAscension),
    declination: Math.asin(
      clampUnit(Math.sin(obliquity) * Math.sin(eclipticLongitude))
    )
  };
  if (
    !Number.isFinite(result.rightAscension) ||
    !Number.isFinite(result.declination)
  ) {
    throw new RangeError("Solar coordinate calculation was not finite");
  }
  return result;
}

export function sunHorizontal(
  date: Date,
  location: ObservingLocation
): HorizontalCoordinates {
  return equatorialToHorizontal(sunEquatorial(date), date, location);
}

export function twilightPhase(
  altitudeOrCoordinates: number | HorizontalCoordinates
): TwilightPhase {
  const altitude =
    typeof altitudeOrCoordinates === "number"
      ? altitudeOrCoordinates
      : altitudeOrCoordinates.altitude;
  if (!Number.isFinite(altitude)) {
    throw new RangeError("Solar altitude must be finite");
  }
  if (altitude < -Math.PI / 2 || altitude > Math.PI / 2) {
    throw new RangeError(
      "Solar altitude must be between -π/2 and π/2 radians"
    );
  }

  if (altitude >= 0) {
    return "day";
  }
  if (altitude >= degreesToRadians(-6)) {
    return "civil";
  }
  if (altitude >= degreesToRadians(-12)) {
    return "nautical";
  }
  if (altitude >= degreesToRadians(-18)) {
    return "astronomical";
  }
  return "night";
}
