import { describe, expect, it } from "vitest";
import {
  classifyBoundaryMaximumVisibility,
  classifyEventIntervalVisibility,
} from "./eventVisibility";

describe("classifyBoundaryMaximumVisibility", () => {
  it("keeps physical-boundary uncertainty independent from the horizon", () => {
    expect(classifyBoundaryMaximumVisibility(0.1)).toBe(
      "partly-visible",
    );
    expect(classifyBoundaryMaximumVisibility(0)).toBe(
      "below-horizon",
    );
    expect(classifyBoundaryMaximumVisibility(-0.1)).toBe(
      "below-horizon",
    );
  });

  it("rejects non-finite horizon samples", () => {
    expect(() =>
      classifyBoundaryMaximumVisibility(Number.NaN),
    ).toThrow(RangeError);
  });
});

describe("classifyEventIntervalVisibility", () => {
  it("finds a visible interval even when both endpoints are below", () => {
    expect(
      classifyEventIntervalVisibility(
        0,
        4_000,
        (instant) =>
          1 -
          ((instant - 2_000) / 300) ** 2,
        0.1,
      ),
    ).toBe("partly-visible");
  });

  it("finds a horizon dip between two visible endpoints", () => {
    expect(
      classifyEventIntervalVisibility(
        0,
        4_000,
        (instant) =>
          ((instant - 2_000) / 300) ** 2 -
          1,
        0.1,
      ),
    ).toBe("partly-visible");
  });

  it("distinguishes fully visible and fully hidden intervals", () => {
    expect(
      classifyEventIntervalVisibility(
        0,
        4_000,
        (instant) => 2 + Math.sin(instant / 1_000),
      ),
    ).toBe("fully-visible");
    expect(
      classifyEventIntervalVisibility(
        0,
        4_000,
        (instant) => -2 + Math.sin(instant / 1_000),
      ),
    ).toBe("below-horizon");
  });

  it("rejects invalid intervals", () => {
    expect(() =>
      classifyEventIntervalVisibility(2, 1, () => 0),
    ).toThrow(RangeError);
    expect(() =>
      classifyEventIntervalVisibility(1, 1, () => Number.NaN),
    ).toThrow(RangeError);
  });
});
