import type { ObserverLocation, StarViewModel } from "../../app/types";
import {
  formatAzimuthDegrees,
  formatDeclination,
  formatRightAscension,
  formatSignedDegrees,
} from "../../app/astronomicalFormatting";
import type {
  IersEarthOrientationEstimateV1,
  ResolvedTimeScales,
} from "../../domain";
import { formatZonedDateTimeInput } from "../../domain";

type StarPointingPayloadInput = {
  earthOrientationEstimate: IersEarthOrientationEstimateV1 | null;
  location: ObserverLocation;
  observationDate: Date;
  star: StarViewModel;
  timeScales: ResolvedTimeScales | null;
};

function qualityLabel(
  earthOrientationEstimate: IersEarthOrientationEstimateV1 | null,
) {
  if (!earthOrientationEstimate) {
    return "収録外または未取得（DUT1=0秒・xp/yp=0近似）";
  }

  const qualities = new Set([
    earthOrientationEstimate.dut1.quality ??
      earthOrientationEstimate.dut1.source,
    earthOrientationEstimate.polarMotion.quality ??
      earthOrientationEstimate.polarMotion.source,
  ]);
  if (qualities.size === 1 && qualities.has("observed")) {
    return "IERS観測値";
  }
  if (qualities.size === 1 && qualities.has("predicted")) {
    return "IERS予測値";
  }
  return "IERS観測値・予測値の混在";
}

function horizontalLine(
  altitudeDeg: number,
  azimuthDeg: number,
  azimuthDefined: boolean,
) {
  const azimuth = azimuthDefined
    ? formatAzimuthDegrees(azimuthDeg, 6)
    : "不定（天頂または天底）";
  return `高度 ${formatSignedDegrees(altitudeDeg, 6)} / 方位 ${azimuth}`;
}

export function buildStarPointingPayload({
  earthOrientationEstimate,
  location,
  observationDate,
  star,
  timeScales,
}: StarPointingPayloadInput) {
  const apparent =
    star.apparentRaRad === null || star.apparentDecRad === null
      ? "利用不可（簡易モデル）"
      : `${formatRightAscension(star.apparentRaRad, 2)} / ${formatDeclination(
          star.apparentDecRad,
          1,
        )}`;
  const localDateTime = formatZonedDateTimeInput(
    observationDate,
    location.timeZone,
  ).replace("T", " ");
  const timeScaleLines = timeScales
    ? [
        `DUT1: ${timeScales.dut1Seconds.toFixed(6)} s (${timeScales.dut1Source})`,
        `JD(UT1): ${timeScales.ut1JulianDate.toFixed(9)}`,
        `JD(TT): ${timeScales.ttJulianDate.toFixed(9)}`,
      ]
    : ["DUT1 / JD(UT1) / JD(TT): 利用不可（簡易モデル）"];

  return [
    "Planetarium 精密導入データ",
    `対象: ${star.japaneseName} / ${star.englishName} / HR ${star.hr}`,
    `UTC: ${observationDate.toISOString()}`,
    `現地時刻: ${localDateTime} [${location.timeZone}]`,
    `地点: ${location.name} / 緯度 ${location.latitude.toFixed(
      6,
    )}° / 経度 ${location.longitude.toFixed(
      6,
    )}° / WGS84楕円体高 ${location.heightMeters.toFixed(1)} m`,
    `見かけ赤経・赤緯（観測日）: ${apparent}`,
    `幾何高度・方位（真空）: ${horizontalLine(
      star.geometricAltitudeDeg,
      star.geometricAzimuthDeg,
      star.geometricAzimuthDefined,
    )}`,
    `観測高度・方位（大気差設定反映）: ${horizontalLine(
      star.altitudeDeg,
      star.azimuthDeg,
      star.azimuthDefined,
    )}`,
    `星表赤経・赤緯（J2000.0）: ${formatRightAscension(
      star.raRad,
      2,
    )} / ${formatDeclination(star.decRad, 1)}`,
    ...timeScaleLines,
    `EOP品質: ${qualityLabel(earthOrientationEstimate)}`,
    `計算モデル: ${star.calculationModel === "v2" ? "精密モデル v2" : "簡易モデル v1"}`,
    "注記: 表示桁は計算条件の再現用であり、同じ桁までの実測精度を保証しません。",
  ].join("\n");
}
