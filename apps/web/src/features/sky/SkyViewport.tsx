import {
  Component,
  lazy,
  Suspense,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useId,
  useState,
} from "react";
import type { Constellation, TwilightPhase } from "../../domain";
import type {
  LayerSettings,
  SelectedStarTrack,
  SkySolarPosition,
  SkyStar,
} from "../../app/types";
import { formatTrackRelativeTime } from "../../app/selectedStarTrack";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { SkyCanvas } from "./SkyCanvas";

const LazySkySphere3D = lazy(() =>
  import("./SkySphere3D").then((module) => ({
    default: module.SkySphere3D,
  })),
);

const VIEW_OPTIONS = [
  { label: "2D", value: "2d" },
  { label: "3D", value: "3d" },
] as const;

const THREE_DIMENSIONAL_LOAD_ERROR =
  "3D星図の読み込みに失敗しました。2D星図へ戻して表示を継続します。";

function trackEarthOrientationWarning(
  track: SelectedStarTrack | null,
) {
  if (!track) {
    return null;
  }
  const provenance = track.earthOrientationProvenance;
  const centerUsesFallback = provenance.centerStatus !== "ready";
  const auxiliaryUsesFallback =
    provenance.auxiliaryFallbackSampleCount > 0;
  if (!centerUsesFallback && !auxiliaryUsesFallback) {
    return null;
  }

  const shortParts = [
    centerUsesFallback ? "現在点" : null,
    auxiliaryUsesFallback
      ? `周辺${provenance.auxiliaryFallbackSampleCount}/${provenance.auxiliarySampleCount}点`
      : null,
  ].filter((part): part is string => part !== null);
  const descriptions = [
    provenance.centerStatus === "error"
      ? "現在点はEOP読込失敗のため0近似です。"
      : provenance.centerStatus === "unavailable"
        ? "現在点はEOP収録外のため0近似です。"
        : null,
    auxiliaryUsesFallback
      ? `周辺${provenance.auxiliarySampleCount}点中${provenance.auxiliaryFallbackSampleCount}点はEOPを0近似しています。`
      : null,
  ].filter((part): part is string => part !== null);

  return {
    description: descriptions.join(""),
    short: `EOP 0近似: ${shortParts.join("・")}`,
  };
}

type SkyViewMode = (typeof VIEW_OPTIONS)[number]["value"];

export type SkyDrawSource = "2d" | "3d";

export type SkyViewportProps = {
  constellations: readonly Constellation[];
  layers: LayerSettings;
  onDrawError: (
    source: SkyDrawSource,
    message: string | null,
  ) => void;
  onSelect: (hr: number) => void;
  selectedHr: number | null;
  selectedStarTrack: SelectedStarTrack | null;
  solarPosition: SkySolarPosition;
  stars: readonly SkyStar[];
  twilight: TwilightPhase;
};

type LazySkyErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  onUnavailable: (message: string) => void;
};

type LazySkyErrorBoundaryState = {
  failed: boolean;
};

class LazySkyErrorBoundary extends Component<
  LazySkyErrorBoundaryProps,
  LazySkyErrorBoundaryState
> {
  state: LazySkyErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): LazySkyErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "3D sky renderer failed to load",
      error,
      info.componentStack,
    );
    this.props.onUnavailable(THREE_DIMENSIONAL_LOAD_ERROR);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function SkyViewport({
  constellations,
  layers,
  onDrawError,
  onSelect,
  selectedHr,
  selectedStarTrack,
  solarPosition,
  stars,
  twilight,
}: SkyViewportProps) {
  const [viewMode, setViewMode] = useState<SkyViewMode>("2d");
  const trackDescriptionId = useId();
  const firstTrackPoint = selectedStarTrack?.points[0];
  const lastTrackPoint = selectedStarTrack?.points.at(-1);
  const earthOrientationWarning =
    trackEarthOrientationWarning(selectedStarTrack);
  const trackDescription =
    firstTrackPoint && lastTrackPoint
      ? `選択星の軌跡。${formatTrackRelativeTime(
          firstTrackPoint.relativeMinutes,
        )}から${formatTrackRelativeTime(
          lastTrackPoint.relativeMinutes,
        )}まで、30分間隔の${selectedStarTrack.points.length}点です。小さい点から大きい点へ、過去、現在、未来の順に進みます。${
          selectedStarTrack.truncatedPast ||
          selectedStarTrack.truncatedFuture
            ? "対応期間の境界で軌跡を短くしています。"
            : ""
        }${earthOrientationWarning?.description ?? ""}`
      : "選択星の軌跡は、星を選択し精密星表の準備が完了すると表示されます。";
  const trackRangeText =
    firstTrackPoint && lastTrackPoint
      ? `${formatTrackRelativeTime(
          firstTrackPoint.relativeMinutes,
        )} → 現在 → ${formatTrackRelativeTime(
          lastTrackPoint.relativeMinutes,
        )}・${selectedStarTrack.points.length}点${
          earthOrientationWarning
            ? `・${earthOrientationWarning.short}`
            : ""
        }`
      : "精密計算を準備中";

  const handleTwoDimensionalError = useCallback(
    (message: string | null) => onDrawError("2d", message),
    [onDrawError],
  );
  const handleThreeDimensionalReady = useCallback(
    () => onDrawError("3d", null),
    [onDrawError],
  );
  const handleThreeDimensionalUnavailable = useCallback(
    (message: string) => {
      setViewMode("2d");
      onDrawError("3d", message);
    },
    [onDrawError],
  );

  const twoDimensionalSky = (
    <SkyCanvas
      constellations={constellations}
      layers={layers}
      onDrawError={handleTwoDimensionalError}
      onSelect={onSelect}
      selectedHr={selectedHr}
      selectedStarTrack={selectedStarTrack}
      solarPosition={solarPosition}
      stars={stars}
      trackDescriptionId={
        layers.selectedStarTrack ? trackDescriptionId : undefined
      }
      twilight={twilight}
    />
  );
  const loadingFallback = (
    <div className="sky-viewport__loading">
      {twoDimensionalSky}
      <p className="sky-viewport__loading-message" role="status">
        3D星図を読み込んでいます…
      </p>
    </div>
  );

  return (
    <section aria-label="星図表示" className="sky-viewport">
      <div className="sky-viewport__mode">
        <SegmentedControl
          ariaLabel="星図の表示形式"
          onChange={setViewMode}
          options={VIEW_OPTIONS}
          value={viewMode}
        />
      </div>

      <div className="sky-viewport__surface">
        {viewMode === "2d" ? (
          twoDimensionalSky
        ) : (
          <LazySkyErrorBoundary
            fallback={loadingFallback}
            onUnavailable={handleThreeDimensionalUnavailable}
          >
            <Suspense fallback={loadingFallback}>
              <LazySkySphere3D
                constellationLines={layers.constellationLines}
                constellations={constellations}
                nightMode={layers.nightMode}
                onReady={handleThreeDimensionalReady}
                onSelect={onSelect}
                onUnavailable={handleThreeDimensionalUnavailable}
                selectedHr={selectedHr}
                selectedStarTrack={selectedStarTrack}
                solarPosition={solarPosition}
                starLabels={layers.starLabels}
                stars={stars}
                trackDescriptionId={
                  layers.selectedStarTrack
                    ? trackDescriptionId
                    : undefined
                }
                twilight={twilight}
              />
            </Suspense>
          </LazySkyErrorBoundary>
        )}
        {layers.selectedStarTrack ? (
          <p
            aria-label="選択星の追跡状態"
            className="sky-viewport__track-key"
            id={trackDescriptionId}
          >
            <span
              aria-hidden="true"
              className="sky-viewport__track-key-mark"
            >
              <i />
              <i />
              <i />
            </span>
            <span
              aria-hidden="true"
              className="sky-viewport__track-key-copy"
            >
              <strong>過去 → 現在 → 未来</strong>
              <small>{trackRangeText}</small>
            </span>
            <span className="sr-only">{trackDescription}</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
