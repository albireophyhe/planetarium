import { describe, expect, it, vi } from "vitest";
import {
  createChunkedDut1Lookup,
  createDut1Lookup,
  dateToMjdUtc,
  decodeDut1Chunk,
  type Dut1DailyRecord,
  type Dut1RecordStatus,
  type EncodedDut1ChunkV1,
} from "./dut1";

const MILLISECONDS_PER_DAY = 86_400_000;
const UNIX_EPOCH_MJD = 40_587;

function dateFromMjd(mjd: number): Date {
  return new Date((mjd - UNIX_EPOCH_MJD) * MILLISECONDS_PER_DAY);
}

function encodedChunk(
  startMjdUtc: number,
  statuses: readonly Dut1RecordStatus[],
  dut1: readonly number[],
  uncertainty: readonly number[],
): EncodedDut1ChunkV1 {
  const delta = (values: readonly number[]) =>
    values.map((value, index) =>
      index === 0 ? value : value - values[index - 1],
    );
  const qualityRanges: [number, number, Dut1RecordStatus][] = [];
  let start = 0;
  for (let index = 1; index <= statuses.length; index += 1) {
    if (
      index === statuses.length ||
      statuses[index] !== statuses[start]
    ) {
      qualityRanges.push([start, index, statuses[start]]);
      start = index;
    }
  }
  return {
    schemaVersion: 1,
    startMjdUtc,
    recordCount: statuses.length,
    qualityRanges,
    dut1MicrosecondsDelta: delta(dut1),
    uncertaintyMicrosecondsDelta: delta(uncertainty),
  };
}

describe("DUT1 daily interpolation", () => {
  it("returns exact samples and linearly interpolates an observed UTC day", () => {
    const lookup = createDut1Lookup([
      [60_000, "I", 100_000, 10],
      [60_001, "I", 104_000, 30],
    ]);

    expect(lookup(dateFromMjd(60_000))).toEqual({
      dut1Seconds: 0.1,
      source: "observed",
      uncertaintySeconds: 0.00001,
    });
    expect(lookup(dateFromMjd(60_000.25))).toEqual({
      dut1Seconds: 0.101,
      source: "observed",
      uncertaintySeconds: 0.00003,
    });
  });

  it("does not smear a positive leap-second step across the UTC day", () => {
    const lookup = createDut1Lookup([
      [57_753, "I", -407_760, 20],
      [57_754, "I", 591_282, 30],
    ]);

    expect(lookup(dateFromMjd(57_753.5))).toEqual({
      dut1Seconds: -0.408239,
      source: "observed",
      uncertaintySeconds: 0.00003,
    });
    expect(
      lookup(
        new Date(
          dateFromMjd(57_754).getTime() - 1,
        ),
      )!.dut1Seconds,
    ).toBeCloseTo(-0.408718, 8);
    expect(lookup(dateFromMjd(57_754))).toEqual({
      dut1Seconds: 0.591282,
      source: "observed",
      uncertaintySeconds: 0.00003,
    });
  });

  it("handles a hypothetical negative leap-second step symmetrically", () => {
    const lookup = createDut1Lookup([
      [60_000, "I", 400_000, 10],
      [60_001, "I", -599_000, 20],
    ]);

    expect(lookup(dateFromMjd(60_000.5))!.dut1Seconds).toBe(0.4005);
    expect(lookup(dateFromMjd(60_001))!.dut1Seconds).toBe(-0.599);
  });

  it("marks I-to-P interpolation predicted and keeps endpoint uncertainty", () => {
    const lookup = createDut1Lookup([
      [60_000, "I", 10_000, 15],
      [60_001, "P", 12_000, 108],
    ]);

    expect(lookup(dateFromMjd(60_000))!.source).toBe("observed");
    expect(lookup(dateFromMjd(60_000.5))).toEqual({
      dut1Seconds: 0.011,
      source: "predicted",
      uncertaintySeconds: 0.000108,
    });
    expect(lookup(dateFromMjd(60_001))!.source).toBe("predicted");
  });

  it("returns null for invalid, missing, and out-of-range dates", () => {
    const lookup = createDut1Lookup([
      [60_000, "I", 10_000, 10],
      [60_002, "I", 12_000, 10],
    ]);

    expect(dateToMjdUtc(new Date(Number.NaN))).toBeNull();
    expect(lookup(new Date(Number.NaN))).toBeNull();
    expect(lookup(dateFromMjd(59_999))).toBeNull();
    expect(lookup(dateFromMjd(60_000.5))).toBeNull();
    expect(lookup(dateFromMjd(60_003))).toBeNull();
    expect(Date.parse("2016-12-31T23:59:60.000Z")).toBeNaN();
  });

  it("rejects non-finite and unexplained-discontinuity records", () => {
    expect(() =>
      createDut1Lookup([
        [60_000, "I", Number.NaN, 10],
      ] as unknown as readonly Dut1DailyRecord[]),
    ).toThrow(/finite/);
    expect(() =>
      createDut1Lookup([
        [60_000, "I", 0, 10],
        [60_001, "I", 700_000, 10],
      ]),
    ).toThrow(/discontinuity/);
  });

  it("decodes delta and quality ranges with full validation", () => {
    expect(
      decodeDut1Chunk(
        encodedChunk(
          60_000,
          ["I", "I", "P"],
          [10_000, 11_000, 12_000],
          [15, 20, 100],
        ),
      ),
    ).toEqual([
      [60_000, "I", 10_000, 15],
      [60_001, "I", 11_000, 20],
      [60_002, "P", 12_000, 100],
    ]);
    expect(() =>
      decodeDut1Chunk({
        ...encodedChunk(60_000, ["I"], [10_000], [15]),
        qualityRanges: [[1, 1, "I"]],
      }),
    ).toThrow(/quality range/);
  });

  it("lazy-loads only the target chunk and its boundary neighbor", async () => {
    const chunks = new Map<string, EncodedDut1ChunkV1>([
      [
        "a",
        encodedChunk(
          60_000,
          ["I", "I"],
          [10_000, 11_000],
          [10, 10],
        ),
      ],
      [
        "b",
        encodedChunk(
          60_002,
          ["I", "I"],
          [12_000, 13_000],
          [10, 10],
        ),
      ],
      [
        "c",
        encodedChunk(
          60_004,
          ["P", "P"],
          [14_000, 15_000],
          [100, 100],
        ),
      ],
    ]);
    const loader = vi.fn(async ({ file }: { file: string }) => {
      const chunk = chunks.get(file);
      if (!chunk) throw new Error("missing test chunk");
      return chunk;
    });
    const lookup = createChunkedDut1Lookup(
      [
        {
          file: "a",
          startMjdUtc: 60_000,
          endMjdUtc: 60_001,
          recordCount: 2,
        },
        {
          file: "b",
          startMjdUtc: 60_002,
          endMjdUtc: 60_003,
          recordCount: 2,
        },
        {
          file: "c",
          startMjdUtc: 60_004,
          endMjdUtc: 60_005,
          recordCount: 2,
        },
      ],
      loader,
    );

    expect(await lookup(dateFromMjd(60_000.5))).toEqual({
      dut1Seconds: 0.0105,
      source: "observed",
      uncertaintySeconds: 0.00001,
    });
    expect(loader.mock.calls.map(([descriptor]) => descriptor.file)).toEqual([
      "a",
    ]);

    expect(await lookup(dateFromMjd(60_001.5))).toEqual({
      dut1Seconds: 0.0115,
      source: "observed",
      uncertaintySeconds: 0.00001,
    });
    expect(loader.mock.calls.map(([descriptor]) => descriptor.file)).toEqual([
      "a",
      "b",
    ]);

    await lookup(dateFromMjd(60_001.75));
    expect(loader).toHaveBeenCalledTimes(2);
    await lookup(dateFromMjd(60_004));
    expect(loader.mock.calls.map(([descriptor]) => descriptor.file)).toEqual([
      "a",
      "b",
      "c",
    ]);
    await lookup(dateFromMjd(59_999));
    expect(loader).toHaveBeenCalledTimes(3);
  });
});
