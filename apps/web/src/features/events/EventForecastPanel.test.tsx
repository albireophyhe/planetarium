import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  IersEarthOrientationEstimateV1,
  IersEarthOrientationSnapshotV1,
  PrecisionStar,
  PrecisionStarCatalogV2,
} from "../../domain";
import { loadIersEarthOrientationSnapshot } from "../../domain/earthOrientationDataLoader";
import type {
  EventContact,
  EventSummary,
  LocalCircumstances,
} from "../../domain/events/types";
import type { ObserverLocation } from "../../app/types";

const eventMocks = vi.hoisted(() => ({
  calculateLunar: vi.fn(),
  calculateOccultation: vi.fn(),
  calculateSolar: vi.fn(),
  candidateLoadRange: vi.fn(),
  ephemerisLoadRange: vi.fn(),
  fetchAsset: vi.fn(),
}));

vi.mock("../../domain/events/eventCandidates", () => ({
  EventCandidateLoader: class {
    loadRange = eventMocks.candidateLoadRange;
  },
}));

vi.mock("../../domain/events/de442sLoader", () => ({
  De442sEphemerisLoader: class {
    loadRange = eventMocks.ephemerisLoadRange;
  },
}));

vi.mock("../../domain/events/eventAssetTransport", () => ({
  fetchEventAsset: eventMocks.fetchAsset,
}));

vi.mock("../../domain/events/solarEclipse", () => ({
  calculateLocalSolarEclipse: eventMocks.calculateSolar,
}));

vi.mock("../../domain/events/lunarEclipse", () => ({
  calculateLocalLunarEclipse: eventMocks.calculateLunar,
}));

vi.mock("../../domain/events/lunarOccultation", () => ({
  calculateLocalLunarOccultation: eventMocks.calculateOccultation,
}));

import { EventForecastPanel } from "./EventForecastPanel";
import { preferredEventId } from "./eventSelection";

const LOCATION: ObserverLocation = {
  heightMeters: 44,
  horizontalAccuracyMeters: 18,
  id: "test",
  latitude: 35.6812,
  locationSource: "device-geolocation",
  longitude: 139.7671,
  name: "テスト地点",
  timeZone: "Asia/Tokyo",
};

const EOP_SOURCE_SHA256 = "e".repeat(64);
const EOP_RETRIEVED_AT = "2026-07-29T04:05:06.000Z";

const EARTH_ORIENTATION: IersEarthOrientationEstimateV1 = {
  dut1: {
    quality: "predicted",
    reportedErrorSeconds: 0.001,
    seconds: 0.042,
    source: "predicted",
  },
  polarMotion: {
    quality: "predicted",
    source: "predicted",
    usesPrediction: true,
    xpRadians: 1e-6,
    xpReportedErrorRadians: 1e-9,
    ypRadians: 2e-6,
    ypReportedErrorRadians: 2e-9,
  },
};

const TARGET_STAR: PrecisionStar = {
  bvColor: 0.1,
  catalogName: "Target",
  decRad: 0.4,
  hd: 1,
  hr: 7001,
  parallaxArcsec: 0.1,
  pmDecArcsecPerYear: 0.2,
  pmRaCosDecArcsecPerYear: 0.3,
  radialVelocityKmPerSecond: 4,
  raRad: 1,
  spectralType: "A0V",
  vMagnitude: 0.1,
};

const PRECISION_CATALOG: PrecisionStarCatalogV2 = {
  starByHR: new Map([[TARGET_STAR.hr, TARGET_STAR]]),
  stars: [TARGET_STAR],
};

function earthOrientationSnapshot(
  lookup: IersEarthOrientationSnapshotV1["lookup"] = () =>
    EARTH_ORIENTATION,
): IersEarthOrientationSnapshotV1 {
  return Object.freeze({
    endUtcMilliseconds: Date.UTC(2101, 0, 3),
    lookup,
    retrievedAt: EOP_RETRIEVED_AT,
    sourceSha256: EOP_SOURCE_SHA256,
    startUtcMilliseconds: Date.UTC(1899, 11, 30),
  });
}

function summary(
  id: string,
  kind: EventSummary["kind"],
  instantUtc: string,
  targetStarHR: number | null = null,
): EventSummary {
  return {
    canonicalEpochUtc: new Date(instantUtc),
    dataVersion: "test-candidates-v1",
    globalClassification:
      kind === "solar-eclipse"
        ? "partial"
        : kind === "lunar-eclipse"
          ? "penumbral"
          : "occultation",
    id,
    kind,
    targetStarHR,
    title:
      kind === "solar-eclipse"
        ? "部分日食"
        : kind === "lunar-eclipse"
          ? "半影月食"
          : "月による恒星掩蔽",
  };
}

const SOLAR_SUMMARY = summary(
  "se-20260812",
  "solar-eclipse",
  "2026-08-12T17:45:54.000Z",
);
const LUNAR_SUMMARY = summary(
  "le-20260828",
  "lunar-eclipse",
  "2026-08-28T04:12:00.000Z",
);
const OCCULTATION_SUMMARY = summary(
  "lo-20260901-hr7001",
  "lunar-occultation",
  "2026-09-01T03:00:00.000Z",
  TARGET_STAR.hr,
);

function candidate(
  event: EventSummary,
  searchStartJulianDateTdb: number,
  searchEndJulianDateTdb: number,
) {
  const common = {
    id: event.id,
    maximumJulianDateTdb:
      (searchStartJulianDateTdb + searchEndJulianDateTdb) / 2,
    searchEndJulianDateTdb,
    searchStartJulianDateTdb,
  };
  if (event.kind === "solar-eclipse") {
    return {
      seed: {
        ...common,
        classificationHint: "partial" as const,
        kind: event.kind,
      },
      summary: event,
    };
  }
  if (event.kind === "lunar-eclipse") {
    return {
      seed: {
        ...common,
        classificationHint: "penumbral" as const,
        kind: event.kind,
      },
      summary: event,
    };
  }
  return {
    seed: {
      ...common,
      classificationHint: "occultation" as const,
      kind: event.kind,
      target: {
        hd: 1,
        hr: TARGET_STAR.hr,
        label: "Target",
        labelJa: "対象星",
        vMagnitude: 0.1,
      },
    },
    summary: event,
  };
}

function contact(
  instantUtc: string,
  aboveHorizon = true,
): EventContact {
  return {
    aboveHorizon,
    bodies: {
      moon: {
        altitudeAzimuth: {
          altitude: aboveHorizon ? 0.5 : -0.5,
          azimuth: 1,
          azimuthDefined: true,
        },
        angularRadiusRadians: 0.004,
        distanceKilometers: 380_000,
      },
    },
    instantUtc: new Date(instantUtc),
    phase: "maximum",
    positionAngleRadians: null,
  };
}

function circumstances(
  event: EventSummary,
  visibility: LocalCircumstances["visibility"],
): LocalCircumstances {
  const maximum = contact(
    event.canonicalEpochUtc.toISOString(),
    visibility !== "below-horizon",
  );
  return {
    boundaryUncertain: false,
    boundaryUncertaintyReason: null,
    contacts: [maximum],
    event,
    localClassification: event.globalClassification,
    magnitude: event.kind === "solar-eclipse" ? 0.7 : null,
    maximum,
    obscuration: event.kind === "solar-eclipse" ? 0.6 : null,
    observer: LOCATION,
    provenance: {
      algorithmVersion: "test",
      deltaTModel: "test",
      dut1Quality: "predicted",
      eopId: "test",
      eopRetrievedAt: EOP_RETRIEVED_AT,
      eopSourceSha256: EOP_SOURCE_SHA256,
      ephemerisId: "DE442s",
      ephemerisSourceSha256: "0".repeat(64),
      limbProfileId: null,
      lunarRadiusModel: "mean-spherical-limb",
      polarMotionQuality: "predicted",
    },
    uncertainty: {
      dominantContributors: [],
      observerLocationMeters: 18,
      pathKilometers: null,
      tier: "uncertain",
      timingSeconds: 1,
    },
    visibility,
    warnings: [],
  };
}

function panelProps(
  overrides: Partial<
    React.ComponentProps<typeof EventForecastPanel>
  > = {},
): React.ComponentProps<typeof EventForecastPanel> {
  return {
    canRestoreObservationTime: false,
    loadEarthOrientationSnapshot: vi.fn(async () =>
      earthOrientationSnapshot(),
    ),
    location: LOCATION,
    observationDate: new Date("2026-07-30T00:00:00.000Z"),
    onRestoreObservationTime: vi.fn(),
    onRetryPrecisionCatalog: vi.fn(),
    onShowEventTime: vi.fn(),
    precisionCatalog: PRECISION_CATALOG,
    precisionCatalogStatus: "ready",
    ...overrides,
  };
}

describe("EventForecastPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventMocks.candidateLoadRange.mockResolvedValue([
      candidate(SOLAR_SUMMARY, 2_461_000, 2_461_001),
      candidate(LUNAR_SUMMARY, 2_461_010, 2_461_011),
      candidate(OCCULTATION_SUMMARY, 2_461_020, 2_461_021),
    ]);
    eventMocks.ephemerisLoadRange.mockResolvedValue({
      id: "DE442s",
      sourceSha256: "0".repeat(64),
      state: vi.fn(),
    });
    eventMocks.calculateSolar.mockReturnValue(
      circumstances(SOLAR_SUMMARY, "fully-visible"),
    );
    eventMocks.calculateLunar.mockReturnValue(
      circumstances(LUNAR_SUMMARY, "below-horizon"),
    );
    eventMocks.calculateOccultation.mockReturnValue(null);
  });

  it("uses the local maximum for observation-year selection and falls back to the canonical epoch when circumstances are missing", () => {
    const observationInstantMilliseconds = new Date(
      "2026-07-30T00:00:00.000Z",
    ).getTime();
    const canonicalFutureButLocalPast = summary(
      "local-past",
      "solar-eclipse",
      "2026-08-01T00:00:00.000Z",
    );
    const canonicalPastButLocalFuture = summary(
      "local-future",
      "lunar-eclipse",
      "2026-07-01T00:00:00.000Z",
    );
    const localPastCircumstances = {
      ...circumstances(
        canonicalFutureButLocalPast,
        "fully-visible",
      ),
      maximum: contact("2026-07-20T00:00:00.000Z"),
    };
    const localFutureCircumstances = {
      ...circumstances(
        canonicalPastButLocalFuture,
        "fully-visible",
      ),
      maximum: contact("2026-08-10T00:00:00.000Z"),
    };
    expect(
      preferredEventId(
        [
          canonicalFutureButLocalPast,
          canonicalPastButLocalFuture,
        ],
        new Map([
          [
            canonicalFutureButLocalPast.id,
            localPastCircumstances,
          ],
          [
            canonicalPastButLocalFuture.id,
            localFutureCircumstances,
          ],
        ]),
        2026,
        2026,
        observationInstantMilliseconds,
      ),
    ).toBe(canonicalPastButLocalFuture.id);

    const fallbackFuture = summary(
      "canonical-fallback",
      "solar-eclipse",
      "2026-08-05T00:00:00.000Z",
    );
    const laterLocalFuture = summary(
      "later-local-future",
      "lunar-eclipse",
      "2026-09-01T00:00:00.000Z",
    );
    expect(
      preferredEventId(
        [
          canonicalFutureButLocalPast,
          fallbackFuture,
          laterLocalFuture,
        ],
        new Map([
          [
            canonicalFutureButLocalPast.id,
            localPastCircumstances,
          ],
          [
            laterLocalFuture.id,
            {
              ...circumstances(
                laterLocalFuture,
                "fully-visible",
              ),
              maximum: contact("2026-09-01T00:00:00.000Z"),
            },
          ],
        ]),
        2026,
        2026,
        observationInstantMilliseconds,
      ),
    ).toBe(fallbackFuture.id);
  });

  it("marks an edge local year when event ephemeris coverage is partial", () => {
    const { unmount } = render(
      <EventForecastPanel
        {...panelProps({
          location: {
            ...LOCATION,
            timeZone: "UTC",
          },
          observationDate: new Date(
            "1900-06-01T00:00:00.000Z",
          ),
        })}
      />,
    );

    expect(
      screen.getByRole("note", {
        name: "予報期間の収録範囲",
      }),
    ).toHaveTextContent(
      "この現地年のはじめ約10分は予報に含まれません",
    );

    unmount();
    render(<EventForecastPanel {...panelProps()} />);
    expect(
      screen.queryByRole("note", {
        name: "予報期間の収録範囲",
      }),
    ).not.toBeInTheDocument();
  });

  it("selects the first visible event at or after the observation time in the observation year", async () => {
    const past = summary(
      "se-20260110",
      "solar-eclipse",
      "2026-01-10T03:00:00.000Z",
    );
    const hiddenUpcoming = summary(
      "le-20260801",
      "lunar-eclipse",
      "2026-08-01T03:00:00.000Z",
    );
    const firstVisibleUpcoming = summary(
      "se-20260810",
      "solar-eclipse",
      "2026-08-10T03:00:00.000Z",
    );
    const laterUpcoming = summary(
      "lo-20260901-hr7001",
      "lunar-occultation",
      "2026-09-01T03:00:00.000Z",
      TARGET_STAR.hr,
    );
    eventMocks.candidateLoadRange.mockResolvedValue([
      candidate(past, 2_461_000, 2_461_001),
      candidate(hiddenUpcoming, 2_461_010, 2_461_011),
      candidate(firstVisibleUpcoming, 2_461_020, 2_461_021),
      candidate(laterUpcoming, 2_461_030, 2_461_031),
    ]);
    eventMocks.calculateSolar.mockImplementation(
      (_ephemeris: unknown, event: EventSummary) =>
        circumstances(event, "fully-visible"),
    );
    eventMocks.calculateLunar.mockImplementation(
      (_ephemeris: unknown, event: EventSummary) =>
        circumstances(event, "below-horizon"),
    );
    eventMocks.calculateOccultation.mockImplementation(
      (_ephemeris: unknown, event: EventSummary) =>
        circumstances(event, "fully-visible"),
    );

    render(<EventForecastPanel {...panelProps()} />);

    expect(
      await screen.findByRole("option", {
        name: /部分日食、2026\/08\/10 12:00/,
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("option", {
        name: /部分日食、2026\/01\/10 12:00/,
      }),
    ).toHaveAttribute("aria-selected", "false");
    expect(
      screen.queryByRole("option", {
        name: /半影月食、2026\/08\/01 12:00/,
      }),
    ).not.toBeInTheDocument();
  });

  it("selects the most recent event when every visible event in the observation year is past", async () => {
    const firstPast = summary(
      "se-20260110",
      "solar-eclipse",
      "2026-01-10T03:00:00.000Z",
    );
    const latestPast = summary(
      "le-20260520",
      "lunar-eclipse",
      "2026-05-20T03:00:00.000Z",
    );
    eventMocks.candidateLoadRange.mockResolvedValue([
      candidate(firstPast, 2_461_000, 2_461_001),
      candidate(latestPast, 2_461_010, 2_461_011),
    ]);
    eventMocks.calculateSolar.mockImplementation(
      (_ephemeris: unknown, event: EventSummary) =>
        circumstances(event, "fully-visible"),
    );
    eventMocks.calculateLunar.mockImplementation(
      (_ephemeris: unknown, event: EventSummary) =>
        circumstances(event, "fully-visible"),
    );

    render(<EventForecastPanel {...panelProps()} />);

    expect(
      await screen.findByRole("option", {
        name: /半影月食、2026\/05\/20 12:00/,
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("option", {
        name: /部分日食、2026\/01\/10 12:00/,
      }),
    ).toHaveAttribute("aria-selected", "false");
  });

  it("keeps chronological-first selection in another year and restores the upcoming observation-year event", async () => {
    const firstPreviousYear = summary(
      "se-20250110",
      "solar-eclipse",
      "2025-01-10T03:00:00.000Z",
    );
    const lastPreviousYear = summary(
      "le-20251220",
      "lunar-eclipse",
      "2025-12-20T03:00:00.000Z",
    );
    const observationYearPast = summary(
      "se-20260110",
      "solar-eclipse",
      "2026-01-10T03:00:00.000Z",
    );
    const observationYearUpcoming = summary(
      "le-20260810",
      "lunar-eclipse",
      "2026-08-10T03:00:00.000Z",
    );
    eventMocks.candidateLoadRange.mockResolvedValue([
      candidate(firstPreviousYear, 2_461_000, 2_461_001),
      candidate(lastPreviousYear, 2_461_010, 2_461_011),
      candidate(observationYearPast, 2_461_020, 2_461_021),
      candidate(observationYearUpcoming, 2_461_030, 2_461_031),
    ]);
    eventMocks.calculateSolar.mockImplementation(
      (_ephemeris: unknown, event: EventSummary) =>
        circumstances(event, "fully-visible"),
    );
    eventMocks.calculateLunar.mockImplementation(
      (_ephemeris: unknown, event: EventSummary) =>
        circumstances(event, "fully-visible"),
    );
    const user = userEvent.setup();
    render(<EventForecastPanel {...panelProps()} />);

    expect(
      await screen.findByRole("option", {
        name: /半影月食、2026\/08\/10 12:00/,
      }),
    ).toHaveAttribute("aria-selected", "true");

    await user.click(
      screen.getByRole("button", { name: "前年" }),
    );
    expect(
      await screen.findByRole("option", {
        name: /部分日食、2025\/01\/10 12:00/,
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("option", {
        name: /半影月食、2025\/12\/20 12:00/,
      }),
    ).toHaveAttribute("aria-selected", "false");

    await user.click(
      screen.getByRole("button", { name: "観測年へ戻る" }),
    );
    expect(
      await screen.findByRole("option", {
        name: /半影月食、2026\/08\/10 12:00/,
      }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("loads one observer-local year, batches the required ephemeris range, and exposes only local visible events", async () => {
    const user = userEvent.setup();
    const onShowEventTime = vi.fn();
    const loadEarthOrientationSnapshot = vi.fn(
      async () => earthOrientationSnapshot(),
    );
    const localMaximum = contact(
      "2026-08-12T18:13:22.000Z",
    );
    eventMocks.calculateSolar.mockReturnValue({
      ...circumstances(SOLAR_SUMMARY, "fully-visible"),
      contacts: [localMaximum],
      maximum: localMaximum,
    });
    render(
      <EventForecastPanel
        {...panelProps({
          loadEarthOrientationSnapshot,
          onShowEventTime,
        })}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "2026年の予報（現地日付）",
      }),
    ).toBeVisible();
    expect(
      screen.getByText("この地点の現象を計算しています"),
    ).toBeVisible();

    const visibleOption = await screen.findByRole("option", {
        name: /部分日食、\d{4}\//,
      });
    expect(visibleOption).toBeVisible();
    expect(visibleOption).toHaveTextContent("2026/08/13 03:13");
    expect(
      within(
        screen.getByRole("listbox", { name: "天文現象" }),
      ).getAllByRole("option"),
    ).toHaveLength(1);
    const belowHorizonToggle = screen.getByRole("checkbox", {
      name: "地平線下の現象も表示（1件）",
    });
    expect(belowHorizonToggle).not.toBeChecked();
    await user.click(belowHorizonToggle);
    expect(
      within(
        screen.getByRole("listbox", { name: "天文現象" }),
      ).getAllByRole("option"),
    ).toHaveLength(2);
    await user.click(
      screen.getByRole("option", {
        name: /半影月食、\d{4}\//,
      }),
    );
    expect(
      screen.getByText("全経過が地平線下です"),
    ).toBeVisible();
    const lunarOptions =
      eventMocks.calculateLunar.mock.calls[0]?.[3];
    expect(lunarOptions.timeScaleContributors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("局地経路境界への加算なし"),
      ]),
    );
    expect(
      lunarOptions.timeScaleContributors.join(" "),
    ).not.toContain("経路成分へ線形加算");
    await user.click(visibleOption);
    expect(eventMocks.candidateLoadRange).toHaveBeenCalledWith(
      new Date("2025-12-30T00:00:00.000Z"),
      new Date("2027-01-02T23:59:59.999Z"),
      expect.any(AbortSignal),
    );
    expect(eventMocks.ephemerisLoadRange).toHaveBeenCalledWith(
      2_461_000,
      2_461_021,
      {
        clipToCoverage: true,
        signal: expect.any(AbortSignal),
      },
    );
    expect(loadEarthOrientationSnapshot).toHaveBeenCalledWith(
      new Date("2025-12-28T00:00:00.000Z"),
      new Date("2027-01-04T23:59:59.999Z"),
    );
    expect(eventMocks.calculateOccultation).toHaveBeenCalledWith(
      expect.anything(),
      OCCULTATION_SUMMARY,
      TARGET_STAR,
      LOCATION,
      expect.objectContaining({
        earthOrientation: expect.objectContaining({
          dut1Seconds: EARTH_ORIENTATION.dut1.seconds,
        }),
        earthOrientationAt: expect.any(Function),
        earthOrientationReportedUncertaintyAt:
          expect.any(Function),
        earthOrientationProvenanceAt: expect.any(Function),
        earthOrientationReportedUncertainty:
          expect.objectContaining({
            combinedPathMeters: expect.any(Number),
            dut1ReportedErrorSeconds:
              EARTH_ORIENTATION.dut1.reportedErrorSeconds,
            semantics:
              "iers-reported-error-linear-envelope",
          }),
        earthRotationPathUncertaintyKilometers:
          expect.any(Number),
        earthRotationPathUncertaintyKilometersAt:
          expect.any(Function),
        dut1Quality: "predicted",
        polarMotionQuality: "predicted",
        eopRetrievedAt: EOP_RETRIEVED_AT,
        eopIdAt: expect.any(Function),
        eopSourceSha256: EOP_SOURCE_SHA256,
        heightMeters: LOCATION.heightMeters,
        horizontalAccuracyMeters:
          LOCATION.horizontalAccuracyMeters,
        locationSource: LOCATION.locationSource,
        shouldCancel: expect.any(Function),
        timeScaleContributors: expect.arrayContaining([
          expect.stringContaining("IERS公表誤差"),
        ]),
      }),
    );
    const eventOptions =
      eventMocks.calculateOccultation.mock.calls[0]?.[4];
    expect(
      eventOptions.earthOrientationProvenanceAt(
        OCCULTATION_SUMMARY.canonicalEpochUtc,
      ),
    ).toEqual({
      dut1Quality: "predicted",
      eopRetrievedAt: EOP_RETRIEVED_AT,
      eopSourceSha256: EOP_SOURCE_SHA256,
      polarMotionQuality: "predicted",
    });
    expect(onShowEventTime).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: "最大時刻を空に表示",
      }),
    );
    expect(onShowEventTime).toHaveBeenCalledWith(
      localMaximum.instantUtc,
    );
  });

  it("combines the native keyboard-focusable kind filter with horizon visibility and falls back to a matching selection", async () => {
    const user = userEvent.setup();
    eventMocks.calculateOccultation.mockReturnValue(
      circumstances(OCCULTATION_SUMMARY, "fully-visible"),
    );
    render(<EventForecastPanel {...panelProps()} />);

    const kindFilter = await screen.findByRole("combobox", {
      name: "現象の種類",
    });
    expect(kindFilter).toHaveValue("all");
    expect(
      within(kindFilter).getAllByRole("option").map(
        (option) => option.textContent,
      ),
    ).toEqual(["すべて", "日食", "月食", "恒星掩蔽"]);

    kindFilter.focus();
    expect(kindFilter).toHaveFocus();
    expect(kindFilter).toHaveProperty("tabIndex", 0);
    await user.selectOptions(kindFilter, "solar-eclipse");
    expect(kindFilter).toHaveValue("solar-eclipse");
    expect(kindFilter).toHaveFocus();
    expect(
      within(
        screen.getByRole("listbox", { name: "天文現象" }),
      ).getAllByRole("option"),
    ).toHaveLength(1);
    expect(
      screen.getByRole("option", {
        name: /部分日食、\d{4}\//,
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await user.selectOptions(kindFilter, "lunar-eclipse");
    expect(kindFilter).toHaveFocus();
    expect(
      screen.getByText("地平線上の月食はありません"),
    ).toBeVisible();
    const belowHorizonToggle = screen.getByRole("checkbox", {
      name: "地平線下の現象も表示（1件）",
    });
    await user.click(belowHorizonToggle);
    expect(
      screen.getByRole("option", {
        name: /半影月食、\d{4}\//,
      }),
    ).toHaveAttribute("aria-selected", "true");

    await user.selectOptions(kindFilter, "lunar-occultation");
    expect(kindFilter).toHaveFocus();
    expect(
      screen.getByRole("option", {
        name: /月による恒星掩蔽、\d{4}\//,
      }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("uses the observation-year preference when kind and horizon filters remove the selection", async () => {
    const pastSolar = summary(
      "se-20260110",
      "solar-eclipse",
      "2026-01-10T03:00:00.000Z",
    );
    const hiddenUpcomingLunar = summary(
      "le-20260801",
      "lunar-eclipse",
      "2026-08-01T03:00:00.000Z",
    );
    const visibleUpcomingSolar = summary(
      "se-20260810",
      "solar-eclipse",
      "2026-08-10T03:00:00.000Z",
    );
    const laterOccultation = summary(
      "lo-20260901-hr7001",
      "lunar-occultation",
      "2026-09-01T03:00:00.000Z",
      TARGET_STAR.hr,
    );
    eventMocks.candidateLoadRange.mockResolvedValue([
      candidate(pastSolar, 2_461_000, 2_461_001),
      candidate(hiddenUpcomingLunar, 2_461_010, 2_461_011),
      candidate(visibleUpcomingSolar, 2_461_020, 2_461_021),
      candidate(laterOccultation, 2_461_030, 2_461_031),
    ]);
    eventMocks.calculateSolar.mockImplementation(
      (_ephemeris: unknown, event: EventSummary) =>
        circumstances(event, "fully-visible"),
    );
    eventMocks.calculateLunar.mockImplementation(
      (_ephemeris: unknown, event: EventSummary) =>
        circumstances(event, "below-horizon"),
    );
    eventMocks.calculateOccultation.mockImplementation(
      (_ephemeris: unknown, event: EventSummary) =>
        circumstances(event, "fully-visible"),
    );
    const user = userEvent.setup();
    render(<EventForecastPanel {...panelProps()} />);

    await user.click(
      await screen.findByRole("option", {
        name: /月による恒星掩蔽、2026\/09\/01 12:00/,
      }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "現象の種類" }),
      "solar-eclipse",
    );
    expect(
      screen.getByRole("option", {
        name: /部分日食、2026\/08\/10 12:00/,
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("option", {
        name: /部分日食、2026\/01\/10 12:00/,
      }),
    ).toHaveAttribute("aria-selected", "false");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "現象の種類" }),
      "all",
    );
    const belowHorizonToggle = screen.getByRole("checkbox", {
      name: "地平線下の現象も表示（1件）",
    });
    await user.click(belowHorizonToggle);
    await user.click(
      screen.getByRole("option", {
        name: /半影月食、2026\/08\/01 12:00/,
      }),
    );
    await user.click(belowHorizonToggle);
    expect(
      screen.getByRole("option", {
        name: /部分日食、2026\/08\/10 12:00/,
      }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("explains an empty kind filter and keeps it across year and location changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <EventForecastPanel {...panelProps()} />,
    );
    const kindFilter = await screen.findByRole("combobox", {
      name: "現象の種類",
    });

    await user.selectOptions(kindFilter, "lunar-occultation");
    expect(
      screen.getByText("選択した恒星掩蔽はありません"),
    ).toBeVisible();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.selectOptions(kindFilter, "solar-eclipse");
    await user.click(
      screen.getByRole("button", { name: "翌年" }),
    );
    await screen.findByText("該当する現象はありません");
    expect(kindFilter).toHaveValue("solar-eclipse");

    await user.click(
      screen.getByRole("button", { name: "前年" }),
    );
    expect(
      await screen.findByRole("option", {
        name: /部分日食、\d{4}\//,
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(kindFilter).toHaveValue("solar-eclipse");

    rerender(
      <EventForecastPanel
        {...panelProps({
          location: {
            ...LOCATION,
            id: "moved",
            latitude: 34,
          },
        })}
      />,
    );
    expect(
      await screen.findByRole("option", {
        name: /部分日食、\d{4}\//,
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(kindFilter).toHaveValue("solar-eclipse");
  });

  it("assigns a UTC year-end event to its date at the observing location", async () => {
    const yearEndSummary = summary(
      "le-20281231",
      "lunar-eclipse",
      "2028-12-31T16:52:05.000Z",
    );
    eventMocks.candidateLoadRange.mockResolvedValue([
      candidate(yearEndSummary, 2_462_137, 2_462_138),
    ]);
    eventMocks.calculateLunar.mockReturnValue(
      circumstances(yearEndSummary, "fully-visible"),
    );

    render(
      <EventForecastPanel
        {...panelProps({
          observationDate: new Date(
            "2028-12-31T15:30:00.000Z",
          ),
        })}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "2029年の予報（現地日付）",
      }),
    ).toBeVisible();
    const option = await screen.findByRole("option", {
      name: /半影月食、\d{4}\//,
    });
    expect(option).toHaveTextContent("2029/01/01 01:52");
    expect(eventMocks.candidateLoadRange).toHaveBeenCalledWith(
      new Date("2028-12-30T00:00:00.000Z"),
      new Date("2030-01-02T23:59:59.999Z"),
      expect.any(AbortSignal),
    );
  });

  it("keeps bundled EOP metadata and quality through the real snapshot loader", async () => {
    eventMocks.candidateLoadRange.mockResolvedValue([
      candidate(SOLAR_SUMMARY, 2_461_000, 2_461_001),
    ]);

    render(
      <EventForecastPanel
        {...panelProps({
          loadEarthOrientationSnapshot:
            loadIersEarthOrientationSnapshot,
        })}
      />,
    );

    expect(
      await screen.findByRole("option", {
        name: /部分日食、\d{4}\//,
      }),
    ).toBeVisible();
    const options = eventMocks.calculateSolar.mock.calls[0]?.[3];
    expect(options).toEqual(
      expect.objectContaining({
        dut1Quality: "predicted",
        eopRetrievedAt: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T/,
        ),
        eopSourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        polarMotionQuality: "predicted",
      }),
    );
    expect(
      options.earthOrientationProvenanceAt(
        SOLAR_SUMMARY.canonicalEpochUtc,
      ),
    ).toEqual({
      dut1Quality: "predicted",
      eopRetrievedAt: options.eopRetrievedAt,
      eopSourceSha256: options.eopSourceSha256,
      polarMotionQuality: "predicted",
    });
  });

  it("uses the anchored ΔT fallback outside bundled IERS coverage", async () => {
    const futureSummary = summary(
      "se-21000601",
      "solar-eclipse",
      "2100-06-01T12:00:00.000Z",
    );
    eventMocks.candidateLoadRange.mockResolvedValue([
      candidate(futureSummary, 2_497_000, 2_497_001),
    ]);
    eventMocks.calculateSolar.mockReturnValue(
      circumstances(futureSummary, "fully-visible"),
    );

    render(
      <EventForecastPanel
        {...panelProps({
          loadEarthOrientationSnapshot: vi.fn(async () =>
            earthOrientationSnapshot(() => null),
          ),
          observationDate: new Date(
            "2100-06-01T00:00:00.000Z",
          ),
        })}
      />,
    );

    expect(
      await screen.findByRole("option", {
        name: /部分日食、\d{4}\//,
      }),
    ).toBeVisible();
    expect(eventMocks.calculateSolar).toHaveBeenCalledWith(
      expect.anything(),
      futureSummary,
      LOCATION,
      expect.objectContaining({
        deltaTModel: expect.stringContaining(
          "anchored-to-IERS",
        ),
        earthOrientation: expect.objectContaining({
          taiMinusUtcSeconds: expect.any(Number),
        }),
        earthRotationPathUncertaintyKilometers:
          expect.any(Number),
        dut1Quality: "outside-coverage",
        eopRetrievedAt: null,
        eopSourceSha256: null,
        polarMotionQuality: "outside-coverage",
        timeScaleContributors: expect.arrayContaining([
          expect.stringContaining("NASA ΔT"),
        ]),
        timeScaleWarnings: expect.arrayContaining([
          expect.stringContaining("IERS EOP収録後"),
        ]),
        timingUncertaintySeconds: expect.any(Number),
      }),
    );
  });

  it("does not disguise an EOP integrity failure as an out-of-range fallback", async () => {
    eventMocks.candidateLoadRange.mockResolvedValue([
      candidate(SOLAR_SUMMARY, 2_461_000, 2_461_001),
    ]);

    render(
      <EventForecastPanel
        {...panelProps({
          loadEarthOrientationSnapshot: vi.fn(async () => {
            throw new Error("Synthetic EOP digest failure");
          }),
        })}
      />,
    );

    expect(
      await screen.findByText("予報を読み込めませんでした"),
    ).toBeVisible();
    expect(eventMocks.calculateSolar).not.toHaveBeenCalled();
  });

  it("passes a synchronous per-sample EOP resolver across a leap boundary", async () => {
    const leapSummary = summary(
      "lo-20120701-hr7001",
      "lunar-occultation",
      "2012-07-01T03:44:03.000Z",
      TARGET_STAR.hr,
    );
    const beforeLeap = {
      ...EARTH_ORIENTATION,
      dut1: {
        ...EARTH_ORIENTATION.dut1,
        quality: "observed" as const,
        reportedErrorSeconds: 0.001,
        seconds: -0.586_821,
        source: "observed" as const,
      },
      polarMotion: {
        ...EARTH_ORIENTATION.polarMotion,
        quality: "observed" as const,
        source: "observed" as const,
      },
    };
    const afterLeap = {
      ...EARTH_ORIENTATION,
      dut1: {
        ...EARTH_ORIENTATION.dut1,
        reportedErrorSeconds: 0.002,
        seconds: 0.413_171,
      },
    };
    const boundary = Date.parse("2012-07-01T00:00:00.000Z");
    eventMocks.candidateLoadRange.mockResolvedValue([
      candidate(leapSummary, 2_456_109, 2_456_110),
    ]);
    eventMocks.calculateOccultation.mockReturnValue(
      circumstances(leapSummary, "fully-visible"),
    );

    render(
      <EventForecastPanel
        {...panelProps({
          loadEarthOrientationSnapshot: vi.fn(async () =>
            earthOrientationSnapshot((date) =>
              date.getTime() < boundary ? beforeLeap : afterLeap,
            ),
          ),
          observationDate: new Date(
            "2012-07-01T00:00:00.000Z",
          ),
        })}
      />,
    );

    await screen.findByRole("option", {
      name: /月による恒星掩蔽、\d{4}\//,
    });
    const options =
      eventMocks.calculateOccultation.mock.calls[0]?.[4];
    expect(
      options.earthOrientationAt(
        new Date("2012-06-30T23:59:59.000Z"),
      ).dut1Seconds,
    ).toBe(beforeLeap.dut1.seconds);
    expect(
      options.earthOrientationAt(
        new Date("2012-07-01T00:00:00.000Z"),
      ).dut1Seconds,
    ).toBe(afterLeap.dut1.seconds);
    const beforeDate = new Date("2012-06-30T23:59:59.000Z");
    const afterDate = new Date("2012-07-01T00:00:00.000Z");
    expect(
      options.earthOrientationReportedUncertaintyAt(
        beforeDate,
      ).dut1ReportedErrorSeconds,
    ).toBe(0.001);
    expect(
      options.earthOrientationReportedUncertaintyAt(
        afterDate,
      ).dut1ReportedErrorSeconds,
    ).toBe(0.002);
    expect(
      options.earthRotationPathUncertaintyKilometersAt(
        afterDate,
      ),
    ).toBeGreaterThan(
      options.earthRotationPathUncertaintyKilometersAt(
        beforeDate,
      ),
    );
    expect(options.eopIdAt(beforeDate)).toBe(
      "IERS EOP観測値",
    );
    expect(options.eopIdAt(afterDate)).toBe(
      "IERS EOP予測値",
    );
  });

  it("supports year navigation and disables controls at both coverage boundaries", async () => {
    eventMocks.candidateLoadRange.mockResolvedValue([]);
    const { rerender } = render(
      <EventForecastPanel
        {...panelProps({
          observationDate: new Date("1900-06-01T00:00:00.000Z"),
        })}
      />,
    );

    await screen.findByText("該当する現象はありません");
    expect(screen.getByRole("button", { name: "前年" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "観測年へ戻る" }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "翌年" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "1901年の予報（現地日付）",
      }),
    ).toBeVisible();

    rerender(
      <EventForecastPanel
        {...panelProps({
          observationDate: new Date("2100-06-01T00:00:00.000Z"),
        })}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "観測年へ戻る" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "2100年の予報（現地日付）",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "翌年" })).toBeDisabled();
  });

  it("calculates eclipses while the precision catalog loads and adds occultations when ready", async () => {
    const loadEarthOrientationSnapshot = vi.fn(
      async () => earthOrientationSnapshot(),
    );
    const { rerender } = render(
      <EventForecastPanel
        {...panelProps({
          loadEarthOrientationSnapshot,
          precisionCatalog: null,
          precisionCatalogStatus: "loading",
        })}
      />,
    );

    expect(
      screen.getByText(/日食・月食を先に計算し/),
    ).toBeVisible();
    expect(
      await screen.findByRole("option", {
        name: /部分日食、\d{4}\//,
      }),
    ).toBeVisible();
    expect(eventMocks.calculateSolar).toHaveBeenCalled();
    expect(eventMocks.calculateOccultation).not.toHaveBeenCalled();

    eventMocks.calculateOccultation.mockReturnValue(
      circumstances(OCCULTATION_SUMMARY, "fully-visible"),
    );
    rerender(
      <EventForecastPanel
        {...panelProps({
          loadEarthOrientationSnapshot,
          precisionCatalog: PRECISION_CATALOG,
          precisionCatalogStatus: "ready",
        })}
      />,
    );
    expect(
      await screen.findByRole("option", {
        name: /月による恒星掩蔽、\d{4}\//,
      }),
    ).toBeVisible();
    expect(eventMocks.calculateOccultation).toHaveBeenCalled();
    expect(
      screen.queryByText(/日食・月食を先に計算し/),
    ).not.toBeInTheDocument();
  });

  it("keeps eclipse results and offers a precision-catalog retry after a partial failure", async () => {
    const onRetryPrecisionCatalog = vi.fn();
    render(
      <EventForecastPanel
        {...panelProps({
          onRetryPrecisionCatalog,
          precisionCatalog: null,
          precisionCatalogStatus: "error",
        })}
      />,
    );

    expect(
      screen.getByText(/日食・月食だけを表示しています/),
    ).toBeVisible();
    expect(
      await screen.findByRole("option", {
        name: /部分日食、\d{4}\//,
      }),
    ).toBeVisible();
    expect(eventMocks.calculateSolar).toHaveBeenCalled();
    expect(eventMocks.calculateOccultation).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", {
        name: "精密星表を再読み込み",
      }),
    );
    expect(onRetryPrecisionCatalog).toHaveBeenCalledTimes(1);
  });

  it("keeps other events usable when one candidate calculation fails", async () => {
    eventMocks.calculateSolar.mockImplementation(() => {
      throw new RangeError("Synthetic contact failure");
    });
    eventMocks.calculateLunar.mockReturnValue(
      circumstances(LUNAR_SUMMARY, "fully-visible"),
    );

    render(<EventForecastPanel {...panelProps()} />);

    expect(
      await screen.findByRole("option", {
        name: /半影月食、\d{4}\//,
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/候補1件を局地計算できなかったため省略/),
    ).toBeVisible();
    expect(
      screen.queryByText("予報を読み込めませんでした"),
    ).not.toBeInTheDocument();
  });

  it("aborts stale work when the observing location changes", async () => {
    let firstSignal: AbortSignal | undefined;
    let resolveFirst:
      | ((value: readonly never[]) => void)
      | undefined;
    eventMocks.candidateLoadRange
      .mockImplementationOnce(
        (
          _start: Date,
          _end: Date,
          signal: AbortSignal,
        ) => {
          firstSignal = signal;
          return new Promise<readonly never[]>((resolve) => {
            resolveFirst = resolve;
          });
        },
      )
      .mockResolvedValueOnce([]);
    const { rerender } = render(
      <EventForecastPanel {...panelProps()} />,
    );

    await waitFor(() =>
      expect(eventMocks.candidateLoadRange).toHaveBeenCalledTimes(1),
    );
    rerender(
      <EventForecastPanel
        {...panelProps({
          location: {
            ...LOCATION,
            id: "moved",
            latitude: 34,
          },
        })}
      />,
    );

    expect(firstSignal?.aborted).toBe(true);
    expect(
      await screen.findByText("該当する現象はありません"),
    ).toBeVisible();
    resolveFirst?.([]);
  });

  it("reuses three recent year results and evicts the least-recently-used year", async () => {
    const user = userEvent.setup();
    render(<EventForecastPanel {...panelProps()} />);

    expect(
      await screen.findByRole("option", {
        name: /部分日食、\d{4}\//,
      }),
    ).toBeVisible();
    expect(eventMocks.candidateLoadRange).toHaveBeenCalledTimes(1);

    for (const year of [2027, 2028, 2029]) {
      await user.click(
        screen.getByRole("button", { name: "翌年" }),
      );
      expect(
        screen.getByRole("heading", {
          name: `${year}年の予報（現地日付）`,
        }),
      ).toBeVisible();
      await waitFor(() =>
        expect(
          eventMocks.candidateLoadRange,
        ).toHaveBeenCalledTimes(year - 2025),
      );
    }

    await user.click(
      screen.getByRole("button", { name: "前年" }),
    );
    await user.click(
      screen.getByRole("button", { name: "前年" }),
    );
    expect(eventMocks.candidateLoadRange).toHaveBeenCalledTimes(4);

    await user.click(
      screen.getByRole("button", { name: "前年" }),
    );
    expect(
      await screen.findByRole("option", {
        name: /部分日食、\d{4}\//,
      }),
    ).toBeVisible();
    expect(
      eventMocks.candidateLoadRange,
    ).toHaveBeenCalledTimes(5);
  });

  it("separates cached forecasts when only the reported observer accuracy changes", async () => {
    const props = panelProps();
    const { rerender } = render(
      <EventForecastPanel {...props} />,
    );

    expect(
      await screen.findByRole("option", {
        name: /部分日食、\d{4}\//,
      }),
    ).toBeVisible();
    expect(eventMocks.candidateLoadRange).toHaveBeenCalledTimes(1);

    rerender(
      <EventForecastPanel
        {...props}
        location={{
          ...props.location,
          horizontalAccuracyMeters: 2_000,
        }}
      />,
    );
    await waitFor(() =>
      expect(
        eventMocks.candidateLoadRange,
      ).toHaveBeenCalledTimes(2),
    );

    rerender(
      <EventForecastPanel {...props} />,
    );
    expect(
      await screen.findByRole("option", {
        name: /部分日食、\d{4}\//,
      }),
    ).toBeVisible();
    expect(eventMocks.candidateLoadRange).toHaveBeenCalledTimes(2);
  });

  it("shows a recoverable error when an active loader unexpectedly throws AbortError", async () => {
    eventMocks.candidateLoadRange
      .mockRejectedValueOnce(
        new DOMException(
          "Synthetic unexpected cancellation",
          "AbortError",
        ),
      )
      .mockResolvedValueOnce([
        candidate(SOLAR_SUMMARY, 2_461_000, 2_461_001),
      ]);
    render(<EventForecastPanel {...panelProps()} />);

    expect(
      await screen.findByText("予報を読み込めませんでした"),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "再試行" }),
    );

    expect(
      await screen.findByRole("option", {
        name: /部分日食、\d{4}\//,
      }),
    ).toBeVisible();
    expect(
      eventMocks.candidateLoadRange,
    ).toHaveBeenCalledTimes(2);
  });

  it("keeps event-only selectors out of the initial stylesheet", () => {
    const initialStylesheet = readFileSync(
      resolve(process.cwd(), "src/styles/index.css"),
      "utf8",
    );
    const eventStylesheet = readFileSync(
      resolve(
        process.cwd(),
        "src/features/events/EventExplorer.css",
      ),
      "utf8",
    );

    expect(initialStylesheet).not.toMatch(/\.event-/);
    expect(eventStylesheet).toContain(".event-explorer");
    expect(eventStylesheet).toContain(".event-year-controls");
    expect(eventStylesheet).toContain("container-type: inline-size");
    expect(eventStylesheet).toContain("white-space: nowrap");
    expect(eventStylesheet).toContain(
      ".event-row[aria-selected=\"true\"]:focus-visible",
    );
  });
});
