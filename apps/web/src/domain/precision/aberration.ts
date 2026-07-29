/*
 * applyAnnualAberration is a TypeScript derived work based on the IAU SOFA
 * 2023-10-11 C routine ab. It is not software provided by or endorsed by
 * SOFA. The default ephemeris is a separately implemented, explicitly
 * reported 100-term truncation of the VSOP2000 position series.
 */
import {
  SOLAR_SCHWARZSCHILD_RADIUS_AU,
  SPEED_OF_LIGHT_AU_PER_DAY
} from "./constants";
import { truncatedEarthHeliocentricState } from "./earthEphemeris";
import { dot, magnitude, normalizeVector } from "./vector";
import type { Vector3 } from "./vector";
import type {
  AberrationMode,
  PreparedAberrationContextV2
} from "./types";

export interface ApproximateEarthState {
  /** Heliocentric Sun-to-Earth position in BCRS-oriented AU. */
  readonly positionAu: Vector3;
  /**
   * Heliocentric Earth velocity in BCRS-oriented units of c. The omitted
   * SSB-to-Sun velocity is retained as an explicit ephemeris approximation.
   */
  readonly velocityC: Vector3;
  readonly sunObserverDistanceAu: number;
}

export function approximateEarthState(
  ttJulianDate: number
): ApproximateEarthState {
  if (!Number.isFinite(ttJulianDate)) {
    throw new RangeError("TT Julian date must be finite");
  }
  const earth = truncatedEarthHeliocentricState(ttJulianDate);
  return {
    positionAu: earth.positionAu,
    velocityC: [
      earth.velocityAuPerDay[0] / SPEED_OF_LIGHT_AU_PER_DAY,
      earth.velocityAuPerDay[1] / SPEED_OF_LIGHT_AU_PER_DAY,
      earth.velocityAuPerDay[2] / SPEED_OF_LIGHT_AU_PER_DAY
    ],
    sunObserverDistanceAu: magnitude(earth.positionAu)
  };
}

export function prepareAnnualAberration(
  observerBarycentricVelocityC: Vector3,
  sunObserverDistanceAu: number,
  mode: Exclude<AberrationMode, "disabled">
): PreparedAberrationContextV2 {
  if (
    !Number.isFinite(sunObserverDistanceAu) ||
    sunObserverDistanceAu <= 0
  ) {
    throw new RangeError("Sun-observer distance must be positive");
  }
  if (
    observerBarycentricVelocityC.some((value) => !Number.isFinite(value))
  ) {
    throw new RangeError("Observer barycentric velocity must be finite");
  }
  const velocity: Vector3 = [
    observerBarycentricVelocityC[0],
    observerBarycentricVelocityC[1],
    observerBarycentricVelocityC[2]
  ];
  const speedSquared = dot(velocity, velocity);
  if (speedSquared >= 1) {
    throw new RangeError("Observer barycentric velocity must be below c");
  }
  return {
    mode,
    observerBarycentricVelocityC: velocity,
    reciprocalLorentzFactor: Math.sqrt(1 - speedSquared),
    solarPotentialWeight:
      SOLAR_SCHWARZSCHILD_RADIUS_AU / sunObserverDistanceAu
  };
}

export function applyPreparedAnnualAberration(
  naturalDirection: Vector3,
  prepared: PreparedAberrationContextV2
): Vector3 {
  return applyPreparedAnnualAberrationToUnitDirection(
    normalizeVector(naturalDirection),
    prepared
  );
}

/**
 * Hot-path variant for a direction already normalized by propagation or
 * annual parallax.
 */
export function applyPreparedAnnualAberrationToUnitDirection(
  direction: Vector3,
  prepared: PreparedAberrationContextV2
): Vector3 {
  const velocity = prepared.observerBarycentricVelocityC;
  const directionVelocityDot = dot(direction, velocity);
  const velocityWeight =
    1 +
    directionVelocityDot /
      (1 + prepared.reciprocalLorentzFactor);
  return normalizeVector([
    direction[0] * prepared.reciprocalLorentzFactor +
      velocityWeight * velocity[0] +
      prepared.solarPotentialWeight *
        (velocity[0] - directionVelocityDot * direction[0]),
    direction[1] * prepared.reciprocalLorentzFactor +
      velocityWeight * velocity[1] +
      prepared.solarPotentialWeight *
        (velocity[1] - directionVelocityDot * direction[1]),
    direction[2] * prepared.reciprocalLorentzFactor +
      velocityWeight * velocity[2] +
      prepared.solarPotentialWeight *
        (velocity[2] - directionVelocityDot * direction[2])
  ]);
}

/**
 * Transform a natural direction to the observer's proper direction using a
 * relativistically normalized annual-aberration expression.
 */
export function applyAnnualAberration(
  naturalDirection: Vector3,
  observerBarycentricVelocityC: Vector3,
  sunObserverDistanceAu: number
): Vector3 {
  return applyPreparedAnnualAberration(
    naturalDirection,
    prepareAnnualAberration(
      observerBarycentricVelocityC,
      sunObserverDistanceAu,
      "caller-barycentric-velocity"
    )
  );
}
