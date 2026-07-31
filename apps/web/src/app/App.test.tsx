import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  calculateApparentSunPositionWithContextV2,
  calculateLightweightApparentStarPositionWithContextV2,
  createApparentPositionContextV2,
  horizontalToProjection,
  loadPrecisionStarCatalogV2,
  radiansToDegrees,
} from "../domain";
import { cities } from "../domain/catalogMetadata";
import { App } from "./App";

const trackCalculationSpy = vi.hoisted(() => vi.fn());
const dut1LookupAtSpy = vi.hoisted(() => vi.fn());
const dut1RetrySpy = vi.hoisted(() => vi.fn());
const dut1HookDateSpy = vi.hoisted(() => vi.fn());
const eventPanelRenderSpy = vi.hoisted(() => vi.fn());
const dut1HookState = vi.hoisted(() => ({
  estimate: {
    dut1: {
      seconds: 0.042_125,
      source: "predicted" as const,
      reportedErrorSeconds: 0.001_2,
    },
    polarMotion: {
      xpRadians: 1e-6,
      ypRadians: 2e-6,
      xpReportedErrorRadians: 1e-9,
      ypReportedErrorRadians: 2e-9,
      source: "predicted" as const,
      usesPrediction: true,
    },
  } as {
    dut1: {
      seconds: number;
      source: "predicted";
      reportedErrorSeconds: number;
    };
    polarMotion: {
      xpRadians: number;
      ypRadians: number;
      xpReportedErrorRadians: number;
      ypReportedErrorRadians: number;
      source: "predicted";
      usesPrediction: boolean;
    };
  } | null,
  isCurrent: true,
  settledInstantMs: "requested" as "requested" | number | null,
  settledStatus: "ready" as "error" | "ready" | "unavailable",
  sourceIdentifier: "IERS test-old-source" as string | null,
  status: "ready" as
    | "error"
    | "loading"
    | "ready"
    | "refreshing"
    | "unavailable",
}));

vi.mock("./useIersEarthOrientation", () => ({
  useIersEarthOrientation: (date: Date) => {
    dut1HookDateSpy(new Date(date.getTime()));
    const settledInstantMs =
      dut1HookState.settledInstantMs === "requested"
        ? date.getTime()
        : dut1HookState.settledInstantMs;
    const settledStatus =
      dut1HookState.status === "ready" ||
      dut1HookState.status === "error" ||
      dut1HookState.status === "unavailable"
        ? dut1HookState.status
        : dut1HookState.settledStatus;
    const isCurrent =
      dut1HookState.isCurrent &&
      settledInstantMs === date.getTime();
    return {
      estimate: isCurrent
        ? dut1HookState.estimate
        : null,
      isCurrent,
      lookupAt: dut1LookupAtSpy,
      retry: dut1RetrySpy,
      settledFrame:
        settledInstantMs === null
          ? null
          : {
              estimate: dut1HookState.estimate,
              instantMs: settledInstantMs,
              sourceIdentifier:
                dut1HookState.sourceIdentifier,
              status: settledStatus,
            },
      sourceIdentifier: isCurrent
        ? dut1HookState.sourceIdentifier
        : null,
      status: dut1HookState.status,
    };
  },
}));

function createAnimationFrames() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const requestAnimationFrame = vi.fn(
    (callback: FrameRequestCallback) => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
  );
  const cancelAnimationFrame = vi.fn((id: number) => {
    callbacks.delete(id);
  });

  return {
    cancelAnimationFrame,
    requestAnimationFrame,
    runNext(now: number) {
      const entry = callbacks.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      if (!entry) {
        throw new Error("No animation frame was scheduled");
      }
      const [id, callback] = entry;
      callbacks.delete(id);
      callback(now);
    },
  };
}

vi.mock("./selectedStarTrack", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./selectedStarTrack")>();
  return {
    ...actual,
    calculateSelectedStarTrack: (
      ...args: Parameters<typeof actual.calculateSelectedStarTrack>
    ) => {
      trackCalculationSpy(...args);
      return actual.calculateSelectedStarTrack(...args);
    },
  };
});

type MockEventPanelProps = {
  canRestoreObservationTime: boolean;
  isActive: boolean;
  observationDate: Date;
  onRestoreObservationTime: () => void;
  onShowEventTime: (date: Date, eventTitle: string) => void;
};

vi.mock("../features/events/EventForecastPanel", () => ({
  EventForecastPanel: (props: MockEventPanelProps) => {
    eventPanelRenderSpy(props);
    return (
      <section aria-label="テスト用天文現象予報">
        <time dateTime={props.observationDate.toISOString()}>
          {props.observationDate.toISOString()}
        </time>
        <button
          onClick={() =>
            props.onShowEventTime(
              new Date("2026-08-12T17:45:54.000Z"),
              "テスト皆既日食",
            )
          }
          type="button"
        >
          テスト最大時刻を空に表示
        </button>
        {props.canRestoreObservationTime ? (
          <button
            onClick={props.onRestoreObservationTime}
            type="button"
          >
            テスト元の日時に戻る
          </button>
        ) : null}
      </section>
    );
  },
}));

vi.mock("../features/location/LocationDialog", () => ({
  LocationDialog: ({ open }: { open: boolean }) =>
    open ? (
      <div aria-label="観測地点" role="dialog">
        <h2>観測地点</h2>
      </div>
    ) : null,
}));

vi.mock("../features/sky/SkyViewport", () => ({
  SkyViewport: ({
    onDrawError,
    onSelect,
    selectedStarTrack,
    solarPosition,
    stars,
  }: {
    onDrawError: (
      source: "2d" | "3d",
      message: string | null,
    ) => void;
    onSelect: (hr: number) => void;
    selectedStarTrack: import("./types").SelectedStarTrack | null;
    solarPosition: import("./types").SkySolarPosition;
    stars: readonly import("./types").SkyStar[];
  }) => (
    <div>
      <output data-testid="representative-star-position-prop">
        {(() => {
          const star = stars.find(({ hr }) => hr === 7001);
          return star
            ? [
                star.altitudeDeg,
                star.azimuthDeg,
                star.projectionX,
                star.projectionY,
              ].join("|")
            : "";
        })()}
      </output>
      <output data-testid="solar-position-prop">
        {[
          solarPosition.altitudeDeg,
          solarPosition.azimuthDeg,
          solarPosition.projectionX,
          solarPosition.projectionY,
        ].join("|")}
      </output>
      <output data-testid="selected-track-point-count">
        {selectedStarTrack?.points.length ?? 0}
      </output>
      <output data-testid="selected-track-center-time">
        {selectedStarTrack?.points.find(
          (point) => point.relativeMinutes === 0,
        )?.observedAtIso ?? ""}
      </output>
      <output data-testid="selected-track-eop-fallback-count">
        {selectedStarTrack?.earthOrientationProvenance
          .auxiliaryFallbackSampleCount ?? ""}
      </output>
      <output data-testid="selected-track-eop-fallback-present">
        {(selectedStarTrack?.earthOrientationProvenance
          .auxiliaryFallbackSampleCount ?? 0) > 0
          ? "yes"
          : selectedStarTrack
            ? "no"
            : ""}
      </output>
      <output data-testid="selected-track-eop-center-status">
        {selectedStarTrack?.earthOrientationProvenance
          .centerStatus ?? ""}
      </output>
      <button onClick={() => onSelect(7001)} type="button">
        星図でベガを選択
      </button>
      <button
        onClick={() => onDrawError("2d", "2D描画エラー")}
        type="button"
      >
        2D描画エラーを通知
      </button>
      <button
        onClick={() => onDrawError("2d", null)}
        type="button"
      >
        2D準備完了を通知
      </button>
      <button
        onClick={() => onDrawError("3d", "3D描画エラー")}
        type="button"
      >
        3D描画エラーを通知
      </button>
      <button
        onClick={() => onDrawError("3d", null)}
        type="button"
      >
        3D準備完了を通知
      </button>
    </div>
  ),
}));

afterEach(() => {
  window.history.replaceState(null, "", "/sky");
  document.title = "Planetarium";
});

describe("App selection announcements", () => {
  beforeEach(() => {
    dut1HookState.estimate = {
      dut1: {
        seconds: 0.042_125,
        source: "predicted",
        reportedErrorSeconds: 0.001_2,
      },
      polarMotion: {
        xpRadians: 1e-6,
        ypRadians: 2e-6,
        xpReportedErrorRadians: 1e-9,
        ypReportedErrorRadians: 2e-9,
        source: "predicted",
        usesPrediction: true,
      },
    };
    dut1HookState.isCurrent = true;
    dut1HookState.settledInstantMs = "requested";
    dut1HookState.settledStatus = "ready";
    dut1HookState.sourceIdentifier = "IERS test-old-source";
    dut1HookState.status = "ready";
    dut1LookupAtSpy.mockReset();
    dut1LookupAtSpy.mockImplementation(
      async () => dut1HookState.estimate,
    );
    dut1RetrySpy.mockClear();
    dut1HookDateSpy.mockClear();
    trackCalculationSpy.mockClear();
    eventPanelRenderSpy.mockClear();
  });

  it("upgrades the rendered sky to the lazy precision-v2 catalog", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByText(
        /精密計算 v2・大気差なし/,
      ),
    ).toBeVisible();
    await user.click(
      screen.getByText("計算情報", { selector: "summary" }),
    );
    expect(
      screen.getByText(
        /年周視差（収録星）／太陽光偏向・年周・日周光行差・幾何高度/,
      ),
    ).toBeVisible();
    expect(document.querySelector(".app-shell")).toHaveAttribute(
      "data-calculation-model",
      "v2",
    );
    expect(
      screen.getByText(/太陽高度[−-]?\d+\.\d°/),
    ).toBeVisible();
    expect(
      screen
        .getByTestId("solar-position-prop")
        .textContent?.split("|")
        .map(Number)
        .every(Number.isFinite),
    ).toBe(true);
    expect(
      screen.queryByLabelText("選択星の追跡状態"),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("option")
        .some((option) => option.getAttribute("aria-selected") === "true"),
    ).toBe(true);

    await user.click(
      screen.getByRole("button", { name: "星図でベガを選択" }),
    );
    await user.click(
      screen.getByText("詳しい情報", { selector: "summary" }),
    );
    expect(screen.getByText(/精密モデル v2/)).toBeVisible();
    expect(screen.getByText("見かけ赤経（観測日）")).toBeVisible();
    expect(screen.getByText("年周視差")).toBeVisible();
    expect(
      screen.getAllByText("適用（VSOP2000 200項地球暦）"),
    ).toHaveLength(2);
    expect(
      screen.getByText(
        "+0.042125秒（IERS予測値・IERS公表誤差±0.001200秒）",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(/IERS EOP予測値（DUT1・極運動）/),
    ).toBeVisible();
  });

  it("keeps precision JSON unavailable until the first EOP frame settles", async () => {
    dut1HookState.estimate = null;
    dut1HookState.isCurrent = false;
    dut1HookState.settledInstantMs = null;
    dut1HookState.sourceIdentifier = null;
    dut1HookState.status = "loading";
    render(<App />);

    expect(
      await screen.findByText(
        "IERS準備中（DUT1・極運動は0近似）・簡易計算",
      ),
    ).toBeVisible();
    expect(document.querySelector(".app-shell")).toHaveAttribute(
      "data-calculation-model",
      "v1",
    );
    expect(
      await screen.findByRole("button", { name: "JSONをコピー" }),
    ).toBeDisabled();
  });

  it("publishes UTC, EOP, source, sky, and JSON as one settled frame across UTC midnight", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { rerender } = render(<App />);
    const input = screen.getByLabelText("観測日時（Asia/Tokyo）");
    const readout = document.querySelector(
      ".playback-readout time",
    );

    fireEvent.change(input, {
      target: { value: "2026-07-30T08:59:59" },
    });
    await waitFor(() =>
      expect(readout).toHaveAttribute(
        "datetime",
        "2026-07-29T23:59:59.000Z",
      ),
    );
    await screen.findByText(/精密計算 v2/);
    const representativeStarPosition = screen.getByTestId(
      "representative-star-position-prop",
    );
    const solarPosition = screen.getByTestId(
      "solar-position-prop",
    );
    const oldStarPosition =
      representativeStarPosition.textContent ?? "";
    const oldSolarPosition = solarPosition.textContent ?? "";
    const oldStarValues = oldStarPosition.split("|").map(Number);
    const oldSolarValues = oldSolarPosition.split("|").map(Number);
    expect(oldStarValues).toHaveLength(4);
    expect(oldStarValues.every(Number.isFinite)).toBe(true);
    expect(oldSolarValues).toHaveLength(4);
    expect(oldSolarValues.every(Number.isFinite)).toBe(true);

    const oldInstant = Date.parse("2026-07-29T23:59:59.000Z");
    dut1HookState.isCurrent = false;
    dut1HookState.settledInstantMs = oldInstant;
    dut1HookState.settledStatus = "ready";
    dut1HookState.status = "loading";
    fireEvent.change(input, {
      target: { value: "2026-07-30T09:00:00" },
    });

    expect(readout).toHaveAttribute(
      "datetime",
      "2026-07-29T23:59:59.000Z",
    );
    expect(input).toHaveValue("2026-07-30T08:59:59.000");
    expect(
      screen.getByText(
        /更新中（直前の整合済み結果）/,
      ),
    ).toBeVisible();
    expect(document.querySelector(".app-shell")).toHaveAttribute(
      "data-calculation-model",
      "v2",
    );
    expect(representativeStarPosition.textContent).toBe(
      oldStarPosition,
    );
    expect(solarPosition.textContent).toBe(oldSolarPosition);

    await user.click(
      screen.getByRole("button", { name: "JSONをコピー" }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const oldProfile = JSON.parse(
      writeText.mock.calls[0]?.[0] as string,
    );
    expect(oldProfile.observation.utc).toBe(
      "2026-07-29T23:59:59.000Z",
    );
    expect(oldProfile.earthOrientation.sourceIdentifier).toBe(
      "IERS test-old-source",
    );

    dut1HookState.estimate = {
      ...dut1HookState.estimate!,
      dut1: {
        ...dut1HookState.estimate!.dut1,
        seconds: 0.052_5,
      },
    };
    dut1HookState.isCurrent = true;
    dut1HookState.settledInstantMs = Date.parse(
      "2026-07-30T00:00:00.000Z",
    );
    dut1HookState.sourceIdentifier = "IERS test-new-source";
    dut1HookState.status = "ready";
    const newPublishedDate = new Date(
      "2026-07-30T00:00:00.000Z",
    );
    const newPublishedEstimate = dut1HookState.estimate;
    const tokyo = cities.find(({ id }) => id === "tokyo");
    const precisionCatalog = await loadPrecisionStarCatalogV2();
    const representativeStar = precisionCatalog.starByHR.get(7001);
    if (!newPublishedEstimate || !tokyo || !representativeStar) {
      throw new Error(
        "UTC midnight regression fixture is incomplete",
      );
    }
    const expectedContext = createApparentPositionContextV2(
      newPublishedDate,
      tokyo,
      {
        diurnalAberration: { heightMeters: 0 },
        earthOrientation: {
          dut1Seconds: newPublishedEstimate.dut1.seconds,
          dut1Source: "iers-predicted",
          dut1UncertaintySeconds:
            newPublishedEstimate.dut1.reportedErrorSeconds,
          polarMotion: {
            source: "iers-predicted",
            xpRadians:
              newPublishedEstimate.polarMotion.xpRadians,
            xpReportedErrorRadians:
              newPublishedEstimate.polarMotion
                .xpReportedErrorRadians,
            ypRadians:
              newPublishedEstimate.polarMotion.ypRadians,
            ypReportedErrorRadians:
              newPublishedEstimate.polarMotion
                .ypReportedErrorRadians,
          },
        },
        refraction: false,
      },
    );
    const expectedStar =
      calculateLightweightApparentStarPositionWithContextV2(
        representativeStar,
        expectedContext,
      );
    const expectedSun =
      calculateApparentSunPositionWithContextV2(
        expectedContext,
      ).geometricHorizontal;
    const expectedSunProjection =
      horizontalToProjection(expectedSun);
    const expectedStarValues = [
      radiansToDegrees(expectedStar.observedHorizontal.altitude),
      radiansToDegrees(expectedStar.observedHorizontal.azimuth),
      expectedStar.projection.x,
      expectedStar.projection.y,
    ];
    const expectedSolarValues = [
      radiansToDegrees(expectedSun.altitude),
      radiansToDegrees(expectedSun.azimuth),
      expectedSunProjection.x,
      expectedSunProjection.y,
    ];
    rerender(<App />);

    await waitFor(() => {
      expect(readout).toHaveAttribute(
        "datetime",
        "2026-07-30T00:00:00.000Z",
      );
      expect(
        screen.getByText(/\+0\.052500秒（IERS予測値/),
      ).toBeInTheDocument();
      expect(representativeStarPosition.textContent).not.toBe(
        oldStarPosition,
      );
      expect(solarPosition.textContent).not.toBe(
        oldSolarPosition,
      );
    });
    const newStarValues = (
      representativeStarPosition.textContent ?? ""
    )
      .split("|")
      .map(Number);
    const newSolarValues = (solarPosition.textContent ?? "")
      .split("|")
      .map(Number);
    expect(newStarValues).toHaveLength(4);
    expect(newStarValues.every(Number.isFinite)).toBe(true);
    expect(newStarValues).not.toEqual(oldStarValues);
    newStarValues.forEach((value, index) => {
      expect(value).toBeCloseTo(expectedStarValues[index]!, 12);
    });
    expect(newSolarValues).toHaveLength(4);
    expect(newSolarValues.every(Number.isFinite)).toBe(true);
    expect(newSolarValues).not.toEqual(oldSolarValues);
    newSolarValues.forEach((value, index) => {
      expect(value).toBeCloseTo(expectedSolarValues[index]!, 12);
    });
    await user.click(
      screen.getByRole("button", { name: "JSONをコピー" }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    const newProfile = JSON.parse(
      writeText.mock.calls[1]?.[0] as string,
    );
    expect(newProfile.observation.utc).toBe(
      "2026-07-30T00:00:00.000Z",
    );
    expect(newProfile.earthOrientation.sourceIdentifier).toBe(
      "IERS test-new-source",
    );
    expect(newProfile.timeScales.dut1Seconds).toBe(0.052_5);
  });

  it("coalesces 12 Hz playback requests without starving EOP publication or recomputing the retained sky", async () => {
    const frames = createAnimationFrames();
    vi.stubGlobal(
      "requestAnimationFrame",
      frames.requestAnimationFrame,
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      frames.cancelAnimationFrame,
    );
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const user = userEvent.setup();
    const { rerender, unmount } = render(<App />);
    try {
      await screen.findByText(/精密計算 v2/);
      await user.click(
        screen.getByRole("checkbox", { name: "選択星の軌跡" }),
      );
      await waitFor(() =>
        expect(trackCalculationSpy).toHaveBeenCalledTimes(1),
      );
      const readout = document.querySelector(
        ".playback-readout time",
      );
      const originalInstant = Date.parse(
        readout?.getAttribute("datetime") ?? "",
      );
      await user.click(
        screen.getByRole("button", { name: "時間を再生" }),
      );
      dut1HookState.isCurrent = false;
      dut1HookState.settledInstantMs = originalInstant;
      dut1HookState.settledStatus = "ready";
      dut1HookState.status = "refreshing";
      act(() => frames.runNext(1_100));
      act(() => frames.runNext(1_200));
      act(() => frames.runNext(1_300));

      const requestedInstants = [
        ...new Set(
          dut1HookDateSpy.mock.calls.map(([requested]) =>
            (requested as Date).getTime(),
          ),
        ),
      ];
      expect(requestedInstants).toHaveLength(2);
      expect(readout).toHaveAttribute(
        "datetime",
        new Date(originalInstant).toISOString(),
      );
      expect(trackCalculationSpy).toHaveBeenCalledTimes(1);
      expect(
        screen.getByText(
          /更新中（直前の整合済み結果）/,
        ),
      ).toBeVisible();

      const firstRequestedInstant = requestedInstants[1]!;
      dut1HookState.isCurrent = true;
      dut1HookState.settledInstantMs = firstRequestedInstant;
      dut1HookState.status = "ready";
      rerender(<App />);

      await waitFor(() => {
        const uniqueRequests = new Set(
          dut1HookDateSpy.mock.calls.map(([requested]) =>
            (requested as Date).getTime(),
          ),
        );
        expect(uniqueRequests.size).toBe(3);
      });
      const latestRequestedInstant = Math.max(
        ...dut1HookDateSpy.mock.calls.map(([requested]) =>
          (requested as Date).getTime(),
        ),
      );
      expect(latestRequestedInstant).toBeGreaterThan(
        firstRequestedInstant,
      );
      expect(readout).toHaveAttribute(
        "datetime",
        new Date(firstRequestedInstant).toISOString(),
      );
      expect(
        screen.getByText(
          /更新中（直前の整合済み結果）/,
        ),
      ).toBeVisible();

      dut1HookState.settledInstantMs = latestRequestedInstant;
      rerender(<App />);
      await waitFor(() =>
        expect(readout).toHaveAttribute(
          "datetime",
          new Date(latestRequestedInstant).toISOString(),
        ),
      );
      expect(
        screen.queryByText(
          /新しい観測日時のIERS EOPを準備中/,
        ),
      ).not.toBeInTheDocument();
    } finally {
      unmount();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("drops queued playback time and copies only the published frame when copy pauses an in-flight lookup", async () => {
    const frames = createAnimationFrames();
    vi.stubGlobal(
      "requestAnimationFrame",
      frames.requestAnimationFrame,
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      frames.cancelAnimationFrame,
    );
    vi.spyOn(performance, "now").mockReturnValue(2_000);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { rerender, unmount } = render(<App />);
    try {
      await screen.findByText(/精密計算 v2/);
      const readout = document.querySelector(
        ".playback-readout time",
      );
      const publishedIso =
        readout?.getAttribute("datetime") ?? "";
      const publishedInstant = Date.parse(publishedIso);

      await user.click(
        screen.getByRole("button", { name: "時間を再生" }),
      );
      dut1HookState.isCurrent = false;
      dut1HookState.settledInstantMs = publishedInstant;
      dut1HookState.settledStatus = "ready";
      dut1HookState.status = "refreshing";
      act(() => frames.runNext(2_100));
      act(() => frames.runNext(2_200));

      await user.click(
        screen.getByRole("button", { name: "JSONをコピー" }),
      );
      await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      const copiedProfile = JSON.parse(
        writeText.mock.calls[0]?.[0] as string,
      );
      expect(copiedProfile.observation.utc).toBe(publishedIso);
      expect(readout).toHaveAttribute("datetime", publishedIso);
      expect(
        screen.getByRole("button", { name: "時間を再生" }),
      ).toHaveAttribute("aria-pressed", "false");

      const requestedInstants = new Set(
        dut1HookDateSpy.mock.calls.map(([requested]) =>
          (requested as Date).getTime(),
        ),
      );
      expect(requestedInstants.size).toBe(2);
      expect(requestedInstants.has(publishedInstant)).toBe(true);

      dut1HookState.isCurrent = true;
      dut1HookState.settledInstantMs = publishedInstant;
      dut1HookState.status = "ready";
      rerender(<App />);
      expect(readout).toHaveAttribute("datetime", publishedIso);
      expect(
        new Set(
          dut1HookDateSpy.mock.calls.map(([requested]) =>
            (requested as Date).getTime(),
          ),
        ).size,
      ).toBe(2);
    } finally {
      unmount();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("loads forecasts only after opening the events screen and changes time only on an explicit action", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const user = userEvent.setup();
    render(<App />);
    const readout = document.querySelector(".playback-readout time");
    const originalDateTime = readout?.getAttribute("datetime");

    expect(
      screen.getByRole("link", { name: "空" }),
    ).toHaveAttribute("aria-current", "page");
    expect(window.location.pathname).toBe("/sky");
    expect(eventPanelRenderSpy).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "時間を再生" }),
    );
    await user.click(
      screen.getByRole("link", { name: "現象" }),
    );

    expect(
      await screen.findByRole("region", {
        name: "テスト用天文現象予報",
      }),
    ).toBeVisible();
    expect(eventPanelRenderSpy).toHaveBeenCalled();
    expect(eventPanelRenderSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ isActive: true }),
    );
    expect(window.location.pathname).toBe("/events");
    expect(
      screen.getByRole("heading", { level: 1, name: "天文現象" }),
    ).toBeVisible();
    expect(
      screen.getByRole("main", { name: "天文現象" }),
    ).toHaveFocus();
    expect(readout).toHaveAttribute("datetime", originalDateTime);

    await user.click(screen.getByRole("link", { name: "空" }));
    expect(screen.getByRole("main", { name: "星空" })).toHaveFocus();
    expect(eventPanelRenderSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ isActive: false }),
    );
    expect(
      screen.getByRole("button", { name: "時間を一時停止" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      screen.getByRole("link", { name: "現象" }),
    );
    expect(eventPanelRenderSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ isActive: true }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "テスト最大時刻を空に表示",
      }),
    );
    expect(readout).toHaveAttribute(
      "datetime",
      "2026-08-12T17:45:54.000Z",
    );
    expect(window.location.pathname).toBe("/sky");
    expect(
      screen.getByRole("button", { name: "時間を再生" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "元の日時に戻る" }),
    ).toHaveFocus();
    expect(screen.getByText("テスト皆既日食")).toBeVisible();
    const eventTimeContext = screen.getByRole("note", {
      name: "現象時刻から開いた空",
    });
    expect(eventTimeContext).toBeVisible();
    expect(eventTimeContext).toHaveTextContent(
      "現象時刻 2026/08/13 2:45",
    );
    expect(
      within(eventTimeContext).getByText("2026/08/13 2:45"),
    ).toHaveAttribute("datetime", "2026-08-12T17:45:54.000Z");

    await user.click(
      screen.getByRole("button", { name: "＋1時間" }),
    );
    expect(readout).toHaveAttribute(
      "datetime",
      "2026-08-12T18:45:54.000Z",
    );
    expect(eventTimeContext).toHaveTextContent(
      "現象時刻 2026/08/13 2:45",
    );
    expect(eventTimeContext).not.toHaveTextContent("表示中");
    await user.click(
      screen.getByRole("button", { name: "−1時間" }),
    );

    await user.click(
      screen.getByRole("button", { name: "現象へ戻る" }),
    );
    expect(window.location.pathname).toBe("/events");
    expect(readout).toHaveAttribute(
      "datetime",
      "2026-08-12T17:45:54.000Z",
    );

    await user.click(screen.getByRole("link", { name: "空" }));

    await user.click(
      screen.getByRole("button", {
        name: "元の日時に戻る",
      }),
    );
    expect(readout).toHaveAttribute("datetime", originalDateTime);
    expect(screen.getByRole("main", { name: "星空" })).toHaveFocus();
  });

  it("opens a direct events URL and follows popstate while retaining the event panel", async () => {
    window.history.replaceState(null, "", "/events");
    const { unmount } = render(<App />);
    try {
      await screen.findByRole("region", {
        name: "テスト用天文現象予報",
      });
      expect(
        screen.getByRole("link", { name: "現象" }),
      ).toHaveAttribute("aria-current", "page");
      expect(eventPanelRenderSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: true }),
      );

      act(() => {
        window.history.pushState(null, "", "/sky");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(
        screen.getByRole("link", { name: "空" }),
      ).toHaveAttribute("aria-current", "page");
      expect(
        screen.getByRole("main", { name: "星空" }),
      ).toHaveFocus();
      await waitFor(() =>
        expect(eventPanelRenderSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({ isActive: false }),
        ),
      );

      act(() => {
        window.history.pushState(null, "", "/events");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(
        screen.getByRole("link", { name: "現象" }),
      ).toHaveAttribute("aria-current", "page");
      expect(
        screen.getByRole("main", { name: "天文現象" }),
      ).toHaveFocus();
      await waitFor(() =>
        expect(eventPanelRenderSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({ isActive: true }),
        ),
      );
    } finally {
      unmount();
    }
  });

  it.each([
    [
      "1899-12-31T23:59:59.999Z",
      "1900-01-01T00:00:00.000Z",
    ],
    [
      "2101-01-01T00:00:00.000Z",
      "2100-12-31T23:59:59.999Z",
    ],
  ])(
    "clamps initial and current-clock ingress from %s",
    (systemTime, expectedDateTime) => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(systemTime));
        const { unmount } = render(<App />);
        const readout = document.querySelector(
          ".playback-readout time",
        );

        expect(readout).toHaveAttribute(
          "datetime",
          expectedDateTime,
        );
        expect(
          screen.getByText(
            "対応期間は1900年から2100年です。最も近い日時へ調整しました。",
            { selector: ".time-boundary-notice" },
          ),
        ).toBeVisible();
        const liveRegion = screen.getByRole("status", {
          name: "時間境界通知",
        });
        act(() => {
          vi.advanceTimersByTime(50);
        });
        expect(liveRegion).toHaveTextContent(
          "対応期間は1900年から2100年です。最も近い日時へ調整しました。",
        );
        vi.setSystemTime(new Date(systemTime));
        fireEvent.click(screen.getByRole("button", { name: "いま" }));
        expect(liveRegion).toHaveTextContent("");
        act(() => {
          vi.advanceTimersByTime(50);
        });
        expect(readout).toHaveAttribute(
          "datetime",
          expectedDateTime,
        );
        expect(liveRegion).toHaveTextContent(
          "対応期間は1900年から2100年です。最も近い日時へ調整しました。",
        );
        expect(
          screen.getByText(
            "対応期間は1900年から2100年です。最も近い日時へ調整しました。",
            { selector: ".time-boundary-notice" },
          ),
        ).toBeVisible();
        unmount();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("does not show a clock-adjustment notice for a supported startup time", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
      const { unmount } = render(<App />);

      expect(
        screen.queryByText(
          "対応期間は1900年から2100年です。最も近い日時へ調整しました。",
        ),
      ).not.toBeInTheDocument();
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces every blocked playback attempt without invalidating the supported datetime", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2100-12-31T23:59:59.999Z"));
      const { unmount } = render(<App />);
      const input = screen.getByLabelText("観測日時（Asia/Tokyo）");
      const liveRegion = screen.getByRole("status", {
        name: "時間境界通知",
      });
      const playButton = screen.getByRole("button", {
        name: "時間を再生",
      });

      fireEvent.click(playButton);
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(liveRegion).toHaveTextContent(
        "対応期間の終了（2100年）に達したため、時間の再生を停止しました。",
      );
      expect(input).toHaveAttribute("aria-invalid", "false");
      expect(input).not.toHaveAttribute(
        "aria-describedby",
        expect.stringContaining("observation-time-error"),
      );

      fireEvent.click(playButton);
      expect(liveRegion).toHaveTextContent("");
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(
        screen.getByRole("status", { name: "時間境界通知" }),
      ).toBe(liveRegion);
      expect(liveRegion).toHaveTextContent(
        "対応期間の終了（2100年）に達したため、時間の再生を停止しました。",
      );
      expect(input).toHaveAttribute("aria-invalid", "false");
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clamps a manual hour step to the endpoint and reports it as a status", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2100-12-31T23:30:00.000Z"));
      const { unmount } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "＋1時間" }));

      expect(document.querySelector(".playback-readout time")).toHaveAttribute(
        "datetime",
        "2100-12-31T23:59:59.999Z",
      );
      expect(
        screen.getByText(
          "対応期間の終了（2100年）に達しました。",
        ),
      ).toHaveTextContent("対応期間の終了（2100年）に達しました。");
      expect(
        screen.getByLabelText("観測日時（Asia/Tokyo）"),
      ).toHaveAttribute("aria-invalid", "false");
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces an explicit selection without repeating updated coordinates on time changes", async () => {
    const user = userEvent.setup();
    render(<App />);
    const status = screen.getByRole("status", {
      name: "選択通知",
    });
    expect(status).toHaveTextContent("");

    await user.click(
      screen.getByRole("button", { name: "星図でベガを選択" }),
    );
    expect(status).toHaveTextContent(/ベガを選択しました。高度.+方位.+です。/);
    const selectionMessage = status.textContent;

    await user.click(screen.getByRole("button", { name: "＋1時間" }));
    expect(status).toHaveTextContent(selectionMessage ?? "");
  });

  it("only clears a draw error when the same renderer reports ready", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "2D描画エラーを通知" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("2D描画エラー");

    await user.click(
      screen.getByRole("button", { name: "3D準備完了を通知" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("2D描画エラー");

    await user.click(
      screen.getByRole("button", { name: "3D描画エラーを通知" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("3D描画エラー");

    await user.click(
      screen.getByRole("button", { name: "2D準備完了を通知" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("3D描画エラー");

    await user.click(
      screen.getByRole("button", { name: "3D準備完了を通知" }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers an explicit retry only when bundled EOP loading fails", async () => {
    dut1HookState.estimate = null;
    dut1HookState.status = "error";
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByText(
        /IERS読込失敗・0近似/,
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "IERS地球姿勢データを再読み込み",
      }),
    );
    expect(dut1RetrySpy).toHaveBeenCalledTimes(1);
  });

  it("explains an out-of-coverage EOP fallback without offering a futile retry", async () => {
    dut1HookState.estimate = null;
    dut1HookState.status = "unavailable";
    render(<App />);

    expect(
      await screen.findByText(
        /IERS収録外・0近似/,
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "IERS地球姿勢データを再読み込み",
      }),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      "1900-01-02T00:00",
      "時刻系：TAI−UTC=0秒近似（1972年以前）",
    ],
    [
      "2050-01-01T00:00",
      "時刻系：将来うるう秒不明・37秒仮定（TAI−UTC）",
    ],
  ])(
    "shows the concrete UTC→TT assumption at %s",
    async (inputValue, expectedNotice) => {
      render(<App />);
      const input = screen.getByLabelText(
        "観測日時（Asia/Tokyo）",
      );

      fireEvent.change(input, { target: { value: inputValue } });

      expect(await screen.findByText(expectedNotice)).toBeVisible();
      expect(
        screen.queryByText(/その他の時刻系は近似/),
      ).not.toBeInTheDocument();
    },
  );

  it("does not announce continuously changing solar altitude during playback", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<App />);

    const calculationStatus = await screen.findByText(
      /精密計算 v2・大気差なし/,
    );
    const twilightSection =
      screen.getByText(/太陽高度/).closest("section");

    expect(twilightSection).not.toHaveAttribute("aria-live");
    expect(calculationStatus).toHaveAttribute("aria-live", "polite");
    fireEvent.click(
      screen.getByRole("button", { name: "時間を再生" }),
    );
    expect(calculationStatus).toHaveAttribute("aria-live", "off");
    fireEvent.click(
      screen.getByRole("button", { name: "時間を一時停止" }),
    );
    expect(calculationStatus).toHaveAttribute("aria-live", "polite");
    vi.unstubAllGlobals();
  });

  it("makes the opt-in standard-atmosphere altitude model explicit and pauses playback", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(
      /精密計算 v2・大気差なし/,
    );
    await user.click(
      screen.getByRole("button", { name: "時間を再生" }),
    );
    expect(
      screen.getByRole("button", { name: "時間を一時停止" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      screen.getByRole("checkbox", {
        name: "標準大気差（高度5°以上）",
      }),
    );

    expect(
      screen.getByText(
        /精密計算 v2・標準大気差/,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "時間を再生" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps atmosphere drafts isolated, then applies one manual source to sky, track, and JSON", async () => {
    Object.defineProperties(HTMLDialogElement.prototype, {
      close: {
        configurable: true,
        value() {
          this.removeAttribute("open");
        },
      },
      showModal: {
        configurable: true,
        value() {
          this.setAttribute("open", "");
        },
      },
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    await screen.findByText(
      /精密計算 v2・大気差なし/,
    );
    await user.click(
      screen.getByRole("checkbox", { name: "選択星の軌跡" }),
    );
    await waitFor(() =>
      expect(trackCalculationSpy).toHaveBeenCalledTimes(1),
    );
    await user.click(
      screen.getByRole("button", { name: "時間を再生" }),
    );
    const atmosphereTrigger = screen.getByRole("button", {
      name: "大気設定を開く",
    });
    await user.click(atmosphereTrigger);

    await user.clear(
      screen.getByRole("spinbutton", { name: "気圧（hPa）" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "気圧（hPa）" }),
      "998.4",
    );
    expect(trackCalculationSpy).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        /^精密計算 v2・大気差なし/,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "時間を一時停止" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );

    expect(
      await screen.findByText(
        /精密計算 v2・手動大気差/,
      ),
    ).toBeVisible();
    expect(screen.getByText("手動大気を適用中")).toBeVisible();
    expect(
      screen.getByRole("checkbox", {
        name: "大気差（手動設定）",
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "時間を再生" }),
    ).toHaveAttribute("aria-pressed", "false");
    await waitFor(() =>
      expect(atmosphereTrigger).toHaveFocus(),
    );
    await waitFor(() =>
      expect(trackCalculationSpy).toHaveBeenCalledTimes(2),
    );
    const latestOptionsAtDate =
      trackCalculationSpy.mock.calls.at(-1)?.[3];
    const latestOptions = await latestOptionsAtDate?.(new Date());
    expect(latestOptions).toMatchObject({
      earthOrientationStatus: "ready",
      positionOptions: {
        refraction: {
          minimumGeometricAltitudeDegrees: 5,
          pressureHpa: 998.4,
          relativeHumidity: 0.5,
          temperatureCelsius: 10,
          wavelengthMicrometers: 0.55,
        },
      },
    });

    const jsonCopyButton = screen.getByRole("button", {
      name: "JSONをコピー",
    });
    expect(jsonCopyButton).toBeEnabled();
    await user.click(jsonCopyButton);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const profile = JSON.parse(
      writeText.mock.calls[0]?.[0] as string,
    );
    expect(
      profile.diagnostics.refraction.parameters.inputSource,
    ).toBe("manual");

    await user.click(
      screen.getByRole("checkbox", {
        name: "大気差（手動設定）",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "大気設定を開く" }),
    );
    expect(
      screen.getByRole("spinbutton", { name: "気圧（hPa）" }),
    ).toHaveValue(998.4);
    await user.click(
      screen.getByRole("button", { name: "キャンセル" }),
    );
    await waitFor(() =>
      expect(atmosphereTrigger).toHaveFocus(),
    );
  });

  it("does no trajectory work while off and follows time only after explicit opt-in", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(
      /精密計算 v2・大気差なし/,
    );
    expect(trackCalculationSpy).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("selected-track-point-count"),
    ).toHaveTextContent("0");

    await user.click(
      screen.getByRole("checkbox", { name: "選択星の軌跡" }),
    );
    await waitFor(() =>
      expect(trackCalculationSpy).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("selected-track-point-count"),
      ).toHaveTextContent("13"),
    );
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-count",
      ),
    ).toHaveTextContent("0");
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-present",
      ),
    ).toHaveTextContent("no");
    expect(
      screen.getByTestId("selected-track-eop-center-status"),
    ).toHaveTextContent("ready");
    expect(dut1LookupAtSpy).toHaveBeenCalledTimes(12);
    expect(
      dut1LookupAtSpy.mock.calls.map(([sampleDate]) =>
        (sampleDate as Date).getTime(),
      ),
    ).toEqual(
      [...dut1LookupAtSpy.mock.calls]
        .map(([sampleDate]) => (sampleDate as Date).getTime())
        .sort((left, right) => left - right),
    );

    await user.click(
      screen.getByRole("checkbox", { name: "選択星の軌跡" }),
    );
    const callsWhileEnabled = trackCalculationSpy.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "＋1時間" }));
    expect(trackCalculationSpy).toHaveBeenCalledTimes(
      callsWhileEnabled,
    );
  });

  it("keeps and marks the selected-star track when one auxiliary EOP lookup rejects", async () => {
    dut1LookupAtSpy
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockImplementation(async () => dut1HookState.estimate);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(
      /精密計算 v2・大気差なし/,
    );
    await user.click(
      screen.getByRole("checkbox", { name: "選択星の軌跡" }),
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("selected-track-point-count"),
      ).toHaveTextContent("13"),
    );
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-count",
      ),
    ).toHaveTextContent("1");
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-present",
      ),
    ).toHaveTextContent("yes");
    expect(
      screen.getByTestId("selected-track-eop-center-status"),
    ).toHaveTextContent("ready");
    expect(dut1LookupAtSpy).toHaveBeenCalledTimes(12);
  });

  it("keeps and marks the selected-star track when one auxiliary EOP lookup returns null", async () => {
    dut1LookupAtSpy
      .mockResolvedValueOnce(null)
      .mockImplementation(async () => dut1HookState.estimate);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(
      /精密計算 v2・大気差なし/,
    );
    await user.click(
      screen.getByRole("checkbox", { name: "選択星の軌跡" }),
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("selected-track-point-count"),
      ).toHaveTextContent("13"),
    );
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-count",
      ),
    ).toHaveTextContent("1");
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-present",
      ),
    ).toHaveTextContent("yes");
    expect(
      screen.getByTestId("selected-track-eop-center-status"),
    ).toHaveTextContent("ready");
    expect(dut1LookupAtSpy).toHaveBeenCalledTimes(12);
  });

  it("tracks all auxiliary EOP failures, then hides and replaces the track on retry", async () => {
    const recoveredEstimate = dut1HookState.estimate;
    dut1HookState.estimate = null;
    dut1HookState.sourceIdentifier = null;
    dut1HookState.status = "error";
    dut1LookupAtSpy.mockRejectedValue(
      new Error("all auxiliary EOP lookups failed"),
    );
    const user = userEvent.setup();
    const { rerender } = render(<App />);

    await screen.findByText(
      /IERS読込失敗・0近似/,
    );
    await user.click(
      screen.getByRole("checkbox", { name: "選択星の軌跡" }),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("selected-track-point-count"),
      ).toHaveTextContent("13"),
    );
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-count",
      ),
    ).toHaveTextContent("12");
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-present",
      ),
    ).toHaveTextContent("yes");
    expect(
      screen.getByTestId("selected-track-eop-center-status"),
    ).toHaveTextContent("error");
    const centerIso = screen.getByTestId(
      "selected-track-center-time",
    ).textContent!;
    const firstOptionsAtDate =
      trackCalculationSpy.mock.calls.at(-1)?.[3];
    expect(dut1LookupAtSpy).toHaveBeenCalledTimes(12);
    await expect(
      firstOptionsAtDate?.(new Date(centerIso)),
    ).resolves.toMatchObject({
      earthOrientationStatus: "error",
      positionOptions: {
        earthOrientation: {
          polarMotion: { source: "assumed-zero" },
        },
      },
    });
    expect(dut1LookupAtSpy).toHaveBeenCalledTimes(12);

    let resolveAuxiliary!: (
      value: typeof recoveredEstimate,
    ) => void;
    const auxiliaryLookup = new Promise<
      typeof recoveredEstimate
    >((resolve) => {
      resolveAuxiliary = resolve;
    });
    dut1LookupAtSpy.mockReset();
    dut1LookupAtSpy.mockImplementation(() => auxiliaryLookup);
    dut1HookState.estimate = recoveredEstimate;
    dut1HookState.sourceIdentifier = "IERS retry-source";
    dut1HookState.status = "ready";
    rerender(<App />);

    expect(
      screen.getByTestId("selected-track-point-count"),
    ).toHaveTextContent("0");
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-count",
      ),
    ).toHaveTextContent("");
    expect(
      screen.getByTestId("selected-track-eop-center-status"),
    ).toHaveTextContent("");
    await waitFor(() =>
      expect(trackCalculationSpy).toHaveBeenCalledTimes(2),
    );
    const retriedOptionsAtDate =
      trackCalculationSpy.mock.calls.at(-1)?.[3];
    await expect(
      retriedOptionsAtDate?.(new Date(centerIso)),
    ).resolves.toMatchObject({
      earthOrientationStatus: "ready",
      positionOptions: {
        earthOrientation: {
          dut1Seconds: recoveredEstimate?.dut1.seconds,
          polarMotion: {
            source: "iers-predicted",
            xpRadians:
              recoveredEstimate?.polarMotion.xpRadians,
            ypRadians:
              recoveredEstimate?.polarMotion.ypRadians,
          },
        },
      },
    });
    expect(dut1LookupAtSpy).toHaveBeenCalledTimes(12);

    resolveAuxiliary(recoveredEstimate);
    await waitFor(() =>
      expect(
        screen.getByTestId("selected-track-point-count"),
      ).toHaveTextContent("13"),
    );
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-count",
      ),
    ).toHaveTextContent("0");
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-present",
      ),
    ).toHaveTextContent("no");
    expect(
      screen.getByTestId("selected-track-eop-center-status"),
    ).toHaveTextContent("ready");
  });

  it("hides a stale trajectory until its new observation-time samples resolve", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(
      /精密計算 v2・大気差なし/,
    );
    await user.click(
      screen.getByRole("checkbox", { name: "選択星の軌跡" }),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("selected-track-point-count"),
      ).toHaveTextContent("13"),
    );
    const originalCenter = screen.getByTestId(
      "selected-track-center-time",
    ).textContent;
    let resolveNextLookup!: (
      value: typeof dut1HookState.estimate,
    ) => void;
    const nextLookup = new Promise<typeof dut1HookState.estimate>(
      (resolve) => {
        resolveNextLookup = resolve;
      },
    );
    dut1LookupAtSpy.mockImplementation(() => nextLookup);

    await user.click(screen.getByRole("button", { name: "＋1時間" }));

    expect(
      screen.getByTestId("selected-track-point-count"),
    ).toHaveTextContent("0");
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-count",
      ),
    ).toHaveTextContent("");
    expect(
      screen.getByTestId("selected-track-eop-center-status"),
    ).toHaveTextContent("");
    resolveNextLookup(dut1HookState.estimate);
    await waitFor(() =>
      expect(
        screen.getByTestId("selected-track-point-count"),
      ).toHaveTextContent("13"),
    );
    expect(
      screen.getByTestId("selected-track-center-time"),
    ).not.toHaveTextContent(originalCenter ?? "");
    expect(
      screen.getByTestId(
        "selected-track-eop-fallback-count",
      ),
    ).toHaveTextContent("0");
    expect(
      screen.getByTestId("selected-track-eop-center-status"),
    ).toHaveTextContent("ready");
  });
});

describe("App location workflow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["東京"],
    ["現在地"],
  ])(
    "pauses time playback before opening the location dialog from %s",
    async (buttonName) => {
      vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
      vi.stubGlobal("cancelAnimationFrame", vi.fn());
      const user = userEvent.setup();
      render(<App />);

      await user.click(
        screen.getByRole("button", { name: "時間を再生" }),
      );
      expect(
        screen.getByRole("button", { name: "時間を一時停止" }),
      ).toHaveAttribute("aria-pressed", "true");

      await user.click(
        screen.getByRole("button", { name: buttonName }),
      );

      expect(
        screen.getByRole("heading", { name: "観測地点" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "時間を再生" }),
      ).toHaveAttribute("aria-pressed", "false");
    },
  );
});

describe("App help workflow", () => {
  beforeEach(() => {
    Object.defineProperties(HTMLDialogElement.prototype, {
      close: {
        configurable: true,
        value() {
          this.removeAttribute("open");
        },
      },
      showModal: {
        configurable: true,
        value() {
          this.setAttribute("open", "");
        },
      },
    });
  });

  it("loads help only after the explicit action and can close it", async () => {
    const user = userEvent.setup();
    render(<App />);
    const helpButton = screen.getByRole("button", {
      name: "ヘルプ",
    });

    expect(
      screen.queryByRole("dialog", {
        name: "ヘルプとプライバシー",
      }),
    ).not.toBeInTheDocument();

    await user.click(helpButton);

    expect(
      await screen.findByRole("dialog", {
        name: "ヘルプとプライバシー",
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "ヘルプとプライバシーを閉じる",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "ヘルプとプライバシー",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(document.querySelector("dialog")).toBeInTheDocument();
    expect(helpButton).toHaveFocus();

    await user.click(helpButton);
    expect(
      await screen.findByRole("dialog", {
        name: "ヘルプとプライバシー",
      }),
    ).toBeInTheDocument();
  });
});
