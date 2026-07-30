import cityCatalog from "../../../../shared/catalog/cities.v1.json";
import constellationCatalog from "../../../../shared/catalog/constellations.v1.json";
import namedStarCatalog from "../../../../shared/catalog/star-names.v1.json";
import type {
  City,
  Constellation,
  NamedStar,
} from "./types";

interface NamedStarCatalog {
  readonly stars: readonly NamedStar[];
}

interface ConstellationCatalog {
  readonly constellations: readonly Constellation[];
}

interface CityCatalog {
  readonly cities: readonly City[];
}

export const namedStars: readonly NamedStar[] = (
  namedStarCatalog as unknown as NamedStarCatalog
).stars;

export const constellations: readonly Constellation[] = (
  constellationCatalog as unknown as ConstellationCatalog
).constellations;

export const cities: readonly City[] = (
  cityCatalog as unknown as CityCatalog
).cities;

export const namedStarByHR: ReadonlyMap<number, NamedStar> = new Map(
  namedStars.map((star) => [star.hr, star]),
);
