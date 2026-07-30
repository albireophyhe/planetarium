// @vitest-environment node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import nasaFixture from "../../../../../shared/fixtures/nasa-solar-eclipses-2021-2030.v1.json";
import { EventCandidateLoader } from "./eventCandidates";
import type { EventAssetFetch } from "./eventAssetTransport";

const JULIAN_DATE_AT_UNIX_EPOCH = 2_440_587.5;
const MILLISECONDS_PER_DAY = 86_400_000;
const SECONDS_PER_DAY = 86_400;
const sharedRoot = fileURLToPath(
  new URL("../../../../../shared/events/", import.meta.url),
);

function scaleNeutralJulianDate(isoDateTime: string): number {
  const milliseconds = Date.parse(`${isoDateTime}Z`);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`Invalid NASA fixture timestamp: ${isoDateTime}`);
  }
  return (
    milliseconds / MILLISECONDS_PER_DAY +
    JULIAN_DATE_AT_UNIX_EPOCH
  );
}

describe("NASA 2021-2030 solar-eclipse candidate validation", () => {
  it("matches every published date and classification with a nearby seed", async () => {
    const fetchAsset = vi.fn<EventAssetFetch>(async (path) => {
      const relative =
        path ===
        "/event-data/candidates/event-candidates-manifest.v1.json"
          ? "event-candidates-manifest.v1.json"
          : path.replace(
              "/event-data/candidates/chunks/",
              "chunks/",
            );
      return new Response(await readFile(`${sharedRoot}${relative}`), {
        status: 200,
      });
    });
    const loader = new EventCandidateLoader(fetchAsset);

    const candidates = await loader.loadRange(
      new Date("2021-01-01T00:00:00.000Z"),
      new Date("2030-12-31T23:59:59.999Z"),
    );
    const solarCandidates = candidates.filter(
      ({ seed }) => seed.kind === "solar-eclipse",
    );
    const candidatesById = new Map(
      solarCandidates.map((candidate) => [
        candidate.summary.id,
        candidate,
      ]),
    );

    expect(nasaFixture.schemaVersion).toBe(1);
    expect(nasaFixture.events).toHaveLength(22);
    expect(solarCandidates).toHaveLength(nasaFixture.events.length);
    for (const expected of nasaFixture.events) {
      const actual = candidatesById.get(expected.id);
      expect(actual, expected.id).toBeDefined();
      expect(actual?.summary.globalClassification).toBe(
        expected.classification,
      );
      const maximumDifferenceSeconds =
        Math.abs(
          (actual?.seed.maximumJulianDateTdb ?? Number.NaN) -
            scaleNeutralJulianDate(expected.greatestEclipseTd),
        ) * SECONDS_PER_DAY;
      expect(
        maximumDifferenceSeconds,
        `${expected.id} candidate maximum`,
      ).toBeLessThanOrEqual(
        nasaFixture.tolerances
          .candidateMaximumTdbVsGreatestEclipseTdSeconds,
      );
    }
    expect(fetchAsset).toHaveBeenCalledTimes(4);
  });
});
