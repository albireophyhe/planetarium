import { useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import type {
  ObserverLocation,
  RefractionInputSource,
  StarViewModel,
} from "../../app/types";
import type {
  Atmosphere,
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
import { atmosphereValueSummary } from "../../app/standardAtmosphere";
import { formatZonedDateTimeInput } from "../../domain";
import {
  type AppliedPolarMotionSnapshot,
  buildStarPointingPayload,
  hasFullPrecisionPointingSnapshot,
  serializeStarPointingJsonProfile,
} from "./starPointingPayload";

type StarDetailsProps = {
  earthOrientationEstimate?: IersEarthOrientationEstimateV1 | null;
  earthOrientationSourceIdentifier?: string | null;
  isPlaybackPlaying?: boolean;
  location?: ObserverLocation | null;
  observationDate?: Date | null;
  onPausePlayback?: () => void;
  polarMotionSnapshot?: AppliedPolarMotionSnapshot | null;
  refractionAtmosphere?: Atmosphere | null;
  refractionInputSource?: RefractionInputSource | null;
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

function refractionLabel(
  star: StarViewModel,
  inputSource: RefractionInputSource | null,
) {
  const configuredModel =
    inputSource === "manual" ? "手動大気差" : "標準大気差";
  switch (star.refractionMode) {
    case "applied":
      return `${configuredModel}を適用`;
    case "below-model-altitude":
      return `幾何高度（${configuredModel}の適用域外）`;
    case "disabled":
      return "幾何高度（大気差なし）";
    case null:
      return "簡易モデルの幾何高度";
  }
}

function locationSourceLabel(
  source: ObserverLocation["locationSource"],
) {
  switch (source) {
    case "bundled-city":
      return "収録都市";
    case "manual":
      return "手動入力";
    case "device-geolocation":
      return "端末の位置情報";
  }
}

function locationAccuracyLabel(location: ObserverLocation) {
  return location.horizontalAccuracyMeters === null
    ? "水平精度は未指定"
    : `水平精度 ±${location.horizontalAccuracyMeters.toFixed(0)} m`;
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
      return "適用（WGS84・選択地点の標高）";
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
  if (hasBundledEarthOrientation(earthOrientationEstimate, timeScales)) {
    return "BSC5Pの格納分解能から見た真空中の通常目安は概ね1〜数秒角級です。全恒星の実測精度を保証する値ではありません。地点・時計の誤差や、大気差ON時の表示高度は別です。詳しい前提は「詳しい情報」で確認できます。";
  }
  return "精度低下：地球回転データを利用できず、DUT1=0秒・xp/yp=0で近似中です。真空中の条件付き目安として、時角差は最大約13.5秒角、極運動による方向差は最大約0.6秒角です。地点・時計の誤差や、大気差ON時の表示高度は別です。詳しい近似条件は「詳しい情報」で確認できます。";
}

function hasBundledEarthOrientation(
  earthOrientationEstimate: IersEarthOrientationEstimateV1 | null,
  timeScales: ResolvedTimeScales | null,
) {
  return Boolean(
    earthOrientationEstimate &&
      timeScales?.dut1Source.startsWith("iers-"),
  );
}

const POSITION_ACCURACY_FALLBACK_DETAILS =
  "時角の最大約13.5秒角は、現行の整数うるう秒UTCを前提にしたDUT1だけの条件付き目安です。xp/yp=0による方向差も、同梱履歴では最大約0.6秒角です。1972年以前はTAI−UTC=0秒、将来は既知最後の37秒を仮定するUTC近似を含みます。";

type StarPointingSnapshot = {
  earthOrientationEstimate: IersEarthOrientationEstimateV1 | null;
  earthOrientationSourceIdentifier: string | null;
  location: ObserverLocation;
  observationDate: Date;
  polarMotionSnapshot: AppliedPolarMotionSnapshot | null;
  refractionAtmosphere: Atmosphere | null;
  refractionInputSource: RefractionInputSource | null;
  star: StarViewModel;
  timeScales: ResolvedTimeScales | null;
};

type StarPointingCopyFormat = "readable-text" | "precision-json-v1";

function canonicalSnapshotValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalSnapshotValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [
          key,
          canonicalSnapshotValue(nestedValue),
        ]),
    );
  }
  return value;
}

function starPointingSnapshotSignature(
  snapshot: StarPointingSnapshot,
): string {
  return JSON.stringify(
    canonicalSnapshotValue({
      atmosphere: {
        altitudeDeg: snapshot.star.altitudeDeg,
        geometricAltitudeDeg:
          snapshot.star.geometricAltitudeDeg,
        refractionMode: snapshot.star.refractionMode,
      },
      earthOrientationEstimate:
        snapshot.earthOrientationEstimate,
      earthOrientationSourceIdentifier:
        snapshot.earthOrientationSourceIdentifier,
      location: snapshot.location,
      observationDateUtc: snapshot.observationDate.toISOString(),
      polarMotionSnapshot: snapshot.polarMotionSnapshot,
      refractionAtmosphere: snapshot.refractionAtmosphere,
      refractionInputSource: snapshot.refractionInputSource,
      star: snapshot.star,
      timeScales: snapshot.timeScales,
    }),
  );
}

export function StarDetails({
  earthOrientationEstimate = null,
  earthOrientationSourceIdentifier = null,
  isPlaybackPlaying = false,
  location = null,
  observationDate = null,
  onPausePlayback,
  polarMotionSnapshot = null,
  refractionAtmosphere = null,
  refractionInputSource = null,
  star,
  timeScales = null,
}: StarDetailsProps) {
  const latestCopyOperationRef = useRef(0);
  const [copyResult, setCopyResult] = useState<{
    format: StarPointingCopyFormat;
    pausedPlayback: boolean;
    signature: string;
    status: "copied" | "error";
    utc: string;
  } | null>(null);
  const currentSnapshotSignature =
    star && observationDate && location
      ? starPointingSnapshotSignature({
          earthOrientationEstimate,
          earthOrientationSourceIdentifier,
          location,
          observationDate,
          polarMotionSnapshot,
          refractionAtmosphere,
          refractionInputSource,
          star,
          timeScales,
        })
      : null;
  const precisionJsonAvailable =
    star !== null &&
    observationDate !== null &&
    location !== null &&
    hasFullPrecisionPointingSnapshot({
      earthOrientationEstimate,
      earthOrientationSourceIdentifier,
      location,
      observationDate,
      polarMotionSnapshot,
      refractionAtmosphere,
      refractionInputSource,
      star,
      timeScales,
    });
  const currentCopyResult =
    currentSnapshotSignature &&
    copyResult?.signature === currentSnapshotSignature
      ? copyResult
      : null;

  if (!star) {
    return (
      <section className="star-details star-details--empty">
        <p>星図または一覧から星を選ぶと、ここに詳しい情報を表示します。</p>
      </section>
    );
  }

  const copyPointingSnapshot =
    observationDate && location
      ? async (format: StarPointingCopyFormat) => {
          const operationId =
            latestCopyOperationRef.current + 1;
          latestCopyOperationRef.current = operationId;
          const snapshot = {
            earthOrientationEstimate: earthOrientationEstimate
              ? {
                  dut1: { ...earthOrientationEstimate.dut1 },
                  polarMotion: {
                    ...earthOrientationEstimate.polarMotion,
                  },
                }
              : null,
            earthOrientationSourceIdentifier,
            location: { ...location },
            observationDate: new Date(observationDate.getTime()),
            polarMotionSnapshot: polarMotionSnapshot
              ? { ...polarMotionSnapshot }
              : null,
            refractionAtmosphere: refractionAtmosphere
              ? { ...refractionAtmosphere }
              : null,
            refractionInputSource,
            star: { ...star, aliases: [...star.aliases] },
            timeScales: timeScales
              ? {
                  ...timeScales,
                  warnings: [...timeScales.warnings],
                }
              : null,
          } satisfies StarPointingSnapshot;
          const signature =
            starPointingSnapshotSignature(snapshot);
          const pausedPlayback =
            isPlaybackPlaying && onPausePlayback !== undefined;
          if (pausedPlayback) {
            onPausePlayback();
          }
          const utc = snapshot.observationDate.toISOString();
          setCopyResult(null);
          try {
            const payload =
              format === "precision-json-v1"
                ? precisionJsonAvailable
                  ? serializeStarPointingJsonProfile(snapshot)
                  : null
                : buildStarPointingPayload(snapshot);
            if (payload === null) {
              throw new Error(
                "A complete precision snapshot is unavailable",
              );
            }
            if (!navigator.clipboard?.writeText) {
              throw new Error("Clipboard API is unavailable");
            }
            await navigator.clipboard.writeText(payload);
            if (
              latestCopyOperationRef.current !== operationId
            ) {
              return;
            }
            setCopyResult({
              format,
              pausedPlayback,
              signature,
              status: "copied",
              utc,
            });
          } catch {
            if (
              latestCopyOperationRef.current !== operationId
            ) {
              return;
            }
            setCopyResult({
              format,
              pausedPlayback,
              signature,
              status: "error",
              utc,
            });
          }
        }
      : null;

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

      <dl className="star-details__metrics">
        <div>
          <dt>
            高度<span className="sr-only">（計算値）</span>
          </dt>
          <dd>{formatSignedDegrees(star.altitudeDeg, 3)}</dd>
        </div>
        <div>
          <dt>
            方位<span className="sr-only">（計算値）</span>
          </dt>
          <dd>
            {star.azimuthDefined
              ? azimuthCompassLabel(star.azimuthDeg)
              : "不定"}
          </dd>
          <span>
            {star.azimuthDefined
              ? formatAzimuthDegrees(star.azimuthDeg, 3)
              : "天頂または天底"}
          </span>
        </div>
        <div>
          <dt>等級</dt>
          <dd>{formatDecimal(star.vMagnitude, 2)}</dd>
        </div>
      </dl>

      <details className="star-details__disclosure star-details__disclosure--pointing">
        <summary>
          精度と座標転記
          <ChevronDownIcon aria-hidden="true" size={20} strokeWidth={1.8} />
        </summary>
        <p className="star-details__accuracy-note">
          <strong>位置精度の目安</strong>
          {positionAccuracySummary(
            star,
            earthOrientationEstimate,
            timeScales,
          )}
        </p>

        {observationDate && location ? (
          <aside
            aria-label="座標転記条件"
            className="star-details__pointing-context"
          >
            <strong>座標転記条件</strong>
            <p className="star-details__pointing-warning">
              望遠鏡の自動導入・追尾を保証する座標ではありません。
            </p>
            <dl>
              <div>
                <dt>UTC</dt>
                <dd>{observationDate.toISOString()}</dd>
              </div>
              <div>
                <dt>現地時刻</dt>
                <dd>
                  {formatZonedDateTimeInput(
                    observationDate,
                    location.timeZone,
                  ).replace("T", " ")}
                  <small>{location.timeZone}</small>
                </dd>
              </div>
              <div>
                <dt>観測地点</dt>
                <dd>
                  {location.name}・緯度 {location.latitude.toFixed(6)}°・経度{" "}
                  {location.longitude.toFixed(6)}°・楕円体高{" "}
                  {location.heightMeters.toFixed(1)} m
                  <small>
                    {locationSourceLabel(location.locationSource)}・
                    {locationAccuracyLabel(location)}
                  </small>
                </dd>
              </div>
              <div>
                <dt>大気差</dt>
                <dd>
                  {refractionLabel(star, refractionInputSource)}
                  {refractionAtmosphere ? (
                    <small>
                      {atmosphereValueSummary(refractionAtmosphere)}
                    </small>
                  ) : null}
                </dd>
              </div>
            </dl>
            <div className="star-details__pointing-copy">
              <button
                className="button button--secondary"
                onClick={() => {
                  void copyPointingSnapshot?.("readable-text");
                }}
                type="button"
              >
                参考座標をコピー
              </button>
              <button
                className="button button--secondary"
                disabled={!precisionJsonAvailable}
                onClick={() => {
                  void copyPointingSnapshot?.(
                    "precision-json-v1",
                  );
                }}
                type="button"
                title={
                  precisionJsonAvailable
                    ? "座標系・単位・適用したEOPを含むversion付きJSONをコピー"
                    : "精密モデルv2の完全な計算snapshotがある場合だけ利用できます"
                }
              >
                JSONをコピー
              </button>
              <span aria-atomic="true" aria-live="polite" role="status">
                {currentCopyResult?.status === "copied"
                  ? `${
                      currentCopyResult.pausedPlayback
                        ? "時刻を停止し、"
                        : ""
                    }UTC ${currentCopyResult.utc} 時点の${
                      currentCopyResult.format ===
                      "precision-json-v1"
                        ? "JSON"
                        : "座標"
                    }をコピーしました`
                  : currentCopyResult?.status === "error"
                    ? `${
                        currentCopyResult.pausedPlayback
                          ? "時刻を停止しましたが、"
                          : ""
                      }UTC ${currentCopyResult.utc} 時点の${
                        currentCopyResult.format ===
                        "precision-json-v1"
                          ? "JSON"
                          : "座標"
                      }をコピーできませんでした`
                    : ""}
              </span>
            </div>
          </aside>
        ) : null}
      </details>

      <details className="star-details__disclosure">
        <summary>
          詳しい情報
          <ChevronDownIcon aria-hidden="true" size={20} strokeWidth={1.8} />
        </summary>
        {star.calculationModel === "v2" &&
        !hasBundledEarthOrientation(
          earthOrientationEstimate,
          timeScales,
        ) ? (
          <p className="star-details__accuracy-note star-details__accuracy-note--warning">
            <strong>地球回転近似の条件</strong>
            {POSITION_ACCURACY_FALLBACK_DETAILS}
          </p>
        ) : null}
        <p className="star-details__coordinate-help">
          赤経は天球上の東西方向を時間で、赤緯は天の赤道からの南北角を示します。
          「見かけ（観測日）」は選択した日時の空へ変換した座標、
          J2000.0は2000年1月1.5日を基準にした星表座標です。
          上の概要は0.001°、以下の精密読み出しは0.000001°単位です。
          桁数は計算条件の転記・比較用であり、実測精度の保証ではありません。
        </p>
        <dl className="star-details__secondary">
          {star.apparentRaRad !== null ? (
            <div>
              <dt>見かけ赤経（観測日）</dt>
              <dd>{formatRightAscension(star.apparentRaRad, 2)}</dd>
            </div>
          ) : null}
          {star.apparentDecRad !== null ? (
            <div>
              <dt>見かけ赤緯（観測日）</dt>
              <dd>{formatDeclination(star.apparentDecRad, 1)}</dd>
            </div>
          ) : null}
          <div>
            <dt>幾何高度（真空）</dt>
            <dd>
              {formatSignedDegrees(star.geometricAltitudeDeg, 6)}
            </dd>
          </div>
          <div>
            <dt>幾何方位（真空）</dt>
            <dd>
              {star.geometricAzimuthDefined
                ? formatAzimuthDegrees(
                    star.geometricAzimuthDeg,
                    6,
                  )
                : "不定（天頂または天底）"}
            </dd>
          </div>
          <div>
            <dt>観測高度（大気差設定反映）</dt>
            <dd>{formatSignedDegrees(star.altitudeDeg, 6)}</dd>
          </div>
          <div>
            <dt>観測方位（大気差設定反映）</dt>
            <dd>
              {star.azimuthDefined
                ? formatAzimuthDegrees(star.azimuthDeg, 6)
                : "不定（天頂または天底）"}
            </dd>
          </div>
          <div>
            <dt>赤経（J2000.0）</dt>
            <dd>{formatRightAscension(star.raRad, 2)}</dd>
          </div>
          <div>
            <dt>赤緯（J2000.0）</dt>
            <dd>{formatDeclination(star.decRad, 1)}</dd>
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
            <dd>
              {refractionLabel(star, refractionInputSource)}
            </dd>
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
