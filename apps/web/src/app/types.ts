import type {
  AnnualParallaxMode,
  DiurnalAberrationMode,
  PolarMotionMode,
  RefractionMode,
  SolarLightDeflectionMode,
  SpaceMotionMode,
} from "../domain";

export type StarViewModel = {
  aliases: readonly string[];
  altitudeDeg: number;
  apparentDecRad: number | null;
  apparentRaRad: number | null;
  annualParallaxMode: AnnualParallaxMode | null;
  azimuthDefined: boolean;
  azimuthDeg: number;
  calculationModel: "v1" | "v2";
  catalogName: string | null;
  constellation: string;
  decRad: number;
  diurnalAberrationMode: DiurnalAberrationMode | null;
  englishName: string;
  geometricAltitudeDeg: number;
  geometricAzimuthDefined: boolean;
  geometricAzimuthDeg: number;
  hr: number;
  japaneseName: string;
  parallaxArcsec: number | null;
  pmDecArcsecPerYear: number | null;
  pmRaCosDecArcsecPerYear: number | null;
  polarMotionMode: PolarMotionMode | null;
  raRad: number;
  radialVelocityKmPerSecond: number | null;
  refractionMode: RefractionMode | null;
  solarLightDeflectionMode: SolarLightDeflectionMode | null;
  spaceMotionMode: SpaceMotionMode | null;
  vMagnitude: number;
};

export type SkyStar = {
  altitudeDeg: number;
  azimuthDeg: number;
  bvColor: number | null;
  hr: number;
  label: string | null;
  projectionX: number;
  projectionY: number;
  vMagnitude: number;
};

export type SkySolarPosition = {
  altitudeDeg: number;
  azimuthDeg: number;
  projectionX: number;
  projectionY: number;
};

export type SelectedStarTrackPoint = {
  altitudeDeg: number;
  azimuthDeg: number;
  observedAtIso: string;
  projectionX: number;
  projectionY: number;
  relativeMinutes: number;
};

export type SelectedStarTrack = {
  points: readonly SelectedStarTrackPoint[];
  sampleIntervalMinutes: 30;
  starHr: number;
  truncatedFuture: boolean;
  truncatedPast: boolean;
  windowMinutes: 180;
};

export type ObserverLocation = {
  heightMeters: number;
  horizontalAccuracyMeters: number | null;
  id: string;
  latitude: number;
  locationSource:
    | "bundled-city"
    | "manual"
    | "device-geolocation";
  longitude: number;
  name: string;
  timeZone: string;
};

export type LayerSettings = {
  atmosphericRefraction: boolean;
  constellationLines: boolean;
  nightMode: boolean;
  selectedStarTrack: boolean;
  starLabels: boolean;
};

export type LocationNotice =
  | { kind: "error"; message: string }
  | { kind: "info"; message: string }
  | null;
