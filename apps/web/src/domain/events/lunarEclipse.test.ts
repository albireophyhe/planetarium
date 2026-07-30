import { describe, expect, it } from "vitest";
import type { ApparentGeocentricBodyState } from "./types";
import {
  lunarShadowSample,
  solveLunarEclipseGeometry,
} from "./lunarEclipse";

function body(
  kind: "sun" | "moon",
  direction: readonly [number, number, number],
  distanceKilometers: number,
  angularRadiusRadians: number,
): ApparentGeocentricBodyState {
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
    distanceKilometers,
    angularRadiusRadians,
    icrfDirection: unit,
    cirsDirection: unit,
  };
}

function lunarPass(
  center: number,
  closestOffsetRadians: number,
) {
  return (instantMilliseconds: number) => {
    const seconds = (instantMilliseconds - center) / 1_000;
    const offset = closestOffsetRadians + seconds * 0.000_001;
    return lunarShadowSample(
      instantMilliseconds,
      body("sun", [1, 0, 0], 149_600_000, 0.004_65),
      body("moon", [-1, offset, 0], 384_400, 0.004_52),
    );
  };
}

describe("lunar-eclipse geometry", () => {
  it("uses the declared Danjon shadow convention", () => {
    const sample = lunarPass(0, 0)(0);
    expect(sample.penumbralRadiusRadians).toBeGreaterThan(
      sample.umbralRadiusRadians,
    );
    expect(sample.umbralRadiusRadians).toBeGreaterThan(
      sample.moon.angularRadiusRadians,
    );
  });

  it("solves P, U, and totality contacts", () => {
    const center = Date.UTC(2025, 8, 7, 18);
    const result = solveLunarEclipseGeometry(
      center,
      lunarPass(center, 0),
      {
        halfWindowMilliseconds: 8 * 60 * 60 * 1_000,
      },
    );

    expect(result?.classification).toBe("total");
    expect(result?.penumbralContacts).toHaveLength(2);
    expect(result?.umbralContacts).toHaveLength(2);
    expect(result?.totalContacts).toHaveLength(2);
    expect(result?.umbralMagnitude).toBeGreaterThan(1);
  });

  it("returns null when the Moon misses the penumbra", () => {
    const center = Date.UTC(2025, 0, 1);
    expect(
      solveLunarEclipseGeometry(
        center,
        lunarPass(center, 0.04),
        {
          halfWindowMilliseconds: 2 * 60 * 60 * 1_000,
        },
      ),
    ).toBeNull();
  });
});
