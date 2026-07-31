import type {
  EventBoundaryUncertaintyReason,
  EventClassification,
  EventSummary,
} from "../../domain/events/types";

export function eventClassificationLabel(
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

export function eventTitleForPresentation(
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

export function eventPresentationClassification(
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
