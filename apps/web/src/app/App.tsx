import {
  CircleHelpIcon,
  MapPinIcon,
  MoonStarIcon,
  NavigationIcon,
  SunIcon,
  SunsetIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  calculateStarPosition,
  calculateApparentSunPositionWithContextV2,
  cities,
  clampObservationDate,
  constellations,
  formatZonedDateTime,
  formatZonedDateTimeInput,
  horizontalToProjection,
  namedStarByHR,
  namedStars,
  radiansToDegrees,
  stars,
  sunHorizontal,
  twilightPhase,
  type ApparentPositionOptionsV2,
  type IersEarthOrientationEstimateV1,
  type TwilightPhase,
} from "../domain";
import { HelpDialog } from "../features/help/HelpDialog";
import { LocationDialog } from "../features/location/LocationDialog";
import { LayerPanel } from "../features/settings/LayerPanel";
import {
  SkyViewport,
  type SkyDrawSource,
} from "../features/sky/SkyViewport";
import { StarDetails } from "../features/stars/StarDetails";
import { StarExplorer } from "../features/stars/StarExplorer";
import { TimeControls } from "../features/time/TimeControls";
import { usePlaybackClock } from "../features/time/usePlaybackClock";
import { SegmentedControl } from "../ui/SegmentedControl";
import type {
  LayerSettings,
  ObserverLocation,
  SelectedStarTrack,
  SkySolarPosition,
  SkyStar,
  StarViewModel,
} from "./types";
import {
  formatAzimuthDegrees,
  formatSignedDegrees,
} from "./astronomicalFormatting";
import {
  observationInputRange,
  parseObservationDateInput,
  shiftObservationDate,
} from "./observationTime";
import { calculatePrecisionSkyFrame } from "./precisionSkyFrame";
import { selectRenderableStars } from "./renderCatalogPolicy";
import { calculateSelectedStarTrack } from "./selectedStarTrack";
import { timeScaleAssumptionText } from "./timeScaleAssumption";
import { useIersEarthOrientation } from "./useIersEarthOrientation";
import { usePrecisionCatalog } from "./usePrecisionCatalog";

const DEFAULT_CITY = cities.find((city) => city.id === "tokyo") ?? cities[0];

if (!DEFAULT_CITY) {
  throw new Error("観測地点のデータがありません。");
}

const DEFAULT_LAYERS: LayerSettings = {
  atmosphericRefraction: false,
  constellationLines: true,
  nightMode: false,
  selectedStarTrack: false,
  starLabels: true,
};

const GEOMETRIC_POSITION_OPTIONS: ApparentPositionOptionsV2 =
  Object.freeze({
    refraction: false,
  });

const STANDARD_REFRACTION_OPTIONS: ApparentPositionOptionsV2 =
  Object.freeze({
    refraction: Object.freeze({
      minimumGeometricAltitudeDegrees: 5,
      pressureHpa: 1_013.25,
      relativeHumidity: 0.5,
      temperatureCelsius: 10,
      wavelengthMicrometers: 0.55,
    }),
  });

const TWILIGHT_LABELS: Record<TwilightPhase, string> = {
  day: "昼",
  civil: "市民薄明",
  nautical: "航海薄明",
  astronomical: "天文薄明",
  night: "夜",
};

const CONSTELLATION_NAMES = new Map(
  constellations.map((constellation) => [
    constellation.id,
    constellation.nameJa,
  ]),
);

const REQUIRED_RENDER_STAR_HRS = new Set<number>([
  ...namedStars.map((star) => star.hr),
  ...constellations.flatMap((constellation) =>
    constellation.segments.flatMap(([startHr, endHr]) => [
      startHr,
      endHr,
    ]),
  ),
]);

const FALLBACK_RENDER_STARS = selectRenderableStars(
  stars,
  REQUIRED_RENDER_STAR_HRS,
);

type DrawError = {
  message: string;
  source: SkyDrawSource;
};

type ResolvedSelectedStarTrack = {
  readonly requestKey: string;
  readonly track: SelectedStarTrack;
};

function timeZoneShortName(date: Date, timeZone: string) {
  return (
    new Intl.DateTimeFormat("ja-JP", {
      timeZone,
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone
  );
}

function playbackTimeText(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  }).format(date);
}

function cityToLocation(): ObserverLocation {
  return {
    id: DEFAULT_CITY.id,
    latitude: DEFAULT_CITY.latitude,
    longitude: DEFAULT_CITY.longitude,
    name: DEFAULT_CITY.nameJa,
    timeZone: DEFAULT_CITY.timeZone,
  };
}

function apparentPositionOptionsWithEarthOrientation(
  base: ApparentPositionOptionsV2,
  estimate: IersEarthOrientationEstimateV1 | null,
): ApparentPositionOptionsV2 {
  if (!estimate) {
    return {
      ...base,
      earthOrientation: {
        polarMotion: {
          source: "assumed-zero",
          xpRadians: 0,
          ypRadians: 0,
        },
      },
    };
  }
  return {
    ...base,
    earthOrientation: {
      dut1Seconds: estimate.dut1.seconds,
      dut1Source:
        estimate.dut1.source === "observed"
          ? "iers-observed"
          : "iers-predicted",
      dut1UncertaintySeconds:
        estimate.dut1.reportedErrorSeconds,
      polarMotion: {
        source:
          estimate.polarMotion.source === "observed"
            ? "iers-observed"
            : "iers-predicted",
        xpRadians: estimate.polarMotion.xpRadians,
        ypRadians: estimate.polarMotion.ypRadians,
        xpReportedErrorRadians:
          estimate.polarMotion.xpReportedErrorRadians,
        ypReportedErrorRadians:
          estimate.polarMotion.ypReportedErrorRadians,
      },
    },
  };
}

export function App() {
  const [date, setDate] = useState(() =>
    clampObservationDate(new Date()),
  );
  const [drawError, setDrawError] = useState<DrawError | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [layers, setLayers] = useState<LayerSettings>(DEFAULT_LAYERS);
  const [location, setLocation] = useState<ObserverLocation>(cityToLocation);
  const [locationOpen, setLocationOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"stars" | "settings">("stars");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedHr, setSelectedHr] = useState<number | null>(null);
  const [resolvedSelectedStarTrack, setResolvedSelectedStarTrack] =
    useState<ResolvedSelectedStarTrack | null>(null);
  const [selectionAnnouncement, setSelectionAnnouncement] = useState("");
  const [timeError, setTimeError] = useState<string | null>(null);
  const [visibleMode, setVisibleMode] = useState<"above" | "all">("above");
  const initialSelectionResolved = useRef(false);
  const {
    catalog: precisionCatalog,
    retry: retryPrecisionCatalog,
    status: precisionCatalogStatus,
  } = usePrecisionCatalog();

  const handlePlaybackDateChange = useCallback((nextDate: Date) => {
    setDate(nextDate);
    setTimeError(null);
  }, []);
  const handlePlaybackBoundary = useCallback(
    (boundary: "maximum" | "minimum") => {
      setTimeError(
        boundary === "minimum"
          ? "対応期間の開始（1900年）に達したため、時間の再生を停止しました。"
          : "対応期間の終了（2100年）に達したため、時間の再生を停止しました。",
      );
    },
    [],
  );
  const playback = usePlaybackClock({
    date,
    onBoundary: handlePlaybackBoundary,
    onDateChange: handlePlaybackDateChange,
  });
  const iersEarthOrientation = useIersEarthOrientation(date);
  const currentEarthOrientationEstimate =
    iersEarthOrientation.estimate;
  const lookupIersEarthOrientationAt =
    iersEarthOrientation.lookupAt;

  const precisionRenderCatalog = useMemo(
    () =>
      precisionCatalog
        ? selectRenderableStars(
            precisionCatalog.stars,
            REQUIRED_RENDER_STAR_HRS,
          )
        : null,
    [precisionCatalog],
  );
  const apparentPositionOptions = useMemo<ApparentPositionOptionsV2>(() => {
    const base = layers.atmosphericRefraction
      ? STANDARD_REFRACTION_OPTIONS
      : GEOMETRIC_POSITION_OPTIONS;
    return apparentPositionOptionsWithEarthOrientation(
      base,
      currentEarthOrientationEstimate,
    );
  }, [
    currentEarthOrientationEstimate,
    layers.atmosphericRefraction,
  ]);

  const precisionFrame = useMemo(
    () =>
      precisionRenderCatalog
        ? calculatePrecisionSkyFrame(
            precisionRenderCatalog,
            date,
            location,
            apparentPositionOptions,
          )
        : null,
    [
      apparentPositionOptions,
      date,
      location,
      precisionRenderCatalog,
    ],
  );

  const calculatedCatalog = useMemo(() => {
    if (precisionFrame) {
      return precisionFrame.positions.map((position, index) => {
        const star = precisionFrame.catalog[index];
        if (!star || star.hr !== position.starHR) {
          throw new Error("精密星表の並び順が一致しません。");
        }
        return {
          altitudeDeg: radiansToDegrees(
            position.observedHorizontal.altitude,
          ),
          apparentDecRad: position.apparentEquatorial.declination,
          apparentRaRad: position.apparentEquatorial.rightAscension,
          annualParallaxMode: position.annualParallaxMode,
          azimuthDefined: position.observedHorizontal.azimuthDefined,
          azimuthDeg: radiansToDegrees(
            position.observedHorizontal.azimuth,
          ),
          bvColor: star.bvColor,
          calculationModel: "v2" as const,
          diurnalAberrationMode: position.diurnalAberrationMode,
          hr: star.hr,
          parallaxArcsec: star.parallaxArcsec,
          pmDecArcsecPerYear: star.pmDecArcsecPerYear,
          pmRaCosDecArcsecPerYear: star.pmRaCosDecArcsecPerYear,
          polarMotionMode: position.polarMotionMode,
          projectionX: position.projection.x,
          projectionY: position.projection.y,
          radialVelocityKmPerSecond:
            star.radialVelocityKmPerSecond,
          refractionMode: position.refractionMode,
          solarLightDeflectionMode:
            position.solarLightDeflectionMode,
          spaceMotionMode: position.spaceMotionMode,
          star,
          vMagnitude: star.vMagnitude,
        };
      });
    }

    return FALLBACK_RENDER_STARS.map((star) => {
      const result = calculateStarPosition(star, date, location);
      return {
        altitudeDeg: radiansToDegrees(result.horizontal.altitude),
        apparentDecRad: null,
        apparentRaRad: null,
        annualParallaxMode: null,
        azimuthDefined: result.horizontal.azimuthDefined,
        azimuthDeg: radiansToDegrees(result.horizontal.azimuth),
        bvColor: star.bvColor,
        calculationModel: "v1" as const,
        diurnalAberrationMode: null,
        hr: star.hr,
        parallaxArcsec: null,
        pmDecArcsecPerYear: null,
        pmRaCosDecArcsecPerYear: null,
        polarMotionMode: null,
        projectionX: result.projection.x,
        projectionY: result.projection.y,
        radialVelocityKmPerSecond: null,
        refractionMode: null,
        solarLightDeflectionMode: null,
        spaceMotionMode: null,
        star,
        vMagnitude: star.vMagnitude,
      };
    });
  }, [date, location, precisionFrame]);

  const viewModels = useMemo(() => {
    const result = new Map<number, StarViewModel>();
    for (const calculated of calculatedCatalog) {
      const named = namedStarByHR.get(calculated.hr);
      const fallbackName =
        named?.nameJa ??
        calculated.star.catalogName ??
        `HR ${calculated.hr}`;
      result.set(calculated.hr, {
        aliases: named?.aliases ?? [],
        altitudeDeg: calculated.altitudeDeg,
        apparentDecRad: calculated.apparentDecRad,
        apparentRaRad: calculated.apparentRaRad,
        annualParallaxMode: calculated.annualParallaxMode,
        azimuthDefined: calculated.azimuthDefined,
        azimuthDeg: calculated.azimuthDeg,
        calculationModel: calculated.calculationModel,
        catalogName: calculated.star.catalogName,
        constellation: named
          ? (CONSTELLATION_NAMES.get(named.constellation) ??
            named.constellation)
          : "",
        decRad: calculated.star.decRad,
        diurnalAberrationMode: calculated.diurnalAberrationMode,
        englishName:
          named?.name ?? calculated.star.catalogName ?? `HR ${calculated.hr}`,
        hr: calculated.hr,
        japaneseName: fallbackName,
        parallaxArcsec: calculated.parallaxArcsec,
        pmDecArcsecPerYear: calculated.pmDecArcsecPerYear,
        pmRaCosDecArcsecPerYear:
          calculated.pmRaCosDecArcsecPerYear,
        polarMotionMode: calculated.polarMotionMode,
        raRad: calculated.star.raRad,
        radialVelocityKmPerSecond:
          calculated.radialVelocityKmPerSecond,
        refractionMode: calculated.refractionMode,
        solarLightDeflectionMode:
          calculated.solarLightDeflectionMode,
        spaceMotionMode: calculated.spaceMotionMode,
        vMagnitude: calculated.star.vMagnitude,
      });
    }
    return result;
  }, [calculatedCatalog]);

  const namedViewModels = useMemo(
    () =>
      namedStars.flatMap((named) => {
        const viewModel = viewModels.get(named.hr);
        return viewModel ? [viewModel] : [];
      }),
    [viewModels],
  );

  useEffect(() => {
    if (
      initialSelectionResolved.current ||
      namedViewModels.length === 0
    ) {
      return;
    }

    let highestVisible: StarViewModel | null = null;
    for (const star of namedViewModels) {
      if (
        star.altitudeDeg >= 0 &&
        (!highestVisible || star.altitudeDeg > highestVisible.altitudeDeg)
      ) {
        highestVisible = star;
      }
    }
    setSelectedHr(highestVisible?.hr ?? namedViewModels[0]?.hr ?? null);
    initialSelectionResolved.current = true;
  }, [namedViewModels]);

  const skyStars = useMemo<readonly SkyStar[]>(
    () =>
      calculatedCatalog.map((calculated) => ({
        altitudeDeg: calculated.altitudeDeg,
        azimuthDeg: calculated.azimuthDeg,
        bvColor: calculated.bvColor,
        hr: calculated.hr,
        label: namedStarByHR.get(calculated.hr)?.nameJa ?? null,
        projectionX: calculated.projectionX,
        projectionY: calculated.projectionY,
        vMagnitude: calculated.vMagnitude,
      })),
    [calculatedCatalog],
  );
  const selectedStarTrackRequestKey =
    layers.selectedStarTrack &&
    selectedHr !== null &&
    precisionCatalog
      ? [
          selectedHr,
          date.getTime(),
          location.latitude,
          location.longitude,
          location.timeZone,
          layers.atmosphericRefraction ? "refracted" : "geometric",
        ].join("|")
      : null;
  useEffect(() => {
    if (
      selectedStarTrackRequestKey === null ||
      selectedHr === null ||
      !precisionCatalog
    ) {
      return;
    }
    const selectedPrecisionStar =
      precisionCatalog.starByHR.get(selectedHr);
    if (!selectedPrecisionStar) {
      return;
    }

    let cancelled = false;
    const base = layers.atmosphericRefraction
      ? STANDARD_REFRACTION_OPTIONS
      : GEOMETRIC_POSITION_OPTIONS;
    void calculateSelectedStarTrack(
      selectedPrecisionStar,
      date,
      location,
      async (sampleDate) =>
        apparentPositionOptionsWithEarthOrientation(
          base,
          await lookupIersEarthOrientationAt(sampleDate).catch(
            () => null,
          ),
        ),
    )
      .then((track) => {
        if (!cancelled) {
          setResolvedSelectedStarTrack({
            requestKey: selectedStarTrackRequestKey,
            track,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSelectedStarTrack(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    date,
    currentEarthOrientationEstimate,
    layers.atmosphericRefraction,
    location,
    lookupIersEarthOrientationAt,
    precisionCatalog,
    selectedHr,
    selectedStarTrackRequestKey,
  ]);
  const selectedStarTrack =
    selectedStarTrackRequestKey !== null &&
    resolvedSelectedStarTrack?.requestKey ===
      selectedStarTrackRequestKey
      ? resolvedSelectedStarTrack.track
      : null;

  const selectedStar =
    selectedHr === null ? null : (viewModels.get(selectedHr) ?? null);
  const handleSelectStar = useCallback(
    (hr: number) => {
      setSelectedHr(hr);
      const star = viewModels.get(hr);
      if (star) {
        setSelectionAnnouncement(
          `${star.japaneseName}を選択しました。高度${formatSignedDegrees(star.altitudeDeg, 0)}、方位${formatAzimuthDegrees(star.azimuthDeg)}です。`,
        );
      }
    },
    [viewModels],
  );
  const handleSearchFocusRequest = useCallback(() => {
    setMobileTab("stars");
  }, []);
  const sun = useMemo(
    () =>
      precisionFrame
        ? calculateApparentSunPositionWithContextV2(
            precisionFrame.context,
          ).geometricHorizontal
        : sunHorizontal(date, location),
    [date, location, precisionFrame],
  );
  const solarPosition = useMemo<SkySolarPosition>(() => {
    const projection = horizontalToProjection(sun);
    return {
      altitudeDeg: radiansToDegrees(sun.altitude),
      azimuthDeg: radiansToDegrees(sun.azimuth),
      projectionX: projection.x,
      projectionY: projection.y,
    };
  }, [sun]);
  const solarAltitudeText = formatSignedDegrees(
    solarPosition.altitudeDeg,
  );
  const twilight = twilightPhase(sun);
  const dateTimeInputValue = formatZonedDateTimeInput(date, location.timeZone);
  const dateTimeRange = useMemo(
    () => observationInputRange(location.timeZone),
    [location.timeZone],
  );
  const displayDateTime = `${formatZonedDateTime(date, location.timeZone)} ${timeZoneShortName(date, location.timeZone)}`;
  const timeScaleAssumption = timeScaleAssumptionText(
    precisionFrame?.context.timeScales ?? null,
  );
  const dut1StatusText = iersEarthOrientation.estimate
    ? iersEarthOrientation.estimate.dut1.source === "observed"
      ? "DUT1はIERS観測値"
      : "DUT1はIERS予測値"
    : iersEarthOrientation.status === "unavailable"
      ? "DUT1収録外（0秒近似）"
      : iersEarthOrientation.status === "error"
        ? "DUT1読込失敗（0秒近似）"
        : "DUT1準備中（0秒近似）";
  const polarMotionStatusText = iersEarthOrientation.estimate
    ? iersEarthOrientation.estimate.polarMotion.source === "observed"
      ? "極運動はIERS観測値"
      : "極運動はIERS予測値"
    : iersEarthOrientation.status === "unavailable"
      ? "極運動収録外（xp/yp=0近似）"
      : iersEarthOrientation.status === "error"
        ? "極運動読込失敗（xp/yp=0近似）"
        : "極運動準備中（xp/yp=0近似）";
  const earthOrientationStatusText =
    iersEarthOrientation.estimate &&
    iersEarthOrientation.estimate.dut1.source ===
      iersEarthOrientation.estimate.polarMotion.source
      ? `IERS EOP${
          iersEarthOrientation.estimate.dut1.source === "observed"
            ? "観測値"
            : "予測値"
        }（DUT1・極運動）`
      : iersEarthOrientation.estimate
        ? `${dut1StatusText}・${polarMotionStatusText}`
        : iersEarthOrientation.status === "unavailable"
          ? "IERS EOP収録外（DUT1・極運動は0近似）"
          : iersEarthOrientation.status === "error"
            ? "IERS EOP読込失敗（DUT1・極運動は0近似）"
            : "IERS EOP準備中（DUT1・極運動は0近似）";
  const calculationStatusText =
    precisionCatalogStatus === "ready"
      ? `精密計算 v2・年周視差（収録星）／太陽光偏向・年周・日周光行差・${
          layers.atmosphericRefraction
            ? "標準大気差あり（幾何高度5°以上）"
            : "幾何高度（大気差なし）"
        }・${earthOrientationStatusText}`
      : precisionCatalogStatus === "loading"
        ? `精密星表を準備中・一時的に簡易計算で幾何高度を表示${
            layers.atmosphericRefraction
              ? "（大気差は読込後に適用）"
              : ""
          }`
        : "精密星表を読み込めないため、簡易計算で幾何高度を表示";
  const TwilightIcon =
    twilight === "day"
      ? SunIcon
      : twilight === "night"
        ? MoonStarIcon
        : SunsetIcon;

  const handleDrawError = useCallback(
    (source: SkyDrawSource, message: string | null) => {
      setDrawError((current) => {
        if (message) {
          return { message, source };
        }
        return current?.source === source ? null : current;
      });
    },
    [],
  );

  function handleLayerChange(
    key: keyof LayerSettings,
    checked: boolean,
  ) {
    if (key === "atmosphericRefraction") {
      playback.pause();
    }
    setLayers((current) => ({ ...current, [key]: checked }));
  }

  function handleDateTimeChange(value: string) {
    playback.pause();
    const result = parseObservationDateInput(value, location.timeZone);
    if (!result.ok) {
      setTimeError(result.error);
      return;
    }
    setDate(result.date);
    setTimeError(null);
  }

  function handleLocationOpen() {
    playback.pause();
    setLocationOpen(true);
  }

  function resetView() {
    let highestVisible: StarViewModel | null = null;
    for (const star of namedViewModels) {
      if (
        star.altitudeDeg >= 0 &&
        (!highestVisible || star.altitudeDeg > highestVisible.altitudeDeg)
      ) {
        highestVisible = star;
      }
    }
    setLayers(DEFAULT_LAYERS);
    setSearchQuery("");
    if (highestVisible) {
      handleSelectStar(highestVisible.hr);
    } else {
      setSelectedHr(null);
      setSelectionAnnouncement("");
    }
    setVisibleMode("above");
  }

  return (
    <div
      className={`app-shell${layers.nightMode ? " app-shell--night" : ""}`}
      data-calculation-model={precisionFrame ? "v2" : "v1"}
    >
      <a className="skip-link" href="#star-list-panel">
        星の一覧へ移動
      </a>

      <header className="app-toolbar">
        <h1 className="app-brand">Planetarium</h1>
        <button
          className="toolbar-location"
          onClick={handleLocationOpen}
          type="button"
        >
          <MapPinIcon aria-hidden="true" size={20} strokeWidth={1.8} />
          <span>{location.name}</span>
        </button>
        <time className="toolbar-datetime" dateTime={date.toISOString()}>
          {displayDateTime}
        </time>
        <button
          className="toolbar-action toolbar-action--location"
          onClick={handleLocationOpen}
          type="button"
        >
          <NavigationIcon aria-hidden="true" size={20} strokeWidth={1.8} />
          現在地
        </button>
        <button
          className="toolbar-action toolbar-action--help"
          onClick={() => setHelpOpen(true)}
          type="button"
        >
          <CircleHelpIcon aria-hidden="true" size={20} strokeWidth={1.8} />
          ヘルプ
        </button>
      </header>

      <div className="mobile-datetime">
        <time dateTime={date.toISOString()}>{displayDateTime}</time>
      </div>

      <div className="workspace">
        <main className="sky-region">
          {drawError ? (
            <div className="inline-error" role="alert">
              <p>{drawError.message}</p>
              <button
                onClick={() => setDrawError(null)}
                type="button"
              >
                閉じる
              </button>
            </div>
          ) : null}

          <SkyViewport
            constellations={constellations}
            layers={layers}
            onDrawError={handleDrawError}
            onSelect={handleSelectStar}
            selectedHr={selectedHr}
            selectedStarTrack={selectedStarTrack}
            solarPosition={solarPosition}
            stars={skyStars}
            twilight={twilight}
          />

          <section className="twilight-status">
            <div aria-hidden="true" className="twilight-mark">
              <TwilightIcon size={29} strokeWidth={1.65} />
            </div>
            <div>
              <strong>
                {TWILIGHT_LABELS[twilight]}・太陽高度
                {solarAltitudeText}
              </strong>
              <p aria-live="polite">{calculationStatusText}</p>
              {timeScaleAssumption ? (
                <p
                  aria-live="polite"
                  className="time-scale-assumption"
                >
                  {timeScaleAssumption}
                </p>
              ) : null}
              {precisionCatalogStatus === "error" ? (
                <button
                  className="precision-retry"
                  onClick={retryPrecisionCatalog}
                  type="button"
                >
                  精密星表を再読み込み
                </button>
              ) : null}
              {iersEarthOrientation.status === "error" ? (
                <button
                  className="precision-retry"
                  onClick={iersEarthOrientation.retry}
                  type="button"
                >
                  IERS地球姿勢データを再読み込み
                </button>
              ) : null}
            </div>
          </section>

          {timeError ? (
            <p
              className="time-error"
              id="observation-time-error"
              role="alert"
            >
              {timeError}
            </p>
          ) : null}
          <TimeControls
            dateTimeMaximum={dateTimeRange.maximum}
            dateTimeMinimum={dateTimeRange.minimum}
            dateTimeInputValue={dateTimeInputValue}
            direction={playback.direction}
            hasError={Boolean(timeError)}
            isPlaying={playback.isPlaying}
            motionRestricted={playback.motionRestricted}
            onDateTimeChange={handleDateTimeChange}
            onDirectionChange={playback.setDirection}
            onNow={() => {
              playback.pause();
              setDate(clampObservationDate(new Date()));
              setTimeError(null);
            }}
            onPlaybackSpeedChange={playback.setSpeed}
            onPlaybackToggle={() => {
              setTimeError(null);
              playback.toggle();
            }}
            onResetView={resetView}
            onShiftHours={(hours) => {
              playback.pause();
              const result = shiftObservationDate(date, hours);
              if (!result.ok) {
                setTimeError(result.error);
                return;
              }
              setDate(result.date);
              setTimeError(null);
            }}
            playbackDateTime={date.toISOString()}
            playbackSpeed={playback.speed}
            playbackTimeText={playbackTimeText(
              date,
              location.timeZone,
            )}
            timeZone={location.timeZone}
          />
        </main>

        <aside className="side-panel" id="star-list-panel">
          <div className="mobile-tabs">
            <SegmentedControl
              ariaLabel="モバイル表示"
              kind="tabs"
              onChange={setMobileTab}
              options={[
                {
                  controlsId: "mobile-stars-panel",
                  id: "mobile-stars-tab",
                  label: "星を探す",
                  value: "stars",
                },
                {
                  controlsId: "mobile-settings-panel",
                  id: "mobile-settings-tab",
                  label: "表示設定",
                  value: "settings",
                },
              ]}
              value={mobileTab}
            />
          </div>

          <div
            className={`side-panel__stars${
              mobileTab === "stars" ? " is-mobile-active" : ""
            }`}
            id="mobile-stars-panel"
            role="tabpanel"
            aria-labelledby="mobile-stars-tab"
          >
            <StarExplorer
              allStars={namedViewModels}
              onQueryChange={setSearchQuery}
              onSearchFocusRequest={handleSearchFocusRequest}
              onSelect={handleSelectStar}
              onVisibleModeChange={setVisibleMode}
              query={searchQuery}
              selectedHr={selectedHr}
              visibleMode={visibleMode}
            />
            <StarDetails
              earthOrientationEstimate={currentEarthOrientationEstimate}
              star={selectedStar}
              timeScales={precisionFrame?.context.timeScales ?? null}
            />
          </div>

          <div
            className={`side-panel__settings${
              mobileTab === "settings" ? " is-mobile-active" : ""
            }`}
            id="mobile-settings-panel"
            role="tabpanel"
            aria-labelledby="mobile-settings-tab"
          >
            <LayerPanel
              layers={layers}
              onChange={handleLayerChange}
              onResetView={resetView}
            />
            <button
              className="settings-help-button"
              onClick={() => setHelpOpen(true)}
              type="button"
            >
              <CircleHelpIcon aria-hidden="true" size={19} strokeWidth={1.8} />
              ヘルプとプライバシー
            </button>
          </div>
        </aside>
      </div>

      {locationOpen ? (
        <LocationDialog
          cities={cities}
          currentLocation={location}
          onApply={(nextLocation) => {
            playback.pause();
            setLocation(nextLocation);
            setTimeError(null);
          }}
          onClose={() => setLocationOpen(false)}
          open
        />
      ) : null}
      <HelpDialog onClose={() => setHelpOpen(false)} open={helpOpen} />

      <div
        aria-label="選択通知"
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {selectionAnnouncement}
      </div>
    </div>
  );
}
