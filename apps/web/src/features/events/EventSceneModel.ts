import type {
  EventBodyPosition,
  EventContact,
  EventContactPhase,
  EventKind,
  LocalCircumstances,
} from "../../domain/events/types";
import type { HorizontalCoordinates } from "../../domain/types";

export const EVENT_SCENE_VIEWBOX = Object.freeze({
  height: 280,
  width: 560,
});

const DRAWING_BOUNDS = Object.freeze({
  bottom: 230,
  left: 36,
  right: 524,
  top: 26,
});
const DEGENERATE_DIRECTION_RADIANS = 1e-12;

type Point2 = {
  readonly x: number;
  readonly y: number;
};

export type EventSceneCircle = Point2 & {
  readonly radius: number;
};

export type EventSceneSample = {
  readonly aboveHorizon?: boolean;
  readonly bodies: EventContact["bodies"];
  readonly instantUtc: Date;
  readonly label?: string;
  readonly lunarShadow?: EventContact["lunarShadow"];
  readonly phase?: EventContactPhase;
  readonly positionAngleRadians?: number | null;
};

type EventSceneCommon = {
  readonly description: string;
  readonly instantUtc: Date;
  readonly metrics: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly sampleLabel: string;
  readonly scaleNote: string;
};

export type CalculatedSolarEventSceneModel =
  EventSceneCommon & {
    readonly fidelity: "calculated";
    readonly kind: "solar-eclipse";
    readonly moon: EventSceneCircle;
    readonly orientationNote: string;
    readonly sun: EventSceneCircle;
  };

export type CalculatedLunarEventSceneModel =
  EventSceneCommon & {
    readonly fidelity: "calculated";
    readonly kind: "lunar-eclipse";
    readonly moon: EventSceneCircle;
    readonly penumbra: EventSceneCircle;
    readonly umbra: EventSceneCircle;
    readonly orientationNote: string;
  };

export type CalculatedOccultationEventSceneModel =
  EventSceneCommon & {
    readonly fidelity: "calculated";
    readonly kind: "lunar-occultation";
    readonly moon: EventSceneCircle;
    readonly orientationNote: string;
    readonly target: Point2;
    readonly targetIsBehindMoon: boolean;
  };

export type SchematicLunarEventSceneModel =
  EventSceneCommon & {
    readonly fidelity: "schematic";
    readonly kind: "lunar-eclipse";
    readonly localClassification:
      LocalCircumstances["localClassification"];
    readonly orientationNote: string;
  };

export type UnavailableEventSceneModel =
  EventSceneCommon & {
    readonly fidelity: "unavailable";
    readonly kind: EventKind;
    readonly orientationNote: string;
  };

export type EventSceneModel =
  | CalculatedSolarEventSceneModel
  | CalculatedLunarEventSceneModel
  | CalculatedOccultationEventSceneModel
  | SchematicLunarEventSceneModel
  | UnavailableEventSceneModel;

type AngularCircle = Point2 & {
  readonly radius: number;
};

type DirectionVector = readonly [
  east: number,
  north: number,
  up: number,
];

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function validAngularRadius(
  body: EventBodyPosition | undefined,
): number | null {
  const radius = body?.angularRadiusRadians;
  return radius !== null &&
    radius !== undefined &&
    isFiniteNumber(radius) &&
    radius > 0
    ? radius
    : null;
}

function directionVector(
  horizontal: HorizontalCoordinates,
): DirectionVector | null {
  const { altitude, azimuth, azimuthDefined } = horizontal;
  if (
    !azimuthDefined ||
    !isFiniteNumber(altitude) ||
    !isFiniteNumber(azimuth)
  ) {
    return null;
  }
  const cosineAltitude = Math.cos(altitude);
  return [
    cosineAltitude * Math.sin(azimuth),
    cosineAltitude * Math.cos(azimuth),
    Math.sin(altitude),
  ];
}

function dot(
  left: DirectionVector,
  right: DirectionVector,
): number {
  return (
    left[0] * right[0] +
    left[1] * right[1] +
    left[2] * right[2]
  );
}

/**
 * Projects a target into the local tangent plane around a reference body.
 *
 * Positive x follows increasing azimuth and positive y follows increasing
 * altitude. An azimuthal-equidistant tangent projection preserves the exact
 * great-circle separation as sqrt(x² + y²), which lets the renderer use one
 * angular scale for disc radii and center distance.
 */
export function horizontalTangentOffset(
  reference: HorizontalCoordinates,
  target: HorizontalCoordinates,
): {
  readonly separationRadians: number;
  readonly xRadians: number;
  readonly yRadians: number;
} | null {
  const referenceVector = directionVector(reference);
  const targetVector = directionVector(target);
  if (!referenceVector || !targetVector) {
    return null;
  }

  const referenceDotTarget = Math.max(
    -1,
    Math.min(1, dot(referenceVector, targetVector)),
  );
  if (referenceDotTarget <= 0) {
    return null;
  }

  const cosineAzimuth = Math.cos(reference.azimuth);
  const sineAzimuth = Math.sin(reference.azimuth);
  const cosineAltitude = Math.cos(reference.altitude);
  const sineAltitude = Math.sin(reference.altitude);
  const increasingAzimuth: DirectionVector = [
    cosineAzimuth,
    -sineAzimuth,
    0,
  ];
  const increasingAltitude: DirectionVector = [
    -sineAltitude * sineAzimuth,
    -sineAltitude * cosineAzimuth,
    cosineAltitude,
  ];

  const separationRadians = Math.acos(referenceDotTarget);
  const eastComponent = dot(targetVector, increasingAzimuth);
  const altitudeComponent = dot(
    targetVector,
    increasingAltitude,
  );
  const tangentLength = Math.hypot(
    eastComponent,
    altitudeComponent,
  );
  if (tangentLength <= Number.EPSILON) {
    return {
      separationRadians,
      xRadians: 0,
      yRadians: 0,
    };
  }
  return {
    separationRadians,
    xRadians:
      separationRadians * (eastComponent / tangentLength),
    yRadians:
      separationRadians * (altitudeComponent / tangentLength),
  };
}

function projectAngularCircles(
  circles: readonly AngularCircle[],
): readonly EventSceneCircle[] {
  const minimumX = Math.min(
    ...circles.map(({ radius, x }) => x - radius),
  );
  const maximumX = Math.max(
    ...circles.map(({ radius, x }) => x + radius),
  );
  const minimumY = Math.min(
    ...circles.map(({ radius, y }) => y - radius),
  );
  const maximumY = Math.max(
    ...circles.map(({ radius, y }) => y + radius),
  );
  const angularWidth = maximumX - minimumX;
  const angularHeight = maximumY - minimumY;
  const availableWidth = DRAWING_BOUNDS.right - DRAWING_BOUNDS.left;
  const availableHeight =
    DRAWING_BOUNDS.bottom - DRAWING_BOUNDS.top;
  const scale = Math.min(
    availableWidth / angularWidth,
    availableHeight / angularHeight,
  );
  const angularCenterX = (minimumX + maximumX) / 2;
  const angularCenterY = (minimumY + maximumY) / 2;
  const drawingCenterX =
    (DRAWING_BOUNDS.left + DRAWING_BOUNDS.right) / 2;
  const drawingCenterY =
    (DRAWING_BOUNDS.top + DRAWING_BOUNDS.bottom) / 2;

  const svgNumber = (value: number) =>
    Math.round(value * 1_000) / 1_000;
  return circles.map(({ radius, x, y }) => ({
    radius: svgNumber(radius * scale),
    x: svgNumber(
      drawingCenterX + (x - angularCenterX) * scale,
    ),
    // SVG y increases downward, while angular y increases upward.
    y: svgNumber(
      drawingCenterY - (y - angularCenterY) * scale,
    ),
  }));
}

function projectAngularPointWithCircle(
  circle: AngularCircle,
  point: Point2,
): {
  readonly circle: EventSceneCircle;
  readonly point: Point2;
} {
  // Reserve a small angular marker envelope without changing the actual
  // point coordinate. This prevents a limb contact marker from clipping.
  const markerEnvelope = circle.radius * 0.09;
  const projected = projectAngularCircles([
    circle,
    {
      radius: markerEnvelope,
      x: point.x,
      y: point.y,
    },
  ]);
  const projectedCircle = projected[0] as EventSceneCircle;
  const projectedMarkerEnvelope = projected[1] as EventSceneCircle;
  return {
    circle: projectedCircle,
    point: {
      x: projectedMarkerEnvelope.x,
      y: projectedMarkerEnvelope.y,
    },
  };
}

function angularDistanceLabel(radians: number): string {
  const arcseconds = radians * (180 / Math.PI) * 3_600;
  return arcseconds < 60
    ? `${arcseconds.toFixed(1)}″`
    : `${(arcseconds / 60).toFixed(2)}′`;
}

function angularDiameterLabel(radiusRadians: number): string {
  return angularDistanceLabel(2 * radiusRadians);
}

function phaseLabel(
  circumstances: LocalCircumstances,
  sample: EventSceneSample,
): string {
  if (sample.label) {
    return sample.label;
  }
  switch (sample.phase) {
    case "solar-c1":
      return "部分食開始（C1）";
    case "solar-c2":
      return "中心食開始（C2）";
    case "solar-c3":
      return "中心食終了（C3）";
    case "solar-c4":
      return "部分食終了（C4）";
    case "lunar-p1":
      return "半影食開始（P1）";
    case "lunar-u1":
      return "部分食開始（U1）";
    case "lunar-u2":
      return "皆既食開始（U2）";
    case "lunar-u3":
      return "皆既食終了（U3）";
    case "lunar-u4":
      return "部分食終了（U4）";
    case "lunar-p4":
      return "半影食終了（P4）";
    case "occultation-disappearance":
      return "潜入";
    case "occultation-reappearance":
      return "出現";
    case "maximum":
    case undefined:
      return circumstances.event.kind === "lunar-occultation" ||
        circumstances.boundaryUncertaintyReason ===
          "occultation-occurrence" ||
        circumstances.boundaryUncertaintyReason === "solar-occurrence"
        ? "最接近"
        : "最大";
  }
}

function commonModel(
  circumstances: LocalCircumstances,
  sample: EventSceneSample,
): Pick<
  EventSceneCommon,
  "instantUtc" | "sampleLabel"
> {
  return {
    instantUtc: sample.instantUtc,
    sampleLabel: phaseLabel(circumstances, sample),
  };
}

function unavailableModel(
  circumstances: LocalCircumstances,
  sample: EventSceneSample,
  description: string,
): UnavailableEventSceneModel {
  return {
    ...commonModel(circumstances, sample),
    description,
    fidelity: "unavailable",
    kind: circumstances.event.kind,
    metrics: [],
    orientationNote: "相対方向は表示していません。",
    scaleNote:
      "不足する値を推測で補わず、数値が揃った時刻だけ相対配置を描画します。",
  };
}

function solarModel(
  circumstances: LocalCircumstances,
  sample: EventSceneSample,
): CalculatedSolarEventSceneModel | UnavailableEventSceneModel {
  const sun = sample.bodies.sun;
  const moon = sample.bodies.moon;
  const sunRadius = validAngularRadius(sun);
  const moonRadius = validAngularRadius(moon);
  if (!sun || !moon || sunRadius === null || moonRadius === null) {
    return unavailableModel(
      circumstances,
      sample,
      "この時刻には太陽・月の角半径と地平座標が揃っていないため、円盤配置を描画できません。",
    );
  }
  const offset = horizontalTangentOffset(
    sun.altitudeAzimuth,
    moon.altitudeAzimuth,
  );
  if (!offset) {
    return unavailableModel(
      circumstances,
      sample,
      "この時刻の局所方向基準を一意に定められないため、太陽と月の相対配置は表示していません。",
    );
  }

  const [projectedSun, projectedMoon] =
    projectAngularCircles([
      { radius: sunRadius, x: 0, y: 0 },
      {
        radius: moonRadius,
        x: offset.xRadians,
        y: offset.yRadians,
      },
    ]);
  return {
    ...commonModel(circumstances, sample),
    description:
      "太陽と月の中心間隔・角半径を、この地点から見た地平座標で比例表示しています。",
    fidelity: "calculated",
    kind: "solar-eclipse",
    metrics: [
      {
        label: "中心間隔",
        value: angularDistanceLabel(offset.separationRadians),
      },
      {
        label: "太陽の視直径",
        value: angularDiameterLabel(sunRadius),
      },
      {
        label: "月の視直径",
        value: angularDiameterLabel(moonRadius),
      },
    ],
    moon: projectedMoon as EventSceneCircle,
    orientationNote:
      "右は方位角が増える方向、上は高度が上がる方向です。",
    scaleNote:
      "円盤の大きさと中心間隔は同じ角度縮尺です。画面内に収めるため、時刻ごとに全体倍率は変わります。",
    sun: projectedSun as EventSceneCircle,
  };
}

function lunarShadowOffset(
  centerSeparationRadians: number,
  centerPositionAngleRadians: number | null,
): Point2 | null {
  if (
    !isFiniteNumber(centerSeparationRadians) ||
    centerSeparationRadians < 0
  ) {
    return null;
  }
  if (centerPositionAngleRadians === null) {
    return centerSeparationRadians <=
      DEGENERATE_DIRECTION_RADIANS
      ? { x: 0, y: 0 }
      : null;
  }
  if (!isFiniteNumber(centerPositionAngleRadians)) {
    return null;
  }
  return {
    x:
      Math.sin(centerPositionAngleRadians) *
      centerSeparationRadians,
    y:
      Math.cos(centerPositionAngleRadians) *
      centerSeparationRadians,
  };
}

function lunarModel(
  circumstances: LocalCircumstances,
  sample: EventSceneSample,
): CalculatedLunarEventSceneModel | SchematicLunarEventSceneModel {
  const moon = sample.bodies.moon;
  const moonRadius = validAngularRadius(moon);
  const shadow = sample.lunarShadow;
  const shadowOffset = shadow
    ? lunarShadowOffset(
        shadow.centerSeparationRadians,
        shadow.centerPositionAngleRadians,
      )
    : null;
  const validShadowRadii =
    shadow &&
    isFiniteNumber(shadow.penumbralAngularRadiusRadians) &&
    shadow.penumbralAngularRadiusRadians > 0 &&
    isFiniteNumber(shadow.umbralAngularRadiusRadians) &&
    shadow.umbralAngularRadiusRadians > 0 &&
    shadow.penumbralAngularRadiusRadians >=
      shadow.umbralAngularRadiusRadians;

  if (
    !moon ||
    moonRadius === null ||
    !shadow ||
    !shadowOffset ||
    !validShadowRadii
  ) {
    const magnitude =
      circumstances.magnitude === null
        ? []
        : [
            {
              label:
                circumstances.localClassification === "penumbral"
                  ? "半影食分"
                  : "本影食分",
              value: circumstances.magnitude.toFixed(3),
            },
          ];
    return {
      ...commonModel(circumstances, sample),
      description:
        "影中心・本影半径・半影半径の計算値がこの結果にはないため、局地分類だけを伝える概略図です。",
      fidelity: "schematic",
      kind: "lunar-eclipse",
      localClassification: circumstances.localClassification,
      metrics: magnitude,
      orientationNote:
        "月の位置・影との中心間隔・円の大きさは実際の値を表しません。",
      scaleNote:
        "過去形式の予報結果にも安全に対応するフォールバックです。新しい計算結果では角度比例の配置に切り替わります。",
    };
  }

  const [projectedMoon, projectedPenumbra, projectedUmbra] =
    projectAngularCircles([
      { radius: moonRadius, x: 0, y: 0 },
      {
        radius: shadow.penumbralAngularRadiusRadians,
        x: shadowOffset.x,
        y: shadowOffset.y,
      },
      {
        radius: shadow.umbralAngularRadiusRadians,
        x: shadowOffset.x,
        y: shadowOffset.y,
      },
    ]);
  return {
    ...commonModel(circumstances, sample),
    description:
      "月・地球本影・地球半影の角半径と影中心方向を、天球上の角度に比例して表示しています。",
    fidelity: "calculated",
    kind: "lunar-eclipse",
    metrics: [
      {
        label: "月と影の中心間隔",
        value: angularDistanceLabel(
          shadow.centerSeparationRadians,
        ),
      },
      {
        label: "本影の視直径",
        value: angularDiameterLabel(
          shadow.umbralAngularRadiusRadians,
        ),
      },
      {
        label: "半影の視直径",
        value: angularDiameterLabel(
          shadow.penumbralAngularRadiusRadians,
        ),
      },
    ],
    moon: projectedMoon as EventSceneCircle,
    orientationNote:
      "右は天の東、上は天の北です（CIRS接平面の位置角）。",
    penumbra: projectedPenumbra as EventSceneCircle,
    scaleNote:
      "月・本影・半影の大きさと中心間隔は同じ角度縮尺です。大気による影の濃淡や月面の明るさは予測していません。",
    umbra: projectedUmbra as EventSceneCircle,
  };
}

function occultationModel(
  circumstances: LocalCircumstances,
  sample: EventSceneSample,
):
  | CalculatedOccultationEventSceneModel
  | UnavailableEventSceneModel {
  const moon = sample.bodies.moon;
  const target = sample.bodies.target;
  const moonRadius = validAngularRadius(moon);
  if (!moon || !target || moonRadius === null) {
    return unavailableModel(
      circumstances,
      sample,
      "この時刻には月の角半径と対象星の地平座標が揃っていないため、掩蔽配置を描画できません。",
    );
  }
  const offset = horizontalTangentOffset(
    moon.altitudeAzimuth,
    target.altitudeAzimuth,
  );
  if (!offset) {
    return unavailableModel(
      circumstances,
      sample,
      "この時刻の局所方向基準を一意に定められないため、月と対象星の相対配置は表示していません。",
    );
  }
  const projection = projectAngularPointWithCircle(
    { radius: moonRadius, x: 0, y: 0 },
    { x: offset.xRadians, y: offset.yRadians },
  );
  const targetIsBehindMoon =
    offset.separationRadians <= moonRadius;
  return {
    ...commonModel(circumstances, sample),
    description: targetIsBehindMoon
      ? "対象星の計算位置は月の平均円盤内です。星は月の手前ではなく、破線の照準で月面裏の位置を示します。"
      : "月の角半径と対象星までの角距離を、この地点から見た地平座標で比例表示しています。",
    fidelity: "calculated",
    kind: "lunar-occultation",
    metrics: [
      {
        label: "月中心から対象星",
        value: angularDistanceLabel(offset.separationRadians),
      },
      {
        label: "月半径比",
        value: (offset.separationRadians / moonRadius).toFixed(3),
      },
      {
        label: "月の視直径",
        value: angularDiameterLabel(moonRadius),
      },
    ],
    moon: projection.circle,
    orientationNote:
      "右は方位角が増える方向、上は高度が上がる方向です。",
    scaleNote:
      "月円盤と中心から対象星までの距離は同じ角度縮尺です。月縁は平均球面で、山谷の輪郭は含みません。",
    target: projection.point,
    targetIsBehindMoon,
  };
}

export function createEventSceneModel(
  circumstances: LocalCircumstances,
  selectedSample?: EventSceneSample | null,
): EventSceneModel {
  const sample = selectedSample ?? circumstances.maximum;
  if (
    !Number.isFinite(sample.instantUtc.getTime()) ||
    sample.bodies === null ||
    typeof sample.bodies !== "object"
  ) {
    return unavailableModel(
      circumstances,
      circumstances.maximum,
      "選択時刻の配置データを読み取れませんでした。",
    );
  }
  switch (circumstances.event.kind) {
    case "solar-eclipse":
      return solarModel(circumstances, sample);
    case "lunar-eclipse":
      return lunarModel(circumstances, sample);
    case "lunar-occultation":
      return occultationModel(circumstances, sample);
  }
}
