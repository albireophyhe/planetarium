import renderStarCatalog from "../../../../shared/catalog/render-stars.v1.json";
import type { Star } from "./types";

type PackedStar = readonly [
  hr: number,
  hd: number | null,
  raRad: number,
  decRad: number,
  vMagnitude: number,
  bvColor: number | null,
  catalogName: string | null,
  spectralType: string | null,
];

interface RenderStarCatalog {
  readonly selection: {
    readonly magnitudeLimit: number;
    readonly requiredHrs: readonly number[];
  };
  readonly stars: readonly PackedStar[];
}

const catalog =
  renderStarCatalog as unknown as RenderStarCatalog;

export const renderMagnitudeLimit =
  catalog.selection.magnitudeLimit;

export const requiredRenderStarHrs: ReadonlySet<number> =
  new Set(catalog.selection.requiredHrs);

export const renderStars: readonly Star[] = catalog.stars.map(
  ([
    hr,
    hd,
    raRad,
    decRad,
    vMagnitude,
    bvColor,
    catalogName,
    spectralType,
  ]) => ({
    hr,
    hd,
    raRad,
    decRad,
    vMagnitude,
    bvColor,
    catalogName,
    spectralType,
  }),
);
