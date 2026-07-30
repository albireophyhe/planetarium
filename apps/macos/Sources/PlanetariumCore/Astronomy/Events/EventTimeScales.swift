import Foundation

public enum EventTimeScaleError: LocalizedError, Equatable, Sendable {
    case nonFiniteTTJulianDate
    case nonFiniteTDBJulianDate

    public var errorDescription: String? {
        switch self {
        case .nonFiniteTTJulianDate:
            "TT Julian date must be finite"
        case .nonFiniteTDBJulianDate:
            "TDB Julian date must be finite"
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

    public static func utcToTDBJulianDate(
        _ date: Date
    ) throws -> Double {
        guard date.timeIntervalSinceReferenceDate.isFinite else {
            throw EventTimeScaleError.nonFiniteTTJulianDate
        }
        let timeScales = try Astronomy.resolveTimeScalesV2(
            at: date
        )
        return try ttToTdbJulianDate(
            ttJulianDate: timeScales.ttJulianDate
        )
    }

    /**
     Proleptic-Gregorian year of a TDB-labelled Julian date.

     Candidate resources are partitioned by this year. This function does
     not convert the instant to UTC; public range filtering does that only
     after the correct TDB chunk has been loaded.
     */
    public static func tdbCalendarYear(
        tdbJulianDate: Double
    ) throws -> Int {
        guard tdbJulianDate.isFinite else {
            throw EventTimeScaleError.nonFiniteTDBJulianDate
        }
        let tdbLabel = Date(
            timeIntervalSince1970:
                (tdbJulianDate - 2_440_587.5)
                * PrecisionConstants.secondsPerDay
        )
        guard tdbLabel.timeIntervalSinceReferenceDate.isFinite else {
            throw EventTimeScaleError.nonFiniteTDBJulianDate
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar.component(.year, from: tdbLabel)
    }

    /**
     Inverts the app's UTC→TT→TDB model for an event candidate seed.

     The iteration deliberately calls the same time-scale resolver used by
     the precision pipeline, keeping pre-1972 and future leap-second
     assumptions identical in both directions.
     */
    public static func tdbToUTCDate(
        tdbJulianDate: Double
    ) throws -> Date {
        guard tdbJulianDate.isFinite else {
            throw EventTimeScaleError.nonFiniteTDBJulianDate
        }
        var utcSeconds =
            (tdbJulianDate - 2_440_587.5)
            * PrecisionConstants.secondsPerDay
            - 69.184
        for _ in 0..<6 {
            let candidate = Date(
                timeIntervalSince1970: utcSeconds
            )
            let timeScales = try Astronomy.resolveTimeScalesV2(
                at: candidate
            )
            let computedTDB = try ttToTdbJulianDate(
                ttJulianDate: timeScales.ttJulianDate
            )
            let correctionSeconds =
                (tdbJulianDate - computedTDB)
                * PrecisionConstants.secondsPerDay
            utcSeconds += correctionSeconds
            if abs(correctionSeconds) < 0.000_001 {
                break
            }
        }
        let result = Date(timeIntervalSince1970: utcSeconds)
        guard result.timeIntervalSinceReferenceDate.isFinite else {
            throw EventTimeScaleError.nonFiniteTDBJulianDate
        }
        return result
    }
}
