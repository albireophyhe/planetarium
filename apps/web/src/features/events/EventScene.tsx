import { memo, useId, useMemo } from "react";
import type { LocalCircumstances } from "../../domain/events/types";
import {
  createEventSceneProjection,
  createEventSceneModel,
  EVENT_SCENE_VIEWBOX,
  type CalculatedLunarEventSceneModel,
  type CalculatedOccultationEventSceneModel,
  type CalculatedSolarEventSceneModel,
  type EventSceneModel,
  type EventSceneSample,
  type SchematicLunarEventSceneModel,
} from "./EventSceneModel";
import "./EventScene.css";

export type EventSceneProps = {
  readonly circumstances: LocalCircumstances;
  /**
   * Optional physical sample grid used only to choose a fixed angular extent.
   * Coordinates are still calculated per sample; no screen-space interpolation
   * is performed. Defaults to every solved contact plus maximum.
   */
  readonly projectionSamples?: readonly EventSceneSample[];
  /**
   * Optional geometry sample for a selected contact or an independently
   * calculated instant. When omitted, the forecast maximum/closest approach
   * sample is displayed. EventContact is structurally compatible.
   */
  readonly sample?: EventSceneSample | null;
};

const sceneTimeFormatters = new Map<
  string,
  Intl.DateTimeFormat
>();

function formatSceneTime(date: Date, timeZone: string): string {
  let formatter = sceneTimeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(
      "ja-JP-u-ca-gregory",
      {
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        month: "2-digit",
        second: "2-digit",
        timeZone,
        year: "numeric",
      },
    );
    sceneTimeFormatters.set(timeZone, formatter);
  }
  return formatter.format(date);
}

function modelFidelityLabel(model: EventSceneModel): string {
  switch (model.fidelity) {
    case "calculated":
      return "角度比例";
    case "schematic":
      return "概略表示";
    case "unavailable":
      return "配置データ不足";
  }
}

function SunDisc({
  model,
  gradientId,
}: {
  model: CalculatedSolarEventSceneModel;
  gradientId: string;
}) {
  return (
    <>
      <circle
        className="event-scene__sun-halo"
        cx={model.sun.x}
        cy={model.sun.y}
        data-body="sun-halo"
        r={model.sun.radius * 1.12}
      />
      <circle
        className="event-scene__sun"
        cx={model.sun.x}
        cy={model.sun.y}
        data-body="sun"
        fill={`url(#${gradientId})`}
        r={model.sun.radius}
      />
    </>
  );
}

function MoonDisc({
  circle,
  gradientId,
}: {
  circle: { readonly radius: number; readonly x: number; readonly y: number };
  gradientId: string;
}) {
  return (
    <circle
      className="event-scene__moon"
      cx={circle.x}
      cy={circle.y}
      data-body="moon"
      fill={`url(#${gradientId})`}
      r={circle.radius}
    />
  );
}

function SolarScene({
  model,
  moonGradientId,
  sunGradientId,
}: {
  model: CalculatedSolarEventSceneModel;
  moonGradientId: string;
  sunGradientId: string;
}) {
  return (
    <>
      <SunDisc gradientId={sunGradientId} model={model} />
      <MoonDisc
        circle={model.moon}
        gradientId={moonGradientId}
      />
      <circle
        className="event-scene__limb"
        cx={model.moon.x}
        cy={model.moon.y}
        r={model.moon.radius}
      />
    </>
  );
}

function LunarScene({
  clipId,
  model,
  moonGradientId,
}: {
  clipId: string;
  model: CalculatedLunarEventSceneModel;
  moonGradientId: string;
}) {
  return (
    <>
      <circle
        className="event-scene__penumbra"
        cx={model.penumbra.x}
        cy={model.penumbra.y}
        data-body="penumbra"
        r={model.penumbra.radius}
      />
      <circle
        className="event-scene__umbra"
        cx={model.umbra.x}
        cy={model.umbra.y}
        data-body="umbra"
        r={model.umbra.radius}
      />
      <MoonDisc
        circle={model.moon}
        gradientId={moonGradientId}
      />
      <g clipPath={`url(#${clipId})`}>
        <circle
          className="event-scene__penumbra-on-moon"
          cx={model.penumbra.x}
          cy={model.penumbra.y}
          r={model.penumbra.radius}
        />
        <circle
          className="event-scene__umbra-on-moon"
          cx={model.umbra.x}
          cy={model.umbra.y}
          r={model.umbra.radius}
        />
      </g>
      <circle
        className="event-scene__limb"
        cx={model.moon.x}
        cy={model.moon.y}
        r={model.moon.radius}
      />
      <circle
        className="event-scene__shadow-center"
        cx={model.umbra.x}
        cy={model.umbra.y}
        r={2.4}
      />
    </>
  );
}

function StarMarker({
  hidden,
  x,
  y,
}: {
  hidden: boolean;
  x: number;
  y: number;
}) {
  return (
    <g
      className={
        hidden
          ? "event-scene__star event-scene__star--hidden"
          : "event-scene__star"
      }
      data-body="target"
      transform={`translate(${x} ${y})`}
    >
      <circle r={hidden ? 5 : 4} />
      <path d="M -13 0 H 13 M 0 -13 V 13" />
      <path d="M -7 -7 L 7 7 M -7 7 L 7 -7" />
    </g>
  );
}

function OccultationScene({
  model,
  moonGradientId,
}: {
  model: CalculatedOccultationEventSceneModel;
  moonGradientId: string;
}) {
  return (
    <>
      <StarMarker
        hidden={model.targetIsBehindMoon}
        x={model.target.x}
        y={model.target.y}
      />
      <MoonDisc
        circle={model.moon}
        gradientId={moonGradientId}
      />
      <circle
        className="event-scene__limb"
        cx={model.moon.x}
        cy={model.moon.y}
        r={model.moon.radius}
      />
      {model.targetIsBehindMoon ? (
        <StarMarker
          hidden
          x={model.target.x}
          y={model.target.y}
        />
      ) : null}
    </>
  );
}

function schematicMoonX(
  classification: SchematicLunarEventSceneModel["localClassification"],
): number {
  switch (classification) {
    case "total":
      return 280;
    case "partial":
      return 329;
    case "penumbral":
      return 388;
    default:
      return 388;
  }
}

function SchematicLunarScene({
  model,
  moonGradientId,
}: {
  model: SchematicLunarEventSceneModel;
  moonGradientId: string;
}) {
  const moonX = schematicMoonX(model.localClassification);
  return (
    <g className="event-scene__schematic">
      <circle
        className="event-scene__penumbra"
        cx={280}
        cy={127}
        data-body="penumbra"
        r={96}
      />
      <circle
        className="event-scene__umbra"
        cx={280}
        cy={127}
        data-body="umbra"
        r={55}
      />
      <MoonDisc
        circle={{ radius: 29, x: moonX, y: 127 }}
        gradientId={moonGradientId}
      />
      <circle
        className="event-scene__limb"
        cx={moonX}
        cy={127}
        r={29}
      />
      <path
        className="event-scene__schematic-mark"
        d="M 112 221 H 448"
      />
      <text
        className="event-scene__schematic-label"
        textAnchor="middle"
        x={280}
        y={249}
      >
        配置・縮尺は概略
      </text>
    </g>
  );
}

function UnavailableScene() {
  return (
    <g className="event-scene__unavailable" aria-hidden="true">
      <circle cx={280} cy={126} r={72} />
      <path d="M 244 126 H 316 M 280 90 V 162" />
      <text textAnchor="middle" x={280} y={229}>
        数値が揃った時刻に表示します
      </text>
    </g>
  );
}

function SceneArtwork({
  clipId,
  model,
  moonGradientId,
  sunGradientId,
}: {
  clipId: string;
  model: EventSceneModel;
  moonGradientId: string;
  sunGradientId: string;
}) {
  if (model.fidelity === "unavailable") {
    return <UnavailableScene />;
  }
  if (model.fidelity === "schematic") {
    return (
      <SchematicLunarScene
        model={model}
        moonGradientId={moonGradientId}
      />
    );
  }
  switch (model.kind) {
    case "solar-eclipse":
      return (
        <SolarScene
          model={model}
          moonGradientId={moonGradientId}
          sunGradientId={sunGradientId}
        />
      );
    case "lunar-eclipse":
      return (
        <LunarScene
          clipId={clipId}
          model={model}
          moonGradientId={moonGradientId}
        />
      );
    case "lunar-occultation":
      return (
        <OccultationScene
          model={model}
          moonGradientId={moonGradientId}
        />
      );
  }
}

function sceneLegend(model: EventSceneModel) {
  if (model.fidelity === "unavailable") {
    return null;
  }
  if (model.kind === "solar-eclipse") {
    return (
      <ul aria-label="図の凡例" className="event-scene__legend">
        <li>
          <span className="event-scene__swatch event-scene__swatch--sun" />
          太陽
        </li>
        <li>
          <span className="event-scene__swatch event-scene__swatch--moon" />
          月
        </li>
      </ul>
    );
  }
  if (model.kind === "lunar-eclipse") {
    return (
      <ul aria-label="図の凡例" className="event-scene__legend">
        <li>
          <span className="event-scene__swatch event-scene__swatch--moon" />
          月
        </li>
        <li>
          <span className="event-scene__swatch event-scene__swatch--umbra" />
          地球本影
        </li>
        <li>
          <span className="event-scene__swatch event-scene__swatch--penumbra" />
          地球半影
        </li>
      </ul>
    );
  }
  return (
    <ul aria-label="図の凡例" className="event-scene__legend">
      <li>
        <span className="event-scene__swatch event-scene__swatch--moon" />
        月
      </li>
      <li>
        <span className="event-scene__swatch event-scene__swatch--star" />
        対象星
      </li>
    </ul>
  );
}

export const EventScene = memo(function EventScene({
  circumstances,
  projectionSamples,
  sample,
}: EventSceneProps) {
  const titleId = useId();
  const descriptionId = useId();
  const svgTitleId = useId();
  const svgDescriptionId = useId();
  const paintId = useId().replaceAll(":", "");
  const projection = useMemo(
    () =>
      createEventSceneProjection(
        circumstances,
        projectionSamples,
      ),
    [circumstances, projectionSamples],
  );
  const model = useMemo(
    () =>
      createEventSceneModel(
        circumstances,
        sample,
        projection,
      ),
    [circumstances, projection, sample],
  );
  const moonGradientId = `event-scene-moon-${paintId}`;
  const sunGradientId = `event-scene-sun-${paintId}`;
  const moonClipId = `event-scene-clip-${paintId}`;
  const sceneTitle = `${circumstances.event.title}、${model.sampleLabel}の相対配置`;

  return (
    <figure
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className={`event-scene event-scene--${model.fidelity}`}
    >
      <header className="event-scene__header">
        <div>
          <h3 id={titleId}>相対配置</h3>
          <p>
            <time dateTime={model.instantUtc.toISOString()}>
              {formatSceneTime(
                model.instantUtc,
                circumstances.observer.timeZone,
              )}
            </time>
            <span aria-hidden="true"> · </span>
            {model.sampleLabel}
          </p>
        </div>
        <strong className="event-scene__fidelity">
          {modelFidelityLabel(model)}
        </strong>
      </header>

      <div className="event-scene__viewport">
        <svg
          aria-describedby={svgDescriptionId}
          aria-labelledby={svgTitleId}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          viewBox={`0 0 ${EVENT_SCENE_VIEWBOX.width} ${EVENT_SCENE_VIEWBOX.height}`}
        >
          <title id={svgTitleId}>{sceneTitle}</title>
          <desc id={svgDescriptionId}>
            {model.description} {model.orientationNote}
          </desc>
          <defs>
            <radialGradient
              cx="38%"
              cy="34%"
              id={sunGradientId}
              r="65%"
            >
              <stop className="event-scene__sun-core" offset="0%" />
              <stop className="event-scene__sun-edge" offset="100%" />
            </radialGradient>
            <radialGradient
              cx="34%"
              cy="30%"
              id={moonGradientId}
              r="72%"
            >
              <stop className="event-scene__moon-light" offset="0%" />
              <stop className="event-scene__moon-dark" offset="100%" />
            </radialGradient>
            {model.fidelity === "calculated" &&
            model.kind === "lunar-eclipse" ? (
              <clipPath id={moonClipId}>
                <circle
                  cx={model.moon.x}
                  cy={model.moon.y}
                  r={model.moon.radius}
                />
              </clipPath>
            ) : null}
          </defs>
          <SceneArtwork
            clipId={moonClipId}
            model={model}
            moonGradientId={moonGradientId}
            sunGradientId={sunGradientId}
          />
        </svg>
      </div>

      <figcaption id={descriptionId}>
        <div className="event-scene__summary">
          <p>{model.description}</p>
          {sceneLegend(model)}
        </div>
        {model.metrics.length > 0 ? (
          <dl className="event-scene__metrics">
            {model.metrics.map((metric) => (
              <div key={metric.label}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="event-scene__orientation">
          {model.orientationNote}
        </p>
        <p className="event-scene__scale-note">{model.scaleNote}</p>
      </figcaption>
    </figure>
  );
});
