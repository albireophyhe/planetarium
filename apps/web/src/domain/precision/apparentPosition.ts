import { degreesToRadians } from "../angles";
import { horizontalToProjection } from "../coordinates";
import type { HorizontalCoordinates, ObservingLocation } from "../types";
import { assertValidObservingLocation } from "../validation";
import {
  applyPreparedAnnualAberrationToUnitDirection,
  approximateEarthState,
  prepareAnnualAberration,
} from "./aberration";
import type { ApproximateEarthState } from "./aberration";
import { applyAnnualParallax } from "./annualParallax";
import { ARCSECONDS_TO_RADIANS, clampUnit, normalizeAngle } from "./constants";
import {
  applyTopocentricParallaxToItrsDirection,
  diurnalAberrationMagnitude,
  wgs84ObserverPositionItrsAu,
} from "./diurnalAberration";
import { prepareEarthOrientation2006B } from "./precessionNutation";
import { approximateTioLocator, polarMotionMatrix2000 } from "./polarMotion";
import {
  applyVisualRefractionWithCoefficients,
  refractionCoefficients,
} from "./refraction";
import { propagateSpaceMotionVector } from "./spaceMotion";
import type { VectorSpaceMotionResult } from "./spaceMotion";
import {
  applyPreparedSolarLightDeflectionToUnitDirection,
  prepareSolarLightDeflection,
} from "./solarLightDeflection";
import { resolveTimeScales } from "./timeScales";
import type {
  AberrationContextV2,
  AnnualParallaxContextV2,
  AnnualParallaxMode,
  ApparentPositionContextV2,
  ApparentPositionOptionsV2,
  ApparentSunPositionV2,
  ApparentStarPositionV2,
  DiurnalAberrationContextV2,
  DiurnalAberrationMode,
  LightweightApparentStarPositionV2,
  PolarMotionContextV2,
  PolarMotionMode,
  PrecisionStar,
  PrecisionWarningCode,
  PreparedAberrationContextV2,
  PreparedAnnualParallaxContextV2,
  PreparedSolarLightDeflectionContextV2,
  RefractionContextV2,
  RefractionMode,
  ResolvedTimeScales,
  SolarLightDeflectionContextV2,
  SolarLightDeflectionMode,
} from "./types";
import type { OmittedCorrection } from "./types";
import {
  multiplyMatrixVector,
  normalizeVector,
  unitVectorToEquatorial,
} from "./vector";
import type { Matrix3, Vector3 } from "./vector";

const OMITTED_CORRECTIONS_WITHOUT_ANNUAL_PARALLAX = Object.freeze([
  "annual-parallax",
  "diurnal-parallax",
  "planetary-light-deflection",
] as const satisfies readonly OmittedCorrection[]);

const OMITTED_CORRECTIONS_WITH_APPROXIMATE_ANNUAL_PARALLAX = Object.freeze([
  "diurnal-parallax",
  "planetary-light-deflection",
] as const satisfies readonly OmittedCorrection[]);

const OMITTED_CORRECTIONS_WITH_CALLER_ANNUAL_PARALLAX = Object.freeze([
  "planetary-light-deflection",
] as const satisfies readonly OmittedCorrection[]);

function freezeVector(vector: Vector3): Vector3 {
  return Object.freeze([vector[0], vector[1], vector[2]]) as Vector3;
}

function freezeMatrix(matrix: Matrix3): Matrix3 {
  return Object.freeze([
    freezeVector(matrix[0]),
    freezeVector(matrix[1]),
    freezeVector(matrix[2]),
  ]) as Matrix3;
}

function freezeTimeScales(timeScales: ResolvedTimeScales): ResolvedTimeScales {
  return Object.freeze({
    ...timeScales,
    warnings: Object.freeze([...timeScales.warnings]),
  });
}

function freezeAberration(
  prepared: PreparedAberrationContextV2,
): PreparedAberrationContextV2 {
  return Object.freeze({
    ...prepared,
    observerBarycentricVelocityC: freezeVector(
      prepared.observerBarycentricVelocityC,
    ),
  });
}

function freezeAnnualParallax(
  mode: PreparedAnnualParallaxContextV2["mode"],
  observerPositionAu: Vector3,
): PreparedAnnualParallaxContextV2 {
  return Object.freeze({
    mode,
    observerPositionAu: freezeVector(observerPositionAu),
  });
}

function freezeSolarLightDeflection(
  prepared: PreparedSolarLightDeflectionContextV2,
): PreparedSolarLightDeflectionContextV2 {
  return Object.freeze({
    ...prepared,
    sunToObserverUnitDirection: freezeVector(
      prepared.sunToObserverUnitDirection,
    ),
  });
}

function uniqueWarnings(
  warnings: readonly PrecisionWarningCode[],
): readonly PrecisionWarningCode[] {
  return Object.freeze([...new Set(warnings)]);
}

function createAberrationContext(
  options: ApparentPositionOptionsV2,
  warnings: PrecisionWarningCode[],
  approximateEarth: ApproximateEarthState | null,
): AberrationContextV2 {
  if (options.aberration === false) {
    warnings.push("aberration-disabled");
    return Object.freeze({ mode: "disabled" });
  }
  if (options.aberration === undefined) {
    if (approximateEarth === null) {
      throw new TypeError("Default Earth state was not prepared");
    }
    warnings.push("aberration-approximate-ephemeris");
    return freezeAberration(
      prepareAnnualAberration(
        approximateEarth.velocityC,
        approximateEarth.sunObserverDistanceAu,
        "truncated-vsop2000-heliocentric-earth",
      ),
    );
  }
  return freezeAberration(
    prepareAnnualAberration(
      options.aberration.observerBarycentricVelocityC,
      options.aberration.sunObserverDistanceAu,
      "caller-barycentric-velocity",
    ),
  );
}

function createAnnualParallaxContext(
  options: ApparentPositionOptionsV2,
  warnings: PrecisionWarningCode[],
  approximateEarth: ApproximateEarthState | null,
): AnnualParallaxContextV2 {
  if (options.annualParallax === false) {
    warnings.push("annual-parallax-disabled");
    return Object.freeze({ mode: "disabled" });
  }
  if (options.annualParallax === undefined) {
    if (approximateEarth === null) {
      throw new TypeError("Default Earth state was not prepared");
    }
    return freezeAnnualParallax(
      "truncated-vsop2000-heliocentric-earth",
      approximateEarth.positionAu,
    );
  }
  if (
    options.annualParallax.observerPositionAu.some(
      (component) => !Number.isFinite(component),
    )
  ) {
    throw new RangeError("Annual-parallax observer position must be finite");
  }
  return freezeAnnualParallax(
    "caller-observer-position",
    options.annualParallax.observerPositionAu,
  );
}

function createSolarLightDeflectionContext(
  options: ApparentPositionOptionsV2,
  warnings: PrecisionWarningCode[],
  approximateEarth: ApproximateEarthState | null,
): SolarLightDeflectionContextV2 {
  if (options.solarLightDeflection === false) {
    warnings.push("solar-light-deflection-disabled");
    return Object.freeze({ mode: "disabled" });
  }
  if (options.solarLightDeflection === undefined) {
    if (approximateEarth === null) {
      throw new TypeError("Default Earth state was not prepared");
    }
    warnings.push("solar-light-deflection-approximate-ephemeris");
    return freezeSolarLightDeflection(
      prepareSolarLightDeflection(
        normalizeVector(approximateEarth.positionAu),
        approximateEarth.sunObserverDistanceAu,
        "truncated-vsop2000-heliocentric-earth",
      ),
    );
  }
  return freezeSolarLightDeflection(
    prepareSolarLightDeflection(
      options.solarLightDeflection.sunToObserverUnitDirection,
      options.solarLightDeflection.sunObserverDistanceAu,
      "caller-sun-observer-geometry",
    ),
  );
}

function createRefractionContext(
  options: ApparentPositionOptionsV2,
  warnings: PrecisionWarningCode[],
): RefractionContextV2 {
  if (options.refraction === false || options.refraction === undefined) {
    warnings.push("refraction-disabled");
    return Object.freeze({ mode: "disabled" });
  }
  const minimumGeometricAltitudeDegrees =
    options.refraction.minimumGeometricAltitudeDegrees ?? 5;
  if (
    !Number.isFinite(minimumGeometricAltitudeDegrees) ||
    minimumGeometricAltitudeDegrees < 5 ||
    minimumGeometricAltitudeDegrees > 30
  ) {
    throw new RangeError(
      "Minimum refraction altitude must be between 5° and 30°",
    );
  }
  const coefficients = refractionCoefficients(options.refraction);
  return Object.freeze({
    mode: "configured",
    tangentCoefficient: coefficients.tangent,
    tangentCubedCoefficient: coefficients.tangentCubed,
    minimumGeometricAltitudeDegrees,
  });
}

function createDiurnalAberrationContext(
  options: ApparentPositionOptionsV2,
  latitudeRadians: number,
  warnings: PrecisionWarningCode[],
): DiurnalAberrationContextV2 {
  if (options.diurnalAberration === false) {
    warnings.push("diurnal-aberration-disabled");
    return Object.freeze({ mode: "disabled" });
  }
  const heightMeters = options.diurnalAberration?.heightMeters ?? 0;
  if (options.diurnalAberration?.heightMeters === undefined) {
    warnings.push("observer-height-assumed-zero");
  }
  return Object.freeze({
    mode: "wgs84-observer",
    heightMeters,
    magnitude: diurnalAberrationMagnitude(latitudeRadians, heightMeters),
  });
}

function createPolarMotionContext(
  options: ApparentPositionOptionsV2,
  ttJulianDate: number,
  warnings: PrecisionWarningCode[],
): PolarMotionContextV2 {
  const supplied = options.earthOrientation?.polarMotion;
  if (supplied === undefined) {
    return Object.freeze({
      mode: "disabled",
      xpRadians: 0,
      ypRadians: 0,
      xpReportedErrorRadians: null,
      ypReportedErrorRadians: null,
      tioLocatorRadians: 0,
      matrix: freezeMatrix(polarMotionMatrix2000(0, 0, 0)),
    });
  }

  const source = supplied.source ?? "caller";
  if (
    source !== "caller" &&
    source !== "iers-observed" &&
    source !== "iers-predicted" &&
    source !== "assumed-zero"
  ) {
    throw new RangeError("Unsupported polar-motion source");
  }
  const hasXpError = supplied.xpReportedErrorRadians !== undefined;
  const hasYpError = supplied.ypReportedErrorRadians !== undefined;
  if (hasXpError !== hasYpError) {
    throw new TypeError(
      "Polar-motion reported errors must be supplied for both axes",
    );
  }
  if (
    (source === "iers-observed" || source === "iers-predicted") &&
    !hasXpError
  ) {
    throw new TypeError(
      "IERS polar motion requires reported errors for both axes",
    );
  }
  const xpReportedErrorRadians = supplied.xpReportedErrorRadians ?? null;
  const ypReportedErrorRadians = supplied.ypReportedErrorRadians ?? null;
  for (const [name, value] of [
    ["xp", xpReportedErrorRadians],
    ["yp", ypReportedErrorRadians],
  ] as const) {
    if (
      value !== null &&
      (!Number.isFinite(value) || value < 0 || value > ARCSECONDS_TO_RADIANS)
    ) {
      throw new RangeError(
        `${name} reported error must be finite and within 0–1 arcsecond`,
      );
    }
  }
  if (
    source === "assumed-zero" &&
    (supplied.xpRadians !== 0 || supplied.ypRadians !== 0)
  ) {
    throw new RangeError("Assumed-zero polar motion requires xp=yp=0");
  }
  if (source === "assumed-zero") {
    warnings.push("polar-motion-assumed-zero");
  }

  const tioLocatorRadians = approximateTioLocator(ttJulianDate);
  return Object.freeze({
    mode: source,
    xpRadians: supplied.xpRadians,
    ypRadians: supplied.ypRadians,
    xpReportedErrorRadians,
    ypReportedErrorRadians,
    tioLocatorRadians,
    matrix: freezeMatrix(
      polarMotionMatrix2000(
        supplied.xpRadians,
        supplied.ypRadians,
        tioLocatorRadians,
      ),
    ),
  });
}

/**
 * Build immutable per-frame state once, outside the star loop.
 *
 * Time-scale resolution, 77-term nutation, precession matrix construction,
 * Earth-state approximation, and refraction coefficients are all completed
 * here. The returned object can be reused for every star in the frame.
 */
export function createApparentPositionContextV2(
  date: Date,
  location: ObservingLocation,
  options: ApparentPositionOptionsV2 = {},
): ApparentPositionContextV2 {
  const validLocation = assertValidObservingLocation(location);
  const timeScales = freezeTimeScales(
    resolveTimeScales(date, options.earthOrientation),
  );
  const warnings: PrecisionWarningCode[] = [
    ...timeScales.warnings,
    "catalog-fk5-precision-limited",
  ];
  const latitudeRadians = degreesToRadians(validLocation.latitude);
  const needsApproximateEarthState =
    options.annualParallax === undefined ||
    options.solarLightDeflection === undefined ||
    options.aberration === undefined;
  const approximateEarth = needsApproximateEarthState
    ? approximateEarthState(timeScales.ttJulianDate)
    : null;
  const annualParallax = createAnnualParallaxContext(
    options,
    warnings,
    approximateEarth,
  );
  const solarLightDeflection = createSolarLightDeflectionContext(
    options,
    warnings,
    approximateEarth,
  );
  const aberration = createAberrationContext(
    options,
    warnings,
    approximateEarth,
  );
  const diurnalAberration = createDiurnalAberrationContext(
    options,
    latitudeRadians,
    warnings,
  );
  const polarMotion = createPolarMotionContext(
    options,
    timeScales.ttJulianDate,
    warnings,
  );
  const refraction = createRefractionContext(options, warnings);
  const earthOrientation = prepareEarthOrientation2006B(
    timeScales.ut1JulianDate,
    timeScales.ttJulianDate,
  );
  const frozenLocation = Object.freeze({
    latitude: validLocation.latitude,
    longitude: validLocation.longitude,
    timeZone: validLocation.timeZone,
    ...(validLocation.name === undefined ? {} : { name: validLocation.name }),
  });
  const longitudeRadians = degreesToRadians(validLocation.longitude);
  return Object.freeze({
    modelVersion: 2,
    location: frozenLocation,
    latitudeRadians,
    longitudeRadians,
    longitudeSine: Math.sin(longitudeRadians),
    longitudeCosine: Math.cos(longitudeRadians),
    latitudeSine: Math.sin(latitudeRadians),
    latitudeCosine: Math.cos(latitudeRadians),
    timeScales,
    precessionNutationMatrix: freezeMatrix(
      earthOrientation.precessionNutationMatrix,
    ),
    greenwichApparentSiderealTime:
      earthOrientation.greenwichApparentSiderealTime,
    annualParallax,
    solarLightDeflection,
    aberration,
    diurnalAberration,
    polarMotion,
    refraction,
    baseWarnings: uniqueWarnings(warnings),
  });
}

function toGeometricHorizontal(
  apparentDirection: Vector3,
  context: ApparentPositionContextV2,
  geocentricDistanceAu?: number,
): HorizontalCoordinates {
  const siderealSine = Math.sin(context.greenwichApparentSiderealTime);
  const siderealCosine = Math.cos(context.greenwichApparentSiderealTime);
  const tirsX =
    siderealCosine * apparentDirection[0] + siderealSine * apparentDirection[1];
  const tirsY =
    -siderealSine * apparentDirection[0] +
    siderealCosine * apparentDirection[1];
  const tirsZ = apparentDirection[2];
  const polarMatrix = context.polarMotion.matrix;
  let itrsX =
    polarMatrix[0][0] * tirsX +
    polarMatrix[0][1] * tirsY +
    polarMatrix[0][2] * tirsZ;
  let itrsY =
    polarMatrix[1][0] * tirsX +
    polarMatrix[1][1] * tirsY +
    polarMatrix[1][2] * tirsZ;
  let itrsZ =
    polarMatrix[2][0] * tirsX +
    polarMatrix[2][1] * tirsY +
    polarMatrix[2][2] * tirsZ;
  if (geocentricDistanceAu !== undefined) {
    // Site height currently enters through the existing WGS84 diurnal-
    // aberration option. Disabling that independent velocity correction
    // removes its height input, so solar parallax continues at the explicit
    // zero-metre fallback rather than being disabled implicitly.
    const heightMeters =
      context.diurnalAberration.mode === "wgs84-observer"
        ? context.diurnalAberration.heightMeters
        : 0;
    const topocentricDirection = applyTopocentricParallaxToItrsDirection(
      [itrsX, itrsY, itrsZ],
      geocentricDistanceAu,
      wgs84ObserverPositionItrsAu(
        context.latitudeRadians,
        context.longitudeRadians,
        heightMeters,
      ),
    );
    itrsX = topocentricDirection[0];
    itrsY = topocentricDirection[1];
    itrsZ = topocentricDirection[2];
  }
  const east = -context.longitudeSine * itrsX + context.longitudeCosine * itrsY;
  const north =
    -context.latitudeSine * context.longitudeCosine * itrsX -
    context.latitudeSine * context.longitudeSine * itrsY +
    context.latitudeCosine * itrsZ;
  const up =
    context.latitudeCosine * context.longitudeCosine * itrsX +
    context.latitudeCosine * context.longitudeSine * itrsY +
    context.latitudeSine * itrsZ;
  let correctedEast = east;
  let correctedNorth = north;
  let correctedUp = up;
  if (context.diurnalAberration.mode !== "disabled") {
    // This is the allocation-free scalar form of
    // applyDiurnalAberrationToHorizontalEnu. The public helper retains
    // defensive tuple validation; this hot path already owns a finite ENU
    // direction and is evaluated once per rendered star.
    const geometricInverseLength = 1 / Math.hypot(east, north, up);
    const unitEast = east * geometricInverseLength;
    const unitNorth = north * geometricInverseLength;
    const unitUp = up * geometricInverseLength;
    const correctedInverseLength =
      1 /
      Math.hypot(
        unitEast + context.diurnalAberration.magnitude,
        unitNorth,
        unitUp,
      );
    correctedEast =
      (unitEast + context.diurnalAberration.magnitude) * correctedInverseLength;
    correctedNorth = unitNorth * correctedInverseLength;
    correctedUp = unitUp * correctedInverseLength;
  }
  const horizontalMagnitude = Math.hypot(correctedEast, correctedNorth);
  const azimuthDefined = horizontalMagnitude > 1e-12;
  return {
    altitude: Math.atan2(clampUnit(correctedUp), horizontalMagnitude),
    azimuth: azimuthDefined
      ? normalizeAngle(Math.atan2(correctedEast, correctedNorth))
      : 0,
    azimuthDefined,
  };
}

function assertReusableContext(context: ApparentPositionContextV2): void {
  if (
    context.modelVersion !== 2 ||
    !Object.isFrozen(context) ||
    !Object.isFrozen(context.precessionNutationMatrix) ||
    !Object.isFrozen(context.annualParallax) ||
    !Object.isFrozen(context.solarLightDeflection) ||
    (context.solarLightDeflection.mode !== "disabled" &&
      !Object.isFrozen(
        context.solarLightDeflection.sunToObserverUnitDirection,
      )) ||
    !Object.isFrozen(context.aberration) ||
    !Object.isFrozen(context.diurnalAberration) ||
    !Object.isFrozen(context.polarMotion) ||
    !Object.isFrozen(context.polarMotion.matrix)
  ) {
    throw new TypeError(
      "Context must come from createApparentPositionContextV2",
    );
  }
}

function omittedCorrectionsForModes(
  annualParallaxMode: AnnualParallaxMode,
  solarLightDeflectionMode: SolarLightDeflectionMode,
  diurnalAberrationMode: DiurnalAberrationMode,
  polarMotionMode: PolarMotionMode,
): readonly OmittedCorrection[] {
  const annualCorrections =
    annualParallaxMode === "disabled" || annualParallaxMode === "unavailable"
      ? OMITTED_CORRECTIONS_WITHOUT_ANNUAL_PARALLAX
      : annualParallaxMode === "caller-observer-position"
        ? OMITTED_CORRECTIONS_WITH_CALLER_ANNUAL_PARALLAX
        : OMITTED_CORRECTIONS_WITH_APPROXIMATE_ANNUAL_PARALLAX;
  const omitted: OmittedCorrection[] = [...annualCorrections];
  if (solarLightDeflectionMode === "disabled") {
    omitted.push("solar-light-deflection");
  }
  if (diurnalAberrationMode === "disabled") {
    omitted.push("diurnal-aberration");
  }
  if (polarMotionMode === "disabled" || polarMotionMode === "assumed-zero") {
    omitted.push("polar-motion");
  } else {
    // finals2000A daily EOP omits the IERS subdaily oceanic/lunisolar
    // correction, which remains a documented ~0.1 mas residual in v2.
    omitted.push("subdaily-polar-motion-tides");
  }
  return Object.freeze(omitted);
}

/**
 * Calculate one star using already prepared immutable per-frame state.
 */
function calculateLightweightUnchecked(
  star: PrecisionStar,
  context: ApparentPositionContextV2,
): LightweightApparentStarPositionV2 {
  return calculateLightweightFromSpaceMotion(
    star,
    context,
    propagateSpaceMotionVector(star, context.timeScales.ttJulianDate),
  );
}

function calculateLightweightFromSpaceMotion(
  star: PrecisionStar,
  context: ApparentPositionContextV2,
  spaceMotion: VectorSpaceMotionResult,
): LightweightApparentStarPositionV2 {
  const astrometricDirection = spaceMotion.astrometricDirection;
  let naturalDirection = astrometricDirection;
  let annualParallaxMode: AnnualParallaxMode;
  if (context.annualParallax.mode === "disabled") {
    annualParallaxMode = "disabled";
  } else if (spaceMotion.astrometricPositionAu === null) {
    annualParallaxMode = "unavailable";
  } else {
    annualParallaxMode = context.annualParallax.mode;
    naturalDirection = applyAnnualParallax(
      spaceMotion.astrometricPositionAu,
      context.annualParallax.observerPositionAu,
    );
  }
  const deflectedDirection =
    context.solarLightDeflection.mode === "disabled"
      ? naturalDirection
      : applyPreparedSolarLightDeflectionToUnitDirection(
          naturalDirection,
          context.solarLightDeflection,
        );
  const properDirection =
    context.aberration.mode === "disabled"
      ? deflectedDirection
      : applyPreparedAnnualAberrationToUnitDirection(
          deflectedDirection,
          context.aberration,
        );
  const apparentDirection = multiplyMatrixVector(
    context.precessionNutationMatrix,
    properDirection,
  );
  const apparentEquatorial = unitVectorToEquatorial(apparentDirection);
  const geometricHorizontal = toGeometricHorizontal(apparentDirection, context);

  let observedHorizontal = geometricHorizontal;
  let refractionMode: RefractionMode = "disabled";
  if (context.refraction.mode === "configured") {
    const refracted = applyVisualRefractionWithCoefficients(
      geometricHorizontal.altitude,
      {
        tangent: context.refraction.tangentCoefficient,
        tangentCubed: context.refraction.tangentCubedCoefficient,
      },
      context.refraction.minimumGeometricAltitudeDegrees,
    );
    refractionMode = refracted.mode;
    observedHorizontal = {
      ...geometricHorizontal,
      altitude: refracted.altitude,
    };
  }

  return {
    starHR: star.hr,
    apparentEquatorial,
    geometricHorizontal,
    observedHorizontal,
    projection: horizontalToProjection(observedHorizontal),
    spaceMotionMode: spaceMotion.mode,
    radialVelocityAssumedZero: spaceMotion.radialVelocityAssumedZero,
    annualParallaxMode,
    solarLightDeflectionMode: context.solarLightDeflection.mode,
    diurnalAberrationMode: context.diurnalAberration.mode,
    polarMotionMode: context.polarMotion.mode,
    refractionMode,
  };
}

/**
 * Lightweight result for rendering one star. It deliberately omits the full
 * metadata object; use calculateApparentStarPositionWithContextV2 for a
 * selected star or diagnostics.
 */
export function calculateLightweightApparentStarPositionWithContextV2(
  star: PrecisionStar,
  context: ApparentPositionContextV2,
): LightweightApparentStarPositionV2 {
  assertReusableContext(context);
  return calculateLightweightUnchecked(star, context);
}

/**
 * Render-loop batch API. The context is checked once and no per-star metadata
 * or warning arrays are allocated.
 */
export function calculateLightweightApparentStarPositionsWithContextV2(
  stars: readonly PrecisionStar[],
  context: ApparentPositionContextV2,
): readonly LightweightApparentStarPositionV2[] {
  assertReusableContext(context);
  return Object.freeze(
    stars.map((star) => calculateLightweightUnchecked(star, context)),
  );
}

/**
 * Calculate the Sun's apparent center with the same time scales, Earth
 * orientation, annual/diurnal aberration and CIRS-to-horizon transform used
 * by the stellar v2 pipeline.
 *
 * A century-audited 200-term VSOP2000 truncation supplies the geocentric
 * natural direction and distance. WGS84 site displacement is applied after
 * the Earth-orientation rotations and before split-at-CIRS diurnal
 * aberration, so the horizontal result includes solar diurnal parallax while
 * apparentEquatorial deliberately remains geocentric. The independent
 * diurnal-aberration mode remains visible in the result and can still be
 * disabled. Solar light deflection is intentionally not applied to light
 * emitted by the Sun itself, and optical refraction is not applied so
 * twilight thresholds remain geometric.
 */
export function calculateApparentSunPositionWithContextV2(
  context: ApparentPositionContextV2,
): ApparentSunPositionV2 {
  assertReusableContext(context);
  const earthState = approximateEarthState(context.timeScales.ttJulianDate);
  const naturalDirection = normalizeVector([
    -earthState.positionAu[0],
    -earthState.positionAu[1],
    -earthState.positionAu[2],
  ]);
  const properDirection =
    context.aberration.mode === "disabled"
      ? naturalDirection
      : applyPreparedAnnualAberrationToUnitDirection(
          naturalDirection,
          context.aberration,
        );
  const apparentDirection = multiplyMatrixVector(
    context.precessionNutationMatrix,
    properDirection,
  );
  const geometricHorizontal = toGeometricHorizontal(
    apparentDirection,
    context,
    earthState.sunObserverDistanceAu,
  );
  return {
    apparentEquatorial: unitVectorToEquatorial(apparentDirection),
    geometricHorizontal,
    projection: horizontalToProjection(geometricHorizontal),
    ephemerisMode: "truncated-vsop2000-heliocentric-earth",
    aberrationMode: context.aberration.mode,
    diurnalAberrationMode: context.diurnalAberration.mode,
    polarMotionMode: context.polarMotion.mode,
  };
}

function calculateFullUnchecked(
  star: PrecisionStar,
  context: ApparentPositionContextV2,
): ApparentStarPositionV2 {
  const spaceMotion = propagateSpaceMotionVector(
    star,
    context.timeScales.ttJulianDate,
  );
  const result = calculateLightweightFromSpaceMotion(
    star,
    context,
    spaceMotion,
  );
  const additionalWarnings: PrecisionWarningCode[] = [];
  if (result.spaceMotionMode === "none") {
    additionalWarnings.push("proper-motion-missing");
  }
  if (result.radialVelocityAssumedZero) {
    additionalWarnings.push("radial-velocity-missing-assumed-zero");
  }
  if (result.annualParallaxMode === "unavailable") {
    additionalWarnings.push("annual-parallax-unavailable");
  } else if (
    result.annualParallaxMode === "truncated-vsop2000-heliocentric-earth" ||
    result.annualParallaxMode === "jpl-approximate-earth-moon-barycenter"
  ) {
    additionalWarnings.push("annual-parallax-approximate-ephemeris");
  }
  if (result.refractionMode === "below-model-altitude") {
    additionalWarnings.push("refraction-below-model-altitude");
  }
  return {
    ...result,
    astrometricJ2000: unitVectorToEquatorial(spaceMotion.astrometricDirection),
    metadata: {
      modelVersion: 2,
      catalogFrame: "BSC5P J2000.0 FK5",
      frameConnectionModel: "SOFA FK5-to-Hipparcos J2000 rotation and spin",
      precessionModel: "IAU 2006 Fukushima-Williams",
      nutationModel: "IAU 2000B 77-term",
      siderealTimeModel:
        "IAU 2006 GMST + IAU 2000B leading equation of equinoxes",
      spaceMotionMode: result.spaceMotionMode,
      annualParallaxMode: result.annualParallaxMode,
      solarLightDeflectionMode: result.solarLightDeflectionMode,
      aberrationMode: context.aberration.mode,
      diurnalAberrationMode: result.diurnalAberrationMode,
      polarMotionMode: result.polarMotionMode,
      refractionMode: result.refractionMode,
      omittedCorrections: omittedCorrectionsForModes(
        result.annualParallaxMode,
        result.solarLightDeflectionMode,
        result.diurnalAberrationMode,
        result.polarMotionMode,
      ),
      timeScales: context.timeScales,
      warnings:
        additionalWarnings.length === 0
          ? context.baseWarnings
          : uniqueWarnings([...context.baseWarnings, ...additionalWarnings]),
    },
  };
}

export function calculateApparentStarPositionWithContextV2(
  star: PrecisionStar,
  context: ApparentPositionContextV2,
): ApparentStarPositionV2 {
  assertReusableContext(context);
  return calculateFullUnchecked(star, context);
}

/**
 * Batch helper that guarantees one shared context for the complete star list.
 */
export function calculateApparentStarPositionsWithContextV2(
  stars: readonly PrecisionStar[],
  context: ApparentPositionContextV2,
): readonly ApparentStarPositionV2[] {
  assertReusableContext(context);
  return Object.freeze(
    stars.map((star) => calculateFullUnchecked(star, context)),
  );
}

/**
 * Backward-compatible v2 convenience wrapper for one-off calculations.
 * Render loops should create and reuse an ApparentPositionContextV2 instead.
 */
export function calculateApparentStarPositionV2(
  star: PrecisionStar,
  date: Date,
  location: ObservingLocation,
  options: ApparentPositionOptionsV2 = {},
): ApparentStarPositionV2 {
  return calculateApparentStarPositionWithContextV2(
    star,
    createApparentPositionContextV2(date, location, options),
  );
}
