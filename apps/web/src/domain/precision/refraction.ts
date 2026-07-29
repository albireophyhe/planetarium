/*
 * refractionCoefficients is a TypeScript derived work based on the IAU SOFA
 * 2023-10-11 C routine refco. It is not software provided by or endorsed by
 * SOFA. Unlike the original's broad silent clamping, this visual-only API
 * rejects values outside documented planetarium guardrails.
 */
import { assertFinite } from "./constants";
import type {
  Atmosphere,
  RefractionResult
} from "./types";

export interface RefractionCoefficients {
  readonly tangent: number;
  readonly tangentCubed: number;
}

function validateAtmosphere(atmosphere: Atmosphere): void {
  const pressure = assertFinite(
    atmosphere.pressureHpa,
    "Atmospheric pressure"
  );
  const temperature = assertFinite(
    atmosphere.temperatureCelsius,
    "Atmospheric temperature"
  );
  const humidity = assertFinite(
    atmosphere.relativeHumidity,
    "Relative humidity"
  );
  const wavelength = assertFinite(
    atmosphere.wavelengthMicrometers,
    "Wavelength"
  );
  if (pressure < 0 || pressure > 1_100) {
    throw new RangeError("Atmospheric pressure must be 0–1100 hPa");
  }
  if (temperature < -100 || temperature > 60) {
    throw new RangeError("Atmospheric temperature must be -100–60 °C");
  }
  if (humidity < 0 || humidity > 1) {
    throw new RangeError("Relative humidity must be between 0 and 1");
  }
  if (wavelength < 0.3 || wavelength > 2) {
    throw new RangeError("Visual wavelength must be 0.3–2 µm");
  }
}

export function refractionCoefficients(
  atmosphere: Atmosphere
): RefractionCoefficients {
  validateAtmosphere(atmosphere);
  const pressure = atmosphere.pressureHpa;
  const temperature = atmosphere.temperatureCelsius;
  const humidity = atmosphere.relativeHumidity;
  const wavelength = atmosphere.wavelengthMicrometers;
  const saturationPressure =
    pressure > 0
      ? Math.pow(
          10,
          (0.7859 + 0.03477 * temperature) /
            (1 + 0.00412 * temperature)
        ) *
        (1 +
          pressure *
            (4.5e-6 + 6e-10 * temperature * temperature))
      : 0;
  const vaporPressureDenominator =
    pressure > 0
      ? 1 - ((1 - humidity) * saturationPressure) / pressure
      : 1;
  if (!Number.isFinite(saturationPressure)) {
    throw new RangeError(
      "Atmospheric pressure, temperature, and humidity are not a physically valid combination"
    );
  }
  const waterVaporPressure =
    pressure > 0 && humidity > 0
      ? (humidity * saturationPressure) /
        vaporPressureDenominator
      : 0;
  if (
    (humidity > 0 &&
      (!Number.isFinite(vaporPressureDenominator) ||
        vaporPressureDenominator <= 1e-12)) ||
    !Number.isFinite(waterVaporPressure) ||
    waterVaporPressure < 0 ||
    waterVaporPressure > pressure
  ) {
    throw new RangeError(
      "Water-vapor pressure must be finite and no greater than total pressure"
    );
  }
  const temperatureKelvin = temperature + 273.15;
  const wavelengthSquared = wavelength * wavelength;
  const refractivity =
    (((77.53484e-6 +
      (4.39108e-7 + 3.666e-9 / wavelengthSquared) /
        wavelengthSquared) *
      pressure -
      11.2684e-6 * waterVaporPressure) /
      temperatureKelvin);
  const scaleHeightRatio = 4.4474e-6 * temperatureKelvin;
  const tangent = refractivity * (1 - scaleHeightRatio);
  const tangentCubed =
    -refractivity * (scaleHeightRatio - refractivity / 2);
  if (
    !Number.isFinite(refractivity) ||
    refractivity < 0 ||
    !Number.isFinite(tangent) ||
    tangent < 0 ||
    !Number.isFinite(tangentCubed) ||
    tangentCubed > 0
  ) {
    throw new RangeError(
      "Atmospheric state produced non-physical refraction coefficients"
    );
  }
  return Object.freeze({ tangent, tangentCubed });
}

/**
 * Convert a vacuum/geometric altitude to an observed optical altitude by
 * numerically inverting Z_topocentric = Z_observed + A tan Z + B tan³ Z.
 */
export function applyVisualRefraction(
  geometricAltitude: number,
  atmosphere: Atmosphere
): RefractionResult {
  return applyVisualRefractionWithCoefficients(
    geometricAltitude,
    refractionCoefficients(atmosphere),
    atmosphere.minimumGeometricAltitudeDegrees ?? 5
  );
}

export function applyVisualRefractionWithCoefficients(
  geometricAltitude: number,
  coefficients: RefractionCoefficients,
  minimumGeometricAltitudeDegrees = 5
): RefractionResult {
  if (
    !Number.isFinite(geometricAltitude) ||
    geometricAltitude < -Math.PI / 2 ||
    geometricAltitude > Math.PI / 2
  ) {
    throw new RangeError(
      "Geometric altitude must be between -π/2 and π/2"
    );
  }
  if (
    !Number.isFinite(coefficients.tangent) ||
    coefficients.tangent < 0 ||
    !Number.isFinite(coefficients.tangentCubed) ||
    coefficients.tangentCubed > 0
  ) {
    throw new RangeError(
      "Refraction coefficients must be finite and physically signed"
    );
  }
  const minimumDegrees = minimumGeometricAltitudeDegrees;
  if (
    !Number.isFinite(minimumDegrees) ||
    minimumDegrees < 5 ||
    minimumDegrees > 30
  ) {
    throw new RangeError(
      "Minimum refraction altitude must be between 5° and 30°"
    );
  }
  if (geometricAltitude < (minimumDegrees * Math.PI) / 180) {
    return {
      altitude: geometricAltitude,
      mode: "below-model-altitude"
    };
  }

  const geometricZenithDistance = Math.PI / 2 - geometricAltitude;
  let observedZenithDistance = geometricZenithDistance;
  let converged = false;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const tangent = Math.tan(observedZenithDistance);
    const tangentSquared = tangent * tangent;
    const secantSquared = 1 + tangentSquared;
    const residual =
      observedZenithDistance +
      coefficients.tangent * tangent +
      coefficients.tangentCubed * tangent * tangentSquared -
      geometricZenithDistance;
    const derivative =
      1 +
      coefficients.tangent * secantSquared +
      3 *
        coefficients.tangentCubed *
        tangentSquared *
        secantSquared;
    if (!Number.isFinite(derivative) || derivative <= 0) {
      throw new RangeError(
        "Refraction inversion has no stable physical solution"
      );
    }
    const correction = residual / derivative;
    if (!Number.isFinite(correction)) {
      throw new RangeError(
        "Refraction inversion produced a non-finite correction"
      );
    }
    observedZenithDistance -= correction;
    if (
      !Number.isFinite(observedZenithDistance) ||
      observedZenithDistance < -1e-14 ||
      observedZenithDistance > geometricZenithDistance + 1e-14
    ) {
      throw new RangeError(
        "Refraction inversion produced a non-physical altitude"
      );
    }
    if (Math.abs(correction) < 1e-14) {
      converged = true;
      break;
    }
  }
  if (!converged) {
    throw new RangeError("Refraction inversion did not converge");
  }
  const observedAltitude = Math.PI / 2 - observedZenithDistance;
  if (
    !Number.isFinite(observedAltitude) ||
    observedAltitude + 1e-14 < geometricAltitude ||
    observedAltitude > Math.PI / 2 + 1e-14
  ) {
    throw new RangeError(
      "Refraction inversion violated altitude monotonicity"
    );
  }
  return {
    altitude: Math.min(observedAltitude, Math.PI / 2),
    mode: "applied"
  };
}
