import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Constellation, TwilightPhase } from "../../domain";
import type {
  LayerSettings,
  SelectedStarTrack,
  SkySolarPosition,
  SkyStar,
} from "../../app/types";
import {
  formatAzimuthDegrees,
  formatSignedDegrees,
} from "../../app/astronomicalFormatting";
import {
  trackProgress,
  visibleCanvasTrackSegments,
} from "./skyTrackModel";
import { skyDevicePixelRatio } from "./pixelRatio";

type CanvasSize = {
  height: number;
  width: number;
};

type HitPoint = {
  hr: number;
  radius: number;
  x: number;
  y: number;
};

type SkyCanvasProps = {
  constellations: readonly Constellation[];
  layers: LayerSettings;
  onDrawError: (message: string | null) => void;
  onSelect: (hr: number) => void;
  selectedHr: number | null;
  selectedStarTrack: SelectedStarTrack | null;
  solarPosition: SkySolarPosition;
  stars: readonly SkyStar[];
  trackDescriptionId?: string;
  twilight: TwilightPhase;
};

const CARDINALS = [
  { angle: 0, label: "北" },
  { angle: Math.PI / 2, label: "東" },
  { angle: Math.PI, label: "南" },
  { angle: (3 * Math.PI) / 2, label: "西" },
] as const;

const RING_ALTITUDES = [15, 30, 45, 60, 75] as const;
const CANVAS_FONT_STACK =
  '"Planetarium Sans JP", "Hiragino Sans", sans-serif';

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function starColor(bvColor: number | null, nightMode: boolean) {
  if (nightMode) {
    return "#f18b83";
  }
  if (bvColor === null) {
    return "#f7f2e7";
  }
  if (bvColor < 0) {
    return "#dcecff";
  }
  if (bvColor > 1.35) {
    return "#ffd7a5";
  }
  if (bvColor > 0.75) {
    return "#ffe9c7";
  }
  return "#fff5dd";
}

function backgroundForTwilight(
  twilight: TwilightPhase,
  nightMode: boolean,
) {
  if (nightMode) {
    return ["#050000", "#120303"] as const;
  }

  switch (twilight) {
    case "day":
      return ["#0a2542", "#07182d"] as const;
    case "civil":
      return ["#101e38", "#071528"] as const;
    case "nautical":
      return ["#0b172d", "#051122"] as const;
    case "astronomical":
      return ["#071429", "#041020"] as const;
    case "night":
      return ["#06101f", "#030914"] as const;
  }
}

function drawSelectedStarTrack(
  context: CanvasRenderingContext2D,
  track: SelectedStarTrack,
  size: CanvasSize,
  radius: number,
  nightMode: boolean,
) {
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const segments = visibleCanvasTrackSegments(track);
  context.lineCap = "round";
  context.lineWidth = radius < 150 ? 1.2 : 1.55;

  for (const segment of segments) {
    const progress =
      (trackProgress(segment.start.relativeMinutes) +
        trackProgress(segment.end.relativeMinutes)) /
      2;
    context.setLineDash(
      segment.end.relativeMinutes <= 0 ? [2, 3] : [],
    );
    context.strokeStyle = nightMode
      ? `rgba(240, 109, 99, ${0.38 + progress * 0.4})`
      : `rgba(139, 200, 255, ${0.36 + progress * 0.44})`;
    context.beginPath();
    context.moveTo(
      centerX + segment.start.projectionX * radius,
      centerY + segment.start.projectionY * radius,
    );
    context.lineTo(
      centerX + segment.end.projectionX * radius,
      centerY + segment.end.projectionY * radius,
    );
    context.stroke();
  }
  context.setLineDash([]);

  const compactStride = radius < 150 ? 2 : 1;
  for (let index = 0; index < track.points.length; index += 1) {
    const point = track.points[index];
    if (
      !point ||
      point.altitudeDeg < 0 ||
      (index % compactStride !== 0 &&
        point.relativeMinutes !== 0 &&
        index !== track.points.length - 1)
    ) {
      continue;
    }
    const progress = trackProgress(point.relativeMinutes);
    const pointRadius =
      (radius < 150 ? 1.2 : 1.45) + progress * 1.35;
    context.fillStyle = nightMode
      ? `rgba(240, 109, 99, ${0.56 + progress * 0.4})`
      : `rgba(139, 200, 255, ${0.54 + progress * 0.42})`;
    context.beginPath();
    context.arc(
      centerX + point.projectionX * radius,
      centerY + point.projectionY * radius,
      pointRadius,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
}

function drawSolarMarker(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  radius: number,
  solarPosition: SkySolarPosition,
  nightMode: boolean,
) {
  if (
    solarPosition.altitudeDeg < 0 ||
    !Number.isFinite(solarPosition.altitudeDeg) ||
    !Number.isFinite(solarPosition.projectionX) ||
    !Number.isFinite(solarPosition.projectionY)
  ) {
    return;
  }

  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const x = centerX + solarPosition.projectionX * radius;
  const y = centerY + solarPosition.projectionY * radius;
  const markerRadius = radius < 100 ? 3.8 : radius < 190 ? 4.8 : 5.8;
  const fillColor = nightMode ? "#e8756d" : "#ffd16a";
  const ringColor = nightMode
    ? "rgba(246, 143, 134, 0.78)"
    : "rgba(255, 229, 164, 0.88)";

  context.fillStyle = fillColor;
  context.strokeStyle = ringColor;
  context.lineWidth = radius < 150 ? 1.1 : 1.4;
  context.beginPath();
  context.arc(x, y, markerRadius, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(x, y, markerRadius + 3, 0, Math.PI * 2);
  context.stroke();

  if (radius >= 150) {
    const placeLabelLeft = x > centerX + radius * 0.48;
    context.fillStyle = nightMode ? "#ed8d85" : "#ffe5a4";
    context.font = `600 ${radius < 250 ? 11 : 12}px ${CANVAS_FONT_STACK}`;
    context.textAlign = placeLabelLeft ? "right" : "left";
    context.textBaseline = "middle";
    context.fillText(
      "太陽",
      x + (placeLabelLeft ? -markerRadius - 6 : markerRadius + 6),
      clamp(y, 8, size.height - 8),
    );
  }
}

function drawSky(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  stars: readonly SkyStar[],
  constellations: readonly Constellation[],
  layers: LayerSettings,
  selectedHr: number | null,
  selectedStarTrack: SelectedStarTrack | null,
  solarPosition: SkySolarPosition,
  twilight: TwilightPhase,
): HitPoint[] {
  const scale = skyDevicePixelRatio(window.devicePixelRatio);
  const width = size.width;
  const height = size.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(40, Math.min(width, height) / 2 - 22);
  const lineColor = layers.nightMode
    ? "rgba(220, 79, 70, 0.42)"
    : "rgba(162, 196, 239, 0.32)";
  const lineStrong = layers.nightMode
    ? "rgba(244, 112, 102, 0.7)"
    : "rgba(179, 204, 235, 0.58)";
  const textColor = layers.nightMode ? "#ed8d85" : "#f4f7fc";
  const [innerBackground, outerBackground] = backgroundForTwilight(
    twilight,
    layers.nightMode,
  );

  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);

  const background = context.createRadialGradient(
    centerX,
    centerY,
    radius * 0.12,
    centerX,
    centerY,
    radius,
  );
  background.addColorStop(0, innerBackground);
  background.addColorStop(1, outerBackground);

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = background;
  context.fill();

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();

  const aboveHorizonStars = stars.filter((star) => star.altitudeDeg >= 0);
  const magnitudeLimit =
    radius < 100 ? 3 : radius < 190 ? 4.3 : radius < 250 ? 4.5 : 5;
  const visibleStars = aboveHorizonStars.filter(
    (star) => star.vMagnitude <= magnitudeLimit || star.hr === selectedHr,
  );
  const visibleByHr = new Map(
    aboveHorizonStars.map((star) => [star.hr, star]),
  );

  if (layers.constellationLines) {
    context.lineWidth = 1;
    context.strokeStyle = layers.nightMode
      ? "rgba(204, 73, 67, 0.56)"
      : "rgba(80, 157, 235, 0.62)";

    for (const constellation of constellations) {
      const constellationPoints: Array<{ x: number; y: number }> = [];

      for (const [firstHr, secondHr] of constellation.segments) {
        const first = visibleByHr.get(firstHr);
        const second = visibleByHr.get(secondHr);
        if (!first || !second) {
          continue;
        }
        const firstX = centerX + first.projectionX * radius;
        const firstY = centerY + first.projectionY * radius;
        const secondX = centerX + second.projectionX * radius;
        const secondY = centerY + second.projectionY * radius;
        context.beginPath();
        context.moveTo(firstX, firstY);
        context.lineTo(secondX, secondY);
        context.stroke();
        constellationPoints.push(
          { x: firstX, y: firstY },
          { x: secondX, y: secondY },
        );
      }

      if (constellationPoints.length > 0 && radius >= 240) {
        const average = constellationPoints.reduce(
          (result, point) => ({
            x: result.x + point.x / constellationPoints.length,
            y: result.y + point.y / constellationPoints.length,
          }),
          { x: 0, y: 0 },
        );
        context.font = `600 11px ${CANVAS_FONT_STACK}`;
        context.fillStyle = layers.nightMode
          ? "rgba(227, 111, 103, 0.76)"
          : "rgba(154, 195, 239, 0.76)";
        context.textAlign = "center";
        context.fillText(constellation.nameJa, average.x, average.y - 8);
      }
    }
  }

  if (layers.selectedStarTrack && selectedStarTrack) {
    drawSelectedStarTrack(
      context,
      selectedStarTrack,
      size,
      radius,
      layers.nightMode,
    );
  }

  const hitPoints: HitPoint[] = [];
  for (const star of visibleStars) {
    const x = centerX + star.projectionX * radius;
    const y = centerY + star.projectionY * radius;
    const compactSkyBoost = radius < 190 ? 0.3 : 0;
    const starRadius = clamp(
      0.6 + (6.5 - star.vMagnitude) * 0.45 + compactSkyBoost,
      0.75,
      4.6,
    );
    const color = starColor(star.bvColor, layers.nightMode);

    if (star.vMagnitude < 1.3) {
      const glow = context.createRadialGradient(
        x,
        y,
        starRadius * 0.35,
        x,
        y,
        starRadius * 3.4,
      );
      glow.addColorStop(0, color);
      glow.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, starRadius * 3.4, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, starRadius, 0, Math.PI * 2);
    context.fill();
    hitPoints.push({
      hr: star.hr,
      radius: Math.max(8, starRadius + 5),
      x,
      y,
    });
  }

  drawSolarMarker(
    context,
    size,
    radius,
    solarPosition,
    layers.nightMode,
  );

  context.strokeStyle = lineColor;
  context.fillStyle = layers.nightMode
    ? "rgba(235, 137, 128, 0.9)"
    : "rgba(219, 229, 242, 0.9)";
  context.lineWidth = 1;
  context.font =
    `400 ${radius < 100 ? 9 : radius < 190 ? 10 : 11}px ` +
    CANVAS_FONT_STACK;
  context.textAlign = "left";

  const ringAltitudes =
    radius < 100 ? [45] : radius < 190 ? [30, 60] : RING_ALTITUDES;
  for (const altitude of ringAltitudes) {
    const ringRadius = radius * (1 - altitude / 90);
    context.beginPath();
    context.setLineDash([2, 4]);
    context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    context.fillText(
      `${altitude}°`,
      centerX + 7,
      centerY - ringRadius + 13,
    );
  }

  context.restore();

  context.strokeStyle = lineStrong;
  context.lineWidth = 1.2;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = textColor;
  context.font =
    `600 ${radius < 100 ? 14 : radius < 190 ? 17 : 20}px ` +
    CANVAS_FONT_STACK;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const cardinal of CARDINALS) {
    const labelRadius = radius + (radius < 100 ? 13 : radius < 190 ? 16 : 18);
    context.fillText(
      cardinal.label,
      centerX + Math.sin(cardinal.angle) * labelRadius,
      centerY - Math.cos(cardinal.angle) * labelRadius,
    );
  }

  const labelledStars = stars.filter(
    (star) =>
      star.altitudeDeg >= 0 &&
      star.label &&
      layers.starLabels &&
      ((radius >= 250 && star.vMagnitude <= 0.5) ||
        (radius >= 150 && star.vMagnitude <= -0.4)),
  );
  const selected = stars.find((star) => star.hr === selectedHr);
  const starsToLabel =
    selected?.altitudeDeg !== undefined &&
    selected.altitudeDeg >= 0 &&
    selected.label &&
    !labelledStars.some((star) => star.hr === selected.hr)
      ? [...labelledStars, selected]
      : labelledStars;

  context.font =
    `600 ${radius < 100 ? 10 : radius < 190 ? 12 : 13}px ` +
    CANVAS_FONT_STACK;
  context.textAlign = "left";
  context.textBaseline = "middle";

  for (const star of starsToLabel) {
    const x = centerX + star.projectionX * radius;
    const y = centerY + star.projectionY * radius;
    const isSelected = star.hr === selectedHr;
    const placeLabelLeft = x > centerX + radius * 0.48;
    if (isSelected) {
      context.strokeStyle = layers.nightMode ? "#f06d63" : "#8bc8ff";
      context.fillStyle = layers.nightMode
        ? "rgba(53, 5, 4, 0.62)"
        : "rgba(7, 30, 57, 0.62)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(x, y, 13, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = starColor(star.bvColor, layers.nightMode);
      context.beginPath();
      context.arc(x, y, 3.6, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(x + (placeLabelLeft ? -14 : 14), y);
      context.lineTo(x + (placeLabelLeft ? -38 : 38), y);
      context.stroke();
    }
    context.fillStyle = textColor;
    context.textAlign = placeLabelLeft ? "right" : "left";
    const label = star.label ?? "";
    const measuredWidth = context.measureText(label).width;
    const desiredLabelX =
      x +
      (placeLabelLeft
        ? isSelected
          ? -43
          : -9
        : isSelected
          ? 43
          : 9);
    const labelX = placeLabelLeft
      ? Math.max(measuredWidth + 4, desiredLabelX)
      : Math.min(width - measuredWidth - 4, desiredLabelX);
    context.fillText(
      label,
      labelX,
      clamp(y, 8, height - 8),
    );
  }

  context.fillStyle = layers.nightMode
    ? "rgba(238, 134, 125, 0.9)"
    : "rgba(210, 223, 240, 0.84)";
  context.font = `400 14px ${CANVAS_FONT_STACK}`;
  context.textAlign = "center";
  context.fillText("+", centerX, centerY);

  return hitPoints;
}

export function SkyCanvas({
  constellations,
  layers,
  onDrawError,
  onSelect,
  selectedHr,
  selectedStarTrack,
  solarPosition,
  stars,
  trackDescriptionId,
  twilight,
}: SkyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const hitPointsRef = useRef<readonly HitPoint[]>([]);
  const [fontReady, setFontReady] = useState(false);
  const [size, setSize] = useState<CanvasSize>({ height: 0, width: 0 });

  useEffect(() => {
    if (!document.fonts) {
      return;
    }
    let active = true;
    Promise.all([
      document.fonts.load('400 14px "Planetarium Sans JP"'),
      document.fonts.load('600 14px "Planetarium Sans JP"'),
    ])
      .then(() => {
        if (active) {
          setFontReady(true);
        }
      })
      .catch(() => {
        // The declared fallback remains usable; drawing must not fail on font
        // loading alone.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const nextSize = Math.floor(
        Math.min(entry.contentRect.width, entry.contentRect.height),
      );
      setSize((current) =>
        current.width === nextSize && current.height === nextSize
          ? current
          : { height: nextSize, width: nextSize },
      );
    });

    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) {
      return;
    }

    const scale = skyDevicePixelRatio(window.devicePixelRatio);
    canvas.width = Math.round(size.width * scale);
    canvas.height = Math.round(size.height * scale);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const context = canvas.getContext("2d");
    if (!context) {
      onDrawError(
        "このブラウザでは星図を描画できません。星の一覧は引き続き利用できます。",
      );
      return;
    }

    try {
      hitPointsRef.current = drawSky(
        context,
        size,
        stars,
        constellations,
        layers,
        selectedHr,
        selectedStarTrack,
        solarPosition,
        twilight,
      );
      onDrawError(null);
    } catch {
      onDrawError(
        "星図の描画中に問題が起きました。日時または地点を変更して再試行してください。",
      );
    }
  }, [
    constellations,
    fontReady,
    layers,
    onDrawError,
    selectedHr,
    selectedStarTrack,
    size,
    solarPosition,
    stars,
    twilight,
  ]);

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    let selectedPoint: HitPoint | null = null;
    let selectedDistance = Number.POSITIVE_INFINITY;

    for (const point of hitPointsRef.current) {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance <= point.radius && distance < selectedDistance) {
        selectedPoint = point;
        selectedDistance = distance;
      }
    }
    if (selectedPoint) {
      onSelect(selectedPoint.hr);
    }
  }

  return (
    <div
      aria-busy={size.width <= 0}
      className="sky-canvas-frame"
      ref={frameRef}
    >
      {size.width <= 0 ? (
        <p className="sky-loading" role="status">
          星図を準備しています…
        </p>
      ) : null}
      <canvas
        aria-describedby={trackDescriptionId}
        aria-label={`天頂を中心に、北を上、東を右にした全天星図。太陽は高度${formatSignedDegrees(
          solarPosition.altitudeDeg,
          0,
        )}、方位${formatAzimuthDegrees(
          solarPosition.azimuthDeg,
        )}で、地平線${
          solarPosition.altitudeDeg >= 0 ? "上" : "下"
        }です。星の選択には下の一覧も利用できます。`}
        className="sky-canvas"
        onPointerUp={handlePointerUp}
        ref={canvasRef}
        role="img"
      />
    </div>
  );
}
