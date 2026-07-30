import type { EarthOrientationOptions } from "../precision";
import type { ObservingLocation } from "../types";
import { resolveTimeScales } from "../precision";
import {
  angularSeparationRadians,
  calculateApparentBody,
} from "./apparentBody";
import {
  findSignChangeBrackets,
  minimizeBracketed,
  solveBracketedRoot,
} from "./numerics";
import type {
  ApparentBodyState,
  EventBodyPosition,
  EventContact,
  EventEphemerisProvider,
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
}

export interface LocalSolarEclipseOptions {
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

function checkCancelled(shouldCancel: (() => boolean) | undefined): void {
  if (shouldCancel?.()) {
    throw new DOMException("Event calculation was cancelled", "AbortError");
  }
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

function uniqueSortedTimes(times: readonly number[]): readonly number[] {
  const sorted = [...times].sort((left, right) => left - right);
  const result: number[] = [];
  for (const time of sorted) {
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
  clearance: (sample: SolarDiscSample) => number,
  sampleAt: (instantMilliseconds: number) => SolarDiscSample,
  startMilliseconds: number,
  endMilliseconds: number,
  scanStepMilliseconds: number,
  shouldCancel?: () => boolean,
): readonly number[] {
  const brackets = findSignChangeBrackets(
    (instant) => {
      checkCancelled(shouldCancel);
      return clearance(sampleAt(instant));
    },
    startMilliseconds,
    endMilliseconds,
    scanStepMilliseconds,
  );
  return uniqueSortedTimes(
    brackets.map((bracket) =>
      solveBracketedRoot(
        (instant) => {
          checkCancelled(shouldCancel);
          return clearance(sampleAt(instant));
        },
        bracket.lower,
        bracket.upper,
        ROOT_TIME_TOLERANCE_MILLISECONDS,
        ROOT_ANGLE_TOLERANCE_RADIANS,
      ).value,
    ),
  );
}

export function solveSolarEclipseGeometry(
  candidateMilliseconds: number,
  sampleAt: (instantMilliseconds: number) => SolarDiscSample,
  options: Pick<
    LocalSolarEclipseOptions,
    | "halfWindowMilliseconds"
    | "scanStepMilliseconds"
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
  const start = candidateMilliseconds - halfWindow;
  const end = candidateMilliseconds + halfWindow;
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
  if (externalClearance(maximum) >= 0) {
    return null;
  }
  const externalTimes = contactTimes(
    externalClearance,
    sampleAt,
    start,
    end,
    scanStep,
    options.shouldCancel,
  );
  if (externalTimes.length < 2) {
    throw new RangeError("Solar eclipse external contacts were not bracketed");
  }
  const hasInternalContacts = internalClearance(maximum) < 0;
  const internalTimes = hasInternalContacts
    ? contactTimes(
        internalClearance,
        sampleAt,
        start,
        end,
        scanStep,
        options.shouldCancel,
      )
    : [];
  if (hasInternalContacts && internalTimes.length < 2) {
    throw new RangeError("Solar eclipse internal contacts were not bracketed");
  }
  const centerSeparation = separation(maximum);
  const sunRadius = maximum.sun.angularRadiusRadians;
  const moonRadius = maximum.moon.angularRadiusRadians;
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
    magnitude: Math.max(
      0,
      (sunRadius + moonRadius - centerSeparation) / (2 * sunRadius),
    ),
    obscuration: overlapFraction(
      centerSeparation,
      sunRadius,
      moonRadius,
    ),
  };
}

function bodyPosition(body: ApparentBodyState): EventBodyPosition {
  return {
    altitudeAzimuth: body.horizontal,
    angularRadiusRadians: body.angularRadiusRadians,
    distanceKilometers: body.distanceKilometers,
  };
}

function contact(
  phase: EventContact["phase"],
  sample: SolarDiscSample,
): EventContact {
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
    positionAngleRadians: null,
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
  const sampleAt = (instantMilliseconds: number): SolarDiscSample => {
    const date = new Date(instantMilliseconds);
    const timeScales = resolveTimeScales(
      date,
      options.earthOrientation,
    );
    const apparentOptions = {
      heightMeters: options.heightMeters ?? 0,
      ...(options.earthOrientation?.polarMotion
        ? { polarMotion: options.earthOrientation.polarMotion }
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
  };
  const geometry = solveSolarEclipseGeometry(
    event.canonicalEpochUtc.getTime(),
    sampleAt,
    options,
  );
  if (!geometry) {
    return null;
  }

  const external = geometry.externalContacts;
  const internal = geometry.internalContacts;
  const contacts: EventContact[] = [
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
      external[external.length - 1] as SolarDiscSample,
    ),
  ];
  const visibleCount = contacts.filter(
    (item) => item.aboveHorizon,
  ).length;
  const observer: EventObserverContext = {
    ...location,
    heightMeters: options.heightMeters ?? 0,
    horizontalAccuracyMeters:
      options.horizontalAccuracyMeters ?? null,
    locationSource: options.locationSource ?? "manual",
  };
  const provenance: EventProvenance = {
    algorithmVersion: "event-solar-v1",
    ephemerisId: ephemeris.id,
    ephemerisSourceSha256: ephemeris.sourceSha256,
    eopId: options.eopId ?? "caller-or-assumed",
    deltaTModel: "existing UTC-TAI-TT and caller DUT1",
    lunarRadiusModel: "mean-spherical-limb",
    limbProfileId: null,
  };
  const timingUncertaintySeconds =
    options.timingUncertaintySeconds ?? null;
  return {
    event: {
      ...event,
      globalClassification: geometry.classification,
      title:
        geometry.classification === "total"
          ? "皆既日食"
          : geometry.classification === "annular"
            ? "金環日食"
            : "部分日食",
    },
    observer,
    visibility:
      visibleCount === 0
        ? "below-horizon"
        : visibleCount === contacts.length
          ? "fully-visible"
          : "partly-visible",
    contacts: Object.freeze(contacts),
    maximum: contacts.find((item) => item.phase === "maximum") as EventContact,
    magnitude: geometry.magnitude,
    obscuration: geometry.obscuration,
    uncertainty: {
      tier: "uncertain",
      timingSeconds: timingUncertaintySeconds,
      pathKilometers: 2,
      observerLocationMeters:
        options.horizontalAccuracyMeters ?? null,
      dominantContributors: Object.freeze([
        "平均月縁（地形未使用）",
        ...(options.earthOrientation?.dut1Seconds === undefined
          ? ["UT1−UTCを0秒と仮定"]
          : []),
        ...(options.horizontalAccuracyMeters === null ||
        options.horizontalAccuracyMeters === undefined
          ? ["観測地点の水平精度が不明"]
          : []),
      ]),
    },
    provenance,
    warnings: Object.freeze([
      "平均月縁による幾何学的予報です。",
      "地形、建物、雲、視程は含みません。",
      "太陽が地平線に近い段階は大気差の影響を受けます。",
    ]),
  };
}
