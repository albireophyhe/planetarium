// @vitest-environment node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateLocalLunarEclipse,
  calculateLocalLunarOccultation,
  calculateLocalSolarEclipse,
  eventEphemerisSearchBounds,
  resolveEventSearchBounds,
  sampleLocalLunarEclipseAt,
  sampleLocalLunarOccultationAt,
  sampleLocalSolarEclipseAt,
} from "./index";
import { precisionStarByHR } from "../precisionData";
import { EventCandidateLoader } from "./eventCandidates";
import { De442sEphemerisLoader } from "./de442sLoader";
import type { EventAssetFetch } from "./eventAssetTransport";
import type { EventEphemerisProvider } from "./types";

const repositoryRoot = fileURLToPath(
  new URL("../../../../../", import.meta.url),
);

/*
 * Independent published oracles:
 * https://eclipse.gsfc.nasa.gov/SEcirc/SEcircEU/LondonGBR2.html
 * https://eclipse.gsfc.nasa.gov/LEdecade/LEdecade2021.html
 */
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

function secondsBetween(actual: Date, iso: string): number {
  return Math.abs(actual.getTime() - Date.parse(iso)) / 1_000;
}

describe("bundled event forecast end to end", () => {
  it("matches USNO 2024 Syracuse solar contact position angles", async () => {
    const candidateLoader = new EventCandidateLoader(localAssetFetch);
    const candidates = await candidateLoader.loadRange(
      new Date("2024-01-01T00:00:00.000Z"),
      new Date("2024-12-31T23:59:59.999Z"),
    );
    const candidate = candidates.find(
      ({ summary }) => summary.id === "se-20240408",
    );
    expect(candidate?.seed.kind).toBe("solar-eclipse");
    if (!candidate || candidate.seed.kind !== "solar-eclipse") {
      throw new Error("2024 solar eclipse candidate is missing");
    }
    const ephemeris = await new De442sEphemerisLoader({
      baseUrl: "/event-data/de442s/",
      fetch: localAssetFetch,
      pageUrl: "https://planetarium.test/",
    }).loadRange(
      candidate.seed.searchStartJulianDateTdb,
      candidate.seed.searchEndJulianDateTdb,
    );
    const circumstances = calculateLocalSolarEclipse(
      ephemeris,
      candidate.summary,
      {
        latitude: 43.1029,
        longitude: -76.2079,
        name: "Syracuse",
        timeZone: "America/New_York",
      },
      {
        earthOrientation: { dut1Seconds: 0 },
        heightMeters: 0,
        locationSource: "manual",
      },
    );

    expect(circumstances?.localClassification).toBe("total");
    expect(circumstances?.boundaryUncertaintyReason).toBeNull();
    const expectedDegrees = new Map([
      ["solar-c1", 233.7],
      ["solar-c2", 109.5],
      ["solar-c3", 178.4],
      ["solar-c4", 54.6],
    ]);
    for (const contact of circumstances?.contacts ?? []) {
      const expected = expectedDegrees.get(contact.phase);
      if (expected === undefined) {
        expect(contact.positionAngleRadians).toBeNull();
        continue;
      }
      expect(contact.positionAngleRadians).not.toBeNull();
      expect(
        ((contact.positionAngleRadians as number) * 180) /
          Math.PI,
        contact.phase,
      ).toBeCloseTo(expected, 0);
    }
  });

  it("matches NASA's rounded 2026 London local solar circumstances", async () => {
    const candidateLoader = new EventCandidateLoader(localAssetFetch);
    const candidates = await candidateLoader.loadRange(
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-12-31T23:59:59.999Z"),
    );
    const candidate = candidates.find(
      ({ summary }) => summary.id === "se-20260812",
    );
    expect(candidate?.seed.kind).toBe("solar-eclipse");
    if (!candidate || candidate.seed.kind !== "solar-eclipse") {
      throw new Error("2026 solar eclipse candidate is missing");
    }
    const ephemeris = await new De442sEphemerisLoader({
      baseUrl: "/event-data/de442s/",
      fetch: localAssetFetch,
      pageUrl: "https://planetarium.test/",
    }).loadRange(
      candidate.seed.searchStartJulianDateTdb,
      candidate.seed.searchEndJulianDateTdb,
    );
    const earthOrientationDates: number[] = [];
    const earthOrientationProvenanceDates: number[] = [];
    const earthOrientationUncertaintyDates: number[] = [];
    const circumstances = calculateLocalSolarEclipse(
      ephemeris,
      candidate.summary,
      {
        latitude: 51.5,
        longitude: -(10 / 60),
        name: "London",
        timeZone: "Europe/London",
      },
      {
        earthOrientationAt: (date) => {
          earthOrientationDates.push(date.getTime());
          return undefined;
        },
        earthOrientationProvenanceAt: (date) => {
          earthOrientationProvenanceDates.push(date.getTime());
          return {
            dut1Quality: "observed",
            eopRetrievedAt: "2026-07-29T04:05:06.000Z",
            eopSourceSha256: "e".repeat(64),
            polarMotionQuality: "mixed",
          };
        },
        earthOrientationReportedUncertaintyAt: (date) => {
          earthOrientationUncertaintyDates.push(date.getTime());
          return {
            combinedPathMeters: 0.5,
            dut1PathMeters: 0.4,
            dut1ReportedErrorSeconds: 0.000_86,
            polarMotionPathMeters: 0.1,
            semantics:
              "iers-reported-error-linear-envelope",
          };
        },
        earthRotationPathUncertaintyKilometersAt: () =>
          0.000_5,
        eopIdAt: () => "maximum-eop",
        heightMeters: 0,
        locationSource: "manual",
      },
    );

    expect(circumstances).not.toBeNull();
    expect(
      Math.min(...earthOrientationDates),
    ).toBeLessThan(circumstances!.maximum.instantUtc.getTime());
    expect(
      Math.max(...earthOrientationDates),
    ).toBeGreaterThan(circumstances!.maximum.instantUtc.getTime());
    expect(candidate.summary.globalClassification).toBe("total");
    expect(circumstances!.event).toBe(candidate.summary);
    expect(circumstances!.event.globalClassification).toBe("total");
    expect(circumstances!.localClassification).toBe("partial");
    expect(earthOrientationProvenanceDates).toEqual([
      circumstances!.maximum.instantUtc.getTime(),
    ]);
    expect(earthOrientationUncertaintyDates).toEqual([
      circumstances!.maximum.instantUtc.getTime(),
    ]);
    expect(circumstances!.uncertainty.earthOrientation).toMatchObject({
      combinedPathMeters: 0.5,
    });
    expect(circumstances!.provenance).toMatchObject({
      dut1Quality: "observed",
      eopRetrievedAt: "2026-07-29T04:05:06.000Z",
      eopSourceSha256: "e".repeat(64),
      eopId: "maximum-eop",
      polarMotionQuality: "mixed",
    });
    const contacts = new Map(
      circumstances?.contacts.map((contact) => [
        contact.phase,
        contact,
      ]),
    );
    expect(
      secondsBetween(
        contacts.get("solar-c1")!.instantUtc,
        "2026-08-12T17:17:00.000Z",
      ),
    ).toBeLessThan(30);
    expect(
      secondsBetween(
        circumstances!.maximum.instantUtc,
        "2026-08-12T18:13:00.000Z",
      ),
    ).toBeLessThan(30);
    expect(
      secondsBetween(
        contacts.get("solar-c4")!.instantUtc,
        "2026-08-12T19:06:00.000Z",
      ),
    ).toBeLessThan(30);
    expect(circumstances!.magnitude).toBeCloseTo(0.925, 2);
    expect(circumstances!.obscuration).toBeCloseTo(0.914, 3);
    expect(
      (circumstances!.maximum.bodies.sun!.altitudeAzimuth
        .altitude *
        180) /
        Math.PI,
    ).toBeCloseTo(10, 0);

    const sampledMaximum = sampleLocalSolarEclipseAt(
      ephemeris,
      circumstances!.maximum.instantUtc,
      {
        latitude: 51.5,
        longitude: -(10 / 60),
        name: "London",
        timeZone: "Europe/London",
      },
      { heightMeters: 0 },
    );
    expect(sampledMaximum.instantUtc).toEqual(
      circumstances!.maximum.instantUtc,
    );
    expect(sampledMaximum.bodies.sun).toEqual(
      circumstances!.maximum.bodies.sun,
    );
    expect(sampledMaximum.bodies.moon).toEqual(
      circumstances!.maximum.bodies.moon,
    );
    const solarMidpoint = new Date(
      (
        contacts.get("solar-c1")!.instantUtc.getTime() +
        contacts.get("solar-c4")!.instantUtc.getTime()
      ) / 2,
    );
    const sampledMidpoint = sampleLocalSolarEclipseAt(
      ephemeris,
      solarMidpoint,
      {
        latitude: 51.5,
        longitude: -(10 / 60),
        name: "London",
        timeZone: "Europe/London",
      },
    );
    expect(sampledMidpoint.instantUtc).toEqual(solarMidpoint);
    expect(
      sampledMidpoint.bodies.sun?.angularRadiusRadians,
    ).toBeGreaterThan(0);
    expect(
      sampledMidpoint.bodies.moon?.angularRadiusRadians,
    ).toBeGreaterThan(0);
    expect(() =>
      sampleLocalSolarEclipseAt(
        ephemeris,
        new Date(Number.NaN),
        {
          latitude: 51.5,
          longitude: -(10 / 60),
          name: "London",
          timeZone: "Europe/London",
        },
      ),
    ).toThrow(/sample time/);
  });

  it("matches NASA's 2026-03-03 lunar greatest-eclipse time and magnitude", async () => {
    const candidateLoader = new EventCandidateLoader(localAssetFetch);
    const candidates = await candidateLoader.loadRange(
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-12-31T23:59:59.999Z"),
    );
    const candidate = candidates.find(
      ({ summary }) => summary.id === "le-20260303",
    );
    expect(candidate?.seed.kind).toBe("lunar-eclipse");
    if (!candidate || candidate.seed.kind !== "lunar-eclipse") {
      throw new Error("2026 lunar eclipse candidate is missing");
    }
    const ephemeris = await new De442sEphemerisLoader({
      baseUrl: "/event-data/de442s/",
      fetch: localAssetFetch,
      pageUrl: "https://planetarium.test/",
    }).loadRange(
      candidate.seed.searchStartJulianDateTdb,
      candidate.seed.searchEndJulianDateTdb,
    );
    const earthOrientationDates: number[] = [];
    const earthOrientationProvenanceDates: number[] = [];
    const earthOrientationUncertaintyDates: number[] = [];
    const circumstances = calculateLocalLunarEclipse(
      ephemeris,
      candidate.summary,
      {
        latitude: 35.681_236,
        longitude: 139.767_125,
        name: "東京",
        timeZone: "Asia/Tokyo",
      },
      {
        earthOrientationAt: (date) => {
          earthOrientationDates.push(date.getTime());
          return undefined;
        },
        earthOrientationProvenanceAt: (date) => {
          earthOrientationProvenanceDates.push(date.getTime());
          return {
            dut1Quality: "predicted",
            eopRetrievedAt: "2026-07-29T04:05:06.000Z",
            eopSourceSha256: "e".repeat(64),
            polarMotionQuality: "predicted",
          };
        },
        earthOrientationReportedUncertaintyAt: (date) => {
          earthOrientationUncertaintyDates.push(date.getTime());
          return {
            combinedPathMeters: 0.6,
            dut1PathMeters: 0.5,
            dut1ReportedErrorSeconds: 0.001,
            polarMotionPathMeters: 0.1,
            semantics:
              "iers-reported-error-linear-envelope",
          };
        },
        heightMeters: 0,
        locationSource: "bundled-city",
      },
    );

    expect(circumstances).not.toBeNull();
    expect(
      Math.min(...earthOrientationDates),
    ).toBeLessThan(circumstances!.maximum.instantUtc.getTime());
    expect(
      Math.max(...earthOrientationDates),
    ).toBeGreaterThan(circumstances!.maximum.instantUtc.getTime());
    expect(circumstances!.event).toBe(candidate.summary);
    expect(circumstances!.localClassification).toBe("total");
    expect(earthOrientationProvenanceDates).toEqual([
      circumstances!.maximum.instantUtc.getTime(),
    ]);
    expect(earthOrientationUncertaintyDates).toEqual([
      circumstances!.maximum.instantUtc.getTime(),
    ]);
    expect(circumstances!.uncertainty.earthOrientation).toMatchObject({
      combinedPathMeters: 0.6,
    });
    expect(circumstances!.provenance).toMatchObject({
      dut1Quality: "predicted",
      eopRetrievedAt: "2026-07-29T04:05:06.000Z",
      eopSourceSha256: "e".repeat(64),
      polarMotionQuality: "predicted",
    });
    // NASA publishes 11:34:52 TD; TT−UTC is 69.184 s in 2026.
    expect(
      secondsBetween(
        circumstances!.maximum.instantUtc,
        "2026-03-03T11:33:42.816Z",
      ),
    ).toBeLessThan(1);
    expect(circumstances!.magnitude).toBeCloseTo(1.151, 3);
    const contactPositionAngles = new Map(
      circumstances!.contacts.map((contact) => [
        contact.phase,
        contact.positionAngleRadians === null
          ? null
          : (contact.positionAngleRadians * 180) / Math.PI,
      ]),
    );
    expect(contactPositionAngles.get("maximum")).toBeNull();
    expect(contactPositionAngles.get("lunar-u1")).toBeCloseTo(
      96.2,
      0,
    );
    expect(contactPositionAngles.get("lunar-u4")).toBeCloseTo(
      320.2,
      0,
    );
    expect(
      circumstances!.contacts.every(
        (contact) => contact.lunarShadow !== undefined,
      ),
    ).toBe(true);
    const maximumShadow =
      circumstances!.maximum.lunarShadow!;
    const moonRadius =
      circumstances!.maximum.bodies.moon!
        .angularRadiusRadians!;
    expect(
      maximumShadow.penumbralAngularRadiusRadians,
    ).toBeGreaterThan(
      maximumShadow.umbralAngularRadiusRadians,
    );
    expect(
      maximumShadow.umbralAngularRadiusRadians,
    ).toBeGreaterThan(moonRadius);
    expect(
      maximumShadow.centerSeparationRadians,
    ).toBeLessThan(
      maximumShadow.umbralAngularRadiusRadians -
        moonRadius,
    );
    expect(
      maximumShadow.centerPositionAngleRadians,
    ).not.toBeNull();

    const sampledMaximum = sampleLocalLunarEclipseAt(
      ephemeris,
      circumstances!.maximum.instantUtc,
      {
        latitude: 35.681_236,
        longitude: 139.767_125,
        name: "東京",
        timeZone: "Asia/Tokyo",
      },
      { heightMeters: 0 },
    );
    expect(sampledMaximum.instantUtc).toEqual(
      circumstances!.maximum.instantUtc,
    );
    expect(sampledMaximum.bodies.moon).toEqual(
      circumstances!.maximum.bodies.moon,
    );
    expect(sampledMaximum.lunarShadow).toEqual(
      circumstances!.maximum.lunarShadow,
    );
    const firstContact = circumstances!.contacts[0]!;
    const lastContact =
      circumstances!.contacts[circumstances!.contacts.length - 1]!;
    const lunarMidpoint = new Date(
      (firstContact.instantUtc.getTime() +
        lastContact.instantUtc.getTime()) /
        2,
    );
    const sampledMidpoint = sampleLocalLunarEclipseAt(
      ephemeris,
      lunarMidpoint,
      {
        latitude: 35.681_236,
        longitude: 139.767_125,
        name: "東京",
        timeZone: "Asia/Tokyo",
      },
    );
    expect(sampledMidpoint.instantUtc).toEqual(lunarMidpoint);
    expect(
      sampledMidpoint.lunarShadow
        ?.penumbralAngularRadiusRadians,
    ).toBeGreaterThan(
      sampledMidpoint.lunarShadow
        ?.umbralAngularRadiusRadians ?? Number.POSITIVE_INFINITY,
    );
    expect(() =>
      sampleLocalLunarEclipseAt(
        ephemeris,
        new Date(Number.NaN),
        {
          latitude: 35.681_236,
          longitude: 139.767_125,
          name: "東京",
          timeZone: "Asia/Tokyo",
        },
      ),
    ).toThrow(/sample time/);
  });

  it("reproduces the documented 2017-03-05 Aldebaran graze region", async () => {
    const candidateLoader = new EventCandidateLoader(localAssetFetch);
    const candidates = await candidateLoader.loadRange(
      new Date("2017-01-01T00:00:00.000Z"),
      new Date("2017-12-31T23:59:59.999Z"),
    );
    const candidate = candidates.find(
      ({ summary }) => summary.id === "lo-20170305-hr1457",
    );
    expect(candidate?.seed.kind).toBe("lunar-occultation");
    if (!candidate || candidate.seed.kind !== "lunar-occultation") {
      throw new Error("2017 Aldebaran candidate is missing");
    }
    const target = precisionStarByHR.get(1457);
    expect(target).toBeDefined();
    if (!target) {
      throw new Error("Aldebaran is missing from the precision catalog");
    }
    const ephemeris = await new De442sEphemerisLoader({
      baseUrl: "/event-data/de442s/",
      fetch: localAssetFetch,
      pageUrl: "https://planetarium.test/",
    }).loadRange(
      candidate.seed.searchStartJulianDateTdb,
      candidate.seed.searchEndJulianDateTdb,
    );
    const circumstances = calculateLocalLunarOccultation(
      ephemeris,
      candidate.summary,
      target,
      {
        latitude: 43.638_145,
        longitude: -79.789_429,
        name: "Lionhead Golf Club",
        timeZone: "America/Toronto",
      },
      {
        heightMeters: 200,
        locationSource: "manual",
      },
    );

    expect(circumstances).not.toBeNull();
    expect(circumstances!.event).toBe(candidate.summary);
    expect(circumstances!.localClassification).toBe("occultation");
    expect(circumstances?.maximum.instantUtc.toISOString()).toMatch(
      /^2017-03-05T04:1[5-7]:/,
    );
    expect(circumstances?.contacts.map(({ phase }) => phase)).toEqual([
      "maximum",
    ]);
    expect(circumstances?.boundaryUncertain).toBe(true);
    expect(circumstances?.boundaryUncertaintyReason).toBe(
      "occultation-occurrence",
    );
    expect(circumstances?.visibility).toBe("partly-visible");
    expect(circumstances?.uncertainty.tier).toBe("reference");
    expect(circumstances?.warnings.join(" ")).toContain(
      "物理境界帯",
    );
    expect(circumstances?.event.targetStarHR).toBe(1457);

    const sampledMaximum = sampleLocalLunarOccultationAt(
      ephemeris,
      circumstances!.maximum.instantUtc,
      target,
      {
        latitude: 43.638_145,
        longitude: -79.789_429,
        name: "Lionhead Golf Club",
        timeZone: "America/Toronto",
      },
      { heightMeters: 200 },
    );
    expect(sampledMaximum.instantUtc).toEqual(
      circumstances!.maximum.instantUtc,
    );
    expect(sampledMaximum.bodies.moon).toEqual(
      circumstances!.maximum.bodies.moon,
    );
    expect(sampledMaximum.bodies.target).toEqual(
      circumstances!.maximum.bodies.target,
    );
    const sampledMinuteLater = sampleLocalLunarOccultationAt(
      ephemeris,
      new Date(
        circumstances!.maximum.instantUtc.getTime() + 60_000,
      ),
      target,
      {
        latitude: 43.638_145,
        longitude: -79.789_429,
        name: "Lionhead Golf Club",
        timeZone: "America/Toronto",
      },
      { heightMeters: 200 },
    );
    expect(
      sampledMinuteLater.bodies.moon?.angularRadiusRadians,
    ).toBeGreaterThan(0);
    expect(
      sampledMinuteLater.bodies.target?.altitudeAzimuth.altitude,
    ).toBeTypeOf("number");
    expect(() =>
      sampleLocalLunarOccultationAt(
        ephemeris,
        new Date(Number.NaN),
        target,
        {
          latitude: 43.638_145,
          longitude: -79.789_429,
          name: "Lionhead Golf Club",
          timeZone: "America/Toronto",
        },
        { heightMeters: 200 },
      ),
    ).toThrow(/sample time/);
  });

  it(
    "keeps every bundled 2039 candidate calculable for Tokyo",
    async () => {
      const candidateLoader = new EventCandidateLoader(localAssetFetch);
      const candidates = await candidateLoader.loadRange(
        new Date("2039-01-01T00:00:00.000Z"),
        new Date("2039-12-31T23:59:59.999Z"),
      );
      const ephemeris = await new De442sEphemerisLoader({
        baseUrl: "/event-data/de442s/",
        fetch: localAssetFetch,
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
      );
      const location = {
        latitude: 35.681_236,
        longitude: 139.767_125,
        name: "東京",
        timeZone: "Asia/Tokyo",
      };
      const failures: string[] = [];

      for (const candidate of candidates) {
        try {
          switch (candidate.seed.kind) {
            case "solar-eclipse":
              calculateLocalSolarEclipse(
                ephemeris,
                candidate.summary,
                location,
              );
              break;
            case "lunar-eclipse":
              calculateLocalLunarEclipse(
                ephemeris,
                candidate.summary,
                location,
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
              calculateLocalLunarOccultation(
                ephemeris,
                candidate.summary,
                target,
                location,
              );
              break;
            }
          }
        } catch (error) {
          failures.push(
            `${candidate.summary.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      expect(candidates.length).toBeGreaterThan(0);
      expect(failures).toEqual([]);
    },
    30_000,
  );

  it(
    "calculates the final 2100 candidate with an asymmetric coverage-clipped 18-hour window",
    async () => {
      const candidates = await new EventCandidateLoader(
        localAssetFetch,
      ).loadRange(
        new Date("2100-12-31T00:00:00.000Z"),
        new Date("2100-12-31T23:59:59.999Z"),
      );
      const candidate = candidates.find(
        ({ summary }) => summary.id === "lo-21001231-hr7121",
      );
      expect(candidate?.seed.kind).toBe("lunar-occultation");
      if (!candidate || candidate.seed.kind !== "lunar-occultation") {
        throw new Error("Final 2100 occultation candidate is missing");
      }
      const target = precisionStarByHR.get(candidate.seed.target.hr);
      expect(target).toBeDefined();
      if (!target) {
        throw new Error("Final 2100 target is missing");
      }
      const ephemeris = await new De442sEphemerisLoader({
        baseUrl: "/event-data/de442s/",
        fetch: localAssetFetch,
        pageUrl: "https://planetarium.test/",
      }).loadRange(
        candidate.seed.searchStartJulianDateTdb,
        candidate.seed.searchEndJulianDateTdb,
        { clipToCoverage: true },
      );
      expect(
        candidate.seed.searchEndJulianDateTdb,
      ).toBeGreaterThan(
        ephemeris.stateCoverage.endJulianDateTdb,
      );
      const stateDates: number[] = [];
      const trackedEphemeris: EventEphemerisProvider = {
        id: ephemeris.id,
        sourceSha256: ephemeris.sourceSha256,
        stateCoverage: ephemeris.stateCoverage,
        state: (tdbJulianDate) => {
          stateDates.push(tdbJulianDate);
          return ephemeris.state(tdbJulianDate);
        },
      };
      const candidateMilliseconds =
        candidate.summary.canonicalEpochUtc.getTime();
      const halfWindowMilliseconds =
        18 * 60 * 60 * 1_000;
      const resolvedSearchBounds = resolveEventSearchBounds(
        candidateMilliseconds,
        halfWindowMilliseconds,
        eventEphemerisSearchBounds(trackedEphemeris),
      );
      expect(resolvedSearchBounds.startUtcMilliseconds).toBe(
        candidateMilliseconds - halfWindowMilliseconds,
      );
      expect(resolvedSearchBounds.endUtcMilliseconds).toBeLessThan(
        candidateMilliseconds + halfWindowMilliseconds,
      );

      expect(() =>
        calculateLocalLunarOccultation(
          trackedEphemeris,
          candidate.summary,
          target,
          {
            latitude: 35.681_236,
            longitude: 139.767_125,
            name: "東京",
            timeZone: "Asia/Tokyo",
          },
          {
            halfWindowMilliseconds,
          },
        ),
      ).not.toThrow();
      expect(stateDates.length).toBeGreaterThan(0);
      expect(Math.min(...stateDates)).toBeGreaterThanOrEqual(
        trackedEphemeris.stateCoverage.startJulianDateTdb,
      );
      expect(Math.max(...stateDates)).toBeLessThanOrEqual(
        trackedEphemeris.stateCoverage.endJulianDateTdb,
      );
    },
    30_000,
  );
});
