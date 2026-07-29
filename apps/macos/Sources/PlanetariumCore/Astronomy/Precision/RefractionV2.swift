import Foundation

/*
 * `refractionCoefficientsV2` is a Swift derived work based on the IAU SOFA
 * 2023-10-11 C routine `refco`. It is not software provided by or endorsed by
 * SOFA. Unlike the original routine's broad silent clamping, this visual-only
 * API rejects values outside the documented planetarium guardrails.
 *
 * Differences and the full license are documented in `SOFA-NOTICE.md`;
 * model scope is documented in `docs/astronomy-model-v2.md`.
 */

private func validateAtmosphereV2(_ atmosphere: AtmosphereV2) throws {
    guard atmosphere.pressureHPA.isFinite else {
        throw PrecisionModelError.nonFiniteValue("Atmospheric pressure")
    }
    guard atmosphere.temperatureCelsius.isFinite else {
        throw PrecisionModelError.nonFiniteValue("Atmospheric temperature")
    }
    guard atmosphere.relativeHumidity.isFinite else {
        throw PrecisionModelError.nonFiniteValue("Relative humidity")
    }
    guard atmosphere.wavelengthMicrometers.isFinite else {
        throw PrecisionModelError.nonFiniteValue("Wavelength")
    }
    guard (0...1_100).contains(atmosphere.pressureHPA) else {
        throw PrecisionModelError.invalidAtmosphere("pressure")
    }
    guard (-100...60).contains(atmosphere.temperatureCelsius) else {
        throw PrecisionModelError.invalidAtmosphere("temperature")
    }
    guard (0...1).contains(atmosphere.relativeHumidity) else {
        throw PrecisionModelError.invalidAtmosphere("humidity")
    }
    guard (0.3...2).contains(atmosphere.wavelengthMicrometers) else {
        throw PrecisionModelError.invalidAtmosphere("wavelength")
    }
    guard atmosphere.minimumGeometricAltitudeDegrees.isFinite,
          (5...30).contains(atmosphere.minimumGeometricAltitudeDegrees)
    else {
        throw PrecisionModelError.invalidMinimumRefractionAltitude
    }
}

public extension Astronomy {
    static func refractionCoefficientsV2(
        for atmosphere: AtmosphereV2
    ) throws -> RefractionCoefficientsV2 {
        try validateAtmosphereV2(atmosphere)
        let pressure = atmosphere.pressureHPA
        let temperature = atmosphere.temperatureCelsius
        let humidity = atmosphere.relativeHumidity
        let wavelength = atmosphere.wavelengthMicrometers
        let saturationPressure =
            pressure > 0
            ? pow(
                10,
                (0.7859 + 0.03477 * temperature)
                    / (1 + 0.00412 * temperature)
            )
                * (
                    1
                        + pressure
                        * (
                            4.5e-6
                                + 6e-10 * temperature * temperature
                        )
                )
            : 0
        guard saturationPressure.isFinite, saturationPressure >= 0 else {
            throw PrecisionModelError.invalidAtmosphere(
                "saturation vapor pressure"
            )
        }

        let waterVaporPressure: Double
        if pressure > 0 {
            let vaporPressureDenominator =
                1 - (1 - humidity) * saturationPressure / pressure
            guard vaporPressureDenominator.isFinite,
                  vaporPressureDenominator > 0
            else {
                throw PrecisionModelError.invalidAtmosphere(
                    "vapor-pressure denominator"
                )
            }
            waterVaporPressure =
                humidity * saturationPressure
                / vaporPressureDenominator
            guard waterVaporPressure.isFinite,
                  waterVaporPressure >= 0,
                  waterVaporPressure < pressure
            else {
                throw PrecisionModelError.invalidAtmosphere(
                    "water vapor pressure"
                )
            }
        } else {
            waterVaporPressure = 0
        }
        let temperatureKelvin = temperature + 273.15
        let wavelengthSquared = wavelength * wavelength
        let refractivity =
            (
                (
                    77.53484e-6
                        + (
                            4.39108e-7
                                + 3.666e-9 / wavelengthSquared
                        )
                        / wavelengthSquared
                )
                    * pressure
                    - 11.2684e-6 * waterVaporPressure
            )
            / temperatureKelvin
        let scaleHeightRatio = 4.4474e-6 * temperatureKelvin
        let coefficients = RefractionCoefficientsV2(
            tangent: refractivity * (1 - scaleHeightRatio),
            tangentCubed:
                -refractivity * (scaleHeightRatio - refractivity / 2)
        )
        guard coefficients.tangent.isFinite,
              coefficients.tangentCubed.isFinite,
              coefficients.tangent >= 0,
              pressure == 0 || coefficients.tangent > 0,
              coefficients.tangentCubed <= 0,
              abs(coefficients.tangentCubed) <= coefficients.tangent
        else {
            throw PrecisionModelError.invalidRefractionCoefficients
        }
        return coefficients
    }

    /// Numerically inverts Z_topocentric = Z_observed + A tan Z + B tan³ Z.
    static func applyVisualRefractionV2(
        to geometricAltitude: Double,
        atmosphere: AtmosphereV2
    ) throws -> RefractionResultV2 {
        try applyVisualRefractionV2(
            to: geometricAltitude,
            coefficients: refractionCoefficientsV2(for: atmosphere),
            minimumGeometricAltitudeDegrees:
                atmosphere.minimumGeometricAltitudeDegrees
        )
    }

    static func applyVisualRefractionV2(
        to geometricAltitude: Double,
        coefficients: RefractionCoefficientsV2,
        minimumGeometricAltitudeDegrees: Double = 5
    ) throws -> RefractionResultV2 {
        guard geometricAltitude.isFinite,
              (-Double.pi / 2...Double.pi / 2).contains(geometricAltitude)
        else {
            throw PrecisionModelError.invalidGeometricAltitude
        }
        guard coefficients.tangent.isFinite,
              coefficients.tangentCubed.isFinite,
              coefficients.tangent >= 0,
              coefficients.tangentCubed <= 0,
              abs(coefficients.tangentCubed) <= coefficients.tangent
        else {
            throw PrecisionModelError.invalidRefractionCoefficients
        }
        guard minimumGeometricAltitudeDegrees.isFinite,
              (5...30).contains(minimumGeometricAltitudeDegrees)
        else {
            throw PrecisionModelError.invalidMinimumRefractionAltitude
        }
        if geometricAltitude
            < Angles.radians(fromDegrees: minimumGeometricAltitudeDegrees)
        {
            return RefractionResultV2(
                altitude: geometricAltitude,
                mode: .belowModelAltitude
            )
        }

        let geometricZenithDistance = Double.pi / 2 - geometricAltitude
        var observedZenithDistance = geometricZenithDistance
        var converged = false
        for _ in 0..<8 {
            let tangent = tan(observedZenithDistance)
            let tangentSquared = tangent * tangent
            let secantSquared = 1 + tangentSquared
            let residual =
                observedZenithDistance
                + coefficients.tangent * tangent
                + coefficients.tangentCubed * tangent * tangentSquared
                - geometricZenithDistance
            let derivative =
                1
                + coefficients.tangent * secantSquared
                + 3
                * coefficients.tangentCubed
                * tangentSquared
                * secantSquared
            guard tangent.isFinite,
                  tangentSquared.isFinite,
                  secantSquared.isFinite,
                  residual.isFinite,
                  derivative.isFinite,
                  abs(derivative) > 1e-14
            else {
                throw PrecisionModelError.refractionInversionFailed
            }
            let correction = residual / derivative
            guard correction.isFinite else {
                throw PrecisionModelError.refractionInversionFailed
            }
            let nextZenithDistance =
                observedZenithDistance - correction
            let iterationTolerance = 1e-14
            guard nextZenithDistance.isFinite,
                  nextZenithDistance >= -iterationTolerance,
                  nextZenithDistance
                      <= observedZenithDistance + iterationTolerance,
                  nextZenithDistance
                      <= geometricZenithDistance + iterationTolerance
            else {
                throw PrecisionModelError.refractionInversionFailed
            }
            observedZenithDistance = max(0, nextZenithDistance)
            if abs(correction) < 1e-14 {
                converged = true
                break
            }
        }
        guard converged else {
            throw PrecisionModelError.refractionInversionFailed
        }
        let observedAltitude =
            Double.pi / 2 - observedZenithDistance
        let resultTolerance = 1e-14
        guard observedAltitude.isFinite,
              observedAltitude >= geometricAltitude - resultTolerance,
              observedAltitude <= Double.pi / 2 + resultTolerance
        else {
            throw PrecisionModelError.refractionInversionFailed
        }
        return RefractionResultV2(
            altitude: min(observedAltitude, Double.pi / 2),
            mode: .applied
        )
    }
}
