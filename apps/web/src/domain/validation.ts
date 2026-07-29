import type {
  ObservingLocation,
  ObservingLocationValidationIssue,
  ObservingLocationValidationResult
} from "./types";

const validTimeZones = new Set<string>();
const cachedLocationResults = new WeakMap<
  object,
  {
    readonly fingerprint: string;
    readonly result: ObservingLocationValidationResult;
  }
>();

export function isValidTimeZone(timeZone: string): boolean {
  if (validTimeZones.has(timeZone)) {
    return true;
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    validTimeZones.add(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function validateObservingLocation(
  value: unknown
): ObservingLocationValidationResult {
  if (typeof value !== "object" || value === null) {
    return {
      ok: false,
      issues: [
        {
          field: "location",
          code: "invalid-location",
          message: "Observing location must be an object"
        }
      ]
    };
  }

  const location = value as Partial<ObservingLocation>;
  const fingerprint = [
    String(location.latitude),
    String(location.longitude),
    String(location.timeZone)
  ].join("\u0000");
  const cached = cachedLocationResults.get(value);
  if (cached?.fingerprint === fingerprint) {
    return cached.result;
  }

  const issues: ObservingLocationValidationIssue[] = [];
  if (!Number.isFinite(location.latitude)) {
    issues.push({
      field: "latitude",
      code: "latitude-not-finite",
      message: "Latitude must be a finite number"
    });
  } else if (location.latitude! < -90 || location.latitude! > 90) {
    issues.push({
      field: "latitude",
      code: "latitude-out-of-range",
      message: "Latitude must be between -90 and 90 degrees"
    });
  }

  if (!Number.isFinite(location.longitude)) {
    issues.push({
      field: "longitude",
      code: "longitude-not-finite",
      message: "Longitude must be a finite number"
    });
  } else if (location.longitude! < -180 || location.longitude! > 180) {
    issues.push({
      field: "longitude",
      code: "longitude-out-of-range",
      message: "Longitude must be between -180 and 180 degrees"
    });
  }

  if (
    typeof location.timeZone !== "string" ||
    location.timeZone.trim().length === 0
  ) {
    issues.push({
      field: "timeZone",
      code: "time-zone-empty",
      message: "Time zone must be a non-empty IANA identifier"
    });
  } else if (!isValidTimeZone(location.timeZone)) {
    issues.push({
      field: "timeZone",
      code: "time-zone-invalid",
      message: `Invalid IANA time zone: ${location.timeZone}`
    });
  }

  const result: ObservingLocationValidationResult =
    issues.length === 0
      ? {
          ok: true,
          value: location as ObservingLocation,
          issues: []
        }
      : { ok: false, issues };
  cachedLocationResults.set(value, { fingerprint, result });
  return result;
}

export class ObservingLocationValidationError extends RangeError {
  readonly issues: readonly ObservingLocationValidationIssue[];

  constructor(issues: readonly ObservingLocationValidationIssue[]) {
    super(issues.map(({ message }) => message).join("; "));
    this.name = "ObservingLocationValidationError";
    this.issues = issues;
  }
}

export function assertValidObservingLocation(
  value: unknown
): ObservingLocation {
  const result = validateObservingLocation(value);
  if (!result.ok) {
    throw new ObservingLocationValidationError(result.issues);
  }
  return result.value;
}
