import type {
  HorizontalCoordinates,
  ObservingLocation,
} from "../types";
import type { Vector3 } from "../precision";

export type EventKind =
  | "solar-eclipse"
  | "lunar-eclipse"
  | "lunar-occultation";

export type SolarEclipseClassification =
  | "partial"
  | "annular"
  | "total"
  | "hybrid";

export type LunarEclipseClassification =
  | "penumbral"
  | "partial"
  | "total";

export type EventCalculationTier =
  | "normal"
  | "uncertain"
  | "reference";

export type EventVisibility =
  | "fully-visible"
  | "partly-visible"
  | "below-horizon"
  | "not-local"
  | "boundary-uncertain";

export type EventContactPhase =
  | "solar-c1"
  | "solar-c2"
  | "maximum"
  | "solar-c3"
  | "solar-c4"
  | "lunar-p1"
  | "lunar-u1"
  | "lunar-u2"
  | "lunar-u3"
  | "lunar-u4"
  | "lunar-p4"
  | "occultation-disappearance"
  | "occultation-reappearance";

export interface EventSummary {
  readonly id: string;
  readonly kind: EventKind;
  readonly title: string;
  readonly canonicalEpochUtc: Date;
  readonly globalClassification:
    | SolarEclipseClassification
    | LunarEclipseClassification
    | "occultation";
  readonly targetStarHR: number | null;
  readonly dataVersion: string;
}

export interface EventObserverContext extends ObservingLocation {
  readonly heightMeters: number;
  readonly horizontalAccuracyMeters: number | null;
  readonly locationSource:
    | "bundled-city"
    | "manual"
    | "device-geolocation";
}

export interface EventBodyPosition {
  readonly altitudeAzimuth: HorizontalCoordinates;
  readonly angularRadiusRadians: number | null;
  readonly distanceKilometers: number | null;
}

export type EventSolarSystemBody = "sun" | "moon";

export interface ApparentBodyState {
  readonly body: EventSolarSystemBody;
  /** Reception epoch used for the apparent direction. */
  readonly tdbJulianDate: number;
  readonly lightTimeSeconds: number;
  readonly distanceKilometers: number;
  readonly angularRadiusRadians: number;
  readonly icrfDirection: Vector3;
  readonly cirsDirection: Vector3;
  readonly horizontal: HorizontalCoordinates;
}

export type ApparentGeocentricBodyState = Omit<
  ApparentBodyState,
  "horizontal"
>;

export interface EventContact {
  readonly phase: EventContactPhase;
  readonly instantUtc: Date;
  readonly bodies: Readonly<
    Partial<Record<"sun" | "moon" | "target", EventBodyPosition>>
  >;
  readonly aboveHorizon: boolean;
  readonly positionAngleRadians: number | null;
}

export interface ForecastUncertainty {
  readonly tier: EventCalculationTier;
  readonly timingSeconds: number | null;
  readonly pathKilometers: number | null;
  readonly observerLocationMeters: number | null;
  readonly dominantContributors: readonly string[];
}

export interface EventProvenance {
  readonly algorithmVersion: string;
  readonly ephemerisId: string;
  readonly ephemerisSourceSha256: string;
  readonly eopId: string;
  readonly deltaTModel: string;
  readonly lunarRadiusModel: "mean-spherical-limb";
  readonly limbProfileId: null;
}

export interface LocalCircumstances {
  readonly event: EventSummary;
  readonly observer: EventObserverContext;
  readonly visibility: EventVisibility;
  readonly contacts: readonly EventContact[];
  readonly maximum: EventContact;
  readonly magnitude: number | null;
  readonly obscuration: number | null;
  readonly uncertainty: ForecastUncertainty;
  readonly provenance: EventProvenance;
  readonly warnings: readonly string[];
}

export interface EphemerisState {
  /** ICRF position in km from the state provider's declared center. */
  readonly positionKilometers: Vector3;
  /** ICRF velocity in km per TDB day. */
  readonly velocityKilometersPerDay: Vector3;
}

export interface GeocentricEphemerisState {
  readonly earthBarycentric: EphemerisState;
  readonly moonGeocentric: EphemerisState;
  readonly sunGeocentric: EphemerisState;
  readonly tdbJulianDate: number;
}

export interface EventEphemerisProvider {
  readonly id: string;
  readonly sourceSha256: string;
  state(tdbJulianDate: number): GeocentricEphemerisState;
}
