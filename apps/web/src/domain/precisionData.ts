import precisionStarCatalog from "../../../../shared/catalog/bright-stars.v2.json";
import type { PrecisionStar } from "./precision";

type PackedPrecisionStar = readonly [
  hr: number,
  hd: number | null,
  raRad: number,
  decRad: number,
  vMagnitude: number,
  bvColor: number | null,
  catalogName: string | null,
  spectralType: string | null,
  pmRaCosDecArcsecPerYear: number | null,
  pmDecArcsecPerYear: number | null,
  parallaxArcsec: number | null,
  radialVelocityKmPerSecond: number | null
];

interface PrecisionStarCatalog {
  readonly schemaVersion: 2;
  readonly stars: readonly PackedPrecisionStar[];
}

const packedPrecisionStars = (
  precisionStarCatalog as unknown as PrecisionStarCatalog
).stars;

function createReadonlyMap<K, V>(
  entries: Iterable<readonly [K, V]>
): ReadonlyMap<K, V> {
  const map = new Map(entries);
  const view: ReadonlyMap<K, V> = Object.freeze({
    get size() {
      return map.size;
    },
    entries: () => map.entries(),
    forEach: (
      callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
      thisArg?: unknown
    ) => {
      map.forEach((value, key) =>
        callback.call(thisArg, value, key, view)
      );
    },
    get: (key: K) => map.get(key),
    has: (key: K) => map.has(key),
    keys: () => map.keys(),
    values: () => map.values(),
    [Symbol.iterator]: () => map[Symbol.iterator]()
  });
  return view;
}

export const precisionStars: readonly PrecisionStar[] = Object.freeze(
  packedPrecisionStars.map(
    ([
      hr,
      hd,
      raRad,
      decRad,
      vMagnitude,
      bvColor,
      catalogName,
      spectralType,
      pmRaCosDecArcsecPerYear,
      pmDecArcsecPerYear,
      parallaxArcsec,
      radialVelocityKmPerSecond
    ]) =>
      Object.freeze({
        hr,
        hd,
        raRad,
        decRad,
        vMagnitude,
        bvColor,
        catalogName,
        spectralType,
        pmRaCosDecArcsecPerYear,
        pmDecArcsecPerYear,
        parallaxArcsec,
        radialVelocityKmPerSecond
      })
  )
);

export const precisionStarByHR: ReadonlyMap<number, PrecisionStar> =
  createReadonlyMap(
    precisionStars.map((star) => [star.hr, star] as const)
  );
