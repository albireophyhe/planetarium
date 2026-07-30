import {
  eventCandidateManifestPath,
  fetchEventAsset,
  type EventAssetFetch,
} from "./eventAssetTransport";
import {
  tdbCalendarYear,
  tdbJulianDateToUtcDate,
  utcDateToTdbJulianDate,
} from "./eventTime";
import { formatOccultationTargetLabel } from "./occultationTargetLabel";
import type {
  EventSummary,
  LunarEclipseClassification,
  SolarEclipseClassification,
} from "./types";

const CANDIDATE_MODEL =
  "de442s-mean-sphere-eclipse-candidates-v1";
const CANDIDATE_CHUNK_PATH =
  "/event-data/candidates/chunks";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CHUNK_ID_PATTERN = /^(\d{4})-(\d{4})$/;
const EVENT_ID_PATTERN =
  /^(?:(?:se|le)-\d{8}|lo-\d{8}-hr\d+)$/;
const MAXIMUM_CACHED_CHUNKS = 4;

type CandidateKind =
  | "solar-eclipse"
  | "lunar-eclipse"
  | "lunar-occultation";

interface CandidateChunkDescriptor {
  readonly id: string;
  readonly startYear: number;
  readonly endYear: number;
  readonly eventCount: number;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface EventCandidateManifest {
  readonly schemaVersion: 1;
  readonly model: typeof CANDIDATE_MODEL;
  readonly coverage: {
    readonly startYear: number;
    readonly endYear: number;
    readonly endIsExclusive: true;
    readonly chunkYears: number;
    readonly timeScale: "TDB";
  };
  readonly chunks: readonly CandidateChunkDescriptor[];
}

interface CandidateCommon {
  readonly id: string;
  readonly kind: CandidateKind;
  readonly maximumJulianDateTdb: number;
  readonly searchStartJulianDateTdb: number;
  readonly searchEndJulianDateTdb: number;
}

export interface SolarEclipseCandidate extends CandidateCommon {
  readonly kind: "solar-eclipse";
  readonly classificationHint: SolarEclipseClassification;
}

export interface LunarEclipseCandidate extends CandidateCommon {
  readonly kind: "lunar-eclipse";
  readonly classificationHint: LunarEclipseClassification;
}

export interface LunarOccultationCandidate extends CandidateCommon {
  readonly kind: "lunar-occultation";
  readonly classificationHint: "occultation";
  readonly target: {
    readonly hr: number;
    readonly hd: number | null;
    readonly label: string;
    readonly labelJa: string | null;
    readonly vMagnitude: number;
  };
}

export type EclipseCandidateSeed =
  | SolarEclipseCandidate
  | LunarEclipseCandidate
  | LunarOccultationCandidate;

export interface LoadedEclipseCandidate {
  readonly seed: EclipseCandidateSeed;
  readonly summary: EventSummary;
}

interface CandidateChunk {
  readonly id: string;
  readonly events: readonly EclipseCandidateSeed[];
}

export class EventCandidateDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventCandidateDataError";
  }
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(
  value: unknown,
  field: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new EventCandidateDataError(`${field} must be finite`);
  }
  return value;
}

function integer(
  value: unknown,
  field: string,
): number {
  const result = finiteNumber(value, field);
  if (!Number.isSafeInteger(result)) {
    throw new EventCandidateDataError(`${field} must be an integer`);
  }
  return result;
}

function string(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new EventCandidateDataError(`${field} must be a string`);
  }
  return value;
}

function parseManifest(value: unknown): EventCandidateManifest {
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    value.model !== CANDIDATE_MODEL ||
    !isObject(value.coverage) ||
    !Array.isArray(value.chunks)
  ) {
    throw new EventCandidateDataError(
      "Candidate manifest header is invalid",
    );
  }
  const coverage = value.coverage;
  const startYear = integer(
    coverage.startYear,
    "coverage.startYear",
  );
  const endYear = integer(coverage.endYear, "coverage.endYear");
  const chunkYears = integer(
    coverage.chunkYears,
    "coverage.chunkYears",
  );
  if (
    coverage.endIsExclusive !== true ||
    coverage.timeScale !== "TDB" ||
    startYear !== 1900 ||
    endYear !== 2101 ||
    chunkYears !== 5
  ) {
    throw new EventCandidateDataError(
      "Candidate manifest coverage is unsupported",
    );
  }
  if (value.chunks.length === 0 || value.chunks.length > 64) {
    throw new EventCandidateDataError(
      "Candidate manifest chunk count is invalid",
    );
  }

  const seenIds = new Set<string>();
  let previousEndYear = startYear;
  const chunks = value.chunks.map((raw, index) => {
    if (!isObject(raw)) {
      throw new EventCandidateDataError(
        `chunks[${index}] must be an object`,
      );
    }
    const id = string(raw.id, `chunks[${index}].id`);
    const match = CHUNK_ID_PATTERN.exec(id);
    const descriptorStart = integer(
      raw.startYear,
      `chunks[${index}].startYear`,
    );
    const descriptorEnd = integer(
      raw.endYear,
      `chunks[${index}].endYear`,
    );
    const file = string(raw.file, `chunks[${index}].file`);
    const byteLength = integer(
      raw.byteLength,
      `chunks[${index}].byteLength`,
    );
    const eventCount = integer(
      raw.eventCount,
      `chunks[${index}].eventCount`,
    );
    const sha256 = string(
      raw.sha256,
      `chunks[${index}].sha256`,
    );
    if (
      !match ||
      Number(match[1]) !== descriptorStart ||
      Number(match[2]) !== descriptorEnd ||
      descriptorStart !== previousEndYear ||
      descriptorEnd <= descriptorStart ||
      descriptorEnd > endYear ||
      file !== `shared/events/chunks/${id}.v1.json` ||
      byteLength <= 0 ||
      byteLength > 524_288 ||
      eventCount < 0 ||
      eventCount > 2_000 ||
      !SHA256_PATTERN.test(sha256) ||
      seenIds.has(id)
    ) {
      throw new EventCandidateDataError(
        `Candidate chunk descriptor ${id} is invalid`,
      );
    }
    seenIds.add(id);
    previousEndYear = descriptorEnd;
    return Object.freeze({
      byteLength,
      endYear: descriptorEnd,
      eventCount,
      id,
      sha256,
      startYear: descriptorStart,
    });
  });
  if (previousEndYear !== endYear) {
    throw new EventCandidateDataError(
      "Candidate chunks do not cover the manifest range",
    );
  }

  return Object.freeze({
    chunks: Object.freeze(chunks),
    coverage: Object.freeze({
      chunkYears,
      endIsExclusive: true as const,
      endYear,
      startYear,
      timeScale: "TDB" as const,
    }),
    model: CANDIDATE_MODEL,
    schemaVersion: 1 as const,
  });
}

function parseCandidate(
  value: unknown,
  index: number,
): EclipseCandidateSeed {
  if (!isObject(value)) {
    throw new EventCandidateDataError(
      `events[${index}] must be an object`,
    );
  }
  const id = string(value.id, `events[${index}].id`);
  const kind = value.kind;
  const classificationHint = value.classificationHint;
  const maximumJulianDateTdb = finiteNumber(
    value.maximumJulianDateTdb,
    `events[${index}].maximumJulianDateTdb`,
  );
  const searchStartJulianDateTdb = finiteNumber(
    value.searchStartJulianDateTdb,
    `events[${index}].searchStartJulianDateTdb`,
  );
  const searchEndJulianDateTdb = finiteNumber(
    value.searchEndJulianDateTdb,
    `events[${index}].searchEndJulianDateTdb`,
  );
  if (
    !EVENT_ID_PATTERN.test(id) ||
    searchStartJulianDateTdb >= maximumJulianDateTdb ||
    searchEndJulianDateTdb <= maximumJulianDateTdb
  ) {
    throw new EventCandidateDataError(
      `Candidate ${id} has an invalid time window`,
    );
  }

  if (
    kind === "solar-eclipse" &&
    id.startsWith("se-") &&
    (classificationHint === "partial" ||
      classificationHint === "annular" ||
      classificationHint === "total" ||
      classificationHint === "hybrid")
  ) {
    return Object.freeze({
      classificationHint,
      id,
      kind,
      maximumJulianDateTdb,
      searchEndJulianDateTdb,
      searchStartJulianDateTdb,
    });
  }
  if (
    kind === "lunar-eclipse" &&
    id.startsWith("le-") &&
    (classificationHint === "penumbral" ||
      classificationHint === "partial" ||
      classificationHint === "total")
  ) {
    return Object.freeze({
      classificationHint,
      id,
      kind,
      maximumJulianDateTdb,
      searchEndJulianDateTdb,
      searchStartJulianDateTdb,
    });
  }
  if (
    kind === "lunar-occultation" &&
    /^lo-\d{8}-hr\d+$/.test(id) &&
    classificationHint === "occultation" &&
    isObject(value.target)
  ) {
    const targetHR = integer(
      value.target.hr,
      `events[${index}].target.hr`,
    );
    const targetHD =
      value.target.hd === null
        ? null
        : integer(
            value.target.hd,
            `events[${index}].target.hd`,
          );
    const label = string(
      value.target.label,
      `events[${index}].target.label`,
    );
    const labelJa =
      value.target.labelJa === null
        ? null
        : string(
            value.target.labelJa,
            `events[${index}].target.labelJa`,
          );
    const vMagnitude = finiteNumber(
      value.target.vMagnitude,
      `events[${index}].target.vMagnitude`,
    );
    if (
      targetHR < 1 ||
      targetHR > 9_110 ||
      (targetHD !== null && targetHD < 1) ||
      label.length === 0 ||
      vMagnitude < -2 ||
      vMagnitude > 3
    ) {
      throw new EventCandidateDataError(
        `Candidate ${id} has an invalid target`,
      );
    }
    return Object.freeze({
      classificationHint,
      id,
      kind,
      maximumJulianDateTdb,
      searchEndJulianDateTdb,
      searchStartJulianDateTdb,
      target: Object.freeze({
        hd: targetHD,
        hr: targetHR,
        label,
        labelJa,
        vMagnitude,
      }),
    });
  }
  throw new EventCandidateDataError(
    `Candidate ${id} has an invalid kind or classification`,
  );
}

function parseChunk(
  value: unknown,
  descriptor: CandidateChunkDescriptor,
): CandidateChunk {
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    value.model !== CANDIDATE_MODEL ||
    value.id !== descriptor.id ||
    !isObject(value.coverage) ||
    !Array.isArray(value.events)
  ) {
    throw new EventCandidateDataError(
      `Candidate chunk ${descriptor.id} header is invalid`,
    );
  }
  if (
    value.coverage.startYear !== descriptor.startYear ||
    value.coverage.endYear !== descriptor.endYear ||
    value.coverage.endIsExclusive !== true ||
    value.coverage.timeScale !== "TDB" ||
    value.events.length !== descriptor.eventCount
  ) {
    throw new EventCandidateDataError(
      `Candidate chunk ${descriptor.id} metadata is inconsistent`,
    );
  }
  const seenIds = new Set<string>();
  const events = value.events.map((raw, index) => {
    const candidate = parseCandidate(raw, index);
    if (seenIds.has(candidate.id)) {
      throw new EventCandidateDataError(
        `Candidate ${candidate.id} is duplicated`,
      );
    }
    seenIds.add(candidate.id);
    const year = tdbCalendarYear(
      candidate.maximumJulianDateTdb,
    );
    if (year < descriptor.startYear || year >= descriptor.endYear) {
      throw new EventCandidateDataError(
        `Candidate ${candidate.id} lies outside its chunk`,
      );
    }
    return candidate;
  });
  return Object.freeze({
    events: Object.freeze(events),
    id: descriptor.id,
  });
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new EventCandidateDataError(
      "SHA-256 verification is unavailable",
    );
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes,
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function readJsonResponse(
  response: Response,
  description: string,
): Promise<unknown> {
  if (!response.ok) {
    throw new EventCandidateDataError(
      `${description} request failed with HTTP ${response.status}`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new EventCandidateDataError(
      `${description} is not valid JSON`,
    );
  }
}

function titleFor(candidate: EclipseCandidateSeed): string {
  if (candidate.kind === "solar-eclipse") {
    switch (candidate.classificationHint) {
      case "partial":
        return "部分日食";
      case "annular":
        return "金環日食";
      case "total":
        return "皆既日食";
      case "hybrid":
        return "金環皆既日食";
      }
  }
  if (candidate.kind === "lunar-occultation") {
    return `月による${formatOccultationTargetLabel(
      candidate.target.label,
      candidate.target.labelJa,
    )}の掩蔽`;
  }
  switch (candidate.classificationHint) {
    case "penumbral":
      return "半影月食";
    case "partial":
      return "部分月食";
    case "total":
      return "皆既月食";
  }
}

function toLoadedCandidate(
  candidate: EclipseCandidateSeed,
  chunkId: string,
): LoadedEclipseCandidate {
  return Object.freeze({
    seed: candidate,
    summary: Object.freeze({
      canonicalEpochUtc: tdbJulianDateToUtcDate(
        candidate.maximumJulianDateTdb,
      ),
      dataVersion: `${CANDIDATE_MODEL}/${chunkId}`,
      globalClassification: candidate.classificationHint,
      id: candidate.id,
      kind: candidate.kind,
      targetStarHR:
        candidate.kind === "lunar-occultation"
          ? candidate.target.hr
          : null,
      title: titleFor(candidate),
    }),
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Event data load was cancelled", "AbortError");
  }
}

export class EventCandidateLoader {
  private manifest: EventCandidateManifest | null = null;
  private readonly chunkCache = new Map<string, CandidateChunk>();

  constructor(
    private readonly fetchAsset: EventAssetFetch = fetchEventAsset,
  ) {}

  async loadManifest(
    signal?: AbortSignal,
  ): Promise<EventCandidateManifest> {
    throwIfAborted(signal);
    if (this.manifest) {
      return this.manifest;
    }
    const response = await this.fetchAsset(
      eventCandidateManifestPath,
      signal,
    );
    throwIfAborted(signal);
    const manifest = parseManifest(
      await readJsonResponse(response, "Candidate manifest"),
    );
    this.manifest = manifest;
    return manifest;
  }

  private async loadChunk(
    descriptor: CandidateChunkDescriptor,
    signal?: AbortSignal,
  ): Promise<CandidateChunk> {
    throwIfAborted(signal);
    const cached = this.chunkCache.get(descriptor.id);
    if (cached) {
      this.chunkCache.delete(descriptor.id);
      this.chunkCache.set(descriptor.id, cached);
      return cached;
    }
    const response = await this.fetchAsset(
      `${CANDIDATE_CHUNK_PATH}/${descriptor.id}.v1.json`,
      signal,
    );
    if (!response.ok) {
      throw new EventCandidateDataError(
        `Candidate chunk ${descriptor.id} request failed with HTTP ${response.status}`,
      );
    }
    const bytes = await response.arrayBuffer();
    throwIfAborted(signal);
    if (bytes.byteLength !== descriptor.byteLength) {
      throw new EventCandidateDataError(
        `Candidate chunk ${descriptor.id} byte length is invalid`,
      );
    }
    if ((await sha256Hex(bytes)) !== descriptor.sha256) {
      throw new EventCandidateDataError(
        `Candidate chunk ${descriptor.id} SHA-256 is invalid`,
      );
    }
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new EventCandidateDataError(
        `Candidate chunk ${descriptor.id} is not valid UTF-8 JSON`,
      );
    }
    const chunk = parseChunk(raw, descriptor);
    this.chunkCache.set(descriptor.id, chunk);
    while (this.chunkCache.size > MAXIMUM_CACHED_CHUNKS) {
      const oldestId = this.chunkCache.keys().next().value;
      if (typeof oldestId !== "string") {
        break;
      }
      this.chunkCache.delete(oldestId);
    }
    return chunk;
  }

  async loadRange(
    startUtc: Date,
    endUtc: Date,
    signal?: AbortSignal,
  ): Promise<readonly LoadedEclipseCandidate[]> {
    const startMilliseconds = startUtc.getTime();
    const endMilliseconds = endUtc.getTime();
    if (
      !Number.isFinite(startMilliseconds) ||
      !Number.isFinite(endMilliseconds) ||
      startMilliseconds > endMilliseconds
    ) {
      throw new RangeError("Candidate date range is invalid");
    }
    const manifest = await this.loadManifest(signal);
    const firstYear = startUtc.getUTCFullYear();
    const lastYear = endUtc.getUTCFullYear();
    if (
      firstYear < manifest.coverage.startYear ||
      lastYear >= manifest.coverage.endYear
    ) {
      throw new RangeError(
        "Candidate date range is outside manifest coverage",
      );
    }
    const firstTdbYear = Math.max(
      manifest.coverage.startYear,
      tdbCalendarYear(utcDateToTdbJulianDate(startUtc)),
    );
    const lastTdbYear = Math.min(
      manifest.coverage.endYear - 1,
      tdbCalendarYear(utcDateToTdbJulianDate(endUtc)),
    );
    const descriptors = manifest.chunks.filter(
      (chunk) =>
        chunk.startYear <= lastTdbYear &&
        chunk.endYear > firstTdbYear,
    );
    const chunks = await Promise.all(
      descriptors.map((descriptor) =>
        this.loadChunk(descriptor, signal),
      ),
    );
    throwIfAborted(signal);
    return Object.freeze(
      chunks
        .flatMap((chunk) =>
          chunk.events.map((candidate) =>
            toLoadedCandidate(candidate, chunk.id),
          ),
        )
        .filter(({ summary }) => {
          const milliseconds = summary.canonicalEpochUtc.getTime();
          return (
            milliseconds >= startMilliseconds &&
            milliseconds <= endMilliseconds
          );
        })
        .sort(
          (left, right) =>
            left.summary.canonicalEpochUtc.getTime() -
            right.summary.canonicalEpochUtc.getTime(),
        ),
    );
  }
}
