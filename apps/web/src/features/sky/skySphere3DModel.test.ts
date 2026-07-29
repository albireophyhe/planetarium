import type { SkyStar } from "../../app/types";
import type { Constellation, TwilightPhase } from "../../domain";
import { describe, expect, it, vi } from "vitest";
import {
  DIRECTION_POINTS,
  INITIAL_CAMERA_POSITION,
  cameraOrbitDeltaForSphereNudge,
  createConstellationLineBuffers,
  createSkyPointBuffers,
  directionLabelVerticalOffsetPx,
  disposeSkySphereResources,
  findNearestScreenStar,
  horizontalToCartesian,
  isUndraggedPointer,
  labelLimitForViewport,
  magnitudeLimitForViewport,
  selectSkyLabelCandidates,
  solarMarkerOpacity,
  skySphereTheme,
  updateConstellationLineBuffers,
  updateSkyPointBuffers,
} from "./skySphere3DModel";

function expectPoint(
  actual: ReturnType<typeof horizontalToCartesian>,
  expected: { x: number; y: number; z: number },
) {
  expect(actual.x).toBeCloseTo(expected.x, 7);
  expect(actual.y).toBeCloseTo(expected.y, 7);
  expect(actual.z).toBeCloseTo(expected.z, 7);
}

function star(overrides: Partial<SkyStar> = {}): SkyStar {
  return {
    altitudeDeg: 35,
    azimuthDeg: 120,
    bvColor: 0.4,
    hr: 1,
    label: null,
    projectionX: 0,
    projectionY: 0,
    vMagnitude: 2,
    ...overrides,
  };
}

const TEST_CONSTELLATION: Constellation = {
  id: "Test",
  name: "Test",
  nameJa: "テスト座",
  segments: [
    [10, 20],
    [20, 30],
  ],
};

describe("SkySphere3D horizontal geometry", () => {
  it("reduces faint-star density at compact viewport sizes", () => {
    expect(magnitudeLimitForViewport(195, 195)).toBe(3);
    expect(magnitudeLimitForViewport(390, 390)).toBe(4.3);
    expect(magnitudeLimitForViewport(500, 500)).toBe(4.6);
    expect(magnitudeLimitForViewport(900, 600)).toBe(5);
  });

  it("maps the cardinal horizon and zenith to the documented axes", () => {
    expectPoint(horizontalToCartesian(0, 0), { x: 0, y: 1, z: 0 });
    expectPoint(horizontalToCartesian(0, 90), { x: 1, y: 0, z: 0 });
    expectPoint(horizontalToCartesian(0, 180), { x: 0, y: -1, z: 0 });
    expectPoint(horizontalToCartesian(0, 270), { x: -1, y: 0, z: 0 });
    expectPoint(horizontalToCartesian(90, 42), { x: 0, y: 0, z: 1 });
    expectPoint(horizontalToCartesian(-90, 42), { x: 0, y: 0, z: -1 });
  });

  it("labels all four horizon directions plus zenith and nadir", () => {
    expect(DIRECTION_POINTS.map(({ label }) => label)).toEqual([
      "北",
      "東",
      "南",
      "西",
      "天頂",
      "天底",
    ]);
    expect(DIRECTION_POINTS.map(({ position }) => position)).toEqual([
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ]);
    expect(INITIAL_CAMERA_POSITION).toEqual({
      x: 0,
      y: 0,
      z: 3.1,
    });
  });

  it("inverts camera-orbit nudges to match macOS sphere rotation", () => {
    const step = Math.PI / 18;
    expect(
      cameraOrbitDeltaForSphereNudge("rotate-left", step),
    ).toEqual({ leftRadians: -step, upRadians: 0 });
    expect(
      cameraOrbitDeltaForSphereNudge("rotate-right", step),
    ).toEqual({ leftRadians: step, upRadians: 0 });
    expect(
      cameraOrbitDeltaForSphereNudge("rotate-up", step),
    ).toEqual({ leftRadians: 0, upRadians: -step });
    expect(
      cameraOrbitDeltaForSphereNudge("rotate-down", step),
    ).toEqual({ leftRadians: 0, upRadians: step });
  });

  it("separates zenith and nadir labels responsively", () => {
    expect(directionLabelVerticalOffsetPx(200, 1)).toBeCloseTo(-14);
    expect(directionLabelVerticalOffsetPx(400, 1)).toBe(-28);
    expect(directionLabelVerticalOffsetPx(800, -1)).toBe(28);
    expect(directionLabelVerticalOffsetPx(400, 0)).toBe(-0);
    expect(
      directionLabelVerticalOffsetPx(Number.NaN, 1),
    ).toBeCloseTo(-14);
    expect(
      directionLabelVerticalOffsetPx(
        400,
        Number.POSITIVE_INFINITY,
      ),
    ).toBe(-0);
  });

  it("keeps the Sun visible while distinguishing horizon and camera hemispheres", () => {
    expect(solarMarkerOpacity(true, true)).toBe(1);
    expect(solarMarkerOpacity(true, false)).toBeCloseTo(0.58);
    expect(solarMarkerOpacity(false, true)).toBeCloseTo(0.34);
    expect(solarMarkerOpacity(false, false)).toBeCloseTo(0.1972);
  });

  it("reuses static buffers when only horizontal positions change", () => {
    const initialStars = [
      star({ hr: 10, altitudeDeg: 20, azimuthDeg: 30 }),
      star({ hr: 20, altitudeDeg: -5, azimuthDeg: 210 }),
    ];
    const initial = createSkyPointBuffers(initialStars);
    const positions = initial.positions;
    const colors = initial.colors;
    const sizes = initial.sizes;
    const hrs = initial.hrs;

    const update = updateSkyPointBuffers(initial, [
      { ...initialStars[0]!, altitudeDeg: 25, azimuthDeg: 34 },
      { ...initialStars[1]!, altitudeDeg: -7, azimuthDeg: 214 },
    ]);

    expect(update.catalogChanged).toBe(false);
    expect(update.appearanceChanged).toBe(false);
    expect(update.buffers.positions).toBe(positions);
    expect(update.buffers.colors).toBe(colors);
    expect(update.buffers.sizes).toBe(sizes);
    expect(update.buffers.hrs).toBe(hrs);
    expect(Array.from(update.buffers.positions)).not.toEqual(
      Array.from(createSkyPointBuffers(initialStars).positions),
    );
  });

  it("rebuilds buffers only when the HR catalogue layout changes", () => {
    const initial = createSkyPointBuffers([star({ hr: 10 })]);
    const update = updateSkyPointBuffers(initial, [star({ hr: 11 })]);

    expect(update.catalogChanged).toBe(true);
    expect(update.buffers.positions).not.toBe(initial.positions);
    expect(update.buffers.hrs[0]).toBe(11);
  });
});

describe("SkySphere3D constellation lines", () => {
  it("packs every available segment into one ordered position buffer", () => {
    const points = createSkyPointBuffers([
      star({ hr: 10, altitudeDeg: 0, azimuthDeg: 0 }),
      star({ hr: 20, altitudeDeg: 0, azimuthDeg: 90 }),
      star({ hr: 30, altitudeDeg: -90, azimuthDeg: 0 }),
    ]);
    const lines = createConstellationLineBuffers(
      [TEST_CONSTELLATION],
      points,
    );

    expect(lines.segmentCount).toBe(2);
    expect(Array.from(lines.endpointHrs)).toEqual([10, 20, 20, 30]);
    expect(Array.from(lines.positions)).toEqual([
      ...points.positions.slice(0, 3),
      ...points.positions.slice(3, 6),
      ...points.positions.slice(3, 6),
      ...points.positions.slice(6, 9),
    ]);
  });

  it("reuses the dynamic line buffer for time updates and rebuilds only its layout", () => {
    const initialPoints = createSkyPointBuffers([
      star({ hr: 10, altitudeDeg: 10, azimuthDeg: 10 }),
      star({ hr: 20, altitudeDeg: 20, azimuthDeg: 20 }),
      star({ hr: 30, altitudeDeg: 30, azimuthDeg: 30 }),
    ]);
    const initial = createConstellationLineBuffers(
      [TEST_CONSTELLATION],
      initialPoints,
    );
    const positions = initial.positions;
    const movedPoints = updateSkyPointBuffers(initialPoints, [
      star({ hr: 10, altitudeDeg: 11, azimuthDeg: 12 }),
      star({ hr: 20, altitudeDeg: 22, azimuthDeg: 24 }),
      star({ hr: 30, altitudeDeg: 33, azimuthDeg: 36 }),
    ]).buffers;
    const moved = updateConstellationLineBuffers(
      initial,
      [TEST_CONSTELLATION],
      movedPoints,
    );

    expect(moved.layoutChanged).toBe(false);
    expect(moved.buffers.positions).toBe(positions);
    expect(Array.from(moved.buffers.positions)).not.toEqual(
      Array.from(
        createConstellationLineBuffers(
          [TEST_CONSTELLATION],
          createSkyPointBuffers([
            star({ hr: 10, altitudeDeg: 10, azimuthDeg: 10 }),
            star({ hr: 20, altitudeDeg: 20, azimuthDeg: 20 }),
            star({ hr: 30, altitudeDeg: 30, azimuthDeg: 30 }),
          ]),
        ).positions,
      ),
    );

    const changed = updateConstellationLineBuffers(
      moved.buffers,
      [{ ...TEST_CONSTELLATION, segments: [[10, 30]] }],
      movedPoints,
    );
    expect(changed.layoutChanged).toBe(true);
    expect(changed.buffers.positions).not.toBe(positions);
    expect(Array.from(changed.buffers.endpointHrs)).toEqual([10, 30]);
  });

  it("drops segments whose endpoint is absent from the rendered catalog", () => {
    const lines = createConstellationLineBuffers(
      [TEST_CONSTELLATION],
      createSkyPointBuffers([
        star({ hr: 10 }),
        star({ hr: 20 }),
      ]),
    );
    expect(lines.segmentCount).toBe(1);
    expect(Array.from(lines.endpointHrs)).toEqual([10, 20]);
  });
});

describe("SkySphere3D labels and visual theme", () => {
  it("prioritizes the selected star, then at most eleven bright proper names", () => {
    const stars = Array.from({ length: 16 }, (_, index) =>
      star({
        hr: index + 1,
        label: index === 15 ? null : `星${index + 1}`,
        vMagnitude: index - 3,
      }),
    );
    const labels = selectSkyLabelCandidates(stars, 16);

    expect(labels).toHaveLength(12);
    expect(labels[0]).toEqual({
      hr: 16,
      label: "HR 16",
      vMagnitude: 12,
    });
    expect(labels.slice(1).map((candidate) => candidate.hr)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    );
  });

  it("reduces label density for narrow sky surfaces", () => {
    expect(labelLimitForViewport(195, 195)).toBe(1);
    expect(labelLimitForViewport(320, 320)).toBe(3);
    expect(labelLimitForViewport(390, 390)).toBe(6);
    expect(labelLimitForViewport(900, 600)).toBe(12);
  });

  it.each([
    ["day", 0x07182d],
    ["civil", 0x071528],
    ["nautical", 0x051122],
    ["astronomical", 0x041020],
    ["night", 0x030914],
  ] as const)("maps %s to the matching 2D outer sky color", (phase, color) => {
    expect(skySphereTheme(phase satisfies TwilightPhase, false)).toEqual(
      expect.objectContaining({ clearColor: color }),
    );
  });

  it("gives night-vision mode priority over twilight", () => {
    const themes = (
      ["day", "civil", "nautical", "astronomical", "night"] as const
    ).map((phase) => skySphereTheme(phase, true));
    expect(new Set(themes.map((theme) => theme.clearColor))).toEqual(
      new Set([0x050000]),
    );
    expect(themes.every((theme) => theme.className.includes("night"))).toBe(
      true,
    );
  });
});

describe("SkySphere3D resource lifecycle", () => {
  it("disposes point, line, horizon, and selection resources once", () => {
    const disposable = () => ({ dispose: vi.fn() });
    const resources: Parameters<typeof disposeSkySphereResources>[0] = {
      constellationGeometry: disposable(),
      constellationMaterial: disposable(),
      horizonGeometry: disposable(),
      horizonMaterial: disposable(),
      horizonRingGeometry: disposable(),
      horizonRingMaterial: disposable(),
      pointGeometry: disposable(),
      pointMaterial: disposable(),
      selectedGeometry: disposable(),
      selectedMaterial: disposable(),
      solarGeometry: disposable(),
      solarMaterial: disposable(),
      trackGeometry: disposable(),
      trackLineMaterial: disposable(),
      trackPointMaterial: disposable(),
    };

    disposeSkySphereResources(resources);

    for (const resource of Object.values(resources)) {
      expect(resource.dispose).toHaveBeenCalledTimes(1);
    }
  });
});

describe("SkySphere3D screen-space selection", () => {
  it("selects the nearest rendered point inside its hit radius", () => {
    const selected = findNearestScreenStar(
      [
        {
          depth: 0.2,
          hr: 1,
          magnitude: 2,
          pointSize: 4,
          x: 40,
          y: 40,
        },
        {
          depth: 0.1,
          hr: 2,
          magnitude: 3,
          pointSize: 4,
          x: 44,
          y: 40,
        },
      ],
      { x: 43, y: 40 },
    );

    expect(selected?.hr).toBe(2);
  });

  it("uses front-most depth, brightness, then HR as deterministic ties", () => {
    const base = {
      pointSize: 4,
      x: 40,
      y: 40,
    };

    expect(
      findNearestScreenStar(
        [
          { ...base, depth: 0.4, hr: 1, magnitude: 1 },
          { ...base, depth: -0.2, hr: 2, magnitude: 4 },
        ],
        { x: 40, y: 40 },
      )?.hr,
    ).toBe(2);

    expect(
      findNearestScreenStar(
        [
          { ...base, depth: -0.2, hr: 8, magnitude: 2 },
          { ...base, depth: -0.2, hr: 9, magnitude: 1 },
        ],
        { x: 40, y: 40 },
      )?.hr,
    ).toBe(9);

    expect(
      findNearestScreenStar(
        [
          { ...base, depth: -0.2, hr: 8, magnitude: 1 },
          { ...base, depth: -0.2, hr: 7, magnitude: 1 },
        ],
        { x: 40, y: 40 },
      )?.hr,
    ).toBe(7);
  });

  it("does not select outside the preview hit radius", () => {
    const selected = findNearestScreenStar(
      [
        {
          depth: 0,
          hr: 1,
          magnitude: 2,
          pointSize: 2,
          x: 20,
          y: 20,
        },
      ],
      { x: 29, y: 20 },
    );

    expect(selected).toBeNull();
  });

  it("distinguishes an intentional click from a camera drag", () => {
    expect(
      isUndraggedPointer({ x: 10, y: 10 }, { x: 13, y: 14 }),
    ).toBe(true);
    expect(
      isUndraggedPointer({ x: 10, y: 10 }, { x: 16, y: 10 }),
    ).toBe(false);
  });
});
