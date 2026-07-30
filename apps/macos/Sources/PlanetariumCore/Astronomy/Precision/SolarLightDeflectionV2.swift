import Foundation

/*
 * `applySolarLightDeflectionV2` is a Swift derived work based on the vector
 * expressions in the IAU SOFA 2023-10-11 C routines `ld` and `ldsun`. It is
 * not software provided by or endorsed by SOFA.
 *
 * Differences from SOFA: this helper implements only the distant-source
 * solar case (q=p and one solar mass), uses an application-specific prepared
 * context, rejects non-finite/non-unit inputs, and explicitly normalizes the
 * result. The surrounding pipeline supplies either caller geometry or the
 * separately implemented shared 200-term VSOP2000 heliocentric Earth
 * approximation.
 */

private let solarLightDeflectionUnitVectorTolerance = 1e-9

private func solarLightDeflectionUnitVectorSquaredV2(
    _ vector: Vector3D
) throws -> Double {
    guard vector.isFinite else {
        throw PrecisionModelError.invalidVector
    }
    let squaredMagnitude = vector.lengthSquared
    let magnitude = sqrt(squaredMagnitude)
    guard magnitude.isFinite,
          abs(magnitude - 1)
            <= solarLightDeflectionUnitVectorTolerance
    else {
        throw PrecisionModelError.invalidVector
    }
    return squaredMagnitude
}

public extension Astronomy {
    static func prepareSolarLightDeflectionV2(
        sunToObserverUnitDirection: Vector3D,
        sunObserverDistanceAU: Double,
        mode: SolarLightDeflectionModeV2
    ) throws -> PreparedSolarLightDeflectionContextV2 {
        _ = try solarLightDeflectionUnitVectorSquaredV2(
            sunToObserverUnitDirection
        )
        guard sunObserverDistanceAU.isFinite,
              sunObserverDistanceAU > 0
        else {
            throw PrecisionModelError.invalidSunObserverDistance
        }
        guard mode != .disabled else {
            throw PrecisionModelError.invalidVector
        }

        let distanceSquared =
            sunObserverDistanceAU * sunObserverDistanceAU
        let deflectionLimiter =
            1e-6 / max(distanceSquared, 1)
        let gravitationalScale =
            PrecisionConstants.solarSchwarzschildRadiusAU
            / sunObserverDistanceAU
        guard deflectionLimiter.isFinite,
              deflectionLimiter > 0,
              gravitationalScale.isFinite,
              gravitationalScale > 0
        else {
            throw PrecisionModelError.invalidSunObserverDistance
        }

        return PreparedSolarLightDeflectionContextV2(
            mode: mode,
            sunToObserverUnitDirection:
                sunToObserverUnitDirection,
            sunObserverDistanceAU: sunObserverDistanceAU,
            deflectionLimiter: deflectionLimiter,
            gravitationalScale: gravitationalScale
        )
    }

    /**
     Hot-path form of SOFA `ldsun` for a source direction already known to
     be normalized. The official limiter remains active at and near the
     solar center, preventing a singular correction.
     */
    static func applyPreparedSolarLightDeflectionToUnitDirectionV2(
        _ direction: Vector3D,
        prepared: PreparedSolarLightDeflectionContextV2
    ) throws -> Vector3D {
        let directionSquared =
            try solarLightDeflectionUnitVectorSquaredV2(direction)
        let sunToObserver =
            prepared.sunToObserverUnitDirection
        let directionGeometryDot =
            direction.dot(sunToObserver)
        let denominator = max(
            directionSquared + directionGeometryDot,
            prepared.deflectionLimiter
        )
        let weight =
            prepared.gravitationalScale / denominator

        // p × (e × p) = e(p·p) − p(p·e), the scalar SOFA `ld` form.
        let corrected = Vector3D(
            x:
                direction.x
                + weight
                * (
                    sunToObserver.x * directionSquared
                        - direction.x * directionGeometryDot
                ),
            y:
                direction.y
                + weight
                * (
                    sunToObserver.y * directionSquared
                        - direction.y * directionGeometryDot
                ),
            z:
                direction.z
                + weight
                * (
                    sunToObserver.z * directionSquared
                        - direction.z * directionGeometryDot
                )
        )
        return try precisionNormalized(corrected)
    }

    static func applySolarLightDeflectionV2(
        naturalDirection: Vector3D,
        sunToObserverUnitDirection: Vector3D,
        sunObserverDistanceAU: Double
    ) throws -> Vector3D {
        try applyPreparedSolarLightDeflectionToUnitDirectionV2(
            naturalDirection,
            prepared: prepareSolarLightDeflectionV2(
                sunToObserverUnitDirection:
                    sunToObserverUnitDirection,
                sunObserverDistanceAU: sunObserverDistanceAU,
                mode: .callerSunObserverGeometry
            )
        )
    }
}
