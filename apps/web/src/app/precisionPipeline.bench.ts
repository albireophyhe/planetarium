import { bench, describe } from "vitest";
import {
  calculateLightweightApparentStarPositionsWithContextV2,
  createApparentPositionContextV2,
  type ApparentPositionOptionsV2,
  type ObservingLocation,
} from "../domain";
import {
  constellations,
  namedStars,
} from "../domain/catalogMetadata";
import { precisionStars } from "../domain/precisionData";
import { selectRenderableStars } from "./renderCatalogPolicy";

const BENCHMARK_DATE = new Date("2026-07-29T12:00:00.000Z");
const BENCHMARK_LOCATION: ObservingLocation = Object.freeze({
  latitude: 35.681236,
  longitude: 139.767125,
  name: "東京",
  timeZone: "Asia/Tokyo",
});
const BENCHMARK_OPTIONS: ApparentPositionOptionsV2 = Object.freeze({
  earthOrientation: Object.freeze({
    dut1Seconds: 0.012_413_6,
    dut1Source: "caller",
    polarMotion: Object.freeze({
      source: "caller",
      xpRadians: 0.220_152 * (Math.PI / (180 * 3_600)),
      ypRadians: 0.365_198 * (Math.PI / (180 * 3_600)),
    }),
  }),
});
const requiredRenderStarHrs = new Set<number>([
  ...namedStars.map((star) => star.hr),
  ...constellations.flatMap((constellation) =>
    constellation.segments.flatMap(([startHr, endHr]) => [
      startHr,
      endHr,
    ]),
  ),
]);
const renderCatalog = selectRenderableStars(
  precisionStars,
  requiredRenderStarHrs,
);
const reusableContext = createApparentPositionContextV2(
  BENCHMARK_DATE,
  BENCHMARK_LOCATION,
  BENCHMARK_OPTIONS,
);
const benchmarkOptions = Object.freeze({
  iterations: 100,
  time: 2_000,
  warmupIterations: 20,
  warmupTime: 500,
});

if (renderCatalog.length !== 1_630) {
  throw new Error(
    `Precision benchmark render catalog changed: expected 1630, received ${renderCatalog.length}`,
  );
}
if (precisionStars.length !== 8_404) {
  throw new Error(
    `Precision benchmark full catalog changed: expected 8404, received ${precisionStars.length}`,
  );
}

describe("precision render pipeline", () => {
  bench(
    "one astronomy context construction",
    () => {
      createApparentPositionContextV2(
        BENCHMARK_DATE,
        BENCHMARK_LOCATION,
        BENCHMARK_OPTIONS,
      );
    },
    benchmarkOptions,
  );

  bench(
    "1,630-star UI batch with a reused context",
    () => {
      calculateLightweightApparentStarPositionsWithContextV2(
        renderCatalog,
        reusableContext,
      );
    },
    benchmarkOptions,
  );

  bench(
    "8,404-star full-catalog batch with a reused context",
    () => {
      calculateLightweightApparentStarPositionsWithContextV2(
        precisionStars,
        reusableContext,
      );
    },
    benchmarkOptions,
  );
});
