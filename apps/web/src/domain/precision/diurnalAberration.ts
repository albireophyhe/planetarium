/*
 * This TypeScript derived work uses computations from the IAU SOFA
 * 2023-10-11 C routines gd2gc, apio, pvtob and atioq.  It is not software
 * provided by or endorsed by SOFA.
 *
 * Differences from SOFA:
 * - the API accepts explicit ITRS and local East-North-Up vectors;
 * - WGS84 site position and rotational speed are evaluated directly rather
 *   than constructing the complete terrestrial-station PV vector;
 * - polar motion, the TIO locator, Earth rotation and refraction remain the
 *   caller's responsibility; and
 * - atioq's common first-order scale factor is replaced by an explicit final
 *   normalization, which leaves the direction unchanged.
 *
 * This is intentionally SOFA's conventional split-at-CIRS, first-order
 * diurnal-aberration correction.  A future end-to-end relativistic pipeline
 * must instead combine terrestrial rotational velocity with the geocenter's
 * barycentric velocity and apply aberration once before precession-nutation.
 */
import {
  ASTRONOMICAL_UNIT_KILOMETERS,
  SECONDS_PER_DAY,
  SPEED_OF_LIGHT_KILOMETERS_PER_SECOND,
  TWO_PI,
} from "./constants";
import { normalizeVector } from "./vector";
import type { Vector3 } from "./vector";

export type HorizontalEnuVector = readonly [
  east: number,
  north: number,
  up: number,
];

const WGS84_SEMI_MAJOR_AXIS_METERS = 6_378_137;
const WGS84_FLATTENING = 1 / 298.257_223_563;
const WGS84_ECCENTRICITY_SQUARED = WGS84_FLATTENING * (2 - WGS84_FLATTENING);
const EARTH_ROTATION_RADIANS_PER_UT1_SECOND =
  (1.002_737_811_911_354_6 * TWO_PI) / SECONDS_PER_DAY;
const SPEED_OF_LIGHT_METERS_PER_SECOND =
  SPEED_OF_LIGHT_KILOMETERS_PER_SECOND * 1_000;
const METERS_TO_ASTRONOMICAL_UNITS = 1 / (ASTRONOMICAL_UNIT_KILOMETERS * 1_000);

function wgs84PrimeVerticalRadiusMeters(
  geodeticLatitudeRadians: number,
): number {
  const latitudeSine = Math.sin(geodeticLatitudeRadians);
  return (
    WGS84_SEMI_MAJOR_AXIS_METERS /
    Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * latitudeSine * latitudeSine)
  );
}

function assertWgs84Observer(
  geodeticLatitudeRadians: number,
  heightMeters: number,
): number {
  if (
    !Number.isFinite(geodeticLatitudeRadians) ||
    Math.abs(geodeticLatitudeRadians) > Math.PI / 2
  ) {
    throw new RangeError("Geodetic latitude must be finite and within ±π/2");
  }
  if (!Number.isFinite(heightMeters)) {
    throw new RangeError("WGS84 ellipsoid height must be finite");
  }
  const primeVerticalRadius = wgs84PrimeVerticalRadiusMeters(
    geodeticLatitudeRadians,
  );
  if (primeVerticalRadius + heightMeters <= 0) {
    throw new RangeError(
      "WGS84 ellipsoid height places the observer beyond Earth's axis",
    );
  }
  return primeVerticalRadius;
}

/**
 * Magnitude |v|/c of a WGS84 observer's rotational velocity.
 *
 * Latitude is geodetic, not geocentric. Height is measured above the WGS84
 * reference ellipsoid. At the repository's current location precision,
 * heightMeters=0 is the explicit approximation.
 */
export function diurnalAberrationMagnitude(
  geodeticLatitudeRadians: number,
  heightMeters = 0,
): number {
  const primeVerticalRadius = assertWgs84Observer(
    geodeticLatitudeRadians,
    heightMeters,
  );
  const distanceFromRotationAxis =
    (primeVerticalRadius + heightMeters) * Math.cos(geodeticLatitudeRadians);
  const magnitude =
    Math.abs(EARTH_ROTATION_RADIANS_PER_UT1_SECOND * distanceFromRotationAxis) /
    SPEED_OF_LIGHT_METERS_PER_SECOND;
  if (!Number.isFinite(magnitude) || magnitude >= 1) {
    throw new RangeError(
      "Diurnal-aberration magnitude must be finite and in [0, 1)",
    );
  }
  return magnitude;
}

/**
 * WGS84 geodetic site position in the International Terrestrial Reference
 * System, expressed in astronomical units.
 *
 * This is the geodetic-to-geocentric part of SOFA `gd2gc`/`pvtob`. Earth
 * rotation and polar motion are deliberately absent because the precision
 * pipeline has already rotated the solar direction into ITRS before using
 * this vector.
 */
export function wgs84ObserverPositionItrsAu(
  geodeticLatitudeRadians: number,
  longitudeRadians: number,
  heightMeters = 0,
): Vector3 {
  if (
    !Number.isFinite(longitudeRadians) ||
    Math.abs(longitudeRadians) > Math.PI
  ) {
    throw new RangeError("Longitude must be finite and within ±π");
  }
  const primeVerticalRadius = assertWgs84Observer(
    geodeticLatitudeRadians,
    heightMeters,
  );
  const latitudeSine = Math.sin(geodeticLatitudeRadians);
  const latitudeCosine = Math.cos(geodeticLatitudeRadians);
  const longitudeSine = Math.sin(longitudeRadians);
  const longitudeCosine = Math.cos(longitudeRadians);
  const equatorialRadius = primeVerticalRadius + heightMeters;
  const polarRadius =
    (1 - WGS84_ECCENTRICITY_SQUARED) * primeVerticalRadius + heightMeters;
  return [
    equatorialRadius *
      latitudeCosine *
      longitudeCosine *
      METERS_TO_ASTRONOMICAL_UNITS,
    equatorialRadius *
      latitudeCosine *
      longitudeSine *
      METERS_TO_ASTRONOMICAL_UNITS,
    polarRadius * latitudeSine * METERS_TO_ASTRONOMICAL_UNITS,
  ];
}

/**
 * Convert a geocentric ITRS direction and distance to the unit direction
 * from an actual terrestrial observer.
 *
 * Apply this before the split-at-CIRS diurnal-aberration correction.
 */
export function applyTopocentricParallaxToItrsDirection(
  geocentricUnitDirection: Vector3,
  geocentricDistanceAu: number,
  observerPositionItrsAu: Vector3,
): Vector3 {
  const unit = normalizeVector(geocentricUnitDirection);
  if (!Number.isFinite(geocentricDistanceAu) || geocentricDistanceAu <= 0) {
    throw new RangeError("Geocentric distance must be finite and positive");
  }
  if (observerPositionItrsAu.some((component) => !Number.isFinite(component))) {
    throw new RangeError("Observer ITRS position must be finite");
  }
  return normalizeVector([
    geocentricDistanceAu * unit[0] - observerPositionItrsAu[0],
    geocentricDistanceAu * unit[1] - observerPositionItrsAu[1],
    geocentricDistanceAu * unit[2] - observerPositionItrsAu[2],
  ]);
}

/**
 * Apply conventional split-at-CIRS diurnal aberration to a geometric local
 * direction. Components are East, North and Up, all right-handed.
 *
 * Positive terrestrial rotational velocity is eastward, so the correction
 * adds +magnitude to the east component. Call this after Earth rotation and
 * polar motion but before the horizon angle conversion and refraction.
 */
export function applyDiurnalAberrationToHorizontalEnu(
  geometricDirection: HorizontalEnuVector,
  magnitude: number,
): HorizontalEnuVector {
  if (!Number.isFinite(magnitude) || magnitude < 0 || magnitude >= 1) {
    throw new RangeError(
      "Diurnal-aberration magnitude must be finite and in [0, 1)",
    );
  }
  const unit = normalizeVector(geometricDirection);
  const corrected = normalizeVector([unit[0] + magnitude, unit[1], unit[2]]);
  return [corrected[0], corrected[1], corrected[2]];
}
