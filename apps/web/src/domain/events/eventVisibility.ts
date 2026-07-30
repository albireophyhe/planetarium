import { minimizeBracketed } from "./numerics";
import type { EventVisibility } from "./types";

const DEFAULT_TIME_TOLERANCE_MILLISECONDS = 1_000;
const DEFAULT_MAXIMUM_SEGMENT_MILLISECONDS =
  2 * 60 * 60 * 1_000;

/**
 * Classifies a physical-boundary case where only the closest-approach
 * sample is trustworthy. A positive clearance is intentionally
 * `partly-visible`: without certain contact roots we must not claim that
 * the complete phenomenon is above the horizon.
 */
export function classifyBoundaryMaximumVisibility(
  horizonClearanceRadians: number,
): Extract<
  EventVisibility,
  "partly-visible" | "below-horizon"
> {
  if (!Number.isFinite(horizonClearanceRadians)) {
    throw new RangeError("Event horizon clearance must be finite");
  }
  return horizonClearanceRadians > 0
    ? "partly-visible"
    : "below-horizon";
}

/**
 * Classifies visibility over the complete phenomenon interval instead of
 * only at named contacts. This matters when a body rises and sets between
 * two contacts that are both below the geometric horizon.
 */
export function classifyEventIntervalVisibility(
  startMilliseconds: number,
  endMilliseconds: number,
  horizonClearanceAt: (instantMilliseconds: number) => number,
  timeToleranceMilliseconds =
    DEFAULT_TIME_TOLERANCE_MILLISECONDS,
  maximumSegmentMilliseconds =
    DEFAULT_MAXIMUM_SEGMENT_MILLISECONDS,
): Extract<
  EventVisibility,
  "fully-visible" | "partly-visible" | "below-horizon"
> {
  if (
    !Number.isFinite(startMilliseconds) ||
    !Number.isFinite(endMilliseconds) ||
    !Number.isFinite(timeToleranceMilliseconds) ||
    !Number.isFinite(maximumSegmentMilliseconds) ||
    endMilliseconds < startMilliseconds ||
    timeToleranceMilliseconds <= 0 ||
    maximumSegmentMilliseconds <= timeToleranceMilliseconds
  ) {
    throw new RangeError(
      "Event visibility interval and tolerance must be valid",
    );
  }
  const startClearance = horizonClearanceAt(startMilliseconds);
  if (!Number.isFinite(startClearance)) {
    throw new RangeError("Event horizon clearance must be finite");
  }
  if (endMilliseconds === startMilliseconds) {
    return startClearance > 0
      ? "fully-visible"
      : "below-horizon";
  }
  let minimumClearance = startClearance;
  let maximumClearance = startClearance;
  let segmentStart = startMilliseconds;
  while (segmentStart < endMilliseconds) {
    const segmentEnd = Math.min(
      endMilliseconds,
      segmentStart + maximumSegmentMilliseconds,
    );
    const endClearance = horizonClearanceAt(segmentEnd);
    if (!Number.isFinite(endClearance)) {
      throw new RangeError(
        "Event horizon clearance must be finite",
      );
    }
    const minimum = minimizeBracketed(
      horizonClearanceAt,
      segmentStart,
      segmentEnd,
      timeToleranceMilliseconds,
    ).value;
    const maximum = -minimizeBracketed(
      (instant) => -horizonClearanceAt(instant),
      segmentStart,
      segmentEnd,
      timeToleranceMilliseconds,
    ).value;
    minimumClearance = Math.min(
      minimumClearance,
      endClearance,
      minimum,
    );
    maximumClearance = Math.max(
      maximumClearance,
      endClearance,
      maximum,
    );
    segmentStart = segmentEnd;
  }

  if (maximumClearance <= 0) {
    return "below-horizon";
  }
  return minimumClearance > 0
    ? "fully-visible"
    : "partly-visible";
}
