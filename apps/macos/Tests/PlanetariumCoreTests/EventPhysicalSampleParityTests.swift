import Foundation
import XCTest

@testable import PlanetariumCore

final class EventPhysicalSampleParityTests:
    XCTestCase, @unchecked Sendable
{
    func testSharedFixtureMatchesBothRuntimeModels()
        async throws
    {
        let fixture = try loadFixture()
        XCTAssertEqual(fixture.schemaVersion, 1)
        XCTAssertEqual(
            fixture.model,
            "event-physical-samples-v1"
        )

        let provider =
            try DE442SEphemerisProviderV1
            .loadBundled()
        let candidateCatalog =
            try EclipseCandidateCatalogV1
            .loadBundled()
        let candidates =
            try await candidateCatalog.candidates(
                from: parseDate(
                    "2017-01-01T00:00:00.000Z"
                ),
                through: parseDate(
                    "2026-12-31T23:59:59.999Z"
                )
            )
        let candidateByID = Dictionary(
            uniqueKeysWithValues:
                candidates.map {
                    ($0.id, $0)
                }
        )
        let starCatalog =
            try PlanetariumData.load()
        let earthOrientation =
            EarthOrientationOptionsV2(
                dut1Seconds: 0,
                dut1Source: .caller,
                polarMotion:
                    PolarMotionOptionsV2(
                        xpRadians: 0,
                        ypRadians: 0,
                        source: .assumedZero
                    )
            )

        for vector in fixture.cases {
            let candidate = try XCTUnwrap(
                candidateByID[vector.eventId],
                "\(vector.id) candidate"
            )
            XCTAssertEqual(
                candidate.kind.rawValue,
                vector.kind,
                "\(vector.id) kind"
            )
            XCTAssertEqual(
                candidate.targetStarHR,
                vector.targetStarHR,
                "\(vector.id) target"
            )
            let instant =
                try parseDate(
                    vector.instantUtc
                )
            let location =
                ObservingLocation(
                    id: vector.id,
                    name: vector.id,
                    latitude:
                        vector.location
                        .latitude,
                    longitude:
                        vector.location
                        .longitude,
                    timeZoneIdentifier:
                        vector.location
                        .timeZone,
                    heightMeters:
                        vector.location
                        .heightMeters
                )
            let options =
                LocalEclipseOptionsV1(
                    earthOrientation:
                        earthOrientation,
                    earthOrientationAt: { _ in
                        earthOrientation
                    },
                    eopID:
                        "shared-physical-sample-fixture",
                    heightMeters:
                        vector.location
                        .heightMeters,
                    locationSource: .manual
                )
            let sample: EventSceneSampleV1
            switch candidate.kind {
            case .solarEclipse:
                sample =
                    try await LocalSolarEclipseV1
                    .sampleScene(
                        provider: provider,
                        candidate: candidate,
                        at: instant,
                        location: location,
                        options: options
                    )
            case .lunarEclipse:
                sample =
                    try await LocalLunarEclipseV1
                    .sampleScene(
                        provider: provider,
                        candidate: candidate,
                        at: instant,
                        location: location,
                        options: options
                    )
            case .lunarOccultation:
                sample =
                    try await LocalLunarOccultationV1
                    .sampleScene(
                        provider: provider,
                        candidate: candidate,
                        catalog: starCatalog,
                        at: instant,
                        location: location,
                        options: options
                    )
            }

            XCTAssertEqual(
                sample.instantUTC,
                instant,
                "\(vector.id) instant"
            )
            XCTAssertEqual(
                sample.aboveHorizon,
                vector.expected
                    .aboveHorizon,
                "\(vector.id) horizon"
            )
            try assertBodies(
                sample,
                vector: vector,
                tolerances:
                    fixture.tolerances
            )
            try assertShadow(
                sample.lunarShadow,
                expected:
                    vector.expected
                    .lunarShadow,
                tolerances:
                    fixture.tolerances,
                label: vector.id
            )
        }
    }

    private func assertBodies(
        _ sample: EventSceneSampleV1,
        vector: PhysicalSampleCase,
        tolerances: PhysicalSampleTolerances
    ) throws {
        if let expected =
            vector.expected.bodies.sun
        {
            let actual = try XCTUnwrap(
                sample.sun,
                "\(vector.id) sun"
            )
            assertBody(
                horizontal: actual.horizontal,
                angularRadiusRadians:
                    actual.angularRadiusRadians,
                distanceKilometers:
                    actual.distanceKilometers,
                expected: expected,
                tolerances: tolerances,
                label: "\(vector.id) sun"
            )
        }
        if let expected =
            vector.expected.bodies.moon
        {
            assertBody(
                horizontal:
                    sample.moon.horizontal,
                angularRadiusRadians:
                    sample.moon
                    .angularRadiusRadians,
                distanceKilometers:
                    sample.moon
                    .distanceKilometers,
                expected: expected,
                tolerances: tolerances,
                label: "\(vector.id) moon"
            )
        }
        if let expected =
            vector.expected.bodies.target
        {
            let target = try XCTUnwrap(
                sample.targetStar,
                "\(vector.id) target"
            )
            assertBody(
                horizontal:
                    target.horizontal,
                angularRadiusRadians: nil,
                distanceKilometers: nil,
                expected: expected,
                tolerances: tolerances,
                label: "\(vector.id) target"
            )
        }
    }

    private func assertBody(
        horizontal: HorizontalCoordinates,
        angularRadiusRadians: Double?,
        distanceKilometers: Double?,
        expected: ExpectedPhysicalBody,
        tolerances: PhysicalSampleTolerances,
        label: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertLessThanOrEqual(
            abs(
                horizontal.altitude
                    - expected
                    .altitudeRadians
            ),
            tolerances.angleRadians,
            "\(label) altitude",
            file: file,
            line: line
        )
        XCTAssertLessThanOrEqual(
            circularDifference(
                horizontal.azimuth,
                expected.azimuthRadians
            ),
            tolerances.angleRadians,
            "\(label) azimuth",
            file: file,
            line: line
        )
        XCTAssertEqual(
            horizontal.azimuthIsDefined,
            expected.azimuthDefined,
            "\(label) azimuth defined",
            file: file,
            line: line
        )
        assertOptionalValue(
            angularRadiusRadians,
            expected:
                expected
                .angularRadiusRadians,
            tolerance:
                tolerances
                .angleRadians,
            label: "\(label) radius",
            file: file,
            line: line
        )
        assertOptionalValue(
            distanceKilometers,
            expected:
                expected
                .distanceKilometers,
            tolerance:
                tolerances
                .distanceKilometers,
            label: "\(label) distance",
            file: file,
            line: line
        )
    }

    private func assertShadow(
        _ actual: LunarShadowGeometryV1?,
        expected: ExpectedPhysicalShadow?,
        tolerances: PhysicalSampleTolerances,
        label: String
    ) throws {
        guard let expected else {
            XCTAssertNil(
                actual,
                "\(label) shadow"
            )
            return
        }
        let actual = try XCTUnwrap(
            actual,
            "\(label) shadow"
        )
        XCTAssertLessThanOrEqual(
            abs(
                actual
                    .centerSeparationRadians
                    - expected
                    .centerSeparationRadians
            ),
            tolerances.angleRadians,
            "\(label) shadow separation"
        )
        let positionAngle =
            try XCTUnwrap(
                actual
                    .centerPositionAngleRadians,
                "\(label) shadow position angle"
            )
        XCTAssertLessThanOrEqual(
            circularDifference(
                positionAngle,
                expected
                    .centerPositionAngleRadians
            ),
            tolerances.angleRadians,
            "\(label) shadow position angle"
        )
        XCTAssertLessThanOrEqual(
            abs(
                actual
                    .penumbralAngularRadiusRadians
                    - expected
                    .penumbralAngularRadiusRadians
            ),
            tolerances.angleRadians,
            "\(label) penumbral radius"
        )
        XCTAssertLessThanOrEqual(
            abs(
                actual
                    .umbralAngularRadiusRadians
                    - expected
                    .umbralAngularRadiusRadians
            ),
            tolerances.angleRadians,
            "\(label) umbral radius"
        )
    }

    private func assertOptionalValue(
        _ actual: Double?,
        expected: Double?,
        tolerance: Double,
        label: String,
        file: StaticString,
        line: UInt
    ) {
        guard let expected else {
            XCTAssertNil(
                actual,
                label,
                file: file,
                line: line
            )
            return
        }
        guard let actual else {
            XCTFail(
                "\(label) is missing",
                file: file,
                line: line
            )
            return
        }
        XCTAssertLessThanOrEqual(
            abs(actual - expected),
            tolerance,
            label,
            file: file,
            line: line
        )
    }

    private func circularDifference(
        _ actual: Double,
        _ expected: Double
    ) -> Double {
        let fullTurn = Double.pi * 2
        var value =
            (actual - expected)
            .truncatingRemainder(
                dividingBy: fullTurn
            )
        if value > Double.pi {
            value -= fullTurn
        } else if value < -Double.pi {
            value += fullTurn
        }
        return abs(value)
    }

    private func loadFixture()
        throws -> PhysicalSampleFixture
    {
        let testFileURL = URL(
            fileURLWithPath: #filePath
        )
        let repositoryRoot =
            testFileURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let fixtureURL =
            repositoryRoot
            .appendingPathComponent(
                "shared/fixtures/"
                    + "event-physical-samples.v1.json"
            )
        return try JSONDecoder().decode(
            PhysicalSampleFixture.self,
            from: Data(
                contentsOf: fixtureURL
            )
        )
    }

    private func parseDate(
        _ value: String
    ) throws -> Date {
        let formatter =
            ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        return try XCTUnwrap(
            formatter.date(from: value),
            value
        )
    }
}

private struct PhysicalSampleFixture:
    Decodable, Sendable
{
    let schemaVersion: Int
    let model: String
    let tolerances:
        PhysicalSampleTolerances
    let cases: [PhysicalSampleCase]
}

private struct PhysicalSampleTolerances:
    Decodable, Sendable
{
    let angleRadians: Double
    let distanceKilometers: Double
}

private struct PhysicalSampleCase:
    Decodable, Sendable
{
    let id: String
    let eventId: String
    let kind: String
    let targetStarHR: Int?
    let instantUtc: String
    let location: PhysicalSampleLocation
    let expected: ExpectedPhysicalSample
}

private struct PhysicalSampleLocation:
    Decodable, Sendable
{
    let latitude: Double
    let longitude: Double
    let heightMeters: Double
    let timeZone: String
}

private struct ExpectedPhysicalSample:
    Decodable, Sendable
{
    let aboveHorizon: Bool
    let bodies: ExpectedPhysicalBodies
    let lunarShadow: ExpectedPhysicalShadow?
}

private struct ExpectedPhysicalBodies:
    Decodable, Sendable
{
    let sun: ExpectedPhysicalBody?
    let moon: ExpectedPhysicalBody?
    let target: ExpectedPhysicalBody?
}

private struct ExpectedPhysicalBody:
    Decodable, Sendable
{
    let altitudeRadians: Double
    let azimuthRadians: Double
    let azimuthDefined: Bool
    let angularRadiusRadians: Double?
    let distanceKilometers: Double?
}

private struct ExpectedPhysicalShadow:
    Decodable, Sendable
{
    let centerSeparationRadians: Double
    let centerPositionAngleRadians: Double
    let penumbralAngularRadiusRadians:
        Double
    let umbralAngularRadiusRadians: Double
}
