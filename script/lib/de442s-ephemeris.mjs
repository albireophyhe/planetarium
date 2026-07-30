import { createHash } from "node:crypto";

export const DE442S_SOURCE = Object.freeze({
  byteLength: 32_701_440,
  md5: "cc49327e06088124c0e39d8dde9f0b58",
  sha256:
    "54d97562a5b094d298b1b8eafa5a2e17e3e010ce85e1a366d07f003ad159323c",
  url:
    "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/" +
    "planets/de442s.bsp",
});

export const DE442S_PATHS = Object.freeze({
  directory: "shared/ephemeris/de442s",
  manifest: "shared/ephemeris/de442s/de442s-manifest.v1.json",
  chunks: "shared/ephemeris/de442s/chunks",
  fixture: "shared/fixtures/de442s-ephemeris.v1.json",
});

export const DE442S_MODEL = "jpl-de442s-type2-float32";
export const DE442S_START_YEAR = 1900;
export const DE442S_END_YEAR = 2101;
export const DE442S_CHUNK_YEARS = 5;
export const J2000_JULIAN_DATE_TDB = 2_451_545;
export const SECONDS_PER_DAY = 86_400;

export const DE442S_SERIES = Object.freeze([
  Object.freeze({
    id: "emb",
    label: "SSB to Earth-Moon barycenter",
    targetNaifId: 3,
    centerNaifId: 0,
    frameNaifId: 1,
    spkDataType: 2,
    sourceInitialAddress: 2_984_680,
    sourceFinalAddress: 3_265_574,
    expectedDegree: 12,
    expectedRecordIntervalSeconds: 1_382_400,
    positionToleranceKilometers: 20,
    velocityToleranceKilometersPerSecond: 0.000_01,
  }),
  Object.freeze({
    id: "sun",
    label: "SSB to Sun",
    targetNaifId: 10,
    centerNaifId: 0,
    frameNaifId: 1,
    spkDataType: 2,
    sourceInitialAddress: 2_251_523,
    sourceFinalAddress: 2_491_311,
    expectedDegree: 10,
    expectedRecordIntervalSeconds: 1_382_400,
    positionToleranceKilometers: 0.5,
    velocityToleranceKilometersPerSecond: 0.000_001,
  }),
  Object.freeze({
    id: "moon",
    label: "Earth-Moon barycenter to Moon",
    targetNaifId: 301,
    centerNaifId: 3,
    frameNaifId: 1,
    spkDataType: 2,
    sourceInitialAddress: 1_128_078,
    sourceFinalAddress: 2_251_522,
    expectedDegree: 12,
    expectedRecordIntervalSeconds: 345_600,
    positionToleranceKilometers: 0.1,
    velocityToleranceKilometersPerSecond: 0.000_001,
  }),
]);

export const DE442S_BINARY = Object.freeze({
  magic: "PLDE4421",
  formatVersion: 1,
  byteOrder: "little-endian",
  coefficientEncoding: "IEEE-754 binary32",
  timeEncoding: "IEEE-754 binary64",
  headerBytes: 32,
  seriesDirectoryEntryBytes: 32,
});

const DAF_RECORD_BYTES = 1_024;
const DAF_SUMMARY_CONTROL_WORDS = 3;
const DAF_EXPECTED_DOUBLE_COMPONENTS = 2;
const DAF_EXPECTED_INTEGER_COMPONENTS = 6;

export function digest(algorithm, value) {
  return createHash(algorithm).update(value).digest("hex");
}

export function gregorianJulianDateAtMidnight(year, month = 1, day = 1) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error("Gregorian calendar components must be integers in range");
  }
  let adjustedYear = year;
  let adjustedMonth = month;
  if (adjustedMonth <= 2) {
    adjustedYear -= 1;
    adjustedMonth += 12;
  }
  const century = Math.floor(adjustedYear / 100);
  const correction = 2 - century + Math.floor(century / 4);
  return (
    Math.floor(365.25 * (adjustedYear + 4_716)) +
    Math.floor(30.6001 * (adjustedMonth + 1)) +
    day +
    correction -
    1_524.5
  );
}

export function secondsPastJ2000FromJulianDate(julianDateTdb) {
  return (julianDateTdb - J2000_JULIAN_DATE_TDB) * SECONDS_PER_DAY;
}

export function julianDateFromSecondsPastJ2000(secondsPastJ2000Tdb) {
  return (
    J2000_JULIAN_DATE_TDB + secondsPastJ2000Tdb / SECONDS_PER_DAY
  );
}

function fail(message) {
  throw new Error(`DE442s: ${message}`);
}

function integerFromDafDouble(value, label) {
  if (!Number.isSafeInteger(value)) {
    fail(`${label} is not a safe integer`);
  }
  return value;
}

export function parseDafSpk(sourceBytes) {
  const source = Buffer.from(sourceBytes);
  if (source.byteLength !== DE442S_SOURCE.byteLength) {
    fail(
      `source byte length ${source.byteLength} does not match ` +
        `${DE442S_SOURCE.byteLength}`,
    );
  }
  if (source.subarray(0, 8).toString("ascii") !== "DAF/SPK ") {
    fail("source is not a DAF/SPK kernel");
  }
  if (source.subarray(88, 96).toString("ascii") !== "LTL-IEEE") {
    fail("only the pinned LTL-IEEE kernel is supported");
  }
  const doubleComponents = source.readInt32LE(8);
  const integerComponents = source.readInt32LE(12);
  if (
    doubleComponents !== DAF_EXPECTED_DOUBLE_COMPONENTS ||
    integerComponents !== DAF_EXPECTED_INTEGER_COMPONENTS
  ) {
    fail(
      `unexpected DAF summary format ND=${doubleComponents} ` +
        `NI=${integerComponents}`,
    );
  }

  const summaryDoubleWords =
    doubleComponents + Math.floor((integerComponents + 1) / 2);
  const summaryBytes = summaryDoubleWords * 8;
  let recordNumber = source.readInt32LE(76);
  const visitedRecords = new Set();
  const segments = [];

  while (recordNumber !== 0) {
    if (
      !Number.isInteger(recordNumber) ||
      recordNumber < 1 ||
      recordNumber * DAF_RECORD_BYTES > source.byteLength
    ) {
      fail(`summary record number ${recordNumber} is outside the source`);
    }
    if (visitedRecords.has(recordNumber)) {
      fail(`summary record chain contains a cycle at ${recordNumber}`);
    }
    visitedRecords.add(recordNumber);
    const recordOffset = (recordNumber - 1) * DAF_RECORD_BYTES;
    const nextRecord = integerFromDafDouble(
      source.readDoubleLE(recordOffset),
      "next summary record",
    );
    const summaryCount = integerFromDafDouble(
      source.readDoubleLE(recordOffset + 16),
      "summary count",
    );
    const maximumSummaryCount = Math.floor(
      (DAF_RECORD_BYTES - DAF_SUMMARY_CONTROL_WORDS * 8) / summaryBytes,
    );
    if (summaryCount < 0 || summaryCount > maximumSummaryCount) {
      fail(`summary count ${summaryCount} is invalid`);
    }

    for (let index = 0; index < summaryCount; index += 1) {
      const offset =
        recordOffset + DAF_SUMMARY_CONTROL_WORDS * 8 + index * summaryBytes;
      segments.push({
        startSecondsPastJ2000Tdb: source.readDoubleLE(offset),
        endSecondsPastJ2000Tdb: source.readDoubleLE(offset + 8),
        targetNaifId: source.readInt32LE(offset + 16),
        centerNaifId: source.readInt32LE(offset + 20),
        frameNaifId: source.readInt32LE(offset + 24),
        spkDataType: source.readInt32LE(offset + 28),
        initialAddress: source.readInt32LE(offset + 32),
        finalAddress: source.readInt32LE(offset + 36),
      });
    }
    recordNumber = nextRecord;
  }

  return { source, segments };
}

export function prepareType2Segment(source, summary) {
  if (summary.spkDataType !== 2) {
    fail(
      `target ${summary.targetNaifId} center ${summary.centerNaifId} ` +
        `is SPK type ${summary.spkDataType}, not Type 2`,
    );
  }
  const segmentStartByte = (summary.initialAddress - 1) * 8;
  const segmentEndByte = summary.finalAddress * 8;
  if (
    segmentStartByte < 0 ||
    segmentEndByte > source.byteLength ||
    segmentEndByte - segmentStartByte < 32
  ) {
    fail("Type 2 segment addresses are outside the source");
  }
  const initialEpochSeconds = source.readDoubleLE(segmentEndByte - 32);
  const recordIntervalSeconds = source.readDoubleLE(segmentEndByte - 24);
  const recordSizeDoubleWords = integerFromDafDouble(
    source.readDoubleLE(segmentEndByte - 16),
    "Type 2 record size",
  );
  const recordCount = integerFromDafDouble(
    source.readDoubleLE(segmentEndByte - 8),
    "Type 2 record count",
  );
  const coefficientWords = recordSizeDoubleWords - 2;
  if (
    recordIntervalSeconds <= 0 ||
    recordCount <= 0 ||
    coefficientWords <= 0 ||
    coefficientWords % 3 !== 0
  ) {
    fail("Type 2 trailer is invalid");
  }
  const expectedDoubleWords = recordCount * recordSizeDoubleWords + 4;
  const actualDoubleWords = summary.finalAddress - summary.initialAddress + 1;
  if (expectedDoubleWords !== actualDoubleWords) {
    fail(
      `Type 2 segment length ${actualDoubleWords} does not match ` +
        `${expectedDoubleWords}`,
    );
  }
  const coefficientCountPerAxis = coefficientWords / 3;
  const degree = coefficientCountPerAxis - 1;

  return {
    ...summary,
    initialEpochSeconds,
    recordIntervalSeconds,
    recordSizeDoubleWords,
    recordCount,
    coefficientCountPerAxis,
    degree,
    segmentStartByte,
    segmentEndByte,
  };
}

export function readType2Record(source, segment, recordIndex) {
  if (
    !Number.isInteger(recordIndex) ||
    recordIndex < 0 ||
    recordIndex >= segment.recordCount
  ) {
    fail(`Type 2 record index ${recordIndex} is outside the segment`);
  }
  const offset =
    segment.segmentStartByte +
    recordIndex * segment.recordSizeDoubleWords * 8;
  const midpointSecondsPastJ2000Tdb = source.readDoubleLE(offset);
  const radiusSeconds = source.readDoubleLE(offset + 8);
  if (
    !Number.isFinite(midpointSecondsPastJ2000Tdb) ||
    !Number.isFinite(radiusSeconds) ||
    radiusSeconds <= 0
  ) {
    fail(`Type 2 record ${recordIndex} has an invalid time interval`);
  }
  const coefficients = [[], [], []];
  let coefficientOffset = offset + 16;
  for (const axis of coefficients) {
    for (
      let coefficientIndex = 0;
      coefficientIndex < segment.coefficientCountPerAxis;
      coefficientIndex += 1
    ) {
      const coefficient = source.readDoubleLE(coefficientOffset);
      if (!Number.isFinite(coefficient)) {
        fail(
          `Type 2 record ${recordIndex} contains a non-finite coefficient`,
        );
      }
      axis.push(coefficient);
      coefficientOffset += 8;
    }
  }
  return {
    midpointSecondsPastJ2000Tdb,
    radiusSeconds,
    coefficients,
  };
}

export function type2RecordIndexAt(segment, secondsPastJ2000Tdb) {
  if (
    !Number.isFinite(secondsPastJ2000Tdb) ||
    secondsPastJ2000Tdb < segment.startSecondsPastJ2000Tdb ||
    secondsPastJ2000Tdb > segment.endSecondsPastJ2000Tdb
  ) {
    fail(`epoch ${secondsPastJ2000Tdb} is outside the Type 2 segment`);
  }
  if (secondsPastJ2000Tdb === segment.endSecondsPastJ2000Tdb) {
    return segment.recordCount - 1;
  }
  const index = Math.floor(
    (secondsPastJ2000Tdb - segment.initialEpochSeconds) /
      segment.recordIntervalSeconds,
  );
  if (index < 0 || index >= segment.recordCount) {
    fail(`epoch ${secondsPastJ2000Tdb} did not resolve to a Type 2 record`);
  }
  return index;
}

export function evaluateChebyshevRecord(record, secondsPastJ2000Tdb) {
  const normalizedTime =
    (secondsPastJ2000Tdb - record.midpointSecondsPastJ2000Tdb) /
    record.radiusSeconds;
  if (normalizedTime < -1.000_000_000_001 || normalizedTime > 1.000_000_000_001) {
    fail(`normalized Chebyshev time ${normalizedTime} is outside [-1, 1]`);
  }
  const positionKilometers = [];
  const velocityKilometersPerSecond = [];

  for (const coefficients of record.coefficients) {
    let previousPolynomial = 1;
    let polynomial = normalizedTime;
    let previousDerivative = 0;
    let derivative = 1;
    let position = coefficients[0] ?? 0;
    let normalizedVelocity =
      coefficients.length > 1 ? coefficients[1] : 0;
    if (coefficients.length > 1) {
      position += coefficients[1] * polynomial;
    }

    for (let index = 2; index < coefficients.length; index += 1) {
      const nextPolynomial =
        2 * normalizedTime * polynomial - previousPolynomial;
      const nextDerivative =
        2 * polynomial +
        2 * normalizedTime * derivative -
        previousDerivative;
      position += coefficients[index] * nextPolynomial;
      normalizedVelocity += coefficients[index] * nextDerivative;
      previousPolynomial = polynomial;
      polynomial = nextPolynomial;
      previousDerivative = derivative;
      derivative = nextDerivative;
    }
    positionKilometers.push(position);
    velocityKilometersPerSecond.push(
      normalizedVelocity / record.radiusSeconds,
    );
  }

  return { positionKilometers, velocityKilometersPerSecond };
}

function alignToEight(value) {
  return Math.ceil(value / 8) * 8;
}

export function encodeDe442sChunk({
  chunkStartSecondsPastJ2000Tdb,
  chunkEndSecondsPastJ2000Tdb,
  recordsBySeries,
}) {
  if (
    !Number.isFinite(chunkStartSecondsPastJ2000Tdb) ||
    !Number.isFinite(chunkEndSecondsPastJ2000Tdb) ||
    chunkStartSecondsPastJ2000Tdb >= chunkEndSecondsPastJ2000Tdb
  ) {
    fail("chunk interval is invalid");
  }
  if (recordsBySeries.length !== DE442S_SERIES.length) {
    fail(`chunk must contain ${DE442S_SERIES.length} series`);
  }

  const directoryBytes =
    DE442S_SERIES.length * DE442S_BINARY.seriesDirectoryEntryBytes;
  let nextDataOffset = alignToEight(
    DE442S_BINARY.headerBytes + directoryBytes,
  );
  const descriptors = recordsBySeries.map(({ definition, records }) => {
    if (records.length === 0) {
      fail(`chunk series ${definition.id} has no records`);
    }
    const coefficientCountPerAxis = records[0].coefficients[0].length;
    const recordStrideBytes = alignToEight(
      16 + coefficientCountPerAxis * 3 * 4,
    );
    const descriptor = {
      id: definition.id,
      targetNaifId: definition.targetNaifId,
      centerNaifId: definition.centerNaifId,
      frameNaifId: definition.frameNaifId,
      spkDataType: definition.spkDataType,
      recordCount: records.length,
      coefficientCountPerAxis,
      degree: coefficientCountPerAxis - 1,
      dataOffsetBytes: nextDataOffset,
      recordStrideBytes,
      firstRecordStartSecondsPastJ2000Tdb:
        records[0].midpointSecondsPastJ2000Tdb -
        records[0].radiusSeconds,
      lastRecordEndSecondsPastJ2000Tdb:
        records.at(-1).midpointSecondsPastJ2000Tdb +
        records.at(-1).radiusSeconds,
    };
    nextDataOffset += recordStrideBytes * records.length;
    return descriptor;
  });

  const output = Buffer.alloc(nextDataOffset);
  output.write(DE442S_BINARY.magic, 0, 8, "ascii");
  output.writeUInt32LE(DE442S_BINARY.formatVersion, 8);
  output.writeUInt32LE(DE442S_SERIES.length, 12);
  output.writeDoubleLE(chunkStartSecondsPastJ2000Tdb, 16);
  output.writeDoubleLE(chunkEndSecondsPastJ2000Tdb, 24);

  for (let seriesIndex = 0; seriesIndex < descriptors.length; seriesIndex += 1) {
    const descriptor = descriptors[seriesIndex];
    const directoryOffset =
      DE442S_BINARY.headerBytes +
      seriesIndex * DE442S_BINARY.seriesDirectoryEntryBytes;
    output.writeInt32LE(descriptor.targetNaifId, directoryOffset);
    output.writeInt32LE(descriptor.centerNaifId, directoryOffset + 4);
    output.writeInt32LE(descriptor.frameNaifId, directoryOffset + 8);
    output.writeInt32LE(descriptor.spkDataType, directoryOffset + 12);
    output.writeUInt32LE(descriptor.recordCount, directoryOffset + 16);
    output.writeUInt32LE(
      descriptor.coefficientCountPerAxis,
      directoryOffset + 20,
    );
    output.writeUInt32LE(descriptor.dataOffsetBytes, directoryOffset + 24);
    output.writeUInt32LE(descriptor.recordStrideBytes, directoryOffset + 28);

    const records = recordsBySeries[seriesIndex].records;
    for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
      const record = records[recordIndex];
      const recordOffset =
        descriptor.dataOffsetBytes +
        recordIndex * descriptor.recordStrideBytes;
      output.writeDoubleLE(
        record.midpointSecondsPastJ2000Tdb,
        recordOffset,
      );
      output.writeDoubleLE(record.radiusSeconds, recordOffset + 8);
      let coefficientOffset = recordOffset + 16;
      for (const axis of record.coefficients) {
        if (axis.length !== descriptor.coefficientCountPerAxis) {
          fail(`series ${descriptor.id} has inconsistent coefficient counts`);
        }
        for (const coefficient of axis) {
          output.writeFloatLE(Math.fround(coefficient), coefficientOffset);
          coefficientOffset += 4;
        }
      }
    }
  }

  return { buffer: output, descriptors };
}

export function decodeDe442sChunk(chunkBytes) {
  const chunk = Buffer.from(chunkBytes);
  if (
    chunk.byteLength <
    DE442S_BINARY.headerBytes +
      DE442S_BINARY.seriesDirectoryEntryBytes * DE442S_SERIES.length
  ) {
    fail("chunk is shorter than its header and directory");
  }
  if (
    chunk.subarray(0, 8).toString("ascii") !== DE442S_BINARY.magic ||
    chunk.readUInt32LE(8) !== DE442S_BINARY.formatVersion
  ) {
    fail("chunk magic or format version is invalid");
  }
  const seriesCount = chunk.readUInt32LE(12);
  if (seriesCount !== DE442S_SERIES.length) {
    fail(`chunk contains ${seriesCount} series`);
  }
  const chunkStartSecondsPastJ2000Tdb = chunk.readDoubleLE(16);
  const chunkEndSecondsPastJ2000Tdb = chunk.readDoubleLE(24);
  if (
    !Number.isFinite(chunkStartSecondsPastJ2000Tdb) ||
    !Number.isFinite(chunkEndSecondsPastJ2000Tdb) ||
    chunkStartSecondsPastJ2000Tdb >= chunkEndSecondsPastJ2000Tdb
  ) {
    fail("chunk header interval is invalid");
  }

  const descriptors = [];
  let previousDataEnd = alignToEight(
    DE442S_BINARY.headerBytes +
      DE442S_BINARY.seriesDirectoryEntryBytes * seriesCount,
  );
  for (let index = 0; index < seriesCount; index += 1) {
    const offset =
      DE442S_BINARY.headerBytes +
      index * DE442S_BINARY.seriesDirectoryEntryBytes;
    const descriptor = {
      targetNaifId: chunk.readInt32LE(offset),
      centerNaifId: chunk.readInt32LE(offset + 4),
      frameNaifId: chunk.readInt32LE(offset + 8),
      spkDataType: chunk.readInt32LE(offset + 12),
      recordCount: chunk.readUInt32LE(offset + 16),
      coefficientCountPerAxis: chunk.readUInt32LE(offset + 20),
      dataOffsetBytes: chunk.readUInt32LE(offset + 24),
      recordStrideBytes: chunk.readUInt32LE(offset + 28),
    };
    const minimumStride = alignToEight(
      16 + descriptor.coefficientCountPerAxis * 3 * 4,
    );
    const dataEnd =
      descriptor.dataOffsetBytes +
      descriptor.recordCount * descriptor.recordStrideBytes;
    if (
      descriptor.recordCount === 0 ||
      descriptor.coefficientCountPerAxis === 0 ||
      descriptor.recordStrideBytes !== minimumStride ||
      descriptor.dataOffsetBytes !== previousDataEnd ||
      dataEnd > chunk.byteLength
    ) {
      fail(`chunk series directory ${index} is invalid`);
    }
    descriptors.push(descriptor);
    previousDataEnd = dataEnd;
  }
  if (previousDataEnd !== chunk.byteLength) {
    fail("chunk contains trailing or unreferenced bytes");
  }

  return {
    buffer: chunk,
    chunkStartSecondsPastJ2000Tdb,
    chunkEndSecondsPastJ2000Tdb,
    descriptors,
  };
}

export function readDe442sChunkRecord(decodedChunk, descriptor, recordIndex) {
  if (
    !Number.isInteger(recordIndex) ||
    recordIndex < 0 ||
    recordIndex >= descriptor.recordCount
  ) {
    fail(`chunk record index ${recordIndex} is outside the series`);
  }
  const offset =
    descriptor.dataOffsetBytes + recordIndex * descriptor.recordStrideBytes;
  const midpointSecondsPastJ2000Tdb =
    decodedChunk.buffer.readDoubleLE(offset);
  const radiusSeconds = decodedChunk.buffer.readDoubleLE(offset + 8);
  const coefficients = [[], [], []];
  let coefficientOffset = offset + 16;
  for (const axis of coefficients) {
    for (
      let coefficientIndex = 0;
      coefficientIndex < descriptor.coefficientCountPerAxis;
      coefficientIndex += 1
    ) {
      axis.push(decodedChunk.buffer.readFloatLE(coefficientOffset));
      coefficientOffset += 4;
    }
  }
  return {
    midpointSecondsPastJ2000Tdb,
    radiusSeconds,
    coefficients,
  };
}

export function de442sChunkRecordIndexAt(
  decodedChunk,
  descriptor,
  secondsPastJ2000Tdb,
) {
  let low = 0;
  let high = descriptor.recordCount;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const record = readDe442sChunkRecord(
      decodedChunk,
      descriptor,
      middle,
    );
    const recordStart =
      record.midpointSecondsPastJ2000Tdb - record.radiusSeconds;
    if (recordStart <= secondsPastJ2000Tdb) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const index = Math.max(0, low - 1);
  const record = readDe442sChunkRecord(decodedChunk, descriptor, index);
  const recordStart =
    record.midpointSecondsPastJ2000Tdb - record.radiusSeconds;
  const recordEnd =
    record.midpointSecondsPastJ2000Tdb + record.radiusSeconds;
  if (
    secondsPastJ2000Tdb < recordStart ||
    secondsPastJ2000Tdb > recordEnd
  ) {
    fail(`epoch ${secondsPastJ2000Tdb} is not covered by the chunk series`);
  }
  return index;
}

export function evaluateDe442sChunkSeries(
  decodedChunk,
  descriptor,
  secondsPastJ2000Tdb,
) {
  const recordIndex = de442sChunkRecordIndexAt(
    decodedChunk,
    descriptor,
    secondsPastJ2000Tdb,
  );
  return evaluateChebyshevRecord(
    readDe442sChunkRecord(decodedChunk, descriptor, recordIndex),
    secondsPastJ2000Tdb,
  );
}

export function vectorDistance(left, right) {
  if (left.length !== 3 || right.length !== 3) {
    fail("vector distance requires two three-component vectors");
  }
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}
