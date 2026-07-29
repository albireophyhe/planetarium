import { describe, expect, it } from "vitest";
import fixtures from "../../../../shared/fixtures/astro-test-vectors.v1.json";
import {
  angularDistance,
  degreesToRadians,
  radiansToDegrees,
  sunEquatorial,
  sunHorizontal,
  twilightPhase
} from "./index";

describe("solar approximation", () => {
  it("places the Sun near the equator at the March equinox", () => {
    const sun = sunEquatorial(new Date("2024-03-20T03:06:00.000Z"));
    expect(Math.abs(radiansToDegrees(sun.declination))).toBeLessThan(0.2);
  });

  it("distinguishes Tokyo local noon and midnight near an equinox", () => {
    const location = {
      latitude: 35.6812,
      longitude: 139.7671,
      timeZone: "Asia/Tokyo"
    };
    const noon = sunHorizontal(
      new Date("2024-03-20T03:00:00.000Z"),
      location
    );
    const midnight = sunHorizontal(
      new Date("2024-03-20T15:00:00.000Z"),
      location
    );

    expect(noon.altitude).toBeGreaterThan(0);
    expect(midnight.altitude).toBeLessThan(degreesToRadians(-18));
  });

  it("stays finite and normalized at both supported date limits", () => {
    for (const date of [
      new Date("1900-01-01T00:00:00.000Z"),
      new Date("2100-12-31T23:59:59.999Z")
    ]) {
      const sun = sunEquatorial(date);
      expect(Number.isFinite(sun.rightAscension)).toBe(true);
      expect(Number.isFinite(sun.declination)).toBe(true);
      expect(sun.rightAscension).toBeGreaterThanOrEqual(0);
      expect(sun.rightAscension).toBeLessThan(2 * Math.PI);
      expect(sun.declination).toBeGreaterThanOrEqual(-Math.PI / 2);
      expect(sun.declination).toBeLessThanOrEqual(Math.PI / 2);
    }
  });

  it("rejects non-finite Julian dates instead of returning NaN", () => {
    for (const value of [
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY
    ]) {
      expect(() => sunEquatorial(value)).toThrow(
        /Solar Julian date must be finite/
      );
    }
  });

  it.each(fixtures.solarPositions)(
    "$id",
    ({ iso, location, expected }) => {
      const date = new Date(iso);
      const equatorial = sunEquatorial(date);
      const horizontal = sunHorizontal(date, location);
      const equatorialError = radiansToDegrees(
        angularDistance(equatorial, {
          rightAscension: degreesToRadians(expected.rightAscension),
          declination: degreesToRadians(expected.declination)
        })
      );
      const horizontalError = radiansToDegrees(
        angularDistance(horizontal, {
          altitude: degreesToRadians(expected.altitude),
          azimuth: degreesToRadians(expected.azimuth),
          azimuthDefined: true
        })
      );

      expect(Number.isFinite(equatorial.rightAscension)).toBe(true);
      expect(Number.isFinite(equatorial.declination)).toBe(true);
      expect(equatorial.rightAscension).toBeGreaterThanOrEqual(0);
      expect(equatorial.rightAscension).toBeLessThan(2 * Math.PI);
      expect(Number.isFinite(horizontal.altitude)).toBe(true);
      expect(horizontal.azimuth).toBeGreaterThanOrEqual(0);
      expect(horizontal.azimuth).toBeLessThan(2 * Math.PI);
      expect(expected.rightAscension).toBeGreaterThanOrEqual(0);
      expect(expected.rightAscension).toBeLessThan(360);
      expect(expected.declination).toBeGreaterThanOrEqual(-90);
      expect(expected.declination).toBeLessThanOrEqual(90);
      expect(expected.altitude).toBeGreaterThanOrEqual(-90);
      expect(expected.altitude).toBeLessThanOrEqual(90);
      expect(expected.azimuth).toBeGreaterThanOrEqual(0);
      expect(expected.azimuth).toBeLessThan(360);
      expect(equatorialError).toBeLessThanOrEqual(
        fixtures.tolerances.solarDegrees
      );
      expect(horizontalError).toBeLessThanOrEqual(
        fixtures.tolerances.solarDegrees
      );
      expect(twilightPhase(horizontal)).toBe(expected.phase);
    }
  );
});

describe("twilight classification", () => {
  it.each(fixtures.twilightPhases)(
    "$altitude° is $expected",
    ({ altitude, expected }) => {
    expect(twilightPhase(degreesToRadians(altitude))).toBe(expected);
    }
  );

  it("rejects non-finite and physically invalid solar altitudes", () => {
    for (const altitude of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY
    ]) {
      expect(() => twilightPhase(altitude)).toThrow(
        /Solar altitude must be finite/
      );
    }
    expect(() => twilightPhase(Math.PI / 2 + Number.EPSILON * 2)).toThrow(
      /between -π\/2 and π\/2/
    );
    expect(() => twilightPhase(-Math.PI / 2 - Number.EPSILON * 2)).toThrow(
      /between -π\/2 and π\/2/
    );
  });
});
