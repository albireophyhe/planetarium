import Foundation
@testable import PlanetariumCore
import Testing

struct LunarEclipseNASAValidationTests {
    private let fixture: LunarFixture = {
        let testFileURL = URL(fileURLWithPath: #filePath)
        let repositoryRoot = testFileURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let fixtureURL = repositoryRoot
            .appendingPathComponent(
                "shared/fixtures/"
                    + "nasa-lunar-eclipses-2021-2030.v1.json"
            )
        let data = try! Data(contentsOf: fixtureURL)
        return try! JSONDecoder().decode(
            LunarFixture.self,
            from: data
        )
    }()

    @Test
    func bundledSolverMatchesEveryNASADecadeEvent()
        async throws
    {
        let catalog =
            try EclipseCandidateCatalogV1.loadBundled()
        let candidates = try await catalog.candidates(
            from: parseUTC("2021-01-01T00:00:00Z"),
            through: parseUTC("2030-12-31T23:59:59Z")
        ).filter { $0.kind == .lunarEclipse }
        let candidatesByID = Dictionary(
            uniqueKeysWithValues:
                candidates.map { ($0.id, $0) }
        )
        let provider =
            try DE442SEphemerisProviderV1.loadBundled()
        let location = ObservingLocation(
            id: "nasa-validation",
            name: "Greenwich meridian",
            latitude: 0,
            longitude: 0,
            timeZoneIdentifier: "UTC"
        )

        #expect(fixture.schemaVersion == 1)
        #expect(fixture.events.count == 22)
        #expect(candidates.count == fixture.events.count)
        for expected in fixture.events {
            let candidate = try #require(
                candidatesByID[expected.id]
            )
            let circumstances = try #require(
                try await LocalLunarEclipseV1
                    .calculate(
                        provider: provider,
                        candidate: candidate,
                        location: location
                    )
            )
            #expect(
                circumstances.classification.rawValue
                    == expected.classification,
                Comment(rawValue: expected.id)
            )

            let expectedMaximumUTC =
                try scaleNeutralTDDate(
                    expected.greatestEclipseTd
                ).addingTimeInterval(-69.184)
            let maximumDifference = abs(
                circumstances.maximum.instantUTC
                    .timeIntervalSince(expectedMaximumUTC)
            )
            #expect(
                maximumDifference
                    <= fixture.tolerances
                        .maximumUtcSeconds,
                Comment(
                    rawValue:
                        "\(expected.id) greatest eclipse"
                )
            )

            if expected.classification != "penumbral" {
                #expect(
                    abs(
                        circumstances.magnitude
                            - expected.umbralMagnitude
                    )
                        <= fixture.tolerances
                            .umbralMagnitude,
                    Comment(
                        rawValue:
                            "\(expected.id) umbral magnitude"
                    )
                )
            }
        }
    }

    private func parseUTC(_ value: String) -> Date {
        ISO8601DateFormatter().date(from: value)!
    }

    private func scaleNeutralTDDate(
        _ value: String
    ) throws -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return try #require(
            formatter.date(from: value + "Z")
        )
    }
}

private struct LunarFixture: Decodable, Sendable {
    let schemaVersion: Int
    let tolerances: LunarTolerances
    let events: [ExpectedLunarEvent]
}

private struct LunarTolerances: Decodable, Sendable {
    let maximumUtcSeconds: Double
    let umbralMagnitude: Double
}

private struct ExpectedLunarEvent:
    Decodable, Sendable
{
    let id: String
    let greatestEclipseTd: String
    let classification: String
    let umbralMagnitude: Double
}
