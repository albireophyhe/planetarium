import { describe, expect, it } from "vitest";
import { ARCSECONDS_TO_RADIANS } from "./constants";
import {
  approximateTioLocator,
  polarMotionMatrix2000
} from "./polarMotion";
import { multiplyMatrixVector } from "./vector";

describe("IAU 2000 polar motion", () => {
  it("matches the official SOFA pom00 reference matrix", () => {
    const matrix = polarMotionMatrix2000(
      2.550_602_38e-7,
      1.860_359_247e-6,
      -0.136_717_458_072_889_146e-10
    );
    const expected = [
      [
        Number("0.9999999999999674721"),
        Number("-0.1367174580728846989e-10"),
        Number("0.2550602379999972345e-6")
      ],
      [
        Number("0.1414624947957029801e-10"),
        Number("0.9999999999982695317"),
        Number("-0.1860359246998866389e-5")
      ],
      [
        Number("-0.2550602379741215021e-6"),
        Number("0.1860359247002414021e-5"),
        Number("0.9999999999982370039")
      ]
    ] as const;

    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        expect(
          Math.abs(
            matrix[row]![column]! - expected[row]![column]!
          )
        ).toBeLessThanOrEqual(
          row === column ? 1e-12 : 1e-16
        );
      }
    }
  });

  it("matches the official SOFA sp00 reference value", () => {
    expect(
      approximateTioLocator(2_400_000.5 + 52_541)
    ).toBeCloseTo(
      Number("-0.6216698469981019309e-11"),
      22
    );
  });

  it("keeps xp and yp signs and axes distinct", () => {
    const amount = 0.5 * ARCSECONDS_TO_RADIANS;
    const xpOnly = multiplyMatrixVector(
      polarMotionMatrix2000(amount, 0, 0),
      [1, 0, 0]
    );
    const ypOnly = multiplyMatrixVector(
      polarMotionMatrix2000(0, amount, 0),
      [0, 1, 0]
    );

    expect(xpOnly[2]).toBeCloseTo(-Math.sin(amount), 18);
    expect(ypOnly[2]).toBeCloseTo(Math.sin(amount), 18);
    expect(Math.abs(xpOnly[1])).toBe(0);
    expect(Math.abs(ypOnly[0])).toBe(0);
  });

  it("rejects non-finite and physically extreme inputs", () => {
    expect(() => approximateTioLocator(Number.NaN)).toThrow(
      /TT Julian Date/
    );
    expect(() =>
      polarMotionMatrix2000(
        11 * ARCSECONDS_TO_RADIANS,
        0,
        0
      )
    ).toThrow(/xp/);
    expect(() =>
      polarMotionMatrix2000(0, Number.POSITIVE_INFINITY, 0)
    ).toThrow(/yp/);
    expect(() =>
      polarMotionMatrix2000(
        0,
        0,
        2 * ARCSECONDS_TO_RADIANS
      )
    ).toThrow(/TIO locator/);
  });
});
