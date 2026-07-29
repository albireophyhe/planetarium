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
        layers={{
          atmosphericRefraction: false,
          constellationLines: true,
          nightMode: false,
          selectedStarTrack: false,
          starLabels: true,
        }}
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
});
