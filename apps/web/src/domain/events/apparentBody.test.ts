import { describe, expect, it } from "vitest";
import { resolveTimeScales } from "../precision";
import type {
  EphemerisState,
  EventEphemerisProvider,
  GeocentricEphemerisState,
} from "./types";
import {
  angularSeparationRadians,
  calculateApparentBody,
} from "./apparentBody";
import { eventEphemerisSearchBounds } from "./ephemerisCoverage";

const AU_KM = 149_597_870.7;

function state(
  positionKilometers: readonly [number, number, number],
  velocityKilometersPerDay: readonly [number, number, number] = [0, 0, 0],
): EphemerisState {
  return { positionKilometers, velocityKilometersPerDay };
}

const STATIC_EPHEMERIS: EventEphemerisProvider = {
  id: "synthetic",
  sourceSha256: "0".repeat(64),
  stateCoverage: {
    startJulianDateTdb: 2_415_020.5,
    endJulianDateTdb: 2_488_434.5,
    endIsIncluded: true,
  },
  state(tdbJulianDate: number): GeocentricEphemerisState {
    return {
      tdbJulianDate,
      earthBarycentric: state([0, 0, 0]),
      moonGeocentric: state([384_400, 0, 0]),
      sunGeocentric: state([AU_KM, 0, 0]),
    };
  },
};

describe("finite-distance apparent bodies", () => {
  it("iterates realistic Sun and Moon light times and angular radii", () => {
    const location = {
      latitude: 35.681,
      longitude: 139.767,
      timeZone: "Asia/Tokyo",
    };
    const sun = calculateApparentBody(
      STATIC_EPHEMERIS,
      "sun",
      2_451_545,
      2_451_545,
      location,
    );
    const moon = calculateApparentBody(
      STATIC_EPHEMERIS,
      "moon",
      2_451_545,
      2_451_545,
      location,
    );

    expect(sun.lightTimeSeconds).toBeGreaterThan(490);
    expect(sun.lightTimeSeconds).toBeLessThan(510);
    expect(moon.lightTimeSeconds).toBeGreaterThan(1.2);
    expect(moon.lightTimeSeconds).toBeLessThan(1.4);
    expect(sun.angularRadiusRadians * (180 / Math.PI)).toBeCloseTo(
      0.266,
      2,
    );
    expect(moon.angularRadiusRadians * (180 / Math.PI)).toBeCloseTo(
      0.259,
      2,
    );
  });

  it("returns normalized directions and finite horizontal coordinates", () => {
    const result = calculateApparentBody(
      STATIC_EPHEMERIS,
      "moon",
      2_451_545,
      2_451_545,
      {
        latitude: 0,
        longitude: 0,
        timeZone: "UTC",
      },
      {
        heightMeters: 2_000,
        polarMotion: { xpRadians: 1e-7, ypRadians: -2e-7 },
      },
    );

    expect(Math.hypot(...result.icrfDirection)).toBeCloseTo(1, 12);
    expect(Math.hypot(...result.cirsDirection)).toBeCloseTo(1, 12);
    expect(result.horizontal.altitude).toBeGreaterThanOrEqual(
      -Math.PI / 2,
    );
    expect(result.horizontal.altitude).toBeLessThanOrEqual(Math.PI / 2);
  });

  it("keeps retarded Sun states inside the loaded start coverage", () => {
    const stateDates: number[] = [];
    const ephemeris: EventEphemerisProvider = {
      ...STATIC_EPHEMERIS,
      stateCoverage: {
        startJulianDateTdb: 2_451_544.5,
        endJulianDateTdb: 2_451_545.5,
        endIsIncluded: true,
      },
      state(tdbJulianDate: number): GeocentricEphemerisState {
        stateDates.push(tdbJulianDate);
        return STATIC_EPHEMERIS.state(tdbJulianDate);
      },
    };
    const start = new Date(
      eventEphemerisSearchBounds(
        ephemeris,
      ).startUtcMilliseconds,
    );
    const timeScales = resolveTimeScales(start);

    calculateApparentBody(
      ephemeris,
      "sun",
      timeScales.ttJulianDate,
      timeScales.ut1JulianDate,
      {
        latitude: 0,
        longitude: 0,
        timeZone: "UTC",
      },
    );

    expect(stateDates.length).toBeGreaterThan(1);
    expect(Math.min(...stateDates)).toBeGreaterThanOrEqual(
      ephemeris.stateCoverage.startJulianDateTdb,
    );
  });

  it("computes stable small-angle separation", () => {
    expect(
      angularSeparationRadians(
        [1, 0, 0],
        [Math.cos(1e-8), Math.sin(1e-8), 0],
      ),
    ).toBeCloseTo(1e-8, 14);
  });
});
