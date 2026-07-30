import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimeControls } from "./TimeControls";

describe("TimeControls", () => {
  it("exposes supported bounds and associates an error with the input", () => {
    render(
      <>
        <p id="observation-time-error">日時エラー</p>
        <TimeControls
          dateTimeInputValue="2026-07-29T12:00:00"
          dateTimeMaximum="2100-12-31T23:59"
          dateTimeMinimum="1900-01-01T00:00"
          direction={1}
          hasError
          isPlaying={false}
          motionRestricted={false}
          onDateTimeChange={() => undefined}
          onDirectionChange={() => undefined}
          onNow={() => undefined}
          onPlaybackSpeedChange={() => undefined}
          onPlaybackToggle={() => undefined}
          onResetView={() => undefined}
          onShiftHours={() => undefined}
          playbackDateTime="2026-07-29T12:00:00.000Z"
          playbackSpeed={3_600}
          playbackTimeText="12:00:00"
          timeZone="UTC"
        />
      </>,
    );

    const input = screen.getByLabelText("観測日時（UTC）");
    expect(input).toHaveAttribute("step", "1");
    expect(input).toHaveAttribute("min", "1900-01-01T00:00");
    expect(input).toHaveAttribute("max", "2100-12-31T23:59");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("observation-time-error"),
    );
  });

  it("exposes playback direction, speed and state", () => {
    render(
      <TimeControls
        dateTimeInputValue="2026-07-29T12:00"
        dateTimeMaximum="2100-12-31T23:59"
        dateTimeMinimum="1900-01-01T00:00"
        direction={-1}
        hasError={false}
        isPlaying
        motionRestricted={false}
        onDateTimeChange={() => undefined}
        onDirectionChange={() => undefined}
        onNow={() => undefined}
        onPlaybackSpeedChange={() => undefined}
        onPlaybackToggle={() => undefined}
        onResetView={() => undefined}
        onShiftHours={() => undefined}
        playbackDateTime="2026-07-29T12:00:00.000Z"
        playbackSpeed={600}
        playbackTimeText="12:00:00"
        timeZone="UTC"
      />,
    );

    expect(
      screen.getByRole("button", { name: "時間を一時停止" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "逆方向" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox", { name: "再生速度" })).toHaveValue(
      "600",
    );
    expect(screen.getByText("逆方向・10分／秒で再生中")).toBeVisible();
    expect(screen.getByText("12:00:00")).toHaveAttribute(
      "datetime",
      "2026-07-29T12:00:00.000Z",
    );
  });

  it("disables automatic playback when reduced motion is requested", () => {
    render(
      <TimeControls
        dateTimeInputValue="2026-07-29T12:00"
        dateTimeMaximum="2100-12-31T23:59"
        dateTimeMinimum="1900-01-01T00:00"
        direction={1}
        hasError={false}
        isPlaying={false}
        motionRestricted
        onDateTimeChange={() => undefined}
        onDirectionChange={() => undefined}
        onNow={() => undefined}
        onPlaybackSpeedChange={() => undefined}
        onPlaybackToggle={() => undefined}
        onResetView={() => undefined}
        onShiftHours={() => undefined}
        playbackDateTime="2026-07-29T12:00:00.000Z"
        playbackSpeed={3_600}
        playbackTimeText="12:00:00"
        timeZone="UTC"
      />,
    );

    expect(
      screen.getByRole("button", { name: "時間を再生" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "逆方向" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "順方向" }),
    ).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "再生速度" })).toBeDisabled();
    expect(
      screen.getByText(
        "動きを減らす設定が有効です。前後1時間の操作を利用できます。",
      ),
    ).toBeVisible();
  });
});
