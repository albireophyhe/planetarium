import type { EquatorialCoordinates } from "../types";
import {
  ARCSECONDS_TO_RADIANS,
  ASTRONOMICAL_UNIT_KILOMETERS,
  DAYS_PER_JULIAN_YEAR,
  J2000_JULIAN_DATE,
  SECONDS_PER_DAY,
  SPEED_OF_LIGHT_KILOMETERS_PER_SECOND
} from "./constants";
import {
  connectFk5PhaseSpaceToHipparcos
} from "./frameConnection";
import type { PrecisionStar, SpaceMotionMode } from "./types";
import {
  equatorialToVector,
  normalizeVector,
  unitVectorToEquatorial
} from "./vector";
import type { Vector3 } from "./vector";

export interface SpaceMotionResult {
  readonly coordinates: EquatorialCoordinates;
  /**
   * Propagated SSB-relative, Hipparcos/ICRS-aligned stellar-position
   * approximation in AU when the catalogue contains a positive parallax.
   * Retained even when radial velocity is absent so annual parallax remains
   * available.
   */
  readonly astrometricPositionAu: Vector3 | null;
  readonly mode: SpaceMotionMode;
  readonly radialVelocityAssumedZero: boolean;
}

export interface VectorSpaceMotionResult {
  /** Propagated unit direction in Hipparcos/ICRS-aligned axes. */
  readonly astrometricDirection: Vector3;
  /**
   * Propagated SSB-relative stellar position approximation in AU when the
   * catalogue contains a positive parallax. BSC5P radial velocities are
   * heliocentric, which remains a catalogue-level precision limitation.
   */
  readonly astrometricPositionAu: Vector3 | null;
  readonly mode: SpaceMotionMode;
  readonly radialVelocityAssumedZero: boolean;
}

function validateCatalogDirection(star: PrecisionStar): void {
  if (
    !Number.isFinite(star.raRad) ||
    star.raRad < 0 ||
    star.raRad >= 2 * Math.PI ||
    !Number.isFinite(star.decRad) ||
    star.decRad < -Math.PI / 2 ||
    star.decRad > Math.PI / 2
  ) {
    throw new RangeError(`HR ${star.hr} has invalid J2000 coordinates`);
  }
}

function validateOptionalFinite(
  value: number | null,
  field: string,
  hr: number
): void {
  if (value !== null && !Number.isFinite(value)) {
    throw new RangeError(`HR ${hr} has a non-finite ${field}`);
  }
}

/**
 * Connect a BSC5P FK5 direction and velocity to the Hipparcos/ICRS-aligned
 * frame, then propagate from epoch J2000.0. Positive parallax always retains
 * a physical distance. When radial velocity is unavailable it is explicitly
 * treated as zero, preserving annual parallax while omitting unknown
 * perspective acceleration. Catalogue uncertainties remain the dominant
 * limitation.
 */
export function propagateSpaceMotionVector(
  star: PrecisionStar,
  ttJulianDate: number
): VectorSpaceMotionResult {
  validateCatalogDirection(star);
  if (!Number.isFinite(ttJulianDate)) {
    throw new RangeError("TT Julian date must be finite");
  }

  const pmRa = star.pmRaCosDecArcsecPerYear;
  const pmDec = star.pmDecArcsecPerYear;
  validateOptionalFinite(pmRa, "right-ascension proper motion", star.hr);
  validateOptionalFinite(pmDec, "declination proper motion", star.hr);
  const hasRaMotion = pmRa !== null && Number.isFinite(pmRa);
  const hasDecMotion = pmDec !== null && Number.isFinite(pmDec);
  const catalogCoordinates = {
    rightAscension: star.raRad,
    declination: star.decRad
  };

  const years =
    (ttJulianDate - J2000_JULIAN_DATE) / DAYS_PER_JULIAN_YEAR;
  const ra = star.raRad;
  const dec = star.decRad;
  const direction = equatorialToVector(catalogCoordinates);
  const east: Vector3 = [-Math.sin(ra), Math.cos(ra), 0];
  const north: Vector3 = [
    -Math.sin(dec) * Math.cos(ra),
    -Math.sin(dec) * Math.sin(ra),
    Math.cos(dec)
  ];
  const muRa = (hasRaMotion ? pmRa : 0) * ARCSECONDS_TO_RADIANS;
  const muDec = (hasDecMotion ? pmDec : 0) * ARCSECONDS_TO_RADIANS;
  const angularVelocity: Vector3 = [
    muRa * east[0] + muDec * north[0],
    muRa * east[1] + muDec * north[1],
    muRa * east[2] + muDec * north[2]
  ];

  const parallax = star.parallaxArcsec;
  const radialVelocity = star.radialVelocityKmPerSecond;
  validateOptionalFinite(parallax, "parallax", star.hr);
  validateOptionalFinite(radialVelocity, "radial velocity", star.hr);
  const hasDistance = parallax !== null && parallax > 0;
  const hasRadialVelocity =
    radialVelocity !== null && Number.isFinite(radialVelocity);

  if (hasDistance) {
    const parallaxRadians =
      parallax * ARCSECONDS_TO_RADIANS;
    if (parallaxRadians >= Math.PI / 2) {
      throw new RangeError(
        `HR ${star.hr} has a parallax outside the physical stellar range`
      );
    }
    if (parallaxRadians === 0) {
      throw new RangeError(
        `HR ${star.hr} has a parallax too small to resolve`
      );
    }
    const distanceAu =
      1 / Math.sin(parallaxRadians);
    if (!Number.isFinite(distanceAu)) {
      throw new RangeError(
        `HR ${star.hr} has an unresolved parallax distance`
      );
    }
    const radialAuPerYear =
      hasRadialVelocity
        ? (radialVelocity *
            SECONDS_PER_DAY *
            DAYS_PER_JULIAN_YEAR) /
          ASTRONOMICAL_UNIT_KILOMETERS
        : 0;
    const position: Vector3 = [
      direction[0] * distanceAu,
      direction[1] * distanceAu,
      direction[2] * distanceAu
    ];
    const velocity: Vector3 = [
      distanceAu * (muRa * east[0] + muDec * north[0]) +
        radialAuPerYear * direction[0],
      distanceAu * (muRa * east[1] + muDec * north[1]) +
        radialAuPerYear * direction[1],
      distanceAu * (muRa * east[2] + muDec * north[2]) +
        radialAuPerYear * direction[2]
    ];
    const speedOfLightAuPerYear =
      (SPEED_OF_LIGHT_KILOMETERS_PER_SECOND *
        SECONDS_PER_DAY *
        DAYS_PER_JULIAN_YEAR) /
      ASTRONOMICAL_UNIT_KILOMETERS;
    if (Math.hypot(...velocity) >= speedOfLightAuPerYear) {
      throw new RangeError(
        `HR ${star.hr} has a space velocity at or above light speed`
      );
    }
    const connected = connectFk5PhaseSpaceToHipparcos(
      position,
      velocity
    );
    const propagatedPosition: Vector3 = [
      connected.position[0] +
        years * connected.velocityPerJulianYear[0],
      connected.position[1] +
        years * connected.velocityPerJulianYear[1],
      connected.position[2] +
        years * connected.velocityPerJulianYear[2]
    ];
    return {
      astrometricDirection: normalizeVector(
        propagatedPosition
      ),
      astrometricPositionAu: propagatedPosition,
      mode:
        hasRadialVelocity
          ? "three-dimensional"
          : hasRaMotion || hasDecMotion
            ? "angular-proper-motion"
            : "none",
      radialVelocityAssumedZero: !hasRadialVelocity
    };
  }

  const connected = connectFk5PhaseSpaceToHipparcos(
    direction,
    angularVelocity
  );
  const astrometricDirection = normalizeVector([
    connected.position[0] +
      years * connected.velocityPerJulianYear[0],
    connected.position[1] +
      years * connected.velocityPerJulianYear[1],
    connected.position[2] +
      years * connected.velocityPerJulianYear[2]
  ]);
  return {
    astrometricDirection,
    astrometricPositionAu: null,
    mode:
      hasRaMotion || hasDecMotion
        ? "angular-proper-motion"
        : "none",
    radialVelocityAssumedZero: false
  };
}

export function propagateSpaceMotion(
  star: PrecisionStar,
  ttJulianDate: number
): SpaceMotionResult {
  const result = propagateSpaceMotionVector(star, ttJulianDate);
  return {
    coordinates: unitVectorToEquatorial(
      result.astrometricDirection
    ),
    astrometricPositionAu: result.astrometricPositionAu,
    mode: result.mode,
    radialVelocityAssumedZero:
      result.radialVelocityAssumedZero
  };
}
