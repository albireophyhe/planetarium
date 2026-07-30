import { describe, expect, it, vi } from "vitest";
import {
  EventCandidateDataError,
  EventCandidateLoader,
} from "./eventCandidates";
import type { EventAssetFetch } from "./eventAssetTransport";
import { resolveTimeScales } from "../precision";
import { ttToTdbJulianDate } from "./eventTime";

const encoder = new TextEncoder();

function tdb(date: Date): number {
  return ttToTdbJulianDate(
    resolveTimeScales(date).ttJulianDate,
  );
}

async function hash(bytes: Uint8Array): Promise<string> {
  const owned = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(owned).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", owned);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function fixtures() {
  const maximum = tdb(new Date("2026-08-12T17:45:54.000Z"));
  const chunk = {
    coverage: {
      endIsExclusive: true,
      endYear: 2101,
      startYear: 1900,
      timeScale: "TDB",
    },
    events: [
      {
        axisDistanceKilometers: 0,
        candidateLimitKilometers: 9_000,
        centerSeparationRadians: 0,
        centralityHint: "central",
        classificationHint: "total",
        clearanceKilometers: 9_000,
        id: "se-20260812",
        kind: "solar-eclipse",
        maximumIsoTdb: "2026-08-12T17:47:03.184 TDB",
        maximumJulianDateTdb: maximum,
        searchEndJulianDateTdb: maximum + 0.75,
        searchStartJulianDateTdb: maximum - 0.75,
      },
    ],
    id: "1900-2101",
    model: "de442s-mean-sphere-eclipse-candidates-v1",
    schemaVersion: 1,
  };
  const chunkBytes = encoder.encode(`${JSON.stringify(chunk)}\n`);
  const manifest = {
    chunks: [
      {
        byteLength: chunkBytes.byteLength,
        endYear: 2101,
        eventCount: 1,
        file: "shared/events/chunks/1900-2101.v1.json",
        id: "1900-2101",
        sha256: await hash(chunkBytes),
        startYear: 1900,
      },
    ],
    coverage: {
      chunkYears: 5,
      endIsExclusive: true,
      endYear: 2101,
      startYear: 1900,
      timeScale: "TDB",
    },
    model: "de442s-mean-sphere-eclipse-candidates-v1",
    schemaVersion: 1,
  };
  return { chunkBytes, manifest };
}

function responseForBytes(bytes: Uint8Array): Response {
  const owned = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(owned).set(bytes);
  return new Response(owned, { status: 200 });
}

describe("EventCandidateLoader", () => {
  it("loads, verifies, converts, filters, and caches a candidate chunk", async () => {
    const { chunkBytes, manifest } = await fixtures();
    const fetchAsset = vi.fn<EventAssetFetch>(
      async (path) =>
        path.endsWith("manifest.v1.json")
          ? new Response(JSON.stringify(manifest), { status: 200 })
          : responseForBytes(chunkBytes),
    );
    const loader = new EventCandidateLoader(fetchAsset);

    const first = await loader.loadRange(
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-12-31T23:59:59.999Z"),
    );
    const second = await loader.loadRange(
      new Date("2026-08-12T00:00:00.000Z"),
      new Date("2026-08-13T00:00:00.000Z"),
    );

    expect(first).toHaveLength(1);
    expect(first[0]?.summary).toMatchObject({
      globalClassification: "total",
      id: "se-20260812",
      kind: "solar-eclipse",
      targetStarHR: null,
      title: "皆既日食",
    });
    expect(
      first[0]?.summary.canonicalEpochUtc.toISOString(),
    ).toBe("2026-08-12T17:45:54.000Z");
    expect(second).toHaveLength(1);
    expect(fetchAsset).toHaveBeenCalledTimes(2);
    expect(fetchAsset).toHaveBeenNthCalledWith(
      2,
      "/event-data/candidates/chunks/1900-2101.v1.json",
      undefined,
    );
  });

  it("rejects a chunk whose bytes do not match the manifest", async () => {
    const { chunkBytes, manifest } = await fixtures();
    const fetchAsset: EventAssetFetch = async (path) =>
      path.endsWith("manifest.v1.json")
        ? new Response(JSON.stringify(manifest), { status: 200 })
        : responseForBytes(chunkBytes.slice(0, -1));
    const loader = new EventCandidateLoader(fetchAsset);

    await expect(
      loader.loadRange(
        new Date("2026-01-01T00:00:00.000Z"),
        new Date("2026-12-31T23:59:59.999Z"),
      ),
    ).rejects.toThrow(/byte length/);
  });

  it("rejects path confusion in a manifest before requesting a chunk", async () => {
    const { manifest } = await fixtures();
    manifest.chunks[0]!.file =
      "shared/events/chunks/../../private.json";
    const fetchAsset = vi.fn<EventAssetFetch>(
      async () =>
        new Response(JSON.stringify(manifest), { status: 200 }),
    );
    const loader = new EventCandidateLoader(fetchAsset);

    await expect(
      loader.loadRange(
        new Date("2026-01-01T00:00:00.000Z"),
        new Date("2026-12-31T23:59:59.999Z"),
      ),
    ).rejects.toBeInstanceOf(EventCandidateDataError);
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it("honors cancellation before network access", async () => {
    const fetchAsset = vi.fn<EventAssetFetch>();
    const loader = new EventCandidateLoader(fetchAsset);
    const controller = new AbortController();
    controller.abort();

    await expect(
      loader.loadRange(
        new Date("2026-01-01T00:00:00.000Z"),
        new Date("2026-12-31T23:59:59.999Z"),
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("loads the next TDB chunk for a UTC instant before New Year", async () => {
    const maximumUtc = new Date("2024-12-31T23:59:30.000Z");
    const maximum = tdb(maximumUtc);
    const chunks = [
      {
        coverage: {
          endIsExclusive: true,
          endYear: 2025,
          startYear: 1900,
          timeScale: "TDB",
        },
        events: [],
        id: "1900-2025",
        model: "de442s-mean-sphere-eclipse-candidates-v1",
        schemaVersion: 1,
      },
      {
        coverage: {
          endIsExclusive: true,
          endYear: 2101,
          startYear: 2025,
          timeScale: "TDB",
        },
        events: [
          {
            classificationHint: "partial",
            id: "se-20250101",
            kind: "solar-eclipse",
            maximumJulianDateTdb: maximum,
            searchEndJulianDateTdb: maximum + 0.75,
            searchStartJulianDateTdb: maximum - 0.75,
          },
        ],
        id: "2025-2101",
        model: "de442s-mean-sphere-eclipse-candidates-v1",
        schemaVersion: 1,
      },
    ];
    const chunkBytes = await Promise.all(
      chunks.map((chunk) =>
        Promise.resolve(
          encoder.encode(`${JSON.stringify(chunk)}\n`),
        ),
      ),
    );
    const manifest = {
      chunks: await Promise.all(
        chunks.map(async (chunk, index) => ({
          byteLength: chunkBytes[index]!.byteLength,
          endYear: chunk.coverage.endYear,
          eventCount: chunk.events.length,
          file: `shared/events/chunks/${chunk.id}.v1.json`,
          id: chunk.id,
          sha256: await hash(chunkBytes[index]!),
          startYear: chunk.coverage.startYear,
        })),
      ),
      coverage: {
        chunkYears: 5,
        endIsExclusive: true,
        endYear: 2101,
        startYear: 1900,
        timeScale: "TDB",
      },
      model: "de442s-mean-sphere-eclipse-candidates-v1",
      schemaVersion: 1,
    };
    const fetchAsset = vi.fn<EventAssetFetch>(async (path) => {
      if (path.endsWith("manifest.v1.json")) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      const index = path.includes("1900-2025") ? 0 : 1;
      return responseForBytes(chunkBytes[index]!);
    });
    const loader = new EventCandidateLoader(fetchAsset);

    const events = await loader.loadRange(
      new Date("2024-01-01T00:00:00.000Z"),
      new Date("2024-12-31T23:59:59.999Z"),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.summary.canonicalEpochUtc.toISOString()).toBe(
      maximumUtc.toISOString(),
    );
    expect(fetchAsset).toHaveBeenCalledWith(
      "/event-data/candidates/chunks/2025-2101.v1.json",
      undefined,
    );
  });

  it("rejects invalid and out-of-coverage ranges", async () => {
    const { manifest } = await fixtures();
    const loader = new EventCandidateLoader(async () =>
      Promise.resolve(
        new Response(JSON.stringify(manifest), { status: 200 }),
      ),
    );

    await expect(
      loader.loadRange(
        new Date("2027-01-01T00:00:00.000Z"),
        new Date("2026-01-01T00:00:00.000Z"),
      ),
    ).rejects.toThrow(/range/);
    await expect(
      loader.loadRange(
        new Date("1899-01-01T00:00:00.000Z"),
        new Date("1900-01-01T00:00:00.000Z"),
      ),
    ).rejects.toThrow(/outside/);
  });
});
