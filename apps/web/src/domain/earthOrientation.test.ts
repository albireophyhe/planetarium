import { describe, expect, it, vi } from "vitest";
import {
  createChunkedEarthOrientationAccess,
  createChunkedEarthOrientationLookup,
  createEarthOrientationLookup,
  decodeEarthOrientationChunk,
  type EarthOrientationDailyRecord,
  type EarthOrientationRecordStatus,
  type EncodedEarthOrientationChunkV1
} from "./earthOrientation";

const MILLISECONDS_PER_DAY = 86_400_000;
const UNIX_EPOCH_MJD = 40_587;

function dateFromMjd(mjd: number): Date {
  return new Date(
    (mjd - UNIX_EPOCH_MJD) * MILLISECONDS_PER_DAY
  );
}

function delta(values: readonly number[]): number[] {
  return values.map((value, index) =>
    index === 0 ? value : value - values[index - 1]!
  );
}

function ranges(
  statuses: readonly EarthOrientationRecordStatus[]
) {
  const result: [number, number, EarthOrientationRecordStatus][] =
    [];
  let start = 0;
  for (let index = 1; index <= statuses.length; index += 1) {
    if (
      index === statuses.length ||
      statuses[index] !== statuses[start]
    ) {
      result.push([start, index, statuses[start]!]);
      start = index;
    }
  }
  return result;
}

function encodedChunk(
  startMjdUtc: number,
  polarStatuses: readonly EarthOrientationRecordStatus[],
  dut1Statuses = polarStatuses
): EncodedEarthOrientationChunkV1 {
  const count = polarStatuses.length;
  const offsets = Array.from({ length: count }, (_, index) => index);
  return {
    schemaVersion: 1,
    startMjdUtc,
    recordCount: count,
    dut1QualityRanges: ranges(dut1Statuses),
    polarMotionQualityRanges: ranges(polarStatuses),
    dut1MicrosecondsDelta: delta(
      offsets.map((offset) => 100_000 + offset * 1_000)
    ),
    dut1ReportedErrorMicrosecondsDelta: delta(
      offsets.map(() => 20)
    ),
    xpMicroarcsecondsDelta: delta(
      offsets.map((offset) => 10_000 + offset ** 3 * 100)
    ),
    xpReportedErrorMicroarcsecondsDelta: delta(
      offsets.map(() => 100)
    ),
    ypMicroarcsecondsDelta: delta(
      offsets.map((offset) => -20_000 + offset ** 2 * 200)
    ),
    ypReportedErrorMicroarcsecondsDelta: delta(
      offsets.map(() => 200)
    )
  };
}

describe("integrated IERS Earth orientation", () => {
  it("strictly decodes independent PM and DUT1 quality ranges", () => {
    const chunk = encodedChunk(
      60_000,
      ["I", "P", "P", "P"],
      ["I", "I", "P", "P"]
    );
    expect(decodeEarthOrientationChunk(chunk)).toEqual([
      [60_000, "I", 10_000, 100, -20_000, 200, "I", 100_000, 20],
      [60_001, "P", 10_100, 100, -19_800, 200, "I", 101_000, 20],
      [60_002, "P", 10_800, 100, -19_200, 200, "P", 102_000, 20],
      [60_003, "P", 12_700, 100, -18_200, 200, "P", 103_000, 20]
    ]);
    expect(() =>
      decodeEarthOrientationChunk({
        ...chunk,
        unexpected: true
      } as unknown as EncodedEarthOrientationChunkV1)
    ).toThrow(/unexpected keys/);
    expect(() =>
      decodeEarthOrientationChunk({
        ...chunk,
        polarMotionQualityRanges: [[1, 4, "I"]]
      })
    ).toThrow(/quality range/);
  });

  it("uses exact samples and four-point Lagrange PM interpolation", () => {
    const records = decodeEarthOrientationChunk(
      encodedChunk(60_000, ["I", "I", "I", "I"])
    );
    const lookup = createEarthOrientationLookup(records);
    const exact = lookup(dateFromMjd(60_001));
    expect(exact?.dut1).toEqual({
      seconds: 0.101,
      reportedErrorSeconds: 0.00002,
      source: "observed",
      quality: "observed"
    });
    expect(exact?.polarMotion.source).toBe("observed");

    const interpolated = lookup(dateFromMjd(60_001.5));
    const radiansPerMicroarcsecond =
      Math.PI / (180 * 3_600 * 1_000_000);
    // Cubic and quadratic source series are reproduced exactly by four
    // Lagrange points. Constant reported errors receive a 1.25× envelope.
    expect(interpolated?.polarMotion.xpRadians).toBeCloseTo(
      10_337.5 * radiansPerMicroarcsecond,
      22
    );
    expect(interpolated?.polarMotion.ypRadians).toBeCloseTo(
      -19_550 * radiansPerMicroarcsecond,
      22
    );
    expect(
      interpolated?.polarMotion.xpReportedErrorRadians
    ).toBeCloseTo(125 * radiansPerMicroarcsecond, 22);
    expect(
      interpolated?.polarMotion.ypReportedErrorRadians
    ).toBeCloseTo(250 * radiansPerMicroarcsecond, 22);
  });

  it("keeps PM and DUT1 prediction provenance independent", () => {
    const records = decodeEarthOrientationChunk(
      encodedChunk(
        60_000,
        ["I", "I", "P", "P"],
        ["I", "I", "I", "I"]
      )
    );
    const result = createEarthOrientationLookup(records)(
      dateFromMjd(60_001.5)
    );

    expect(result?.dut1.source).toBe("observed");
    expect(result?.polarMotion.source).toBe("predicted");
    expect(result?.dut1.quality).toBe("observed");
    expect(result?.polarMotion.quality).toBe("mixed");
    expect(result?.polarMotion.usesPrediction).toBe(true);
  });

  it("rejects independent prediction-to-observed provenance reversals", () => {
    const polarMotionReversal: readonly EarthOrientationDailyRecord[] =
      [
        [60_000, "I", 10_000, 100, -20_000, 200, "I", 100_000, 20],
        [60_001, "P", 10_100, 100, -19_800, 200, "I", 101_000, 20],
        [60_002, "I", 10_800, 100, -19_200, 200, "I", 102_000, 20]
      ];
    const dut1Reversal: readonly EarthOrientationDailyRecord[] = [
      [60_000, "I", 10_000, 100, -20_000, 200, "I", 100_000, 20],
      [60_001, "I", 10_100, 100, -19_800, 200, "P", 101_000, 20],
      [60_002, "I", 10_800, 100, -19_200, 200, "I", 102_000, 20]
    ];

    expect(() =>
      createEarthOrientationLookup(polarMotionReversal)
    ).toThrow(/polar-motion observed records/);
    expect(() =>
      createEarthOrientationLookup(dut1Reversal)
    ).toThrow(/DUT1 observed records/);
  });

  it("preserves the DUT1 leap-second boundary without smearing", () => {
    const records: readonly EarthOrientationDailyRecord[] = [
      [57_752, "I", 0, 10, 0, 10, "I", -406_800, 20],
      [57_753, "I", 0, 10, 0, 10, "I", -407_760, 20],
      [57_754, "I", 0, 10, 0, 10, "I", 591_282, 30],
      [57_755, "I", 0, 10, 0, 10, "I", 590_000, 30]
    ];
    const lookup = createEarthOrientationLookup(records);

    expect(
      lookup(dateFromMjd(57_753.5))?.dut1.seconds
    ).toBe(-0.408239);
    expect(lookup(dateFromMjd(57_754))?.dut1.seconds).toBe(
      0.591282
    );
  });

  it("loads both sides of a four-point chunk-boundary window and caches them", async () => {
    const chunks = new Map([
      [
        "eop/a.json",
        encodedChunk(60_000, ["I", "I", "I"])
      ],
      [
        "eop/b.json",
        {
          ...encodedChunk(60_003, ["I", "I", "I"]),
          xpMicroarcsecondsDelta: delta([
            12_700,
            16_400,
            22_500
          ]),
          ypMicroarcsecondsDelta: delta([
            -18_200,
            -16_800,
            -15_000
          ])
        }
      ]
    ]);
    const loader = vi.fn(async ({ file }: { file: string }) => {
      const chunk = chunks.get(file);
      if (!chunk) throw new Error("missing chunk");
      return chunk;
    });
    const lookup = createChunkedEarthOrientationLookup(
      [
        {
          file: "eop/a.json",
          startMjdUtc: 60_000,
          endMjdUtc: 60_002,
          recordCount: 3
        },
        {
          file: "eop/b.json",
          startMjdUtc: 60_003,
          endMjdUtc: 60_005,
          recordCount: 3
        }
      ],
      loader
    );

    expect(await lookup(dateFromMjd(60_002.5))).not.toBeNull();
    expect(loader.mock.calls.map(([descriptor]) => descriptor.file))
      .toEqual(["eop/a.json", "eop/b.json"]);
    expect(await lookup(dateFromMjd(60_002.75))).not.toBeNull();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(await lookup(dateFromMjd(60_005.1))).toBeNull();
  });

  it("preloads a chunk-boundary interval into an immutable synchronous snapshot", async () => {
    const chunks = new Map([
      [
        "eop/a.json",
        encodedChunk(60_000, ["I", "I", "I"])
      ],
      [
        "eop/b.json",
        {
          ...encodedChunk(60_003, ["I", "I", "I"]),
          xpMicroarcsecondsDelta: delta([
            12_700,
            16_400,
            22_500
          ]),
          ypMicroarcsecondsDelta: delta([
            -18_200,
            -16_800,
            -15_000
          ])
        }
      ]
    ]);
    const loader = vi.fn(async ({ file }: { file: string }) => {
      const chunk = chunks.get(file);
      if (!chunk) throw new Error("missing chunk");
      return chunk;
    });
    const access = createChunkedEarthOrientationAccess(
      [
        {
          file: "eop/a.json",
          startMjdUtc: 60_000,
          endMjdUtc: 60_002,
          recordCount: 3
        },
        {
          file: "eop/b.json",
          startMjdUtc: 60_003,
          endMjdUtc: 60_005,
          recordCount: 3
        }
      ],
      loader
    );
    const start = dateFromMjd(60_002.25);
    const end = dateFromMjd(60_003.75);
    const snapshot = await access.loadSnapshot(start, end);

    expect(loader.mock.calls.map(([descriptor]) => descriptor.file))
      .toEqual(["eop/a.json", "eop/b.json"]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.lookup)).toBe(true);
    expect(snapshot.startUtcMilliseconds).toBe(start.getTime());
    expect(snapshot.endUtcMilliseconds).toBe(end.getTime());
    expect(snapshot.sourceSha256).toBeNull();
    expect(snapshot.retrievedAt).toBeNull();

    const result = snapshot.lookup(dateFromMjd(60_002.5));
    expect(result).not.toBeNull();
    expect(result).not.toBeInstanceOf(Promise);
    expect(snapshot.lookup(dateFromMjd(60_003.5))).not.toBeNull();
    expect(snapshot.lookup(dateFromMjd(60_002.249))).toBeNull();
    expect(snapshot.lookup(dateFromMjd(60_003.751))).toBeNull();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("keeps the leap-second midnight step in a synchronous snapshot", async () => {
    const first = {
      ...encodedChunk(57_752, ["I", "I"]),
      dut1MicrosecondsDelta: delta([-406_800, -407_760])
    };
    const second = {
      ...encodedChunk(57_754, ["I", "I"]),
      dut1MicrosecondsDelta: delta([591_282, 590_000])
    };
    const access = createChunkedEarthOrientationAccess(
      [
        {
          file: "eop/before.json",
          startMjdUtc: 57_752,
          endMjdUtc: 57_753,
          recordCount: 2
        },
        {
          file: "eop/after.json",
          startMjdUtc: 57_754,
          endMjdUtc: 57_755,
          recordCount: 2
        }
      ],
      async ({ file }) =>
        file === "eop/before.json" ? first : second
    );
    const midnight = dateFromMjd(57_754);
    const immediatelyBefore = new Date(midnight.getTime() - 1);
    const snapshot = await access.loadSnapshot(
      immediatelyBefore,
      midnight
    );

    expect(
      snapshot.lookup(immediatelyBefore)?.dut1.seconds
    ).toBeCloseTo(-0.408718, 8);
    expect(snapshot.lookup(midnight)?.dut1.seconds).toBe(
      0.591282
    );
  });

  it("resolves an all-out-of-coverage interval without loading chunks", async () => {
    const loader = vi.fn(async () =>
      encodedChunk(60_000, ["I", "I", "I", "I"])
    );
    const access = createChunkedEarthOrientationAccess(
      [
        {
          file: "eop/a.json",
          startMjdUtc: 60_000,
          endMjdUtc: 60_003,
          recordCount: 4
        }
      ],
      loader
    );
    const snapshot = await access.loadSnapshot(
      dateFromMjd(59_000),
      dateFromMjd(59_001)
    );

    expect(loader).not.toHaveBeenCalled();
    expect(snapshot.lookup(dateFromMjd(59_000.5))).toBeNull();
    expect(snapshot.lookup(dateFromMjd(60_001))).toBeNull();
    await expect(
      access.loadSnapshot(
        new Date(Number.NaN),
        dateFromMjd(60_001)
      )
    ).rejects.toThrow(/valid Dates/);
    await expect(
      access.loadSnapshot(
        dateFromMjd(60_001),
        dateFromMjd(60_000)
      )
    ).rejects.toThrow(/must not follow/);
  });

  it("rejects a snapshot when a required chunk fails integrity validation", async () => {
    const loader = vi.fn(async () => ({
      ...encodedChunk(60_000, ["I", "I", "I", "I"]),
      startMjdUtc: 60_001
    }));
    const access = createChunkedEarthOrientationAccess(
      [
        {
          file: "eop/corrupt.json",
          startMjdUtc: 60_000,
          endMjdUtc: 60_003,
          recordCount: 4
        }
      ],
      loader
    );

    await expect(
      access.loadSnapshot(
        dateFromMjd(60_000.25),
        dateFromMjd(60_000.75)
      )
    ).rejects.toThrow(/does not match manifest/);
    await expect(
      access.loadSnapshot(
        dateFromMjd(60_000.25),
        dateFromMjd(60_000.75)
      )
    ).rejects.toThrow(/does not match manifest/);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("rejects a prediction-to-observed reversal across a chunk boundary", async () => {
    const chunks = new Map([
      [
        "eop/a.json",
        encodedChunk(60_000, ["I", "P"])
      ],
      [
        "eop/b.json",
        encodedChunk(60_002, ["I", "I"])
      ]
    ]);
    const lookup = createChunkedEarthOrientationLookup(
      [
        {
          file: "eop/a.json",
          startMjdUtc: 60_000,
          endMjdUtc: 60_001,
          recordCount: 2
        },
        {
          file: "eop/b.json",
          startMjdUtc: 60_002,
          endMjdUtc: 60_003,
          recordCount: 2
        }
      ],
      async ({ file }) => chunks.get(file)!
    );

    await expect(
      lookup(dateFromMjd(60_001.5))
    ).rejects.toThrow(/polar-motion observed records/);
  });

  it("rejects unsafe descriptors, gaps, overflow and invalid dates", () => {
    const chunk = encodedChunk(60_000, ["I", "I", "I", "I"]);
    expect(() =>
      createChunkedEarthOrientationLookup(
        [
          {
            file: "../outside.json",
            startMjdUtc: 60_000,
            endMjdUtc: 60_003,
            recordCount: 4
          }
        ],
        async () => chunk
      )
    ).toThrow(/descriptor/);
    expect(() =>
      decodeEarthOrientationChunk({
        ...chunk,
        xpMicroarcsecondsDelta: [
          Number.MAX_SAFE_INTEGER,
          1,
          0,
          0
        ]
      })
    ).toThrow(/overflow|out-of-range/);
    expect(
      createEarthOrientationLookup(
        decodeEarthOrientationChunk(chunk)
      )(new Date(Number.NaN))
    ).toBeNull();
  });
});
