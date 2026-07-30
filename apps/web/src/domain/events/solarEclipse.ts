import type { EarthOrientationOptions } from "../precision";
import type { ObservingLocation } from "../types";
import { resolveTimeScales } from "../precision";
import {
  angularSeparationRadians,
  calculateApparentBody,
} from "./apparentBody";
import { eclipseContactPositionAngleRadians } from "./eclipseContactPositionAngle";
import {
  eventEphemerisSearchBounds,
  intersectEventSearchBounds,
  resolveEventSearchBounds,
} from "./ephemerisCoverage";
import {
  minimizeBracketed,
  solveBracketedRoot,
} from "./numerics";
import { eventTimeScaleNotices } from "./timeScaleNotices";
import {
  classifyBoundaryMaximumVisibility,
  classifyEventIntervalVisibility,
} from "./eventVisibility";
import type {
  ApparentBodyState,
  EventBodyPosition,
  EventContact,
  EventEarthOrientationProvenanceOptions,
  EventEarthOrientationReportedUncertainty,
  EventEphemerisSearchOptions,
  EventEphemerisProvider,
  EventPhysicalSample,
  EventObserverContext,
  EventProvenance,
  EventSummary,
  LocalCircumstances,
  SolarEclipseClassification,
} from "./types";

const DEFAULT_HALF_WINDOW_MILLISECONDS = 5 * 60 * 60 * 1_000;
const DEFAULT_SCAN_STEP_MILLISECONDS = 2 * 60 * 1_000;
const ROOT_TIME_TOLERANCE_MILLISECONDS = 20;
const ROOT_ANGLE_TOLERANCE_RADIANS = 1e-13;
// NASA reports departures of the real lunar limb from a smooth sphere of
// about ±3 arcseconds, or nearly ±6 km at the Moon's mean distance. Keep
// that full radial envelope when no topographic limb profile is available:
// https://eclipse.gsfc.nasa.gov/SEhelp/limb.html
const BASE_PATH_UNCERTAINTY_KILOMETERS = 6;

export interface SolarDiscSample {
  readonly instantMilliseconds: number;
  readonly sun: ApparentBodyState;
  readonly moon: ApparentBodyState;
}

export interface SolarEclipseGeometry {
  readonly classification: Exclude<
    SolarEclipseClassification,
    "partial" | "hybrid"
  > | "partial";
  readonly maximum: SolarDiscSample;
  readonly externalContacts: readonly SolarDiscSample[];
  readonly internalContacts: readonly SolarDiscSample[];
  readonly magnitude: number;
  readonly obscuration: number;
  readonly boundaryUncertaintyRadians: number;
  readonly earthRotationPathUncertaintyKilometers: number | null;
  readonly boundaryUncertain: boolean;
  readonly uncertainBoundary:
    | "external"
    | "partial-central"
    | null;
}

export interface LocalSolarEclipseOptions
  extends EventEarthOrientationProvenanceOptions,
    EventEphemerisSearchOptions {
  readonly deltaTModel?: string;
  readonly earthOrientation?: EarthOrientationOptions;
  readonly earthOrientationAt?: (
    date: Date,
  ) => EarthOrientationOptions | undefined;
  readonly eopId?: string;
  readonly earthRotationPathUncertaintyKilometers?: number | null;
  readonly earthRotationPathUncertaintyKilometersAt?: (
    date: Date,
  ) => number | null | undefined;
  readonly earthOrientationReportedUncertainty?:
    | EventEarthOrientationReportedUncertainty
    | null;
  readonly earthOrientationReportedUncertaintyAt?: (
    date: Date,
  ) => EventEarthOrientationReportedUncertainty | null | undefined;
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

function checkCancelled(shouldCancel: (() => boolean) | undefined): void {
  if (shouldCancel?.()) {
    throw new DOMException("Event calculation was cancelled", "AbortError");
  }
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
 * Conservative angular band around a local solar-eclipse path boundary.
 *
 * The mean-limb path envelope, independently supplied Earth-rotation path
 * envelope, and known observer horizontal accuracy are added linearly.
 * Dividing by the topocentric lunar distance converts that ground-path width
 * into the corresponding small-angle boundary used by the local disc solver.
 */
export function solarEclipseBoundaryUncertaintyRadians(
  moonDistanceKilometers: number,
  earthRotationPathUncertaintyKilometers?: number | null,
  horizontalAccuracyMeters?: number | null,
): number {
  if (
    !Number.isFinite(moonDistanceKilometers) ||
    moonDistanceKilometers <= 0
  ) {
    throw new RangeError(
      "Solar-eclipse Moon distance must be finite and positive",
    );
  }
  validateOptionalUncertainty(
    earthRotationPathUncertaintyKilometers,
    "Earth-rotation path uncertainty",
  );
  validateOptionalUncertainty(
    horizontalAccuracyMeters,
    "Observer horizontal accuracy",
  );
  const observerKilometers =
    (horizontalAccuracyMeters ?? 0) / 1_000;
  return (
    (BASE_PATH_UNCERTAINTY_KILOMETERS +
      (earthRotationPathUncertaintyKilometers ?? 0) +
      observerKilometers) /
    moonDistanceKilometers
  );
}

function separation(sample: SolarDiscSample): number {
  return angularSeparationRadians(
    sample.sun.icrfDirection,
    sample.moon.icrfDirection,
  );
}

function externalClearance(sample: SolarDiscSample): number {
  return (
    separation(sample) -
    sample.sun.angularRadiusRadians -
    sample.moon.angularRadiusRadians
  );
}

function internalClearance(sample: SolarDiscSample): number {
  return (
    separation(sample) -
    Math.abs(
      sample.moon.angularRadiusRadians -
        sample.sun.angularRadiusRadians,
    )
  );
}

function overlapFraction(
  separationRadians: number,
  sunRadiusRadians: number,
  moonRadiusRadians: number,
): number {
  const d = separationRadians;
  const first = sunRadiusRadians;
  const second = moonRadiusRadians;
  if (d >= first + second) {
    return 0;
  }
  if (d <= Math.abs(first - second)) {
    const coveredRadius = Math.min(first, second);
    return Math.min(1, (coveredRadius * coveredRadius) / (first * first));
  }
  const firstAngle = Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        (d * d + first * first - second * second) / (2 * d * first),
      ),
    ),
  );
  const secondAngle = Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        (d * d + second * second - first * first) /
          (2 * d * second),
      ),
    ),
  );
  const triangleArea =
    0.5 *
    Math.sqrt(
      Math.max(
        0,
        (-d + first + second) *
          (d + first - second) *
          (d - first + second) *
          (d + first + second),
      ),
    );
  const overlapArea =
    first * first * firstAngle +
    second * second * secondAngle -
    triangleArea;
  return Math.max(
    0,
    Math.min(1, overlapArea / (Math.PI * first * first)),
  );
}

function contactTimesAroundMinimum(
  clearance: (sample: SolarDiscSample) => number,
  sampleAt: (instantMilliseconds: number) => SolarDiscSample,
  startMilliseconds: number,
  minimumMilliseconds: number,
  endMilliseconds: number,
  shouldCancel?: () => boolean,
): readonly number[] {
  const value = (instant: number): number => {
    checkCancelled(shouldCancel);
    return clearance(sampleAt(instant));
  };
  const minimumValue = value(minimumMilliseconds);
  if (minimumValue >= 0) {
    return Object.freeze([]);
  }
  const startValue = value(startMilliseconds);
  const endValue = value(endMilliseconds);
  if (startValue <= 0 || endValue <= 0) {
    return Object.freeze([]);
  }
  return Object.freeze([
    solveBracketedRoot(
      value,
      startMilliseconds,
      minimumMilliseconds,
      ROOT_TIME_TOLERANCE_MILLISECONDS,
      ROOT_ANGLE_TOLERANCE_RADIANS,
    ).value,
    solveBracketedRoot(
      value,
      minimumMilliseconds,
      endMilliseconds,
      ROOT_TIME_TOLERANCE_MILLISECONDS,
      ROOT_ANGLE_TOLERANCE_RADIANS,
    ).value,
  ]);
}

export function solveSolarEclipseGeometry(
  candidateMilliseconds: number,
  sampleAt: (instantMilliseconds: number) => SolarDiscSample,
  options: Pick<
    LocalSolarEclipseOptions,
    | "earthRotationPathUncertaintyKilometers"
    | "earthRotationPathUncertaintyKilometersAt"
    | "halfWindowMilliseconds"
    | "horizontalAccuracyMeters"
    | "scanStepMilliseconds"
    | "searchBounds"
    | "shouldCancel"
  > = {},
): SolarEclipseGeometry | null {
  if (!Number.isFinite(candidateMilliseconds)) {
    throw new RangeError("Solar-eclipse candidate time must be finite");
  }
  const halfWindow =
    options.halfWindowMilliseconds ??
    DEFAULT_HALF_WINDOW_MILLISECONDS;
  const scanStep =
    options.scanStepMilliseconds ?? DEFAULT_SCAN_STEP_MILLISECONDS;
  if (
    !Number.isFinite(halfWindow) ||
    halfWindow <= 0 ||
    !Number.isFinite(scanStep) ||
    scanStep <= 0
  ) {
    throw new RangeError("Solar-eclipse search window must be positive");
  }
  validateOptionalUncertainty(
    options.earthRotationPathUncertaintyKilometers,
    "Earth-rotation path uncertainty",
  );
  validateOptionalUncertainty(
    options.horizontalAccuracyMeters,
    "Observer horizontal accuracy",
  );
  const searchBounds = resolveEventSearchBounds(
    candidateMilliseconds,
    halfWindow,
    options.searchBounds,
  );
  const start = searchBounds.startUtcMilliseconds;
  const end = searchBounds.endUtcMilliseconds;
  const minimum = minimizeBracketed(
    (instant) => {
      checkCancelled(options.shouldCancel);
      return separation(sampleAt(instant));
    },
    start,
    end,
    ROOT_TIME_TOLERANCE_MILLISECONDS,
  );
  const maximum = sampleAt(minimum.argument);
  const maximumEarthRotationPathUncertaintyKilometers =
    options.earthRotationPathUncertaintyKilometersAt
      ? options.earthRotationPathUncertaintyKilometersAt(
          new Date(maximum.instantMilliseconds),
        )
      : options.earthRotationPathUncertaintyKilometers;
  validateOptionalUncertainty(
    maximumEarthRotationPathUncertaintyKilometers,
    "Earth-rotation path uncertainty at solar maximum",
  );
  const boundaryUncertaintyRadians =
    solarEclipseBoundaryUncertaintyRadians(
      maximum.moon.distanceKilometers,
      maximumEarthRotationPathUncertaintyKilometers,
      options.horizontalAccuracyMeters,
    );
  const maximumExternalClearance = externalClearance(maximum);
  if (maximumExternalClearance > boundaryUncertaintyRadians) {
    return null;
  }
  const centerSeparation = separation(maximum);
  const sunRadius = maximum.sun.angularRadiusRadians;
  const moonRadius = maximum.moon.angularRadiusRadians;
  if (
    Math.abs(maximumExternalClearance) <=
    boundaryUncertaintyRadians
  ) {
    return {
      classification: "partial",
      maximum,
      externalContacts: Object.freeze([maximum]),
      internalContacts: Object.freeze([]),
      magnitude: Math.max(
        0,
        (sunRadius + moonRadius - centerSeparation) /
          (2 * sunRadius),
      ),
      obscuration: overlapFraction(
        centerSeparation,
        sunRadius,
        moonRadius,
      ),
      boundaryUncertaintyRadians,
      earthRotationPathUncertaintyKilometers:
        maximumEarthRotationPathUncertaintyKilometers ?? null,
      boundaryUncertain: true,
      uncertainBoundary: "external",
    };
  }
  const externalTimes = contactTimesAroundMinimum(
    externalClearance,
    sampleAt,
    start,
    minimum.argument,
    end,
    options.shouldCancel,
  );
  if (externalTimes.length < 2) {
    throw new RangeError("Solar eclipse external contacts were not bracketed");
  }
  const internalMinimum = minimizeBracketed(
    (instant) => {
      checkCancelled(options.shouldCancel);
      return internalClearance(sampleAt(instant));
    },
    externalTimes[0] as number,
    externalTimes[externalTimes.length - 1] as number,
    ROOT_TIME_TOLERANCE_MILLISECONDS,
  );
  const internalMaximum = sampleAt(internalMinimum.argument);
  const internalEarthRotationPathUncertaintyKilometers =
    options.earthRotationPathUncertaintyKilometersAt
      ? options.earthRotationPathUncertaintyKilometersAt(
          new Date(internalMaximum.instantMilliseconds),
        )
      : options.earthRotationPathUncertaintyKilometers;
  validateOptionalUncertainty(
    internalEarthRotationPathUncertaintyKilometers,
    "Earth-rotation path uncertainty at solar internal maximum",
  );
  const internalBoundaryUncertaintyRadians =
    solarEclipseBoundaryUncertaintyRadians(
      internalMaximum.moon.distanceKilometers,
      internalEarthRotationPathUncertaintyKilometers,
      options.horizontalAccuracyMeters,
    );
  const partialCentralBoundaryUncertain =
    Math.abs(internalMinimum.value) <=
    internalBoundaryUncertaintyRadians;
  const hasInternalContacts = internalMinimum.value < 0;
  const internalTimes =
    hasInternalContacts && !partialCentralBoundaryUncertain
    ? contactTimesAroundMinimum(
        internalClearance,
        sampleAt,
        externalTimes[0] as number,
        internalMinimum.argument,
        externalTimes[externalTimes.length - 1] as number,
        options.shouldCancel,
      )
    : [];
  if (
    hasInternalContacts &&
    !partialCentralBoundaryUncertain &&
    internalTimes.length < 2
  ) {
    throw new RangeError(
      "Solar eclipse internal contacts were not bracketed",
    );
  }
  return {
    classification: hasInternalContacts
      ? moonRadius >= sunRadius
        ? "total"
        : "annular"
      : "partial",
    maximum,
    externalContacts: Object.freeze(
      externalTimes.slice(0, 1).concat(externalTimes.slice(-1)).map(sampleAt),
    ),
    internalContacts: Object.freeze(
      internalTimes.slice(0, 1).concat(internalTimes.slice(-1)).map(sampleAt),
    ),
    magnitude: hasInternalContacts
      ? moonRadius / sunRadius
      : Math.max(
          0,
          (sunRadius + moonRadius - centerSeparation) /
            (2 * sunRadius),
        ),
    obscuration: overlapFraction(
      centerSeparation,
      sunRadius,
      moonRadius,
    ),
    boundaryUncertaintyRadians:
      partialCentralBoundaryUncertain
        ? internalBoundaryUncertaintyRadians
        : boundaryUncertaintyRadians,
    earthRotationPathUncertaintyKilometers:
      (partialCentralBoundaryUncertain
        ? internalEarthRotationPathUncertaintyKilometers
        : maximumEarthRotationPathUncertaintyKilometers) ?? null,
    boundaryUncertain: partialCentralBoundaryUncertain,
    uncertainBoundary: partialCentralBoundaryUncertain
      ? "partial-central"
      : null,
  };
}

function bodyPosition(body: ApparentBodyState): EventBodyPosition {
  return {
    altitudeAzimuth: body.horizontal,
    angularRadiusRadians: body.angularRadiusRadians,
    distanceKilometers: body.distanceKilometers,
  };
}

function solarDiscSampleAt(
  ephemeris: EventEphemerisProvider,
  instantMilliseconds: number,
  location: ObservingLocation,
  options: LocalSolarEclipseOptions,
): SolarDiscSample {
  if (!Number.isFinite(instantMilliseconds)) {
    throw new RangeError("Solar-eclipse sample time must be finite");
  }
  checkCancelled(options.shouldCancel);
  const date = new Date(instantMilliseconds);
  const earthOrientation =
    options.earthOrientationAt?.(date) ??
    options.earthOrientation;
  const timeScales = resolveTimeScales(
    date,
    earthOrientation,
  );
  const apparentOptions = {
    heightMeters: options.heightMeters ?? 0,
    ...(earthOrientation?.polarMotion
      ? { polarMotion: earthOrientation.polarMotion }
      : {}),
  };
  return {
    instantMilliseconds,
    sun: calculateApparentBody(
      ephemeris,
      "sun",
      timeScales.ttJulianDate,
      timeScales.ut1JulianDate,
      location,
      apparentOptions,
    ),
    moon: calculateApparentBody(
      ephemeris,
      "moon",
      timeScales.ttJulianDate,
      timeScales.ut1JulianDate,
      location,
      apparentOptions,
    ),
  };
}

/**
 * Recomputes a local Sun/Moon scene at an arbitrary UTC instant.
 *
 * The returned value deliberately has no contact phase: consumers must label
 * it as a sampled instant rather than as C1/C2/maximum/C3/C4.
 */
export function sampleLocalSolarEclipseAt(
  ephemeris: EventEphemerisProvider,
  instantUtc: Date,
  location: ObservingLocation,
  options: LocalSolarEclipseOptions = {},
): EventPhysicalSample {
  const sample = solarDiscSampleAt(
    ephemeris,
    instantUtc.getTime(),
    location,
    options,
  );
  return {
    instantUtc: new Date(sample.instantMilliseconds),
    bodies: {
      sun: bodyPosition(sample.sun),
      moon: bodyPosition(sample.moon),
    },
    aboveHorizon:
      sample.sun.horizontal.altitude +
        sample.sun.angularRadiusRadians >
      0,
    positionAngleRadians: null,
  };
}

function contact(
  phase: EventContact["phase"],
  sample: SolarDiscSample,
): EventContact {
  const isInternalContact =
    phase === "solar-c2" || phase === "solar-c3";
  const contactPointIsAwayFromMoon =
    isInternalContact &&
    sample.moon.angularRadiusRadians >
      sample.sun.angularRadiusRadians;
  return {
    phase,
    instantUtc: new Date(sample.instantMilliseconds),
    bodies: {
      sun: bodyPosition(sample.sun),
      moon: bodyPosition(sample.moon),
    },
    aboveHorizon:
      sample.sun.horizontal.altitude +
        sample.sun.angularRadiusRadians >
      0,
    positionAngleRadians:
      phase === "maximum"
        ? null
        : eclipseContactPositionAngleRadians(
            sample.sun.cirsDirection,
            sample.moon.cirsDirection,
            contactPointIsAwayFromMoon
              ? "away-from-other-center"
              : "toward-other-center",
          ),
  };
}

export function calculateLocalSolarEclipse(
  ephemeris: EventEphemerisProvider,
  event: EventSummary,
  location: ObservingLocation,
  options: LocalSolarEclipseOptions = {},
): LocalCircumstances | null {
  if (event.kind !== "solar-eclipse") {
    throw new TypeError("Solar-eclipse calculation requires a solar event");
  }
  const sampleAt = (instantMilliseconds: number): SolarDiscSample =>
    solarDiscSampleAt(
      ephemeris,
      instantMilliseconds,
      location,
      options,
    );
  const loadedSearchBounds =
    eventEphemerisSearchBounds(ephemeris);
  const searchBounds = options.searchBounds
    ? intersectEventSearchBounds(
        options.searchBounds,
        loadedSearchBounds,
      )
    : loadedSearchBounds;
  const geometry = solveSolarEclipseGeometry(
    event.canonicalEpochUtc.getTime(),
    sampleAt,
    { ...options, searchBounds },
  );
  if (!geometry) {
    return null;
  }

  const external = geometry.externalContacts;
  const internal = geometry.internalContacts;
  const hasCertainExternalContacts = external.length >= 2;
  const contacts: EventContact[] = hasCertainExternalContacts
    ? [
        contact("solar-c1", external[0] as SolarDiscSample),
        ...(internal[0]
          ? [contact("solar-c2", internal[0])]
          : []),
        contact("maximum", geometry.maximum),
        ...(internal[1]
          ? [contact("solar-c3", internal[1])]
          : []),
        contact(
          "solar-c4",
          external[
            external.length - 1
          ] as SolarDiscSample,
        ),
      ]
    : [contact("maximum", geometry.maximum)];
  const visibility =
    geometry.uncertainBoundary === "external"
      ? classifyBoundaryMaximumVisibility(
          geometry.maximum.sun.horizontal.altitude +
            geometry.maximum.sun.angularRadiusRadians,
        )
      : classifyEventIntervalVisibility(
        (external[0] as SolarDiscSample).instantMilliseconds,
        (
          external[
            external.length - 1
          ] as SolarDiscSample
        ).instantMilliseconds,
        (instant) => {
          const sample = sampleAt(instant);
          return (
            sample.sun.horizontal.altitude +
            sample.sun.angularRadiusRadians
          );
        },
      );
  const observer: EventObserverContext = {
    ...location,
    heightMeters: options.heightMeters ?? 0,
    horizontalAccuracyMeters:
      options.horizontalAccuracyMeters ?? null,
    locationSource: options.locationSource ?? "manual",
  };
  const maximumDate = new Date(
    geometry.maximum.instantMilliseconds,
  );
  const earthOrientationProvenance =
    options.earthOrientationProvenanceAt?.(maximumDate) ?? {
      eopSourceSha256: options.eopSourceSha256 ?? null,
      eopRetrievedAt: options.eopRetrievedAt ?? null,
      dut1Quality: options.dut1Quality ?? "outside-coverage",
      polarMotionQuality:
        options.polarMotionQuality ?? "outside-coverage",
    };
  const provenance: EventProvenance = {
    algorithmVersion: "event-solar-v1",
    ephemerisId: ephemeris.id,
    ephemerisSourceSha256: ephemeris.sourceSha256,
    ...earthOrientationProvenance,
    eopId:
      options.eopIdAt?.(maximumDate) ??
      options.eopId ??
      "caller-or-assumed",
    deltaTModel:
      options.deltaTModel ??
      "existing UTC-TAI-TT and caller DUT1",
    lunarRadiusModel: "mean-spherical-limb",
    limbProfileId: null,
  };
  const timingUncertaintySeconds =
    options.timingUncertaintySeconds ?? null;
  const maximumEarthOrientation =
    options.earthOrientationAt?.(maximumDate) ??
    options.earthOrientation;
  const maximumEarthOrientationReportedUncertainty =
    options.earthOrientationReportedUncertaintyAt
      ? options.earthOrientationReportedUncertaintyAt(
          maximumDate,
        ) ?? null
      : options.earthOrientationReportedUncertainty ?? null;
  const timeScaleNotices = eventTimeScaleNotices(
    maximumDate,
    maximumEarthOrientation,
  );
  return {
    event,
    localClassification: geometry.classification,
    observer,
    boundaryUncertain: geometry.boundaryUncertain,
    boundaryUncertaintyReason:
      geometry.uncertainBoundary === "external"
        ? "solar-occurrence"
        : geometry.uncertainBoundary === "partial-central"
          ? "solar-central-classification"
          : null,
    visibility,
    contacts: Object.freeze(contacts),
    maximum: contacts.find((item) => item.phase === "maximum") as EventContact,
    magnitude: geometry.magnitude,
    obscuration: geometry.obscuration,
    uncertainty: {
      tier: "uncertain",
      timingSeconds: timingUncertaintySeconds,
      pathKilometers:
        BASE_PATH_UNCERTAINTY_KILOMETERS +
        (geometry.earthRotationPathUncertaintyKilometers ?? 0) +
        (options.horizontalAccuracyMeters ?? 0) / 1_000,
      observerLocationMeters:
        options.horizontalAccuracyMeters ?? null,
      earthOrientation:
        maximumEarthOrientationReportedUncertainty,
      dominantContributors: Object.freeze([
        "平均月縁（地形未使用）",
        ...(maximumEarthOrientation?.dut1Seconds === undefined
          ? ["UT1−UTCを0秒と仮定"]
          : []),
        ...(options.horizontalAccuracyMeters === null ||
        options.horizontalAccuracyMeters === undefined
          ? ["観測地点の水平精度が不明"]
          : ["観測地点の水平精度を境界帯へ線形加算"]),
        ...(geometry.earthRotationPathUncertaintyKilometers === null
          ? []
          : ["地球回転・姿勢モデルの経路幅を境界帯へ線形加算"]),
        "実月縁地形±6 km・既知の観測地点水平精度・地球回転経路を線形加算した総境界幅",
        ...timeScaleNotices.dominantContributors,
        ...(options.timeScaleContributors ?? []),
      ]),
    },
    provenance,
    warnings: Object.freeze([
      "平均月縁による幾何学的予報です。",
      "地形、建物、雲、視程は含みません。",
      "太陽が地平線に近い段階は大気差の影響を受けます。",
      ...(geometry.uncertainBoundary === "external"
        ? [
            "最接近が局地日食の保守的な物理境界帯内のため、発生有無を確定せず最接近時刻のみを示します。",
          ]
        : geometry.uncertainBoundary === "partial-central"
          ? [
              "最接近が部分食と中心食の保守的な物理境界帯内のため、局地分類を確定せず中心食接触は示しません。",
            ]
          : []),
      ...timeScaleNotices.warnings,
      ...(options.timeScaleWarnings ?? []),
    ]),
  };
}
