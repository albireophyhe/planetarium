import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LayerPanel } from "./LayerPanel";

describe("LayerPanel selected-star track", () => {
  it("is explicitly opt-in and reports its typed layer key", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LayerPanel
        appliedRefraction={null}
        layers={{
          atmosphericRefraction: false,
          constellationLines: true,
          nightMode: false,
          selectedStarTrack: false,
          starLabels: true,
        }}
        onAtmosphereOpen={vi.fn()}
        onChange={onChange}
        onResetView={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("checkbox", {
      name: "選択星の軌跡",
    });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith("selectedStarTrack", true);
  });

  it("shows an explicit manual source and opens its settings without changing layers", async () => {
    const user = userEvent.setup();
    const onAtmosphereOpen = vi.fn();
    const onChange = vi.fn();
    render(
      <LayerPanel
        appliedRefraction={{
          atmosphere: {
            minimumGeometricAltitudeDegrees: 8,
            pressureHpa: 998.4,
            relativeHumidity: 0.72,
            temperatureCelsius: 18.5,
            wavelengthMicrometers: 0.6,
          },
          inputSource: "manual",
        }}
        layers={{
          atmosphericRefraction: true,
          constellationLines: true,
          nightMode: false,
          selectedStarTrack: false,
          starLabels: true,
        }}
        onAtmosphereOpen={onAtmosphereOpen}
        onChange={onChange}
        onResetView={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("checkbox", {
        name: "大気差（手動設定）",
      }),
    ).toBeChecked();
    expect(screen.getByText("手動大気を適用中")).toBeVisible();
    expect(screen.getByText(/998.4 hPa.*湿度72%.*高度8°以上/)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "大気設定を開く" }),
    );
    expect(onAtmosphereOpen).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
