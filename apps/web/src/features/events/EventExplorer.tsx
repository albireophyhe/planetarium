import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  Clock3Icon,
  EyeIcon,
  EyeOffIcon,
  MapPinIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  RefreshCcwIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  SunIcon,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  EventBoundaryUncertaintyReason,
  EventBodyPosition,
  EventClassification,
  EventContact,
  EventContactPhase,
  EventEarthOrientationQuality,
  EventKind,
  EventPhysicalSample,
  EventSummary,
  EventVisibility,
  LocalCircumstances,
} from "../../domain/events/types";
import { EventScene } from "./EventScene";
import {
  clampEventSceneInstant,
  type EventSceneSamplingSession,
  type EventSceneSamplingState,
} from "./EventSceneSamplingSession";

export type EventExplorerStatus =
  | "loading"
  | "error"
  | "empty"
  | "ready";

export type EventExplorerProps = {
  status: EventExplorerStatus;
  isActive?: boolean;
  events: readonly EventSummary[];
  localClassificationsByEventId: ReadonlyMap<
    string,
    EventClassification
  >;
  boundaryUncertaintyReasonsByEventId: ReadonlyMap<
    string,
    EventBoundaryUncertaintyReason
  >;
  selectedEventId: string | null;
  selectedCircumstances: LocalCircumstances | null;
  timeZone: string;
  errorMessage?: string;
  emptyMessage?: string;
  emptyTitle?: string;
  canRestoreObservationTime?: boolean;
  observationDate?: Date | null;
  sceneSampling?: EventSceneSamplingState;
  onSelectEvent: (eventId: string) => void;
  onRetry: () => void;
  onGoToMaximum: (contact: EventContact) => void;
  onGoToContact: (sample: { readonly instantUtc: Date }) => void;
  onRestoreObservationTime: () => void;
  onRetrySceneSampling?: () => void;
};

const UNAVAILABLE_EVENT_SCENE_SAMPLING = Object.freeze({
  session: null,
  status: "unavailable",
} as const satisfies EventSceneSamplingState);
const EVENT_SCENE_PLAYBACK_INTERVAL_MILLISECONDS = 100;
const EVENT_SCENE_PLAYBACK_DURATION_MILLISECONDS = 24_000;
const DATE_TIME_FORMATTER_CACHE_CAPACITY = 16;
const dateTimeFormatters = new Map<
  string,
  Intl.DateTimeFormat
>();

const DATE_TIME_PARTS = [
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
] as const;

const CONTACT_LABELS: Record<EventContactPhase, string> = {
  "solar-c1": "部分食開始（C1）",
  "solar-c2": "皆既・金環食開始（C2）",
  maximum: "最大",
  "solar-c3": "皆既・金環食終了（C3）",
  "solar-c4": "部分食終了（C4）",
  "lunar-p1": "半影食開始（P1）",
  "lunar-u1": "部分食開始（U1）",
  "lunar-u2": "皆既食開始（U2）",
  "lunar-u3": "皆既食終了（U3）",
  "lunar-u4": "部分食終了（U4）",
  "lunar-p4": "半影食終了（P4）",
  "occultation-disappearance": "潜入",
  "occultation-reappearance": "出現",
};

type CalculatedEventPhase = {
  readonly id: string;
  readonly sample: EventContact;
};

type EventScenePhysicalSelection = {
  readonly sample: EventPhysicalSample;
  readonly session: EventSceneSamplingSession;
};

type EventSceneSamplingError = {
  readonly message: string;
  readonly session: EventSceneSamplingSession;
};

type PendingEventSceneSample = {
  readonly instantMilliseconds: number;
  readonly session: EventSceneSamplingSession;
};

type EventScenePlaybackClock = {
  readonly sceneStartMilliseconds: number;
  readonly session: EventSceneSamplingSession;
  readonly wallStartMilliseconds: number;
};

function eventPhaseId(contact: EventContact) {
  return `${contact.phase}:${contact.instantUtc.getTime()}`;
}

function calculatedEventPhases(
  circumstances: LocalCircumstances,
): readonly CalculatedEventPhase[] {
  const uniquePhases = new Map<string, EventContact>();
  for (const contact of [
    ...circumstances.contacts,
    circumstances.maximum,
  ]) {
    uniquePhases.set(eventPhaseId(contact), contact);
  }
  return [...uniquePhases.entries()]
    .map(([id, sample]) => ({ id, sample }))
    .sort(
      (left, right) =>
        left.sample.instantUtc.getTime() -
        right.sample.instantUtc.getTime(),
    );
}

function dateTimeParts(date: Date, timeZone: string) {
  let formatter = dateTimeFormatters.get(timeZone);
  if (formatter) {
    dateTimeFormatters.delete(timeZone);
    dateTimeFormatters.set(timeZone, formatter);
  } else {
    formatter = new Intl.DateTimeFormat("ja-JP-u-ca-gregory", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone,
      year: "numeric",
    });
    dateTimeFormatters.set(timeZone, formatter);
    if (
      dateTimeFormatters.size >
      DATE_TIME_FORMATTER_CACHE_CAPACITY
    ) {
      const oldestTimeZone =
        dateTimeFormatters.keys().next().value;
      if (oldestTimeZone !== undefined) {
        dateTimeFormatters.delete(oldestTimeZone);
      }
    }
  }
  const resolved = new Map(
    formatter
      .formatToParts(date)
      .filter((part) =>
        DATE_TIME_PARTS.includes(
          part.type as (typeof DATE_TIME_PARTS)[number],
        ),
      )
      .map((part) => [part.type, part.value]),
  );
  return {
    day: resolved.get("day") ?? "--",
    hour: resolved.get("hour") ?? "--",
    minute: resolved.get("minute") ?? "--",
    month: resolved.get("month") ?? "--",
    second: resolved.get("second") ?? "--",
    year: resolved.get("year") ?? "----",
  };
}

function formatDateTime(date: Date, timeZone: string) {
  const parts = dateTimeParts(date, timeZone);
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatListDate(date: Date, timeZone: string) {
  const parts = dateTimeParts(date, timeZone);
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatUtcDateTime(date: Date) {
  return `${formatDateTime(date, "UTC")} UTC`;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] =
    useState(
      () =>
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches,
    );
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mediaQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    mediaQuery.addEventListener?.("change", handleChange);
    return () =>
      mediaQuery.removeEventListener?.("change", handleChange);
  }, []);
  return prefersReducedMotion;
}

function matchingSceneSamplingSession(
  sceneSampling: EventSceneSamplingState,
  circumstances: LocalCircumstances,
): EventSceneSamplingSession | null {
  if (sceneSampling.status !== "ready") {
    return null;
  }
  const { session } = sceneSampling;
  return session.eventId === circumstances.event.id &&
    session.kind === circumstances.event.kind &&
    session.targetStarHR ===
      circumstances.event.targetStarHR &&
    Number.isFinite(session.rangeUtc.startMilliseconds) &&
    Number.isFinite(session.rangeUtc.endMilliseconds) &&
    session.rangeUtc.endMilliseconds >
      session.rangeUtc.startMilliseconds &&
    session.projectionSamples.length >= 2
    ? session
    : null;
}

function samplePhysicalSceneAt(
  session: EventSceneSamplingSession,
  requestedMilliseconds: number,
): EventPhysicalSample {
  const instantMilliseconds = clampEventSceneInstant(
    requestedMilliseconds,
    session.rangeUtc,
  );
  const sample = session.sampleAt(new Date(instantMilliseconds));
  if (
    !(sample.instantUtc instanceof Date) ||
    sample.instantUtc.getTime() !== instantMilliseconds ||
    sample.bodies === null ||
    typeof sample.bodies !== "object"
  ) {
    throw new RangeError(
      "Event-scene sampler returned an inconsistent physical sample",
    );
  }
  return sample;
}

function eventClassificationLabel(
  event: EventSummary,
  classification: EventClassification = event.globalClassification,
) {
  switch (event.kind) {
    case "solar-eclipse":
      switch (classification) {
        case "partial":
          return "部分日食";
        case "annular":
          return "金環日食";
        case "total":
          return "皆既日食";
        case "hybrid":
          return "金環皆既日食";
        default:
          return "日食";
      }
    case "lunar-eclipse":
      switch (classification) {
        case "penumbral":
          return "半影月食";
        case "partial":
          return "部分月食";
        case "total":
          return "皆既月食";
        default:
          return "月食";
      }
    case "lunar-occultation":
      return "月による恒星掩蔽";
  }
}

function eventTitleForClassification(
  event: EventSummary,
  classification: EventClassification,
) {
  if (
    event.kind === "lunar-occultation" ||
    classification === event.globalClassification
  ) {
    return event.title;
  }
  const globalLabel = eventClassificationLabel(
    event,
    event.globalClassification,
  );
  const localLabel = eventClassificationLabel(event, classification);
  return event.title.includes(globalLabel)
    ? event.title.replace(globalLabel, localLabel)
    : localLabel;
}

function isOccurrenceUncertain(
  reason: EventBoundaryUncertaintyReason | null,
): boolean {
  return (
    reason === "solar-occurrence" ||
    reason === "occultation-occurrence"
  );
}

function eventTitleForPresentation(
  event: EventSummary,
  classification: EventClassification,
  boundaryReason: EventBoundaryUncertaintyReason | null,
): string {
  const classifiedTitle = eventTitleForClassification(
    event,
    classification,
  );
  if (boundaryReason === "solar-occurrence") {
    const classificationLabel = eventClassificationLabel(
      event,
      classification,
    );
    const candidateLabel = "日食候補（発生未確定）";
    return classifiedTitle.includes(classificationLabel)
      ? classifiedTitle.replace(classificationLabel, candidateLabel)
      : `${classifiedTitle} ${candidateLabel}`;
  }
  if (boundaryReason === "occultation-occurrence") {
    return classifiedTitle.includes("の掩蔽")
      ? classifiedTitle.replace(
          "の掩蔽",
          "の掩蔽候補（発生未確定）",
        )
      : `${classifiedTitle}（発生未確定の候補）`;
  }
  return classifiedTitle;
}

function eventPresentationClassification(
  event: EventSummary,
  classification: EventClassification,
  boundaryReason: EventBoundaryUncertaintyReason | null,
): string {
  if (boundaryReason === "solar-occurrence") {
    return "日食候補";
  }
  if (boundaryReason === "occultation-occurrence") {
    return "恒星掩蔽候補";
  }
  return eventClassificationLabel(event, classification);
}

function boundaryUncertaintyMessage(
  circumstances: LocalCircumstances,
): string | null {
  switch (circumstances.boundaryUncertaintyReason) {
    case "solar-occurrence":
      return "物理境界帯内のため、この地点で日食が起きるかは未確定です。";
    case "solar-central-classification":
      return "中心食の物理境界帯内です。日食は起きますが、中心食（皆既・金環）になるかと第2・第3接触は未確定です。";
    case "occultation-occurrence":
      return "平均月縁の物理境界帯内のため、この地点で掩蔽が起きるかは未確定です。";
    case null:
      return circumstances.boundaryUncertain
        ? "物理境界帯内のため、現象の判定に不確実性があります。"
        : null;
  }
}

function usesClosestApproachLabel(
  circumstances: LocalCircumstances,
): boolean {
  return circumstances.event.kind === "lunar-occultation";
}

function contactLabel(
  circumstances: LocalCircumstances,
  phase: EventContactPhase,
): string {
  return phase === "maximum" &&
    usesClosestApproachLabel(circumstances)
    ? "最接近"
    : CONTACT_LABELS[phase];
}

function eventIcon(kind: EventKind, size = 19): ReactNode {
  if (kind === "solar-eclipse") {
    return <SunIcon aria-hidden="true" size={size} strokeWidth={1.8} />;
  }
  return <MoonIcon aria-hidden="true" size={size} strokeWidth={1.8} />;
}

function visibilityLabel(visibility: EventVisibility) {
  switch (visibility) {
    case "fully-visible":
      return "全経過が地平線上です";
    case "partly-visible":
      return "一部の経過だけが地平線上です";
    case "below-horizon":
      return "全経過が地平線下です";
    case "not-local":
      return "この地点では現象が成立しません";
  }
}

function calculationTierLabel(
  tier: LocalCircumstances["uncertainty"]["tier"],
) {
  switch (tier) {
    case "normal":
      return "通常";
    case "uncertain":
      return "不確実性あり";
    case "reference":
      return "参考計算";
  }
}

function earthOrientationQualityLabel(
  quality: EventEarthOrientationQuality,
): string {
  switch (quality) {
    case "observed":
      return "観測値";
    case "predicted":
      return "予測値";
    case "mixed":
      return "観測・予測混在";
    case "outside-coverage":
      return "収録外";
  }
}

function locationSourceLabel(
  source: LocalCircumstances["observer"]["locationSource"],
) {
  switch (source) {
    case "bundled-city":
      return "都市プリセット";
    case "manual":
      return "手入力";
    case "device-geolocation":
      return "端末の現在地";
  }
}

function radiansToDegrees(value: number) {
  return value * (180 / Math.PI);
}

function formatSignedDegrees(value: number) {
  const degrees = radiansToDegrees(value);
  if (Math.abs(degrees) < 0.05) {
    return "0.0°";
  }
  return `${degrees > 0 ? "+" : "−"}${Math.abs(degrees).toFixed(1)}°`;
}

function formatAzimuthDegrees(
  position: EventBodyPosition,
): string {
  if (!position.altitudeAzimuth.azimuthDefined) {
    return "方位未定義";
  }
  const degrees =
    ((radiansToDegrees(position.altitudeAzimuth.azimuth) % 360) +
      360) %
    360;
  return `方位 ${degrees.toFixed(1)}°`;
}

function formatBodyDirection(position: EventBodyPosition): string {
  return `高度 ${formatSignedDegrees(position.altitudeAzimuth.altitude)}・${formatAzimuthDegrees(position)}`;
}

function formatPositionAngle(value: number | null) {
  if (value === null) {
    return null;
  }
  const normalized = ((radiansToDegrees(value) % 360) + 360) % 360;
  return `位置角 ${normalized.toFixed(1)}°`;
}

function primaryBodyPosition(
  circumstances: LocalCircumstances,
  contact: EventContact,
) {
  if (circumstances.event.kind === "solar-eclipse") {
    return contact.bodies.sun ?? contact.bodies.moon ?? null;
  }
  return contact.bodies.moon ?? contact.bodies.target ?? null;
}

function formatOptionalNumber(
  value: number | null,
  suffix: string,
  fractionDigits: number,
) {
  return value === null
    ? "未評価"
    : `±${value.toFixed(fractionDigits)}${suffix}`;
}

function observerSummary(circumstances: LocalCircumstances) {
  const { observer } = circumstances;
  const accuracy =
    observer.horizontalAccuracyMeters === null
      ? "水平精度は未指定"
      : `水平精度 ±${observer.horizontalAccuracyMeters.toFixed(0)} m`;
  return `${observer.name ?? "観測地点"}・${locationSourceLabel(observer.locationSource)}・${accuracy}・標高 ${observer.heightMeters.toFixed(0)} m`;
}

function magnitudeLabel(
  circumstances: LocalCircumstances,
): string {
  if (circumstances.event.kind !== "lunar-eclipse") {
    return "食分";
  }
  return circumstances.localClassification === "penumbral"
    ? "半影食分"
    : "本影食分";
}

function EventList({
  boundaryUncertaintyReasonsByEventId,
  events,
  localClassificationsByEventId,
  onSelectEvent,
  resultsSummaryId,
  selectedEventId,
  timeZone,
}: Pick<
  EventExplorerProps,
  | "events"
  | "boundaryUncertaintyReasonsByEventId"
  | "localClassificationsByEventId"
  | "onSelectEvent"
  | "selectedEventId"
  | "timeZone"
> & {
  resultsSummaryId: string;
}) {
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const selectedIndex = events.findIndex(
    (event) => event.id === selectedEventId,
  );

  function handleKeyDown(
    keyboardEvent: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number;
    switch (keyboardEvent.key) {
      case "ArrowDown":
        nextIndex = Math.min(index + 1, events.length - 1);
        break;
      case "ArrowUp":
        nextIndex = Math.max(index - 1, 0);
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = events.length - 1;
        break;
      default:
        return;
    }
    keyboardEvent.preventDefault();
    const nextEvent = events[nextIndex];
    if (!nextEvent) {
      return;
    }
    onSelectEvent(nextEvent.id);
    optionRefs.current.get(nextEvent.id)?.focus();
  }

  return (
    <div
      aria-describedby={resultsSummaryId}
      aria-label="天文現象"
      className="event-list"
      role="listbox"
    >
      {events.map((event, index) => {
        const isSelected = event.id === selectedEventId;
        const localClassification =
          localClassificationsByEventId.get(event.id) ??
          event.globalClassification;
        const boundaryReason =
          boundaryUncertaintyReasonsByEventId.get(event.id) ?? null;
        const displayTitle = eventTitleForPresentation(
          event,
          localClassification,
          boundaryReason,
        );
        const displayClassification =
          eventPresentationClassification(
          event,
          localClassification,
          boundaryReason,
        );
        const accessibleClassification = displayTitle.includes(
          displayClassification,
        )
          ? ""
          : `、${displayClassification}`;
        return (
          <button
            aria-label={`${displayTitle}${accessibleClassification}、${formatListDate(event.canonicalEpochUtc, timeZone)}`}
            aria-posinset={index + 1}
            aria-selected={isSelected}
            aria-setsize={events.length}
            className="event-row"
            key={event.id}
            onClick={() => onSelectEvent(event.id)}
            onKeyDown={(keyboardEvent) =>
              handleKeyDown(keyboardEvent, index)
            }
            ref={(node) => {
              if (node) {
                optionRefs.current.set(event.id, node);
              } else {
                optionRefs.current.delete(event.id);
              }
            }}
            role="option"
            tabIndex={
              isSelected || (selectedIndex === -1 && index === 0) ? 0 : -1
            }
            type="button"
          >
            <span className="event-row__icon">
              {eventIcon(event.kind)}
            </span>
            <span className="event-row__copy">
              <strong>{displayTitle}</strong>
              <span>{displayClassification}</span>
            </span>
            <time
              className="event-row__date"
              dateTime={event.canonicalEpochUtc.toISOString()}
            >
              {formatListDate(event.canonicalEpochUtc, timeZone)}
            </time>
            <ChevronRightIcon
              aria-hidden="true"
              className="event-row__chevron"
              size={17}
              strokeWidth={1.8}
            />
          </button>
        );
      })}
    </div>
  );
}

function ContactTable({
  circumstances,
  onGoToContact,
  timeZone,
}: {
  circumstances: LocalCircumstances;
  onGoToContact: (contact: EventContact) => void;
  timeZone: string;
}) {
  const usesFutureUtcScenario =
    circumstances.provenance.deltaTModel.includes(
      "anchored-to-IERS",
    );
  const hasPositionAngles = circumstances.contacts.some(
    ({ positionAngleRadians }) =>
      positionAngleRadians !== null,
  );
  const occurrenceUncertain = isOccurrenceUncertain(
    circumstances.boundaryUncertaintyReason,
  );
  const positionAngleReference =
    circumstances.event.kind === "solar-eclipse"
      ? "太陽円盤中心"
      : "月円盤中心";
  return (
    <div className="event-contact-table-frame">
      {usesFutureUtcScenario ? (
        <p className="event-contact-table__time-scale">
          時刻基準：連続UTCシナリオ（TAI−UTC=37秒固定）
        </p>
      ) : null}
      <table className="event-contact-table">
        <caption>
          {occurrenceUncertain
            ? `${contactLabel(circumstances, "maximum")}時刻`
            : "接触時刻"}
        </caption>
        <thead>
          <tr>
            <th scope="col">現象</th>
            <th scope="col">現地</th>
            <th scope="col">UTC</th>
            <th scope="col">地平線・方向</th>
            <th scope="col">
              <span className="sr-only">星図操作</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {circumstances.contacts.map((contact) => {
            const phaseLabel = contactLabel(
              circumstances,
              contact.phase,
            );
            const positionAngle = formatPositionAngle(
              contact.positionAngleRadians,
            );
            const position = primaryBodyPosition(
              circumstances,
              contact,
            );
            return (
              <tr
                key={`${contact.phase}-${contact.instantUtc.toISOString()}`}
              >
                <th className="event-contact-table__phase" scope="row">
                  <span>{phaseLabel}</span>
                  {positionAngle ? <small>{positionAngle}</small> : null}
                </th>
                <td className="event-contact-table__local">
                  <time dateTime={contact.instantUtc.toISOString()}>
                    {formatDateTime(contact.instantUtc, timeZone)}
                  </time>
                </td>
                <td className="event-contact-table__utc">
                  <time dateTime={contact.instantUtc.toISOString()}>
                    {formatUtcDateTime(contact.instantUtc)}
                  </time>
                </td>
                <td className="event-contact-table__horizon">
                  {contact.aboveHorizon ? (
                    <EyeIcon
                      aria-hidden="true"
                      size={15}
                      strokeWidth={1.8}
                    />
                  ) : (
                    <EyeOffIcon
                      aria-hidden="true"
                      size={15}
                      strokeWidth={1.8}
                    />
                  )}
                  <span>
                    {contact.aboveHorizon ? "地平線上" : "地平線下"}
                    <small>
                      {position
                        ? formatBodyDirection(position)
                        : "方向未評価"}
                    </small>
                  </span>
                </td>
                <td className="event-contact-table__action">
                  <button
                    aria-label={`${phaseLabel}、${formatDateTime(contact.instantUtc, timeZone)}を星図に表示`}
                    onClick={() => onGoToContact(contact)}
                    type="button"
                  >
                    <Clock3Icon
                      aria-hidden="true"
                      size={16}
                      strokeWidth={1.8}
                    />
                    表示
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasPositionAngles ? (
        <p className="event-contact-table__angle-note">
          位置角は{positionAngleReference}
          を基準に、天の北を0°として東回り（0〜360°）
        </p>
      ) : null}
    </div>
  );
}

function EventSceneSimulationControls({
  currentMilliseconds,
  isPlaying,
  isSamplingPending,
  localTimeZone,
  onScrub,
  onRetry,
  onTogglePlayback,
  prefersReducedMotion,
  runtimeErrorMessage,
  sceneSampling,
  session,
}: {
  currentMilliseconds: number | null;
  isPlaying: boolean;
  isSamplingPending: boolean;
  localTimeZone: string;
  onScrub: (instantMilliseconds: number) => void;
  onRetry?: () => void;
  onTogglePlayback: () => void;
  prefersReducedMotion: boolean;
  runtimeErrorMessage: string | null;
  sceneSampling: EventSceneSamplingState;
  session: EventSceneSamplingSession | null;
}) {
  const titleId = useId();
  const rangeId = useId();
  const rangeDescriptionId = useId();
  const title = (
    <h3 id={titleId}>連続シミュレーション</h3>
  );
  if (sceneSampling.status === "unavailable") {
    return (
      <section
        aria-labelledby={titleId}
        className="event-scene-simulation event-scene-simulation--unavailable"
      >
        {title}
        <p role="note">
          この現象では任意時刻の物理シミュレーションを利用できません。
          上の計算済み時刻の静止図は利用できます。
        </p>
      </section>
    );
  }
  if (sceneSampling.status === "loading") {
    return (
      <section
        aria-busy="true"
        aria-labelledby={titleId}
        className="event-scene-simulation event-scene-simulation--loading"
      >
        {title}
        <p aria-live="polite" role="status">
          暦・地球回転データから物理サンプルと固定画角を準備しています。
          計算済み時刻の静止図はそのまま利用できます。
        </p>
      </section>
    );
  }
  if (sceneSampling.status === "error") {
    return (
      <section
        aria-labelledby={titleId}
        className="event-scene-simulation event-scene-simulation--error"
      >
        {title}
        <p role="alert">{sceneSampling.errorMessage}</p>
        {onRetry ? (
          <button
            className="event-action event-action--secondary"
            onClick={onRetry}
            type="button"
          >
            <RefreshCcwIcon
              aria-hidden="true"
              size={16}
              strokeWidth={1.8}
            />
            再準備
          </button>
        ) : null}
      </section>
    );
  }
  if (!session || currentMilliseconds === null) {
    return (
      <section
        aria-labelledby={titleId}
        className="event-scene-simulation event-scene-simulation--error"
      >
        {title}
        <p role="alert">
          シミュレーションデータが選択中の現象と一致しません。
          計算済み時刻の静止図を利用してください。
        </p>
      </section>
    );
  }

  const { endMilliseconds, startMilliseconds } =
    session.rangeUtc;
  const currentDate = new Date(currentMilliseconds);
  const startDate = new Date(startMilliseconds);
  const endDate = new Date(endMilliseconds);
  const isAtEnd = currentMilliseconds >= endMilliseconds;
  return (
    <section
      aria-labelledby={titleId}
      className="event-scene-simulation event-scene-simulation--ready"
    >
      <div className="event-scene-simulation__heading">
        {title}
        <output
          aria-live={isPlaying ? "off" : "polite"}
          htmlFor={rangeId}
        >
          {formatDateTime(currentDate, localTimeZone)}
          <small>{formatUtcDateTime(currentDate)}</small>
          {isSamplingPending ? (
            <em>物理計算を更新中</em>
          ) : null}
        </output>
      </div>
      <p className="event-scene-simulation__scope">
        各UTCを暦・EOPから物理再計算します。
        画面座標の補間はせず、全区間で固定した角度縮尺を使います。
      </p>
      <label htmlFor={rangeId}>シミュレーション時刻</label>
      <p className="sr-only" id={rangeDescriptionId}>
        シミュレーション範囲。開始は現地時刻
        {formatDateTime(startDate, localTimeZone)}（
        {localTimeZone}）、{formatUtcDateTime(startDate)}
        。終了は現地時刻
        {formatDateTime(endDate, localTimeZone)}（
        {localTimeZone}）、{formatUtcDateTime(endDate)}。
      </p>
      <input
        aria-describedby={rangeDescriptionId}
        aria-valuetext={`現地時刻 ${formatDateTime(currentDate, localTimeZone)}（${localTimeZone}）、${formatUtcDateTime(currentDate)}`}
        id={rangeId}
        max={endMilliseconds}
        min={startMilliseconds}
        onChange={(event) =>
          onScrub(Number(event.currentTarget.value))
        }
        step={1_000}
        type="range"
        value={currentMilliseconds}
      />
      <div
        aria-hidden="true"
        className="event-scene-simulation__range-labels"
      >
        <span>
          {formatDateTime(startDate, localTimeZone)}
        </span>
        <span>
          {formatDateTime(endDate, localTimeZone)}
        </span>
      </div>
      <div className="event-scene-simulation__actions">
        <button
          aria-label={
            isPlaying
              ? "シミュレーションを一時停止"
              : isAtEnd
                ? "シミュレーションを最初から再生"
                : "シミュレーションを再生"
          }
          className="event-action event-action--secondary"
          disabled={
            prefersReducedMotion ||
            isSamplingPending
          }
          onClick={onTogglePlayback}
          type="button"
        >
          {isPlaying ? (
            <PauseIcon
              aria-hidden="true"
              size={17}
              strokeWidth={1.8}
            />
          ) : (
            <PlayIcon
              aria-hidden="true"
              size={17}
              strokeWidth={1.8}
            />
          )}
          {isPlaying
            ? "一時停止"
            : isAtEnd
              ? "最初から再生"
              : "再生"}
        </button>
        <span>
          約10 fps・約24秒で全区間
        </span>
      </div>
      {prefersReducedMotion ? (
        <p className="event-scene-simulation__motion-note" role="note">
          「視差効果を減らす」が有効なため自動再生は停止しています。
          スライダーで各時刻を確認できます。
        </p>
      ) : null}
      {runtimeErrorMessage ? (
        <p
          className="event-scene-simulation__runtime-error"
          role="alert"
        >
          {runtimeErrorMessage}
        </p>
      ) : null}
    </section>
  );
}

function EventDetails({
  canRestoreObservationTime,
  circumstances,
  isActive,
  observationDate,
  onGoToContact,
  onGoToMaximum,
  onRestoreObservationTime,
  onRetrySceneSampling,
  sceneSampling,
}: {
  canRestoreObservationTime: boolean;
  circumstances: LocalCircumstances;
  isActive: boolean;
  observationDate: Date | null;
  onGoToContact: (sample: { readonly instantUtc: Date }) => void;
  onGoToMaximum: (contact: EventContact) => void;
  onRestoreObservationTime: () => void;
  onRetrySceneSampling?: () => void;
  sceneSampling: EventSceneSamplingState;
}) {
  const titleId = useId();
  const safetyTitleId = useId();
  const scenePhaseSelectId = useId();
  const maximumActionRef = useRef<HTMLButtonElement>(null);
  const calculatedPhases = useMemo(
    () => calculatedEventPhases(circumstances),
    [circumstances],
  );
  const maximumPhaseId = eventPhaseId(circumstances.maximum);
  const observationDateMilliseconds =
    observationDate?.getTime() ?? null;
  const matchingObservationPhaseId = useMemo(
    () =>
      calculatedPhases.find(
        ({ sample }) =>
          sample.instantUtc.getTime() ===
          observationDateMilliseconds,
      )?.id ?? null,
    [calculatedPhases, observationDateMilliseconds],
  );
  const [scenePhaseId, setScenePhaseId] = useState(
    matchingObservationPhaseId ?? maximumPhaseId,
  );
  const samplingSession = matchingSceneSamplingSession(
    sceneSampling,
    circumstances,
  );
  const prefersReducedMotion = usePrefersReducedMotion();
  const [
    physicalSceneSelection,
    setPhysicalSceneSelection,
  ] = useState<EventScenePhysicalSelection | null>(null);
  const [samplingError, setSamplingError] =
    useState<EventSceneSamplingError | null>(null);
  const [requestedSceneInstant, setRequestedSceneInstant] =
    useState<PendingEventSceneSample | null>(null);
  const [samplingIsPending, setSamplingIsPending] =
    useState(false);
  const [playingSession, setPlayingSession] =
    useState<EventSceneSamplingSession | null>(null);
  const playbackClockRef =
    useRef<EventScenePlaybackClock | null>(null);
  const pendingSampleRef =
    useRef<PendingEventSceneSample | null>(null);
  const samplingTimerRef = useRef<number | null>(null);
  const previousSamplingSessionRef =
    useRef<EventSceneSamplingSession | null>(samplingSession);
  const stopPhysicalPlayback = useCallback(() => {
    playbackClockRef.current = null;
    setPlayingSession(null);
  }, []);
  const clearPendingSample = useCallback(() => {
    pendingSampleRef.current = null;
    if (samplingTimerRef.current !== null) {
      window.clearTimeout(samplingTimerRef.current);
      samplingTimerRef.current = null;
    }
    setRequestedSceneInstant(null);
    setSamplingIsPending(false);
  }, []);
  const clearPhysicalSimulation = useCallback(() => {
    clearPendingSample();
    setPhysicalSceneSelection(null);
    setSamplingError(null);
    stopPhysicalPlayback();
  }, [clearPendingSample, stopPhysicalPlayback]);
  const commitPhysicalSample = useCallback(
    (
      session: EventSceneSamplingSession,
      instantMilliseconds: number,
    ): boolean => {
      try {
        const sample = samplePhysicalSceneAt(
          session,
          instantMilliseconds,
        );
        setPhysicalSceneSelection({ sample, session });
        setSamplingError(null);
        setRequestedSceneInstant(null);
        setSamplingIsPending(false);
        return true;
      } catch {
        setSamplingError({
          message:
            "指定時刻の物理配置を計算できませんでした。直前に確定した配置を表示しています。",
          session,
        });
        setRequestedSceneInstant(null);
        setSamplingIsPending(false);
        stopPhysicalPlayback();
        return false;
      }
    },
    [stopPhysicalPlayback],
  );
  const requestPhysicalSample = useCallback(
    (instantMilliseconds: number) => {
      if (!samplingSession) {
        return;
      }
      const request = {
        instantMilliseconds: clampEventSceneInstant(
          instantMilliseconds,
          samplingSession.rangeUtc,
        ),
        session: samplingSession,
      };
      pendingSampleRef.current = request;
      setRequestedSceneInstant(request);
      setSamplingIsPending(true);
      stopPhysicalPlayback();
      if (samplingTimerRef.current !== null) {
        return;
      }
      samplingTimerRef.current = window.setTimeout(() => {
        samplingTimerRef.current = null;
        const latestRequest = pendingSampleRef.current;
        pendingSampleRef.current = null;
        if (latestRequest) {
          commitPhysicalSample(
            latestRequest.session,
            latestRequest.instantMilliseconds,
          );
        }
      }, EVENT_SCENE_PLAYBACK_INTERVAL_MILLISECONDS);
    },
    [
      commitPhysicalSample,
      samplingSession,
      stopPhysicalPlayback,
    ],
  );
  useEffect(
    () => () => {
      pendingSampleRef.current = null;
      if (samplingTimerRef.current !== null) {
        window.clearTimeout(samplingTimerRef.current);
        samplingTimerRef.current = null;
      }
    },
    [samplingSession],
  );
  useEffect(() => {
    if (
      previousSamplingSessionRef.current === samplingSession
    ) {
      return;
    }
    previousSamplingSessionRef.current = samplingSession;
    // A session owns decoded ephemeris/EOP closures. Drop every reference to
    // the previous session promptly when a retry replaces it.
    clearPhysicalSimulation();
  }, [clearPhysicalSimulation, samplingSession]);
  useEffect(() => {
    if (matchingObservationPhaseId === null) {
      return;
    }
    // Synchronize the user-selectable scene only when sky time lands exactly
    // on a solved phase; arbitrary playback ticks must preserve the choice.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScenePhaseId((currentPhaseId) =>
      currentPhaseId === matchingObservationPhaseId
        ? currentPhaseId
        : matchingObservationPhaseId,
    );
    clearPhysicalSimulation();
  }, [
    clearPhysicalSimulation,
    matchingObservationPhaseId,
  ]);
  const [actionAnnouncement, setActionAnnouncement] = useState<{
    id: number;
    text: string;
  } | null>(null);
  const { event, observer, uncertainty } = circumstances;
  const displayClassification = eventClassificationLabel(
    event,
    circumstances.localClassification,
  );
  const displayTitle = eventTitleForPresentation(
    event,
    circumstances.localClassification,
    circumstances.boundaryUncertaintyReason,
  );
  const presentationClassification =
    eventPresentationClassification(
      event,
      circumstances.localClassification,
      circumstances.boundaryUncertaintyReason,
    );
  const uncertaintyMessage = boundaryUncertaintyMessage(
    circumstances,
  );
  const maximumLabel = usesClosestApproachLabel(circumstances)
    ? "最接近"
    : "最大";
  const localTimeZone = observer.timeZone;
  const scenePhase =
    calculatedPhases.find(({ id }) => id === scenePhaseId) ??
    calculatedPhases.find(({ id }) => id === maximumPhaseId) ??
    calculatedPhases[0];
  const solvedSceneSample =
    scenePhase?.sample ?? circumstances.maximum;
  const physicalSceneSample =
    physicalSceneSelection?.session === samplingSession
      ? physicalSceneSelection.sample
      : null;
  const sceneSample =
    physicalSceneSample ?? solvedSceneSample;
  const activeRequestedSceneInstant =
    requestedSceneInstant?.session === samplingSession
      ? requestedSceneInstant
      : null;
  const activeSamplingIsPending =
    samplingIsPending &&
    activeRequestedSceneInstant !== null;
  const samplingRuntimeError =
    samplingError?.session === samplingSession
      ? samplingError.message
      : null;
  const isPlaying =
    isActive &&
    playingSession === samplingSession &&
    samplingSession !== null &&
    !prefersReducedMotion;
  const defaultSimulationMilliseconds = samplingSession
    ? clampEventSceneInstant(
        solvedSceneSample.instantUtc.getTime(),
        samplingSession.rangeUtc,
      )
    : null;
  const simulationMilliseconds =
    activeRequestedSceneInstant?.instantMilliseconds ??
    physicalSceneSample?.instantUtc.getTime() ??
    defaultSimulationMilliseconds;
  const sceneMatchesObservationDate =
    observationDate?.getTime() === sceneSample.instantUtc.getTime();
  const maximumPosition = primaryBodyPosition(
    circumstances,
    circumstances.maximum,
  );
  const announceAction = (text: string) => {
    setActionAnnouncement((current) => ({
      id: (current?.id ?? 0) + 1,
      text,
    }));
  };
  const showContactOnSky = (contact: EventContact) => {
    clearPhysicalSimulation();
    setScenePhaseId(eventPhaseId(contact));
    onGoToContact(contact);
    announceAction(
      `観測日時を${formatDateTime(contact.instantUtc, localTimeZone)}に変更しました。元の日時に戻せます。`,
    );
  };
  const showSceneSampleOnSky = () => {
    stopPhysicalPlayback();
    if (!physicalSceneSample) {
      showContactOnSky(solvedSceneSample);
      return;
    }
    onGoToContact(physicalSceneSample);
    announceAction(
      `観測日時を${formatDateTime(physicalSceneSample.instantUtc, localTimeZone)}に変更しました。元の日時に戻せます。`,
    );
  };
  const togglePlayback = () => {
    if (
      !samplingSession ||
      !isActive ||
      prefersReducedMotion ||
      simulationMilliseconds === null ||
      activeSamplingIsPending
    ) {
      return;
    }
    if (isPlaying) {
      stopPhysicalPlayback();
      return;
    }
    let playbackStartMilliseconds =
      physicalSceneSample?.instantUtc.getTime() ??
      samplingSession.rangeUtc.startMilliseconds;
    if (
      playbackStartMilliseconds >=
      samplingSession.rangeUtc.endMilliseconds
    ) {
      playbackStartMilliseconds =
        samplingSession.rangeUtc.startMilliseconds;
    }
    if (
      !commitPhysicalSample(
        samplingSession,
        playbackStartMilliseconds,
      )
    ) {
      return;
    }
    playbackClockRef.current = {
      sceneStartMilliseconds: playbackStartMilliseconds,
      session: samplingSession,
      wallStartMilliseconds: performance.now(),
    };
    setPlayingSession(samplingSession);
  };
  useEffect(() => {
    if (!isPlaying || !samplingSession) {
      return;
    }
    const timer = window.setInterval(() => {
      const playbackClock = playbackClockRef.current;
      if (
        !playbackClock ||
        playbackClock.session !== samplingSession
      ) {
        stopPhysicalPlayback();
        return;
      }
      const durationMilliseconds =
        samplingSession.rangeUtc.endMilliseconds -
        samplingSession.rangeUtc.startMilliseconds;
      const elapsedWallMilliseconds =
        performance.now() -
        playbackClock.wallStartMilliseconds;
      if (
        !Number.isFinite(elapsedWallMilliseconds) ||
        elapsedWallMilliseconds < 0
      ) {
        stopPhysicalPlayback();
        return;
      }
      const elapsedSceneMilliseconds = Math.max(
        1,
        Math.ceil(
          durationMilliseconds *
            (elapsedWallMilliseconds /
              EVENT_SCENE_PLAYBACK_DURATION_MILLISECONDS),
        ),
      );
      const nextMilliseconds = clampEventSceneInstant(
        playbackClock.sceneStartMilliseconds +
          elapsedSceneMilliseconds,
        samplingSession.rangeUtc,
      );
      const succeeded = commitPhysicalSample(
        samplingSession,
        nextMilliseconds,
      );
      if (
        !succeeded ||
        nextMilliseconds >=
          samplingSession.rangeUtc.endMilliseconds
      ) {
        stopPhysicalPlayback();
      }
    }, EVENT_SCENE_PLAYBACK_INTERVAL_MILLISECONDS);
    return () => window.clearInterval(timer);
  }, [
    commitPhysicalSample,
    isPlaying,
    samplingSession,
    stopPhysicalPlayback,
  ]);
  useEffect(() => {
    if (!isActive) {
      // A mounted but hidden feature panel must stop computation immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      stopPhysicalPlayback();
    }
  }, [isActive, stopPhysicalPlayback]);
  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const pauseWhenHidden = () => {
      if (document.hidden) {
        stopPhysicalPlayback();
      }
    };
    document.addEventListener(
      "visibilitychange",
      pauseWhenHidden,
    );
    return () =>
      document.removeEventListener(
        "visibilitychange",
        pauseWhenHidden,
      );
  }, [isPlaying, stopPhysicalPlayback]);
  useEffect(() => {
    if (prefersReducedMotion) {
      // An external accessibility preference change must stop, not suspend,
      // playback so disabling and re-enabling it never auto-resumes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      stopPhysicalPlayback();
    }
  }, [prefersReducedMotion, stopPhysicalPlayback]);
  return (
    <section
      aria-labelledby={titleId}
      className="event-details"
    >
      <header className="event-details__header">
        <span className="event-details__kind">
          {eventIcon(event.kind, 18)}
          {presentationClassification}
        </span>
        <h2 id={titleId}>{displayTitle}</h2>
        <p
          className={`event-visibility event-visibility--${circumstances.visibility}`}
        >
          <CircleAlertIcon
            aria-hidden="true"
            size={17}
            strokeWidth={1.8}
          />
          {visibilityLabel(circumstances.visibility)}
        </p>
        {uncertaintyMessage ? (
          <p
            className="event-visibility event-visibility--boundary-uncertain"
            role="note"
          >
            <CircleAlertIcon
              aria-hidden="true"
              size={17}
              strokeWidth={1.8}
            />
            {uncertaintyMessage}
          </p>
        ) : null}
      </header>

      {event.kind === "solar-eclipse" ? (
        <aside
          aria-labelledby={safetyTitleId}
          className="event-safety-note"
          role="note"
        >
          <ShieldAlertIcon
            aria-hidden="true"
            size={21}
            strokeWidth={1.9}
          />
          <div>
            <strong id={safetyTitleId}>太陽を直接見ないでください</strong>
            <p>
              皆既日食の部分食段階を含め、太陽が少しでも見えている間は
              専用の太陽観察用保護具が必要です。
              双眼鏡・望遠鏡・カメラは、前面に適切な太陽フィルターを
              装着せず太陽へ向けないでください。
            </p>
          </div>
        </aside>
      ) : null}

      <p className="event-observer">
        <MapPinIcon
          aria-hidden="true"
          size={16}
          strokeWidth={1.8}
        />
        {observerSummary(circumstances)}
      </p>

      <dl className="event-details__metrics">
        <div>
          <dt>{maximumLabel}の現地時刻</dt>
          <dd>
            <time dateTime={circumstances.maximum.instantUtc.toISOString()}>
              {formatDateTime(
                circumstances.maximum.instantUtc,
                localTimeZone,
              )}
            </time>
            <small>{localTimeZone}</small>
          </dd>
        </div>
        <div>
          <dt>{maximumLabel}のUTC</dt>
          <dd>
            <time dateTime={circumstances.maximum.instantUtc.toISOString()}>
              {formatUtcDateTime(circumstances.maximum.instantUtc)}
            </time>
          </dd>
        </div>
        <div>
          <dt>{maximumLabel}時の方向</dt>
          <dd>
            {maximumPosition
              ? formatBodyDirection(maximumPosition)
              : "未評価"}
            <small>
              {circumstances.maximum.aboveHorizon
                ? "幾何学的に地平線上"
                : "地平線下"}
            </small>
          </dd>
        </div>
        {circumstances.magnitude !== null ? (
          <div>
            <dt>{magnitudeLabel(circumstances)}</dt>
            <dd>{circumstances.magnitude.toFixed(3)}</dd>
          </div>
        ) : null}
        {circumstances.obscuration !== null ? (
          <div>
            <dt>面積遮蔽率</dt>
            <dd>{(circumstances.obscuration * 100).toFixed(1)}%</dd>
          </div>
        ) : null}
      </dl>

      <div className="event-scene-timeline">
        <div className="event-scene-timeline__control">
          <label htmlFor={scenePhaseSelectId}>
            相対配置の計算済み時刻
          </label>
          <select
            id={scenePhaseSelectId}
            onChange={(changeEvent) => {
              clearPhysicalSimulation();
              setScenePhaseId(changeEvent.target.value);
            }}
            value={scenePhase?.id ?? maximumPhaseId}
          >
            {calculatedPhases.map(({ id, sample }) => (
              <option key={id} value={id}>
                {contactLabel(circumstances, sample.phase)} ·{" "}
                {formatDateTime(sample.instantUtc, localTimeZone)}
              </option>
            ))}
          </select>
        </div>
        <p className="event-scene-timeline__scope">
          接触・{maximumLabel}
          として解いた時刻だけを切り替える静止図です。
          時刻間の配置は補間していません。
        </p>
        <p
          className={`event-scene-timeline__sync ${
            sceneMatchesObservationDate
              ? "event-scene-timeline__sync--matched"
              : ""
          }`}
          role="status"
        >
          {physicalSceneSample
            ? sceneMatchesObservationDate
              ? "この物理計算図は星図と同じ指定時刻です。"
              : "この図は物理再計算した指定時刻です。現在の星図時刻とは別です。"
            : sceneMatchesObservationDate
              ? "この静止図は星図と同じ時刻です。"
              : "この図は計算済み時刻の静止図です。現在の星図時刻とは別です。"}
        </p>
        <button
          className="event-action event-action--secondary"
          disabled={activeSamplingIsPending}
          onClick={showSceneSampleOnSky}
          type="button"
        >
          <Clock3Icon aria-hidden="true" size={17} strokeWidth={1.8} />
          選択時刻を空に表示
        </button>
        <EventSceneSimulationControls
          currentMilliseconds={simulationMilliseconds}
          isPlaying={isPlaying}
          isSamplingPending={activeSamplingIsPending}
          localTimeZone={localTimeZone}
          onRetry={onRetrySceneSampling}
          onScrub={requestPhysicalSample}
          onTogglePlayback={togglePlayback}
          prefersReducedMotion={prefersReducedMotion}
          runtimeErrorMessage={samplingRuntimeError}
          sceneSampling={sceneSampling}
          session={samplingSession}
        />
      </div>

      <EventScene
        circumstances={circumstances}
        projectionSamples={samplingSession?.projectionSamples}
        sample={sceneSample}
      />

      <div className="event-details__primary-actions">
        <button
          className="event-action event-action--primary"
          onClick={() => {
            clearPhysicalSimulation();
            setScenePhaseId(maximumPhaseId);
            onGoToMaximum(circumstances.maximum);
            announceAction(
              `観測日時を${formatDateTime(circumstances.maximum.instantUtc, localTimeZone)}に変更しました。元の日時に戻せます。`,
            );
          }}
          ref={maximumActionRef}
          type="button"
        >
          <Clock3Icon aria-hidden="true" size={18} strokeWidth={1.8} />
          {maximumLabel}時刻を空に表示
        </button>
        {canRestoreObservationTime ? (
          <button
            className="event-action event-action--secondary"
            onClick={() => {
              clearPhysicalSimulation();
              setScenePhaseId(maximumPhaseId);
              onRestoreObservationTime();
              announceAction("元の観測日時に戻しました。");
              maximumActionRef.current?.focus();
            }}
            type="button"
          >
            <RotateCcwIcon
              aria-hidden="true"
              size={18}
              strokeWidth={1.8}
            />
            元の日時に戻る
          </button>
        ) : null}
      </div>

      <ContactTable
        circumstances={circumstances}
        onGoToContact={showContactOnSky}
        timeZone={localTimeZone}
      />

      {actionAnnouncement ? (
        <div
          aria-atomic="true"
          aria-live="polite"
          className="sr-only"
          key={actionAnnouncement.id}
          role="status"
        >
          {actionAnnouncement.text}
        </div>
      ) : null}

      {circumstances.warnings.length > 0 ? (
        <aside
          aria-label="予報上の注意"
          className="event-warnings"
        >
          <CircleAlertIcon
            aria-hidden="true"
            size={18}
            strokeWidth={1.8}
          />
          <ul>
            {circumstances.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
      ) : null}

      <section
        aria-label="予報精度"
        className={`event-accuracy event-accuracy--${uncertainty.tier}`}
      >
        <header>
          <div>
            <span>予報精度</span>
            <strong>{calculationTierLabel(uncertainty.tier)}</strong>
          </div>
          <p>
            保守的な工学上の幅（統計的な信頼区間ではありません）
          </p>
        </header>
        <dl className="event-accuracy__metrics">
          <div>
            <dt>時刻モデル幅</dt>
            <dd>
              {formatOptionalNumber(
                uncertainty.timingSeconds,
                "秒",
                1,
              )}
            </dd>
          </div>
          <div>
            <dt>総経路境界幅</dt>
            <dd>
              {formatOptionalNumber(
                uncertainty.pathKilometers,
                " km",
                1,
              )}
            </dd>
          </div>
          <div>
            <dt>地点</dt>
            <dd>
              {formatOptionalNumber(
                uncertainty.observerLocationMeters,
                " m",
                0,
              )}
            </dd>
          </div>
          {uncertainty.earthOrientation ? (
            <>
              <div>
                <dt>IERS DUT1公表誤差</dt>
                <dd>
                  {formatOptionalNumber(
                    uncertainty.earthOrientation
                      .dut1ReportedErrorSeconds,
                    "秒",
                    6,
                  )}
                </dd>
              </div>
              <div>
                <dt>IERS地表経路成分</dt>
                <dd>
                  {formatOptionalNumber(
                    uncertainty.earthOrientation.combinedPathMeters,
                    " m",
                    2,
                  )}
                  <small>
                    DUT1{" "}
                    {uncertainty.earthOrientation.dut1PathMeters.toFixed(
                      2,
                    )}{" "}
                    m ＋ xp/yp{" "}
                    {uncertainty.earthOrientation.polarMotionPathMeters.toFixed(
                      2,
                    )}{" "}
                    m
                  </small>
                </dd>
              </div>
            </>
          ) : null}
        </dl>
        {uncertainty.dominantContributors.length > 0 ? (
          <div className="event-accuracy__contributors">
            <strong>主な不確実性</strong>
            <ul>
              {uncertainty.dominantContributors.map((contributor) => (
                <li key={contributor}>{contributor}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <details className="event-provenance">
        <summary>
          計算と再現情報
          <ChevronDownIcon
            aria-hidden="true"
            size={19}
            strokeWidth={1.8}
          />
        </summary>
        <p>
          月縁モデルは
          {circumstances.provenance.lunarRadiusModel ===
          "mean-spherical-limb"
            ? "平均球面月縁"
            : circumstances.provenance.lunarRadiusModel}
          です。月面地形による凹凸は含みません。
        </p>
        <dl>
          <div>
            <dt>イベントデータ</dt>
            <dd>{event.dataVersion}</dd>
          </div>
          <div>
            <dt>候補の全球分類</dt>
            <dd>
              {eventClassificationLabel(
                event,
                event.globalClassification,
              )}
            </dd>
          </div>
          <div>
            <dt>この地点での分類</dt>
            <dd>{displayClassification}</dd>
          </div>
          <div>
            <dt>アルゴリズム</dt>
            <dd>{circumstances.provenance.algorithmVersion}</dd>
          </div>
          <div>
            <dt>暦</dt>
            <dd>{circumstances.provenance.ephemerisId}</dd>
          </div>
          <div>
            <dt>EOP</dt>
            <dd>{circumstances.provenance.eopId}</dd>
          </div>
          <div>
            <dt>EOP品質</dt>
            <dd>
              DUT1：
              {earthOrientationQualityLabel(
                circumstances.provenance.dut1Quality,
              )}
              ／極運動：
              {earthOrientationQualityLabel(
                circumstances.provenance.polarMotionQuality,
              )}
            </dd>
          </div>
          <div>
            <dt>EOP取得日時</dt>
            <dd>
              {circumstances.provenance.eopRetrievedAt ??
                "なし（IERS EOP収録外）"}
            </dd>
          </div>
          <div>
            <dt>ΔT</dt>
            <dd>{circumstances.provenance.deltaTModel}</dd>
          </div>
          <div>
            <dt>月縁プロファイル</dt>
            <dd>
              {circumstances.provenance.limbProfileId ??
                "未使用（平均月縁）"}
            </dd>
          </div>
          <div className="event-provenance__hash">
            <dt>暦データSHA-256</dt>
            <dd>
              <code>
                {circumstances.provenance.ephemerisSourceSha256}
              </code>
            </dd>
          </div>
          <div className="event-provenance__hash">
            <dt>EOPデータSHA-256</dt>
            <dd>
              {circumstances.provenance.eopSourceSha256 ? (
                <code>
                  {circumstances.provenance.eopSourceSha256}
                </code>
              ) : (
                "なし（IERS EOP収録外）"
              )}
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

export function EventExplorer({
  boundaryUncertaintyReasonsByEventId,
  canRestoreObservationTime = false,
  emptyMessage,
  emptyTitle,
  errorMessage = "天文現象の予報を読み込めませんでした。",
  events,
  isActive = true,
  localClassificationsByEventId,
  onGoToContact,
  onGoToMaximum,
  onRestoreObservationTime,
  onRetrySceneSampling,
  onRetry,
  onSelectEvent,
  observationDate = null,
  sceneSampling = UNAVAILABLE_EVENT_SCENE_SAMPLING,
  selectedCircumstances,
  selectedEventId,
  status,
  timeZone,
}: EventExplorerProps) {
  const headingId = useId();
  const resultsSummaryId = useId();
  const selectedCircumstancesAreCurrent =
    selectedCircumstances?.event.id === selectedEventId;

  return (
    <section
      aria-busy={status === "loading"}
      aria-labelledby={headingId}
      className="event-explorer"
    >
      <h2 className="sr-only" id={headingId}>
        天文現象を探す
      </h2>

      {status === "loading" ? (
        <div
          aria-atomic="true"
          aria-live="polite"
          className="event-state event-state--loading"
          role="status"
        >
          <MoonIcon aria-hidden="true" size={23} strokeWidth={1.7} />
          <div>
            <strong>この地点の現象を計算しています</strong>
            <p>日食・月食・月による恒星掩蔽を準備しています。</p>
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="event-state event-state--error" role="alert">
          <CircleAlertIcon
            aria-hidden="true"
            size={23}
            strokeWidth={1.8}
          />
          <div>
            <strong>予報を読み込めませんでした</strong>
            <p>{errorMessage}</p>
            <button onClick={onRetry} type="button">
              <RefreshCcwIcon
                aria-hidden="true"
                size={17}
                strokeWidth={1.8}
              />
              再試行
            </button>
          </div>
        </div>
      ) : null}

      {status === "empty" ||
      (status === "ready" && events.length === 0) ? (
        <div
          aria-live="polite"
          className="event-state event-state--empty"
          role="status"
        >
          <MoonIcon aria-hidden="true" size={23} strokeWidth={1.7} />
          <div>
            <strong>{emptyTitle ?? "該当する現象はありません"}</strong>
            <p>
              {emptyMessage ??
                "この地点と期間では、対応する日食・月食・掩蔽が見つかりませんでした。"}
            </p>
          </div>
        </div>
      ) : null}

      {status === "ready" && events.length > 0 ? (
        <>
          <p
            aria-live="polite"
            className="event-results-summary"
            id={resultsSummaryId}
            role="status"
          >
            {events.length}件の天文現象
          </p>
          <EventList
            boundaryUncertaintyReasonsByEventId={
              boundaryUncertaintyReasonsByEventId
            }
            events={events}
            localClassificationsByEventId={
              localClassificationsByEventId
            }
            onSelectEvent={onSelectEvent}
            resultsSummaryId={resultsSummaryId}
            selectedEventId={selectedEventId}
            timeZone={timeZone}
          />

          {selectedCircumstancesAreCurrent && selectedCircumstances ? (
            <EventDetails
              canRestoreObservationTime={canRestoreObservationTime}
              circumstances={selectedCircumstances}
              isActive={isActive}
              key={selectedCircumstances.event.id}
              observationDate={observationDate}
              onGoToContact={onGoToContact}
              onGoToMaximum={onGoToMaximum}
              onRestoreObservationTime={onRestoreObservationTime}
              onRetrySceneSampling={onRetrySceneSampling}
              sceneSampling={sceneSampling}
            />
          ) : selectedEventId ? (
            <div
              aria-live="polite"
              className="event-details event-details--empty"
              role="status"
            >
              <Clock3Icon
                aria-hidden="true"
                size={21}
                strokeWidth={1.8}
              />
              <p>選択した現象の局地予報を準備しています。</p>
            </div>
          ) : (
            <div className="event-details event-details--empty">
              <MoonIcon
                aria-hidden="true"
                size={21}
                strokeWidth={1.8}
              />
              <p>
                現象を選ぶと、この地点での接触時刻と予報精度を
                表示します。
              </p>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
