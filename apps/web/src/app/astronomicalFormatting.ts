const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const ARCSECONDS_PER_DEGREE = 3_600;
const TWO_PI = 2 * Math.PI;

function normalize(value: number, period: number) {
  return ((value % period) + period) % period;
}

function pad(value: number, width = 2) {
  return String(value).padStart(width, "0");
}

export function formatRightAscension(
  radians: number,
  fractionDigits = 1,
) {
  if (
    !Number.isFinite(radians) ||
    !Number.isInteger(fractionDigits) ||
    fractionDigits < 0 ||
    fractionDigits > 6
  ) {
    return "—";
  }

  const scale = 10 ** fractionDigits;
  const totalUnits = Math.round(
    (normalize(radians, TWO_PI) / TWO_PI) *
      SECONDS_PER_DAY *
      scale,
  );
  const wrappedUnits =
    totalUnits % (SECONDS_PER_DAY * scale);
  const hours = Math.floor(
    wrappedUnits / (SECONDS_PER_HOUR * scale),
  );
  const afterHours =
    wrappedUnits - hours * SECONDS_PER_HOUR * scale;
  const minutes = Math.floor(afterHours / (60 * scale));
  const secondsUnits =
    afterHours - minutes * 60 * scale;
  const seconds = (secondsUnits / scale)
    .toFixed(fractionDigits)
    .padStart(
      fractionDigits === 0
        ? 2
        : 3 + fractionDigits,
      "0",
    );

  return `${pad(hours)}h ${pad(minutes)}m ${seconds}s`;
}

export function formatDeclination(
  radians: number,
  fractionDigits = 0,
) {
  if (
    !Number.isFinite(radians) ||
    !Number.isInteger(fractionDigits) ||
    fractionDigits < 0 ||
    fractionDigits > 6
  ) {
    return "—";
  }

  const clamped = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, radians));
  const scale = 10 ** fractionDigits;
  const roundedArcsecondUnits = Math.round(
    (Math.abs(clamped) *
      180 *
      ARCSECONDS_PER_DEGREE *
      scale) /
      Math.PI,
  );
  const degrees = Math.floor(
    roundedArcsecondUnits /
      (ARCSECONDS_PER_DEGREE * scale),
  );
  const remainder =
    roundedArcsecondUnits -
    degrees * ARCSECONDS_PER_DEGREE * scale;
  const minutes = Math.floor(remainder / (60 * scale));
  const secondsUnits =
    remainder - minutes * 60 * scale;
  const seconds = (secondsUnits / scale)
    .toFixed(fractionDigits)
    .padStart(
      fractionDigits === 0
        ? 2
        : 3 + fractionDigits,
      "0",
    );
  const sign =
    clamped < 0 && roundedArcsecondUnits > 0 ? "−" : "+";

  return `${sign}${pad(degrees)}° ${pad(minutes)}′ ${seconds}″`;
}

export function normalizedAzimuthDegrees(degrees: number) {
  if (!Number.isFinite(degrees)) {
    return null;
  }
  return normalize(degrees, 360);
}

export function formatAzimuthDegrees(
  degrees: number,
  fractionDigits = 0,
) {
  const normalized = normalizedAzimuthDegrees(degrees);
  if (
    normalized === null ||
    !Number.isInteger(fractionDigits) ||
    fractionDigits < 0 ||
    fractionDigits > 6
  ) {
    return "—";
  }
  const scale = 10 ** fractionDigits;
  const rounded =
    (Math.round(normalized * scale) % (360 * scale)) / scale;
  return `${rounded.toFixed(fractionDigits)}°`;
}

export function formatSignedDegrees(
  degrees: number,
  fractionDigits = 1,
) {
  const value = formatDecimal(degrees, fractionDigits);
  return value === "—" ? value : `${value}°`;
}

export function formatDecimal(
  value: number,
  fractionDigits = 1,
) {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(fractionDigits) ||
    fractionDigits < 0 ||
    fractionDigits > 6
  ) {
    return "—";
  }
  const scale = 10 ** fractionDigits;
  const roundedMagnitude =
    Math.round(Math.abs(value) * scale) / scale;
  const sign = value < 0 && roundedMagnitude > 0 ? "−" : "";
  return `${sign}${roundedMagnitude.toFixed(fractionDigits)}`;
}

export function azimuthCompassLabel(degrees: number) {
  const normalized = normalizedAzimuthDegrees(degrees);
  if (normalized === null) {
    return "不定";
  }
  const labels = [
    "北",
    "北東",
    "東",
    "南東",
    "南",
    "南西",
    "西",
    "北西",
  ] as const;
  return labels[Math.round(normalized / 45) % labels.length] ?? "北";
}
