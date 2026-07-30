import type {
  EventSummary,
  LocalCircumstances,
} from "../../domain/events/types";

export function preferredEventId(
  events: readonly EventSummary[],
  circumstancesById: ReadonlyMap<string, LocalCircumstances>,
  year: number,
  observationYear: number,
  observationInstantMilliseconds: number,
): string | null {
  const firstEvent = events[0];
  if (!firstEvent) {
    return null;
  }
  if (year !== observationYear) {
    return firstEvent.id;
  }

  const nextEvent = events.find(
    (event) =>
      (circumstancesById
        .get(event.id)
        ?.maximum.instantUtc.getTime() ??
        event.canonicalEpochUtc.getTime()) >=
      observationInstantMilliseconds,
  );
  return nextEvent?.id ?? events.at(-1)?.id ?? firstEvent.id;
}
