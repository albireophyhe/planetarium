import Foundation

public enum EventForecastCoverageGapEdgeV1:
    String, Codable, Equatable, Sendable
{
    case localYearStart = "local-year-start"
    case localYearEnd = "local-year-end"
}

public struct EventForecastCoverageGapV1:
    Equatable, Sendable
{
    public let edge: EventForecastCoverageGapEdgeV1
    public let resourceBoundaryUTC: Date
    public let missingDurationMilliseconds: Int
    public let approximateMinutes: Int
}

public enum EventForecastYearCoverageV1 {
    public static let safeStartUTC =
        date("1900-01-01T00:09:27.817Z")
    public static let safeEndUTC =
        date("2100-12-31T23:58:50.816Z")

    private static let supportedYears = 1900...2100
    private static let minimumUTCOffsetSeconds =
        -12 * 60 * 60
    private static let maximumUTCOffsetSeconds =
        14 * 60 * 60

    /**
     Reports the only local-calendar gap that can affect a supported year.

     The offsets are those in force at local 00:00 on January 1 of `year`
     and `year + 1`. Supplying both explicitly keeps platform time-zone
     behavior out of this pure coverage calculation.
     */
    public static func gap(
        year: Int,
        utcOffsetSecondsAtYearStart: Int,
        utcOffsetSecondsAtNextYearStart: Int
    ) throws -> EventForecastCoverageGapV1? {
        guard supportedYears.contains(year) else {
            throw EventForecastYearCoverageErrorV1
                .unsupportedYear
        }
        let supportedUTCOffsets = ClosedRange(
            uncheckedBounds: (
                lower: minimumUTCOffsetSeconds,
                upper: maximumUTCOffsetSeconds
            )
        )
        guard
            supportedUTCOffsets.contains(
                utcOffsetSecondsAtYearStart
            ),
            supportedUTCOffsets.contains(
                utcOffsetSecondsAtNextYearStart
            )
        else {
            throw EventForecastYearCoverageErrorV1
                .unsupportedUTCOffset
        }

        if year == supportedYears.lowerBound {
            let localYearStartUTC = try utcStart(
                year: year,
                utcOffsetSeconds:
                    utcOffsetSecondsAtYearStart
            )
            let missingMilliseconds = Int(
                (
                    safeStartUTC.timeIntervalSince(
                        localYearStartUTC
                    ) * 1_000
                ).rounded()
            )
            return missingMilliseconds > 0
                ? coverageGap(
                    edge: .localYearStart,
                    boundary: safeStartUTC,
                    missingMilliseconds:
                        missingMilliseconds
                )
                : nil
        }

        if year == supportedYears.upperBound {
            let localNextYearStartUTC = try utcStart(
                year: year + 1,
                utcOffsetSeconds:
                    utcOffsetSecondsAtNextYearStart
            )
            let missingMilliseconds = Int(
                (
                    localNextYearStartUTC.timeIntervalSince(
                        safeEndUTC
                    ) * 1_000
                ).rounded()
            )
            return missingMilliseconds > 0
                ? coverageGap(
                    edge: .localYearEnd,
                    boundary: safeEndUTC,
                    missingMilliseconds:
                        missingMilliseconds
                )
                : nil
        }

        return nil
    }

    private static func coverageGap(
        edge: EventForecastCoverageGapEdgeV1,
        boundary: Date,
        missingMilliseconds: Int
    ) -> EventForecastCoverageGapV1 {
        EventForecastCoverageGapV1(
            edge: edge,
            resourceBoundaryUTC: boundary,
            missingDurationMilliseconds:
                missingMilliseconds,
            approximateMinutes: max(
                1,
                Int(
                    ceil(
                        Double(missingMilliseconds)
                            / 60_000
                    )
                )
            )
        )
    }

    private static func utcStart(
        year: Int,
        utcOffsetSeconds: Int
    ) throws -> Date {
        var calendar =
            Calendar(identifier: .gregorian)
        calendar.timeZone =
            TimeZone(secondsFromGMT: 0)!
        guard let utcLabel = calendar.date(
            from: DateComponents(
                timeZone:
                    TimeZone(secondsFromGMT: 0),
                year: year,
                month: 1,
                day: 1
            )
        ) else {
            throw EventForecastYearCoverageErrorV1
                .unsupportedYear
        }
        return utcLabel.addingTimeInterval(
            -Double(utcOffsetSeconds)
        )
    }

    private static func date(_ iso8601: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        return formatter.date(from: iso8601)!
    }
}

public enum EventForecastYearCoverageErrorV1:
    Error, Equatable, Sendable
{
    case unsupportedYear
    case unsupportedUTCOffset
}
