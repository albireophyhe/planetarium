const MILLISECONDS_PER_DAY = 86_400_000;
const UNIX_EPOCH_MJD = 40_587;
const MICROSECONDS_PER_SECOND = 1_000_000;

export type Dut1RecordStatus = "I" | "P";
export type Dut1EstimateSource = "observed" | "predicted";

export type Dut1DailyRecord = readonly [
  mjdUtc: number,
  status: Dut1RecordStatus,
  dut1Microseconds: number,
  uncertaintyMicroseconds: number,
];

export interface Dut1Estimate {
  readonly dut1Seconds: number;
  readonly source: Dut1EstimateSource;
  readonly uncertaintySeconds: number;
}

export interface Dut1CoverageV1 {
  readonly firstMjdUtc: number;
  readonly lastMjdUtc: number;
  readonly observedThroughMjdUtc: number;
  readonly predictionStartsMjdUtc: number;
  readonly recordCount: number;
  readonly observedCount: number;
  readonly predictedCount: number;
  readonly missingUt1TailRows: number;
  readonly leapSecondBoundaryCount: number;
}

export interface Dut1SourceSummaryV1 {
  readonly title: string;
  readonly url: string;
  readonly retrievedAt: string;
  readonly sourceLastModified: string;
  readonly sourceSha256: string;
}

export interface IersDut1ServiceV1 {
  readonly coverage: Dut1CoverageV1;
  readonly source: Dut1SourceSummaryV1;
  readonly lookup: (date: Date) => Promise<Dut1Estimate | null>;
}

export interface EncodedDut1ChunkV1 {
  readonly schemaVersion: 1;
  readonly startMjdUtc: number;
  readonly recordCount: number;
  readonly qualityRanges: readonly (readonly [
    startOffset: number,
    endOffsetExclusive: number,
    status: Dut1RecordStatus,
  ])[];
  readonly dut1MicrosecondsDelta: readonly number[];
  readonly uncertaintyMicrosecondsDelta: readonly number[];
}

export interface Dut1ChunkDescriptorV1 {
  readonly file: string;
  readonly startMjdUtc: number;
  readonly endMjdUtc: number;
  readonly recordCount: number;
}

export type Dut1ChunkLoader = (
  descriptor: Dut1ChunkDescriptorV1,
) => Promise<EncodedDut1ChunkV1>;

export function dateToMjdUtc(date: Date): number | null {
  if (!(date instanceof Date)) return null;
  const milliseconds = date.getTime();
  if (!Number.isFinite(milliseconds)) return null;
  return milliseconds / MILLISECONDS_PER_DAY + UNIX_EPOCH_MJD;
}

function validateDailyRecords(
  records: readonly Dut1DailyRecord[],
): void {
  if (records.length === 0) {
    throw new RangeError("DUT1 records must not be empty");
  }
  let previousMjd: number | null = null;
  let previousDut1: number | null = null;
  let predictionStarted = false;
  for (const [index, record] of records.entries()) {
    if (!Array.isArray(record) || record.length !== 4) {
      throw new TypeError(`DUT1 record ${index} must have four columns`);
    }
    const [mjd, status, dut1, uncertainty] = record;
    if (
      !Number.isInteger(mjd) ||
      !Number.isSafeInteger(dut1) ||
      Math.abs(dut1) > MICROSECONDS_PER_SECOND ||
      !Number.isSafeInteger(uncertainty) ||
      uncertainty < 0 ||
      uncertainty > MICROSECONDS_PER_SECOND
    ) {
      throw new RangeError(
        `DUT1 record ${index} must contain finite, in-range integers`,
      );
    }
    if (status !== "I" && status !== "P") {
      throw new RangeError(`DUT1 record ${index} has an invalid status`);
    }
    if (predictionStarted && status === "I") {
      throw new RangeError("DUT1 observed records cannot follow predictions");
    }
    if (status === "P") predictionStarted = true;
    if (previousMjd !== null && mjd <= previousMjd) {
      throw new RangeError("DUT1 records must be strictly MJD-ascending");
    }
    if (
      previousMjd !== null &&
      mjd === previousMjd + 1 &&
      previousDut1 !== null
    ) {
      const difference =
        (dut1 - previousDut1) / MICROSECONDS_PER_SECOND;
      if (Math.abs(difference) > 0.5) {
        const leapStep = Math.round(difference);
        if (
          Math.abs(leapStep) !== 1 ||
          Math.abs(difference - leapStep) > 0.1
        ) {
          throw new RangeError(
            "DUT1 records contain an unexplained discontinuity",
          );
        }
      }
    }
    previousMjd = mjd;
    previousDut1 = dut1;
  }
}

/**
 * Build an immutable lookup over daily 00:00 UTC samples.
 *
 * A leap-second boundary appears in DUT1 as an approximately ±1 second
 * midnight step. The integer step is removed only for interpolation within
 * the preceding UTC day, then the tabulated next-day value takes effect
 * exactly at 00:00. JavaScript Date cannot represent 23:59:60 itself.
 */
export function createDut1Lookup(
  inputRecords: readonly Dut1DailyRecord[],
): (date: Date) => Dut1Estimate | null {
  validateDailyRecords(inputRecords);
  const records = inputRecords.map(
    ([mjd, status, dut1, uncertainty]) =>
      [mjd, status, dut1, uncertainty] as const,
  );

  return (date: Date): Dut1Estimate | null => {
    const mjd = dateToMjdUtc(date);
    if (
      mjd === null ||
      mjd < records[0][0] ||
      mjd > records.at(-1)![0]
    ) {
      return null;
    }

    let low = 0;
    let high = records.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (records[middle][0] <= mjd) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    const startIndex = high;
    const start = records[startIndex];
    const fraction = mjd - start[0];
    if (Math.abs(fraction) < Number.EPSILON * 8) {
      return Object.freeze({
        dut1Seconds: start[2] / MICROSECONDS_PER_SECOND,
        source: start[1] === "I" ? "observed" : "predicted",
        uncertaintySeconds:
          start[3] / MICROSECONDS_PER_SECOND,
      });
    }

    const end = records[startIndex + 1];
    if (
      !end ||
      end[0] !== start[0] + 1 ||
      fraction <= 0 ||
      fraction >= 1
    ) {
      return null;
    }
    const rawDifference = end[2] - start[2];
    const leapStepMicroseconds =
      Math.abs(rawDifference) > MICROSECONDS_PER_SECOND / 2
        ? Math.round(rawDifference / MICROSECONDS_PER_SECOND) *
          MICROSECONDS_PER_SECOND
        : 0;
    const adjustedEnd = end[2] - leapStepMicroseconds;
    const interpolated =
      start[2] + fraction * (adjustedEnd - start[2]);
    return Object.freeze({
      dut1Seconds: interpolated / MICROSECONDS_PER_SECOND,
      source:
        start[1] === "I" && end[1] === "I"
          ? "observed"
          : "predicted",
      // Correlations are unavailable. Taking the larger endpoint value avoids
      // claiming an uncertainty smaller than either contributing sample.
      uncertaintySeconds:
        Math.max(start[3], end[3]) / MICROSECONDS_PER_SECOND,
    });
  };
}

export function decodeDut1Chunk(
  chunk: EncodedDut1ChunkV1,
): readonly Dut1DailyRecord[] {
  if (
    chunk.schemaVersion !== 1 ||
    !Number.isInteger(chunk.startMjdUtc) ||
    !Number.isInteger(chunk.recordCount) ||
    chunk.recordCount < 1 ||
    chunk.recordCount > 4_096 ||
    chunk.dut1MicrosecondsDelta.length !== chunk.recordCount ||
    chunk.uncertaintyMicrosecondsDelta.length !== chunk.recordCount
  ) {
    throw new RangeError("Invalid DUT1 chunk header or series length");
  }

  const statuses = new Array<Dut1RecordStatus>(chunk.recordCount);
  let expectedStart = 0;
  for (const [start, end, status] of chunk.qualityRanges) {
    if (
      start !== expectedStart ||
      !Number.isInteger(end) ||
      end <= start ||
      end > chunk.recordCount ||
      (status !== "I" && status !== "P")
    ) {
      throw new RangeError("Invalid DUT1 quality range");
    }
    statuses.fill(status, start, end);
    expectedStart = end;
  }
  if (expectedStart !== chunk.recordCount) {
    throw new RangeError("DUT1 quality ranges must cover the chunk");
  }

  let dut1 = 0;
  let uncertainty = 0;
  const records: Dut1DailyRecord[] = [];
  for (let index = 0; index < chunk.recordCount; index += 1) {
    const dut1Delta = chunk.dut1MicrosecondsDelta[index];
    const uncertaintyDelta =
      chunk.uncertaintyMicrosecondsDelta[index];
    if (
      !Number.isSafeInteger(dut1Delta) ||
      !Number.isSafeInteger(uncertaintyDelta)
    ) {
      throw new RangeError("DUT1 chunk deltas must be finite integers");
    }
    dut1 = index === 0 ? dut1Delta : dut1 + dut1Delta;
    uncertainty =
      index === 0
        ? uncertaintyDelta
        : uncertainty + uncertaintyDelta;
    records.push([
      chunk.startMjdUtc + index,
      statuses[index],
      dut1,
      uncertainty,
    ]);
  }
  validateDailyRecords(records);
  return Object.freeze(records);
}

/**
 * Create an asynchronous date lookup that loads only the matching data chunk.
 * A fractional time on a chunk's final UTC day additionally loads the next
 * chunk because two daily endpoints are required.
 */
export function createChunkedDut1Lookup(
  descriptors: readonly Dut1ChunkDescriptorV1[],
  loadChunk: Dut1ChunkLoader,
): (date: Date) => Promise<Dut1Estimate | null> {
  if (descriptors.length === 0) {
    throw new RangeError("DUT1 chunk descriptors must not be empty");
  }
  const ordered = descriptors.map((descriptor) =>
    Object.freeze({ ...descriptor }),
  );
  for (const [index, descriptor] of ordered.entries()) {
    if (
      !Number.isInteger(descriptor.startMjdUtc) ||
      !Number.isInteger(descriptor.endMjdUtc) ||
      !Number.isInteger(descriptor.recordCount) ||
      descriptor.recordCount < 1 ||
      descriptor.endMjdUtc !==
        descriptor.startMjdUtc + descriptor.recordCount - 1 ||
      (index > 0 &&
        descriptor.startMjdUtc <= ordered[index - 1].endMjdUtc)
    ) {
      throw new RangeError("Invalid DUT1 chunk descriptor ordering");
    }
  }

  type LoadedChunk = Readonly<{
    records: readonly Dut1DailyRecord[];
    lookup: (date: Date) => Dut1Estimate | null;
  }>;
  const cache = new Map<string, Promise<LoadedChunk>>();
  const load = (descriptor: Dut1ChunkDescriptorV1) => {
    const cached = cache.get(descriptor.file);
    if (cached) return cached;
    const pending = loadChunk(descriptor)
      .then((chunk) => {
        const records = decodeDut1Chunk(chunk);
        if (
          chunk.startMjdUtc !== descriptor.startMjdUtc ||
          chunk.recordCount !== descriptor.recordCount
        ) {
          throw new RangeError("Loaded DUT1 chunk does not match manifest");
        }
        return Object.freeze({
          records,
          lookup: createDut1Lookup(records),
        });
      })
      .catch((error: unknown) => {
        cache.delete(descriptor.file);
        throw error;
      });
    cache.set(descriptor.file, pending);
    return pending;
  };

  return async (date: Date): Promise<Dut1Estimate | null> => {
    const mjd = dateToMjdUtc(date);
    if (
      mjd === null ||
      mjd < ordered[0].startMjdUtc ||
      mjd > ordered.at(-1)!.endMjdUtc
    ) {
      return null;
    }
    const day = Math.floor(mjd);
    let low = 0;
    let high = ordered.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (ordered[middle].startMjdUtc <= day) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    const descriptorIndex = high;
    const descriptor = ordered[descriptorIndex];
    if (
      !descriptor ||
      day < descriptor.startMjdUtc ||
      day > descriptor.endMjdUtc
    ) {
      return null;
    }
    const current = await load(descriptor);
    const currentResult = current.lookup(date);
    if (
      currentResult !== null ||
      day < descriptor.endMjdUtc ||
      mjd === day
    ) {
      return currentResult;
    }

    const nextDescriptor = ordered[descriptorIndex + 1];
    if (
      !nextDescriptor ||
      nextDescriptor.startMjdUtc !== descriptor.endMjdUtc + 1
    ) {
      return null;
    }
    const next = await load(nextDescriptor);
    return createDut1Lookup([
      current.records.at(-1)!,
      next.records[0],
    ])(date);
  };
}
