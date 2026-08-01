const OPEN_METEO_FORECAST_ENDPOINT =
  "https://api.open-meteo.com/v1/forecast";
const DEFAULT_TIMEOUT_MILLISECONDS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1_024;
const MAX_MODEL_CLOCK_DIFFERENCE_MILLISECONDS = 60 * 60 * 1_000;

type WeatherFetch = typeof globalThis.fetch;

export type OpenMeteoCurrentWeather = Readonly<{
  observedAtIso: string;
  pressureHpa: number;
  relativeHumidityPercent: number;
  temperatureCelsius: number;
}>;

export type OpenMeteoCoordinates = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type OpenMeteoWeatherErrorCode =
  | "http"
  | "invalid-response"
  | "network"
  | "timeout";

export class OpenMeteoWeatherError extends Error {
  readonly code: OpenMeteoWeatherErrorCode;

  constructor(code: OpenMeteoWeatherErrorCode, message: string) {
    super(message);
    this.name = "OpenMeteoWeatherError";
    this.code = code;
  }
}

type OpenMeteoWeatherRequest = Readonly<{
  fetcher?: WeatherFetch;
  latitude: number;
  longitude: number;
  nowMilliseconds?: () => number;
  signal?: AbortSignal;
  timeoutMilliseconds?: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(message: string): never {
  throw new OpenMeteoWeatherError("invalid-response", message);
}

function requiredUnit(
  units: Record<string, unknown>,
  field: string,
  expected: string,
): void {
  if (units[field] !== expected) {
    invalidResponse(`Unexpected unit for ${field}.`);
  }
}

function requiredNumberInRange(
  current: Record<string, unknown>,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const value = current[field];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalidResponse(`Invalid value for ${field}.`);
  }
  return value;
}

function utcIsoString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return invalidResponse("Invalid current weather timestamp.");
  }
  const valueWithTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    ? value
    : `${value}Z`;
  const milliseconds = Date.parse(valueWithTimeZone);
  if (!Number.isFinite(milliseconds)) {
    return invalidResponse("Invalid current weather timestamp.");
  }
  return new Date(milliseconds).toISOString();
}

export function decodeOpenMeteoCurrentWeather(
  payload: unknown,
): OpenMeteoCurrentWeather {
  if (!isRecord(payload) || payload.utc_offset_seconds !== 0) {
    return invalidResponse("Invalid Open-Meteo response envelope.");
  }
  const units = payload.current_units;
  const current = payload.current;
  if (!isRecord(units) || !isRecord(current)) {
    return invalidResponse("Open-Meteo current weather is missing.");
  }

  requiredUnit(units, "time", "iso8601");
  requiredUnit(units, "temperature_2m", "°C");
  requiredUnit(units, "relative_humidity_2m", "%");
  requiredUnit(units, "surface_pressure", "hPa");

  return Object.freeze({
    observedAtIso: utcIsoString(current.time),
    pressureHpa: requiredNumberInRange(
      current,
      "surface_pressure",
      300,
      1_100,
    ),
    relativeHumidityPercent: requiredNumberInRange(
      current,
      "relative_humidity_2m",
      0,
      100,
    ),
    temperatureCelsius: requiredNumberInRange(
      current,
      "temperature_2m",
      -100,
      60,
    ),
  });
}

export function canonicalOpenMeteoCoordinates(
  latitude: number,
  longitude: number,
): OpenMeteoCoordinates {
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
  const roundedLatitude = Math.round(latitude * 10_000) / 10_000;
  const roundedLongitude = Math.round(longitude * 10_000) / 10_000;
  return Object.freeze({
    latitude: Object.is(roundedLatitude, -0) ? 0 : roundedLatitude,
    longitude: Object.is(roundedLongitude, -0) ? 0 : roundedLongitude,
  });
}

function requestUrl(latitude: number, longitude: number): URL {
  const url = new URL(OPEN_METEO_FORECAST_ENDPOINT);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,surface_pressure",
  );
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("forecast_days", "1");
  return url;
}

function responseMediaType(response: Response): string | null {
  const contentType = response.headers.get("content-type");
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}

async function readBoundedJson(
  response: Response,
  requestController: AbortController,
): Promise<unknown> {
  if (responseMediaType(response) !== "application/json") {
    requestController.abort();
    return invalidResponse("Unexpected Open-Meteo response content type.");
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) {
      requestController.abort();
      return invalidResponse("Invalid Open-Meteo response content length.");
    }
    if (Number(contentLength) > MAX_RESPONSE_BYTES) {
      requestController.abort();
      return invalidResponse("Open-Meteo response is too large.");
    }
  }
  if (!response.body) {
    return invalidResponse("Open-Meteo response body is missing.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        text += decoder.decode();
        break;
      }
      byteLength += chunk.value.byteLength;
      if (byteLength > MAX_RESPONSE_BYTES) {
        requestController.abort();
        return invalidResponse("Open-Meteo response is too large.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch (error: unknown) {
    if (error instanceof TypeError && !requestController.signal.aborted) {
      return invalidResponse("Open-Meteo response is not valid UTF-8.");
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return invalidResponse("Open-Meteo returned invalid JSON.");
  }
}

export async function fetchOpenMeteoCurrentWeather({
  fetcher = globalThis.fetch,
  latitude,
  longitude,
  nowMilliseconds = Date.now,
  signal,
  timeoutMilliseconds = DEFAULT_TIMEOUT_MILLISECONDS,
}: OpenMeteoWeatherRequest): Promise<OpenMeteoCurrentWeather> {
  const coordinates = canonicalOpenMeteoCoordinates(
    latitude,
    longitude,
  );
  if (
    !Number.isFinite(timeoutMilliseconds) ||
    timeoutMilliseconds <= 0
  ) {
    throw new RangeError("Weather request timeout must be positive.");
  }

  const requestController = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => requestController.abort(signal?.reason);
  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, timeoutMilliseconds);

  try {
    let response: Response;
    try {
      response = await fetcher(
        requestUrl(coordinates.latitude, coordinates.longitude),
        {
          cache: "no-store",
          credentials: "omit",
          method: "GET",
          redirect: "error",
          referrerPolicy: "no-referrer",
          signal: requestController.signal,
        },
      );
    } catch (error: unknown) {
      if (signal?.aborted) {
        throw error;
      }
      if (timedOut) {
        throw new OpenMeteoWeatherError(
          "timeout",
          "Open-Meteo request timed out.",
        );
      }
      throw new OpenMeteoWeatherError(
        "network",
        "Open-Meteo request failed.",
      );
    }

    if (!response.ok) {
      throw new OpenMeteoWeatherError(
        "http",
        `Open-Meteo returned HTTP ${response.status}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await readBoundedJson(response, requestController);
    } catch (error: unknown) {
      if (signal?.aborted) {
        throw error;
      }
      if (timedOut) {
        throw new OpenMeteoWeatherError(
          "timeout",
          "Open-Meteo request timed out.",
        );
      }
      if (error instanceof OpenMeteoWeatherError) {
        throw error;
      }
      throw new OpenMeteoWeatherError(
        "invalid-response",
        "Open-Meteo response could not be read.",
      );
    }
    const weather = decodeOpenMeteoCurrentWeather(payload);
    const now = nowMilliseconds();
    const observedAtMilliseconds = Date.parse(weather.observedAtIso);
    if (
      !Number.isFinite(now) ||
      Math.abs(now - observedAtMilliseconds) >
        MAX_MODEL_CLOCK_DIFFERENCE_MILLISECONDS
    ) {
      return invalidResponse(
        "Open-Meteo current weather timestamp is stale or in the future.",
      );
    }
    return weather;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
