import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCurrentAtmosphereWeather } from "./currentAtmosphereWeather";
import {
  decodeJmaLatestTime,
  decodeJmaStationTable,
  fetchJmaAmedasCurrentWeather,
  selectNearestJmaObservation,
} from "./jmaAmedasWeather";

const LATEST_TIME = "2026-08-01T12:00:00+09:00";
const NOW_MILLISECONDS = Date.parse("2026-08-01T03:20:00Z");
const OBSERVER = {
  latitude: 35.681236,
  longitude: 139.767125,
};

afterEach(() => {
  vi.useRealTimers();
});

const STATION_TABLE = {
  "44132": {
    alt: 25.2,
    kjName: "東京",
    lat: [35, 41.4],
    lon: [139, 45],
  },
  "44166": {
    alt: 6.5,
    kjName: "羽田",
    lat: [35, 33.2],
    lon: [139, 46.8],
  },
};

const OBSERVATION_MAP = {
  "44132": {
    humidity: [68, 0],
    normalPressure: [1013.8, 0],
    pressure: [1002.4, 0],
    temp: [23.5, 0],
  },
  "44166": {
    humidity: [72, 0],
    normalPressure: [1014.1, 0],
    pressure: [1005.1, 0],
    temp: [24.1, 0],
  },
};

function textResponse(
  text: string,
  status = 200,
  headers: HeadersInit = {},
) {
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      ...headers,
    },
    status,
  });
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json; charset=UTF-8" },
    status,
  });
}

function openMeteoResponse() {
  return jsonResponse({
    current: {
      relative_humidity_2m: 61,
      surface_pressure: 999.8,
      temperature_2m: 25.2,
      time: "2026-08-01T03:15",
    },
    current_units: {
      relative_humidity_2m: "%",
      surface_pressure: "hPa",
      temperature_2m: "°C",
      time: "iso8601",
    },
    utc_offset_seconds: 0,
  });
}

type JmaFixture = Readonly<{
  latestResponse?: Response;
  map?: unknown;
  stationTable?: unknown;
}>;

function fixtureFetcher(fixture: JmaFixture = {}) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.origin === "https://api.open-meteo.com") {
      return openMeteoResponse();
    }
    if (url.pathname.endsWith("/latest_time.txt")) {
      return fixture.latestResponse ?? textResponse(LATEST_TIME);
    }
    if (url.pathname.endsWith("/amedastable.json")) {
      return jsonResponse(fixture.stationTable ?? STATION_TABLE);
    }
    if (/\/data\/map\/\d{14}\.json$/u.test(url.pathname)) {
      return jsonResponse(fixture.map ?? OBSERVATION_MAP);
    }
    throw new Error(`Unexpected test URL: ${url.href}`);
  });
}

function stationTableAtDistance(distanceKilometers: number) {
  const latitude =
    OBSERVER.latitude +
    (distanceKilometers / 6_371.0088) * (180 / Math.PI);
  const latitudeDegrees = Math.trunc(latitude);
  return decodeJmaStationTable({
    "44132": {
      alt: 25.2,
      kjName: "境界局",
      lat: [latitudeDegrees, (latitude - latitudeDegrees) * 60],
      lon: [139, (OBSERVER.longitude - 139) * 60],
    },
  });
}

describe("JMA AMeDAS current weather", () => {
  it("strictly parses the JST feed time into its fixed map path", () => {
    expect(decodeJmaLatestTime(`${LATEST_TIME}\n`)).toEqual({
      mapTimestamp: "20260801120000",
      observedAtIso: "2026-08-01T03:00:00.000Z",
      observedAtMilliseconds: Date.parse(
        "2026-08-01T03:00:00.000Z",
      ),
    });
  });

  it.each([
    ` ${LATEST_TIME}`,
    "2026-08-01T12:05:00+09:00",
    "2026-08-01T12:00:00Z",
    `${LATEST_TIME} unexpected`,
  ])("rejects a non-canonical latest_time value: %s", (value) => {
    expect(() => decodeJmaLatestTime(value)).toThrow(
      "Invalid JMA latest_time",
    );
  });

  it("selects the nearest eligible station and uses local pressure", async () => {
    const fetcher = fixtureFetcher();

    await expect(
      fetchJmaAmedasCurrentWeather({
        fetcher,
        ...OBSERVER,
        nowMilliseconds: () => NOW_MILLISECONDS,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        observedAtIso: "2026-08-01T03:00:00.000Z",
        pressureHpa: 1002.4,
        providerKind: "jma-observation",
        relativeHumidityPercent: 68,
        stationElevationMeters: 25.2,
        stationId: "44132",
        stationName: "東京",
        temperatureCelsius: 23.5,
      }),
    );

    expect(fetcher).toHaveBeenCalledTimes(3);
    const calls = fetcher.mock.calls.map(([input, init]) => ({
      init,
      url: new URL(String(input)),
    }));
    expect(calls.map(({ url }) => url.href).sort()).toEqual(
      [
        "https://www.jma.go.jp/bosai/amedas/const/amedastable.json",
        "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt",
        "https://www.jma.go.jp/bosai/amedas/data/map/20260801120000.json",
      ].sort(),
    );
    for (const { init, url } of calls) {
      expect(url.search).toBe("");
      expect(url.href).not.toContain(String(OBSERVER.latitude));
      expect(url.href).not.toContain(String(OBSERVER.longitude));
      expect(init).toEqual(
        expect.objectContaining({
          credentials: "omit",
          method: "GET",
          redirect: "error",
          referrerPolicy: "no-referrer",
          signal: expect.any(AbortSignal),
        }),
      );
    }
  });

  it("rejects a response larger than the endpoint guard", async () => {
    const fetcher = fixtureFetcher({
      latestResponse: textResponse(LATEST_TIME, 200, {
        "content-length": "129",
      }),
    });

    await expect(
      fetchJmaAmedasCurrentWeather({
        fetcher,
        ...OBSERVER,
        nowMilliseconds: () => NOW_MILLISECONDS,
      }),
    ).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("accepts a station just inside 25 km and rejects one outside", () => {
    const map = {
      "44132": {
        humidity: [68, 0],
        pressure: [1002.4, 0],
        temp: [23.5, 0],
      },
    };

    expect(
      selectNearestJmaObservation(
        stationTableAtDistance(24.99),
        map,
        OBSERVER.latitude,
        OBSERVER.longitude,
      ),
    ).toEqual(expect.objectContaining({ stationName: "境界局" }));
    expect(
      selectNearestJmaObservation(
        stationTableAtDistance(25.01),
        map,
        OBSERVER.latitude,
        OBSERVER.longitude,
      ),
    ).toBeNull();
  });

  it("aborts a stalled JMA request at the configured timeout", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const request = fetchJmaAmedasCurrentWeather({
      fetcher,
      ...OBSERVER,
      nowMilliseconds: () => NOW_MILLISECONDS,
      timeoutMilliseconds: 25,
    });
    const assertion = expect(request).rejects.toMatchObject({
      code: "timeout",
    });

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });
});

describe("current atmosphere weather provider fallback", () => {
  it.each([
    {
      label: "non-zero AMeDAS quality",
      map: {
        "44132": {
          humidity: [68, 0],
          pressure: [1002.4, 1],
          temp: [23.5, 0],
        },
      },
      stationTable: STATION_TABLE,
    },
    {
      label: "missing AMeDAS humidity",
      map: {
        "44132": {
          pressure: [1002.4, 0],
          temp: [23.5, 0],
        },
      },
      stationTable: STATION_TABLE,
    },
    {
      label: "an eligible station farther than 25 km",
      map: {
        "47401": {
          humidity: [70, 0],
          pressure: [1001.2, 0],
          temp: [18.1, 0],
        },
      },
      stationTable: {
        "47401": {
          alt: 2,
          kjName: "稚内",
          lat: [45, 24.9],
          lon: [141, 40.7],
        },
      },
    },
  ])("falls back to the model for $label", async ({ map, stationTable }) => {
    const fetcher = fixtureFetcher({ map, stationTable });

    await expect(
      fetchCurrentAtmosphereWeather({
        fetcher,
        ...OBSERVER,
        nowMilliseconds: () => NOW_MILLISECONDS,
      }),
    ).resolves.toEqual({
      observedAtIso: "2026-08-01T03:15:00.000Z",
      pressureHpa: 999.8,
      providerKind: "open-meteo-model",
      relativeHumidityPercent: 61,
      stationDistanceKilometers: null,
      stationElevationMeters: null,
      stationId: null,
      stationName: null,
      temperatureCelsius: 25.2,
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("falls back without downloading station data when JMA is stale", async () => {
    const fetcher = fixtureFetcher({
      latestResponse: textResponse("2026-08-01T11:40:00+09:00"),
    });

    await expect(
      fetchCurrentAtmosphereWeather({
        fetcher,
        ...OBSERVER,
        nowMilliseconds: () => Date.parse("2026-08-01T03:11:00Z"),
      }),
    ).resolves.toEqual(
      expect.objectContaining({ providerKind: "open-meteo-model" }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("falls back when the JMA timestamp is implausibly in the future", async () => {
    const fetcher = fixtureFetcher();

    await expect(
      fetchCurrentAtmosphereWeather({
        fetcher,
        ...OBSERVER,
        nowMilliseconds: () => Date.parse("2026-08-01T02:54:00Z"),
      }),
    ).resolves.toEqual(
      expect.objectContaining({ providerKind: "open-meteo-model" }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("falls back when the JMA feed request fails", async () => {
    const fetcher = fixtureFetcher({
      latestResponse: textResponse("unavailable", 503),
    });

    await expect(
      fetchCurrentAtmosphereWeather({
        fetcher,
        ...OBSERVER,
        nowMilliseconds: () => NOW_MILLISECONDS,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ providerKind: "open-meteo-model" }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
