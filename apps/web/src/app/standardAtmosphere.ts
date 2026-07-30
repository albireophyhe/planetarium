import type {
  ApparentPositionOptionsV2,
  Atmosphere,
} from "../domain";

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

export const STANDARD_REFRACTION_OPTIONS =
  Object.freeze<ApparentPositionOptionsV2>({
    refraction: STANDARD_VISUAL_ATMOSPHERE,
  });
