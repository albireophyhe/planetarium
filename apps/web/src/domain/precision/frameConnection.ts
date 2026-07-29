/*
 * The constants and phase-space transformation in this file are a
 * TypeScript derived work based on the IAU SOFA 2023-10-11 routines
 * fk5hip and fk52h. This is not software provided by or endorsed by SOFA.
 *
 * Unlike fk52h, this API accepts Cartesian position and velocity vectors.
 * That lets callers preserve missing-distance semantics instead of invoking
 * the catalogue conversion with a synthetic parallax.
 */
import type { Matrix3, Vector3 } from "./vector";
import { ARCSECONDS_TO_RADIANS } from "./constants";
import { multiplyMatrixVector } from "./vector";

export interface ConnectedPhaseSpace {
  readonly position: Vector3;
  readonly velocityPerJulianYear: Vector3;
}

function rotationVectorToMatrix(vector: Vector3): Matrix3 {
  let [x, y, z] = vector;
  const angle = Math.hypot(x, y, z);
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  const oneMinusCosine = 1 - cosine;
  if (angle > 0) {
    x /= angle;
    y /= angle;
    z /= angle;
  }
  return Object.freeze([
    Object.freeze([
      x * x * oneMinusCosine + cosine,
      x * y * oneMinusCosine + z * sine,
      x * z * oneMinusCosine - y * sine
    ]),
    Object.freeze([
      y * x * oneMinusCosine - z * sine,
      y * y * oneMinusCosine + cosine,
      y * z * oneMinusCosine + x * sine
    ]),
    Object.freeze([
      z * x * oneMinusCosine + y * sine,
      z * y * oneMinusCosine - x * sine,
      z * z * oneMinusCosine + cosine
    ])
  ]) as Matrix3;
}

/** J2000 FK5 direction to the Hipparcos/ICRS-aligned frame. */
export const FK5_TO_HIPPARCOS_MATRIX: Matrix3 =
  rotationVectorToMatrix([
    -19.9e-3 * ARCSECONDS_TO_RADIANS,
    -9.1e-3 * ARCSECONDS_TO_RADIANS,
    22.9e-3 * ARCSECONDS_TO_RADIANS
  ]);

/**
 * Time derivative of the FK5-to-Hipparcos rotation, radians/Julian year,
 * expressed as Hipparcos with respect to FK5 spin.
 */
export const FK5_TO_HIPPARCOS_SPIN: Vector3 = Object.freeze([
  -0.3e-3 * ARCSECONDS_TO_RADIANS,
  0.6e-3 * ARCSECONDS_TO_RADIANS,
  0.7e-3 * ARCSECONDS_TO_RADIANS
]) as Vector3;

function assertFiniteVector(vector: Vector3, name: string): void {
  if (!vector.every(Number.isFinite)) {
    throw new RangeError(`${name} must contain only finite values`);
  }
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

/**
 * Connect one FK5 J2000 phase-space vector to the Hipparcos/ICRS-aligned
 * frame. Position units are arbitrary; velocity must use the same units per
 * Julian year.
 */
export function connectFk5PhaseSpaceToHipparcos(
  position: Vector3,
  velocityPerJulianYear: Vector3
): ConnectedPhaseSpace {
  assertFiniteVector(position, "FK5 position");
  assertFiniteVector(velocityPerJulianYear, "FK5 velocity");
  const frameSpinVelocity = cross(
    position,
    FK5_TO_HIPPARCOS_SPIN
  );
  const connectedVelocity = multiplyMatrixVector(
    FK5_TO_HIPPARCOS_MATRIX,
    [
      velocityPerJulianYear[0] + frameSpinVelocity[0],
      velocityPerJulianYear[1] + frameSpinVelocity[1],
      velocityPerJulianYear[2] + frameSpinVelocity[2]
    ]
  );
  return {
    position: multiplyMatrixVector(
      FK5_TO_HIPPARCOS_MATRIX,
      position
    ),
    velocityPerJulianYear: connectedVelocity
  };
}
