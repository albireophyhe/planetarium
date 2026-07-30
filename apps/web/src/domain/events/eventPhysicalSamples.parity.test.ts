// @vitest-environment node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { precisionStarByHR } from "../precisionData";
import type { ObservingLocation } from "../types";
import { EventCandidateLoader } from "./eventCandidates";
import type { EventAssetFetch } from "./eventAssetTransport";
import { De442sEphemerisLoader } from "./de442sLoader";
import {
  sampleLocalLunarEclipseAt,
  sampleLocalLunarOccultationAt,
  sampleLocalSolarEclipseAt,
} from "./index";
import type {
  EventBodyPosition,
  EventKind,
  EventPhysicalSample,
} from "./types";

const repositoryRoot = fileURLToPath(
  new URL("../../../../../", import.meta.url),
);

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

interface PhysicalSampleFixture {
  readonly schemaVersion: number;
  readonly model: string;
  readonly tolerances: {
    readonly angleRadians: number;
    readonly distanceKilometers: number;
  };
  readonly cases: readonly PhysicalSampleCase[];
}

interface PhysicalSampleCase {
  readonly id: string;
  readonly eventId: string;
  readonly kind: EventKind;
  readonly targetStarHR: number | null;
  readonly instantUtc: string;
  readonly location: {
    readonly latitude: number;
    readonly longitude: number;
    readonly heightMeters: number;
    readonly timeZone: string;
  };
  readonly expected: {
    readonly aboveHorizon: boolean;
    readonly bodies: Readonly<
      Partial<Record<"sun" | "moon" | "target", ExpectedBody>>
    >;
    readonly lunarShadow: ExpectedLunarShadow | null;
  };
}

interface ExpectedBody {
  readonly altitudeRadians: number;
  readonly azimuthRadians: number;
  readonly azimuthDefined: boolean;
  readonly angularRadiusRadians: number | null;
  readonly distanceKilometers: number | null;
}

interface ExpectedLunarShadow {
  readonly centerSeparationRadians: number;
  readonly centerPositionAngleRadians: number;
  readonly penumbralAngularRadiusRadians: number;
  readonly umbralAngularRadiusRadians: number;
}

const fixture = JSON.parse(
  await readFile(
    `${repositoryRoot}shared/fixtures/event-physical-samples.v1.json`,
    "utf8",
  ),
) as PhysicalSampleFixture;

function circularDifference(actual: number, expected: number): number {
  const fullTurn = Math.PI * 2;
  const wrapped =
    ((actual - expected + Math.PI) % fullTurn + fullTurn) % fullTurn;
  return Math.abs(wrapped - Math.PI);
}

function expectAngle(
  actual: number,
  expected: number,
  label: string,
): void {
  expect(
    Math.abs(actual - expected),
    label,
  ).toBeLessThanOrEqual(fixture.tolerances.angleRadians);
}

function expectCircularAngle(
  actual: number,
  expected: number,
  label: string,
): void {
  expect(
    circularDifference(actual, expected),
    label,
  ).toBeLessThanOrEqual(fixture.tolerances.angleRadians);
}

function expectBody(
  actual: EventBodyPosition | undefined,
  expected: ExpectedBody,
  label: string,
): void {
  expect(actual, label).toBeDefined();
  if (!actual) {
    return;
  }
  expectAngle(
    actual.altitudeAzimuth.altitude,
    expected.altitudeRadians,
    `${label} altitude`,
  );
  expectCircularAngle(
    actual.altitudeAzimuth.azimuth,
    expected.azimuthRadians,
    `${label} azimuth`,
  );
  expect(
    actual.altitudeAzimuth.azimuthDefined,
    `${label} azimuth defined`,
  ).toBe(expected.azimuthDefined);

  if (expected.angularRadiusRadians === null) {
    expect(actual.angularRadiusRadians, `${label} radius`).toBeNull();
  } else {
    expect(actual.angularRadiusRadians, `${label} radius`).not.toBeNull();
    expectAngle(
      actual.angularRadiusRadians as number,
      expected.angularRadiusRadians,
      `${label} radius`,
    );
  }

  if (expected.distanceKilometers === null) {
    expect(actual.distanceKilometers, `${label} distance`).toBeNull();
  } else {
    expect(
      Math.abs(
        (actual.distanceKilometers as number) -
          expected.distanceKilometers,
      ),
      `${label} distance`,
    ).toBeLessThanOrEqual(fixture.tolerances.distanceKilometers);
  }
}

function expectSample(
  actual: EventPhysicalSample,
  vector: PhysicalSampleCase,
): void {
  expect(actual.instantUtc.toISOString(), `${vector.id} instant`).toBe(
    vector.instantUtc,
  );
  expect(actual.aboveHorizon, `${vector.id} horizon`).toBe(
    vector.expected.aboveHorizon,
  );
  for (const bodyName of ["sun", "moon", "target"] as const) {
    const expectedBody = vector.expected.bodies[bodyName];
    if (expectedBody) {
      expectBody(
        actual.bodies[bodyName],
        expectedBody,
        `${vector.id} ${bodyName}`,
      );
    } else {
      expect(actual.bodies[bodyName], `${vector.id} ${bodyName}`).toBeUndefined();
    }
  }

  const expectedShadow = vector.expected.lunarShadow;
  if (!expectedShadow) {
    expect(actual.lunarShadow, `${vector.id} shadow`).toBeUndefined();
    return;
  }
  expect(actual.lunarShadow, `${vector.id} shadow`).toBeDefined();
  if (!actual.lunarShadow) {
    return;
  }
  expectAngle(
    actual.lunarShadow.centerSeparationRadians,
    expectedShadow.centerSeparationRadians,
    `${vector.id} shadow separation`,
  );
  expect(actual.lunarShadow.centerPositionAngleRadians).not.toBeNull();
  expectCircularAngle(
    actual.lunarShadow.centerPositionAngleRadians as number,
    expectedShadow.centerPositionAngleRadians,
    `${vector.id} shadow position angle`,
  );
  expectAngle(
    actual.lunarShadow.penumbralAngularRadiusRadians,
    expectedShadow.penumbralAngularRadiusRadians,
    `${vector.id} penumbral radius`,
  );
  expectAngle(
    actual.lunarShadow.umbralAngularRadiusRadians,
    expectedShadow.umbralAngularRadiusRadians,
    `${vector.id} umbral radius`,
  );
}

describe("shared physical event-sample parity", () => {
  it(
    "matches the cross-runtime DE442s vectors at maximum and interior instants",
    async () => {
      expect(fixture.schemaVersion).toBe(1);
      expect(fixture.model).toBe("event-physical-samples-v1");

      const candidateLoader = new EventCandidateLoader(localAssetFetch);
      const candidates = await candidateLoader.loadRange(
        new Date("2017-01-01T00:00:00.000Z"),
        new Date("2026-12-31T23:59:59.999Z"),
      );
      const candidateById = new Map(
        candidates.map((candidate) => [candidate.summary.id, candidate]),
      );
      const ephemerisByEventId = new Map<
        string,
        Awaited<ReturnType<De442sEphemerisLoader["loadRange"]>>
      >();
      const ephemerisLoader = new De442sEphemerisLoader({
        baseUrl: "/event-data/de442s/",
        fetch: localAssetFetch,
        pageUrl: "https://planetarium.test/",
      });
      const earthOrientation = {
        dut1Seconds: 0,
        polarMotion: {
          xpRadians: 0,
          ypRadians: 0,
          source: "assumed-zero" as const,
        },
      };

      for (const vector of fixture.cases) {
        const candidate = candidateById.get(vector.eventId);
        expect(candidate, `${vector.id} candidate`).toBeDefined();
        if (!candidate) {
          continue;
        }
        expect(candidate.seed.kind, `${vector.id} kind`).toBe(vector.kind);
        let ephemeris = ephemerisByEventId.get(vector.eventId);
        if (!ephemeris) {
          ephemeris = await ephemerisLoader.loadRange(
            candidate.seed.searchStartJulianDateTdb,
            candidate.seed.searchEndJulianDateTdb,
          );
          ephemerisByEventId.set(vector.eventId, ephemeris);
        }

        const location: ObservingLocation = {
          latitude: vector.location.latitude,
          longitude: vector.location.longitude,
          timeZone: vector.location.timeZone,
        };
        const instant = new Date(vector.instantUtc);
        const options = {
          earthOrientation,
          heightMeters: vector.location.heightMeters,
          locationSource: "manual" as const,
        };
        let actual: EventPhysicalSample;
        switch (vector.kind) {
          case "solar-eclipse":
            actual = sampleLocalSolarEclipseAt(
              ephemeris,
              instant,
              location,
              options,
            );
            break;
          case "lunar-eclipse":
            actual = sampleLocalLunarEclipseAt(
              ephemeris,
              instant,
              location,
              options,
            );
            break;
          case "lunar-occultation": {
            expect(vector.targetStarHR).not.toBeNull();
            const target = precisionStarByHR.get(
              vector.targetStarHR as number,
            );
            expect(target, `${vector.id} target`).toBeDefined();
            if (!target) {
              continue;
            }
            actual = sampleLocalLunarOccultationAt(
              ephemeris,
              instant,
              target,
              location,
              options,
            );
            break;
          }
        }
        expectSample(actual, vector);
      }
    },
    30_000,
  );
});
