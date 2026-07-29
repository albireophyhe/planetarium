import { normalizeVector } from "./vector";
import type { Vector3 } from "./vector";

function assertFiniteVector(
  vector: Vector3,
  name: string
): void {
  if (!vector.every(Number.isFinite)) {
    throw new RangeError(`${name} must contain only finite values`);
  }
}

/**
 * Convert a propagated astrometric position into the natural direction seen
 * from an observer at the supplied position.
 *
 * Both vectors must be SSB-relative, use AU, and use the same
 * BCRS/Hipparcos-aligned axes. This is an independent Euclidean vector
 * calculation written for Planetarium; it is not derived from an IAU SOFA
 * routine.
 */
export function applyAnnualParallax(
  astrometricPositionAu: Vector3,
  observerPositionAu: Vector3
): Vector3 {
  assertFiniteVector(
    astrometricPositionAu,
    "Astrometric star position"
  );
  assertFiniteVector(observerPositionAu, "Observer position");

  return normalizeVector([
    astrometricPositionAu[0] - observerPositionAu[0],
    astrometricPositionAu[1] - observerPositionAu[1],
    astrometricPositionAu[2] - observerPositionAu[2]
  ]);
}
