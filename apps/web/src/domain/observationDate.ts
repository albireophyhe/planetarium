import type {
  ObservationDateValidationIssue,
  ObservationDateValidationResult
} from "./types";

const MINIMUM_SUPPORTED_MILLISECONDS = Date.UTC(1900, 0, 1);
const MAXIMUM_SUPPORTED_MILLISECONDS = Date.UTC(
  2100,
  11,
  31,
  23,
  59,
  59,
  999
);

export const SUPPORTED_OBSERVATION_DATE_RANGE = Object.freeze({
  minimum: "1900-01-01T00:00:00.000Z",
  maximum: "2100-12-31T23:59:59.999Z"
});

export function validateObservationDate(
  value: unknown
): ObservationDateValidationResult {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return {
      ok: false,
      issues: [
        {
          code: "invalid-date",
          message: "Observation date must be a valid Date"
        }
      ]
    };
  }

  const milliseconds = value.getTime();
  if (
    milliseconds < MINIMUM_SUPPORTED_MILLISECONDS ||
    milliseconds > MAXIMUM_SUPPORTED_MILLISECONDS
  ) {
    return {
      ok: false,
      issues: [
        {
          code: "date-out-of-supported-range",
          message:
            "Observation date must be between " +
            `${SUPPORTED_OBSERVATION_DATE_RANGE.minimum} and ` +
            SUPPORTED_OBSERVATION_DATE_RANGE.maximum
        }
      ]
    };
  }

  return { ok: true, value, issues: [] };
}

export function isSupportedObservationDate(value: unknown): value is Date {
  return validateObservationDate(value).ok;
}

/**
 * Canonicalizes an untrusted clock value for state and playback ingress.
 * Invalid and early values use the minimum; late values use the maximum.
 * Supported Date instances retain their identity.
 */
export function clampObservationDate(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return new Date(MINIMUM_SUPPORTED_MILLISECONDS);
  }

  const milliseconds = value.getTime();
  if (milliseconds < MINIMUM_SUPPORTED_MILLISECONDS) {
    return new Date(MINIMUM_SUPPORTED_MILLISECONDS);
  }
  if (milliseconds > MAXIMUM_SUPPORTED_MILLISECONDS) {
    return new Date(MAXIMUM_SUPPORTED_MILLISECONDS);
  }
  return value;
}

export class ObservationDateValidationError extends RangeError {
  readonly issues: readonly ObservationDateValidationIssue[];

  constructor(issues: readonly ObservationDateValidationIssue[]) {
    super(issues.map(({ message }) => message).join("; "));
    this.name = "ObservationDateValidationError";
    this.issues = issues;
  }
}

export function assertSupportedObservationDate(value: unknown): Date {
  const result = validateObservationDate(value);
  if (!result.ok) {
    throw new ObservationDateValidationError(result.issues);
  }
  return result.value;
}
