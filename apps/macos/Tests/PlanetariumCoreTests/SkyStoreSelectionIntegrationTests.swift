import Foundation
import XCTest

@testable import Planetarium
@testable import PlanetariumCore

final class SkyStoreSelectionIntegrationTests: XCTestCase {
    @MainActor
    func testNamedSelectionAndTrajectorySurviveFiltersAndDateChange()
        throws
    {
        let date = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-29T12:00:00Z"
            )
        )
        let store = SkyStore(now: date)
        let hiddenNamedStar = try XCTUnwrap(
            store.renderedStars.first {
                $0.name != nil && !$0.isAboveHorizon
            }
        )

        store.selectedStarHR = hiddenNamedStar.hr
        store.showSelectedStarTrajectory = true
        XCTAssertFalse(store.selectedStarTrajectory.isEmpty)

        store.visibleOnly = true
        store.searchText = "一致しない検索条件"

        XCTAssertEqual(
            store.selectedStarHR,
            hiddenNamedStar.hr
        )
        XCTAssertEqual(
            store.selectedStar?.hr,
            hiddenNamedStar.hr
        )
        XCTAssertEqual(
            store.selectedStarListExclusion,
            [.belowHorizon, .searchQuery]
        )
        XCTAssertFalse(store.selectedStarTrajectory.isEmpty)

        let nextDate = date.addingTimeInterval(3_600)
        store.observationDate = nextDate

        XCTAssertEqual(
            store.selectedStarHR,
            hiddenNamedStar.hr
        )
        XCTAssertEqual(
            store.selectedStar?.hr,
            hiddenNamedStar.hr
        )
        XCTAssertEqual(
            store.selectedStarTrajectory.first {
                $0.offsetMinutes == 0
            }?.date,
            nextDate
        )

        store.revealSelectedStarInList()

        XCTAssertEqual(store.searchText, "")
        XCTAssertFalse(store.visibleOnly)
        XCTAssertEqual(
            store.selectedStarHR,
            hiddenNamedStar.hr
        )
        XCTAssertNil(store.selectedStarListExclusion)
    }

    @MainActor
    func testStoreUsesExactTimeScaleWarningBoundaries()
        throws
    {
        let store = SkyStore(
            now: try date("1971-12-31T23:59:59Z")
        )
        XCTAssertEqual(
            store.timeScaleAssumptionSummary,
            "時刻系：TAI−UTC=0秒近似（1972年以前）"
        )

        store.observationDate =
            try date("1972-01-01T00:00:00Z")
        XCTAssertNil(store.timeScaleAssumptionSummary)

        store.observationDate =
            try date("2027-07-01T00:00:00Z")
        XCTAssertEqual(
            store.timeScaleAssumptionSummary,
            "時刻系：将来うるう秒不明・37秒仮定（TAI−UTC）"
        )

        store.observationDate =
            try date("2026-07-29T00:00:00Z")
        XCTAssertNil(store.timeScaleAssumptionSummary)
    }

    private func date(_ value: String) throws -> Date {
        try XCTUnwrap(
            ISO8601DateFormatter().date(from: value)
        )
    }
}
