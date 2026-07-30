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
      lastMjdUtc: 61_624,
      observedThroughMjdUtc: 61_251,
      predictionStartsMjdUtc: 61_252,
      recordCount: 19_941,
      observedCount: 19_568,
      predictedCount: 373,
    });
    expect(service.source.sourceSha256).toBe(
      "4b828090fc94114168014b61439fa5e6ec0bdfda518075a32baffea90110954d",
    );
  });

  it("returns official quantized values and null outside coverage", async () => {
    const { coverage } = await loadIersDut1Service();
    expect(
      await lookupIersDut1(dateFromMjd(coverage.firstMjdUtc)),
    ).toEqual({
      dut1Seconds: 0.808418,
      source: "observed",
      uncertaintySeconds: 0.000271,
    });
    expect(
      await lookupIersDut1(
        dateFromMjd(coverage.firstMjdUtc - 0.001),
      ),
    ).toBeNull();
    expect(
      await lookupIersDut1(
        dateFromMjd(coverage.lastMjdUtc + 0.001),
      ),
    ).toBeNull();
  });

  it("treats the observed-to-predicted boundary conservatively", async () => {
    const { coverage } = await loadIersDut1Service();
    expect(
      await lookupIersDut1(
        dateFromMjd(coverage.observedThroughMjdUtc),
      ),
    ).toEqual({
      dut1Seconds: 0.012961,
      source: "observed",
      uncertaintySeconds: 0.00001,
    });
    expect(
      await lookupIersDut1(
        dateFromMjd(coverage.observedThroughMjdUtc + 0.5),
      ),
    ).toEqual({
      dut1Seconds: 0.0129515,
      source: "predicted",
      uncertaintySeconds: 0.000108,
    });
    expect(
      await lookupIersDut1(
        dateFromMjd(coverage.predictionStartsMjdUtc),
      ),
    ).toEqual({
      dut1Seconds: 0.012942,
      source: "predicted",
      uncertaintySeconds: 0.000108,
    });
  });
});
