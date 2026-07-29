/**
 * All celestial angles are radians. Observer latitude/longitude are degrees so
 * they can be passed directly to and from the location controls.
 */
export interface EquatorialCoordinates {
  readonly rightAscension: number;
  readonly declination: number;
}

export interface HorizontalCoordinates {
  /** Altitude above the mathematical horizon, in radians. */
  readonly altitude: number;
  /** Azimuth in radians, measured clockwise from true north. */
  readonly azimuth: number;
  /** False at the zenith/nadir, where azimuth has no unique value. */
  readonly azimuthDefined: boolean;
}

export interface ProjectedPoint {
  /** Normalized horizontal coordinate; the horizon circle has radius 1. */
  readonly x: number;
  /** Normalized vertical coordinate; north is toward negative y. */
  readonly y: number;
  /** Angular distance from the zenith normalized by 90 degrees. */
  readonly radius: number;
}

export interface ObservingLocation {
  readonly latitude: number;
  /** East-positive longitude in degrees. */
  readonly longitude: number;
  readonly timeZone: string;
  readonly name?: string;
}

export type ObservingLocationValidationCode =
  | "invalid-location"
  | "latitude-not-finite"
  | "latitude-out-of-range"
  | "longitude-not-finite"
  | "longitude-out-of-range"
  | "time-zone-empty"
  | "time-zone-invalid";

export interface ObservingLocationValidationIssue {
  readonly field: "location" | "latitude" | "longitude" | "timeZone";
  readonly code: ObservingLocationValidationCode;
  readonly message: string;
}

export type ObservingLocationValidationResult =
  | {
      readonly ok: true;
      readonly value: ObservingLocation;
      readonly issues: readonly [];
    }
  | {
      readonly ok: false;
      readonly issues: readonly ObservingLocationValidationIssue[];
    };

export type ObservationDateValidationCode =
  | "invalid-date"
  | "date-out-of-supported-range";

export interface ObservationDateValidationIssue {
  readonly code: ObservationDateValidationCode;
  readonly message: string;
}

export type ObservationDateValidationResult =
  | {
      readonly ok: true;
      readonly value: Date;
      readonly issues: readonly [];
    }
  | {
      readonly ok: false;
      readonly issues: readonly ObservationDateValidationIssue[];
    };

export interface Star {
  readonly hr: number;
  readonly hd: number | null;
  readonly raRad: number;
  readonly decRad: number;
  readonly vMagnitude: number;
  readonly bvColor: number | null;
  readonly catalogName: string | null;
  readonly spectralType: string | null;
}

export interface NamedStar {
  readonly hr: number;
  readonly name: string;
  readonly nameJa: string;
  readonly aliases: readonly string[];
  readonly constellation: string;
}

export interface Constellation {
  readonly id: string;
  readonly name: string;
  readonly nameJa: string;
  readonly segments: readonly (readonly [number, number])[];
}

export interface City extends ObservingLocation {
  readonly id: string;
  readonly name: string;
  readonly nameJa: string;
}

export type TwilightPhase =
  | "day"
  | "civil"
  | "nautical"
  | "astronomical"
  | "night";

export interface CalculatedStarPosition {
  readonly equatorial: EquatorialCoordinates;
  readonly horizontal: HorizontalCoordinates;
  readonly projection: ProjectedPoint;
}

export type ZonedDateTimeDisambiguation = "earlier" | "later" | "reject";
