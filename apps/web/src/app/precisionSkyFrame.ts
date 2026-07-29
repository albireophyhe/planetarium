import {
  calculateLightweightApparentStarPositionsWithContextV2,
  createApparentPositionContextV2,
  type ApparentPositionContextV2,
  type ApparentPositionOptionsV2,
  type LightweightApparentStarPositionV2,
  type ObservingLocation,
  type PrecisionStar,
} from "../domain";

export type PrecisionSkyFrame = {
  readonly catalog: readonly PrecisionStar[];
  readonly context: ApparentPositionContextV2;
  readonly positions: readonly LightweightApparentStarPositionV2[];
};

/**
 * Builds the one immutable astronomy context shared by a rendered frame.
 * The catalog and result arrays retain the same deterministic HR ordering.
 */
export function calculatePrecisionSkyFrame(
  catalog: readonly PrecisionStar[],
  date: Date,
  location: ObservingLocation,
  options: ApparentPositionOptionsV2 = {},
): PrecisionSkyFrame {
  const context = createApparentPositionContextV2(
    date,
    location,
    options,
  );
  const positions =
    calculateLightweightApparentStarPositionsWithContextV2(
      catalog,
      context,
    );

  return {
    catalog,
    context,
    positions,
  };
}
