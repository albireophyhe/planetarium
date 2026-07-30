import type { EarthOrientationOptions } from "../precision";
import { resolveTimeScales } from "../precision";
import type { ObservingLocation } from "../types";
import {
  angularSeparationRadians,
  calculateApparentBody,
  calculateGeocentricApparentBody,
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
import { classifyEventIntervalVisibility } from "./eventVisibility";
import type {
  ApparentGeocentricBodyState,
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
  LunarEclipseClassification,
} from "./types";

const EARTH_EQUATORIAL_RADIUS_KILOMETERS = 6_378.137;
const DANJON_SHADOW_PARALLAX_FACTOR = 1.01;
const DEFAULT_HALF_WINDOW_MILLISECONDS = 7 * 60 * 60 * 1_000;
const DEFAULT_SCAN_STEP_MILLISECONDS = 3 * 60 * 1_000;
const ROOT_TIME_TOLERANCE_MILLISECONDS = 50;
const ROOT_ANGLE_TOLERANCE_RADIANS = 1e-12;

export interface LunarShadowSample {
  readonly instantMilliseconds: number;
  readonly sun: ApparentGeocentricBodyState;
  readonly moon: ApparentGeocentricBodyState;
  readonly centerSeparationRadians: number;
  readonly penumbralRadiusRadians: number;
  readonly umbralRadiusRadians: number;
}
export interface LunarEclipseGeometry {
  readonly classification: LunarEclipseClassification;
  readonly maximum: LunarShadowSample;
  readonly penumbralContacts: readonly LunarShadowSample[];
  readonly umbralContacts: readonly LunarShadowSample[];
  readonly totalContacts: readonly LunarShadowSample[];
  readonly penumbralMagnitude: number;
  readonly umbralMagnitude: number;
}

export interface LocalLunarEclipseOptions
  extends EventEarthOrientationProvenanceOptions,
    EventEphemerisSearchOptions {
  readonly deltaTModel?: string;
  readonly earthOrientation?: EarthOrientationOptions;
  readonly earthOrientationAt?: (
    date: Date,
  ) => EarthOrientationOptions | undefined;
  readonly eopId?: string;
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

function opposite(
  direction: readonly [number, number, number],
): readonly [number, number, number] {
  return [-direction[0], -direction[1], -direction[2]];
}

export function lunarShadowSample(
  instantMilliseconds: number,
  sun: ApparentGeocentricBodyState,
  moon: ApparentGeocentricBodyState,
): LunarShadowSample {
  const moonParallax = Math.asin(
    Math.min(
      1,
      EARTH_EQUATORIAL_RADIUS_KILOMETERS /
        moon.distanceKilometers,
    ),
  );
  const sunParallax = Math.asin(
    Math.min(
      1,
      EARTH_EQUATORIAL_RADIUS_KILOMETERS /
        sun.distanceKilometers,
    ),
  );
  return {
    instantMilliseconds,
    sun,
    moon,
    centerSeparationRadians: angularSeparationRadians(
      moon.icrfDirection,
      opposite(sun.icrfDirection),
    ),
    penumbralRadiusRadians:
      DANJON_SHADOW_PARALLAX_FACTOR * moonParallax +
      sun.angularRadiusRadians +
      sunParallax,
    umbralRadiusRadians:
      DANJON_SHADOW_PARALLAX_FACTOR * moonParallax -
      sun.angularRadiusRadians +
      sunParallax,
  };
}

function clearance(
  sample: LunarShadowSample,
  shadow: "penumbral" | "umbral" | "total",
): number {
  const shadowRadius =
    shadow === "penumbral"
      ? sample.penumbralRadiusRadians
      : sample.umbralRadiusRadians;
  const contactRadius =
    shadow === "total"
      ? shadowRadius - sample.moon.angularRadiusRadians
      : shadowRadius + sample.moon.angularRadiusRadians;
  return sample.centerSeparationRadians - contactRadius;
}

function contactTimes(
  shadow: "penumbral" | "umbral" | "total",
  sampleAt: (instantMilliseconds: number) => LunarShadowSample,
  start: number,
  end: number,
  shouldCancel?: () => boolean,
): readonly number[] {
  const value = (instant: number): number => {
    if (shouldCancel?.()) {
      throw new DOMException(
        "Event calculation was cancelled",
        "AbortError",
      );
    }
    return clearance(sampleAt(instant), shadow);
  };
  const minimum = minimizeBracketed(
    value,
    start,
    end,
    ROOT_TIME_TOLERANCE_MILLISECONDS,
  );
  if (minimum.value >= 0) {
    return Object.freeze([]);
  }
  if (value(start) <= 0 || value(end) <= 0) {
    throw new RangeError(
      "Lunar-eclipse search window does not bracket both contacts",
    );
  }
  return Object.freeze([
    solveBracketedRoot(
      value,
      start,
      minimum.argument,
      ROOT_TIME_TOLERANCE_MILLISECONDS,
      ROOT_ANGLE_TOLERANCE_RADIANS,
    ).value,
    solveBracketedRoot(
      value,
      minimum.argument,
      end,
      ROOT_TIME_TOLERANCE_MILLISECONDS,
      ROOT_ANGLE_TOLERANCE_RADIANS,
    ).value,
  ]);
}

export function solveLunarEclipseGeometry(
  candidateMilliseconds: number,
  sampleAt: (instantMilliseconds: number) => LunarShadowSample,
  options: Pick<
    LocalLunarEclipseOptions,
    | "halfWindowMilliseconds"
    | "scanStepMilliseconds"
    | "searchBounds"
    | "shouldCancel"
  > = {},
): LunarEclipseGeometry | null {
  if (!Number.isFinite(candidateMilliseconds)) {
    throw new RangeError("Lunar-eclipse candidate time must be finite");
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
    throw new RangeError("Lunar-eclipse search window must be positive");
  }
  const searchBounds = resolveEventSearchBounds(
    candidateMilliseconds,
    halfWindow,
    options.searchBounds,
  );
  const start = searchBounds.startUtcMilliseconds;
  const end = searchBounds.endUtcMilliseconds;
  const minimum = minimizeBracketed(
    (instant) => {
      if (options.shouldCancel?.()) {
        throw new DOMException(
          "Event calculation was cancelled",
          "AbortError",
        );
      }
      return sampleAt(instant).centerSeparationRadians;
    },
    start,
    end,
    ROOT_TIME_TOLERANCE_MILLISECONDS,
  );
  const maximum = sampleAt(minimum.argument);
  if (clearance(maximum, "penumbral") >= 0) {
    return null;
  }
  const penumbralTimes = contactTimes(
    "penumbral",
    sampleAt,
    start,
    end,
    options.shouldCancel,
  );
  const umbralTimes = contactTimes(
    "umbral",
    sampleAt,
    start,
    end,
    options.shouldCancel,
  );
  const totalTimes = contactTimes(
    "total",
    sampleAt,
    start,
    end,
    options.shouldCancel,
  );
  const hasUmbra = umbralTimes.length >= 2;
  const hasTotality = totalTimes.length >= 2;
  if (
    penumbralTimes.length < 2 ||
    (hasUmbra && umbralTimes.length < 2) ||
    (hasTotality && totalTimes.length < 2)
  ) {
    throw new RangeError("Lunar-eclipse contacts were not bracketed");
  }
  const moonDiameter = 2 * maximum.moon.angularRadiusRadians;
  return {
    classification: hasTotality
      ? "total"
      : hasUmbra
        ? "partial"
        : "penumbral",
    maximum,
    penumbralContacts: Object.freeze(
      penumbralTimes
        .slice(0, 1)
        .concat(penumbralTimes.slice(-1))
        .map(sampleAt),
    ),
    umbralContacts: Object.freeze(
      umbralTimes
        .slice(0, 1)
        .concat(umbralTimes.slice(-1))
        .map(sampleAt),
    ),
    totalContacts: Object.freeze(
      totalTimes
        .slice(0, 1)
        .concat(totalTimes.slice(-1))
        .map(sampleAt),
    ),
    penumbralMagnitude:
      (maximum.penumbralRadiusRadians +
        maximum.moon.angularRadiusRadians -
        maximum.centerSeparationRadians) /
      moonDiameter,
    umbralMagnitude:
      (maximum.umbralRadiusRadians +
        maximum.moon.angularRadiusRadians -
        maximum.centerSeparationRadians) /
      moonDiameter,
  };
}

function moonBodyPosition(
  moon: ReturnType<typeof calculateApparentBody>,
): EventBodyPosition {
  return {
    altitudeAzimuth: moon.horizontal,
    angularRadiusRadians: moon.angularRadiusRadians,
    distanceKilometers: moon.distanceKilometers,
  };
}

function globalLunarShadowSampleAt(
  ephemeris: EventEphemerisProvider,
  instantMilliseconds: number,
  options: LocalLunarEclipseOptions,
): LunarShadowSample {
  if (!Number.isFinite(instantMilliseconds)) {
    throw new RangeError("Lunar-eclipse sample time must be finite");
  }
  if (options.shouldCancel?.()) {
    throw new DOMException(
      "Event calculation was cancelled",
      "AbortError",
    );
  }
  const instant = new Date(instantMilliseconds);
  const earthOrientation =
    options.earthOrientationAt?.(instant) ??
    options.earthOrientation;
  const timeScales = resolveTimeScales(
    instant,
    earthOrientation,
  );
  return lunarShadowSample(
    instantMilliseconds,
    calculateGeocentricApparentBody(
      ephemeris,
      "sun",
      timeScales.ttJulianDate,
    ),
    calculateGeocentricApparentBody(
      ephemeris,
      "moon",
      timeScales.ttJulianDate,
    ),
  );
}

function localLunarPhysicalSample(
  ephemeris: EventEphemerisProvider,
  sample: LunarShadowSample,
  location: ObservingLocation,
  options: LocalLunarEclipseOptions,
): EventPhysicalSample {
  const instant = new Date(sample.instantMilliseconds);
  const earthOrientation =
    options.earthOrientationAt?.(instant) ??
    options.earthOrientation;
  const timeScales = resolveTimeScales(
    instant,
    earthOrientation,
  );
  const moon = calculateApparentBody(
    ephemeris,
    "moon",
    timeScales.ttJulianDate,
    timeScales.ut1JulianDate,
    location,
    {
      heightMeters: options.heightMeters ?? 0,
      ...(earthOrientation?.polarMotion
        ? { polarMotion: earthOrientation.polarMotion }
        : {}),
    },
  );
  const shadowCenterDirection = opposite(
    sample.sun.cirsDirection,
  );
  return {
    instantUtc: instant,
    bodies: { moon: moonBodyPosition(moon) },
    lunarShadow: {
      centerSeparationRadians:
        sample.centerSeparationRadians,
      centerPositionAngleRadians:
        eclipseContactPositionAngleRadians(
          sample.moon.cirsDirection,
          shadowCenterDirection,
        ),
      penumbralAngularRadiusRadians:
        sample.penumbralRadiusRadians,
      umbralAngularRadiusRadians:
        sample.umbralRadiusRadians,
    },
    aboveHorizon:
      moon.horizontal.altitude + moon.angularRadiusRadians > 0,
    positionAngleRadians: null,
  };
}

/**
 * Recomputes the local Moon and mean Earth-shadow geometry at one UTC
 * instant. It makes no claim that the instant is a solved eclipse contact.
 */
export function sampleLocalLunarEclipseAt(
  ephemeris: EventEphemerisProvider,
  instantUtc: Date,
  location: ObservingLocation,
  options: LocalLunarEclipseOptions = {},
): EventPhysicalSample {
  const globalSample = globalLunarShadowSampleAt(
    ephemeris,
    instantUtc.getTime(),
    options,
  );
  return localLunarPhysicalSample(
    ephemeris,
    globalSample,
    location,
    options,
  );
}

export function calculateLocalLunarEclipse(
  ephemeris: EventEphemerisProvider,
  event: EventSummary,
  location: ObservingLocation,
  options: LocalLunarEclipseOptions = {},
): LocalCircumstances | null {
  if (event.kind !== "lunar-eclipse") {
    throw new TypeError("Lunar-eclipse calculation requires a lunar event");
  }
  const globalSampleAt = (
    instantMilliseconds: number,
  ): LunarShadowSample =>
    globalLunarShadowSampleAt(
      ephemeris,
      instantMilliseconds,
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
  const geometry = solveLunarEclipseGeometry(
    event.canonicalEpochUtc.getTime(),
    globalSampleAt,
    { ...options, searchBounds },
  );
  if (!geometry) {
    return null;
  }

  const localContact = (
    phase: EventContact["phase"],
    sample: LunarShadowSample,
  ): EventContact => {
    const physicalSample = localLunarPhysicalSample(
      ephemeris,
      sample,
      location,
      options,
    );
    const shadowCenterDirection = opposite(
      sample.sun.cirsDirection,
    );
    const contactPointIsAwayFromShadowCenter =
      phase === "lunar-u2" || phase === "lunar-u3";
    return {
      ...physicalSample,
      phase,
      positionAngleRadians:
        phase === "maximum"
          ? null
          : eclipseContactPositionAngleRadians(
              sample.moon.cirsDirection,
              shadowCenterDirection,
              contactPointIsAwayFromShadowCenter
                ? "away-from-other-center"
                : "toward-other-center",
            ),
    };
  };
  const first = <T,>(items: readonly T[]): T | undefined => items[0];
  const last = <T,>(items: readonly T[]): T | undefined =>
    items[items.length - 1];
  const contacts: EventContact[] = [
    localContact(
      "lunar-p1",
      first(geometry.penumbralContacts) as LunarShadowSample,
    ),
    ...(first(geometry.umbralContacts)
      ? [
          localContact(
            "lunar-u1",
            first(geometry.umbralContacts) as LunarShadowSample,
          ),
        ]
      : []),
    ...(first(geometry.totalContacts)
      ? [
          localContact(
            "lunar-u2",
            first(geometry.totalContacts) as LunarShadowSample,
          ),
        ]
      : []),
    localContact("maximum", geometry.maximum),
    ...(last(geometry.totalContacts)
      ? [
          localContact(
            "lunar-u3",
            last(geometry.totalContacts) as LunarShadowSample,
          ),
        ]
      : []),
    ...(last(geometry.umbralContacts)
      ? [
          localContact(
            "lunar-u4",
            last(geometry.umbralContacts) as LunarShadowSample,
          ),
        ]
      : []),
    localContact(
      "lunar-p4",
      last(geometry.penumbralContacts) as LunarShadowSample,
    ),
  ];
  const firstPenumbral =
    first(geometry.penumbralContacts) as LunarShadowSample;
  const lastPenumbral =
    last(geometry.penumbralContacts) as LunarShadowSample;
  const visibility = classifyEventIntervalVisibility(
    firstPenumbral.instantMilliseconds,
    lastPenumbral.instantMilliseconds,
    (instant) => {
      const date = new Date(instant);
      const earthOrientation =
        options.earthOrientationAt?.(date) ??
        options.earthOrientation;
      const timeScales = resolveTimeScales(
        date,
        earthOrientation,
      );
      const moon = calculateApparentBody(
        ephemeris,
        "moon",
        timeScales.ttJulianDate,
        timeScales.ut1JulianDate,
        location,
        {
          heightMeters: options.heightMeters ?? 0,
          ...(earthOrientation?.polarMotion
            ? {
                polarMotion: earthOrientation.polarMotion,
              }
            : {}),
        },
      );
      return (
        moon.horizontal.altitude +
        moon.angularRadiusRadians
      );
    },
  );
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
    algorithmVersion: "event-lunar-v1-danjon",
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
    observer: {
      ...location,
      heightMeters: options.heightMeters ?? 0,
      horizontalAccuracyMeters:
        options.horizontalAccuracyMeters ?? null,
      locationSource: options.locationSource ?? "manual",
    },
    boundaryUncertain: false,
    boundaryUncertaintyReason: null,
    visibility,
    contacts: Object.freeze(contacts),
    maximum: contacts.find((item) => item.phase === "maximum") as EventContact,
    magnitude:
      geometry.classification === "penumbral"
        ? geometry.penumbralMagnitude
        : geometry.umbralMagnitude,
    obscuration: null,
    uncertainty: {
      tier: "uncertain",
      timingSeconds: options.timingUncertaintySeconds ?? 10,
      pathKilometers: null,
      observerLocationMeters:
        options.horizontalAccuracyMeters ?? null,
      earthOrientation:
        maximumEarthOrientationReportedUncertainty,
      dominantContributors: Object.freeze([
        "Danjon法（影半径1.01倍）",
        "地球大気による影の境界は連続的",
        ...(maximumEarthOrientation?.dut1Seconds === undefined
          ? ["UT1−UTCを0秒と仮定"]
          : []),
        ...timeScaleNotices.dominantContributors,
        ...(options.timeScaleContributors ?? []),
      ]),
    },
    provenance,
    warnings: Object.freeze([
      "月食の影半径はNASA Five Millennium Catalogと同じDanjon法です。",
      "半影の開始・終了は淡く、肉眼で明確に判別できない場合があります。",
      "地形、建物、雲、視程は含みません。",
      ...timeScaleNotices.warnings,
      ...(options.timeScaleWarnings ?? []),
    ]),
  };
}
