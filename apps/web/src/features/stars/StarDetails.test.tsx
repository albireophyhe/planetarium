import {
  act,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StarViewModel } from "../../app/types";
import type { ResolvedTimeScales } from "../../domain";
import { StarDetails } from "./StarDetails";

const STAR: StarViewModel = {
  aliases: [],
  altitudeDeg: 42,
  annualAberrationMode:
    "truncated-vsop2000-heliocentric-earth",
  apparentDecRad: 0.2,
  apparentRaRad: 1.2,
  annualParallaxMode: "truncated-vsop2000-heliocentric-earth",
  azimuthDefined: true,
  azimuthDeg: 180,
  calculationModel: "v2",
  catalogName: "Vega",
  constellation: "こと座",
  decRad: 0.2,
  diurnalAberrationMode: "wgs84-observer",
  englishName: "Vega",
  geometricAltitudeDeg: 41.987654,
  geometricAzimuthDefined: true,
  geometricAzimuthDeg: 180.123456,
  hd: 172167,
  hr: 7001,
  japaneseName: "ベガ",
  parallaxArcsec: 0.13,
  pmDecArcsecPerYear: 0.286,
  pmRaCosDecArcsecPerYear: 0.201,
  polarMotionMode: "iers-predicted",
  raRad: 1.2,
  radialVelocityKmPerSecond: -13.9,
  refractionMode: "disabled",
  solarLightDeflectionMode:
    "truncated-vsop2000-heliocentric-earth",
  spaceMotionMode: "three-dimensional",
  vMagnitude: 0.03,
};

const PRECISION_EARTH_ORIENTATION_PROPS = {
  earthOrientationEstimate: {
    dut1: {
      seconds: 0.009_732,
      source: "predicted" as const,
      reportedErrorSeconds: 0.000_108,
    },
    polarMotion: {
      xpRadians: 1e-6,
      ypRadians: -2e-6,
      xpReportedErrorRadians: 1e-9,
      ypReportedErrorRadians: 2e-9,
      source: "predicted" as const,
      usesPrediction: true,
    },
  },
  earthOrientationSourceIdentifier:
    "IERS finals2000A; sha256=test-eop",
  polarMotionSnapshot: {
    mode: "iers-predicted" as const,
    xpRadians: 1e-6,
    ypRadians: -2e-6,
    xpReportedErrorRadians: 1e-9,
    ypReportedErrorRadians: 2e-9,
  },
};

function timeScales(
  source: ResolvedTimeScales["dut1Source"],
): ResolvedTimeScales {
  return {
    dut1Seconds: 0.009_732,
    dut1Source: source,
    dut1UncertaintySeconds:
      source.startsWith("iers-") ? 0.000_108 : null,
    taiMinusUtcSeconds: 37,
    taiMinusUtcSource: "iers-history",
    ttJulianDate: 2_461_000,
    utcJulianDate: 2_461_000,
    ut1JulianDate: 2_461_000,
    warnings: [],
  };
}

describe("StarDetails time-scale provenance", () => {
  it("shows the applied manual atmosphere values in the pointing conditions", () => {
    render(
      <StarDetails
        location={{
          heightMeters: 44.5,
          horizontalAccuracyMeters: null,
          id: "manual",
          latitude: 35.681236,
          locationSource: "manual",
          longitude: 139.767125,
          name: "東京",
          timeZone: "Asia/Tokyo",
        }}
        observationDate={new Date("2026-07-31T03:00:00.000Z")}
        refractionAtmosphere={{
          minimumGeometricAltitudeDegrees: 8,
          pressureHpa: 998.4,
          relativeHumidity: 0.72,
          temperatureCelsius: 18.5,
          wavelengthMicrometers: 0.6,
        }}
        refractionInputSource="manual"
        star={{ ...STAR, refractionMode: "applied" }}
        timeScales={timeScales("iers-predicted")}
      />,
    );

    screen.getByText("精度と座標転記", {
      selector: "summary",
    }).click();
    const pointingConditions = screen.getByRole("complementary", {
      name: "座標転記条件",
    });
    expect(
      within(pointingConditions).getByText("手動大気差を適用"),
    ).toBeVisible();
    expect(
      within(pointingConditions).getByText(
        "998.4 hPa・18.5°C・湿度72%・0.6 µm・高度8°以上",
      ),
    ).toBeVisible();
  });

  it("keeps basic sky values ahead of the collapsed precision workflow", () => {
    render(
      <StarDetails
        location={{
          heightMeters: 0,
          horizontalAccuracyMeters: null,
          id: "tokyo",
          latitude: 35.6812,
          locationSource: "bundled-city",
          longitude: 139.7671,
          name: "東京",
          timeZone: "Asia/Tokyo",
        }}
        observationDate={new Date("2026-07-31T03:00:00.000Z")}
        star={STAR}
        timeScales={timeScales("iers-predicted")}
      />,
    );

    const metrics = screen
      .getByText("高度", { selector: "dt" })
      .closest("dl");
    const precisionSummary = screen.getByText("精度と座標転記", {
      selector: "summary",
    });
    const precisionDetails = precisionSummary.closest("details");
    expect(metrics).not.toBeNull();
    expect(precisionDetails).not.toBeNull();
    expect(precisionDetails).not.toHaveAttribute("open");
    expect(
      metrics!.compareDocumentPosition(precisionDetails!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByText(
        "望遠鏡の自動導入・追尾を保証する座標ではありません。",
      ),
    ).toBeInTheDocument();
  });

  it("uses a typographic minus and symmetric rounding below the horizon", () => {
    render(
      <StarDetails
        star={{ ...STAR, altitudeDeg: -12.5 }}
        timeScales={timeScales("iers-predicted")}
      />,
    );

    expect(screen.getByText("−12.500°")).toBeInTheDocument();
    expect(screen.queryByText("-12.500°")).not.toBeInTheDocument();
    expect(screen.getByText("−13.9 km/s")).toBeInTheDocument();
    expect(screen.queryByText("-13.9 km/s")).not.toBeInTheDocument();
    expect(
      screen.getByText("この日時と地点では地平線下です"),
    ).toBeInTheDocument();
  });

  it("shows predicted IERS DUT1 and its uncertainty", () => {
    render(
      <StarDetails
        {...PRECISION_EARTH_ORIENTATION_PROPS}
        star={STAR}
        timeScales={timeScales("iers-predicted")}
      />,
    );
    screen.getByText("詳しい情報").click();
    expect(
      screen.getByText(/赤経は天球上の東西方向を時間で/),
    ).toHaveTextContent(
      /概要は0\.001°.*精密読み出しは0\.000001°.*実測精度の保証ではありません/,
    );
    expect(screen.getByText("幾何高度（真空）")).toBeInTheDocument();
    expect(screen.getByText("41.987654°")).toBeInTheDocument();
    expect(
      screen.getByText("観測高度（大気差設定反映）"),
    ).toBeInTheDocument();
    expect(screen.getByText("42.000000°")).toBeInTheDocument();
    expect(screen.getByText("UT1−UTC（DUT1）")).toBeInTheDocument();
    expect(
      screen.getByText(
        "+0.009732秒（IERS予測値・IERS公表誤差±0.000108秒）",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("+37.000秒（IERSうるう秒履歴）"),
    ).toBeInTheDocument();
    expect(screen.getByText("日周光行差")).toBeInTheDocument();
    expect(
      screen.getByText("適用（WGS84・選択地点の標高）"),
    ).toBeInTheDocument();
    expect(screen.getByText("太陽重力光偏向")).toBeInTheDocument();
    expect(screen.getByText("極運動 xp / yp")).toBeInTheDocument();
    expect(
      screen.getByText(
        "+0.206265″ / −0.412530″（IERS予測値・IERS公表誤差 xp±0.000206″ / yp±0.000413″）",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/BSC5Pの格納分解能から見た真空中の通常目安は概ね1〜数秒角級です/),
    ).toHaveTextContent("詳しい前提は「詳しい情報」で確認できます");
    expect(
      screen.getByText(/BSC5Pの格納分解能から見た真空中の通常目安は概ね1〜数秒角級です/),
    ).toHaveTextContent(
      "全恒星の実測精度を保証する値ではありません",
    );
    expect(
      screen.getByText(/BSC5Pの格納分解能から見た真空中の通常目安は概ね1〜数秒角級です/),
    ).toHaveTextContent(
      "大気差ON時の表示高度は別です",
    );
  });

  it("keeps the zero-DUT1 fallback explicit", () => {
    const fallback = {
      ...timeScales("assumed-zero"),
      dut1Seconds: 0,
      warnings: ["dut1-assumed-zero"] as const,
    };
    render(
      <StarDetails
        star={{ ...STAR, polarMotionMode: "assumed-zero" }}
        timeScales={fallback}
      />,
    );
    screen.getByText("詳しい情報").click();
    expect(
      screen.getByText("0.000000秒（未指定のため0秒近似）"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("xp=0 / yp=0（IERSデータ未取得のため近似）"),
    ).toBeInTheDocument();
    const accuracySummary = screen.getByText(
      /精度低下：地球回転データを利用できず/,
    );
    expect(accuracySummary).toHaveTextContent(
      "時角差は最大約13.5秒角",
    );
    expect(accuracySummary).toHaveTextContent(
      "詳しい近似条件は「詳しい情報」で確認できます",
    );
    const fallbackDetails = screen.getByText(
      /現行の整数うるう秒UTCを前提にしたDUT1だけの条件付き目安/,
    );
    expect(fallbackDetails).toHaveTextContent(
      "現行の整数うるう秒UTCを前提にしたDUT1だけの条件付き目安",
    );
    expect(fallbackDetails).toHaveTextContent(
      "xp/yp=0による方向差も、同梱履歴では最大約0.6秒角",
    );
    expect(fallbackDetails).toHaveTextContent(
      "1972年以前はTAI−UTC=0秒",
    );
    expect(fallbackDetails).toHaveTextContent(
      "将来は既知最後の37秒を仮定するUTC近似",
    );
    expect(accuracySummary).toHaveTextContent(
      "大気差ON時の表示高度は別です",
    );
  });

  it("copies a self-contained precision-pointing payload", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <StarDetails
        location={{
          heightMeters: 44.5,
          horizontalAccuracyMeters: null,
          id: "manual",
          latitude: 35.681236,
          locationSource: "manual",
          longitude: 139.767125,
          name: "東京",
          timeZone: "Asia/Tokyo",
        }}
        observationDate={new Date("2026-07-31T03:00:00.000Z")}
        star={STAR}
        timeScales={timeScales("iers-predicted")}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "参考座標をコピー",
      }),
    );

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Planetarium 参考座標データ"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "望遠鏡の自動導入・追尾を保証せず、無人運転の唯一の入力には使用しないでください。",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("WGS84楕円体高 44.5 m"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("地点由来: 手動入力 / 水平精度は未指定"),
    );
    expect(screen.getByLabelText("座標転記条件")).toHaveTextContent(
      "UTC2026-07-31T03:00:00.000Z",
    );
    expect(screen.getByLabelText("座標転記条件")).toHaveTextContent(
      "現地時刻2026-07-31 12:00:00Asia/Tokyo",
    );
    expect(screen.getByLabelText("座標転記条件")).toHaveTextContent(
      "大気差幾何高度（大気差なし）",
    );
    expect(
      await screen.findByText(
        "UTC 2026-07-31T03:00:00.000Z 時点の座標をコピーしました",
      ),
    ).toBeInTheDocument();
  });

  it("copies a versioned JSON profile from the frozen pre-pause snapshot", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onPausePlayback = vi.fn();
    const observationDate = new Date(
      "2026-07-31T03:00:00.125Z",
    );
    onPausePlayback.mockImplementation(() => {
      observationDate.setTime(
        new Date("2026-07-31T04:00:00.000Z").getTime(),
      );
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <StarDetails
        {...PRECISION_EARTH_ORIENTATION_PROPS}
        isPlaybackPlaying
        location={{
          heightMeters: 44.5,
          horizontalAccuracyMeters: 3,
          id: "device",
          latitude: 35.681236,
          locationSource: "device-geolocation",
          longitude: 139.767125,
          name: "現在地",
          timeZone: "Asia/Tokyo",
        }}
        observationDate={observationDate}
        onPausePlayback={onPausePlayback}
        star={STAR}
        timeScales={timeScales("iers-predicted")}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "JSONをコピー",
      }),
    );

    expect(onPausePlayback).toHaveBeenCalledTimes(1);
    expect(onPausePlayback.mock.invocationCallOrder[0]).toBeLessThan(
      writeText.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    const json = writeText.mock.calls[0]?.[0] as string;
    const profile = JSON.parse(json);
    expect(profile).toMatchObject({
      profileId: "planetarium.precision-pointing.full-v1",
      schemaVersion: 1,
      observation: {
        utc: "2026-07-31T03:00:00.125Z",
        location: {
          referenceFrame: "WGS84",
        },
      },
      coordinates: {
        catalogJ2000: {
          frame: "FK5",
          origin: "catalog-direction",
        },
        geocentricApparent: {
          frame: "true-equator-and-equinox-of-date",
          origin: "geocenter",
        },
        vacuumTopocentric: {
          frame: "local-ENU",
          origin: "WGS84-observer",
          azimuthConvention: "north-zero-east-positive",
        },
        observedTopocentric: {
          refractionMode: "disabled",
        },
      },
    });
    expect(json).not.toContain("2026-07-31T04:00:00.000Z");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(
      screen.queryByText(/時点のJSONをコピーしました/),
    ).not.toBeInTheDocument();
  });

  it("pauses active playback once and copies the captured UTC snapshot", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onPausePlayback = vi.fn();
    const observationDate = new Date("2026-07-31T03:00:00.125Z");
    onPausePlayback.mockImplementation(() => {
      observationDate.setTime(
        new Date("2026-07-31T04:00:00.000Z").getTime(),
      );
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <StarDetails
        isPlaybackPlaying
        location={{
          heightMeters: 44.5,
          horizontalAccuracyMeters: 3,
          id: "device",
          latitude: 35.681236,
          locationSource: "device-geolocation",
          longitude: 139.767125,
          name: "現在地",
          timeZone: "Asia/Tokyo",
        }}
        observationDate={observationDate}
        onPausePlayback={onPausePlayback}
        star={STAR}
        timeScales={timeScales("iers-predicted")}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "参考座標をコピー",
      }),
    );

    expect(onPausePlayback).toHaveBeenCalledTimes(1);
    expect(onPausePlayback.mock.invocationCallOrder[0]).toBeLessThan(
      writeText.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("UTC: 2026-07-31T03:00:00.125Z"),
    );
    expect(writeText).not.toHaveBeenCalledWith(
      expect.stringContaining("UTC: 2026-07-31T04:00:00.000Z"),
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(
      screen.queryByText(/時点の座標をコピーしました/),
    ).not.toBeInTheDocument();
  });

  it("shows a copy result only while every pointing-snapshot input still matches", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const location = {
      heightMeters: 44.5,
      horizontalAccuracyMeters: 3,
      id: "device",
      latitude: 35.681236,
      locationSource: "device-geolocation",
      longitude: 139.767125,
      name: "現在地",
      timeZone: "Asia/Tokyo",
    } as const;
    const observationDate = new Date(
      "2026-07-31T03:00:00.125Z",
    );
    const earthOrientationEstimate = {
      dut1: {
        seconds: 0.009_732,
        source: "predicted",
        reportedErrorSeconds: 0.000_108,
      },
      polarMotion: {
        xpRadians: 1e-6,
        ypRadians: -2e-6,
        xpReportedErrorRadians: 1e-9,
        ypReportedErrorRadians: 2e-9,
        source: "predicted",
        usesPrediction: true,
      },
    } as const;
    const resolvedTimeScales = timeScales("iers-predicted");
    const baseProps = {
      earthOrientationEstimate,
      location,
      observationDate,
      star: STAR,
      timeScales: resolvedTimeScales,
    } as const;
    const { rerender } = render(<StarDetails {...baseProps} />);

    await user.click(
      screen.getByRole("button", {
        name: "参考座標をコピー",
      }),
    );

    const copiedMessage =
      "UTC 2026-07-31T03:00:00.125Z 時点の座標をコピーしました";
    expect(
      await screen.findByText(copiedMessage),
    ).toBeInTheDocument();

    const changedSnapshots = [
      {
        ...baseProps,
        star: { ...STAR, catalogName: "Vega revised" },
      },
      {
        ...baseProps,
        observationDate: new Date(
          "2026-07-31T03:00:01.125Z",
        ),
      },
      {
        ...baseProps,
        location: { ...location, longitude: 139.767225 },
      },
      {
        ...baseProps,
        timeScales: {
          ...resolvedTimeScales,
          dut1Seconds: resolvedTimeScales.dut1Seconds + 0.001,
        },
      },
      {
        ...baseProps,
        earthOrientationEstimate: {
          ...earthOrientationEstimate,
          polarMotion: {
            ...earthOrientationEstimate.polarMotion,
            xpRadians:
              earthOrientationEstimate.polarMotion.xpRadians +
              1e-9,
          },
        },
      },
      {
        ...baseProps,
        star: {
          ...STAR,
          altitudeDeg: STAR.altitudeDeg + 0.01,
          refractionMode: "applied" as const,
        },
      },
    ];

    for (const changedProps of changedSnapshots) {
      rerender(<StarDetails {...changedProps} />);
      expect(screen.getByRole("status")).toBeEmptyDOMElement();

      rerender(<StarDetails {...baseProps} />);
      expect(screen.getByText(copiedMessage)).toBeInTheDocument();
    }
  });

  it("keeps a pending copy result hidden after location and refraction change", async () => {
    const user = userEvent.setup();
    let resolveClipboard!: () => void;
    const clipboardPending = new Promise<void>((resolve) => {
      resolveClipboard = resolve;
    });
    const writeText = vi.fn().mockReturnValue(clipboardPending);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const location = {
      heightMeters: 44.5,
      horizontalAccuracyMeters: 3,
      id: "device",
      latitude: 35.681236,
      locationSource: "device-geolocation",
      longitude: 139.767125,
      name: "現在地",
      timeZone: "Asia/Tokyo",
    } as const;
    const observationDate = new Date(
      "2026-07-31T03:00:00.125Z",
    );
    const baseProps = {
      location,
      observationDate,
      star: STAR,
      timeScales: timeScales("iers-predicted"),
    } as const;
    const { rerender } = render(<StarDetails {...baseProps} />);

    await user.click(
      screen.getByRole("button", {
        name: "参考座標をコピー",
      }),
    );
    expect(writeText).toHaveBeenCalledTimes(1);

    rerender(
      <StarDetails
        {...baseProps}
        location={{ ...location, longitude: 139.767225 }}
        star={{
          ...STAR,
          altitudeDeg: STAR.altitudeDeg + 0.01,
          refractionMode: "applied",
        }}
      />,
    );
    await act(async () => {
      resolveClipboard();
      await clipboardPending;
    });

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(
      screen.queryByText(/時点の座標をコピーしました/),
    ).not.toBeInTheDocument();

    rerender(<StarDetails {...baseProps} />);
    expect(
      screen.getByText(
        "UTC 2026-07-31T03:00:00.125Z 時点の座標をコピーしました",
      ),
    ).toBeInTheDocument();
  });

  it("does not request a pause when playback is already stopped", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onPausePlayback = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <StarDetails
        isPlaybackPlaying={false}
        location={{
          heightMeters: 44.5,
          horizontalAccuracyMeters: null,
          id: "manual",
          latitude: 35.681236,
          locationSource: "manual",
          longitude: 139.767125,
          name: "東京",
          timeZone: "Asia/Tokyo",
        }}
        observationDate={new Date("2026-07-31T03:00:00.000Z")}
        onPausePlayback={onPausePlayback}
        star={STAR}
        timeScales={timeScales("iers-predicted")}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "参考座標をコピー",
      }),
    );

    expect(onPausePlayback).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "UTC 2026-07-31T03:00:00.000Z 時点の座標をコピーしました",
      ),
    ).toBeInTheDocument();
  });

  it("lets only the latest text-or-JSON copy completion publish status", async () => {
    const user = userEvent.setup();
    let resolveReadable!: () => void;
    let resolveJson!: () => void;
    const readablePending = new Promise<void>((resolve) => {
      resolveReadable = resolve;
    });
    const jsonPending = new Promise<void>((resolve) => {
      resolveJson = resolve;
    });
    const writeText = vi
      .fn()
      .mockReturnValueOnce(readablePending)
      .mockReturnValueOnce(jsonPending);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <StarDetails
        {...PRECISION_EARTH_ORIENTATION_PROPS}
        location={{
          heightMeters: 44.5,
          horizontalAccuracyMeters: null,
          id: "manual",
          latitude: 35.681236,
          locationSource: "manual",
          longitude: 139.767125,
          name: "東京",
          timeZone: "Asia/Tokyo",
        }}
        observationDate={new Date(
          "2026-07-31T03:00:00.000Z",
        )}
        star={STAR}
        timeScales={timeScales("iers-predicted")}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "参考座標をコピー",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "JSONをコピー",
      }),
    );
    expect(writeText).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveJson();
      await jsonPending;
    });
    expect(
      screen.getByText(
        "UTC 2026-07-31T03:00:00.000Z 時点のJSONをコピーしました",
      ),
    ).toBeInTheDocument();

    await act(async () => {
      resolveReadable();
      await readablePending;
    });
    expect(
      screen.getByText(
        "UTC 2026-07-31T03:00:00.000Z 時点のJSONをコピーしました",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "UTC 2026-07-31T03:00:00.000Z 時点の座標をコピーしました",
      ),
    ).not.toBeInTheDocument();
  });

  it("keeps readable copy available but disables precision JSON without a complete v2 snapshot", () => {
    render(
      <StarDetails
        location={{
          heightMeters: 44.5,
          horizontalAccuracyMeters: null,
          id: "manual",
          latitude: 35.681236,
          locationSource: "manual",
          longitude: 139.767125,
          name: "東京",
          timeZone: "Asia/Tokyo",
        }}
        observationDate={new Date(
          "2026-07-31T03:00:00.000Z",
        )}
        star={{
          ...STAR,
          annualAberrationMode: null,
          apparentDecRad: null,
          apparentRaRad: null,
          annualParallaxMode: null,
          calculationModel: "v1",
          diurnalAberrationMode: null,
          polarMotionMode: null,
          refractionMode: null,
          solarLightDeflectionMode: null,
          spaceMotionMode: null,
        }}
        timeScales={null}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "参考座標をコピー",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "JSONをコピー",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "JSONをコピー",
      }),
    ).toHaveAttribute(
      "title",
      "精密モデルv2の完全な計算snapshotがある場合だけ利用できます",
    );
  });

});
