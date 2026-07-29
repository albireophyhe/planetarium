import { describe, expect, it } from "vitest";
import fixtures from "../../../../shared/fixtures/astro-test-vectors.v1.json";
import {
  angularDistance,
  calculateStarPosition,
  degreesToRadians,
  equatorialToHorizontal,
  greenwichMeanSiderealTime,
  horizontalToProjection,
  julianDate,
  normalizeRadians,
  precessJ2000,
  radiansToDegrees,
  starByHR
} from "./index";

const GREENWICH = {
  latitude: 0,
  longitude: 0,
  timeZone: "UTC"
} as const;

describe("shared vector contract", () => {
  it("keeps version 1 units, tolerances, and angles explicit", () => {
    expect(fixtures.schemaVersion).toBe(1);
    expect(fixtures.angleUnit).toBe("degree");
    expect(fixtures.units.azimuth).toContain("north-zero");
    expect(
      Object.values(fixtures.tolerances).every(
        (tolerance) => Number.isFinite(tolerance) && tolerance > 0
      )
    ).toBe(true);

    for (const vector of fixtures.realStarPositions) {
      expect(Number.isFinite(vector.expected.altitude)).toBe(true);
      expect(vector.expected.altitude).toBeGreaterThanOrEqual(-90);
      expect(vector.expected.altitude).toBeLessThanOrEqual(90);
      expect(vector.expected.azimuth).toBeGreaterThanOrEqual(0);
      expect(vector.expected.azimuth).toBeLessThan(360);
      expect(vector.star.rightAscension).toBeGreaterThanOrEqual(0);
      expect(vector.star.rightAscension).toBeLessThan(360);
      expect(vector.star.declination).toBeGreaterThanOrEqual(-90);
      expect(vector.star.declination).toBeLessThanOrEqual(90);
    }
    for (const vector of fixtures.precessionVectors) {
      expect(vector.expected.rightAscension).toBeGreaterThanOrEqual(0);
      expect(vector.expected.rightAscension).toBeLessThan(360);
      expect(vector.expected.declination).toBeGreaterThanOrEqual(-90);
      expect(vector.expected.declination).toBeLessThanOrEqual(90);
    }
    for (const vector of fixtures.angularDistances) {
      expect(Number.isFinite(vector.expected)).toBe(true);
      expect(vector.expected).toBeGreaterThanOrEqual(0);
      expect(vector.expected).toBeLessThanOrEqual(180);
    }
  });
});

describe("Julian date and sidereal time", () => {
  it.each(fixtures.julianDates)("$id", ({ iso, expected }) => {
    expect(julianDate(new Date(iso))).toBeCloseTo(expected, 8);
  });

  it.each(fixtures.siderealTimes)(
    "$id",
    ({ julianDate: jd, expected }) => {
      expect(radiansToDegrees(greenwichMeanSiderealTime(jd))).toBeCloseTo(
        expected,
        8
      );
    }
  );
});

describe("equatorial to horizontal conversion", () => {
  it.each(fixtures.horizontalCoordinates)(
    "$id",
    ({
      declination,
      hourAngle,
      latitude,
      altitude,
      azimuth,
      azimuthDefined
    }) => {
      const date = new Date("2000-01-01T12:00:00.000Z");
      const gmst = greenwichMeanSiderealTime(date);
      const rightAscension = normalizeRadians(
        gmst - degreesToRadians(hourAngle)
      );
      const horizontal = equatorialToHorizontal(
        {
          rightAscension,
          declination: degreesToRadians(declination)
        },
        date,
        {
          ...GREENWICH,
          latitude
        }
      );

      expect(radiansToDegrees(horizontal.altitude)).toBeCloseTo(altitude, 8);
      expect(horizontal.azimuthDefined).toBe(azimuthDefined);
      if (azimuthDefined) {
        expect(radiansToDegrees(horizontal.azimuth)).toBeCloseTo(azimuth, 8);
      }
    }
  );
});

describe("azimuthal equidistant projection", () => {
  it.each(fixtures.projections)(
    "$id",
    ({ altitude, azimuth, x, y }) => {
      const point = horizontalToProjection({
        altitude: degreesToRadians(altitude),
        azimuth: degreesToRadians(azimuth),
        azimuthDefined: altitude !== 90 && altitude !== -90
      });
      expect(point.x).toBeCloseTo(x, 10);
      expect(point.y).toBeCloseTo(y, 10);
      expect(point.radius).toBeCloseTo(
        (90 - altitude) / 90,
        10
      );
    }
  );

  it("keeps small zenith distances proportional", () => {
    const oneDegree = horizontalToProjection({
      altitude: degreesToRadians(89),
      azimuth: degreesToRadians(135),
      azimuthDefined: true
    });
    expect(oneDegree.radius).toBeCloseTo(1 / 90, 12);
    expect(Math.hypot(oneDegree.x, oneDegree.y)).toBeCloseTo(
      oneDegree.radius,
      12
    );
  });

  it("maps the horizon to radius one and the nadir to radius two", () => {
    const horizon = horizontalToProjection({
      altitude: 0,
      azimuth: 12.5,
      azimuthDefined: true
    });
    const nadir = horizontalToProjection({
      altitude: -Math.PI / 2,
      azimuth: 0,
      azimuthDefined: false
    });
    expect(Math.hypot(horizon.x, horizon.y)).toBeCloseTo(1, 12);
    expect(nadir.radius).toBe(2);
    expect(Number.isFinite(nadir.x)).toBe(true);
    expect(Number.isFinite(nadir.y)).toBe(true);
  });
});

describe("precession and angular separation", () => {
  it("is the identity at J2000", () => {
    const original = {
      rightAscension: degreesToRadians(123.456),
      declination: degreesToRadians(-45.678)
    };
    const result = precessJ2000(original, 2_451_545);
    expect(result.rightAscension).toBeCloseTo(original.rightAscension, 14);
    expect(result.declination).toBeCloseTo(original.declination, 14);
  });

  it.each(fixtures.precessionVectors)(
    "$id",
    ({ rightAscension, declination, julianDate: jd, expected }) => {
      const result = precessJ2000(
        {
          rightAscension: degreesToRadians(rightAscension),
          declination: degreesToRadians(declination)
        },
        jd
      );
      const expectedCoordinates = {
        rightAscension: degreesToRadians(expected.rightAscension),
        declination: degreesToRadians(expected.declination)
      };
      const error = radiansToDegrees(
        angularDistance(result, expectedCoordinates)
      );

      expect(Number.isFinite(result.rightAscension)).toBe(true);
      expect(Number.isFinite(result.declination)).toBe(true);
      expect(result.rightAscension).toBeGreaterThanOrEqual(0);
      expect(result.rightAscension).toBeLessThan(2 * Math.PI);
      expect(error).toBeLessThanOrEqual(
        fixtures.tolerances.precessionDegrees
      );
    }
  );

  it.each(fixtures.angularDistances)(
    "$id",
    ({ coordinateSystem, first, second, expected }) => {
      const firstCoordinate =
        coordinateSystem === "horizontal"
          ? {
              altitude: degreesToRadians(first.latitude),
              azimuth: degreesToRadians(first.longitude),
              azimuthDefined: first.latitude !== 90 && first.latitude !== -90
            }
          : {
              rightAscension: degreesToRadians(first.longitude),
              declination: degreesToRadians(first.latitude)
            };
      const secondCoordinate =
        coordinateSystem === "horizontal"
          ? {
              altitude: degreesToRadians(second.latitude),
              azimuth: degreesToRadians(second.longitude),
              azimuthDefined:
                second.latitude !== 90 && second.latitude !== -90
            }
          : {
              rightAscension: degreesToRadians(second.longitude),
              declination: degreesToRadians(second.latitude)
            };
      const separation = radiansToDegrees(
        angularDistance(firstCoordinate, secondCoordinate)
      );
      expect(Number.isFinite(separation)).toBe(true);
      expect(Math.abs(separation - expected)).toBeLessThanOrEqual(
        fixtures.tolerances.angularDistanceDegrees
      );
    }
  );
});

describe("real-star regression positions", () => {
  it("covers the documented sites, stars, wrap, and near-zenith cases", () => {
    const siteIds = fixtures.realStarPositions.map(
      ({ location }) => location.id
    );
    const starNames = fixtures.realStarPositions.map(
      ({ star }) => star.name
    );
    expect(siteIds).toEqual(
      expect.arrayContaining([
        "tokyo",
        "greenwich",
        "sydney",
        "equator",
        "tromso"
      ])
    );
    expect(starNames).toEqual(
      expect.arrayContaining(["Polaris", "Sirius", "Vega", "Arcturus"])
    );
    expect(
      fixtures.precessionVectors.some(({ id }) => id.includes("ra-wrap"))
    ).toBe(true);
    expect(
      fixtures.realStarPositions.some(
        ({ expected }) => expected.altitude > 85
      )
    ).toBe(true);
  });

  it.each(fixtures.realStarPositions)(
    "$id",
    ({ star: referenceStar, iso, location, expected }) => {
      const star = starByHR.get(referenceStar.hr);
      expect(star).toBeDefined();
      if (star === undefined) {
        throw new Error(`Missing HR ${referenceStar.hr}`);
      }

      expect(radiansToDegrees(star.raRad)).toBeCloseTo(
        referenceStar.rightAscension,
        8
      );
      expect(radiansToDegrees(star.decRad)).toBeCloseTo(
        referenceStar.declination,
        8
      );

      const position = calculateStarPosition(star, new Date(iso), location);
      const expectedHorizontal = {
        altitude: degreesToRadians(expected.altitude),
        azimuth: degreesToRadians(expected.azimuth),
        azimuthDefined: expected.azimuthDefined
      };
      const error = radiansToDegrees(
        angularDistance(position.horizontal, expectedHorizontal)
      );

      expect(position.horizontal.azimuthDefined).toBe(
        expected.azimuthDefined
      );
      expect(Number.isFinite(position.horizontal.altitude)).toBe(true);
      expect(position.horizontal.altitude).toBeGreaterThanOrEqual(
        -Math.PI / 2
      );
      expect(position.horizontal.altitude).toBeLessThanOrEqual(Math.PI / 2);
      expect(position.horizontal.azimuth).toBeGreaterThanOrEqual(0);
      expect(position.horizontal.azimuth).toBeLessThan(2 * Math.PI);
      expect(Number.isFinite(position.projection.x)).toBe(true);
      expect(Number.isFinite(position.projection.y)).toBe(true);
      expect(error).toBeLessThanOrEqual(
        fixtures.tolerances.realStarDegrees
      );
    }
  );
});
