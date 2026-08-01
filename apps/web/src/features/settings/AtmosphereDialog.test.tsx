import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  STANDARD_VISUAL_ATMOSPHERE,
} from "../../app/standardAtmosphere";
import { AtmosphereDialog } from "./AtmosphereDialog";

const DEFAULT_OBSERVER = {
  latitude: 35.681236,
  longitude: 139.767125,
};

function freshJmaLatestTime() {
  const japanTime = new Date(Date.now() + 9 * 60 * 60 * 1_000);
  const year = String(japanTime.getUTCFullYear()).padStart(4, "0");
  const month = String(japanTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(japanTime.getUTCDate()).padStart(2, "0");
  const hour = String(japanTime.getUTCHours()).padStart(2, "0");
  const minute = String(
    Math.floor(japanTime.getUTCMinutes() / 10) * 10,
  ).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
}

function successfulJmaFetcher() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/latest_time.txt")) {
      return new Response(freshJmaLatestTime(), {
        headers: { "content-type": "text/plain" },
      });
    }
    if (url.pathname.endsWith("/amedastable.json")) {
      return new Response(
        JSON.stringify({
          "44132": {
            alt: 25.2,
            kjName: "東京",
            lat: [35, 41.4],
            lon: [139, 45],
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (/\/data\/map\/\d{14}\.json$/u.test(url.pathname)) {
      return new Response(
        JSON.stringify({
          "44132": {
            humidity: [68, 0],
            normalPressure: [1013.8, 0],
            pressure: [1002.4, 0],
            temp: [23.5, 0],
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`Unexpected test URL: ${url.href}`);
  });
}

function openMeteoModelResponse() {
  const now = new Date();
  const currentTime = now.toISOString().slice(0, 16);
  return new Response(
    JSON.stringify({
      current: {
        relative_humidity_2m: 61,
        surface_pressure: 999.8,
        temperature_2m: 25.2,
        time: currentTime,
      },
      current_units: {
        relative_humidity_2m: "%",
        surface_pressure: "hPa",
        temperature_2m: "°C",
        time: "iso8601",
      },
      utc_offset_seconds: 0,
    }),
    { headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog(
  onApply = vi.fn(),
  current: Parameters<typeof AtmosphereDialog>[0]["current"] = null,
  manualDraftAtmosphere: Parameters<
    typeof AtmosphereDialog
  >[0]["manualDraftAtmosphere"] = null,
) {
  render(
    <AtmosphereDialog
      current={current}
      manualDraftAtmosphere={manualDraftAtmosphere}
      observer={DEFAULT_OBSERVER}
      onApply={onApply}
      onClose={vi.fn()}
      open
    />,
  );
  return onApply;
}

describe("AtmosphereDialog", () => {
  it("fetches weather only after explicit consent and applies it atomically", async () => {
    const user = userEvent.setup();
    const fetcher = successfulJmaFetcher();
    vi.stubGlobal("fetch", fetcher);
    const onApply = renderDialog(vi.fn(), null, {
      minimumGeometricAltitudeDegrees: 8,
      pressureHpa: 987.6,
      relativeHumidity: 0.64,
      temperatureCelsius: 16.5,
      wavelengthMicrometers: 0.61,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(
      screen.getByText(/緯度 35\.6812°、経度 139\.7671°/),
    ).toBeVisible();
    expect(
      screen.getByText(/星図の表示時刻とは自動同期しません/),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "現在の気象を取得して適用",
      }),
    );

    expect(
      await screen.findByText(/気象庁・最寄り局実測（東京.*JST）/),
    ).toHaveTextContent(
      "気圧 1002.4 hPa・気温 23.5°C・相対湿度 68%",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "約1.8 km・標高 25.2 m",
    );
    expect(
      screen.getByText(/観測局標高での未補正現地気圧/),
    ).toBeVisible();
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      {
        atmosphere: {
          minimumGeometricAltitudeDegrees: 8,
          pressureHpa: 1002.4,
          relativeHumidity: 0.68,
          temperatureCelsius: 23.5,
          wavelengthMicrometers: 0.61,
        },
        inputSource: "manual",
      },
      { closeDialog: false },
    );
    expect(
      screen.getByRole("spinbutton", { name: "気圧（hPa）" }),
    ).toHaveValue(1002.4);
    expect(
      screen.getByRole("link", {
        name: "Weather data by Open-Meteo.com",
      }),
    ).toHaveAttribute("href", "https://open-meteo.com/en/licence");
    expect(
      screen.getByRole("button", { name: "閉じる" }),
    ).toBeVisible();

    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [input] of fetcher.mock.calls) {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://www.jma.go.jp");
      expect(url.search).toBe("");
      expect(url.href).not.toContain("35.6812");
      expect(url.href).not.toContain("139.7671");
    }
  });

  it("keeps the applied atmosphere unchanged when weather loading fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(null, { status: 503 }),
      ),
    );
    const onApply = renderDialog(vi.fn(), {
      atmosphere: STANDARD_VISUAL_ATMOSPHERE,
      inputSource: "standard",
    });

    await user.click(
      screen.getByRole("button", {
        name: "現在の気象を取得して適用",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "再試行してください。大気設定は変更されていません",
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("標準大気を適用中")).toBeVisible();
  });

  it("identifies Open-Meteo model values after the AMeDAS fallback", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      return url.origin === "https://www.jma.go.jp"
        ? new Response(null, { status: 503 })
        : openMeteoModelResponse();
    });
    vi.stubGlobal("fetch", fetcher);
    const onApply = renderDialog(vi.fn(), null, {
      minimumGeometricAltitudeDegrees: 7,
      pressureHpa: 987.6,
      relativeHumidity: 0.64,
      temperatureCelsius: 16.5,
      wavelengthMicrometers: 0.61,
    });

    await user.click(
      screen.getByRole("button", {
        name: "現在の気象を取得して適用",
      }),
    );

    expect(
      await screen.findByText(/Open-Meteo気象モデル（.*JST）/),
    ).toHaveTextContent(
      "気圧 999.8 hPa・気温 25.2°C・相対湿度 61%",
    );
    expect(onApply).toHaveBeenCalledWith(
      {
        atmosphere: {
          minimumGeometricAltitudeDegrees: 7,
          pressureHpa: 999.8,
          relativeHumidity: 0.61,
          temperatureCelsius: 25.2,
          wavelengthMicrometers: 0.61,
        },
        inputSource: "manual",
      },
      { closeDialog: false },
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("aborts weather loading when the dialog unmounts", async () => {
    let requestSignal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal ?? undefined;
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const view = render(
      <AtmosphereDialog
        current={null}
        observer={DEFAULT_OBSERVER}
        onApply={vi.fn()}
        onClose={vi.fn()}
        open
      />,
    );

    const weatherButton = screen.getByRole("button", {
      name: "現在の気象を取得して適用",
    });
    fireEvent.click(weatherButton);
    fireEvent.click(weatherButton);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(false);

    view.unmount();

    expect(requestSignal?.aborted).toBe(true);
  });

  it("keeps draft edits isolated and applies all validated values atomically", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog();

    const pressure = screen.getByRole("spinbutton", {
      name: "気圧（hPa）",
    });
    await user.clear(pressure);
    await user.type(pressure, "998.4");
    await user.clear(
      screen.getByRole("spinbutton", { name: "気温（°C）" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "気温（°C）" }),
      "18.5",
    );
    await user.clear(
      screen.getByRole("spinbutton", { name: "相対湿度（%）" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "相対湿度（%）" }),
      "72",
    );
    await user.clear(
      screen.getByRole("spinbutton", {
        name: "観測波長（µm）",
      }),
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: "観測波長（µm）",
      }),
      "0.6",
    );
    await user.clear(
      screen.getByRole("spinbutton", {
        name: /^適用下限の幾何高度（°）/,
      }),
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: /^適用下限の幾何高度（°）/,
      }),
      "8",
    );

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("オフ（大気差なし）")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      atmosphere: {
        minimumGeometricAltitudeDegrees: 8,
        pressureHpa: 998.4,
        relativeHumidity: 0.72,
        temperatureCelsius: 18.5,
        wavelengthMicrometers: 0.6,
      },
      inputSource: "manual",
    });
  });

  it("shows field and summary errors without replacing the applied setting", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog(vi.fn(), {
      atmosphere: STANDARD_VISUAL_ATMOSPHERE,
      inputSource: "standard",
    });

    const pressure = screen.getByRole("spinbutton", {
      name: "気圧（hPa）",
    });
    await user.clear(pressure);
    await user.type(pressure, "1200");
    await user.clear(
      screen.getByRole("spinbutton", {
        name: /^適用下限の幾何高度（°）/,
      }),
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: /^適用下限の幾何高度（°）/,
      }),
      "4",
    );
    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );

    expect(onApply).not.toHaveBeenCalled();
    expect(pressure).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("気圧は0〜1,100 hPaで入力してください。"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "適用下限の幾何高度は5〜30°で入力してください。",
      ),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "大気設定はまだ変更されていません",
    );
    expect(screen.getByText("標準大気を適用中")).toBeVisible();
  });

  it("rejects a range-valid but physically singular atmosphere before apply", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog();
    const pressure = screen.getByRole("spinbutton", {
      name: "気圧（hPa）",
    });
    const temperature = screen.getByRole("spinbutton", {
      name: "気温（°C）",
    });
    const humidity = screen.getByRole("spinbutton", {
      name: "相対湿度（%）",
    });
    await user.clear(pressure);
    await user.type(pressure, "1");
    await user.clear(temperature);
    await user.type(temperature, "60");
    await user.clear(humidity);
    await user.type(humidity, "0");

    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "この気象条件では安定した大気差を計算できません",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "大気設定はまだ変更されていません",
    );
  });

  it("keeps manual provenance when unchanged draft values equal the standard preset", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog();

    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );

    expect(onApply).toHaveBeenCalledWith({
      atmosphere: STANDARD_VISUAL_ATMOSPHERE,
      inputSource: "manual",
    });
  });

  it("can explicitly return to the standard preset", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog(vi.fn(), {
      atmosphere: {
        minimumGeometricAltitudeDegrees: 8,
        pressureHpa: 998.4,
        relativeHumidity: 0.72,
        temperatureCelsius: 18.5,
        wavelengthMicrometers: 0.6,
      },
      inputSource: "manual",
    });

    await user.click(
      screen.getByRole("button", { name: "標準大気を適用" }),
    );

    expect(onApply).toHaveBeenCalledWith({
      atmosphere: STANDARD_VISUAL_ATMOSPHERE,
      inputSource: "standard",
    });
  });

  it("restores the last session-only manual values after standard or off", () => {
    renderDialog(vi.fn(), null, {
      minimumGeometricAltitudeDegrees: 7,
      pressureHpa: 987.6,
      relativeHumidity: 0.64,
      temperatureCelsius: 16.5,
      wavelengthMicrometers: 0.61,
    });

    expect(
      screen.getByRole("spinbutton", { name: "気圧（hPa）" }),
    ).toHaveValue(987.6);
    expect(
      screen.getByRole("spinbutton", { name: "相対湿度（%）" }),
    ).toHaveValue(64);
    expect(screen.getByText("オフ（大気差なし）")).toBeVisible();
  });

  it("restores common humidity percentages without binary tails", () => {
    renderDialog(vi.fn(), null, {
      minimumGeometricAltitudeDegrees: 7,
      pressureHpa: 987.6,
      relativeHumidity: 0.29,
      temperatureCelsius: 16.5,
      wavelengthMicrometers: 0.61,
    });

    expect(
      screen.getByRole("spinbutton", { name: "相対湿度（%）" }),
    ).toHaveValue(29);
  });

  it("normalizes a pasted Japanese minus sign before validation", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog();
    const temperature = screen.getByRole("spinbutton", {
      name: "気温（°C）",
    });

    fireEvent.paste(temperature, {
      clipboardData: {
        getData: () => "−12.5",
      },
    });
    expect(temperature).toHaveValue(-12.5);

    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        atmosphere: expect.objectContaining({
          temperatureCelsius: -12.5,
        }),
      }),
    );
  });

  it("removes a pasted leading fullwidth plus for number inputs", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog();
    const temperature = screen.getByRole("spinbutton", {
      name: "気温（°C）",
    });

    fireEvent.paste(temperature, {
      clipboardData: {
        getData: () => "\uFF0B12",
      },
    });
    expect(temperature).toHaveValue(12);

    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        atmosphere: expect.objectContaining({
          temperatureCelsius: 12,
        }),
      }),
    );
  });
});
