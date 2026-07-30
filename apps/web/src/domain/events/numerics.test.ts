import { describe, expect, it } from "vitest";
import {
  findSignChangeBrackets,
  minimizeBracketed,
  solveBracketedRoot,
} from "./numerics";

describe("event numerics", () => {
  it("solves a well-conditioned contact root", () => {
    const result = solveBracketedRoot(
      (argument) => argument * argument - 2,
      1,
      2,
      1e-12,
      1e-14,
    );

    expect(result.value).toBeCloseTo(Math.sqrt(2), 11);
    expect(result.iterations).toBeLessThan(96);
  });

  it("keeps a bracket for a flat grazing-like root", () => {
    const root = 0.125;
    const result = solveBracketedRoot(
      (argument) => (argument - root) ** 3,
      -1,
      1,
      1e-10,
      0,
    );

    expect(result.value).toBeCloseTo(root, 8);
  });

  it("rejects a range without a sign change", () => {
    expect(() =>
      solveBracketedRoot(
        (argument) => argument * argument + 1,
        -1,
        1,
        1e-8,
      ),
    ).toThrow(/opposite signs/);
  });

  it("finds a derivative-free minimum", () => {
    const result = minimizeBracketed(
      (argument) => (argument - 3.25) ** 2 + 7,
      -10,
      10,
      1e-10,
    );

    expect(result.argument).toBeCloseTo(3.25, 7);
    expect(result.value).toBeCloseTo(7, 10);
  });

  it("finds contact brackets without stepping beyond the range", () => {
    expect(
      findSignChangeBrackets(
        (argument) => (argument - 1) * (argument - 3),
        0,
        4,
        0.75,
      ),
    ).toEqual([
      { lower: 0.75, upper: 1.5 },
      { lower: 2.25, upper: 3 },
      { lower: 3, upper: 3.75 },
    ]);
  });

  it("rejects non-finite function values", () => {
    expect(() =>
      findSignChangeBrackets(() => Number.NaN, 0, 1, 0.1),
    ).toThrow(/finite/);
  });
});
