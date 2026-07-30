import { describe, expect, it } from "vitest";
import fixtures from "../../../../../shared/fixtures/astro-test-vectors.v2.json";
import refractionGuardrails from "../../../../../shared/fixtures/refraction-guardrails.v1.json";
import { precisionStarByHR } from "../precisionData";
import { SPEED_OF_LIGHT_KILOMETERS_PER_SECOND } from "./constants";
import {
  applyAnnualParallax,
  applyAnnualAberration,
  applyDiurnalAberrationToHorizontalEnu,
  applyVisualRefraction,
  calculateApparentStarPositionV2,
  calculateApparentStarPositionWithContextV2,
  calculateApparentStarPositionsWithContextV2,
  calculateLightweightApparentStarPositionWithContextV2,
  calculateLightweightApparentStarPositionsWithContextV2,
  createApparentPositionContextV2,
  diurnalAberrationMagnitude,
  earthRotationAngle,
  FK5_TO_HIPPARCOS_MATRIX,
  FK5_TO_HIPPARCOS_SPIN,
  fukushimaWilliams2006,
  greenwichApparentSiderealTime2006B,
  greenwichMeanSiderealTime2006,
  nutation2000B,
  approximateEarthState,
  propagateSpaceMotion,
  refractionCoefficients,
  resolveTimeScales
} from "./index";
import type {
  ApparentStarPositionV2,
  EarthOrientationOptions,
  LightweightApparentStarPositionV2
} from "./types";
import {
  magnitude,
  multiplyMatrixVector,
  vectorToEquatorial
} from "./vector";
import type { Vector3 } from "./vector";

function expectWithin(
  actual: number,
  expected: number,
  tolerance: number
): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function wrappedAngleDifference(left: number, right: number): number {
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

function vector3(values: readonly number[]): Vector3 {
  if (values.length !== 3) {
    throw new Error(`Expected 3 vector components, received ${values.length}`);
  }
  return [values[0], values[1], values[2]];
}

function expectLightweightMatchesFull(
  lightweight: LightweightApparentStarPositionV2,
  full: ApparentStarPositionV2
): void {
  expect(lightweight).toEqual({
    starHR: full.starHR,
    apparentEquatorial: full.apparentEquatorial,
    geometricHorizontal: full.geometricHorizontal,
    observedHorizontal: full.observedHorizontal,
    projection: full.projection,
    spaceMotionMode: full.spaceMotionMode,
    radialVelocityAssumedZero:
      full.radialVelocityAssumedZero,
    annualParallaxMode: full.annualParallaxMode,
    solarLightDeflectionMode:
      full.solarLightDeflectionMode,
    diurnalAberrationMode: full.diurnalAberrationMode,
    polarMotionMode: full.polarMotionMode,
    refractionMode: full.refractionMode
  });
  expect(
    Object.prototype.hasOwnProperty.call(lightweight, "metadata")
  ).toBe(false);
}

describe("official SOFA 2023-10-11 reference vectors", () => {
  it("matches the official FK5-to-Hipparcos rotation and spin", () => {
    const expectedMatrix = [
      [
        Number("0.9999999999999928638"),
        Number("0.1110223351022919694e-6"),
        Number("0.4411803962536558154e-7")
      ],
      [
        Number("-0.1110223308458746430e-6"),
        Number("0.9999999999999891830"),
        Number("-0.9647792498984142358e-7")
      ],
      [
        Number("-0.4411805033656962252e-7"),
        Number("0.9647792009175314354e-7"),
        Number("0.9999999999999943728")
      ]
    ];
    expectedMatrix.forEach((row, rowIndex) =>
      row.forEach((expected, columnIndex) =>
        expectWithin(
          FK5_TO_HIPPARCOS_MATRIX[rowIndex]![columnIndex]!,
          expected,
          1e-17
        )
      )
    );
    [
      Number("-0.1454441043328607981e-8"),
      Number("0.2908882086657215962e-8"),
      Number("0.3393695767766751955e-8")
    ].forEach((expected, index) =>
      expectWithin(FK5_TO_HIPPARCOS_SPIN[index]!, expected, 1e-17)
    );
  });

  it("matches the official FK52H J2000 direction vector", () => {
    const rightAscension = 1.76779433;
    const declination = -0.2917517103;
    const result = propagateSpaceMotion(
      {
        bvColor: null,
        catalogName: "SOFA FK52H fixture",
        decRad: declination,
        hd: null,
        hr: 0,
        parallaxArcsec: 0.37921,
        pmDecArcsecPerYear:
          -5.8468475e-6 / (Math.PI / (180 * 3_600)),
        pmRaCosDecArcsecPerYear:
          (-1.91851572e-7 * Math.cos(declination)) /
          (Math.PI / (180 * 3_600)),
        raRad: rightAscension,
        radialVelocityKmPerSecond: -7.6,
        spectralType: null,
        vMagnitude: 0
      },
      2_451_545
    );

    expectWithin(
      result.coordinates.rightAscension,
      Number("1.767794226299947632"),
      1e-14
    );
    expectWithin(
      result.coordinates.declination,
      Number("-0.2917516070530391757"),
      1e-14
    );
  });

  it.each(fixtures.earthRotationAngles)("$id", (vector) => {
    expectWithin(
      earthRotationAngle(vector.ut1JulianDate),
      vector.expected,
      fixtures.tolerances.angleRadians
    );
  });

  it.each(fixtures.meanSiderealTimes)("$id", (vector) => {
    expectWithin(
      greenwichMeanSiderealTime2006(
        vector.ut1JulianDate,
        vector.ttJulianDate
      ),
      vector.expected,
      fixtures.tolerances.angleRadians
    );
  });

  it.each(fixtures.nutationAngles)("$id", (vector) => {
    const result = nutation2000B(vector.ttJulianDate);
    expectWithin(
      result.longitude,
      vector.expected.longitude,
      fixtures.tolerances.nutationRadians
    );
    expectWithin(
      result.obliquity,
      vector.expected.obliquity,
      fixtures.tolerances.nutationRadians
    );
  });

  it.each(fixtures.fukushimaWilliamsAngles)("$id", (vector) => {
    const result = fukushimaWilliams2006(vector.ttJulianDate);
    for (const field of [
      "gamma",
      "phi",
      "psi",
      "obliquity"
    ] as const) {
      expectWithin(
        result[field],
        vector.expected[field],
        fixtures.tolerances.angleRadians
      );
    }
  });

  it.each(fixtures.aberrationVectors)("$id", (vector) => {
    const result = applyAnnualAberration(
      vector3(vector.naturalDirection),
      vector3(vector.observerBarycentricVelocityC),
      vector.sunObserverDistanceAu
    );
    result.forEach((component, index) => {
      expectWithin(
        component,
        vector.expected[index],
        fixtures.tolerances.aberrationComponent
      );
    });
  });

  it.each(fixtures.refractionCoefficients)("$id", (vector) => {
    const result = refractionCoefficients(vector.atmosphere);
    expectWithin(
      result.tangent,
      vector.expected.tangent,
      fixtures.tolerances.refractionCoefficient
    );
    expectWithin(
      result.tangentCubed,
      vector.expected.tangentCubed,
      fixtures.tolerances.refractionCoefficient
    );
  });

  it.each(refractionGuardrails.cases)(
    "keeps the shared refraction guardrail: $id",
    (vector) => {
      const calculate = () =>
        applyVisualRefraction(Math.PI / 4, vector.atmosphere);
      if (vector.expected === "accepted") {
        expect(calculate).not.toThrow();
      } else {
        expect(calculate).toThrow();
      }
    }
  );
});

describe("independent composed SOFA C oracle vectors", () => {
  it.each(fixtures.composedApparentPositions)("$id", (vector) => {
    const star = precisionStarByHR.get(vector.starHR);
    if (!star) throw new Error(`Missing fixture star HR ${vector.starHR}`);
    const result = calculateApparentStarPositionV2(
      star,
      new Date(vector.iso),
      vector.location,
      {
        earthOrientation: vector.earthOrientation,
        annualParallax: false,
        solarLightDeflection: false,
        aberration: {
          observerBarycentricVelocityC:
            vector3(
              vector.aberration.observerBarycentricVelocityC
            ),
          sunObserverDistanceAu:
            vector.aberration.sunObserverDistanceAu
        },
        diurnalAberration: false,
        refraction: false
      }
    );
    expectWithin(
      sphericalSeparation(
        result.astrometricJ2000.rightAscension,
        result.astrometricJ2000.declination,
        vector.expected.astrometricRightAscension,
        vector.expected.astrometricDeclination
      ),
      0,
      fixtures.tolerances.composedEquatorialRadians
    );
    expectWithin(
      sphericalSeparation(
        result.apparentEquatorial.rightAscension,
        result.apparentEquatorial.declination,
        vector.expected.apparentRightAscension,
        vector.expected.apparentDeclination
      ),
      0,
      fixtures.tolerances.composedEquatorialRadians
    );

    const timeScales = resolveTimeScales(
      new Date(vector.iso),
      vector.earthOrientation
    );
    const siderealTime = greenwichApparentSiderealTime2006B(
      timeScales.ut1JulianDate,
      timeScales.ttJulianDate
    );
    expect(
      Math.abs(
        wrappedAngleDifference(
          siderealTime,
          vector.expected.greenwichApparentSiderealTime
        )
      )
    ).toBeLessThanOrEqual(
      fixtures.tolerances.composedSiderealRadians
    );
    expectWithin(
      result.geometricHorizontal.altitude,
      vector.expected.altitude,
      fixtures.tolerances.composedHorizontalRadians
    );
    expect(
      Math.abs(
        wrappedAngleDifference(
          result.geometricHorizontal.azimuth,
          vector.expected.azimuth
        )
      )
    ).toBeLessThanOrEqual(
      fixtures.tolerances.composedHorizontalRadians
    );
    expect(result.metadata.aberrationMode).toBe(
      "caller-barycentric-velocity"
    );
    expect(result.metadata.annualParallaxMode).toBe("disabled");
    expect(result.metadata.diurnalAberrationMode).toBe("disabled");
    expect(result.metadata.omittedCorrections).toContain(
      "diurnal-aberration"
    );
    expect(result.metadata.omittedCorrections).toContain(
      "annual-parallax"
    );
    expect(result.metadata.timeScales.dut1Source).toBe("caller");
  });
});

describe("independent annual-parallax geometry", () => {
  it("matches an analytic high-precision Euclidean fixture", () => {
    const result = applyAnnualParallax(
      [4, 3, 12],
      [1, -2, 3]
    );
    // Independent 60-decimal evaluation of [3, 5, 9] / sqrt(115).
    const expected = [
      Number("0.2797514424720941296908041653605466"),
      Number("0.4662524041201568828180069422675776"),
      Number("0.8392543274162823890724124960816397")
    ];

    result.forEach((component, index) => {
      expectWithin(component, expected[index]!, 2e-16);
    });
    expectWithin(magnitude(result), 1, 2e-16);
  });

  it("has the expected sign and amplitude for an orthogonal 1 AU baseline", () => {
    const parallaxRadians = Math.PI / (180 * 3_600);
    const distanceAu = 1 / Math.sin(parallaxRadians);
    const result = applyAnnualParallax(
      [distanceAu, 0, 0],
      [0, 1, 0]
    );
    const signedShift = Math.atan2(result[1], result[0]);

    expect(signedShift).toBeLessThan(0);
    expectWithin(
      signedShift,
      -Math.atan(Math.sin(parallaxRadians)),
      2e-16
    );
  });

  it("applies parallax after frame connection and before aberration", () => {
    const star = {
      bvColor: null,
      catalogName: "Pipeline-order fixture",
      decRad: -0.3,
      hd: null,
      hr: 99_001,
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
    const context = createApparentPositionContextV2(
      new Date("2026-07-29T12:00:00.000Z"),
      {
        latitude: 35.6812,
        longitude: 139.7671,
        timeZone: "Asia/Tokyo"
      },
      {
        annualParallax: { observerPositionAu },
        solarLightDeflection: false,
        aberration: {
          observerBarycentricVelocityC,
          sunObserverDistanceAu: 1
        },
        refraction: false
      }
    );
    const propagated = propagateSpaceMotion(
      star,
      context.timeScales.ttJulianDate
    );
    if (propagated.astrometricPositionAu === null) {
      throw new Error("Positive parallax did not preserve distance");
    }
    const natural = applyAnnualParallax(
      propagated.astrometricPositionAu,
      observerPositionAu
    );
    const proper = applyAnnualAberration(
      natural,
      observerBarycentricVelocityC,
      1
    );
    const expected = vectorToEquatorial(
      multiplyMatrixVector(
        context.precessionNutationMatrix,
        proper
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
    ).toBeLessThanOrEqual(2e-15);
    expect(result.annualParallaxMode).toBe(
      "caller-observer-position"
    );
    expect(result.metadata.annualParallaxMode).toBe(
      "caller-observer-position"
    );
    expect(result.metadata.omittedCorrections).not.toContain(
      "annual-parallax"
    );
    expect(result.metadata.omittedCorrections).not.toContain(
      "diurnal-parallax"
    );
    expect(result.metadata.warnings).toContain(
      "radial-velocity-missing-assumed-zero"
    );
  });

  it("retains parallax distance when radial velocity is missing", () => {
    const parallaxArcsec = 0.5;
    const result = propagateSpaceMotion(
      {
        bvColor: null,
        catalogName: "Distance-only fixture",
        decRad: 0.4,
        hd: null,
        hr: 99_002,
        parallaxArcsec,
        pmDecArcsecPerYear: null,
        pmRaCosDecArcsecPerYear: null,
        raRad: 2.1,
        radialVelocityKmPerSecond: null,
        spectralType: null,
        vMagnitude: 1
      },
      2_451_545
    );
    if (result.astrometricPositionAu === null) {
      throw new Error("Positive parallax did not preserve distance");
    }
    const expectedDistance =
      1 / Math.sin((parallaxArcsec * Math.PI) / (180 * 3_600));

    expectWithin(
      magnitude(result.astrometricPositionAu),
      expectedDistance,
      expectedDistance * 2e-15
    );
    expect(result.radialVelocityAssumedZero).toBe(true);
    expect(result.mode).toBe("none");
  });

  it("prepares and freezes the default observer position once per context", () => {
    const context = createApparentPositionContextV2(
      new Date("2026-07-29T12:00:00.000Z"),
      {
        latitude: 35.6812,
        longitude: 139.7671,
        timeZone: "Asia/Tokyo"
      },
      {
        aberration: false,
        refraction: false
      }
    );
    if (context.annualParallax.mode === "disabled") {
      throw new Error("Default annual parallax was disabled");
    }
    const expected = approximateEarthState(
      context.timeScales.ttJulianDate
    ).positionAu;

    expect(context.annualParallax.mode).toBe(
      "truncated-vsop2000-heliocentric-earth"
    );
    context.annualParallax.observerPositionAu.forEach(
      (component, index) => {
        expectWithin(component, expected[index]!, 0);
      }
    );
    expect(Object.isFrozen(context.annualParallax)).toBe(true);
    expect(
      Object.isFrozen(context.annualParallax.observerPositionAu)
    ).toBe(true);

    const mutableObserverPosition: [number, number, number] = [
      0.1,
      -0.2,
      0.3
    ];
    const customContext = createApparentPositionContextV2(
      new Date("2026-07-29T12:00:00.000Z"),
      {
        latitude: 35.6812,
        longitude: 139.7671,
        timeZone: "Asia/Tokyo"
      },
      {
        annualParallax: {
          observerPositionAu: mutableObserverPosition
        },
        aberration: false,
        refraction: false
      }
    );
    mutableObserverPosition[0] = 99;
    if (customContext.annualParallax.mode === "disabled") {
      throw new Error("Custom annual parallax was disabled");
    }
    const customAnnualParallax = customContext.annualParallax;
    expect(customAnnualParallax.observerPositionAu).toEqual([
      0.1,
      -0.2,
      0.3
    ]);
    expect(() => {
      (
        customAnnualParallax.observerPositionAu as [
          number,
          number,
          number
        ]
      )[0] = 42;
    }).toThrow(TypeError);
  });

  it("reports unavailable and disabled annual parallax distinctly", () => {
    const starWithoutParallax = precisionStarByHR.get(2);
    const sirius = precisionStarByHR.get(2491);
    if (!starWithoutParallax || !sirius) {
      throw new Error("Missing annual-parallax metadata fixtures");
    }
    const date = new Date("2026-07-29T12:00:00.000Z");
    const location = {
      latitude: 35.6812,
      longitude: 139.7671,
      timeZone: "Asia/Tokyo"
    };
    const unavailable = calculateApparentStarPositionV2(
      starWithoutParallax,
      date,
      location,
      { aberration: false, refraction: false }
    );
    const disabled = calculateApparentStarPositionV2(
      sirius,
      date,
      location,
      {
        annualParallax: false,
        aberration: false,
        refraction: false
      }
    );
    const missingAndDisabled = calculateApparentStarPositionV2(
      starWithoutParallax,
      date,
      location,
      {
        annualParallax: false,
        aberration: false,
        refraction: false
      }
    );

    expect(unavailable.metadata.annualParallaxMode).toBe(
      "unavailable"
    );
    expect(unavailable.metadata.warnings).toContain(
      "annual-parallax-unavailable"
    );
    expect(unavailable.metadata.warnings).not.toContain(
      "annual-parallax-approximate-ephemeris"
    );
    expect(disabled.metadata.annualParallaxMode).toBe("disabled");
    expect(disabled.metadata.warnings).toContain(
      "annual-parallax-disabled"
    );
    expect(unavailable.metadata.omittedCorrections).toContain(
      "annual-parallax"
    );
    expect(unavailable.metadata.omittedCorrections).toContain(
      "diurnal-parallax"
    );
    expect(disabled.metadata.omittedCorrections).toContain(
      "annual-parallax"
    );
    expect(unavailable.apparentEquatorial).toEqual(
      missingAndDisabled.apparentEquatorial
    );
  });

  it("rejects non-finite and singular parallax vectors", () => {
    expect(() =>
      applyAnnualParallax([1, 0, 0], [Number.NaN, 0, 0])
    ).toThrow(/Observer position/);
    expect(() =>
      applyAnnualParallax([1, 0, 0], [1, 0, 0])
    ).toThrow(/finite non-zero magnitude/);
    expect(() =>
      createApparentPositionContextV2(
        new Date("2026-07-29T12:00:00.000Z"),
        {
          latitude: 0,
          longitude: 0,
          timeZone: "UTC"
        },
        {
          annualParallax: {
            observerPositionAu: [0, Number.POSITIVE_INFINITY, 0]
          }
        }
      )
    ).toThrow(/observer position must be finite/i);

    const star = {
      bvColor: null,
      catalogName: "Parallax guardrail fixture",
      decRad: 0,
      hd: null,
      hr: 99_003,
      parallaxArcsec: Number.NaN,
      pmDecArcsecPerYear: null,
      pmRaCosDecArcsecPerYear: null,
      raRad: 0,
      radialVelocityKmPerSecond: null,
      spectralType: null,
      vMagnitude: 1
    };
    expect(() =>
      propagateSpaceMotion(star, 2_451_545)
    ).toThrow(/non-finite parallax/);
    expect(() =>
      propagateSpaceMotion(
        {
          ...star,
          parallaxArcsec: null,
          pmRaCosDecArcsecPerYear: Number.NaN
        },
        2_451_545
      )
    ).toThrow(/non-finite right-ascension proper motion/);
    expect(() =>
      propagateSpaceMotion(
        {
          ...star,
          parallaxArcsec: 0.1,
          radialVelocityKmPerSecond: Number.POSITIVE_INFINITY
        },
        2_451_545
      )
    ).toThrow(/non-finite radial velocity/);
    expect(() =>
      propagateSpaceMotion(
        {
          ...star,
          parallaxArcsec: 0.1,
          radialVelocityKmPerSecond:
            SPEED_OF_LIGHT_KILOMETERS_PER_SECOND
        },
        2_451_545
      )
    ).toThrow(/at or above light speed/);
    expect(() =>
      propagateSpaceMotion(
        { ...star, parallaxArcsec: 324_000 },
        2_451_545
      )
    ).toThrow(/physical stellar range/);

    const negative = propagateSpaceMotion(
      { ...star, parallaxArcsec: -0.1 },
      2_451_545
    );
    expect(negative.astrometricPositionAu).toBeNull();
    expect(negative.radialVelocityAssumedZero).toBe(false);
  });
});

describe("precision metadata and input guardrails", () => {
  it("makes the immutable frame context reusable and wrapper-equivalent", () => {
    const vector = fixtures.composedApparentPositions[0];
    const star = precisionStarByHR.get(vector.starHR);
    const secondStar = precisionStarByHR.get(5340);
    if (!star || !secondStar) throw new Error("Missing context fixture stars");
    const options = {
      earthOrientation: vector.earthOrientation,
      annualParallax: false as const,
      aberration: {
        observerBarycentricVelocityC:
          vector3(
            vector.aberration.observerBarycentricVelocityC
          ),
        sunObserverDistanceAu:
          vector.aberration.sunObserverDistanceAu
      },
      refraction: false as const
    };
    const date = new Date(vector.iso);
    const context = createApparentPositionContextV2(
      date,
      vector.location,
      options
    );
    const snapshot = JSON.stringify(context);
    const fromContext =
      calculateApparentStarPositionWithContextV2(star, context);
    const reused =
      calculateApparentStarPositionWithContextV2(secondStar, context);
    const fromWrapper = calculateApparentStarPositionV2(
      star,
      date,
      vector.location,
      options
    );
    const batch = calculateApparentStarPositionsWithContextV2(
      [star, secondStar],
      context
    );
    const lightweight =
      calculateLightweightApparentStarPositionWithContextV2(
        star,
        context
      );
    const lightweightSecond =
      calculateLightweightApparentStarPositionWithContextV2(
        secondStar,
        context
      );
    const lightweightBatch =
      calculateLightweightApparentStarPositionsWithContextV2(
        [star, secondStar],
        context
      );

    expect(fromContext).toEqual(fromWrapper);
    expect(batch).toEqual([fromContext, reused]);
    expectLightweightMatchesFull(lightweight, fromContext);
    expectLightweightMatchesFull(lightweightSecond, reused);
    expect(lightweightBatch).toEqual([
      lightweight,
      lightweightSecond
    ]);
    expectLightweightMatchesFull(lightweightBatch[0], fromContext);
    expectLightweightMatchesFull(lightweightBatch[1], reused);
    expect(fromContext.metadata.timeScales).toBe(context.timeScales);
    expect(reused.metadata.timeScales).toBe(context.timeScales);
    expect(JSON.stringify(context)).toBe(snapshot);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.location)).toBe(true);
    expect(Object.isFrozen(context.timeScales)).toBe(true);
    expect(Object.isFrozen(context.timeScales.warnings)).toBe(true);
    expect(Object.isFrozen(context.precessionNutationMatrix)).toBe(true);
    expect(
      context.precessionNutationMatrix.every(Object.isFrozen)
    ).toBe(true);
    expect(Object.isFrozen(context.aberration)).toBe(true);
    expect(Object.isFrozen(context.annualParallax)).toBe(true);
    expect(Object.isFrozen(context.baseWarnings)).toBe(true);
    expect(Object.isFrozen(batch)).toBe(true);
    expect(Object.isFrozen(lightweightBatch)).toBe(true);
    expect(() => {
      (context.location as { latitude: number }).latitude = 0;
    }).toThrow(TypeError);
  });

  it("resolves known leap seconds and reports assumed DUT1", () => {
    const result = resolveTimeScales(
      new Date("2026-07-29T00:00:00.000Z")
    );
    expect(result.taiMinusUtcSeconds).toBe(37);
    expect(result.taiMinusUtcSource).toBe("iers-history");
    expect(result.dut1Source).toBe("assumed-zero");
    expect(result.dut1UncertaintySeconds).toBeNull();
    expect(result.warnings).toContain("dut1-assumed-zero");
  });

  it("preserves explicit IERS DUT1 provenance and uncertainty", () => {
    const observed = resolveTimeScales(
      new Date("2026-01-01T12:00:00.000Z"),
      {
        dut1Seconds: 0.073_521,
        dut1Source: "iers-observed",
        dut1UncertaintySeconds: 0.000_013
      }
    );
    expect(observed.dut1Seconds).toBe(0.073_521);
    expect(observed.dut1Source).toBe("iers-observed");
    expect(observed.dut1UncertaintySeconds).toBe(0.000_013);
    expect(observed.warnings).not.toContain("dut1-assumed-zero");

    const predicted = resolveTimeScales(
      new Date("2026-07-29T00:00:00.000Z"),
      {
        dut1Seconds: 0.061,
        dut1Source: "iers-predicted",
        dut1UncertaintySeconds: 0.008
      }
    );
    expect(predicted.dut1Source).toBe("iers-predicted");
    expect(predicted.dut1UncertaintySeconds).toBe(0.008);
  });

  it("reports pre-1972 and future time-scale uncertainty", () => {
    expect(
      resolveTimeScales(
        new Date("1900-01-01T00:00:00.000Z")
      ).warnings
    ).toContain("pre-1972-utc-tt-approximation");
    expect(
      resolveTimeScales(
        new Date("2100-01-01T00:00:00.000Z")
      ).warnings
    ).toContain("future-leap-seconds-unknown");
  });

  it("applies refraction only inside its guarded altitude range", () => {
    const atmosphere = {
      pressureHpa: 1_013.25,
      temperatureCelsius: 10,
      relativeHumidity: 0.5,
      wavelengthMicrometers: 0.55
    };
    const tenDegrees = (10 * Math.PI) / 180;
    const oneDegree = Math.PI / 180;
    const applied = applyVisualRefraction(tenDegrees, atmosphere);
    const guarded = applyVisualRefraction(oneDegree, atmosphere);
    expect(applied.mode).toBe("applied");
    expect(applied.altitude).toBeGreaterThan(tenDegrees);
    expect(guarded).toEqual({
      altitude: oneDegree,
      mode: "below-model-altitude"
    });
  });

  it("keeps the documented 5-degree validity boundary explicit", () => {
    const atmosphere = {
      pressureHpa: 1_013.25,
      temperatureCelsius: 10,
      relativeHumidity: 0.5,
      wavelengthMicrometers: 0.55
    };
    const justBelow = (4.999_999 * Math.PI) / 180;
    const atBoundary = (5 * Math.PI) / 180;
    const guarded = applyVisualRefraction(justBelow, atmosphere);
    const applied = applyVisualRefraction(atBoundary, atmosphere);
    const boundaryCorrectionArcminutes =
      ((applied.altitude - atBoundary) * 180 * 60) / Math.PI;

    expect(guarded.mode).toBe("below-model-altitude");
    expect(guarded.altitude).toBe(justBelow);
    expect(applied.mode).toBe("applied");
    expect(boundaryCorrectionArcminutes).toBeGreaterThan(8);
    expect(boundaryCorrectionArcminutes).toBeLessThan(11);
    expect(() =>
      applyVisualRefraction(Math.PI / 180, {
        ...atmosphere,
        minimumGeometricAltitudeDegrees: 0
      })
    ).toThrow(/between 5° and 30°/);
  });

  it("rejects singular atmospheric states before creating coefficients", () => {
    expect(() =>
      refractionCoefficients({
        pressureHpa: 6.13374770562797,
        temperatureCelsius: 10,
        relativeHumidity: 0.5,
        wavelengthMicrometers: 0.55
      })
    ).toThrow(/physically valid|Water-vapor pressure/);
    expect(() =>
      refractionCoefficients({
        pressureHpa: 1,
        temperatureCelsius: 60,
        relativeHumidity: 0,
        wavelengthMicrometers: 0.55
      })
    ).toThrow(/Water-vapor pressure/);
  });

  it("keeps standard refraction finite and monotonic across its valid range", () => {
    const atmosphere = {
      pressureHpa: 1_013.25,
      temperatureCelsius: 10,
      relativeHumidity: 0.5,
      wavelengthMicrometers: 0.55
    };
    let previousObserved = -Infinity;
    for (let degrees = 5; degrees <= 90; degrees += 0.25) {
      const geometric = (degrees * Math.PI) / 180;
      const result = applyVisualRefraction(geometric, atmosphere);
      expect(Number.isFinite(result.altitude)).toBe(true);
      expect(result.altitude).toBeGreaterThanOrEqual(geometric);
      expect(result.altitude).toBeGreaterThan(previousObserved);
      previousObserved = result.altitude;
    }
  });

  it("makes default approximations explicit in pipeline metadata", () => {
    const star = precisionStarByHR.get(2491);
    if (!star) throw new Error("Missing Sirius");
    const result = calculateApparentStarPositionV2(
      star,
      new Date("2026-07-29T12:00:00.000Z"),
      {
        latitude: 35.6812,
        longitude: 139.7671,
        timeZone: "Asia/Tokyo"
      }
    );
    expect(result.metadata.modelVersion).toBe(2);
    expect(result.metadata.frameConnectionModel).toBe(
      "SOFA FK5-to-Hipparcos J2000 rotation and spin"
    );
    expect(result.metadata.aberrationMode).toBe(
      "truncated-vsop2000-heliocentric-earth"
    );
    expect(result.metadata.annualParallaxMode).toBe(
      "truncated-vsop2000-heliocentric-earth"
    );
    expect(result.metadata.refractionMode).toBe("disabled");
    expect(result.metadata.diurnalAberrationMode).toBe(
      "wgs84-observer"
    );
    expect(result.metadata.omittedCorrections).not.toContain(
      "annual-parallax"
    );
    expect(result.metadata.omittedCorrections).toContain(
      "diurnal-parallax"
    );
    expect(result.metadata.omittedCorrections).not.toContain(
      "diurnal-aberration"
    );
    expect(result.metadata.warnings).toEqual(
      expect.arrayContaining([
        "dut1-assumed-zero",
        "catalog-fk5-precision-limited",
        "annual-parallax-approximate-ephemeris",
        "aberration-approximate-ephemeris",
        "observer-height-assumed-zero",
        "refraction-disabled"
      ])
    );
  });

  it("applies WGS84 diurnal aberration after Earth rotation and before refraction", () => {
    const star = precisionStarByHR.get(7001);
    if (!star) throw new Error("Missing Vega");
    const date = new Date("2026-07-29T12:00:00.000Z");
    const location = {
      latitude: 35.6812,
      longitude: 139.7671,
      timeZone: "Asia/Tokyo"
    };
    const isolatedOptions = {
      annualParallax: false as const,
      aberration: false as const,
      diurnalAberration: false as const,
      refraction: false as const
    };
    const baseline = calculateApparentStarPositionV2(
      star,
      date,
      location,
      isolatedOptions
    );
    const corrected = calculateApparentStarPositionV2(
      star,
      date,
      location,
      {
        ...isolatedOptions,
        diurnalAberration: { heightMeters: 0 }
      }
    );
    const altitude = baseline.geometricHorizontal.altitude;
    const azimuth = baseline.geometricHorizontal.azimuth;
    const cosineAltitude = Math.cos(altitude);
    const expectedEnu =
      applyDiurnalAberrationToHorizontalEnu(
        [
          cosineAltitude * Math.sin(azimuth),
          cosineAltitude * Math.cos(azimuth),
          Math.sin(altitude)
        ],
        diurnalAberrationMagnitude(
          (location.latitude * Math.PI) / 180,
          0
        )
      );
    const expectedAltitude = Math.atan2(
      expectedEnu[2],
      Math.hypot(expectedEnu[0], expectedEnu[1])
    );
    const expectedAzimuth =
      (Math.atan2(expectedEnu[0], expectedEnu[1]) +
        2 * Math.PI) %
      (2 * Math.PI);

    expectWithin(
      corrected.geometricHorizontal.altitude,
      expectedAltitude,
      5e-15
    );
    expectWithin(
      wrappedAngleDifference(
        corrected.geometricHorizontal.azimuth,
        expectedAzimuth
      ),
      0,
      5e-15
    );
    expect(corrected.diurnalAberrationMode).toBe("wgs84-observer");
    expect(corrected.metadata.warnings).not.toContain(
      "observer-height-assumed-zero"
    );

    const atmosphere = {
      minimumGeometricAltitudeDegrees: 5,
      pressureHpa: 1_013.25,
      relativeHumidity: 0.5,
      temperatureCelsius: 10,
      wavelengthMicrometers: 0.55
    };
    const refracted = calculateApparentStarPositionV2(
      star,
      date,
      location,
      {
        ...isolatedOptions,
        diurnalAberration: { heightMeters: 0 },
        refraction: atmosphere
      }
    );
    const expectedRefraction = applyVisualRefraction(
      corrected.geometricHorizontal.altitude,
      atmosphere
    );
    expect(expectedRefraction.mode).toBe("applied");
    expect(refracted.geometricHorizontal).toEqual(
      corrected.geometricHorizontal
    );
    expectWithin(
      refracted.observedHorizontal.altitude,
      expectedRefraction.altitude,
      5e-15
    );
    expectWithin(
      refracted.observedHorizontal.azimuth,
      corrected.geometricHorizontal.azimuth,
      0
    );
    expect(refracted.refractionMode).toBe("applied");
  });

  it("applies the IAU 2000 polar-motion matrix between GAST and fixed-site ENU", () => {
    const star = precisionStarByHR.get(7001);
    if (!star) throw new Error("Missing Vega");
    const date = new Date("2026-07-29T12:00:00.000Z");
    const location = {
      latitude: 35.6812,
      longitude: 139.7671,
      timeZone: "Asia/Tokyo"
    };
    const baseOptions = {
      annualParallax: false as const,
      aberration: false as const,
      diurnalAberration: false as const,
      refraction: false as const
    };
    const context = createApparentPositionContextV2(
      date,
      location,
      {
        ...baseOptions,
        earthOrientation: {
          dut1Seconds: 0,
          polarMotion: {
            source: "caller",
            xpRadians: 0.31 / 206_264.806_247_096_36,
            ypRadians: -0.19 / 206_264.806_247_096_36
          }
        }
      }
    );
    const result =
      calculateApparentStarPositionWithContextV2(star, context);
    const apparent = result.apparentEquatorial;
    const cosineDeclination = Math.cos(apparent.declination);
    const trueDirection: Vector3 = [
      cosineDeclination * Math.cos(apparent.rightAscension),
      cosineDeclination * Math.sin(apparent.rightAscension),
      Math.sin(apparent.declination)
    ];
    const siderealSine = Math.sin(
      context.greenwichApparentSiderealTime
    );
    const siderealCosine = Math.cos(
      context.greenwichApparentSiderealTime
    );
    const tirsDirection: Vector3 = [
      siderealCosine * trueDirection[0] +
        siderealSine * trueDirection[1],
      -siderealSine * trueDirection[0] +
        siderealCosine * trueDirection[1],
      trueDirection[2]
    ];
    const itrsDirection = multiplyMatrixVector(
      context.polarMotion.matrix,
      tirsDirection
    );
    const longitude = (location.longitude * Math.PI) / 180;
    const latitude = (location.latitude * Math.PI) / 180;
    const expectedEast =
      -Math.sin(longitude) * itrsDirection[0] +
      Math.cos(longitude) * itrsDirection[1];
    const expectedNorth =
      -Math.sin(latitude) *
        Math.cos(longitude) *
        itrsDirection[0] -
      Math.sin(latitude) *
        Math.sin(longitude) *
        itrsDirection[1] +
      Math.cos(latitude) * itrsDirection[2];
    const expectedUp =
      Math.cos(latitude) *
        Math.cos(longitude) *
        itrsDirection[0] +
      Math.cos(latitude) *
        Math.sin(longitude) *
        itrsDirection[1] +
      Math.sin(latitude) * itrsDirection[2];

    expectWithin(
      result.geometricHorizontal.altitude,
      Math.atan2(
        expectedUp,
        Math.hypot(expectedEast, expectedNorth)
      ),
      5e-15
    );
    expectWithin(
      wrappedAngleDifference(
        result.geometricHorizontal.azimuth,
        Math.atan2(expectedEast, expectedNorth)
      ),
      0,
      5e-15
    );
    expect(result.polarMotionMode).toBe("caller");
    expect(result.metadata.omittedCorrections).not.toContain(
      "polar-motion"
    );
    expect(result.metadata.omittedCorrections).toContain(
      "subdaily-polar-motion-tides"
    );
  });

  it("makes an assumed-zero polar-motion fallback explicit while retaining s-prime", () => {
    const star = precisionStarByHR.get(7001);
    if (!star) throw new Error("Missing Vega");
    const context = createApparentPositionContextV2(
      new Date("2026-07-29T12:00:00.000Z"),
      {
        latitude: 35.6812,
        longitude: 139.7671,
        timeZone: "Asia/Tokyo"
      },
      {
        earthOrientation: {
          polarMotion: {
            source: "assumed-zero",
            xpRadians: 0,
            ypRadians: 0
          }
        }
      }
    );
    const result =
      calculateApparentStarPositionWithContextV2(star, context);

    expect(context.polarMotion.tioLocatorRadians).not.toBe(0);
    expect(result.polarMotionMode).toBe("assumed-zero");
    expect(result.metadata.warnings).toContain(
      "polar-motion-assumed-zero"
    );
    expect(result.metadata.omittedCorrections).toContain(
      "polar-motion"
    );
  });

  it("rejects impossible EOP, atmosphere, and velocity inputs", () => {
    expect(() =>
      resolveTimeScales(
        new Date("2026-07-29T00:00:00.000Z"),
        { dut1Seconds: 3_601 }
      )
    ).toThrow(/DUT1/);
    const polarDate = new Date("2026-07-29T00:00:00.000Z");
    const polarLocation = {
      latitude: 35.6812,
      longitude: 139.7671,
      timeZone: "Asia/Tokyo"
    };
    expect(() =>
      createApparentPositionContextV2(
        polarDate,
        polarLocation,
        {
          earthOrientation: {
            polarMotion: {
              source: "iers-observed",
              xpRadians: 0,
              ypRadians: 0
            }
          }
        }
      )
    ).toThrow(/requires reported errors/);
    expect(() =>
      createApparentPositionContextV2(
        polarDate,
        polarLocation,
        {
          earthOrientation: {
            polarMotion: {
              source: "caller",
              xpRadians: 0,
              xpReportedErrorRadians: 0,
              ypRadians: 0
            }
          }
        }
      )
    ).toThrow(/both axes/);
    expect(() =>
      createApparentPositionContextV2(
        polarDate,
        polarLocation,
        {
          earthOrientation: {
            polarMotion: {
              source: "assumed-zero",
              xpRadians: 1e-9,
              ypRadians: 0
            }
          }
        }
      )
    ).toThrow(/xp=yp=0/);
    expect(() =>
      calculateApparentStarPositionV2(
        precisionStarByHR.get(2491)!,
        new Date("2026-07-29T00:00:00.000Z"),
        {
          latitude: 35.6812,
          longitude: 139.7671,
          timeZone: "Asia/Tokyo"
        },
        {
          diurnalAberration: {
            heightMeters: Number.POSITIVE_INFINITY
          }
        }
      )
    ).toThrow(/height/i);
    expect(() =>
      resolveTimeScales(
        new Date("2026-07-29T00:00:00.000Z"),
        {
          dut1Source: "iers-observed"
        }
      )
    ).toThrow(/require an explicit DUT1/);
    expect(() =>
      resolveTimeScales(
        new Date("2026-07-29T00:00:00.000Z"),
        {
          dut1Seconds: 0.1,
          dut1UncertaintySeconds: -0.001
        }
      )
    ).toThrow(/uncertainty/);
    expect(() =>
      resolveTimeScales(
        new Date("2026-07-29T00:00:00.000Z"),
        {
          dut1Seconds: 0.1,
          dut1Source: "assumed-zero"
        } as unknown as EarthOrientationOptions
      )
    ).toThrow(/assumed-zero/);
    expect(() =>
      applyVisualRefraction(0.5, {
        pressureHpa: 1_013,
        temperatureCelsius: 15,
        relativeHumidity: 2,
        wavelengthMicrometers: 0.55
      })
    ).toThrow(/humidity/);
    expect(() =>
      applyAnnualAberration([1, 0, 0], [1, 0, 0], 1)
    ).toThrow(/below c/);
  });
});
