import type {
  Atmosphere,
} from "../domain";
import type {
  AppliedRefraction,
  RefractionInputSource,
} from "./types";

/**
 * The single optical-atmosphere preset used by the web UI.
 *
 * Pointing exports receive this same object so their provenance cannot drift
 * from the values supplied to the precision calculation.
 */
export const STANDARD_VISUAL_ATMOSPHERE = Object.freeze({
  minimumGeometricAltitudeDegrees: 5,
  pressureHpa: 1_013.25,
  relativeHumidity: 0.5,
  temperatureCelsius: 10,
  wavelengthMicrometers: 0.55,
} satisfies Atmosphere);

export const STANDARD_APPLIED_REFRACTION =
  Object.freeze<AppliedRefraction>({
    atmosphere: STANDARD_VISUAL_ATMOSPHERE,
    inputSource: "standard",
  });

export function atmosphereSourceLabel(
  source: RefractionInputSource,
) {
  return source === "standard" ? "標準大気" : "手動大気";
}

export function atmosphereValueSummary(atmosphere: Atmosphere) {
  const cutoff =
    atmosphere.minimumGeometricAltitudeDegrees ?? 5;
  return `${atmosphere.pressureHpa.toLocaleString("ja-JP", {
    maximumFractionDigits: 2,
  })} hPa・${atmosphere.temperatureCelsius.toLocaleString(
    "ja-JP",
    { maximumFractionDigits: 2 },
  )}°C・湿度${(atmosphere.relativeHumidity * 100).toLocaleString(
    "ja-JP",
    { maximumFractionDigits: 2 },
  )}%・${atmosphere.wavelengthMicrometers.toLocaleString(
    "ja-JP",
    { maximumFractionDigits: 3 },
  )} µm・高度${cutoff.toLocaleString("ja-JP", {
    maximumFractionDigits: 2,
  })}°以上`;
}
