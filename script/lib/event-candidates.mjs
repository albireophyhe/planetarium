import { gzipSync } from "node:zlib";
import {
  DE442S_SOURCE,
  SECONDS_PER_DAY,
  digest,
  evaluateChebyshevRecord,
  gregorianJulianDateAtMidnight,
  parseDafSpk,
  prepareType2Segment,
  readType2Record,
  secondsPastJ2000FromJulianDate,
  type2RecordIndexAt,
} from "./de442s-ephemeris.mjs";

export const EVENT_CANDIDATE_MODEL =
  "de442s-mean-sphere-eclipse-candidates-v1";
export const EVENT_CANDIDATE_START_YEAR = 1900;
export const EVENT_CANDIDATE_END_YEAR = 2101;
export const EVENT_CANDIDATE_CHUNK_YEARS = 5;
export const EVENT_CANDIDATE_SCAN_STEP_DAYS = 0.5;
export const EVENT_CANDIDATE_SEARCH_HALF_WINDOW_DAYS = 0.75;
export const OCCULTATION_SCAN_STEP_DAYS = 0.125;
export const OCCULTATION_MAXIMUM_V_MAGNITUDE = 3;
export const OCCULTATION_ECLIPTIC_PREFILTER_DEGREES = 8;
export const OCCULTATION_INCLUSION_MARGIN_ARCSECONDS = 120;

export const EVENT_CANDIDATE_PATHS = Object.freeze({
  directory: "shared/events",
  manifest: "shared/events/event-candidates-manifest.v1.json",
  chunks: "shared/events/chunks",
  fixture: "shared/fixtures/event-candidates.v1.json",
  manifestSchema: "shared/schema/event-candidates-manifest.schema.json",
  chunkSchema: "shared/schema/event-candidates-chunk.schema.json",
  fixtureSchema: "shared/schema/event-candidates-fixture.schema.json",
});

// IAU 2015 nominal solar radius and conventional mean lunar radius.
// Solar eclipse penumbral/umbral radii follow the NASA Besselian constants.
export const ECLIPSE_CONSTANTS = Object.freeze({
  earthEquatorialRadiusKilometers: 6_378.137,
  earthPolarRadiusKilometers: 6_356.752_314_245,
  sunNominalRadiusKilometers: 695_700,
  moonMeanRadiusKilometers: 1_737.4,
  solarPenumbralLunarRadiusRatio: 0.272_488,
  solarUmbralLunarRadiusRatio: 0.272_281,
  lunarShadowDanjonScale: 1.01,
  solarClassificationBoundaryToleranceKilometers: 1.5,
});

export const NASA_ECLIPSE_CATALOGS = Object.freeze([
  Object.freeze({
    kind: "solar-eclipse",
    startYear: 1901,
    endYear: 2000,
    expectedCount: 228,
    url: "https://eclipse.gsfc.nasa.gov/SEcat5/SE1901-2000.html",
  }),
  Object.freeze({
    kind: "solar-eclipse",
    startYear: 2001,
    endYear: 2100,
    expectedCount: 224,
    url: "https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html",
  }),
  Object.freeze({
    kind: "lunar-eclipse",
    startYear: 1901,
    endYear: 2000,
    expectedCount: 229,
    url: "https://eclipse.gsfc.nasa.gov/LEcat5/LE1901-2000.html",
  }),
  Object.freeze({
    kind: "lunar-eclipse",
    startYear: 2001,
    endYear: 2100,
    expectedCount: 228,
    url: "https://eclipse.gsfc.nasa.gov/LEcat5/LE2001-2100.html",
  }),
]);

const MONTH_BY_ABBREVIATION = Object.freeze({
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
});

const J2000_JULIAN_DATE = 2_451_545;
const DAYS_PER_JULIAN_YEAR = 365.25;
const ARCSECONDS_TO_RADIANS = Math.PI / (180 * 3_600);
const DEGREES_TO_RADIANS = Math.PI / 180;
const J2000_MEAN_OBLIQUITY_RADIANS =
  23.439_291_1 * DEGREES_TO_RADIANS;

function fail(message) {
  throw new Error(`Event candidates: ${message}`);
}

function add(left, right) {
  return [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
  ];
}

function subtract(left, right) {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function scale(vector, factor) {
  return vector.map((component) => component * factor);
}

function dot(left, right) {
  return (
    left[0] * right[0] +
    left[1] * right[1] +
    left[2] * right[2]
  );
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

function rotationVectorToMatrix(vector) {
  let [x, y, z] = vector;
  const angle = Math.hypot(x, y, z);
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  const oneMinusCosine = 1 - cosine;
  if (angle > 0) {
    x /= angle;
    y /= angle;
    z /= angle;
  }
  return [
    [
      x * x * oneMinusCosine + cosine,
      x * y * oneMinusCosine + z * sine,
      x * z * oneMinusCosine - y * sine,
    ],
    [
      y * x * oneMinusCosine - z * sine,
      y * y * oneMinusCosine + cosine,
      y * z * oneMinusCosine + x * sine,
    ],
    [
      z * x * oneMinusCosine + y * sine,
      z * y * oneMinusCosine - x * sine,
      z * z * oneMinusCosine + cosine,
    ],
  ];
}

const FK5_TO_HIPPARCOS_MATRIX = rotationVectorToMatrix([
  -19.9e-3 * ARCSECONDS_TO_RADIANS,
  -9.1e-3 * ARCSECONDS_TO_RADIANS,
  22.9e-3 * ARCSECONDS_TO_RADIANS,
]);
const FK5_TO_HIPPARCOS_SPIN = [
  -0.3e-3 * ARCSECONDS_TO_RADIANS,
  0.6e-3 * ARCSECONDS_TO_RADIANS,
  0.7e-3 * ARCSECONDS_TO_RADIANS,
];

function norm(vector) {
  return Math.hypot(...vector);
}

function unit(vector) {
  const length = norm(vector);
  if (!(length > 0)) {
    fail("cannot normalize a zero-length vector");
  }
  return scale(vector, 1 / length);
}

function angularSeparation(left, right) {
  const leftUnit = unit(left);
  const rightUnit = unit(right);
  return Math.atan2(norm(cross(leftUnit, rightUnit)), dot(leftUnit, rightUnit));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function asinRatio(numerator, denominator) {
  return Math.asin(clamp(numerator / denominator, -1, 1));
}

function round(value, fractionalDigits = 12) {
  return Number(value.toFixed(fractionalDigits));
}

export function julianDateTdbToIso(julianDateTdb) {
  if (!Number.isFinite(julianDateTdb)) {
    fail("Julian Date must be finite");
  }
  const unixMilliseconds =
    (julianDateTdb - 2_440_587.5) * SECONDS_PER_DAY * 1_000;
  return new Date(unixMilliseconds)
    .toISOString()
    .replace("Z", " TDB");
}

export function isoCalendarDateFromJulianDate(julianDate) {
  return julianDateTdbToIso(julianDate).slice(0, 10);
}

function locateType2Segment(parsedSpk, targetNaifId, centerNaifId) {
  const matches = parsedSpk.segments.filter(
    (segment) =>
      segment.targetNaifId === targetNaifId &&
      segment.centerNaifId === centerNaifId &&
      segment.frameNaifId === 1 &&
      segment.spkDataType === 2,
  );
  if (matches.length !== 1) {
    fail(
      `expected one J2000 Type 2 segment for ${targetNaifId}/${centerNaifId}, ` +
        `found ${matches.length}`,
    );
  }
  return prepareType2Segment(parsedSpk.source, matches[0]);
}

function createSegmentEvaluator(parsedSpk, segment) {
  let cachedRecordIndex = -1;
  let cachedRecord;
  return (secondsPastJ2000Tdb) => {
    const recordIndex = type2RecordIndexAt(
      segment,
      secondsPastJ2000Tdb,
    );
    if (recordIndex !== cachedRecordIndex) {
      cachedRecord = readType2Record(
        parsedSpk.source,
        segment,
        recordIndex,
      );
      cachedRecordIndex = recordIndex;
    }
    return evaluateChebyshevRecord(
      cachedRecord,
      secondsPastJ2000Tdb,
    ).positionKilometers;
  };
}

export function createDe442sGeocentricEvaluator(sourceBytes) {
  const source = Buffer.from(sourceBytes);
  if (
    source.byteLength !== DE442S_SOURCE.byteLength ||
    digest("sha256", source) !== DE442S_SOURCE.sha256
  ) {
    fail("source is not the pinned JPL DE442s kernel");
  }
  const parsedSpk = parseDafSpk(source);
  const earthFromEmb = createSegmentEvaluator(
    parsedSpk,
    locateType2Segment(parsedSpk, 399, 3),
  );
  const moonFromEmb = createSegmentEvaluator(
    parsedSpk,
    locateType2Segment(parsedSpk, 301, 3),
  );
  const sunFromSsb = createSegmentEvaluator(
    parsedSpk,
    locateType2Segment(parsedSpk, 10, 0),
  );
  const embFromSsb = createSegmentEvaluator(
    parsedSpk,
    locateType2Segment(parsedSpk, 3, 0),
  );

  return (julianDateTdb) => {
    const secondsPastJ2000Tdb =
      secondsPastJ2000FromJulianDate(julianDateTdb);
    const earthBarycentric = add(
      embFromSsb(secondsPastJ2000Tdb),
      earthFromEmb(secondsPastJ2000Tdb),
    );
    return {
      sunPositionKilometers: subtract(
        sunFromSsb(secondsPastJ2000Tdb),
        earthBarycentric,
      ),
      moonPositionKilometers: subtract(
        moonFromEmb(secondsPastJ2000Tdb),
        earthFromEmb(secondsPastJ2000Tdb),
      ),
    };
  };
}

export function solarCandidateGeometry(geocentricState) {
  const {
    earthEquatorialRadiusKilometers: earthRadius,
    earthPolarRadiusKilometers: earthPolarRadius,
    sunNominalRadiusKilometers: sunRadius,
    solarPenumbralLunarRadiusRatio,
    solarUmbralLunarRadiusRatio,
  } = ECLIPSE_CONSTANTS;
  const sun = geocentricState.sunPositionKilometers;
  const moon = geocentricState.moonPositionKilometers;
  const moonPenumbralRadius =
    solarPenumbralLunarRadiusRatio * earthRadius;
  const moonUmbralRadius =
    solarUmbralLunarRadiusRatio * earthRadius;
  const sunToMoon = subtract(moon, sun);
  const sunToMoonDistance = norm(sunToMoon);
  const shadowAxisDirection = unit(sunToMoon);
  const axisProjectionKilometers = -dot(moon, shadowAxisDirection);
  const closestAxisPoint = add(
    moon,
    scale(shadowAxisDirection, axisProjectionKilometers),
  );
  const axisDistanceKilometers = norm(closestAxisPoint);
  const penumbraRadiusKilometers =
    moonPenumbralRadius +
    axisProjectionKilometers *
      ((sunRadius + moonPenumbralRadius) / sunToMoonDistance);
  const umbraRadiusKilometers =
    moonUmbralRadius -
    axisProjectionKilometers *
      ((sunRadius - moonUmbralRadius) / sunToMoonDistance);
  const axisSlope = (sunRadius - moonUmbralRadius) / sunToMoonDistance;
  const candidateLimitKilometers =
    earthRadius + penumbraRadiusKilometers;
  let classificationHint = "partial";
  let centralityHint = "partial";
  if (axisDistanceKilometers <= earthRadius) {
    centralityHint = "central";
    const halfChordKilometers = Math.sqrt(
      Math.max(
        0,
        earthRadius ** 2 - axisDistanceKilometers ** 2,
      ),
    );
    const nearSideUmbraRadius =
      umbraRadiusKilometers + axisSlope * halfChordKilometers;
    if (nearSideUmbraRadius > 0) {
      classificationHint = "total";
    } else {
      classificationHint = "annular";
    }
  } else if (
    axisDistanceKilometers <=
    earthPolarRadius + Math.abs(umbraRadiusKilometers)
  ) {
    centralityHint = "non-central";
    classificationHint =
      umbraRadiusKilometers > 0 ? "total" : "annular";
  }

  return {
    classificationHint,
    centralityHint,
    centerSeparationRadians: angularSeparation(sun, moon),
    axisDistanceKilometers,
    candidateLimitKilometers,
    clearanceKilometers:
      candidateLimitKilometers - axisDistanceKilometers,
    penumbraRadiusKilometers,
    umbraRadiusKilometers,
    nearSideUmbraRadiusKilometers:
      axisDistanceKilometers <= earthRadius
        ? umbraRadiusKilometers +
          axisSlope *
            Math.sqrt(
              Math.max(
                0,
                earthRadius ** 2 - axisDistanceKilometers ** 2,
              ),
            )
        : undefined,
  };
}

export function classifySolarCandidateAcrossPath(
  stateAt,
  maximumJulianDateTdb,
) {
  let sawAnnular = false;
  let sawTotal = false;
  let sawCentral = false;
  let minimumNearSideUmbraRadius = Infinity;
  const sampleStepDays = 60 / SECONDS_PER_DAY;
  for (
    let offsetDays = -0.35;
    offsetDays <= 0.35 + sampleStepDays / 2;
    offsetDays += sampleStepDays
  ) {
    const geometry = solarCandidateGeometry(
      stateAt(maximumJulianDateTdb + offsetDays),
    );
    if (geometry.centralityHint !== "central") {
      continue;
    }
    sawCentral = true;
    minimumNearSideUmbraRadius = Math.min(
      minimumNearSideUmbraRadius,
      geometry.nearSideUmbraRadiusKilometers,
    );
    if (geometry.nearSideUmbraRadiusKilometers > 0) {
      sawTotal = true;
    } else {
      sawAnnular = true;
    }
  }
  if (sawAnnular && sawTotal) {
    return "hybrid";
  }
  const boundaryTolerance =
    ECLIPSE_CONSTANTS
      .solarClassificationBoundaryToleranceKilometers;
  if (
    sawTotal &&
    minimumNearSideUmbraRadius <= boundaryTolerance
  ) {
    return "hybrid";
  }
  if (sawTotal) {
    return "total";
  }
  if (sawAnnular) {
    return "annular";
  }
  return sawCentral ? "partial" : undefined;
}

export function lunarCandidateGeometry(geocentricState) {
  const {
    earthEquatorialRadiusKilometers: earthRadius,
    sunNominalRadiusKilometers: sunRadius,
    moonMeanRadiusKilometers: moonRadius,
    lunarShadowDanjonScale,
  } = ECLIPSE_CONSTANTS;
  const sun = geocentricState.sunPositionKilometers;
  const moon = geocentricState.moonPositionKilometers;
  const sunDistance = norm(sun);
  const moonDistance = norm(moon);
  const centerSeparationRadians = angularSeparation(
    moon,
    scale(sun, -1),
  );
  const lunarHorizontalParallaxRadians = asinRatio(
    earthRadius,
    moonDistance,
  );
  const sunSemiDiameterRadians = asinRatio(sunRadius, sunDistance);
  const solarHorizontalParallaxRadians = asinRatio(
    earthRadius,
    sunDistance,
  );
  const moonSemiDiameterRadians = asinRatio(moonRadius, moonDistance);
  const penumbraRadiusRadians =
    lunarShadowDanjonScale * lunarHorizontalParallaxRadians +
    sunSemiDiameterRadians +
    solarHorizontalParallaxRadians;
  const umbraRadiusRadians =
    lunarShadowDanjonScale * lunarHorizontalParallaxRadians -
    sunSemiDiameterRadians +
    solarHorizontalParallaxRadians;
  const candidateLimitRadians =
    penumbraRadiusRadians + moonSemiDiameterRadians;
  let classificationHint = "penumbral";
  if (
    centerSeparationRadians <=
    umbraRadiusRadians - moonSemiDiameterRadians
  ) {
    classificationHint = "total";
  } else if (
    centerSeparationRadians <=
    umbraRadiusRadians + moonSemiDiameterRadians
  ) {
    classificationHint = "partial";
  }

  return {
    classificationHint,
    centerSeparationRadians,
    candidateLimitRadians,
    clearanceRadians:
      candidateLimitRadians - centerSeparationRadians,
    penumbraRadiusRadians,
    umbraRadiusRadians,
    moonSemiDiameterRadians,
  };
}

function prepareOccultationStar(star, nameByHr) {
  const [
    hr,
    hd,
    rightAscensionRadians,
    declinationRadians,
    vMagnitude,
    ,
    catalogName,
    ,
    properMotionRaCosDecArcsecondsPerYear,
    properMotionDecArcsecondsPerYear,
  ] = star;
  const cosineDeclination = Math.cos(declinationRadians);
  const sineDeclination = Math.sin(declinationRadians);
  const cosineRightAscension = Math.cos(rightAscensionRadians);
  const sineRightAscension = Math.sin(rightAscensionRadians);
  const positionFk5 = [
    cosineDeclination * cosineRightAscension,
    cosineDeclination * sineRightAscension,
    sineDeclination,
  ];
  const tangentRightAscension = [
    -sineRightAscension,
    cosineRightAscension,
    0,
  ];
  const tangentDeclination = [
    -sineDeclination * cosineRightAscension,
    -sineDeclination * sineRightAscension,
    cosineDeclination,
  ];
  const velocityFk5 = add(
    scale(
      tangentRightAscension,
      (properMotionRaCosDecArcsecondsPerYear ?? 0) *
        ARCSECONDS_TO_RADIANS,
    ),
    scale(
      tangentDeclination,
      (properMotionDecArcsecondsPerYear ?? 0) *
        ARCSECONDS_TO_RADIANS,
    ),
  );
  const frameSpinVelocity = cross(
    positionFk5,
    FK5_TO_HIPPARCOS_SPIN,
  );
  const positionIcrs = multiplyMatrixVector(
    FK5_TO_HIPPARCOS_MATRIX,
    positionFk5,
  );
  const velocityIcrsPerJulianYear = multiplyMatrixVector(
    FK5_TO_HIPPARCOS_MATRIX,
    add(velocityFk5, frameSpinVelocity),
  );
  const eclipticLatitudeRadians = Math.asin(
    clamp(
      -Math.sin(J2000_MEAN_OBLIQUITY_RADIANS) * positionIcrs[1] +
        Math.cos(J2000_MEAN_OBLIQUITY_RADIANS) * positionIcrs[2],
      -1,
      1,
    ),
  );
  const properName = nameByHr.get(hr);
  return {
    hr,
    hd,
    label: properName?.name ?? catalogName ?? `HR ${hr}`,
    labelJa: properName?.nameJa ?? null,
    vMagnitude,
    eclipticLatitudeRadians,
    directionAt(julianDateTdb) {
      const yearsSinceJ2000 =
        (julianDateTdb - J2000_JULIAN_DATE) /
        DAYS_PER_JULIAN_YEAR;
      return unit(
        add(
          positionIcrs,
          scale(velocityIcrsPerJulianYear, yearsSinceJ2000),
        ),
      );
    },
  };
}

export function selectOccultationStars(catalog, starNames) {
  if (
    catalog?.schemaVersion !== 2 ||
    catalog?.referenceSystem !== "FK5" ||
    !Array.isArray(catalog.stars) ||
    !Array.isArray(starNames?.stars)
  ) {
    fail("bright-star catalog or name catalog is invalid");
  }
  const nameByHr = new Map(
    starNames.stars.map((star) => [star.hr, star]),
  );
  const latitudeLimit =
    OCCULTATION_ECLIPTIC_PREFILTER_DEGREES * DEGREES_TO_RADIANS;
  return catalog.stars
    .filter(
      (star) =>
        Number.isFinite(star[4]) &&
        star[4] <= OCCULTATION_MAXIMUM_V_MAGNITUDE,
    )
    .map((star) => prepareOccultationStar(star, nameByHr))
    .filter(
      (star) =>
        Math.abs(star.eclipticLatitudeRadians) <= latitudeLimit,
    )
    .sort((left, right) => left.hr - right.hr);
}

function occultationGeometry(state, starDirection) {
  const moon = state.moonPositionKilometers;
  const moonDistance = norm(moon);
  const moonSemiDiameterRadians = asinRatio(
    ECLIPSE_CONSTANTS.moonMeanRadiusKilometers,
    moonDistance,
  );
  const lunarHorizontalParallaxRadians = asinRatio(
    ECLIPSE_CONSTANTS.earthEquatorialRadiusKilometers,
    moonDistance,
  );
  const inclusionMarginRadians =
    OCCULTATION_INCLUSION_MARGIN_ARCSECONDS *
    ARCSECONDS_TO_RADIANS;
  const centerSeparationRadians = angularSeparation(
    moon,
    starDirection,
  );
  const candidateLimitRadians =
    moonSemiDiameterRadians +
    lunarHorizontalParallaxRadians +
    inclusionMarginRadians;
  return {
    centerSeparationRadians,
    candidateLimitRadians,
    clearanceRadians:
      candidateLimitRadians - centerSeparationRadians,
  };
}

function compactOccultationCandidate(
  maximumJulianDateTdb,
  geometry,
  star,
) {
  const maximum = round(maximumJulianDateTdb, 9);
  const date = isoCalendarDateFromJulianDate(maximum);
  return {
    id:
      `lo-${date.replaceAll("-", "")}-` +
      `hr${String(star.hr).padStart(4, "0")}`,
    kind: "lunar-occultation",
    classificationHint: "occultation",
    maximumJulianDateTdb: maximum,
    maximumIsoTdb: julianDateTdbToIso(maximum),
    searchStartJulianDateTdb: round(
      maximum - EVENT_CANDIDATE_SEARCH_HALF_WINDOW_DAYS,
      9,
    ),
    searchEndJulianDateTdb: round(
      maximum + EVENT_CANDIDATE_SEARCH_HALF_WINDOW_DAYS,
      9,
    ),
    centerSeparationRadians: round(
      geometry.centerSeparationRadians,
      12,
    ),
    candidateLimitRadians: round(
      geometry.candidateLimitRadians,
      12,
    ),
    clearanceRadians: round(geometry.clearanceRadians, 12),
    target: {
      catalog: "BSC5P",
      hr: star.hr,
      hd: star.hd,
      label: star.label,
      labelJa: star.labelJa,
      vMagnitude: star.vMagnitude,
    },
  };
}

export function buildLunarOccultationCandidates(
  sourceBytes,
  catalog,
  starNames,
) {
  const stateAt = createDe442sGeocentricEvaluator(sourceBytes);
  const stars = selectOccultationStars(catalog, starNames);
  const coverageStartJulianDateTdb = gregorianJulianDateAtMidnight(
    EVENT_CANDIDATE_START_YEAR,
  );
  const coverageEndJulianDateTdb = gregorianJulianDateAtMidnight(
    EVENT_CANDIDATE_END_YEAR,
  );
  const candidates = [];
  const separationAt = (julianDateTdb, star) =>
    angularSeparation(
      stateAt(julianDateTdb).moonPositionKilometers,
      star.directionAt(julianDateTdb),
    );
  const scanState = new Map();
  for (const star of stars) {
    scanState.set(star.hr, {
      before: separationAt(coverageStartJulianDateTdb, star),
      middle: separationAt(
        coverageStartJulianDateTdb + OCCULTATION_SCAN_STEP_DAYS,
        star,
      ),
    });
  }

  let beforeTime = coverageStartJulianDateTdb;
  let middleTime =
    coverageStartJulianDateTdb + OCCULTATION_SCAN_STEP_DAYS;
  for (
    let afterTime = middleTime + OCCULTATION_SCAN_STEP_DAYS;
    afterTime <= coverageEndJulianDateTdb;
    afterTime += OCCULTATION_SCAN_STEP_DAYS
  ) {
    const stateAfter = stateAt(afterTime);
    for (const star of stars) {
      const values = scanState.get(star.hr);
      const after = angularSeparation(
        stateAfter.moonPositionKilometers,
        star.directionAt(afterTime),
      );
      if (
        values.middle <= values.before &&
        values.middle < after
      ) {
        const maximumJulianDateTdb = minimizeGoldenSection(
          (julianDateTdb) =>
            separationAt(julianDateTdb, star),
          beforeTime,
          afterTime,
        );
        const geometry = occultationGeometry(
          stateAt(maximumJulianDateTdb),
          star.directionAt(maximumJulianDateTdb),
        );
        if (geometry.clearanceRadians >= 0) {
          candidates.push(
            compactOccultationCandidate(
              maximumJulianDateTdb,
              geometry,
              star,
            ),
          );
        }
      }
      values.before = values.middle;
      values.middle = after;
    }
    beforeTime = middleTime;
    middleTime = afterTime;
  }
  candidates.sort(
    (left, right) =>
      left.maximumJulianDateTdb - right.maximumJulianDateTdb ||
      left.id.localeCompare(right.id),
  );
  validateCandidateSequence(candidates);
  return {
    candidates,
    selectedStars: stars.map((star) => ({
      hr: star.hr,
      vMagnitude: star.vMagnitude,
      eclipticLatitudeRadians: round(
        star.eclipticLatitudeRadians,
        12,
      ),
    })),
  };
}

export function minimizeGoldenSection(
  functionToMinimize,
  lowerBound,
  upperBound,
  toleranceDays = 1 / 86_400,
) {
  if (
    !Number.isFinite(lowerBound) ||
    !Number.isFinite(upperBound) ||
    !(lowerBound < upperBound) ||
    !(toleranceDays > 0)
  ) {
    fail("golden-section interval is invalid");
  }
  const goldenRatioConjugate = (Math.sqrt(5) - 1) / 2;
  let lower = lowerBound;
  let upper = upperBound;
  let left = upper - goldenRatioConjugate * (upper - lower);
  let right = lower + goldenRatioConjugate * (upper - lower);
  let leftValue = functionToMinimize(left);
  let rightValue = functionToMinimize(right);
  let iteration = 0;

  while (upper - lower > toleranceDays && iteration < 96) {
    if (leftValue <= rightValue) {
      upper = right;
      right = left;
      rightValue = leftValue;
      left = upper - goldenRatioConjugate * (upper - lower);
      leftValue = functionToMinimize(left);
    } else {
      lower = left;
      left = right;
      leftValue = rightValue;
      right = lower + goldenRatioConjugate * (upper - lower);
      rightValue = functionToMinimize(right);
    }
    iteration += 1;
  }
  return (lower + upper) / 2;
}

function compactCandidate(kind, maximumJulianDateTdb, geometry) {
  const maximum = round(maximumJulianDateTdb, 9);
  const date = isoCalendarDateFromJulianDate(maximum);
  const prefix = kind === "solar-eclipse" ? "se" : "le";
  const candidate = {
    id: `${prefix}-${date.replaceAll("-", "")}`,
    kind,
    classificationHint: geometry.classificationHint,
    maximumJulianDateTdb: maximum,
    maximumIsoTdb: julianDateTdbToIso(maximum),
    searchStartJulianDateTdb: round(
      maximum - EVENT_CANDIDATE_SEARCH_HALF_WINDOW_DAYS,
      9,
    ),
    searchEndJulianDateTdb: round(
      maximum + EVENT_CANDIDATE_SEARCH_HALF_WINDOW_DAYS,
      9,
    ),
    centerSeparationRadians: round(
      geometry.centerSeparationRadians,
      12,
    ),
  };
  if (kind === "solar-eclipse") {
    return {
      ...candidate,
      centralityHint: geometry.centralityHint,
      axisDistanceKilometers: round(
        geometry.axisDistanceKilometers,
        6,
      ),
      candidateLimitKilometers: round(
        geometry.candidateLimitKilometers,
        6,
      ),
      clearanceKilometers: round(
        geometry.clearanceKilometers,
        6,
      ),
    };
  }
  return {
    ...candidate,
    candidateLimitRadians: round(
      geometry.candidateLimitRadians,
      12,
    ),
    clearanceRadians: round(geometry.clearanceRadians, 12),
  };
}

function validateCandidateSequence(candidates) {
  const ids = new Set();
  let previousMaximum = -Infinity;
  for (const candidate of candidates) {
    if (
      ids.has(candidate.id) ||
      candidate.maximumJulianDateTdb <= previousMaximum ||
      !(candidate.searchStartJulianDateTdb <
        candidate.maximumJulianDateTdb) ||
      !(candidate.maximumJulianDateTdb <
        candidate.searchEndJulianDateTdb)
    ) {
      fail(`candidate ordering or identity is invalid at ${candidate.id}`);
    }
    ids.add(candidate.id);
    previousMaximum = candidate.maximumJulianDateTdb;
  }
}

export function buildEclipseCandidates(sourceBytes) {
  const stateAt = createDe442sGeocentricEvaluator(sourceBytes);
  const coverageStartJulianDateTdb = gregorianJulianDateAtMidnight(
    EVENT_CANDIDATE_START_YEAR,
  );
  const coverageEndJulianDateTdb = gregorianJulianDateAtMidnight(
    EVENT_CANDIDATE_END_YEAR,
  );
  const solarCandidates = [];
  const lunarCandidates = [];

  const scanMetrics = (julianDateTdb) => {
    const state = stateAt(julianDateTdb);
    return {
      solar: angularSeparation(
        state.sunPositionKilometers,
        state.moonPositionKilometers,
      ),
      lunar: angularSeparation(
        state.moonPositionKilometers,
        scale(state.sunPositionKilometers, -1),
      ),
    };
  };

  let beforeTime = coverageStartJulianDateTdb;
  let beforeMetrics = scanMetrics(beforeTime);
  let middleTime = beforeTime + EVENT_CANDIDATE_SCAN_STEP_DAYS;
  let middleMetrics = scanMetrics(middleTime);

  for (
    let afterTime =
      middleTime + EVENT_CANDIDATE_SCAN_STEP_DAYS;
    afterTime <= coverageEndJulianDateTdb;
    afterTime += EVENT_CANDIDATE_SCAN_STEP_DAYS
  ) {
    const afterMetrics = scanMetrics(afterTime);
    for (const kind of ["solar", "lunar"]) {
      if (
        middleMetrics[kind] <= beforeMetrics[kind] &&
        middleMetrics[kind] < afterMetrics[kind]
      ) {
        const phaseMinimum = minimizeGoldenSection(
          (julianDateTdb) => {
            const state = stateAt(julianDateTdb);
            return kind === "solar"
              ? angularSeparation(
                  state.sunPositionKilometers,
                  state.moonPositionKilometers,
                )
              : angularSeparation(
                  state.moonPositionKilometers,
                  scale(state.sunPositionKilometers, -1),
                );
          },
          beforeTime,
          afterTime,
        );
        const maximumJulianDateTdb = minimizeGoldenSection(
          (julianDateTdb) => {
            const state = stateAt(julianDateTdb);
            return kind === "solar"
              ? solarCandidateGeometry(state).axisDistanceKilometers
              : lunarCandidateGeometry(state).centerSeparationRadians;
          },
          Math.max(beforeTime, phaseMinimum - 0.5),
          Math.min(afterTime, phaseMinimum + 0.5),
        );
        const geometry =
          kind === "solar"
            ? solarCandidateGeometry(stateAt(maximumJulianDateTdb))
            : lunarCandidateGeometry(stateAt(maximumJulianDateTdb));
        const isCandidate =
          kind === "solar"
            ? geometry.clearanceKilometers >= 0
            : geometry.clearanceRadians >= 0;
        if (isCandidate) {
          if (kind === "solar") {
            const pathClassification =
              classifySolarCandidateAcrossPath(
                stateAt,
                maximumJulianDateTdb,
              );
            if (pathClassification) {
              geometry.classificationHint = pathClassification;
            }
          }
          const target =
            kind === "solar" ? solarCandidates : lunarCandidates;
          target.push(
            compactCandidate(
              kind === "solar"
                ? "solar-eclipse"
                : "lunar-eclipse",
              maximumJulianDateTdb,
              geometry,
            ),
          );
        }
      }
    }
    beforeTime = middleTime;
    beforeMetrics = middleMetrics;
    middleTime = afterTime;
    middleMetrics = afterMetrics;
  }

  const candidates = [...solarCandidates, ...lunarCandidates].sort(
    (left, right) =>
      left.maximumJulianDateTdb - right.maximumJulianDateTdb ||
      left.kind.localeCompare(right.kind),
  );
  validateCandidateSequence(candidates);
  return candidates;
}

export function calendarYearFromCandidate(candidate) {
  return Number.parseInt(candidate.maximumIsoTdb.slice(0, 4), 10);
}

export function groupCandidatesIntoChunks(candidates) {
  const chunks = [];
  for (
    let startYear = EVENT_CANDIDATE_START_YEAR;
    startYear < EVENT_CANDIDATE_END_YEAR;
    startYear += EVENT_CANDIDATE_CHUNK_YEARS
  ) {
    const endYear = Math.min(
      startYear + EVENT_CANDIDATE_CHUNK_YEARS,
      EVENT_CANDIDATE_END_YEAR,
    );
    const events = candidates.filter((candidate) => {
      const year = calendarYearFromCandidate(candidate);
      return year >= startYear && year < endYear;
    });
    const id = `${startYear}-${endYear}`;
    const artifact = {
      schemaVersion: 1,
      model: EVENT_CANDIDATE_MODEL,
      id,
      coverage: {
        startYear,
        endYear,
        endIsExclusive: true,
        timeScale: "TDB",
      },
      events,
    };
    const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
    chunks.push({
      id,
      startYear,
      endYear,
      events,
      artifact,
      serialized,
      file: `${EVENT_CANDIDATE_PATHS.chunks}/${id}.v1.json`,
      byteLength: Buffer.byteLength(serialized),
      gzipByteLength: gzipSync(serialized, { level: 9 }).byteLength,
      sha256: digest("sha256", serialized),
    });
  }
  return chunks;
}

export function buildCandidateManifest(
  chunks,
  starCatalogMetadata,
  selectedOccultationStars,
) {
  const countByKind = (kind) =>
    chunks.reduce(
      (sum, chunk) =>
        sum +
        chunk.events.filter((candidate) => candidate.kind === kind)
          .length,
      0,
    );
  return {
    schemaVersion: 1,
    model: EVENT_CANDIDATE_MODEL,
    source: {
      ephemeris: "JPL DE442s",
      kernelUrl: DE442S_SOURCE.url,
      kernelSha256: DE442S_SOURCE.sha256,
      kernelByteLength: DE442S_SOURCE.byteLength,
      starCatalog: starCatalogMetadata,
      nasaCatalogs: NASA_ECLIPSE_CATALOGS.map(
        ({ kind, startYear, endYear, expectedCount, url }) => ({
          kind,
          startYear,
          endYear,
          expectedCount,
          url,
        }),
      ),
    },
    coverage: {
      calendar: "proleptic Gregorian",
      timeScale: "TDB",
      startYear: EVENT_CANDIDATE_START_YEAR,
      endYear: EVENT_CANDIDATE_END_YEAR,
      endIsExclusive: true,
      chunkYears: EVENT_CANDIDATE_CHUNK_YEARS,
    },
    generation: {
      scanStepDays: EVENT_CANDIDATE_SCAN_STEP_DAYS,
      maximumToleranceSeconds: 1,
      localSearchHalfWindowDays:
        EVENT_CANDIDATE_SEARCH_HALF_WINDOW_DAYS,
      solarCandidateRule:
        "At the minimum geocentric shadow-axis miss distance, retain " +
        "the event when the mean spherical Earth intersects the Moon's " +
        "penumbral cone. Lunar radii k1/k2 follow the NASA Besselian " +
        "convention.",
      lunarCandidateRule:
        "At minimum Moon-to-antisolar-axis separation, retain the event " +
        "when the mean lunar disk intersects the Danjon 1.01 penumbra.",
      occultationCandidateRule:
        "For bundled BSC5P stars at V <= 3.0 and within 8 degrees of " +
        "the J2000 ecliptic, retain a minimum when the geocentric " +
        "separation is no greater than lunar semidiameter plus maximum " +
        "equatorial lunar parallax plus a 120 arcsecond inclusion margin.",
      occultationScanStepDays: OCCULTATION_SCAN_STEP_DAYS,
      occultationSelectedStarCount:
        selectedOccultationStars.length,
      occultationSelectedStars: selectedOccultationStars,
      constants: {
        ...ECLIPSE_CONSTANTS,
        distanceUnit: "kilometer",
        angleUnit: "radian",
      },
      determinism:
        "Direct Float64 evaluation of the pinned DE442s Type 2 SPK; " +
        "fixed half-day eclipse and three-hour occultation scans; " +
        "one-second golden-section stopping width; canonical " +
        "pretty-printed UTF-8 JSON.",
    },
    interpretation: {
      purpose:
        "Small offline seeds for a later topocentric contact solver; " +
        "candidates are not observer-specific predictions.",
      classificationHint:
        "Mean-sphere geometry only. The runtime solver must recompute " +
        "classification and local visibility. A sampled total path whose " +
        "minimum umbra is within 1.5 km of zero is marked hybrid because " +
        "a sub-minute transition and the mean lunar limb cannot be " +
        "resolved by this index.",
      uncertainty:
        "Mean lunar limb, spherical Earth candidate filter, and no " +
        "atmosphere or lunar topography. Grazing contacts need a limb " +
        "profile and site/EOP uncertainty. TDB seeds require the " +
        "application time-scale pipeline before UTC display.",
      occultationAstrometry:
        "BSC5P FK5 J2000 position and proper motion are connected to " +
        "Hipparcos/ICRS with SOFA-derived rotation and spin. The broad " +
        "120 arcsecond margin covers omitted candidate-stage aberration, " +
        "light time, catalog quantization, and perspective acceleration. " +
        "The runtime must use its full apparent-position pipeline.",
      searchWindow:
        "The stored +/-18 hour window intentionally exceeds all eclipse " +
        "contact durations and absorbs seed/model differences.",
      runtimeNetwork:
        "None. NASA pages are fetched only when the generator is invoked " +
        "with --verify-nasa.",
    },
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      startYear: chunk.startYear,
      endYear: chunk.endYear,
      file: chunk.file,
      eventCount: chunk.events.length,
      solarEclipseCount: chunk.events.filter(
        (candidate) => candidate.kind === "solar-eclipse",
      ).length,
      lunarEclipseCount: chunk.events.filter(
        (candidate) => candidate.kind === "lunar-eclipse",
      ).length,
      lunarOccultationCount: chunk.events.filter(
        (candidate) => candidate.kind === "lunar-occultation",
      ).length,
      byteLength: chunk.byteLength,
      gzipByteLength: chunk.gzipByteLength,
      sha256: chunk.sha256,
    })),
    statistics: {
      chunkCount: chunks.length,
      eventCount: chunks.reduce(
        (sum, chunk) => sum + chunk.events.length,
        0,
      ),
      solarEclipseCount: countByKind("solar-eclipse"),
      lunarEclipseCount: countByKind("lunar-eclipse"),
      lunarOccultationCount: countByKind("lunar-occultation"),
      totalChunkBytes: chunks.reduce(
        (sum, chunk) => sum + chunk.byteLength,
        0,
      ),
      totalChunkGzipBytes: chunks.reduce(
        (sum, chunk) => sum + chunk.gzipByteLength,
        0,
      ),
      maximumChunkBytes: Math.max(
        ...chunks.map((chunk) => chunk.byteLength),
      ),
      maximumChunkGzipBytes: Math.max(
        ...chunks.map((chunk) => chunk.gzipByteLength),
      ),
    },
  };
}

function decodeHtmlText(value) {
  return value
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll(/&#(\d+);/g, (_match, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 10)),
    )
    .replaceAll("&nbsp;", " ")
    .replaceAll("&minus;", "-")
    .replaceAll("&ndash;", "-")
    .replaceAll("&mdash;", "-")
    .replaceAll("&amp;", "&")
    .replaceAll(/\s+/g, " ");
}

export function parseNasaEclipseCatalog(html, catalog) {
  const text = decodeHtmlText(html);
  const pattern =
    /\b(\d{5})\s+(\d{4})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+[-+]?\d+\s+[-+]?\d+\s+\d+\s+([A-Za-z][A-Za-z0-9+-]*)\b/g;
  const events = [];
  for (const match of text.matchAll(pattern)) {
    const [
      ,
      catalogNumber,
      yearText,
      monthText,
      dayText,
      hourText,
      minuteText,
      secondText,
      catalogType,
    ] = match;
    const year = Number.parseInt(yearText, 10);
    if (year < catalog.startYear || year > catalog.endYear) {
      continue;
    }
    const month = MONTH_BY_ABBREVIATION[monthText];
    const day = Number.parseInt(dayText, 10);
    const secondsOfDay =
      Number.parseInt(hourText, 10) * 3_600 +
      Number.parseInt(minuteText, 10) * 60 +
      Number.parseInt(secondText, 10);
    events.push({
      catalogNumber,
      kind: catalog.kind,
      catalogType,
      date:
        `${yearText}-${String(month).padStart(2, "0")}-` +
        String(day).padStart(2, "0"),
      maximumJulianDateTd:
        gregorianJulianDateAtMidnight(year, month, day) +
        secondsOfDay / SECONDS_PER_DAY,
    });
  }
  const uniqueEvents = new Map(
    events.map((event) => [event.catalogNumber, event]),
  );
  return [...uniqueEvents.values()].sort(
    (left, right) =>
      left.maximumJulianDateTd - right.maximumJulianDateTd,
  );
}

function nasaClassificationHint(kind, catalogType) {
  const initial = catalogType[0];
  if (kind === "solar-eclipse") {
    return {
      P: "partial",
      A: "annular",
      T: "total",
      H: "hybrid",
    }[initial];
  }
  return {
    N: "penumbral",
    P: "partial",
    T: "total",
  }[initial];
}

export async function verifyCandidatesAgainstNasa(
  candidates,
  fetchFunction = fetch,
) {
  const results = [];
  for (const catalog of NASA_ECLIPSE_CATALOGS) {
    const response = await fetchFunction(catalog.url);
    if (!response.ok) {
      fail(
        `NASA catalog request ${catalog.url} returned ${response.status}`,
      );
    }
    const nasaEvents = parseNasaEclipseCatalog(
      await response.text(),
      catalog,
    );
    if (nasaEvents.length !== catalog.expectedCount) {
      fail(
        `${catalog.url} yielded ${nasaEvents.length} events, expected ` +
          `${catalog.expectedCount}`,
      );
    }
    const generated = candidates.filter((candidate) => {
      const year = calendarYearFromCandidate(candidate);
      return (
        candidate.kind === catalog.kind &&
        year >= catalog.startYear &&
        year <= catalog.endYear
      );
    });
    const unmatchedGenerated = new Set(
      generated.map((candidate) => candidate.id),
    );
    const comparisons = nasaEvents.map((nasaEvent) => {
      const nearest = generated
        .filter((candidate) => unmatchedGenerated.has(candidate.id))
        .reduce((best, candidate) => {
          const differenceDays = Math.abs(
            candidate.maximumJulianDateTdb -
              nasaEvent.maximumJulianDateTd,
          );
          return !best || differenceDays < best.differenceDays
            ? { candidate, differenceDays }
            : best;
        }, undefined);
      if (!nearest || nearest.differenceDays > 1) {
        fail(
          `no ${catalog.kind} candidate matches NASA ${nasaEvent.date}`,
        );
      }
      unmatchedGenerated.delete(nearest.candidate.id);
      return {
        nasaCatalogNumber: nasaEvent.catalogNumber,
        nasaDate: nasaEvent.date,
        candidateId: nearest.candidate.id,
        maximumDifferenceSeconds:
          nearest.differenceDays * SECONDS_PER_DAY,
        classificationMatches:
          nearest.candidate.classificationHint ===
          nasaClassificationHint(
            catalog.kind,
            nasaEvent.catalogType,
          ),
      };
    });
    if (
      generated.length !== nasaEvents.length ||
      unmatchedGenerated.size > 0
    ) {
      fail(
        `${catalog.kind} ${catalog.startYear}-${catalog.endYear}: ` +
          `${generated.length} generated versus ${nasaEvents.length} NASA; ` +
        `unmatched generated ${[...unmatchedGenerated].join(", ") || "none"}`,
      );
    }
    const maximumSeedDifferenceSeconds = Math.max(
      ...comparisons.map(
        (comparison) => comparison.maximumDifferenceSeconds,
      ),
    );
    if (maximumSeedDifferenceSeconds > 600) {
      fail(
        `${catalog.kind} ${catalog.startYear}-${catalog.endYear} ` +
          `maximum seed difference ${maximumSeedDifferenceSeconds} ` +
          "seconds exceeds the 600 second fixture tolerance",
      );
    }
    results.push({
      ...catalog,
      generatedCount: generated.length,
      nasaCount: nasaEvents.length,
      maximumSeedDifferenceSeconds,
      classificationHintMismatchCount: comparisons.filter(
        (comparison) => !comparison.classificationMatches,
      ).length,
      meanSeedDifferenceSeconds:
        comparisons.reduce(
          (sum, comparison) =>
            sum + comparison.maximumDifferenceSeconds,
          0,
        ) / comparisons.length,
    });
  }
  return results;
}

export function buildCandidateFixture(candidates, manifest) {
  const knownCases = [
    {
      id: "solar-2026-08-12",
      candidateId: "se-20260812",
      expectedKind: "solar-eclipse",
      expectedClassificationHint: "total",
      nasaMaximumJulianDateTd: 2_461_265.241_032,
      maximumDifferenceToleranceSeconds: 600,
      sourceUrl:
        "https://eclipse.gsfc.nasa.gov/SEbeselm/" +
        "SEbeselm2001/SE2026Aug12Tbeselm.html",
    },
    {
      id: "solar-2024-04-08",
      candidateId: "se-20240408",
      expectedKind: "solar-eclipse",
      expectedClassificationHint: "total",
      nasaMaximumJulianDateTd: 2_460_409.263,
      maximumDifferenceToleranceSeconds: 600,
      sourceUrl:
        "https://eclipse.gsfc.nasa.gov/SEsearch/" +
        "SEdata.php?Ecl=20240408",
    },
  ].map((definition) => {
    const candidate = candidates.find(
      ({ id }) => id === definition.candidateId,
    );
    if (!candidate) {
      fail(`known fixture candidate ${definition.candidateId} is missing`);
    }
    if (
      candidate.kind !== definition.expectedKind ||
      candidate.classificationHint !==
        definition.expectedClassificationHint
    ) {
      fail(`known fixture candidate ${definition.candidateId} changed`);
    }
    const maximumDifferenceSeconds =
      Math.abs(
        candidate.maximumJulianDateTdb -
          definition.nasaMaximumJulianDateTd,
      ) * SECONDS_PER_DAY;
    if (
      maximumDifferenceSeconds >
      definition.maximumDifferenceToleranceSeconds
    ) {
      fail(
        `${definition.candidateId} seed differs from NASA by ` +
          `${maximumDifferenceSeconds} seconds`,
      );
    }
    return {
      ...definition,
      actualMaximumJulianDateTdb:
        candidate.maximumJulianDateTdb,
      actualMaximumIsoTdb: candidate.maximumIsoTdb,
      maximumDifferenceSeconds: round(maximumDifferenceSeconds, 3),
    };
  });

  const centuryCounts = NASA_ECLIPSE_CATALOGS.map((catalog) => {
    const actualCount = candidates.filter((candidate) => {
      const year = calendarYearFromCandidate(candidate);
      return (
        candidate.kind === catalog.kind &&
        year >= catalog.startYear &&
        year <= catalog.endYear
      );
    }).length;
    return {
      kind: catalog.kind,
      startYear: catalog.startYear,
      endYear: catalog.endYear,
      expectedCount: catalog.expectedCount,
      actualCount,
      sourceUrl: catalog.url,
    };
  });
  const knownOccultationCases = [
    {
      id: "aldebaran-graze-2017-03-05",
      candidateId: "lo-20170305-hr1457",
      targetHr: 1457,
      expectedUtcDate: "2017-03-05",
      sourceUrl:
        "https://occultations.org/publications/rasc/2025/nam25grz.htm",
    },
  ].map((definition) => {
    const candidate = candidates.find(
      ({ id }) => id === definition.candidateId,
    );
    if (
      !candidate ||
      candidate.kind !== "lunar-occultation" ||
      candidate.target.hr !== definition.targetHr
    ) {
      fail(
        `known occultation fixture ${definition.candidateId} is missing`,
      );
    }
    return {
      ...definition,
      actualMaximumJulianDateTdb:
        candidate.maximumJulianDateTdb,
      actualMaximumIsoTdb: candidate.maximumIsoTdb,
      targetLabel: candidate.target.label,
    };
  });

  return {
    schemaVersion: 1,
    model: EVENT_CANDIDATE_MODEL,
    oracle:
      "NASA Five Millennium Catalog century totals and published " +
      "greatest-eclipse TD instants; IOTA observed bright-star graze",
    manifestSha256: digest(
      "sha256",
      `${JSON.stringify(manifest, null, 2)}\n`,
    ),
    sourceSha256: DE442S_SOURCE.sha256,
    knownCases,
    knownOccultationCases,
    centuryCounts,
    checks: {
      allCenturyCountsMatch: centuryCounts.every(
        ({ actualCount, expectedCount }) =>
          actualCount === expectedCount,
      ),
      allKnownCasesWithinTolerance: knownCases.every(
        ({
          maximumDifferenceSeconds,
          maximumDifferenceToleranceSeconds,
        }) =>
          maximumDifferenceSeconds <=
          maximumDifferenceToleranceSeconds,
      ),
      allKnownOccultationsPresent:
        knownOccultationCases.length > 0,
      nasaIndependentVerificationCommand:
        "node script/build_event_candidates.mjs " +
        "--source /tmp/de442s.bsp --check --verify-nasa",
      nasaVerification:
        "The opt-in check downloads four NASA catalog pages, parses " +
        "every catalog number/date/TD maximum, requires exact event " +
        "counts and one-to-one date matching, and reports seed-time " +
        "differences. No NASA response is packaged for runtime.",
    },
  };
}
