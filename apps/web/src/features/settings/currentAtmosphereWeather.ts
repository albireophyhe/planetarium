import {
  fetchJmaAmedasCurrentWeather,
  type JmaAmedasCurrentWeather,
} from "./jmaAmedasWeather";
import { fetchOpenMeteoCurrentWeather } from "./openMeteoWeather";

type WeatherFetch = typeof globalThis.fetch;

export type OpenMeteoModelWeather = Readonly<{
  observedAtIso: string;
  pressureHpa: number;
  providerKind: "open-meteo-model";
  relativeHumidityPercent: number;
  stationDistanceKilometers: null;
  stationElevationMeters: null;
  stationId: null;
  stationName: null;
  temperatureCelsius: number;
}>;

export type CurrentAtmosphereWeather =
  | JmaAmedasCurrentWeather
  | OpenMeteoModelWeather;

type CurrentAtmosphereWeatherRequest = Readonly<{
  fetcher?: WeatherFetch;
  latitude: number;
  longitude: number;
  nowMilliseconds?: () => number;
  signal?: AbortSignal;
  timeoutMilliseconds?: number;
}>;

export async function fetchCurrentAtmosphereWeather({
  fetcher = globalThis.fetch,
  latitude,
  longitude,
  nowMilliseconds = Date.now,
  signal,
  timeoutMilliseconds,
}: CurrentAtmosphereWeatherRequest): Promise<CurrentAtmosphereWeather> {
  try {
    return await fetchJmaAmedasCurrentWeather({
      fetcher,
      latitude,
      longitude,
      nowMilliseconds,
      signal,
      timeoutMilliseconds,
    });
  } catch (error: unknown) {
    if (signal?.aborted) {
      throw error;
    }
  }

  const weather = await fetchOpenMeteoCurrentWeather({
    fetcher,
    latitude,
    longitude,
    nowMilliseconds,
    signal,
    timeoutMilliseconds,
  });
  return Object.freeze({
    ...weather,
    providerKind: "open-meteo-model",
    stationDistanceKilometers: null,
    stationElevationMeters: null,
    stationId: null,
    stationName: null,
  });
}
