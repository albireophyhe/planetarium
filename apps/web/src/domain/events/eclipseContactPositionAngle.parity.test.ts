import { describe, expect, it } from "vitest";
import fixtureJson from "../../../../../shared/fixtures/eclipse-contact-position-angles.v1.json";
import type { Vector3 } from "../precision";
import {
  eclipseContactPositionAngleRadians,
  type EclipseContactRadialDirection,
} from "./eclipseContactPositionAngle";

type FixtureCase = {
  readonly id: string;
  readonly referenceCenterDirection: readonly [
    number,
    number,
    number,
  ];
  readonly otherCenterDirection: readonly [
    number,
    number,
    number,
  ];
  readonly radialDirection: EclipseContactRadialDirection;
  readonly expectedDegrees: number | null;
};

type PositionAngleFixture = {
  readonly schemaVersion: number;
  readonly convention: {
    readonly frame: string;
    readonly referenceDirection: string;
    readonly positiveDirection: string;
    readonly rangeDegrees: string;
  };
  readonly toleranceDegrees: number;
  readonly cases: readonly FixtureCase[];
};

const fixture = fixtureJson as unknown as PositionAngleFixture;

describe("eclipse contact position-angle shared parity fixture", () => {
  it("locks the CIRS north-through-east convention", () => {
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.convention).toEqual({
      frame: "CIRS tangent plane (north from CIP)",
      referenceDirection: "celestial-north",
      positiveDirection: "eastward",
      rangeDegrees: "[0, 360)",
    });

    for (const vector of fixture.cases) {
      const actual = eclipseContactPositionAngleRadians(
        vector.referenceCenterDirection as Vector3,
        vector.otherCenterDirection as Vector3,
        vector.radialDirection,
      );
      if (vector.expectedDegrees === null) {
        expect(actual, vector.id).toBeNull();
        continue;
      }
      expect(actual, vector.id).not.toBeNull();
      expect(
        Math.abs(
          ((actual as number) * 180) / Math.PI -
            vector.expectedDegrees,
        ),
        vector.id,
      ).toBeLessThanOrEqual(fixture.toleranceDegrees);
    }
  });

  it("returns null for non-finite directions", () => {
    expect(
      eclipseContactPositionAngleRadians(
        [Number.NaN, 0, 0],
        [1, 0, 0],
      ),
    ).toBeNull();
    expect(
      eclipseContactPositionAngleRadians(
        [1, 0, 0],
        [Number.POSITIVE_INFINITY, 0, 0],
      ),
    ).toBeNull();
  });
});
