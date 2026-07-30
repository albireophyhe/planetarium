import Foundation
import XCTest

@testable import PlanetariumCore

final class LocalEclipseSolversTests:
    XCTestCase, @unchecked Sendable
{
    /**
     Independent oracle:
     USNO Solar Eclipse Computer, 8 April 2024, Syracuse
     (43.1029° N, 76.2079° W, 0 m). Position angle is eastward from
     celestial north at the contact point on the solar limb.
     */
    func testSyracuse2024SolarContactPositionAnglesMatchUSNO()
        async throws
    {
        let candidate = try await candidate(
            id: "se-20240408",
            year: 2024
        )
        let provider =
            try DE442SEphemerisProviderV1.loadBundled()
        let syracuse = ObservingLocation(
            id: "syracuse",
            name: "Syracuse",
            latitude: 43.1029,
            longitude: -76.2079,
            timeZoneIdentifier: "America/New_York"
        )
        let result = try await LocalSolarEclipseV1
            .calculate(
                provider: provider,
                candidate: candidate,
                location: syracuse,
                options: try options(
                    at: candidate.canonicalEpochUTC
                )
            )
        let circumstances = try XCTUnwrap(result)

        XCTAssertEqual(
            circumstances.classification,
            .total
        )
        let expectedDegrees: [
            EclipseContactPhaseV1: Double
        ] = [
            .solarC1: 233.7,
            .solarC2: 109.5,
            .solarC3: 178.4,
            .solarC4: 54.6,
        ]
        for (phase, expected) in expectedDegrees {
            let angle = try XCTUnwrap(
                circumstances.contacts.first {
                    $0.phase == phase
                }?.positionAngleRadians
            )
            XCTAssertEqual(
                angle * 180 / Double.pi,
                expected,
                accuracy: 0.5,
                "\(phase.rawValue) position angle"
            )
        }
        XCTAssertNil(
            circumstances.maximum
                .positionAngleRadians
        )
    }

    /**
     Independent oracle:
     NASA GSFC, "12 August 2026 Total Solar Eclipse",
     London local circumstances: C1 17:17, maximum 18:13, C4 19:06 UTC,
     magnitude 0.925 and obscuration 0.914.

     NASA's public city table is rounded to whole minutes. The 90-second
     contact tolerance covers that display rounding plus this solver's
     deliberate mean spherical lunar limb and abridged 2000B nutation.
     */
    func testLondon2026SolarCircumstancesMatchNASA()
        async throws
    {
        let candidate = try await candidate(
            id: "se-20260812"
        )
        let provider =
            try DE442SEphemerisProviderV1.loadBundled()
        let result = try await LocalSolarEclipseV1
            .calculate(
                provider: provider,
                candidate: candidate,
                location: london,
                options: try options(
                    at: candidate.canonicalEpochUTC
                )
            )
        let circumstances = try XCTUnwrap(result)

        XCTAssertEqual(
            circumstances.classification,
            .partial
        )
        XCTAssertEqual(
            circumstances.visibility,
            .fullyVisible
        )
        XCTAssertEqual(
            circumstances.magnitude,
            0.925,
            accuracy: 0.01
        )
        XCTAssertEqual(
            try XCTUnwrap(circumstances.obscuration),
            0.914,
            accuracy: 0.01
        )
        XCTAssertEqual(
            try contact(
                .solarC1,
                in: circumstances
            ).timeIntervalSince1970,
            utcDate("2026-08-12T17:17:00Z")
                .timeIntervalSince1970,
            accuracy: 90
        )
        XCTAssertEqual(
            circumstances.maximum.instantUTC
                .timeIntervalSince1970,
            utcDate("2026-08-12T18:13:00Z")
                .timeIntervalSince1970,
            accuracy: 90
        )
        XCTAssertEqual(
            try contact(
                .solarC4,
                in: circumstances
            ).timeIntervalSince1970,
            utcDate("2026-08-12T19:06:00Z")
                .timeIntervalSince1970,
            accuracy: 90
        )
        XCTAssertEqual(
            circumstances.provenance.ephemerisID,
            "jpl-de442s-type2-float32"
        )
        XCTAssertEqual(
            circumstances.provenance
                .lunarRadiusModel,
            "mean-spherical-limb"
        )
        XCTAssertNil(
            circumstances.provenance.limbProfileID
        )
        let maximumStamp = String(
            Int(
                circumstances.maximum.instantUTC
                    .timeIntervalSince1970
                    .rounded()
            )
        )
        XCTAssertEqual(
            circumstances.provenance.eopID,
            "maximum-\(maximumStamp)"
        )
        XCTAssertEqual(
            circumstances.provenance
                .eopSourceSHA256,
            "source-\(maximumStamp)"
        )
        XCTAssertEqual(
            circumstances.provenance
                .eopRetrievedAt,
            "retrieved-\(maximumStamp)"
        )
        XCTAssertEqual(
            circumstances.provenance
                .eopDUT1Quality,
            .predicted
        )
        XCTAssertEqual(
            circumstances.provenance
                .eopPolarMotionQuality,
            .mixed
        )
        XCTAssertEqual(
            circumstances.provenance.deltaTModel,
            "delta-\(maximumStamp)"
        )
    }

    /**
     Independent oracle:
     NASA GSFC Five Millennium Catalog, 3 March 2026 total lunar eclipse,
     greatest eclipse 11:34:52 TD and umbral magnitude 1.151.

     With TT−UTC = 69.184 seconds in 2026, the listed maximum is
     11:33:42.8 UTC. The 90-second tolerance covers the catalog's shadow
     convention and the app's compact time/apparent-place model.
     */
    func testMarch2026LunarMaximumMatchesNASAAndIsBelowLondonHorizon()
        async throws
    {
        let candidate = try await candidate(
            id: "le-20260303"
        )
        let provider =
            try DE442SEphemerisProviderV1.loadBundled()
        let result = try await LocalLunarEclipseV1
            .calculate(
                provider: provider,
                candidate: candidate,
                location: london,
                options: try options(
                    at: candidate.canonicalEpochUTC
                )
            )
        let circumstances = try XCTUnwrap(result)

        XCTAssertEqual(
            circumstances.classification,
            .total
        )
        XCTAssertEqual(
            circumstances.magnitude,
            1.151,
            accuracy: 0.01
        )
        XCTAssertEqual(
            circumstances.maximum.instantUTC
                .timeIntervalSince1970,
            utcDate("2026-03-03T11:33:42.8Z")
                .timeIntervalSince1970,
            accuracy: 90
        )
        XCTAssertEqual(
            circumstances.contacts.map(\.phase),
            [
                .lunarP1,
                .lunarU1,
                .lunarU2,
                .maximum,
                .lunarU3,
                .lunarU4,
                .lunarP4,
            ]
        )
        XCTAssertEqual(
            circumstances.visibility,
            .belowHorizon
        )
        XCTAssertTrue(
            circumstances.contacts.allSatisfy {
                !$0.aboveHorizon
            }
        )
        XCTAssertEqual(
            try XCTUnwrap(
                circumstances.contacts.first {
                    $0.phase == .lunarU1
                }?.positionAngleRadians
            ) * 180 / Double.pi,
            96.2,
            accuracy: 0.5
        )
        XCTAssertEqual(
            try XCTUnwrap(
                circumstances.contacts.first {
                    $0.phase == .lunarU4
                }?.positionAngleRadians
            ) * 180 / Double.pi,
            320.2,
            accuracy: 0.5
        )
        XCTAssertNil(
            circumstances.maximum
                .positionAngleRadians
        )
        XCTAssertTrue(
            circumstances.contacts.allSatisfy {
                $0.lunarShadow != nil
            }
        )
        let maximumShadow = try XCTUnwrap(
            circumstances.maximum.lunarShadow
        )
        let moonRadius = try XCTUnwrap(
            circumstances.maximum.moon
        ).angularRadiusRadians
        XCTAssertGreaterThan(
            maximumShadow
                .penumbralAngularRadiusRadians,
            maximumShadow
                .umbralAngularRadiusRadians
        )
        XCTAssertGreaterThan(
            maximumShadow.umbralAngularRadiusRadians,
            moonRadius
        )
        XCTAssertLessThan(
            maximumShadow.centerSeparationRadians,
            maximumShadow.umbralAngularRadiusRadians
                - moonRadius
        )
        XCTAssertNotNil(
            maximumShadow.centerPositionAngleRadians
        )
        XCTAssertNil(
            circumstances.uncertainty.pathKilometers
        )
        XCTAssertNotNil(
            circumstances.uncertainty
                .earthOrientation
        )
        let contributors =
            circumstances.uncertainty
            .dominantContributors
            .joined(separator: " ")
        XCTAssertTrue(
            contributors.contains(
                "地表経路の境界帯へは加算しない"
            )
        )
        XCTAssertFalse(
            contributors.contains(
                "境界帯へ1回だけ線形加算"
            )
        )
        let lunarMaximumStamp = String(
            Int(
                circumstances.maximum.instantUTC
                    .timeIntervalSince1970
                    .rounded()
            )
        )
        XCTAssertEqual(
            circumstances.provenance.eopID,
            "maximum-\(lunarMaximumStamp)"
        )
    }

    func testRejectsCandidateOfTheWrongEventKind()
        async throws
    {
        let candidate = try await candidate(
            id: "le-20260303"
        )
        let provider =
            try DE442SEphemerisProviderV1.loadBundled()

        do {
            _ = try await LocalSolarEclipseV1
                .calculate(
                    provider: provider,
                    candidate: candidate,
                    location: london
                )
            XCTFail("Expected wrong-kind rejection")
        } catch {
            XCTAssertEqual(
                error as? LocalEclipseErrorV1,
                .wrongCandidateKind
            )
        }
    }

    func testEphemerisSearchRangeClipsAsymmetricallyInsideLoadedCoverage()
        throws
    {
        let provider =
            try DE442SEphemerisProviderV1.loadBundled()
        let loaded =
            try EclipseCalculationSupportV1
                .ephemerisSearchRange(
                    provider: provider
                )
        let loadedStartTDB =
            try EventTimeScales
                .utcToTDBJulianDate(
                    Date(
                        timeIntervalSinceReferenceDate:
                            loaded
                            .startSecondsSinceReferenceDate
                    )
                )
        let loadedEndTDB =
            try EventTimeScales
                .utcToTDBJulianDate(
                    Date(
                        timeIntervalSinceReferenceDate:
                            loaded
                            .endSecondsSinceReferenceDate
                    )
                )
        let safeStartTDB =
            provider.coverageStartJulianDateTdb
            + EclipseCalculationSupportV1
                .ephemerisLightTimeLookbackSeconds
                / PrecisionConstants.secondsPerDay

        XCTAssertGreaterThanOrEqual(
            loadedStartTDB,
            safeStartTDB
        )
        XCTAssertLessThanOrEqual(
            loadedEndTDB,
            provider.coverageEndJulianDateTdb
        )

        let nearStart =
            loaded.startSecondsSinceReferenceDate
            + 3_600
        let clippedAtStart =
            try EclipseCalculationSupportV1
                .resolveSearchRange(
                    candidateSecondsSinceReferenceDate:
                        nearStart,
                    halfWindowSeconds: 7_200,
                    limit: loaded
                )
        XCTAssertEqual(
            clippedAtStart
                .startSecondsSinceReferenceDate,
            loaded.startSecondsSinceReferenceDate
        )
        XCTAssertEqual(
            clippedAtStart
                .endSecondsSinceReferenceDate,
            nearStart + 7_200
        )

        let nearEnd =
            loaded.endSecondsSinceReferenceDate
            - 3_600
        let clippedAtEnd =
            try EclipseCalculationSupportV1
                .resolveSearchRange(
                    candidateSecondsSinceReferenceDate:
                        nearEnd,
                    halfWindowSeconds: 7_200,
                    limit: loaded
                )
        XCTAssertEqual(
            clippedAtEnd
                .startSecondsSinceReferenceDate,
            nearEnd - 7_200
        )
        XCTAssertEqual(
            clippedAtEnd
                .endSecondsSinceReferenceDate,
            loaded.endSecondsSinceReferenceDate
        )
    }

    func testReturnsNilWhenGlobalSolarEventMissesObserver()
        async throws
    {
        let candidate = try await candidate(
            id: "se-20260217"
        )
        let provider =
            try DE442SEphemerisProviderV1.loadBundled()

        let result = try await LocalSolarEclipseV1
            .calculate(
                provider: provider,
                candidate: candidate,
                location: london,
                options: try options(
                    at: candidate.canonicalEpochUTC
                )
            )

        XCTAssertNil(result)
    }

    func testTokyo2039NarrowCentralPhaseIsFlaggedByLunarTopographyEnvelope()
        async throws
    {
        let candidate = try await candidate(
            id: "se-20390621",
            year: 2039
        )
        let provider =
            try DE442SEphemerisProviderV1.loadBundled()
        let tokyo = ObservingLocation(
            id: "tokyo",
            name: "東京",
            latitude: 35.6812,
            longitude: 139.7671,
            timeZoneIdentifier: "Asia/Tokyo"
        )
        let result = try await LocalSolarEclipseV1
            .calculate(
                provider: provider,
                candidate: candidate,
                location: tokyo,
                options: try options(
                    at: candidate.canonicalEpochUTC
                )
            )
        let circumstances = try XCTUnwrap(result)
        XCTAssertEqual(
            circumstances.classification,
            .annular
        )
        XCTAssertEqual(
            circumstances.uncertainBoundary,
            .partialCentral
        )
        XCTAssertFalse(
            circumstances.contacts.contains {
                $0.phase == .solarC2
                    || $0.phase == .solarC3
            }
        )
        XCTAssertTrue(
            circumstances.warnings.contains {
                $0.contains("部分食・中心食境界帯")
            }
        )
        let sun = try XCTUnwrap(
            circumstances.maximum.sun
        )
        let moon = try XCTUnwrap(
            circumstances.maximum.moon
        )
        XCTAssertEqual(
            circumstances.magnitude,
            moon.angularRadiusRadians
                / sun.angularRadiusRadians,
            accuracy: 1e-12
        )
    }

    func testSyntheticExternalBoundaryTreatsMeanHitAndMissSymmetrically()
        async throws
    {
        let moonDistanceKilometers = 384_400.0
        let pathUncertaintyKilometers = 8.0
        let boundary =
            try LocalSolarEclipseV1
                .boundaryUncertaintyRadians(
                    moonDistanceKilometers:
                        moonDistanceKilometers,
                    earthRotationPathUncertaintyKilometers:
                        pathUncertaintyKilometers
                )
        XCTAssertEqual(
            boundary,
            (6 + pathUncertaintyKilometers)
                / moonDistanceKilometers,
            accuracy: 1e-15
        )
        let sunRadius = 0.004_65
        let moonRadius = 0.004_7
        let externalLimit =
            sunRadius + moonRadius
        let options = LocalEclipseOptionsV1(
            earthRotationPathUncertaintyKilometers:
                pathUncertaintyKilometers,
            halfWindowSeconds: 1_800,
            scanStepSeconds: 60
        )

        var insideResults:
            [SolarEclipseGeometryV1] = []
        for sign in [-1.0, 1.0] {
            let result =
                try await LocalSolarEclipseV1
                    .solveGeometry(
                        candidateSecondsSinceReferenceDate:
                            0,
                        sampleAt:
                            syntheticSolarPass(
                                center: 0,
                                minimumSeparationRadians:
                                    externalLimit
                                    + sign
                                        * boundary
                                        * 0.5,
                                sunRadiusRadians:
                                    sunRadius,
                                moonRadiusRadians:
                                    moonRadius,
                                moonDistanceKilometers:
                                    moonDistanceKilometers
                            ),
                        options: options
                    )
            let geometry = try XCTUnwrap(result)
            insideResults.append(geometry)
            XCTAssertEqual(
                geometry.classification,
                .partial
            )
            XCTAssertEqual(
                geometry.uncertainBoundary,
                .external
            )
            XCTAssertTrue(geometry.boundaryUncertain)
            XCTAssertEqual(
                geometry.externalContacts.count,
                1
            )
            XCTAssertTrue(
                geometry.internalContacts.isEmpty
            )
            XCTAssertEqual(
                geometry.boundaryUncertaintyRadians,
                boundary,
                accuracy: 1e-15
            )
        }
        let clearances = insideResults.map {
            angularSeparation(
                $0.maximum.sun.icrfDirection,
                $0.maximum.moon.icrfDirection
            )
            - externalLimit
        }
        XCTAssertEqual(
            clearances[0],
            -boundary * 0.5,
            accuracy: 1e-12
        )
        XCTAssertEqual(
            clearances[1],
            boundary * 0.5,
            accuracy: 1e-12
        )

        let outsideMiss =
            try await LocalSolarEclipseV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        0,
                    sampleAt:
                        syntheticSolarPass(
                            center: 0,
                            minimumSeparationRadians:
                                externalLimit
                                + boundary * 1.5,
                            sunRadiusRadians: sunRadius,
                            moonRadiusRadians: moonRadius,
                            moonDistanceKilometers:
                                moonDistanceKilometers
                        ),
                    options: options
                )
        XCTAssertNil(outsideMiss)
        let outsideHitResult =
            try await LocalSolarEclipseV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        0,
                    sampleAt:
                        syntheticSolarPass(
                            center: 0,
                            minimumSeparationRadians:
                                externalLimit
                                - boundary * 1.5,
                            sunRadiusRadians:
                                sunRadius,
                            moonRadiusRadians:
                                moonRadius,
                            moonDistanceKilometers:
                                moonDistanceKilometers
                        ),
                    options: options
                )
        let outsideHit =
            try XCTUnwrap(outsideHitResult)
        XCTAssertFalse(outsideHit.boundaryUncertain)
        XCTAssertEqual(
            outsideHit.externalContacts.count,
            2
        )
    }

    func testSolarBoundaryContextUsesSolvedMaximumAcrossUTCDay()
        async throws
    {
        let dayBoundary =
            utcDate("2026-08-13T00:00:00Z")
        let candidateCenter =
            dayBoundary
            .addingTimeInterval(-120)
            .timeIntervalSinceReferenceDate
        let solvedCenter =
            dayBoundary
            .addingTimeInterval(120)
            .timeIntervalSinceReferenceDate
        let reported =
            EventEOPReportedUncertaintyV1(
                dut1ReportedErrorSeconds:
                    0.000_701,
                dut1PathMeters: 0.326_036,
                polarMotionPathMeters:
                    0.106_465,
                combinedPathMeters: 0.432_501
            )
        let options = LocalEclipseOptionsV1(
            eventEarthRotationAt: { instant in
                if instant < dayBoundary {
                    return EventEarthRotationContextV1(
                        earthOrientation:
                            EarthOrientationOptionsV2(),
                        eopID: "before-day",
                        eopDUT1Quality: .observed,
                        eopPolarMotionQuality:
                            .observed,
                        deltaTModel: "before-day",
                        uncertainty:
                            .model(
                                pathKilometers: 9
                            )
                    )
                }
                return EventEarthRotationContextV1(
                    earthOrientation:
                        EarthOrientationOptionsV2(),
                    eopID: "after-day",
                    eopSourceSHA256:
                        "after-day-source",
                    eopDUT1Quality: .predicted,
                    eopPolarMotionQuality: .mixed,
                    deltaTModel: "after-day",
                    uncertainty:
                        .iersReported(reported)
                )
            },
            halfWindowSeconds: 600,
            scanStepSeconds: 60
        )
        let moonDistanceKilometers = 384_400.0
        let result =
            try await LocalSolarEclipseV1
            .solveGeometry(
                candidateSecondsSinceReferenceDate:
                    candidateCenter,
                sampleAt:
                    syntheticSolarPass(
                        center: solvedCenter,
                        minimumSeparationRadians:
                            0.008_85,
                        sunRadiusRadians:
                            0.004_65,
                        moonRadiusRadians:
                            0.004_70,
                        moonDistanceKilometers:
                            moonDistanceKilometers
                    ),
                options: options
            )
        let geometry = try XCTUnwrap(result)

        XCTAssertEqual(
            geometry.maximum
                .secondsSinceReferenceDate,
            solvedCenter,
            accuracy: 0.05
        )
        XCTAssertEqual(
            geometry.earthRotation.eopID,
            "after-day"
        )
        XCTAssertEqual(
            geometry.earthRotation
                .eopSourceSHA256,
            "after-day-source"
        )
        XCTAssertEqual(
            geometry.earthRotation
                .eopDUT1Quality,
            .predicted
        )
        XCTAssertEqual(
            geometry.earthRotation
                .eopPolarMotionQuality,
            .mixed
        )
        XCTAssertEqual(
            geometry.boundaryUncertaintyRadians,
            (
                6
                + reported.combinedPathMeters
                    / 1_000
            ) / moonDistanceKilometers,
            accuracy: 1e-15
        )
    }

    func testStaticIERSComponentOverridesGenericPathWithoutDoubleAddition()
        async throws
    {
        let reported =
            EventEOPReportedUncertaintyV1(
                dut1ReportedErrorSeconds: 0.001,
                dut1PathMeters: 300,
                polarMotionPathMeters: 200,
                combinedPathMeters: 500
            )
        let moonDistanceKilometers = 384_400.0
        let result =
            try await LocalSolarEclipseV1
            .solveGeometry(
                candidateSecondsSinceReferenceDate:
                    0,
                sampleAt:
                    syntheticSolarPass(
                        center: 0,
                        minimumSeparationRadians:
                            0.008_85,
                        sunRadiusRadians:
                            0.004_65,
                        moonRadiusRadians:
                            0.004_70,
                        moonDistanceKilometers:
                            moonDistanceKilometers
                    ),
                options:
                    LocalEclipseOptionsV1(
                        earthRotationPathUncertaintyKilometers:
                            8,
                        earthOrientationReportedUncertainty:
                            reported,
                        halfWindowSeconds: 600,
                        scanStepSeconds: 60
                    )
            )
        let geometry = try XCTUnwrap(result)

        XCTAssertEqual(
            geometry.earthRotation
                .uncertainty.pathKilometers,
            0.5
        )
        XCTAssertEqual(
            geometry.boundaryUncertaintyRadians,
            (6 + 0.5) / moonDistanceKilometers,
            accuracy: 1e-15
        )
    }

    func testPartialCentralBoundaryUsesEarthRotationAtInternalMinimum()
        async throws
    {
        let moonDistanceKilometers = 384_400.0
        let sunRadius = 0.004_65
        let centerSeparation = 0.000_5
        let internalMinimum = 120.0
        let internalClearance =
            10 / moonDistanceKilometers
        let curvature = 1e-8
        let basePass = syntheticSolarPass(
            center: 0,
            minimumSeparationRadians:
                centerSeparation,
            sunRadiusRadians: sunRadius,
            moonRadiusRadians: 0.004_8,
            moonDistanceKilometers:
                moonDistanceKilometers,
            directionRateRadiansPerSecond:
                2e-5
        )
        let sampleAt:
            (Double) async throws
                -> SolarDiscSampleV1 =
            { instant in
                let sample =
                    try await basePass(instant)
                let separation = atan2(
                    sample.sun.icrfDirection
                        .cross(
                            sample.moon
                                .icrfDirection
                        ).length,
                    max(
                        -1,
                        min(
                            1,
                            sample.sun
                                .icrfDirection
                                .dot(
                                    sample.moon
                                        .icrfDirection
                                )
                        )
                    )
                )
                let clearance =
                    internalClearance
                    + curvature
                        * pow(
                            instant
                                - internalMinimum,
                            2
                        )
                let moonRadius =
                    sunRadius
                    + separation
                    - clearance
                return SolarDiscSampleV1(
                    secondsSinceReferenceDate:
                        instant,
                    sun: sample.sun,
                    moon:
                        EclipseApparentBodyStateV1(
                            body: .moon,
                            tdbJulianDate:
                                sample.moon
                                .tdbJulianDate,
                            lightTimeSeconds:
                                sample.moon
                                .lightTimeSeconds,
                            distanceKilometers:
                                sample.moon
                                .distanceKilometers,
                            angularRadiusRadians:
                                moonRadius,
                            icrfDirection:
                                sample.moon
                                .icrfDirection,
                            cirsDirection:
                                sample.moon
                                .cirsDirection,
                            horizontal:
                                sample.moon
                                .horizontal
                        )
                )
            }
        let options = LocalEclipseOptionsV1(
            eventEarthRotationAt: { instant in
                let pathKilometers: Double =
                    instant
                        .timeIntervalSinceReferenceDate
                        < 60
                    ? 0
                    : 8
                return EventEarthRotationContextV1(
                    earthOrientation:
                        EarthOrientationOptionsV2(),
                    eopID:
                        pathKilometers == 0
                        ? "maximum"
                        : "internal-minimum",
                    deltaTModel: "test",
                    uncertainty:
                        .model(
                            pathKilometers:
                                pathKilometers
                        )
                )
            },
            halfWindowSeconds: 1_200,
            scanStepSeconds: 60
        )

        let result =
            try await LocalSolarEclipseV1
            .solveGeometry(
                candidateSecondsSinceReferenceDate:
                    0,
                sampleAt: sampleAt,
                options: options
            )
        let geometry = try XCTUnwrap(result)

        XCTAssertEqual(
            geometry.maximum
                .secondsSinceReferenceDate,
            0,
            accuracy: 0.05
        )
        XCTAssertEqual(
            geometry.earthRotation.eopID,
            "maximum"
        )
        XCTAssertEqual(
            geometry.boundaryUncertaintyRadians,
            14 / moonDistanceKilometers,
            accuracy: 1e-15
        )
        XCTAssertEqual(
            geometry.uncertainBoundary,
            .partialCentral
        )
    }

    func testSyntheticPartialCentralBoundaryIsSymmetric()
        async throws
    {
        let moonDistanceKilometers = 384_400.0
        let pathUncertaintyKilometers = 8.0
        let boundary =
            try LocalSolarEclipseV1
                .boundaryUncertaintyRadians(
                    moonDistanceKilometers:
                        moonDistanceKilometers,
                    earthRotationPathUncertaintyKilometers:
                        pathUncertaintyKilometers
                )
        let sunRadius = 0.004_65
        let moonRadius = 0.004_8
        let internalLimit =
            moonRadius - sunRadius
        let options = LocalEclipseOptionsV1(
            earthRotationPathUncertaintyKilometers:
                pathUncertaintyKilometers,
            halfWindowSeconds: 1_800,
            scanStepSeconds: 60
        )

        let centralSideResult =
            try await LocalSolarEclipseV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        0,
                    sampleAt:
                        syntheticSolarPass(
                            center: 0,
                            minimumSeparationRadians:
                                internalLimit
                                - boundary * 0.5,
                            sunRadiusRadians:
                                sunRadius,
                            moonRadiusRadians:
                                moonRadius,
                            moonDistanceKilometers:
                                moonDistanceKilometers
                        ),
                    options: options
                )
        let centralSide =
            try XCTUnwrap(centralSideResult)
        let partialSideResult =
            try await LocalSolarEclipseV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        0,
                    sampleAt:
                        syntheticSolarPass(
                            center: 0,
                            minimumSeparationRadians:
                                internalLimit
                                + boundary * 0.5,
                            sunRadiusRadians:
                                sunRadius,
                            moonRadiusRadians:
                                moonRadius,
                            moonDistanceKilometers:
                                moonDistanceKilometers
                        ),
                    options: options
                )
        let partialSide =
            try XCTUnwrap(partialSideResult)

        XCTAssertEqual(
            centralSide.classification,
            .total
        )
        XCTAssertEqual(
            partialSide.classification,
            .partial
        )
        for geometry in [
            centralSide,
            partialSide,
        ] {
            XCTAssertEqual(
                geometry.uncertainBoundary,
                .partialCentral
            )
            XCTAssertTrue(geometry.boundaryUncertain)
            XCTAssertEqual(
                geometry.externalContacts.count,
                2
            )
            XCTAssertTrue(
                geometry.internalContacts.isEmpty
            )
        }

        let definiteCentralResult =
            try await LocalSolarEclipseV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        0,
                    sampleAt:
                        syntheticSolarPass(
                            center: 0,
                            minimumSeparationRadians:
                                internalLimit
                                - boundary * 1.5,
                            sunRadiusRadians:
                                sunRadius,
                            moonRadiusRadians:
                                moonRadius,
                            moonDistanceKilometers:
                                moonDistanceKilometers
                        ),
                    options: options
                )
        let definiteCentral =
            try XCTUnwrap(
                definiteCentralResult
            )
        let definitePartialResult =
            try await LocalSolarEclipseV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        0,
                    sampleAt:
                        syntheticSolarPass(
                            center: 0,
                            minimumSeparationRadians:
                                internalLimit
                                + boundary * 1.5,
                            sunRadiusRadians:
                                sunRadius,
                            moonRadiusRadians:
                                moonRadius,
                            moonDistanceKilometers:
                                moonDistanceKilometers
                        ),
                    options: options
                )
        let definitePartial =
            try XCTUnwrap(
                definitePartialResult
            )
        XCTAssertFalse(
            definiteCentral.boundaryUncertain
        )
        XCTAssertEqual(
            definiteCentral.internalContacts.count,
            2
        )
        XCTAssertFalse(
            definitePartial.boundaryUncertain
        )
        XCTAssertTrue(
            definitePartial.internalContacts.isEmpty
        )
    }

    func testObserverAccuracyMakesEightKilometerExternalOffsetsUncertain()
        async throws
    {
        let moonDistanceKilometers = 384_400.0
        let horizontalAccuracyMeters = 10_000.0
        let boundary =
            try LocalSolarEclipseV1
                .boundaryUncertaintyRadians(
                    moonDistanceKilometers:
                        moonDistanceKilometers,
                    horizontalAccuracyMeters:
                        horizontalAccuracyMeters
                )
        XCTAssertEqual(
            boundary,
            (
                6
                    + horizontalAccuracyMeters
                        / 1_000
            ) / moonDistanceKilometers,
            accuracy: 1e-15
        )
        let sunRadius = 0.004_65
        let moonRadius = 0.004_7
        let externalLimit =
            sunRadius + moonRadius
        let baseOptions = LocalEclipseOptionsV1(
            halfWindowSeconds: 1_800,
            scanStepSeconds: 60
        )
        let accuracyOptions = LocalEclipseOptionsV1(
            horizontalAccuracyMeters:
                horizontalAccuracyMeters,
            halfWindowSeconds: 1_800,
            scanStepSeconds: 60
        )

        for clearanceKilometers in [-8.0, 8.0] {
            let pass =
                syntheticSolarPass(
                    center: 0,
                    minimumSeparationRadians:
                        externalLimit
                        + clearanceKilometers
                            / moonDistanceKilometers,
                    sunRadiusRadians: sunRadius,
                    moonRadiusRadians: moonRadius,
                    moonDistanceKilometers:
                        moonDistanceKilometers
                )
            let withoutObserverAccuracy =
                try await LocalSolarEclipseV1
                    .solveGeometry(
                        candidateSecondsSinceReferenceDate:
                            0,
                        sampleAt: pass,
                        options: baseOptions
                    )
            if clearanceKilometers < 0 {
                let definitePartial =
                    try XCTUnwrap(
                        withoutObserverAccuracy
                    )
                XCTAssertFalse(
                    definitePartial.boundaryUncertain
                )
                XCTAssertEqual(
                    definitePartial.externalContacts
                        .count,
                    2
                )
            } else {
                XCTAssertNil(
                    withoutObserverAccuracy
                )
            }

            let result =
                try await LocalSolarEclipseV1
                    .solveGeometry(
                        candidateSecondsSinceReferenceDate:
                            0,
                        sampleAt: pass,
                        options: accuracyOptions
                    )
            let geometry = try XCTUnwrap(result)
            XCTAssertEqual(
                geometry.uncertainBoundary,
                .external
            )
            XCTAssertTrue(
                geometry.boundaryUncertain
            )
            XCTAssertEqual(
                geometry.classification,
                .partial
            )
            XCTAssertEqual(
                geometry.externalContacts.count,
                1
            )
            XCTAssertTrue(
                geometry.internalContacts.isEmpty
            )
            XCTAssertEqual(
                geometry.boundaryUncertaintyRadians,
                boundary,
                accuracy: 1e-15
            )
        }
    }

    func testCancellationStopsBeforeEphemerisSearch()
        async throws
    {
        let candidate = try await candidate(
            id: "se-20260812"
        )
        let provider =
            try DE442SEphemerisProviderV1.loadBundled()

        do {
            _ = try await LocalSolarEclipseV1
                .calculate(
                    provider: provider,
                    candidate: candidate,
                    location: london,
                    options: LocalEclipseOptionsV1(
                        shouldCancel: { true }
                    )
                )
            XCTFail("Expected cancellation")
        } catch is CancellationError {
            // Expected cooperative cancellation.
        }
    }

    private var london: ObservingLocation {
        ObservingLocation(
            id: "london",
            name: "London",
            latitude: 51.5074,
            longitude: -0.1278,
            timeZoneIdentifier: "Europe/London"
        )
    }

    private func options(
        at date: Date
    ) throws -> LocalEclipseOptionsV1 {
        let service =
            try IERSEarthOrientationServiceV1.loadBundled()
        let earthOrientation =
            try service.earthOrientationOptionsV2(
                at: date
            )
        let reported =
            EventEOPReportedUncertaintyV1(
                dut1ReportedErrorSeconds:
                    0.000_701,
                dut1PathMeters: 0.326_036,
                polarMotionPathMeters:
                    0.106_465,
                combinedPathMeters: 0.432_501
            )
        return LocalEclipseOptionsV1(
            earthOrientation:
                earthOrientation,
            earthOrientationAt: { _ in
                earthOrientation
            },
            eventEarthRotationAt: { instant in
                let stamp = String(
                    Int(
                        instant.timeIntervalSince1970
                            .rounded()
                    )
                )
                return EventEarthRotationContextV1(
                    earthOrientation:
                        earthOrientation,
                    eopID: "maximum-\(stamp)",
                    eopSourceSHA256:
                        "source-\(stamp)",
                    eopRetrievedAt:
                        "retrieved-\(stamp)",
                    eopDUT1Quality: .predicted,
                    eopPolarMotionQuality: .mixed,
                    deltaTModel:
                        "delta-\(stamp)",
                    uncertainty:
                        .iersReported(reported)
                )
            },
            eopID: "bundled-iers-eop-v1",
            heightMeters: 11,
            horizontalAccuracyMeters: 25,
            locationSource: .bundledCity
        )
    }

    private func candidate(
        id: String,
        year: Int = 2026
    ) async throws -> EclipseCandidateV1 {
        let catalog =
            try EclipseCandidateCatalogV1.loadBundled()
        let candidates = try await catalog.candidates(
            from:
                utcDate(
                    "\(year)-01-01T00:00:00Z"
                ),
            through:
                utcDate(
                    "\(year)-12-31T23:59:59Z"
                )
        )
        return try XCTUnwrap(
            candidates.first { $0.id == id }
        )
    }

    private func contact(
        _ phase: EclipseContactPhaseV1,
        in circumstances:
            LocalEclipseCircumstancesV1
    ) throws -> Date {
        try XCTUnwrap(
            circumstances.contacts.first {
                $0.phase == phase
            }
        ).instantUTC
    }

    private func syntheticSolarPass(
        center: Double,
        minimumSeparationRadians: Double,
        sunRadiusRadians: Double,
        moonRadiusRadians: Double,
        moonDistanceKilometers: Double,
        directionRateRadiansPerSecond:
            Double = 0.000_01
    ) -> (Double) async throws
        -> SolarDiscSampleV1
    {
        { instant in
            let seconds = instant - center
            let moonDirection = try XCTUnwrap(
                Vector3D(
                    x: 1,
                    y:
                        tan(
                            minimumSeparationRadians
                        ),
                    z:
                        seconds
                        * directionRateRadiansPerSecond
                ).normalized()
            )
            let sunDirection = Vector3D.unitX
            let horizontal =
                HorizontalCoordinates(
                    altitude: .pi / 4,
                    azimuth: .pi
                )
            return SolarDiscSampleV1(
                secondsSinceReferenceDate: instant,
                sun: EclipseApparentBodyStateV1(
                    body: .sun,
                    tdbJulianDate: 2_460_000,
                    lightTimeSeconds: 499,
                    distanceKilometers:
                        149_600_000,
                    angularRadiusRadians:
                        sunRadiusRadians,
                    icrfDirection: sunDirection,
                    cirsDirection: sunDirection,
                    horizontal: horizontal
                ),
                moon: EclipseApparentBodyStateV1(
                    body: .moon,
                    tdbJulianDate: 2_460_000,
                    lightTimeSeconds: 1.28,
                    distanceKilometers:
                        moonDistanceKilometers,
                    angularRadiusRadians:
                        moonRadiusRadians,
                    icrfDirection: moonDirection,
                    cirsDirection: moonDirection,
                    horizontal: horizontal
                )
            )
        }
    }

    private func angularSeparation(
        _ first: Vector3D,
        _ second: Vector3D
    ) -> Double {
        atan2(
            first.cross(second).length,
            max(-1, min(1, first.dot(second)))
        )
    }

    private func utcDate(_ value: String) -> Date {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        return fractional.date(from: value)
            ?? ISO8601DateFormatter().date(from: value)!
    }
}
