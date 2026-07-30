import Foundation

private struct LeapSecondEntryV2: Sendable {
    let effectiveAt: Date
    let taiMinusUTCSeconds: Double
}

private enum TimeScaleReferenceV2 {
    static let leapSeconds: [LeapSecondEntryV2] = {
        let rawValues: [(String, Double)] = [
            ("1972-01-01T00:00:00Z", 10),
            ("1972-07-01T00:00:00Z", 11),
            ("1973-01-01T00:00:00Z", 12),
            ("1974-01-01T00:00:00Z", 13),
            ("1975-01-01T00:00:00Z", 14),
            ("1976-01-01T00:00:00Z", 15),
            ("1977-01-01T00:00:00Z", 16),
            ("1978-01-01T00:00:00Z", 17),
            ("1979-01-01T00:00:00Z", 18),
            ("1980-01-01T00:00:00Z", 19),
            ("1981-07-01T00:00:00Z", 20),
            ("1982-07-01T00:00:00Z", 21),
            ("1983-07-01T00:00:00Z", 22),
            ("1985-07-01T00:00:00Z", 23),
            ("1988-01-01T00:00:00Z", 24),
            ("1990-01-01T00:00:00Z", 25),
            ("1991-01-01T00:00:00Z", 26),
            ("1992-07-01T00:00:00Z", 27),
            ("1993-07-01T00:00:00Z", 28),
            ("1994-07-01T00:00:00Z", 29),
            ("1996-01-01T00:00:00Z", 30),
            ("1997-07-01T00:00:00Z", 31),
            ("1999-01-01T00:00:00Z", 32),
            ("2006-01-01T00:00:00Z", 33),
            ("2009-01-01T00:00:00Z", 34),
            ("2012-07-01T00:00:00Z", 35),
            ("2015-07-01T00:00:00Z", 36),
            ("2017-01-01T00:00:00Z", 37),
        ]
        let formatter = ISO8601DateFormatter()
        return rawValues.map { iso, value in
            LeapSecondEntryV2(
                effectiveAt: formatter.date(from: iso)!,
                taiMinusUTCSeconds: value
            )
        }
    }()

    /*
     * IERS Bulletin C 72 (2026-07-06) confirms no leap second at the end of
     * December 2026. A later Bulletin C can change the offset from 2027-07-01.
     */
    static let leapSecondKnownThrough: Date = {
        let formatter = ISO8601DateFormatter()
        return formatter.date(from: "2027-07-01T00:00:00Z")!
    }()
}

private struct DefaultTAIResultV2 {
    let seconds: Double
    let source: TAIMinusUTCSourceV2
    let warnings: [PrecisionWarningCode]
}

private let maximumAbsoluteDUT1SecondsV2 = 3_600.0
private let maximumDUT1UncertaintySecondsV2 = 3_600.0

public enum TAIMinusUTCAssumptionV2:
    Hashable,
    Sendable
{
    case pre1972Approximation(seconds: Double)
    case futureLeapSecondsUnknown(seconds: Double)
}

private func defaultTAIMinusUTC(at date: Date) -> DefaultTAIResultV2 {
    var selected: LeapSecondEntryV2?
    for entry in TimeScaleReferenceV2.leapSeconds {
        guard date >= entry.effectiveAt else { break }
        selected = entry
    }

    guard let selected else {
        return DefaultTAIResultV2(
            seconds: 0,
            source: .pre1972Approximation,
            warnings: [.pre1972UTCTTApproximation]
        )
    }

    return DefaultTAIResultV2(
        seconds: selected.taiMinusUTCSeconds,
        source: .iersHistory,
        warnings: date >= TimeScaleReferenceV2.leapSecondKnownThrough
            ? [.futureLeapSecondsUnknown]
            : []
    )
}

public extension Astronomy {
    /// Classifies only reader-relevant default TAI−UTC assumptions. Caller
    /// supplied values do not carry these default-model warnings.
    static func taiMinusUTCAssumptionV2(
        from timeScales: ResolvedTimeScalesV2
    ) -> TAIMinusUTCAssumptionV2? {
        if timeScales.warnings.contains(
            .pre1972UTCTTApproximation
        ) {
            return .pre1972Approximation(
                seconds: timeScales.taiMinusUTCSeconds
            )
        }
        if timeScales.warnings.contains(
            .futureLeapSecondsUnknown
        ) {
            return .futureLeapSecondsUnknown(
                seconds: timeScales.taiMinusUTCSeconds
            )
        }
        return nil
    }

    /// Resolves UTC, TAI, TT, and UT1 for the v2 model.
    static func resolveTimeScalesV2(
        at date: Date,
        options: EarthOrientationOptionsV2 = EarthOrientationOptionsV2()
    ) throws -> ResolvedTimeScalesV2 {
        guard date.timeIntervalSinceReferenceDate.isFinite,
              ObservationConstraints.supportedDateRange.contains(date)
        else {
            throw PrecisionModelError.unsupportedObservationDate
        }

        let utcJulianDate = julianDate(for: date)
        var warnings: [PrecisionWarningCode] = []

        if options.dut1Seconds == nil,
           options.dut1Source != nil
            || options.dut1UncertaintySeconds != nil
        {
            throw PrecisionModelError.dut1MetadataWithoutValue
        }
        let dut1Seconds = options.dut1Seconds ?? 0
        guard dut1Seconds.isFinite else {
            throw PrecisionModelError.nonFiniteValue("DUT1")
        }
        guard abs(dut1Seconds)
            <= maximumAbsoluteDUT1SecondsV2
        else {
            throw PrecisionModelError.dut1OutOfRange
        }
        let dut1Source: DUT1SourceV2 =
            options.dut1Seconds == nil
            ? .assumedZero
            : options.dut1Source ?? .caller
        if options.dut1Seconds != nil,
           dut1Source == .assumedZero
        {
            throw PrecisionModelError.dut1MetadataWithoutValue
        }
        let dut1UncertaintySeconds =
            options.dut1UncertaintySeconds
        if let dut1UncertaintySeconds {
            guard dut1UncertaintySeconds.isFinite else {
                throw PrecisionModelError.nonFiniteValue(
                    "DUT1 uncertainty"
                )
            }
            guard (0...maximumDUT1UncertaintySecondsV2)
                .contains(dut1UncertaintySeconds)
            else {
                throw PrecisionModelError.dut1UncertaintyOutOfRange
            }
        }
        if dut1Source == .assumedZero {
            warnings.append(.dut1AssumedZero)
        }

        let defaultTAI = defaultTAIMinusUTC(at: date)
        let taiMinusUTCSeconds =
            options.taiMinusUTCSeconds ?? defaultTAI.seconds
        guard taiMinusUTCSeconds.isFinite else {
            throw PrecisionModelError.nonFiniteValue("TAI−UTC")
        }
        guard (-100...200).contains(taiMinusUTCSeconds) else {
            throw PrecisionModelError.taiMinusUTCOutOfRange
        }
        let taiMinusUTCSource: TAIMinusUTCSourceV2 =
            options.taiMinusUTCSeconds == nil ? defaultTAI.source : .caller
        if options.taiMinusUTCSeconds == nil {
            warnings.append(contentsOf: defaultTAI.warnings)
        }

        let taiJulianDate =
            utcJulianDate
            + taiMinusUTCSeconds / PrecisionConstants.secondsPerDay
        return ResolvedTimeScalesV2(
            utcJulianDate: utcJulianDate,
            taiJulianDate: taiJulianDate,
            ttJulianDate:
                taiJulianDate + 32.184 / PrecisionConstants.secondsPerDay,
            ut1JulianDate:
                utcJulianDate
                + dut1Seconds / PrecisionConstants.secondsPerDay,
            dut1Seconds: dut1Seconds,
            dut1UncertaintySeconds: dut1UncertaintySeconds,
            taiMinusUTCSeconds: taiMinusUTCSeconds,
            dut1Source: dut1Source,
            taiMinusUTCSource: taiMinusUTCSource,
            warnings: warnings
        )
    }
}
