import brightStarCatalog from "../../../../shared/catalog/bright-stars.v1.json";
import cityCatalog from "../../../../shared/catalog/cities.v1.json";
import constellationCatalog from "../../../../shared/catalog/constellations.v1.json";
import namedStarCatalog from "../../../../shared/catalog/star-names.v1.json";
import type {
  City,
  Constellation,
  NamedStar,
  Star
} from "./types";

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

interface NamedStarCatalog {
  readonly stars: readonly NamedStar[];
}

interface ConstellationCatalog {
  readonly constellations: readonly Constellation[];
}

interface CityCatalog {
  readonly cities: readonly City[];
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

export const namedStars: readonly NamedStar[] = (
  namedStarCatalog as unknown as NamedStarCatalog
).stars;

export const constellations: readonly Constellation[] = (
  constellationCatalog as unknown as ConstellationCatalog
).constellations;

export const cities: readonly City[] = (
  cityCatalog as unknown as CityCatalog
).cities;

export const starByHR: ReadonlyMap<number, Star> = new Map(
  stars.map((star) => [star.hr, star])
);

export const namedStarByHR: ReadonlyMap<number, NamedStar> = new Map(
  namedStars.map((star) => [star.hr, star])
);
