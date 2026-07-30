import {
  tdbJulianDateToUtcDate,
  utcDateToTdbJulianDate,
} from "./eventTime";
import type {
  EventEphemerisProvider,
  EventSearchBounds,
  GeocentricEphemerisState,
} from "./types";

const SECONDS_PER_DAY = 86_400;
const BOUNDARY_ADJUSTMENT_LIMIT_MILLISECONDS = 8;

/**
 * The event solvers iterate Sun light time by about 490–510 seconds. Keeping
 * the reception epoch ten minutes inside the first loaded state guarantees
 * that all retarded Sun and Moon state requests stay in loaded coverage.
 */
export const EVENT_EPHEMERIS_LOOKBACK_SECONDS = 600;

function validateSearchBounds(
  bounds: EventSearchBounds,
  label: string,
): void {
  if (
    !Number.isFinite(bounds.startUtcMilliseconds) ||
    !Number.isFinite(bounds.endUtcMilliseconds) ||
    bounds.endUtcMilliseconds <= bounds.startUtcMilliseconds
  ) {
    throw new RangeError(`${label} must be finite and ordered`);
  }
}

function validateStateCoverage(
  ephemeris: EventEphemerisProvider,
): void {
  const { stateCoverage } = ephemeris;
  if (
    !Number.isFinite(stateCoverage.startJulianDateTdb) ||
    !Number.isFinite(stateCoverage.endJulianDateTdb) ||
    stateCoverage.endJulianDateTdb <=
      stateCoverage.startJulianDateTdb ||
    stateCoverage.endIsIncluded !== true
  ) {
    throw new RangeError(
      "Event ephemeris state coverage must be a finite closed interval",
    );
  }
}

function utcMillisecondsInsideTdbBoundary(
  tdbJulianDate: number,
  edge: "start" | "end",
): number {
  let milliseconds =
    tdbJulianDateToUtcDate(tdbJulianDate).getTime();
  const tdbAt = (value: number) =>
    utcDateToTdbJulianDate(new Date(value));

  for (
    let adjustment = 0;
    adjustment <= BOUNDARY_ADJUSTMENT_LIMIT_MILLISECONDS;
    adjustment += 1
  ) {
    const currentTdb = tdbAt(milliseconds);
    if (edge === "start") {
      if (currentTdb < tdbJulianDate) {
        milliseconds += 1;
        continue;
      }
      if (tdbAt(milliseconds - 1) >= tdbJulianDate) {
        milliseconds -= 1;
        continue;
      }
    } else {
      if (currentTdb > tdbJulianDate) {
        milliseconds -= 1;
        continue;
      }
      if (tdbAt(milliseconds + 1) <= tdbJulianDate) {
        milliseconds += 1;
        continue;
      }
    }
    return milliseconds;
  }

  throw new RangeError(
    `Unable to place the UTC ${edge} inside ephemeris coverage`,
  );
}

/**
 * Returns the reception-time interval that can safely use every loaded
 * provider state. The lower edge reserves Sun/Moon light-time lookback;
 * the upper edge needs no reserve because retarded epochs move earlier.
 */
export function eventEphemerisSearchBounds(
  ephemeris: EventEphemerisProvider,
): EventSearchBounds {
  validateStateCoverage(ephemeris);
  const { stateCoverage } = ephemeris;
  const safeStartJulianDateTdb =
    stateCoverage.startJulianDateTdb +
    EVENT_EPHEMERIS_LOOKBACK_SECONDS / SECONDS_PER_DAY;
  if (
    safeStartJulianDateTdb >=
    stateCoverage.endJulianDateTdb
  ) {
    throw new RangeError(
      "Event ephemeris coverage is too short for light-time iteration",
    );
  }
  return Object.freeze({
    startUtcMilliseconds: utcMillisecondsInsideTdbBoundary(
      safeStartJulianDateTdb,
      "start",
    ),
    endUtcMilliseconds: utcMillisecondsInsideTdbBoundary(
      stateCoverage.endJulianDateTdb,
      "end",
    ),
  });
}

export function intersectEventSearchBounds(
  first: EventSearchBounds,
  second: EventSearchBounds,
): EventSearchBounds {
  validateSearchBounds(first, "First event search bounds");
  validateSearchBounds(second, "Second event search bounds");
  const intersection = {
    startUtcMilliseconds: Math.max(
      first.startUtcMilliseconds,
      second.startUtcMilliseconds,
    ),
    endUtcMilliseconds: Math.min(
      first.endUtcMilliseconds,
      second.endUtcMilliseconds,
    ),
  };
  validateSearchBounds(
    intersection,
    "Event search-bounds intersection",
  );
  return Object.freeze(intersection);
}

export function resolveEventSearchBounds(
  candidateUtcMilliseconds: number,
  halfWindowMilliseconds: number,
  limit?: EventSearchBounds,
): EventSearchBounds {
  if (
    !Number.isFinite(candidateUtcMilliseconds) ||
    !Number.isFinite(halfWindowMilliseconds) ||
    halfWindowMilliseconds <= 0
  ) {
    throw new RangeError(
      "Event candidate and search half-window must be finite",
    );
  }
  const requested = Object.freeze({
    startUtcMilliseconds:
      candidateUtcMilliseconds - halfWindowMilliseconds,
    endUtcMilliseconds:
      candidateUtcMilliseconds + halfWindowMilliseconds,
  });
  validateSearchBounds(requested, "Requested event search bounds");
  const resolved = limit
    ? intersectEventSearchBounds(requested, limit)
    : requested;
  if (
    candidateUtcMilliseconds <
      resolved.startUtcMilliseconds ||
    candidateUtcMilliseconds > resolved.endUtcMilliseconds
  ) {
    throw new RangeError(
      "Event candidate is outside loaded ephemeris coverage",
    );
  }
  return resolved;
}

/**
 * Fail before invoking a provider whose requested TDB epoch is not backed by
 * its loaded chunks. This makes coverage behavior observable and testable.
 */
export function eventEphemerisState(
  ephemeris: EventEphemerisProvider,
  tdbJulianDate: number,
): GeocentricEphemerisState {
  if (!Number.isFinite(tdbJulianDate)) {
    throw new RangeError("Event ephemeris TDB epoch must be finite");
  }
  validateStateCoverage(ephemeris);
  const { stateCoverage } = ephemeris;
  if (
    tdbJulianDate < stateCoverage.startJulianDateTdb ||
    tdbJulianDate > stateCoverage.endJulianDateTdb
  ) {
    throw new RangeError(
      "Event ephemeris TDB epoch is outside loaded state coverage",
    );
  }
  return ephemeris.state(tdbJulianDate);
}
