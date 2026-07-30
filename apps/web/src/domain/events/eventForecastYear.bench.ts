// @vitest-environment node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bench, describe } from "vitest";
import {
  createChunkedEarthOrientationAccess,
  type EarthOrientationChunkDescriptorV1,
  type EncodedEarthOrientationChunkV1,
  type IersEarthOrientationEstimateV1,
} from "../earthOrientation";
import type {
  EarthOrientationOptions,
} from "../precision";
import { precisionStarByHR } from "../precisionData";
import type { ObservingLocation } from "../types";
import { De442sEphemerisLoader } from "./de442sLoader";
import { EventCandidateLoader } from "./eventCandidates";
import {
  calculateLocalLunarEclipse,
  calculateLocalLunarOccultation,
  calculateLocalSolarEclipse,
  eventEarthRotationFallback,
} from "./index";
import type {
  EventAssetFetch,
} from "./eventAssetTransport";

const repositoryRoot = fileURLToPath(
  new URL("../../../../../", import.meta.url),
);
const benchmarkYear = Number(
  process.env.PLANETARIUM_EVENT_BENCHMARK_YEAR ?? "2026",
);
const garbageCollector = (
  globalThis as typeof globalThis & { gc?: () => void }
).gc;
const location: ObservingLocation = Object.freeze({
  latitude: 35.681_236,
  longitude: 139.767_125,
  name: "東京",
  timeZone: "Asia/Tokyo",
});

if (
  !Number.isSafeInteger(benchmarkYear) ||
  benchmarkYear < 1900 ||
  benchmarkYear > 2100
) {
  throw new RangeError(
    "PLANETARIUM_EVENT_BENCHMARK_YEAR must be an integer from 1900 through 2100",
  );
}
if (!garbageCollector) {
  throw new Error(
    "Annual event benchmark requires Node.js --expose-gc",
  );
}

interface EarthOrientationManifest {
  readonly source: {
    readonly retrievedAt: string;
    readonly sourceSha256: string;
  };
  readonly chunks: readonly (
    EarthOrientationChunkDescriptorV1 & {
      readonly rawBytes: number;
      readonly gzipBytes: number;
    }
  )[];
}

interface AssetRead {
  readonly bytes: number;
  readonly count: number;
}

class AssetReadTracker {
  readonly reads = new Map<string, AssetRead>();
  activeReads = 0;
  peakConcurrentReads = 0;

  async read(relativePath: string) {
    this.activeReads += 1;
    this.peakConcurrentReads = Math.max(
      this.peakConcurrentReads,
      this.activeReads,
    );
    try {
      const bytes = await readFile(`${repositoryRoot}${relativePath}`);
      const previous = this.reads.get(relativePath);
      this.reads.set(relativePath, {
        bytes: bytes.byteLength,
        count: (previous?.count ?? 0) + 1,
      });
      return bytes;
    } finally {
      this.activeReads -= 1;
    }
  }
}

function assetRelativePath(path: string): string | null {
  if (path.startsWith("/event-data/de442s/chunks/")) {
    return path.replace(
      "/event-data/de442s/chunks/",
      "shared/ephemeris/de442s/chunks/",
    );
  }
  if (
    path === "/event-data/de442s/de442s-manifest.v1.json"
  ) {
    return "shared/ephemeris/de442s/de442s-manifest.v1.json";
  }
  if (path.startsWith("/event-data/candidates/chunks/")) {
    return path.replace(
      "/event-data/candidates/chunks/",
      "shared/events/chunks/",
    );
  }
  if (
    path ===
    "/event-data/candidates/event-candidates-manifest.v1.json"
  ) {
    return "shared/events/event-candidates-manifest.v1.json";
  }
  return null;
}

function localAssetFetch(
  tracker: AssetReadTracker,
): EventAssetFetch {
  return async (path) => {
    const relativePath = assetRelativePath(path);
    if (!relativePath) {
      return new Response(null, { status: 404 });
    }
    return new Response(await tracker.read(relativePath), {
      status: 200,
    });
  };
}

function earthOrientationOptions(
  estimate: IersEarthOrientationEstimateV1,
): EarthOrientationOptions {
  return {
    dut1Seconds: estimate.dut1.seconds,
    dut1Source:
      estimate.dut1.source === "observed"
        ? "iers-observed"
        : "iers-predicted",
    dut1UncertaintySeconds:
      estimate.dut1.reportedErrorSeconds,
    polarMotion: {
      source:
        estimate.polarMotion.source === "observed"
          ? "iers-observed"
          : "iers-predicted",
      xpRadians: estimate.polarMotion.xpRadians,
      ypRadians: estimate.polarMotion.ypRadians,
      xpReportedErrorRadians:
        estimate.polarMotion.xpReportedErrorRadians,
      ypReportedErrorRadians:
        estimate.polarMotion.ypReportedErrorRadians,
    },
  };
}

function quality(
  estimate:
    | IersEarthOrientationEstimateV1["dut1"]
    | IersEarthOrientationEstimateV1["polarMotion"],
): "observed" | "predicted" | "mixed" {
  return estimate.quality ?? estimate.source;
}

function memorySample(): {
  readonly heapUsedBytes: number;
  readonly rssBytes: number;
} {
  const usage = process.memoryUsage();
  return {
    heapUsedBytes: usage.heapUsed,
    rssBytes: usage.rss,
  };
}

function assetGroup(
  tracker: AssetReadTracker,
  prefix: string,
): {
  readonly files: readonly string[];
  readonly rawBytes: number;
  readonly readCount: number;
} {
  const entries = [...tracker.reads.entries()]
    .filter(([file]) => file.startsWith(prefix))
    .sort(([left], [right]) => left.localeCompare(right));
  return {
    files: entries.map(([file]) => file),
    rawBytes: entries.reduce(
      (sum, [, read]) => sum + read.bytes,
      0,
    ),
    readCount: entries.reduce(
      (sum, [, read]) => sum + read.count,
      0,
    ),
  };
}

describe("annual local event forecast", () => {
  bench(
    `${benchmarkYear} Tokyo cold-load and full-year calculation`,
    async () => {
      garbageCollector();
      const baseline = memorySample();
      let peakHeapUsedBytes = baseline.heapUsedBytes;
      let peakRssBytes = baseline.rssBytes;
      const sampleMemory = () => {
        const sample = memorySample();
        peakHeapUsedBytes = Math.max(
          peakHeapUsedBytes,
          sample.heapUsedBytes,
        );
        peakRssBytes = Math.max(peakRssBytes, sample.rssBytes);
      };
      const tracker = new AssetReadTracker();
      const fetchAsset = localAssetFetch(tracker);
      const startUtc = new Date(
        `${benchmarkYear}-01-01T00:00:00.000Z`,
      );
      const endUtc = new Date(
        `${benchmarkYear}-12-31T23:59:59.999Z`,
      );
      const totalStartedAt = performance.now();

      const candidateStartedAt = performance.now();
      const candidates = await new EventCandidateLoader(
        fetchAsset,
      ).loadRange(startUtc, endUtc);
      const candidateLoadMilliseconds =
        performance.now() - candidateStartedAt;
      sampleMemory();

      const eopPromise = (async () => {
        const startedAt = performance.now();
        const eopManifestBytes = await tracker.read(
          "shared/eop/iers-finals2000a-eop.v1.json",
        );
        const manifest = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            eopManifestBytes,
          ),
        ) as EarthOrientationManifest;
        const eopAccess = createChunkedEarthOrientationAccess(
          manifest.chunks,
          async (descriptor) => {
            const bytes = await tracker.read(descriptor.file);
            return JSON.parse(
              new TextDecoder("utf-8", { fatal: true }).decode(
                bytes,
              ),
            ) as EncodedEarthOrientationChunkV1;
          },
        );
        const paddingMilliseconds = 2 * 24 * 60 * 60 * 1_000;
        const snapshot = await eopAccess.loadSnapshot(
          new Date(startUtc.getTime() - paddingMilliseconds),
          new Date(endUtc.getTime() + paddingMilliseconds),
        );
        return {
          elapsedMilliseconds: performance.now() - startedAt,
          manifest,
          snapshot,
        };
      })();
      const ephemerisPromise = (async () => {
        const startedAt = performance.now();
        const ephemeris = await new De442sEphemerisLoader({
          baseUrl: "/event-data/de442s/",
          fetch: fetchAsset,
          pageUrl: "https://planetarium.test/",
        }).loadRange(
          Math.min(
            ...candidates.map(
              ({ seed }) => seed.searchStartJulianDateTdb,
            ),
          ),
          Math.max(
            ...candidates.map(
              ({ seed }) => seed.searchEndJulianDateTdb,
            ),
          ),
          { clipToCoverage: true },
        );
        return {
          elapsedMilliseconds: performance.now() - startedAt,
          ephemeris,
        };
      })();
      const [eopResult, ephemerisResult] = await Promise.all([
        eopPromise,
        ephemerisPromise,
      ]);
      const eopManifest = eopResult.manifest;
      const eopSnapshot = eopResult.snapshot;
      const eopLoadMilliseconds =
        eopResult.elapsedMilliseconds;
      const ephemeris = ephemerisResult.ephemeris;
      const ephemerisLoadMilliseconds =
        ephemerisResult.elapsedMilliseconds;
      sampleMemory();

      let calculatedForecasts = 0;
      const failures: string[] = [];
      let cooperativeYieldMilliseconds = 0;
      let solverCalculationMilliseconds = 0;
      const forecastStartedAt = performance.now();
      for (const candidate of candidates) {
        const solverStartedAt = performance.now();
        try {
          const estimateAtMaximum = eopSnapshot.lookup(
            candidate.summary.canonicalEpochUtc,
          );
          const fallbackAtMaximum = estimateAtMaximum
            ? null
            : eventEarthRotationFallback(
                candidate.summary.canonicalEpochUtc,
              );
          const earthOrientationAt = (date: Date) => {
            const estimate = eopSnapshot.lookup(date);
            return estimate
              ? earthOrientationOptions(estimate)
              : eventEarthRotationFallback(date).earthOrientation;
          };
          const commonOptions = {
            deltaTModel:
              fallbackAtMaximum?.deltaTModel ??
              "IERS-EOP-and-bundled-leap-second-history",
            dut1Quality: estimateAtMaximum
              ? quality(estimateAtMaximum.dut1)
              : ("outside-coverage" as const),
            earthOrientationAt,
            earthOrientationProvenanceAt: (date: Date) => {
              const estimate = eopSnapshot.lookup(date);
              return estimate
                ? {
                    dut1Quality: quality(estimate.dut1),
                    eopRetrievedAt:
                      eopManifest.source.retrievedAt,
                    eopSourceSha256:
                      eopManifest.source.sourceSha256,
                    polarMotionQuality: quality(
                      estimate.polarMotion,
                    ),
                  }
                : {
                    dut1Quality: "outside-coverage" as const,
                    eopRetrievedAt: null,
                    eopSourceSha256: null,
                    polarMotionQuality:
                      "outside-coverage" as const,
                  };
            },
            earthRotationPathUncertaintyKilometers:
              fallbackAtMaximum?.pathUncertaintyKilometers,
            eopId:
              fallbackAtMaximum?.eopId ??
              "bundled-IERS-EOP",
            eopRetrievedAt: estimateAtMaximum
              ? eopManifest.source.retrievedAt
              : null,
            eopSourceSha256: estimateAtMaximum
              ? eopManifest.source.sourceSha256
              : null,
            heightMeters: 0,
            horizontalAccuracyMeters: null,
            locationSource: "bundled-city" as const,
            polarMotionQuality: estimateAtMaximum
              ? quality(estimateAtMaximum.polarMotion)
              : ("outside-coverage" as const),
            timeScaleContributors:
              fallbackAtMaximum?.dominantContributors ?? [],
            timeScaleWarnings:
              fallbackAtMaximum?.warnings ?? [],
            timingUncertaintySeconds:
              fallbackAtMaximum?.deltaTUncertaintySeconds,
          };
          let forecast;
          switch (candidate.seed.kind) {
            case "solar-eclipse":
              forecast = calculateLocalSolarEclipse(
                ephemeris,
                candidate.summary,
                location,
                commonOptions,
              );
              break;
            case "lunar-eclipse":
              forecast = calculateLocalLunarEclipse(
                ephemeris,
                candidate.summary,
                location,
                commonOptions,
              );
              break;
            case "lunar-occultation": {
              const target = precisionStarByHR.get(
                candidate.seed.target.hr,
              );
              if (!target) {
                throw new Error(
                  `HR ${candidate.seed.target.hr} is missing`,
                );
              }
              forecast = calculateLocalLunarOccultation(
                ephemeris,
                candidate.summary,
                target,
                location,
                commonOptions,
              );
              break;
            }
          }
          if (forecast) calculatedForecasts += 1;
          sampleMemory();
        } catch (error) {
          failures.push(
            `${candidate.summary.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        solverCalculationMilliseconds +=
          performance.now() - solverStartedAt;
        const yieldStartedAt = performance.now();
        await new Promise<void>((resolve) => {
          globalThis.setTimeout(resolve, 0);
        });
        cooperativeYieldMilliseconds +=
          performance.now() - yieldStartedAt;
      }
      const forecastCalculationMilliseconds =
        performance.now() - forecastStartedAt;
      const totalMilliseconds =
        performance.now() - totalStartedAt;
      if (failures.length > 0) {
        throw new Error(failures.join("\n"));
      }

      garbageCollector();
      const retained = memorySample();
      const candidateChunks = assetGroup(
        tracker,
        "shared/events/chunks/",
      );
      const de442sChunks = assetGroup(
        tracker,
        "shared/ephemeris/de442s/chunks/",
      );
      const eopChunks = assetGroup(
        tracker,
        "shared/eop/eop/",
      );
      const eopChunkFiles = new Set(eopChunks.files);
      const eopGzipBytes = eopManifest.chunks
        .filter((descriptor) =>
          eopChunkFiles.has(descriptor.file),
        )
        .reduce(
          (sum, descriptor) => sum + descriptor.gzipBytes,
          0,
        );
      console.info(
        JSON.stringify({
          benchmark: "annual-local-event-forecast",
          runtime: "web-node",
          year: benchmarkYear,
          location: "Tokyo",
          candidates: candidates.length,
          calculatedForecasts,
          candidateLoadMilliseconds,
          eopLoadMilliseconds,
          ephemerisLoadMilliseconds,
          forecastCalculationMilliseconds,
          solverCalculationMilliseconds,
          cooperativeYieldMilliseconds,
          totalMilliseconds,
          baselineHeapUsedBytes: baseline.heapUsedBytes,
          retainedHeapDeltaBytes:
            retained.heapUsedBytes - baseline.heapUsedBytes,
          peakHeapUsedBytes,
          baselineRssBytes: baseline.rssBytes,
          peakRssBytes,
          peakConcurrentAssetReads:
            tracker.peakConcurrentReads,
          assets: {
            candidateChunks,
            de442sChunks,
            eopChunks: {
              ...eopChunks,
              gzipBytes: eopGzipBytes,
            },
          },
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

  bench(
    `${benchmarkYear} → adjacent year → ${benchmarkYear} warm asset navigation`,
    async () => {
      garbageCollector();
      const baseline = memorySample();
      const tracker = new AssetReadTracker();
      const fetchAsset = localAssetFetch(tracker);
      const candidateLoader =
        new EventCandidateLoader(fetchAsset);
      const ephemerisLoader =
        new De442sEphemerisLoader({
          baseUrl: "/event-data/de442s/",
          fetch: fetchAsset,
          pageUrl: "https://planetarium.test/",
        });
      const eopManifestBytes = await tracker.read(
        "shared/eop/iers-finals2000a-eop.v1.json",
      );
      const eopManifest = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          eopManifestBytes,
        ),
      ) as EarthOrientationManifest;
      const eopAccess = createChunkedEarthOrientationAccess(
        eopManifest.chunks,
        async (descriptor) => {
          const bytes = await tracker.read(descriptor.file);
          return JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              bytes,
            ),
          ) as EncodedEarthOrientationChunkV1;
        },
      );
      const adjacentYear =
        benchmarkYear === 2100
          ? benchmarkYear - 1
          : benchmarkYear + 1;

      const readCount = () =>
        [...tracker.reads.values()].reduce(
          (sum, read) => sum + read.count,
          0,
        );
      const loadYearAssets = async (year: number) => {
        const startUtc = new Date(
          `${year}-01-01T00:00:00.000Z`,
        );
        const endUtc = new Date(
          `${year}-12-31T23:59:59.999Z`,
        );
        const startedAt = performance.now();
        const candidates = await candidateLoader.loadRange(
          startUtc,
          endUtc,
        );
        const paddingMilliseconds =
          2 * 24 * 60 * 60 * 1_000;
        await Promise.all([
          ephemerisLoader.loadRange(
            Math.min(
              ...candidates.map(
                ({ seed }) =>
                  seed.searchStartJulianDateTdb,
              ),
            ),
            Math.max(
              ...candidates.map(
                ({ seed }) =>
                  seed.searchEndJulianDateTdb,
              ),
            ),
            { clipToCoverage: true },
          ),
          eopAccess.loadSnapshot(
            new Date(
              startUtc.getTime() - paddingMilliseconds,
            ),
            new Date(
              endUtc.getTime() + paddingMilliseconds,
            ),
          ),
        ]);
        return {
          candidateCount: candidates.length,
          elapsedMilliseconds:
            performance.now() - startedAt,
          totalAssetReadCount: readCount(),
        };
      };

      const firstA = await loadYearAssets(benchmarkYear);
      const adjacent =
        await loadYearAssets(adjacentYear);
      const readsBeforeReturn = readCount();
      const secondA = await loadYearAssets(benchmarkYear);
      const readsAfterReturn = readCount();
      if (readsAfterReturn !== readsBeforeReturn) {
        throw new Error(
          "Returning to a recent year unexpectedly reread an asset",
        );
      }

      garbageCollector();
      const retained = memorySample();
      console.info(
        JSON.stringify({
          benchmark:
            "annual-event-warm-asset-navigation",
          runtime: "web-node",
          sequence: [
            benchmarkYear,
            adjacentYear,
            benchmarkYear,
          ],
          firstA,
          adjacent,
          secondA,
          returnAssetReadDelta:
            readsAfterReturn - readsBeforeReturn,
          retainedHeapDeltaBytes:
            retained.heapUsedBytes -
            baseline.heapUsedBytes,
          assets: {
            candidateChunks: assetGroup(
              tracker,
              "shared/events/chunks/",
            ),
            de442sChunks: assetGroup(
              tracker,
              "shared/ephemeris/de442s/chunks/",
            ),
            eopChunks: assetGroup(
              tracker,
              "shared/eop/eop/",
            ),
          },
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
