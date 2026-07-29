import {
  calculateLightweightApparentStarPositionWithContextV2,
  createApparentPositionContextV2,
  assertSupportedObservationDate,
  isSupportedObservationDate,
  radiansToDegrees,
  type ApparentPositionOptionsV2,
  type ObservingLocation,
  type PrecisionStar,
} from "../domain";
import type {
  SelectedStarTrack,
  SelectedStarTrackPoint,
} from "./types";

export const SELECTED_STAR_TRACK_SAMPLE_INTERVAL_MINUTES = 30;
export const SELECTED_STAR_TRACK_WINDOW_MINUTES = 180;

const MILLISECONDS_PER_MINUTE = 60_000;

export type SelectedStarTrackOptionsAtDate = (
  date: Date,
) =>
  | ApparentPositionOptionsV2
  | Promise<ApparentPositionOptionsV2>;

/**
 * Calculates only the selected star, using the same precision-v2 option set
 * as the main sky frame at each sample instant. Time-dependent DUT1 and
 * caller ephemeris vectors must be resolved by `optionsAtDate`; reusing the
 * center-time options would be wrong across an EOP or leap-second boundary.
 * Samples outside the supported observation range are omitted instead of
 * clamping multiple points onto a boundary.
 */
export async function calculateSelectedStarTrack(
  star: PrecisionStar,
  centerDate: Date,
  location: ObservingLocation,
  optionsAtDate: SelectedStarTrackOptionsAtDate,
): Promise<SelectedStarTrack> {
  assertSupportedObservationDate(centerDate);

  const samples: {
    readonly relativeMinutes: number;
    readonly sampleDate: Date;
  }[] = [];

  for (
    let relativeMinutes = -SELECTED_STAR_TRACK_WINDOW_MINUTES;
    relativeMinutes <= SELECTED_STAR_TRACK_WINDOW_MINUTES;
    relativeMinutes += SELECTED_STAR_TRACK_SAMPLE_INTERVAL_MINUTES
  ) {
    const sampleDate = new Date(
      centerDate.getTime() +
        relativeMinutes * MILLISECONDS_PER_MINUTE,
    );
    if (!isSupportedObservationDate(sampleDate)) {
      continue;
    }
    samples.push({ relativeMinutes, sampleDate });
  }

  const optionsBySample = await Promise.all(
    samples.map(({ sampleDate }) => optionsAtDate(sampleDate)),
  );
  const points: SelectedStarTrackPoint[] = samples.map(
    ({ relativeMinutes, sampleDate }, index) => {
      const options = optionsBySample[index];
      if (!options) {
        throw new Error(
          "Selected-star track options were not resolved",
        );
      }
      const context = createApparentPositionContextV2(
        sampleDate,
        location,
        options,
      );
      const position =
        calculateLightweightApparentStarPositionWithContextV2(
          star,
          context,
        );
      return Object.freeze({
        altitudeDeg: radiansToDegrees(
          position.observedHorizontal.altitude,
        ),
        azimuthDeg: radiansToDegrees(
          position.observedHorizontal.azimuth,
        ),
        observedAtIso: sampleDate.toISOString(),
        projectionX: position.projection.x,
        projectionY: position.projection.y,
        relativeMinutes,
      });
    },
  );

  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  return Object.freeze({
    points: Object.freeze(points),
    sampleIntervalMinutes:
      SELECTED_STAR_TRACK_SAMPLE_INTERVAL_MINUTES,
    starHr: star.hr,
    truncatedFuture:
      lastPoint?.relativeMinutes !==
      SELECTED_STAR_TRACK_WINDOW_MINUTES,
    truncatedPast:
      firstPoint?.relativeMinutes !==
      -SELECTED_STAR_TRACK_WINDOW_MINUTES,
    windowMinutes: SELECTED_STAR_TRACK_WINDOW_MINUTES,
  });
}

export function formatTrackRelativeTime(relativeMinutes: number) {
  if (relativeMinutes === 0) {
    return "現在";
  }
  const sign = relativeMinutes < 0 ? "−" : "＋";
  const absoluteMinutes = Math.abs(relativeMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  if (minutes === 0) {
    return `${sign}${hours}時間`;
  }
  if (hours === 0) {
    return `${sign}${minutes}分`;
  }
  return `${sign}${hours}時間${minutes}分`;
}
