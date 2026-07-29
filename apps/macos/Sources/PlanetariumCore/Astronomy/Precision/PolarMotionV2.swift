import Foundation

/*
 This Swift derived work adapts the IAU SOFA 2023-10-11 C routines pom00 and
 sp00. It is not software provided by or endorsed by SOFA.

 Differences from SOFA:
 - immutable Swift matrices are returned rather than mutating C arrays;
 - TT is accepted as one Julian Date for the app's 1900–2100 range; and
 - inputs are rejected outside conservative planetarium guardrails.
 */

private let maximumPoleCoordinateRadiansV2 =
    10 * PrecisionConstants.arcsecondsToRadians
private let maximumTIOLocatorRadiansV2 =
    PrecisionConstants.arcsecondsToRadians
private let j2000JulianDateV2 = 2_451_545.0

public extension Astronomy {
    /**
     Approximates the TIO locator s′ using the IERS/SOFA secular term:
     −47 microarcseconds per TT Julian century from J2000.0.
     */
    static func approximateTIOLocatorV2(
        ttJulianDate: Double
    ) throws -> Double {
        guard ttJulianDate.isFinite else {
            throw PrecisionModelError.nonFiniteValue(
                "TT Julian Date"
            )
        }
        let centuries =
            (ttJulianDate - j2000JulianDateV2)
            / PrecisionConstants.daysPerJulianCentury
        return -47e-6
            * centuries
            * PrecisionConstants.arcsecondsToRadians
    }

    /**
     Forms the IAU 2000 polar-motion matrix in the SOFA convention:
     `V(ITRS) = matrix × V(TIRS/CIP)`.

     SOFA composes Rz(s′), Ry(−xp), then Rx(−yp), which produces
     `Rx(−yp) × Ry(−xp) × Rz(s′)` for column vectors.
     */
    static func polarMotionMatrix2000V2(
        xpRadians: Double,
        ypRadians: Double,
        tioLocatorRadians: Double
    ) throws -> PrecisionMatrix3 {
        guard xpRadians.isFinite,
              abs(xpRadians)
                <= maximumPoleCoordinateRadiansV2
        else {
            throw PrecisionModelError.invalidPolarMotion(
                "xpは有限で±10秒角以内"
            )
        }
        guard ypRadians.isFinite,
              abs(ypRadians)
                <= maximumPoleCoordinateRadiansV2
        else {
            throw PrecisionModelError.invalidPolarMotion(
                "ypは有限で±10秒角以内"
            )
        }
        guard tioLocatorRadians.isFinite,
              abs(tioLocatorRadians)
                <= maximumTIOLocatorRadiansV2
        else {
            throw PrecisionModelError.invalidTioLocator
        }
        return .composedPassiveRotations(
            .passiveRotationZ(tioLocatorRadians),
            .passiveRotationY(-xpRadians),
            .passiveRotationX(-ypRadians)
        )
    }
}
