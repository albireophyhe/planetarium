import type { ZonedDateTimeDisambiguation } from "./types";
import { isValidTimeZone } from "./validation";

interface LocalDateTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

function assertValidDate(date: Date): void {
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Date must be valid");
  }
}

function assertValidTimeZone(timeZone: string): void {
  if (
    typeof timeZone !== "string" ||
    timeZone.trim().length === 0 ||
    !isValidTimeZone(timeZone)
  ) {
    throw new RangeError(`Invalid IANA time zone: ${String(timeZone)}`);
  }
}

function numericParts(date: Date, timeZone: string): LocalDateTimeParts {
  assertValidDate(date);
  assertValidTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    millisecond: Number(parts.fractionalSecond)
  };
}

function parseLocalDateTime(value: string): LocalDateTimeParts {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(
      "Local date-time must use YYYY-MM-DDTHH:mm[:ss[.SSS]]"
    );
  }
  const parts: LocalDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] === undefined ? 0 : Number(match[6]),
    millisecond:
      match[7] === undefined
        ? 0
        : Number(match[7].padEnd(3, "0"))
  };
  const canonical = new Date(utcLikeMilliseconds(parts));

  if (
    canonical.getUTCFullYear() !== parts.year ||
    canonical.getUTCMonth() + 1 !== parts.month ||
    canonical.getUTCDate() !== parts.day ||
    canonical.getUTCHours() !== parts.hour ||
    canonical.getUTCMinutes() !== parts.minute ||
    canonical.getUTCSeconds() !== parts.second ||
    canonical.getUTCMilliseconds() !== parts.millisecond
  ) {
    throw new RangeError("Local date-time contains an invalid calendar value");
  }

  return parts;
}

function sameLocalParts(
  first: LocalDateTimeParts,
  second: LocalDateTimeParts
): boolean {
  return (
    first.year === second.year &&
    first.month === second.month &&
    first.day === second.day &&
    first.hour === second.hour &&
    first.minute === second.minute &&
    first.second === second.second &&
    first.millisecond === second.millisecond
  );
}

function utcLikeMilliseconds(parts: LocalDateTimeParts): number {
  // Date.UTC treats years 0–99 as 1900–1999; setUTCFullYear avoids that
  // historical constructor quirk and keeps calendar validation deterministic.
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );
  return date.getTime();
}

function timeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
  return utcLikeMilliseconds(numericParts(date, timeZone)) - date.getTime();
}

/**
 * Convert an HTML datetime-local value in an IANA time zone to an instant.
 * Ambiguous fall-back times choose the earlier occurrence unless requested
 * otherwise. Nonexistent spring-forward times throw a RangeError.
 */
export function zonedLocalToDate(
  localDateTime: string,
  timeZone: string,
  disambiguation: ZonedDateTimeDisambiguation = "earlier"
): Date {
  assertValidTimeZone(timeZone);
  if (
    disambiguation !== "earlier" &&
    disambiguation !== "later" &&
    disambiguation !== "reject"
  ) {
    throw new RangeError(
      "Time-zone disambiguation must be earlier, later, or reject"
    );
  }
  const requestedParts = parseLocalDateTime(localDateTime);
  const naiveMilliseconds = utcLikeMilliseconds(requestedParts);
  const possibleOffsets = new Set<number>();

  // Sampling a three-day window captures both offsets around a DST change and
  // supports zones whose offsets are not whole hours.
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = new Date(naiveMilliseconds + hours * 3_600_000);
    possibleOffsets.add(timeZoneOffsetMilliseconds(sample, timeZone));
  }

  const candidates = [...possibleOffsets]
    .map((offset) => new Date(naiveMilliseconds - offset))
    .filter((candidate) =>
      sameLocalParts(numericParts(candidate, timeZone), requestedParts)
    )
    .sort((first, second) => first.getTime() - second.getTime());

  if (candidates.length === 0) {
    throw new RangeError(
      `The local date-time does not exist in ${timeZone}`
    );
  }
  if (candidates.length > 1 && disambiguation === "reject") {
    throw new RangeError(
      `The local date-time is ambiguous in ${timeZone}`
    );
  }

  return disambiguation === "later"
    ? candidates[candidates.length - 1]
    : candidates[0];
}

/**
 * UTC offset in whole seconds at a local civil date-time.
 *
 * The value is positive east of Greenwich. Resolving the local label first
 * also preserves historical IANA offsets that are not whole hours.
 */
export function timeZoneOffsetSecondsAtLocalDateTime(
  localDateTime: string,
  timeZone: string
): number {
  const requestedParts = parseLocalDateTime(localDateTime);
  const instant = zonedLocalToDate(
    localDateTime,
    timeZone,
    "earlier"
  );
  const offsetSeconds =
    (utcLikeMilliseconds(requestedParts) - instant.getTime()) /
    1_000;
  if (!Number.isSafeInteger(offsetSeconds)) {
    throw new RangeError(
      `Could not resolve a whole-second UTC offset in ${timeZone}`
    );
  }
  return offsetSeconds;
}

/** Reader-facing date and time in the requested IANA time zone. */
export function formatZonedDateTime(
  date: Date,
  timeZone: string,
  locale = "ja-JP"
): string {
  assertValidDate(date);
  assertValidTimeZone(timeZone);
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

/** HTML datetime-local compatible value (whole-second precision). */
export function formatZonedDateTimeInput(
  date: Date,
  timeZone: string
): string {
  const { year, month, day, hour, minute, second } = numericParts(
    date,
    timeZone
  );
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}T${pad(
    hour
  )}:${pad(minute)}:${pad(second)}`;
}
