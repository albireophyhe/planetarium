import Foundation
import XCTest

@testable import PlanetariumCore

final class LocalLunarOccultationTests:
    XCTestCase, @unchecked Sendable
{
    func testSyntheticPassSolvesOrderedDisappearanceAndReappearance()
        async throws
    {
        let center = Date(
            timeIntervalSince1970:
                1_830_297_600
        ).timeIntervalSinceReferenceDate
        let result =
            try await LocalLunarOccultationV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        center,
                    sampleAt:
                        syntheticPass(center: center),
                    options:
                        LocalEclipseOptionsV1(
                            halfWindowSeconds:
                                60 * 60,
                            scanStepSeconds: 60
                        )
                )
        let geometry = try XCTUnwrap(result)

        XCTAssertFalse(geometry.boundaryUncertain)
        XCTAssertFalse(geometry.numericallyTangent)
        XCTAssertEqual(
            geometry.limbContacts.count,
            2
        )
        XCTAssertEqual(
            geometry.maximum
                .secondsSinceReferenceDate,
            center,
            accuracy: 0.1
        )
        XCTAssertEqual(
            geometry.limbContacts[0]
                .secondsSinceReferenceDate,
            center - 2_000,
            accuracy: 0.1
        )
        XCTAssertEqual(
            geometry.limbContacts[1]
                .secondsSinceReferenceDate,
            center + 2_000,
            accuracy: 0.1
        )
        XCTAssertEqual(
            try XCTUnwrap(
                LocalLunarOccultationV1
                    .limbPositionAngleRadians(
                        moonDirection:
                            geometry
                            .limbContacts[0]
                            .moon.cirsDirection,
                        targetDirection:
                            geometry
                            .limbContacts[0]
                            .target.cirsDirection
                    )
            ),
            3 * Double.pi / 2,
            accuracy: 1e-8
        )
        XCTAssertEqual(
            try XCTUnwrap(
                LocalLunarOccultationV1
                    .limbPositionAngleRadians(
                        moonDirection:
                            geometry
                            .limbContacts[1]
                            .moon.cirsDirection,
                        targetDirection:
                            geometry
                            .limbContacts[1]
                            .target.cirsDirection
                    )
            ),
            Double.pi / 2,
            accuracy: 1e-8
        )
    }

    func testSyntheticLocalMissReturnsNil()
        async throws
    {
        let center = Date()
            .timeIntervalSinceReferenceDate
        let result =
            try await LocalLunarOccultationV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        center,
                    sampleAt:
                        syntheticPass(
                            center: center,
                            northOffsetRadians:
                                0.01
                        ),
                    options:
                        LocalEclipseOptionsV1(
                            halfWindowSeconds:
                                60 * 60,
                            scanStepSeconds: 60
                        )
                )

        XCTAssertNil(result)
    }

    func testNumericalTangencyIsSeparateFromPhysicalBand()
        async throws
    {
        let center = Date()
            .timeIntervalSinceReferenceDate
        let result =
            try await LocalLunarOccultationV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        center,
                    sampleAt:
                        syntheticPass(
                            center: center,
                            northOffsetRadians:
                                0.004
                        ),
                    options:
                        LocalEclipseOptionsV1(
                            halfWindowSeconds:
                                60 * 60,
                            scanStepSeconds: 60
                        )
                )
        let geometry = try XCTUnwrap(result)

        XCTAssertTrue(geometry.boundaryUncertain)
        XCTAssertTrue(geometry.numericallyTangent)
        XCTAssertEqual(
            geometry.limbContacts.count,
            1
        )
        XCTAssertLessThan(
            abs(
                geometry
                    .minimumClearanceRadians
            ),
            5e-10
        )
    }

    func testPhysicalBandClassifiesBothSidesConservatively()
        async throws
    {
        let center = Date()
            .timeIntervalSinceReferenceDate
        let moonRadius = 0.004
        let boundaryBand =
            try LocalLunarOccultationV1
                .boundaryUncertaintyRadians(
                    moonDistanceKilometers:
                        384_400
                )

        func solveAtClearance(
            _ clearance: Double
        ) async throws -> LunarOccultationGeometryV1? {
            try await LocalLunarOccultationV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        center,
                    sampleAt:
                        syntheticPass(
                            center: center,
                            northOffsetRadians:
                                moonRadius
                                + clearance
                        ),
                    options:
                        LocalEclipseOptionsV1(
                            halfWindowSeconds:
                                60 * 60,
                            scanStepSeconds: 60
                        )
                )
        }

        let nearMissResult =
            try await solveAtClearance(
                0.5 * boundaryBand
            )
        let shallowMeanLimbHitResult =
            try await solveAtClearance(
                -0.5 * boundaryBand
            )
        let clearOccultationResult =
            try await solveAtClearance(
                -1.5 * boundaryBand
            )
        let farMiss =
            try await solveAtClearance(
                1.5 * boundaryBand
            )
        let nearMiss = try XCTUnwrap(
            nearMissResult
        )
        let shallowMeanLimbHit = try XCTUnwrap(
            shallowMeanLimbHitResult
        )
        let clearOccultation = try XCTUnwrap(
            clearOccultationResult
        )

        XCTAssertGreaterThan(boundaryBand, 1e-5)
        XCTAssertTrue(nearMiss.boundaryUncertain)
        XCTAssertFalse(nearMiss.numericallyTangent)
        XCTAssertEqual(
            nearMiss.limbContacts.count,
            1
        )
        XCTAssertTrue(
            shallowMeanLimbHit.boundaryUncertain
        )
        XCTAssertEqual(
            shallowMeanLimbHit.limbContacts.count,
            1
        )
        XCTAssertFalse(
            clearOccultation.boundaryUncertain
        )
        XCTAssertEqual(
            clearOccultation.limbContacts.count,
            2
        )
        XCTAssertNil(farMiss)
    }

    func testKnownObserverAccuracyExpandsPhysicalBand()
        async throws
    {
        let center = Date()
            .timeIntervalSinceReferenceDate
        let moonRadius = 0.004
        let baseBand =
            try LocalLunarOccultationV1
                .boundaryUncertaintyRadians(
                    moonDistanceKilometers:
                        384_400
                )
        let pass = syntheticPass(
            center: center,
            northOffsetRadians:
                moonRadius + 1.2 * baseBand
        )
        let withoutAccuracy =
            try await LocalLunarOccultationV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        center,
                    sampleAt: pass,
                    options:
                        LocalEclipseOptionsV1(
                            halfWindowSeconds:
                                60 * 60
                        )
                )
        let withAccuracy =
            try await LocalLunarOccultationV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        center,
                    sampleAt: pass,
                    options:
                        LocalEclipseOptionsV1(
                            horizontalAccuracyMeters:
                                5_000,
                            halfWindowSeconds:
                                60 * 60
                        )
                )
        let geometry = try XCTUnwrap(withAccuracy)

        XCTAssertNil(withoutAccuracy)
        XCTAssertTrue(geometry.boundaryUncertain)
        XCTAssertEqual(
            geometry.boundaryUncertaintyRadians,
            try LocalLunarOccultationV1
                .boundaryUncertaintyRadians(
                    moonDistanceKilometers:
                        384_400,
                    horizontalAccuracyMeters:
                        5_000
                ),
            accuracy: 1e-12
        )
        XCTAssertThrowsError(
            try LocalLunarOccultationV1
                .boundaryUncertaintyRadians(
                    moonDistanceKilometers:
                        384_400,
                    earthRotationPathUncertaintyKilometers:
                        -1
                )
        ) { error in
            XCTAssertEqual(
                error as? LocalEclipseErrorV1,
                .invalidEarthRotationPathUncertainty
            )
        }
    }

    func testEarthRotationPathUncertaintyExpandsPhysicalBand()
        async throws
    {
        let center = Date()
            .timeIntervalSinceReferenceDate
        let moonRadius = 0.004
        let baseBand =
            try LocalLunarOccultationV1
                .boundaryUncertaintyRadians(
                    moonDistanceKilometers:
                        384_400
                )
        let pass = syntheticPass(
            center: center,
            northOffsetRadians:
                moonRadius + 1.2 * baseBand
        )
        let withoutEarthRotation =
            try await LocalLunarOccultationV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        center,
                    sampleAt: pass,
                    options:
                        LocalEclipseOptionsV1(
                            halfWindowSeconds:
                                60 * 60
                        )
                )
        let withEarthRotation =
            try await LocalLunarOccultationV1
                .solveGeometry(
                    candidateSecondsSinceReferenceDate:
                        center,
                    sampleAt: pass,
                    options:
                        LocalEclipseOptionsV1(
                            earthRotationPathUncertaintyKilometers:
                                5,
                            halfWindowSeconds:
                                60 * 60
                        )
                )
        let geometry = try XCTUnwrap(
            withEarthRotation
        )

        XCTAssertNil(withoutEarthRotation)
        XCTAssertTrue(geometry.boundaryUncertain)
        XCTAssertEqual(
            geometry.boundaryUncertaintyRadians,
            try LocalLunarOccultationV1
                .boundaryUncertaintyRadians(
                    moonDistanceKilometers:
                        384_400,
                    earthRotationPathUncertaintyKilometers:
                        5
                ),
            accuracy: 1e-12
        )
    }

    /**
     Independent real-event oracle:
     IOTA reports a five-station graze of Aldebaran near Mississauga,
     Ontario, on 2017-03-05 UTC. The bundled candidate fixture independently
     pins `lo-20170305-hr1457` to that report.
     https://occultations.org/publications/rasc/2025/nam25grz.htm

     A mean spherical limb cannot reproduce the observed mountain-by-
     mountain flashes. This test therefore verifies the real event/date,
     target, local contact ordering, and reference-tier disclosure rather
     than claiming profile-grade contact times.
     */
    func test2017MississaugaAldebaranEventFromBundledData()
        async throws
    {
        let catalog = try PlanetariumData.load()
        let candidateCatalog =
            try EclipseCandidateCatalogV1
                .loadBundled()
        let candidates =
            try await candidateCatalog.candidates(
                from:
                    utcDate(
                        "2017-01-01T00:00:00Z"
                    ),
                through:
                    utcDate(
                        "2017-12-31T23:59:59Z"
                    )
            )
        let candidate = try XCTUnwrap(
            candidates.first {
                $0.id
                    == "lo-20170305-hr1457"
            }
        )
        let target = try XCTUnwrap(
            catalog.starsByHR[1457]
        )
        let eop =
            try IERSEarthOrientationServiceV1
                .loadBundled()
                .earthOrientationOptionsV2(
                    at:
                        candidate
                        .canonicalEpochUTC
                )
        let provider =
            try DE442SEphemerisProviderV1
                .loadBundled()
        let result =
            try await LocalLunarOccultationV1
                .calculate(
                    provider: provider,
                    candidate: candidate,
                    catalog: catalog,
                    location:
                        ObservingLocation(
                            id: "mississauga",
                            name: "Mississauga",
                            latitude: 43.5890,
                            longitude: -79.6441,
                            timeZoneIdentifier:
                                "America/Toronto"
                        ),
                    options:
                        LocalEclipseOptionsV1(
                            earthOrientationAt: { _ in
                                eop
                            },
                            eopID:
                                "bundled-iers-eop-v1",
                            earthRotationPathUncertaintyKilometers:
                                2,
                            heightMeters: 170,
                            horizontalAccuracyMeters:
                                1_000,
                            locationSource:
                                .manual,
                            timingUncertaintySeconds:
                                eop
                                .dut1UncertaintySeconds
                        )
                )
        let circumstances =
            try XCTUnwrap(result)

        XCTAssertEqual(
            circumstances.target.starHR,
            target.hr
        )
        XCTAssertEqual(
            circumstances.target.label,
            "アルデバラン"
        )
        XCTAssertEqual(
            circumstances.uncertainty.tier,
            .reference
        )
        let expectedBoundaryKilometers =
            try LocalLunarOccultationV1
                .boundaryUncertaintyRadians(
                    moonDistanceKilometers:
                        circumstances.maximum.moon
                        .distanceKilometers,
                    horizontalAccuracyMeters:
                        1_000,
                    earthRotationPathUncertaintyKilometers:
                        2
                )
                * circumstances.maximum.moon
                    .distanceKilometers
        XCTAssertEqual(
            try XCTUnwrap(
                circumstances.uncertainty
                    .pathKilometers
            ),
            expectedBoundaryKilometers,
            accuracy: 0.000_000_001
        )
        XCTAssertEqual(
            circumstances.provenance
                .ephemerisID,
            "jpl-de442s-type2-float32"
        )
        XCTAssertEqual(
            circumstances.provenance
                .algorithmVersion,
            "event-occultation-v1-bsc5p-mean-limb-boundary-band"
        )
        XCTAssertEqual(
            circumstances.provenance
                .lunarRadiusModel,
            "mean-spherical-limb"
        )
        XCTAssertNil(
            circumstances.provenance
                .limbProfileID
        )
        XCTAssertTrue(
            circumstances.warnings
                .joined(separator: " ")
                .contains("平均月縁")
        )
        XCTAssertTrue(
            circumstances.warnings
                .joined(separator: " ")
                .contains("±11 km")
        )
        XCTAssertTrue(
            circumstances.uncertainty
                .dominantContributors
                .joined(separator: " ")
                .contains("24.5 m")
        )
        XCTAssertTrue(
            circumstances.uncertainty
                .dominantContributors
                .joined(separator: " ")
                .contains("地球回転の経路不確かさ")
        )
        XCTAssertTrue(
            circumstances.warnings
                .joined(separator: " ")
                .contains("経路±2.00 km")
        )
        XCTAssertTrue(
            circumstances.warnings
                .joined(separator: " ")
                .contains("総経路境界幅")
        )
        XCTAssertEqual(
            utcYear(
                circumstances.maximum
                    .instantUTC
            ),
            2017
        )
        XCTAssertEqual(
            utcMonthDay(
                circumstances.maximum
                    .instantUTC
            ),
            [3, 5]
        )
        if circumstances.boundaryUncertain {
            XCTAssertEqual(
                circumstances.contacts
                    .map(\.phase),
                [.maximum]
            )
            XCTAssertEqual(
                circumstances.visibility,
                .partlyVisible
            )
        } else {
            XCTAssertEqual(
                circumstances.contacts
                    .map(\.phase),
                [
                    .disappearance,
                    .maximum,
                    .reappearance,
                ]
            )
            XCTAssertLessThan(
                circumstances.contacts[0]
                    .instantUTC,
                circumstances.maximum
                    .instantUTC
            )
            XCTAssertLessThan(
                circumstances.maximum
                    .instantUTC,
                circumstances.contacts[2]
                    .instantUTC
            )
        }
        XCTAssertNotNil(
            circumstances.contacts.first?
                .positionAngleRadians
        )
    }

    /**
     Independent timing oracle:
     Sky & Telescope's IOTA-sourced city table gives New York
     disappearance at 23:10 EST and reappearance at 23:31 EST on
     2017-03-04, or 04:10/04:31 UTC on March 5. The published values are
     rounded to whole minutes, so the tolerance also covers that rounding
     and the solver's intentionally spherical mean limb.
     https://skyandtelescope.org/observing/aldebaran-occultation-march-4-2017/
     */
    func test2017NewYorkContactsMatchPublishedIOTACityTimes()
        async throws
    {
        let catalog = try PlanetariumData.load()
        let candidate =
            try await occultationCandidate2017()
        let provider =
            try DE442SEphemerisProviderV1
                .loadBundled()
        let eop =
            try IERSEarthOrientationServiceV1
                .loadBundled()
                .earthOrientationOptionsV2(
                    at:
                        candidate
                        .canonicalEpochUTC
                )
        let result =
            try await LocalLunarOccultationV1
                .calculate(
                    provider: provider,
                    candidate: candidate,
                    catalog: catalog,
                    location:
                        ObservingLocation(
                            id: "new-york",
                            name: "New York",
                            latitude: 40.7128,
                            longitude: -74.0060,
                            timeZoneIdentifier:
                                "America/New_York"
                        ),
                    options:
                        LocalEclipseOptionsV1(
                            earthOrientation: eop,
                            eopID:
                                "bundled-iers-eop-v1",
                            heightMeters: 10,
                            horizontalAccuracyMeters:
                                1_000,
                            locationSource:
                                .manual,
                            timingUncertaintySeconds:
                                eop
                                .dut1UncertaintySeconds
                        )
                )
        let circumstances =
            try XCTUnwrap(result)

        XCTAssertFalse(
            circumstances.boundaryUncertain
        )
        XCTAssertEqual(
            circumstances.contacts.map(\.phase),
            [
                .disappearance,
                .maximum,
                .reappearance,
            ]
        )
        XCTAssertEqual(
            circumstances.contacts[0]
                .instantUTC
                .timeIntervalSince1970,
            utcDate(
                "2017-03-05T04:10:00Z"
            ).timeIntervalSince1970,
            accuracy: 90
        )
        XCTAssertEqual(
            circumstances.contacts[2]
                .instantUTC
                .timeIntervalSince1970,
            utcDate(
                "2017-03-05T04:31:00Z"
            ).timeIntervalSince1970,
            accuracy: 90
        )
        XCTAssertTrue(
            circumstances.contacts
                .allSatisfy(\.aboveHorizon)
        )
        XCTAssertFalse(
            circumstances.precisionWarnings
                .contains(.dut1AssumedZero)
        )
    }

    func testRejectsMismatchedTargetAndCancellation()
        async throws
    {
        let catalog = try PlanetariumData.load()
        let candidate =
            try await occultationCandidate2017()
        let provider =
            try DE442SEphemerisProviderV1
                .loadBundled()
        let wrongTarget = try XCTUnwrap(
            catalog.stars.first {
                $0.hr
                    != candidate.targetStarHR
            }
        )

        do {
            _ = try await LocalLunarOccultationV1
                .calculate(
                    provider: provider,
                    candidate: candidate,
                    targetStar: wrongTarget,
                    location:
                        ObservingLocation(
                            id: "test",
                            name: "Test",
                            latitude: 0,
                            longitude: 0,
                            timeZoneIdentifier: "UTC"
                        )
                )
            XCTFail("Expected target mismatch")
        } catch let error
            as LocalLunarOccultationErrorV1
        {
            XCTAssertEqual(
                error,
                .targetStarMismatch(
                    expectedHR: 1457,
                    actualHR: wrongTarget.hr
                )
            )
        }

        do {
            _ = try await LocalLunarOccultationV1
                .calculate(
                    provider: provider,
                    candidate: candidate,
                    catalog: catalog,
                    location:
                        ObservingLocation(
                            id: "test",
                            name: "Test",
                            latitude: 0,
                            longitude: 0,
                            timeZoneIdentifier: "UTC"
                        ),
                    options:
                        LocalEclipseOptionsV1(
                            shouldCancel: { true }
                        )
                )
            XCTFail("Expected cancellation")
        } catch is CancellationError {
            // Expected cooperative cancellation.
        }
    }

    func testFinal2100CandidateClipsOversizedSearchToEphemerisEnd()
        async throws
    {
        let catalog = try PlanetariumData.load()
        let candidate =
            try await occultationCandidate(
                id: "lo-21001231-hr7121",
                year: 2100
            )
        let provider =
            try DE442SEphemerisProviderV1
                .loadBundled()
        let halfWindowSeconds =
            max(
                candidate.maximumJulianDateTDB
                    - candidate
                    .searchStartJulianDateTDB,
                candidate.searchEndJulianDateTDB
                    - candidate
                    .maximumJulianDateTDB
            )
            * PrecisionConstants.secondsPerDay
        let requestedEndTDB =
            try EventTimeScales
                .utcToTDBJulianDate(
                    candidate.canonicalEpochUTC
                )
            + halfWindowSeconds
                / PrecisionConstants.secondsPerDay

        XCTAssertGreaterThan(
            requestedEndTDB,
            provider.coverageEndJulianDateTdb
        )
        XCTAssertGreaterThan(
            candidate.searchEndJulianDateTDB,
            provider.coverageEndJulianDateTdb
        )
        XCTAssertGreaterThan(
            (
                candidate.searchEndJulianDateTDB
                    - provider
                    .coverageEndJulianDateTdb
            )
                * PrecisionConstants.secondsPerDay,
            60 * 60
        )
        let loadedSearchRange =
            try EclipseCalculationSupportV1
                .ephemerisSearchRange(
                    provider: provider
                )
        let clippedSearchRange =
            try EclipseCalculationSupportV1
                .resolveSearchRange(
                    candidateSecondsSinceReferenceDate:
                        candidate.canonicalEpochUTC
                        .timeIntervalSinceReferenceDate,
                    halfWindowSeconds:
                        halfWindowSeconds,
                    limit: loadedSearchRange
                )
        XCTAssertEqual(
            clippedSearchRange
                .endSecondsSinceReferenceDate,
            loadedSearchRange
                .endSecondsSinceReferenceDate
        )

        _ = try await LocalLunarOccultationV1
            .calculate(
                provider: provider,
                candidate: candidate,
                catalog: catalog,
                location:
                    ObservingLocation(
                        id: "tokyo",
                        name: "東京",
                        latitude: 35.681_236,
                        longitude: 139.767_125,
                        timeZoneIdentifier:
                            "Asia/Tokyo"
                    ),
                options:
                    LocalEclipseOptionsV1(
                        halfWindowSeconds:
                            halfWindowSeconds
                    )
            )
    }

    func testFirst1900CandidateClipsOversizedSearchToSafeEphemerisStart()
        async throws
    {
        let catalog = try PlanetariumData.load()
        let candidate =
            try await occultationCandidate(
                id: "lo-19000101-hr7264",
                year: 1900
            )
        let provider =
            try DE442SEphemerisProviderV1
                .loadBundled()
        let halfWindowSeconds =
            2 * PrecisionConstants.secondsPerDay
        let requestedStartTDB =
            try EventTimeScales
                .utcToTDBJulianDate(
                    candidate.canonicalEpochUTC
                )
            - halfWindowSeconds
                / PrecisionConstants.secondsPerDay

        XCTAssertLessThan(
            requestedStartTDB,
            provider.coverageStartJulianDateTdb
        )

        _ = try await LocalLunarOccultationV1
            .calculate(
                provider: provider,
                candidate: candidate,
                catalog: catalog,
                location:
                    ObservingLocation(
                        id: "greenwich",
                        name: "Greenwich",
                        latitude: 51.4769,
                        longitude: 0,
                        timeZoneIdentifier: "UTC"
                    ),
                options:
                    LocalEclipseOptionsV1(
                        halfWindowSeconds:
                            halfWindowSeconds
                    )
            )
    }

    private func syntheticPass(
        center: Double,
        rateRadiansPerSecond: Double =
            0.000_002,
        northOffsetRadians: Double = 0,
        moonRadiusRadians: Double = 0.004
    ) -> (Double) async throws
        -> LunarOccultationSampleV1
    {
        { instant in
            let seconds = instant - center
            return LunarOccultationSampleV1(
                secondsSinceReferenceDate: instant,
                moon:
                    EclipseApparentBodyStateV1(
                        body: .moon,
                        tdbJulianDate: 2_460_000,
                        lightTimeSeconds: 1.28,
                        distanceKilometers:
                            384_400,
                        angularRadiusRadians:
                            moonRadiusRadians,
                        icrfDirection: .unitX,
                        cirsDirection: .unitX,
                        horizontal:
                            HorizontalCoordinates(
                                altitude: 0.5,
                                azimuth: 2
                            )
                    ),
                target:
                    LunarOccultationStarStateV1(
                        starHR: 1,
                        cirsDirection:
                            try self.normalized(
                                Vector3D(
                                    x: 1,
                                    y:
                                        tan(
                                            rateRadiansPerSecond
                                            * seconds
                                        ),
                                    z:
                                        tan(
                                            northOffsetRadians
                                        )
                                )
                            ),
                        horizontal:
                            HorizontalCoordinates(
                                altitude: 0.5,
                                azimuth: 2
                            ),
                        precisionWarnings: []
                    )
            )
        }
    }

    private func normalized(
        _ vector: Vector3D
    ) throws -> Vector3D {
        try XCTUnwrap(vector.normalized())
    }

    private func occultationCandidate2017()
        async throws -> EclipseCandidateV1
    {
        try await occultationCandidate(
            id: "lo-20170305-hr1457",
            year: 2017
        )
    }

    private func occultationCandidate(
        id: String,
        year: Int
    ) async throws -> EclipseCandidateV1 {
        let catalog =
            try EclipseCandidateCatalogV1
                .loadBundled()
        let candidates =
            try await catalog.candidates(
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
            candidates.first {
                $0.id == id
            }
        )
    }

    private func utcDate(
        _ value: String
    ) -> Date {
        ISO8601DateFormatter()
            .date(from: value)!
    }

    private func utcYear(
        _ date: Date
    ) -> Int {
        utcComponents(date)[0]
    }

    private func utcMonthDay(
        _ date: Date
    ) -> [Int] {
        Array(utcComponents(date)[1...2])
    }

    private func utcComponents(
        _ date: Date
    ) -> [Int] {
        var calendar =
            Calendar(identifier: .gregorian)
        calendar.timeZone =
            TimeZone(secondsFromGMT: 0)!
        let components =
            calendar.dateComponents(
                [.year, .month, .day],
                from: date
            )
        return [
            components.year!,
            components.month!,
            components.day!,
        ]
    }
}
