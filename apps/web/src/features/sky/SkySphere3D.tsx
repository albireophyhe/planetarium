import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Line,
  LineBasicMaterial,
  LineSegments,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type {
  SelectedStarTrack,
  SkySolarPosition,
  SkyStar,
} from "../../app/types";
import {
  formatAzimuthDegrees,
  formatSignedDegrees,
} from "../../app/astronomicalFormatting";
import type { Constellation, TwilightPhase } from "../../domain";
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
  type SkyConstellationLineBuffers,
  type SkyLabelCandidate,
  type ScreenStarCandidate,
  type SkyPointBuffers,
  updateConstellationLineBuffers,
  updateSkyPointBuffers,
} from "./skySphere3DModel";
import {
  createOnDemandFrameScheduler,
  type OnDemandFrameScheduler,
} from "./onDemandFrameScheduler";
import {
  createSkyTrackBuffers,
  type SkyTrackBuffers,
  updateSkyTrackBuffers,
} from "./skyTrackModel";
import { skyDevicePixelRatio } from "./pixelRatio";
import "./SkySphere3D.css";

const CAMERA_HALF_EXTENT = 1.18;
const CAMERA_ROTATION_STEP = Math.PI / 15;
const SELECTED_RING_RADIUS_PX = 13;

const STAR_VERTEX_SHADER = `
  attribute vec3 starColor;
  attribute float starMagnitude;
  attribute float pointSize;

  uniform float devicePixelRatio;

  varying vec3 vStarColor;
  varying float vStarMagnitude;
  varying float vHorizonOpacity;
  varying float vHemisphereOpacity;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 sphereCenter = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = max(1.0, pointSize * devicePixelRatio);
    vStarColor = starColor;
    vStarMagnitude = starMagnitude;
    vHorizonOpacity = position.z >= -0.0001 ? 1.0 : 0.2;
    vHemisphereOpacity =
      viewPosition.z >= sphereCenter.z ? 1.0 : 0.42;
  }
`;

const STAR_FRAGMENT_SHADER = `
  uniform float magnitudeLimit;
  uniform float nightMode;

  varying vec3 vStarColor;
  varying float vStarMagnitude;
  varying float vHorizonOpacity;
  varying float vHemisphereOpacity;

  void main() {
    if (vStarMagnitude > magnitudeLimit) {
      discard;
    }
    float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (radius > 1.0) {
      discard;
    }

    float edge = 1.0 - smoothstep(0.58, 1.0, radius);
    float core = 1.0 - smoothstep(0.0, 0.42, radius);
    float alpha =
      max(edge, core * 0.92) *
      vHorizonOpacity *
      vHemisphereOpacity;
    vec3 redSafeColor = vec3(
      max(vStarColor.r, 0.82),
      min(vStarColor.g, 0.34),
      min(vStarColor.b, 0.29)
    );
    vec3 renderedColor = mix(vStarColor, redSafeColor, nightMode);

    gl_FragColor = vec4(renderedColor, alpha);
  }
`;

const CONSTELLATION_VERTEX_SHADER = `
  varying float vHorizonOpacity;
  varying float vHemisphereOpacity;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 sphereCenter = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    vHorizonOpacity = position.z >= -0.0001 ? 1.0 : 0.36;
    vHemisphereOpacity =
      viewPosition.z >= sphereCenter.z ? 1.0 : 0.52;
  }
`;

const CONSTELLATION_FRAGMENT_SHADER = `
  uniform float nightMode;

  varying float vHorizonOpacity;
  varying float vHemisphereOpacity;

  void main() {
    vec3 normalColor = vec3(0.314, 0.616, 0.922);
    vec3 redSafeColor = vec3(0.80, 0.286, 0.263);
    vec3 renderedColor = mix(normalColor, redSafeColor, nightMode);
    float baseAlpha = mix(0.62, 0.58, nightMode);
    gl_FragColor = vec4(
      renderedColor,
      baseAlpha * vHorizonOpacity * vHemisphereOpacity
    );
  }
`;

const TRACK_LINE_VERTEX_SHADER = `
  attribute float trackProgress;

  varying float vHorizonOpacity;
  varying float vHemisphereOpacity;
  varying float vTrackProgress;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 sphereCenter = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    vHorizonOpacity = position.z >= -0.0001 ? 1.0 : 0.36;
    vHemisphereOpacity =
      viewPosition.z >= sphereCenter.z ? 1.0 : 0.52;
    vTrackProgress = trackProgress;
  }
`;

const TRACK_LINE_FRAGMENT_SHADER = `
  uniform float nightMode;

  varying float vHorizonOpacity;
  varying float vHemisphereOpacity;
  varying float vTrackProgress;

  void main() {
    vec3 pastColor = mix(
      vec3(0.36, 0.66, 0.94),
      vec3(0.68, 0.20, 0.17),
      nightMode
    );
    vec3 futureColor = mix(
      vec3(0.70, 0.86, 1.0),
      vec3(0.98, 0.43, 0.38),
      nightMode
    );
    float alpha = 0.52 + vTrackProgress * 0.36;
    gl_FragColor = vec4(
      mix(pastColor, futureColor, vTrackProgress),
      alpha * vHorizonOpacity * vHemisphereOpacity
    );
  }
`;

const TRACK_POINT_VERTEX_SHADER = `
  attribute float pointSize;
  attribute float trackProgress;

  uniform float devicePixelRatio;

  varying float vHorizonOpacity;
  varying float vHemisphereOpacity;
  varying float vTrackProgress;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 sphereCenter = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = max(1.0, pointSize * devicePixelRatio);
    vHorizonOpacity = position.z >= -0.0001 ? 1.0 : 0.36;
    vHemisphereOpacity =
      viewPosition.z >= sphereCenter.z ? 1.0 : 0.52;
    vTrackProgress = trackProgress;
  }
`;

const TRACK_POINT_FRAGMENT_SHADER = `
  uniform float nightMode;

  varying float vHorizonOpacity;
  varying float vHemisphereOpacity;
  varying float vTrackProgress;

  void main() {
    float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (radius > 1.0) {
      discard;
    }
    vec3 pastColor = mix(
      vec3(0.36, 0.66, 0.94),
      vec3(0.68, 0.20, 0.17),
      nightMode
    );
    vec3 futureColor = mix(
      vec3(0.70, 0.86, 1.0),
      vec3(0.98, 0.43, 0.38),
      nightMode
    );
    float edge = 1.0 - smoothstep(0.62, 1.0, radius);
    float alpha =
      edge *
      (0.78 + vTrackProgress * 0.20) *
      vHorizonOpacity *
      vHemisphereOpacity;
    gl_FragColor = vec4(
      mix(pastColor, futureColor, vTrackProgress),
      alpha
    );
  }
`;

export type SkySphere3DProps = {
  constellationLines: boolean;
  constellations: readonly Constellation[];
  nightMode: boolean;
  onReady: () => void;
  onSelect: (hr: number) => void;
  onUnavailable: (message: string) => void;
  selectedHr: number | null;
  selectedStarTrack: SelectedStarTrack | null;
  solarPosition: SkySolarPosition;
  starLabels: boolean;
  stars: readonly SkyStar[];
  trackDescriptionId?: string;
  twilight: TwilightPhase;
};

type CameraCommand =
  | "reset"
  | "rotate-down"
  | "rotate-left"
  | "rotate-right"
  | "rotate-up"
  | "zoom-in"
  | "zoom-out";

const CAMERA_ICONS = {
  reset: RotateCcwIcon,
  "rotate-down": ArrowDownIcon,
  "rotate-left": ArrowLeftIcon,
  "rotate-right": ArrowRightIcon,
  "rotate-up": ArrowUpIcon,
  "zoom-in": PlusIcon,
  "zoom-out": MinusIcon,
} as const satisfies Record<CameraCommand, typeof ArrowUpIcon>;

type PointerStart = {
  pointerId: number;
  x: number;
  y: number;
};

type CallbackSet = Pick<
  SkySphere3DProps,
  "onReady" | "onSelect" | "onUnavailable"
>;

type SkySphereRuntime = {
  camera: OrthographicCamera;
  cardinalElements: readonly (HTMLSpanElement | null)[];
  constellationData: SkyConstellationLineBuffers;
  constellationGeometry: BufferGeometry;
  constellationLineObject: LineSegments<
    BufferGeometry,
    ShaderMaterial
  >;
  constellationLines: boolean;
  constellationMaterial: ShaderMaterial;
  constellationPositionAttribute: BufferAttribute;
  constellations: readonly Constellation[];
  contextLost: boolean;
  controls: OrbitControls<OrthographicCamera>;
  data: SkyPointBuffers;
  frameHeight: number;
  frameWidth: number;
  geometry: BufferGeometry;
  horizonMaterial: MeshBasicMaterial;
  horizonRingMaterial: LineBasicMaterial;
  nightMode: boolean;
  pointColorAttribute: BufferAttribute;
  pointMagnitudeAttribute: BufferAttribute;
  pointMaterial: ShaderMaterial;
  pointPositionAttribute: BufferAttribute;
  pointSizeAttribute: BufferAttribute;
  renderer: WebGLRenderer;
  renderable: boolean;
  responsiveMagnitudeLimit: number;
  scene: Scene;
  scheduler: OnDemandFrameScheduler;
  selectedHr: number | null;
  selectedMaterial: MeshBasicMaterial;
  selectedRing: Mesh<RingGeometry, MeshBasicMaterial>;
  selectedStarTrack: SelectedStarTrack | null;
  solarMarker: Mesh<CircleGeometry, MeshBasicMaterial>;
  solarLabelElement: HTMLSpanElement | null;
  solarMaterial: MeshBasicMaterial;
  solarPosition: SkySolarPosition;
  starLabelElements: Map<number, HTMLSpanElement>;
  starLabelHrs: readonly number[];
  starLabels: boolean;
  stars: readonly SkyStar[];
  trackData: SkyTrackBuffers;
  trackGeometry: BufferGeometry;
  trackLineMaterial: ShaderMaterial;
  trackLineObject: Line<BufferGeometry, ShaderMaterial>;
  trackPointMaterial: ShaderMaterial;
  trackPointObject: Points<BufferGeometry, ShaderMaterial>;
  trackPointSizeAttribute: BufferAttribute;
  trackPositionAttribute: BufferAttribute;
  trackProgressAttribute: BufferAttribute;
  temporaryCenterVector: Vector3;
  temporaryVector: Vector3;
  twilight: TwilightPhase;
};

function createPointAttributes(data: SkyPointBuffers) {
  return {
    color: new BufferAttribute(data.colors, 3),
    magnitude: new BufferAttribute(data.magnitudes, 1),
    position: new BufferAttribute(data.positions, 3).setUsage(
      DynamicDrawUsage,
    ),
    size: new BufferAttribute(data.sizes, 1),
  };
}

function createConstellationPositionAttribute(
  data: SkyConstellationLineBuffers,
) {
  return new BufferAttribute(data.positions, 3).setUsage(
    DynamicDrawUsage,
  );
}

function createTrackAttributes(data: SkyTrackBuffers) {
  return {
    pointSize: new BufferAttribute(data.pointSizes, 1).setUsage(
      DynamicDrawUsage,
    ),
    position: new BufferAttribute(data.positions, 3).setUsage(
      DynamicDrawUsage,
    ),
    progress: new BufferAttribute(data.progresses, 1).setUsage(
      DynamicDrawUsage,
    ),
  };
}

function createHorizonRingGeometry() {
  const points: Vector3[] = [];
  const segments = 128;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(new Vector3(Math.sin(angle), Math.cos(angle), 0));
  }
  return new BufferGeometry().setFromPoints(points);
}

function applySkyTheme(
  runtime: SkySphereRuntime,
  twilight: TwilightPhase,
  nightMode: boolean,
) {
  runtime.nightMode = nightMode;
  runtime.twilight = twilight;
  runtime.pointMaterial.uniforms.nightMode!.value = nightMode ? 1 : 0;
  runtime.constellationMaterial.uniforms.nightMode!.value =
    nightMode ? 1 : 0;
  runtime.trackLineMaterial.uniforms.nightMode!.value =
    nightMode ? 1 : 0;
  runtime.trackPointMaterial.uniforms.nightMode!.value =
    nightMode ? 1 : 0;
  runtime.renderer.setClearColor(
    skySphereTheme(twilight, nightMode).clearColor,
    0,
  );

  runtime.horizonMaterial.color.set(nightMode ? 0x4e0908 : 0x12345b);
  runtime.horizonMaterial.opacity = nightMode ? 0.13 : 0.16;
  runtime.horizonRingMaterial.color.set(
    nightMode ? 0xd7544b : 0x7fbfff,
  );
  runtime.selectedMaterial.color.set(nightMode ? 0xf06d63 : 0x8bc8ff);
  runtime.solarMaterial.color.set(nightMode ? 0xe8756d : 0xffd16a);
}

function updateCardinalLabels(runtime: SkySphereRuntime) {
  const { camera, cardinalElements, frameHeight, frameWidth } = runtime;
  const centerDepth = runtime.temporaryVector
    .set(0, 0, 0)
    .project(camera).z;
  for (let index = 0; index < DIRECTION_POINTS.length; index += 1) {
    const direction = DIRECTION_POINTS[index];
    const element = cardinalElements[index];
    if (!direction || !element) {
      continue;
    }

    const projected = runtime.temporaryVector
      .set(
        direction.position.x * 1.08,
        direction.position.y * 1.08,
        direction.position.z * 1.08,
      )
      .project(camera);
    const x = (projected.x * 0.5 + 0.5) * frameWidth;
    const y = (-projected.y * 0.5 + 0.5) * frameHeight;
    const isVisible =
      projected.z >= -1 &&
      projected.z <= 1 &&
      x >= -20 &&
      x <= frameWidth + 20 &&
      y >= -20 &&
      y <= frameHeight + 20;
    const verticalOffset = directionLabelVerticalOffsetPx(
      frameHeight,
      direction.position.z,
    );
    const depthOpacity = projected.z <= centerDepth ? 1 : 0.44;

    element.style.opacity = isVisible ? String(depthOpacity) : "0";
    element.style.transform =
      `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) ` +
      `translate(-50%, calc(-50% + ${verticalOffset}px))`;
  }
}

type LabelBounds = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

function boundsOverlap(left: LabelBounds, right: LabelBounds) {
  return !(
    left.right + 4 < right.left ||
    left.left > right.right + 4 ||
    left.bottom + 3 < right.top ||
    left.top > right.bottom + 3
  );
}

function updateStarLabels(runtime: SkySphereRuntime) {
  const {
    camera,
    frameHeight,
    frameWidth,
    starLabelElements,
    starLabelHrs,
  } = runtime;
  const labelLimit = labelLimitForViewport(frameWidth, frameHeight);
  const occupied: LabelBounds[] = [];
  let visibleCount = 0;

  runtime.temporaryCenterVector.set(0, 0, 0);
  camera.worldToLocal(runtime.temporaryCenterVector);
  const centerDepth = runtime.temporaryCenterVector.z;

  for (const hr of starLabelHrs) {
    const element = starLabelElements.get(hr);
    const starIndex = runtime.data.indexByHr.get(hr);
    if (
      !element ||
      starIndex === undefined ||
      !runtime.starLabels ||
      visibleCount >= labelLimit
    ) {
      if (element) {
        element.hidden = true;
      }
      continue;
    }

    const offset = starIndex * 3;
    const positionX = runtime.data.positions[offset];
    const positionY = runtime.data.positions[offset + 1];
    const positionZ = runtime.data.positions[offset + 2];
    if (
      positionX === undefined ||
      positionY === undefined ||
      positionZ === undefined
    ) {
      element.hidden = true;
      continue;
    }

    runtime.temporaryVector.set(positionX, positionY, positionZ);
    camera.worldToLocal(runtime.temporaryVector);
    const isFrontHemisphere =
      runtime.temporaryVector.z >= centerDepth;
    runtime.temporaryVector
      .set(positionX, positionY, positionZ)
      .project(camera);
    const x =
      (runtime.temporaryVector.x * 0.5 + 0.5) * frameWidth;
    const y =
      (-runtime.temporaryVector.y * 0.5 + 0.5) * frameHeight;
    const isSelected = hr === runtime.selectedHr;
    const inView =
      runtime.temporaryVector.z >= -1 &&
      runtime.temporaryVector.z <= 1 &&
      x >= 8 &&
      x <= frameWidth - 8 &&
      y >= 8 &&
      y <= frameHeight - 8;
    if (!inView || (!isFrontHemisphere && !isSelected)) {
      element.hidden = true;
      continue;
    }

    const placeLeft = x > frameWidth * 0.64;
    const measuredWidth = Math.max(
      element.offsetWidth,
      element.textContent?.length ? element.textContent.length * 12 : 24,
    );
    const measuredHeight = Math.max(element.offsetHeight, 20);
    const labelX = x + (placeLeft ? -10 : 10);
    const bounds: LabelBounds = {
      bottom: y + measuredHeight / 2,
      left: placeLeft ? labelX - measuredWidth : labelX,
      right: placeLeft ? labelX : labelX + measuredWidth,
      top: y - measuredHeight / 2,
    };
    if (
      !isSelected &&
      occupied.some((candidate) => boundsOverlap(bounds, candidate))
    ) {
      element.hidden = true;
      continue;
    }

    element.hidden = false;
    element.dataset.hemisphere = isFrontHemisphere ? "front" : "back";
    element.dataset.horizon = positionZ >= 0 ? "above" : "below";
    element.style.transform =
      `translate3d(${Math.round(labelX)}px, ${Math.round(y)}px, 0) ` +
      `translate(${placeLeft ? "-100%" : "0"}, -50%)`;
    occupied.push(bounds);
    visibleCount += 1;
  }
}

function updateSelectedRing(runtime: SkySphereRuntime) {
  const selectedIndex =
    runtime.selectedHr === null
      ? undefined
      : runtime.data.indexByHr.get(runtime.selectedHr);
  if (selectedIndex === undefined) {
    runtime.selectedRing.visible = false;
    return;
  }

  const positionOffset = selectedIndex * 3;
  const x = runtime.data.positions[positionOffset];
  const y = runtime.data.positions[positionOffset + 1];
  const z = runtime.data.positions[positionOffset + 2];
  if (x === undefined || y === undefined || z === undefined) {
    runtime.selectedRing.visible = false;
    return;
  }

  runtime.selectedRing.visible = true;
  runtime.selectedRing.position.set(x * 1.006, y * 1.006, z * 1.006);
  runtime.selectedRing.quaternion.copy(runtime.camera.quaternion);
  const worldUnitsPerPixel =
    (runtime.camera.top - runtime.camera.bottom) /
    (runtime.frameHeight * runtime.camera.zoom);
  runtime.selectedRing.scale.setScalar(
    worldUnitsPerPixel * SELECTED_RING_RADIUS_PX,
  );
}

function updateSolarMarker(runtime: SkySphereRuntime) {
  const { altitudeDeg, azimuthDeg } = runtime.solarPosition;
  if (
    !Number.isFinite(altitudeDeg) ||
    !Number.isFinite(azimuthDeg)
  ) {
    runtime.solarMarker.visible = false;
    return;
  }

  const position = horizontalToCartesian(
    altitudeDeg,
    azimuthDeg,
    1.012,
  );
  runtime.solarMarker.visible = true;
  runtime.solarMarker.position.set(position.x, position.y, position.z);
  runtime.solarMarker.quaternion.copy(runtime.camera.quaternion);

  runtime.temporaryCenterVector.set(0, 0, 0);
  runtime.camera.worldToLocal(runtime.temporaryCenterVector);
  const centerDepth = runtime.temporaryCenterVector.z;
  runtime.temporaryVector.set(position.x, position.y, position.z);
  runtime.camera.worldToLocal(runtime.temporaryVector);
  const isFrontHemisphere =
    runtime.temporaryVector.z >= centerDepth;
  runtime.solarMaterial.opacity = solarMarkerOpacity(
    altitudeDeg >= 0,
    isFrontHemisphere,
  );

  const worldUnitsPerPixel =
    (runtime.camera.top - runtime.camera.bottom) /
    (runtime.frameHeight * runtime.camera.zoom);
  runtime.solarMarker.scale.setScalar(worldUnitsPerPixel * 6);

  const label = runtime.solarLabelElement;
  if (label) {
    const projected = runtime.temporaryVector
      .set(position.x, position.y, position.z)
      .project(runtime.camera);
    const x = (projected.x * 0.5 + 0.5) * runtime.frameWidth;
    const y = (-projected.y * 0.5 + 0.5) * runtime.frameHeight;
    const inView =
      projected.z >= -1 &&
      projected.z <= 1 &&
      x >= 8 &&
      x <= runtime.frameWidth - 8 &&
      y >= 8 &&
      y <= runtime.frameHeight - 8;
    label.hidden = !inView;
    if (inView) {
      label.dataset.hemisphere = isFrontHemisphere ? "front" : "back";
      label.dataset.horizon = altitudeDeg >= 0 ? "above" : "below";
      label.style.opacity = String(runtime.solarMaterial.opacity);
      label.style.transform =
        `translate3d(${Math.round(x + 9)}px, ${Math.round(y)}px, 0) ` +
        "translateY(-50%)";
    }
  }
}

function selectedMagnitude(runtime: SkySphereRuntime) {
  const selectedIndex =
    runtime.selectedHr === null
      ? undefined
      : runtime.data.indexByHr.get(runtime.selectedHr);
  return selectedIndex === undefined
    ? undefined
    : runtime.data.magnitudes[selectedIndex];
}

function updateEffectiveMagnitudeLimit(runtime: SkySphereRuntime) {
  const selected = selectedMagnitude(runtime);
  runtime.pointMaterial.uniforms.magnitudeLimit!.value =
    selected === undefined
      ? runtime.responsiveMagnitudeLimit
      : Math.max(runtime.responsiveMagnitudeLimit, selected);
}

function renderSky(runtime: SkySphereRuntime) {
  if (
    !runtime.renderable ||
    runtime.contextLost ||
    runtime.frameWidth <= 0 ||
    runtime.frameHeight <= 0
  ) {
    return false;
  }

  updateSelectedRing(runtime);
  updateSolarMarker(runtime);
  updateCardinalLabels(runtime);
  updateStarLabels(runtime);
  runtime.renderer.render(runtime.scene, runtime.camera);
  return true;
}

function resizeSky(
  runtime: SkySphereRuntime,
  width: number,
  height: number,
) {
  const nextWidth = Math.max(0, Math.floor(width));
  const nextHeight = Math.max(0, Math.floor(height));
  if (nextWidth <= 0 || nextHeight <= 0) {
    return;
  }

  runtime.frameWidth = nextWidth;
  runtime.frameHeight = nextHeight;
  const pixelRatio = skyDevicePixelRatio(window.devicePixelRatio);
  const aspectRatio = nextWidth / nextHeight;

  if (aspectRatio >= 1) {
    runtime.camera.left = -CAMERA_HALF_EXTENT * aspectRatio;
    runtime.camera.right = CAMERA_HALF_EXTENT * aspectRatio;
    runtime.camera.top = CAMERA_HALF_EXTENT;
    runtime.camera.bottom = -CAMERA_HALF_EXTENT;
  } else {
    runtime.camera.left = -CAMERA_HALF_EXTENT;
    runtime.camera.right = CAMERA_HALF_EXTENT;
    runtime.camera.top = CAMERA_HALF_EXTENT / aspectRatio;
    runtime.camera.bottom = -CAMERA_HALF_EXTENT / aspectRatio;
  }

  runtime.camera.updateProjectionMatrix();
  runtime.responsiveMagnitudeLimit = magnitudeLimitForViewport(
    nextWidth,
    nextHeight,
  );
  updateEffectiveMagnitudeLimit(runtime);
  runtime.pointMaterial.uniforms.devicePixelRatio!.value = pixelRatio;
  runtime.trackPointMaterial.uniforms.devicePixelRatio!.value =
    pixelRatio;
  runtime.renderer.setPixelRatio(pixelRatio);
  runtime.renderer.setSize(nextWidth, nextHeight, false);
  runtime.scheduler.request();
}

function replacePointAttributes(
  runtime: SkySphereRuntime,
  data: SkyPointBuffers,
) {
  const nextAttributes = createPointAttributes(data);

  // In Three r185 BufferAttribute.dispose() only releases WebGPU resources.
  // WebGL attributes are replaced here and released with the owning geometry
  // and renderer during the component teardown.
  runtime.geometry.setAttribute("position", nextAttributes.position);
  runtime.geometry.setAttribute("starColor", nextAttributes.color);
  runtime.geometry.setAttribute(
    "starMagnitude",
    nextAttributes.magnitude,
  );
  runtime.geometry.setAttribute("pointSize", nextAttributes.size);
  runtime.pointPositionAttribute = nextAttributes.position;
  runtime.pointColorAttribute = nextAttributes.color;
  runtime.pointMagnitudeAttribute = nextAttributes.magnitude;
  runtime.pointSizeAttribute = nextAttributes.size;
}

function replaceConstellationPositionAttribute(
  runtime: SkySphereRuntime,
  data: SkyConstellationLineBuffers,
) {
  const position = createConstellationPositionAttribute(data);
  runtime.constellationGeometry.setAttribute("position", position);
  runtime.constellationGeometry.setDrawRange(
    0,
    data.segmentCount * 2,
  );
  runtime.constellationPositionAttribute = position;
}

function replaceTrackAttributes(
  runtime: SkySphereRuntime,
  data: SkyTrackBuffers,
) {
  const attributes = createTrackAttributes(data);
  runtime.trackGeometry.setAttribute("position", attributes.position);
  runtime.trackGeometry.setAttribute(
    "trackProgress",
    attributes.progress,
  );
  runtime.trackGeometry.setAttribute("pointSize", attributes.pointSize);
  runtime.trackGeometry.setDrawRange(0, data.pointCount);
  runtime.trackPositionAttribute = attributes.position;
  runtime.trackProgressAttribute = attributes.progress;
  runtime.trackPointSizeAttribute = attributes.pointSize;
}

function updateRuntimeTrack(
  runtime: SkySphereRuntime,
  track: SelectedStarTrack | null,
) {
  const update = updateSkyTrackBuffers(runtime.trackData, track);
  runtime.trackData = update.buffers;
  runtime.selectedStarTrack = track;

  if (update.layoutChanged) {
    replaceTrackAttributes(runtime, update.buffers);
  } else {
    for (const attribute of [
      runtime.trackPositionAttribute,
      runtime.trackProgressAttribute,
      runtime.trackPointSizeAttribute,
    ]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, attribute.array.length);
      attribute.needsUpdate = true;
    }
  }

  runtime.trackLineObject.visible = update.buffers.pointCount >= 2;
  runtime.trackPointObject.visible = update.buffers.pointCount > 0;
  runtime.scheduler.request();
}

function updateRuntimeConstellations(
  runtime: SkySphereRuntime,
  constellations: readonly Constellation[],
) {
  const update = updateConstellationLineBuffers(
    runtime.constellationData,
    constellations,
    runtime.data,
  );
  runtime.constellationData = update.buffers;
  runtime.constellations = constellations;

  if (update.layoutChanged) {
    replaceConstellationPositionAttribute(runtime, update.buffers);
  } else {
    runtime.constellationPositionAttribute.clearUpdateRanges();
    runtime.constellationPositionAttribute.addUpdateRange(
      0,
      update.buffers.positions.length,
    );
    runtime.constellationPositionAttribute.needsUpdate = true;
  }
  runtime.constellationLineObject.visible =
    runtime.constellationLines &&
    update.buffers.segmentCount > 0;
}

function updateRuntimeStars(
  runtime: SkySphereRuntime,
  stars: readonly SkyStar[],
) {
  const update = updateSkyPointBuffers(runtime.data, stars);
  runtime.data = update.buffers;
  runtime.stars = stars;

  if (update.catalogChanged) {
    replacePointAttributes(runtime, update.buffers);
  } else {
    runtime.pointPositionAttribute.clearUpdateRanges();
    runtime.pointPositionAttribute.addUpdateRange(
      0,
      update.buffers.positions.length,
    );
    runtime.pointPositionAttribute.needsUpdate = true;
    if (update.appearanceChanged) {
      runtime.pointColorAttribute.needsUpdate = true;
      runtime.pointMagnitudeAttribute.needsUpdate = true;
      runtime.pointSizeAttribute.needsUpdate = true;
    }
  }

  updateRuntimeConstellations(runtime, runtime.constellations);
  updateEffectiveMagnitudeLimit(runtime);
  runtime.scheduler.request();
}

function pickScreenStar(
  runtime: SkySphereRuntime,
  x: number,
  y: number,
) {
  if (
    !runtime.renderable ||
    runtime.contextLost ||
    runtime.frameWidth <= 0 ||
    runtime.frameHeight <= 0
  ) {
    return null;
  }

  // Flush the current camera synchronously so selection uses the exact
  // projection that has just been painted after a pointer interaction.
  runtime.controls.update();
  renderSky(runtime);

  const candidates: ScreenStarCandidate[] = [];
  const { positions, sizes, hrs, magnitudes } = runtime.data;
  const selected = selectedMagnitude(runtime);
  const effectiveMagnitudeLimit =
    selected === undefined
      ? runtime.responsiveMagnitudeLimit
      : Math.max(runtime.responsiveMagnitudeLimit, selected);
  for (let index = 0; index < hrs.length; index += 1) {
    const offset = index * 3;
    const positionX = positions[offset];
    const positionY = positions[offset + 1];
    const positionZ = positions[offset + 2];
    const pointSize = sizes[index];
    const hr = hrs[index];
    const magnitude = magnitudes[index];
    if (
      positionX === undefined ||
      positionY === undefined ||
      positionZ === undefined ||
      pointSize === undefined ||
      hr === undefined ||
      magnitude === undefined
    ) {
      continue;
    }
    if (magnitude > effectiveMagnitudeLimit) {
      continue;
    }

    const projected = runtime.temporaryVector
      .set(positionX, positionY, positionZ)
      .project(runtime.camera);
    if (
      projected.z < -1 ||
      projected.z > 1 ||
      projected.x < -1.05 ||
      projected.x > 1.05 ||
      projected.y < -1.05 ||
      projected.y > 1.05
    ) {
      continue;
    }

    candidates.push({
      depth: projected.z,
      hr,
      magnitude,
      pointSize,
      x: (projected.x * 0.5 + 0.5) * runtime.frameWidth,
      y: (-projected.y * 0.5 + 0.5) * runtime.frameHeight,
    });
  }

  return findNearestScreenStar(candidates, { x, y });
}

function runCameraCommand(
  runtime: SkySphereRuntime,
  command: CameraCommand,
) {
  switch (command) {
    case "reset":
      runtime.controls.reset();
      break;
    case "rotate-left":
    case "rotate-right":
    case "rotate-up":
    case "rotate-down":
      {
        const delta = cameraOrbitDeltaForSphereNudge(
          command,
          CAMERA_ROTATION_STEP,
        );
        runtime.controls.rotateLeft(delta.leftRadians);
        runtime.controls.rotateUp(delta.upRadians);
      }
      break;
    case "zoom-in":
      runtime.camera.zoom = Math.min(
        runtime.controls.maxZoom,
        runtime.camera.zoom * 1.2,
      );
      runtime.camera.updateProjectionMatrix();
      break;
    case "zoom-out":
      runtime.camera.zoom = Math.max(
        runtime.controls.minZoom,
        runtime.camera.zoom / 1.2,
      );
      runtime.camera.updateProjectionMatrix();
      break;
  }

  runtime.controls.update();
  runtime.scheduler.request();
}

function CameraControlIcon({ command }: { command: CameraCommand }) {
  const Icon = CAMERA_ICONS[command];

  return <Icon aria-hidden="true" size={18} strokeWidth={1.8} />;
}

const CAMERA_LABELS: Record<CameraCommand, string> = {
  reset: "天球の向きと倍率を初期状態に戻す",
  "rotate-down": "天球を下へ回す",
  "rotate-left": "天球を左へ回す",
  "rotate-right": "天球を右へ回す",
  "rotate-up": "天球を上へ回す",
  "zoom-in": "星図を拡大する",
  "zoom-out": "星図を縮小する",
};

export function SkySphere3D({
  constellationLines,
  constellations,
  nightMode,
  onReady,
  onSelect,
  onUnavailable,
  selectedHr,
  selectedStarTrack,
  solarPosition,
  starLabels,
  stars,
  trackDescriptionId,
  twilight,
}: SkySphere3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SkySphereRuntime | null>(null);
  const pointerStartRef = useRef<PointerStart | null>(null);
  const cardinalRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const solarLabelRef = useRef<HTMLSpanElement>(null);
  const starLabelRefs = useRef(new Map<number, HTMLSpanElement>());
  const labelCandidates = useMemo(
    () => selectSkyLabelCandidates(stars, selectedHr),
    [selectedHr, stars],
  );
  const callbacksRef = useRef<CallbackSet>({
    onReady,
    onSelect,
    onUnavailable,
  });
  const initialPropsRef = useRef({
    constellationLines,
    constellations,
    labelHrs: labelCandidates.map((candidate) => candidate.hr),
    nightMode,
    selectedHr,
    selectedStarTrack,
    solarPosition,
    starLabels,
    stars,
    twilight,
  });
  const readyNotifiedRef = useRef(false);
  const unavailableNotifiedRef = useRef(false);
  const instructionsId = useId();
  const solarDescriptionId = useId();
  const summaryId = useId();
  const theme = skySphereTheme(twilight, nightMode);
  const solarAccessibilitySummary =
    `太陽は高度${formatSignedDegrees(solarPosition.altitudeDeg, 0)}、` +
    `方位${formatAzimuthDegrees(solarPosition.azimuthDeg)}、` +
    `地平線${solarPosition.altitudeDeg >= 0 ? "上" : "下"}です。`;

  useEffect(() => {
    callbacksRef.current = { onReady, onSelect, onUnavailable };
  }, [onReady, onSelect, onUnavailable]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) {
      return;
    }

    let renderer: WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFallback: (() => void) | null = null;
    let disposed = false;

    function notifyUnavailable(message: string) {
      if (unavailableNotifiedRef.current || disposed) {
        return;
      }
      unavailableNotifiedRef.current = true;
      callbacksRef.current.onUnavailable(message);
    }

    try {
      renderer = new WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas,
        failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance",
      });
      renderer.outputColorSpace = SRGBColorSpace;
    } catch {
      notifyUnavailable(
        "このブラウザでは3D星図を描画できません。2D星図と星の一覧は引き続き利用できます。",
      );
      return;
    }

    const initial = initialPropsRef.current;
    const data = createSkyPointBuffers(initial.stars);
    const attributes = createPointAttributes(data);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", attributes.position);
    geometry.setAttribute("starColor", attributes.color);
    geometry.setAttribute("starMagnitude", attributes.magnitude);
    geometry.setAttribute("pointSize", attributes.size);

    const pointMaterial = new ShaderMaterial({
      depthTest: true,
      depthWrite: true,
      fragmentShader: STAR_FRAGMENT_SHADER,
      transparent: true,
      uniforms: {
        devicePixelRatio: { value: 1 },
        magnitudeLimit: { value: 5 },
        nightMode: { value: initial.nightMode ? 1 : 0 },
      },
      vertexShader: STAR_VERTEX_SHADER,
    });
    const points = new Points(geometry, pointMaterial);
    points.frustumCulled = false;
    points.renderOrder = 3;

    const constellationData = createConstellationLineBuffers(
      initial.constellations,
      data,
    );
    const constellationPositionAttribute =
      createConstellationPositionAttribute(constellationData);
    const constellationGeometry = new BufferGeometry();
    constellationGeometry.setAttribute(
      "position",
      constellationPositionAttribute,
    );
    constellationGeometry.setDrawRange(
      0,
      constellationData.segmentCount * 2,
    );
    const constellationMaterial = new ShaderMaterial({
      depthTest: true,
      depthWrite: false,
      fragmentShader: CONSTELLATION_FRAGMENT_SHADER,
      transparent: true,
      uniforms: {
        nightMode: { value: initial.nightMode ? 1 : 0 },
      },
      vertexShader: CONSTELLATION_VERTEX_SHADER,
    });
    const constellationLineObject = new LineSegments(
      constellationGeometry,
      constellationMaterial,
    );
    constellationLineObject.frustumCulled = false;
    constellationLineObject.renderOrder = 2;
    constellationLineObject.visible =
      initial.constellationLines &&
      constellationData.segmentCount > 0;

    const trackData = createSkyTrackBuffers(
      initial.selectedStarTrack,
    );
    const trackAttributes = createTrackAttributes(trackData);
    const trackGeometry = new BufferGeometry();
    trackGeometry.setAttribute("position", trackAttributes.position);
    trackGeometry.setAttribute(
      "trackProgress",
      trackAttributes.progress,
    );
    trackGeometry.setAttribute("pointSize", trackAttributes.pointSize);
    trackGeometry.setDrawRange(0, trackData.pointCount);
    const trackLineMaterial = new ShaderMaterial({
      depthTest: true,
      depthWrite: false,
      fragmentShader: TRACK_LINE_FRAGMENT_SHADER,
      transparent: true,
      uniforms: {
        nightMode: { value: initial.nightMode ? 1 : 0 },
      },
      vertexShader: TRACK_LINE_VERTEX_SHADER,
    });
    const trackLineObject = new Line(
      trackGeometry,
      trackLineMaterial,
    );
    trackLineObject.frustumCulled = false;
    trackLineObject.renderOrder = 2.2;
    trackLineObject.visible = trackData.pointCount >= 2;

    const trackPointMaterial = new ShaderMaterial({
      depthTest: true,
      depthWrite: false,
      fragmentShader: TRACK_POINT_FRAGMENT_SHADER,
      transparent: true,
      uniforms: {
        devicePixelRatio: { value: 1 },
        nightMode: { value: initial.nightMode ? 1 : 0 },
      },
      vertexShader: TRACK_POINT_VERTEX_SHADER,
    });
    const trackPointObject = new Points(
      trackGeometry,
      trackPointMaterial,
    );
    trackPointObject.frustumCulled = false;
    trackPointObject.renderOrder = 2.4;
    trackPointObject.visible = trackData.pointCount > 0;

    const horizonGeometry = new CircleGeometry(1, 128);
    const horizonMaterial = new MeshBasicMaterial({
      color: 0x12345b,
      depthTest: false,
      depthWrite: false,
      opacity: 0.16,
      side: DoubleSide,
      transparent: true,
    });
    const horizon = new Mesh(horizonGeometry, horizonMaterial);
    horizon.renderOrder = 1;

    const horizonRingGeometry = createHorizonRingGeometry();
    const horizonRingMaterial = new LineBasicMaterial({
      color: 0x7fbfff,
      depthTest: false,
      opacity: 0.68,
      transparent: true,
    });
    const horizonRing = new LineLoop(
      horizonRingGeometry,
      horizonRingMaterial,
    );
    horizonRing.renderOrder = 4;

    const selectedGeometry = new RingGeometry(0.7, 1, 48);
    const selectedMaterial = new MeshBasicMaterial({
      color: 0x8bc8ff,
      depthTest: false,
      depthWrite: false,
      opacity: 0.96,
      side: DoubleSide,
      transparent: true,
    });
    const selectedRing = new Mesh(selectedGeometry, selectedMaterial);
    selectedRing.renderOrder = 5;
    selectedRing.visible = false;

    const solarGeometry = new CircleGeometry(1, 32);
    const solarMaterial = new MeshBasicMaterial({
      color: initial.nightMode ? 0xe8756d : 0xffd16a,
      depthTest: false,
      depthWrite: false,
      opacity: 1,
      side: DoubleSide,
      transparent: true,
    });
    const solarMarker = new Mesh(solarGeometry, solarMaterial);
    solarMarker.renderOrder = 4.5;

    const scene = new Scene();
    scene.add(
      horizon,
      constellationLineObject,
      trackLineObject,
      trackPointObject,
      points,
      horizonRing,
      solarMarker,
      selectedRing,
    );

    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    camera.position.set(
      INITIAL_CAMERA_POSITION.x,
      INITIAL_CAMERA_POSITION.y,
      INITIAL_CAMERA_POSITION.z,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableRotate = true;
    // Leave ordinary page scrolling intact until the user explicitly
    // activates the canvas. Buttons and keyboard zoom do not depend on this
    // flag, while OrbitControls' wheel handler exits without preventDefault.
    controls.enableZoom = document.activeElement === canvas;
    controls.minZoom = 0.72;
    controls.maxZoom = 3.5;
    controls.rotateSpeed = 0.62;
    controls.zoomSpeed = 0.78;
    controls.target.set(0, 0, 0);
    controls.update();
    controls.saveState();
    // OrbitControls defaults to touch-action:none. Allow one-finger vertical
    // page scrolling; horizontal gestures remain available for rotation.
    canvas.style.touchAction = "pan-y";

    const scheduler = createOnDemandFrameScheduler(() => {
      const activeRuntime = runtimeRef.current;
      if (disposed || !activeRuntime) {
        return;
      }
      try {
        if (
          renderSky(activeRuntime) &&
          !readyNotifiedRef.current
        ) {
          readyNotifiedRef.current = true;
          unavailableNotifiedRef.current = false;
          callbacksRef.current.onReady();
        }
      } catch {
        activeRuntime.renderable = false;
        notifyUnavailable(
          "3D星図の描画中に問題が起きました。2D星図へ切り替えてください。",
        );
      }
    });

    const runtime: SkySphereRuntime = {
      camera,
      cardinalElements: [...cardinalRefs.current],
      constellationData,
      constellationGeometry,
      constellationLineObject,
      constellationLines: initial.constellationLines,
      constellationMaterial,
      constellationPositionAttribute,
      constellations: initial.constellations,
      contextLost: false,
      controls,
      data,
      frameHeight: 0,
      frameWidth: 0,
      geometry,
      horizonMaterial,
      horizonRingMaterial,
      nightMode: initial.nightMode,
      pointColorAttribute: attributes.color,
      pointMagnitudeAttribute: attributes.magnitude,
      pointMaterial,
      pointPositionAttribute: attributes.position,
      pointSizeAttribute: attributes.size,
      renderer,
      renderable: true,
      responsiveMagnitudeLimit: 5,
      scene,
      scheduler,
      selectedHr: initial.selectedHr,
      selectedMaterial,
      selectedRing,
      selectedStarTrack: initial.selectedStarTrack,
      solarMarker,
      solarLabelElement: solarLabelRef.current,
      solarMaterial,
      solarPosition: initial.solarPosition,
      starLabelElements: starLabelRefs.current,
      starLabelHrs: initial.labelHrs,
      starLabels: initial.starLabels,
      stars: initial.stars,
      trackData,
      trackGeometry,
      trackLineMaterial,
      trackLineObject,
      trackPointMaterial,
      trackPointObject,
      trackPointSizeAttribute: trackAttributes.pointSize,
      trackPositionAttribute: trackAttributes.position,
      trackProgressAttribute: trackAttributes.progress,
      temporaryCenterVector: new Vector3(),
      temporaryVector: new Vector3(),
      twilight: initial.twilight,
    };
    runtimeRef.current = runtime;
    applySkyTheme(runtime, initial.twilight, initial.nightMode);

    const handleControlsChange = () => runtime.scheduler.request();
    controls.addEventListener("change", handleControlsChange);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      runtime.contextLost = true;
      runtime.scheduler.cancelPending();
      notifyUnavailable(
        "3D描画コンテキストが失われました。2D星図へ切り替えて表示を継続します。",
      );
    };
    const handleContextRestored = () => {
      runtime.contextLost = false;
      runtime.renderable = true;
      readyNotifiedRef.current = false;
      unavailableNotifiedRef.current = false;
      runtime.renderer.resetState();
      const bounds = frame.getBoundingClientRect();
      resizeSky(runtime, bounds.width, bounds.height);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener(
      "webglcontextrestored",
      handleContextRestored,
    );

    const resizeFromFrame = () => {
      const bounds = frame.getBoundingClientRect();
      resizeSky(runtime, bounds.width, bounds.height);
    };
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(([entry]) => {
        if (entry) {
          resizeSky(
            runtime,
            entry.contentRect.width,
            entry.contentRect.height,
          );
        }
      });
      resizeObserver.observe(frame);
    } else {
      resizeFallback = resizeFromFrame;
      window.addEventListener("resize", resizeFallback);
    }
    resizeFromFrame();

    const resources = {
      constellationGeometry,
      constellationMaterial,
      horizonGeometry,
      horizonMaterial,
      horizonRingGeometry,
      horizonRingMaterial,
      pointGeometry: geometry,
      pointMaterial,
      selectedGeometry,
      selectedMaterial,
      solarGeometry,
      solarMaterial,
      trackGeometry,
      trackLineMaterial,
      trackPointMaterial,
    };

    return () => {
      disposed = true;
      if (runtimeRef.current === runtime) {
        runtimeRef.current = null;
      }
      pointerStartRef.current = null;
      resizeObserver?.disconnect();
      if (resizeFallback) {
        window.removeEventListener("resize", resizeFallback);
      }
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
      );
      controls.removeEventListener("change", handleControlsChange);
      controls.dispose();
      scheduler.dispose();
      scene.clear();
      disposeSkySphereResources(resources);
      renderer?.dispose();
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.stars === stars) {
      return;
    }
    updateRuntimeStars(runtime, stars);
  }, [stars]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.constellations === constellations) {
      return;
    }
    updateRuntimeConstellations(runtime, constellations);
    runtime.scheduler.request();
  }, [constellations]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.constellationLines === constellationLines) {
      return;
    }
    runtime.constellationLines = constellationLines;
    runtime.constellationLineObject.visible =
      constellationLines &&
      runtime.constellationData.segmentCount > 0;
    runtime.scheduler.request();
  }, [constellationLines]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.selectedHr === selectedHr) {
      return;
    }
    runtime.selectedHr = selectedHr;
    updateEffectiveMagnitudeLimit(runtime);
    runtime.scheduler.request();
  }, [selectedHr]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (
      !runtime ||
      runtime.selectedStarTrack === selectedStarTrack
    ) {
      return;
    }
    updateRuntimeTrack(runtime, selectedStarTrack);
  }, [selectedStarTrack]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.solarPosition === solarPosition) {
      return;
    }
    runtime.solarPosition = solarPosition;
    runtime.scheduler.request();
  }, [solarPosition]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.starLabelHrs = labelCandidates.map(
      (candidate) => candidate.hr,
    );
    runtime.starLabels = starLabels;
    runtime.scheduler.request();
  }, [labelCandidates, starLabels]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (
      !runtime ||
      (runtime.nightMode === nightMode &&
        runtime.twilight === twilight)
    ) {
      return;
    }
    applySkyTheme(runtime, twilight, nightMode);
    runtime.scheduler.request();
  }, [nightMode, twilight]);

  function handleCameraCommand(command: CameraCommand) {
    const runtime = runtimeRef.current;
    if (runtime) {
      runCameraCommand(runtime, command);
    }
  }

  function handleCanvasFocus() {
    const runtime = runtimeRef.current;
    if (runtime) {
      runtime.controls.enableZoom = true;
    }
  }

  function handleCanvasBlur() {
    const runtime = runtimeRef.current;
    if (runtime) {
      runtime.controls.enableZoom = false;
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    const keyCommands: Partial<Record<string, CameraCommand>> = {
      "+": "zoom-in",
      "-": "zoom-out",
      "=": "zoom-in",
      ArrowDown: "rotate-down",
      ArrowLeft: "rotate-left",
      ArrowRight: "rotate-right",
      ArrowUp: "rotate-up",
      Home: "reset",
    };
    const command = keyCommands[event.key];
    if (!command) {
      return;
    }

    event.preventDefault();
    handleCameraCommand(command);
  }

  function handlePointerDown(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    event.currentTarget.focus({ preventScroll: true });
    if (!event.isPrimary || event.button !== 0) {
      pointerStartRef.current = null;
      return;
    }
    pointerStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (
      !start ||
      start.pointerId !== event.pointerId ||
      !isUndraggedPointer(start, {
        x: event.clientX,
        y: event.clientY,
      })
    ) {
      return;
    }

    const runtime = runtimeRef.current;
    const canvas = canvasRef.current;
    if (!runtime || !canvas) {
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const hit = pickScreenStar(
      runtime,
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    );
    if (hit) {
      callbacksRef.current.onSelect(hit.hr);
    }
  }

  return (
    <div
      className={`sky-sphere3d ${theme.className}`}
      ref={frameRef}
    >
      <canvas
        aria-describedby={`${instructionsId} ${summaryId} ${solarDescriptionId}${
          trackDescriptionId ? ` ${trackDescriptionId}` : ""
        }`}
        aria-label="操作可能な3D天球。北を上、東を右とした初期視点で、北・東・南・西・天頂・天底の方向を表示し、地平線より下と天球の裏側の星は暗く表示されます。"
        className="sky-sphere3d__canvas"
        onBlur={handleCanvasBlur}
        onFocus={handleCanvasFocus}
        onKeyDown={handleKeyDown}
        onPointerCancel={() => {
          pointerStartRef.current = null;
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        ref={canvasRef}
        role="img"
        style={{ touchAction: "pan-y" }}
        tabIndex={0}
      >
        3D星図を表示できない場合は、星の一覧から天体を選択できます。
      </canvas>

      <div
        aria-label="3D天球の操作"
        className="sky-sphere3d__controls"
        role="group"
      >
        <div className="sky-sphere3d__direction-pad">
          {(
            [
              "rotate-up",
              "rotate-left",
              "reset",
              "rotate-right",
              "rotate-down",
            ] as const
          ).map((command) => (
            <button
              aria-label={CAMERA_LABELS[command]}
              className={`sky-sphere3d__control sky-sphere3d__control--${command}`}
              key={command}
              onClick={() => handleCameraCommand(command)}
              title={CAMERA_LABELS[command]}
              type="button"
            >
              <CameraControlIcon command={command} />
            </button>
          ))}
        </div>
        <div className="sky-sphere3d__zoom-controls">
          {(["zoom-in", "zoom-out"] as const).map((command) => (
            <button
              aria-label={CAMERA_LABELS[command]}
              className="sky-sphere3d__control"
              key={command}
              onClick={() => handleCameraCommand(command)}
              title={CAMERA_LABELS[command]}
              type="button"
            >
              <CameraControlIcon command={command} />
            </button>
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="sky-sphere3d__cardinals">
        {DIRECTION_POINTS.map((direction, index) => (
          <span
            className="sky-sphere3d__cardinal"
            key={direction.label}
            ref={(element) => {
              cardinalRefs.current[index] = element;
            }}
          >
            {direction.label}
          </span>
        ))}
      </div>

      <div aria-hidden="true" className="sky-sphere3d__star-labels">
        {labelCandidates.map((candidate: SkyLabelCandidate) => (
          <span
            className={`sky-sphere3d__star-label${
              candidate.hr === selectedHr
                ? " sky-sphere3d__star-label--selected"
                : ""
            }`}
            data-star-hr={candidate.hr}
            hidden
            key={candidate.hr}
            ref={(element) => {
              if (element) {
                starLabelRefs.current.set(candidate.hr, element);
              } else {
                starLabelRefs.current.delete(candidate.hr);
              }
            }}
          >
            {candidate.label}
          </span>
        ))}
      </div>

      <span
        aria-hidden="true"
        className="sky-sphere3d__solar-label"
        hidden
        ref={solarLabelRef}
      >
        太陽
      </span>

      <p className="sky-sphere3d__instructions" id={instructionsId}>
        キーボードでは矢印キーで天球を回転し、プラスキーとマイナスキーで拡大縮小、
        Homeキーで初期視点へ戻せます。星は下の一覧からも選択できます。
      </p>
      <p className="sky-sphere3d__instructions" id={solarDescriptionId}>
        {solarAccessibilitySummary}
      </p>
      <p className="sky-sphere3d__summary" id={summaryId}>
        横ドラッグで回転・フォーカス中はスクロールで拡大縮小・クリックで星を選択
      </p>
    </div>
  );
}
