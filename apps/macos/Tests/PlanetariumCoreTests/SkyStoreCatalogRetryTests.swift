import Foundation
import XCTest

@testable import Planetarium
@testable import PlanetariumCore

final class SkyStoreCatalogRetryTests: XCTestCase {
    @MainActor
    func testInitialCatalogFailureCanRetryWithoutRestart()
        throws
    {
        let loader = RetryCatalogLoader()
        let date = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-29T12:00:00Z"
            )
        )
        let store = SkyStore(
            catalogLoader: {
                try loader.load()
            },
            now: date
        )

        XCTAssertEqual(loader.attemptCount, 1)
        XCTAssertTrue(store.canRetryCatalogData)
        XCTAssertNotNil(store.catalogLoadFailure)
        XCTAssertTrue(store.catalog.stars.isEmpty)
        XCTAssertTrue(store.renderedStars.isEmpty)
        XCTAssertNil(store.selectedStarHR)

        store.retryCatalogData()

        XCTAssertEqual(loader.attemptCount, 2)
        XCTAssertFalse(store.canRetryCatalogData)
        XCTAssertNil(store.catalogLoadFailure)
        XCTAssertFalse(store.catalog.stars.isEmpty)
        XCTAssertFalse(store.renderedStars.isEmpty)
        XCTAssertNotNil(store.selectedStarHR)
        XCTAssertNil(store.errorMessage)
        XCTAssertEqual(
            store.statusMessage,
            "星表を再読み込みし、星図へ適用しました。"
        )
    }
}

private final class RetryCatalogLoader {
    private(set) var attemptCount = 0

    func load() throws -> SkyCatalog {
        attemptCount += 1
        if attemptCount == 1 {
            throw TestCatalogError.syntheticFailure
        }
        return try PlanetariumData.load()
    }
}

private enum TestCatalogError: LocalizedError {
    case syntheticFailure

    var errorDescription: String? {
        "synthetic catalog read"
    }
}
