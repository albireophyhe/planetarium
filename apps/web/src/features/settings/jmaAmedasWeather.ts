const JMA_AMEDAS_LATEST_TIME_URL =
  "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt";
const JMA_AMEDAS_STATION_TABLE_URL =
  "https://www.jma.go.jp/bosai/amedas/const/amedastable.json";
const JMA_AMEDAS_MAP_BASE_URL =
  "https://www.jma.go.jp/bosai/amedas/data/map/";
const DEFAULT_TIMEOUT_MILLISECONDS = 10_000;
const MAX_LATEST_TIME_BYTES = 128;
const MAX_STATION_TABLE_BYTES = 512 * 1_024;
const MAX_MAP_BYTES = 1_536 * 1_024;
const MAX_OBSERVATION_AGE_MILLISECONDS = 30 * 60 * 1_000;
const MAX_FUTURE_SKEW_MILLISECONDS = 5 * 60 * 1_000;
const MAX_STATION_DISTANCE_KILOMETERS = 25;
const EARTH_RADIUS_KILOMETERS = 6_371.0088;

type WeatherFetch = typeof globalThis.fetch;

export type JmaAmedasCurrentWeather = Readonly<{
  observedAtIso: string;
  pressureHpa: number;
  providerKind: "jma-observation";
  relativeHumidityPercent: number;
  stationDistanceKilometers: number;
  stationElevationMeters: number;
  stationId: string;
  stationName: string;
  temperatureCelsius: number;
}>;

export type JmaAmedasErrorCode =
  | "http"
  | "invalid-response"
  | "network"
  | "stale"
  | "timeout"
  | "unavailable";

export class JmaAmedasError extends Error {
  readonly code: JmaAmedasErrorCode;

  constructor(code: JmaAmedasErrorCode, message: string) {
    super(message);
    this.name = "JmaAmedasError";
    this.code = code;
  }
}

type JmaAmedasWeatherRequest = Readonly<{
  fetcher?: WeatherFetch;
  latitude: number;
  longitude: number;
  nowMilliseconds?: () => number;
  signal?: AbortSignal;
  timeoutMilliseconds?: number;
}>;

type LatestTime = Readonly<{
  mapTimestamp: string;
  observedAtIso: string;
  observedAtMilliseconds: number;
}>;

type StationMetadata = Readonly<{
  elevationMeters: number;
  id: string;
  latitude: number;
  longitude: number;
  name: string;
}>;

type StationObservation = Readonly<{
  pressureHpa: number;
  relativeHumidityPercent: number;
  temperatureCelsius: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(message: string): never {
  throw new JmaAmedasError("invalid-response", message);
}

function validateCoordinates(latitude: number, longitude: number): void {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new RangeError(
      "Observer coordinates are outside their valid range.",
    );
  }
}

function validCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export function decodeJmaLatestTime(text: string): LatestTime {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00\+09:00\r?\n?$/u.exec(
      text,
    );
  if (!match) {
    return invalidResponse("Invalid JMA latest_time format.");
  }
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const value =
    `${yearText}-${monthText}-${dayText}` +
    `T${hourText}:${minuteText}:00+09:00`;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    !validCalendarDate(year, month, day) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    minute % 10 !== 0
  ) {
    return invalidResponse("Invalid JMA latest_time value.");
  }
  const observedAtMilliseconds = Date.parse(value);
  if (!Number.isFinite(observedAtMilliseconds)) {
    return invalidResponse("Invalid JMA latest_time value.");
  }
  return Object.freeze({
    mapTimestamp:
      `${yearText}${monthText}${dayText}${hourText}${minuteText}00`,
    observedAtIso: new Date(observedAtMilliseconds).toISOString(),
    observedAtMilliseconds,
  });
}

function degreeMinuteCoordinate(
  value: unknown,
  maximumDegrees: number,
  field: string,
): number {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== "number" ||
    !Number.isInteger(value[0]) ||
    typeof value[1] !== "number" ||
    !Number.isFinite(value[1])
  ) {
    return invalidResponse(`Invalid JMA station ${field}.`);
  }
  const [degrees, minutes] = value;
  if (
    degrees < -maximumDegrees ||
    degrees > maximumDegrees ||
    minutes < 0 ||
    minutes >= 60 ||
    (Math.abs(degrees) === maximumDegrees && minutes !== 0)
  ) {
    return invalidResponse(`Out-of-range JMA station ${field}.`);
  }
  const coordinate =
    degrees < 0 ? degrees - minutes / 60 : degrees + minutes / 60;
  return Object.is(coordinate, -0) ? 0 : coordinate;
}

export function decodeJmaStationTable(
  payload: unknown,
): ReadonlyMap<string, StationMetadata> {
  if (!isRecord(payload)) {
    return invalidResponse("Invalid JMA station table envelope.");
  }
  const stations = new Map<string, StationMetadata>();
  for (const [id, value] of Object.entries(payload)) {
    if (!/^\d{5}$/u.test(id) || !isRecord(value)) {
      return invalidResponse("Invalid JMA station table entry.");
    }
    const name = value.kjName;
    const elevationMeters = value.alt;
    if (
      typeof name !== "string" ||
      name.trim().length === 0 ||
      name.length > 100 ||
      typeof elevationMeters !== "number" ||
      !Number.isFinite(elevationMeters) ||
      elevationMeters < -500 ||
      elevationMeters > 5_000
    ) {
      return invalidResponse("Invalid JMA station metadata.");
    }
    stations.set(
      id,
      Object.freeze({
        elevationMeters,
        id,
        latitude: degreeMinuteCoordinate(value.lat, 90, "latitude"),
        longitude: degreeMinuteCoordinate(
          value.lon,
          180,
          "longitude",
        ),
        name,
      }),
    );
  }
  if (stations.size === 0) {
    return invalidResponse("JMA station table is empty.");
  }
  return stations;
}

function measurement(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string,
): number | null {
  if (value === undefined) {
    return null;
  }
  if (!Array.isArray(value) || value.length !== 2) {
    return invalidResponse(`Invalid JMA ${field} measurement.`);
  }
  const [reading, quality] = value;
  if (
    typeof quality !== "number" ||
    !Number.isInteger(quality) ||
    quality < 0
  ) {
    return invalidResponse(`Invalid JMA ${field} quality.`);
  }
  if (reading === null || quality !== 0) {
    return null;
  }
  if (
    typeof reading !== "number" ||
    !Number.isFinite(reading) ||
    reading < minimum ||
    reading > maximum
  ) {
    return null;
  }
  return reading;
}

function decodeStationObservation(
  value: unknown,
): StationObservation | null {
  if (!isRecord(value)) {
    return invalidResponse("Invalid JMA map station entry.");
  }
  const pressureHpa = measurement(
    value.pressure,
    300,
    1_100,
    "pressure",
  );
  const temperatureCelsius = measurement(
    value.temp,
    -100,
    60,
    "temperature",
  );
  const relativeHumidityPercent = measurement(
    value.humidity,
    0,
    100,
    "humidity",
  );
  if (
    pressureHpa === null ||
    temperatureCelsius === null ||
    relativeHumidityPercent === null
  ) {
    return null;
  }
  return Object.freeze({
    pressureHpa,
    relativeHumidityPercent,
    temperatureCelsius,
  });
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceKilometers(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const latitudeARadians = degreesToRadians(latitudeA);
  const latitudeBRadians = degreesToRadians(latitudeB);
  const latitudeDelta = degreesToRadians(latitudeB - latitudeA);
  const longitudeDelta = degreesToRadians(longitudeB - longitudeA);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeARadians) *
      Math.cos(latitudeBRadians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    2 *
    EARTH_RADIUS_KILOMETERS *
    Math.asin(Math.min(1, Math.sqrt(haversine)))
  );
}

export function selectNearestJmaObservation(
  stationTable: ReadonlyMap<string, StationMetadata>,
  mapPayload: unknown,
  latitude: number,
  longitude: number,
): Omit<JmaAmedasCurrentWeather, "observedAtIso"> | null {
  validateCoordinates(latitude, longitude);
  if (!isRecord(mapPayload)) {
    return invalidResponse("Invalid JMA observation map envelope.");
  }
  let nearest:
    | (Omit<JmaAmedasCurrentWeather, "observedAtIso"> & {
        stationDistanceKilometers: number;
      })
    | null = null;
  for (const [stationId, value] of Object.entries(mapPayload)) {
    if (!/^\d{5}$/u.test(stationId)) {
      return invalidResponse("Invalid JMA observation map station id.");
    }
    const metadata = stationTable.get(stationId);
    if (!metadata) {
      continue;
    }
    const observation = decodeStationObservation(value);
    if (!observation) {
      continue;
    }
    const distance = haversineDistanceKilometers(
      latitude,
      longitude,
      metadata.latitude,
      metadata.longitude,
    );
    if (
      distance > MAX_STATION_DISTANCE_KILOMETERS ||
      (nearest &&
        (distance > nearest.stationDistanceKilometers ||
          (distance === nearest.stationDistanceKilometers &&
            stationId >= nearest.stationId)))
    ) {
      continue;
    }
    nearest = Object.freeze({
      ...observation,
      providerKind: "jma-observation",
      stationDistanceKilometers: distance,
      stationElevationMeters: metadata.elevationMeters,
      stationId,
      stationName: metadata.name,
    });
  }
  return nearest;
}

function acceptedContentType(
  response: Response,
  acceptedMediaTypes: readonly string[],
): boolean {
  const contentType = response.headers.get("content-type");
  if (!contentType) {
    return false;
  }
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType !== undefined && acceptedMediaTypes.includes(mediaType);
}

async function readBoundedUtf8(
  response: Response,
  maximumBytes: number,
  requestController: AbortController,
): Promise<string> {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        return text + decoder.decode();
      }
      byteLength += chunk.value.byteLength;
      if (byteLength > maximumBytes) {
        requestController.abort();
        return invalidResponse("JMA response is too large.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch (error: unknown) {
    if (error instanceof TypeError && !requestController.signal.aborted) {
      return invalidResponse("JMA response is not valid UTF-8.");
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function fetchBoundedText(
  url: URL,
  acceptedMediaTypes: readonly string[],
  maximumBytes: number,
  fetcher: WeatherFetch,
  signal: AbortSignal,
  timeoutMilliseconds: number,
): Promise<string> {
  const requestController = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => requestController.abort(signal.reason);
  if (signal.aborted) {
    abortFromCaller();
  } else {
    signal.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, timeoutMilliseconds);

  try {
    let response: Response;
    try {
      response = await fetcher(url, {
        cache: "no-store",
        credentials: "omit",
        method: "GET",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: requestController.signal,
      });
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
      if (timedOut) {
        throw new JmaAmedasError("timeout", "JMA request timed out.");
      }
      throw new JmaAmedasError("network", "JMA request failed.");
    }
    if (!response.ok) {
      throw new JmaAmedasError(
        "http",
        `JMA returned HTTP ${response.status}.`,
      );
    }
    if (!acceptedContentType(response, acceptedMediaTypes)) {
      requestController.abort();
      return invalidResponse("Unexpected JMA response content type.");
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null) {
      if (!/^\d+$/u.test(contentLength)) {
        requestController.abort();
        return invalidResponse("Invalid JMA response content length.");
      }
      if (Number(contentLength) > maximumBytes) {
        requestController.abort();
        return invalidResponse("JMA response is too large.");
      }
    }
    try {
      return await readBoundedUtf8(
        response,
        maximumBytes,
        requestController,
      );
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
      if (timedOut) {
        throw new JmaAmedasError("timeout", "JMA request timed out.");
      }
      throw error;
    }
  } finally {
    globalThis.clearTimeout(timeout);
    signal.removeEventListener("abort", abortFromCaller);
  }
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return invalidResponse(`Invalid JMA ${label} JSON.`);
  }
}

function mapUrl(timestamp: string): URL {
  if (!/^\d{14}$/u.test(timestamp)) {
    return invalidResponse("Invalid JMA map timestamp.");
  }
  return new URL(`${timestamp}.json`, JMA_AMEDAS_MAP_BASE_URL);
}

export async function fetchJmaAmedasCurrentWeather({
  fetcher = globalThis.fetch,
  latitude,
  longitude,
  nowMilliseconds = Date.now,
  signal,
  timeoutMilliseconds = DEFAULT_TIMEOUT_MILLISECONDS,
}: JmaAmedasWeatherRequest): Promise<JmaAmedasCurrentWeather> {
  validateCoordinates(latitude, longitude);
  if (
    !Number.isFinite(timeoutMilliseconds) ||
    timeoutMilliseconds <= 0
  ) {
    throw new RangeError("Weather request timeout must be positive.");
  }
  const operationController = new AbortController();
  const abortFromCaller = () => operationController.abort(signal?.reason);
  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const latestText = await fetchBoundedText(
      new URL(JMA_AMEDAS_LATEST_TIME_URL),
      ["text/plain"],
      MAX_LATEST_TIME_BYTES,
      fetcher,
      operationController.signal,
      timeoutMilliseconds,
    );
    const latest = decodeJmaLatestTime(latestText);
    const now = nowMilliseconds();
    const observationAge = now - latest.observedAtMilliseconds;
    if (
      !Number.isFinite(now) ||
      observationAge > MAX_OBSERVATION_AGE_MILLISECONDS ||
      observationAge < -MAX_FUTURE_SKEW_MILLISECONDS
    ) {
      throw new JmaAmedasError("stale", "JMA observation is stale.");
    }

    let stationTableText: string;
    let mapText: string;
    try {
      [stationTableText, mapText] = await Promise.all([
        fetchBoundedText(
          new URL(JMA_AMEDAS_STATION_TABLE_URL),
          ["application/json"],
          MAX_STATION_TABLE_BYTES,
          fetcher,
          operationController.signal,
          timeoutMilliseconds,
        ),
        fetchBoundedText(
          mapUrl(latest.mapTimestamp),
          ["application/json"],
          MAX_MAP_BYTES,
          fetcher,
          operationController.signal,
          timeoutMilliseconds,
        ),
      ]);
    } catch (error: unknown) {
      operationController.abort();
      throw error;
    }
    const stationTable = decodeJmaStationTable(
      parseJson(stationTableText, "station table"),
    );
    const nearest = selectNearestJmaObservation(
      stationTable,
      parseJson(mapText, "observation map"),
      latitude,
      longitude,
    );
    if (!nearest) {
      throw new JmaAmedasError(
        "unavailable",
        "No eligible JMA station is within 25 km.",
      );
    }
    return Object.freeze({
      ...nearest,
      observedAtIso: latest.observedAtIso,
    });
  } finally {
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
