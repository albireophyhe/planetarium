import type {
  SelectedStarTrack,
  SelectedStarTrackPoint,
} from "../../app/types";
import { horizontalToCartesian } from "./skySphere3DModel";

export type SkyTrackSegment = {
  end: SelectedStarTrackPoint;
  start: SelectedStarTrackPoint;
};

export type SkyTrackBuffers = {
  pointCount: number;
  pointSizes: Float32Array;
  positions: Float32Array;
  progresses: Float32Array;
};

export type SkyTrackBufferUpdate = {
  buffers: SkyTrackBuffers;
  layoutChanged: boolean;
};

export function trackProgress(relativeMinutes: number) {
  return Math.max(0, Math.min(1, (relativeMinutes + 180) / 360));
}

/**
 * The Canvas renderer clips crossing segments against the horizon circle.
 * Segments with both samples below the horizon are omitted so the path cannot
 * create a false chord through the visible hemisphere.
 */
export function visibleCanvasTrackSegments(
  track: SelectedStarTrack,
): readonly SkyTrackSegment[] {
  const segments: SkyTrackSegment[] = [];
  for (let index = 1; index < track.points.length; index += 1) {
    const start = track.points[index - 1];
    const end = track.points[index];
    if (
      start &&
      end &&
      (start.altitudeDeg >= 0 || end.altitudeDeg >= 0)
    ) {
      segments.push({ end, start });
    }
  }
  return segments;
}

function writeTrackBuffers(
  buffers: SkyTrackBuffers,
  track: SelectedStarTrack | null,
) {
  const points = track?.points ?? [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!point) {
      continue;
    }
    const position = horizontalToCartesian(
      point.altitudeDeg,
      point.azimuthDeg,
      1.004,
    );
    const offset = index * 3;
    const progress = trackProgress(point.relativeMinutes);
    buffers.positions[offset] = position.x;
    buffers.positions[offset + 1] = position.y;
    buffers.positions[offset + 2] = position.z;
    buffers.progresses[index] = progress;
    buffers.pointSizes[index] = 2.8 + progress * 3;
  }
}

export function createSkyTrackBuffers(
  track: SelectedStarTrack | null,
): SkyTrackBuffers {
  const pointCount = track?.points.length ?? 0;
  const buffers = {
    pointCount,
    pointSizes: new Float32Array(pointCount),
    positions: new Float32Array(pointCount * 3),
    progresses: new Float32Array(pointCount),
  };
  writeTrackBuffers(buffers, track);
  return buffers;
}

export function updateSkyTrackBuffers(
  current: SkyTrackBuffers,
  track: SelectedStarTrack | null,
): SkyTrackBufferUpdate {
  const pointCount = track?.points.length ?? 0;
  if (current.pointCount !== pointCount) {
    return {
      buffers: createSkyTrackBuffers(track),
      layoutChanged: true,
    };
  }
  writeTrackBuffers(current, track);
  return { buffers: current, layoutChanged: false };
}
