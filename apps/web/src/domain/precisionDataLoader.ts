import type { PrecisionStar } from "./precision";

export interface PrecisionStarCatalogV2 {
  readonly stars: readonly PrecisionStar[];
  readonly starByHR: ReadonlyMap<number, PrecisionStar>;
}

let catalogPromise: Promise<PrecisionStarCatalogV2> | undefined;

/**
 * Load the larger proper-motion catalog as a separate application chunk.
 *
 * Keeping this asynchronous prevents applications that only use the v1
 * catalog from paying for both catalogs in their initial JavaScript bundle.
 */
export function loadPrecisionStarCatalogV2(): Promise<PrecisionStarCatalogV2> {
  catalogPromise ??= import("./precisionData")
    .then(({ precisionStarByHR, precisionStars }) =>
      Object.freeze({
        stars: precisionStars,
        starByHR: precisionStarByHR
      })
    )
    .catch((error: unknown) => {
      // A transient chunk/network failure must remain recoverable through an
      // explicit retry instead of poisoning the module-level promise forever.
      catalogPromise = undefined;
      throw error;
    });
  return catalogPromise;
}
