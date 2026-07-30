import { assertSupportedObservationDate } from "../observationDate";
import { julianDate } from "../coordinates";
import {
  SECONDS_PER_DAY,
  assertFinite
} from "./constants";
import type {
  EarthOrientationOptions,
  PrecisionWarningCode,
  ResolvedTimeScales
} from "./types";

interface LeapSecondEntry {
  readonly effectiveAt: number;
  readonly taiMinusUtcSeconds: number;
}

/*
 * Effective UTC instants from the IERS leap-second history. Before 1972,
 * UTC included rate adjustments rather than integer leap seconds; callers that
 * need historical precision must provide TAI−UTC explicitly.
 */
const LEAP_SECONDS: readonly LeapSecondEntry[] = [
  ["1972-01-01T00:00:00.000Z", 10],
  ["1972-07-01T00:00:00.000Z", 11],
  ["1973-01-01T00:00:00.000Z", 12],
  ["1974-01-01T00:00:00.000Z", 13],
  ["1975-01-01T00:00:00.000Z", 14],
  ["1976-01-01T00:00:00.000Z", 15],
  ["1977-01-01T00:00:00.000Z", 16],
  ["1978-01-01T00:00:00.000Z", 17],
  ["1979-01-01T00:00:00.000Z", 18],
  ["1980-01-01T00:00:00.000Z", 19],
  ["1981-07-01T00:00:00.000Z", 20],
  ["1982-07-01T00:00:00.000Z", 21],
  ["1983-07-01T00:00:00.000Z", 22],
  ["1985-07-01T00:00:00.000Z", 23],
  ["1988-01-01T00:00:00.000Z", 24],
  ["1990-01-01T00:00:00.000Z", 25],
  ["1991-01-01T00:00:00.000Z", 26],
  ["1992-07-01T00:00:00.000Z", 27],
  ["1993-07-01T00:00:00.000Z", 28],
  ["1994-07-01T00:00:00.000Z", 29],
  ["1996-01-01T00:00:00.000Z", 30],
  ["1997-07-01T00:00:00.000Z", 31],
  ["1999-01-01T00:00:00.000Z", 32],
  ["2006-01-01T00:00:00.000Z", 33],
  ["2009-01-01T00:00:00.000Z", 34],
  ["2012-07-01T00:00:00.000Z", 35],
  ["2015-07-01T00:00:00.000Z", 36],
  ["2017-01-01T00:00:00.000Z", 37]
].map(([iso, value]) => ({
  effectiveAt: Date.parse(iso as string),
  taiMinusUtcSeconds: value as number
}));

/*
 * IERS Bulletin C 72 (2026-07-06) confirms no leap second at the end of
 * December 2026. A later Bulletin C can change the offset from 2027-07-01.
 */
const LEAP_SECOND_KNOWN_THROUGH = Date.parse("2027-07-01T00:00:00.000Z");
const MAXIMUM_ABSOLUTE_DUT1_SECONDS = 3_600;
const MAXIMUM_DUT1_UNCERTAINTY_SECONDS = 3_600;

function defaultTaiMinusUtc(date: Date): {
  readonly value: number;
  readonly source: ResolvedTimeScales["taiMinusUtcSource"];
  readonly warnings: readonly PrecisionWarningCode[];
} {
  const milliseconds = date.getTime();
  let selected: LeapSecondEntry | undefined;
  for (const entry of LEAP_SECONDS) {
    if (milliseconds < entry.effectiveAt) {
      break;
    }
    selected = entry;
  }
  if (!selected) {
    return {
      value: 0,
      source: "pre-1972-approximation",
      warnings: ["pre-1972-utc-tt-approximation"]
    };
  }
  return {
    value: selected.taiMinusUtcSeconds,
    source: "iers-history",
    warnings:
      milliseconds >= LEAP_SECOND_KNOWN_THROUGH
        ? ["future-leap-seconds-unknown"]
        : []
  };
}

export function resolveTimeScales(
  date: Date,
  options: EarthOrientationOptions = {}
): ResolvedTimeScales {
  const validDate = assertSupportedObservationDate(date);
  const utcJulianDate = julianDate(validDate);
  const warnings: PrecisionWarningCode[] = [];

  const hasDut1 = options.dut1Seconds !== undefined;
  if (
    !hasDut1 &&
    (options.dut1Source !== undefined ||
      options.dut1UncertaintySeconds !== undefined)
  ) {
    throw new TypeError(
      "DUT1 source and uncertainty require an explicit DUT1 value"
    );
  }
  const dut1Seconds = hasDut1
    ? assertFinite(options.dut1Seconds as number, "DUT1")
    : 0;
  if (Math.abs(dut1Seconds) > MAXIMUM_ABSOLUTE_DUT1_SECONDS) {
    throw new RangeError(
      "DUT1 must be between -3600 and +3600 seconds"
    );
  }
  const dut1Source = hasDut1
    ? (options.dut1Source ?? "caller")
    : "assumed-zero";
  if (
    dut1Source !== "caller" &&
    dut1Source !== "iers-observed" &&
    dut1Source !== "iers-predicted" &&
    dut1Source !== "assumed-zero"
  ) {
    throw new TypeError("DUT1 source is not supported");
  }
  if (hasDut1 && dut1Source === "assumed-zero") {
    throw new TypeError(
      "Explicit DUT1 cannot use the assumed-zero source"
    );
  }
  const dut1UncertaintySeconds =
    options.dut1UncertaintySeconds === undefined
      ? null
      : assertFinite(
          options.dut1UncertaintySeconds,
          "DUT1 uncertainty"
        );
  if (
    dut1UncertaintySeconds !== null &&
    (dut1UncertaintySeconds < 0 ||
      dut1UncertaintySeconds > MAXIMUM_DUT1_UNCERTAINTY_SECONDS)
  ) {
    throw new RangeError(
      "DUT1 uncertainty must be between 0 and 3600 seconds"
    );
  }
  if (dut1Source === "assumed-zero") {
    warnings.push("dut1-assumed-zero");
  }

  const defaultTai = defaultTaiMinusUtc(validDate);
  const taiMinusUtcSeconds =
    options.taiMinusUtcSeconds === undefined
      ? defaultTai.value
      : assertFinite(options.taiMinusUtcSeconds, "TAI−UTC");
  if (taiMinusUtcSeconds < -100 || taiMinusUtcSeconds > 200) {
    throw new RangeError("TAI−UTC must be between -100 and +200 seconds");
  }
  const taiMinusUtcSource =
    options.taiMinusUtcSeconds === undefined
      ? defaultTai.source
      : "caller";
  if (options.taiMinusUtcSeconds === undefined) {
    warnings.push(...defaultTai.warnings);
  }

  return {
    utcJulianDate,
    ut1JulianDate: utcJulianDate + dut1Seconds / SECONDS_PER_DAY,
    ttJulianDate:
      utcJulianDate +
      (taiMinusUtcSeconds + 32.184) / SECONDS_PER_DAY,
    dut1Seconds,
    dut1UncertaintySeconds,
    taiMinusUtcSeconds,
    dut1Source,
    taiMinusUtcSource,
    warnings
  };
}
