import { ChevronDownIcon } from "lucide-react";
import type { StarViewModel } from "../../app/types";
import type {
  IersEarthOrientationEstimateV1,
  ResolvedTimeScales,
} from "../../domain";
import {
  azimuthCompassLabel,
  formatAzimuthDegrees,
  formatDecimal,
  formatDeclination,
  formatRightAscension,
  formatSignedDegrees,
} from "../../app/astronomicalFormatting";

type StarDetailsProps = {
  earthOrientationEstimate?: IersEarthOrientationEstimateV1 | null;
  star: StarViewModel | null;
  timeScales?: ResolvedTimeScales | null;
};

const RADIANS_TO_ARCSECONDS = (180 * 3_600) / Math.PI;

function spaceMotionLabel(star: StarViewModel) {
  const retainsDistance =
    star.parallaxArcsec !== null && star.parallaxArcsec > 0;
  const assumesZeroRadialVelocity =
    retainsDistance && star.radialVelocityKmPerSecond === null;

  switch (star.spaceMotionMode) {
    case "three-dimensional":
      return "固有運動・距離・視線速度";
    case "angular-proper-motion":
      return assumesZeroRadialVelocity
        ? "固有運動・距離（視線速度0仮定）"
        : "固有運動";
    case "none":
      return assumesZeroRadialVelocity
        ? "距離のみ（固有運動なし・視線速度0仮定）"
        : "座標固定";
    case null:
      return "簡易モデル";
  }
}

function arcsecondsPerYear(value: number | null) {
  return value === null
    ? "収録なし"
    : `${formatDecimal(value, 3)}″/年`;
}

function refractionLabel(star: StarViewModel) {
  switch (star.refractionMode) {
    case "applied":
      return "標準大気差を適用";
    case "below-model-altitude":
      return "幾何高度（大気差の適用域外）";
    case "disabled":
      return "幾何高度（大気差なし）";
    case null:
      return "簡易モデルの幾何高度";
  }
}

function annualParallaxLabel(star: StarViewModel) {
  switch (star.annualParallaxMode) {
    case "truncated-vsop2000-heliocentric-earth":
      return "適用（VSOP2000 200項地球暦）";
    case "jpl-approximate-earth-moon-barycenter":
      return "適用（旧近似地球暦）";
    case "caller-observer-position":
      return "適用（外部BCRS観測者位置）";
    case "unavailable":
      return "未適用（視差値なし）";
    case "disabled":
      return "無効";
    case null:
      return "簡易モデルでは未適用";
  }
}

function diurnalAberrationLabel(star: StarViewModel) {
  switch (star.diurnalAberrationMode) {
    case "wgs84-observer":
      return "適用（WGS84楕円体高0 m仮定）";
    case "disabled":
      return "無効";
    case null:
      return "簡易モデルでは未適用";
  }
}

function solarLightDeflectionLabel(star: StarViewModel) {
  switch (star.solarLightDeflectionMode) {
    case "truncated-vsop2000-heliocentric-earth":
      return "適用（VSOP2000 200項地球暦）";
    case "jpl-approximate-earth-moon-barycenter":
      return "適用（旧近似地球暦）";
    case "caller-sun-observer-geometry":
      return "適用（外部太陽—観測者幾何）";
    case "disabled":
      return "無効";
    case null:
      return "簡易モデルでは未適用";
  }
}

function signedSeconds(value: number, fractionDigits = 6) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(fractionDigits)}秒`;
}

function dut1Label(timeScales: ResolvedTimeScales) {
  const source = {
    "assumed-zero": "未指定のため0秒近似",
    caller: "外部指定",
    "iers-observed": "IERS観測値",
    "iers-predicted": "IERS予測値",
  }[timeScales.dut1Source];
  const uncertainty =
    timeScales.dut1UncertaintySeconds === null
      ? ""
      : `・IERS公表誤差±${timeScales.dut1UncertaintySeconds.toFixed(6)}秒`;
  return `${signedSeconds(timeScales.dut1Seconds)}（${source}${uncertainty}）`;
}

function signedArcseconds(radians: number) {
  const value = radians * RADIANS_TO_ARCSECONDS;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(6)}″`;
}

function polarMotionLabel(
  star: StarViewModel,
  estimate: IersEarthOrientationEstimateV1 | null,
) {
  switch (star.polarMotionMode) {
    case "iers-observed":
    case "iers-predicted": {
      if (!estimate) {
        return star.polarMotionMode === "iers-observed"
          ? "適用（IERS観測値）"
          : "適用（IERS予測値）";
      }
      const source =
        star.polarMotionMode === "iers-observed"
          ? "IERS観測値"
          : "IERS予測値";
      return `${signedArcseconds(estimate.polarMotion.xpRadians)} / ${signedArcseconds(
        estimate.polarMotion.ypRadians,
      )}（${source}・IERS公表誤差 xp±${Math.abs(
        estimate.polarMotion.xpReportedErrorRadians *
          RADIANS_TO_ARCSECONDS,
      ).toFixed(6)}″ / yp±${Math.abs(
        estimate.polarMotion.ypReportedErrorRadians *
          RADIANS_TO_ARCSECONDS,
      ).toFixed(6)}″）`;
    }
    case "caller":
      return "適用（外部指定）";
    case "assumed-zero":
      return "xp=0 / yp=0（IERSデータ未取得のため近似）";
    case "disabled":
      return "無効";
    case null:
      return "簡易モデルでは未適用";
  }
}

function taiMinusUtcLabel(timeScales: ResolvedTimeScales) {
  const source = {
    caller: "外部指定",
    "iers-history": "IERSうるう秒履歴",
    "pre-1972-approximation": "1972年以前の近似",
  }[timeScales.taiMinusUtcSource];
  return `${signedSeconds(timeScales.taiMinusUtcSeconds, 3)}（${source}）`;
}

function positionAccuracySummary(
  star: StarViewModel,
  earthOrientationEstimate: IersEarthOrientationEstimateV1 | null,
  timeScales: ResolvedTimeScales | null,
) {
  if (star.calculationModel !== "v2") {
    return "簡易モデルのため、秒角単位の位置精度は想定していません。";
  }
  if (
    earthOrientationEstimate &&
    timeScales?.dut1Source.startsWith("iers-")
  ) {
    return "星表の格納分解能から見た目安として、IERS収録期間内では概ね1〜数秒角級です（全恒星への保証値ではありません）。これは星表・真空計算部分の目安で、地点・時計・実際の大気との差は別です。";
  }
  return "IERS収録外または未取得です。DUT1=0秒・xp/yp=0近似を使います。現行の整数うるう秒UTCが維持される期間では、DUT1だけで時角に最大約13.5秒角相当が加わり得ます。1972年以前と将来のUTC制度は別の時刻系近似も含みます。これは星表・真空計算部分の目安で、地点・時計・実際の大気との差は別です。";
}

export function StarDetails({
  earthOrientationEstimate = null,
  star,
  timeScales = null,
}: StarDetailsProps) {
  if (!star) {
    return (
      <section className="star-details star-details--empty">
        <p>星図または一覧から星を選ぶと、ここに詳しい情報を表示します。</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="selected-star-name"
      className="star-details"
      key={star.hr}
    >
      <p className="star-details__english">{star.englishName}</p>
      <h2 id="selected-star-name">{star.japaneseName}</h2>
      {star.altitudeDeg < 0 ? (
        <p className="star-details__horizon-state">
          この日時と地点では地平線下です
        </p>
      ) : null}
      <p className="star-details__accuracy-note">
        <strong>位置精度の目安</strong>
        {positionAccuracySummary(
          star,
          earthOrientationEstimate,
          timeScales,
        )}
      </p>

      <dl className="star-details__metrics">
        <div>
          <dt>高度</dt>
          <dd>{formatSignedDegrees(star.altitudeDeg, 0)}</dd>
        </div>
        <div>
          <dt>方位</dt>
          <dd>
            {star.azimuthDefined
              ? azimuthCompassLabel(star.azimuthDeg)
              : "不定"}
          </dd>
          <span>
            {star.azimuthDefined
              ? formatAzimuthDegrees(star.azimuthDeg)
              : "天頂または天底"}
          </span>
        </div>
        <div>
          <dt>等級</dt>
          <dd>{formatDecimal(star.vMagnitude, 2)}</dd>
        </div>
      </dl>

      <details className="star-details__disclosure">
        <summary>
          詳しい情報
          <ChevronDownIcon aria-hidden="true" size={20} strokeWidth={1.8} />
        </summary>
        <p className="star-details__coordinate-help">
          赤経は天球上の東西方向を時間で、赤緯は天の赤道からの南北角を示します。
          「見かけ（観測日）」は選択した日時の空へ変換した座標、
          J2000.0は2000年1月1.5日を基準にした星表座標です。
        </p>
        <dl className="star-details__secondary">
          {star.apparentRaRad !== null ? (
            <div>
              <dt>見かけ赤経（観測日）</dt>
              <dd>{formatRightAscension(star.apparentRaRad)}</dd>
            </div>
          ) : null}
          {star.apparentDecRad !== null ? (
            <div>
              <dt>見かけ赤緯（観測日）</dt>
              <dd>{formatDeclination(star.apparentDecRad)}</dd>
            </div>
          ) : null}
          <div>
            <dt>赤経（J2000.0）</dt>
            <dd>{formatRightAscension(star.raRad)}</dd>
          </div>
          <div>
            <dt>赤緯（J2000.0）</dt>
            <dd>{formatDeclination(star.decRad)}</dd>
          </div>
          <div>
            <dt>星座</dt>
            <dd>{star.constellation || "収録なし"}</dd>
          </div>
          <div>
            <dt>カタログ番号</dt>
            <dd>HR {star.hr}</dd>
          </div>
          <div>
            <dt>位置計算</dt>
            <dd>
              {star.calculationModel === "v2"
                ? `精密モデル v2（${spaceMotionLabel(star)}）`
                : "簡易モデル v1"}
            </dd>
          </div>
          <div>
            <dt>高度モデル</dt>
            <dd>{refractionLabel(star)}</dd>
          </div>
          <div>
            <dt>年周視差</dt>
            <dd>{annualParallaxLabel(star)}</dd>
          </div>
          <div>
            <dt>太陽重力光偏向</dt>
            <dd>{solarLightDeflectionLabel(star)}</dd>
          </div>
          <div>
            <dt>日周光行差</dt>
            <dd>{diurnalAberrationLabel(star)}</dd>
          </div>
          <div>
            <dt>極運動 xp / yp</dt>
            <dd>{polarMotionLabel(star, earthOrientationEstimate)}</dd>
          </div>
          {star.calculationModel === "v2" && timeScales ? (
            <>
              <div>
                <dt>UT1−UTC（DUT1）</dt>
                <dd>{dut1Label(timeScales)}</dd>
              </div>
              <div>
                <dt>TAI−UTC</dt>
                <dd>{taiMinusUtcLabel(timeScales)}</dd>
              </div>
            </>
          ) : null}
          {star.calculationModel === "v2" ? (
            <>
              <div>
                <dt>固有運動 μᵅ cosδ</dt>
                <dd>
                  {arcsecondsPerYear(
                    star.pmRaCosDecArcsecPerYear,
                  )}
                </dd>
              </div>
              <div>
                <dt>固有運動 μδ</dt>
                <dd>{arcsecondsPerYear(star.pmDecArcsecPerYear)}</dd>
              </div>
              <div>
                <dt>視差</dt>
                <dd>
                  {star.parallaxArcsec === null
                    ? "収録なし"
                    : `${formatDecimal(star.parallaxArcsec, 3)}″`}
                </dd>
              </div>
              <div>
                <dt>視線速度</dt>
                <dd>
                  {star.radialVelocityKmPerSecond === null
                    ? "収録なし"
                    : `${formatDecimal(star.radialVelocityKmPerSecond, 1)} km/s`}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
      </details>
    </section>
  );
}
