// @vitest-environment node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { EventCandidateLoader } from "./eventCandidates";
import type { EventAssetFetch } from "./eventAssetTransport";

const sharedRoot = fileURLToPath(
  new URL("../../../../../shared/events/", import.meta.url),
);

describe("bundled event candidate contract", () => {
  it("loads the 2026 eclipse and bright-star occultation seeds", async () => {
    const fetchAsset = vi.fn<EventAssetFetch>(async (path) => {
      const relative =
        path ===
        "/event-data/candidates/event-candidates-manifest.v1.json"
          ? "event-candidates-manifest.v1.json"
          : path.replace(
              "/event-data/candidates/chunks/",
              "chunks/",
            );
      const bytes = await readFile(`${sharedRoot}${relative}`);
      return new Response(bytes, { status: 200 });
    });
    const loader = new EventCandidateLoader(fetchAsset);

    const candidates = await loader.loadRange(
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-12-31T23:59:59.999Z"),
    );

    expect(
      candidates.some(
        ({ summary }) =>
          summary.id === "se-20260812" &&
          summary.globalClassification === "total",
      ),
    ).toBe(true);
    expect(
      candidates.some(
        ({ summary }) =>
          summary.id === "le-20260303" &&
          summary.globalClassification === "total",
      ),
    ).toBe(true);
    expect(
      candidates.some(
        ({ seed, summary }) =>
          seed.kind === "lunar-occultation" &&
          summary.targetStarHR === seed.target.hr &&
          summary.title.includes("掩蔽"),
      ),
    ).toBe(true);
    expect(
      candidates.find(
        ({ summary }) =>
          summary.id === "lo-20260114-hr5944",
      )?.summary,
    ).toMatchObject({
      targetStarHR: 5_944,
      title: "月による6 π Scoの掩蔽",
    });
    expect(fetchAsset).toHaveBeenCalledTimes(2);
    expect(fetchAsset).toHaveBeenLastCalledWith(
      "/event-data/candidates/chunks/2025-2030.v1.json",
      undefined,
    );
  });
});
