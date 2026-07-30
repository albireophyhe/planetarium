import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  DE442S_SOURCE_SHA256,
  De442sFormatError,
  selectDe442sChunk,
  selectDe442sChunksForRange,
  validateDe442sManifest,
  type De442sManifest,
} from "./de442sManifest";

const manifestPath = resolve(
  process.cwd(),
  "../../shared/ephemeris/de442s/de442s-manifest.v1.json",
);

let rawManifest: unknown;
let manifest: De442sManifest;

beforeAll(async () => {
  rawManifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  manifest = validateDe442sManifest(rawManifest);
});

describe("DE442s runtime manifest", () => {
  it("validates the pinned 41-chunk inventory", () => {
    expect(manifest.model).toBe("jpl-de442s-type2-float32");
    expect(manifest.source.sha256).toBe(DE442S_SOURCE_SHA256);
    expect(manifest.chunks).toHaveLength(41);
    expect(manifest.chunks[0]?.id).toBe("1900-1905");
    expect(manifest.chunks.at(-1)?.id).toBe("2100-2101");
    expect(manifest.statistics.totalChunkBytes).toBe(4_761_232);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.chunks)).toBe(true);
    expect(Object.isFrozen(manifest.chunks[0])).toBe(true);
  });

  it("selects start-inclusive/end-exclusive chunks and includes the final endpoint", () => {
    expect(
      selectDe442sChunk(manifest, 2_451_544.499_999).id,
    ).toBe("1995-2000");
    expect(selectDe442sChunk(manifest, 2_451_544.5).id).toBe(
      "2000-2005",
    );
    expect(selectDe442sChunk(manifest, 2_488_434.5).id).toBe(
      "2100-2101",
    );
  });

  it("selects every chunk intersecting a closed boundary-spanning range", () => {
    expect(
      selectDe442sChunksForRange(
        manifest,
        2_451_544.499_999,
        2_451_544.5,
      ).map((chunk) => chunk.id),
    ).toEqual(["1995-2000", "2000-2005"]);
    expect(
      selectDe442sChunksForRange(
        manifest,
        2_451_544.5,
        2_451_544.5,
      ).map((chunk) => chunk.id),
    ).toEqual(["2000-2005"]);
  });

  it("rejects non-finite, reversed, and out-of-coverage dates", () => {
    expect(() => selectDe442sChunk(manifest, Number.NaN)).toThrow(
      /must be finite/,
    );
    expect(() => selectDe442sChunk(manifest, 2_415_020.49)).toThrow(
      /outside DE442s coverage/,
    );
    expect(() =>
      selectDe442sChunksForRange(manifest, 2_451_545, 2_451_544),
    ).toThrow(/finite and ordered/);
  });

  it("does not allow a manifest to substitute its source or traverse paths", () => {
    const replacedSource = structuredClone(rawManifest) as {
      source: { sha256: string };
    };
    replacedSource.source.sha256 = "0".repeat(64);
    expect(() => validateDe442sManifest(replacedSource)).toThrow(
      De442sFormatError,
    );

    const traversing = structuredClone(rawManifest) as {
      chunks: Array<{ file: string }>;
    };
    traversing.chunks[0]!.file =
      "shared/ephemeris/de442s/chunks/../../private.bin";
    expect(() => validateDe442sManifest(traversing)).toThrow(
      /chunks\[0\]\.file/,
    );
  });

  it("rejects inconsistent layout and aggregate statistics", () => {
    const badLayout = structuredClone(rawManifest) as {
      chunks: Array<{
        series: Array<{ dataOffsetBytes: number }>;
      }>;
    };
    badLayout.chunks[0]!.series[1]!.dataOffsetBytes += 8;
    expect(() => validateDe442sManifest(badLayout)).toThrow(
      /contiguous binary data/,
    );

    const badStatistics = structuredClone(rawManifest) as {
      statistics: { totalChunkBytes: number };
    };
    badStatistics.statistics.totalChunkBytes += 1;
    expect(() => validateDe442sManifest(badStatistics)).toThrow(
      /chunk inventory/,
    );

    const unexpectedProperty = structuredClone(rawManifest) as {
      externalApi?: string;
    };
    unexpectedProperty.externalApi = "https://example.invalid/";
    expect(() => validateDe442sManifest(unexpectedProperty)).toThrow(
      /externalApi is not allowed/,
    );
  });
});
