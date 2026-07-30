import {
  calculateLightweightApparentStarPositionWithContextV2,
  createApparentPositionContextV2,
  ObservationDateValidationError,
  type ApparentPositionOptionsV2,
  type PrecisionStar,
} from "../domain";
import { describe, expect, it, vi } from "vitest";
import {
  calculateSelectedStarTrack,
  formatTrackRelativeTime,
} from "./selectedStarTrack";

const TEST_STAR: PrecisionStar = {
  bvColor: 0,
  catalogName: "Test",
  decRad: 0.4,
  hd: 1,
  hr: 1,
  parallaxArcsec: 0.2,
  pmDecArcsecPerYear: -0.3,
  pmRaCosDecArcsecPerYear: 0.5,
  raRad: 1.2,
  radialVelocityKmPerSecond: 12,
  spectralType: "A0",
  vMagnitude: 1,
};

const TOKYO = {
  latitude: 35.6812,
  longitude: 139.7671,
  timeZone: "Asia/Tokyo",
};

const REFRACTION_OPTIONS: ApparentPositionOptionsV2 = {
  refraction: {
    minimumGeometricAltitudeDegrees: 5,
    pressureHpa: 1_013.25,
    relativeHumidity: 0.5,
    temperatureCelsius: 10,
    wavelengthMicrometers: 0.55,
  },
};

function sampleOptions(
  positionOptions: ApparentPositionOptionsV2,
  earthOrientationStatus:
    | "ready"
    | "unavailable"
    | "error" = "ready",
) {
  return {
    earthOrientationStatus,
    positionOptions,
  } as const;
}

describe("calculateSelectedStarTrack", () => {
  it("returns thirteen ordered precision-v2 samples across ±3 hours", async () => {
    const center = new Date("2026-07-29T12:00:00.000Z");
    const track = await calculateSelectedStarTrack(
      TEST_STAR,
      center,
      TOKYO,
      () => sampleOptions(REFRACTION_OPTIONS),
    );

    expect(track.points).toHaveLength(13);
    expect(track.points.map((point) => point.relativeMinutes)).toEqual([
      -180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180,
    ]);
    expect(track.truncatedPast).toBe(false);
    expect(track.truncatedFuture).toBe(false);
    expect(track.earthOrientationProvenance).toEqual({
      auxiliaryFallbackSampleCount: 0,
      auxiliarySampleCount: 12,
      centerStatus: "ready",
    });
    expect(track.points[6]?.observedAtIso).toBe(center.toISOString());

    const directContext = createApparentPositionContextV2(
      center,
      TOKYO,
      REFRACTION_OPTIONS,
    );
    const direct =
      calculateLightweightApparentStarPositionWithContextV2(
        TEST_STAR,
        directContext,
      );
    expect(track.points[6]?.projectionX).toBeCloseTo(
      direct.projection.x,
      12,
    );
    expect(track.points[6]?.projectionY).toBeCloseTo(
      direct.projection.y,
      12,
    );
    expect(direct.refractionMode).not.toBe("disabled");
  });

  it("truncates safely at both supported observation boundaries", async () => {
    const minimumTrack = await calculateSelectedStarTrack(
      TEST_STAR,
      new Date("1900-01-01T00:30:00.000Z"),
      TOKYO,
      () => sampleOptions({ refraction: false }),
    );
    expect(minimumTrack.truncatedPast).toBe(true);
    expect(minimumTrack.truncatedFuture).toBe(false);
    expect(minimumTrack.points[0]?.relativeMinutes).toBe(-30);
    expect(
      minimumTrack.points.every(
        (point) => new Date(point.observedAtIso).getUTCFullYear() >= 1900,
      ),
    ).toBe(true);

    const maximumTrack = await calculateSelectedStarTrack(
      TEST_STAR,
      new Date("2100-12-31T23:29:59.999Z"),
      TOKYO,
      () => sampleOptions({ refraction: false }),
    );
    expect(maximumTrack.truncatedPast).toBe(false);
    expect(maximumTrack.truncatedFuture).toBe(true);
    expect(maximumTrack.points.at(-1)?.relativeMinutes).toBe(30);
    expect(
      maximumTrack.points.every(
        (point) =>
          point.observedAtIso <= "2100-12-31T23:59:59.999Z",
      ),
    ).toBe(true);
  });

  it.each([
    new Date(Number.NaN),
    new Date("1899-12-31T23:59:59.999Z"),
    new Date("2101-01-01T00:00:00.000Z"),
  ])("rejects an unsupported center before resolving samples", async (center) => {
    const optionsAtDate = vi.fn(() =>
      sampleOptions({ refraction: false }),
    );

    await expect(
      calculateSelectedStarTrack(
        TEST_STAR,
        center,
        TOKYO,
        optionsAtDate,
      ),
    ).rejects.toBeInstanceOf(ObservationDateValidationError);
    expect(optionsAtDate).not.toHaveBeenCalled();
  });

  it("resolves time-dependent Earth orientation for every sample", async () => {
    const center = new Date("2017-01-01T00:00:00.000Z");
    const optionsAtDate = vi.fn((sampleDate: Date) =>
      sampleOptions({
        earthOrientation: {
          dut1Seconds:
            sampleDate.getTime() < center.getTime() ? -0.4 : 0.6,
          dut1Source: "caller" as const,
        },
        refraction: false as const,
      }),
    );

    const track = await calculateSelectedStarTrack(
      TEST_STAR,
      center,
      TOKYO,
      optionsAtDate,
    );

    expect(optionsAtDate).toHaveBeenCalledTimes(13);
    expect(optionsAtDate.mock.calls[0]?.[0].toISOString()).toBe(
      "2016-12-31T21:00:00.000Z",
    );
    expect(optionsAtDate.mock.calls.at(-1)?.[0].toISOString()).toBe(
      "2017-01-01T03:00:00.000Z",
    );

    for (const relativeMinutes of [-30, 30]) {
      const point = track.points.find(
        (candidate) =>
          candidate.relativeMinutes === relativeMinutes,
      );
      expect(point).toBeDefined();
      const sampleDate = new Date(point!.observedAtIso);
      const directContext = createApparentPositionContextV2(
        sampleDate,
        TOKYO,
        optionsAtDate(sampleDate).positionOptions,
      );
      const direct =
        calculateLightweightApparentStarPositionWithContextV2(
          TEST_STAR,
          directContext,
        );
      expect(point?.projectionX).toBeCloseTo(direct.projection.x, 12);
      expect(point?.projectionY).toBeCloseTo(direct.projection.y, 12);
    }
  });

  it("keeps center status and counts only fallback auxiliary samples", async () => {
    const center = new Date("2026-07-29T12:00:00.000Z");
    const track = await calculateSelectedStarTrack(
      TEST_STAR,
      center,
      TOKYO,
      (sampleDate) => {
        const relativeMinutes =
          (sampleDate.getTime() - center.getTime()) / 60_000;
        const status =
          relativeMinutes === 0
            ? "error"
            : relativeMinutes === -30
              ? "unavailable"
              : relativeMinutes === 30
                ? "error"
                : "ready";
        return sampleOptions(REFRACTION_OPTIONS, status);
      },
    );

    expect(track.earthOrientationProvenance).toEqual({
      auxiliaryFallbackSampleCount: 2,
      auxiliarySampleCount: 12,
      centerStatus: "error",
    });
  });

  it("formats the direction-key offsets compactly", () => {
    expect(formatTrackRelativeTime(-180)).toBe("−3時間");
    expect(formatTrackRelativeTime(-30)).toBe("−30分");
    expect(formatTrackRelativeTime(0)).toBe("現在");
    expect(formatTrackRelativeTime(90)).toBe("＋1時間30分");
  });
});
