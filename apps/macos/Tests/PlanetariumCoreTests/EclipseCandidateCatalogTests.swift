import CryptoKit
import Foundation
import XCTest

@testable import PlanetariumCore
import PlanetariumShared

final class EclipseCandidateCatalogTests: XCTestCase {
    func testBundledCatalogFindsKnown2026Eclipses() async throws {
        let catalog = try EclipseCandidateCatalogV1.loadBundled()
        let events = try await catalog.candidates(
            from: utcDate("2026-01-01T00:00:00Z"),
            through: utcDate("2026-12-31T23:59:59Z")
        )

        XCTAssertTrue(
            events.contains {
                $0.id == "le-20260303"
                    && $0.classificationHint == "total"
                    && $0.title == "皆既月食"
            }
        )
        let solar = try XCTUnwrap(
            events.first { $0.id == "se-20260812" }
        )
        XCTAssertEqual(solar.classificationHint, "total")
        XCTAssertEqual(solar.title, "皆既日食")
        XCTAssertEqual(
            solar.canonicalEpochUTC
                .timeIntervalSince1970,
            utcDate("2026-08-12T17:45:54Z")
                .timeIntervalSince1970,
            // This is a broad mean-sphere seed, not the final local maximum.
            accuracy: 60
        )
        let occultation = try XCTUnwrap(
            events.first { $0.kind == .lunarOccultation }
        )
        XCTAssertNotNil(occultation.targetStarHR)
        XCTAssertFalse(
            try XCTUnwrap(occultation.targetLabel).isEmpty
        )
        XCTAssertTrue(occultation.title.contains("掩蔽"))
        let bscDesignation = try XCTUnwrap(
            events.first {
                $0.id == "lo-20260114-hr5944"
            }
        )
        XCTAssertEqual(
            bscDesignation.targetStarHR,
            5_944
        )
        XCTAssertEqual(
            bscDesignation.targetLabel,
            "6 π Sco"
        )
        XCTAssertEqual(
            bscDesignation.title,
            "月による6 π Scoの掩蔽"
        )
    }

    func testBundledCatalogCachesOnlyTheRequestedDecade() async throws {
        let catalog = try EclipseCandidateCatalogV1.loadBundled(
            maximumCachedChunkCount: 1
        )
        _ = try await catalog.candidates(
            from: utcDate("2026-01-01T00:00:00Z"),
            through: utcDate("2026-12-31T23:59:59Z")
        )
        let firstCached =
            await catalog.cachedChunkIDsForTesting()
        XCTAssertEqual(firstCached, ["2025-2030"])

        _ = try await catalog.candidates(
            from: utcDate("2036-01-01T00:00:00Z"),
            through: utcDate("2036-12-31T23:59:59Z")
        )
        let secondCached =
            await catalog.cachedChunkIDsForTesting()
        XCTAssertEqual(secondCached, ["2035-2040"])
    }

    func testBundledCatalogRejectsInvalidDateRanges() async throws {
        let catalog = try EclipseCandidateCatalogV1.loadBundled()

        do {
            _ = try await catalog.candidates(
                from: utcDate("2027-01-01T00:00:00Z"),
                through: utcDate("2026-01-01T00:00:00Z")
            )
            XCTFail("Expected invalid range")
        } catch {
            XCTAssertEqual(
                error as? EclipseCandidateCatalogErrorV1,
                .invalidDateRange
            )
        }
        do {
            _ = try await catalog.candidates(
                from: utcDate("1899-01-01T00:00:00Z"),
                through: utcDate("1900-01-01T00:00:00Z")
            )
            XCTFail("Expected coverage error")
        } catch {
            XCTAssertEqual(
                error as? EclipseCandidateCatalogErrorV1,
                .dateRangeOutsideCoverage
            )
        }
    }

    func testLoadsNextTDBChunkForUTCInstantBeforeNewYear()
        async throws
    {
        let maximumUTC =
            utcDate("2024-12-31T23:59:30Z")
        let maximumTDB = try EventTimeScales
            .utcToTDBJulianDate(maximumUTC)
        let firstChunk = try jsonData([
            "schemaVersion": 1,
            "model":
                "de442s-mean-sphere-eclipse-candidates-v1",
            "id": "1900-2025",
            "coverage": [
                "startYear": 1900,
                "endYear": 2025,
                "endIsExclusive": true,
                "timeScale": "TDB",
            ],
            "events": [],
        ])
        let secondChunk = try jsonData([
            "schemaVersion": 1,
            "model":
                "de442s-mean-sphere-eclipse-candidates-v1",
            "id": "2025-2101",
            "coverage": [
                "startYear": 2025,
                "endYear": 2101,
                "endIsExclusive": true,
                "timeScale": "TDB",
            ],
            "events": [
                [
                    "id": "se-20250101",
                    "kind": "solar-eclipse",
                    "classificationHint": "partial",
                    "maximumJulianDateTdb": maximumTDB,
                    "searchStartJulianDateTdb":
                        maximumTDB - 0.75,
                    "searchEndJulianDateTdb":
                        maximumTDB + 0.75,
                ],
            ],
        ])
        let manifest = try jsonData([
            "schemaVersion": 1,
            "model":
                "de442s-mean-sphere-eclipse-candidates-v1",
            "coverage": [
                "timeScale": "TDB",
                "startYear": 1900,
                "endYear": 2101,
                "endIsExclusive": true,
                "chunkYears": 5,
            ],
            "chunks": [
                descriptor(
                    id: "1900-2025",
                    startYear: 1900,
                    endYear: 2025,
                    eventCount: 0,
                    data: firstChunk
                ),
                descriptor(
                    id: "2025-2101",
                    startYear: 2025,
                    endYear: 2101,
                    eventCount: 1,
                    data: secondChunk
                ),
            ],
        ])
        let catalog = try EclipseCandidateCatalogV1(
            manifestData: manifest,
            chunkDataLoader: { fileName in
                switch fileName {
                case "1900-2025.v1.json":
                    firstChunk
                case "2025-2101.v1.json":
                    secondChunk
                default:
                    throw CocoaError(.fileNoSuchFile)
                }
            }
        )

        let events = try await catalog.candidates(
            from: utcDate("2024-01-01T00:00:00Z"),
            through: utcDate("2024-12-31T23:59:59Z")
        )

        XCTAssertEqual(events.map(\.id), ["se-20250101"])
        XCTAssertEqual(
            try XCTUnwrap(events.first)
                .canonicalEpochUTC
                .timeIntervalSince1970,
            maximumUTC.timeIntervalSince1970,
            accuracy: 0.001
        )
    }

    func testSharedResourceRejectsCandidateTraversal() {
        XCTAssertThrowsError(
            try SharedResources.eventCandidateChunkURL(
                named: "../2020-2030.v1.json"
            )
        )
        XCTAssertThrowsError(
            try SharedResources.eventCandidateChunkURL(
                named: "2020-2030.v1.json?secret"
            )
        )
    }

    private func utcDate(_ value: String) -> Date {
        ISO8601DateFormatter().date(from: value)!
    }

    private func jsonData(
        _ object: Any
    ) throws -> Data {
        try JSONSerialization.data(
            withJSONObject: object,
            options: [.sortedKeys]
        )
    }

    private func descriptor(
        id: String,
        startYear: Int,
        endYear: Int,
        eventCount: Int,
        data: Data
    ) -> [String: Any] {
        [
            "id": id,
            "startYear": startYear,
            "endYear": endYear,
            "file":
                "shared/events/chunks/\(id).v1.json",
            "eventCount": eventCount,
            "byteLength": data.count,
            "sha256": SHA256.hash(data: data)
                .map { String(format: "%02x", $0) }
                .joined(),
        ]
    }
}
