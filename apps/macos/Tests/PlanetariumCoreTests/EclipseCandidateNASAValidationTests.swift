import Foundation
@testable import PlanetariumCore
import Testing

struct EclipseCandidateNASAValidationTests {
    private let fixture: Fixture = {
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
                    + "nasa-solar-eclipses-2021-2030.v1.json"
            )
        let data = try! Data(contentsOf: fixtureURL)
        return try! JSONDecoder().decode(
            Fixture.self,
            from: data
        )
    }()

    @Test
    func bundledCandidatesMatchNASADecadeCatalog()
        async throws
    {
        let catalog =
            try EclipseCandidateCatalogV1.loadBundled()
        let candidates = try await catalog.candidates(
            from: parseUTC("2021-01-01T00:00:00Z"),
            through: parseUTC("2030-12-31T23:59:59Z")
        )
        let solarCandidates = candidates.filter {
            $0.kind == .solarEclipse
        }
        let candidatesByID = Dictionary(
            uniqueKeysWithValues:
                solarCandidates.map { ($0.id, $0) }
        )

        #expect(fixture.schemaVersion == 1)
        #expect(fixture.events.count == 22)
        #expect(solarCandidates.count == fixture.events.count)
        for expected in fixture.events {
            let actual = try #require(
                candidatesByID[expected.id]
            )
            #expect(
                actual.classificationHint
                    == expected.classification,
                Comment(rawValue: expected.id)
            )
            let nasaJulianDate = try scaleNeutralJulianDate(
                expected.greatestEclipseTd
            )
            let differenceSeconds = abs(
                actual.maximumJulianDateTDB
                    - nasaJulianDate
            ) * 86_400
            #expect(
                differenceSeconds
                    <= fixture.tolerances
                        .candidateMaximumTdbVsGreatestEclipseTdSeconds,
                Comment(
                    rawValue:
                        "\(expected.id) candidate maximum"
                )
            )
        }
    }

    private func parseUTC(_ value: String) -> Date {
        ISO8601DateFormatter().date(from: value)!
    }

    private func scaleNeutralJulianDate(
        _ value: String
    ) throws -> Double {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        let date = try #require(
            formatter.date(from: value + "Z")
        )
        return date.timeIntervalSince1970 / 86_400
            + 2_440_587.5
    }
}

private struct Fixture: Decodable, Sendable {
    let schemaVersion: Int
    let tolerances: Tolerances
    let events: [ExpectedEvent]
}

private struct Tolerances: Decodable, Sendable {
    let candidateMaximumTdbVsGreatestEclipseTdSeconds:
        Double
}

private struct ExpectedEvent: Decodable, Sendable {
    let id: String
    let greatestEclipseTd: String
    let classification: String
}
