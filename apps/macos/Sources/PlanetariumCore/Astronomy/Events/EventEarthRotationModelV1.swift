import Foundation

public struct EventEarthRotationFallbackV1:
    Hashable,
    Sendable
{
    public let deltaTSeconds: Double
    public let deltaTUncertaintySeconds: Double
    public let assumedTAIMinusUTCSeconds: Double
    public let dut1Seconds: Double
    public let earthOrientation: EarthOrientationOptionsV2
    public let eopID: String
    public let deltaTModel: String
    public let pathUncertaintyKilometers: Double
    public let dominantContributors: [String]
    public let warnings: [String]
}

public enum EventEarthRotationModelErrorV1:
    LocalizedError,
    Equatable,
    Sendable
{
    case fallbackInsideBundledEOPCoverage

    public var errorDescription: String? {
        switch self {
        case .fallbackInsideBundledEOPCoverage:
            "同梱IERS EOP収録内では地球回転fallbackを使用できません。"
        }
    }
}

public enum EventEarthRotationModelV1 {
    private static let ttMinusTAISeconds = 32.184
    private static let earthEquatorialRotationKilometersPerSecond =
        0.465_101_1
    private static let nasaDeltaTLunarAcceleration =
        -26.0
    private static let de44xLunarAcceleration =
        -25.936
    private static let eopFirstSampleUTC = Date(
        timeIntervalSince1970: 94_780_800
    )

    /// Final paired DUT1/polar-motion prediction in the bundled EOP snapshot.
    public static let eopLastSampleUTC = Date(
        timeIntervalSince1970: 1_816_992_000
    )

    /**
     ΔT = TAI−UTC + 32.184 − DUT1 at MJD 61617:
     37 + 32.184 − (−0.047694) seconds.
     */
    public static let eopAnchorDeltaTSeconds =
        69.231_694

    private static let eopAnchorReportedErrorSeconds =
        0.025_410

    /**
     Decimal-year convention used by NASA's ΔT polynomials:
     year + (month − 0.5) / 12.
     */
    public static func nasaDecimalYear(
        at date: Date
    ) throws -> Double {
        guard date.timeIntervalSinceReferenceDate.isFinite else {
            throw PrecisionModelError.unsupportedObservationDate
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone =
            TimeZone(secondsFromGMT: 0)!
        let components = calendar.dateComponents(
            [.year, .month],
            from: date
        )
        guard let year = components.year,
              let month = components.month
        else {
            throw PrecisionModelError.unsupportedObservationDate
        }
        return Double(year)
            + (Double(month) - 0.5) / 12
    }

    /**
     NASA's published ΔT approximation for the app's 1900–2100 range,
     before matching its assumed lunar secular acceleration to DE44x.
     */
    public static func nasaPolynomialSeconds(
        decimalYear: Double
    ) throws -> Double {
        guard decimalYear.isFinite,
              (1900...2101).contains(decimalYear)
        else {
            throw PrecisionModelError.unsupportedObservationDate
        }

        if decimalYear < 1920 {
            let t = decimalYear - 1900
            return -2.79
                + 1.494_119 * t
                - 0.059_893_9 * pow(t, 2)
                + 0.006_196_6 * pow(t, 3)
                - 0.000_197 * pow(t, 4)
        }
        if decimalYear < 1941 {
            let t = decimalYear - 1920
            return 21.2
                + 0.844_93 * t
                - 0.076_1 * pow(t, 2)
                + 0.002_093_6 * pow(t, 3)
        }
        if decimalYear < 1961 {
            let t = decimalYear - 1950
            return 29.07
                + 0.407 * t
                - pow(t, 2) / 233
                + pow(t, 3) / 2_547
        }
        if decimalYear < 1986 {
            let t = decimalYear - 1975
            return 45.45
                + 1.067 * t
                - pow(t, 2) / 260
                - pow(t, 3) / 718
        }
        if decimalYear < 2005 {
            let t = decimalYear - 2000
            return 63.86
                + 0.334_5 * t
                - 0.060_374 * pow(t, 2)
                + 0.001_727_5 * pow(t, 3)
                + 0.000_651_814 * pow(t, 4)
                + 0.000_023_735_99 * pow(t, 5)
        }
        if decimalYear < 2050 {
            let t = decimalYear - 2000
            return 62.92
                + 0.322_17 * t
                + 0.005_589 * pow(t, 2)
        }
        return -20
            + 32 * pow((decimalYear - 1820) / 100, 2)
            - 0.562_8 * (2150 - decimalYear)
    }

    /**
     Adjusts NASA's −26 arcsec/cy² ΔT convention to the DE440/441/442
     lunar secular acceleration of approximately −25.936 arcsec/cy².

     NASA specifies c = −0.91072 × (ṅ + 26) × ((y−1955)/100)² seconds.
     Observations from 1955 through 2005 are independent of a lunar
     ephemeris, so their correction is zero.
     */
    public static func de442sLunarAccelerationCorrectionSeconds(
        decimalYear: Double
    ) throws -> Double {
        guard decimalYear.isFinite else {
            throw PrecisionModelError.unsupportedObservationDate
        }
        if (1955...2005).contains(decimalYear) {
            return 0
        }
        let centuriesFrom1955 =
            (decimalYear - 1955) / 100
        return -0.910_72
            * (
                de44xLunarAcceleration
                    - nasaDeltaTLunarAcceleration
            )
            * pow(centuriesFrom1955, 2)
    }

    public static func nasaFutureUncertaintySeconds(
        decimalYear: Double
    ) throws -> Double {
        guard decimalYear.isFinite else {
            throw PrecisionModelError.unsupportedObservationDate
        }
        let elapsedYears = max(0, decimalYear - 2005)
        return 365.25
            * elapsedYears
            * sqrt(
                elapsedYears * 0.058 / 3
                * (1 + elapsedYears / 2_500)
            )
            / 1_000
    }

    /**
     Supplies TT−UT1 outside bundled IERS coverage while retaining the app's
     explicit UTC convention. DUT1 is derived from ΔT and the assumed
     TAI−UTC, so a UT1-like instant is not mislabeled as civil UTC.

     Dates in the bundled IERS EOP closed interval are rejected. A missing or
     corrupt in-coverage lookup must fail closed rather than being disguised
     as an out-of-coverage polynomial fallback.
     */
    public static func fallback(
        at date: Date
    ) throws -> EventEarthRotationFallbackV1 {
        guard date.timeIntervalSinceReferenceDate.isFinite else {
            throw PrecisionModelError.unsupportedObservationDate
        }
        guard date < eopFirstSampleUTC
                || date > eopLastSampleUTC
        else {
            throw EventEarthRotationModelErrorV1
                .fallbackInsideBundledEOPCoverage
        }
        let decimalYear = try nasaDecimalYear(at: date)
        let anchorYear = try nasaDecimalYear(
            at: eopLastSampleUTC
        )
        let isFuture = date > eopLastSampleUTC

        let deltaTSeconds: Double
        let uncertaintySeconds: Double
        let model: String
        let contributors: [String]
        let warnings: [String]

        if isFuture {
            let anchorPolynomial =
                try nasaPolynomialSeconds(
                    decimalYear: anchorYear
                )
            let anchorLunarAccelerationCorrection =
                try de442sLunarAccelerationCorrectionSeconds(
                    decimalYear: anchorYear
                )
            deltaTSeconds =
                eopAnchorDeltaTSeconds
                + (try nasaPolynomialSeconds(
                    decimalYear: decimalYear
                ))
                - anchorPolynomial
                + (try de442sLunarAccelerationCorrectionSeconds(
                    decimalYear: decimalYear
                ))
                - anchorLunarAccelerationCorrection
            uncertaintySeconds =
                abs(
                    anchorPolynomial
                    - eopAnchorDeltaTSeconds
                )
                + max(
                    0,
                    try nasaFutureUncertaintySeconds(
                        decimalYear: decimalYear
                    )
                    - nasaFutureUncertaintySeconds(
                        decimalYear: anchorYear
                    )
                )
                + eopAnchorReportedErrorSeconds
            model =
                "NASA-2004-polynomial-anchored-to-IERS-EOP-2027-07-31"
            contributors = [
                "NASA ΔT多項式（同梱IERS予測最終sampleへ連続補正）",
                "DE442s月永年加速度への補正",
                "将来の地球自転",
                "UTC制度はTAI−UTC=37秒固定シナリオ（数値幅外）",
                "極運動xp・ypを0と仮定",
            ]
            warnings = [
                "IERS EOP収録後のため、地球自転はNASA ΔT多項式を同梱IERS予測最終sampleへ連続補正して予測しています。",
                "表示時刻はTAI−UTC=37秒を固定した連続UTCシナリオです。将来の公式UTC制度が異なる場合の差は、数値の時刻不確かさに含みません。",
                "極運動は0として計算しています。",
            ]
        } else {
            deltaTSeconds =
                try nasaPolynomialSeconds(
                    decimalYear: decimalYear
                )
                + de442sLunarAccelerationCorrectionSeconds(
                    decimalYear: decimalYear
                )
            // Conservative app-level envelope; published errors are about
            // 0.1 s near 1900 and below 0.1 s near 1950.
            uncertaintySeconds = 1
            model =
                "NASA-2004-historical-polynomial-DE442s"
            contributors = [
                "NASA ΔT多項式（IERS収録前）",
                "DE442s月永年加速度への補正",
                "1972年以前のUTCはTAI−UTC=0秒近似（数値幅外）",
                "極運動xp・ypを0と仮定",
            ]
            warnings = [
                "IERS EOP収録前のため、地球自転はNASAの歴史的ΔT多項式で近似しています。",
                "1972年以前の表示時刻はTAI−UTC=0秒のproleptic UTC近似です。歴史的なUTC復元誤差は、数値の時刻不確かさに含みません。",
                "極運動は0として計算しています。",
            ]
        }

        let assumedTimeScales =
            try Astronomy.resolveTimeScalesV2(at: date)
        let assumedTAIMinusUTCSeconds =
            assumedTimeScales.taiMinusUTCSeconds
        let dut1Seconds =
            assumedTAIMinusUTCSeconds
            + ttMinusTAISeconds
            - deltaTSeconds

        return EventEarthRotationFallbackV1(
            deltaTSeconds: deltaTSeconds,
            deltaTUncertaintySeconds:
                uncertaintySeconds,
            assumedTAIMinusUTCSeconds:
                assumedTAIMinusUTCSeconds,
            dut1Seconds: dut1Seconds,
            earthOrientation:
                EarthOrientationOptionsV2(
                    dut1Seconds: dut1Seconds,
                    dut1Source: .caller,
                    dut1UncertaintySeconds:
                        uncertaintySeconds,
                    polarMotion: .assumedZero,
                    taiMinusUTCSeconds:
                        assumedTAIMinusUTCSeconds
                ),
            eopID: isFuture
                ? "outside-IERS-coverage-future-delta-t-model"
                : "outside-IERS-coverage-historical-delta-t-model",
            deltaTModel: model,
            pathUncertaintyKilometers:
                earthEquatorialRotationKilometersPerSecond
                * uncertaintySeconds,
            dominantContributors: contributors,
            warnings: warnings
        )
    }
}
