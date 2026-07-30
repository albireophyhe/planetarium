import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  De442sEphemerisLoader,
  type De442sAssetFetch,
} from "./de442sLoader";

const PAGE_URL = "https://planetarium.test/app/";
const BASE_URL = "/event-data/de442s/";
const MANIFEST_PATH =
  "/event-data/de442s/de442s-manifest.v1.json";
const CHUNK_PATH_PATTERN =
  /^\/event-data\/de442s\/chunks\/(\d{4}-\d{4})\.v1\.bin$/;
const sharedDirectory = resolve(process.cwd(), "../../shared");

let manifestBytes: Uint8Array<ArrayBuffer>;

function ownedBytes(source: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(source);
}

function responseFor(bytes: Uint8Array<ArrayBuffer>): Response {
  return new Response(bytes, {
    headers: {
      "content-length": String(bytes.byteLength),
    },
  });
}

function abortException(): DOMException {
  return new DOMException("test fetch aborted", "AbortError");
}

const localAssetFetch: De442sAssetFetch = async (path, signal) => {
  if (signal?.aborted === true) {
    throw abortException();
  }
  if (path === MANIFEST_PATH) {
    return responseFor(manifestBytes);
  }
  const match = CHUNK_PATH_PATTERN.exec(path);
  if (match === null) {
    return new Response(null, { status: 404 });
  }
  const bytes = ownedBytes(
    await readFile(
      join(
        sharedDirectory,
        `ephemeris/de442s/chunks/${match[1]}.v1.bin`,
      ),
    ),
  );
  return responseFor(bytes);
};

beforeAll(async () => {
  manifestBytes = ownedBytes(
    await readFile(
      join(
        sharedDirectory,
        "ephemeris/de442s/de442s-manifest.v1.json",
      ),
    ),
  );
});

describe("DE442s asynchronous browser loader", () => {
  it("deduplicates concurrent requests and keeps dates out of static asset paths", async () => {
    const fetchSpy = vi.fn(localAssetFetch);
    const loader = new De442sEphemerisLoader({
      baseUrl: BASE_URL,
      fetch: fetchSpy,
      pageUrl: PAGE_URL,
    });
    const [first, second] = await Promise.all([
      loader.load(2_461_265),
      loader.load(2_461_265),
    ]);

    expect(first.state(2_461_265)).toEqual(second.state(2_461_265));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls.map(([path]) => path)).toEqual([
      MANIFEST_PATH,
      "/event-data/de442s/chunks/2025-2030.v1.bin",
    ]);
    expect(
      fetchSpy.mock.calls.every(
        ([path]) => !path.includes("?") && !path.includes("#"),
      ),
    ).toBe(true);

    await loader.load(2_461_265);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("loads boundary-spanning chunks in parallel for a closed range", async () => {
    const fetchSpy = vi.fn(localAssetFetch);
    const loader = new De442sEphemerisLoader({
      baseUrl: BASE_URL,
      fetch: fetchSpy,
      pageUrl: PAGE_URL,
    });
    const provider = await loader.loadRange(
      2_451_544.499_999,
      2_451_544.5,
    );

    expect(provider.state(2_451_544.499_999).tdbJulianDate).toBe(
      2_451_544.499_999,
    );
    expect(provider.state(2_451_544.5).tdbJulianDate).toBe(
      2_451_544.5,
    );
    expect(provider.stateCoverage).toEqual({
      startJulianDateTdb: 2_449_718.5,
      endJulianDateTdb: 2_453_371.5,
      endIsIncluded: true,
    });
    expect(fetchSpy.mock.calls.map(([path]) => path)).toEqual([
      MANIFEST_PATH,
      "/event-data/de442s/chunks/1995-2000.v1.bin",
      "/event-data/de442s/chunks/2000-2005.v1.bin",
    ]);
  });

  it("clips an explicitly padded final-year range without weakening strict mode", async () => {
    const fetchSpy = vi.fn(localAssetFetch);
    const loader = new De442sEphemerisLoader({
      baseUrl: BASE_URL,
      fetch: fetchSpy,
      pageUrl: PAGE_URL,
    });
    const manifest = await loader.loadManifest();
    const finalEpoch = manifest.coverage.endJulianDateTdb;

    await expect(
      loader.loadRange(finalEpoch - 1, finalEpoch + 0.1),
    ).rejects.toThrow(/outside DE442s coverage/);

    const provider = await loader.loadRange(
      finalEpoch - 1,
      finalEpoch + 0.1,
      { clipToCoverage: true },
    );
    expect(provider.state(finalEpoch).tdbJulianDate).toBe(finalEpoch);
    expect(provider.stateCoverage.endJulianDateTdb).toBe(
      finalEpoch,
    );
    expect(
      fetchSpy.mock.calls.filter(([path]) =>
        path.endsWith("/2100-2101.v1.bin"),
      ),
    ).toHaveLength(1);
  });

  it("clips a padded first-year range to the loaded start coverage", async () => {
    const loader = new De442sEphemerisLoader({
      baseUrl: BASE_URL,
      fetch: localAssetFetch,
      pageUrl: PAGE_URL,
    });
    const manifest = await loader.loadManifest();
    const firstEpoch = manifest.coverage.startJulianDateTdb;
    const provider = await loader.loadRange(
      firstEpoch - 0.1,
      firstEpoch + 1,
      { clipToCoverage: true },
    );

    expect(provider.stateCoverage.startJulianDateTdb).toBe(
      firstEpoch,
    );
    expect(provider.state(firstEpoch).tdbJulianDate).toBe(
      firstEpoch,
    );
  });

  it("refuses ranges wider than the current and adjacent chunks", async () => {
    const fetchSpy = vi.fn(localAssetFetch);
    const loader = new De442sEphemerisLoader({
      baseUrl: BASE_URL,
      fetch: fetchSpy,
      pageUrl: PAGE_URL,
    });
    const manifest = await loader.loadManifest();

    await expect(
      loader.loadRange(
        manifest.chunks[0]!.startJulianDateTdb,
        manifest.chunks[3]!.startJulianDateTdb,
      ),
    ).rejects.toThrow(/at most three chunks/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("evicts least-recently-used chunks within the three-chunk hard bound", async () => {
    const fetchSpy = vi.fn(localAssetFetch);
    const loader = new De442sEphemerisLoader({
      baseUrl: BASE_URL,
      fetch: fetchSpy,
      pageUrl: PAGE_URL,
      maximumCachedChunks: 2,
    });
    const manifest = await loader.loadManifest();
    const date = (id: string): number => {
      const chunk = manifest.chunks.find((candidate) => candidate.id === id);
      if (chunk === undefined) {
        throw new Error(`Missing test chunk ${id}`);
      }
      return chunk.startJulianDateTdb + 1;
    };

    await loader.load(date("2025-2030"));
    await loader.load(date("2030-2035"));
    await loader.load(date("2035-2040"));
    await loader.load(date("2025-2030"));

    expect(fetchSpy).toHaveBeenCalledTimes(5);
    expect(
      fetchSpy.mock.calls.filter(
        ([path]) => path.endsWith("/2025-2030.v1.bin"),
      ),
    ).toHaveLength(2);
  });

  it("cancels the underlying transport when its only subscriber aborts", async () => {
    let underlyingSignal: AbortSignal | undefined;
    const pendingFetch: De442sAssetFetch = (_path, signal) =>
      new Promise((_resolve, reject) => {
        underlyingSignal = signal;
        signal?.addEventListener(
          "abort",
          () => reject(abortException()),
          { once: true },
        );
      });
    const loader = new De442sEphemerisLoader({
      baseUrl: BASE_URL,
      fetch: pendingFetch,
      pageUrl: PAGE_URL,
    });
    const controller = new AbortController();
    const loading = loader.loadManifest({ signal: controller.signal });

    controller.abort();

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(underlyingSignal?.aborted).toBe(true);
  });

  it("does not cancel a shared request while another subscriber still needs it", async () => {
    let release: ((response: Response) => void) | undefined;
    let underlyingSignal: AbortSignal | undefined;
    const pendingFetch: De442sAssetFetch = (_path, signal) =>
      new Promise((resolve, reject) => {
        release = resolve;
        underlyingSignal = signal;
        signal?.addEventListener(
          "abort",
          () => reject(abortException()),
          { once: true },
        );
      });
    const fetchSpy = vi.fn(pendingFetch);
    const loader = new De442sEphemerisLoader({
      baseUrl: BASE_URL,
      fetch: fetchSpy,
      pageUrl: PAGE_URL,
    });
    const firstController = new AbortController();
    const first = loader.loadManifest({
      signal: firstController.signal,
    });
    const second = loader.loadManifest();

    firstController.abort();

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(underlyingSignal?.aborted).toBe(false);
    release?.(responseFor(manifestBytes));
    await expect(second).resolves.toMatchObject({
      model: "jpl-de442s-type2-float32",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects corrupt chunk bytes before decoding them", async () => {
    const corruptingFetch: De442sAssetFetch = async (path, signal) => {
      const response = await localAssetFetch(path, signal);
      if (!path.endsWith(".bin")) {
        return response;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      bytes[bytes.length - 1] ^= 1;
      return responseFor(ownedBytes(bytes));
    };
    const loader = new De442sEphemerisLoader({
      baseUrl: BASE_URL,
      fetch: corruptingFetch,
      pageUrl: PAGE_URL,
    });

    await expect(loader.load(2_461_265)).rejects.toThrow(
      /SHA-256 check/,
    );
  });

  it("accepts an encoded transfer length while checking decoded bytes exactly", async () => {
    const encodedFetch: De442sAssetFetch = async (path, signal) => {
      const response = await localAssetFetch(path, signal);
      if (!path.endsWith(".bin")) {
        return response;
      }
      const bytes = ownedBytes(
        new Uint8Array(await response.arrayBuffer()),
      );
      return new Response(bytes, {
        headers: {
          "content-encoding": "gzip",
          "content-length": String(bytes.byteLength - 1_000),
        },
      });
    };
    const loader = new De442sEphemerisLoader({
      baseUrl: BASE_URL,
      fetch: encodedFetch,
      pageUrl: PAGE_URL,
    });

    await expect(loader.load(2_461_265)).resolves.toBeDefined();
  });

  it("rejects manifest path substitution before requesting a chunk", async () => {
    const raw = JSON.parse(
      new TextDecoder().decode(manifestBytes),
    ) as {
      chunks: Array<{ file: string }>;
    };
    raw.chunks[25]!.file = "../../private.bin";
    const badManifest = new TextEncoder().encode(JSON.stringify(raw));
    const fetchSpy = vi.fn<De442sAssetFetch>(async (path) => {
      if (path === MANIFEST_PATH) {
        return responseFor(ownedBytes(badManifest));
      }
      throw new Error("A chunk request must not be reached");
    });
    const loader = new De442sEphemerisLoader({
      baseUrl: BASE_URL,
      fetch: fetchSpy,
      pageUrl: PAGE_URL,
    });

    await expect(loader.load(2_461_265)).rejects.toThrow(
      /manifest failed validation/,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects external, credentialed, and traversing base URLs", () => {
    expect(
      () =>
        new De442sEphemerisLoader({
          baseUrl: "https://elsewhere.test/event-data/de442s/",
          fetch: localAssetFetch,
          pageUrl: PAGE_URL,
        }),
    ).toThrow(/same-origin/);
    expect(
      () =>
        new De442sEphemerisLoader({
          baseUrl: "https://user:secret@planetarium.test/event-data/de442s/",
          fetch: localAssetFetch,
          pageUrl: PAGE_URL,
        }),
    ).toThrow(/same-origin/);
    expect(
      () =>
        new De442sEphemerisLoader({
          baseUrl: "/event-data/../private/",
          fetch: localAssetFetch,
          pageUrl: PAGE_URL,
        }),
    ).toThrow(/dot segments/);
    expect(
      () =>
        new De442sEphemerisLoader({
          baseUrl: "/event-data/de442s/?date=2026",
          fetch: localAssetFetch,
          pageUrl: PAGE_URL,
        }),
    ).toThrow(/same-origin/);
  });
});
