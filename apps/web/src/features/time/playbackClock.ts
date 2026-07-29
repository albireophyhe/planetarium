import {
  clampObservationDate,
  SUPPORTED_OBSERVATION_DATE_RANGE,
} from "../../domain/observationDate";

export const PLAYBACK_SPEEDS = [
  {
    label: "実時間",
    secondsPerSecond: 1,
    shortLabel: "1×",
  },
  {
    label: "1分／秒",
    secondsPerSecond: 60,
    shortLabel: "60×",
  },
  {
    label: "10分／秒",
    secondsPerSecond: 600,
    shortLabel: "600×",
  },
  {
    label: "1時間／秒",
    secondsPerSecond: 3_600,
    shortLabel: "3,600×",
  },
  {
    label: "1日／秒",
    secondsPerSecond: 86_400,
    shortLabel: "86,400×",
  },
] as const;

export type PlaybackDirection = -1 | 1;
export type PlaybackSpeed =
  (typeof PLAYBACK_SPEEDS)[number]["secondsPerSecond"];
export type PlaybackBoundary = "maximum" | "minimum" | null;

export type PlaybackAdvance = {
  boundary: PlaybackBoundary;
  date: Date;
  simulatedDeltaSeconds: number;
};

type AdvancePlaybackOptions = {
  currentDate: Date;
  direction: PlaybackDirection;
  maximumRealDeltaSeconds?: number;
  realDeltaSeconds: number;
  speed: PlaybackSpeed;
};

const MINIMUM_MILLISECONDS = Date.parse(
  SUPPORTED_OBSERVATION_DATE_RANGE.minimum,
);
const MAXIMUM_MILLISECONDS = Date.parse(
  SUPPORTED_OBSERVATION_DATE_RANGE.maximum,
);

export function outboundPlaybackBoundary(
  currentDate: Date,
  direction: PlaybackDirection,
): PlaybackBoundary {
  const currentMilliseconds =
    clampObservationDate(currentDate).getTime();

  if (
    direction === 1 &&
    currentMilliseconds >= MAXIMUM_MILLISECONDS
  ) {
    return "maximum";
  }

  if (
    direction === -1 &&
    currentMilliseconds <= MINIMUM_MILLISECONDS
  ) {
    return "minimum";
  }

  return null;
}

/**
 * Advances the authoritative observation date from a monotonic real-time
 * delta. The delta is capped so resuming a suspended tab cannot silently jump
 * the sky by hours or days.
 */
export function advancePlayback({
  currentDate,
  direction,
  maximumRealDeltaSeconds = 0.25,
  realDeltaSeconds,
  speed,
}: AdvancePlaybackOptions): PlaybackAdvance {
  const canonicalDate = clampObservationDate(currentDate);
  const currentMilliseconds = canonicalDate.getTime();
  if (
    !Number.isFinite(realDeltaSeconds) ||
    realDeltaSeconds <= 0 ||
    !Number.isFinite(maximumRealDeltaSeconds) ||
    maximumRealDeltaSeconds <= 0
  ) {
    return {
      boundary: null,
      date: canonicalDate,
      simulatedDeltaSeconds: 0,
    };
  }

  const boundedRealDelta = Math.min(
    realDeltaSeconds,
    maximumRealDeltaSeconds,
  );
  const simulatedDeltaSeconds =
    boundedRealDelta * speed * direction;
  const proposedMilliseconds =
    currentMilliseconds + simulatedDeltaSeconds * 1_000;

  if (proposedMilliseconds <= MINIMUM_MILLISECONDS) {
    return {
      boundary: "minimum",
      date: new Date(MINIMUM_MILLISECONDS),
      simulatedDeltaSeconds:
        (MINIMUM_MILLISECONDS - currentMilliseconds) / 1_000,
    };
  }

  if (proposedMilliseconds >= MAXIMUM_MILLISECONDS) {
    return {
      boundary: "maximum",
      date: new Date(MAXIMUM_MILLISECONDS),
      simulatedDeltaSeconds:
        (MAXIMUM_MILLISECONDS - currentMilliseconds) / 1_000,
    };
  }

  return {
    boundary: null,
    date: new Date(proposedMilliseconds),
    simulatedDeltaSeconds,
  };
}

export function isPlaybackSpeed(value: number): value is PlaybackSpeed {
  return PLAYBACK_SPEEDS.some(
    ({ secondsPerSecond }) => secondsPerSecond === value,
  );
}
