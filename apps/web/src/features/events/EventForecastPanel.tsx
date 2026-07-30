import {
  CalendarClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  EarthOrientationOptions,
  IersEarthOrientationEstimateV1,
  IersEarthOrientationSnapshotV1,
  PrecisionStarCatalogV2,
} from "../../domain";
import { timeZoneOffsetSecondsAtLocalDateTime } from "../../domain";
import { De442sEphemerisLoader } from "../../domain/events/de442sLoader";
import {
  EventCandidateLoader,
  type LoadedEclipseCandidate,
} from "../../domain/events/eventCandidates";
import {
  eventEphemerisSearchBounds,
  intersectEventSearchBounds,
} from "../../domain/events/ephemerisCoverage";
import {
  fetchEventAsset,
} from "../../domain/events/eventAssetTransport";
import {
  eventEarthOrientationReportedUncertainty,
  eventEarthRotationFallback,
} from "../../domain/events/eventEarthRotation";
import {
  eventForecastYearCoverageGap,
  type EventForecastCoverageGap,
} from "../../domain/events/eventForecastYearCoverage";
import {
  calculateLocalLunarEclipse,
  sampleLocalLunarEclipseAt,
} from "../../domain/events/lunarEclipse";
import {
  calculateLocalLunarOccultation,
  sampleLocalLunarOccultationAt,
} from "../../domain/events/lunarOccultation";
import {
  calculateLocalSolarEclipse,
  sampleLocalSolarEclipseAt,
} from "../../domain/events/solarEclipse";
import { tdbJulianDateToUtcDate } from "../../domain/events/eventTime";
import type {
  EventEarthOrientationProvenance,
  EventPhysicalSample,
  EventKind,
  EventSummary,
  LocalCircumstances,
} from "../../domain/events/types";
import type { ObserverLocation } from "../../app/types";
import {
  EventExplorer,
  type EventExplorerStatus,
} from "./EventExplorer";
import {
  eventSceneContactRange,
  eventSceneProjectionInstants,
  eventSceneProjectionSampleCount,
  type EventSceneSamplingSession,
  type EventSceneSamplingState,
} from "./EventSceneSamplingSession";
import { preferredEventId } from "./eventSelection";
import "./EventExplorer.css";

const MINIMUM_FORECAST_YEAR = 1900;
const MAXIMUM_FORECAST_YEAR = 2100;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;
const CANDIDATE_YEAR_PADDING_MILLISECONDS =
  2 * DAY_MILLISECONDS;
const EOP_SNAPSHOT_PADDING_MILLISECONDS =
  2 * DAY_MILLISECONDS;
const MINIMUM_FORECAST_DATE_MILLISECONDS =
  Date.UTC(MINIMUM_FORECAST_YEAR, 0, 1);
const MAXIMUM_FORECAST_DATE_MILLISECONDS =
  Date.UTC(MAXIMUM_FORECAST_YEAR + 1, 0, 1) - 1;
const FORECAST_RESULT_CACHE_CAPACITY = 3;
const EVENT_SCENE_SAMPLE_CACHE_CAPACITY = 64;

const candidateLoader = new EventCandidateLoader(fetchEventAsset);
const ephemerisLoader = new De442sEphemerisLoader({
  baseUrl: "/event-data/de442s/",
  fetch: fetchEventAsset,
});

type EventKindFilter = "all" | EventKind;

const EVENT_KIND_FILTER_OPTIONS: readonly {
  value: EventKindFilter;
  label: string;
}[] = [
  { value: "all", label: "すべて" },
  { value: "solar-eclipse", label: "日食" },
  { value: "lunar-eclipse", label: "月食" },
  { value: "lunar-occultation", label: "恒星掩蔽" },
];

function matchesEventKindFilter(
  event: EventSummary,
  filter: EventKindFilter,
): boolean {
  return filter === "all" || event.kind === filter;
}

function eventKindFilterLabel(filter: EventKindFilter): string {
  return (
    EVENT_KIND_FILTER_OPTIONS.find(
      ({ value }) => value === filter,
    )?.label ?? "天文現象"
  );
}

export type EventForecastPanelProps = {
  observationDate: Date;
  location: ObserverLocation;
  isActive?: boolean;
  precisionCatalog: PrecisionStarCatalogV2 | null;
  precisionCatalogStatus: "loading" | "ready" | "error";
  canRestoreObservationTime: boolean;
  loadEarthOrientationSnapshot: (
    startUtc: Date,
    endUtc: Date,
  ) => Promise<IersEarthOrientationSnapshotV1>;
  onRestoreObservationTime: () => void;
  onRetryPrecisionCatalog: () => void;
  onShowEventTime: (date: Date) => void;
};

type ForecastState = {
  readonly requestKey: string | null;
  readonly status: EventExplorerStatus;
  readonly events: readonly EventSummary[];
  readonly circumstancesById: ReadonlyMap<string, LocalCircumstances>;
  /**
   * Plain candidate records are safe to retain in the small forecast LRU.
   * Runtime samplers are deliberately kept in selected-session state only.
   */
  readonly candidateById: ReadonlyMap<
    string,
    LoadedEclipseCandidate
  >;
  readonly belowHorizonCount: number;
  readonly calculationFailureCount: number;
  readonly excludedAtLocationCount: number;
  readonly omittedOccultationCount: number;
  readonly errorMessage?: string;
};

type ForecastCacheEntry = {
  readonly forecast: ForecastState;
  readonly loadEarthOrientationSnapshot:
    EventForecastPanelProps["loadEarthOrientationSnapshot"];
  readonly precisionCatalog: PrecisionStarCatalogV2 | null;
};

type SceneSamplingRequestState = {
  readonly requestKey: string | null;
  readonly value: EventSceneSamplingState;
};

function resolveDisplayedSceneSampling(
  isActive: boolean,
  isAvailable: boolean,
  requestKeyMatches: boolean,
  requestValue: EventSceneSamplingState,
): EventSceneSamplingState {
  if (!isActive || !isAvailable) {
    return { session: null, status: "unavailable" };
  }
  if (
    !requestKeyMatches ||
    requestValue.status === "unavailable"
  ) {
    return { session: null, status: "loading" };
  }
  return requestValue;
}

const INITIAL_FORECAST_STATE: ForecastState = {
  belowHorizonCount: 0,
  calculationFailureCount: 0,
  candidateById: new Map(),
  circumstancesById: new Map(),
  events: [],
  excludedAtLocationCount: 0,
  omittedOccultationCount: 0,
  requestKey: null,
  status: "loading",
};

function yearInTimeZone(date: Date, timeZone: string): number {
  const yearPart = new Intl.DateTimeFormat(
    "en-CA-u-ca-gregory-nu-latn",
    {
      timeZone,
      year: "numeric",
    },
  )
    .formatToParts(date)
    .find(({ type }) => type === "year")?.value;
  const year = Number(yearPart);
  if (!Number.isInteger(year)) {
    throw new RangeError(
      `Could not resolve forecast year in ${timeZone}`,
    );
  }
  return year;
}

function supportedYear(date: Date, timeZone: string): number {
  const year = yearInTimeZone(date, timeZone);
  return Math.min(
    MAXIMUM_FORECAST_YEAR,
    Math.max(MINIMUM_FORECAST_YEAR, year),
  );
}

function utcOffsetSecondsAtLocalYearStart(
  year: number,
  timeZone: string,
): number {
  return timeZoneOffsetSecondsAtLocalDateTime(
    `${String(year).padStart(4, "0")}-01-01T00:00:00.000`,
    timeZone,
  );
}

function localYearCoverageGap(
  year: number,
  timeZone: string,
): EventForecastCoverageGap | null {
  return eventForecastYearCoverageGap(
    year,
    utcOffsetSecondsAtLocalYearStart(year, timeZone),
    utcOffsetSecondsAtLocalYearStart(year + 1, timeZone),
  );
}

function approximateDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) {
    return `${minutes}分`;
  }
  return remainingMinutes === 0
    ? `${hours}時間`
    : `${hours}時間${remainingMinutes}分`;
}

function coverageGapMessage(
  gap: EventForecastCoverageGap,
): string {
  const edge =
    gap.edge === "local-year-start" ? "はじめ" : "おわり";
  return `イベント用暦データの収録範囲により、この現地年の${edge}約${approximateDuration(
    gap.approximateMinutes,
  )}は予報に含まれません。`;
}

function candidateYearRangeUtc(
  year: number,
): readonly [Date, Date] {
  return [
    new Date(
      Math.max(
        MINIMUM_FORECAST_DATE_MILLISECONDS,
        Date.UTC(year, 0, 1) -
          CANDIDATE_YEAR_PADDING_MILLISECONDS,
      ),
    ),
    new Date(
      Math.min(
        MAXIMUM_FORECAST_DATE_MILLISECONDS,
        Date.UTC(year + 1, 0, 1) +
          CANDIDATE_YEAR_PADDING_MILLISECONDS -
          1,
      ),
    ),
  ];
}

function earthOrientationOptions(
  estimate: IersEarthOrientationEstimateV1 | null,
): EarthOrientationOptions {
  if (!estimate) {
    return {
      polarMotion: {
        source: "assumed-zero",
        xpRadians: 0,
        ypRadians: 0,
      },
    };
  }
  return {
    dut1Seconds: estimate.dut1.seconds,
    dut1Source:
      estimate.dut1.source === "observed"
        ? "iers-observed"
        : "iers-predicted",
    dut1UncertaintySeconds: estimate.dut1.reportedErrorSeconds,
    polarMotion: {
      source:
        estimate.polarMotion.source === "observed"
          ? "iers-observed"
          : "iers-predicted",
      xpRadians: estimate.polarMotion.xpRadians,
      xpReportedErrorRadians:
        estimate.polarMotion.xpReportedErrorRadians,
      ypRadians: estimate.polarMotion.ypRadians,
      ypReportedErrorRadians:
        estimate.polarMotion.ypReportedErrorRadians,
    },
  };
}

function earthOrientationId(
  estimate: IersEarthOrientationEstimateV1 | null,
): string {
  if (!estimate) {
    return "IERS EOP収録外";
  }
  const dut1Quality =
    estimate.dut1.quality ?? estimate.dut1.source;
  const polarMotionQuality =
    estimate.polarMotion.quality ??
    estimate.polarMotion.source;
  if (
    dut1Quality === "observed" &&
    polarMotionQuality === "observed"
  ) {
    return "IERS EOP観測値";
  }
  if (
    dut1Quality === "predicted" &&
    polarMotionQuality === "predicted"
  ) {
    return "IERS EOP予測値";
  }
  return "IERS EOP観測・予測混在";
}

function earthOrientationProvenance(
  snapshot: IersEarthOrientationSnapshotV1,
  date: Date,
): EventEarthOrientationProvenance {
  const estimate = snapshot.lookup(date);
  if (!estimate) {
    return {
      eopSourceSha256: null,
      eopRetrievedAt: null,
      dut1Quality: "outside-coverage",
      polarMotionQuality: "outside-coverage",
    };
  }
  return {
    eopSourceSha256: snapshot.sourceSha256,
    eopRetrievedAt: snapshot.retrievedAt,
    dut1Quality:
      estimate.dut1.quality ?? estimate.dut1.source,
    polarMotionQuality:
      estimate.polarMotion.quality ??
      estimate.polarMotion.source,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === "AbortError"
  );
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException(
      "Event forecast calculation was cancelled",
      "AbortError",
    );
  }
}

function yieldToEventLoop(signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, 0);
    function handleAbort() {
      globalThis.clearTimeout(timeout);
      reject(
        new DOMException(
          "Event forecast calculation was cancelled",
          "AbortError",
        ),
      );
    }
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function eventCalculationOptions(
  candidate: LoadedEclipseCandidate,
  location: ObserverLocation,
  earthOrientationSnapshot: IersEarthOrientationSnapshotV1,
  signal: AbortSignal,
) {
  const estimate = earthOrientationSnapshot.lookup(
    candidate.summary.canonicalEpochUtc,
  );
  const earthRotationFallback = estimate
    ? null
    : eventEarthRotationFallback(
        candidate.summary.canonicalEpochUtc,
      );
  const earthOrientationReportedUncertainty = estimate
    ? eventEarthOrientationReportedUncertainty(estimate)
    : null;
  const candidateEarthOrientationProvenance =
    earthOrientationProvenance(
      earthOrientationSnapshot,
      candidate.summary.canonicalEpochUtc,
    );
  return {
    deltaTModel:
      earthRotationFallback?.deltaTModel ??
      "IERS-EOP-and-bundled-leap-second-history",
    earthOrientation:
      earthRotationFallback?.earthOrientation ??
      earthOrientationOptions(estimate),
    earthOrientationAt: (date: Date) => {
      const sampleEstimate =
        earthOrientationSnapshot.lookup(date);
      return sampleEstimate
        ? earthOrientationOptions(sampleEstimate)
        : eventEarthRotationFallback(date).earthOrientation;
    },
    ...candidateEarthOrientationProvenance,
    earthOrientationProvenanceAt: (date: Date) =>
      earthOrientationProvenance(
        earthOrientationSnapshot,
        date,
      ),
    eopId:
      earthRotationFallback?.eopId ??
      earthOrientationId(estimate),
    eopIdAt: (date: Date) => {
      const sampleEstimate =
        earthOrientationSnapshot.lookup(date);
      return sampleEstimate
        ? earthOrientationId(sampleEstimate)
        : eventEarthRotationFallback(date).eopId;
    },
    earthRotationPathUncertaintyKilometers:
      earthRotationFallback?.pathUncertaintyKilometers ??
      (earthOrientationReportedUncertainty
        ? earthOrientationReportedUncertainty.combinedPathMeters /
          1_000
        : undefined),
    earthRotationPathUncertaintyKilometersAt: (date: Date) => {
      const sampleEstimate =
        earthOrientationSnapshot.lookup(date);
      return sampleEstimate
        ? eventEarthOrientationReportedUncertainty(
            sampleEstimate,
          ).combinedPathMeters / 1_000
        : eventEarthRotationFallback(date)
            .pathUncertaintyKilometers;
    },
    earthOrientationReportedUncertainty,
    earthOrientationReportedUncertaintyAt: (date: Date) => {
      const sampleEstimate =
        earthOrientationSnapshot.lookup(date);
      return sampleEstimate
        ? eventEarthOrientationReportedUncertainty(
            sampleEstimate,
          )
        : null;
    },
    heightMeters: location.heightMeters,
    horizontalAccuracyMeters: location.horizontalAccuracyMeters,
    locationSource: location.locationSource,
    shouldCancel: () => signal.aborted,
    timeScaleContributors:
      earthRotationFallback?.dominantContributors ??
      (earthOrientationReportedUncertainty
        ? [
            candidate.seed.kind === "lunar-eclipse"
              ? "IERS公表誤差のDUT1・xp・ypを統計的な信頼区間とみなさず、独立成分として表示（局地経路境界への加算なし）"
              : "IERS公表誤差のDUT1・xp・ypを統計的な信頼区間とみなさず、経路成分へ線形加算",
          ]
        : undefined),
    timeScaleWarnings: earthRotationFallback?.warnings,
    timingUncertaintySeconds:
      earthRotationFallback === null
        ? undefined
        : earthRotationFallback.deltaTUncertaintySeconds +
          (candidate.seed.kind === "lunar-eclipse" ? 10 : 0),
  } as const;
}

function calculateCandidate(
  candidate: LoadedEclipseCandidate,
  ephemeris: Awaited<
    ReturnType<De442sEphemerisLoader["loadRange"]>
  >,
  location: ObserverLocation,
  precisionCatalog: PrecisionStarCatalogV2 | null,
  earthOrientationSnapshot: IersEarthOrientationSnapshotV1,
  signal: AbortSignal,
): LocalCircumstances | null {
  const options = eventCalculationOptions(
    candidate,
    location,
    earthOrientationSnapshot,
    signal,
  );
  switch (candidate.seed.kind) {
    case "solar-eclipse": {
      return calculateLocalSolarEclipse(
        ephemeris,
        candidate.summary,
        location,
        options,
      );
    }
    case "lunar-eclipse": {
      return calculateLocalLunarEclipse(
        ephemeris,
        candidate.summary,
        location,
        options,
      );
    }
    case "lunar-occultation": {
      if (!precisionCatalog) {
        return null;
      }
      const target = precisionCatalog.starByHR.get(
        candidate.seed.target.hr,
      );
      if (!target) {
        throw new Error(
          `精密星表にHR ${candidate.seed.target.hr}がありません。`,
        );
      }
      return calculateLocalLunarOccultation(
        ephemeris,
        candidate.summary,
        target,
        location,
        options,
      );
    }
  }
}

async function calculateYearForecast(
  year: number,
  location: ObserverLocation,
  precisionCatalog: PrecisionStarCatalogV2 | null,
  loadEarthOrientationSnapshot: EventForecastPanelProps["loadEarthOrientationSnapshot"],
  signal: AbortSignal,
): Promise<ForecastState> {
  const [startUtc, endUtc] = candidateYearRangeUtc(year);
  const candidates = await candidateLoader.loadRange(
    startUtc,
    endUtc,
    signal,
  );
  throwIfAborted(signal);
  if (candidates.length === 0) {
    return {
      belowHorizonCount: 0,
      calculationFailureCount: 0,
      candidateById: new Map(),
      circumstancesById: new Map(),
      events: [],
      excludedAtLocationCount: 0,
      omittedOccultationCount: 0,
      requestKey: null,
      status: "empty",
    };
  }

  const calculableCandidates = precisionCatalog
    ? candidates
    : candidates.filter(
        ({ seed }) => seed.kind !== "lunar-occultation",
      );
  const omittedOccultationCount =
    candidates.length - calculableCandidates.length;
  if (calculableCandidates.length === 0) {
    return {
      belowHorizonCount: 0,
      calculationFailureCount: 0,
      candidateById: new Map(),
      circumstancesById: new Map(),
      events: [],
      excludedAtLocationCount: 0,
      omittedOccultationCount,
      requestKey: null,
      status: "empty",
    };
  }

  let searchStartJulianDateTdb = Number.POSITIVE_INFINITY;
  let searchEndJulianDateTdb = Number.NEGATIVE_INFINITY;
  for (const candidate of calculableCandidates) {
    searchStartJulianDateTdb = Math.min(
      searchStartJulianDateTdb,
      candidate.seed.searchStartJulianDateTdb,
    );
    searchEndJulianDateTdb = Math.max(
      searchEndJulianDateTdb,
      candidate.seed.searchEndJulianDateTdb,
    );
  }

  const ephemerisPromise = ephemerisLoader.loadRange(
    searchStartJulianDateTdb,
    searchEndJulianDateTdb,
    { clipToCoverage: true, signal },
  );
  const earthOrientationPromise = loadEarthOrientationSnapshot(
    new Date(
      startUtc.getTime() -
        EOP_SNAPSHOT_PADDING_MILLISECONDS,
    ),
    new Date(
      endUtc.getTime() +
        EOP_SNAPSHOT_PADDING_MILLISECONDS,
    ),
  );
  const [ephemeris, earthOrientationSnapshot] =
    await Promise.all([
      ephemerisPromise,
      earthOrientationPromise,
    ]);
  throwIfAborted(signal);

  const localCircumstances: LocalCircumstances[] = [];
  const candidateById = new Map<
    string,
    LoadedEclipseCandidate
  >();
  let calculationFailureCount = 0;
  let excludedAtLocationCount = 0;
  for (
    let index = 0;
    index < calculableCandidates.length;
    index += 1
  ) {
    throwIfAborted(signal);
    const candidate = calculableCandidates[index];
    if (!candidate) {
      continue;
    }
    let circumstances: LocalCircumstances | null;
    try {
      circumstances = calculateCandidate(
        candidate,
        ephemeris,
        location,
        precisionCatalog,
        earthOrientationSnapshot,
        signal,
      );
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        throw error;
      }
      calculationFailureCount += 1;
      await yieldToEventLoop(signal);
      continue;
    }
    if (!circumstances || circumstances.visibility === "not-local") {
      excludedAtLocationCount += 1;
    } else if (
      yearInTimeZone(
        circumstances.maximum.instantUtc,
        location.timeZone,
      ) === year
    ) {
      localCircumstances.push(circumstances);
      candidateById.set(circumstances.event.id, candidate);
    }
    await yieldToEventLoop(signal);
  }

  localCircumstances.sort(
    (left, right) =>
      left.maximum.instantUtc.getTime() -
      right.maximum.instantUtc.getTime(),
  );
  const circumstancesById = new Map(
    localCircumstances.map((circumstances) => [
      circumstances.event.id,
      circumstances,
    ]),
  );
  return {
    belowHorizonCount: localCircumstances.filter(
      ({ visibility }) => visibility === "below-horizon",
    ).length,
    calculationFailureCount,
    candidateById,
    circumstancesById,
    events: Object.freeze(
      localCircumstances.map(({ event, maximum }) =>
        Object.freeze({
          ...event,
          // The list is observer-facing: show the recomputed local maximum,
          // not the coarse global candidate seed.
          canonicalEpochUtc: maximum.instantUtc,
        }),
      ),
    ),
    excludedAtLocationCount,
    omittedOccultationCount,
    requestKey: null,
    status:
      localCircumstances.length === 0 &&
      calculationFailureCount > 0
        ? "error"
        : localCircumstances.length === 0
          ? "empty"
          : "ready",
    ...(localCircumstances.length === 0 &&
    calculationFailureCount > 0
      ? {
          errorMessage:
            "候補を局地計算できませんでした。再試行してください。",
        }
      : {}),
  };
}

function validateSceneSample(
  candidate: LoadedEclipseCandidate,
  requestedMilliseconds: number,
  sample: EventPhysicalSample,
): EventPhysicalSample {
  if (
    sample.instantUtc.getTime() !== requestedMilliseconds ||
    !sample.bodies.moon
  ) {
    throw new RangeError(
      "Event-scene sampler returned an inconsistent physical sample",
    );
  }
  switch (candidate.seed.kind) {
    case "solar-eclipse":
      if (!sample.bodies.sun) {
        throw new RangeError(
          "Solar scene sample does not contain the Sun",
        );
      }
      break;
    case "lunar-eclipse":
      if (!sample.lunarShadow) {
        throw new RangeError(
          "Lunar scene sample does not contain the Earth shadow",
        );
      }
      break;
    case "lunar-occultation":
      if (!sample.bodies.target) {
        throw new RangeError(
          "Occultation scene sample does not contain the target",
        );
      }
      break;
  }
  return sample;
}

async function prepareEventSceneSamplingSession(
  candidate: LoadedEclipseCandidate,
  circumstances: LocalCircumstances,
  location: ObserverLocation,
  precisionCatalog: PrecisionStarCatalogV2 | null,
  loadEarthOrientationSnapshot: EventForecastPanelProps["loadEarthOrientationSnapshot"],
  signal: AbortSignal,
): Promise<EventSceneSamplingSession> {
  if (
    candidate.seed.id !== circumstances.event.id ||
    candidate.seed.kind !== circumstances.event.kind
  ) {
    throw new TypeError(
      "Event-scene candidate and circumstances must match",
    );
  }
  const contactRange = eventSceneContactRange(circumstances);
  if (!contactRange) {
    throw new RangeError(
      "Event-scene simulation requires two distinct solved contacts",
    );
  }
  const candidateBounds = Object.freeze({
    endUtcMilliseconds: tdbJulianDateToUtcDate(
      candidate.seed.searchEndJulianDateTdb,
    ).getTime(),
    startUtcMilliseconds: tdbJulianDateToUtcDate(
      candidate.seed.searchStartJulianDateTdb,
    ).getTime(),
  });
  const ephemerisPromise = ephemerisLoader.loadRange(
    candidate.seed.searchStartJulianDateTdb,
    candidate.seed.searchEndJulianDateTdb,
    { clipToCoverage: true, signal },
  );
  const earthOrientationPromise = loadEarthOrientationSnapshot(
    new Date(
      contactRange.startMilliseconds -
        EOP_SNAPSHOT_PADDING_MILLISECONDS,
    ),
    new Date(
      contactRange.endMilliseconds +
        EOP_SNAPSHOT_PADDING_MILLISECONDS,
    ),
  );
  const [ephemeris, earthOrientationSnapshot] =
    await Promise.all([
      ephemerisPromise,
      earthOrientationPromise,
    ]);
  throwIfAborted(signal);

  const loadedBounds = intersectEventSearchBounds(
    eventEphemerisSearchBounds(ephemeris),
    candidateBounds,
  );
  const timelineBounds = intersectEventSearchBounds(
    loadedBounds,
    {
      endUtcMilliseconds: contactRange.endMilliseconds,
      startUtcMilliseconds: contactRange.startMilliseconds,
    },
  );
  const rangeUtc = Object.freeze({
    endMilliseconds: timelineBounds.endUtcMilliseconds,
    startMilliseconds: timelineBounds.startUtcMilliseconds,
  });
  const options = eventCalculationOptions(
    candidate,
    location,
    earthOrientationSnapshot,
    signal,
  );
  let calculateSample: (instantUtc: Date) => EventPhysicalSample;
  switch (candidate.seed.kind) {
    case "solar-eclipse":
      calculateSample = (instantUtc) =>
        sampleLocalSolarEclipseAt(
          ephemeris,
          instantUtc,
          location,
          options,
        );
      break;
    case "lunar-eclipse":
      calculateSample = (instantUtc) =>
        sampleLocalLunarEclipseAt(
          ephemeris,
          instantUtc,
          location,
          options,
        );
      break;
    case "lunar-occultation": {
      if (
        !precisionCatalog ||
        circumstances.event.targetStarHR !==
          candidate.seed.target.hr
      ) {
        throw new TypeError(
          "Occultation scene requires the matching precision target",
        );
      }
      const target = precisionCatalog.starByHR.get(
        candidate.seed.target.hr,
      );
      if (!target) {
        throw new Error(
          `精密星表にHR ${candidate.seed.target.hr}がありません。`,
        );
      }
      calculateSample = (instantUtc) =>
        sampleLocalLunarOccultationAt(
          ephemeris,
          instantUtc,
          target,
          location,
          options,
        );
      break;
    }
  }
  const sampleCache = new Map<number, EventPhysicalSample>();
  const sampleAt = (instantUtc: Date): EventPhysicalSample => {
    throwIfAborted(signal);
    const requestedMilliseconds = instantUtc.getTime();
    if (
      !Number.isFinite(requestedMilliseconds) ||
      requestedMilliseconds < rangeUtc.startMilliseconds ||
      requestedMilliseconds > rangeUtc.endMilliseconds
    ) {
      throw new RangeError(
        "Event-scene instant is outside the prepared timeline",
      );
    }
    const cached = sampleCache.get(requestedMilliseconds);
    if (cached) {
      sampleCache.delete(requestedMilliseconds);
      sampleCache.set(requestedMilliseconds, cached);
      return cached;
    }
    const sample = validateSceneSample(
      candidate,
      requestedMilliseconds,
      calculateSample(new Date(requestedMilliseconds)),
    );
    sampleCache.set(requestedMilliseconds, sample);
    while (
      sampleCache.size > EVENT_SCENE_SAMPLE_CACHE_CAPACITY
    ) {
      const oldest = sampleCache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      sampleCache.delete(oldest);
    }
    return sample;
  };
  const projectionInstants = eventSceneProjectionInstants(
    rangeUtc,
    eventSceneProjectionSampleCount(
      candidate.seed.kind,
      rangeUtc,
    ),
    [
      ...circumstances.contacts.map(
        ({ instantUtc }) => instantUtc,
      ),
      circumstances.maximum.instantUtc,
    ],
  );
  const projectionSamples: EventPhysicalSample[] = [];
  for (
    let index = 0;
    index < projectionInstants.length;
    index += 1
  ) {
    const instant = projectionInstants[index];
    if (instant) {
      projectionSamples.push(sampleAt(instant));
    }
    if (index > 0 && index % 8 === 0) {
      await yieldToEventLoop(signal);
    }
  }
  throwIfAborted(signal);
  return Object.freeze({
    eventId: circumstances.event.id,
    kind: circumstances.event.kind,
    projectionSamples: Object.freeze(projectionSamples),
    rangeUtc,
    resource: Object.freeze({
      ephemerisId: ephemeris.id,
      ephemerisSourceSha256: ephemeris.sourceSha256,
      eopRetrievedAt: earthOrientationSnapshot.retrievedAt,
      eopSourceSha256: earthOrientationSnapshot.sourceSha256,
    }),
    sampleAt,
    targetStarHR: circumstances.event.targetStarHR,
  });
}

function ForecastYearControls({
  observationYear,
  onYearChange,
  year,
}: {
  observationYear: number;
  onYearChange: (year: number) => void;
  year: number;
}) {
  return (
    <header className="event-year-controls">
      <div>
        <CalendarClockIcon
          aria-hidden="true"
          size={18}
          strokeWidth={1.8}
        />
        <h2>{year}年の予報（現地日付）</h2>
      </div>
      <div aria-label="予報年" className="event-year-controls__actions">
        <button
          aria-label="前年"
          disabled={year <= MINIMUM_FORECAST_YEAR}
          onClick={() => onYearChange(year - 1)}
          type="button"
        >
          <ChevronLeftIcon
            aria-hidden="true"
            size={16}
            strokeWidth={1.9}
          />
          前年
        </button>
        <button
          disabled={year === observationYear}
          onClick={() => onYearChange(observationYear)}
          type="button"
        >
          観測年へ戻る
        </button>
        <button
          aria-label="翌年"
          disabled={year >= MAXIMUM_FORECAST_YEAR}
          onClick={() => onYearChange(year + 1)}
          type="button"
        >
          翌年
          <ChevronRightIcon
            aria-hidden="true"
            size={16}
            strokeWidth={1.9}
          />
        </button>
      </div>
    </header>
  );
}

export function EventForecastPanel({
  canRestoreObservationTime,
  isActive = true,
  loadEarthOrientationSnapshot,
  location,
  observationDate,
  onRestoreObservationTime,
  onRetryPrecisionCatalog,
  onShowEventTime,
  precisionCatalog,
  precisionCatalogStatus,
}: EventForecastPanelProps) {
  const observationYear = supportedYear(
    observationDate,
    location.timeZone,
  );
  const observationInstantMilliseconds =
    observationDate.getTime();
  const [year, setYear] = useState(() => observationYear);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [sceneRetryAttempt, setSceneRetryAttempt] =
    useState(0);
  const [showBelowHorizon, setShowBelowHorizon] = useState(false);
  const [eventKindFilter, setEventKindFilter] =
    useState<EventKindFilter>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    null,
  );
  const eventKindFilterId = useId();
  const [forecast, setForecast] =
    useState<ForecastState>(INITIAL_FORECAST_STATE);
  const [sceneSamplingRequest, setSceneSamplingRequest] =
    useState<SceneSamplingRequestState>({
      requestKey: null,
      value: { session: null, status: "unavailable" },
    });
  const forecastCacheRef = useRef(
    new Map<string, ForecastCacheEntry>(),
  );
  const forecastCacheRecencyRef = useRef<string[]>([]);
  const activePrecisionCatalog =
    precisionCatalogStatus === "ready" ? precisionCatalog : null;
  const forecastCacheKey = JSON.stringify([
    year,
    location.id,
    location.name,
    location.latitude,
    location.longitude,
    location.heightMeters,
    location.horizontalAccuracyMeters ?? "unknown",
    location.locationSource,
    location.timeZone,
    precisionCatalogStatus,
  ]);
  const forecastRequestKey =
    `${forecastCacheKey}|retry:${retryAttempt}`;

  useEffect(() => {
    const cached = forecastCacheRef.current.get(
      forecastCacheKey,
    );
    if (
      cached &&
      cached.loadEarthOrientationSnapshot ===
        loadEarthOrientationSnapshot &&
      cached.precisionCatalog === activePrecisionCatalog
    ) {
      forecastCacheRecencyRef.current =
        forecastCacheRecencyRef.current.filter(
          (key) => key !== forecastCacheKey,
        );
      forecastCacheRecencyRef.current.push(forecastCacheKey);
      setForecast({
        ...cached.forecast,
        requestKey: forecastRequestKey,
      });
      setSelectedEventId((current) =>
        current &&
        cached.forecast.circumstancesById.has(current)
          ? current
          : preferredEventId(
              cached.forecast.events,
              cached.forecast.circumstancesById,
              year,
              observationYear,
              observationInstantMilliseconds,
            ),
      );
      return;
    }
    if (cached) {
      forecastCacheRef.current.delete(forecastCacheKey);
      forecastCacheRecencyRef.current =
        forecastCacheRecencyRef.current.filter(
          (key) => key !== forecastCacheKey,
        );
    }

    const controller = new AbortController();
    void calculateYearForecast(
      year,
      location,
      activePrecisionCatalog,
      loadEarthOrientationSnapshot,
      controller.signal,
    )
      .then((nextForecast) => {
        if (controller.signal.aborted) {
          return;
        }
        if (nextForecast.status !== "error") {
          const cachedForecast = {
            ...nextForecast,
            requestKey: null,
          };
          forecastCacheRef.current.set(forecastCacheKey, {
            forecast: cachedForecast,
            loadEarthOrientationSnapshot,
            precisionCatalog: activePrecisionCatalog,
          });
          forecastCacheRecencyRef.current =
            forecastCacheRecencyRef.current.filter(
              (key) => key !== forecastCacheKey,
            );
          forecastCacheRecencyRef.current.push(forecastCacheKey);
          while (
            forecastCacheRecencyRef.current.length >
            FORECAST_RESULT_CACHE_CAPACITY
          ) {
            const evicted =
              forecastCacheRecencyRef.current.shift();
            if (evicted !== undefined) {
              forecastCacheRef.current.delete(evicted);
            }
          }
        }
        setForecast({
          ...nextForecast,
          requestKey: forecastRequestKey,
        });
        setSelectedEventId((current) =>
          current &&
          nextForecast.circumstancesById.has(current)
            ? current
            : preferredEventId(
                nextForecast.events,
                nextForecast.circumstancesById,
                year,
                observationYear,
                observationInstantMilliseconds,
              ),
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (import.meta.env.DEV) {
          console.error(
            "Event forecast data validation or calculation failed",
            error,
          );
        }
        setForecast({
          belowHorizonCount: 0,
          calculationFailureCount: 0,
          candidateById: new Map(),
          circumstancesById: new Map(),
          errorMessage:
            "予報データを検証または計算できませんでした。再試行してください。",
          events: [],
          excludedAtLocationCount: 0,
          omittedOccultationCount: 0,
          requestKey: forecastRequestKey,
          status: "error",
        });
      });

    return () => controller.abort();
  }, [
    activePrecisionCatalog,
    forecastCacheKey,
    forecastRequestKey,
    loadEarthOrientationSnapshot,
    location,
    observationInstantMilliseconds,
    observationYear,
    year,
  ]);

  const displayedForecast: ForecastState =
    forecast.requestKey !== forecastRequestKey
      ? INITIAL_FORECAST_STATE
      : forecast;
  const coverageGap = localYearCoverageGap(
    year,
    location.timeZone,
  );

  const kindFilteredEvents = displayedForecast.events.filter((event) =>
    matchesEventKindFilter(event, eventKindFilter),
  );
  const filteredBelowHorizonCount = kindFilteredEvents.filter(
    ({ id }) =>
      displayedForecast.circumstancesById.get(id)?.visibility ===
      "below-horizon",
  ).length;
  const displayedEvents = showBelowHorizon
    ? kindFilteredEvents
    : kindFilteredEvents.filter(
        ({ id }) =>
          displayedForecast.circumstancesById.get(id)?.visibility !==
          "below-horizon",
      );
  const displayedEventIds = new Set(
    displayedEvents.map(({ id }) => id),
  );
  const displayedSelectedEventId =
    selectedEventId && displayedEventIds.has(selectedEventId)
      ? selectedEventId
      : preferredEventId(
          displayedEvents,
          displayedForecast.circumstancesById,
          year,
          observationYear,
          observationInstantMilliseconds,
        );
  const selectedCircumstances = displayedSelectedEventId
    ? (displayedForecast.circumstancesById.get(
        displayedSelectedEventId,
      ) ?? null)
    : null;
  const selectedCandidate = displayedSelectedEventId
    ? (displayedForecast.candidateById.get(
        displayedSelectedEventId,
      ) ?? null)
    : null;
  const sceneSamplingRequestKey =
    `${forecastRequestKey}|scene:${displayedSelectedEventId ?? "none"}` +
    `|retry:${sceneRetryAttempt}`;
  const sceneSamplingIsAvailable =
    selectedCircumstances !== null &&
    selectedCandidate !== null &&
    eventSceneContactRange(selectedCircumstances) !== null;

  useEffect(() => {
    if (
      !isActive ||
      !sceneSamplingIsAvailable ||
      !selectedCandidate ||
      !selectedCircumstances
    ) {
      // Release the previously selected provider/EOP closure immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSceneSamplingRequest((current) =>
        current.requestKey === sceneSamplingRequestKey &&
        current.value.status === "unavailable"
          ? current
          : {
              requestKey: sceneSamplingRequestKey,
              value: {
                session: null,
                status: "unavailable",
              },
            },
      );
      return;
    }
    const controller = new AbortController();
    // A session retains decoded ephemeris data, so do not retain the old
    // selected event while the next one prepares.
    setSceneSamplingRequest((current) =>
      current.requestKey === sceneSamplingRequestKey &&
      current.value.status === "loading"
        ? current
        : {
            requestKey: sceneSamplingRequestKey,
            value: { session: null, status: "loading" },
          },
    );
    void prepareEventSceneSamplingSession(
      selectedCandidate,
      selectedCircumstances,
      location,
      activePrecisionCatalog,
      loadEarthOrientationSnapshot,
      controller.signal,
    )
      .then((session) => {
        if (!controller.signal.aborted) {
          setSceneSamplingRequest({
            requestKey: sceneSamplingRequestKey,
            value: { session, status: "ready" },
          });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (import.meta.env.DEV) {
          console.error(
            "Event scene sampling session failed",
            error,
          );
        }
        setSceneSamplingRequest({
          requestKey: sceneSamplingRequestKey,
          value: {
            errorMessage:
              "連続シミュレーションを準備できませんでした。計算済み時刻の静止図は利用できます。",
            session: null,
            status: "error",
          },
        });
      });
    return () => controller.abort();
  }, [
    activePrecisionCatalog,
    isActive,
    loadEarthOrientationSnapshot,
    location,
    sceneSamplingIsAvailable,
    sceneSamplingRequestKey,
    selectedCandidate,
    selectedCircumstances,
  ]);

  const sceneSampling = resolveDisplayedSceneSampling(
    isActive,
    sceneSamplingIsAvailable,
    sceneSamplingRequest.requestKey === sceneSamplingRequestKey,
    sceneSamplingRequest.value,
  );
  const localClassificationsByEventId = new Map(
    Array.from(
      displayedForecast.circumstancesById,
      ([eventId, circumstances]) =>
        [eventId, circumstances.localClassification] as const,
    ),
  );
  const boundaryUncertaintyReasonsByEventId = new Map(
    Array.from(
      displayedForecast.circumstancesById,
      ([eventId, circumstances]) =>
        [
          eventId,
          circumstances.boundaryUncertaintyReason,
        ] as const,
    ).filter(
      (
        entry,
      ): entry is readonly [
        string,
        NonNullable<
          LocalCircumstances["boundaryUncertaintyReason"]
        >,
      ] => entry[1] !== null,
    ),
  );
  const explorerStatus =
    displayedForecast.status === "ready" &&
    displayedEvents.length === 0
      ? "empty"
      : displayedForecast.status;

  const retry = useCallback(() => {
    if (precisionCatalogStatus === "error") {
      onRetryPrecisionCatalog();
      return;
    }
    setRetryAttempt((current) => current + 1);
  }, [onRetryPrecisionCatalog, precisionCatalogStatus]);

  const retrySceneSampling = useCallback(() => {
    setSceneRetryAttempt((current) => current + 1);
  }, []);

  const showContact = useCallback(
    (sample: { readonly instantUtc: Date }) => {
      onShowEventTime(sample.instantUtc);
    },
    [onShowEventTime],
  );

  const changeBelowHorizonVisibility = useCallback(
    (show: boolean) => {
      setShowBelowHorizon(show);
      const nextKindEvents = displayedForecast.events.filter(
        (event) =>
          matchesEventKindFilter(event, eventKindFilter),
      );
      const nextEvents = show
        ? nextKindEvents
        : nextKindEvents.filter(
            ({ id }) =>
              displayedForecast.circumstancesById.get(id)
                ?.visibility !== "below-horizon",
          );
      setSelectedEventId(
        displayedSelectedEventId &&
          nextEvents.some(
            ({ id }) => id === displayedSelectedEventId,
          )
          ? displayedSelectedEventId
          : preferredEventId(
              nextEvents,
              displayedForecast.circumstancesById,
              year,
              observationYear,
              observationInstantMilliseconds,
            ),
      );
    },
    [
      displayedForecast,
      displayedSelectedEventId,
      eventKindFilter,
      observationInstantMilliseconds,
      observationYear,
      year,
    ],
  );

  const changeEventKindFilter = useCallback(
    (filter: EventKindFilter) => {
      setEventKindFilter(filter);
      const nextKindEvents = displayedForecast.events.filter(
        (event) => matchesEventKindFilter(event, filter),
      );
      const nextEvents = showBelowHorizon
        ? nextKindEvents
        : nextKindEvents.filter(
            ({ id }) =>
              displayedForecast.circumstancesById.get(id)
                ?.visibility !== "below-horizon",
          );
      setSelectedEventId(
        displayedSelectedEventId &&
          nextEvents.some(
            ({ id }) => id === displayedSelectedEventId,
          )
          ? displayedSelectedEventId
          : preferredEventId(
              nextEvents,
              displayedForecast.circumstancesById,
              year,
              observationYear,
              observationInstantMilliseconds,
            ),
      );
    },
    [
      displayedForecast,
      displayedSelectedEventId,
      observationInstantMilliseconds,
      observationYear,
      showBelowHorizon,
      year,
    ],
  );

  const kindFilterHasNoMatches =
    eventKindFilter !== "all" &&
    kindFilteredEvents.length === 0 &&
    displayedForecast.events.length > 0;
  const filteredKindLabel =
    eventKindFilterLabel(eventKindFilter);

  return (
    <div className="event-forecast-panel">
      <ForecastYearControls
        observationYear={observationYear}
        onYearChange={setYear}
        year={year}
      />
      {coverageGap ? (
        <aside
          aria-label="予報期間の収録範囲"
          className="event-partial-notice event-coverage-notice"
          role="note"
        >
          <CircleAlertIcon
            aria-hidden="true"
            size={18}
            strokeWidth={1.8}
          />
          <p>{coverageGapMessage(coverageGap)}</p>
        </aside>
      ) : null}
      {precisionCatalogStatus !== "ready" ? (
        <aside
          aria-live="polite"
          className="event-partial-notice"
          role="status"
        >
          <p>
            {precisionCatalogStatus === "error"
              ? "精密星表を読み込めないため、日食・月食だけを表示しています。恒星掩蔽は省略されています。"
              : "精密星表の準備中です。日食・月食を先に計算し、恒星掩蔽は準備後に追加します。"}
            {displayedForecast.omittedOccultationCount > 0
              ? `（掩蔽候補${displayedForecast.omittedOccultationCount}件）`
              : ""}
          </p>
          {precisionCatalogStatus === "error" ? (
            <button onClick={retry} type="button">
              精密星表を再読み込み
            </button>
          ) : null}
        </aside>
      ) : null}
      {displayedForecast.calculationFailureCount > 0 &&
      displayedForecast.status === "ready" ? (
        <aside
          aria-live="polite"
          className="event-partial-notice"
          role="status"
        >
          <p>
            候補{displayedForecast.calculationFailureCount}
            件を局地計算できなかったため省略しました。他の結果は利用できます。
          </p>
          <button onClick={retry} type="button">
            予報を再計算
          </button>
        </aside>
      ) : null}
      {displayedForecast.status !== "loading" &&
      displayedForecast.status !== "error" ? (
        <aside
          aria-label="現象の絞り込み"
          className="event-visibility-filter"
        >
          <div className="event-kind-filter">
            <label htmlFor={eventKindFilterId}>種類</label>
            <select
              aria-label="現象の種類"
              id={eventKindFilterId}
              onChange={(event) =>
                changeEventKindFilter(
                  event.target.value as EventKindFilter,
                )
              }
              value={eventKindFilter}
            >
              {EVENT_KIND_FILTER_OPTIONS.map(({ label, value }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {filteredBelowHorizonCount > 0 ? (
            <label>
              <input
                checked={showBelowHorizon}
                onChange={(event) =>
                  changeBelowHorizonVisibility(event.target.checked)
                }
                type="checkbox"
              />
              地平線下の現象も表示（
              {filteredBelowHorizonCount}件）
            </label>
          ) : null}
          {displayedForecast.excludedAtLocationCount > 0 ? (
            <p>
              この地点では成立しない候補
              {displayedForecast.excludedAtLocationCount}
              件は一覧から除外しています。
            </p>
          ) : null}
        </aside>
      ) : null}
      <EventExplorer
        boundaryUncertaintyReasonsByEventId={
          boundaryUncertaintyReasonsByEventId
        }
        canRestoreObservationTime={canRestoreObservationTime}
        emptyMessage={
          filteredBelowHorizonCount > 0 &&
          !showBelowHorizon
            ? `地平線下に${filteredBelowHorizonCount}件あります。「地平線下の現象も表示」を選ぶと確認できます。`
            : kindFilterHasNoMatches
              ? `現在の${year}年の予報結果に${filteredKindLabel}はありません。種類を「すべて」にすると他の現象を確認できます。`
              : displayedForecast.excludedAtLocationCount > 0
              ? `候補${displayedForecast.excludedAtLocationCount}件を局地計算しましたが、この地点では現象が成立しませんでした。`
              : undefined
        }
        emptyTitle={
          filteredBelowHorizonCount > 0 &&
          !showBelowHorizon
            ? eventKindFilter === "all"
              ? "地平線上の現象はありません"
              : `地平線上の${filteredKindLabel}はありません`
            : kindFilterHasNoMatches
              ? `選択した${filteredKindLabel}はありません`
              : undefined
        }
        errorMessage={displayedForecast.errorMessage}
        events={displayedEvents}
        localClassificationsByEventId={
          localClassificationsByEventId
        }
        isActive={isActive}
        observationDate={observationDate}
        onGoToContact={showContact}
        onGoToMaximum={showContact}
        onRestoreObservationTime={onRestoreObservationTime}
        onRetry={retry}
        onRetrySceneSampling={retrySceneSampling}
        onSelectEvent={setSelectedEventId}
        selectedCircumstances={selectedCircumstances}
        selectedEventId={displayedSelectedEventId}
        sceneSampling={sceneSampling}
        status={explorerStatus}
        timeZone={location.timeZone}
      />
    </div>
  );
}
