import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

function RadioHarness() {
  const [value, setValue] = useState<"above" | "all">("above");
  return (
    <SegmentedControl
      ariaLabel="星の表示範囲"
      onChange={setValue}
      options={[
        { label: "地平線上", value: "above" },
        { label: "すべて", value: "all" },
      ]}
      value={value}
    />
  );
}

describe("SegmentedControl", () => {
  it("uses roving focus and arrow selection for a radio group", async () => {
    const user = userEvent.setup();
    render(<RadioHarness />);
    const radios = screen.getAllByRole("radio");

    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(radios[1]).toHaveAttribute("tabindex", "-1");
    radios[0]?.focus();
    await user.keyboard("{ArrowRight}");

    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowRight}");
    expect(radios[0]).toHaveFocus();
  });

  it("links tab buttons to their panels", () => {
    render(
      <SegmentedControl
        ariaLabel="モバイル表示"
        kind="tabs"
        onChange={() => undefined}
        options={[
          {
            controlsId: "stars-panel",
            id: "stars-tab",
            label: "星",
            value: "stars",
          },
          {
            controlsId: "settings-panel",
            id: "settings-tab",
            label: "設定",
            value: "settings",
          },
        ]}
        value="stars"
      />,
    );

    expect(screen.getByRole("tab", { name: "星" })).toHaveAttribute(
      "aria-controls",
      "stars-panel",
    );
    expect(screen.getByRole("tab", { name: "星" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
