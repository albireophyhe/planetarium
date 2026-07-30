import Foundation

public enum EventTimeScaleError: LocalizedError, Equatable, Sendable {
    case nonFiniteTTJulianDate

    public var errorDescription: String? {
        switch self {
        case .nonFiniteTTJulianDate:
            "TT Julian date must be finite"
        }
    }
}

public enum EventTimeScales {
    /**
     Compact geocentric TT→TDB approximation.

     The dominant annual terms keep DE evaluation within roughly 0.1 ms of a
     full Fairhead-Bretagnon implementation for event timing. Observer-
     dependent topocentric TDB terms remain an omitted correction.
     */
    public static func tdbMinusTtSeconds(
        ttJulianDate: Double
    ) throws -> Double {
        guard ttJulianDate.isFinite else {
            throw EventTimeScaleError.nonFiniteTTJulianDate
        }
        let centuries =
            (ttJulianDate - Astronomy.j2000JulianDate)
            / PrecisionConstants.daysPerJulianCentury
        let meanAnomaly =
            (357.527_723_3 + 35_999.050_34 * centuries)
            * (.pi / 180)
        return 0.001_657 * sin(meanAnomaly)
            + 0.000_013_85 * sin(2 * meanAnomaly)
    }

    public static func ttToTdbJulianDate(
        ttJulianDate: Double
    ) throws -> Double {
        ttJulianDate
            + (try tdbMinusTtSeconds(
                ttJulianDate: ttJulianDate
            )) / PrecisionConstants.secondsPerDay
    }
}
