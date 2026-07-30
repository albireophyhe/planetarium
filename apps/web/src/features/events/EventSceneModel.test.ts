import { describe, expect, it } from "vitest";
import type {
  EventBodyPosition,
  EventClassification,
  EventContact,
  EventKind,
  LocalCircumstances,
} from "../../domain/events/types";
import {
  createEventSceneModel,
  horizontalTangentOffset,
} from "./EventSceneModel";

function body(
  altitude: number,
  azimuth: number,
  angularRadiusRadians: number | null,
): EventBodyPosition {
  return {
    altitudeAzimuth: {
      altitude,
      azimuth,
      azimuthDefined: true,
    },
    angularRadiusRadians,
    distanceKilometers:
      angularRadiusRadians === null ? null : 380_000,
  };
}

function eventContact(
  bodies: EventContact["bodies"],
  overrides: Partial<EventContact> = {},
): EventContact {
  return {
    aboveHorizon: true,
    bodies,
    instantUtc: new Date("2026-08-12T18:30:12.000Z"),
    phase: "maximum",
    positionAngleRadians: null,
    ...overrides,
  };
}

function circumstances(
  kind: EventKind,
  maximum: EventContact,
  localClassification: EventClassification,
): LocalCircumstances {
  return {
    boundaryUncertain: false,
    boundaryUncertaintyReason: null,
    contacts: [maximum],
    event: {
      canonicalEpochUtc: maximum.instantUtc,
      dataVersion: "test-v1",
      globalClassification: localClassification,
      id: `event-${kind}`,
      kind,
      targetStarHR:
        kind === "lunar-occultation" ? 7001 : null,
      title: "テスト現象",
    },
    localClassification,
    magnitude: kind === "lunar-eclipse" ? 1.032 : null,
    maximum,
    obscuration: kind === "solar-eclipse" ? 0.85 : null,
    observer: {
      heightMeters: 10,
      horizontalAccuracyMeters: 15,
      latitude: 35,
      locationSource: "device-geolocation",
      longitude: 139,
      name: "テスト地点",
      timeZone: "Asia/Tokyo",
    },
    provenance: {
      algorithmVersion: "test",
      deltaTModel: "test",
      dut1Quality: "observed",
      eopId: "test",
      eopRetrievedAt: "2026-01-01T00:00:00.000Z",
      eopSourceSha256: "e".repeat(64),
      ephemerisId: "test",
      ephemerisSourceSha256: "a".repeat(64),
      limbProfileId: null,
      lunarRadiusModel: "mean-spherical-limb",
      polarMotionQuality: "observed",
    },
    uncertainty: {
      dominantContributors: [],
      observerLocationMeters: 15,
      pathKilometers: null,
      tier: "normal",
      timingSeconds: 1,
    },
    visibility: "fully-visible",
    warnings: [],
  };
}

describe("horizontalTangentOffset", () => {
  it("preserves increasing azimuth and altitude around the reference", () => {
    const reference = {
      altitude: 0,
      azimuth: 0,
      azimuthDefined: true,
    };

    expect(
      horizontalTangentOffset(reference, {
        altitude: 0,
        azimuth: 0.01,
        azimuthDefined: true,
      }),
    ).toMatchObject({
      separationRadians: expect.closeTo(0.01, 12),
      xRadians: expect.closeTo(0.01, 12),
      yRadians: expect.closeTo(0, 12),
    });
    expect(
      horizontalTangentOffset(reference, {
        altitude: 0.02,
        azimuth: 0,
        azimuthDefined: true,
      }),
    ).toMatchObject({
      separationRadians: expect.closeTo(0.02, 12),
      xRadians: expect.closeTo(0, 12),
      yRadians: expect.closeTo(0.02, 12),
    });
  });

  it("preserves exact great-circle distance in the tangent plane", () => {
    const offset = horizontalTangentOffset(
      {
        altitude: 0.7,
        azimuth: 1.2,
        azimuthDefined: true,
      },
      {
        altitude: 0.706,
        azimuth: 1.207,
        azimuthDefined: true,
      },
    );

    expect(offset).not.toBeNull();
    expect(
      Math.hypot(
        offset?.xRadians ?? 0,
        offset?.yRadians ?? 0,
      ),
    ).toBeCloseTo(offset?.separationRadians ?? 1, 14);
  });

  it("does not invent an orientation at an undefined azimuth", () => {
    expect(
      horizontalTangentOffset(
        {
          altitude: Math.PI / 2,
          azimuth: 0,
          azimuthDefined: false,
        },
        {
          altitude: Math.PI / 2 - 0.01,
          azimuth: 1,
          azimuthDefined: true,
        },
      ),
    ).toBeNull();
  });
});

describe("createEventSceneModel", () => {
  it("preserves solar disc-radius ratios in its common angular scale", () => {
    const maximum = eventContact({
      moon: body(0.4, 1.008, 0.005),
      sun: body(0.4, 1, 0.004),
    });
    const model = createEventSceneModel(
      circumstances("solar-eclipse", maximum, "partial"),
    );

    expect(model.fidelity).toBe("calculated");
    expect(model.kind).toBe("solar-eclipse");
    if (
      model.fidelity !== "calculated" ||
      model.kind !== "solar-eclipse"
    ) {
      throw new Error("Expected a calculated solar model");
    }
    expect(model.moon.radius / model.sun.radius).toBeCloseTo(
      1.25,
      4,
    );
    expect(model.metrics[0]?.label).toBe("中心間隔");
  });

  it("uses computed lunar-shadow geometry and celestial position angle", () => {
    const maximum = eventContact(
      {
        moon: body(0.6, 2, 0.0045),
      },
      {
        lunarShadow: {
          centerPositionAngleRadians: Math.PI / 2,
          centerSeparationRadians: 0.006,
          penumbralAngularRadiusRadians: 0.012,
          umbralAngularRadiusRadians: 0.008,
        },
      },
    );
    const model = createEventSceneModel(
      circumstances("lunar-eclipse", maximum, "total"),
    );

    expect(model.fidelity).toBe("calculated");
    expect(model.kind).toBe("lunar-eclipse");
    if (
      model.fidelity !== "calculated" ||
      model.kind !== "lunar-eclipse"
    ) {
      throw new Error("Expected a calculated lunar model");
    }
    expect(model.umbra.x).toBeGreaterThan(model.moon.x);
    expect(model.umbra.y).toBeCloseTo(model.moon.y, 12);
    expect(model.umbra.radius / model.moon.radius).toBeCloseTo(
      0.008 / 0.0045,
      4,
    );
    expect(model.metrics.map(({ label }) => label)).toEqual([
      "月と影の中心間隔",
      "本影の視直径",
      "半影の視直径",
    ]);
  });

  it("labels legacy lunar results as schematic instead of inferring shadow radii", () => {
    const maximum = eventContact({
      moon: body(0.6, 2, 0.0045),
    });
    const model = createEventSceneModel(
      circumstances("lunar-eclipse", maximum, "partial"),
    );

    expect(model).toMatchObject({
      fidelity: "schematic",
      kind: "lunar-eclipse",
    });
    expect(model.description).toContain(
      "影中心・本影半径・半影半径の計算値がこの結果にはない",
    );
    expect(model.orientationNote).toContain(
      "実際の値を表しません",
    );
  });

  it("marks a target inside the mean lunar disc as being behind the Moon", () => {
    const maximum = eventContact({
      moon: body(0.5, 1, 0.005),
      target: body(0.5, 1.002, null),
    });
    const model = createEventSceneModel(
      circumstances(
        "lunar-occultation",
        maximum,
        "occultation",
      ),
    );

    expect(model.fidelity).toBe("calculated");
    expect(model.kind).toBe("lunar-occultation");
    if (
      model.fidelity !== "calculated" ||
      model.kind !== "lunar-occultation"
    ) {
      throw new Error("Expected a calculated occultation model");
    }
    expect(model.targetIsBehindMoon).toBe(true);
    expect(model.description).toContain("月面裏の位置");
  });

  it("returns an explicit unavailable model when required body data is missing", () => {
    const maximum = eventContact({
      sun: body(0.4, 1, 0.004),
    });
    const model = createEventSceneModel(
      circumstances("solar-eclipse", maximum, "partial"),
    );

    expect(model).toMatchObject({
      fidelity: "unavailable",
      kind: "solar-eclipse",
      metrics: [],
    });
    expect(model.scaleNote).toContain("推測で補わず");
  });
});
