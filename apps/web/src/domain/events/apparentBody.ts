import type { ObservingLocation } from "../types";
import {
  applyAnnualAberration,
  approximateTioLocator,
  greenwichApparentSiderealTime2006B,
  polarMotionMatrix2000,
  precessionNutationMatrix2006B,
  wgs84ObserverPositionItrsAu,
} from "../precision";
import {
  ASTRONOMICAL_UNIT_KILOMETERS,
  SECONDS_PER_DAY,
  SPEED_OF_LIGHT_KILOMETERS_PER_SECOND,
  clampUnit,
  normalizeAngle,
} from "../precision/constants";
import {
  magnitude,
  multiplyMatrixVector,
  normalizeVector,
} from "../precision/vector";
import type { Matrix3, Vector3 } from "../precision/vector";
import { degreesToRadians } from "../angles";
import { eventEphemerisState } from "./ephemerisCoverage";
import { ttToTdbJulianDate } from "./eventTime";
import type {
  ApparentBodyState,
  ApparentGeocentricBodyState,
  EventEphemerisProvider,
  EventSolarSystemBody,
} from "./types";

const SUN_MEAN_RADIUS_KILOMETERS = 695_700;
const MOON_MEAN_RADIUS_KILOMETERS = 1_737.4;
const SPEED_OF_LIGHT_KILOMETERS_PER_DAY =
  SPEED_OF_LIGHT_KILOMETERS_PER_SECOND * SECONDS_PER_DAY;

export interface EventApparentBodyOptions {
  readonly heightMeters?: number;
  readonly polarMotion?: {
    readonly xpRadians: number;
    readonly ypRadians: number;
  };
}

function add(left: Vector3, right: Vector3): Vector3 {
  return [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
  ];
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function scale(vector: Vector3, factor: number): Vector3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function transpose(matrix: Matrix3): Matrix3 {
  return [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]],
  ];
}

function rotateCirsToTirs(vector: Vector3, angle: number): Vector3 {
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  return [
    cosine * vector[0] + sine * vector[1],
    -sine * vector[0] + cosine * vector[1],
    vector[2],
  ];
}

function rotateTirsToCirs(vector: Vector3, angle: number): Vector3 {
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  return [
    cosine * vector[0] - sine * vector[1],
    sine * vector[0] + cosine * vector[1],
    vector[2],
  ];
}

interface PreparedObserver {
  readonly barycentricPositionKilometers: Vector3;
  readonly barycentricVelocityKilometersPerDay: Vector3;
  readonly precessionNutation: Matrix3;
  readonly polarMotion: Matrix3;
  readonly greenwichApparentSiderealTime: number;
  readonly latitudeRadians: number;
  readonly longitudeRadians: number;
  readonly sunDistanceAu: number;
}

function prepareObserver(
  ephemeris: EventEphemerisProvider,
  tdbJulianDate: number,
  ttJulianDate: number,
  ut1JulianDate: number,
  location: ObservingLocation,
  options: EventApparentBodyOptions,
): PreparedObserver {
  const heightMeters = options.heightMeters ?? 0;
  if (!Number.isFinite(heightMeters)) {
    throw new RangeError("Observer height must be finite");
  }
  const latitudeRadians = degreesToRadians(location.latitude);
  const longitudeRadians = degreesToRadians(location.longitude);
  const precessionNutation =
    precessionNutationMatrix2006B(ttJulianDate);
  const greenwichApparentSiderealTime =
    greenwichApparentSiderealTime2006B(
      ut1JulianDate,
      ttJulianDate,
    );
  const xpRadians = options.polarMotion?.xpRadians ?? 0;
  const ypRadians = options.polarMotion?.ypRadians ?? 0;
  const polarMotion = polarMotionMatrix2000(
    xpRadians,
    ypRadians,
    approximateTioLocator(ttJulianDate),
  );
  const itrsSiteAu = wgs84ObserverPositionItrsAu(
    latitudeRadians,
    longitudeRadians,
    heightMeters,
  );
  const itrsSiteKilometers = scale(
    itrsSiteAu,
    ASTRONOMICAL_UNIT_KILOMETERS,
  );
  const tirsSiteKilometers = multiplyMatrixVector(
    transpose(polarMotion),
    itrsSiteKilometers,
  );
  const cirsSiteKilometers = rotateTirsToCirs(
    tirsSiteKilometers,
    greenwichApparentSiderealTime,
  );
  const icrfSiteKilometers = multiplyMatrixVector(
    transpose(precessionNutation),
    cirsSiteKilometers,
  );
  const earthRotationRadiansPerDay =
    1.002_737_811_911_354_6 * 2 * Math.PI;
  const cirsSiteVelocityKilometersPerDay: Vector3 = [
    -earthRotationRadiansPerDay * cirsSiteKilometers[1],
    earthRotationRadiansPerDay * cirsSiteKilometers[0],
    0,
  ];
  const icrfSiteVelocityKilometersPerDay =
    multiplyMatrixVector(
      transpose(precessionNutation),
      cirsSiteVelocityKilometersPerDay,
    );
  const receptionState = eventEphemerisState(
    ephemeris,
    tdbJulianDate,
  );
  const barycentricPositionKilometers = add(
    receptionState.earthBarycentric.positionKilometers,
    icrfSiteKilometers,
  );
  const barycentricVelocityKilometersPerDay = add(
    receptionState.earthBarycentric.velocityKilometersPerDay,
    icrfSiteVelocityKilometersPerDay,
  );
  const topocentricSun = subtract(
    receptionState.sunGeocentric.positionKilometers,
    icrfSiteKilometers,
  );
  return {
    barycentricPositionKilometers,
    barycentricVelocityKilometersPerDay,
    precessionNutation,
    polarMotion,
    greenwichApparentSiderealTime,
    latitudeRadians,
    longitudeRadians,
    sunDistanceAu:
      magnitude(topocentricSun) / ASTRONOMICAL_UNIT_KILOMETERS,
  };
}

function targetBarycentricPosition(
  ephemeris: EventEphemerisProvider,
  body: EventSolarSystemBody,
  tdbJulianDate: number,
): Vector3 {
  const state = eventEphemerisState(ephemeris, tdbJulianDate);
  const geocentric =
    body === "sun" ? state.sunGeocentric : state.moonGeocentric;
  return add(
    state.earthBarycentric.positionKilometers,
    geocentric.positionKilometers,
  );
}

function horizontalFromCirs(
  cirsDirection: Vector3,
  observer: PreparedObserver,
): ApparentBodyState["horizontal"] {
  const tirs = rotateCirsToTirs(
    cirsDirection,
    observer.greenwichApparentSiderealTime,
  );
  const itrs = multiplyMatrixVector(observer.polarMotion, tirs);
  const latitudeSine = Math.sin(observer.latitudeRadians);
  const latitudeCosine = Math.cos(observer.latitudeRadians);
  const longitudeSine = Math.sin(observer.longitudeRadians);
  const longitudeCosine = Math.cos(observer.longitudeRadians);
  const east =
    -longitudeSine * itrs[0] + longitudeCosine * itrs[1];
  const north =
    -latitudeSine * longitudeCosine * itrs[0] -
    latitudeSine * longitudeSine * itrs[1] +
    latitudeCosine * itrs[2];
  const up =
    latitudeCosine * longitudeCosine * itrs[0] +
    latitudeCosine * longitudeSine * itrs[1] +
    latitudeSine * itrs[2];
  const horizontalMagnitude = Math.hypot(east, north);
  return {
    altitude: Math.atan2(clampUnit(up), horizontalMagnitude),
    azimuth:
      horizontalMagnitude > 1e-12
        ? normalizeAngle(Math.atan2(east, north))
        : 0,
    azimuthDefined: horizontalMagnitude > 1e-12,
  };
}

/**
 * Computes one finite-distance apparent body at the reception epoch.
 *
 * Target light time is iterated in barycentric ICRF. The terrestrial site is
 * transformed from WGS84/ITRS to ICRF, and its rotational velocity is added
 * to the geocenter velocity before relativistic aberration. Atmospheric
 * refraction and lunar limb topography are intentionally absent.
 */
export function calculateApparentBody(
  ephemeris: EventEphemerisProvider,
  body: EventSolarSystemBody,
  ttJulianDate: number,
  ut1JulianDate: number,
  location: ObservingLocation,
  options: EventApparentBodyOptions = {},
): ApparentBodyState {
  if (
    !Number.isFinite(ttJulianDate) ||
    !Number.isFinite(ut1JulianDate)
  ) {
    throw new RangeError("Event TT and UT1 Julian dates must be finite");
  }
  const tdbJulianDate = ttToTdbJulianDate(ttJulianDate);
  const observer = prepareObserver(
    ephemeris,
    tdbJulianDate,
    ttJulianDate,
    ut1JulianDate,
    location,
    options,
  );

  let emissionTdbJulianDate = tdbJulianDate;
  let topocentric = subtract(
    targetBarycentricPosition(
      ephemeris,
      body,
      emissionTdbJulianDate,
    ),
    observer.barycentricPositionKilometers,
  );
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const lightTimeDays =
      magnitude(topocentric) / SPEED_OF_LIGHT_KILOMETERS_PER_DAY;
    emissionTdbJulianDate = tdbJulianDate - lightTimeDays;
    topocentric = subtract(
      targetBarycentricPosition(
        ephemeris,
        body,
        emissionTdbJulianDate,
      ),
      observer.barycentricPositionKilometers,
    );
  }

  const distanceKilometers = magnitude(topocentric);
  const naturalDirection = normalizeVector(topocentric);
  const observerVelocityC = scale(
    observer.barycentricVelocityKilometersPerDay,
    1 / SPEED_OF_LIGHT_KILOMETERS_PER_DAY,
  );
  const icrfDirection = applyAnnualAberration(
    naturalDirection,
    observerVelocityC,
    observer.sunDistanceAu,
  );
  const cirsDirection = multiplyMatrixVector(
    observer.precessionNutation,
    icrfDirection,
  );
  const radiusKilometers =
    body === "sun"
      ? SUN_MEAN_RADIUS_KILOMETERS
      : MOON_MEAN_RADIUS_KILOMETERS;
  return {
    body,
    tdbJulianDate,
    lightTimeSeconds:
      ((tdbJulianDate - emissionTdbJulianDate) * SECONDS_PER_DAY),
    distanceKilometers,
    angularRadiusRadians: Math.asin(
      clampUnit(radiusKilometers / distanceKilometers),
    ),
    icrfDirection,
    cirsDirection,
    horizontal: horizontalFromCirs(cirsDirection, observer),
  };
}

/**
 * Geocentric counterpart used by global eclipse geometry.
 *
 * It applies target light time and the geocenter's barycentric aberration,
 * but deliberately omits terrestrial site displacement and rotation.
 */
export function calculateGeocentricApparentBody(
  ephemeris: EventEphemerisProvider,
  body: EventSolarSystemBody,
  ttJulianDate: number,
): ApparentGeocentricBodyState {
  if (!Number.isFinite(ttJulianDate)) {
    throw new RangeError("Event TT Julian date must be finite");
  }
  const tdbJulianDate = ttToTdbJulianDate(ttJulianDate);
  const receptionState = eventEphemerisState(
    ephemeris,
    tdbJulianDate,
  );
  const observerPosition =
    receptionState.earthBarycentric.positionKilometers;
  let emissionTdbJulianDate = tdbJulianDate;
  let geocentric = subtract(
    targetBarycentricPosition(
      ephemeris,
      body,
      emissionTdbJulianDate,
    ),
    observerPosition,
  );
  for (let iteration = 0; iteration < 4; iteration += 1) {
    emissionTdbJulianDate =
      tdbJulianDate -
      magnitude(geocentric) / SPEED_OF_LIGHT_KILOMETERS_PER_DAY;
    geocentric = subtract(
      targetBarycentricPosition(
        ephemeris,
        body,
        emissionTdbJulianDate,
      ),
      observerPosition,
    );
  }
  const distanceKilometers = magnitude(geocentric);
  const observerVelocityC = scale(
    receptionState.earthBarycentric.velocityKilometersPerDay,
    1 / SPEED_OF_LIGHT_KILOMETERS_PER_DAY,
  );
  const sunDistanceAu =
    magnitude(receptionState.sunGeocentric.positionKilometers) /
    ASTRONOMICAL_UNIT_KILOMETERS;
  const icrfDirection = applyAnnualAberration(
    normalizeVector(geocentric),
    observerVelocityC,
    sunDistanceAu,
  );
  const cirsDirection = multiplyMatrixVector(
    precessionNutationMatrix2006B(ttJulianDate),
    icrfDirection,
  );
  const radiusKilometers =
    body === "sun"
      ? SUN_MEAN_RADIUS_KILOMETERS
      : MOON_MEAN_RADIUS_KILOMETERS;
  return {
    body,
    tdbJulianDate,
    lightTimeSeconds:
      (tdbJulianDate - emissionTdbJulianDate) * SECONDS_PER_DAY,
    distanceKilometers,
    angularRadiusRadians: Math.asin(
      clampUnit(radiusKilometers / distanceKilometers),
    ),
    icrfDirection,
    cirsDirection,
  };
}

export function angularSeparationRadians(
  first: Vector3,
  second: Vector3,
): number {
  const crossX = first[1] * second[2] - first[2] * second[1];
  const crossY = first[2] * second[0] - first[0] * second[2];
  const crossZ = first[0] * second[1] - first[1] * second[0];
  return Math.atan2(
    Math.hypot(crossX, crossY, crossZ),
    first[0] * second[0] +
      first[1] * second[1] +
      first[2] * second[2],
  );
}
