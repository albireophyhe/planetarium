import { describe, expect, it } from "vitest";
import {
  azimuthCompassLabel,
  formatAzimuthDegrees,
  formatDecimal,
  formatDeclination,
  formatRightAscension,
  formatSignedDegrees,
} from "./astronomicalFormatting";

describe("astronomical formatting", () => {
  it("carries right-ascension rounding across midnight", () => {
    const almostMidnightHours = 23 + 59 / 60 + 59.96 / 3_600;
    const radians = (almostMidnightHours * Math.PI) / 12;

    expect(formatRightAscension(radians)).toBe("00h 00m 00.0s");
    expect(formatRightAscension(-Math.PI / 12)).toBe(
      "23h 00m 00.0s",
    );
  });

  it("carries declination arcseconds and removes negative zero", () => {
    const almostThirtyNineDegrees =
      (38 + 59 / 60 + 59.6 / 3_600) * (Math.PI / 180);

    expect(formatDeclination(almostThirtyNineDegrees)).toBe(
      "+39° 00′ 00″",
    );
    expect(formatDeclination(-1e-15)).toBe("+00° 00′ 00″");
  });

  it("supports precision-pointing coordinate digits with carry", () => {
    const rightAscensionHours =
      12 + 34 / 60 + 56.789 / 3_600;
    expect(
      formatRightAscension(
        (rightAscensionHours * Math.PI) / 12,
        2,
      ),
    ).toBe("12h 34m 56.79s");

    const declinationDegrees =
      -(12 + 34 / 60 + 56.789 / 3_600);
    expect(
      formatDeclination(
        (declinationDegrees * Math.PI) / 180,
        1,
      ),
    ).toBe("−12° 34′ 56.8″");
  });

  it("normalizes azimuth for labels and rounded full circles", () => {
    expect(formatAzimuthDegrees(359.7)).toBe("0°");
    expect(formatAzimuthDegrees(-45)).toBe("315°");
    expect(formatAzimuthDegrees(359.9997, 3)).toBe("0.000°");
    expect(formatAzimuthDegrees(-45.1254, 3)).toBe("314.875°");
    expect(azimuthCompassLabel(-45)).toBe("北西");
    expect(azimuthCompassLabel(360)).toBe("北");
  });

  it("formats signed decimal degrees without ASCII or negative zero", () => {
    expect(formatSignedDegrees(12.34)).toBe("12.3°");
    expect(formatSignedDegrees(-12.34)).toBe("−12.3°");
    expect(formatSignedDegrees(-0.01)).toBe("0.0°");
    expect(formatSignedDegrees(12.345, 2)).toBe("12.35°");
  });

  it("formats other signed decimals with the same typographic contract", () => {
    expect(formatDecimal(-1.46, 2)).toBe("−1.46");
    expect(formatDecimal(-0.004, 2)).toBe("0.00");
    expect(formatDecimal(12.34, 1)).toBe("12.3");
  });

  it("uses an explicit unavailable representation for non-finite values", () => {
    expect(formatRightAscension(Number.NaN)).toBe("—");
    expect(formatRightAscension(1, 7)).toBe("—");
    expect(formatDeclination(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatDeclination(1, -1)).toBe("—");
    expect(formatAzimuthDegrees(Number.NaN)).toBe("—");
    expect(formatDecimal(Number.NaN)).toBe("—");
    expect(formatDecimal(1, 7)).toBe("—");
    expect(formatSignedDegrees(Number.NaN)).toBe("—");
    expect(formatSignedDegrees(1, -1)).toBe("—");
    expect(azimuthCompassLabel(Number.NaN)).toBe("不定");
  });
});
