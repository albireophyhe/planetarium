import { describe, expect, it } from "vitest";
import type { ObserverLocation, StarViewModel } from "../../app/types";
import type { ResolvedTimeScales } from "../../domain";
import { buildStarPointingPayload } from "./starPointingPayload";

const LOCATION: ObserverLocation = {
  heightMeters: 44.5,
  horizontalAccuracyMeters: 3,
  id: "manual",
  latitude: 35.681236,
  locationSource: "manual",
  longitude: 139.767125,
  name: "東京",
  timeZone: "Asia/Tokyo",
};

const STAR: StarViewModel = {
  aliases: [],
  altitudeDeg: 42.1234567,
  apparentDecRad: -0.2196045987,
  apparentRaRad: 3.2940754526,
  annualParallaxMode: "truncated-vsop2000-heliocentric-earth",
  azimuthDefined: true,
  azimuthDeg: 181.9876543,
  calculationModel: "v2",
  catalogName: "Vega",
  constellation: "こと座",
  decRad: 0.6769030684,
  diurnalAberrationMode: "wgs84-observer",
  englishName: "Vega",
  geometricAltitudeDeg: 42.1111114,
  geometricAzimuthDefined: true,
  geometricAzimuthDeg: 181.9999996,
  hr: 7001,
  japaneseName: "ベガ",
  parallaxArcsec: 0.13,
  pmDecArcsecPerYear: 0.286,
  pmRaCosDecArcsecPerYear: 0.201,
  polarMotionMode: "iers-predicted",
  raRad: 4.873565508,
  radialVelocityKmPerSecond: -13.9,
  refractionMode: "applied",
  solarLightDeflectionMode:
    "truncated-vsop2000-heliocentric-earth",
  spaceMotionMode: "three-dimensional",
  vMagnitude: 0.03,
};

const TIME_SCALES: ResolvedTimeScales = {
  dut1Seconds: 0.012345,
  dut1Source: "iers-predicted",
  dut1UncertaintySeconds: 0.00012,
  taiMinusUtcSeconds: 37,
  taiMinusUtcSource: "iers-history",
  ttJulianDate: 2_461_253.625800741,
  utcJulianDate: 2_461_253.625,
  ut1JulianDate: 2_461_253.625000143,
  warnings: [],
};

describe("buildStarPointingPayload", () => {
  it("exports reproducible pointing inputs and distinct horizontal coordinates", () => {
    const payload = buildStarPointingPayload({
      earthOrientationEstimate: {
        dut1: {
          quality: "mixed",
          reportedErrorSeconds: 0.00012,
          seconds: 0.012345,
          source: "predicted",
        },
        polarMotion: {
          quality: "predicted",
          source: "predicted",
          usesPrediction: true,
          xpRadians: 1e-6,
          xpReportedErrorRadians: 1e-9,
          ypRadians: -2e-6,
          ypReportedErrorRadians: 2e-9,
        },
      },
      location: LOCATION,
      observationDate: new Date("2026-07-31T03:00:00.000Z"),
      star: STAR,
      timeScales: TIME_SCALES,
    });

    expect(payload).toContain("UTC: 2026-07-31T03:00:00.000Z");
    expect(payload).toContain(
      "現地時刻: 2026-07-31 12:00:00 [Asia/Tokyo]",
    );
    expect(payload).toContain(
      "緯度 35.681236° / 経度 139.767125° / WGS84楕円体高 44.5 m",
    );
    expect(payload).toContain("幾何高度・方位（真空）: 高度 42.111111°");
    expect(payload).toContain(
      "観測高度・方位（大気差設定反映）: 高度 42.123457°",
    );
    expect(payload).toContain("DUT1: 0.012345 s (iers-predicted)");
    expect(payload).toContain("EOP品質: IERS観測値・予測値の混在");
    expect(payload).toContain("表示桁は計算条件の再現用");
  });

  it("keeps fallback assumptions explicit", () => {
    const payload = buildStarPointingPayload({
      earthOrientationEstimate: null,
      location: LOCATION,
      observationDate: new Date("2026-07-31T03:00:00.000Z"),
      star: {
        ...STAR,
        apparentDecRad: null,
        apparentRaRad: null,
        calculationModel: "v1",
      },
      timeScales: null,
    });

    expect(payload).toContain("見かけ赤経・赤緯（観測日）: 利用不可");
    expect(payload).toContain("DUT1 / JD(UT1) / JD(TT): 利用不可");
    expect(payload).toContain(
      "EOP品質: 収録外または未取得（DUT1=0秒・xp/yp=0近似）",
    );
  });
});
