import { describe, expect, it } from "vitest";
import type { ApparentBodyState } from "./types";
import {
  solarEclipseBoundaryUncertaintyRadians,
  solveSolarEclipseGeometry,
  type SolarDiscSample,
} from "./solarEclipse";

function body(
  kind: "sun" | "moon",
  direction: readonly [number, number, number],
  angularRadiusRadians: number,
): ApparentBodyState {
  const length = Math.hypot(...direction);
  const unit = direction.map((value) => value / length) as [
    number,
    number,
    number,
  ];
  return {
    body: kind,
    tdbJulianDate: 2_460_000,
    lightTimeSeconds: kind === "sun" ? 499 : 1.28,
    distanceKilometers: kind === "sun" ? 149_600_000 : 384_400,
    angularRadiusRadians,
    icrfDirection: unit,
    cirsDirection: unit,
    horizontal: {
      altitude: Math.PI / 4,
      azimuth: Math.PI,
      azimuthDefined: true,
    },
  };
}

function linearPass(
  candidateMilliseconds: number,
  moonRadiusRadians: number,
): (instantMilliseconds: number) => SolarDiscSample {
  return (instantMilliseconds) => {
    const seconds = (instantMilliseconds - candidateMilliseconds) / 1_000;
    return {
      instantMilliseconds,
      sun: body("sun", [1, 0, 0], 0.004_65),
      moon: body(
        "moon",
        [1, seconds * 0.000_002, 0],
        moonRadiusRadians,
      ),
    };
  };
}

function offsetPass(
  candidateMilliseconds: number,
  moonRadiusRadians: number,
  minimumSeparationRadians: number,
  side: -1 | 1 = 1,
): (instantMilliseconds: number) => SolarDiscSample {
  return (instantMilliseconds) => {
    const seconds =
      (instantMilliseconds - candidateMilliseconds) / 1_000;
    return {
      instantMilliseconds,
      sun: body("sun", [1, 0, 0], 0.004_65),
      moon: body(
        "moon",
        [
          1,
          seconds * 0.000_002,
          side * Math.tan(minimumSeparationRadians),
        ],
        moonRadiusRadians,
      ),
    };
  };
}

describe("solar-eclipse geometry", () => {
  it("solves four contacts and a total maximum", () => {
    const center = Date.UTC(2026, 7, 12, 18);
    const result = solveSolarEclipseGeometry(
      center,
      linearPass(center, 0.004_8),
      {
        halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
        scanStepMilliseconds: 60_000,
      },
    );

    expect(result?.classification).toBe("total");
    expect(result?.externalContacts).toHaveLength(2);
    expect(result?.internalContacts).toHaveLength(2);
    expect(result?.maximum.instantMilliseconds).toBeCloseTo(center, -1);
    expect(result?.magnitude).toBeCloseTo(0.004_8 / 0.004_65, 12);
    expect(result?.obscuration).toBe(1);
  });

  it("distinguishes an annular pass", () => {
    const center = Date.UTC(2027, 1, 6, 16);
    const result = solveSolarEclipseGeometry(
      center,
      linearPass(center, 0.004_4),
      {
        halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
      },
    );

    expect(result?.classification).toBe("annular");
    expect(result?.internalContacts).toHaveLength(2);
    expect(result?.magnitude).toBeCloseTo(0.004_4 / 0.004_65, 12);
    expect(result?.obscuration).toBeLessThan(1);
  });

  it("brackets a sub-scan-step central phase near the path edge", () => {
    const candidate = Date.UTC(2039, 5, 21, 17);
    const physicalCenter = candidate + 60_000;
    const result = solveSolarEclipseGeometry(
      candidate,
      linearPass(physicalCenter, 0.004_67),
      {
        halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
        scanStepMilliseconds: 2 * 60 * 1_000,
      },
    );

    expect(result?.classification).toBe("total");
    expect(result?.internalContacts).toHaveLength(2);
    expect(
      result!.internalContacts[1]!.instantMilliseconds -
        result!.internalContacts[0]!.instantMilliseconds,
    ).toBeLessThan(30_000);
    expect(result?.boundaryUncertain).toBe(false);
  });

  it("keeps near misses on both sides of the outer path boundary", () => {
    const center = Date.UTC(2100, 0, 1);
    const moonRadius = 0.004_7;
    const earthRotationPathKilometers = 5;
    const boundaryBand =
      solarEclipseBoundaryUncertaintyRadians(
        384_400,
        earthRotationPathKilometers,
      );
    expect(boundaryBand).toBeCloseTo(
      (6 + earthRotationPathKilometers) / 384_400,
      15,
    );
    const minimumSeparation =
      0.004_65 + moonRadius + 0.8 * boundaryBand;

    for (const side of [-1, 1] as const) {
      const pass = offsetPass(
        center,
        moonRadius,
        minimumSeparation,
        side,
      );
      expect(
        solveSolarEclipseGeometry(center, pass, {
          halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
        }),
      ).toBeNull();

      const result = solveSolarEclipseGeometry(center, pass, {
        earthRotationPathUncertaintyKilometers:
          earthRotationPathKilometers,
        halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
      });

      expect(result?.boundaryUncertain).toBe(true);
      expect(result?.uncertainBoundary).toBe("external");
      expect(result?.classification).toBe("partial");
      expect(result?.externalContacts).toHaveLength(1);
      expect(result?.internalContacts).toHaveLength(0);
      expect(result?.magnitude).toBe(0);
      expect(result?.obscuration).toBe(0);
      expect(
        result?.boundaryUncertaintyRadians,
      ).toBeCloseTo(boundaryBand, 14);
    }
  });

  it("treats a shallow hit and near miss symmetrically at the outer limb", () => {
    const center = Date.UTC(2100, 0, 1);
    const moonRadius = 0.004_7;
    const earthRotationPathKilometers = 5;
    const boundaryBand =
      solarEclipseBoundaryUncertaintyRadians(
        384_400,
        earthRotationPathKilometers,
      );
    const externalLimit = 0.004_65 + moonRadius;

    for (const clearanceFactor of [-0.8, 0.8] as const) {
      const pass = offsetPass(
        center,
        moonRadius,
        externalLimit + clearanceFactor * boundaryBand,
      );
      const withoutEarthRotation = solveSolarEclipseGeometry(
        center,
        pass,
        {
          halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
        },
      );
      if (clearanceFactor < 0) {
        expect(withoutEarthRotation?.boundaryUncertain).toBe(false);
        expect(withoutEarthRotation?.externalContacts).toHaveLength(2);
      } else {
        expect(withoutEarthRotation).toBeNull();
      }

      const result = solveSolarEclipseGeometry(center, pass, {
        earthRotationPathUncertaintyKilometers:
          earthRotationPathKilometers,
        halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
      });

      expect(result?.boundaryUncertain).toBe(true);
      expect(result?.uncertainBoundary).toBe("external");
      expect(result?.externalContacts).toHaveLength(1);
      expect(result?.internalContacts).toHaveLength(0);
    }
  });

  it("keeps ±8 km occurrence offsets uncertain with 10 km observer accuracy", () => {
    const center = Date.UTC(2100, 0, 1);
    const moonDistanceKilometers = 384_400;
    const moonRadius = 0.004_7;
    const externalLimit = 0.004_65 + moonRadius;
    const horizontalAccuracyMeters = 10_000;
    const boundaryBand =
      solarEclipseBoundaryUncertaintyRadians(
        moonDistanceKilometers,
        null,
        horizontalAccuracyMeters,
      );

    expect(boundaryBand).toBeCloseTo(
      (6 + horizontalAccuracyMeters / 1_000) /
        moonDistanceKilometers,
      15,
    );

    for (const clearanceKilometers of [-8, 8] as const) {
      const pass = offsetPass(
        center,
        moonRadius,
        externalLimit +
          clearanceKilometers / moonDistanceKilometers,
      );
      const withoutObserverAccuracy = solveSolarEclipseGeometry(
        center,
        pass,
        {
          halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
        },
      );
      if (clearanceKilometers < 0) {
        expect(withoutObserverAccuracy?.boundaryUncertain).toBe(false);
        expect(withoutObserverAccuracy?.externalContacts).toHaveLength(2);
      } else {
        expect(withoutObserverAccuracy).toBeNull();
      }

      const result = solveSolarEclipseGeometry(center, pass, {
        halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
        horizontalAccuracyMeters,
      });

      expect(result?.boundaryUncertain).toBe(true);
      expect(result?.uncertainBoundary).toBe("external");
      expect(result?.classification).toBe("partial");
      expect(result?.externalContacts).toHaveLength(1);
      expect(result?.internalContacts).toHaveLength(0);
      expect(result?.boundaryUncertaintyRadians).toBeCloseTo(
        boundaryBand,
        14,
      );
    }
  });

  it("treats both sides of the partial-central boundary symmetrically", () => {
    const center = Date.UTC(2100, 0, 1);
    const moonRadius = 0.004_8;
    const earthRotationPathKilometers = 5;
    const boundaryBand =
      solarEclipseBoundaryUncertaintyRadians(
        384_400,
        earthRotationPathKilometers,
      );
    const centralLimit = moonRadius - 0.004_65;

    for (const clearanceFactor of [-0.8, 0.8] as const) {
      const pass = offsetPass(
        center,
        moonRadius,
        centralLimit + clearanceFactor * boundaryBand,
      );
      const withoutEarthRotation = solveSolarEclipseGeometry(
        center,
        pass,
        {
          halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
        },
      );
      expect(withoutEarthRotation?.boundaryUncertain).toBe(false);
      expect(withoutEarthRotation?.classification).toBe(
        clearanceFactor < 0 ? "total" : "partial",
      );
      expect(withoutEarthRotation?.internalContacts).toHaveLength(
        clearanceFactor < 0 ? 2 : 0,
      );

      const result = solveSolarEclipseGeometry(center, pass, {
        earthRotationPathUncertaintyKilometers:
          earthRotationPathKilometers,
        halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
      });

      expect(result?.boundaryUncertain).toBe(true);
      expect(result?.uncertainBoundary).toBe("partial-central");
      expect(result?.classification).toBe(
        clearanceFactor < 0 ? "total" : "partial",
      );
      expect(result?.externalContacts).toHaveLength(2);
      expect(result?.internalContacts).toHaveLength(0);
      expect(
        result?.boundaryUncertaintyRadians,
      ).toBeCloseTo(boundaryBand, 14);
    }
  });

  it("returns null when the lunar disc misses the Sun", () => {
    const center = Date.UTC(2030, 0, 1);
    const sampleAt = (instantMilliseconds: number): SolarDiscSample => ({
      instantMilliseconds,
      sun: body("sun", [1, 0, 0], 0.004_65),
      moon: body("moon", [1, 0.02, 0], 0.004_7),
    });

    expect(
      solveSolarEclipseGeometry(center, sampleAt, {
        halfWindowMilliseconds: 60 * 60 * 1_000,
      }),
    ).toBeNull();
  });

  it("supports cancellation during a long scan", () => {
    const center = Date.UTC(2030, 0, 1);
    let calls = 0;
    expect(() =>
      solveSolarEclipseGeometry(
        center,
        linearPass(center, 0.004_8),
        {
          halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
          shouldCancel: () => {
            calls += 1;
            return calls > 2;
          },
        },
      ),
    ).toThrow(/cancelled/);
  });
});
