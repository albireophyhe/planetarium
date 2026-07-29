import { describe, expect, it } from "vitest";
import {
  MAX_SKY_DEVICE_PIXEL_RATIO,
  skyDevicePixelRatio,
} from "./pixelRatio";

describe("skyDevicePixelRatio", () => {
  it.each([
    [undefined, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [-2, 1],
    [0, 1],
    [1, 1],
    [1.5, 1.5],
    [2, 2],
    [4, 2],
  ])("maps %s to %s", (input, expected) => {
    expect(skyDevicePixelRatio(input)).toBe(expected);
  });

  it("keeps the documented allocation ceiling explicit", () => {
    expect(MAX_SKY_DEVICE_PIXEL_RATIO).toBe(2);
  });
});
