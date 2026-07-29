import {
  degreesToRadians,
  normalizeDegrees,
  normalizeRadians
} from "./angles";
import type {
  CalculatedStarPosition,
  EquatorialCoordinates,
  HorizontalCoordinates,
  ObservingLocation,
  ProjectedPoint,
  Star
} from "./types";
import { assertSupportedObservationDate } from "./observationDate";
import { assertValidObservingLocation } from "./validation";

const J2000_JULIAN_DATE = 2_451_545;
const DAYS_PER_JULIAN_CENTURY = 36_525;
const ARCSECONDS_PER_RADIAN = (180 * 3_600) / Math.PI;

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function toJulianDate(value: Date | number): number {
  const result = value instanceof Date ? julianDate(value) : value;
  if (!Number.isFinite(result)) {
    throw new RangeError("Invalid Julian date");
  }
  return result;
}

export function julianDate(date: Date): number {
  const milliseconds = date.getTime();
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError("Invalid date");
  }
  return milliseconds / 86_400_000 + 2_440_587.5;
}

/**
 * Greenwich mean sidereal time in radians, normalized to [0, 2π).
 *
 * The input may be a Julian date or a JavaScript Date.
 */
export function greenwichMeanSiderealTime(
  dateOrJulianDate: Date | number
): number {
  const jd = toJulianDate(dateOrJulianDate);
  const centuries = (jd - J2000_JULIAN_DATE) / DAYS_PER_JULIAN_CENTURY;
  const degrees = normalizeDegrees(
    280.46061837 +
      360.98564736629 * (jd - J2000_JULIAN_DATE) +
      0.000387933 * centuries * centuries -
      (centuries * centuries * centuries) / 38_710_000
  );
  return degreesToRadians(degrees);
}

/**
 * Precess J2000 mean equatorial coordinates to the requested date using the
 * IAU 1976 model. This accuracy is appropriate for this naked-eye catalogue.
 */
export function precessJ2000(
  coordinates: EquatorialCoordinates,
  dateOrJulianDate: Date | number
): EquatorialCoordinates {
  const jd = toJulianDate(dateOrJulianDate);
  const centuries = (jd - J2000_JULIAN_DATE) / DAYS_PER_JULIAN_CENTURY;
  const centuriesSquared = centuries * centuries;
  const centuriesCubed = centuriesSquared * centuries;

  const zeta =
    (2306.2181 * centuries +
      0.30188 * centuriesSquared +
      0.017998 * centuriesCubed) /
    ARCSECONDS_PER_RADIAN;
  const z =
    (2306.2181 * centuries +
      1.09468 * centuriesSquared +
      0.018203 * centuriesCubed) /
    ARCSECONDS_PER_RADIAN;
  const theta =
    (2004.3109 * centuries -
      0.42665 * centuriesSquared -
      0.041833 * centuriesCubed) /
    ARCSECONDS_PER_RADIAN;

  const shiftedRightAscension = coordinates.rightAscension + zeta;
  const cosineDeclination = Math.cos(coordinates.declination);
  const a = cosineDeclination * Math.sin(shiftedRightAscension);
  const b =
    Math.cos(theta) *
      cosineDeclination *
      Math.cos(shiftedRightAscension) -
    Math.sin(theta) * Math.sin(coordinates.declination);
  const c =
    Math.sin(theta) *
      cosineDeclination *
      Math.cos(shiftedRightAscension) +
    Math.cos(theta) * Math.sin(coordinates.declination);

  return {
    rightAscension: normalizeRadians(Math.atan2(a, b) + z),
    declination: Math.asin(clampUnit(c))
  };
}

/**
 * Convert mean equatorial coordinates to the observer's horizontal frame.
 * Refraction, terrain, and weather are deliberately not applied.
 */
export function equatorialToHorizontal(
  coordinates: EquatorialCoordinates,
  date: Date,
  location: ObservingLocation
): HorizontalCoordinates {
  assertSupportedObservationDate(date);
  const validLocation = assertValidObservingLocation(location);
  const latitude = degreesToRadians(validLocation.latitude);
  const longitude = degreesToRadians(validLocation.longitude);
  const localSiderealTime =
    greenwichMeanSiderealTime(date) + longitude;
  const hourAngle = normalizeRadians(
    localSiderealTime - coordinates.rightAscension + Math.PI
  ) - Math.PI;

  const cosineDeclination = Math.cos(coordinates.declination);
  const east = -cosineDeclination * Math.sin(hourAngle);
  const north =
    Math.cos(latitude) * Math.sin(coordinates.declination) -
    Math.sin(latitude) * cosineDeclination * Math.cos(hourAngle);
  const up =
    Math.sin(latitude) * Math.sin(coordinates.declination) +
    Math.cos(latitude) * cosineDeclination * Math.cos(hourAngle);
  const horizontalMagnitude = Math.hypot(east, north);
  const azimuthDefined = horizontalMagnitude > 1e-12;

  return {
    altitude: Math.asin(clampUnit(up)),
    azimuth: azimuthDefined
      ? normalizeRadians(Math.atan2(east, north))
      : 0,
    azimuthDefined
  };
}

/**
 * Zenith-centred azimuthal equidistant projection. The mathematical horizon
 * is the unit circle; objects below it have radius greater than one.
 */
export function horizontalToProjection(
  coordinates: HorizontalCoordinates
): ProjectedPoint {
  const radius = (Math.PI / 2 - coordinates.altitude) / (Math.PI / 2);
  return {
    x: radius * Math.sin(coordinates.azimuth),
    y: -radius * Math.cos(coordinates.azimuth),
    radius
  };
}

export function calculateStarPosition(
  star: Star,
  date: Date,
  location: ObservingLocation
): CalculatedStarPosition {
  const equatorial = precessJ2000(
    {
      rightAscension: star.raRad,
      declination: star.decRad
    },
    date
  );
  const horizontal = equatorialToHorizontal(equatorial, date, location);
  return {
    equatorial,
    horizontal,
    projection: horizontalToProjection(horizontal)
  };
}
