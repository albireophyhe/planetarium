import { describe, expect, it } from "vitest";
import { horizontalToCartesian } from "./skySphere3DModel";

const RADIANS_TO_ARCSECONDS = (180 * 3_600) / Math.PI;

function angularSeparation(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  const leftLength = Math.hypot(...left);
  const rightLength = Math.hypot(...right);
  const first = left.map((value) => value / leftLength);
  const second = right.map((value) => value / rightLength);
  const cross = [
    first[1]! * second[2]! - first[2]! * second[1]!,
    first[2]! * second[0]! - first[0]! * second[2]!,
    first[0]! * second[1]! - first[1]! * second[0]!,
  ];
  const dot =
    first[0]! * second[0]! +
    first[1]! * second[1]! +
    first[2]! * second[2]!;
  return Math.atan2(Math.hypot(...cross), dot);
}

describe("rendering coordinate accuracy", () => {
  it("keeps WebGL Float32 staging below 0.03 arcsecond on a one-degree sky grid", () => {
    let maximumSeparationArcseconds = 0;

    for (let altitude = -90; altitude <= 90; altitude += 1) {
      for (let azimuth = 0; azimuth < 360; azimuth += 1) {
        const position = horizontalToCartesian(altitude, azimuth);
        const original: [number, number, number] = [
          position.x,
          position.y,
          position.z,
        ];
        const staged = Float32Array.from(original);
        const separation =
          angularSeparation(
            original,
            [staged[0]!, staged[1]!, staged[2]!],
          ) * RADIANS_TO_ARCSECONDS;
        maximumSeparationArcseconds = Math.max(
          maximumSeparationArcseconds,
          separation,
        );
      }
    }

    // The current 65,160-direction scan reaches 0.008985 arcsecond.
    expect(maximumSeparationArcseconds).toBeLessThanOrEqual(0.03);
  });
});
