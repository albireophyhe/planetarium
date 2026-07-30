import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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
import { App } from "./App";

const trackCalculationSpy = vi.hoisted(() => vi.fn());
const dut1LookupAtSpy = vi.hoisted(() => vi.fn());
const dut1RetrySpy = vi.hoisted(() => vi.fn());
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
  status: "ready" as "error" | "ready" | "unavailable",
}));

vi.mock("./useIersEarthOrientation", () => ({
  useIersEarthOrientation: () => ({
    estimate: dut1HookState.estimate,
    isCurrent: true,
    lookupAt: dut1LookupAtSpy,
    retry: dut1RetrySpy,
    status: dut1HookState.status,
  }),
}));

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
  observationDate: Date;
  onRestoreObservationTime: () => void;
  onShowEventTime: (date: Date) => void;
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
  }: {
    onDrawError: (
      source: "2d" | "3d",
      message: string | null,
    ) => void;
    onSelect: (hr: number) => void;
    selectedStarTrack: import("./types").SelectedStarTrack | null;
    solarPosition: import("./types").SkySolarPosition;
  }) => (
    <div>
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
    dut1HookState.status = "ready";
    dut1LookupAtSpy.mockReset();
    dut1LookupAtSpy.mockImplementation(
      async () => dut1HookState.estimate,
    );
    dut1RetrySpy.mockClear();
    trackCalculationSpy.mockClear();
    eventPanelRenderSpy.mockClear();
  });

  it("upgrades the rendered sky to the lazy precision-v2 catalog", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByText(
        /精密計算 v2・年周視差（収録星）／太陽光偏向・年周・日周光行差・幾何高度/,
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

  it("loads forecasts only after the events tab and changes time only on an explicit action", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const user = userEvent.setup();
    render(<App />);
    const readout = document.querySelector(".playback-readout time");
    const originalDateTime = readout?.getAttribute("datetime");

    expect(
      screen.getByRole("tab", {
        hidden: true,
        name: "星と現象",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "恒星" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(eventPanelRenderSpy).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "時間を再生" }),
    );
    await user.click(screen.getByRole("tab", { name: "現象" }));

    expect(
      await screen.findByRole("region", {
        name: "テスト用天文現象予報",
      }),
    ).toBeVisible();
    expect(eventPanelRenderSpy).toHaveBeenCalled();
    expect(readout).toHaveAttribute("datetime", originalDateTime);
    expect(
      screen.getByRole("button", { name: "時間を一時停止" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      screen.getByRole("button", {
        name: "テスト最大時刻を空に表示",
      }),
    );
    expect(readout).toHaveAttribute(
      "datetime",
      "2026-08-12T17:45:54.000Z",
    );
    expect(
      screen.getByRole("button", { name: "時間を再生" }),
    ).toHaveAttribute("aria-pressed", "false");

    await user.click(
      screen.getByRole("button", {
        name: "テスト元の日時に戻る",
      }),
    );
    expect(readout).toHaveAttribute("datetime", originalDateTime);
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
        /IERS EOP読込失敗（DUT1・極運動は0近似）/,
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
        /IERS EOP収録外（DUT1・極運動は0近似）/,
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
    render(<App />);

    const calculationStatus = await screen.findByText(
      /精密計算 v2・年周視差（収録星）/,
    );
    const twilightSection =
      screen.getByText(/太陽高度/).closest("section");

    expect(twilightSection).not.toHaveAttribute("aria-live");
    expect(calculationStatus).toHaveAttribute("aria-live", "polite");
  });

  it("makes the opt-in standard-atmosphere altitude model explicit and pauses playback", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(
      /精密計算 v2・年周視差（収録星）／太陽光偏向・年周・日周光行差・幾何高度/,
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
        /精密計算 v2・年周視差（収録星）／太陽光偏向・年周・日周光行差・標準大気差あり（幾何高度5°以上）/,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "時間を再生" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("does no trajectory work while off and follows time only after explicit opt-in", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(
      /精密計算 v2・年周視差（収録星）／太陽光偏向・年周・日周光行差・幾何高度/,
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
    expect(dut1LookupAtSpy).toHaveBeenCalledTimes(13);
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

  it("keeps the selected-star track when one auxiliary DUT1 lookup fails", async () => {
    dut1LookupAtSpy
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockImplementation(async () => dut1HookState.estimate);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(
      /精密計算 v2・年周視差（収録星）／太陽光偏向・年周・日周光行差・幾何高度/,
    );
    await user.click(
      screen.getByRole("checkbox", { name: "選択星の軌跡" }),
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("selected-track-point-count"),
      ).toHaveTextContent("13"),
    );
    expect(dut1LookupAtSpy).toHaveBeenCalledTimes(13);
  });

  it("hides a stale trajectory until its new observation-time samples resolve", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(
      /精密計算 v2・年周視差（収録星）／太陽光偏向・年周・日周光行差・幾何高度/,
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
    resolveNextLookup(dut1HookState.estimate);
    await waitFor(() =>
      expect(
        screen.getByTestId("selected-track-point-count"),
      ).toHaveTextContent("13"),
    );
    expect(
      screen.getByTestId("selected-track-center-time"),
    ).not.toHaveTextContent(originalCenter ?? "");
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
