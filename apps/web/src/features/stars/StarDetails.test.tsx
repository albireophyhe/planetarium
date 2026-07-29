import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

    expect(screen.getByText("−13°")).toBeInTheDocument();
    expect(screen.queryByText("-13°")).not.toBeInTheDocument();
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
    ).toHaveTextContent("J2000.0");
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
      screen.getByText("適用（WGS84楕円体高0 m仮定）"),
    ).toBeInTheDocument();
    expect(screen.getByText("太陽重力光偏向")).toBeInTheDocument();
    expect(screen.getByText("極運動 xp / yp")).toBeInTheDocument();
    expect(
      screen.getByText(
        "+0.206265″ / −0.412530″（IERS予測値・IERS公表誤差 xp±0.000206″ / yp±0.000413″）",
      ),
    ).toBeInTheDocument();
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
  });
});
