import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaUrl = new URL(
  "../shared/schema/star-pointing-profile-v1.schema.json",
  import.meta.url
);

let cachedValidator;

// Production serializers preserve full-precision numbers, while exchanged
// timestamps have millisecond precision and hand-authored contract fixtures
// may round Julian dates. Keep each tolerance in the unit of the relation it
// protects so a future change is deliberate and reviewable.
const UTC_JULIAN_DATE_TOLERANCE_DAYS = 0.002 / 86_400;
const UT1_RELATION_TOLERANCE_DAYS = 0.000_1 / 86_400;
const DUT1_RELATION_TOLERANCE_SECONDS = 1e-9;
const HORIZONTAL_COORDINATE_TOLERANCE_DEGREES = 1e-9;
const UNIX_EPOCH_JULIAN_DATE = 2_440_587.5;
const MILLISECONDS_PER_DAY = 86_400_000;
const DUT1_METADATA_ISSUE =
  "Applied DUT1 does not have a matching IERS estimate snapshot.";
const POLAR_MOTION_METADATA_ISSUE =
  "Applied polar motion does not have a matching IERS estimate snapshot.";

export async function starPointingProfileValidator() {
  if (cachedValidator) {
    return cachedValidator;
  }
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true
  });
  addFormats(ajv);
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

export function formatStarPointingProfileErrors(errors) {
  return (errors ?? [])
    .map(
      ({ instancePath, message, params }) =>
        `${instancePath || "/"} ${message ?? "is invalid"} ` +
        JSON.stringify(params)
    )
    .join("\n");
}

function semanticError(instancePath, message, params = {}) {
  return {
    instancePath,
    keyword: "semantic",
    message,
    params,
    schemaPath: "#/semantic"
  };
}

function numbersMatch(left, right, tolerance) {
  return (
    typeof left === "number" &&
    Number.isFinite(left) &&
    typeof right === "number" &&
    Number.isFinite(right) &&
    Math.abs(left - right) <= tolerance
  );
}

function nullableNumbersMatch(left, right, tolerance) {
  return left === null && right === null
    ? true
    : numbersMatch(left, right, tolerance);
}

function localDateTimeAt(utcMilliseconds, timeZone) {
  const formatter = new Intl.DateTimeFormat(
    "en-US-u-ca-gregory-nu-latn",
    {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone,
      year: "numeric"
    }
  );
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(utcMilliseconds))
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );
  return (
    `${parts.year}-${parts.month}-${parts.day}` +
    `T${parts.hour}:${parts.minute}:${parts.second}`
  );
}

function pushMismatch(
  errors,
  instancePath,
  message,
  actual,
  expected
) {
  errors.push(
    semanticError(instancePath, message, {
      actual,
      expected
    })
  );
}

function validateObservationSemantics(profile, errors) {
  const { observation, timeScales } = profile;
  const utcMilliseconds = Date.parse(observation.utc);
  if (!Number.isFinite(utcMilliseconds)) {
    errors.push(
      semanticError(
        "/observation/utc",
        "must identify a parseable UTC instant"
      )
    );
    return;
  }
  if (!observation.utc.endsWith("Z")) {
    errors.push(
      semanticError(
        "/observation/utc",
        "must use the canonical UTC Z suffix"
      )
    );
  }

  const expectedJulianDate =
    utcMilliseconds / MILLISECONDS_PER_DAY +
    UNIX_EPOCH_JULIAN_DATE;
  if (
    typeof timeScales.jdUTC === "number" &&
    !numbersMatch(
      timeScales.jdUTC,
      expectedJulianDate,
      UTC_JULIAN_DATE_TOLERANCE_DAYS
    )
  ) {
    pushMismatch(
      errors,
      "/timeScales/jdUTC",
      "must describe observation.utc within 2 milliseconds",
      timeScales.jdUTC,
      expectedJulianDate
    );
  }

  if (
    typeof timeScales.jdUTC === "number" &&
    typeof timeScales.dut1Seconds === "number"
  ) {
    const expectedUT1 =
      timeScales.jdUTC + timeScales.dut1Seconds / 86_400;
    if (
      !numbersMatch(
        timeScales.jdUT1,
        expectedUT1,
        UT1_RELATION_TOLERANCE_DAYS
      )
    ) {
      pushMismatch(
        errors,
        "/timeScales/jdUT1",
        "must equal jdUTC + dut1Seconds / 86400 within 0.1 milliseconds",
        timeScales.jdUT1,
        expectedUT1
      );
    }
  }

  let expectedLocalDateTime;
  try {
    expectedLocalDateTime = localDateTimeAt(
      utcMilliseconds,
      observation.timeZone
    );
  } catch {
    errors.push(
      semanticError(
        "/observation/timeZone",
        "must be an Intl-supported IANA time zone"
      )
    );
    return;
  }
  if (observation.localDateTime !== expectedLocalDateTime) {
    pushMismatch(
      errors,
      "/observation/localDateTime",
      "must be observation.utc represented in observation.timeZone",
      observation.localDateTime,
      expectedLocalDateTime
    );
  }
}

function validateDUT1Semantics(profile, errors) {
  const { timeScales, earthOrientation, diagnostics } = profile;
  const source = timeScales.dut1Source;
  const allowedTimeScaleStatuses =
    source === null
      ? ["not-applied-simple-model", "unavailable"]
      : source === "assumed-zero"
        ? ["available-with-assumed-zero-dut1"]
        : ["available"];
  if (!allowedTimeScaleStatuses.includes(timeScales.status)) {
    errors.push(
      semanticError(
        "/timeScales/status",
        "must agree with timeScales.dut1Source",
        {
          actual: timeScales.status,
          allowed: allowedTimeScaleStatuses,
          source
        }
      )
    );
  }

  if (earthOrientation.dut1Source !== source) {
    pushMismatch(
      errors,
      "/earthOrientation/dut1Source",
      "must equal timeScales.dut1Source",
      earthOrientation.dut1Source,
      source
    );
  }
  if (
    !nullableNumbersMatch(
      earthOrientation.appliedDut1Seconds,
      timeScales.dut1Seconds,
      DUT1_RELATION_TOLERANCE_SECONDS
    )
  ) {
    pushMismatch(
      errors,
      "/earthOrientation/appliedDut1Seconds",
      "must equal timeScales.dut1Seconds",
      earthOrientation.appliedDut1Seconds,
      timeScales.dut1Seconds
    );
  }

  let allowedStatuses;
  if (source === "assumed-zero") {
    allowedStatuses = ["assumed-zero"];
  } else if (source === "caller") {
    allowedStatuses = ["caller"];
  } else if (source === null) {
    allowedStatuses = ["not-applied-simple-model", "unavailable"];
  } else {
    allowedStatuses = [
      "available",
      "applied-without-matching-estimate-metadata"
    ];
  }
  if (!allowedStatuses.includes(earthOrientation.dut1Status)) {
    errors.push(
      semanticError(
        "/earthOrientation/dut1Status",
        "must agree with the applied DUT1 source",
        {
          actual: earthOrientation.dut1Status,
          allowed: allowedStatuses,
          source
        }
      )
    );
  }

  if (source === "assumed-zero") {
    if (timeScales.dut1Seconds !== 0) {
      pushMismatch(
        errors,
        "/timeScales/dut1Seconds",
        "must be zero for an assumed-zero source",
        timeScales.dut1Seconds,
        0
      );
    }
    if (timeScales.dut1UncertaintySeconds !== null) {
      pushMismatch(
        errors,
        "/timeScales/dut1UncertaintySeconds",
        "must be null for an assumed-zero source",
        timeScales.dut1UncertaintySeconds,
        null
      );
    }
  }

  if (
    earthOrientation.dut1Status === "available" &&
    (source === "iers-observed" || source === "iers-predicted")
  ) {
    const expectedQuality =
      source === "iers-observed" ? "observed" : "predicted";
    if (earthOrientation.dut1Quality !== expectedQuality) {
      pushMismatch(
        errors,
        "/earthOrientation/dut1Quality",
        "must agree with the applied IERS DUT1 source",
        earthOrientation.dut1Quality,
        expectedQuality
      );
    }
    if (
      !nullableNumbersMatch(
        earthOrientation.dut1ReportedErrorSeconds,
        timeScales.dut1UncertaintySeconds,
        DUT1_RELATION_TOLERANCE_SECONDS
      )
    ) {
      pushMismatch(
        errors,
        "/earthOrientation/dut1ReportedErrorSeconds",
        "must equal the applied DUT1 uncertainty",
        earthOrientation.dut1ReportedErrorSeconds,
        timeScales.dut1UncertaintySeconds
      );
    }
  }

  if (
    Object.hasOwn(
      earthOrientation,
      "dut1MetadataMatchesAppliedValue"
    )
  ) {
    const allowedMatches =
      earthOrientation.dut1Status === "available"
        ? [true]
        : earthOrientation.dut1Status ===
            "applied-without-matching-estimate-metadata"
          ? [false, null]
          : [null];
    if (
      !allowedMatches.includes(
        earthOrientation.dut1MetadataMatchesAppliedValue
      )
    ) {
      errors.push(
        semanticError(
          "/earthOrientation/dut1MetadataMatchesAppliedValue",
          "must agree with earthOrientation.dut1Status",
          {
            actual:
              earthOrientation.dut1MetadataMatchesAppliedValue,
            allowed: allowedMatches
          }
        )
      );
    }
  }

  const expectedAssumedZero = source === "assumed-zero";
  if (
    diagnostics.approximations.dut1AssumedZero !==
    expectedAssumedZero
  ) {
    pushMismatch(
      errors,
      "/diagnostics/approximations/dut1AssumedZero",
      "must agree with the applied DUT1 source",
      diagnostics.approximations.dut1AssumedZero,
      expectedAssumedZero
    );
  }
}

function validatePolarMotionSemantics(profile, errors) {
  const { earthOrientation, diagnostics } = profile;
  const mode = diagnostics.models.polarMotionMode;
  const rules = {
    disabled: {
      allowedStatuses: ["unavailable"],
      quality: null,
      source: "disabled",
      usesPrediction: null,
      valuesWhenApplied: null
    },
    caller: {
      allowedStatuses: ["available", "unavailable"],
      quality: null,
      source: "caller",
      usesPrediction: null,
      valuesWhenApplied: "number"
    },
    "iers-observed": {
      allowedStatuses: [
        "available",
        "applied-without-matching-estimate-metadata",
        "unavailable"
      ],
      quality: "observed",
      source: "observed",
      usesPrediction: false,
      valuesWhenApplied: "number"
    },
    "iers-predicted": {
      allowedStatuses: [
        "available",
        "applied-without-matching-estimate-metadata",
        "unavailable"
      ],
      quality: "predicted",
      source: "predicted",
      usesPrediction: true,
      valuesWhenApplied: "number"
    },
    "assumed-zero": {
      allowedStatuses: [
        "assumed-zero",
        "invalid-assumed-zero-value"
      ],
      quality: null,
      source: "assumed-zero",
      usesPrediction: null,
      valuesWhenApplied: 0
    }
  };
  const rule = rules[mode];

  if (!rule.allowedStatuses.includes(earthOrientation.polarMotionStatus)) {
    errors.push(
      semanticError(
        "/earthOrientation/polarMotionStatus",
        "must agree with diagnostics.models.polarMotionMode",
        {
          actual: earthOrientation.polarMotionStatus,
          allowed: rule.allowedStatuses,
          mode
        }
      )
    );
  }
  if (earthOrientation.polarMotionSource !== rule.source) {
    pushMismatch(
      errors,
      "/earthOrientation/polarMotionSource",
      "must agree with diagnostics.models.polarMotionMode",
      earthOrientation.polarMotionSource,
      rule.source
    );
  }

  const valuesAreApplied =
    earthOrientation.polarMotionStatus === "available" ||
    earthOrientation.polarMotionStatus ===
      "applied-without-matching-estimate-metadata" ||
    earthOrientation.polarMotionStatus === "assumed-zero";
  const expectedValues = valuesAreApplied
    ? rule.valuesWhenApplied
    : null;
  if (expectedValues === "number") {
    for (const field of ["xpAppliedRadians", "ypAppliedRadians"]) {
      if (
        typeof earthOrientation[field] !== "number" ||
        !Number.isFinite(earthOrientation[field])
      ) {
        errors.push(
          semanticError(
            `/earthOrientation/${field}`,
            "must be numeric for applied polar motion"
          )
        );
      }
    }
  } else {
    for (const field of ["xpAppliedRadians", "ypAppliedRadians"]) {
      if (earthOrientation[field] !== expectedValues) {
        pushMismatch(
          errors,
          `/earthOrientation/${field}`,
          "must agree with diagnostics.models.polarMotionMode",
          earthOrientation[field],
          expectedValues
        );
      }
    }
  }

  if (earthOrientation.polarMotionStatus === "available") {
    if (earthOrientation.polarMotionQuality !== rule.quality) {
      pushMismatch(
        errors,
        "/earthOrientation/polarMotionQuality",
        "must agree with the applied polar-motion source",
        earthOrientation.polarMotionQuality,
        rule.quality
      );
    }
    if (earthOrientation.usesPrediction !== rule.usesPrediction) {
      pushMismatch(
        errors,
        "/earthOrientation/usesPrediction",
        "must agree with the applied polar-motion source",
        earthOrientation.usesPrediction,
        rule.usesPrediction
      );
    }
  }
  if (
    earthOrientation.polarMotionStatus !== "available" &&
    earthOrientation.polarMotionQuality !== null
  ) {
    pushMismatch(
      errors,
      "/earthOrientation/polarMotionQuality",
      "must be null without matching applied metadata",
      earthOrientation.polarMotionQuality,
      null
    );
  }
  if (earthOrientation.usesPrediction !== rule.usesPrediction) {
    pushMismatch(
      errors,
      "/earthOrientation/usesPrediction",
      "must agree with diagnostics.models.polarMotionMode",
      earthOrientation.usesPrediction,
      rule.usesPrediction
    );
  }

  if (
    Object.hasOwn(
      earthOrientation,
      "polarMotionMetadataMatchesAppliedValue"
    )
  ) {
    const allowedMatches =
      earthOrientation.polarMotionStatus === "available"
        ? [true]
        : earthOrientation.polarMotionStatus ===
            "applied-without-matching-estimate-metadata"
          ? [false, null]
          : [null];
    if (
      !allowedMatches.includes(
        earthOrientation.polarMotionMetadataMatchesAppliedValue
      )
    ) {
      errors.push(
        semanticError(
          "/earthOrientation/polarMotionMetadataMatchesAppliedValue",
          "must agree with earthOrientation.polarMotionStatus",
          {
            actual:
              earthOrientation
                .polarMotionMetadataMatchesAppliedValue,
            allowed: allowedMatches
          }
        )
      );
    }
  }

  const expectedAssumedZero =
    earthOrientation.polarMotionStatus === "assumed-zero";
  if (
    diagnostics.approximations.polarMotionAssumedZero !==
    expectedAssumedZero
  ) {
    pushMismatch(
      errors,
      "/diagnostics/approximations/polarMotionAssumedZero",
      "must agree with diagnostics.models.polarMotionMode",
      diagnostics.approximations.polarMotionAssumedZero,
      expectedAssumedZero
    );
  }
}

function validateEarthOrientationSemantics(profile, errors) {
  validateDUT1Semantics(profile, errors);
  validatePolarMotionSemantics(profile, errors);

  const { earthOrientation, diagnostics, timeScales } = profile;
  const dut1IsIERS =
    timeScales.dut1Source === "iers-observed" ||
    timeScales.dut1Source === "iers-predicted";
  const polarMotionIsIERS =
    diagnostics.models.polarMotionMode === "iers-observed" ||
    diagnostics.models.polarMotionMode === "iers-predicted";
  const dut1IsApplied =
    earthOrientation.dut1Status === "available" ||
    earthOrientation.dut1Status ===
      "applied-without-matching-estimate-metadata";
  const polarMotionIsApplied =
    earthOrientation.polarMotionStatus === "available" ||
    earthOrientation.polarMotionStatus ===
      "applied-without-matching-estimate-metadata";
  const expectedStatus =
    dut1IsIERS &&
    polarMotionIsIERS &&
    dut1IsApplied &&
    polarMotionIsApplied
      ? "iers"
      : earthOrientation.dut1Status === "assumed-zero" &&
          earthOrientation.polarMotionStatus === "assumed-zero"
        ? "assumed-zero"
        : "partial";
  if (earthOrientation.status !== expectedStatus) {
    pushMismatch(
      errors,
      "/earthOrientation/status",
      "must summarize the applied DUT1 and polar-motion modes",
      earthOrientation.status,
      expectedStatus
    );
  }

  if (Object.hasOwn(earthOrientation, "sourceIdentifierStatus")) {
    const hasIdentifier =
      typeof earthOrientation.sourceIdentifier === "string" &&
      earthOrientation.sourceIdentifier.length > 0;
    const allowedIdentifierStatuses = hasIdentifier
      ? ["available"]
      : ["unavailable", "unavailable-from-render-snapshot"];
    if (
      !allowedIdentifierStatuses.includes(
        earthOrientation.sourceIdentifierStatus
      )
    ) {
      errors.push(
        semanticError(
          "/earthOrientation/sourceIdentifierStatus",
          "must agree with earthOrientation.sourceIdentifier",
          {
            actual: earthOrientation.sourceIdentifierStatus,
            allowed: allowedIdentifierStatuses
          }
        )
      );
    }
  }

  const hasDUT1MetadataMatch = Object.hasOwn(
    earthOrientation,
    "dut1MetadataMatchesAppliedValue"
  );
  const hasPolarMotionMetadataMatch = Object.hasOwn(
    earthOrientation,
    "polarMotionMetadataMatchesAppliedValue"
  );
  const hasAnyMetadataMatch =
    hasDUT1MetadataMatch || hasPolarMotionMetadataMatch;
  const bothMetadataMatch =
    earthOrientation.dut1MetadataMatchesAppliedValue === true &&
    earthOrientation.polarMotionMetadataMatchesAppliedValue === true;
  if (
    hasAnyMetadataMatch &&
    !bothMetadataMatch &&
    earthOrientation.sourceIdentifier !== null
  ) {
    pushMismatch(
      errors,
      "/earthOrientation/sourceIdentifier",
      "must be null unless both applied EOP values match their metadata",
      earthOrientation.sourceIdentifier,
      null
    );
  }

  if (Object.hasOwn(earthOrientation, "consistencyIssues")) {
    for (const [status, issue, instancePath] of [
      [
        earthOrientation.dut1Status,
        DUT1_METADATA_ISSUE,
        "/earthOrientation/dut1Status"
      ],
      [
        earthOrientation.polarMotionStatus,
        POLAR_MOTION_METADATA_ISSUE,
        "/earthOrientation/polarMotionStatus"
      ]
    ]) {
      const expected =
        status ===
        "applied-without-matching-estimate-metadata";
      const actual = earthOrientation.consistencyIssues.includes(issue);
      if (actual !== expected) {
        pushMismatch(
          errors,
          instancePath,
          "must agree with earthOrientation.consistencyIssues",
          status,
          expected ? `issue: ${issue}` : `no issue: ${issue}`
        );
      }
    }
  }

  if (Object.hasOwn(earthOrientation, "estimateStatus")) {
    const estimateUnavailable =
      earthOrientation.estimateStatus === "unavailable";
    if (
      diagnostics.approximations
        .earthOrientationEstimateUnavailable !== estimateUnavailable
    ) {
      pushMismatch(
        errors,
        "/diagnostics/approximations/earthOrientationEstimateUnavailable",
        "must agree with earthOrientation.estimateStatus",
        diagnostics.approximations
          .earthOrientationEstimateUnavailable,
        estimateUnavailable
      );
    }
  }
  if (
    Object.hasOwn(
      diagnostics.approximations,
      "earthOrientationNotApplied"
    )
  ) {
    const expectedNotApplied =
      earthOrientation.status === "not-applied-simple-model";
    if (
      diagnostics.approximations.earthOrientationNotApplied !==
      expectedNotApplied
    ) {
      pushMismatch(
        errors,
        "/diagnostics/approximations/earthOrientationNotApplied",
        "must agree with earthOrientation.status",
        diagnostics.approximations.earthOrientationNotApplied,
        expectedNotApplied
      );
    }
  }
}

function validateRefractionSemantics(profile, errors) {
  const { coordinates, diagnostics } = profile;
  const observed = coordinates.observedTopocentric;
  const vacuum = coordinates.vacuumTopocentric;
  const refraction = diagnostics.refraction;
  const mode = refraction.mode;

  for (const [instancePath, actual] of [
    [
      "/coordinates/observedTopocentric/refractionMode",
      observed.refractionMode
    ],
    ["/diagnostics/models/refractionMode", diagnostics.models.refractionMode]
  ]) {
    if (actual !== mode) {
      pushMismatch(
        errors,
        instancePath,
        "must equal diagnostics.refraction.mode",
        actual,
        mode
      );
    }
  }
  if (
    observed.status !== "invalid" &&
    observed.status !== "unavailable" &&
    observed.status !== refraction.status
  ) {
    pushMismatch(
      errors,
      "/coordinates/observedTopocentric/status",
      "must equal diagnostics.refraction.status",
      observed.status,
      refraction.status
    );
  }

  const outsideModelDomain = mode === "below-model-altitude";
  if (
    diagnostics.approximations.refractionOutsideModelDomain !==
    outsideModelDomain
  ) {
    pushMismatch(
      errors,
      "/diagnostics/approximations/refractionOutsideModelDomain",
      "must agree with diagnostics.refraction.mode",
      diagnostics.approximations.refractionOutsideModelDomain,
      outsideModelDomain
    );
  }
  if (
    Object.hasOwn(
      diagnostics.approximations,
      "refractionParametersUnavailable"
    )
  ) {
    const parametersUnavailable =
      refraction.parametersStatus === "unavailable" ||
      refraction.parametersStatus ===
        "unavailable-from-render-snapshot";
    if (
      diagnostics.approximations
        .refractionParametersUnavailable !== parametersUnavailable
    ) {
      pushMismatch(
        errors,
        "/diagnostics/approximations/refractionParametersUnavailable",
        "must agree with diagnostics.refraction.parametersStatus",
        diagnostics.approximations
          .refractionParametersUnavailable,
        parametersUnavailable
      );
    }
  }

  if (mode === "disabled" || mode === "below-model-altitude") {
    for (const field of ["altitudeDegrees", "azimuthDegrees"]) {
      if (
        !nullableNumbersMatch(
          observed[field],
          vacuum[field],
          HORIZONTAL_COORDINATE_TOLERANCE_DEGREES
        )
      ) {
        pushMismatch(
          errors,
          `/coordinates/observedTopocentric/${field}`,
          "must equal the vacuum coordinate when refraction is not applied",
          observed[field],
          vacuum[field]
        );
      }
    }
    if (observed.azimuthStatus !== vacuum.azimuthStatus) {
      pushMismatch(
        errors,
        "/coordinates/observedTopocentric/azimuthStatus",
        "must equal the vacuum azimuth status when refraction is not applied",
        observed.azimuthStatus,
        vacuum.azimuthStatus
      );
    }
  }
}

function validateKinematicsSemantics(profile, errors) {
  const { catalogKinematics } = profile.target;
  const { approximations, models } = profile.diagnostics;

  if (
    Object.hasOwn(approximations, "properMotionMissing") &&
    Object.hasOwn(approximations, "properMotionUnavailable") &&
    approximations.properMotionMissing !==
      approximations.properMotionUnavailable
  ) {
    pushMismatch(
      errors,
      "/diagnostics/approximations/properMotionMissing",
      "must equal diagnostics.approximations.properMotionUnavailable",
      approximations.properMotionMissing,
      approximations.properMotionUnavailable
    );
  }

  const expectedRadialVelocityAssumedZero =
    catalogKinematics.radialVelocityStatus === "assumed-zero";
  for (const [instancePath, actual] of [
    [
      "/diagnostics/models/radialVelocityAssumedZero",
      models.radialVelocityAssumedZero
    ],
    [
      "/diagnostics/approximations/radialVelocityAssumedZero",
      approximations.radialVelocityAssumedZero
    ]
  ]) {
    if (
      actual !== undefined &&
      actual !== expectedRadialVelocityAssumedZero
    ) {
      pushMismatch(
        errors,
        instancePath,
        "must agree with target.catalogKinematics.radialVelocityStatus",
        actual,
        expectedRadialVelocityAssumedZero
      );
    }
  }
}

/**
 * Checks cross-field invariants for an AJV-valid
 * planetarium.precision-pointing.full-v1 profile. Callers should normally use
 * validateStarPointingProfile(), which enforces that structural precondition.
 */
export function validateStarPointingProfileSemantics(value) {
  const errors = [];
  validateObservationSemantics(value, errors);
  validateEarthOrientationSemantics(value, errors);
  validateRefractionSemantics(value, errors);
  validateKinematicsSemantics(value, errors);
  return errors;
}

export async function validateStarPointingProfile(value) {
  const validate = await starPointingProfileValidator();
  const schemaValid = validate(value);
  if (!schemaValid) {
    return {
      errors: [...(validate.errors ?? [])],
      valid: false
    };
  }
  const errors = validateStarPointingProfileSemantics(value);
  return {
    errors,
    valid: errors.length === 0
  };
}

async function readInput(file) {
  const source = file === "-" ? "stdin" : file;
  let json;
  if (file === "-") {
    process.stdin.setEncoding("utf8");
    json = "";
    for await (const chunk of process.stdin) {
      json += chunk;
    }
  } else {
    json = await readFile(file, "utf8");
  }
  try {
    return { source, value: JSON.parse(json) };
  } catch (error) {
    throw new SyntaxError(
      `${source}: JSONを解析できません: ${error.message}`,
      { cause: error }
    );
  }
}

async function runCli(files) {
  if (
    files.length === 0 ||
    files.includes("--help") ||
    files.includes("-h")
  ) {
    console.log(
      "Usage: node script/validate_star_pointing_profile.mjs <profile.json|-> [...]"
    );
    return files.length === 0 ? 1 : 0;
  }

  let failureCount = 0;
  let stdinConsumed = false;
  for (const file of files) {
    if (file === "-" && stdinConsumed) {
      console.error("stdinは1回だけ指定できます");
      failureCount += 1;
      continue;
    }
    stdinConsumed ||= file === "-";
    try {
      const { source, value } = await readInput(file);
      const result = await validateStarPointingProfile(value);
      if (result.valid) {
        console.log(`${source}: precision pointing profile OK`);
      } else {
        console.error(
          `${source}: precision pointing profile validation failed\n` +
            formatStarPointingProfileErrors(result.errors)
        );
        failureCount += 1;
      }
    } catch (error) {
      console.error(error.message);
      failureCount += 1;
    }
  }
  return failureCount === 0 ? 0 : 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  process.exitCode = await runCli(process.argv.slice(2));
}
