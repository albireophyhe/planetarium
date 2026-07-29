import {
  clampObservationDate,
  formatZonedDateTimeInput,
  isSupportedObservationDate,
  SUPPORTED_OBSERVATION_DATE_RANGE,
  zonedLocalToDate,
} from "../domain";

export const OBSERVATION_DATE_RANGE_ERROR =
  "対応期間は1900年1月1日〜2100年12月31日（UTC）です。範囲内の日時を選んでください。";

export const OBSERVATION_DATE_LOCAL_ERROR =
  "この日時は選択したタイムゾーンに存在しないか、夏時間の切替で重複しています。別の時刻を選んでください。";

type ObservationDateResult =
  | {
      date: Date;
      error: null;
      ok: true;
      reachedBoundary?: "maximum" | "minimum";
    }
  | { date: null; error: string; ok: false };

export function observationInputRange(timeZone: string) {
  const minimumInstant = new Date(
    SUPPORTED_OBSERVATION_DATE_RANGE.minimum,
  );
  let minimum = formatZonedDateTimeInput(
    minimumInstant,
    timeZone,
  );
  if (
    zonedLocalToDate(minimum, timeZone, "later").getTime() <
    minimumInstant.getTime()
  ) {
    minimum = formatZonedDateTimeInput(
      new Date(minimumInstant.getTime() + 60_000),
      timeZone,
    );
  }

  return {
    maximum: formatZonedDateTimeInput(
      new Date(SUPPORTED_OBSERVATION_DATE_RANGE.maximum),
      timeZone,
    ),
    minimum,
  };
}

export function parseObservationDateInput(
  value: string,
  timeZone: string,
): ObservationDateResult {
  if (!value) {
    return {
      date: null,
      error: "観測日時を入力してください。",
      ok: false,
    };
  }

  try {
    const date = zonedLocalToDate(value, timeZone, "reject");
    if (!isSupportedObservationDate(date)) {
      return {
        date: null,
        error: OBSERVATION_DATE_RANGE_ERROR,
        ok: false,
      };
    }
    return { date, error: null, ok: true };
  } catch {
    return {
      date: null,
      error: OBSERVATION_DATE_LOCAL_ERROR,
      ok: false,
    };
  }
}

export function shiftObservationDate(
  current: Date,
  hours: number,
): ObservationDateResult {
  const nextDate = new Date(
    current.getTime() + hours * 60 * 60 * 1000,
  );
  if (!Number.isFinite(nextDate.getTime())) {
    return {
      date: null,
      error: OBSERVATION_DATE_RANGE_ERROR,
      ok: false,
    };
  }

  const minimum = Date.parse(SUPPORTED_OBSERVATION_DATE_RANGE.minimum);
  const maximum = Date.parse(SUPPORTED_OBSERVATION_DATE_RANGE.maximum);
  if (nextDate.getTime() < minimum) {
    return {
      date: clampObservationDate(nextDate),
      error: null,
      ok: true,
      reachedBoundary: "minimum",
    };
  }
  if (nextDate.getTime() > maximum) {
    return {
      date: clampObservationDate(nextDate),
      error: null,
      ok: true,
      reachedBoundary: "maximum",
    };
  }
  return { date: nextDate, error: null, ok: true };
}
