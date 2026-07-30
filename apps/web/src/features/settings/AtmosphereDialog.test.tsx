import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  STANDARD_VISUAL_ATMOSPHERE,
} from "../../app/standardAtmosphere";
import { AtmosphereDialog } from "./AtmosphereDialog";

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

function renderDialog(
  onApply = vi.fn(),
  current: Parameters<typeof AtmosphereDialog>[0]["current"] = null,
  manualDraftAtmosphere: Parameters<
    typeof AtmosphereDialog
  >[0]["manualDraftAtmosphere"] = null,
) {
  render(
    <AtmosphereDialog
      current={current}
      manualDraftAtmosphere={manualDraftAtmosphere}
      onApply={onApply}
      onClose={vi.fn()}
      open
    />,
  );
  return onApply;
}

describe("AtmosphereDialog", () => {
  it("keeps draft edits isolated and applies all validated values atomically", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog();

    const pressure = screen.getByRole("spinbutton", {
      name: "気圧（hPa）",
    });
    await user.clear(pressure);
    await user.type(pressure, "998.4");
    await user.clear(
      screen.getByRole("spinbutton", { name: "気温（°C）" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "気温（°C）" }),
      "18.5",
    );
    await user.clear(
      screen.getByRole("spinbutton", { name: "相対湿度（%）" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "相対湿度（%）" }),
      "72",
    );
    await user.clear(
      screen.getByRole("spinbutton", {
        name: "観測波長（µm）",
      }),
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: "観測波長（µm）",
      }),
      "0.6",
    );
    await user.clear(
      screen.getByRole("spinbutton", {
        name: /^適用下限の幾何高度（°）/,
      }),
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: /^適用下限の幾何高度（°）/,
      }),
      "8",
    );

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("オフ（大気差なし）")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      atmosphere: {
        minimumGeometricAltitudeDegrees: 8,
        pressureHpa: 998.4,
        relativeHumidity: 0.72,
        temperatureCelsius: 18.5,
        wavelengthMicrometers: 0.6,
      },
      inputSource: "manual",
    });
  });

  it("shows field and summary errors without replacing the applied setting", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog(vi.fn(), {
      atmosphere: STANDARD_VISUAL_ATMOSPHERE,
      inputSource: "standard",
    });

    const pressure = screen.getByRole("spinbutton", {
      name: "気圧（hPa）",
    });
    await user.clear(pressure);
    await user.type(pressure, "1200");
    await user.clear(
      screen.getByRole("spinbutton", {
        name: /^適用下限の幾何高度（°）/,
      }),
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: /^適用下限の幾何高度（°）/,
      }),
      "4",
    );
    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );

    expect(onApply).not.toHaveBeenCalled();
    expect(pressure).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("気圧は0〜1,100 hPaで入力してください。"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "適用下限の幾何高度は5〜30°で入力してください。",
      ),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "大気設定はまだ変更されていません",
    );
    expect(screen.getByText("標準大気を適用中")).toBeVisible();
  });

  it("rejects a range-valid but physically singular atmosphere before apply", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog();
    const pressure = screen.getByRole("spinbutton", {
      name: "気圧（hPa）",
    });
    const temperature = screen.getByRole("spinbutton", {
      name: "気温（°C）",
    });
    const humidity = screen.getByRole("spinbutton", {
      name: "相対湿度（%）",
    });
    await user.clear(pressure);
    await user.type(pressure, "1");
    await user.clear(temperature);
    await user.type(temperature, "60");
    await user.clear(humidity);
    await user.type(humidity, "0");

    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "この気象条件では安定した大気差を計算できません",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "大気設定はまだ変更されていません",
    );
  });

  it("keeps manual provenance when unchanged draft values equal the standard preset", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog();

    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );

    expect(onApply).toHaveBeenCalledWith({
      atmosphere: STANDARD_VISUAL_ATMOSPHERE,
      inputSource: "manual",
    });
  });

  it("can explicitly return to the standard preset", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog(vi.fn(), {
      atmosphere: {
        minimumGeometricAltitudeDegrees: 8,
        pressureHpa: 998.4,
        relativeHumidity: 0.72,
        temperatureCelsius: 18.5,
        wavelengthMicrometers: 0.6,
      },
      inputSource: "manual",
    });

    await user.click(
      screen.getByRole("button", { name: "標準大気を適用" }),
    );

    expect(onApply).toHaveBeenCalledWith({
      atmosphere: STANDARD_VISUAL_ATMOSPHERE,
      inputSource: "standard",
    });
  });

  it("restores the last session-only manual values after standard or off", () => {
    renderDialog(vi.fn(), null, {
      minimumGeometricAltitudeDegrees: 7,
      pressureHpa: 987.6,
      relativeHumidity: 0.64,
      temperatureCelsius: 16.5,
      wavelengthMicrometers: 0.61,
    });

    expect(
      screen.getByRole("spinbutton", { name: "気圧（hPa）" }),
    ).toHaveValue(987.6);
    expect(
      screen.getByRole("spinbutton", { name: "相対湿度（%）" }),
    ).toHaveValue(64);
    expect(screen.getByText("オフ（大気差なし）")).toBeVisible();
  });

  it("restores common humidity percentages without binary tails", () => {
    renderDialog(vi.fn(), null, {
      minimumGeometricAltitudeDegrees: 7,
      pressureHpa: 987.6,
      relativeHumidity: 0.29,
      temperatureCelsius: 16.5,
      wavelengthMicrometers: 0.61,
    });

    expect(
      screen.getByRole("spinbutton", { name: "相対湿度（%）" }),
    ).toHaveValue(29);
  });

  it("normalizes a pasted Japanese minus sign before validation", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog();
    const temperature = screen.getByRole("spinbutton", {
      name: "気温（°C）",
    });

    fireEvent.paste(temperature, {
      clipboardData: {
        getData: () => "−12.5",
      },
    });
    expect(temperature).toHaveValue(-12.5);

    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        atmosphere: expect.objectContaining({
          temperatureCelsius: -12.5,
        }),
      }),
    );
  });

  it("removes a pasted leading fullwidth plus for number inputs", async () => {
    const user = userEvent.setup();
    const onApply = renderDialog();
    const temperature = screen.getByRole("spinbutton", {
      name: "気温（°C）",
    });

    fireEvent.paste(temperature, {
      clipboardData: {
        getData: () => "\uFF0B12",
      },
    });
    expect(temperature).toHaveValue(12);

    await user.click(
      screen.getByRole("button", { name: "手動値を適用" }),
    );
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        atmosphere: expect.objectContaining({
          temperatureCelsius: 12,
        }),
      }),
    );
  });
});
