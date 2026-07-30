import { normalizeAngle } from "../precision/constants";
import {
  dot,
  magnitude,
} from "../precision/vector";
import type { Vector3 } from "../precision/vector";

export type EclipseContactRadialDirection =
  | "toward-other-center"
  | "away-from-other-center";

function subtract(left: Vector3, right: Vector3): Vector3 {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function scale(vector: Vector3, factor: number): Vector3 {
  return [
    vector[0] * factor,
    vector[1] * factor,
    vector[2] * factor,
  ];
}

function normalizeOrNull(vector: Vector3): Vector3 | null {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length === 0) {
    return null;
  }
  return scale(vector, 1 / length);
}

/**
 * Contact position angle in the CIRS tangent plane, with north defined by
 * the celestial intermediate pole (CIP).
 *
 * Zero is the celestial-north point of the reference disc and angles
 * increase eastward through 90 degrees. `radialDirection` chooses the
 * tangent point on the near or far side of the reference disc.
 */
export function eclipseContactPositionAngleRadians(
  referenceCenterDirection: Vector3,
  otherCenterDirection: Vector3,
  radialDirection: EclipseContactRadialDirection =
    "toward-other-center",
): number | null {
  const center = normalizeOrNull(referenceCenterDirection);
  const other = normalizeOrNull(otherCenterDirection);
  if (center === null || other === null) {
    return null;
  }
  const northPole: Vector3 = [0, 0, 1];
  const northProjection = subtract(
    northPole,
    scale(center, dot(northPole, center)),
  );
  const east: Vector3 = [-center[1], center[0], 0];
  const otherProjection = subtract(
    other,
    scale(center, dot(other, center)),
  );
  const northLength = magnitude(northProjection);
  const eastLength = magnitude(east);
  const otherLength = magnitude(otherProjection);
  if (
    northLength < 1e-14 ||
    eastLength < 1e-14 ||
    otherLength < 1e-14
  ) {
    return null;
  }
  const north = scale(northProjection, 1 / northLength);
  const normalizedEast = scale(east, 1 / eastLength);
  const towardAngle = Math.atan2(
    dot(otherProjection, normalizedEast),
    dot(otherProjection, north),
  );
  return normalizeAngle(
    towardAngle +
      (radialDirection === "away-from-other-center" ? Math.PI : 0),
  );
}
