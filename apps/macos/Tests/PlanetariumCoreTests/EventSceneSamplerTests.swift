import Foundation
import XCTest

@testable import PlanetariumCore

final class EventSceneSamplerTests:
    XCTestCase, @unchecked Sendable
{
    func testSolarMaximumMatchesContactAndInteriorSampleIsFinite()
        async throws
    {
        let provider =
            try DE442SEphemerisProviderV1
            .loadBundled()
        let candidate = try await candidate(
            id: "se-20260812",
            year: 2026
        )
        let calculationOptions =
            try options(
                at:
                    candidate
                    .canonicalEpochUTC
            )
        let calculated =
            try await LocalSolarEclipseV1
            .calculate(
                provider: provider,
                candidate: candidate,
                location: london,
                options:
                    calculationOptions
            )
        let circumstances = try XCTUnwrap(
            calculated
        )
        let maximum =
            try await LocalSolarEclipseV1
            .sampleScene(
                provider: provider,
                candidate: candidate,
                at:
                    circumstances.maximum
                    .instantUTC,
                location: london,
                options: calculationOptions
            )

        XCTAssertEqual(
            maximum.kind,
            .solarEclipse
        )
        XCTAssertEqual(
            maximum.instantUTC,
            circumstances.maximum
                .instantUTC
        )
        XCTAssertEqual(
            maximum.sun,
            circumstances.maximum.sun
        )
        XCTAssertEqual(
            maximum.moon,
            circumstances.maximum.moon
        )
        XCTAssertEqual(
            maximum.aboveHorizon,
            circumstances.maximum
                .aboveHorizon
        )
        XCTAssertNil(maximum.lunarShadow)
        XCTAssertNil(maximum.targetStar)

        let arbitrary = try interiorDate(
            contacts:
                circumstances.contacts
                .map(\.instantUTC)
        )
        let interior =
            try await LocalSolarEclipseV1
            .sampleScene(
                provider: provider,
                candidate: candidate,
                at: arbitrary,
                location: london,
                options: calculationOptions
            )
        assertFinite(interior)
        assertNotAContact(
            arbitrary,
            contacts:
                circumstances.contacts
                .map(\.instantUTC)
        )
    }

    func testLunarMaximumMatchesContactAndInteriorSampleIsFinite()
        async throws
    {
        let provider =
            try DE442SEphemerisProviderV1
            .loadBundled()
        let candidate = try await candidate(
            id: "le-20260303",
            year: 2026
        )
        let calculationOptions =
            try options(
                at:
                    candidate
                    .canonicalEpochUTC
            )
        let calculated =
            try await LocalLunarEclipseV1
            .calculate(
                provider: provider,
                candidate: candidate,
                location: london,
                options:
                    calculationOptions
            )
        let circumstances = try XCTUnwrap(
            calculated
        )
        let maximum =
            try await LocalLunarEclipseV1
            .sampleScene(
                provider: provider,
                candidate: candidate,
                at:
                    circumstances.maximum
                    .instantUTC,
                location: london,
                options: calculationOptions
            )

        XCTAssertEqual(
            maximum.kind,
            .lunarEclipse
        )
        XCTAssertEqual(
            maximum.instantUTC,
            circumstances.maximum
                .instantUTC
        )
        XCTAssertEqual(
            maximum.moon,
            circumstances.maximum.moon
        )
        XCTAssertEqual(
            maximum.lunarShadow,
            circumstances.maximum
                .lunarShadow
        )
        XCTAssertEqual(
            maximum.aboveHorizon,
            circumstances.maximum
                .aboveHorizon
        )
        XCTAssertNotNil(maximum.sun)
        XCTAssertNil(maximum.targetStar)

        let arbitrary = try interiorDate(
            contacts:
                circumstances.contacts
                .map(\.instantUTC)
        )
        let interior =
            try await LocalLunarEclipseV1
            .sampleScene(
                provider: provider,
                candidate: candidate,
                at: arbitrary,
                location: london,
                options: calculationOptions
            )
        assertFinite(interior)
        assertNotAContact(
            arbitrary,
            contacts:
                circumstances.contacts
                .map(\.instantUTC)
        )
    }

    func testOccultationMaximumMatchesContactAndInteriorSampleIsFinite()
        async throws
    {
        let provider =
            try DE442SEphemerisProviderV1
            .loadBundled()
        let catalog = try PlanetariumData.load()
        let candidate = try await candidate(
            id: "lo-20170305-hr1457",
            year: 2017
        )
        let calculationOptions =
            try options(
                at:
                    candidate
                    .canonicalEpochUTC
            )
        let calculated =
            try await LocalLunarOccultationV1
            .calculate(
                provider: provider,
                candidate: candidate,
                catalog: catalog,
                location: newYork,
                options:
                    calculationOptions
            )
        let circumstances = try XCTUnwrap(
            calculated
        )
        let maximum =
            try await LocalLunarOccultationV1
            .sampleScene(
                provider: provider,
                candidate: candidate,
                catalog: catalog,
                at:
                    circumstances.maximum
                    .instantUTC,
                location: newYork,
                options: calculationOptions
            )
        let target = try XCTUnwrap(
            maximum.targetStar
        )

        XCTAssertEqual(
            maximum.kind,
            .lunarOccultation
        )
        XCTAssertEqual(
            maximum.instantUTC,
            circumstances.maximum
                .instantUTC
        )
        XCTAssertEqual(
            maximum.moon,
            circumstances.maximum.moon
        )
        XCTAssertEqual(
            target.starHR,
            circumstances.target.starHR
        )
        XCTAssertEqual(
            target.horizontal,
            circumstances.maximum
                .targetHorizontal
        )
        XCTAssertEqual(
            maximum.aboveHorizon,
            circumstances.maximum
                .aboveHorizon
        )
        XCTAssertNil(maximum.sun)
        XCTAssertNil(maximum.lunarShadow)

        let arbitrary = try interiorDate(
            contacts:
                circumstances.contacts
                .map(\.instantUTC)
        )
        let interior =
            try await LocalLunarOccultationV1
            .sampleScene(
                provider: provider,
                candidate: candidate,
                catalog: catalog,
                at: arbitrary,
                location: newYork,
                options: calculationOptions
            )
        assertFinite(interior)
        assertNotAContact(
            arbitrary,
            contacts:
                circumstances.contacts
                .map(\.instantUTC)
        )
    }

    func testSamplerRequestsFailClosed()
        async throws
    {
        let provider =
            try DE442SEphemerisProviderV1
            .loadBundled()
        let solar = try await candidate(
            id: "se-20260812",
            year: 2026
        )
        let lunar = try await candidate(
            id: "le-20260303",
            year: 2026
        )

        do {
            _ = try await LocalSolarEclipseV1
                .sampleScene(
                    provider: provider,
                    candidate: lunar,
                    at:
                        lunar
                        .canonicalEpochUTC,
                    location: london
                )
            XCTFail(
                "Expected a candidate-kind failure"
            )
        } catch let error as LocalEclipseErrorV1 {
            XCTAssertEqual(
                error,
                .wrongCandidateKind
            )
        }

        do {
            _ = try await LocalSolarEclipseV1
                .sampleScene(
                    provider: provider,
                    candidate: solar,
                    at: Date(
                        timeIntervalSinceReferenceDate:
                            .nan
                    ),
                    location: london
                )
            XCTFail(
                "Expected an invalid instant"
            )
        } catch let error
            as EventSceneSampleErrorV1
        {
            XCTAssertEqual(
                error,
                .invalidInstant
            )
        }

        do {
            _ = try await LocalSolarEclipseV1
                .sampleScene(
                    provider: provider,
                    candidate: solar,
                    at: utcDate(
                        "1800-01-01T00:00:00Z"
                    ),
                    location: london
                )
            XCTFail(
                "Expected an ephemeris coverage failure"
            )
        } catch let error
            as EventSceneSampleErrorV1
        {
            XCTAssertEqual(
                error,
                .outsideEphemerisCoverage
            )
        }

        do {
            _ = try await LocalSolarEclipseV1
                .sampleScene(
                    provider: provider,
                    candidate: solar,
                    at:
                        solar
                        .canonicalEpochUTC,
                    location: london,
                    options:
                        LocalEclipseOptionsV1(
                            shouldCancel: {
                                true
                            }
                        )
                )
            XCTFail(
                "Expected cooperative cancellation"
            )
        } catch is CancellationError {
            // Expected.
        }

        let catalog = try PlanetariumData.load()
        let occultation = try await candidate(
            id: "lo-20170305-hr1457",
            year: 2017
        )
        let wrongTarget = try XCTUnwrap(
            catalog.stars.first {
                $0.hr
                    != occultation
                    .targetStarHR
            }
        )
        do {
            _ =
                try await LocalLunarOccultationV1
                .sampleScene(
                    provider: provider,
                    candidate: occultation,
                    targetStar: wrongTarget,
                    at:
                        occultation
                        .canonicalEpochUTC,
                    location: newYork
                )
            XCTFail(
                "Expected an HR mismatch"
            )
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
    }

    private var london: ObservingLocation {
        ObservingLocation(
            id: "london",
            name: "London",
            latitude: 51.5074,
            longitude: -0.1278,
            timeZoneIdentifier:
                "Europe/London"
        )
    }

    private var newYork: ObservingLocation {
        ObservingLocation(
            id: "new-york",
            name: "New York",
            latitude: 40.7128,
            longitude: -74.0060,
            timeZoneIdentifier:
                "America/New_York"
        )
    }

    private func options(
        at date: Date
    ) throws -> LocalEclipseOptionsV1 {
        let earthOrientation =
            try IERSEarthOrientationServiceV1
            .loadBundled()
            .earthOrientationOptionsV2(
                at: date
            )
        return LocalEclipseOptionsV1(
            earthOrientation:
                earthOrientation,
            earthOrientationAt: { _ in
                earthOrientation
            },
            eventEarthRotationAt: { _ in
                EventEarthRotationContextV1(
                    earthOrientation:
                        earthOrientation,
                    eopID: "scene-sampler-test",
                    deltaTModel:
                        "scene-sampler-test"
                )
            },
            eopID: "scene-sampler-test",
            heightMeters: 11,
            horizontalAccuracyMeters: 25,
            locationSource: .manual
        )
    }

    private func candidate(
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

    private func interiorDate(
        contacts: [Date]
    ) throws -> Date {
        let first = try XCTUnwrap(
            contacts.min()
        )
        let last = try XCTUnwrap(
            contacts.max()
        )
        let duration =
            last.timeIntervalSince(first)
        XCTAssertGreaterThan(duration, 1)
        return first.addingTimeInterval(
            duration * 0.37
        )
    }

    private func assertNotAContact(
        _ date: Date,
        contacts: [Date],
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(
            contacts.allSatisfy {
                abs(
                    $0.timeIntervalSince(date)
                ) > 0.001
            },
            file: file,
            line: line
        )
    }

    private func assertFinite(
        _ sample: EventSceneSampleV1,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let values = [
            sample.instantUTC
                .timeIntervalSinceReferenceDate,
            sample.moon.horizontal.altitude,
            sample.moon.horizontal.azimuth,
            sample.moon
                .angularRadiusRadians,
            sample.moon.distanceKilometers,
            sample.relativeDirection
                .eastwardRadians,
            sample.relativeDirection
                .upwardRadians,
            sample.relativeDirection
                .separationRadians,
            sample.relativeDirection
                .positionAngleRadians,
        ]
        XCTAssertTrue(
            values.allSatisfy(\.isFinite),
            file: file,
            line: line
        )
        if let sun = sample.sun {
            XCTAssertTrue(
                [
                    sun.horizontal.altitude,
                    sun.horizontal.azimuth,
                    sun.angularRadiusRadians,
                    sun.distanceKilometers,
                ].allSatisfy(\.isFinite),
                file: file,
                line: line
            )
        }
        if let shadow = sample.lunarShadow {
            XCTAssertTrue(
                [
                    shadow
                        .centerSeparationRadians,
                    shadow
                        .penumbralAngularRadiusRadians,
                    shadow
                        .umbralAngularRadiusRadians,
                ].allSatisfy(\.isFinite),
                file: file,
                line: line
            )
        }
        if let target = sample.targetStar {
            XCTAssertTrue(
                [
                    target.horizontal.altitude,
                    target.horizontal.azimuth,
                    target.visualMagnitude,
                ].allSatisfy(\.isFinite),
                file: file,
                line: line
            )
        }
    }

    private func utcDate(
        _ value: String
    ) -> Date {
        ISO8601DateFormatter()
            .date(from: value)!
    }
}
