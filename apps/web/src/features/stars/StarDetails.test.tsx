import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StarViewModel } from "../../app/types";
import type { ResolvedTimeScales } from "../../domain";
import { StarDetails } from "./StarDetails";

const STAR: StarViewModel = {
  aliases: [],
  altitudeDeg: 42,
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
        earthOrientationEstimate={{
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
        }}
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
      screen.getByText(/IERS収録期間内では概ね1〜数秒角級です/),
    ).toHaveTextContent(
      "BSC5Pの格納分解能から見た真空中の通常目安",
    );
    expect(
      screen.getByText(/IERS収録期間内では概ね1〜数秒角級です/),
    ).toHaveTextContent(
      "全恒星の実測精度を保証する値ではありません",
    );
    expect(
      screen.getByText(/IERS収録期間内では概ね1〜数秒角級です/),
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
      /DUT1=0秒・xp\/yp=0近似/,
    );
    expect(accuracySummary).toHaveTextContent(
      "時角の最大約13.5秒角",
    );
    expect(accuracySummary).toHaveTextContent(
      "現行の整数うるう秒UTCを前提にしたDUT1だけの条件付き目安",
    );
    expect(accuracySummary).toHaveTextContent(
      "xp/yp=0による方向差も、同梱履歴では最大約0.6秒角",
    );
    expect(accuracySummary).toHaveTextContent(
      "1972年以前はTAI−UTC=0秒",
    );
    expect(accuracySummary).toHaveTextContent(
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
        name: "導入用データをコピー",
      }),
    );

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Planetarium 精密導入データ"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("WGS84楕円体高 44.5 m"),
    );
    expect(await screen.findByText("コピーしました")).toBeInTheDocument();
  });
});
