import Foundation
import XCTest

@testable import Planetarium
@testable import PlanetariumCore

final class EventForecastStoreTests:
    XCTestCase, @unchecked Sendable
{
    @MainActor
    func testLoadKeepsAllForecastsButHidesBelowHorizonByDefault()
        async throws
    {
        let visible = makeForecast(
            id: "visible",
            date: date("2026-03-03T11:34:00Z"),
            visibility: .partlyVisible
        )
        let hidden = makeForecast(
            id: "hidden",
            date: date("2026-08-28T04:13:00Z"),
            visibility: .belowHorizon
        )
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in
                [hidden, visible]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-07-30T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }

        XCTAssertEqual(
            store.forecasts.map(\.id),
            ["visible", "hidden"]
        )
        XCTAssertEqual(
            store.displayedForecasts.map(\.id),
            ["visible"]
        )
        XCTAssertEqual(
            store.hiddenForecastCount,
            1
        )
        XCTAssertFalse(store.showBelowHorizon)
        XCTAssertEqual(
            store.selectedForecastID,
            "visible"
        )

        store.setShowBelowHorizon(true)

        XCTAssertEqual(
            store.displayedForecasts.map(\.id),
            ["visible", "hidden"]
        )
        XCTAssertEqual(
            store.selectedForecastID,
            "visible",
            "表示対象を増やしても現在の選択を維持する"
        )
    }

    @MainActor
    func testObservationYearInitiallySelectsFirstDisplayedForecastAtOrAfterObservationDate()
        async throws
    {
        let past = makeForecast(
            id: "past",
            date: date("2026-03-03T11:34:00Z"),
            visibility: .fullyVisible
        )
        let hiddenUpcoming = makeForecast(
            id: "hidden-upcoming",
            date: date("2026-08-28T04:13:00Z"),
            visibility: .belowHorizon
        )
        let upcoming = makeForecast(
            id: "upcoming",
            date: date("2026-09-12T18:13:00Z"),
            visibility: .partlyVisible
        )
        let later = makeForecast(
            id: "later",
            date: date("2026-12-01T00:00:00Z"),
            visibility: .fullyVisible
        )
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in
                [later, hiddenUpcoming, past, upcoming]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-07-30T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }

        XCTAssertEqual(
            store.displayedForecasts.map(\.id),
            ["past", "upcoming", "later"]
        )
        XCTAssertEqual(
            store.selectedForecastID,
            "upcoming"
        )
    }

    @MainActor
    func testObservationYearSelectsLatestDisplayedForecastWhenAllArePast()
        async throws
    {
        let first = makeForecast(
            id: "first",
            date: date("2026-03-03T11:34:00Z"),
            visibility: .fullyVisible
        )
        let latest = makeForecast(
            id: "latest",
            date: date("2026-08-28T04:13:00Z"),
            visibility: .partlyVisible
        )
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in
                [latest, first]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-12-01T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }

        XCTAssertEqual(
            store.selectedForecastID,
            "latest"
        )
    }

    @MainActor
    func testHidingBelowHorizonFallsBackToFirstVisibleForecast()
        async throws
    {
        let visible = makeForecast(
            id: "visible",
            date: date("2026-03-03T11:34:00Z"),
            visibility: .fullyVisible
        )
        let hidden = makeForecast(
            id: "hidden",
            date: date("2026-08-28T04:13:00Z"),
            visibility: .belowHorizon
        )
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in
                [visible, hidden]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-07-30T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }
        store.setShowBelowHorizon(true)
        store.selectForecast("hidden")
        XCTAssertEqual(
            store.selectedForecastID,
            "hidden"
        )

        store.setShowBelowHorizon(false)

        XCTAssertEqual(
            store.displayedForecasts.map(\.id),
            ["visible"]
        )
        XCTAssertEqual(
            store.selectedForecastID,
            "visible"
        )
        XCTAssertEqual(
            store.selectedForecast?.id,
            "visible"
        )
    }

    @MainActor
    func testOnlyBelowHorizonForecastsRemainLoadedAndCanBeRevealed()
        async throws
    {
        let first = makeForecast(
            id: "hidden-first",
            date: date("2026-03-03T11:34:00Z"),
            visibility: .belowHorizon
        )
        let second = makeForecast(
            id: "hidden-second",
            date: date("2026-08-28T04:13:00Z"),
            visibility: .belowHorizon
        )
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in
                [second, first]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-07-30T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }

        XCTAssertEqual(store.forecasts.count, 2)
        XCTAssertTrue(
            store.displayedForecasts.isEmpty
        )
        XCTAssertEqual(
            store.hiddenForecastCount,
            2
        )
        XCTAssertNil(store.selectedForecastID)

        store.setShowBelowHorizon(true)

        XCTAssertEqual(
            store.displayedForecasts.map(\.id),
            ["hidden-first", "hidden-second"]
        )
        XCTAssertEqual(
            store.selectedForecastID,
            "hidden-second"
        )
    }

    @MainActor
    func testKindFilterCombinesWithHorizonVisibilityAndFallsBackSelection()
        async throws
    {
        let solar = makeForecast(
            id: "solar",
            date: date("2026-01-10T02:00:00Z"),
            visibility: .fullyVisible,
            kind: .solarEclipse
        )
        let lunar = makeForecast(
            id: "lunar",
            date: date("2026-02-20T03:00:00Z"),
            visibility: .belowHorizon
        )
        let occultation = makeOccultationForecast(
            id: "occultation",
            visibility: .fullyVisible,
            grazing: false
        )
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in
                [occultation, lunar, solar]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-01-01T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }

        XCTAssertEqual(
            store.displayedForecasts.map(\.id),
            ["solar", "occultation"]
        )
        XCTAssertEqual(store.hiddenForecastCount, 1)
        XCTAssertEqual(store.selectedForecastID, "solar")

        store.setKindFilter(.lunarEclipse)

        XCTAssertEqual(store.kindFilter, .lunarEclipse)
        XCTAssertTrue(store.displayedForecasts.isEmpty)
        XCTAssertEqual(store.hiddenForecastCount, 1)
        XCTAssertNil(store.selectedForecastID)

        store.setShowBelowHorizon(true)

        XCTAssertEqual(
            store.displayedForecasts.map(\.id),
            ["lunar"]
        )
        XCTAssertEqual(store.selectedForecastID, "lunar")

        store.setKindFilter(.lunarOccultation)

        XCTAssertEqual(
            store.displayedForecasts.map(\.id),
            ["occultation"]
        )
        XCTAssertEqual(
            store.selectedForecastID,
            "occultation"
        )
        XCTAssertEqual(store.hiddenForecastCount, 0)

        store.setKindFilter(.all)

        XCTAssertEqual(
            store.displayedForecasts.map(\.id),
            ["solar", "lunar", "occultation"]
        )
        XCTAssertEqual(
            store.selectedForecastID,
            "occultation",
            "選択中の現象が結果集合に残る場合は選択を維持する"
        )
    }

    @MainActor
    func testObservationYearFiltersUseUpcomingFallbackWhenSelectionDisappears()
        async throws
    {
        let pastSolar = makeForecast(
            id: "past-solar",
            date: date("2026-02-01T00:00:00Z"),
            visibility: .fullyVisible,
            kind: .solarEclipse
        )
        let selectedLunar = makeForecast(
            id: "selected-lunar",
            date: date("2026-08-01T00:00:00Z"),
            visibility: .fullyVisible,
            kind: .lunarEclipse
        )
        let upcomingSolar = makeForecast(
            id: "upcoming-solar",
            date: date("2026-09-01T00:00:00Z"),
            visibility: .fullyVisible,
            kind: .solarEclipse
        )
        let hidden = makeForecast(
            id: "hidden",
            date: date("2026-10-01T00:00:00Z"),
            visibility: .belowHorizon,
            kind: .solarEclipse
        )
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in
                [
                    hidden,
                    upcomingSolar,
                    selectedLunar,
                    pastSolar,
                ]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-07-30T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }
        XCTAssertEqual(
            store.selectedForecastID,
            "selected-lunar"
        )

        store.setKindFilter(.solarEclipse)

        XCTAssertEqual(
            store.selectedForecastID,
            "upcoming-solar",
            "種類で選択が外れた場合も過去の先頭へ戻さない"
        )

        store.setShowBelowHorizon(true)
        store.selectForecast("hidden")
        store.setShowBelowHorizon(false)

        XCTAssertEqual(
            store.selectedForecastID,
            "upcoming-solar",
            "地平線filterで選択が外れた場合も観測日時以後を選ぶ"
        )
    }

    @MainActor
    func testOtherYearStartsAtFirstForecastAndReturningToObservationYearRestoresUpcoming()
        async throws
    {
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                year, _ in
                if year == 2026 {
                    return [
                        self.makeForecast(
                            id: "past-2026",
                            date: self.date(
                                "2026-02-01T00:00:00Z"
                            ),
                            visibility: .fullyVisible
                        ),
                        self.makeForecast(
                            id: "upcoming-2026",
                            date: self.date(
                                "2026-09-01T00:00:00Z"
                            ),
                            visibility: .fullyVisible
                        ),
                    ]
                }
                return [
                    self.makeForecast(
                        id: "first-2027",
                        date: self.date(
                            "2027-03-01T00:00:00Z"
                        ),
                        visibility: .fullyVisible
                    ),
                    self.makeForecast(
                        id: "second-2027",
                        date: self.date(
                            "2027-10-01T00:00:00Z"
                        ),
                        visibility: .fullyVisible
                    ),
                ]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-07-30T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }
        XCTAssertEqual(
            store.selectedForecastID,
            "upcoming-2026"
        )

        store.selectNextYear(location: tokyo)
        try await waitUntil {
            store.phase == .loaded
                && store.selectedYear == 2027
        }
        XCTAssertEqual(
            store.selectedForecastID,
            "first-2027"
        )

        store.selectPreviousYear(location: tokyo)

        XCTAssertEqual(store.phase, .loaded)
        XCTAssertEqual(store.selectedYear, 2026)
        XCTAssertEqual(
            store.selectedForecastID,
            "upcoming-2026"
        )
    }

    @MainActor
    func testSelectingCurrentObservationYearResetsSelectionToUpcoming()
        async throws
    {
        let upcoming = makeForecast(
            id: "upcoming",
            date: date("2026-08-01T00:00:00Z"),
            visibility: .fullyVisible
        )
        let later = makeForecast(
            id: "later",
            date: date("2026-10-01T00:00:00Z"),
            visibility: .fullyVisible
        )
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in
                [later, upcoming]
            }
        )

        let observationDate =
            date("2026-07-30T00:00:00Z")
        store.activate(
            location: tokyo,
            observationDate: observationDate
        )
        try await waitUntil {
            store.phase == .loaded
        }
        store.selectForecast("later")
        XCTAssertEqual(
            store.selectedForecastID,
            "later"
        )

        store.selectObservationYear(
            observationDate: observationDate,
            location: tokyo
        )

        XCTAssertEqual(
            store.selectedForecastID,
            "upcoming"
        )
    }

    @MainActor
    func testReactivatingUpdatesUpcomingSelectionReferenceDate()
        async throws
    {
        let summer = makeForecast(
            id: "summer",
            date: date("2026-08-01T00:00:00Z"),
            visibility: .fullyVisible
        )
        let autumn = makeForecast(
            id: "autumn",
            date: date("2026-10-01T00:00:00Z"),
            visibility: .fullyVisible
        )
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in
                [autumn, summer]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-07-30T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }
        XCTAssertEqual(
            store.selectedForecastID,
            "summer"
        )

        store.deactivate()
        store.activate(
            location: tokyo,
            observationDate:
                date("2026-09-01T00:00:00Z")
        )

        XCTAssertEqual(
            store.phase,
            .loaded,
            "同じ地点・年へ戻る時はキャッシュを使う"
        )
        XCTAssertEqual(
            store.selectedForecastID,
            "autumn"
        )
    }

    @MainActor
    func testKindFilterPersistsAcrossYearAndLocationReloads()
        async throws
    {
        let london = ObservingLocation(
            id: "london",
            name: "ロンドン",
            latitude: 51.5074,
            longitude: -0.1278,
            timeZoneIdentifier: "Europe/London"
        )
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                year, location in
                if location.id == "london" {
                    return [
                        self.makeForecast(
                            id: "london-solar",
                            date: self.date(
                                "2027-08-02T10:00:00Z"
                            ),
                            visibility: .fullyVisible,
                            location: location,
                            kind: .solarEclipse
                        ),
                    ]
                }
                return [
                    self.makeForecast(
                        id: "tokyo-\(year)",
                        date: self.date(
                            "\(year)-09-01T10:00:00Z"
                        ),
                        visibility: .fullyVisible,
                        kind:
                            year == 2026
                            ? .solarEclipse
                            : .lunarEclipse
                    ),
                ]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-01-01T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }
        store.setKindFilter(.solarEclipse)
        XCTAssertEqual(
            store.selectedForecastID,
            "tokyo-2026"
        )

        store.selectNextYear(location: tokyo)
        try await waitUntil {
            store.phase == .loaded
        }

        XCTAssertEqual(store.kindFilter, .solarEclipse)
        XCTAssertTrue(store.displayedForecasts.isEmpty)
        XCTAssertNil(store.selectedForecastID)

        store.reload(location: london)
        try await waitUntil {
            store.phase == .loaded
        }

        XCTAssertEqual(store.kindFilter, .solarEclipse)
        XCTAssertEqual(
            store.displayedForecasts.map(\.id),
            ["london-solar"]
        )
        XCTAssertEqual(
            store.selectedForecastID,
            "london-solar"
        )
    }

    @MainActor
    func testYearChangeCancelsOldRequestAndDiscardsStaleResult()
        async throws
    {
        let store = EventForecastStore(
            initialYear: 2025,
            dependencies: EventForecastDependencies {
                year, _ in
                if year == 2025 {
                    try await Task.sleep(
                        for: .milliseconds(150)
                    )
                }
                return [
                    self.makeForecast(
                        id: "year-\(year)",
                        date: self.date(
                            "\(year)-03-03T11:34:00Z"
                        ),
                        visibility: .fullyVisible
                    ),
                ]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2025-01-01T00:00:00Z")
        )
        store.selectNextYear(location: tokyo)

        try await waitUntil {
            store.phase == .loaded
        }
        try await Task.sleep(for: .milliseconds(180))

        XCTAssertEqual(store.selectedYear, 2026)
        XCTAssertEqual(
            store.forecasts.map(\.id),
            ["year-2026"]
        )
    }

    @MainActor
    func testRevisitingRecentYearUsesBoundedForecastCache()
        async throws
    {
        let counter = EventForecastLoadCounter()
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                year, _ in
                await counter.record(year: year)
                return [
                    self.makeForecast(
                        id: "cached-\(year)",
                        date: self.date(
                            "\(year)-03-03T11:34:00Z"
                        ),
                        visibility: .fullyVisible
                    ),
                ]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-01-01T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }

        store.selectNextYear(location: tokyo)
        try await waitUntil {
            store.phase == .loaded
                && store.selectedYear == 2027
        }

        store.selectPreviousYear(location: tokyo)

        XCTAssertEqual(
            store.phase,
            .loaded,
            "キャッシュ済みの年はloading状態を挟まず復元する"
        )
        XCTAssertEqual(
            store.forecasts.map(\.id),
            ["cached-2026"]
        )
        let loads2026 = await counter.count(for: 2026)
        let loads2027 = await counter.count(for: 2027)
        XCTAssertEqual(loads2026, 1)
        XCTAssertEqual(loads2027, 1)
    }

    @MainActor
    func testForecastCacheSeparatesReportedObserverAccuracy()
        async throws
    {
        let accurate = ObservingLocation(
            id: "current",
            name: "現在地",
            latitude: 35.6812,
            longitude: 139.7671,
            timeZoneIdentifier: "Asia/Tokyo",
            horizontalAccuracyMeters: 20
        )
        let coarse = ObservingLocation(
            id: "current",
            name: "現在地",
            latitude: 35.6812,
            longitude: 139.7671,
            timeZoneIdentifier: "Asia/Tokyo",
            horizontalAccuracyMeters: 2_000
        )
        let counter = EventForecastLoadCounter()
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                year, _ in
                await counter.record(year: year)
                return [
                    self.makeForecast(
                        id: "accuracy-\(year)",
                        date: self.date(
                            "\(year)-08-12T18:13:00Z"
                        ),
                        visibility: .fullyVisible
                    ),
                ]
            }
        )

        store.activate(
            location: accurate,
            observationDate:
                date("2026-01-01T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }

        store.reload(location: coarse)
        try await waitUntil {
            store.phase == .loaded
        }
        let loadsAfterAccuracyChange =
            await counter.count(for: 2026)
        XCTAssertEqual(
            loadsAfterAccuracyChange,
            2,
            "境界幅が変わるため測位精度だけの変更でも再計算する"
        )

        store.reload(location: accurate)
        XCTAssertEqual(
            store.phase,
            .loaded,
            "元の精度へ戻る時は対応する結果を即時復元する"
        )
        let loadsAfterCacheReturn =
            await counter.count(for: 2026)
        XCTAssertEqual(
            loadsAfterCacheReturn,
            2
        )
    }

    @MainActor
    func testForecastCacheEvictsLeastRecentlyUsedYear()
        async throws
    {
        let counter = EventForecastLoadCounter()
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                year, _ in
                await counter.record(year: year)
                return [
                    self.makeForecast(
                        id: "lru-\(year)",
                        date: self.date(
                            "\(year)-03-03T11:34:00Z"
                        ),
                        visibility: .fullyVisible
                    ),
                ]
            }
        )
        store.activate(
            location: tokyo,
            observationDate:
                date("2026-01-01T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }

        for year in 2027...2029 {
            store.selectYear(year, location: tokyo)
            try await waitUntil {
                store.phase == .loaded
                    && store.selectedYear == year
            }
        }

        store.selectYear(2026, location: tokyo)
        try await waitUntil {
            store.phase == .loaded
                && store.selectedYear == 2026
        }

        let loads2026 = await counter.count(for: 2026)
        XCTAssertEqual(
            loads2026,
            2,
            "4つ目の結果を保存した後は最も古い年を再計算する"
        )
    }

    @MainActor
    func testUnexpectedCancellationFailureCanBeRetried()
        async throws
    {
        let counter = EventForecastLoadCounter()
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                year, _ in
                let attempt =
                    await counter.record(year: year)
                if attempt == 1 {
                    throw CancellationError()
                }
                return [
                    self.makeForecast(
                        id: "retry-\(year)",
                        date: self.date(
                            "\(year)-03-03T11:34:00Z"
                        ),
                        visibility: .fullyVisible
                    ),
                ]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-01-01T00:00:00Z")
        )
        try await waitUntil {
            if case .failed = store.phase {
                return true
            }
            return false
        }
        XCTAssertEqual(store.forecasts, [])

        store.retry()
        try await waitUntil {
            store.phase == .loaded
        }

        XCTAssertEqual(
            store.forecasts.map(\.id),
            ["retry-2026"]
        )
        let attempts = await counter.count(for: 2026)
        XCTAssertEqual(attempts, 2)
    }

    @MainActor
    func testObservationYearUsesObservingLocationTimeZoneAtYearBoundary()
    {
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in []
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-12-31T15:30:00Z")
        )

        XCTAssertEqual(
            store.selectedYear,
            2027,
            "東京の2027年1月1日00:30は2027年として扱う"
        )

        store.selectObservationYear(
            observationDate:
                date("2026-12-31T14:30:00Z"),
            location: tokyo
        )

        XCTAssertEqual(
            store.selectedYear,
            2026,
            "東京の2026年12月31日23:30は2026年として扱う"
        )
        store.deactivate()
    }

    @MainActor
    func testLocationChangeCancelsOldRequestAndUsesNewLocation()
        async throws
    {
        let london = ObservingLocation(
            id: "london",
            name: "ロンドン",
            latitude: 51.5074,
            longitude: -0.1278,
            timeZoneIdentifier: "Europe/London"
        )
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, location in
                if location.id == "tokyo" {
                    try await Task.sleep(
                        for: .milliseconds(150)
                    )
                }
                return [
                    self.makeForecast(
                        id: location.id,
                        date: self.date(
                            "2026-08-12T18:13:00Z"
                        ),
                        visibility: .fullyVisible,
                        location: location
                    ),
                ]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-01-01T00:00:00Z")
        )
        store.reload(location: london)

        try await waitUntil {
            store.phase == .loaded
        }
        try await Task.sleep(for: .milliseconds(180))

        XCTAssertEqual(
            store.forecasts.map(\.id),
            ["london"]
        )
        XCTAssertEqual(
            store.selectedForecast?.observer
                .location.id,
            "london"
        )
    }

    @MainActor
    func testExplicitSkyActionPausesAndRestoresOriginalDate()
        throws
    {
        let original =
            date("2026-07-30T00:00:00Z")
        let firstEvent =
            date("2026-08-12T18:13:00Z")
        let secondContact =
            date("2026-08-12T19:06:00Z")
        let skyStore = SkyStore(now: original)
        let eventStore = EventForecastStore(
            initialYear: 2026,
            dependencies:
                EventForecastDependencies {
                    _, _ in []
                }
        )

        skyStore.togglePlayback()
        XCTAssertTrue(skyStore.isPlaybackPlaying)

        eventStore.showOnSky(
            at: firstEvent,
            skyStore: skyStore
        )
        XCTAssertFalse(skyStore.isPlaybackPlaying)
        XCTAssertEqual(
            skyStore.observationDate,
            firstEvent
        )
        XCTAssertEqual(
            eventStore.originalObservationDate,
            original
        )

        eventStore.showOnSky(
            at: secondContact,
            skyStore: skyStore
        )
        XCTAssertEqual(
            eventStore.originalObservationDate,
            original
        )

        eventStore.restoreSkyDate(
            skyStore: skyStore
        )
        XCTAssertEqual(
            skyStore.observationDate,
            original
        )
        XCTAssertNil(
            eventStore.originalObservationDate
        )
    }

    @MainActor
    func testBoundaryUncertainOccultationKeepsHorizonVisibilitySeparate()
        async throws
    {
        let boundary = makeOccultationForecast(
            id: "boundary",
            visibility: .partlyVisible,
            grazing: true
        )
        let hidden = makeOccultationForecast(
            id: "hidden-occultation",
            visibility: .belowHorizon,
            grazing: false
        )
        let store = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in
                [hidden, boundary]
            }
        )

        store.activate(
            location: tokyo,
            observationDate:
                date("2026-01-01T00:00:00Z")
        )
        try await waitUntil {
            store.phase == .loaded
        }

        XCTAssertEqual(
            Set(store.forecasts.map(\.id)),
            Set(["hidden-occultation", "boundary"])
        )
        XCTAssertEqual(
            store.displayedForecasts.map(\.id),
            ["boundary"]
        )
        XCTAssertEqual(
            store.hiddenForecastCount,
            1
        )
        XCTAssertEqual(
            store.selectedForecast?.visibility,
            .partlyVisible
        )
        XCTAssertEqual(
            store.selectedForecast?.boundaryUncertain,
            true
        )
    }

    func testBoundaryUncertainSolarEclipseKeepsHorizonVisibilitySeparate() {
        let visible = makeForecast(
            id: "solar-boundary-visible",
            date: date("2050-05-20T12:00:00Z"),
            visibility: .partlyVisible,
            kind: .solarEclipse,
            uncertainBoundary: .external
        )
        let hidden = makeForecast(
            id: "solar-boundary-hidden",
            date: date("2050-05-20T12:00:00Z"),
            visibility: .belowHorizon,
            kind: .solarEclipse,
            uncertainBoundary: .external
        )

        XCTAssertEqual(
            visible.visibility,
            .partlyVisible
        )
        XCTAssertTrue(visible.boundaryUncertain)
        XCTAssertTrue(visible.isLocallyVisible)
        XCTAssertEqual(
            hidden.visibility,
            .belowHorizon
        )
        XCTAssertTrue(hidden.boundaryUncertain)
        XCTAssertFalse(hidden.isLocallyVisible)
    }

    func testBoundaryReasonsDriveTruthfulCandidateTitles() {
        let instant =
            date("2050-05-20T12:00:00Z")
        let solarOccurrence = makeForecast(
            id: "solar-occurrence-boundary",
            date: instant,
            visibility: .partlyVisible,
            kind: .solarEclipse,
            uncertainBoundary: .external
        )
        let solarClassification = makeForecast(
            id: "solar-classification-boundary",
            date: instant,
            visibility: .partlyVisible,
            kind: .solarEclipse,
            uncertainBoundary: .partialCentral
        )
        let occultationOccurrence =
            makeOccultationForecast(
                id: "occultation-boundary",
                visibility: .partlyVisible,
                grazing: true
            )

        XCTAssertEqual(
            solarOccurrence
                .boundaryUncertaintyReason,
            .solarOccurrence
        )
        XCTAssertTrue(
            solarOccurrence
                .boundaryUncertaintyReason?
                .occurrenceIsUncertain
                ?? false
        )
        XCTAssertEqual(
            solarOccurrence.title,
            "日食候補（発生未確定）"
        )

        XCTAssertEqual(
            solarClassification
                .boundaryUncertaintyReason,
            .solarCentralClassification
        )
        XCTAssertFalse(
            solarClassification
                .boundaryUncertaintyReason?
                .occurrenceIsUncertain
                ?? true
        )
        XCTAssertEqual(
            solarClassification.title,
            "部分日食"
        )

        XCTAssertEqual(
            occultationOccurrence
                .boundaryUncertaintyReason,
            .occultationOccurrence
        )
        XCTAssertEqual(
            occultationOccurrence.title,
            "月によるアルデバランの掩蔽候補（発生未確定）"
        )
    }

    @MainActor
    func testLivePipelineFindsKnownLondon2026SolarEclipse()
        async throws
    {
        let london = ObservingLocation(
            id: "current",
            name: "ロンドン",
            latitude: 51.5074,
            longitude: -0.1278,
            timeZoneIdentifier: "Europe/London",
            heightMeters: 35,
            horizontalAccuracyMeters: 25
        )
        let store = EventForecastStore(
            initialYear: 2026
        )

        store.activate(
            location: london,
            observationDate:
                date("2026-01-01T00:00:00Z")
        )
        try await waitUntil(
            attempts: 2_000
        ) {
            store.phase != .loading
                && store.phase != .idle
        }

        guard case .loaded = store.phase else {
            return XCTFail(
                "Expected loaded forecasts, got \(store.phase)"
            )
        }
        let item = try XCTUnwrap(
            store.forecasts.first {
                $0.candidate.id == "se-20260812"
            }
        )
        XCTAssertNotEqual(
            item.visibility,
            .belowHorizon
        )
        XCTAssertEqual(
            item.provenance.eopDUT1Quality,
            .predicted
        )
        XCTAssertEqual(
            item.provenance
                .eopPolarMotionQuality,
            .predicted
        )
        XCTAssertEqual(
            item.provenance.eopSourceSHA256?
                .count,
            64
        )
        XCTAssertNotNil(
            item.provenance.eopRetrievedAt
        )
        XCTAssertEqual(
            item.observer.heightMeters,
            35
        )
        XCTAssertEqual(
            item.observer
                .horizontalAccuracyMeters,
            25
        )
        XCTAssertEqual(
            item.observer.locationSource,
            .deviceGeolocation
        )
    }

    @MainActor
    func testLivePipelinePartitionsYearsByObserverLocalDate()
        async throws
    {
        let store = EventForecastStore(
            initialYear: 2028
        )
        store.activate(
            location: tokyo,
            observationDate:
                date("2028-06-01T00:00:00Z")
        )
        try await waitUntil(
            attempts: 6_000
        ) {
            store.phase != .loading
                && store.phase != .idle
        }

        guard case .loaded = store.phase else {
            return XCTFail(
                "Expected 2028 forecasts, got \(store.phase)"
            )
        }
        var tokyoCalendar =
            Calendar(identifier: .gregorian)
        tokyoCalendar.timeZone =
            TimeZone(identifier: "Asia/Tokyo")!
        XCTAssertTrue(
            store.forecasts.allSatisfy {
                tokyoCalendar.component(
                    .year,
                    from: $0.maximumDate
                ) == 2028
            }
        )
        XCTAssertFalse(
            store.forecasts.contains {
                $0.id == "le-20281231"
            },
            "UTC 2028-12-31の月食は東京では2029年"
        )

        store.selectNextYear(location: tokyo)
        try await waitUntil(
            attempts: 6_000
        ) {
            store.phase != .loading
        }

        guard case .loaded = store.phase else {
            return XCTFail(
                "Expected 2029 forecasts, got \(store.phase)"
            )
        }
        let carriedEvent = try XCTUnwrap(
            store.forecasts.first {
                $0.id == "le-20281231"
            }
        )
        XCTAssertEqual(
            tokyoCalendar.component(
                .year,
                from: carriedEvent.maximumDate
            ),
            2029
        )
        XCTAssertTrue(
            store.forecasts.allSatisfy {
                tokyoCalendar.component(
                    .year,
                    from: $0.maximumDate
                ) == 2029
            }
        )
    }

    @MainActor
    func testLivePipelinePresentsKnownNewYork2017Occultation()
        async throws
    {
        let newYork = ObservingLocation(
            id: "new-york",
            name: "New York",
            latitude: 40.7128,
            longitude: -74.0060,
            timeZoneIdentifier: "America/New_York"
        )
        let store = EventForecastStore(
            initialYear: 2017
        )

        store.activate(
            location: newYork,
            observationDate:
                date("2017-01-01T12:00:00Z")
        )
        try await waitUntil(
            attempts: 6_000
        ) {
            store.phase != .loading
                && store.phase != .idle
        }

        guard case .loaded = store.phase else {
            return XCTFail(
                "Expected loaded forecasts, got \(store.phase)"
            )
        }
        let item = try XCTUnwrap(
            store.forecasts.first {
                $0.id
                    == "lo-20170305-hr1457"
            }
        )
        guard case let .occultation(forecast) = item
        else {
            return XCTFail(
                "Expected occultation presentation item"
            )
        }

        XCTAssertEqual(
            forecast.target.starHR,
            1457
        )
        XCTAssertEqual(
            forecast.target.label,
            "アルデバラン"
        )
        XCTAssertEqual(
            forecast.uncertainty.tier,
            .reference
        )
        XCTAssertNotEqual(
            forecast.visibility,
            .belowHorizon
        )
        XCTAssertEqual(item.systemImage, "moon.circle")
        XCTAssertEqual(
            EventForecastFormatting
                .occultationPhase(
                    forecast.contacts[0].phase
                ),
            forecast.grazing ? "最接近" : "潜入"
        )
    }

    @MainActor
    private func waitUntil(
        attempts: Int = 100,
        _ predicate: @escaping @MainActor () -> Bool
    ) async throws {
        for _ in 0..<attempts {
            if predicate() {
                return
            }
            try await Task.sleep(
                for: .milliseconds(10)
            )
        }
        XCTFail("Timed out waiting for store state")
    }

    private var tokyo: ObservingLocation {
        ObservingLocation(
            id: "tokyo",
            name: "東京",
            latitude: 35.6812,
            longitude: 139.7671,
            timeZoneIdentifier: "Asia/Tokyo"
        )
    }

    private func makeForecast(
        id: String,
        date: Date,
        visibility: EclipseVisibilityV1,
        location: ObservingLocation? = nil,
        kind: EclipseCandidateKindV1 = .lunarEclipse,
        uncertainBoundary:
            SolarEclipseUncertainBoundaryV1? = nil
    ) -> EventForecastItem {
        let location = location ?? tokyo
        let candidate = EclipseCandidateV1(
            id: id,
            kind: kind,
            classificationHint: "total",
            maximumJulianDateTDB: 2_461_000,
            searchStartJulianDateTDB: 2_460_999,
            searchEndJulianDateTDB: 2_461_001,
            canonicalEpochUTC: date,
            dataVersion: "test",
            targetStarHR: nil,
            targetLabel: nil
        )
        let horizontal = HorizontalCoordinates(
            altitude: 0.5,
            azimuth: 1,
            azimuthIsDefined: true
        )
        let body = EclipseBodyPositionV1(
            horizontal: horizontal,
            angularRadiusRadians: 0.004,
            distanceKilometers: 384_400
        )
        let contact = EclipseContactV1(
            phase: .maximum,
            instantUTC: date,
            sun: nil,
            moon: body,
            aboveHorizon:
                visibility != .belowHorizon
        )
        return .eclipse(
            LocalEclipseCircumstancesV1(
                candidate: candidate,
                title:
                    kind == .solarEclipse
                    ? "部分日食"
                    : "皆既月食",
                classification: .total,
                observer: EclipseObserverContextV1(
                    location: location,
                    heightMeters: 0,
                    horizontalAccuracyMeters: nil,
                    locationSource: .bundledCity
                ),
                visibility: visibility,
                contacts: [contact],
                maximum: contact,
                magnitude: 1.1,
                obscuration: nil,
                uncertainty:
                    EclipseForecastUncertaintyV1(
                        tier: .uncertain,
                        timingSeconds: 1,
                        pathKilometers: nil,
                        observerLocationMeters: nil,
                        dominantContributors: []
                    ),
                provenance: EclipseProvenanceV1(
                    algorithmVersion: "test",
                    ephemerisID: "test",
                    ephemerisSourceSHA256: "test",
                    eopID: "test",
                    deltaTModel: "test",
                    lunarRadiusModel:
                        "mean-spherical-limb",
                    limbProfileID: nil
                ),
                warnings: [],
                uncertainBoundary: uncertainBoundary
            )
        )
    }

    private func makeOccultationForecast(
        id: String,
        visibility: LunarOccultationVisibilityV1,
        grazing: Bool
    ) -> EventForecastItem {
        let instant =
            date("2026-03-05T04:20:00Z")
        let candidate = EclipseCandidateV1(
            id: id,
            kind: .lunarOccultation,
            classificationHint: "occultation",
            maximumJulianDateTDB: 2_461_000,
            searchStartJulianDateTDB: 2_460_999,
            searchEndJulianDateTDB: 2_461_001,
            canonicalEpochUTC: instant,
            dataVersion: "test",
            targetStarHR: 1457,
            targetLabel: "アルデバラン"
        )
        let horizontal = HorizontalCoordinates(
            altitude:
                visibility == .belowHorizon
                ? -0.5
                : 0.5,
            azimuth: 1,
            azimuthIsDefined: true
        )
        let contact = LunarOccultationContactV1(
            phase: .maximum,
            instantUTC: instant,
            moon: EclipseBodyPositionV1(
                horizontal: horizontal,
                angularRadiusRadians: 0.004,
                distanceKilometers: 384_400
            ),
            targetHorizontal: horizontal,
            aboveHorizon:
                visibility != .belowHorizon,
            positionAngleRadians: 1.2
        )
        return .occultation(
            LocalLunarOccultationCircumstancesV1(
                candidate: candidate,
                title:
                    "月によるアルデバランの掩蔽",
                target: LunarOccultationTargetV1(
                    starHR: 1457,
                    label: "アルデバラン",
                    visualMagnitude: 0.85
                ),
                observer: EclipseObserverContextV1(
                    location: tokyo,
                    heightMeters: 0,
                    horizontalAccuracyMeters: nil,
                    locationSource: .bundledCity
                ),
                visibility: visibility,
                contacts: [contact],
                maximum: contact,
                grazing: grazing,
                minimumClearanceRadians:
                    grazing ? 0 : -0.001,
                uncertainty:
                    EclipseForecastUncertaintyV1(
                        tier: .reference,
                        timingSeconds: nil,
                        pathKilometers: nil,
                        observerLocationMeters: nil,
                        dominantContributors: []
                    ),
                provenance: EclipseProvenanceV1(
                    algorithmVersion: "test",
                    ephemerisID: "test",
                    ephemerisSourceSHA256: "test",
                    eopID: "test",
                    deltaTModel: "test",
                    lunarRadiusModel:
                        "mean-spherical-limb",
                    limbProfileID: nil
                ),
                precisionWarnings: [],
                warnings: []
            )
        )
    }

    private func date(_ value: String) -> Date {
        ISO8601DateFormatter().date(from: value)!
    }
}

private actor EventForecastLoadCounter {
    private var counts: [Int: Int] = [:]

    @discardableResult
    func record(year: Int) -> Int {
        counts[year, default: 0] += 1
        return counts[year, default: 0]
    }

    func count(for year: Int) -> Int {
        counts[year, default: 0]
    }
}
