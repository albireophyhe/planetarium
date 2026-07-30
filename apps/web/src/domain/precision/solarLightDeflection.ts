/*
 * SolarLightDeflection is a TypeScript derived work based on the vector
 * expressions in the IAU SOFA 2023-10-11 C routines ld and ldsun. It is not
 * software provided by or endorsed by SOFA.
 *
 * Differences from SOFA: this helper only implements the distant-source
 * solar case (q=p and one solar mass), uses an application-specific prepared
 * context, rejects non-finite/non-unit inputs, and explicitly normalizes the
 * result. The surrounding pipeline supplies either caller geometry or a
 * separately implemented 200-term VSOP2000 Earth approximation; it does not
 * call the original SOFA routine.
 */
import { SOLAR_SCHWARZSCHILD_RADIUS_AU } from "./constants";
import type {
  PreparedSolarLightDeflectionContextV2,
  SolarLightDeflectionMode
} from "./types";
import type { Vector3 } from "./vector";

/**
 * The official SOFA reference vector is printed to about ten significant
 * decimal places, so this tolerance accepts that fixture while still
 * rejecting geometry that is not meaningfully a unit vector.
 */
const UNIT_VECTOR_TOLERANCE = 1e-9;

function assertUnitVector(
  vector: Vector3,
  name: string
): number {
  const x = vector[0];
  const y = vector[1];
  const z = vector[2];
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    throw new RangeError(`${name} must contain only finite values`);
  }
  const squaredMagnitude = x * x + y * y + z * z;
  const vectorMagnitude = Math.sqrt(squaredMagnitude);
  if (
    !Number.isFinite(vectorMagnitude) ||
    Math.abs(vectorMagnitude - 1) > UNIT_VECTOR_TOLERANCE
  ) {
    throw new RangeError(`${name} must be a unit vector`);
  }
  return squaredMagnitude;
}

export function prepareSolarLightDeflection(
  sunToObserverUnitDirection: Vector3,
  sunObserverDistanceAu: number,
  mode: Exclude<SolarLightDeflectionMode, "disabled">
): PreparedSolarLightDeflectionContextV2 {
  assertUnitVector(
    sunToObserverUnitDirection,
    "Sun-to-observer direction"
  );
  if (
    !Number.isFinite(sunObserverDistanceAu) ||
    sunObserverDistanceAu <= 0
  ) {
    throw new RangeError(
      "Sun-observer distance must be finite and positive"
    );
  }
  if (
    mode !== "truncated-vsop2000-heliocentric-earth" &&
    mode !== "jpl-approximate-earth-moon-barycenter" &&
    mode !== "caller-sun-observer-geometry"
  ) {
    throw new RangeError(
      "Unsupported solar-light-deflection mode"
    );
  }

  const distanceSquared =
    sunObserverDistanceAu * sunObserverDistanceAu;
  const deflectionLimiter =
    1e-6 / Math.max(distanceSquared, 1);
  const gravitationalScale =
    SOLAR_SCHWARZSCHILD_RADIUS_AU /
    sunObserverDistanceAu;
  if (
    !Number.isFinite(deflectionLimiter) ||
    deflectionLimiter <= 0 ||
    !Number.isFinite(gravitationalScale) ||
    gravitationalScale <= 0
  ) {
    throw new RangeError(
      "Sun-observer geometry exceeds the supported numeric range"
    );
  }

  return {
    mode,
    sunToObserverUnitDirection: [
      sunToObserverUnitDirection[0],
      sunToObserverUnitDirection[1],
      sunToObserverUnitDirection[2]
    ],
    sunObserverDistanceAu,
    deflectionLimiter,
    gravitationalScale
  };
}

/**
 * Hot-path form of SOFA ldsun for a source direction already known to be
 * normalized. The official limiter remains active at and near the solar
 * center, preventing a singular correction.
 */
export function applyPreparedSolarLightDeflectionToUnitDirection(
  direction: Vector3,
  prepared: PreparedSolarLightDeflectionContextV2
): Vector3 {
  const directionSquared = assertUnitVector(
    direction,
    "Natural source direction"
  );
  const sunToObserver = prepared.sunToObserverUnitDirection;
  const directionGeometryDot =
    direction[0] * sunToObserver[0] +
    direction[1] * sunToObserver[1] +
    direction[2] * sunToObserver[2];
  const denominator = Math.max(
    directionSquared + directionGeometryDot,
    prepared.deflectionLimiter
  );
  const weight =
    prepared.gravitationalScale / denominator;

  // p × (e × p) = e(p·p) − p(p·e), the scalar form of SOFA ld.
  const correctedX =
    direction[0] +
    weight *
      (sunToObserver[0] * directionSquared -
        direction[0] * directionGeometryDot);
  const correctedY =
    direction[1] +
    weight *
      (sunToObserver[1] * directionSquared -
        direction[1] * directionGeometryDot);
  const correctedZ =
    direction[2] +
    weight *
      (sunToObserver[2] * directionSquared -
        direction[2] * directionGeometryDot);
  const correctedMagnitude = Math.hypot(
    correctedX,
    correctedY,
    correctedZ
  );
  if (
    !Number.isFinite(correctedMagnitude) ||
    correctedMagnitude === 0
  ) {
    throw new RangeError(
      "Solar light deflection produced a non-finite direction"
    );
  }
  const reciprocalMagnitude = 1 / correctedMagnitude;
  return [
    correctedX * reciprocalMagnitude,
    correctedY * reciprocalMagnitude,
    correctedZ * reciprocalMagnitude
  ];
}

export function applySolarLightDeflection(
  naturalDirection: Vector3,
  sunToObserverUnitDirection: Vector3,
  sunObserverDistanceAu: number
): Vector3 {
  return applyPreparedSolarLightDeflectionToUnitDirection(
    naturalDirection,
    prepareSolarLightDeflection(
      sunToObserverUnitDirection,
      sunObserverDistanceAu,
      "caller-sun-observer-geometry"
    )
  );
}
