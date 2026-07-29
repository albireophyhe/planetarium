import { describe, expect, it } from "vitest";
import fixtures from "../../../../../shared/fixtures/sofa-solar-position.v1.json";
import {
  calculateApparentSunPositionWithContextV2,
  createApparentPositionContextV2,
  truncatedEarthHeliocentricPosition,
  truncatedEarthHeliocentricState,
} from "./index";
import type { HorizontalCoordinates } from "../types";
import type { Vector3 } from "./vector";

const ARCSECONDS_PER_RADIAN = 206_264.806_247_096_36;
const ARCSECONDS_TO_RADIANS = 1 / ARCSECONDS_PER_RADIAN;
const FULL_SOFA_RESIDUAL_LIMIT_ARCSECONDS = 5;
const EPHEMERIS_DIRECTION_LIMIT_ARCSECONDS = 3;
const EPHEMERIS_DISTANCE_LIMIT_AU = 0.000_01;

function horizontalToEnu(
  coordinates: HorizontalCoordinates,
): Vector3 {
  const horizontalLength = Math.cos(coordinates.altitude);
  return [
    horizontalLength * Math.sin(coordinates.azimuth),
    horizontalLength * Math.cos(coordinates.azimuth),
    Math.sin(coordinates.altitude),
  ];
}

function equatorialToVector(
  rightAscension: number,
  declination: number,
): Vector3 {
  const radial = Math.cos(declination);
  return [
    radial * Math.cos(rightAscension),
    radial * Math.sin(rightAscension),
    Math.sin(declination),
  ];
}

function vector3(values: readonly number[]): Vector3 {
  if (values.length !== 3) {
    throw new Error(`Expected three components, received ${values.length}`);
  }
  return [values[0], values[1], values[2]];
}

function angularSeparation(left: Vector3, right: Vector3): number {
  const cross: Vector3 = [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
  const crossMagnitude = Math.hypot(...cross);
  const dot =
    left[0] * right[0] +
    left[1] * right[1] +
    left[2] * right[2];
  return Math.atan2(crossMagnitude, Math.max(-1, Math.min(1, dot)));
}

describe("precision-v2 apparent solar position", () => {
  it("declares a WGS84 topocentric horizontal oracle", () => {
    expect(fixtures.assumptions.horizontalOrigin).toBe(
      "WGS84 topocenter"
    );
  });

  it.each(fixtures.cases)(
    "stays close to the independent full-SOFA oracle: $id",
    (fixture) => {
      const context = createApparentPositionContextV2(
        new Date(fixture.observedAtIso),
        {
          latitude: fixture.location.latitudeDegrees,
          longitude: fixture.location.longitudeDegrees,
          timeZone: "UTC",
        },
        {
          diurnalAberration: {
            heightMeters: fixture.location.heightMeters,
          },
          earthOrientation: {
            dut1Seconds: fixture.earthOrientation.dut1Seconds,
            dut1Source: "caller",
            polarMotion: {
              source: "caller",
              xpRadians:
                fixture.earthOrientation.xpArcseconds *
                ARCSECONDS_TO_RADIANS,
              ypRadians:
                fixture.earthOrientation.ypArcseconds *
                ARCSECONDS_TO_RADIANS,
            },
          },
          refraction: false,
        },
      );
      const actual =
        calculateApparentSunPositionWithContextV2(context);
      const actualEarthPosition =
        truncatedEarthHeliocentricPosition(
          context.timeScales.ttJulianDate,
        );
      const expectedEarthPosition = vector3(
        fixture.expectedHeliocentricEarthPositionAu,
      );
      const expectedEquatorial =
        fixture.expectedApparentEquatorialRadians;
      const equatorialResidualArcseconds =
        angularSeparation(
          equatorialToVector(
            actual.apparentEquatorial.rightAscension,
            actual.apparentEquatorial.declination,
          ),
          equatorialToVector(
            expectedEquatorial[0],
            expectedEquatorial[1],
          ),
        ) * ARCSECONDS_PER_RADIAN;
      const horizontalResidualArcseconds =
        angularSeparation(
          horizontalToEnu(actual.geometricHorizontal),
          vector3(fixture.expectedHorizontalEnu),
        ) * ARCSECONDS_PER_RADIAN;
      const ephemerisDirectionResidualArcseconds =
        angularSeparation(
          vector3(
            actualEarthPosition.map(
              (component) =>
                component / Math.hypot(...actualEarthPosition),
            ),
          ),
          vector3(
            expectedEarthPosition.map(
              (component) =>
                component / Math.hypot(...expectedEarthPosition),
            ),
          ),
        ) * ARCSECONDS_PER_RADIAN;
      const ephemerisDistanceResidualAu = Math.abs(
        Math.hypot(...actualEarthPosition) -
          Math.hypot(...expectedEarthPosition),
      );

      expect(equatorialResidualArcseconds).toBeLessThan(
        FULL_SOFA_RESIDUAL_LIMIT_ARCSECONDS,
      );
      expect(horizontalResidualArcseconds).toBeLessThan(
        FULL_SOFA_RESIDUAL_LIMIT_ARCSECONDS,
      );
      expect(ephemerisDirectionResidualArcseconds).toBeLessThan(
        EPHEMERIS_DIRECTION_LIMIT_ARCSECONDS,
      );
      expect(ephemerisDistanceResidualAu).toBeLessThan(
        EPHEMERIS_DISTANCE_LIMIT_AU,
      );
      expect(actual.ephemerisMode).toBe(
        "truncated-vsop2000-heliocentric-earth",
      );
      expect(actual.aberrationMode).toBe(
        "truncated-vsop2000-heliocentric-earth",
      );
      expect(actual.diurnalAberrationMode).toBe("wgs84-observer");
      expect(actual.polarMotionMode).toBe("caller");
    },
  );

  it("keeps optical refraction out of the geometric twilight altitude", () => {
    const date = new Date("2026-07-29T12:00:00Z");
    const location = {
      latitude: 35.6812,
      longitude: 139.7671,
      timeZone: "Asia/Tokyo",
    };
    const geometric =
      calculateApparentSunPositionWithContextV2(
        createApparentPositionContextV2(date, location, {
          refraction: false,
        }),
      );
    const refractedContext =
      calculateApparentSunPositionWithContextV2(
        createApparentPositionContextV2(date, location, {
          refraction: {
            minimumGeometricAltitudeDegrees: 5,
            pressureHpa: 1_013.25,
            relativeHumidity: 0.5,
            temperatureCelsius: 10,
            wavelengthMicrometers: 0.55,
          },
        }),
      );

    expect(refractedContext.geometricHorizontal).toEqual(
      geometric.geometricHorizontal,
    );
  });

  it("keeps apparent equatorial geocentric while site height changes the topocentric horizon", () => {
    const date = new Date("2026-07-29T16:00:00Z");
    const location = {
      latitude: 19.8206,
      longitude: -155.4681,
      timeZone: "Pacific/Honolulu"
    };
    const seaLevel = calculateApparentSunPositionWithContextV2(
      createApparentPositionContextV2(date, location, {
        diurnalAberration: { heightMeters: 0 }
      })
    );
    const summit = calculateApparentSunPositionWithContextV2(
      createApparentPositionContextV2(date, location, {
        diurnalAberration: { heightMeters: 4_205 }
      })
    );

    expect(summit.apparentEquatorial).toEqual(
      seaLevel.apparentEquatorial
    );
    expect(summit.geometricHorizontal).not.toEqual(
      seaLevel.geometricHorizontal
    );
  });

  it.each([
    "1900-01-01T00:00:00Z",
    "2026-07-29T12:00:00Z",
    "2100-12-31T00:00:00Z",
  ])("matches its analytic velocity to a centered derivative at %s", (iso) => {
    const context = createApparentPositionContextV2(
      new Date(iso),
      { latitude: 0, longitude: 0, timeZone: "UTC" },
      { aberration: false, diurnalAberration: false },
    );
    const ttJulianDate = context.timeScales.ttJulianDate;
    const halfStepDays = 0.001;
    const before = truncatedEarthHeliocentricPosition(
      ttJulianDate - halfStepDays,
    );
    const after = truncatedEarthHeliocentricPosition(
      ttJulianDate + halfStepDays,
    );
    const state = truncatedEarthHeliocentricState(ttJulianDate);

    state.velocityAuPerDay.forEach((component, index) => {
      expect(component).toBeCloseTo(
        (after[index] - before[index]) / (2 * halfStepDays),
        8,
      );
    });
  });

  it("rejects a non-finite ephemeris epoch", () => {
    expect(() =>
      truncatedEarthHeliocentricState(Number.NaN),
    ).toThrow("TT Julian date must be finite");
  });
});
