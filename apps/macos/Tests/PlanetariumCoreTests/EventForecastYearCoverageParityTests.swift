import Foundation
@testable import PlanetariumCore
import Testing

struct EventForecastYearCoverageParityTests {
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
                    + "event-forecast-year-coverage.v1.json"
            )
        return try! JSONDecoder().decode(
            Fixture.self,
            from: Data(contentsOf: fixtureURL)
        )
    }()

    @Test
    func sharedFixtureLocksEdgeYearCoverageParity()
        throws
    {
        #expect(fixture.schemaVersion == 1)
        #expect(
            fixture.safeReceptionCoverage.startUtc
                == iso8601(
                    EventForecastYearCoverageV1
                        .safeStartUTC
                )
        )
        #expect(
            fixture.safeReceptionCoverage.endUtc
                == iso8601(
                    EventForecastYearCoverageV1
                        .safeEndUTC
                )
        )
        #expect(
            fixture.safeReceptionCoverage.interval
                == "closed"
        )

        for vector in fixture.cases {
            let actual =
                try EventForecastYearCoverageV1.gap(
                    year: vector.year,
                    utcOffsetSecondsAtYearStart:
                        vector
                            .utcOffsetSecondsAtYearStart,
                    utcOffsetSecondsAtNextYearStart:
                        vector
                            .utcOffsetSecondsAtNextYearStart
                )
            if let expected = vector.expected {
                let actual = try #require(actual)
                #expect(
                    actual.edge.rawValue
                        == expected.edge,
                    Comment(rawValue: vector.id)
                )
                #expect(
                    iso8601(
                        actual.resourceBoundaryUTC
                    ) == expected.resourceBoundaryUtc,
                    Comment(rawValue: vector.id)
                )
                #expect(
                    actual
                        .missingDurationMilliseconds
                        == expected
                            .missingDurationMilliseconds,
                    Comment(rawValue: vector.id)
                )
                #expect(
                    actual.approximateMinutes
                        == expected.approximateMinutes,
                    Comment(rawValue: vector.id)
                )
            } else {
                #expect(
                    actual == nil,
                    Comment(rawValue: vector.id)
                )
            }
        }
    }

    @Test
    func rejectsUnsupportedYearsAndOffsets() {
        #expect(throws: Error.self) {
            try EventForecastYearCoverageV1.gap(
                year: 1899,
                utcOffsetSecondsAtYearStart: 0,
                utcOffsetSecondsAtNextYearStart: 0
            )
        }
        #expect(throws: Error.self) {
            try EventForecastYearCoverageV1.gap(
                year: 2101,
                utcOffsetSecondsAtYearStart: 0,
                utcOffsetSecondsAtNextYearStart: 0
            )
        }
        #expect(throws: Error.self) {
            try EventForecastYearCoverageV1.gap(
                year: 1900,
                utcOffsetSecondsAtYearStart:
                    14 * 60 * 60 + 1,
                utcOffsetSecondsAtNextYearStart: 0
            )
        }
        #expect(throws: Error.self) {
            try EventForecastYearCoverageV1.gap(
                year: 2100,
                utcOffsetSecondsAtYearStart: 0,
                utcOffsetSecondsAtNextYearStart:
                    -12 * 60 * 60 - 1
            )
        }
    }

    private func iso8601(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        return formatter.string(from: date)
    }
}

private struct Fixture: Decodable {
    let schemaVersion: Int
    let safeReceptionCoverage:
        SafeReceptionCoverage
    let cases: [Case]

    struct SafeReceptionCoverage: Decodable {
        let startUtc: String
        let endUtc: String
        let interval: String
    }

    struct Case: Decodable {
        let id: String
        let year: Int
        let utcOffsetSecondsAtYearStart: Int
        let utcOffsetSecondsAtNextYearStart: Int
        let expected: Expected?
    }

    struct Expected: Decodable {
        let edge: String
        let resourceBoundaryUtc: String
        let missingDurationMilliseconds: Int
        let approximateMinutes: Int
    }
}
