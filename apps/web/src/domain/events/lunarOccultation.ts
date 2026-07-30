import { degreesToRadians } from "../angles";
import {
  approximateTioLocator,
  calculateApparentStarPositionV2,
  greenwichApparentSiderealTime2006B,
  polarMotionMatrix2000,
  precessionNutationMatrix2006B,
  resolveTimeScales,
  wgs84ObserverPositionItrsAu,
} from "../precision";
import type {
  EarthOrientationOptions,
  Matrix3,
  PrecisionStar,
  PrecisionWarningCode,
  Vector3,
} from "../precision";
import {
  ASTRONOMICAL_UNIT_KILOMETERS,
  SECONDS_PER_DAY,
  SPEED_OF_LIGHT_KILOMETERS_PER_SECOND,
} from "../precision/constants";
import {
  equatorialToVector,
  magnitude,
  multiplyMatrixVector,
} from "../precision/vector";
import type {
  HorizontalCoordinates,
  ObservingLocation,
} from "../types";
import {
  angularSeparationRadians,
  calculateApparentBody,
} from "./apparentBody";
import { eclipseContactPositionAngleRadians } from "./eclipseContactPositionAngle";
import {
  eventEphemerisSearchBounds,
  eventEphemerisState,
  intersectEventSearchBounds,
  resolveEventSearchBounds,
} from "./ephemerisCoverage";
import { ttToTdbJulianDate } from "./eventTime";
import {
  findSignChangeBrackets,
  minimizeBracketed,
  solveBracketedRoot,
} from "./numerics";
import {
  classifyBoundaryMaximumVisibility,
  classifyEventIntervalVisibility,
} from "./eventVisibility";
import { eventTimeScaleNotices } from "./timeScaleNotices";
import type {
  ApparentBodyState,
  EventBodyPosition,
  EventContact,
  EventEarthOrientationProvenanceOptions,
  EventEphemerisSearchOptions,
  EventEphemerisProvider,
  EventObserverContext,
  EventProvenance,
  EventSummary,
  LocalCircumstances,
} from "./types";

const DEFAULT_HALF_WINDOW_MILLISECONDS = 4 * 60 * 60 * 1_000;
const DEFAULT_SCAN_STEP_MILLISECONDS = 60 * 1_000;
const MAXIMUM_HALF_WINDOW_MILLISECONDS = 2 * 24 * 60 * 60 * 1_000;
const ROOT_TIME_TOLERANCE_MILLISECONDS = 20;
const ROOT_ANGLE_TOLERANCE_RADIANS = 1e-13;
const NUMERICAL_TANGENCY_EPSILON_RADIANS = 5e-10;
// NASA LRO reports a global high point 10.786 km above the 1,737.4 km
// mean radius. A round 11 km radial envelope avoids understating the
// spherical-limb error when no local LOLA/Kaguya profile is available.
const LUNAR_TOPOGRAPHY_ENVELOPE_KILOMETERS = 11;
// The bundled validation set bounds packed Float32 EMB→Moon coefficient
// error at 0.0242 km. Geocentric Moon reconstruction scales that vector by
// (1 + 1 / EMRAT).
const DE442S_EMB_TO_MOON_QUANTIZATION_KILOMETERS = 0.0242;
const DE442S_EARTH_MOON_MASS_RATIO = 81.300_568_466_341_66;
const DE442S_GEOCENTRIC_MOON_QUANTIZATION_KILOMETERS =
  DE442S_EMB_TO_MOON_QUANTIZATION_KILOMETERS *
  (1 + 1 / DE442S_EARTH_MOON_MASS_RATIO);
// BSC5P stores RA to 0.1 second of time (1.5 arcsec on the sky) and
// declination to 1 arcsec. With no per-star covariance, the full grid
// widths are added linearly instead of treated as Gaussian errors.
const BSC5P_POSITION_ENVELOPE_ARCSECONDS = 2.5;
const ARCSECONDS_TO_RADIANS = Math.PI / (180 * 60 * 60);
const SPEED_OF_LIGHT_KILOMETERS_PER_DAY =
  SPEED_OF_LIGHT_KILOMETERS_PER_SECOND * SECONDS_PER_DAY;

export interface OccultationStarState {
  readonly starHR: number;
  readonly cirsDirection: Vector3;
  readonly horizontal: HorizontalCoordinates;
  readonly precisionWarnings: readonly PrecisionWarningCode[];
}

export interface LunarOccultationSample {
  readonly instantMilliseconds: number;
  readonly moon: ApparentBodyState;
  readonly target: OccultationStarState;
}

export interface LunarOccultationGeometry {
  readonly maximum: LunarOccultationSample;
  readonly limbContacts: readonly LunarOccultationSample[];
  readonly minimumClearanceRadians: number;
  readonly boundaryUncertaintyRadians: number;
  readonly boundaryUncertain: boolean;
  readonly numericallyTangent: boolean;
}

export interface LocalLunarOccultationOptions
  extends EventEarthOrientationProvenanceOptions,
    EventEphemerisSearchOptions {
  readonly deltaTModel?: string;
  readonly earthOrientation?: EarthOrientationOptions;
  readonly earthOrientationAt?: (
    date: Date,
  ) => EarthOrientationOptions | undefined;
  readonly earthRotationPathUncertaintyKilometers?: number | null;
  readonly eopId?: string;
  readonly heightMeters?: number;
  readonly horizontalAccuracyMeters?: number | null;
  readonly locationSource?: EventObserverContext["locationSource"];
  readonly halfWindowMilliseconds?: number;
  readonly scanStepMilliseconds?: number;
  readonly timingUncertaintySeconds?: number | null;
  readonly timeScaleContributors?: readonly string[];
  readonly timeScaleWarnings?: readonly string[];
  readonly shouldCancel?: () => boolean;
}

function checkCancelled(
  shouldCancel: (() => boolean) | undefined,
): void {
  if (shouldCancel?.()) {
    throw new DOMException(
      "Event calculation was cancelled",
      "AbortError",
    );
  }
}

function add(left: Vector3, right: Vector3): Vector3 {
  return [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
  ];
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function scale(vector: Vector3, factor: number): Vector3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function transpose(matrix: Matrix3): Matrix3 {
  return [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]],
  ];
}

function rotateTirsToCirs(
  vector: Vector3,
  angle: number,
): Vector3 {
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  return [
    cosine * vector[0] - sine * vector[1],
    sine * vector[0] + cosine * vector[1],
    vector[2],
  ];
}

interface ObserverAstrometry {
  readonly barycentricPositionAu: Vector3;
  readonly barycentricVelocityC: Vector3;
  readonly sunObserverDistanceAu: number;
}

/**
 * Builds the custom observer state expected by the precision-star pipeline.
 *
 * The transformation intentionally mirrors the WGS84 → ITRS → TIRS → CIRS
 * → ICRF site construction used by calculateApparentBody. Site rotational
 * velocity is folded into the single relativistic aberration call; the
 * precision pipeline's separate first-order diurnal correction is therefore
 * disabled by the caller to avoid counting it twice.
 */
function observerAstrometry(
  ephemeris: EventEphemerisProvider,
  ttJulianDate: number,
  ut1JulianDate: number,
  location: ObservingLocation,
  heightMeters: number,
  earthOrientation: EarthOrientationOptions | undefined,
): ObserverAstrometry {
  const latitudeRadians = degreesToRadians(location.latitude);
  const longitudeRadians = degreesToRadians(location.longitude);
  const precessionNutation =
    precessionNutationMatrix2006B(ttJulianDate);
  const siderealTime = greenwichApparentSiderealTime2006B(
    ut1JulianDate,
    ttJulianDate,
  );
  const polarMotion = polarMotionMatrix2000(
    earthOrientation?.polarMotion?.xpRadians ?? 0,
    earthOrientation?.polarMotion?.ypRadians ?? 0,
    approximateTioLocator(ttJulianDate),
  );
  const itrsSiteAu = wgs84ObserverPositionItrsAu(
    latitudeRadians,
    longitudeRadians,
    heightMeters,
  );
  const tirsSiteAu = multiplyMatrixVector(
    transpose(polarMotion),
    itrsSiteAu,
  );
  const cirsSiteAu = rotateTirsToCirs(tirsSiteAu, siderealTime);
  const icrfSiteAu = multiplyMatrixVector(
    transpose(precessionNutation),
    cirsSiteAu,
  );
  const earthRotationRadiansPerDay =
    1.002_737_811_911_354_6 * 2 * Math.PI;
  const cirsSiteVelocityAuPerDay: Vector3 = [
    -earthRotationRadiansPerDay * cirsSiteAu[1],
    earthRotationRadiansPerDay * cirsSiteAu[0],
    0,
  ];
  const icrfSiteVelocityKilometersPerDay = scale(
    multiplyMatrixVector(
      transpose(precessionNutation),
      cirsSiteVelocityAuPerDay,
    ),
    ASTRONOMICAL_UNIT_KILOMETERS,
  );

  const tdbJulianDate = ttToTdbJulianDate(ttJulianDate);
  const state = eventEphemerisState(
    ephemeris,
    tdbJulianDate,
  );
  const earthBarycentricAu = scale(
    state.earthBarycentric.positionKilometers,
    1 / ASTRONOMICAL_UNIT_KILOMETERS,
  );
  const observerVelocityKilometersPerDay = add(
    state.earthBarycentric.velocityKilometersPerDay,
    icrfSiteVelocityKilometersPerDay,
  );
  const sunToObserverKilometers = subtract(
    scale(icrfSiteAu, ASTRONOMICAL_UNIT_KILOMETERS),
    state.sunGeocentric.positionKilometers,
  );

  return {
    barycentricPositionAu: add(earthBarycentricAu, icrfSiteAu),
    barycentricVelocityC: scale(
      observerVelocityKilometersPerDay,
      1 / SPEED_OF_LIGHT_KILOMETERS_PER_DAY,
    ),
    sunObserverDistanceAu:
      magnitude(sunToObserverKilometers) /
      ASTRONOMICAL_UNIT_KILOMETERS,
  };
}

function clearance(sample: LunarOccultationSample): number {
  return (
    angularSeparationRadians(
      sample.moon.cirsDirection,
      sample.target.cirsDirection,
    ) - sample.moon.angularRadiusRadians
  );
}

function uniqueSortedTimes(
  times: readonly number[],
): readonly number[] {
  const result: number[] = [];
  for (const time of [...times].sort((left, right) => left - right)) {
    if (
      result.length === 0 ||
      Math.abs(time - (result[result.length - 1] ?? time)) > 100
    ) {
      result.push(time);
    }
  }
  return Object.freeze(result);
}

function contactTimes(
  sampleAt: (
    instantMilliseconds: number,
  ) => LunarOccultationSample,
  startMilliseconds: number,
  endMilliseconds: number,
  scanStepMilliseconds: number,
  shouldCancel?: () => boolean,
): readonly number[] {
  const value = (instantMilliseconds: number): number => {
    checkCancelled(shouldCancel);
    return clearance(sampleAt(instantMilliseconds));
  };
  return uniqueSortedTimes(
    findSignChangeBrackets(
      value,
      startMilliseconds,
      endMilliseconds,
      scanStepMilliseconds,
    ).map((bracket) =>
      solveBracketedRoot(
        value,
        bracket.lower,
        bracket.upper,
        ROOT_TIME_TOLERANCE_MILLISECONDS,
        ROOT_ANGLE_TOLERANCE_RADIANS,
      ).value,
    ),
  );
}

/**
 * Conservative angular band around the spherical mean lunar limb.
 *
 * The terms are added linearly because they do not share a covariance
 * model. A supplied horizontal accuracy is treated as a bound and omitted
 * when unknown. This is an engineering envelope, not a confidence interval
 * and not a substitute for a local lunar-limb profile.
 */
export function lunarOccultationBoundaryUncertaintyRadians(
  moonDistanceKilometers: number,
  horizontalAccuracyMeters?: number | null,
  earthRotationPathUncertaintyKilometers?: number | null,
): number {
  if (
    !Number.isFinite(moonDistanceKilometers) ||
    moonDistanceKilometers <= 0
  ) {
    throw new RangeError(
      "Lunar-occultation Moon distance must be finite and positive",
    );
  }
  validateOptionalUncertainty(
    horizontalAccuracyMeters,
    "Observer horizontal accuracy",
  );
  validateOptionalUncertainty(
    earthRotationPathUncertaintyKilometers,
    "Earth-rotation path uncertainty",
  );
  const observerKilometers =
    (horizontalAccuracyMeters ?? 0) / 1_000;
  return (
    (LUNAR_TOPOGRAPHY_ENVELOPE_KILOMETERS +
      DE442S_GEOCENTRIC_MOON_QUANTIZATION_KILOMETERS +
      observerKilometers +
      (earthRotationPathUncertaintyKilometers ?? 0)) /
      moonDistanceKilometers +
    BSC5P_POSITION_ENVELOPE_ARCSECONDS *
      ARCSECONDS_TO_RADIANS
  );
}

/**
 * Solves a local mean-limb occultation around a precomputed candidate epoch.
 *
 * A true occultation returns two limb roots ordered as disappearance then
 * reappearance. A closest approach inside the conservative physical
 * uncertainty band returns only the maximum sample, whether it is a shallow
 * mean-limb hit or a near miss. Numerical root/tangency epsilon is tracked
 * separately and never defines the physical event boundary.
 */
export function solveLunarOccultationGeometry(
  candidateMilliseconds: number,
  sampleAt: (
    instantMilliseconds: number,
  ) => LunarOccultationSample,
  options: Pick<
    LocalLunarOccultationOptions,
    | "earthRotationPathUncertaintyKilometers"
    | "halfWindowMilliseconds"
    | "horizontalAccuracyMeters"
    | "scanStepMilliseconds"
    | "searchBounds"
    | "shouldCancel"
  > = {},
): LunarOccultationGeometry | null {
  if (!Number.isFinite(candidateMilliseconds)) {
    throw new RangeError(
      "Lunar-occultation candidate time must be finite",
    );
  }
  const halfWindow =
    options.halfWindowMilliseconds ??
    DEFAULT_HALF_WINDOW_MILLISECONDS;
  const scanStep =
    options.scanStepMilliseconds ?? DEFAULT_SCAN_STEP_MILLISECONDS;
  if (
    !Number.isFinite(halfWindow) ||
    halfWindow <= 0 ||
    halfWindow > MAXIMUM_HALF_WINDOW_MILLISECONDS ||
    !Number.isFinite(scanStep) ||
    scanStep <= 0 ||
    scanStep > 2 * halfWindow
  ) {
    throw new RangeError(
      "Lunar-occultation search window and step are out of range",
    );
  }
  validateOptionalUncertainty(
    options.horizontalAccuracyMeters,
    "Observer horizontal accuracy",
  );
  validateOptionalUncertainty(
    options.earthRotationPathUncertaintyKilometers,
    "Earth-rotation path uncertainty",
  );
  const searchBounds = resolveEventSearchBounds(
    candidateMilliseconds,
    halfWindow,
    options.searchBounds,
  );
  const start = searchBounds.startUtcMilliseconds;
  const end = searchBounds.endUtcMilliseconds;

  const minimum = minimizeBracketed(
    (instantMilliseconds) => {
      checkCancelled(options.shouldCancel);
      return clearance(sampleAt(instantMilliseconds));
    },
    start,
    end,
    ROOT_TIME_TOLERANCE_MILLISECONDS,
  );
  checkCancelled(options.shouldCancel);
  const maximum = sampleAt(minimum.argument);
  const minimumClearanceRadians = clearance(maximum);
  const boundaryUncertaintyRadians =
    lunarOccultationBoundaryUncertaintyRadians(
      maximum.moon.distanceKilometers,
      options.horizontalAccuracyMeters,
      options.earthRotationPathUncertaintyKilometers,
    );
  if (minimumClearanceRadians > boundaryUncertaintyRadians) {
    return null;
  }
  const numericallyTangent =
    Math.abs(minimumClearanceRadians) <=
    NUMERICAL_TANGENCY_EPSILON_RADIANS;
  const boundaryUncertain =
    Math.abs(minimumClearanceRadians) <=
    boundaryUncertaintyRadians;
  if (boundaryUncertain) {
    return {
      maximum,
      limbContacts: Object.freeze([maximum]),
      minimumClearanceRadians,
      boundaryUncertaintyRadians,
      boundaryUncertain: true,
      numericallyTangent,
    };
  }

  // Split the scan at the known negative minimum. This guarantees that even
  // a very short near-grazing occultation supplies one sign-changing sample
  // interval on each side; a single uniform scan could step over both roots.
  const disappearanceRoots = contactTimes(
    sampleAt,
    start,
    minimum.argument,
    scanStep,
    options.shouldCancel,
  );
  const reappearanceRoots = contactTimes(
    sampleAt,
    minimum.argument,
    end,
    scanStep,
    options.shouldCancel,
  );
  if (
    disappearanceRoots.length < 1 ||
    reappearanceRoots.length < 1
  ) {
    throw new RangeError(
      "Lunar-occultation limb contacts were not bracketed",
    );
  }
  const contactRoots = [
    disappearanceRoots[disappearanceRoots.length - 1] as number,
    reappearanceRoots[0] as number,
  ];
  return {
    maximum,
    limbContacts: Object.freeze(
      contactRoots.map((instantMilliseconds) => {
        checkCancelled(options.shouldCancel);
        return sampleAt(instantMilliseconds);
      }),
    ),
    minimumClearanceRadians,
    boundaryUncertaintyRadians,
    boundaryUncertain: false,
    numericallyTangent,
  };
}

/**
 * Position angle of the target around the lunar center, measured eastward
 * from celestial north in the CIRS tangent plane.
 */
export function lunarLimbPositionAngleRadians(
  moonDirection: Vector3,
  targetDirection: Vector3,
): number | null {
  return eclipseContactPositionAngleRadians(
    moonDirection,
    targetDirection,
  );
}

function moonBodyPosition(
  moon: ApparentBodyState,
): EventBodyPosition {
  return {
    altitudeAzimuth: moon.horizontal,
    angularRadiusRadians: moon.angularRadiusRadians,
    distanceKilometers: moon.distanceKilometers,
  };
}

function targetBodyPosition(
  target: OccultationStarState,
): EventBodyPosition {
  return {
    altitudeAzimuth: target.horizontal,
    angularRadiusRadians: null,
    distanceKilometers: null,
  };
}

function eventContact(
  phase: EventContact["phase"],
  sample: LunarOccultationSample,
): EventContact {
  return {
    phase,
    instantUtc: new Date(sample.instantMilliseconds),
    bodies: {
      moon: moonBodyPosition(sample.moon),
      target: targetBodyPosition(sample.target),
    },
    // The target is point-like at this tier; use the contact point's
    // geometric altitude rather than the upper limb of the lunar disc.
    aboveHorizon: sample.target.horizontal.altitude > 0,
    positionAngleRadians: lunarLimbPositionAngleRadians(
      sample.moon.cirsDirection,
      sample.target.cirsDirection,
    ),
  };
}

function validateOptionalUncertainty(
  value: number | null | undefined,
  name: string,
): void {
  if (
    value !== undefined &&
    value !== null &&
    (!Number.isFinite(value) || value < 0)
  ) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

/**
 * Calculates reference-grade local circumstances for a bright-star
 * occultation by the Moon.
 *
 * DE442s supplies the Earth/Moon state. The existing precision-star pipeline
 * supplies FK5-to-ICRS frame connection, space motion, annual parallax and
 * relativistic aberration with the same topocentric observer state. A mean
 * spherical lunar limb is used; lunar topography and catalog covariance are
 * intentionally absent, so this API must not be presented as telescope-
 * timing grade.
 */
export function calculateLocalLunarOccultation(
  ephemeris: EventEphemerisProvider,
  event: EventSummary,
  targetStar: PrecisionStar,
  location: ObservingLocation,
  options: LocalLunarOccultationOptions = {},
): LocalCircumstances | null {
  if (event.kind !== "lunar-occultation") {
    throw new TypeError(
      "Lunar-occultation calculation requires an occultation event",
    );
  }
  if (
    event.targetStarHR === null ||
    event.targetStarHR !== targetStar.hr
  ) {
    throw new TypeError(
      "Lunar-occultation event and target star must have the same HR number",
    );
  }
  const candidateMilliseconds = event.canonicalEpochUtc.getTime();
  if (!Number.isFinite(candidateMilliseconds)) {
    throw new RangeError(
      "Lunar-occultation canonical epoch must be valid",
    );
  }
  const heightMeters = options.heightMeters ?? 0;
  if (!Number.isFinite(heightMeters)) {
    throw new RangeError("Observer height must be finite");
  }
  validateOptionalUncertainty(
    options.horizontalAccuracyMeters,
    "Observer horizontal accuracy",
  );
  validateOptionalUncertainty(
    options.timingUncertaintySeconds,
    "Occultation timing uncertainty",
  );
  validateOptionalUncertainty(
    options.earthRotationPathUncertaintyKilometers,
    "Earth-rotation path uncertainty",
  );

  const sampleAt = (
    instantMilliseconds: number,
  ): LunarOccultationSample => {
    checkCancelled(options.shouldCancel);
    const instant = new Date(instantMilliseconds);
    const earthOrientation =
      options.earthOrientationAt?.(instant) ??
      options.earthOrientation;
    const timeScales = resolveTimeScales(
      instant,
      earthOrientation,
    );
    const astrometry = observerAstrometry(
      ephemeris,
      timeScales.ttJulianDate,
      timeScales.ut1JulianDate,
      location,
      heightMeters,
      earthOrientation,
    );
    const star = calculateApparentStarPositionV2(
      targetStar,
      instant,
      location,
      {
        earthOrientation,
        annualParallax: {
          observerPositionAu: astrometry.barycentricPositionAu,
        },
        // calculateApparentBody currently omits solar ray deflection. Keep
        // the common Moon/star comparison consistent instead of applying
        // the correction to only one side of the limb equation.
        solarLightDeflection: false,
        aberration: {
          observerBarycentricVelocityC:
            astrometry.barycentricVelocityC,
          sunObserverDistanceAu: astrometry.sunObserverDistanceAu,
        },
        // Site rotation is already part of the custom barycentric velocity.
        diurnalAberration: false,
        refraction: false,
      },
    );
    const moon = calculateApparentBody(
      ephemeris,
      "moon",
      timeScales.ttJulianDate,
      timeScales.ut1JulianDate,
      location,
      {
        heightMeters,
        ...(earthOrientation?.polarMotion
          ? { polarMotion: earthOrientation.polarMotion }
          : {}),
      },
    );
    return {
      instantMilliseconds,
      moon,
      target: {
        starHR: targetStar.hr,
        cirsDirection: equatorialToVector(
          star.apparentEquatorial,
        ),
        horizontal: star.geometricHorizontal,
        precisionWarnings: star.metadata.warnings,
      },
    };
  };

  const loadedSearchBounds =
    eventEphemerisSearchBounds(ephemeris);
  const searchBounds = options.searchBounds
    ? intersectEventSearchBounds(
        options.searchBounds,
        loadedSearchBounds,
      )
    : loadedSearchBounds;
  const geometry = solveLunarOccultationGeometry(
    candidateMilliseconds,
    sampleAt,
    { ...options, searchBounds },
  );
  if (!geometry) {
    return null;
  }

  const maximum = eventContact("maximum", geometry.maximum);
  const boundaryEnvelopeKilometers =
    geometry.boundaryUncertaintyRadians *
    geometry.maximum.moon.distanceKilometers;
  const contacts: EventContact[] = geometry.boundaryUncertain
    ? [maximum]
    : [
        eventContact(
          "occultation-disappearance",
          geometry.limbContacts[0] as LunarOccultationSample,
        ),
        maximum,
        eventContact(
          "occultation-reappearance",
          geometry.limbContacts[
            geometry.limbContacts.length - 1
          ] as LunarOccultationSample,
        ),
      ];
  const visibility = geometry.boundaryUncertain
    ? classifyBoundaryMaximumVisibility(
        geometry.maximum.target.horizontal.altitude,
      )
    : classifyEventIntervalVisibility(
        (
          geometry.limbContacts[0] as LunarOccultationSample
        ).instantMilliseconds,
        (
          geometry.limbContacts[
            geometry.limbContacts.length - 1
          ] as LunarOccultationSample
        ).instantMilliseconds,
        (instantMilliseconds) =>
          sampleAt(instantMilliseconds).target.horizontal.altitude,
      );
  const earthOrientationProvenance =
    options.earthOrientationProvenanceAt?.(maximum.instantUtc) ?? {
      eopSourceSha256: options.eopSourceSha256 ?? null,
      eopRetrievedAt: options.eopRetrievedAt ?? null,
      dut1Quality: options.dut1Quality ?? "outside-coverage",
      polarMotionQuality:
        options.polarMotionQuality ?? "outside-coverage",
    };
  const provenance: EventProvenance = {
    algorithmVersion:
      "event-occultation-v1-bsc5p-mean-limb-boundary-band",
    ephemerisId: ephemeris.id,
    ephemerisSourceSha256: ephemeris.sourceSha256,
    ...earthOrientationProvenance,
    eopId: options.eopId ?? "caller-or-assumed",
    deltaTModel:
      options.deltaTModel ??
      "existing UTC-TAI-TT and caller DUT1",
    lunarRadiusModel: "mean-spherical-limb",
    limbProfileId: null,
  };
  const missingSpaceMotion =
    targetStar.pmRaCosDecArcsecPerYear === null ||
    targetStar.pmDecArcsecPerYear === null;
  const maximumEarthOrientation =
    options.earthOrientationAt?.(maximum.instantUtc) ??
    options.earthOrientation;
  const timeScaleNotices = eventTimeScaleNotices(
    maximum.instantUtc,
    maximumEarthOrientation,
  );
  return {
    event,
    localClassification: "occultation",
    observer: {
      ...location,
      heightMeters,
      horizontalAccuracyMeters:
        options.horizontalAccuracyMeters ?? null,
      locationSource: options.locationSource ?? "manual",
    },
    boundaryUncertain: geometry.boundaryUncertain,
    boundaryUncertaintyReason: geometry.boundaryUncertain
      ? "occultation-occurrence"
      : null,
    visibility,
    contacts: Object.freeze(contacts),
    maximum,
    magnitude: null,
    obscuration: null,
    uncertainty: {
      tier: "reference",
      timingSeconds: options.timingUncertaintySeconds ?? null,
      pathKilometers: boundaryEnvelopeKilometers,
      observerLocationMeters:
        options.horizontalAccuracyMeters ?? null,
      dominantContributors: Object.freeze([
        "BSC5P J2000 FK5恒星位置（星ごとの共分散なし、位置分解能2.5″を境界帯へ反映）",
        "平均球面月縁（LOLA・かぐや地形未使用、月地形±11 kmを境界帯へ反映）",
        "DE442s月位置係数量子化（地心月最大約24.5 mを境界帯へ反映）",
        "月と恒星の共通太陽重力偏向を未適用",
        ...(missingSpaceMotion
          ? ["対象星の固有運動が不完全"]
          : []),
        ...(targetStar.parallaxArcsec === null
          ? ["対象星の年周視差が未収録"]
          : []),
        ...(maximumEarthOrientation?.dut1Seconds === undefined
          ? ["UT1−UTCを0秒と仮定"]
          : []),
        ...(options.horizontalAccuracyMeters === null ||
        options.horizontalAccuracyMeters === undefined
          ? ["観測地点の水平精度が不明"]
          : ["観測地点の水平精度を境界帯へ線形加算"]),
        ...(options.earthRotationPathUncertaintyKilometers === null ||
        options.earthRotationPathUncertaintyKilometers === undefined
          ? []
          : ["ΔTによる地球回転の経路不確かさを境界帯へ線形加算"]),
        "経路値は月地形・暦・星表・地点・地球回転を線形加算した総境界幅",
        ...timeScaleNotices.dominantContributors,
        ...(options.timeScaleContributors ?? []),
      ]),
    },
    provenance,
    warnings: Object.freeze([
      "明るい恒星を対象にした参考予報です。精密な望遠鏡時刻測定には使用しないでください。",
      "潜入・出現は平均月縁との幾何学的接触で、月面地形による数秒規模の差を含みません。",
      `境界判定は月地形±11 km、DE442s月位置係数量子化約24.5 m、BSC5P位置分解能2.5″、既知の観測地点水平精度${options.earthRotationPathUncertaintyKilometers === null || options.earthRotationPathUncertaintyKilometers === undefined ? "" : `、ΔTによる経路±${options.earthRotationPathUncertaintyKilometers.toFixed(2)} km`}を保守的に線形加算します。`,
      `最接近時の総経路境界幅は約±${boundaryEnvelopeKilometers.toFixed(2)} kmです。`,
      "大気差、地形、建物、雲、視程は含みません。",
      ...(geometry.boundaryUncertain
        ? ["最接近が保守的な物理境界帯内のため、発生有無を確定せず最接近時刻のみを示します。"]
        : []),
      ...timeScaleNotices.warnings,
      ...(options.timeScaleWarnings ?? []),
    ]),
  };
}
