import { ARCSECONDS_TO_RADIANS } from "./precision/constants";
import { dateToMjdUtc } from "./dut1";

const MICRO_UNITS_PER_UNIT = 1_000_000;
const MAX_CHUNK_RECORDS = 4_096;
const MAX_DUT1_MICROSECONDS = MICRO_UNITS_PER_UNIT;
const MAX_POLAR_MOTION_MICROARCSECONDS =
  2 * MICRO_UNITS_PER_UNIT;
const MAX_REPORTED_ERROR_MICRO_UNITS = MICRO_UNITS_PER_UNIT;

export type EarthOrientationRecordStatus = "I" | "P";
export type EarthOrientationEstimateSource =
  | "observed"
  | "predicted";

export type EarthOrientationDailyRecord = readonly [
  mjdUtc: number,
  polarMotionStatus: EarthOrientationRecordStatus,
  xpMicroarcseconds: number,
  xpReportedErrorMicroarcseconds: number,
  ypMicroarcseconds: number,
  ypReportedErrorMicroarcseconds: number,
  dut1Status: EarthOrientationRecordStatus,
  dut1Microseconds: number,
  dut1ReportedErrorMicroseconds: number
];

export interface Dut1EarthOrientationEstimate {
  readonly seconds: number;
  readonly reportedErrorSeconds: number;
  readonly source: EarthOrientationEstimateSource;
}

export interface PolarMotionEstimate {
  readonly xpRadians: number;
  readonly ypRadians: number;
  readonly xpReportedErrorRadians: number;
  readonly ypReportedErrorRadians: number;
  readonly source: EarthOrientationEstimateSource;
  readonly usesPrediction: boolean;
}

export interface IersEarthOrientationEstimateV1 {
  readonly dut1: Dut1EarthOrientationEstimate;
  readonly polarMotion: PolarMotionEstimate;
}

export interface EarthOrientationObservableCoverageV1 {
  readonly iersThroughMjdUtc: number;
  readonly predictionStartsMjdUtc: number;
  readonly iersCount: number;
  readonly predictedCount: number;
  readonly missingTailRows: number;
}

export interface EarthOrientationCoverageV1 {
  readonly firstSampleMjdUtc: number;
  readonly lastSampleMjdUtc: number;
  readonly recordCount: number;
  readonly sourceRowCount: number;
  readonly polarMotion: EarthOrientationObservableCoverageV1;
  readonly dut1: EarthOrientationObservableCoverageV1 &
    Readonly<{ leapSecondBoundaryCount: number }>;
}

export interface EarthOrientationSourceSummaryV1 {
  readonly title: string;
  readonly url: string;
  readonly retrievedAt: string;
  readonly sourceLastModified: string;
  readonly sourceSha256: string;
}

export interface IersEarthOrientationServiceV1 {
  readonly coverage: EarthOrientationCoverageV1;
  readonly source: EarthOrientationSourceSummaryV1;
  readonly lookup: (
    date: Date
  ) => Promise<IersEarthOrientationEstimateV1 | null>;
}

export interface EncodedEarthOrientationChunkV1 {
  readonly schemaVersion: 1;
  readonly startMjdUtc: number;
  readonly recordCount: number;
  readonly dut1QualityRanges: readonly QualityRangeV1[];
  readonly polarMotionQualityRanges: readonly QualityRangeV1[];
  readonly dut1MicrosecondsDelta: readonly number[];
  readonly dut1ReportedErrorMicrosecondsDelta: readonly number[];
  readonly xpMicroarcsecondsDelta: readonly number[];
  readonly xpReportedErrorMicroarcsecondsDelta: readonly number[];
  readonly ypMicroarcsecondsDelta: readonly number[];
  readonly ypReportedErrorMicroarcsecondsDelta: readonly number[];
}

export type QualityRangeV1 = readonly [
  startOffset: number,
  endOffsetExclusive: number,
  status: EarthOrientationRecordStatus
];

export interface EarthOrientationChunkDescriptorV1 {
  readonly file: string;
  readonly startMjdUtc: number;
  readonly endMjdUtc: number;
  readonly recordCount: number;
}

export type EarthOrientationChunkLoader = (
  descriptor: EarthOrientationChunkDescriptorV1
) => Promise<EncodedEarthOrientationChunkV1>;

const CHUNK_KEYS = new Set([
  "schemaVersion",
  "startMjdUtc",
  "recordCount",
  "dut1QualityRanges",
  "polarMotionQualityRanges",
  "dut1MicrosecondsDelta",
  "dut1ReportedErrorMicrosecondsDelta",
  "xpMicroarcsecondsDelta",
  "xpReportedErrorMicroarcsecondsDelta",
  "ypMicroarcsecondsDelta",
  "ypReportedErrorMicroarcsecondsDelta"
]);

function decodeStatuses(
  ranges: readonly QualityRangeV1[],
  recordCount: number,
  label: string
): EarthOrientationRecordStatus[] {
  if (!Array.isArray(ranges)) {
    throw new TypeError(`${label} quality ranges must be an array`);
  }
  const statuses = new Array<EarthOrientationRecordStatus>(
    recordCount
  );
  let expectedStart = 0;
  let predictionStarted = false;
  for (const range of ranges) {
    if (!Array.isArray(range) || range.length !== 3) {
      throw new TypeError(
        `${label} quality ranges must have three columns`
      );
    }
    const [start, end, status] = range;
    if (
      start !== expectedStart ||
      !Number.isInteger(end) ||
      end <= start ||
      end > recordCount ||
      (status !== "I" && status !== "P")
    ) {
      throw new RangeError(`Invalid ${label} quality range`);
    }
    if (predictionStarted && status === "I") {
      throw new RangeError(
        `${label} observed records cannot follow predictions`
      );
    }
    if (status === "P") predictionStarted = true;
    statuses.fill(status, start, end);
    expectedStart = end;
  }
  if (expectedStart !== recordCount) {
    throw new RangeError(
      `${label} quality ranges must cover the chunk`
    );
  }
  return statuses;
}

function decodeDeltaSeries(
  values: readonly number[],
  recordCount: number,
  label: string
): number[] {
  if (!Array.isArray(values) || values.length !== recordCount) {
    throw new RangeError(`${label} series length is invalid`);
  }
  const decoded: number[] = [];
  let value = 0;
  for (const [index, delta] of values.entries()) {
    if (!Number.isSafeInteger(delta)) {
      throw new RangeError(`${label} deltas must be safe integers`);
    }
    value = index === 0 ? delta : value + delta;
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${label} delta accumulation overflowed`);
    }
    decoded.push(value);
  }
  return decoded;
}

function validateRecords(
  records: readonly EarthOrientationDailyRecord[]
): void {
  if (records.length === 0) {
    throw new RangeError(
      "Earth-orientation records must not be empty"
    );
  }
  let previousMjd: number | null = null;
  let previousDut1: number | null = null;
  let polarMotionPredictionStarted = false;
  let dut1PredictionStarted = false;
  for (const [index, record] of records.entries()) {
    if (!Array.isArray(record) || record.length !== 9) {
      throw new TypeError(
        `Earth-orientation record ${index} must have nine columns`
      );
    }
    const [
      mjd,
      polarStatus,
      xp,
      xpError,
      yp,
      ypError,
      dut1Status,
      dut1,
      dut1Error
    ] = record;
    if (
      !Number.isInteger(mjd) ||
      (polarStatus !== "I" && polarStatus !== "P") ||
      (dut1Status !== "I" && dut1Status !== "P") ||
      !Number.isSafeInteger(xp) ||
      Math.abs(xp) > MAX_POLAR_MOTION_MICROARCSECONDS ||
      !Number.isSafeInteger(yp) ||
      Math.abs(yp) > MAX_POLAR_MOTION_MICROARCSECONDS ||
      !Number.isSafeInteger(xpError) ||
      xpError < 0 ||
      xpError > MAX_REPORTED_ERROR_MICRO_UNITS ||
      !Number.isSafeInteger(ypError) ||
      ypError < 0 ||
      ypError > MAX_REPORTED_ERROR_MICRO_UNITS ||
      !Number.isSafeInteger(dut1) ||
      Math.abs(dut1) > MAX_DUT1_MICROSECONDS ||
      !Number.isSafeInteger(dut1Error) ||
      dut1Error < 0 ||
      dut1Error > MAX_REPORTED_ERROR_MICRO_UNITS
    ) {
      throw new RangeError(
        `Earth-orientation record ${index} contains an out-of-range value`
      );
    }
    if (polarMotionPredictionStarted && polarStatus === "I") {
      throw new RangeError(
        "polar-motion observed records cannot follow predictions"
      );
    }
    if (dut1PredictionStarted && dut1Status === "I") {
      throw new RangeError(
        "DUT1 observed records cannot follow predictions"
      );
    }
    if (previousMjd !== null && mjd !== previousMjd + 1) {
      throw new RangeError(
        "Earth-orientation records must be daily and contiguous"
      );
    }
    if (previousDut1 !== null) {
      const difference =
        (dut1 - previousDut1) / MICRO_UNITS_PER_UNIT;
      if (Math.abs(difference) > 0.5) {
        const leapStep = Math.round(difference);
        if (
          Math.abs(leapStep) !== 1 ||
          Math.abs(difference - leapStep) > 0.1
        ) {
          throw new RangeError(
            "DUT1 records contain an unexplained discontinuity"
          );
        }
      }
    }
    if (polarStatus === "P") polarMotionPredictionStarted = true;
    if (dut1Status === "P") dut1PredictionStarted = true;
    previousMjd = mjd;
    previousDut1 = dut1;
  }
}

export function decodeEarthOrientationChunk(
  chunk: EncodedEarthOrientationChunkV1
): readonly EarthOrientationDailyRecord[] {
  if (
    typeof chunk !== "object" ||
    chunk === null ||
    Array.isArray(chunk)
  ) {
    throw new TypeError(
      "Earth-orientation chunk must be an object"
    );
  }
  const keys = Object.keys(chunk);
  if (
    keys.length !== CHUNK_KEYS.size ||
    keys.some((key) => !CHUNK_KEYS.has(key))
  ) {
    throw new TypeError(
      "Earth-orientation chunk has unexpected keys"
    );
  }
  if (
    chunk.schemaVersion !== 1 ||
    !Number.isInteger(chunk.startMjdUtc) ||
    !Number.isInteger(chunk.recordCount) ||
    chunk.recordCount < 1 ||
    chunk.recordCount > MAX_CHUNK_RECORDS
  ) {
    throw new RangeError(
      "Invalid Earth-orientation chunk header"
    );
  }
  const polarStatuses = decodeStatuses(
    chunk.polarMotionQualityRanges,
    chunk.recordCount,
    "polar-motion"
  );
  const dut1Statuses = decodeStatuses(
    chunk.dut1QualityRanges,
    chunk.recordCount,
    "DUT1"
  );
  const dut1 = decodeDeltaSeries(
    chunk.dut1MicrosecondsDelta,
    chunk.recordCount,
    "DUT1"
  );
  const dut1Error = decodeDeltaSeries(
    chunk.dut1ReportedErrorMicrosecondsDelta,
    chunk.recordCount,
    "DUT1 reported-error"
  );
  const xp = decodeDeltaSeries(
    chunk.xpMicroarcsecondsDelta,
    chunk.recordCount,
    "xp"
  );
  const xpError = decodeDeltaSeries(
    chunk.xpReportedErrorMicroarcsecondsDelta,
    chunk.recordCount,
    "xp reported-error"
  );
  const yp = decodeDeltaSeries(
    chunk.ypMicroarcsecondsDelta,
    chunk.recordCount,
    "yp"
  );
  const ypError = decodeDeltaSeries(
    chunk.ypReportedErrorMicroarcsecondsDelta,
    chunk.recordCount,
    "yp reported-error"
  );

  const records = Array.from(
    { length: chunk.recordCount },
    (_, index) =>
      [
        chunk.startMjdUtc + index,
        polarStatuses[index]!,
        xp[index]!,
        xpError[index]!,
        yp[index]!,
        ypError[index]!,
        dut1Statuses[index]!,
        dut1[index]!,
        dut1Error[index]!
      ] as const
  );
  validateRecords(records);
  return Object.freeze(records);
}

function exactIntegerSample(mjd: number): boolean {
  return Math.abs(mjd - Math.round(mjd)) <
    Number.EPSILON * 8;
}

function interpolateDut1(
  start: EarthOrientationDailyRecord,
  end: EarthOrientationDailyRecord | undefined,
  mjd: number
): Dut1EarthOrientationEstimate | null {
  const fraction = mjd - start[0];
  if (exactIntegerSample(mjd)) {
    return Object.freeze({
      seconds: start[7] / MICRO_UNITS_PER_UNIT,
      reportedErrorSeconds:
        start[8] / MICRO_UNITS_PER_UNIT,
      source: start[6] === "I" ? "observed" : "predicted"
    });
  }
  if (
    !end ||
    end[0] !== start[0] + 1 ||
    fraction <= 0 ||
    fraction >= 1
  ) {
    return null;
  }
  const rawDifference = end[7] - start[7];
  const leapStep =
    Math.abs(rawDifference) > MICRO_UNITS_PER_UNIT / 2
      ? Math.round(rawDifference / MICRO_UNITS_PER_UNIT) *
        MICRO_UNITS_PER_UNIT
      : 0;
  const adjustedEnd = end[7] - leapStep;
  return Object.freeze({
    seconds:
      (start[7] + fraction * (adjustedEnd - start[7])) /
      MICRO_UNITS_PER_UNIT,
    reportedErrorSeconds:
      Math.max(start[8], end[8]) / MICRO_UNITS_PER_UNIT,
    source:
      start[6] === "I" && end[6] === "I"
        ? "observed"
        : "predicted"
  });
}

function interpolatePolarMotion(
  records: readonly EarthOrientationDailyRecord[],
  exactIndex: number,
  mjd: number
): PolarMotionEstimate | null {
  if (exactIntegerSample(mjd)) {
    const record = records[exactIndex]!;
    return Object.freeze({
      xpRadians:
        (record[2] / MICRO_UNITS_PER_UNIT) *
        ARCSECONDS_TO_RADIANS,
      ypRadians:
        (record[4] / MICRO_UNITS_PER_UNIT) *
        ARCSECONDS_TO_RADIANS,
      xpReportedErrorRadians:
        (record[3] / MICRO_UNITS_PER_UNIT) *
        ARCSECONDS_TO_RADIANS,
      ypReportedErrorRadians:
        (record[5] / MICRO_UNITS_PER_UNIT) *
        ARCSECONDS_TO_RADIANS,
      source: record[1] === "I" ? "observed" : "predicted",
      usesPrediction: record[1] === "P"
    });
  }
  if (records.length < 4) return null;
  const windowStart = Math.max(
    0,
    Math.min(exactIndex - 1, records.length - 4)
  );
  const support = records.slice(windowStart, windowStart + 4);
  if (
    support.length !== 4 ||
    mjd <= records[exactIndex]![0] ||
    mjd >= records[exactIndex + 1]![0]
  ) {
    return null;
  }

  const weights = support.map((record, index) => {
    let weight = 1;
    for (const [otherIndex, other] of support.entries()) {
      if (index !== otherIndex) {
        weight *= (mjd - other[0]) / (record[0] - other[0]);
      }
    }
    return weight;
  });
  const weighted = (column: 2 | 4) =>
    support.reduce(
      (sum, record, index) =>
        sum + weights[index]! * record[column],
      0
    );
  const errorEnvelope = (column: 3 | 5) =>
    support.reduce(
      (sum, record, index) =>
        sum + Math.abs(weights[index]!) * record[column],
      0
    );
  const usesPrediction = support.some(
    (record, index) =>
      Math.abs(weights[index]!) > Number.EPSILON * 8 &&
      record[1] === "P"
  );
  const microarcsecondsToRadians =
    ARCSECONDS_TO_RADIANS / MICRO_UNITS_PER_UNIT;
  return Object.freeze({
    xpRadians: weighted(2) * microarcsecondsToRadians,
    ypRadians: weighted(4) * microarcsecondsToRadians,
    xpReportedErrorRadians:
      errorEnvelope(3) * microarcsecondsToRadians,
    ypReportedErrorRadians:
      errorEnvelope(5) * microarcsecondsToRadians,
    source: usesPrediction ? "predicted" : "observed",
    usesPrediction
  });
}

/**
 * Build a lookup over a contiguous local record window. DUT1 preserves the
 * leap-second-aware linear contract; polar motion uses the official 4-point
 * Lagrange interpolation convention and a conservative reported-error
 * envelope Σ|weight|×error because covariance is unavailable.
 */
export function createEarthOrientationLookup(
  inputRecords: readonly EarthOrientationDailyRecord[]
): (date: Date) => IersEarthOrientationEstimateV1 | null {
  validateRecords(inputRecords);
  const records = inputRecords.map((record) =>
    Object.freeze([...record] as EarthOrientationDailyRecord)
  );

  return (date: Date): IersEarthOrientationEstimateV1 | null => {
    const mjd = dateToMjdUtc(date);
    if (
      mjd === null ||
      mjd < records[0]![0] ||
      mjd > records.at(-1)![0]
    ) {
      return null;
    }
    let low = 0;
    let high = records.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (records[middle]![0] <= mjd) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    const startIndex = high;
    const dut1 = interpolateDut1(
      records[startIndex]!,
      records[startIndex + 1],
      mjd
    );
    const polarMotion = interpolatePolarMotion(
      records,
      startIndex,
      mjd
    );
    return dut1 && polarMotion
      ? Object.freeze({ dut1, polarMotion })
      : null;
  };
}

function safeDescriptorPath(file: string): boolean {
  return (
    typeof file === "string" &&
    file.length > 0 &&
    !file.startsWith("/") &&
    !file.includes("\\") &&
    !file.split("/").includes("..") &&
    /^[a-zA-Z0-9._/-]+$/.test(file)
  );
}

/**
 * Create a lazy bundled lookup. Fractional UTC times load the one or two
 * chunks needed for the 4-point PM support window; exact daily samples load
 * only their containing chunk.
 */
export function createChunkedEarthOrientationLookup(
  descriptors: readonly EarthOrientationChunkDescriptorV1[],
  loadChunk: EarthOrientationChunkLoader
): (date: Date) => Promise<IersEarthOrientationEstimateV1 | null> {
  if (descriptors.length === 0) {
    throw new RangeError(
      "Earth-orientation chunk descriptors must not be empty"
    );
  }
  const ordered = descriptors.map((descriptor) =>
    Object.freeze({ ...descriptor })
  );
  for (const [index, descriptor] of ordered.entries()) {
    if (
      !safeDescriptorPath(descriptor.file) ||
      !Number.isInteger(descriptor.startMjdUtc) ||
      !Number.isInteger(descriptor.endMjdUtc) ||
      !Number.isInteger(descriptor.recordCount) ||
      descriptor.recordCount < 1 ||
      descriptor.recordCount > MAX_CHUNK_RECORDS ||
      descriptor.endMjdUtc !==
        descriptor.startMjdUtc + descriptor.recordCount - 1 ||
      (index > 0 &&
        descriptor.startMjdUtc !==
          ordered[index - 1]!.endMjdUtc + 1)
    ) {
      throw new RangeError(
        "Invalid Earth-orientation chunk descriptor ordering"
      );
    }
  }

  const cache = new Map<
    string,
    Promise<readonly EarthOrientationDailyRecord[]>
  >();
  const load = (
    descriptor: EarthOrientationChunkDescriptorV1
  ) => {
    const cached = cache.get(descriptor.file);
    if (cached) return cached;
    const pending = loadChunk(descriptor)
      .then((chunk) => {
        const records = decodeEarthOrientationChunk(chunk);
        if (
          chunk.startMjdUtc !== descriptor.startMjdUtc ||
          chunk.recordCount !== descriptor.recordCount
        ) {
          throw new RangeError(
            "Loaded Earth-orientation chunk does not match manifest"
          );
        }
        return records;
      })
      .catch((error: unknown) => {
        cache.delete(descriptor.file);
        throw error;
      });
    cache.set(descriptor.file, pending);
    return pending;
  };

  const descriptorIndexForDay = (day: number): number => {
    let low = 0;
    let high = ordered.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (ordered[middle]!.startMjdUtc <= day) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return high;
  };

  return async (
    date: Date
  ): Promise<IersEarthOrientationEstimateV1 | null> => {
    const mjd = dateToMjdUtc(date);
    const firstMjd = ordered[0]!.startMjdUtc;
    const lastMjd = ordered.at(-1)!.endMjdUtc;
    if (mjd === null || mjd < firstMjd || mjd > lastMjd) {
      return null;
    }
    const day = Math.floor(mjd);
    const exact = exactIntegerSample(mjd);
    if (!exact && day >= lastMjd) return null;
    const supportStart = exact
      ? day
      : Math.max(firstMjd, Math.min(day - 1, lastMjd - 3));
    const supportEnd = exact ? day : supportStart + 3;
    const firstDescriptorIndex =
      descriptorIndexForDay(supportStart);
    const lastDescriptorIndex =
      descriptorIndexForDay(supportEnd);
    if (
      firstDescriptorIndex < 0 ||
      lastDescriptorIndex < firstDescriptorIndex
    ) {
      return null;
    }
    const loaded = await Promise.all(
      ordered
        .slice(firstDescriptorIndex, lastDescriptorIndex + 1)
        .map((descriptor) => load(descriptor))
    );
    const supportRecords = loaded
      .flat()
      .filter(
        (record) =>
          record[0] >= supportStart && record[0] <= supportEnd
      );
    return createEarthOrientationLookup(supportRecords)(date);
  };
}
