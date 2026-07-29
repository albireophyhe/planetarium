import { describe, expect, it } from "vitest";
import {
  advancePlayback,
  isPlaybackSpeed,
  outboundPlaybackBoundary,
  PLAYBACK_SPEEDS,
} from "./playbackClock";

describe("advancePlayback", () => {
  it("advances and reverses from a caller-supplied monotonic delta", () => {
    const currentDate = new Date("2026-07-29T00:00:00.000Z");

    expect(
      advancePlayback({
        currentDate,
        direction: 1,
        realDeltaSeconds: 0.1,
        speed: 3_600,
      }).date.toISOString(),
    ).toBe("2026-07-29T00:06:00.000Z");

    expect(
      advancePlayback({
        currentDate,
        direction: -1,
        realDeltaSeconds: 0.1,
        speed: 3_600,
      }).date.toISOString(),
    ).toBe("2026-07-28T23:54:00.000Z");
  });

  it("caps a long frame so a resumed tab cannot jump", () => {
    const result = advancePlayback({
      currentDate: new Date("2026-07-29T00:00:00.000Z"),
      direction: 1,
      realDeltaSeconds: 30,
      speed: 3_600,
    });

    expect(result.simulatedDeltaSeconds).toBe(900);
    expect(result.date.toISOString()).toBe(
      "2026-07-29T00:15:00.000Z",
    );
  });

  it("clamps at both supported boundaries", () => {
    const maximum = advancePlayback({
      currentDate: new Date("2100-12-31T23:59:59.900Z"),
      direction: 1,
      realDeltaSeconds: 0.25,
      speed: 1,
    });
    expect(maximum.boundary).toBe("maximum");
    expect(maximum.date.toISOString()).toBe(
      "2100-12-31T23:59:59.999Z",
    );

    const minimum = advancePlayback({
      currentDate: new Date("1900-01-01T00:00:00.100Z"),
      direction: -1,
      realDeltaSeconds: 0.25,
      speed: 1,
    });
    expect(minimum.boundary).toBe("minimum");
    expect(minimum.date.toISOString()).toBe(
      "1900-01-01T00:00:00.000Z",
    );
  });

  it("can move inward from either exact supported boundary", () => {
    const fromMinimum = advancePlayback({
      currentDate: new Date("1900-01-01T00:00:00.000Z"),
      direction: 1,
      realDeltaSeconds: 0.1,
      speed: 1,
    });
    expect(fromMinimum.boundary).toBeNull();
    expect(fromMinimum.date.toISOString()).toBe(
      "1900-01-01T00:00:00.100Z",
    );

    const fromMaximum = advancePlayback({
      currentDate: new Date("2100-12-31T23:59:59.999Z"),
      direction: -1,
      realDeltaSeconds: 0.1,
      speed: 1,
    });
    expect(fromMaximum.boundary).toBeNull();
    expect(fromMaximum.date.toISOString()).toBe(
      "2100-12-31T23:59:59.899Z",
    );
  });

  it("canonicalizes invalid and out-of-range playback ingress", () => {
    const invalidForward = advancePlayback({
      currentDate: new Date(Number.NaN),
      direction: 1,
      realDeltaSeconds: 0.1,
      speed: 1,
    });
    expect(invalidForward.boundary).toBeNull();
    expect(invalidForward.date.toISOString()).toBe(
      "1900-01-01T00:00:00.100Z",
    );

    const lateInward = advancePlayback({
      currentDate: new Date("2101-01-01T00:00:00.000Z"),
      direction: -1,
      realDeltaSeconds: 0.1,
      speed: 1,
    });
    expect(lateInward.boundary).toBeNull();
    expect(lateInward.date.toISOString()).toBe(
      "2100-12-31T23:59:59.899Z",
    );

    expect(
      outboundPlaybackBoundary(new Date(Number.NaN), -1),
    ).toBe("minimum");
    expect(
      outboundPlaybackBoundary(
        new Date("2101-01-01T00:00:00.000Z"),
        1,
      ),
    ).toBe("maximum");
  });

  it("ignores invalid or negative elapsed time", () => {
    const currentDate = new Date("2026-07-29T00:00:00.000Z");
    for (const realDeltaSeconds of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      0,
    ]) {
      const result = advancePlayback({
        currentDate,
        direction: 1,
        realDeltaSeconds,
        speed: 60,
      });
      expect(result.date).toBe(currentDate);
      expect(result.simulatedDeltaSeconds).toBe(0);
    }
  });
});

describe("outboundPlaybackBoundary", () => {
  it("reports only exact outward-facing supported boundaries", () => {
    const minimum = new Date("1900-01-01T00:00:00.000Z");
    const maximum = new Date("2100-12-31T23:59:59.999Z");

    expect(outboundPlaybackBoundary(maximum, 1)).toBe("maximum");
    expect(outboundPlaybackBoundary(minimum, -1)).toBe("minimum");
    expect(outboundPlaybackBoundary(maximum, -1)).toBeNull();
    expect(outboundPlaybackBoundary(minimum, 1)).toBeNull();
  });
});

describe("playback speed presets", () => {
  it("are ordered, unique and validated", () => {
    const values = PLAYBACK_SPEEDS.map(
      ({ secondsPerSecond }) => secondsPerSecond,
    );
    expect(values).toEqual([1, 60, 600, 3_600, 86_400]);
    expect(new Set(values).size).toBe(values.length);
    expect(isPlaybackSpeed(600)).toBe(true);
    expect(isPlaybackSpeed(42)).toBe(false);
  });
});
