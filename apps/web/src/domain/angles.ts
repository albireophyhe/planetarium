import type {
  EquatorialCoordinates,
  HorizontalCoordinates
} from "./types";

export const TAU = 2 * Math.PI;

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function normalizeRadians(radians: number): number {
  const normalized = radians % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

export function normalizeDegrees(degrees: number): number {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

type SphericalCoordinates = EquatorialCoordinates | HorizontalCoordinates;

function longitudeAndLatitude(
  coordinates: SphericalCoordinates
): readonly [number, number] {
  if ("rightAscension" in coordinates) {
    return [coordinates.rightAscension, coordinates.declination];
  }

  return [coordinates.azimuth, coordinates.altitude];
}

/** Great-circle angular separation, in radians. */
export function angularDistance(
  first: SphericalCoordinates,
  second: SphericalCoordinates
): number {
  const [longitude1, latitude1] = longitudeAndLatitude(first);
  const [longitude2, latitude2] = longitudeAndLatitude(second);
  const deltaLongitude = longitude2 - longitude1;

  // atan2 is better conditioned than acos for very small separations.
  const y = Math.hypot(
    Math.cos(latitude2) * Math.sin(deltaLongitude),
    Math.cos(latitude1) * Math.sin(latitude2) -
      Math.sin(latitude1) *
        Math.cos(latitude2) *
        Math.cos(deltaLongitude)
  );
  const x =
    Math.sin(latitude1) * Math.sin(latitude2) +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.cos(deltaLongitude);

  return Math.atan2(y, x);
}
