import brightStarCatalog from "../../../../shared/catalog/bright-stars.v1.json";
import {
  cities,
  constellations,
  namedStarByHR,
  namedStars,
} from "./catalogMetadata";
import type { Star } from "./types";

type PackedStar = readonly [
  hr: number,
  hd: number | null,
  raRad: number,
  decRad: number,
  vMagnitude: number,
  bvColor: number | null,
  catalogName: string | null,
  spectralType: string | null
];

interface BrightStarCatalog {
  readonly stars: readonly PackedStar[];
}

const packedStars = (brightStarCatalog as unknown as BrightStarCatalog).stars;

export const stars: readonly Star[] = packedStars.map(
  ([
    hr,
    hd,
    raRad,
    decRad,
    vMagnitude,
    bvColor,
    catalogName,
    spectralType
  ]) => ({
    hr,
    hd,
    raRad,
    decRad,
    vMagnitude,
    bvColor,
    catalogName,
    spectralType
  })
);

export const starByHR: ReadonlyMap<number, Star> = new Map(
  stars.map((star) => [star.hr, star])
);

export {
  cities,
  constellations,
  namedStarByHR,
  namedStars,
};
