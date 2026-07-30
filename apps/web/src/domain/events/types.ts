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

export type EventClassification =
  | SolarEclipseClassification
  | LunarEclipseClassification
  | "occultation";

export type EventCalculationTier =
  | "normal"
  | "uncertain"
  | "reference";

export type EventVisibility =
  | "fully-visible"
  | "partly-visible"
  | "below-horizon"
  | "not-local";

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
  readonly globalClassification: EventClassification;
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

/**
 * Mean-shadow geometry for a lunar eclipse in the CIRS tangent plane.
 *
 * The center position angle is measured eastward from celestial north at
 * the Moon. Radii and separation use the same Danjon 1.01 shadow convention
 * as the contact solver, so a renderer can reproduce the solved geometry
 * without estimating it from eclipse magnitude.
 */
export interface LunarShadowGeometry {
  readonly centerSeparationRadians: number;
  readonly centerPositionAngleRadians: number | null;
  readonly penumbralAngularRadiusRadians: number;
  readonly umbralAngularRadiusRadians: number;
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

/**
 * A physically evaluated local event state at one UTC instant.
 *
 * Unlike `EventContact`, this does not claim that the instant is a solved
 * contact or maximum. It is the common payload used by event-scene scrubbers
 * that recompute the astronomy instead of interpolating screen coordinates.
 */
export interface EventPhysicalSample {
  readonly instantUtc: Date;
  readonly bodies: Readonly<
    Partial<Record<"sun" | "moon" | "target", EventBodyPosition>>
  >;
  /** Present for lunar-eclipse samples computed by the v1 solver. */
  readonly lunarShadow?: LunarShadowGeometry;
  readonly aboveHorizon: boolean;
  /**
   * Relative target direction around the reference disc, in radians
   * [0, 2π), measured eastward from CIP-defined celestial north in the CIRS
   * tangent plane. It is `null` when the direction is degenerate or not
   * required. At a solved contact this is the corresponding contact point;
   * at an arbitrary sampled instant it is only a relative direction.
   */
  readonly positionAngleRadians: number | null;
}

export interface EventContact extends EventPhysicalSample {
  readonly phase: EventContactPhase;
}

export interface ForecastUncertainty {
  readonly tier: EventCalculationTier;
  readonly timingSeconds: number | null;
  readonly pathKilometers: number | null;
  readonly observerLocationMeters: number | null;
  /**
   * IERS-published EOP error components. These are a linear reported-error
   * envelope, not a total event-timing uncertainty or confidence interval.
   */
  readonly earthOrientation?:
    | EventEarthOrientationReportedUncertainty
    | null;
  readonly dominantContributors: readonly string[];
}

export interface EventEarthOrientationReportedUncertainty {
  readonly dut1ReportedErrorSeconds: number;
  readonly dut1PathMeters: number;
  readonly polarMotionPathMeters: number;
  readonly combinedPathMeters: number;
  readonly semantics: "iers-reported-error-linear-envelope";
}

export type EventEarthOrientationQuality =
  | "observed"
  | "predicted"
  | "mixed"
  | "outside-coverage";

export interface EventEarthOrientationProvenance {
  readonly eopSourceSha256: string | null;
  readonly eopRetrievedAt: string | null;
  readonly dut1Quality: EventEarthOrientationQuality;
  readonly polarMotionQuality: EventEarthOrientationQuality;
}

export interface EventEarthOrientationProvenanceOptions {
  readonly eopIdAt?: (date: Date) => string | undefined;
  readonly eopSourceSha256?: string | null;
  readonly eopRetrievedAt?: string | null;
  readonly dut1Quality?: EventEarthOrientationQuality;
  readonly polarMotionQuality?: EventEarthOrientationQuality;
  readonly earthOrientationProvenanceAt?: (
    date: Date,
  ) => EventEarthOrientationProvenance | undefined;
}

export interface EventProvenance
  extends EventEarthOrientationProvenance {
  readonly algorithmVersion: string;
  readonly ephemerisId: string;
  readonly ephemerisSourceSha256: string;
  readonly eopId: string;
  readonly deltaTModel: string;
  readonly lunarRadiusModel: "mean-spherical-limb";
  readonly limbProfileId: null;
}

export type EventBoundaryUncertaintyReason =
  | "solar-occurrence"
  | "solar-central-classification"
  | "occultation-occurrence";

export interface LocalCircumstances {
  readonly event: EventSummary;
  /** Classification recomputed for this observer and event geometry. */
  readonly localClassification: EventClassification;
  readonly observer: EventObserverContext;
  /**
   * True when the local occurrence/classification lies inside the
   * conservative physical boundary band. This is independent of whether
   * the evaluated phenomenon is above or below the geometric horizon.
   */
  readonly boundaryUncertain: boolean;
  /**
   * The observer-facing meaning of the physical boundary band.
   *
   * `solar-central-classification` means a local solar eclipse is certain,
   * while its central classification and C2/C3 are not. The occurrence
   * reasons mean even the local phenomenon itself is not yet established.
   * This is null exactly when `boundaryUncertain` is false.
   */
  readonly boundaryUncertaintyReason:
    | EventBoundaryUncertaintyReason
    | null;
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

export interface EventEphemerisStateCoverage {
  readonly startJulianDateTdb: number;
  readonly endJulianDateTdb: number;
  readonly endIsIncluded: true;
}

export interface EventSearchBounds {
  readonly startUtcMilliseconds: number;
  readonly endUtcMilliseconds: number;
}

export interface EventEphemerisSearchOptions {
  readonly searchBounds?: EventSearchBounds;
}

export interface EventEphemerisProvider {
  readonly id: string;
  readonly sourceSha256: string;
  /** Closed TDB interval backed by the chunks loaded in this provider. */
  readonly stateCoverage: EventEphemerisStateCoverage;
  state(tdbJulianDate: number): GeocentricEphemerisState;
}
