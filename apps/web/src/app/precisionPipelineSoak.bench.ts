import { bench, describe } from "vitest";
import {
  calculateLightweightApparentStarPositionsWithContextV2,
  constellations,
  createApparentPositionContextV2,
  namedStars,
  type ApparentPositionOptionsV2,
  type ObservingLocation,
} from "../domain";
import { precisionStars } from "../domain/precisionData";
import { selectRenderableStars } from "./renderCatalogPolicy";

const FRAME_COUNT = 10_000;
const minimumEpochMilliseconds = Date.parse("1900-01-01T00:00:00Z");
const maximumEpochMilliseconds = Date.parse("2100-12-31T23:59:59Z");
const location: ObservingLocation = Object.freeze({
  latitude: 35.681236,
  longitude: 139.767125,
  name: "東京",
  timeZone: "Asia/Tokyo",
});
const options: ApparentPositionOptionsV2 = Object.freeze({
  earthOrientation: Object.freeze({
    dut1Seconds: 0,
    dut1Source: "caller",
    polarMotion: Object.freeze({
      source: "caller",
      xpRadians: 0,
      ypRadians: 0,
    }),
  }),
});
const requiredHrs = new Set<number>([
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
  requiredHrs,
);
const garbageCollector = (
  globalThis as typeof globalThis & { gc?: () => void }
).gc;

if (renderCatalog.length !== 1_630) {
  throw new Error(
    `Precision soak catalog changed: ${renderCatalog.length}`,
  );
}
if (!garbageCollector) {
  throw new Error(
    "Precision soak requires Node.js --expose-gc",
  );
}

describe("precision playback soak", () => {
  bench(
    "10,000 frames across the supported interval",
    () => {
      garbageCollector();
      const heapBeforeBytes = process.memoryUsage().heapUsed;
      const startedAt = performance.now();
      let checksum = 0;
      for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
        const fraction = frame / (FRAME_COUNT - 1);
        const date = new Date(
          minimumEpochMilliseconds +
            (maximumEpochMilliseconds - minimumEpochMilliseconds) *
              fraction,
        );
        const context = createApparentPositionContextV2(
          date,
          location,
          options,
        );
        const positions =
          calculateLightweightApparentStarPositionsWithContextV2(
            renderCatalog,
            context,
          );
        for (const position of positions) {
          const values = [
            position.apparentEquatorial.rightAscension,
            position.apparentEquatorial.declination,
            position.geometricHorizontal.altitude,
            position.geometricHorizontal.azimuth,
            position.observedHorizontal.altitude,
            position.observedHorizontal.azimuth,
            position.projection.x,
            position.projection.y,
          ];
          if (values.some((value) => !Number.isFinite(value))) {
            throw new Error(
              `Non-finite position at frame ${frame}, HR ${position.starHR}`,
            );
          }
          checksum +=
            position.projection.x * 1e-12 +
            position.projection.y * 1e-12;
        }
      }
      garbageCollector();
      const elapsedMilliseconds = performance.now() - startedAt;
      const heapAfterBytes = process.memoryUsage().heapUsed;
      if (!Number.isFinite(checksum)) {
        throw new Error("Precision soak checksum became non-finite");
      }
      if (heapAfterBytes - heapBeforeBytes > 32 * 1024 * 1024) {
        throw new Error(
          "Retained heap grew by more than the 32 MiB soak guard",
        );
      }
      console.info(
        JSON.stringify({
          elapsedMilliseconds,
          finitePositions: FRAME_COUNT * renderCatalog.length,
          framesPerSecond:
            (FRAME_COUNT * 1_000) / elapsedMilliseconds,
          heapDeltaBytes: heapAfterBytes - heapBeforeBytes,
        }),
      );
    },
    {
      iterations: 1,
      time: 0,
      warmupIterations: 0,
      warmupTime: 0,
    },
  );
});
