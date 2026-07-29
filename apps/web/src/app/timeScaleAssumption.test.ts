import { describe, expect, it } from "vitest";
import { resolveTimeScales } from "../domain";
import { timeScaleAssumptionText } from "./timeScaleAssumption";

describe("timeScaleAssumptionText", () => {
  it("states the pre-1972 zero-second approximation for 1900", () => {
    const timeScales = resolveTimeScales(
      new Date("1900-01-02T00:00:00.000Z"),
    );

    expect(timeScaleAssumptionText(timeScales)).toBe(
      "時刻系：TAI−UTC=0秒近似（1972年以前）",
    );
  });

  it("states the future leap-second assumption for 2050", () => {
    const timeScales = resolveTimeScales(
      new Date("2050-01-01T00:00:00.000Z"),
    );

    expect(timeScaleAssumptionText(timeScales)).toBe(
      "時刻系：将来うるう秒不明・37秒仮定（TAI−UTC）",
    );
  });

  it("stays absent while the bundled leap-second history is authoritative", () => {
    const timeScales = resolveTimeScales(
      new Date("2026-07-29T00:00:00.000Z"),
    );

    expect(timeScaleAssumptionText(timeScales)).toBeNull();
  });
});
