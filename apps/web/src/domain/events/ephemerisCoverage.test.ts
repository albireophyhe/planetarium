import { describe, expect, it, vi } from "vitest";
import {
  EVENT_EPHEMERIS_LOOKBACK_SECONDS,
  eventEphemerisSearchBounds,
  eventEphemerisState,
  resolveEventSearchBounds,
} from "./ephemerisCoverage";
import {
  tdbJulianDateToUtcDate,
  utcDateToTdbJulianDate,
} from "./eventTime";
import type {
  EventEphemerisProvider,
  GeocentricEphemerisState,
} from "./types";

const MILLISECONDS_PER_HOUR = 60 * 60 * 1_000;
const SECONDS_PER_DAY = 86_400;

function provider(
  startJulianDateTdb: number,
  endJulianDateTdb: number,
) {
  const state = vi.fn(
    (tdbJulianDate: number): GeocentricEphemerisState => ({
      earthBarycentric: {
        positionKilometers: [0, 0, 0],
        velocityKilometersPerDay: [0, 0, 0],
      },
      moonGeocentric: {
        positionKilometers: [384_400, 0, 0],
        velocityKilometersPerDay: [0, 0, 0],
      },
      sunGeocentric: {
        positionKilometers: [149_597_870.7, 0, 0],
        velocityKilometersPerDay: [0, 0, 0],
      },
      tdbJulianDate,
    }),
  );
  const ephemeris: EventEphemerisProvider = {
    id: "synthetic-coverage",
    sourceSha256: "0".repeat(64),
    state,
    stateCoverage: {
      startJulianDateTdb,
      endJulianDateTdb,
      endIsIncluded: true,
    },
  };
  return { ephemeris, state };
}

describe("event ephemeris loaded coverage", () => {
  it("maps a closed TDB interval to asymmetric safe reception bounds", () => {
    const startJulianDateTdb = 2_460_000.5;
    const endJulianDateTdb = 2_460_010.5;
    const { ephemeris } = provider(
      startJulianDateTdb,
      endJulianDateTdb,
    );
    const bounds = eventEphemerisSearchBounds(ephemeris);
    const safeStartJulianDateTdb =
      startJulianDateTdb +
      EVENT_EPHEMERIS_LOOKBACK_SECONDS / SECONDS_PER_DAY;

    expect(
      utcDateToTdbJulianDate(
        new Date(bounds.startUtcMilliseconds),
      ),
    ).toBeGreaterThanOrEqual(safeStartJulianDateTdb);
    expect(
      utcDateToTdbJulianDate(
        new Date(bounds.startUtcMilliseconds - 1),
      ),
    ).toBeLessThan(safeStartJulianDateTdb);
    expect(
      utcDateToTdbJulianDate(
        new Date(bounds.endUtcMilliseconds),
      ),
    ).toBeLessThanOrEqual(endJulianDateTdb);
    expect(
      utcDateToTdbJulianDate(
        new Date(bounds.endUtcMilliseconds + 1),
      ),
    ).toBeGreaterThan(endJulianDateTdb);
  });

  it("clips only the constrained side of a synthetic search window", () => {
    const candidateMilliseconds =
      tdbJulianDateToUtcDate(2_488_433.803_971_567).getTime();
    const clippedEndMilliseconds =
      candidateMilliseconds + 16 * MILLISECONDS_PER_HOUR;
    const bounds = resolveEventSearchBounds(
      candidateMilliseconds,
      18 * MILLISECONDS_PER_HOUR,
      {
        startUtcMilliseconds:
          candidateMilliseconds -
          3 * 24 * MILLISECONDS_PER_HOUR,
        endUtcMilliseconds: clippedEndMilliseconds,
      },
    );

    expect(bounds.startUtcMilliseconds).toBe(
      candidateMilliseconds - 18 * MILLISECONDS_PER_HOUR,
    );
    expect(bounds.endUtcMilliseconds).toBe(
      clippedEndMilliseconds,
    );
  });

  it("rejects an out-of-coverage epoch before invoking state()", () => {
    const { ephemeris, state } = provider(
      2_460_000.5,
      2_460_010.5,
    );

    expect(() =>
      eventEphemerisState(ephemeris, 2_460_000.499),
    ).toThrow(/outside loaded state coverage/);
    expect(state).not.toHaveBeenCalled();
    expect(
      eventEphemerisState(ephemeris, 2_460_010.5)
        .tdbJulianDate,
    ).toBe(2_460_010.5);
    expect(state).toHaveBeenCalledOnce();
  });
});
