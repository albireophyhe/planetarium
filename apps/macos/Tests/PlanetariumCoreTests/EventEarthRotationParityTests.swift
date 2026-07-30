import Foundation
@testable import PlanetariumCore
import Testing

struct EventEarthRotationParityTests {
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
                    + "event-earth-rotation-model.v1.json"
            )
        let data = try! Data(contentsOf: fixtureURL)
        return try! JSONDecoder().decode(
            Fixture.self,
            from: data
        )
    }()

    @Test
    func sharedFixtureLocksFallbackParity() throws {
        #expect(fixture.schemaVersion == 1)
        #expect(
            fixture.bundledEopCoverage
                == .init(
                    firstSampleUtc:
                        "1973-01-02T00:00:00.000Z",
                    lastSampleUtc:
                        "2027-07-31T00:00:00.000Z",
                    interval: "closed"
                )
        )
        #expect(
            fixture.fallbackCases.map(\.id) == [
                "historical-1900",
                "historical-1950",
                "historical-1955",
                "inside-eop-2005",
                "inside-eop-2026",
                "eop-last-sample-minus-1ms",
                "eop-last-sample",
                "eop-last-sample-plus-1ms",
                "future-2050",
                "future-2100",
            ]
        )

        for vector in fixture.fallbackCases {
            let date = try parseDate(vector.observedAtUtc)
            switch vector.expected.outcome {
            case "inside-bundled-eop-coverage-error":
                do {
                    _ = try EventEarthRotationModelV1
                        .fallback(at: date)
                    Issue.record(
                        "\(vector.id): expected coverage error"
                    )
                } catch EventEarthRotationModelErrorV1
                    .fallbackInsideBundledEOPCoverage
                {
                    // Expected: in-coverage fallback is fail-closed.
                } catch {
                    Issue.record(
                        "\(vector.id): unexpected error \(error)"
                    )
                }
            case "fallback":
                let expected = try #require(
                    vector.expected.fallbackValues
                )
                let actual = try EventEarthRotationModelV1
                    .fallback(at: date)

                #expect(
                    abs(
                        actual.deltaTSeconds
                            - expected.deltaTSeconds
                    ) <= fixture.tolerances.seconds,
                    "\(vector.id) ΔT"
                )
                #expect(
                    abs(
                        actual.dut1Seconds
                            - expected.dut1Seconds
                    ) <= fixture.tolerances.seconds,
                    "\(vector.id) DUT1"
                )
                #expect(
                    abs(
                        actual.deltaTUncertaintySeconds
                            - expected
                                .deltaTUncertaintySeconds
                    ) <= fixture.tolerances.seconds,
                    "\(vector.id) ΔT uncertainty"
                )
                #expect(
                    abs(
                        actual.pathUncertaintyKilometers
                            - expected
                                .pathUncertaintyKilometers
                    ) <= fixture.tolerances.kilometers,
                    "\(vector.id) path uncertainty"
                )
                #expect(
                    actual.assumedTAIMinusUTCSeconds
                        == expected.assumedTaiMinusUtcSeconds,
                    "\(vector.id) TAI−UTC"
                )
                #expect(
                    actual.eopID == expected.eopId,
                    "\(vector.id) EOP id"
                )
                #expect(
                    actual.deltaTModel == expected.deltaTModel,
                    "\(vector.id) ΔT model"
                )
            default:
                Issue.record(
                    "\(vector.id): unknown expected outcome \(vector.expected.outcome)"
                )
            }
        }
    }

    @Test
    func sharedFixtureLocksNASAPolynomialPieces() throws {
        #expect(
            fixture.nasaPolynomialBoundaryCases
                .map(\.id) == [
                    "nasa-piece-1920",
                    "nasa-piece-1941",
                    "nasa-piece-1961",
                    "nasa-piece-1986",
                    "nasa-piece-2005",
                    "nasa-piece-2050",
                ]
        )

        for vector in fixture.nasaPolynomialBoundaryCases {
            let actualBefore =
                try EventEarthRotationModelV1
                    .nasaPolynomialSeconds(
                        decimalYear:
                            vector.boundaryDecimalYear
                            - vector.epsilonYears
                    )
            let actualAt =
                try EventEarthRotationModelV1
                    .nasaPolynomialSeconds(
                        decimalYear:
                            vector.boundaryDecimalYear
                    )
            let actualAfter =
                try EventEarthRotationModelV1
                    .nasaPolynomialSeconds(
                        decimalYear:
                            vector.boundaryDecimalYear
                            + vector.epsilonYears
                    )

            #expect(
                abs(
                    actualBefore
                        - vector.expectedSeconds.before
                ) <= fixture.tolerances.polynomialSeconds,
                "\(vector.id) before"
            )
            #expect(
                abs(
                    actualAt - vector.expectedSeconds.at
                ) <= fixture.tolerances.polynomialSeconds,
                "\(vector.id) at"
            )
            #expect(
                abs(
                    actualAfter
                        - vector.expectedSeconds.after
                ) <= fixture.tolerances.polynomialSeconds,
                "\(vector.id) after"
            )
        }
    }

    private func parseDate(_ value: String) throws -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        return try #require(formatter.date(from: value))
    }
}

private struct Fixture: Decodable, Sendable {
    let schemaVersion: Int
    let bundledEopCoverage: BundledEOPCoverage
    let tolerances: Tolerances
    let fallbackCases: [FallbackCase]
    let nasaPolynomialBoundaryCases:
        [NASAPolynomialBoundaryCase]
}

private struct BundledEOPCoverage:
    Decodable,
    Equatable,
    Sendable
{
    let firstSampleUtc: String
    let lastSampleUtc: String
    let interval: String
}

private struct Tolerances: Decodable, Sendable {
    let seconds: Double
    let kilometers: Double
    let polynomialSeconds: Double
}

private struct FallbackCase: Decodable, Sendable {
    let id: String
    let observedAtUtc: String
    let expected: ExpectedFallback
}

private struct ExpectedFallback: Decodable, Sendable {
    let outcome: String
    let deltaTSeconds: Double?
    let dut1Seconds: Double?
    let deltaTUncertaintySeconds: Double?
    let pathUncertaintyKilometers: Double?
    let assumedTaiMinusUtcSeconds: Double?
    let eopId: String?
    let deltaTModel: String?

    var fallbackValues: FallbackValues? {
        guard
            let deltaTSeconds,
            let dut1Seconds,
            let deltaTUncertaintySeconds,
            let pathUncertaintyKilometers,
            let assumedTaiMinusUtcSeconds,
            let eopId,
            let deltaTModel
        else {
            return nil
        }
        return FallbackValues(
            deltaTSeconds: deltaTSeconds,
            dut1Seconds: dut1Seconds,
            deltaTUncertaintySeconds:
                deltaTUncertaintySeconds,
            pathUncertaintyKilometers:
                pathUncertaintyKilometers,
            assumedTaiMinusUtcSeconds:
                assumedTaiMinusUtcSeconds,
            eopId: eopId,
            deltaTModel: deltaTModel
        )
    }
}

private struct FallbackValues: Sendable {
    let deltaTSeconds: Double
    let dut1Seconds: Double
    let deltaTUncertaintySeconds: Double
    let pathUncertaintyKilometers: Double
    let assumedTaiMinusUtcSeconds: Double
    let eopId: String
    let deltaTModel: String
}

private struct NASAPolynomialBoundaryCase:
    Decodable,
    Sendable
{
    let id: String
    let boundaryDecimalYear: Double
    let epsilonYears: Double
    let expectedSeconds: ExpectedPolynomialSeconds
}

private struct ExpectedPolynomialSeconds:
    Decodable,
    Sendable
{
    let before: Double
    let at: Double
    let after: Double
}
