import {
  evaluateChebyshevRecord,
} from "./chebyshev";
import type {
  EphemerisState,
  EventEphemerisProvider,
  EventEphemerisStateCoverage,
  GeocentricEphemerisState,
} from "./types";
import {
  DE442S_MODEL,
  DE442S_SOURCE_SHA256,
  De442sFormatError,
  type De442sChunkManifest,
  type De442sChunkSeries,
  type De442sSeriesId,
} from "./de442sManifest";

const J2000_JULIAN_DATE = 2_451_545;
const SECONDS_PER_DAY = 86_400;
const BINARY_MAGIC = "PLDE4421";
const HEADER_BYTES = 32;
const DIRECTORY_ENTRY_BYTES = 32;

/**
 * DE442 GMB and GMM from JPL's technical comments, expressed in AU³/day².
 * The Earth/Moon mass ratio is (GMB - GMM) / GMM.
 */
const DE442_EARTH_MOON_SYSTEM_GM = 8.997_011_393_442_166e-10;
const DE442_MOON_GM = 1.093_189_459_210_316_5e-11;
export const DE442S_EARTH_MOON_MASS_RATIO =
  (DE442_EARTH_MOON_SYSTEM_GM - DE442_MOON_GM) / DE442_MOON_GM;

interface BinarySeriesDescriptor {
  readonly id: De442sSeriesId;
  readonly targetNaifId: number;
  readonly centerNaifId: number;
  readonly frameNaifId: number;
  readonly spkDataType: number;
  readonly recordCount: number;
  readonly coefficientCountPerAxis: number;
  readonly dataOffsetBytes: number;
  readonly recordStrideBytes: number;
}

export interface DecodedDe442sChunk {
  readonly manifest: De442sChunkManifest;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly view: DataView<ArrayBuffer>;
  readonly descriptors: ReadonlyMap<
    De442sSeriesId,
    BinarySeriesDescriptor
  >;
}

function fail(message: string): never {
  throw new De442sFormatError(message);
}

function bytesFrom(
  source: ArrayBuffer | Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return result;
}

function assertFinite(
  value: number,
  description: string,
): number {
  if (!Number.isFinite(value)) {
    fail(`${description} is not finite`);
  }
  return value;
}

function assertDescriptorMatchesManifest(
  descriptor: BinarySeriesDescriptor,
  declared: De442sChunkSeries,
): void {
  const comparableFields = [
    "targetNaifId",
    "centerNaifId",
    "frameNaifId",
    "spkDataType",
    "recordCount",
    "coefficientCountPerAxis",
    "dataOffsetBytes",
    "recordStrideBytes",
  ] as const;
  for (const field of comparableFields) {
    if (descriptor[field] !== declared[field]) {
      fail(
        `${declared.id} directory ${field} does not match the manifest`,
      );
    }
  }
}

function validateRecords(
  view: DataView<ArrayBuffer>,
  descriptor: BinarySeriesDescriptor,
  declared: De442sChunkSeries,
): void {
  const usedRecordBytes =
    16 + descriptor.coefficientCountPerAxis * 3 * 4;
  let previousEnd: number | null = null;
  let firstStart = 0;
  let lastEnd = 0;

  for (
    let recordIndex = 0;
    recordIndex < descriptor.recordCount;
    recordIndex += 1
  ) {
    const recordOffset =
      descriptor.dataOffsetBytes +
      recordIndex * descriptor.recordStrideBytes;
    const midpoint = assertFinite(
      view.getFloat64(recordOffset, true),
      `${descriptor.id} record ${recordIndex} midpoint`,
    );
    const radius = assertFinite(
      view.getFloat64(recordOffset + 8, true),
      `${descriptor.id} record ${recordIndex} radius`,
    );
    if (
      radius <= 0 ||
      radius * 2 !== declared.recordIntervalSeconds
    ) {
      fail(`${descriptor.id} record ${recordIndex} has an invalid radius`);
    }
    const start = midpoint - radius;
    const end = midpoint + radius;
    if (previousEnd !== null && start !== previousEnd) {
      fail(`${descriptor.id} records are not contiguous`);
    }
    if (recordIndex === 0) {
      firstStart = start;
    }
    previousEnd = end;
    lastEnd = end;

    let coefficientOffset = recordOffset + 16;
    const coefficientEnd = recordOffset + usedRecordBytes;
    while (coefficientOffset < coefficientEnd) {
      assertFinite(
        view.getFloat32(coefficientOffset, true),
        `${descriptor.id} record ${recordIndex} coefficient`,
      );
      coefficientOffset += 4;
    }
    const recordEnd = recordOffset + descriptor.recordStrideBytes;
    while (coefficientOffset < recordEnd) {
      if (view.getUint8(coefficientOffset) !== 0) {
        fail(`${descriptor.id} record ${recordIndex} has non-zero padding`);
      }
      coefficientOffset += 1;
    }
  }

  if (
    firstStart !== declared.firstRecordStartSecondsPastJ2000Tdb ||
    lastEnd !== declared.lastRecordEndSecondsPastJ2000Tdb
  ) {
    fail(`${descriptor.id} record coverage does not match the manifest`);
  }
}

/**
 * Decodes and validates one little-endian runtime chunk. The caller must
 * verify byte length and SHA-256 before invoking this function for network
 * data; structural checks remain here so direct/bundled callers are safe too.
 */
export function decodeDe442sChunk(
  source: ArrayBuffer | Uint8Array,
  manifest: De442sChunkManifest,
): DecodedDe442sChunk {
  const bytes = bytesFrom(source);
  if (bytes.byteLength !== manifest.byteLength) {
    fail(
      `chunk ${manifest.id} byte length does not match the manifest`,
    );
  }
  if (bytes.byteLength < HEADER_BYTES + 3 * DIRECTORY_ENTRY_BYTES) {
    fail(`chunk ${manifest.id} is shorter than its header`);
  }
  const view = new DataView(bytes.buffer);
  if (asciiAt(bytes, 0, 8) !== BINARY_MAGIC) {
    fail(`chunk ${manifest.id} has the wrong magic`);
  }
  if (view.getUint32(8, true) !== 1) {
    fail(`chunk ${manifest.id} has an unsupported format version`);
  }
  if (view.getUint32(12, true) !== 3) {
    fail(`chunk ${manifest.id} must contain exactly three series`);
  }
  const startSeconds = assertFinite(
    view.getFloat64(16, true),
    `chunk ${manifest.id} start`,
  );
  const endSeconds = assertFinite(
    view.getFloat64(24, true),
    `chunk ${manifest.id} end`,
  );
  if (
    startSeconds !== manifest.startSecondsPastJ2000Tdb ||
    endSeconds !== manifest.endSecondsPastJ2000Tdb
  ) {
    fail(`chunk ${manifest.id} header coverage does not match the manifest`);
  }

  const descriptors = new Map<
    De442sSeriesId,
    BinarySeriesDescriptor
  >();
  let expectedDataOffset = HEADER_BYTES + 3 * DIRECTORY_ENTRY_BYTES;
  for (const [index, declared] of manifest.series.entries()) {
    const offset = HEADER_BYTES + index * DIRECTORY_ENTRY_BYTES;
    const descriptor: BinarySeriesDescriptor = {
      id: declared.id,
      targetNaifId: view.getInt32(offset, true),
      centerNaifId: view.getInt32(offset + 4, true),
      frameNaifId: view.getInt32(offset + 8, true),
      spkDataType: view.getInt32(offset + 12, true),
      recordCount: view.getUint32(offset + 16, true),
      coefficientCountPerAxis: view.getUint32(offset + 20, true),
      dataOffsetBytes: view.getUint32(offset + 24, true),
      recordStrideBytes: view.getUint32(offset + 28, true),
    };
    assertDescriptorMatchesManifest(descriptor, declared);
    if (descriptor.dataOffsetBytes !== expectedDataOffset) {
      fail(`chunk ${manifest.id} has non-contiguous series data`);
    }
    const dataEnd =
      descriptor.dataOffsetBytes +
      descriptor.recordCount * descriptor.recordStrideBytes;
    if (
      !Number.isSafeInteger(dataEnd) ||
      dataEnd > bytes.byteLength
    ) {
      fail(`chunk ${manifest.id} series data exceeds the file`);
    }
    validateRecords(view, descriptor, declared);
    expectedDataOffset = dataEnd;
    if (descriptors.has(descriptor.id)) {
      fail(`chunk ${manifest.id} contains a duplicate series`);
    }
    descriptors.set(descriptor.id, descriptor);
  }
  if (expectedDataOffset !== bytes.byteLength) {
    fail(`chunk ${manifest.id} has trailing or unreferenced bytes`);
  }

  return {
    manifest,
    bytes,
    view,
    descriptors,
  };
}

function descriptorFor(
  chunk: DecodedDe442sChunk,
  seriesId: De442sSeriesId,
): BinarySeriesDescriptor {
  const descriptor = chunk.descriptors.get(seriesId);
  if (descriptor === undefined) {
    fail(`chunk ${chunk.manifest.id} does not contain ${seriesId}`);
  }
  return descriptor;
}

function recordBounds(
  chunk: DecodedDe442sChunk,
  descriptor: BinarySeriesDescriptor,
  recordIndex: number,
): readonly [start: number, end: number] {
  const offset =
    descriptor.dataOffsetBytes +
    recordIndex * descriptor.recordStrideBytes;
  const midpoint = chunk.view.getFloat64(offset, true);
  const radius = chunk.view.getFloat64(offset + 8, true);
  return [midpoint - radius, midpoint + radius];
}

function recordIndexAt(
  chunk: DecodedDe442sChunk,
  descriptor: BinarySeriesDescriptor,
  secondsPastJ2000Tdb: number,
): number {
  let lower = 0;
  let upper = descriptor.recordCount;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const [recordStart] = recordBounds(chunk, descriptor, middle);
    if (recordStart <= secondsPastJ2000Tdb) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }
  const recordIndex = Math.max(0, lower - 1);
  const [recordStart, recordEnd] = recordBounds(
    chunk,
    descriptor,
    recordIndex,
  );
  if (
    secondsPastJ2000Tdb < recordStart ||
    secondsPastJ2000Tdb > recordEnd
  ) {
    throw new RangeError(
      `TDB epoch is outside ${descriptor.id} record coverage`,
    );
  }
  return recordIndex;
}

export function evaluateDe442sSeries(
  chunk: DecodedDe442sChunk,
  seriesId: De442sSeriesId,
  secondsPastJ2000Tdb: number,
): EphemerisState {
  if (!Number.isFinite(secondsPastJ2000Tdb)) {
    throw new RangeError("TDB seconds past J2000 must be finite");
  }
  const descriptor = descriptorFor(chunk, seriesId);
  const recordIndex = recordIndexAt(
    chunk,
    descriptor,
    secondsPastJ2000Tdb,
  );
  const recordOffset =
    descriptor.dataOffsetBytes +
    recordIndex * descriptor.recordStrideBytes;
  const midpoint = chunk.view.getFloat64(recordOffset, true);
  const radius = chunk.view.getFloat64(recordOffset + 8, true);
  const normalizedTime = (secondsPastJ2000Tdb - midpoint) / radius;
  const coefficientLength = descriptor.coefficientCountPerAxis * 3;
  const coefficients = new Float32Array(coefficientLength);
  let coefficientOffset = recordOffset + 16;
  for (let index = 0; index < coefficientLength; index += 1) {
    coefficients[index] = chunk.view.getFloat32(coefficientOffset, true);
    coefficientOffset += 4;
  }
  return evaluateChebyshevRecord(
    coefficients,
    descriptor.coefficientCountPerAxis,
    Math.max(-1, Math.min(1, normalizedTime)),
    (radius * 2) / SECONDS_PER_DAY,
  );
}

function subtractState(
  left: EphemerisState,
  right: EphemerisState,
): EphemerisState {
  return {
    positionKilometers: [
      left.positionKilometers[0] - right.positionKilometers[0],
      left.positionKilometers[1] - right.positionKilometers[1],
      left.positionKilometers[2] - right.positionKilometers[2],
    ],
    velocityKilometersPerDay: [
      left.velocityKilometersPerDay[0] -
        right.velocityKilometersPerDay[0],
      left.velocityKilometersPerDay[1] -
        right.velocityKilometersPerDay[1],
      left.velocityKilometersPerDay[2] -
        right.velocityKilometersPerDay[2],
    ],
  };
}

function scaleState(
  state: EphemerisState,
  scale: number,
): EphemerisState {
  return {
    positionKilometers: [
      state.positionKilometers[0] * scale,
      state.positionKilometers[1] * scale,
      state.positionKilometers[2] * scale,
    ],
    velocityKilometersPerDay: [
      state.velocityKilometersPerDay[0] * scale,
      state.velocityKilometersPerDay[1] * scale,
      state.velocityKilometersPerDay[2] * scale,
    ],
  };
}

function selectProviderChunk(
  chunks: readonly DecodedDe442sChunk[],
  tdbJulianDate: number,
): DecodedDe442sChunk {
  for (const chunk of chunks) {
    if (
      tdbJulianDate >= chunk.manifest.startJulianDateTdb &&
      tdbJulianDate < chunk.manifest.endJulianDateTdb
    ) {
      return chunk;
    }
  }
  // A range ending exactly on an internal boundary is valid from either
  // duplicated source record. Prefer the right chunk above when present.
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const chunk = chunks[index]!;
    if (tdbJulianDate === chunk.manifest.endJulianDateTdb) {
      return chunk;
    }
  }
  throw new RangeError("TDB Julian date is not loaded in this provider");
}

export class De442sEphemerisProvider implements EventEphemerisProvider {
  public readonly id = `${DE442S_MODEL}:v1`;
  public readonly sourceSha256 = DE442S_SOURCE_SHA256;
  public readonly stateCoverage: EventEphemerisStateCoverage;
  readonly #chunks: readonly DecodedDe442sChunk[];

  public constructor(chunks: readonly DecodedDe442sChunk[]) {
    if (chunks.length === 0) {
      throw new RangeError("At least one DE442s chunk must be loaded");
    }
    const uniqueIds = new Set(chunks.map((chunk) => chunk.manifest.id));
    if (uniqueIds.size !== chunks.length) {
      throw new RangeError("DE442s provider chunks must be unique");
    }
    const ordered = [...chunks].sort(
      (left, right) =>
        left.manifest.startJulianDateTdb -
        right.manifest.startJulianDateTdb,
    );
    for (let index = 1; index < ordered.length; index += 1) {
      if (
        ordered[index - 1]!.manifest.endJulianDateTdb !==
        ordered[index]!.manifest.startJulianDateTdb
      ) {
        throw new RangeError(
          "DE442s provider chunks must form contiguous coverage",
        );
      }
    }
    this.#chunks = ordered;
    this.stateCoverage = Object.freeze({
      startJulianDateTdb:
        ordered[0]!.manifest.startJulianDateTdb,
      endJulianDateTdb:
        ordered.at(-1)!.manifest.endJulianDateTdb,
      endIsIncluded: true,
    });
  }

  public state(tdbJulianDate: number): GeocentricEphemerisState {
    if (!Number.isFinite(tdbJulianDate)) {
      throw new RangeError("TDB Julian date must be finite");
    }
    const chunk = selectProviderChunk(this.#chunks, tdbJulianDate);
    const secondsPastJ2000Tdb =
      (tdbJulianDate - J2000_JULIAN_DATE) * SECONDS_PER_DAY;
    const embBarycentric = evaluateDe442sSeries(
      chunk,
      "emb",
      secondsPastJ2000Tdb,
    );
    const sunBarycentric = evaluateDe442sSeries(
      chunk,
      "sun",
      secondsPastJ2000Tdb,
    );
    const moonFromEmb = evaluateDe442sSeries(
      chunk,
      "moon",
      secondsPastJ2000Tdb,
    );
    const earthBarycentric = subtractState(
      embBarycentric,
      scaleState(
        moonFromEmb,
        1 / DE442S_EARTH_MOON_MASS_RATIO,
      ),
    );
    const moonGeocentric = scaleState(
      moonFromEmb,
      1 + 1 / DE442S_EARTH_MOON_MASS_RATIO,
    );
    const sunGeocentric = subtractState(
      sunBarycentric,
      earthBarycentric,
    );
    return {
      earthBarycentric,
      moonGeocentric,
      sunGeocentric,
      tdbJulianDate,
    };
  }
}
