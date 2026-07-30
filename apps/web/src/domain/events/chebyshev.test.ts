import { describe, expect, it } from "vitest";
import {
  evaluateChebyshevRecord,
  normalizedChebyshevTime,
} from "./chebyshev";

describe("event Chebyshev evaluation", () => {
  it("evaluates position and analytic velocity in component-major order", () => {
    // x = 1 + 2 T1 + 3 T2
    // y = -4 + 0.5 T1
    // z = 2 T2
    const state = evaluateChebyshevRecord(
      new Float32Array([
        1, 2, 3,
        -4, 0.5, 0,
        0, 0, 2,
      ]),
      3,
      0.25,
      4,
    );

    expect(state.positionKilometers[0]).toBeCloseTo(-1.125, 12);
    expect(state.positionKilometers[1]).toBeCloseTo(-3.875, 12);
    expect(state.positionKilometers[2]).toBeCloseTo(-1.75, 12);
    expect(state.velocityKilometersPerDay[0]).toBeCloseTo(2.5, 12);
    expect(state.velocityKilometersPerDay[1]).toBeCloseTo(0.25, 12);
    expect(state.velocityKilometersPerDay[2]).toBeCloseTo(1, 12);
  });

  it("keeps both record endpoints valid", () => {
    expect(normalizedChebyshevTime(100, 100, 4)).toBe(-1);
    expect(normalizedChebyshevTime(104, 100, 4)).toBe(1);
  });

  it("rejects malformed records and out-of-range time", () => {
    expect(() =>
      evaluateChebyshevRecord([1, 2, 3], 2, 0, 4),
    ).toThrow(/x, y, and z/);
    expect(() => normalizedChebyshevTime(99, 100, 4)).toThrow(
      /outside/,
    );
  });
});
