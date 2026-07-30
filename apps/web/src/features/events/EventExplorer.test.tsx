import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  EventBodyPosition,
  EventContact,
  EventSummary,
  LocalCircumstances,
} from "../../domain/events/types";
import {
  EventExplorer,
  type EventExplorerProps,
} from "./EventExplorer";

const SOLAR_EVENT: EventSummary = {
  canonicalEpochUtc: new Date("2026-08-12T18:30:12.000Z"),
  dataVersion: "eclipses-2026.1",
  globalClassification: "total",
  id: "solar-2026-08-12",
  kind: "solar-eclipse",
  targetStarHR: null,
  title: "2026年8月12日 皆既日食",
};

const LUNAR_EVENT: EventSummary = {
  canonicalEpochUtc: new Date("2026-08-28T04:12:00.000Z"),
  dataVersion: "eclipses-2026.1",
  globalClassification: "partial",
  id: "lunar-2026-08-28",
  kind: "lunar-eclipse",
  targetStarHR: null,
  title: "2026年8月28日 部分月食",
};

function bodyPosition(
  altitudeDegrees: number,
  azimuthDegrees = 276,
): EventBodyPosition {
  return {
    altitudeAzimuth: {
      altitude: altitudeDegrees * (Math.PI / 180),
      azimuth: azimuthDegrees * (Math.PI / 180),
      azimuthDefined: true,
    },
    angularRadiusRadians: 0.004_65,
    distanceKilometers: 149_600_000,
  };
}

function solarContact(
  phase: EventContact["phase"],
  instantUtc: string,
  altitudeDegrees: number,
  aboveHorizon = true,
  positionAngleDegrees: number | null = null,
): EventContact {
  return {
    aboveHorizon,
    bodies: {
      moon: {
        ...bodyPosition(altitudeDegrees),
        distanceKilometers: 373_000,
      },
      sun: bodyPosition(altitudeDegrees),
    },
    instantUtc: new Date(instantUtc),
    phase,
    positionAngleRadians:
      positionAngleDegrees === null
        ? null
        : positionAngleDegrees * (Math.PI / 180),
  };
}

const SOLAR_C1 = solarContact(
  "solar-c1",
  "2026-08-12T17:38:05.000Z",
  18,
  true,
  286.4,
);
const SOLAR_C2 = solarContact(
  "solar-c2",
  "2026-08-12T18:29:42.000Z",
  8.4,
  true,
  102.1,
);
const SOLAR_MAXIMUM = solarContact(
  "maximum",
  "2026-08-12T18:30:12.000Z",
  8.2,
  true,
);
const SOLAR_C3 = solarContact(
  "solar-c3",
  "2026-08-12T18:30:42.000Z",
  8,
  true,
  281.7,
);
const SOLAR_C4 = solarContact(
  "solar-c4",
  "2026-08-12T19:27:18.000Z",
  -1.8,
  false,
  97.3,
);

const SOLAR_CIRCUMSTANCES: LocalCircumstances = {
  contacts: [SOLAR_C1, SOLAR_C2, SOLAR_MAXIMUM, SOLAR_C3, SOLAR_C4],
  event: SOLAR_EVENT,
  magnitude: 1.012,
  maximum: SOLAR_MAXIMUM,
  obscuration: 1,
  observer: {
    heightMeters: 15,
    horizontalAccuracyMeters: 20,
    latitude: 39.5696,
    locationSource: "device-geolocation",
    longitude: 2.6502,
    name: "パルマ",
    timeZone: "Europe/Madrid",
  },
  provenance: {
    algorithmVersion: "event-core-v1.0.0",
    deltaTModel: "IERS Bulletin A + Espenak/Meeus",
    eopId: "iers-finals-2026-07-29",
    ephemerisId: "JPL DE440s",
    ephemerisSourceSha256:
      "c1b942ea6c6d79f2491f03446a95ca8eb3ea36765c0513d234ac6e70d5c2c704",
    limbProfileId: null,
    lunarRadiusModel: "mean-spherical-limb",
  },
  uncertainty: {
    dominantContributors: [
      "平均月縁",
      "観測地点の水平精度",
    ],
    observerLocationMeters: 20,
    pathKilometers: 1.5,
    tier: "uncertain",
    timingSeconds: 0.8,
  },
  visibility: "partly-visible",
  warnings: [
    "部分食終了（C4）はこの地点では地平線下です。",
    "天候、地形、建物は考慮していません。",
  ],
};

function explorerProps(
  overrides: Partial<EventExplorerProps> = {},
): EventExplorerProps {
  return {
    events: [],
    onGoToContact: () => undefined,
    onGoToMaximum: () => undefined,
    onRestoreObservationTime: () => undefined,
    onRetry: () => undefined,
    onSelectEvent: () => undefined,
    selectedCircumstances: null,
    selectedEventId: null,
    status: "loading",
    timeZone: "Europe/Madrid",
    ...overrides,
  };
}

describe("EventExplorer", () => {
  it("announces loading without exposing stale results", () => {
    render(<EventExplorer {...explorerProps()} />);

    expect(
      screen.getByRole("region", { name: "天文現象を探す" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("status", {
        name: "",
      }),
    ).toHaveTextContent("この地点の現象を計算しています");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("presents a recoverable error and retries on explicit action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <EventExplorer
        {...explorerProps({
          errorMessage:
            "月暦データを検証できませんでした。星図は引き続き利用できます。",
          onRetry,
          status: "error",
        })}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "月暦データを検証できませんでした",
    );
    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("explains a genuine empty result", () => {
    render(
      <EventExplorer
        {...explorerProps({
          status: "empty",
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /この地点と期間では、対応する日食・月食・掩蔽が\s*見つかりませんでした。/,
    );
  });

  it("supports pointer and arrow-key selection in the event list", async () => {
    const user = userEvent.setup();
    const onSelectEvent = vi.fn();
    render(
      <EventExplorer
        {...explorerProps({
          events: [SOLAR_EVENT, LUNAR_EVENT],
          onSelectEvent,
          selectedEventId: SOLAR_EVENT.id,
          status: "ready",
        })}
      />,
    );

    const solarOption = screen.getByRole("option", {
      name: /2026年8月12日 皆既日食/,
    });
    const lunarOption = screen.getByRole("option", {
      name: /2026年8月28日 部分月食/,
    });

    expect(screen.getByRole("listbox", { name: "天文現象" }))
      .toBeInTheDocument();
    expect(solarOption).toHaveAttribute("aria-selected", "true");
    expect(solarOption).toHaveTextContent("2026/08/12 20:30");

    await user.click(solarOption);
    await user.keyboard("{ArrowDown}");

    expect(onSelectEvent).toHaveBeenLastCalledWith(LUNAR_EVENT.id);
    expect(lunarOption).toHaveFocus();
  });

  it("shows local circumstances, safety, uncertainty, and reproducibility", async () => {
    const user = userEvent.setup();
    const onGoToContact = vi.fn();
    const onGoToMaximum = vi.fn();
    const onRestoreObservationTime = vi.fn();
    render(
      <EventExplorer
        {...explorerProps({
          canRestoreObservationTime: true,
          events: [SOLAR_EVENT],
          onGoToContact,
          onGoToMaximum,
          onRestoreObservationTime,
          selectedCircumstances: SOLAR_CIRCUMSTANCES,
          selectedEventId: SOLAR_EVENT.id,
          status: "ready",
        })}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "2026年8月12日 皆既日食",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("一部の経過だけが地平線上です"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("太陽を直接見ないでください"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("2026/08/12 20:30:12"),
    ).toHaveLength(2);
    expect(
      screen.getAllByText("2026/08/12 18:30:12 UTC"),
    ).toHaveLength(2);
    expect(screen.getByText("平均月縁（地形プロファイルなし）"))
      .toBeInTheDocument();
    expect(screen.getByText("不確実性あり")).toBeInTheDocument();
    expect(screen.getByText("1.5 km")).toBeInTheDocument();
    expect(screen.getByText("地平線下")).toBeInTheDocument();
    expect(
      screen.getByText(
        "部分食終了（C4）はこの地点では地平線下です。",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "最大時刻を空に表示" }),
    );
    expect(onGoToMaximum).toHaveBeenCalledWith(SOLAR_MAXIMUM);

    await user.click(
      screen.getByRole("button", {
        name: /部分食終了（C4）、2026\/08\/12 21:27:18を星図に表示/,
      }),
    );
    expect(onGoToContact).toHaveBeenCalledWith(SOLAR_C4);

    await user.click(
      screen.getByRole("button", { name: "元の日時に戻る" }),
    );
    expect(onRestoreObservationTime).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText("計算と再現情報"));
    expect(screen.getByText("event-core-v1.0.0")).toBeInTheDocument();
    expect(screen.getByText("JPL DE440s")).toBeInTheDocument();
    expect(
      screen.getByText(SOLAR_CIRCUMSTANCES.provenance.ephemerisSourceSha256),
    ).toBeInTheDocument();
    expect(
      screen.getByText("未使用（平均月縁）"),
    ).toBeInTheDocument();
  });

  it("does not show solar eye-safety copy for a lunar event", () => {
    const lunarCircumstances: LocalCircumstances = {
      ...SOLAR_CIRCUMSTANCES,
      event: LUNAR_EVENT,
    };
    render(
      <EventExplorer
        {...explorerProps({
          events: [LUNAR_EVENT],
          selectedCircumstances: lunarCircumstances,
          selectedEventId: LUNAR_EVENT.id,
          status: "ready",
        })}
      />,
    );

    expect(
      screen.queryByText("太陽を直接見ないでください"),
    ).not.toBeInTheDocument();
  });
});
