import type { SkyStar } from "../../app/types";
import type { Constellation, TwilightPhase } from "../../domain";

const DEGREES_TO_RADIANS = Math.PI / 180;
const PICK_DISTANCE_EPSILON = 0.0001;

export type CartesianPoint = {
  x: number;
  y: number;
  z: number;
};

export type SkyPointBuffers = {
  colors: Float32Array;
  hrs: Int32Array;
  indexByHr: ReadonlyMap<number, number>;
  magnitudes: Float32Array;
  positions: Float32Array;
  sizes: Float32Array;
};

export type SkyPointBufferUpdate = {
  appearanceChanged: boolean;
  buffers: SkyPointBuffers;
  catalogChanged: boolean;
};

export type SkyConstellationLineBuffers = {
  /** HR endpoint for each position triplet, preserving segment order. */
  endpointHrs: Int32Array;
  positions: Float32Array;
  segmentCount: number;
};

export type SkyConstellationLineBufferUpdate = {
  buffers: SkyConstellationLineBuffers;
  layoutChanged: boolean;
};

export type SkyLabelCandidate = {
  hr: number;
  label: string;
  vMagnitude: number;
};

export type SkySphereTheme = {
  className: string;
  clearColor: number;
};

export type SkySphereDisposableResources = {
  constellationGeometry: { dispose: () => void };
  constellationMaterial: { dispose: () => void };
  horizonGeometry: { dispose: () => void };
  horizonMaterial: { dispose: () => void };
  horizonRingGeometry: { dispose: () => void };
  horizonRingMaterial: { dispose: () => void };
  pointGeometry: { dispose: () => void };
  pointMaterial: { dispose: () => void };
  selectedGeometry: { dispose: () => void };
  selectedMaterial: { dispose: () => void };
  solarGeometry: { dispose: () => void };
  solarMaterial: { dispose: () => void };
  trackGeometry: { dispose: () => void };
  trackLineMaterial: { dispose: () => void };
  trackPointMaterial: { dispose: () => void };
};

export type ScreenStarCandidate = {
  depth: number;
  hr: number;
  magnitude: number;
  pointSize: number;
  x: number;
  y: number;
};

export type ScreenPoint = {
  x: number;
  y: number;
};

export const DIRECTION_POINTS = [
  { label: "北", position: { x: 0, y: 1, z: 0 } },
  { label: "東", position: { x: 1, y: 0, z: 0 } },
  { label: "南", position: { x: 0, y: -1, z: 0 } },
  { label: "西", position: { x: -1, y: 0, z: 0 } },
  { label: "天頂", position: { x: 0, y: 0, z: 1 } },
  { label: "天底", position: { x: 0, y: 0, z: -1 } },
] as const;

/** macOS identity orientation: camera looks straight down the +Z (zenith) axis. */
export const INITIAL_CAMERA_POSITION = {
  x: 0,
  y: 0,
  z: 3.1,
} as const;

/**
 * Separates zenith and nadir labels from the sphere center without pushing
 * either label too far toward the horizon on a very small viewport.
 */
export function directionLabelVerticalOffsetPx(
  frameHeight: number,
  directionZ: number,
) {
  const safeHeight =
    Number.isFinite(frameHeight) && frameHeight > 0 ? frameHeight : 200;
  const safeDirectionZ = Number.isFinite(directionZ)
    ? Math.max(-1, Math.min(1, directionZ))
    : 0;
  const magnitude = Math.max(14, Math.min(28, safeHeight * 0.07));
  return -safeDirectionZ * magnitude;
}

export type SphereRotationNudge =
  | "rotate-down"
  | "rotate-left"
  | "rotate-right"
  | "rotate-up";

/**
 * OrbitControls moves the camera, while macOS rotates the sphere quaternion.
 * Invert the camera orbit so each arrow moves the sky in the same direction.
 */
export function cameraOrbitDeltaForSphereNudge(
  command: SphereRotationNudge,
  radians: number,
) {
  const step = Number.isFinite(radians) ? Math.abs(radians) : 0;
  switch (command) {
    case "rotate-left":
      return { leftRadians: -step, upRadians: 0 };
    case "rotate-right":
      return { leftRadians: step, upRadians: 0 };
    case "rotate-up":
      return { leftRadians: 0, upRadians: -step };
    case "rotate-down":
      return { leftRadians: 0, upRadians: step };
  }
}

const TWILIGHT_THEMES: Record<TwilightPhase, SkySphereTheme> = {
  day: {
    className: "sky-sphere3d--twilight-day",
    clearColor: 0x07182d,
  },
  civil: {
    className: "sky-sphere3d--twilight-civil",
    clearColor: 0x071528,
  },
  nautical: {
    className: "sky-sphere3d--twilight-nautical",
    clearColor: 0x051122,
  },
  astronomical: {
    className: "sky-sphere3d--twilight-astronomical",
    clearColor: 0x041020,
  },
  night: {
    className: "sky-sphere3d--twilight-night",
    clearColor: 0x030914,
  },
};

const NIGHT_VISION_THEME: SkySphereTheme = {
  className: "sky-sphere3d--night",
  clearColor: 0x050000,
};

export function skySphereTheme(
  twilight: TwilightPhase,
  nightMode: boolean,
): SkySphereTheme {
  return nightMode ? NIGHT_VISION_THEME : TWILIGHT_THEMES[twilight];
}

export function labelLimitForViewport(width: number, height: number) {
  const extent = Math.min(finiteOr(width, 0), finiteOr(height, 0));
  if (extent < 260) return 1;
  if (extent < 360) return 3;
  if (extent < 520) return 6;
  return 12;
}

/**
 * Keep the selected star first, then the brightest named stars. The caller
 * performs camera/frustum/collision filtering from this bounded candidate
 * set, so the DOM overlay never exceeds twelve labels.
 */
export function selectSkyLabelCandidates(
  stars: readonly SkyStar[],
  selectedHr: number | null,
): readonly SkyLabelCandidate[] {
  const selected =
    selectedHr === null
      ? undefined
      : stars.find((star) => star.hr === selectedHr);
  const result: SkyLabelCandidate[] = [];
  if (selected) {
    result.push({
      hr: selected.hr,
      label: selected.label ?? `HR ${selected.hr}`,
      vMagnitude: selected.vMagnitude,
    });
  }

  const availableNamedSlots = 12 - result.length;
  const named: SkyLabelCandidate[] = [];
  for (const star of stars) {
    if (
      star.label === null ||
      star.hr === selectedHr ||
      !Number.isFinite(star.vMagnitude)
    ) {
      continue;
    }
    const candidate = {
      hr: star.hr,
      label: star.label,
      vMagnitude: star.vMagnitude,
    };
    const insertionIndex = named.findIndex(
      (current) =>
        candidate.vMagnitude < current.vMagnitude ||
        (candidate.vMagnitude === current.vMagnitude &&
          candidate.hr < current.hr),
    );
    if (insertionIndex >= 0) {
      named.splice(insertionIndex, 0, candidate);
    } else if (named.length < availableNamedSlots) {
      named.push(candidate);
    }
    if (named.length > availableNamedSlots) {
      named.pop();
    }
  }
  result.push(...named);
  return result;
}

/**
 * Keep the celestial sphere legible at compact responsive sizes while the
 * authoritative star catalogue stays unchanged.
 */
export function magnitudeLimitForViewport(
  width: number,
  height: number,
) {
  const extent = Math.min(
    finiteOr(width, 0),
    finiteOr(height, 0),
  );
  if (extent < 220) return 3;
  if (extent < 420) return 4.3;
  if (extent < 560) return 4.6;
  return 5;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Maps authoritative horizontal coordinates to a unit sphere.
 *
 * +X is east, +Y is north, and +Z is the zenith. This makes a default
 * zenith-facing camera read north-up and east-right without another
 * coordinate conversion.
 */
export function horizontalToCartesian(
  altitudeDeg: number,
  azimuthDeg: number,
  radius = 1,
): CartesianPoint {
  const altitude = finiteOr(altitudeDeg, 0) * DEGREES_TO_RADIANS;
  const azimuth = finiteOr(azimuthDeg, 0) * DEGREES_TO_RADIANS;
  const horizontalRadius = Math.cos(altitude) * finiteOr(radius, 1);

  return {
    x: horizontalRadius * Math.sin(azimuth),
    y: horizontalRadius * Math.cos(azimuth),
    z: Math.sin(altitude) * finiteOr(radius, 1),
  };
}

export function solarMarkerOpacity(
  isAboveHorizon: boolean,
  isFrontHemisphere: boolean,
) {
  const horizonOpacity = isAboveHorizon ? 1 : 0.34;
  const hemisphereOpacity = isFrontHemisphere ? 1 : 0.58;
  return horizonOpacity * hemisphereOpacity;
}

export function starPointSize(vMagnitude: number) {
  const magnitude = finiteOr(vMagnitude, 6.5);
  return clamp(2.2 + (6.5 - magnitude) * 0.72, 1.5, 9.5);
}

function writeStarColor(
  target: Float32Array,
  offset: number,
  bvColor: number | null,
) {
  if (bvColor === null || !Number.isFinite(bvColor)) {
    target[offset] = 0.969;
    target[offset + 1] = 0.949;
    target[offset + 2] = 0.906;
    return;
  }

  if (bvColor < 0) {
    target[offset] = 0.863;
    target[offset + 1] = 0.925;
    target[offset + 2] = 1;
    return;
  }

  if (bvColor > 1.35) {
    target[offset] = 1;
    target[offset + 1] = 0.843;
    target[offset + 2] = 0.647;
    return;
  }

  if (bvColor > 0.75) {
    target[offset] = 1;
    target[offset + 1] = 0.914;
    target[offset + 2] = 0.78;
    return;
  }

  target[offset] = 1;
  target[offset + 1] = 0.961;
  target[offset + 2] = 0.867;
}

function writeStarPosition(
  target: Float32Array,
  offset: number,
  star: SkyStar,
) {
  const position = horizontalToCartesian(
    star.altitudeDeg,
    star.azimuthDeg,
  );
  target[offset] = position.x;
  target[offset + 1] = position.y;
  target[offset + 2] = position.z;
}

export function createSkyPointBuffers(
  stars: readonly SkyStar[],
): SkyPointBuffers {
  const positions = new Float32Array(stars.length * 3);
  const colors = new Float32Array(stars.length * 3);
  const sizes = new Float32Array(stars.length);
  const hrs = new Int32Array(stars.length);
  const magnitudes = new Float32Array(stars.length);
  const indexByHr = new Map<number, number>();

  for (let index = 0; index < stars.length; index += 1) {
    const star = stars[index];
    if (!star) {
      continue;
    }
    const colorOffset = index * 3;
    writeStarPosition(positions, colorOffset, star);
    writeStarColor(colors, colorOffset, star.bvColor);
    sizes[index] = starPointSize(star.vMagnitude);
    hrs[index] = star.hr;
    magnitudes[index] = star.vMagnitude;
    indexByHr.set(star.hr, index);
  }

  return {
    colors,
    hrs,
    indexByHr,
    magnitudes,
    positions,
    sizes,
  };
}

function constellationEndpointHrs(
  constellations: readonly Constellation[],
  stars: SkyPointBuffers,
) {
  const endpointHrs: number[] = [];
  for (const constellation of constellations) {
    for (const [firstHr, secondHr] of constellation.segments) {
      if (
        stars.indexByHr.has(firstHr) &&
        stars.indexByHr.has(secondHr)
      ) {
        endpointHrs.push(firstHr, secondHr);
      }
    }
  }
  return endpointHrs;
}

function writeConstellationLinePositions(
  target: Float32Array,
  endpointHrs: ArrayLike<number>,
  stars: SkyPointBuffers,
) {
  for (
    let endpointIndex = 0;
    endpointIndex < endpointHrs.length;
    endpointIndex += 1
  ) {
    const hr = endpointHrs[endpointIndex];
    const starIndex = hr === undefined ? undefined : stars.indexByHr.get(hr);
    if (starIndex === undefined) {
      continue;
    }
    const sourceOffset = starIndex * 3;
    const targetOffset = endpointIndex * 3;
    target[targetOffset] = stars.positions[sourceOffset] ?? 0;
    target[targetOffset + 1] = stars.positions[sourceOffset + 1] ?? 0;
    target[targetOffset + 2] = stars.positions[sourceOffset + 2] ?? 0;
  }
}

export function createConstellationLineBuffers(
  constellations: readonly Constellation[],
  stars: SkyPointBuffers,
): SkyConstellationLineBuffers {
  const endpoints = constellationEndpointHrs(constellations, stars);
  const endpointHrs = Int32Array.from(endpoints);
  const positions = new Float32Array(endpointHrs.length * 3);
  writeConstellationLinePositions(positions, endpointHrs, stars);
  return {
    endpointHrs,
    positions,
    segmentCount: endpointHrs.length / 2,
  };
}

function sameEndpointLayout(
  current: Int32Array,
  next: readonly number[],
) {
  if (current.length !== next.length) {
    return false;
  }
  for (let index = 0; index < next.length; index += 1) {
    if (current[index] !== next[index]) {
      return false;
    }
  }
  return true;
}

export function updateConstellationLineBuffers(
  current: SkyConstellationLineBuffers,
  constellations: readonly Constellation[],
  stars: SkyPointBuffers,
): SkyConstellationLineBufferUpdate {
  const endpoints = constellationEndpointHrs(constellations, stars);
  if (!sameEndpointLayout(current.endpointHrs, endpoints)) {
    return {
      buffers: createConstellationLineBuffers(constellations, stars),
      layoutChanged: true,
    };
  }
  writeConstellationLinePositions(
    current.positions,
    current.endpointHrs,
    stars,
  );
  return { buffers: current, layoutChanged: false };
}

export function disposeSkySphereResources(
  resources: SkySphereDisposableResources,
) {
  resources.pointGeometry.dispose();
  resources.pointMaterial.dispose();
  resources.constellationGeometry.dispose();
  resources.constellationMaterial.dispose();
  resources.horizonGeometry.dispose();
  resources.horizonMaterial.dispose();
  resources.horizonRingGeometry.dispose();
  resources.horizonRingMaterial.dispose();
  resources.selectedGeometry.dispose();
  resources.selectedMaterial.dispose();
  resources.solarGeometry.dispose();
  resources.solarMaterial.dispose();
  resources.trackGeometry.dispose();
  resources.trackLineMaterial.dispose();
  resources.trackPointMaterial.dispose();
}

export function hasCompatibleStarCatalog(
  buffers: SkyPointBuffers,
  stars: readonly SkyStar[],
) {
  if (buffers.hrs.length !== stars.length) {
    return false;
  }

  for (let index = 0; index < stars.length; index += 1) {
    if (buffers.hrs[index] !== stars[index]?.hr) {
      return false;
    }
  }

  return true;
}

/**
 * Reuses every typed array while the catalogue HR ordering is unchanged.
 * The horizontal position is always refreshed; appearance is touched only
 * when static catalogue metadata actually differs.
 */
export function updateSkyPointBuffers(
  current: SkyPointBuffers,
  stars: readonly SkyStar[],
): SkyPointBufferUpdate {
  if (!hasCompatibleStarCatalog(current, stars)) {
    return {
      appearanceChanged: true,
      buffers: createSkyPointBuffers(stars),
      catalogChanged: true,
    };
  }

  let appearanceChanged = false;
  const nextColor = new Float32Array(3);

  for (let index = 0; index < stars.length; index += 1) {
    const star = stars[index];
    if (!star) {
      continue;
    }
    const offset = index * 3;
    writeStarPosition(current.positions, offset, star);

    const nextSize = Math.fround(starPointSize(star.vMagnitude));
    const nextMagnitude = Math.fround(star.vMagnitude);
    writeStarColor(nextColor, 0, star.bvColor);
    if (
      current.sizes[index] !== nextSize ||
      current.magnitudes[index] !== nextMagnitude ||
      current.colors[offset] !== nextColor[0] ||
      current.colors[offset + 1] !== nextColor[1] ||
      current.colors[offset + 2] !== nextColor[2]
    ) {
      current.sizes[index] = nextSize;
      current.magnitudes[index] = nextMagnitude;
      current.colors[offset] = nextColor[0] ?? 1;
      current.colors[offset + 1] = nextColor[1] ?? 1;
      current.colors[offset + 2] = nextColor[2] ?? 1;
      appearanceChanged = true;
    }
  }

  return {
    appearanceChanged,
    buffers: current,
    catalogChanged: false,
  };
}

export function findNearestScreenStar(
  candidates: readonly ScreenStarCandidate[],
  pointer: ScreenPoint,
  hitPadding = 5,
): ScreenStarCandidate | null {
  let nearest: ScreenStarCandidate | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (
      !Number.isFinite(candidate.x) ||
      !Number.isFinite(candidate.y) ||
      !Number.isFinite(candidate.depth)
    ) {
      continue;
    }

    const radius = Math.max(8, candidate.pointSize / 2 + hitPadding);
    const deltaX = candidate.x - pointer.x;
    const deltaY = candidate.y - pointer.y;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared > radius * radius) {
      continue;
    }
    if (nearest === null) {
      nearest = candidate;
      nearestDistanceSquared = distanceSquared;
      continue;
    }

    const distanceDelta = distanceSquared - nearestDistanceSquared;
    const isCloser = distanceDelta < -PICK_DISTANCE_EPSILON;
    const isSameDistance =
      Math.abs(distanceDelta) <= PICK_DISTANCE_EPSILON;
    const isInFront =
      isSameDistance &&
      candidate.depth < nearest.depth - PICK_DISTANCE_EPSILON;
    const isSameDepth =
      isSameDistance &&
      Math.abs(candidate.depth - nearest.depth) <=
        PICK_DISTANCE_EPSILON;
    const isBrighter =
      isSameDepth &&
      candidate.magnitude < nearest.magnitude;
    const hasLowerHr =
      isSameDepth &&
      candidate.magnitude === nearest.magnitude &&
      candidate.hr < nearest.hr;

    if (
      isCloser ||
      isInFront ||
      isBrighter ||
      hasLowerHr
    ) {
      nearest = candidate;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearest;
}

export function isUndraggedPointer(
  start: ScreenPoint,
  end: ScreenPoint,
  maximumDistance = 5,
) {
  return Math.hypot(end.x - start.x, end.y - start.y) <= maximumDistance;
}
