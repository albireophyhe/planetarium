import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  EventBodyPosition,
  EventContact,
  EventPhysicalSample,
  EventSummary,
  LocalCircumstances,
} from "../../domain/events/types";
import {
  EventExplorer,
  type EventExplorerProps,
} from "./EventExplorer";
import type {
  EventSceneSamplingSession,
  EventSceneSamplingState,
} from "./EventSceneSamplingSession";

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

const OCCULTATION_EVENT: EventSummary = {
  canonicalEpochUtc: new Date("2026-09-01T19:05:00.000Z"),
  dataVersion: "occultations-2026.1",
  globalClassification: "occultation",
  id: "occultation-2026-09-01-hr5984",
  kind: "lunar-occultation",
  targetStarHR: 5984,
  title: "月による8 β¹ Scoの掩蔽",
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
  boundaryUncertain: false,
  boundaryUncertaintyReason: null,
  contacts: [SOLAR_C1, SOLAR_C2, SOLAR_MAXIMUM, SOLAR_C3, SOLAR_C4],
  event: SOLAR_EVENT,
  localClassification: "total",
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
    dut1Quality: "observed",
    eopId: "iers-finals-2026-07-29",
    eopRetrievedAt: "2026-07-29T04:05:06.000Z",
    eopSourceSha256:
      "f707ea5031a467f1a3b2f0645fac2f627095ed0cb41d34c515b495cb81a5a25d",
    ephemerisId: "JPL DE440s",
    ephemerisSourceSha256:
      "c1b942ea6c6d79f2491f03446a95ca8eb3ea36765c0513d234ac6e70d5c2c704",
    limbProfileId: null,
    lunarRadiusModel: "mean-spherical-limb",
    polarMotionQuality: "mixed",
  },
  uncertainty: {
    dominantContributors: [
      "平均月縁",
      "観測地点の水平精度",
    ],
    observerLocationMeters: 20,
    pathKilometers: 1.5,
    earthOrientation: {
      combinedPathMeters: 0.46,
      dut1PathMeters: 0.35,
      dut1ReportedErrorSeconds: 0.00075,
      polarMotionPathMeters: 0.11,
      semantics: "iers-reported-error-linear-envelope",
    },
    tier: "uncertain",
    timingSeconds: 0.8,
  },
  visibility: "partly-visible",
  warnings: [
    "部分食終了（C4）はこの地点では地平線下です。",
    "天候、地形、建物は考慮していません。",
  ],
};

function physicalSolarSample(
  instantMilliseconds: number,
): EventPhysicalSample {
  const progress =
    (instantMilliseconds - SOLAR_C1.instantUtc.getTime()) /
    (SOLAR_C4.instantUtc.getTime() -
      SOLAR_C1.instantUtc.getTime());
  return {
    aboveHorizon: true,
    bodies: {
      moon: {
        ...bodyPosition(10, 276.4 - progress * 0.8),
        distanceKilometers: 373_000,
      },
      sun: bodyPosition(10, 276),
    },
    instantUtc: new Date(instantMilliseconds),
    positionAngleRadians: null,
  };
}

function readySceneSampling(): {
  readonly sampleAt: ReturnType<typeof vi.fn>;
  readonly state: EventSceneSamplingState;
} {
  const startMilliseconds = SOLAR_C1.instantUtc.getTime();
  const endMilliseconds = SOLAR_C4.instantUtc.getTime();
  const sampleAt = vi.fn((instantUtc: Date) =>
    physicalSolarSample(instantUtc.getTime()),
  );
  const session: EventSceneSamplingSession = {
    eventId: SOLAR_EVENT.id,
    kind: "solar-eclipse",
    projectionSamples: [
      physicalSolarSample(startMilliseconds),
      physicalSolarSample(SOLAR_MAXIMUM.instantUtc.getTime()),
      physicalSolarSample(endMilliseconds),
    ],
    rangeUtc: {
      endMilliseconds,
      startMilliseconds,
    },
    resource: {
      eopRetrievedAt: "2026-07-29T04:05:06.000Z",
      eopSourceSha256:
        "f707ea5031a467f1a3b2f0645fac2f627095ed0cb41d34c515b495cb81a5a25d",
      ephemerisId: "JPL DE440s",
      ephemerisSourceSha256:
        "c1b942ea6c6d79f2491f03446a95ca8eb3ea36765c0513d234ac6e70d5c2c704",
    },
    sampleAt,
    targetStarHR: null,
  };
  return {
    sampleAt,
    state: { session, status: "ready" },
  };
}

function explorerProps(
  overrides: Partial<EventExplorerProps> = {},
): EventExplorerProps {
  return {
    boundaryUncertaintyReasonsByEventId: new Map(),
    events: [],
    localClassificationsByEventId: new Map(),
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
    const loadingStatus = screen.getByRole("status", {
      name: "",
    });
    expect(loadingStatus).toHaveAttribute("aria-atomic", "true");
    expect(loadingStatus).toHaveTextContent(
      "この地点の現象を計算しています",
    );
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
    expect(
      screen.getByRole("listbox", { name: "天文現象" }),
    ).toHaveAccessibleDescription("2件の天文現象");
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
    ).toHaveLength(3);
    expect(
      screen.getAllByText("2026/08/12 18:30:12 UTC"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("heading", { name: "相対配置" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "2026年8月12日 皆既日食、最大の相対配置",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("角度比例")).toBeInTheDocument();
    expect(
      screen.getByText(
        "保守的な工学上の幅（統計的な信頼区間ではありません）",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("不確実性あり")).toBeInTheDocument();
    expect(screen.getByText("±1.5 km")).toBeInTheDocument();
    expect(screen.getByText("±0.000750秒")).toBeInTheDocument();
    expect(screen.getByText("±0.46 m")).toBeInTheDocument();
    expect(
      screen.getByText(/DUT1 0\.35 m ＋ xp\/yp 0\.11 m/),
    ).toBeInTheDocument();
    expect(screen.getByText("地平線下")).toBeInTheDocument();
    expect(
      screen.getAllByText("高度 +8.2°・方位 276.0°"),
    ).not.toHaveLength(0);
    expect(
      screen.getByText("高度 −1.8°・方位 276.0°"),
    ).toBeInTheDocument();
    expect(screen.getByText("位置角 286.4°")).toBeInTheDocument();
    expect(
      screen.getByText(
        "位置角は太陽円盤中心を基準に、天の北を0°として東回り（0〜360°）",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "部分食終了（C4）はこの地点では地平線下です。",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "最大時刻を空に表示" }),
    );
    expect(onGoToMaximum).toHaveBeenCalledWith(SOLAR_MAXIMUM);
    expect(
      screen.getByText(
        "観測日時を2026/08/12 20:30:12に変更しました。元の日時に戻せます。",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /部分食終了（C4）、2026\/08\/12 21:27:18を星図に表示/,
      }),
    );
    expect(onGoToContact).toHaveBeenCalledWith(SOLAR_C4);
    expect(
      screen.getByRole("img", {
        name: "2026年8月12日 皆既日食、部分食終了（C4）の相対配置",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "観測日時を2026/08/12 21:27:18に変更しました。元の日時に戻せます。",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "元の日時に戻る" }),
    );
    expect(onRestoreObservationTime).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("元の観測日時に戻しました。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "最大時刻を空に表示",
      }),
    ).toHaveFocus();
    expect(
      screen.getByRole("img", {
        name: "2026年8月12日 皆既日食、最大の相対配置",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByText("計算と再現情報"));
    expect(screen.getByText("event-core-v1.0.0")).toBeInTheDocument();
    expect(screen.getByText("JPL DE440s")).toBeInTheDocument();
    expect(
      screen.getByText(SOLAR_CIRCUMSTANCES.provenance.ephemerisSourceSha256),
    ).toBeInTheDocument();
    expect(
      screen.getByText(SOLAR_CIRCUMSTANCES.provenance.eopSourceSha256!),
    ).toBeInTheDocument();
    expect(
      screen.getByText("DUT1：観測値／極運動：観測・予測混在"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(SOLAR_CIRCUMSTANCES.provenance.eopRetrievedAt!),
    ).toBeInTheDocument();
    expect(
      screen.getByText("未使用（平均月縁）"),
    ).toBeInTheDocument();
  });

  it("switches only among solved phases and keeps the static scene honest about sky-time sync", async () => {
    const user = userEvent.setup();
    const onGoToContact = vi.fn();
    const initialProps = explorerProps({
      events: [SOLAR_EVENT],
      observationDate: SOLAR_C2.instantUtc,
      onGoToContact,
      selectedCircumstances: SOLAR_CIRCUMSTANCES,
      selectedEventId: SOLAR_EVENT.id,
      status: "ready",
    });
    const { rerender } = render(<EventExplorer {...initialProps} />);

    expect(
      await screen.findByRole("img", {
        name: "2026年8月12日 皆既日食、中心食開始（C2）の相対配置",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("この静止図は星図と同じ時刻です。"),
    ).toBeInTheDocument();

    const phaseSelect = screen.getByLabelText(
      "相対配置の計算済み時刻",
    );
    const phaseOptions = within(phaseSelect).getAllByRole("option");
    expect(phaseOptions).toHaveLength(5);
    expect(phaseOptions.map((option) => option.textContent)).toEqual([
      "部分食開始（C1） · 2026/08/12 19:38:05",
      "皆既・金環食開始（C2） · 2026/08/12 20:29:42",
      "最大 · 2026/08/12 20:30:12",
      "皆既・金環食終了（C3） · 2026/08/12 20:30:42",
      "部分食終了（C4） · 2026/08/12 21:27:18",
    ]);

    await user.selectOptions(
      phaseSelect,
      `solar-c4:${SOLAR_C4.instantUtc.getTime()}`,
    );
    expect(
      screen.getByRole("img", {
        name: "2026年8月12日 皆既日食、部分食終了（C4）の相対配置",
      }),
    ).toBeInTheDocument();
    expect(onGoToContact).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "この図は計算済み時刻の静止図です。現在の星図時刻とは別です。",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "選択時刻を空に表示",
      }),
    );
    expect(onGoToContact).toHaveBeenCalledTimes(1);
    expect(onGoToContact).toHaveBeenCalledWith(SOLAR_C4);

    onGoToContact.mockClear();
    rerender(
      <EventExplorer
        {...initialProps}
        observationDate={SOLAR_C1.instantUtc}
      />,
    );
    expect(
      await screen.findByRole("img", {
        name: "2026年8月12日 皆既日食、部分食開始（C1）の相対配置",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("この静止図は星図と同じ時刻です。"),
    ).toBeInTheDocument();
    expect(onGoToContact).not.toHaveBeenCalled();

    rerender(
      <EventExplorer
        {...initialProps}
        observationDate={new Date("2026-08-12T17:39:00.000Z")}
      />,
    );
    expect(
      screen.getByRole("img", {
        name: "2026年8月12日 皆既日食、部分食開始（C1）の相対配置",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "この図は計算済み時刻の静止図です。現在の星図時刻とは別です。",
      ),
    ).toBeInTheDocument();

    rerender(
      <EventExplorer
        {...initialProps}
        observationDate={new Date("2026-08-12T17:39:01.000Z")}
      />,
    );
    expect(
      screen.getByRole("img", {
        name: "2026年8月12日 皆既日食、部分食開始（C1）の相対配置",
      }),
    ).toBeInTheDocument();
  });

  it("coalesces scrub input to the latest exact UTC and clears it when a solved phase is selected", () => {
    vi.useFakeTimers();
    try {
      const { sampleAt, state } = readySceneSampling();
      const onGoToContact = vi.fn();
      render(
        <EventExplorer
          {...explorerProps({
            events: [SOLAR_EVENT],
            onGoToContact,
            sceneSampling: state,
            selectedCircumstances: SOLAR_CIRCUMSTANCES,
            selectedEventId: SOLAR_EVENT.id,
            status: "ready",
          })}
        />,
      );
      const range = screen.getByLabelText(
        "シミュレーション時刻",
      );
      const firstRequest =
        SOLAR_MAXIMUM.instantUtc.getTime() + 61_000;
      const latestRequest = firstRequest + 12_000;

      fireEvent.change(range, {
        target: { value: String(firstRequest) },
      });
      fireEvent.change(range, {
        target: { value: String(latestRequest) },
      });

      expect(sampleAt).not.toHaveBeenCalled();
      expect(
        screen.getByText("物理計算を更新中"),
      ).toBeInTheDocument();
      const showOnSkyButton = screen.getByRole("button", {
        name: "選択時刻を空に表示",
      });
      expect(showOnSkyButton).toBeDisabled();
      fireEvent.click(showOnSkyButton);
      expect(onGoToContact).not.toHaveBeenCalled();
      expect(
        screen.getByRole("img", {
          name: "2026年8月12日 皆既日食、最大の相対配置",
        }),
      ).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(99));
      expect(sampleAt).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));

      expect(sampleAt).toHaveBeenCalledTimes(1);
      expect(
        (sampleAt.mock.calls[0]?.[0] as Date).getTime(),
      ).toBe(latestRequest);
      expect(
        screen.getByRole("img", {
          name: "2026年8月12日 皆既日食、指定時刻の相対配置",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "この図は物理再計算した指定時刻です。現在の星図時刻とは別です。",
        ),
      ).toBeInTheDocument();

      fireEvent.click(
        showOnSkyButton,
      );
      expect(
        onGoToContact.mock.calls[0]?.[0].instantUtc.getTime(),
      ).toBe(latestRequest);

      sampleAt.mockImplementationOnce(() => {
        throw new RangeError("synthetic sampler failure");
      });
      fireEvent.change(range, {
        target: { value: String(latestRequest + 10_000) },
      });
      act(() => vi.advanceTimersByTime(100));
      expect(
        screen.getByText(/指定時刻の物理配置を計算できませんでした/),
      ).toHaveAttribute("role", "alert");
      expect(
        screen.getByRole("img", {
          name: "2026年8月12日 皆既日食、指定時刻の相対配置",
        }),
      ).toBeInTheDocument();

      fireEvent.change(
        screen.getByLabelText("相対配置の計算済み時刻"),
        {
          target: {
            value: `solar-c1:${SOLAR_C1.instantUtc.getTime()}`,
          },
        },
      );
      expect(
        screen.getByRole("img", {
          name: "2026年8月12日 皆既日食、部分食開始（C1）の相対配置",
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("img", { name: /指定時刻/ }),
      ).not.toBeInTheDocument();
      expect(sampleAt).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("plays the physical overview at about 10 fps, clamps at the end, and stays paused when hidden", () => {
    vi.useFakeTimers();
    try {
      const { sampleAt, state } = readySceneSampling();
      render(
        <EventExplorer
          {...explorerProps({
            events: [SOLAR_EVENT],
            sceneSampling: state,
            selectedCircumstances: SOLAR_CIRCUMSTANCES,
            selectedEventId: SOLAR_EVENT.id,
            status: "ready",
          })}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: "シミュレーションを再生",
        }),
      );
      expect(
        (sampleAt.mock.calls[0]?.[0] as Date).getTime(),
      ).toBe(SOLAR_C1.instantUtc.getTime());
      expect(
        screen.getByRole("button", {
          name: "シミュレーションを一時停止",
        }),
      ).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(100));
      expect(sampleAt).toHaveBeenCalledTimes(2);
      const expectedPlaybackStep = Math.ceil(
        (SOLAR_C4.instantUtc.getTime() -
          SOLAR_C1.instantUtc.getTime()) /
          240,
      );
      expect(
        (sampleAt.mock.calls[1]?.[0] as Date).getTime(),
      ).toBe(
        SOLAR_C1.instantUtc.getTime() + expectedPlaybackStep,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: "シミュレーションを一時停止",
        }),
      );
      const pausedCallCount = sampleAt.mock.calls.length;
      act(() => vi.advanceTimersByTime(500));
      expect(sampleAt).toHaveBeenCalledTimes(pausedCallCount);

      fireEvent.click(
        screen.getByRole("button", {
          name: "シミュレーションを再生",
        }),
      );
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      fireEvent(document, new Event("visibilitychange"));
      expect(
        screen.getByRole("button", {
          name: "シミュレーションを再生",
        }),
      ).toBeInTheDocument();
      const hiddenCallCount = sampleAt.mock.calls.length;
      act(() => vi.advanceTimersByTime(500));
      expect(sampleAt).toHaveBeenCalledTimes(hiddenCallCount);
      Reflect.deleteProperty(document, "hidden");

      const endMilliseconds = SOLAR_C4.instantUtc.getTime();
      fireEvent.change(
        screen.getByLabelText("シミュレーション時刻"),
        {
          target: { value: String(endMilliseconds - 500) },
        },
      );
      act(() => vi.advanceTimersByTime(100));
      fireEvent.click(
        screen.getByRole("button", {
          name: "シミュレーションを再生",
        }),
      );
      act(() => vi.advanceTimersByTime(100));

      const lastSampleCall =
        sampleAt.mock.calls.at(-1)?.[0] as Date;
      expect(lastSampleCall.getTime()).toBe(endMilliseconds);
      const replayButton = screen.getByRole("button", {
        name: "シミュレーションを最初から再生",
      });
      expect(replayButton).toBeEnabled();
      expect(screen.getByText("最初から再生")).toBeInTheDocument();

      fireEvent.click(replayButton);
      expect(
        (sampleAt.mock.calls.at(-1)?.[0] as Date).getTime(),
      ).toBe(SOLAR_C1.instantUtc.getTime());
      expect(
        screen.getByRole("button", {
          name: "シミュレーションを一時停止",
        }),
      ).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(document, "hidden");
      vi.useRealTimers();
    }
  });

  it("stops physical playback when its mounted feature panel becomes inactive", () => {
    vi.useFakeTimers();
    try {
      const { sampleAt, state } = readySceneSampling();
      const props = explorerProps({
        events: [SOLAR_EVENT],
        isActive: true,
        sceneSampling: state,
        selectedCircumstances: SOLAR_CIRCUMSTANCES,
        selectedEventId: SOLAR_EVENT.id,
        status: "ready",
      });
      const { rerender } = render(
        <EventExplorer {...props} />,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: "シミュレーションを再生",
        }),
      );
      expect(
        screen.getByRole("button", {
          name: "シミュレーションを一時停止",
        }),
      ).toBeInTheDocument();

      rerender(
        <EventExplorer
          {...props}
          isActive={false}
        />,
      );
      expect(
        screen.getByRole("button", {
          name: "シミュレーションを再生",
        }),
      ).toBeInTheDocument();
      const inactiveCallCount =
        sampleAt.mock.calls.length;
      act(() => vi.advanceTimersByTime(500));
      expect(sampleAt).toHaveBeenCalledTimes(
        inactiveCallCount,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables automatic playback when reduced motion is requested", () => {
    const matchMedia = vi.fn(() => ({
      addEventListener: vi.fn(),
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);
    try {
      const { state } = readySceneSampling();
      render(
        <EventExplorer
          {...explorerProps({
            events: [SOLAR_EVENT],
            sceneSampling: state,
            selectedCircumstances: SOLAR_CIRCUMSTANCES,
            selectedEventId: SOLAR_EVENT.id,
            status: "ready",
          })}
        />,
      );

      expect(
        screen.getByRole("button", {
          name: "シミュレーションを再生",
        }),
      ).toBeDisabled();
      expect(
        screen.getByText(/視差効果を減らす.*自動再生は停止/, {
          exact: false,
        }),
      ).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("drops arbitrary selection and playback when a same-event sampling session is replaced", () => {
    vi.useFakeTimers();
    try {
      const firstSampling = readySceneSampling();
      const baseProps = explorerProps({
        events: [SOLAR_EVENT],
        sceneSampling: firstSampling.state,
        selectedCircumstances: SOLAR_CIRCUMSTANCES,
        selectedEventId: SOLAR_EVENT.id,
        status: "ready",
      });
      const { rerender } = render(
        <EventExplorer {...baseProps} />,
      );
      fireEvent.change(
        screen.getByLabelText("シミュレーション時刻"),
        {
          target: {
            value: String(
              SOLAR_MAXIMUM.instantUtc.getTime() + 30_000,
            ),
          },
        },
      );
      act(() => vi.advanceTimersByTime(100));
      expect(
        screen.getByRole("img", {
          name: "2026年8月12日 皆既日食、指定時刻の相対配置",
        }),
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", {
          name: "シミュレーションを再生",
        }),
      );

      const replacementSampling = readySceneSampling();
      rerender(
        <EventExplorer
          {...baseProps}
          sceneSampling={replacementSampling.state}
        />,
      );

      expect(
        screen.getByRole("img", {
          name: "2026年8月12日 皆既日食、最大の相対配置",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: "シミュレーションを再生",
        }),
      ).toBeInTheDocument();
      const oldCallCount = firstSampling.sampleAt.mock.calls.length;
      act(() => vi.advanceTimersByTime(500));
      expect(firstSampling.sampleAt).toHaveBeenCalledTimes(
        oldCallCount,
      );
      expect(replacementSampling.sampleAt).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("states whether continuous physical sampling is unavailable, loading, or failed", () => {
    const onRetrySceneSampling = vi.fn();
    const baseProps = explorerProps({
      events: [SOLAR_EVENT],
      onRetrySceneSampling,
      selectedCircumstances: SOLAR_CIRCUMSTANCES,
      selectedEventId: SOLAR_EVENT.id,
      status: "ready",
    });
    const { rerender } = render(<EventExplorer {...baseProps} />);
    expect(
      screen.getByText(/任意時刻の物理シミュレーションを利用できません/),
    ).toBeInTheDocument();

    rerender(
      <EventExplorer
        {...baseProps}
        sceneSampling={{ session: null, status: "loading" }}
      />,
    );
    expect(
      screen.getByText(/物理サンプルと固定画角を準備しています/),
    ).toHaveAttribute("role", "status");

    const mismatchedSampling = readySceneSampling();
    if (mismatchedSampling.state.status !== "ready") {
      throw new Error("Expected ready scene sampling");
    }
    rerender(
      <EventExplorer
        {...baseProps}
        sceneSampling={{
          session: {
            ...mismatchedSampling.state.session,
            targetStarHR: 5984,
          },
          status: "ready",
        }}
      />,
    );
    expect(
      screen.getByText(/選択中の現象と一致しません/),
    ).toHaveAttribute("role", "alert");
    expect(
      screen.queryByLabelText("シミュレーション時刻"),
    ).not.toBeInTheDocument();

    rerender(
      <EventExplorer
        {...baseProps}
        sceneSampling={{
          errorMessage:
            "連続シミュレーションを準備できませんでした。",
          session: null,
          status: "error",
        }}
      />,
    );
    expect(
      screen.getByText(
        "連続シミュレーションを準備できませんでした。",
      ),
    ).toHaveAttribute("role", "alert");
    fireEvent.click(
      screen.getByRole("button", { name: "再準備" }),
    );
    expect(onRetrySceneSampling).toHaveBeenCalledTimes(1);
  });

  it("discloses an outside-coverage EOP fallback without inventing source metadata", async () => {
    const user = userEvent.setup();
    render(
      <EventExplorer
        {...explorerProps({
          events: [SOLAR_EVENT],
          selectedCircumstances: {
            ...SOLAR_CIRCUMSTANCES,
            provenance: {
              ...SOLAR_CIRCUMSTANCES.provenance,
              dut1Quality: "outside-coverage",
              eopId: "IERS EOP収録外",
              eopRetrievedAt: null,
              eopSourceSha256: null,
              polarMotionQuality: "outside-coverage",
            },
          },
          selectedEventId: SOLAR_EVENT.id,
          status: "ready",
        })}
      />,
    );

    await user.click(screen.getByText("計算と再現情報"));
    expect(
      screen.getByText("DUT1：収録外／極運動：収録外"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("なし（IERS EOP収録外）"),
    ).toHaveLength(2);
  });

  it("clears a stale time-change announcement when the selected event changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <EventExplorer
        {...explorerProps({
          events: [SOLAR_EVENT],
          selectedCircumstances: SOLAR_CIRCUMSTANCES,
          selectedEventId: SOLAR_EVENT.id,
          status: "ready",
        })}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "最大時刻を空に表示",
      }),
    );
    expect(
      screen.getByText(
        "観測日時を2026/08/12 20:30:12に変更しました。元の日時に戻せます。",
      ),
    ).toBeInTheDocument();

    rerender(
      <EventExplorer
        {...explorerProps({
          events: [LUNAR_EVENT],
          selectedCircumstances: {
            ...SOLAR_CIRCUMSTANCES,
            event: LUNAR_EVENT,
            localClassification: "partial",
          },
          selectedEventId: LUNAR_EVENT.id,
          status: "ready",
        })}
      />,
    );

    expect(
      screen.queryByText(
        "観測日時を2026/08/12 20:30:12に変更しました。元の日時に戻せます。",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows physical-boundary uncertainty independently from horizon visibility", () => {
    const { rerender } = render(
      <EventExplorer
        {...explorerProps({
          boundaryUncertaintyReasonsByEventId: new Map([
            [SOLAR_EVENT.id, "solar-occurrence"],
          ]),
          events: [SOLAR_EVENT],
          selectedCircumstances: {
            ...SOLAR_CIRCUMSTANCES,
            boundaryUncertain: true,
            boundaryUncertaintyReason: "solar-occurrence",
            contacts: [SOLAR_MAXIMUM],
            visibility: "partly-visible",
          },
          selectedEventId: SOLAR_EVENT.id,
          status: "ready",
        })}
      />,
    );

    expect(
      screen.getByText("一部の経過だけが地平線上です"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "物理境界帯内のため、この地点で日食が起きるかは未確定です。",
      ),
    ).toHaveAttribute("role", "note");
    expect(
      screen.getByRole("heading", {
        name: "2026年8月12日 日食候補（発生未確定）",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", {
        name: /日食候補（発生未確定）、2026\/08\/12 20:30/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "最大時刻" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "最大時刻を空に表示",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("最大の現地時刻")).toBeInTheDocument();
    expect(screen.queryByText(/最接近/)).not.toBeInTheDocument();

    rerender(
      <EventExplorer
        {...explorerProps({
          boundaryUncertaintyReasonsByEventId: new Map([
            [SOLAR_EVENT.id, "solar-occurrence"],
          ]),
          events: [SOLAR_EVENT],
          selectedCircumstances: {
            ...SOLAR_CIRCUMSTANCES,
            boundaryUncertain: true,
            boundaryUncertaintyReason: "solar-occurrence",
            contacts: [SOLAR_MAXIMUM],
            visibility: "below-horizon",
          },
          selectedEventId: SOLAR_EVENT.id,
          status: "ready",
        })}
      />,
    );

    expect(
      screen.getByText("全経過が地平線下です"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "物理境界帯内のため、この地点で日食が起きるかは未確定です。",
      ),
    ).toHaveAttribute("role", "note");
  });

  it("distinguishes a certain solar eclipse with uncertain central contacts", () => {
    render(
      <EventExplorer
        {...explorerProps({
          boundaryUncertaintyReasonsByEventId: new Map([
            [SOLAR_EVENT.id, "solar-central-classification"],
          ]),
          events: [SOLAR_EVENT],
          localClassificationsByEventId: new Map([
            [SOLAR_EVENT.id, "partial"],
          ]),
          selectedCircumstances: {
            ...SOLAR_CIRCUMSTANCES,
            boundaryUncertain: true,
            boundaryUncertaintyReason:
              "solar-central-classification",
            contacts: [SOLAR_C1, SOLAR_MAXIMUM, SOLAR_C4],
            localClassification: "partial",
          },
          selectedEventId: SOLAR_EVENT.id,
          status: "ready",
        })}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "2026年8月12日 部分日食",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "中心食の物理境界帯内です。日食は起きますが、中心食（皆既・金環）になるかと第2・第3接触は未確定です。",
      ),
    ).toHaveAttribute("role", "note");
    expect(
      screen.getByRole("table", { name: "接触時刻" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "最大時刻を空に表示",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/日食候補（発生未確定）/),
    ).not.toBeInTheDocument();
  });

  it("presents an uncertain mean-limb occultation as a closest-approach candidate", () => {
    const occultationCircumstances: LocalCircumstances = {
      ...SOLAR_CIRCUMSTANCES,
      boundaryUncertain: true,
      boundaryUncertaintyReason: "occultation-occurrence",
      contacts: [SOLAR_MAXIMUM],
      event: OCCULTATION_EVENT,
      localClassification: "occultation",
      magnitude: null,
      obscuration: null,
    };
    render(
      <EventExplorer
        {...explorerProps({
          boundaryUncertaintyReasonsByEventId: new Map([
            [OCCULTATION_EVENT.id, "occultation-occurrence"],
          ]),
          events: [OCCULTATION_EVENT],
          localClassificationsByEventId: new Map([
            [OCCULTATION_EVENT.id, "occultation"],
          ]),
          selectedCircumstances: occultationCircumstances,
          selectedEventId: OCCULTATION_EVENT.id,
          status: "ready",
        })}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "月による8 β¹ Scoの掩蔽候補（発生未確定）",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "平均月縁の物理境界帯内のため、この地点で掩蔽が起きるかは未確定です。",
      ),
    ).toHaveAttribute("role", "note");
    expect(
      screen.getByRole("table", { name: "最接近時刻" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "最接近時刻を空に表示",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("最接近のUTC")).toBeInTheDocument();
    expect(
      screen.getByRole("option", {
        name: "最接近 · 2026/08/12 20:30:12",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("最大のUTC"),
    ).not.toBeInTheDocument();
  });

  it("shows the observer-local solar classification without replacing the global candidate classification", async () => {
    const user = userEvent.setup();
    const localCircumstances: LocalCircumstances = {
      ...SOLAR_CIRCUMSTANCES,
      localClassification: "partial",
    };
    render(
      <EventExplorer
        {...explorerProps({
          events: [SOLAR_EVENT],
          localClassificationsByEventId: new Map([
            [SOLAR_EVENT.id, "partial"],
          ]),
          selectedCircumstances: localCircumstances,
          selectedEventId: SOLAR_EVENT.id,
          status: "ready",
        })}
      />,
    );

    expect(
      screen.getByRole("option", {
        name: /2026年8月12日 部分日食、2026\/08\/12 20:30/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "2026年8月12日 部分日食",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByText("計算と再現情報"));
    expect(
      screen.getByText("候補の全球分類").parentElement,
    ).toHaveTextContent("皆既日食");
    expect(
      screen.getByText("この地点での分類").parentElement,
    ).toHaveTextContent("部分日食");
    expect(localCircumstances.event.globalClassification).toBe(
      "total",
    );
  });

  it("does not show solar eye-safety copy for a lunar event", () => {
    const lunarCircumstances: LocalCircumstances = {
      ...SOLAR_CIRCUMSTANCES,
      event: LUNAR_EVENT,
      localClassification: "partial",
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
    expect(screen.getAllByText("本影食分")).toHaveLength(2);
  });

  it("identifies the magnitude convention for a penumbral eclipse", () => {
    const penumbralEvent: EventSummary = {
      ...LUNAR_EVENT,
      globalClassification: "penumbral",
      id: "lunar-2027-02-20",
      title: "2027年2月20日 半影月食",
    };
    const circumstances: LocalCircumstances = {
      ...SOLAR_CIRCUMSTANCES,
      event: penumbralEvent,
      localClassification: "penumbral",
      magnitude: 0.927,
      obscuration: null,
    };
    render(
      <EventExplorer
        {...explorerProps({
          events: [penumbralEvent],
          selectedCircumstances: circumstances,
          selectedEventId: penumbralEvent.id,
          status: "ready",
        })}
      />,
    );

    expect(screen.getAllByText("半影食分")).toHaveLength(2);
    expect(screen.queryByText("本影食分")).not.toBeInTheDocument();
  });
});
