import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  DE442S_BINARY,
  DE442S_CHUNK_YEARS,
  DE442S_END_YEAR,
  DE442S_MODEL,
  DE442S_PATHS,
  DE442S_SERIES,
  DE442S_SOURCE,
  DE442S_START_YEAR,
  SECONDS_PER_DAY,
  decodeDe442sChunk,
  digest,
  encodeDe442sChunk,
  evaluateChebyshevRecord,
  evaluateDe442sChunkSeries,
  gregorianJulianDateAtMidnight,
  parseDafSpk,
  prepareType2Segment,
  readType2Record,
  secondsPastJ2000FromJulianDate,
  type2RecordIndexAt,
  vectorDistance,
} from "./lib/de442s-ephemeris.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    check: { type: "boolean", default: false },
    "output-root": { type: "string" },
    source: { type: "string" },
  },
});

if (!values.source) {
  throw new Error(
    "Usage: node script/build_de442s_ephemeris.mjs " +
      "--source /path/to/de442s.bsp [--check]",
  );
}

const outputRoot = resolve(values["output-root"] ?? projectRoot);
const sourcePath = resolve(values.source);
const sourceBytes = await readFile(sourcePath);
const actualSourceMd5 = digest("md5", sourceBytes);
const actualSourceSha256 = digest("sha256", sourceBytes);
if (
  sourceBytes.byteLength !== DE442S_SOURCE.byteLength ||
  actualSourceMd5 !== DE442S_SOURCE.md5 ||
  actualSourceSha256 !== DE442S_SOURCE.sha256
) {
  throw new Error(
    "Unexpected DE442s source identity: " +
      `${sourceBytes.byteLength} bytes, MD5 ${actualSourceMd5}, ` +
      `SHA-256 ${actualSourceSha256}; expected ` +
      `${DE442S_SOURCE.byteLength} bytes, MD5 ${DE442S_SOURCE.md5}, ` +
      `SHA-256 ${DE442S_SOURCE.sha256}`,
  );
}

const parsedSpk = parseDafSpk(sourceBytes);
const coverageStartJulianDateTdb =
  gregorianJulianDateAtMidnight(DE442S_START_YEAR);
const coverageEndJulianDateTdb =
  gregorianJulianDateAtMidnight(DE442S_END_YEAR);
const coverageStartSecondsPastJ2000Tdb =
  secondsPastJ2000FromJulianDate(coverageStartJulianDateTdb);
const coverageEndSecondsPastJ2000Tdb =
  secondsPastJ2000FromJulianDate(coverageEndJulianDateTdb);

const preparedSeries = DE442S_SERIES.map((definition) => {
  const matches = parsedSpk.segments.filter(
    (segment) =>
      segment.targetNaifId === definition.targetNaifId &&
      segment.centerNaifId === definition.centerNaifId &&
      segment.frameNaifId === definition.frameNaifId &&
      segment.spkDataType === definition.spkDataType,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${definition.id} Type 2 segment, found ${matches.length}`,
    );
  }
  const segment = prepareType2Segment(parsedSpk.source, matches[0]);
  if (
    segment.initialAddress !== definition.sourceInitialAddress ||
    segment.finalAddress !== definition.sourceFinalAddress ||
    segment.degree !== definition.expectedDegree ||
    segment.recordIntervalSeconds !==
      definition.expectedRecordIntervalSeconds ||
    segment.startSecondsPastJ2000Tdb >
      coverageStartSecondsPastJ2000Tdb ||
    segment.endSecondsPastJ2000Tdb < coverageEndSecondsPastJ2000Tdb
  ) {
    throw new Error(
      `Pinned ${definition.id} Type 2 segment metadata is unexpected`,
    );
  }
  return { definition, segment };
});

function sourceRecordsForInterval(segment, startSeconds, endSeconds) {
  const firstRecordIndex = type2RecordIndexAt(segment, startSeconds);
  const lastRecordIndex = type2RecordIndexAt(segment, endSeconds);
  const records = [];
  for (
    let recordIndex = firstRecordIndex;
    recordIndex <= lastRecordIndex;
    recordIndex += 1
  ) {
    records.push(readType2Record(parsedSpk.source, segment, recordIndex));
  }
  return { firstRecordIndex, lastRecordIndex, records };
}

const generatedChunks = [];
for (
  let startYear = DE442S_START_YEAR;
  startYear < DE442S_END_YEAR;
  startYear += DE442S_CHUNK_YEARS
) {
  const endYear = Math.min(
    startYear + DE442S_CHUNK_YEARS,
    DE442S_END_YEAR,
  );
  const startJulianDateTdb = gregorianJulianDateAtMidnight(startYear);
  const endJulianDateTdb = gregorianJulianDateAtMidnight(endYear);
  const startSecondsPastJ2000Tdb =
    secondsPastJ2000FromJulianDate(startJulianDateTdb);
  const endSecondsPastJ2000Tdb =
    secondsPastJ2000FromJulianDate(endJulianDateTdb);
  const sourceRecords = preparedSeries.map(({ definition, segment }) => ({
    definition,
    segment,
    ...sourceRecordsForInterval(
      segment,
      startSecondsPastJ2000Tdb,
      endSecondsPastJ2000Tdb,
    ),
  }));
  const encoded = encodeDe442sChunk({
    chunkStartSecondsPastJ2000Tdb: startSecondsPastJ2000Tdb,
    chunkEndSecondsPastJ2000Tdb: endSecondsPastJ2000Tdb,
    recordsBySeries: sourceRecords,
  });
  const id = `${startYear}-${endYear}`;
  const file = `${DE442S_PATHS.chunks}/${id}.v1.bin`;
  generatedChunks.push({
    id,
    startYear,
    endYear,
    startJulianDateTdb,
    endJulianDateTdb,
    startSecondsPastJ2000Tdb,
    endSecondsPastJ2000Tdb,
    file,
    byteLength: encoded.buffer.byteLength,
    gzipByteLength: gzipSync(encoded.buffer, { level: 9 }).byteLength,
    sha256: digest("sha256", encoded.buffer),
    series: encoded.descriptors.map((descriptor, seriesIndex) => ({
      ...descriptor,
      sourceFirstRecordIndex:
        sourceRecords[seriesIndex].firstRecordIndex,
      sourceLastRecordIndex:
        sourceRecords[seriesIndex].lastRecordIndex,
      recordIntervalSeconds:
        sourceRecords[seriesIndex].segment.recordIntervalSeconds,
    })),
    buffer: encoded.buffer,
    decoded: decodeDe442sChunk(encoded.buffer),
  });
}

const totalChunkBytes = generatedChunks.reduce(
  (sum, chunk) => sum + chunk.byteLength,
  0,
);
const totalChunkGzipBytes = generatedChunks.reduce(
  (sum, chunk) => sum + chunk.gzipByteLength,
  0,
);
const manifest = {
  schemaVersion: 1,
  model: DE442S_MODEL,
  source: {
    release: "JPL DE442s",
    kernelFile: "de442s.bsp",
    kernelUrl: DE442S_SOURCE.url,
    technicalCommentsUrl:
      "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/" +
      "planets/de442_tech-comments.txt",
    byteLength: DE442S_SOURCE.byteLength,
    md5: DE442S_SOURCE.md5,
    sha256: DE442S_SOURCE.sha256,
    binaryFileFormat: "DAF/SPK LTL-IEEE",
  },
  coverage: {
    calendar: "proleptic Gregorian",
    timeScale: "TDB",
    startIsoTdb: "1900-01-01T00:00:00 TDB",
    endIsoTdb: "2101-01-01T00:00:00 TDB",
    startJulianDateTdb: coverageStartJulianDateTdb,
    endJulianDateTdb: coverageEndJulianDateTdb,
    startSecondsPastJ2000Tdb: coverageStartSecondsPastJ2000Tdb,
    endSecondsPastJ2000Tdb: coverageEndSecondsPastJ2000Tdb,
    endIsIncluded: true,
    chunkYears: DE442S_CHUNK_YEARS,
    chunkBoundaryRule:
      "start-inclusive/end-exclusive selection except artifact end; " +
      "the source record selected at each boundary is duplicated",
  },
  units: {
    position: "kilometer",
    velocity: "kilometer per second",
    recordTime: "TDB seconds past J2000.0",
    julianDate: "TDB Julian Date",
  },
  binaryFormat: {
    magic: DE442S_BINARY.magic,
    formatVersion: DE442S_BINARY.formatVersion,
    byteOrder: DE442S_BINARY.byteOrder,
    coefficientEncoding: DE442S_BINARY.coefficientEncoding,
    timeEncoding: DE442S_BINARY.timeEncoding,
    headerBytes: DE442S_BINARY.headerBytes,
    seriesDirectoryEntryBytes:
      DE442S_BINARY.seriesDirectoryEntryBytes,
    headerLayout: [
      "0:8 ASCII magic",
      "8:4 UInt32 formatVersion",
      "12:4 UInt32 seriesCount",
      "16:8 Float64 chunkStartSecondsPastJ2000Tdb",
      "24:8 Float64 chunkEndSecondsPastJ2000Tdb",
    ],
    directoryLayout: [
      "0:4 Int32 targetNaifId",
      "4:4 Int32 centerNaifId",
      "8:4 Int32 frameNaifId",
      "12:4 Int32 spkDataType",
      "16:4 UInt32 recordCount",
      "20:4 UInt32 coefficientCountPerAxis",
      "24:4 UInt32 dataOffsetBytes",
      "28:4 UInt32 recordStrideBytes",
    ],
    recordLayout: [
      "0:8 Float64 midpointSecondsPastJ2000Tdb",
      "8:8 Float64 radiusSeconds",
      "16: Float32 coefficients in X then Y then Z order",
      "zero padding to an 8-byte-aligned recordStrideBytes",
    ],
    evaluation:
      "position = sum(c[k] * T_k(tau)); " +
      "velocity = d(position)/d(tau) / radiusSeconds; " +
      "tau = (epochSeconds - midpointSeconds) / radiusSeconds",
  },
  series: preparedSeries.map(({ definition, segment }) => ({
    id: definition.id,
    label: definition.label,
    targetNaifId: definition.targetNaifId,
    centerNaifId: definition.centerNaifId,
    frameNaifId: definition.frameNaifId,
    frame: "J2000",
    spkDataType: definition.spkDataType,
    sourceInitialAddress: segment.initialAddress,
    sourceFinalAddress: segment.finalAddress,
    sourceStartSecondsPastJ2000Tdb:
      segment.startSecondsPastJ2000Tdb,
    sourceEndSecondsPastJ2000Tdb: segment.endSecondsPastJ2000Tdb,
    sourceInitialEpochSecondsPastJ2000Tdb:
      segment.initialEpochSeconds,
    sourceRecordIntervalSeconds: segment.recordIntervalSeconds,
    sourceRecordCount: segment.recordCount,
    coefficientCountPerAxis: segment.coefficientCountPerAxis,
    degree: segment.degree,
  })),
  chunks: generatedChunks.map((generatedChunk) => {
    const chunk = { ...generatedChunk };
    delete chunk.buffer;
    delete chunk.decoded;
    return chunk;
  }),
  statistics: {
    chunkCount: generatedChunks.length,
    totalChunkBytes,
    totalChunkGzipBytes,
    maximumChunkBytes: Math.max(
      ...generatedChunks.map((chunk) => chunk.byteLength),
    ),
    maximumChunkGzipBytes: Math.max(
      ...generatedChunks.map((chunk) => chunk.gzipByteLength),
    ),
  },
};

function sourceState(seriesIndex, secondsPastJ2000Tdb) {
  const segment = preparedSeries[seriesIndex].segment;
  const recordIndex = type2RecordIndexAt(
    segment,
    secondsPastJ2000Tdb,
  );
  return evaluateChebyshevRecord(
    readType2Record(parsedSpk.source, segment, recordIndex),
    secondsPastJ2000Tdb,
  );
}

const maxima = Object.fromEntries(
  DE442S_SERIES.map(({ id }) => [
    id,
    {
      positionErrorKilometers: 0,
      velocityErrorKilometersPerSecond: 0,
    },
  ]),
);

const quantizationGridMaximumErrors = Object.fromEntries(
  DE442S_SERIES.map(({ id }) => [
    id,
    {
      positionErrorKilometers: 0,
      velocityErrorKilometersPerSecond: 0,
    },
  ]),
);
let quantizationGridEvaluationCount = 0;
for (let seriesIndex = 0; seriesIndex < preparedSeries.length; seriesIndex += 1) {
  const { definition, segment } = preparedSeries[seriesIndex];
  const firstRecordIndex = type2RecordIndexAt(
    segment,
    coverageStartSecondsPastJ2000Tdb,
  );
  const lastRecordIndex = type2RecordIndexAt(
    segment,
    coverageEndSecondsPastJ2000Tdb,
  );
  for (
    let recordIndex = firstRecordIndex;
    recordIndex <= lastRecordIndex;
    recordIndex += 1
  ) {
    const sourceRecord = readType2Record(
      parsedSpk.source,
      segment,
      recordIndex,
    );
    const packedRecord = {
      ...sourceRecord,
      coefficients: sourceRecord.coefficients.map((axis) =>
        axis.map((coefficient) => Math.fround(coefficient)),
      ),
    };
    const recordStart = Math.max(
      coverageStartSecondsPastJ2000Tdb,
      sourceRecord.midpointSecondsPastJ2000Tdb -
        sourceRecord.radiusSeconds,
    );
    const recordEnd = Math.min(
      coverageEndSecondsPastJ2000Tdb,
      sourceRecord.midpointSecondsPastJ2000Tdb +
        sourceRecord.radiusSeconds,
    );
    for (const epoch of new Set([
      recordStart,
      (recordStart + recordEnd) / 2,
      recordEnd,
    ])) {
      const expected = evaluateChebyshevRecord(sourceRecord, epoch);
      const actual = evaluateChebyshevRecord(packedRecord, epoch);
      const positionErrorKilometers = vectorDistance(
        expected.positionKilometers,
        actual.positionKilometers,
      );
      const velocityErrorKilometersPerSecond = vectorDistance(
        expected.velocityKilometersPerSecond,
        actual.velocityKilometersPerSecond,
      );
      if (
        positionErrorKilometers >
          definition.positionToleranceKilometers ||
        velocityErrorKilometersPerSecond >
          definition.velocityToleranceKilometersPerSecond
      ) {
        throw new Error(
          `${definition.id} dense Float32 error at ${epoch}: ` +
            `${positionErrorKilometers} km, ` +
            `${velocityErrorKilometersPerSecond} km/s`,
        );
      }
      quantizationGridMaximumErrors[
        definition.id
      ].positionErrorKilometers = Math.max(
        quantizationGridMaximumErrors[definition.id]
          .positionErrorKilometers,
        positionErrorKilometers,
      );
      quantizationGridMaximumErrors[
        definition.id
      ].velocityErrorKilometersPerSecond = Math.max(
        quantizationGridMaximumErrors[definition.id]
          .velocityErrorKilometersPerSecond,
        velocityErrorKilometersPerSecond,
      );
      quantizationGridEvaluationCount += 1;
    }
  }
}

function comparisonForChunk(chunk, seriesIndex, secondsPastJ2000Tdb) {
  const definition = DE442S_SERIES[seriesIndex];
  const expected = sourceState(seriesIndex, secondsPastJ2000Tdb);
  const actual = evaluateDe442sChunkSeries(
    chunk.decoded,
    chunk.decoded.descriptors[seriesIndex],
    secondsPastJ2000Tdb,
  );
  const positionErrorKilometers = vectorDistance(
    expected.positionKilometers,
    actual.positionKilometers,
  );
  const velocityErrorKilometersPerSecond = vectorDistance(
    expected.velocityKilometersPerSecond,
    actual.velocityKilometersPerSecond,
  );
  if (
    positionErrorKilometers > definition.positionToleranceKilometers ||
    velocityErrorKilometersPerSecond >
      definition.velocityToleranceKilometersPerSecond
  ) {
    throw new Error(
      `${definition.id} Float32 error at ${secondsPastJ2000Tdb}: ` +
        `${positionErrorKilometers} km, ` +
        `${velocityErrorKilometersPerSecond} km/s`,
    );
  }
  maxima[definition.id].positionErrorKilometers = Math.max(
    maxima[definition.id].positionErrorKilometers,
    positionErrorKilometers,
  );
  maxima[definition.id].velocityErrorKilometersPerSecond = Math.max(
    maxima[definition.id].velocityErrorKilometersPerSecond,
    velocityErrorKilometersPerSecond,
  );
  return {
    seriesId: definition.id,
    sourcePositionKilometers: expected.positionKilometers,
    sourceVelocityKilometersPerSecond:
      expected.velocityKilometersPerSecond,
    packedPositionKilometers: actual.positionKilometers,
    packedVelocityKilometersPerSecond:
      actual.velocityKilometersPerSecond,
    positionErrorKilometers,
    velocityErrorKilometersPerSecond,
  };
}

const boundaryYears = [
  ...generatedChunks.map((chunk) => chunk.startYear),
  DE442S_END_YEAR,
];
const boundaryCases = boundaryYears.map((year) => {
  const julianDateTdb = gregorianJulianDateAtMidnight(year);
  const secondsPastJ2000Tdb =
    secondsPastJ2000FromJulianDate(julianDateTdb);
  const containingChunks = generatedChunks.filter(
    (chunk) =>
      secondsPastJ2000Tdb >= chunk.startSecondsPastJ2000Tdb &&
      secondsPastJ2000Tdb <= chunk.endSecondsPastJ2000Tdb,
  );
  return {
    id: `boundary-${year}`,
    year,
    julianDateTdb,
    secondsPastJ2000Tdb,
    chunks: containingChunks.map((chunk) => ({
      chunkId: chunk.id,
      series: DE442S_SERIES.map((_definition, seriesIndex) =>
        comparisonForChunk(chunk, seriesIndex, secondsPastJ2000Tdb),
      ),
    })),
  };
});

const fixedSampleDefinitions = [
  {
    id: "sample-1900-midyear",
    julianDateTdb: gregorianJulianDateAtMidnight(1900, 7, 1) + 0.25,
  },
  {
    id: "sample-1919-eclipse-era",
    julianDateTdb: gregorianJulianDateAtMidnight(1919, 5, 29) + 0.5,
  },
  {
    id: "sample-1950-start",
    julianDateTdb: gregorianJulianDateAtMidnight(1950),
  },
  {
    id: "sample-1970-start",
    julianDateTdb: gregorianJulianDateAtMidnight(1970),
  },
  {
    id: "sample-j2000",
    julianDateTdb: gregorianJulianDateAtMidnight(2000) + 0.5,
  },
  {
    id: "sample-2026-eclipse-era",
    julianDateTdb: gregorianJulianDateAtMidnight(2026, 8, 12) + 0.5,
  },
  {
    id: "sample-2050-midyear",
    julianDateTdb: gregorianJulianDateAtMidnight(2050, 7, 1) + 0.75,
  },
  {
    id: "sample-2099-final-day",
    julianDateTdb: gregorianJulianDateAtMidnight(2099, 12, 31) + 0.5,
  },
  {
    id: "sample-before-coverage-end",
    julianDateTdb:
      gregorianJulianDateAtMidnight(DE442S_END_YEAR) - 1 / SECONDS_PER_DAY,
  },
];

const sampleCases = fixedSampleDefinitions.map(({ id, julianDateTdb }) => {
  const secondsPastJ2000Tdb =
    secondsPastJ2000FromJulianDate(julianDateTdb);
  const chunk = generatedChunks.find(
    (candidate) =>
      secondsPastJ2000Tdb >= candidate.startSecondsPastJ2000Tdb &&
      (secondsPastJ2000Tdb < candidate.endSecondsPastJ2000Tdb ||
        candidate.endYear === DE442S_END_YEAR),
  );
  if (!chunk) {
    throw new Error(`No chunk contains fixed sample ${id}`);
  }
  return {
    id,
    julianDateTdb,
    secondsPastJ2000Tdb,
    chunkId: chunk.id,
    series: DE442S_SERIES.map((_definition, seriesIndex) =>
      comparisonForChunk(chunk, seriesIndex, secondsPastJ2000Tdb),
    ),
  };
});

const fixture = {
  schemaVersion: 1,
  model: DE442S_MODEL,
  oracle:
    "direct Float64 evaluation of the pinned JPL DE442s Type 2 records",
  sourceSha256: DE442S_SOURCE.sha256,
  comparison:
    "packed records retain Float64 midpoint/radius and quantize only " +
    "Chebyshev coefficients to little-endian Float32",
  units: {
    position: "kilometer",
    velocity: "kilometer per second",
    recordTime: "TDB seconds past J2000.0",
    julianDate: "TDB Julian Date",
  },
  tolerances: DE442S_SERIES.map((definition) => ({
    seriesId: definition.id,
    positionErrorKilometers: definition.positionToleranceKilometers,
    velocityErrorKilometersPerSecond:
      definition.velocityToleranceKilometersPerSecond,
  })),
  boundaryCases,
  sampleCases,
  summary: {
    boundaryCount: boundaryCases.length,
    boundaryChunkComparisonCount: boundaryCases.reduce(
      (sum, boundary) => sum + boundary.chunks.length,
      0,
    ),
    sampleCount: sampleCases.length,
    maximumErrorsBySeries: DE442S_SERIES.map(({ id }) => ({
      seriesId: id,
      ...maxima[id],
    })),
    quantizationGrid: {
      rule:
        "each source record clipped to artifact coverage at start, " +
        "midpoint, and end",
      evaluationCount: quantizationGridEvaluationCount,
      maximumErrorsBySeries: DE442S_SERIES.map(({ id }) => ({
        seriesId: id,
        ...quantizationGridMaximumErrors[id],
      })),
    },
  },
};

const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
const serializedFixture = `${JSON.stringify(fixture, null, 2)}\n`;

async function compareGeneratedFile(relativePath, expected) {
  const absolutePath = join(outputRoot, relativePath);
  let actual;
  try {
    actual = await readFile(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${absolutePath} is missing`, { cause: error });
    }
    throw error;
  }
  const expectedBytes = Buffer.isBuffer(expected)
    ? expected
    : Buffer.from(expected, "utf8");
  if (!actual.equals(expectedBytes)) {
    throw new Error(
      `${absolutePath} is not reproducible from ${sourcePath}`,
    );
  }
}

if (values.check) {
  await compareGeneratedFile(DE442S_PATHS.manifest, serializedManifest);
  await compareGeneratedFile(DE442S_PATHS.fixture, serializedFixture);
  for (const chunk of generatedChunks) {
    await compareGeneratedFile(chunk.file, chunk.buffer);
  }
  const chunksDirectory = join(outputRoot, DE442S_PATHS.chunks);
  const actualChunkNames = (await readdir(chunksDirectory))
    .filter((name) => name.endsWith(".bin"))
    .sort();
  const expectedChunkNames = generatedChunks
    .map((chunk) => chunk.file.split("/").at(-1))
    .sort();
  if (
    actualChunkNames.length !== expectedChunkNames.length ||
    actualChunkNames.some(
      (name, index) => name !== expectedChunkNames[index],
    )
  ) {
    throw new Error(`${chunksDirectory} contains an unexpected chunk set`);
  }
  console.log(
    `DE442s: ${generatedChunks.length} chunks / ` +
      `${boundaryCases.length} boundaries / ` +
      `${sampleCases.length} samples reproduced`,
  );
} else {
  await mkdir(
    join(outputRoot, dirname(DE442S_PATHS.manifest)),
    { recursive: true },
  );
  await mkdir(join(outputRoot, DE442S_PATHS.chunks), { recursive: true });
  await mkdir(
    join(outputRoot, dirname(DE442S_PATHS.fixture)),
    { recursive: true },
  );
  await Promise.all([
    writeFile(
      join(outputRoot, DE442S_PATHS.manifest),
      serializedManifest,
    ),
    writeFile(
      join(outputRoot, DE442S_PATHS.fixture),
      serializedFixture,
    ),
    ...generatedChunks.map((chunk) =>
      writeFile(join(outputRoot, chunk.file), chunk.buffer),
    ),
  ]);
  console.log(
    `DE442s: ${generatedChunks.length} chunks / ` +
      `${totalChunkBytes} bytes generated under ` +
      `${join(outputRoot, DE442S_PATHS.directory)}`,
  );
}
