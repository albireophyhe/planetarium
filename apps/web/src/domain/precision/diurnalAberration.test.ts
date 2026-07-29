import { describe, expect, it } from "vitest";
import fixtures from "../../../../../shared/fixtures/sofa-diurnal-aberration.v1.json";
import {
  applyDiurnalAberrationToHorizontalEnu,
  applyTopocentricParallaxToItrsDirection,
  diurnalAberrationMagnitude,
  type HorizontalEnuVector,
  wgs84ObserverPositionItrsAu,
} from "./diurnalAberration";

const ARCSECONDS_PER_RADIAN = (180 * 3_600) / Math.PI;
const AU_METERS = 149_597_870_700;

type OracleCase = {
  readonly id: string;
  readonly latitudeDegrees: number;
  readonly heightMeters: number;
  readonly diurnalAberrationMagnitude: number;
  readonly geometricHorizontalEnu: readonly number[];
  readonly expectedHorizontalEnu: readonly number[];
  readonly separationArcseconds: number;
};

function enu(values: readonly number[]): HorizontalEnuVector {
  if (values.length !== 3) {
    throw new Error("Oracle ENU vector must have three components");
  }
  return [values[0], values[1], values[2]];
}

function vectorSeparation(
  left: HorizontalEnuVector,
  right: HorizontalEnuVector,
): number {
  const cross: HorizontalEnuVector = [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
  return Math.atan2(
    Math.hypot(...cross),
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2],
  );
}

describe("diurnal aberration SOFA C oracle", () => {
  it.each(fixtures.cases as readonly OracleCase[])(
    "matches unmodified apio/atioq for $id",
    (fixture) => {
      const magnitude = diurnalAberrationMagnitude(
        (fixture.latitudeDegrees * Math.PI) / 180,
        fixture.heightMeters,
      );
      expect(
        Math.abs(magnitude - fixture.diurnalAberrationMagnitude),
      ).toBeLessThanOrEqual(3e-21);

      const geometric = enu(fixture.geometricHorizontalEnu);
      const expected = enu(fixture.expectedHorizontalEnu);
      const actual = applyDiurnalAberrationToHorizontalEnu(
        geometric,
        magnitude,
      );
      actual.forEach((component, index) => {
        expect(Math.abs(component - expected[index])).toBeLessThanOrEqual(
          3e-15,
        );
      });
      const separationArcseconds =
        vectorSeparation(geometric, actual) * ARCSECONDS_PER_RADIAN;
      expect(
        Math.abs(separationArcseconds - fixture.separationArcseconds),
      ).toBeLessThanOrEqual(5e-11);
    },
  );

  it("uses an east-positive ENU correction and leaves an aligned ray unchanged", () => {
    const magnitude = diurnalAberrationMagnitude(0);
    const meridian = applyDiurnalAberrationToHorizontalEnu(
      [0, 0, 1],
      magnitude,
    );
    expect(meridian[0]).toBeGreaterThan(0);
    expect(meridian[1]).toBe(0);
    expect(meridian[2]).toBeLessThan(1);

    expect(applyDiurnalAberrationToHorizontalEnu([1, 0, 0], magnitude)).toEqual(
      [1, 0, 0],
    );
  });

  it("uses geodetic WGS84 radius and the supplied ellipsoid height", () => {
    const equator = diurnalAberrationMagnitude(0);
    const tokyo = diurnalAberrationMagnitude((35.6812 * Math.PI) / 180);
    const highLatitude = diurnalAberrationMagnitude((75 * Math.PI) / 180);
    const pole = diurnalAberrationMagnitude(Math.PI / 2);
    const tokyoAtOneKilometer = diurnalAberrationMagnitude(
      (35.6812 * Math.PI) / 180,
      1_000,
    );

    expect(Math.asin(equator) * ARCSECONDS_PER_RADIAN).toBeCloseTo(
      0.32000133603027886,
      14,
    );
    expect(tokyo).toBeGreaterThan(highLatitude);
    expect(highLatitude).toBeGreaterThan(pole);
    expect(tokyoAtOneKilometer).toBeGreaterThan(tokyo);
  });

  it("forms WGS84 ITRS site vectors with east-positive longitude", () => {
    const equatorGreenwich = wgs84ObserverPositionItrsAu(0, 0);
    const equatorEast90 = wgs84ObserverPositionItrsAu(0, Math.PI / 2);
    const northPole = wgs84ObserverPositionItrsAu(Math.PI / 2, 0, 4_205);

    expect(equatorGreenwich[0] * AU_METERS).toBeCloseTo(6_378_137, 7);
    expect(equatorGreenwich[1]).toBe(0);
    expect(equatorGreenwich[2]).toBe(0);
    expect(equatorEast90[0] * AU_METERS).toBeCloseTo(0, 7);
    expect(equatorEast90[1] * AU_METERS).toBeCloseTo(6_378_137, 7);
    expect(northPole[0] * AU_METERS).toBeCloseTo(0, 7);
    expect(northPole[1]).toBe(0);
    expect(northPole[2] * AU_METERS).toBeCloseTo(6_356_752.314_245 + 4_205, 6);
  });

  it("lowers a geocentric horizon ray by the solar horizontal parallax", () => {
    const observer = wgs84ObserverPositionItrsAu(0, 0);
    const topocentric = applyTopocentricParallaxToItrsDirection(
      [0, 1, 0],
      1,
      observer,
    );
    const separationArcseconds =
      vectorSeparation([0, 1, 0], topocentric) * ARCSECONDS_PER_RADIAN;

    expect(topocentric[0]).toBeLessThan(0);
    expect(topocentric[1]).toBeGreaterThan(0);
    expect(topocentric[2]).toBe(0);
    expect(separationArcseconds).toBeCloseTo(8.794_143_831, 8);
  });

  it("accepts both geodetic poles and a modest negative ellipsoid height", () => {
    const northPole = diurnalAberrationMagnitude(Math.PI / 2);
    const southPole = diurnalAberrationMagnitude(-Math.PI / 2);
    const equatorAtZeroHeight = diurnalAberrationMagnitude(0);
    const equatorBelowEllipsoid = diurnalAberrationMagnitude(0, -430);

    expect(Number.isFinite(northPole)).toBe(true);
    expect(Number.isFinite(southPole)).toBe(true);
    expect(northPole).toBe(southPole);
    expect(northPole).toBeLessThan(1e-20);
    expect(equatorBelowEllipsoid).toBeGreaterThan(0);
    expect(equatorBelowEllipsoid).toBeLessThan(equatorAtZeroHeight);
  });

  it("rejects invalid latitude, height, vector and magnitude inputs", () => {
    expect(() => diurnalAberrationMagnitude(Number.NaN)).toThrow(/latitude/i);
    expect(() => diurnalAberrationMagnitude(Math.PI)).toThrow(/latitude/i);
    expect(() =>
      diurnalAberrationMagnitude(0, Number.POSITIVE_INFINITY),
    ).toThrow(/height/i);
    expect(() => diurnalAberrationMagnitude(0, -7_000_000)).toThrow(/height/i);
    expect(() => diurnalAberrationMagnitude(0, 1e20)).toThrow(/magnitude/i);
    expect(() => wgs84ObserverPositionItrsAu(0, Math.PI * 2)).toThrow(
      /longitude/i,
    );
    expect(() =>
      applyTopocentricParallaxToItrsDirection([0, 1, 0], 0, [0, 0, 0]),
    ).toThrow(/distance/i);
    expect(() =>
      applyTopocentricParallaxToItrsDirection([0, 1, 0], 1, [Number.NaN, 0, 0]),
    ).toThrow(/position/i);
    expect(() => applyDiurnalAberrationToHorizontalEnu([0, 0, 0], 0)).toThrow(
      /vector/i,
    );
    expect(() =>
      applyDiurnalAberrationToHorizontalEnu([Number.NaN, 0, 1], 0),
    ).toThrow(/vector/i);
    expect(() =>
      applyDiurnalAberrationToHorizontalEnu(
        [0, Number.POSITIVE_INFINITY, 1],
        0,
      ),
    ).toThrow(/vector/i);
    expect(() =>
      applyDiurnalAberrationToHorizontalEnu([0, 0, 1], Number.NaN),
    ).toThrow(/magnitude/i);
    expect(() => applyDiurnalAberrationToHorizontalEnu([0, 0, 1], -1)).toThrow(
      /magnitude/i,
    );
  });
});
