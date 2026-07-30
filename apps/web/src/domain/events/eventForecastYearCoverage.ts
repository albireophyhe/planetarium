const MINIMUM_FORECAST_YEAR = 1900;
const MAXIMUM_FORECAST_YEAR = 2100;
const MINIMUM_UTC_OFFSET_SECONDS = -12 * 60 * 60;
const MAXIMUM_UTC_OFFSET_SECONDS = 14 * 60 * 60;
const MILLISECONDS_PER_SECOND = 1_000;
const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * Closed reception-time coverage shared by every event solver.
 *
 * The DE442s artifact starts at 1900-01-01 00:00:00 TDB, but apparent
 * Sun/Moon evaluation reserves a ten-minute light-time lookback. Converting
 * that safe start and the artifact's 2101-01-01 00:00:00 TDB endpoint with
 * the application's UTC/TT/TDB model gives these millisecond boundaries.
 */
export const EVENT_FORECAST_SAFE_START_UTC =
  "1900-01-01T00:09:27.817Z";
export const EVENT_FORECAST_SAFE_END_UTC =
  "2100-12-31T23:58:50.816Z";

const SAFE_START_MILLISECONDS = Date.parse(
  EVENT_FORECAST_SAFE_START_UTC,
);
const SAFE_END_MILLISECONDS = Date.parse(
  EVENT_FORECAST_SAFE_END_UTC,
);

export type EventForecastCoverageGapEdge =
  | "local-year-start"
  | "local-year-end";

export interface EventForecastCoverageGap {
  readonly edge: EventForecastCoverageGapEdge;
  readonly resourceBoundaryUtc: Date;
  readonly missingDurationMilliseconds: number;
  readonly approximateMinutes: number;
}

function assertYear(year: number): void {
  if (
    !Number.isSafeInteger(year) ||
    year < MINIMUM_FORECAST_YEAR ||
    year > MAXIMUM_FORECAST_YEAR
  ) {
    throw new RangeError(
      "Forecast year must be an integer from 1900 through 2100",
    );
  }
}

function assertUtcOffsetSeconds(
  value: number,
  field: string,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < MINIMUM_UTC_OFFSET_SECONDS ||
    value > MAXIMUM_UTC_OFFSET_SECONDS
  ) {
    throw new RangeError(
      `${field} must be an integer from UTC-12:00 through UTC+14:00`,
    );
  }
}

function coverageGap(
  edge: EventForecastCoverageGapEdge,
  resourceBoundaryMilliseconds: number,
  missingDurationMilliseconds: number,
): EventForecastCoverageGap {
  return Object.freeze({
    approximateMinutes: Math.max(
      1,
      Math.ceil(
        missingDurationMilliseconds / MILLISECONDS_PER_MINUTE,
      ),
    ),
    edge,
    missingDurationMilliseconds,
    resourceBoundaryUtc: new Date(resourceBoundaryMilliseconds),
  });
}

/**
 * Reports the only local-calendar gap that can affect a supported year.
 *
 * Offsets are those in force at local 00:00 on January 1 of `year` and
 * `year + 1`. Keeping both values explicit supports IANA zones whose offset
 * changes during the year without putting platform time-zone behavior in
 * this pure coverage calculation.
 */
export function eventForecastYearCoverageGap(
  year: number,
  utcOffsetSecondsAtYearStart: number,
  utcOffsetSecondsAtNextYearStart: number,
): EventForecastCoverageGap | null {
  assertYear(year);
  assertUtcOffsetSeconds(
    utcOffsetSecondsAtYearStart,
    "UTC offset at year start",
  );
  assertUtcOffsetSeconds(
    utcOffsetSecondsAtNextYearStart,
    "UTC offset at next year start",
  );

  if (year === MINIMUM_FORECAST_YEAR) {
    const localYearStartUtcMilliseconds =
      Date.UTC(year, 0, 1) -
      utcOffsetSecondsAtYearStart * MILLISECONDS_PER_SECOND;
    const missingDurationMilliseconds =
      SAFE_START_MILLISECONDS - localYearStartUtcMilliseconds;
    return missingDurationMilliseconds > 0
      ? coverageGap(
          "local-year-start",
          SAFE_START_MILLISECONDS,
          missingDurationMilliseconds,
        )
      : null;
  }

  if (year === MAXIMUM_FORECAST_YEAR) {
    const localNextYearStartUtcMilliseconds =
      Date.UTC(year + 1, 0, 1) -
      utcOffsetSecondsAtNextYearStart * MILLISECONDS_PER_SECOND;
    const missingDurationMilliseconds =
      localNextYearStartUtcMilliseconds - SAFE_END_MILLISECONDS;
    return missingDurationMilliseconds > 0
      ? coverageGap(
          "local-year-end",
          SAFE_END_MILLISECONDS,
          missingDurationMilliseconds,
        )
      : null;
  }

  return null;
}
