import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeOpenMeteoCurrentWeather,
  fetchOpenMeteoCurrentWeather,
} from "./openMeteoWeather";

function validPayload() {
  return {
    current: {
      relative_humidity_2m: 68,
      surface_pressure: 1002.4,
      temperature_2m: 23.5,
      time: "2026-08-01T12:15",
    },
    current_units: {
      relative_humidity_2m: "%",
      surface_pressure: "hPa",
      temperature_2m: "°C",
      time: "iso8601",
    },
    utc_offset_seconds: 0,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("decodeOpenMeteoCurrentWeather", () => {
  it("strictly decodes the requested UTC values and units", () => {
    expect(decodeOpenMeteoCurrentWeather(validPayload())).toEqual({
      observedAtIso: "2026-08-01T12:15:00.000Z",
      pressureHpa: 1002.4,
      relativeHumidityPercent: 68,
      temperatureCelsius: 23.5,
    });
  });

  it("rejects an unexpected unit", () => {
    const payload = validPayload();
    payload.current_units.surface_pressure = "Pa";

    expect(() => decodeOpenMeteoCurrentWeather(payload)).toThrow(
      "Unexpected unit for surface_pressure",
    );
  });

  it.each([
    ["non-finite temperature", "temperature_2m", Number.NaN],
    ["out-of-range humidity", "relative_humidity_2m", 101],
    ["out-of-range pressure", "surface_pressure", 1_101],
    ["zero surface pressure", "surface_pressure", 0],
  ])("rejects %s", (_label, field, value) => {
    const payload = validPayload();
    const current: Record<string, number | string> = payload.current;
    current[field] = value;

    expect(() => decodeOpenMeteoCurrentWeather(payload)).toThrow(
      `Invalid value for ${field}`,
    );
  });
});

describe("fetchOpenMeteoCurrentWeather", () => {
  it("requests only the selected observer and required current fields", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(validPayload()), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(
      fetchOpenMeteoCurrentWeather({
        fetcher,
        latitude: 35.681236,
        longitude: 139.767125,
        nowMilliseconds: () => Date.parse("2026-08-01T12:20:00Z"),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        pressureHpa: 1002.4,
      }),
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [input, init] = fetcher.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.open-meteo.com/v1/forecast",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      current:
        "temperature_2m,relative_humidity_2m,surface_pressure",
      forecast_days: "1",
      latitude: "35.6812",
      longitude: "139.7671",
      timezone: "UTC",
    });
    expect(init).toEqual(
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        method: "GET",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects a non-JSON response before decoding", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(validPayload()), {
        headers: { "content-type": "text/plain" },
        status: 200,
      }),
    );

    await expect(
      fetchOpenMeteoCurrentWeather({
        fetcher,
        latitude: 35,
        longitude: 139,
      }),
    ).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("rejects an oversized streamed JSON response", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({ padding: "x".repeat(64 * 1_024) }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      fetchOpenMeteoCurrentWeather({
        fetcher,
        latitude: 35,
        longitude: 139,
      }),
    ).rejects.toMatchObject({ code: "invalid-response" });
  });

  it.each([
    ["stale", "2026-08-01T10:59"],
    ["future", "2026-08-01T13:01"],
  ])("rejects a %s model timestamp outside one hour", async (_label, time) => {
    const payload = validPayload();
    payload.current.time = time;
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(
      fetchOpenMeteoCurrentWeather({
        fetcher,
        latitude: 35,
        longitude: 139,
        nowMilliseconds: () => Date.parse("2026-08-01T12:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("aborts a stalled request at the configured timeout", async () => {
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
    const request = fetchOpenMeteoCurrentWeather({
      fetcher,
      latitude: 35,
      longitude: 139,
      timeoutMilliseconds: 25,
    });
    const assertion = expect(request).rejects.toMatchObject({
      code: "timeout",
    });

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });
});
