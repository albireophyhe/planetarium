import { describe, expect, it } from "vitest";
import type {
  EventBodyPosition,
  EventClassification,
  EventContact,
  EventKind,
  LocalCircumstances,
} from "../../domain/events/types";
import {
  createEventSceneProjection,
  createEventSceneModel,
  EVENT_SCENE_DRAWING_BOUNDS,
  horizontalTangentOffset,
  type EventSceneCircle,
  type EventSceneModel,
  type EventSceneSample,
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
  contacts: readonly EventContact[] = [maximum],
): LocalCircumstances {
  return {
    boundaryUncertain: false,
    boundaryUncertaintyReason: null,
    contacts,
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

function expectCircleInsideDrawingBounds(
  circle: EventSceneCircle,
) {
  expect(circle.x - circle.radius).toBeGreaterThanOrEqual(
    EVENT_SCENE_DRAWING_BOUNDS.left - 0.001,
  );
  expect(circle.x + circle.radius).toBeLessThanOrEqual(
    EVENT_SCENE_DRAWING_BOUNDS.right + 0.001,
  );
  expect(circle.y - circle.radius).toBeGreaterThanOrEqual(
    EVENT_SCENE_DRAWING_BOUNDS.top - 0.001,
  );
  expect(circle.y + circle.radius).toBeLessThanOrEqual(
    EVENT_SCENE_DRAWING_BOUNDS.bottom + 0.001,
  );
}

function expectCalculatedSceneInsideDrawingBounds(
  model: EventSceneModel,
) {
  expect(model.fidelity).toBe("calculated");
  if (model.fidelity !== "calculated") {
    throw new Error("Expected a calculated scene");
  }
  expect(model.angularScalePixelsPerRadian).toBeGreaterThan(0);
  expectCircleInsideDrawingBounds(model.moon);
  switch (model.kind) {
    case "solar-eclipse":
      expectCircleInsideDrawingBounds(model.sun);
      break;
    case "lunar-eclipse":
      expectCircleInsideDrawingBounds(model.penumbra);
      expectCircleInsideDrawingBounds(model.umbra);
      break;
    case "lunar-occultation":
      expect(model.target.x).toBeGreaterThanOrEqual(
        EVENT_SCENE_DRAWING_BOUNDS.left - 0.001,
      );
      expect(model.target.x).toBeLessThanOrEqual(
        EVENT_SCENE_DRAWING_BOUNDS.right + 0.001,
      );
      expect(model.target.y).toBeGreaterThanOrEqual(
        EVENT_SCENE_DRAWING_BOUNDS.top - 0.001,
      );
      expect(model.target.y).toBeLessThanOrEqual(
        EVENT_SCENE_DRAWING_BOUNDS.bottom + 0.001,
      );
      break;
  }
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

describe("fixed event-scene projection", () => {
  it("reserves angular padding around the complete reference extent", () => {
    const maximum = eventContact({
      moon: body(0, 1, 0.005),
      sun: body(0, 1, 0.004),
    });
    const event = circumstances(
      "solar-eclipse",
      maximum,
      "partial",
    );

    const projection = createEventSceneProjection(event);

    expect(projection?.angularLeft).toBeLessThan(-0.005);
    expect(projection?.angularRight).toBeGreaterThan(0.005);
    expect(projection?.angularBottom).toBeLessThan(-0.005);
    expect(projection?.angularTop).toBeGreaterThan(0.005);
  });

  it("keeps solar-disc scale fixed and contains every solved phase", () => {
    const c1 = eventContact(
      {
        moon: body(0, 1.01, 0.005),
        sun: body(0, 1, 0.004),
      },
      {
        instantUtc: new Date("2026-08-12T17:30:00.000Z"),
        phase: "solar-c1",
      },
    );
    const maximum = eventContact({
      moon: body(0, 1.001, 0.005),
      sun: body(0, 1, 0.004),
    });
    const c4 = eventContact(
      {
        moon: body(0, 0.99, 0.005),
        sun: body(0, 1, 0.004),
      },
      {
        instantUtc: new Date("2026-08-12T19:30:00.000Z"),
        phase: "solar-c4",
      },
    );
    const event = circumstances(
      "solar-eclipse",
      maximum,
      "partial",
      [c1, c4],
    );
    const projection = createEventSceneProjection(event);
    expect(projection).not.toBeNull();

    const models = [c1, maximum, c4].map((sample) =>
      createEventSceneModel(event, sample, projection),
    );
    for (const model of models) {
      expectCalculatedSceneInsideDrawingBounds(model);
      expect(model.angularScalePixelsPerRadian).toBe(
        projection?.pixelsPerRadian,
      );
    }
    const solarModels = models.map((model) => {
      if (
        model.fidelity !== "calculated" ||
        model.kind !== "solar-eclipse"
      ) {
        throw new Error("Expected calculated solar scenes");
      }
      return model;
    });
    expect(new Set(solarModels.map(({ sun }) => sun.radius)).size).toBe(
      1,
    );
    expect(new Set(solarModels.map(({ moon }) => moon.radius)).size).toBe(
      1,
    );
  });

  it("keeps lunar-shadow scale fixed and contains every solved phase", () => {
    const lunarContact = (
      phase: EventContact["phase"],
      instantUtc: string,
      centerSeparationRadians: number,
      centerPositionAngleRadians: number | null,
    ) =>
      eventContact(
        { moon: body(0.6, 2, 0.0045) },
        {
          instantUtc: new Date(instantUtc),
          lunarShadow: {
            centerPositionAngleRadians,
            centerSeparationRadians,
            penumbralAngularRadiusRadians: 0.012,
            umbralAngularRadiusRadians: 0.008,
          },
          phase,
        },
      );
    const p1 = lunarContact(
      "lunar-p1",
      "2026-03-03T09:00:00.000Z",
      0.02,
      (3 * Math.PI) / 2,
    );
    const maximum = lunarContact(
      "maximum",
      "2026-03-03T11:00:00.000Z",
      0,
      null,
    );
    const p4 = lunarContact(
      "lunar-p4",
      "2026-03-03T13:00:00.000Z",
      0.02,
      Math.PI / 2,
    );
    const event = circumstances(
      "lunar-eclipse",
      maximum,
      "total",
      [p1, p4],
    );
    const projection = createEventSceneProjection(event);
    expect(projection).not.toBeNull();

    const models = [p1, maximum, p4].map((sample) =>
      createEventSceneModel(event, sample, projection),
    );
    for (const model of models) {
      expectCalculatedSceneInsideDrawingBounds(model);
      expect(model.angularScalePixelsPerRadian).toBe(
        projection?.pixelsPerRadian,
      );
    }
    const lunarModels = models.map((model) => {
      if (
        model.fidelity !== "calculated" ||
        model.kind !== "lunar-eclipse"
      ) {
        throw new Error("Expected calculated lunar scenes");
      }
      return model;
    });
    expect(
      new Set(lunarModels.map(({ moon }) => moon.radius)).size,
    ).toBe(1);
    expect(
      new Set(lunarModels.map(({ penumbra }) => penumbra.radius))
        .size,
    ).toBe(1);
    expect(
      new Set(lunarModels.map(({ umbra }) => umbra.radius)).size,
    ).toBe(1);
  });

  it("keeps occultation scale fixed and contains disappearance through reappearance", () => {
    const occultationContact = (
      phase: EventContact["phase"],
      instantUtc: string,
      targetAzimuth: number,
    ) =>
      eventContact(
        {
          moon: body(0, 1, 0.005),
          target: body(0, targetAzimuth, null),
        },
        { instantUtc: new Date(instantUtc), phase },
      );
    const disappearance = occultationContact(
      "occultation-disappearance",
      "2026-04-01T10:00:00.000Z",
      1.006,
    );
    const maximum = occultationContact(
      "maximum",
      "2026-04-01T10:03:00.000Z",
      1,
    );
    const reappearance = occultationContact(
      "occultation-reappearance",
      "2026-04-01T10:06:00.000Z",
      0.994,
    );
    const event = circumstances(
      "lunar-occultation",
      maximum,
      "occultation",
      [disappearance, reappearance],
    );
    const projection = createEventSceneProjection(event);
    expect(projection).not.toBeNull();

    const models = [
      disappearance,
      maximum,
      reappearance,
    ].map((sample) =>
      createEventSceneModel(event, sample, projection),
    );
    for (const model of models) {
      expectCalculatedSceneInsideDrawingBounds(model);
      expect(model.angularScalePixelsPerRadian).toBe(
        projection?.pixelsPerRadian,
      );
    }
    const occultationModels = models.map((model) => {
      if (
        model.fidelity !== "calculated" ||
        model.kind !== "lunar-occultation"
      ) {
        throw new Error("Expected calculated occultation scenes");
      }
      return model;
    });
    expect(
      new Set(
        occultationModels.map(({ moon }) => moon.radius),
      ).size,
    ).toBe(1);
  });

  it("ignores invalid phases and rejects wholly nonfinite or degenerate extents", () => {
    const validMaximum = eventContact({
      moon: body(0, 1.001, 0.005),
      sun: body(0, 1, 0.004),
    });
    const invalidContact = eventContact(
      {
        moon: body(Number.POSITIVE_INFINITY, 1, 0.005),
        sun: body(0, 1, 0.004),
      },
      { phase: "solar-c1" },
    );
    const partiallyValidEvent = circumstances(
      "solar-eclipse",
      validMaximum,
      "partial",
      [invalidContact],
    );
    const validProjection =
      createEventSceneProjection(partiallyValidEvent);
    expect(validProjection).not.toBeNull();
    expect(
      Number.isFinite(validProjection?.pixelsPerRadian),
    ).toBe(true);
    expect(validProjection?.pixelsPerRadian).toBeGreaterThan(0);

    const zeroRadiusMaximum = eventContact({
      moon: body(0, 1, 0),
      sun: body(0, 1, 0),
    });
    const invalidEvent = circumstances(
      "solar-eclipse",
      zeroRadiusMaximum,
      "partial",
      [invalidContact],
    );
    expect(createEventSceneProjection(invalidEvent)).toBeNull();
  });

  it("accepts a phase-less physical sample grid as its reference extent", () => {
    const maximum = eventContact({
      moon: body(0, 1, 0.005),
      sun: body(0, 1, 0.004),
    });
    const event = circumstances(
      "solar-eclipse",
      maximum,
      "partial",
    );
    const referenceGrid: readonly EventSceneSample[] = [
      {
        aboveHorizon: true,
        bodies: {
          moon: body(0, 1.02, 0.005),
          sun: body(0, 1, 0.004),
        },
        instantUtc: new Date("2026-08-12T18:20:00.000Z"),
        positionAngleRadians: null,
      },
      {
        aboveHorizon: true,
        bodies: {
          moon: body(0, 0.98, 0.005),
          sun: body(0, 1, 0.004),
        },
        instantUtc: new Date("2026-08-12T18:40:00.000Z"),
        positionAngleRadians: null,
      },
    ];

    const solverProjection = createEventSceneProjection(event);
    const gridProjection = createEventSceneProjection(
      event,
      referenceGrid,
    );

    expect(gridProjection).not.toBeNull();
    expect(gridProjection?.pixelsPerRadian).toBeLessThan(
      solverProjection?.pixelsPerRadian ?? 0,
    );
    for (const sample of referenceGrid) {
      expectCalculatedSceneInsideDrawingBounds(
        createEventSceneModel(event, sample, gridProjection),
      );
    }
  });

  it("fails closed instead of rescaling samples outside the fixed event extent", () => {
    const solarMaximum = eventContact({
      moon: body(0, 1, 0.005),
      sun: body(0, 1, 0.004),
    });
    const solarEvent = circumstances(
      "solar-eclipse",
      solarMaximum,
      "partial",
    );
    const solarProjection =
      createEventSceneProjection(solarEvent);
    const solarOutsideSample = eventContact(
      {
        moon: body(0, 1.02, 0.005),
        sun: body(0, 1, 0.004),
      },
      {
        instantUtc: new Date("2026-08-12T18:35:00.000Z"),
        phase: undefined,
      },
    );

    const lunarMaximum = eventContact(
      { moon: body(0.6, 2, 0.0045) },
      {
        lunarShadow: {
          centerPositionAngleRadians: null,
          centerSeparationRadians: 0,
          penumbralAngularRadiusRadians: 0.012,
          umbralAngularRadiusRadians: 0.008,
        },
      },
    );
    const lunarEvent = circumstances(
      "lunar-eclipse",
      lunarMaximum,
      "total",
    );
    const lunarProjection =
      createEventSceneProjection(lunarEvent);
    const lunarOutsideSample = eventContact(
      { moon: body(0.6, 2, 0.0045) },
      {
        instantUtc: new Date("2026-03-03T11:05:00.000Z"),
        lunarShadow: {
          centerPositionAngleRadians: Math.PI / 2,
          centerSeparationRadians: 0.05,
          penumbralAngularRadiusRadians: 0.012,
          umbralAngularRadiusRadians: 0.008,
        },
        phase: undefined,
      },
    );

    const occultationMaximum = eventContact({
      moon: body(0, 1, 0.005),
      target: body(0, 1, null),
    });
    const occultationEvent = circumstances(
      "lunar-occultation",
      occultationMaximum,
      "occultation",
    );
    const occultationProjection =
      createEventSceneProjection(occultationEvent);
    const occultationOutsideSample = eventContact(
      {
        moon: body(0, 1, 0.005),
        // The point center remains inside the fixed extent, but its
        // marker envelope crosses the right edge.
        target: body(0, 1.0052, null),
      },
      {
        instantUtc: new Date("2026-04-01T10:04:00.000Z"),
        phase: undefined,
      },
    );

    expect(
      createEventSceneModel(
        solarEvent,
        solarOutsideSample,
        solarProjection,
      ),
    ).toMatchObject({
      angularScalePixelsPerRadian: null,
      fidelity: "unavailable",
      kind: "solar-eclipse",
    });
    expect(
      createEventSceneModel(
        lunarEvent,
        lunarOutsideSample,
        lunarProjection,
      ),
    ).toMatchObject({
      angularScalePixelsPerRadian: null,
      fidelity: "schematic",
      kind: "lunar-eclipse",
    });
    expect(
      createEventSceneModel(
        occultationEvent,
        occultationOutsideSample,
        occultationProjection,
      ),
    ).toMatchObject({
      angularScalePixelsPerRadian: null,
      fidelity: "unavailable",
      kind: "lunar-occultation",
    });
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

  it("labels a phase-less physical sample as a specified instant", () => {
    const maximum = eventContact({
      moon: body(0.4, 1.001, 0.005),
      sun: body(0.4, 1, 0.004),
    });
    const event = circumstances(
      "solar-eclipse",
      maximum,
      "partial",
    );
    const sample: EventSceneSample = {
      aboveHorizon: true,
      bodies: maximum.bodies,
      instantUtc: new Date("2026-08-12T18:31:00.000Z"),
      positionAngleRadians: null,
    };

    expect(createEventSceneModel(event, sample).sampleLabel).toBe(
      "指定時刻",
    );
    expect(createEventSceneModel(event, maximum).sampleLabel).toBe(
      "最大",
    );
  });
});
