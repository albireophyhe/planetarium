import Foundation
import SwiftUI
import XCTest

@testable import Planetarium
@testable import PlanetariumCore

final class SkyStoreEarthOrientationIntegrationTests:
    XCTestCase
{
    @MainActor
    func testInitializationClampsUnsupportedNowAndSurfacesStatus()
        throws
    {
        let cases: [(now: Date, expected: Date)] = [
            (
                ObservationConstraints.minimumDate
                    .addingTimeInterval(-1),
                ObservationConstraints.minimumDate
            ),
            (
                ObservationConstraints.maximumDate
                    .addingTimeInterval(1),
                ObservationConstraints.maximumDate
            ),
            (
                Date(timeIntervalSince1970: .nan),
                ObservationConstraints.minimumDate
            ),
            (
                Date(timeIntervalSince1970: .infinity),
                ObservationConstraints.maximumDate
            ),
            (
                Date(timeIntervalSince1970: -.infinity),
                ObservationConstraints.minimumDate
            ),
        ]
        let emptyCatalog = SkyCatalog(
            stars: [],
            names: [],
            constellations: [],
            cities: []
        )

        for testCase in cases {
            let provider = try RecordingEOPProvider()
            let store = SkyStore(
                catalogLoader: {
                    emptyCatalog
                },
                earthOrientationServiceLoader: {
                    provider
                },
                now: testCase.now
            )

            XCTAssertEqual(
                store.observationDate,
                testCase.expected
            )
            XCTAssertEqual(
                store.statusMessage,
                "対応期間は1900年から2100年です。最も近い日時へ調整しました。"
            )
            XCTAssertEqual(
                provider.requestedDates,
                [testCase.expected]
            )

            let estimate = try XCTUnwrap(
                store.currentEarthOrientationEstimate
            )
            let expectedContext =
                try Astronomy.createApparentPositionContextV2(
                    at: testCase.expected,
                    location: store.location,
                    options: ApparentPositionOptionsV2(
                        earthOrientation:
                            estimate.earthOrientationOptionsV2,
                        refraction: .disabled
                    )
                )
            XCTAssertEqual(
                store.sunState,
                try Sun.state(context: expectedContext)
            )
        }
    }

    @MainActor
    func testInitializationKeepsSupportedNowWithoutBoundaryStatus()
        throws
    {
        let supportedDates = [
            ObservationConstraints.minimumDate,
            Date(timeIntervalSince1970: 1_774_953_600),
            ObservationConstraints.maximumDate,
        ]

        for now in supportedDates {
            let store = try makeEmptyStore(now: now)

            XCTAssertEqual(store.observationDate, now)
            XCTAssertNil(store.statusMessage)
        }
    }

    @MainActor
    func testPlaybackStopsAtExactFractionalMaximum()
        throws
    {
        let store = try makeEmptyStore(
            now: ObservationConstraints.maximumDate
                .addingTimeInterval(-0.05)
        )
        store.setPlaybackSpeed(.realTime)

        store.togglePlayback()
        XCTAssertTrue(store.isPlaybackPlaying)
        store.advancePlayback(realTimeDelta: 0.1)

        XCTAssertEqual(
            store.observationDate,
            ObservationConstraints.maximumDate
        )
        XCTAssertFalse(store.isPlaybackPlaying)
        XCTAssertEqual(
            store.statusMessage,
            "対応期間の終了（2100年）で時間再生を停止しました。"
        )
    }

    @MainActor
    func testSuccessfulTimeTransitionsClearOnlyBoundaryStatus()
        throws
    {
        let current = Date(timeIntervalSince1970: 1_774_953_600)
        let store = try makeEmptyStore(
            now: ObservationConstraints.maximumDate
        )

        store.addHours(1)
        XCTAssertNotNil(store.statusMessage)
        store.addHours(-1)
        XCTAssertNil(store.statusMessage)

        store.addHours(1)
        store.addHours(1)
        XCTAssertNotNil(store.statusMessage)

        store.useCurrentTime(
            ObservationConstraints.maximumDate
                .addingTimeInterval(1)
        )
        XCTAssertEqual(
            store.observationDate,
            ObservationConstraints.maximumDate
        )
        XCTAssertTrue(
            store.statusMessage?.contains("調整しました") == true
        )

        store.useCurrentTime(current)
        XCTAssertEqual(store.observationDate, current)
        XCTAssertNil(store.statusMessage)

        store.statusMessage = "地点を変更しました。"
        store.addHours(-1)
        XCTAssertEqual(
            store.statusMessage,
            "地点を変更しました。"
        )
    }

    @MainActor
    func testStartingInwardPlaybackClearsOutboundBoundaryStatus()
        throws
    {
        let store = try makeEmptyStore(
            now: ObservationConstraints.maximumDate
        )

        store.togglePlayback()
        XCTAssertFalse(store.isPlaybackPlaying)
        XCTAssertNotNil(store.statusMessage)

        store.setPlaybackDirection(.backward)
        store.togglePlayback()

        XCTAssertTrue(store.isPlaybackPlaying)
        XCTAssertNil(store.statusMessage)
        store.pausePlayback()
    }

    @MainActor
    func testInactiveAndBackgroundStopPlaybackWithoutAutomaticResume()
        throws
    {
        let store = try makeEmptyStore(
            now: Date(timeIntervalSince1970: 1_774_953_600)
        )

        for phase in [ScenePhase.inactive, .background] {
            store.togglePlayback()
            XCTAssertTrue(store.isPlaybackPlaying)
            XCTAssertTrue(store.isPlaybackDriverRunning)

            store.handleScenePhase(phase)

            XCTAssertFalse(store.isPlaybackPlaying)
            XCTAssertFalse(store.isPlaybackDriverRunning)

            store.handleScenePhase(.active)

            XCTAssertFalse(store.isPlaybackPlaying)
            XCTAssertFalse(store.isPlaybackDriverRunning)
        }
    }

    @MainActor
    func testStoreLooksUpCurrentAndEveryTrajectoryTimestamp()
        throws
    {
        let provider = try RecordingEOPProvider()
        let center = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-29T12:00:00Z"
            )
        )
        let store = SkyStore(
            earthOrientationServiceLoader: {
                provider
            },
            now: center
        )

        // Normalize any saved user preference before measuring calls.
        store.showSelectedStarTrajectory = false
        provider.reset()
        let nextDate = center.addingTimeInterval(600)
        store.observationDate = nextDate
        XCTAssertEqual(provider.requestedDates, [nextDate])
        XCTAssertNotNil(store.currentEarthOrientationEstimate)

        provider.reset()
        XCTAssertNotNil(store.selectedStarHR)
        store.showSelectedStarTrajectory = true
        let expectedDates = stride(
            from: -SelectedStarTrajectorySampler.pastMinutes,
            through:
                SelectedStarTrajectorySampler.futureMinutes,
            by: SelectedStarTrajectorySampler.stepMinutes
        ).map {
            nextDate.addingTimeInterval(
                Double($0 * 60)
            )
        }
        XCTAssertEqual(
            provider.requestedDates,
            expectedDates
        )
        XCTAssertEqual(
            store.selectedStarTrajectory.map(\.date),
            expectedDates
        )
    }

    @MainActor
    func testManifestLoadFailureCanRetryFromStore()
        throws
    {
        let provider = try RecordingEOPProvider()
        let loader = RetryLoader(provider: provider)
        let date = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-29T12:00:00Z"
            )
        )
        let store = SkyStore(
            earthOrientationServiceLoader: {
                try loader.load()
            },
            now: date
        )

        XCTAssertEqual(loader.attemptCount, 1)
        XCTAssertNotNil(
            store.iersEarthOrientationLoadFailure
        )
        XCTAssertTrue(store.canRetryEarthOrientationData)
        XCTAssertNil(store.currentEarthOrientationEstimate)
        XCTAssertFalse(store.renderedStars.isEmpty)
        XCTAssertEqual(
            store.currentSolarLightDeflectionMode,
            .truncatedVSOP2000HeliocentricEarth
        )

        store.retryEarthOrientationData()

        XCTAssertEqual(loader.attemptCount, 2)
        XCTAssertNil(
            store.iersEarthOrientationLoadFailure
        )
        XCTAssertNil(
            store.currentEarthOrientationLookupFailure
        )
        XCTAssertNil(
            store.currentEarthOrientationApplicationFailure
        )
        XCTAssertNotNil(store.currentEarthOrientationEstimate)
        XCTAssertFalse(store.canRetryEarthOrientationData)
        XCTAssertFalse(store.renderedStars.isEmpty)
        XCTAssertEqual(
            store.currentSolarLightDeflectionMode,
            .truncatedVSOP2000HeliocentricEarth
        )
    }

    @MainActor
    func testInvalidEOPFailsToExplicitZeroV2NotLegacy()
        throws
    {
        let provider = try RecordingEOPProvider(
            polarMotionArcseconds: 11
        )
        let date = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-29T12:00:00Z"
            )
        )
        let store = SkyStore(
            earthOrientationServiceLoader: {
                provider
            },
            now: date
        )
        store.useStandardAtmosphericRefraction = false

        XCTAssertNil(store.currentEarthOrientationEstimate)
        XCTAssertNotNil(
            store.currentEarthOrientationApplicationFailure
        )
        XCTAssertTrue(
            store.dut1StatusSummary.contains("適用失敗")
        )
        XCTAssertFalse(store.renderedStars.isEmpty)
        XCTAssertEqual(
            store.currentSolarLightDeflectionMode,
            .truncatedVSOP2000HeliocentricEarth
        )

        let expected = try Astronomy.renderV2(
            catalog: store.catalog,
            at: date,
            location: store.location,
            options: ApparentPositionOptionsV2(
                earthOrientation:
                    EarthOrientationOptionsV2(
                        polarMotion: .assumedZero
                )
            )
        )
        let actualFirst = try XCTUnwrap(
            store.renderedStars.first
        )
        let expectedFirst = try XCTUnwrap(expected.first)
        XCTAssertEqual(
            actualFirst.horizontal.altitude,
            expectedFirst.horizontal.altitude,
            accuracy: 1e-15
        )
        XCTAssertEqual(
            actualFirst.horizontal.azimuth,
            expectedFirst.horizontal.azimuth,
            accuracy: 1e-15
        )
        let fallbackContext =
            try Astronomy.createApparentPositionContextV2(
                at: date,
                location: store.location,
                options: ApparentPositionOptionsV2(
                    earthOrientation:
                        EarthOrientationOptionsV2(
                            polarMotion: .assumedZero
                        )
                )
            )
        XCTAssertEqual(
            store.sunState,
            try Sun.state(context: fallbackContext)
        )
    }

    @MainActor
    func testSunUsesSameEOPFrameAndIgnoresOpticalRefraction()
        throws
    {
        let provider = try RecordingEOPProvider()
        let date = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-29T00:00:00Z"
            )
        )
        let store = SkyStore(
            earthOrientationServiceLoader: {
                provider
            },
            now: date
        )
        store.useStandardAtmosphericRefraction = false
        let estimate = try XCTUnwrap(
            store.currentEarthOrientationEstimate
        )
        let expectedContext =
            try Astronomy.createApparentPositionContextV2(
                at: date,
                location: store.location,
                options: ApparentPositionOptionsV2(
                    earthOrientation:
                        estimate.earthOrientationOptionsV2,
                    refraction: .disabled
                )
            )
        let expected = try Sun.state(
            context: expectedContext
        )

        XCTAssertEqual(store.sunState, expected)
        store.useStandardAtmosphericRefraction = true
        XCTAssertEqual(store.sunState, expected)
    }

    @MainActor
    private func makeEmptyStore(now: Date) throws -> SkyStore {
        let provider = try RecordingEOPProvider()
        return SkyStore(
            catalogLoader: {
                SkyCatalog(
                    stars: [],
                    names: [],
                    constellations: [],
                    cities: []
                )
            },
            earthOrientationServiceLoader: {
                provider
            },
            now: now
        )
    }
}

private final class RecordingEOPProvider:
    IERSEarthOrientationProviding
{
    let coverage: IERSEarthOrientationCoverageV1
    let source: IERSEarthOrientationSourceSummaryV1
    private let polarMotionArcseconds: Double
    private(set) var requestedDates: [Date] = []

    init(
        polarMotionArcseconds: Double = 0.2
    ) throws {
        let bundled =
            try IERSEarthOrientationServiceV1.loadBundled()
        coverage = bundled.coverage
        source = bundled.source
        self.polarMotionArcseconds =
            polarMotionArcseconds
    }

    func lookup(
        at date: Date
    ) throws -> IERSEarthOrientationEstimateV1? {
        requestedDates.append(date)
        let radians =
            polarMotionArcseconds
            * Double.pi / (180 * 3_600)
        return IERSEarthOrientationEstimateV1(
            dut1: IERSDUT1EstimateV1(
                dut1Seconds: 0.01,
                source: .observed,
                uncertaintySeconds: 0.000_1
            ),
            polarMotion: IERSPolarMotionEstimateV1(
                xpRadians: radians,
                ypRadians: -radians / 2,
                xpReportedErrorRadians: 1e-9,
                ypReportedErrorRadians: 1e-9,
                source: .observed,
                usesPrediction: false
            )
        )
    }

    func reset() {
        requestedDates = []
    }
}

private final class RetryLoader {
    private let provider: RecordingEOPProvider
    private(set) var attemptCount = 0

    init(provider: RecordingEOPProvider) {
        self.provider = provider
    }

    func load() throws -> any IERSEarthOrientationProviding {
        attemptCount += 1
        if attemptCount == 1 {
            throw IERSEarthOrientationError
                .resourceUnavailable("synthetic manifest read")
        }
        return provider
    }
}
