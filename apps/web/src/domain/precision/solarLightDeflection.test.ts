import { describe, expect, it } from "vitest";
import fixtures from "../../../../../shared/fixtures/sofa-solar-light-deflection.v1.json";
import {
  applyAnnualAberration,
  applyAnnualParallax,
  applySolarLightDeflection,
  calculateApparentStarPositionWithContextV2,
  createApparentPositionContextV2,
  prepareSolarLightDeflection,
  propagateSpaceMotion,
  resolveTimeScales
} from "./index";
import {
  magnitude,
  multiplyMatrixVector,
  normalizeVector,
  vectorToEquatorial
} from "./vector";
import type { Vector3 } from "./vector";

function vector3(values: readonly number[]): Vector3 {
  if (values.length !== 3) {
    throw new Error(
      `Expected 3 vector components, received ${values.length}`
    );
  }
  return [values[0], values[1], values[2]];
}

function wrappedAngleDifference(
  left: number,
  right: number
): number {
  return (
    ((left - right + Math.PI) % (2 * Math.PI) +
      2 * Math.PI) %
      (2 * Math.PI) -
    Math.PI
  );
}

function sphericalSeparation(
  rightAscensionA: number,
  declinationA: number,
  rightAscensionB: number,
  declinationB: number
): number {
  const halfDeclinationDifference =
    (declinationA - declinationB) / 2;
  const halfRightAscensionDifference =
    wrappedAngleDifference(rightAscensionA, rightAscensionB) / 2;
  const haversine =
    Math.sin(halfDeclinationDifference) ** 2 +
    Math.cos(declinationA) *
      Math.cos(declinationB) *
      Math.sin(halfRightAscensionDifference) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

describe("SOFA-derived solar gravitational light deflection", () => {
  it.each(fixtures.cases)(
    "matches the independent unmodified SOFA ldsun oracle: $id",
    (fixture) => {
      const expectedRaw = vector3(
        fixture.expectedDeflectedDirection
      );
      const expectedMagnitude = magnitude(expectedRaw);
      const expected: Vector3 = [
        expectedRaw[0] / expectedMagnitude,
        expectedRaw[1] / expectedMagnitude,
        expectedRaw[2] / expectedMagnitude
      ];
      const actual = applySolarLightDeflection(
        vector3(fixture.naturalDirection),
        vector3(fixture.sunToObserverUnitDirection),
        fixture.sunObserverDistanceAu
      );

      actual.forEach((component, index) => {
        expect(
          Math.abs(component - expected[index])
        ).toBeLessThanOrEqual(5e-15);
      });
      expect(Math.abs(magnitude(actual) - 1)).toBeLessThanOrEqual(
        3e-16
      );
      actual.forEach((component) =>
        expect(Number.isFinite(component)).toBe(true)
      );
    }
  );

  it("uses the official distance-scaled near-Sun limiter", () => {
    const oneAu = prepareSolarLightDeflection(
      [1, 0, 0],
      1,
      "caller-sun-observer-geometry"
    );
    const tenAu = prepareSolarLightDeflection(
      [1, 0, 0],
      10,
      "caller-sun-observer-geometry"
    );

    expect(oneAu.deflectionLimiter).toBe(1e-6);
    expect(tenAu.deflectionLimiter).toBe(1e-8);
    expect(
      applySolarLightDeflection([-1, 0, 0], [1, 0, 0], 1)
    ).toEqual([-1, 0, 0]);
  });

  it("rejects non-finite, non-unit, and invalid-distance geometry", () => {
    expect(() =>
      applySolarLightDeflection(
        [Number.NaN, 0, 1],
        [1, 0, 0],
        1
      )
    ).toThrow(/finite/);
    expect(() =>
      applySolarLightDeflection([2, 0, 0], [1, 0, 0], 1)
    ).toThrow(/unit vector/);
    expect(() =>
      applySolarLightDeflection([1, 0, 0], [0, 0, 0], 1)
    ).toThrow(/unit vector/);
    expect(() =>
      applySolarLightDeflection([1, 0, 0], [1, 0, 0], 0)
    ).toThrow(/positive/);
    expect(() =>
      applySolarLightDeflection(
        [1, 0, 0],
        [1, 0, 0],
        Number.MIN_VALUE
      )
    ).toThrow(/numeric range/);
    expect(() =>
      applySolarLightDeflection(
        [1, 0, 0],
        [1, 0, 0],
        Number.MAX_VALUE
      )
    ).toThrow(/numeric range/);
  });
});

describe("solar light deflection in the precision-v2 pipeline", () => {
  const location = {
    latitude: 35.6812,
    longitude: 139.7671,
    timeZone: "Asia/Tokyo"
  } as const;

  it("applies parallax, solar deflection, aberration, then precession-nutation", () => {
    const date = new Date("2026-07-29T12:00:00.000Z");
    const star = {
      bvColor: null,
      catalogName: "Solar-deflection order fixture",
      decRad: -0.3,
      hd: null,
      hr: 99_101,
      parallaxArcsec: 10,
      pmDecArcsecPerYear: -0.2,
      pmRaCosDecArcsecPerYear: 0.4,
      raRad: 1.2,
      radialVelocityKmPerSecond: null,
      spectralType: null,
      vMagnitude: 1
    } as const;
    const observerPositionAu: Vector3 = [0.25, -0.8, 0.45];
    const observerBarycentricVelocityC: Vector3 = [
      7e-5,
      -3e-5,
      2e-5
    ];
    const timeScales = resolveTimeScales(date, {
      dut1Seconds: 0
    });
    const propagated = propagateSpaceMotion(
      star,
      timeScales.ttJulianDate
    );
    if (propagated.astrometricPositionAu === null) {
      throw new Error("Positive parallax did not preserve distance");
    }
    const natural = applyAnnualParallax(
      propagated.astrometricPositionAu,
      observerPositionAu
    );
    const tangent = normalizeVector([
      -natural[1],
      natural[0],
      0
    ]);
    const separation = 0.01;
    const cosine = Math.cos(separation);
    const sine = Math.sin(separation);
    const sunToObserver = normalizeVector([
      -cosine * natural[0] - sine * tangent[0],
      -cosine * natural[1] - sine * tangent[1],
      -cosine * natural[2] - sine * tangent[2]
    ]);
    const context = createApparentPositionContextV2(
      date,
      location,
      {
        earthOrientation: { dut1Seconds: 0 },
        annualParallax: { observerPositionAu },
        solarLightDeflection: {
          sunToObserverUnitDirection: sunToObserver,
          sunObserverDistanceAu: 1
        },
        aberration: {
          observerBarycentricVelocityC,
          sunObserverDistanceAu: 1
        },
        diurnalAberration: false,
        refraction: false
      }
    );
    const deflected = applySolarLightDeflection(
      natural,
      sunToObserver,
      1
    );
    const proper = applyAnnualAberration(
      deflected,
      observerBarycentricVelocityC,
      1
    );
    const expected = vectorToEquatorial(
      multiplyMatrixVector(
        context.precessionNutationMatrix,
        proper
      )
    );
    const wrongOrder = vectorToEquatorial(
      multiplyMatrixVector(
        context.precessionNutationMatrix,
        applySolarLightDeflection(
          applyAnnualAberration(
            natural,
            observerBarycentricVelocityC,
            1
          ),
          sunToObserver,
          1
        )
      )
    );
    const result =
      calculateApparentStarPositionWithContextV2(star, context);

    expect(
      sphericalSeparation(
        result.apparentEquatorial.rightAscension,
        result.apparentEquatorial.declination,
        expected.rightAscension,
        expected.declination
      )
    ).toBeLessThanOrEqual(3e-15);
    expect(
      sphericalSeparation(
        result.apparentEquatorial.rightAscension,
        result.apparentEquatorial.declination,
        wrongOrder.rightAscension,
        wrongOrder.declination
      )
    ).toBeGreaterThan(1e-13);
    expect(result.solarLightDeflectionMode).toBe(
      "caller-sun-observer-geometry"
    );
    expect(result.metadata.solarLightDeflectionMode).toBe(
      "caller-sun-observer-geometry"
    );
    expect(result.metadata.omittedCorrections).not.toContain(
      "solar-light-deflection"
    );
    expect(result.metadata.omittedCorrections).toContain(
      "planetary-light-deflection"
    );
  });

  it("reports approximate defaults and explicit disablement without sharing state", () => {
    const date = new Date("2026-07-29T12:00:00.000Z");
    const defaultContext = createApparentPositionContextV2(
      date,
      location
    );
    const disabledContext = createApparentPositionContextV2(
      date,
      location,
      {
        annualParallax: false,
        solarLightDeflection: false,
        aberration: false,
        diurnalAberration: false,
        refraction: false
      }
    );
    const star = {
      bvColor: null,
      catalogName: "Disable-mode fixture",
      decRad: 0.2,
      hd: null,
      hr: 99_102,
      parallaxArcsec: null,
      pmDecArcsecPerYear: null,
      pmRaCosDecArcsecPerYear: null,
      raRad: 2.1,
      radialVelocityKmPerSecond: null,
      spectralType: null,
      vMagnitude: 1
    } as const;
    const defaultResult =
      calculateApparentStarPositionWithContextV2(
        star,
        defaultContext
      );
    const disabledResult =
      calculateApparentStarPositionWithContextV2(
        star,
        disabledContext
      );

    expect(defaultContext.solarLightDeflection.mode).toBe(
      "truncated-vsop2000-heliocentric-earth"
    );
    expect(Object.isFrozen(defaultContext.solarLightDeflection)).toBe(
      true
    );
    if (defaultContext.solarLightDeflection.mode === "disabled") {
      throw new Error("Default solar deflection was disabled");
    }
    expect(
      Object.isFrozen(
        defaultContext.solarLightDeflection
          .sunToObserverUnitDirection
      )
    ).toBe(true);
    expect(defaultContext.baseWarnings).toContain(
      "solar-light-deflection-approximate-ephemeris"
    );
    expect(defaultResult.metadata.solarLightDeflectionMode).toBe(
      "truncated-vsop2000-heliocentric-earth"
    );
    expect(defaultResult.metadata.omittedCorrections).not.toContain(
      "solar-light-deflection"
    );
    expect(defaultResult.metadata.omittedCorrections).toContain(
      "planetary-light-deflection"
    );
    expect(disabledContext.solarLightDeflection.mode).toBe(
      "disabled"
    );
    expect(disabledContext.baseWarnings).toContain(
      "solar-light-deflection-disabled"
    );
    expect(disabledResult.solarLightDeflectionMode).toBe(
      "disabled"
    );
    expect(disabledResult.metadata.omittedCorrections).toContain(
      "solar-light-deflection"
    );
  });

  it("retains the precision model date guards on the default path", () => {
    expect(() =>
      createApparentPositionContextV2(
        new Date(Number.NaN),
        location
      )
    ).toThrow();
    expect(() =>
      createApparentPositionContextV2(
        new Date("2101-01-01T00:00:00.000Z"),
        location
      )
    ).toThrow(/1900|2100|range|supported/i);
  });
});
