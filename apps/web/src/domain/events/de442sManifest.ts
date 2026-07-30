const J2000_JULIAN_DATE = 2_451_545;
const SECONDS_PER_DAY = 86_400;
const FIRST_YEAR = 1900;
const FINAL_YEAR = 2101;
const CHUNK_YEARS = 5;
const CHUNK_COUNT = 41;
const HEADER_BYTES = 32;
const DIRECTORY_ENTRY_BYTES = 32;
const SERIES_DIRECTORY_BYTES = 3 * DIRECTORY_ENTRY_BYTES;
const FIRST_DATA_OFFSET_BYTES = HEADER_BYTES + SERIES_DIRECTORY_BYTES;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const DE442S_MANIFEST_FILE = "de442s-manifest.v1.json";
export const DE442S_MODEL = "jpl-de442s-type2-float32";
export const DE442S_SOURCE_SHA256 =
  "54d97562a5b094d298b1b8eafa5a2e17e3e010ce85e1a366d07f003ad159323c";

export type De442sSeriesId = "emb" | "sun" | "moon";

export interface De442sSourceSeries {
  readonly id: De442sSeriesId;
  readonly targetNaifId: number;
  readonly centerNaifId: number;
  readonly frameNaifId: 1;
  readonly spkDataType: 2;
  readonly sourceRecordIntervalSeconds: number;
  readonly coefficientCountPerAxis: number;
  readonly degree: number;
}

export interface De442sChunkSeries extends De442sSourceSeries {
  readonly recordCount: number;
  readonly dataOffsetBytes: number;
  readonly recordStrideBytes: number;
  readonly firstRecordStartSecondsPastJ2000Tdb: number;
  readonly lastRecordEndSecondsPastJ2000Tdb: number;
  readonly sourceFirstRecordIndex: number;
  readonly sourceLastRecordIndex: number;
  readonly recordIntervalSeconds: number;
}

export interface De442sChunkManifest {
  readonly id: string;
  readonly startYear: number;
  readonly endYear: number;
  readonly startJulianDateTdb: number;
  readonly endJulianDateTdb: number;
  readonly startSecondsPastJ2000Tdb: number;
  readonly endSecondsPastJ2000Tdb: number;
  readonly file: string;
  readonly byteLength: number;
  readonly gzipByteLength: number;
  readonly sha256: string;
  readonly series: readonly De442sChunkSeries[];
}

export interface De442sManifest {
  readonly schemaVersion: 1;
  readonly model: typeof DE442S_MODEL;
  readonly source: {
    readonly release: "JPL DE442s";
    readonly sha256: typeof DE442S_SOURCE_SHA256;
  };
  readonly coverage: {
    readonly startJulianDateTdb: number;
    readonly endJulianDateTdb: number;
    readonly startSecondsPastJ2000Tdb: number;
    readonly endSecondsPastJ2000Tdb: number;
    readonly endIsIncluded: true;
    readonly chunkYears: 5;
  };
  readonly binaryFormat: {
    readonly magic: "PLDE4421";
    readonly formatVersion: 1;
    readonly byteOrder: "little-endian";
    readonly coefficientEncoding: "IEEE-754 binary32";
    readonly timeEncoding: "IEEE-754 binary64";
    readonly headerBytes: 32;
    readonly seriesDirectoryEntryBytes: 32;
  };
  readonly series: readonly De442sSourceSeries[];
  readonly chunks: readonly De442sChunkManifest[];
  readonly statistics: {
    readonly chunkCount: 41;
    readonly totalChunkBytes: number;
    readonly totalChunkGzipBytes: number;
    readonly maximumChunkBytes: number;
    readonly maximumChunkGzipBytes: number;
  };
}

interface SeriesContract {
  readonly id: De442sSeriesId;
  readonly targetNaifId: number;
  readonly centerNaifId: number;
  readonly coefficientCountPerAxis: number;
  readonly recordIntervalSeconds: number;
}

const SERIES_CONTRACTS: readonly SeriesContract[] = [
  {
    id: "emb",
    targetNaifId: 3,
    centerNaifId: 0,
    coefficientCountPerAxis: 13,
    recordIntervalSeconds: 1_382_400,
  },
  {
    id: "sun",
    targetNaifId: 10,
    centerNaifId: 0,
    coefficientCountPerAxis: 11,
    recordIntervalSeconds: 1_382_400,
  },
  {
    id: "moon",
    targetNaifId: 301,
    centerNaifId: 3,
    coefficientCountPerAxis: 13,
    recordIntervalSeconds: 345_600,
  },
];

export class De442sFormatError extends Error {
  public constructor(message: string) {
    super(`Invalid DE442s data: ${message}`);
    this.name = "De442sFormatError";
  }
}

function fail(path: string, expectation: string): never {
  throw new De442sFormatError(`${path} ${expectation}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    fail(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function onlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).find(
    (key) => !allowedKeys.has(key),
  );
  if (unexpected !== undefined) {
    fail(`${path}.${unexpected}`, "is not allowed");
  }
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    fail(path, "must be an array");
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "must be finite");
  }
  return value;
}

function integer(value: unknown, path: string): number {
  const result = finiteNumber(value, path);
  if (!Number.isSafeInteger(result)) {
    fail(path, "must be a safe integer");
  }
  return result;
}

function positiveInteger(value: unknown, path: string): number {
  const result = integer(value, path);
  if (result <= 0) {
    fail(path, "must be positive");
  }
  return result;
}

function exact<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  path: string,
): T {
  if (value !== expected) {
    fail(path, `must equal ${String(expected)}`);
  }
  return expected;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") {
    fail(path, "must be a string");
  }
  return value;
}

function nonEmptyText(value: unknown, path: string): string {
  const result = text(value, path);
  if (result.length === 0) {
    fail(path, "must not be empty");
  }
  return result;
}

function nonEmptyTextArray(value: unknown, path: string): void {
  const values = array(value, path);
  if (values.length === 0) {
    fail(path, "must not be empty");
  }
  values.forEach((entry, index) => {
    nonEmptyText(entry, `${path}[${index}]`);
  });
}

function gregorianJulianDateAtMidnight(year: number): number {
  const adjustedYear = year + 4_799;
  const adjustedMonth = 10;
  const julianDayNumber =
    1 +
    Math.floor((153 * adjustedMonth + 2) / 5) +
    365 * adjustedYear +
    Math.floor(adjustedYear / 4) -
    Math.floor(adjustedYear / 100) +
    Math.floor(adjustedYear / 400) -
    32_045;
  return julianDayNumber - 0.5;
}

function secondsPastJ2000(julianDate: number): number {
  return (julianDate - J2000_JULIAN_DATE) * SECONDS_PER_DAY;
}

function alignedRecordStride(coefficientCount: number): number {
  const usedBytes = 16 + coefficientCount * 3 * 4;
  return Math.ceil(usedBytes / 8) * 8;
}

function deepFreeze<T>(value: T): T {
  if (
    typeof value === "object" &&
    value !== null &&
    !Object.isFrozen(value)
  ) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function validateSourceSeries(
  value: unknown,
  contract: SeriesContract,
  path: string,
): De442sSourceSeries {
  const source = record(value, path);
  onlyKeys(
    source,
    [
      "id",
      "label",
      "targetNaifId",
      "centerNaifId",
      "frameNaifId",
      "frame",
      "spkDataType",
      "sourceInitialAddress",
      "sourceFinalAddress",
      "sourceStartSecondsPastJ2000Tdb",
      "sourceEndSecondsPastJ2000Tdb",
      "sourceInitialEpochSecondsPastJ2000Tdb",
      "sourceRecordIntervalSeconds",
      "sourceRecordCount",
      "coefficientCountPerAxis",
      "degree",
    ],
    path,
  );
  nonEmptyText(source.label, `${path}.label`);
  const id = exact(source.id, contract.id, `${path}.id`);
  const targetNaifId = exact(
    source.targetNaifId,
    contract.targetNaifId,
    `${path}.targetNaifId`,
  );
  const centerNaifId = exact(
    source.centerNaifId,
    contract.centerNaifId,
    `${path}.centerNaifId`,
  );
  const frameNaifId = exact(source.frameNaifId, 1, `${path}.frameNaifId`);
  const spkDataType = exact(source.spkDataType, 2, `${path}.spkDataType`);
  exact(source.frame, "J2000", `${path}.frame`);
  const coefficientCountPerAxis = exact(
    source.coefficientCountPerAxis,
    contract.coefficientCountPerAxis,
    `${path}.coefficientCountPerAxis`,
  );
  const degree = exact(
    source.degree,
    contract.coefficientCountPerAxis - 1,
    `${path}.degree`,
  );
  const sourceRecordIntervalSeconds = exact(
    source.sourceRecordIntervalSeconds,
    contract.recordIntervalSeconds,
    `${path}.sourceRecordIntervalSeconds`,
  );
  positiveInteger(source.sourceInitialAddress, `${path}.sourceInitialAddress`);
  positiveInteger(source.sourceFinalAddress, `${path}.sourceFinalAddress`);
  finiteNumber(
    source.sourceStartSecondsPastJ2000Tdb,
    `${path}.sourceStartSecondsPastJ2000Tdb`,
  );
  finiteNumber(
    source.sourceEndSecondsPastJ2000Tdb,
    `${path}.sourceEndSecondsPastJ2000Tdb`,
  );
  finiteNumber(
    source.sourceInitialEpochSecondsPastJ2000Tdb,
    `${path}.sourceInitialEpochSecondsPastJ2000Tdb`,
  );
  positiveInteger(source.sourceRecordCount, `${path}.sourceRecordCount`);
  return deepFreeze({
    id,
    targetNaifId,
    centerNaifId,
    frameNaifId,
    spkDataType,
    sourceRecordIntervalSeconds,
    coefficientCountPerAxis,
    degree,
  });
}

function validateChunkSeries(
  value: unknown,
  contract: SeriesContract,
  path: string,
): De442sChunkSeries {
  const source = record(value, path);
  onlyKeys(
    source,
    [
      "id",
      "targetNaifId",
      "centerNaifId",
      "frameNaifId",
      "spkDataType",
      "recordCount",
      "coefficientCountPerAxis",
      "degree",
      "dataOffsetBytes",
      "recordStrideBytes",
      "firstRecordStartSecondsPastJ2000Tdb",
      "lastRecordEndSecondsPastJ2000Tdb",
      "sourceFirstRecordIndex",
      "sourceLastRecordIndex",
      "recordIntervalSeconds",
    ],
    path,
  );
  const id = exact(source.id, contract.id, `${path}.id`);
  const targetNaifId = exact(
    source.targetNaifId,
    contract.targetNaifId,
    `${path}.targetNaifId`,
  );
  const centerNaifId = exact(
    source.centerNaifId,
    contract.centerNaifId,
    `${path}.centerNaifId`,
  );
  const frameNaifId = exact(source.frameNaifId, 1, `${path}.frameNaifId`);
  const spkDataType = exact(source.spkDataType, 2, `${path}.spkDataType`);
  const recordCount = positiveInteger(
    source.recordCount,
    `${path}.recordCount`,
  );
  if (recordCount > 1_000) {
    fail(`${path}.recordCount`, "exceeds the runtime safety limit");
  }
  const coefficientCountPerAxis = exact(
    source.coefficientCountPerAxis,
    contract.coefficientCountPerAxis,
    `${path}.coefficientCountPerAxis`,
  );
  const degree = exact(
    source.degree,
    contract.coefficientCountPerAxis - 1,
    `${path}.degree`,
  );
  const dataOffsetBytes = positiveInteger(
    source.dataOffsetBytes,
    `${path}.dataOffsetBytes`,
  );
  const recordStrideBytes = exact(
    source.recordStrideBytes,
    alignedRecordStride(coefficientCountPerAxis),
    `${path}.recordStrideBytes`,
  );
  const firstRecordStartSecondsPastJ2000Tdb = finiteNumber(
    source.firstRecordStartSecondsPastJ2000Tdb,
    `${path}.firstRecordStartSecondsPastJ2000Tdb`,
  );
  const lastRecordEndSecondsPastJ2000Tdb = finiteNumber(
    source.lastRecordEndSecondsPastJ2000Tdb,
    `${path}.lastRecordEndSecondsPastJ2000Tdb`,
  );
  const sourceFirstRecordIndex = integer(
    source.sourceFirstRecordIndex,
    `${path}.sourceFirstRecordIndex`,
  );
  const sourceLastRecordIndex = integer(
    source.sourceLastRecordIndex,
    `${path}.sourceLastRecordIndex`,
  );
  if (
    sourceFirstRecordIndex < 0 ||
    sourceLastRecordIndex - sourceFirstRecordIndex + 1 !== recordCount
  ) {
    fail(path, "has an inconsistent source record range");
  }
  const recordIntervalSeconds = exact(
    source.recordIntervalSeconds,
    contract.recordIntervalSeconds,
    `${path}.recordIntervalSeconds`,
  );
  return {
    id,
    targetNaifId,
    centerNaifId,
    frameNaifId,
    spkDataType,
    sourceRecordIntervalSeconds: recordIntervalSeconds,
    coefficientCountPerAxis,
    degree,
    recordCount,
    dataOffsetBytes,
    recordStrideBytes,
    firstRecordStartSecondsPastJ2000Tdb,
    lastRecordEndSecondsPastJ2000Tdb,
    sourceFirstRecordIndex,
    sourceLastRecordIndex,
    recordIntervalSeconds,
  };
}

function validateChunk(
  value: unknown,
  index: number,
): De442sChunkManifest {
  const path = `chunks[${index}]`;
  const source = record(value, path);
  onlyKeys(
    source,
    [
      "id",
      "startYear",
      "endYear",
      "startJulianDateTdb",
      "endJulianDateTdb",
      "startSecondsPastJ2000Tdb",
      "endSecondsPastJ2000Tdb",
      "file",
      "byteLength",
      "gzipByteLength",
      "sha256",
      "series",
    ],
    path,
  );
  const startYear = FIRST_YEAR + index * CHUNK_YEARS;
  const endYear = Math.min(startYear + CHUNK_YEARS, FINAL_YEAR);
  const id = `${startYear}-${endYear}`;
  exact(source.id, id, `${path}.id`);
  exact(source.startYear, startYear, `${path}.startYear`);
  exact(source.endYear, endYear, `${path}.endYear`);

  const startJulianDateTdb = gregorianJulianDateAtMidnight(startYear);
  const endJulianDateTdb = gregorianJulianDateAtMidnight(endYear);
  exact(
    source.startJulianDateTdb,
    startJulianDateTdb,
    `${path}.startJulianDateTdb`,
  );
  exact(
    source.endJulianDateTdb,
    endJulianDateTdb,
    `${path}.endJulianDateTdb`,
  );
  const startSecondsPastJ2000Tdb = secondsPastJ2000(startJulianDateTdb);
  const endSecondsPastJ2000Tdb = secondsPastJ2000(endJulianDateTdb);
  exact(
    source.startSecondsPastJ2000Tdb,
    startSecondsPastJ2000Tdb,
    `${path}.startSecondsPastJ2000Tdb`,
  );
  exact(
    source.endSecondsPastJ2000Tdb,
    endSecondsPastJ2000Tdb,
    `${path}.endSecondsPastJ2000Tdb`,
  );
  const file = exact(
    source.file,
    `shared/ephemeris/de442s/chunks/${id}.v1.bin`,
    `${path}.file`,
  );
  const byteLength = positiveInteger(
    source.byteLength,
    `${path}.byteLength`,
  );
  if (byteLength > 1_048_576) {
    fail(`${path}.byteLength`, "exceeds the runtime safety limit");
  }
  const gzipByteLength = positiveInteger(
    source.gzipByteLength,
    `${path}.gzipByteLength`,
  );
  if (gzipByteLength > byteLength) {
    fail(`${path}.gzipByteLength`, "must not exceed the raw byte length");
  }
  const sha256 = text(source.sha256, `${path}.sha256`);
  if (!SHA256_PATTERN.test(sha256)) {
    fail(`${path}.sha256`, "must be a lowercase SHA-256 digest");
  }

  const seriesValues = array(source.series, `${path}.series`);
  if (seriesValues.length !== SERIES_CONTRACTS.length) {
    fail(`${path}.series`, "must contain exactly three series");
  }
  const series = SERIES_CONTRACTS.map((contract, seriesIndex) =>
    validateChunkSeries(
      seriesValues[seriesIndex],
      contract,
      `${path}.series[${seriesIndex}]`,
    ),
  );

  let expectedOffset = FIRST_DATA_OFFSET_BYTES;
  for (const descriptor of series) {
    if (descriptor.dataOffsetBytes !== expectedOffset) {
      fail(`${path}.series`, "must describe contiguous binary data");
    }
    if (
      descriptor.firstRecordStartSecondsPastJ2000Tdb >
        startSecondsPastJ2000Tdb ||
      descriptor.lastRecordEndSecondsPastJ2000Tdb < endSecondsPastJ2000Tdb
    ) {
      fail(`${path}.series`, "must cover the complete chunk interval");
    }
    expectedOffset +=
      descriptor.recordCount * descriptor.recordStrideBytes;
  }
  if (expectedOffset !== byteLength) {
    fail(`${path}.byteLength`, "does not match the declared series layout");
  }

  return {
    id,
    startYear,
    endYear,
    startJulianDateTdb,
    endJulianDateTdb,
    startSecondsPastJ2000Tdb,
    endSecondsPastJ2000Tdb,
    file,
    byteLength,
    gzipByteLength,
    sha256,
    series,
  };
}

/**
 * Validates the pinned runtime subset, not just a permissive structural
 * schema. In particular, a manifest cannot replace the source digest, series,
 * years, or asset paths and thereby turn the loader into a generic fetcher.
 */
export function validateDe442sManifest(value: unknown): De442sManifest {
  const source = record(value, "manifest");
  onlyKeys(
    source,
    [
      "schemaVersion",
      "model",
      "source",
      "coverage",
      "units",
      "binaryFormat",
      "series",
      "chunks",
      "statistics",
    ],
    "manifest",
  );
  exact(source.schemaVersion, 1, "schemaVersion");
  exact(source.model, DE442S_MODEL, "model");

  const sourceMetadata = record(source.source, "source");
  onlyKeys(
    sourceMetadata,
    [
      "release",
      "kernelFile",
      "kernelUrl",
      "technicalCommentsUrl",
      "byteLength",
      "md5",
      "sha256",
      "binaryFileFormat",
    ],
    "source",
  );
  exact(sourceMetadata.release, "JPL DE442s", "source.release");
  exact(
    sourceMetadata.kernelFile,
    "de442s.bsp",
    "source.kernelFile",
  );
  exact(
    sourceMetadata.kernelUrl,
    "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de442s.bsp",
    "source.kernelUrl",
  );
  exact(
    sourceMetadata.technicalCommentsUrl,
    "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de442_tech-comments.txt",
    "source.technicalCommentsUrl",
  );
  exact(sourceMetadata.byteLength, 32_701_440, "source.byteLength");
  exact(
    sourceMetadata.md5,
    "cc49327e06088124c0e39d8dde9f0b58",
    "source.md5",
  );
  exact(
    sourceMetadata.sha256,
    DE442S_SOURCE_SHA256,
    "source.sha256",
  );
  exact(
    sourceMetadata.binaryFileFormat,
    "DAF/SPK LTL-IEEE",
    "source.binaryFileFormat",
  );

  const coverageSource = record(source.coverage, "coverage");
  onlyKeys(
    coverageSource,
    [
      "calendar",
      "timeScale",
      "startIsoTdb",
      "endIsoTdb",
      "startJulianDateTdb",
      "endJulianDateTdb",
      "startSecondsPastJ2000Tdb",
      "endSecondsPastJ2000Tdb",
      "endIsIncluded",
      "chunkYears",
      "chunkBoundaryRule",
    ],
    "coverage",
  );
  exact(
    coverageSource.calendar,
    "proleptic Gregorian",
    "coverage.calendar",
  );
  exact(
    coverageSource.startIsoTdb,
    "1900-01-01T00:00:00 TDB",
    "coverage.startIsoTdb",
  );
  exact(
    coverageSource.endIsoTdb,
    "2101-01-01T00:00:00 TDB",
    "coverage.endIsoTdb",
  );
  const startJulianDateTdb = exact(
    coverageSource.startJulianDateTdb,
    gregorianJulianDateAtMidnight(FIRST_YEAR),
    "coverage.startJulianDateTdb",
  );
  const endJulianDateTdb = exact(
    coverageSource.endJulianDateTdb,
    gregorianJulianDateAtMidnight(FINAL_YEAR),
    "coverage.endJulianDateTdb",
  );
  const startSecondsPastJ2000Tdb = exact(
    coverageSource.startSecondsPastJ2000Tdb,
    secondsPastJ2000(startJulianDateTdb),
    "coverage.startSecondsPastJ2000Tdb",
  );
  const endSecondsPastJ2000Tdb = exact(
    coverageSource.endSecondsPastJ2000Tdb,
    secondsPastJ2000(endJulianDateTdb),
    "coverage.endSecondsPastJ2000Tdb",
  );
  exact(coverageSource.endIsIncluded, true, "coverage.endIsIncluded");
  exact(coverageSource.chunkYears, CHUNK_YEARS, "coverage.chunkYears");
  exact(coverageSource.timeScale, "TDB", "coverage.timeScale");
  nonEmptyText(
    coverageSource.chunkBoundaryRule,
    "coverage.chunkBoundaryRule",
  );

  const unitsSource = record(source.units, "units");
  onlyKeys(
    unitsSource,
    ["position", "velocity", "recordTime", "julianDate"],
    "units",
  );
  exact(unitsSource.position, "kilometer", "units.position");
  exact(
    unitsSource.velocity,
    "kilometer per second",
    "units.velocity",
  );
  exact(
    unitsSource.recordTime,
    "TDB seconds past J2000.0",
    "units.recordTime",
  );
  exact(
    unitsSource.julianDate,
    "TDB Julian Date",
    "units.julianDate",
  );

  const binarySource = record(source.binaryFormat, "binaryFormat");
  onlyKeys(
    binarySource,
    [
      "magic",
      "formatVersion",
      "byteOrder",
      "coefficientEncoding",
      "timeEncoding",
      "headerBytes",
      "seriesDirectoryEntryBytes",
      "headerLayout",
      "directoryLayout",
      "recordLayout",
      "evaluation",
    ],
    "binaryFormat",
  );
  exact(binarySource.magic, "PLDE4421", "binaryFormat.magic");
  exact(
    binarySource.formatVersion,
    1,
    "binaryFormat.formatVersion",
  );
  exact(
    binarySource.byteOrder,
    "little-endian",
    "binaryFormat.byteOrder",
  );
  exact(
    binarySource.coefficientEncoding,
    "IEEE-754 binary32",
    "binaryFormat.coefficientEncoding",
  );
  exact(
    binarySource.timeEncoding,
    "IEEE-754 binary64",
    "binaryFormat.timeEncoding",
  );
  exact(binarySource.headerBytes, HEADER_BYTES, "binaryFormat.headerBytes");
  exact(
    binarySource.seriesDirectoryEntryBytes,
    DIRECTORY_ENTRY_BYTES,
    "binaryFormat.seriesDirectoryEntryBytes",
  );
  nonEmptyTextArray(
    binarySource.headerLayout,
    "binaryFormat.headerLayout",
  );
  nonEmptyTextArray(
    binarySource.directoryLayout,
    "binaryFormat.directoryLayout",
  );
  nonEmptyTextArray(
    binarySource.recordLayout,
    "binaryFormat.recordLayout",
  );
  nonEmptyText(binarySource.evaluation, "binaryFormat.evaluation");

  const sourceSeriesValues = array(source.series, "series");
  if (sourceSeriesValues.length !== SERIES_CONTRACTS.length) {
    fail("series", "must contain exactly three series");
  }
  const series = SERIES_CONTRACTS.map((contract, index) =>
    validateSourceSeries(sourceSeriesValues[index], contract, `series[${index}]`),
  );

  const chunkValues = array(source.chunks, "chunks");
  if (chunkValues.length !== CHUNK_COUNT) {
    fail("chunks", `must contain exactly ${CHUNK_COUNT} chunks`);
  }
  const chunks = chunkValues.map((chunk, index) =>
    validateChunk(chunk, index),
  );

  const statisticsSource = record(source.statistics, "statistics");
  onlyKeys(
    statisticsSource,
    [
      "chunkCount",
      "totalChunkBytes",
      "totalChunkGzipBytes",
      "maximumChunkBytes",
      "maximumChunkGzipBytes",
    ],
    "statistics",
  );
  exact(statisticsSource.chunkCount, CHUNK_COUNT, "statistics.chunkCount");
  const totalChunkBytes = positiveInteger(
    statisticsSource.totalChunkBytes,
    "statistics.totalChunkBytes",
  );
  const totalChunkGzipBytes = positiveInteger(
    statisticsSource.totalChunkGzipBytes,
    "statistics.totalChunkGzipBytes",
  );
  const maximumChunkBytes = positiveInteger(
    statisticsSource.maximumChunkBytes,
    "statistics.maximumChunkBytes",
  );
  const maximumChunkGzipBytes = positiveInteger(
    statisticsSource.maximumChunkGzipBytes,
    "statistics.maximumChunkGzipBytes",
  );
  const computedTotalBytes = chunks.reduce(
    (sum, chunk) => sum + chunk.byteLength,
    0,
  );
  const computedTotalGzipBytes = chunks.reduce(
    (sum, chunk) => sum + chunk.gzipByteLength,
    0,
  );
  const computedMaximumBytes = Math.max(
    ...chunks.map((chunk) => chunk.byteLength),
  );
  const computedMaximumGzipBytes = Math.max(
    ...chunks.map((chunk) => chunk.gzipByteLength),
  );
  if (
    totalChunkBytes !== computedTotalBytes ||
    totalChunkGzipBytes !== computedTotalGzipBytes ||
    maximumChunkBytes !== computedMaximumBytes ||
    maximumChunkGzipBytes !== computedMaximumGzipBytes
  ) {
    fail("statistics", "does not match the chunk inventory");
  }

  return deepFreeze({
    schemaVersion: 1,
    model: DE442S_MODEL,
    source: {
      release: "JPL DE442s",
      sha256: DE442S_SOURCE_SHA256,
    },
    coverage: {
      startJulianDateTdb,
      endJulianDateTdb,
      startSecondsPastJ2000Tdb,
      endSecondsPastJ2000Tdb,
      endIsIncluded: true,
      chunkYears: 5,
    },
    binaryFormat: {
      magic: "PLDE4421",
      formatVersion: 1,
      byteOrder: "little-endian",
      coefficientEncoding: "IEEE-754 binary32",
      timeEncoding: "IEEE-754 binary64",
      headerBytes: 32,
      seriesDirectoryEntryBytes: 32,
    },
    series,
    chunks,
    statistics: {
      chunkCount: 41,
      totalChunkBytes,
      totalChunkGzipBytes,
      maximumChunkBytes,
      maximumChunkGzipBytes,
    },
  });
}

export function selectDe442sChunk(
  manifest: De442sManifest,
  tdbJulianDate: number,
): De442sChunkManifest {
  if (!Number.isFinite(tdbJulianDate)) {
    throw new RangeError("TDB Julian date must be finite");
  }
  const { startJulianDateTdb, endJulianDateTdb } = manifest.coverage;
  if (
    tdbJulianDate < startJulianDateTdb ||
    tdbJulianDate > endJulianDateTdb
  ) {
    throw new RangeError("TDB Julian date is outside DE442s coverage");
  }
  if (tdbJulianDate === endJulianDateTdb) {
    return manifest.chunks[manifest.chunks.length - 1]!;
  }

  let lower = 0;
  let upper = manifest.chunks.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const chunk = manifest.chunks[middle]!;
    if (chunk.startJulianDateTdb <= tdbJulianDate) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }
  const chunk = manifest.chunks[Math.max(0, lower - 1)];
  if (
    chunk === undefined ||
    tdbJulianDate >= chunk.endJulianDateTdb
  ) {
    throw new RangeError("TDB Julian date has no DE442s chunk");
  }
  return chunk;
}

export function selectDe442sChunksForRange(
  manifest: De442sManifest,
  startJulianDateTdb: number,
  endJulianDateTdb: number,
): readonly De442sChunkManifest[] {
  if (
    !Number.isFinite(startJulianDateTdb) ||
    !Number.isFinite(endJulianDateTdb) ||
    endJulianDateTdb < startJulianDateTdb
  ) {
    throw new RangeError("DE442s range must be finite and ordered");
  }
  const first = selectDe442sChunk(manifest, startJulianDateTdb);
  const last = selectDe442sChunk(manifest, endJulianDateTdb);
  const firstIndex = manifest.chunks.indexOf(first);
  const lastIndex = manifest.chunks.indexOf(last);
  return manifest.chunks.slice(firstIndex, lastIndex + 1);
}
