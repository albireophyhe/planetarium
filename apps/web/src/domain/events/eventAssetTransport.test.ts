import { afterEach, describe, expect, it, vi } from "vitest";
import {
  eventCandidateManifestPath,
  eventManifestPath,
  fetchEventAsset,
  isAllowedEventAssetPath,
} from "./eventAssetTransport";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("event asset transport", () => {
  it("allows only fixed manifests and validated data chunks", () => {
    expect(isAllowedEventAssetPath(eventManifestPath)).toBe(true);
    expect(isAllowedEventAssetPath(eventCandidateManifestPath)).toBe(
      true,
    );
    expect(
      isAllowedEventAssetPath(
        "/event-data/de442s/chunks/2025-2030.v1.bin",
      ),
    ).toBe(true);
    expect(
      isAllowedEventAssetPath(
        "/event-data/candidates/chunks/2020-2030.v1.json",
      ),
    ).toBe(true);
    for (const invalid of [
      "https://example.com/event-data/de442s/de442s-manifest.v1.json",
      "//example.com/event-data/de442s/de442s-manifest.v1.json",
      "/event-data/de442s/chunks/../../private.bin",
      "/event-data/de442s/chunks/2025-2030.v1.bin?latitude=35",
      "/event-data/de442s/chunks/2025-2030.bin",
      "/event-data/de442s/de442s-manifest.v1.json#fragment",
      "/event-data/candidates/chunks/2020-2030.v1.json?year=2026",
      "/event-data/candidates/chunks/2020-2030.json",
      "/event-data/candidates/chunks/../../private.json",
    ]) {
      expect(isAllowedEventAssetPath(invalid)).toBe(false);
    }
  });

  it("does not pin either mutable manifest in the browser cache", async () => {
    const response = new Response("{}", { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await fetchEventAsset(eventCandidateManifestPath);

    expect(fetchMock).toHaveBeenCalledWith(
      eventCandidateManifestPath,
      expect.objectContaining({ cache: "no-cache" }),
    );
  });

  it("uses an anonymous same-origin GET without user-derived fields", async () => {
    const response = new Response(new ArrayBuffer(0), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(
      fetchEventAsset(
        "/event-data/de442s/chunks/2025-2030.v1.bin",
        controller.signal,
      ),
    ).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "/event-data/de442s/chunks/2025-2030.v1.bin",
      {
        cache: "force-cache",
        credentials: "same-origin",
        method: "GET",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      },
    );
  });

  it("rejects an external or decorated path before network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchEventAsset(
        "https://example.com/event-data/de442s/de442s-manifest.v1.json",
      ),
    ).rejects.toThrow(/not allowed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
