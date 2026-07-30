import type {
  SelectedStarTrack,
  SelectedStarTrackPoint,
} from "../../app/types";
import { describe, expect, it } from "vitest";
import {
  createSkyTrackBuffers,
  trackProgress,
  updateSkyTrackBuffers,
  visibleCanvasTrackSegments,
} from "./skyTrackModel";

function point(
  relativeMinutes: number,
  altitudeDeg: number,
): SelectedStarTrackPoint {
  return {
    altitudeDeg,
    azimuthDeg: relativeMinutes + 180,
    observedAtIso: new Date(
      Date.UTC(2026, 6, 29, 12) + relativeMinutes * 60_000,
    ).toISOString(),
    projectionX: relativeMinutes / 360,
    projectionY: altitudeDeg / 90,
    relativeMinutes,
  };
}

function track(
  points: readonly SelectedStarTrackPoint[],
): SelectedStarTrack {
  return {
    earthOrientationProvenance: {
      auxiliaryFallbackSampleCount: 0,
      auxiliarySampleCount: Math.max(0, points.length - 1),
      centerStatus: "ready",
    },
    points,
    sampleIntervalMinutes: 30,
    starHr: 1,
    truncatedFuture: false,
    truncatedPast: false,
    windowMinutes: 180,
  };
}

describe("selected star track render model", () => {
  it("keeps above-horizon and crossing Canvas segments but drops below-only segments", () => {
    const points = [
      point(-90, -20),
      point(-60, -5),
      point(-30, 5),
      point(0, 20),
      point(30, -4),
      point(60, -12),
    ];

    expect(
      visibleCanvasTrackSegments(track(points)).map((segment) => [
        segment.start.relativeMinutes,
        segment.end.relativeMinutes,
      ]),
    ).toEqual([
      [-60, -30],
      [-30, 0],
      [0, 30],
    ]);
  });

  it("encodes past-to-future direction redundantly with progress and increasing point size", () => {
    const buffers = createSkyTrackBuffers(
      track([
        point(-180, 20),
        point(0, 30),
        point(180, 40),
      ]),
    );

    expect(Array.from(buffers.progresses)).toEqual([0, 0.5, 1]);
    expect(buffers.pointSizes[0]).toBeLessThan(
      buffers.pointSizes[1] ?? 0,
    );
    expect(buffers.pointSizes[1]).toBeLessThan(
      buffers.pointSizes[2] ?? 0,
    );
    expect(trackProgress(-999)).toBe(0);
    expect(trackProgress(999)).toBe(1);
  });

  it("reuses dynamic arrays until boundary truncation changes point count", () => {
    const initial = createSkyTrackBuffers(
      track([point(-30, 10), point(0, 20), point(30, 30)]),
    );
    const positions = initial.positions;
    const moved = updateSkyTrackBuffers(
      initial,
      track([point(-30, 12), point(0, 22), point(30, 32)]),
    );

    expect(moved.layoutChanged).toBe(false);
    expect(moved.buffers.positions).toBe(positions);

    const truncated = updateSkyTrackBuffers(
      moved.buffers,
      track([point(0, 22), point(30, 32)]),
    );
    expect(truncated.layoutChanged).toBe(true);
    expect(truncated.buffers.positions).not.toBe(positions);
  });
});
