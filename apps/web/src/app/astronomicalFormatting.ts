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

export function formatRightAscension(radians: number) {
  if (!Number.isFinite(radians)) {
    return "—";
  }

  const totalTenths = Math.round(
    (normalize(radians, TWO_PI) / TWO_PI) *
      SECONDS_PER_DAY *
      10,
  );
  const wrappedTenths =
    totalTenths % (SECONDS_PER_DAY * 10);
  const hours = Math.floor(
    wrappedTenths / (SECONDS_PER_HOUR * 10),
  );
  const afterHours =
    wrappedTenths - hours * SECONDS_PER_HOUR * 10;
  const minutes = Math.floor(afterHours / 600);
  const secondsTenths = afterHours - minutes * 600;
  const seconds = (secondsTenths / 10).toFixed(1).padStart(4, "0");

  return `${pad(hours)}h ${pad(minutes)}m ${seconds}s`;
}

export function formatDeclination(radians: number) {
  if (!Number.isFinite(radians)) {
    return "—";
  }

  const clamped = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, radians));
  const roundedArcseconds = Math.round(
    (Math.abs(clamped) * 180 * ARCSECONDS_PER_DEGREE) / Math.PI,
  );
  const degrees = Math.floor(
    roundedArcseconds / ARCSECONDS_PER_DEGREE,
  );
  const remainder =
    roundedArcseconds - degrees * ARCSECONDS_PER_DEGREE;
  const minutes = Math.floor(remainder / 60);
  const seconds = remainder - minutes * 60;
  const sign = clamped < 0 && roundedArcseconds > 0 ? "−" : "+";

  return `${sign}${pad(degrees)}° ${pad(minutes)}′ ${pad(seconds)}″`;
}

export function normalizedAzimuthDegrees(degrees: number) {
  if (!Number.isFinite(degrees)) {
    return null;
  }
  return normalize(degrees, 360);
}

export function formatAzimuthDegrees(degrees: number) {
  const normalized = normalizedAzimuthDegrees(degrees);
  if (normalized === null) {
    return "—";
  }
  return `${Math.round(normalized) % 360}°`;
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
