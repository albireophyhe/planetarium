import type {
  EventKind,
  EventPhysicalSample,
  LocalCircumstances,
} from "../../domain/events/types";

const EVENT_SCENE_PROJECTION_STEP_SECONDS: Readonly<
  Record<EventKind, number>
> = Object.freeze({
  "lunar-eclipse": 180,
  "lunar-occultation": 60,
  "solar-eclipse": 120,
});
const MAXIMUM_EVENT_SCENE_PROJECTION_SAMPLE_COUNT = 257;

export type EventSceneSamplingResource = {
  readonly ephemerisId: string;
  readonly ephemerisSourceSha256: string;
  readonly eopRetrievedAt: string | null;
  readonly eopSourceSha256: string | null;
};

/**
 * Runtime-only physics session for one selected event.
 *
 * The closure intentionally lives outside the forecast LRU: it retains a
 * decoded ephemeris provider and the matching EOP snapshot. Numeric bounds
 * are immutable and avoid exposing mutable Date objects as session identity.
 */
export type EventSceneSamplingSession = {
  readonly eventId: string;
  readonly kind: EventKind;
  readonly projectionSamples: readonly EventPhysicalSample[];
  readonly rangeUtc: {
    readonly endMilliseconds: number;
    readonly startMilliseconds: number;
  };
  readonly resource: EventSceneSamplingResource;
  readonly sampleAt: (instantUtc: Date) => EventPhysicalSample;
  readonly targetStarHR: number | null;
};

export type EventSceneSamplingState =
  | {
      readonly errorMessage?: undefined;
      readonly session: null;
      readonly status: "unavailable" | "loading";
    }
  | {
      readonly errorMessage?: undefined;
      readonly session: EventSceneSamplingSession;
      readonly status: "ready";
    }
  | {
      readonly errorMessage: string;
      readonly session: null;
      readonly status: "error";
    };

export function eventSceneContactRange(
  circumstances: LocalCircumstances,
): EventSceneSamplingSession["rangeUtc"] | null {
  const instants = circumstances.contacts
    .map(({ instantUtc }) => instantUtc.getTime())
    .filter(Number.isFinite);
  const startMilliseconds = Math.min(...instants);
  const endMilliseconds = Math.max(...instants);
  return Number.isFinite(startMilliseconds) &&
    Number.isFinite(endMilliseconds) &&
    endMilliseconds > startMilliseconds
    ? Object.freeze({
        endMilliseconds,
        startMilliseconds,
      })
    : null;
}

export function eventSceneProjectionInstants(
  rangeUtc: EventSceneSamplingSession["rangeUtc"],
  count: number,
  anchors: readonly Date[] = [],
): readonly Date[] {
  const { endMilliseconds, startMilliseconds } = rangeUtc;
  if (
    !Number.isFinite(startMilliseconds) ||
    !Number.isFinite(endMilliseconds) ||
    endMilliseconds <= startMilliseconds ||
    !Number.isSafeInteger(count) ||
    count < 2 ||
    count > 257
  ) {
    throw new RangeError(
      "Event-scene projection range and sample count must be valid",
    );
  }
  const duration = endMilliseconds - startMilliseconds;
  const instantsByMilliseconds = new Map<number, Date>();
  for (let index = 0; index < count; index += 1) {
    const fraction = index / (count - 1);
    const instant = new Date(
      index === count - 1
        ? endMilliseconds
        : startMilliseconds + duration * fraction,
    );
    instantsByMilliseconds.set(instant.getTime(), instant);
  }
  for (const anchor of anchors) {
    const milliseconds = anchor.getTime();
    if (
      !Number.isFinite(milliseconds) ||
      milliseconds < startMilliseconds ||
      milliseconds > endMilliseconds
    ) {
      throw new RangeError(
        "Event-scene projection anchor must be inside the range",
      );
    }
    instantsByMilliseconds.set(
      milliseconds,
      new Date(milliseconds),
    );
  }
  return Object.freeze(
    [...instantsByMilliseconds.values()].sort(
      (left, right) => left.getTime() - right.getTime(),
    ),
  );
}

export function eventSceneProjectionSampleCount(
  kind: EventKind,
  rangeUtc: EventSceneSamplingSession["rangeUtc"],
): number {
  const durationMilliseconds =
    rangeUtc.endMilliseconds - rangeUtc.startMilliseconds;
  if (
    !Number.isFinite(durationMilliseconds) ||
    durationMilliseconds <= 0
  ) {
    throw new RangeError("Event-scene projection range must be valid");
  }
  const stepMilliseconds =
    EVENT_SCENE_PROJECTION_STEP_SECONDS[kind] * 1_000;
  return Math.min(
    MAXIMUM_EVENT_SCENE_PROJECTION_SAMPLE_COUNT,
    Math.max(2, Math.ceil(durationMilliseconds / stepMilliseconds) + 1),
  );
}

export function clampEventSceneInstant(
  instantMilliseconds: number,
  rangeUtc: EventSceneSamplingSession["rangeUtc"],
): number {
  if (!Number.isFinite(instantMilliseconds)) {
    throw new RangeError("Event-scene instant must be finite");
  }
  return Math.min(
    rangeUtc.endMilliseconds,
    Math.max(rangeUtc.startMilliseconds, instantMilliseconds),
  );
}
