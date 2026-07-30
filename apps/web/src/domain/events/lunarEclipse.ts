import type { EarthOrientationOptions } from "../precision";
import { resolveTimeScales } from "../precision";
import type { ObservingLocation } from "../types";
import {
  angularSeparationRadians,
  calculateApparentBody,
  calculateGeocentricApparentBody,
} from "./apparentBody";
import {
  findSignChangeBrackets,
  minimizeBracketed,
  solveBracketedRoot,
} from "./numerics";
import type {
  ApparentGeocentricBodyState,
  EventBodyPosition,
  EventContact,
  EventEphemerisProvider,
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

export interface LocalLunarEclipseOptions {
  readonly earthOrientation?: EarthOrientationOptions;
  readonly eopId?: string;
  readonly heightMeters?: number;
  readonly horizontalAccuracyMeters?: number | null;
  readonly locationSource?: EventObserverContext["locationSource"];
  readonly halfWindowMilliseconds?: number;
  readonly scanStepMilliseconds?: number;
  readonly timingUncertaintySeconds?: number | null;
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

function uniqueSortedTimes(times: readonly number[]): readonly number[] {
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
  shadow: "penumbral" | "umbral" | "total",
  sampleAt: (instantMilliseconds: number) => LunarShadowSample,
  start: number,
  end: number,
  step: number,
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
  return uniqueSortedTimes(
    findSignChangeBrackets(value, start, end, step).map(
      (bracket) =>
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

export function solveLunarEclipseGeometry(
  candidateMilliseconds: number,
  sampleAt: (instantMilliseconds: number) => LunarShadowSample,
  options: Pick<
    LocalLunarEclipseOptions,
    | "halfWindowMilliseconds"
    | "scanStepMilliseconds"
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
  const start = candidateMilliseconds - halfWindow;
  const end = candidateMilliseconds + halfWindow;
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
  const hasUmbra = clearance(maximum, "umbral") < 0;
  const hasTotality = hasUmbra && clearance(maximum, "total") < 0;
  const penumbralTimes = contactTimes(
    "penumbral",
    sampleAt,
    start,
    end,
    scanStep,
    options.shouldCancel,
  );
  const umbralTimes = hasUmbra
    ? contactTimes(
        "umbral",
        sampleAt,
        start,
        end,
        scanStep,
        options.shouldCancel,
      )
    : [];
  const totalTimes = hasTotality
    ? contactTimes(
        "total",
        sampleAt,
        start,
        end,
        scanStep,
        options.shouldCancel,
      )
    : [];
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
  ): LunarShadowSample => {
    const timeScales = resolveTimeScales(
      new Date(instantMilliseconds),
      options.earthOrientation,
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
  };
  const geometry = solveLunarEclipseGeometry(
    event.canonicalEpochUtc.getTime(),
    globalSampleAt,
    options,
  );
  if (!geometry) {
    return null;
  }

  const localContact = (
    phase: EventContact["phase"],
    sample: LunarShadowSample,
  ): EventContact => {
    const timeScales = resolveTimeScales(
      new Date(sample.instantMilliseconds),
      options.earthOrientation,
    );
    const moon = calculateApparentBody(
      ephemeris,
      "moon",
      timeScales.ttJulianDate,
      timeScales.ut1JulianDate,
      location,
      {
        heightMeters: options.heightMeters ?? 0,
        ...(options.earthOrientation?.polarMotion
          ? { polarMotion: options.earthOrientation.polarMotion }
          : {}),
      },
    );
    return {
      phase,
      instantUtc: new Date(sample.instantMilliseconds),
      bodies: { moon: moonBodyPosition(moon) },
      aboveHorizon:
        moon.horizontal.altitude + moon.angularRadiusRadians > 0,
      positionAngleRadians: null,
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
  const visibleCount = contacts.filter(
    (item) => item.aboveHorizon,
  ).length;
  const classificationTitle =
    geometry.classification === "total"
      ? "皆既月食"
      : geometry.classification === "partial"
        ? "部分月食"
        : "半影月食";
  const provenance: EventProvenance = {
    algorithmVersion: "event-lunar-v1-danjon",
    ephemerisId: ephemeris.id,
    ephemerisSourceSha256: ephemeris.sourceSha256,
    eopId: options.eopId ?? "caller-or-assumed",
    deltaTModel: "existing UTC-TAI-TT and caller DUT1",
    lunarRadiusModel: "mean-spherical-limb",
    limbProfileId: null,
  };
  return {
    event: {
      ...event,
      globalClassification: geometry.classification,
      title: classificationTitle,
    },
    observer: {
      ...location,
      heightMeters: options.heightMeters ?? 0,
      horizontalAccuracyMeters:
        options.horizontalAccuracyMeters ?? null,
      locationSource: options.locationSource ?? "manual",
    },
    visibility:
      visibleCount === 0
        ? "below-horizon"
        : visibleCount === contacts.length
          ? "fully-visible"
          : "partly-visible",
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
      dominantContributors: Object.freeze([
        "Danjon法（影半径1.01倍）",
        "地球大気による影の境界は連続的",
        ...(options.earthOrientation?.dut1Seconds === undefined
          ? ["UT1−UTCを0秒と仮定"]
          : []),
      ]),
    },
    provenance,
    warnings: Object.freeze([
      "月食の影半径はNASA Five Millennium Catalogと同じDanjon法です。",
      "半影の開始・終了は淡く、肉眼で明確に判別できない場合があります。",
      "地形、建物、雲、視程は含みません。",
    ]),
  };
}
