import Foundation
@testable import PlanetariumCore
import Testing

struct EventEarthRotationModelTests {
    @Test
    func iersReportedErrorsRemainSeparateEventComponents() {
        let arcsecondsToRadians =
            Double.pi / (180 * 3_600)
        let estimate = IERSEarthOrientationEstimateV1(
            dut1: IERSDUT1EstimateV1(
                dut1Seconds: 0,
                source: .predicted,
                uncertaintySeconds: 0.000_701
            ),
            polarMotion: IERSPolarMotionEstimateV1(
                xpRadians: 0,
                ypRadians: 0,
                xpReportedErrorRadians:
                    0.001_819 * arcsecondsToRadians,
                ypReportedErrorRadians:
                    0.001_624 * arcsecondsToRadians,
                source: .predicted,
                usesPrediction: true
            )
        )
        let result = EventEarthRotationModelV1
            .reportedUncertainty(for: estimate)

        #expect(
            abs(
                result.dut1PathMeters
                - 0.326_035_871
            ) < 0.000_001
        )
        #expect(
            abs(
                result.polarMotionPathMeters
                - 0.106_464_724
            ) < 0.000_001
        )
        #expect(
            abs(
                result.combinedPathMeters
                - 0.432_500_595
            ) < 0.000_001
        )
        #expect(
            result.semantics
                == "iers-reported-error-linear-envelope"
        )
    }

    @Test
    func historicalPolynomialMatchesPublishedPieces()
        throws
    {
        let at1900 = try EventEarthRotationModelV1
            .fallback(
                at: try #require(
                    ISO8601DateFormatter().date(
                        from: "1900-01-01T00:00:00Z"
                    )
                )
            )
        let at1950 = try EventEarthRotationModelV1
            .fallback(
                at: try #require(
                    ISO8601DateFormatter().date(
                        from: "1950-01-01T00:00:00Z"
                    )
                )
            )

        #expect(
            abs(
                at1900.deltaTSeconds
                - (-2.745_453_410_866)
            ) < 0.000_000_01
        )
        #expect(
            abs(
                at1950.deltaTSeconds
                - 29.086_807_614_268
            ) < 0.000_000_01
        )
        #expect(at1900.deltaTUncertaintySeconds == 1)
        #expect(at1900.assumedTAIMinusUTCSeconds == 0)
        #expect(
            abs(
                at1900.dut1Seconds
                - 34.929_453_410_866
            ) < 0.000_000_01
        )
        #expect(
            at1900.warnings
                .joined(separator: " ")
                .contains("1972年以前")
        )
    }

    @Test
    func fallbackIsAllowedOnlyOutsideClosedEOPCoverage()
        throws
    {
        let formatter = ISO8601DateFormatter()
        let firstSample = try #require(
            formatter.date(
                from: "1973-01-02T00:00:00Z"
            )
        )
        let immediatelyBeforeFirst =
            firstSample.addingTimeInterval(-0.001)
        let lastSample =
            EventEarthRotationModelV1.eopLastSampleUTC
        let immediatelyAfterLast =
            lastSample.addingTimeInterval(0.001)

        #expect(
            try EventEarthRotationModelV1
                .fallback(at: immediatelyBeforeFirst)
                .eopID
                == "outside-IERS-coverage-historical-delta-t-model"
        )
        #expect(
            throws: EventEarthRotationModelErrorV1.self
        ) {
            _ = try EventEarthRotationModelV1
                .fallback(at: firstSample)
        }
        #expect(
            throws: EventEarthRotationModelErrorV1.self
        ) {
            _ = try EventEarthRotationModelV1
                .fallback(at: lastSample)
        }
        #expect(
            try EventEarthRotationModelV1
                .fallback(at: immediatelyAfterLast)
                .eopID
                == "outside-IERS-coverage-future-delta-t-model"
        )
    }

    @Test
    func futureModelIsContinuousAtEOPAnchor()
        throws
    {
        let estimate = try EventEarthRotationModelV1
            .fallback(
                at: EventEarthRotationModelV1
                    .eopLastSampleUTC
                    .addingTimeInterval(0.001)
            )

        #expect(
            abs(
                estimate.deltaTSeconds
                - EventEarthRotationModelV1
                    .eopAnchorDeltaTSeconds
            ) < 0.000_001
        )
        #expect(
            estimate.deltaTModel
                .contains("anchored-to-IERS")
        )
    }

    @Test
    func futureEnvelopeAndPathAreLockedThrough2100()
        throws
    {
        let formatter = ISO8601DateFormatter()
        let at2050 = try EventEarthRotationModelV1
            .fallback(
                at: try #require(
                    formatter.date(
                        from: "2050-01-01T00:00:00Z"
                    )
                )
            )
        let at2100 = try EventEarthRotationModelV1
            .fallback(
                at: try #require(
                    formatter.date(
                        from: "2100-01-01T00:00:00Z"
                    )
                )
            )

        #expect(
            abs(
                at2050.deltaTSeconds
                - 86.261_907_565_724
            ) < 0.000_000_001
        )
        #expect(
            abs(
                at2100.deltaTSeconds
                - 195.945_273_317_19
            ) < 0.000_000_001
        )
        #expect(
            abs(
                at2050.deltaTUncertaintySeconds
                - 16.856_265_525_244
            ) < 0.000_000_001
        )
        #expect(
            abs(
                at2100.deltaTUncertaintySeconds
                - 49.308_650_402_183
            ) < 0.000_000_001
        )
        #expect(
            abs(
                at2050.pathUncertaintyKilometers
                - 7.839_867_637_683
            ) < 0.000_000_001
        )
        #expect(
            abs(
                at2100.pathUncertaintyKilometers
                - 22.933_507_541_571
            ) < 0.000_000_001
        )
        #expect(
            at2100.deltaTUncertaintySeconds
                > at2050.deltaTUncertaintySeconds
        )
        #expect(at2100.assumedTAIMinusUTCSeconds == 37)
        #expect(
            abs(
                at2100.dut1Seconds
                - (-126.761_273_317_19)
            ) < 0.000_000_001
        )
        #expect(
            at2100.warnings
                .joined(separator: " ")
                .contains("TAI−UTC=37秒")
        )
        #expect(
            at2100.warnings
                .joined(separator: " ")
                .contains("含みません")
        )
    }

    @Test
    func nasaPieceBoundariesAreLockedOnBothSides()
        throws
    {
        let epsilonYear = 0.000_000_001
        let fixtures:
            [(
                boundary: Double,
                before: Double,
                atBoundary: Double,
                after: Double
            )] = [
                (
                    1920,
                    21.187_619_999_77,
                    21.2,
                    21.200_000_000_845
                ),
                (
                    1941,
                    24.772_259_599_581,
                    24.773_141_433_749,
                    24.773_141_434_329
                ),
                (
                    1961,
                    33.550_262_273_937,
                    33.579_880_865_652,
                    33.579_880_866_008
                ),
                (
                    1986,
                    54.867_854_938_456,
                    54.877_737_538_24,
                    54.877_737_538_686
                ),
                (
                    2005,
                    64.720_646_218_49,
                    64.670_575,
                    64.670_575_000_378
                ),
                (
                    2050,
                    93.000_999_999_119,
                    93,
                    93.000_000_002_035
                ),
            ]

        for fixture in fixtures {
            #expect(
                abs(
                    try EventEarthRotationModelV1
                        .nasaPolynomialSeconds(
                            decimalYear:
                                fixture.boundary
                                - epsilonYear
                        )
                        - fixture.before
                ) < 0.000_000_001
            )
            #expect(
                abs(
                    try EventEarthRotationModelV1
                        .nasaPolynomialSeconds(
                            decimalYear:
                                fixture.boundary
                        )
                        - fixture.atBoundary
                ) < 0.000_000_001
            )
            #expect(
                abs(
                    try EventEarthRotationModelV1
                        .nasaPolynomialSeconds(
                            decimalYear:
                                fixture.boundary
                                + epsilonYear
                        )
                        - fixture.after
                ) < 0.000_000_001
            )
        }
    }

    @Test
    func lunarAccelerationCorrectionMatchesNASAConversion()
        throws
    {
        #expect(
            abs(
                try EventEarthRotationModelV1
                    .de442sLunarAccelerationCorrectionSeconds(
                        decimalYear: 1900
                    )
                    - (-0.017_631_539_2)
            ) < 0.000_000_001
        )
        #expect(
            try EventEarthRotationModelV1
                .de442sLunarAccelerationCorrectionSeconds(
                    decimalYear: 1980
                )
                == 0
        )
        #expect(
            abs(
                try EventEarthRotationModelV1
                    .de442sLunarAccelerationCorrectionSeconds(
                        decimalYear: 2100
                    )
                    - (-0.122_546_483_2)
            ) < 0.000_000_001
        )
    }

    @Test
    func precisionPipelineReceivesModeledDeltaT()
        throws
    {
        let date = try #require(
            ISO8601DateFormatter().date(
                from: "2100-01-01T00:00:00Z"
            )
        )
        let estimate = try EventEarthRotationModelV1
            .fallback(at: date)
        let scales = try Astronomy.resolveTimeScalesV2(
            at: date,
            options: estimate.earthOrientation
        )
        let resolvedDeltaT =
            (scales.ttJulianDate - scales.ut1JulianDate)
            * PrecisionConstants.secondsPerDay

        #expect(
            abs(resolvedDeltaT - estimate.deltaTSeconds)
                < 0.000_1
        )
        #expect(scales.taiMinusUTCSeconds == 37)
        #expect(
            abs(
                scales.dut1Seconds
                - estimate.dut1Seconds
            ) < 0.000_000_001
        )
    }

    @Test
    func perSampleEOPResolverPreservesLeapBoundary()
        throws
    {
        let formatter = ISO8601DateFormatter()
        let before = try #require(
            formatter.date(
                from: "2016-12-31T23:59:59Z"
            )
        )
        let after = try #require(
            formatter.date(
                from: "2017-01-01T00:00:00Z"
            )
        )
        let service =
            try IERSEarthOrientationServiceV1
                .loadBundled()
        let options = LocalEclipseOptionsV1(
            earthOrientationAt: { date in
                guard let estimate =
                    try service.lookup(at: date)
                else {
                    throw PrecisionModelError
                        .invalidVector
                }
                return estimate
                    .earthOrientationOptionsV2
            }
        )
        let beforeScales =
            try Astronomy.resolveTimeScalesV2(
                at: before,
                options:
                    options.resolvedEarthOrientation(
                        at: before
                    )
            )
        let afterScales =
            try Astronomy.resolveTimeScalesV2(
                at: after,
                options:
                    options.resolvedEarthOrientation(
                        at: after
                    )
            )
        let beforeDeltaT =
            (beforeScales.ttJulianDate
                - beforeScales.ut1JulianDate)
            * PrecisionConstants.secondsPerDay
        let afterDeltaT =
            (afterScales.ttJulianDate
                - afterScales.ut1JulianDate)
            * PrecisionConstants.secondsPerDay

        #expect(beforeScales.taiMinusUTCSeconds == 36)
        #expect(afterScales.taiMinusUTCSeconds == 37)
        #expect(
            afterScales.dut1Seconds
                - beforeScales.dut1Seconds
                > 0.9
        )
        #expect(abs(afterDeltaT - beforeDeltaT) < 0.01)
    }
}
