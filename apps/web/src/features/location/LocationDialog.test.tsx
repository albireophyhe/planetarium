import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cities } from "../../domain/catalogMetadata";
import type { ObserverLocation } from "../../app/types";
import { LocationDialog } from "./LocationDialog";

const TOKYO: ObserverLocation = {
  heightMeters: 0,
  horizontalAccuracyMeters: null,
  id: "tokyo",
  latitude: 35.6812,
  locationSource: "bundled-city",
  longitude: 139.7671,
  name: "東京",
  timeZone: "Asia/Tokyo",
};

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

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog(onApply = vi.fn()) {
  render(
    <LocationDialog
      cities={cities}
      currentLocation={TOKYO}
      onApply={onApply}
      onClose={vi.fn()}
      open
    />,
  );
  return onApply;
}

describe("LocationDialog event-grade observer metadata", () => {
  it("keeps device accuracy, altitude, and provenance locally", async () => {
    let resolvePosition:
      | PositionCallback
      | undefined;
    let requestedOptions:
      | PositionOptions
      | undefined;
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (
          success: PositionCallback,
          _error: PositionErrorCallback | null,
          options?: PositionOptions,
        ) => {
          resolvePosition = success;
          requestedOptions = options;
        },
      },
    });
    const onApply = renderDialog();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "現在地を使用" }),
    );
    act(() => {
      resolvePosition?.({
        coords: {
          accuracy: 18.4,
          altitude: 42.1,
          altitudeAccuracy: 7,
          heading: null,
          latitude: 35.12345,
          longitude: 139.54321,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: 1,
        toJSON: () => ({}),
      });
    });

    expect(
      screen.getByText(/水平精度 ±18 m/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/WGS84楕円体高 42 m、垂直精度 ±7 m/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", {
        name: "緯度（北緯が正）",
      }),
    ).toHaveAttribute("step", "0.000001");
    expect(
      screen.getByRole("spinbutton", {
        name: "経度（東経が正）",
      }),
    ).toHaveAttribute("step", "0.000001");
    expect(requestedOptions).toEqual({
      enableHighAccuracy: true,
      maximumAge: 60_000,
      timeout: 15_000,
    });
    await user.click(
      screen.getByRole("button", { name: "この地点を表示" }),
    );
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        heightMeters: 42,
        horizontalAccuracyMeters: 18.4,
        latitude: 35.12345,
        locationSource: "device-geolocation",
        longitude: 139.54321,
      }),
    );
  });

  it("marks edited coordinates as manual and clears device accuracy", async () => {
    const onApply = renderDialog();
    const user = userEvent.setup();

    const latitude = screen.getByRole("spinbutton", {
      name: "緯度（北緯が正）",
    });
    await user.clear(latitude);
    await user.type(latitude, "35.7");
    const height = screen.getByRole("spinbutton", {
      name: "標高（楕円体高・m）",
    });
    await user.clear(height);
    await user.type(height, "120");
    await user.click(
      screen.getByRole("button", { name: "この地点を表示" }),
    );

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        heightMeters: 120,
        horizontalAccuracyMeters: null,
        latitude: 35.7,
        locationSource: "manual",
      }),
    );
  });

  it("rejects an implausible observer height", async () => {
    renderDialog();
    const user = userEvent.setup();
    const height = screen.getByRole("spinbutton", {
      name: "標高（楕円体高・m）",
    });
    await user.clear(height);
    await user.type(height, "12000");
    await user.click(
      screen.getByRole("button", { name: "この地点を表示" }),
    );

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent("標高は−500 mから10,000 m");
  });
});
