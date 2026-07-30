// @vitest-environment node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import nasaFixture from "../../../../../shared/fixtures/nasa-lunar-eclipses-2021-2030.v1.json";
import { EventCandidateLoader } from "./eventCandidates";
import { De442sEphemerisLoader } from "./de442sLoader";
import type { EventAssetFetch } from "./eventAssetTransport";
import { calculateLocalLunarEclipse } from "./lunarEclipse";

const repositoryRoot = fileURLToPath(
  new URL("../../../../../", import.meta.url),
);
const TT_MINUS_UTC_MILLISECONDS = 69_184;

const localAssetFetch: EventAssetFetch = async (path) => {
  let relative: string;
  if (path.startsWith("/event-data/de442s/chunks/")) {
    relative = path.replace(
      "/event-data/de442s/chunks/",
      "shared/ephemeris/de442s/chunks/",
    );
  } else if (
    path === "/event-data/de442s/de442s-manifest.v1.json"
  ) {
    relative = "shared/ephemeris/de442s/de442s-manifest.v1.json";
  } else if (path.startsWith("/event-data/candidates/chunks/")) {
    relative = path.replace(
      "/event-data/candidates/chunks/",
      "shared/events/chunks/",
    );
  } else if (
    path ===
    "/event-data/candidates/event-candidates-manifest.v1.json"
  ) {
    relative = "shared/events/event-candidates-manifest.v1.json";
  } else {
    return new Response(null, { status: 404 });
  }
  return new Response(
    await readFile(`${repositoryRoot}${relative}`),
    { status: 200 },
  );
};

describe("NASA 2021-2030 lunar-eclipse validation", () => {
  it("reproduces every published classification and greatest-eclipse time", async () => {
    const candidates = await new EventCandidateLoader(
      localAssetFetch,
    ).loadRange(
      new Date("2021-01-01T00:00:00.000Z"),
      new Date("2030-12-31T23:59:59.999Z"),
    );
    const lunarCandidates = candidates.filter(
      ({ seed }) => seed.kind === "lunar-eclipse",
    );
    const ephemeris = await new De442sEphemerisLoader({
      baseUrl: "/event-data/de442s/",
      fetch: localAssetFetch,
      pageUrl: "https://planetarium.test/",
    }).loadRange(
      Math.min(
        ...lunarCandidates.map(
          ({ seed }) => seed.searchStartJulianDateTdb,
        ),
      ),
      Math.max(
        ...lunarCandidates.map(
          ({ seed }) => seed.searchEndJulianDateTdb,
        ),
      ),
    );
    const candidatesById = new Map(
      lunarCandidates.map((candidate) => [
        candidate.summary.id,
        candidate,
      ]),
    );

    expect(nasaFixture.schemaVersion).toBe(1);
    expect(nasaFixture.events).toHaveLength(22);
    expect(lunarCandidates).toHaveLength(nasaFixture.events.length);
    for (const expected of nasaFixture.events) {
      const candidate = candidatesById.get(expected.id);
      expect(candidate, expected.id).toBeDefined();
      const circumstances = calculateLocalLunarEclipse(
        ephemeris,
        candidate!.summary,
        {
          latitude: 0,
          longitude: 0,
          name: "Greenwich meridian",
          timeZone: "UTC",
        },
      );
      expect(circumstances, expected.id).not.toBeNull();
      expect(
        circumstances?.localClassification,
        expected.id,
      ).toBe(expected.classification);

      const expectedMaximumUtc =
        Date.parse(`${expected.greatestEclipseTd}Z`) -
        TT_MINUS_UTC_MILLISECONDS;
      const maximumDifferenceSeconds =
        Math.abs(
          (circumstances?.maximum.instantUtc.getTime() ??
            Number.NaN) - expectedMaximumUtc,
        ) / 1_000;
      expect(
        maximumDifferenceSeconds,
        `${expected.id} greatest eclipse`,
      ).toBeLessThanOrEqual(
        nasaFixture.tolerances.maximumUtcSeconds,
      );

      if (expected.classification !== "penumbral") {
        expect(
          Math.abs(
            (circumstances?.magnitude ?? Number.NaN) -
              expected.umbralMagnitude,
          ),
          `${expected.id} umbral magnitude`,
        ).toBeLessThanOrEqual(
          nasaFixture.tolerances.umbralMagnitude,
        );
      }
    }
  });
});
