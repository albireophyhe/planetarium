type RenderCatalogStar = {
  readonly hr: number;
  readonly vMagnitude: number;
};

export const DEFAULT_RENDER_MAGNITUDE_LIMIT = 5;

/**
 * Keep the animated frame bounded to stars that remain legible at application
 * scale. Named stars and constellation anchors stay available regardless of
 * magnitude, and source ordering is preserved.
 */
export function selectRenderableStars<T extends RenderCatalogStar>(
  catalog: readonly T[],
  requiredHrs: ReadonlySet<number>,
  magnitudeLimit = DEFAULT_RENDER_MAGNITUDE_LIMIT,
): readonly T[] {
  if (!Number.isFinite(magnitudeLimit)) {
    throw new RangeError("Magnitude limit must be finite");
  }
  return catalog.filter(
    (star) =>
      star.vMagnitude <= magnitudeLimit || requiredHrs.has(star.hr),
  );
}
