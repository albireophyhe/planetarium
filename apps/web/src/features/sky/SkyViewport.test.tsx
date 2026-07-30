import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  SelectedStarTrack,
  SkySolarPosition,
  SkyStar,
} from "../../app/types";
import type { Constellation, TwilightPhase } from "../../domain";
import { SkyViewport } from "./SkyViewport";

vi.mock("./SkyCanvas", () => ({
  SkyCanvas: ({
    onDrawError,
    onSelect,
    selectedHr,
    selectedStarTrack,
    solarPosition,
    trackDescriptionId,
  }: {
    onDrawError: (message: string | null) => void;
    onSelect: (hr: number) => void;
    selectedHr: number | null;
    selectedStarTrack: SelectedStarTrack | null;
    solarPosition: SkySolarPosition;
    trackDescriptionId?: string;
  }) => (
    <div>
      <canvas
        aria-describedby={trackDescriptionId}
        aria-label="テスト用2D星図"
        data-testid="mock-2d-sky-surface"
      />
      <p>
        2D星図・選択HR {selectedHr}・軌跡
        {selectedStarTrack?.points.length ?? 0}点・説明
        {trackDescriptionId ? "あり" : "なし"}・太陽高度
        {solarPosition.altitudeDeg}度
      </p>
      <button onClick={() => onSelect(7001)} type="button">
        2Dで星を選択
      </button>
      <button
        onClick={() => onDrawError("2Dテストエラー")}
        type="button"
      >
        2Dを失敗させる
      </button>
    </div>
  ),
}));

vi.mock("./SkySphere3D", () => ({
  SkySphere3D: ({
    constellationLines,
    constellations,
    nightMode,
    onReady,
    onSelect,
    onUnavailable,
    selectedHr,
    selectedStarTrack,
    solarPosition,
    starLabels,
    stars,
    trackDescriptionId,
    twilight,
  }: {
    constellationLines: boolean;
    constellations: readonly Constellation[];
    nightMode: boolean;
    onReady: () => void;
    onSelect: (hr: number) => void;
    onUnavailable: (message: string) => void;
    selectedHr: number | null;
    selectedStarTrack: SelectedStarTrack | null;
    solarPosition: SkySolarPosition;
    starLabels: boolean;
    stars: readonly SkyStar[];
    trackDescriptionId?: string;
    twilight: TwilightPhase;
  }) => (
    <div>
      <canvas
        aria-describedby={trackDescriptionId}
        aria-label="テスト用3D星図"
        data-testid="mock-3d-sky-surface"
      />
      <p>
        3D星図・選択HR {selectedHr}・星{stars.length}件・星座
        {constellations.length}件・線{constellationLines ? "オン" : "オフ"}
        ・ラベル{starLabels ? "オン" : "オフ"}・薄明{twilight}・夜間
        {nightMode ? "オン" : "オフ"}・軌跡
        {selectedStarTrack?.points.length ?? 0}点・説明
        {trackDescriptionId ? "あり" : "なし"}・太陽高度
        {solarPosition.altitudeDeg}度
      </p>
      <button onClick={() => onSelect(7001)} type="button">
        3Dで星を選択
      </button>
      <button onClick={onReady} type="button">
        3Dを準備完了にする
      </button>
      <button
        onClick={() => onUnavailable("WebGLテストエラー")}
        type="button"
      >
        3Dを失敗させる
      </button>
    </div>
  ),
}));

const TEST_STARS: readonly SkyStar[] = [
  {
    altitudeDeg: 45,
    azimuthDeg: 90,
    bvColor: 0.1,
    hr: 7001,
    label: "ベガ",
    projectionX: 0.3,
    projectionY: -0.2,
    vMagnitude: 0.03,
  },
];

const TEST_CONSTELLATIONS: readonly Constellation[] = [
  {
    id: "Lyr",
    name: "Lyra",
    nameJa: "こと座",
    segments: [[7001, 7002]],
  },
];

const TEST_TRACK: SelectedStarTrack = {
  earthOrientationProvenance: {
    auxiliaryFallbackSampleCount: 0,
    auxiliarySampleCount: 12,
    centerStatus: "ready",
  },
  points: Array.from({ length: 13 }, (_, index) => ({
    altitudeDeg: 20 + index,
    azimuthDeg: 80 + index,
    observedAtIso: new Date(
      Date.UTC(2026, 6, 29, 9, index * 30),
    ).toISOString(),
    projectionX: index / 20,
    projectionY: index / 30,
    relativeMinutes: -180 + index * 30,
  })),
  sampleIntervalMinutes: 30,
  starHr: 7001,
  truncatedFuture: false,
  truncatedPast: false,
  windowMinutes: 180,
};

function renderViewport(
  selectedStarTrack: SelectedStarTrack = TEST_TRACK,
) {
  const onDrawError = vi.fn();
  const onSelect = vi.fn();
  render(
    <SkyViewport
      constellations={TEST_CONSTELLATIONS}
      layers={{
        atmosphericRefraction: false,
        constellationLines: true,
        nightMode: true,
        selectedStarTrack: true,
        starLabels: true,
      }}
      onDrawError={onDrawError}
      onSelect={onSelect}
      selectedHr={7001}
      selectedStarTrack={selectedStarTrack}
      solarPosition={{
        altitudeDeg: -12.5,
        azimuthDeg: 270,
        projectionX: -0.8,
        projectionY: 0,
      }}
      stars={TEST_STARS}
      twilight="night"
    />,
  );
  return { onDrawError, onSelect };
}

describe("SkyViewport", () => {
  it("starts in the persistent 2D fallback", () => {
    renderViewport();

    expect(screen.getByRole("radio", { name: "2D" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText(/2D星図・選択HR 7001/)).toBeInTheDocument();
    expect(screen.queryByText(/3D星図・選択HR/)).not.toBeInTheDocument();
  });

  it("lazy-loads 3D with shared layers, data, twilight, and selection", async () => {
    const user = userEvent.setup();
    const { onDrawError, onSelect } = renderViewport();

    await user.click(screen.getByRole("radio", { name: "3D" }));
    expect(
      await screen.findByText(
        "3D星図・選択HR 7001・星1件・星座1件・線オン・ラベルオン・薄明night・夜間オン・軌跡13点・説明あり・太陽高度-12.5度",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "3Dで星を選択" }),
    );
    expect(onSelect).toHaveBeenCalledWith(7001);

    await user.click(
      screen.getByRole("button", { name: "3Dを準備完了にする" }),
    );
    expect(onDrawError).toHaveBeenCalledWith("3d", null);
  });

  it("exposes the shared past-to-future track key as the Canvas/WebGL description", () => {
    renderViewport();

    const description = screen.getByLabelText("選択星の追跡状態");
    expect(description).not.toHaveAttribute("aria-live");
    expect(description).not.toHaveAttribute("role");
    expect(description).toHaveTextContent("過去 → 現在 → 未来");
    expect(description).toHaveTextContent(
      "−3時間 → 現在 → ＋3時間・13点",
    );
    expect(description).toHaveTextContent("30分間隔の13点");
    expect(description).not.toHaveTextContent("EOP 0近似");
    expect(
      screen.getByText(
        "2D星図・選択HR 7001・軌跡13点・説明あり・太陽高度-12.5度",
      ),
    ).toBeInTheDocument();
  });

  it("describes the affected EOP samples on both 2D and 3D sky surfaces", async () => {
    const user = userEvent.setup();
    renderViewport({
      ...TEST_TRACK,
      earthOrientationProvenance: {
        auxiliaryFallbackSampleCount: 1,
        auxiliarySampleCount: 12,
        centerStatus: "error",
      },
    });

    const description = screen.getByLabelText(
      "選択星の追跡状態",
    );
    expect(description).toHaveTextContent(
      "EOP 0近似: 現在点・周辺1/12点",
    );
    expect(description).toHaveTextContent(
      "現在点はEOP読込失敗のため0近似です。",
    );
    expect(description).toHaveTextContent(
      "周辺12点中1点はEOPを0近似しています。",
    );
    expect(
      screen.getByTestId("mock-2d-sky-surface"),
    ).toHaveAccessibleDescription(
      /現在点はEOP読込失敗のため0近似です。周辺12点中1点はEOPを0近似しています。/,
    );

    await user.click(screen.getByRole("radio", { name: "3D" }));
    expect(
      await screen.findByTestId("mock-3d-sky-surface"),
    ).toHaveAccessibleDescription(
      /現在点はEOP読込失敗のため0近似です。周辺12点中1点はEOPを0近似しています。/,
    );
  });

  it("immediately returns to 2D and reports why 3D is unavailable", async () => {
    const user = userEvent.setup();
    const { onDrawError } = renderViewport();

    await user.click(screen.getByRole("radio", { name: "3D" }));
    await user.click(
      await screen.findByRole("button", { name: "3Dを失敗させる" }),
    );

    expect(screen.getByRole("radio", { name: "2D" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText(/2D星図・選択HR 7001/)).toBeInTheDocument();
    expect(onDrawError).toHaveBeenCalledWith(
      "3d",
      "WebGLテストエラー",
    );
  });

  it("tags 2D drawing failures with their renderer source", async () => {
    const user = userEvent.setup();
    const { onDrawError } = renderViewport();

    await user.click(
      screen.getByRole("button", { name: "2Dを失敗させる" }),
    );

    expect(onDrawError).toHaveBeenCalledWith(
      "2d",
      "2Dテストエラー",
    );
  });
});
