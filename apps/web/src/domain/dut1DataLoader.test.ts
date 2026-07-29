import { describe, expect, it } from "vitest";
import {
  loadIersDut1Service,
  lookupIersDut1,
} from "./dut1DataLoader";

const MILLISECONDS_PER_DAY = 86_400_000;
const UNIX_EPOCH_MJD = 40_587;

function dateFromMjd(mjd: number): Date {
  return new Date((mjd - UNIX_EPOCH_MJD) * MILLISECONDS_PER_DAY);
}

describe("bundled IERS DUT1 service", () => {
  it("loads once and exposes immutable provenance and coverage", async () => {
    const first = loadIersDut1Service();
    const second = loadIersDut1Service();
    expect(first).toBe(second);

    const service = await first;
    expect(Object.isFrozen(service)).toBe(true);
    expect(Object.isFrozen(service.coverage)).toBe(true);
    expect(Object.isFrozen(service.source)).toBe(true);
    expect(service.coverage).toMatchObject({
      firstMjdUtc: 41_684,
      lastMjdUtc: 61_617,
      observedThroughMjdUtc: 61_244,
      predictionStartsMjdUtc: 61_245,
      recordCount: 19_934,
      observedCount: 19_561,
      predictedCount: 373,
    });
    expect(service.source.sourceSha256).toBe(
      "f707ea5031a467f1a3b2f0645fac2f627095ed0cb41d34c515b495cb81a5a25d",
    );
  });

  it("returns official quantized values and null outside coverage", async () => {
    expect(await lookupIersDut1(dateFromMjd(41_684))).toEqual({
      dut1Seconds: 0.808418,
      source: "observed",
      uncertaintySeconds: 0.000271,
    });
    expect(await lookupIersDut1(dateFromMjd(41_683.999))).toBeNull();
    expect(await lookupIersDut1(dateFromMjd(61_617.001))).toBeNull();
  });

  it("treats the observed-to-predicted boundary conservatively", async () => {
    expect(await lookupIersDut1(dateFromMjd(61_244))).toEqual({
      dut1Seconds: 0.009371,
      source: "observed",
      uncertaintySeconds: 0.000015,
    });
    expect(await lookupIersDut1(dateFromMjd(61_244.5))).toEqual({
      dut1Seconds: 0.0095515,
      source: "predicted",
      uncertaintySeconds: 0.000108,
    });
    expect(await lookupIersDut1(dateFromMjd(61_245))).toEqual({
      dut1Seconds: 0.009732,
      source: "predicted",
      uncertaintySeconds: 0.000108,
    });
  });
});
