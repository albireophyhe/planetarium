import { describe, expect, it } from "vitest";
import type { ApparentBodyState } from "./types";
import {
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
    expect(result?.magnitude).toBeGreaterThan(1);
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
    expect(result?.obscuration).toBeLessThan(1);
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
