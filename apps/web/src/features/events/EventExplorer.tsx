import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  Clock3Icon,
  EyeIcon,
  EyeOffIcon,
  MapPinIcon,
  MoonIcon,
  RefreshCcwIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  SunIcon,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
} from "react";
import type {
  EventContact,
  EventContactPhase,
  EventKind,
  EventSummary,
  EventVisibility,
  LocalCircumstances,
} from "../../domain/events/types";

export type EventExplorerStatus =
  | "loading"
  | "error"
  | "empty"
  | "ready";

export type EventExplorerProps = {
  status: EventExplorerStatus;
  events: readonly EventSummary[];
  selectedEventId: string | null;
  selectedCircumstances: LocalCircumstances | null;
  timeZone: string;
  errorMessage?: string;
  canRestoreObservationTime?: boolean;
  onSelectEvent: (eventId: string) => void;
  onRetry: () => void;
  onGoToMaximum: (contact: EventContact) => void;
  onGoToContact: (contact: EventContact) => void;
  onRestoreObservationTime: () => void;
};

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

function dateTimeParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("ja-JP-u-ca-gregory", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  });
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

function eventKindLabel(event: EventSummary) {
  switch (event.kind) {
    case "solar-eclipse":
      switch (event.globalClassification) {
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
      switch (event.globalClassification) {
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
    case "boundary-uncertain":
      return "境界付近のため局地判定に不確実性があります";
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
  const degrees = Math.round(radiansToDegrees(value));
  if (degrees === 0) {
    return "0°";
  }
  return `${degrees > 0 ? "+" : "−"}${Math.abs(degrees)}°`;
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

function maximumAltitude(circumstances: LocalCircumstances) {
  return primaryBodyPosition(circumstances, circumstances.maximum)
    ?.altitudeAzimuth.altitude;
}

function formatOptionalNumber(
  value: number | null,
  suffix: string,
  fractionDigits: number,
) {
  return value === null
    ? "未評価"
    : `${value.toFixed(fractionDigits)}${suffix}`;
}

function observerSummary(circumstances: LocalCircumstances) {
  const { observer } = circumstances;
  const accuracy =
    observer.horizontalAccuracyMeters === null
      ? "水平精度は未指定"
      : `水平精度 ±${observer.horizontalAccuracyMeters.toFixed(0)} m`;
  return `${observer.name ?? "観測地点"}・${locationSourceLabel(observer.locationSource)}・${accuracy}・標高 ${observer.heightMeters.toFixed(0)} m`;
}

function EventList({
  events,
  onSelectEvent,
  selectedEventId,
  timeZone,
}: Pick<
  EventExplorerProps,
  "events" | "onSelectEvent" | "selectedEventId" | "timeZone"
>) {
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
      aria-label="天文現象"
      className="event-list"
      role="listbox"
    >
      {events.map((event, index) => {
        const isSelected = event.id === selectedEventId;
        return (
          <button
            aria-label={`${event.title}、${eventKindLabel(event)}、${formatListDate(event.canonicalEpochUtc, timeZone)}`}
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
              <strong>{event.title}</strong>
              <span>{eventKindLabel(event)}</span>
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
  return (
    <div className="event-contact-table-frame">
      <table className="event-contact-table">
        <caption>接触時刻</caption>
        <thead>
          <tr>
            <th scope="col">現象</th>
            <th scope="col">現地</th>
            <th scope="col">UTC</th>
            <th scope="col">地平線</th>
            <th scope="col">
              <span className="sr-only">星図操作</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {circumstances.contacts.map((contact) => {
            const phaseLabel = CONTACT_LABELS[contact.phase];
            const positionAngle = formatPositionAngle(
              contact.positionAngleRadians,
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
                  {contact.aboveHorizon ? "地平線上" : "地平線下"}
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
    </div>
  );
}

function EventDetails({
  canRestoreObservationTime,
  circumstances,
  onGoToContact,
  onGoToMaximum,
  onRestoreObservationTime,
}: {
  canRestoreObservationTime: boolean;
  circumstances: LocalCircumstances;
  onGoToContact: (contact: EventContact) => void;
  onGoToMaximum: (contact: EventContact) => void;
  onRestoreObservationTime: () => void;
}) {
  const titleId = useId();
  const safetyTitleId = useId();
  const { event, observer, uncertainty } = circumstances;
  const localTimeZone = observer.timeZone;
  const altitude = maximumAltitude(circumstances);

  return (
    <section
      aria-labelledby={titleId}
      className="event-details"
    >
      <header className="event-details__header">
        <span className="event-details__kind">
          {eventIcon(event.kind, 18)}
          {eventKindLabel(event)}
        </span>
        <h2 id={titleId}>{event.title}</h2>
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
              部分食・金環食では専用の太陽観察用保護具が必要です。
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
          <dt>最大の現地時刻</dt>
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
          <dt>最大のUTC</dt>
          <dd>
            <time dateTime={circumstances.maximum.instantUtc.toISOString()}>
              {formatUtcDateTime(circumstances.maximum.instantUtc)}
            </time>
          </dd>
        </div>
        <div>
          <dt>最大時の高度</dt>
          <dd>
            {altitude === undefined
              ? "未評価"
              : formatSignedDegrees(altitude)}
            <small>
              {circumstances.maximum.aboveHorizon
                ? "幾何学的に地平線上"
                : "地平線下"}
            </small>
          </dd>
        </div>
        {circumstances.magnitude !== null ? (
          <div>
            <dt>食分</dt>
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

      <div className="event-details__primary-actions">
        <button
          className="event-action event-action--primary"
          onClick={() => onGoToMaximum(circumstances.maximum)}
          type="button"
        >
          <Clock3Icon aria-hidden="true" size={18} strokeWidth={1.8} />
          最大時刻を空に表示
        </button>
        {canRestoreObservationTime ? (
          <button
            className="event-action event-action--secondary"
            onClick={onRestoreObservationTime}
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
        onGoToContact={onGoToContact}
        timeZone={localTimeZone}
      />

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
          <p>平均月縁（地形プロファイルなし）</p>
        </header>
        <dl className="event-accuracy__metrics">
          <div>
            <dt>接触時刻</dt>
            <dd>
              {formatOptionalNumber(
                uncertainty.timingSeconds,
                "秒",
                1,
              )}
            </dd>
          </div>
          <div>
            <dt>経路</dt>
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
        </dl>
      </details>
    </section>
  );
}

export function EventExplorer({
  canRestoreObservationTime = false,
  errorMessage = "天文現象の予報を読み込めませんでした。",
  events,
  onGoToContact,
  onGoToMaximum,
  onRestoreObservationTime,
  onRetry,
  onSelectEvent,
  selectedCircumstances,
  selectedEventId,
  status,
  timeZone,
}: EventExplorerProps) {
  const headingId = useId();
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
            <strong>該当する現象はありません</strong>
            <p>
              この地点と期間では、対応する日食・月食・掩蔽が
              見つかりませんでした。
            </p>
          </div>
        </div>
      ) : null}

      {status === "ready" && events.length > 0 ? (
        <>
          <p
            aria-live="polite"
            className="event-results-summary"
            role="status"
          >
            {events.length}件の天文現象
          </p>
          <EventList
            events={events}
            onSelectEvent={onSelectEvent}
            selectedEventId={selectedEventId}
            timeZone={timeZone}
          />

          {selectedCircumstancesAreCurrent && selectedCircumstances ? (
            <EventDetails
              canRestoreObservationTime={canRestoreObservationTime}
              circumstances={selectedCircumstances}
              onGoToContact={onGoToContact}
              onGoToMaximum={onGoToMaximum}
              onRestoreObservationTime={onRestoreObservationTime}
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
