import { clampUnit, normalizeAngle } from "./constants";
import type { EquatorialCoordinates } from "../types";

export type Vector3 = readonly [x: number, y: number, z: number];
export type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number]
];

export const IDENTITY_MATRIX: Matrix3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1]
];

export function dot(left: Vector3, right: Vector3): number {
  return (
    left[0] * right[0] +
    left[1] * right[1] +
    left[2] * right[2]
  );
}

export function magnitude(vector: Vector3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

export function normalizeVector(vector: Vector3): Vector3 {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length === 0) {
    throw new RangeError("Vector must have a finite non-zero magnitude");
  }
  return [
    vector[0] / length,
    vector[1] / length,
    vector[2] / length
  ];
}

export function equatorialToVector(
  coordinates: EquatorialCoordinates
): Vector3 {
  const cosineDeclination = Math.cos(coordinates.declination);
  return [
    cosineDeclination * Math.cos(coordinates.rightAscension),
    cosineDeclination * Math.sin(coordinates.rightAscension),
    Math.sin(coordinates.declination)
  ];
}

export function vectorToEquatorial(
  vector: Vector3
): EquatorialCoordinates {
  return unitVectorToEquatorial(normalizeVector(vector));
}

/**
 * Convert a direction already known to be unit length. Hot render pipelines
 * use this after an explicit normalization or an orthogonal rotation.
 */
export function unitVectorToEquatorial(
  unit: Vector3
): EquatorialCoordinates {
  return {
    rightAscension: normalizeAngle(Math.atan2(unit[1], unit[0])),
    declination: Math.asin(clampUnit(unit[2]))
  };
}

export function multiplyMatrixVector(
  matrix: Matrix3,
  vector: Vector3
): Vector3 {
  return [
    dot(matrix[0], vector),
    dot(matrix[1], vector),
    dot(matrix[2], vector)
  ];
}

export function multiplyMatrices(
  left: Matrix3,
  right: Matrix3
): Matrix3 {
  const column = (index: number): Vector3 => [
    right[0][index],
    right[1][index],
    right[2][index]
  ];
  return [
    [
      dot(left[0], column(0)),
      dot(left[0], column(1)),
      dot(left[0], column(2))
    ],
    [
      dot(left[1], column(0)),
      dot(left[1], column(1)),
      dot(left[1], column(2))
    ],
    [
      dot(left[2], column(0)),
      dot(left[2], column(1)),
      dot(left[2], column(2))
    ]
  ];
}

/**
 * Passive right-handed rotation used by the IAU SOFA r-matrix routines.
 */
export function rotationX(angle: number): Matrix3 {
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  return [
    [1, 0, 0],
    [0, cosine, sine],
    [0, -sine, cosine]
  ];
}

/**
 * Passive right-handed rotation used by the IAU SOFA r-matrix routines.
 */
export function rotationY(angle: number): Matrix3 {
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  return [
    [cosine, 0, -sine],
    [0, 1, 0],
    [sine, 0, cosine]
  ];
}

/**
 * Passive right-handed rotation used by the IAU SOFA r-matrix routines.
 */
export function rotationZ(angle: number): Matrix3 {
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  return [
    [cosine, sine, 0],
    [-sine, cosine, 0],
    [0, 0, 1]
  ];
}

export function composeRotations(...rotations: readonly Matrix3[]): Matrix3 {
  return rotations.reduce<Matrix3>(
    (result, rotation) => multiplyMatrices(rotation, result),
    IDENTITY_MATRIX
  );
}
