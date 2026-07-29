import Foundation

public extension Astronomy {
    /**
     Converts a propagated astrometric position into the natural direction
     seen from an observer at the supplied position.

     Both vectors are SSB-relative, use AU, and share
     BCRS/Hipparcos-aligned axes. This is an independent Euclidean vector
     calculation written for Planetarium; it is not derived from SOFA.
     */
    static func applyAnnualParallaxV2(
        astrometricPositionAU: Vector3D,
        observerPositionAU: Vector3D
    ) throws -> Vector3D {
        guard astrometricPositionAU.isFinite else {
            throw PrecisionModelError.nonFiniteValue(
                "Astrometric star position"
            )
        }
        guard observerPositionAU.isFinite else {
            throw PrecisionModelError.nonFiniteValue(
                "Annual-parallax observer position"
            )
        }
        return try precisionNormalized(
            astrometricPositionAU - observerPositionAU
        )
    }
}
