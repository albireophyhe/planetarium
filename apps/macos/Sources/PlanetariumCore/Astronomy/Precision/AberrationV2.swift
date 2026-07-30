import Foundation

/*
 * `applyAnnualAberrationV2` is a Swift derived work based on the vector
 * expression in the IAU SOFA 2023-10-11 C routine `ab`. It is not software
 * provided by or endorsed by SOFA. The default state comes from the separate
 * shared 200-term VSOP2000 heliocentric Earth approximation and is reported
 * as such.
 *
 * Differences and the full license are documented in `SOFA-NOTICE.md`;
 * model scope is documented in `docs/astronomy-model-v2.md`.
 */

public struct ApproximateEarthStateV2: Hashable, Sendable {
    /// Heliocentric Sun-to-Earth position in BCRS-oriented AU.
    public let positionAU: Vector3D
    /**
     Heliocentric Earth velocity in BCRS-oriented units of c.

     The omitted SSB-to-Sun velocity remains an explicit approximation.
     */
    public let velocityC: Vector3D
    public let sunObserverDistanceAU: Double
}

public extension Astronomy {
    static func approximateEarthStateV2(
        ttJulianDate: Double
    ) throws -> ApproximateEarthStateV2 {
        let earth = try truncatedEarthHeliocentricStateV2(
            ttJulianDate: ttJulianDate
        )
        return ApproximateEarthStateV2(
            positionAU: earth.positionAU,
            velocityC:
                earth.velocityAUPerDay
                / PrecisionConstants.speedOfLightAUPerDay,
            sunObserverDistanceAU: earth.positionAU.length
        )
    }

    static func prepareAnnualAberrationV2(
        observerBarycentricVelocityC: Vector3D,
        sunObserverDistanceAU: Double,
        mode: AberrationModeV2
    ) throws -> PreparedAberrationContextV2 {
        guard mode != .disabled else {
            throw PrecisionModelError.invalidVector
        }
        guard sunObserverDistanceAU.isFinite,
              sunObserverDistanceAU > 0
        else {
            throw PrecisionModelError.invalidSunObserverDistance
        }
        guard observerBarycentricVelocityC.isFinite else {
            throw PrecisionModelError.nonFiniteValue(
                "Observer barycentric velocity"
            )
        }
        let speedSquared =
            observerBarycentricVelocityC.lengthSquared
        guard speedSquared < 1 else {
            throw PrecisionModelError.observerVelocityAtOrAboveLightSpeed
        }
        return PreparedAberrationContextV2(
            mode: mode,
            observerBarycentricVelocityC:
                observerBarycentricVelocityC,
            reciprocalLorentzFactor: sqrt(1 - speedSquared),
            solarPotentialWeight:
                PrecisionConstants.solarSchwarzschildRadiusAU
                / sunObserverDistanceAU
        )
    }

    static func applyPreparedAnnualAberrationV2(
        naturalDirection: Vector3D,
        prepared: PreparedAberrationContextV2
    ) throws -> Vector3D {
        let direction = try precisionNormalized(naturalDirection)
        let velocity = prepared.observerBarycentricVelocityC
        let directionVelocityDot = direction.dot(velocity)
        let velocityWeight =
            1
            + directionVelocityDot
            / (1 + prepared.reciprocalLorentzFactor)
        return try precisionNormalized(
            direction * prepared.reciprocalLorentzFactor
                + velocityWeight * velocity
                + prepared.solarPotentialWeight
                * (velocity - directionVelocityDot * direction)
        )
    }

    /// Applies the relativistically normalized annual-aberration expression.
    static func applyAnnualAberrationV2(
        naturalDirection: Vector3D,
        observerBarycentricVelocityC: Vector3D,
        sunObserverDistanceAU: Double
    ) throws -> Vector3D {
        try applyPreparedAnnualAberrationV2(
            naturalDirection: naturalDirection,
            prepared: prepareAnnualAberrationV2(
                observerBarycentricVelocityC:
                    observerBarycentricVelocityC,
                sunObserverDistanceAU: sunObserverDistanceAU,
                mode: .callerBarycentricVelocity
            )
        )
    }
}
