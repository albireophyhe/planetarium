import { describe, expect, it } from "vitest";
import {
  calculateApparentStarPositionWithContextV2,
  type PrecisionStar,
} from "../domain";
import { calculatePrecisionSkyFrame } from "./precisionSkyFrame";

const TEST_STARS: readonly PrecisionStar[] = [
  {
    bvColor: 0,
    catalogName: "Test A",
    decRad: 0.4,
    hd: 1,
    hr: 1,
    parallaxArcsec: 0.2,
    pmDecArcsecPerYear: -0.3,
    pmRaCosDecArcsecPerYear: 0.5,
    raRad: 1.2,
    radialVelocityKmPerSecond: 12,
    spectralType: "A0",
    vMagnitude: 1,
  },
  {
    bvColor: 1,
    catalogName: "Test B",
    decRad: -0.3,
    hd: 2,
    hr: 2,
    parallaxArcsec: null,
    pmDecArcsecPerYear: 0.02,
    pmRaCosDecArcsecPerYear: -0.01,
    raRad: 4.5,
    radialVelocityKmPerSecond: null,
    spectralType: "K0",
    vMagnitude: 2,
  },
];

describe("calculatePrecisionSkyFrame", () => {
  it("reuses one immutable context and retains catalog ordering", () => {
    const frame = calculatePrecisionSkyFrame(
      TEST_STARS,
      new Date("2026-07-29T12:00:00.000Z"),
      {
        latitude: 35.6812,
        longitude: 139.7671,
        timeZone: "Asia/Tokyo",
      },
    );

    expect(Object.isFrozen(frame.context)).toBe(true);
    expect(Object.isFrozen(frame.positions)).toBe(true);
    expect(frame.catalog).toBe(TEST_STARS);
    expect(frame.positions.map((position) => position.starHR)).toEqual([
      1, 2,
    ]);

    const full = calculateApparentStarPositionWithContextV2(
      TEST_STARS[0]!,
      frame.context,
    );
    expect(frame.positions[0]?.apparentEquatorial).toEqual(
      full.apparentEquatorial,
    );
    expect(frame.positions[0]?.observedHorizontal).toEqual(
      full.observedHorizontal,
    );
    expect(frame.positions[0]?.projection).toEqual(full.projection);
  });
});
