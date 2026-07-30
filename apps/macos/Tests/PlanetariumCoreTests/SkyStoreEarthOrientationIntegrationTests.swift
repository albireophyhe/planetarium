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
            expectedDates.filter { $0 != nextDate }
        )
        XCTAssertEqual(
            store.selectedStarTrajectory.map(\.date),
            expectedDates
        )
        XCTAssertEqual(
            store
                .selectedStarTrajectoryEarthOrientationProvenance,
            SelectedStarTrajectoryEarthOrientationProvenance(
                auxiliaryFallbackSampleCount: 0,
                auxiliarySampleCount: 12,
                centerStatus: .ready
            )
        )
        XCTAssertNil(
            store
                .selectedStarTrajectoryEarthOrientationProvenance?
                .warning
        )
        XCTAssertFalse(
            SelectedStarTrajectoryLegendView(
                store: store
            ).rangeText.contains("EOP 0近似")
        )
    }

    @MainActor
    func testTrajectoryCenterReusesSettledZeroEOPFallback()
        throws
    {
        let formatter = ISO8601DateFormatter()
        let center = try XCTUnwrap(
            formatter.date(
                from: "2026-07-30T00:00:00Z"
            )
        )
        let provider = try RecordingEOPProvider(
            failFirstLookupAt: center
        )
        let store = SkyStore(
            earthOrientationServiceLoader: {
                provider
            },
            now: center.addingTimeInterval(-86_400)
        )

        store.showSelectedStarTrajectory = false
        store.useStandardAtmosphericRefraction = false
        store.selectedStarHR = try XCTUnwrap(
            store.catalog.stars.first?.hr
        )
        provider.reset()

        store.observationDate = center

        XCTAssertEqual(provider.requestedDates, [center])
        XCTAssertNil(store.currentEarthOrientationEstimate)
        XCTAssertNotNil(
            store.currentEarthOrientationLookupFailure
        )
        let selectedHR = try XCTUnwrap(store.selectedStarHR)
        let renderedCenter = try XCTUnwrap(
            store.renderedStarsByHR[selectedHR]
        )

        provider.reset()
        store.showSelectedStarTrajectory = true

        XCTAssertFalse(
            provider.requestedDates.contains(center)
        )
        let trajectoryCenter = try XCTUnwrap(
            store.selectedStarTrajectory.first {
                $0.offsetMinutes == 0
            }
        )
        XCTAssertEqual(
            trajectoryCenter.horizontal,
            renderedCenter.observedHorizontal
        )
        XCTAssertEqual(
            trajectoryCenter.projection,
            renderedCenter.projection
        )
        let provenance = try XCTUnwrap(
            store
                .selectedStarTrajectoryEarthOrientationProvenance
        )
        XCTAssertEqual(provenance.centerStatus, .error)
        XCTAssertEqual(
            provenance.auxiliarySampleCount,
            12
        )
        XCTAssertEqual(
            provenance.auxiliaryFallbackSampleCount,
            0
        )
        XCTAssertEqual(
            provenance.warning?.shortText,
            "EOP 0近似: 現在点"
        )
        XCTAssertEqual(
            provenance.warning?
                .accessibilityDescription,
            "現在点はEOP読込失敗のため0近似です。"
        )
        XCTAssertTrue(
            store
                .selectedStarTrajectoryAccessibilitySummary
                .contains(
                    "現在点はEOP読込失敗のため0近似です。"
                )
        )
    }

    @MainActor
    func testTrajectoryCountsOneUnavailableAuxiliaryLookup()
        throws
    {
        let center = try trajectoryCenterDate()
        let unavailableDate =
            center.addingTimeInterval(
                Double(
                    -SelectedStarTrajectorySampler
                        .pastMinutes * 60
                )
            )
        let provider = try RecordingEOPProvider(
            shouldReturnNilAt: {
                $0 == unavailableDate
            }
        )
        let store = SkyStore(
            earthOrientationServiceLoader: {
                provider
            },
            now: center
        )

        store.showSelectedStarTrajectory = false
        store.selectedStarHR = try XCTUnwrap(
            store.catalog.stars.first?.hr
        )
        provider.reset()
        store.showSelectedStarTrajectory = true

        let provenance = try XCTUnwrap(
            store
                .selectedStarTrajectoryEarthOrientationProvenance
        )
        XCTAssertEqual(provenance.centerStatus, .ready)
        XCTAssertEqual(
            provenance.auxiliarySampleCount,
            12
        )
        XCTAssertEqual(
            provenance.auxiliaryFallbackSampleCount,
            1
        )
        XCTAssertEqual(
            provenance.warning?.shortText,
            "EOP 0近似: 周辺1/12点"
        )
        XCTAssertEqual(
            provenance.warning?
                .accessibilityDescription,
            "周辺12点中1点はEOPを0近似しています。"
        )
        XCTAssertTrue(
            SelectedStarTrajectoryLegendView(
                store: store
            ).rangeText.contains(
                "EOP 0近似: 周辺1/12点"
            )
        )
        XCTAssertTrue(
            store
                .selectedStarTrajectoryAccessibilitySummary
                .contains(
                    "周辺12点中1点はEOPを0近似しています。"
                )
        )
    }

    @MainActor
    func testTrajectoryCountsOneThrowingAuxiliaryLookup()
        throws
    {
        let center = try trajectoryCenterDate()
        let throwingDate =
            center.addingTimeInterval(
                Double(
                    SelectedStarTrajectorySampler
                        .futureMinutes * 60
                )
            )
        let provider = try RecordingEOPProvider(
            shouldThrowAt: {
                $0 == throwingDate
            }
        )
        let store = SkyStore(
            earthOrientationServiceLoader: {
                provider
            },
            now: center
        )

        store.showSelectedStarTrajectory = false
        store.selectedStarHR = try XCTUnwrap(
            store.catalog.stars.first?.hr
        )
        provider.reset()
        store.showSelectedStarTrajectory = true

        let provenance = try XCTUnwrap(
            store
                .selectedStarTrajectoryEarthOrientationProvenance
        )
        XCTAssertEqual(provenance.centerStatus, .ready)
        XCTAssertEqual(
            provenance.auxiliarySampleCount,
            12
        )
        XCTAssertEqual(
            provenance.auxiliaryFallbackSampleCount,
            1
        )
        XCTAssertEqual(
            provenance.warning?.shortText,
            "EOP 0近似: 周辺1/12点"
        )
    }

    @MainActor
    func testTrajectoryReportsEverySampleUsingZeroFallback()
        throws
    {
        let center = try trajectoryCenterDate()
        let provider = try RecordingEOPProvider(
            shouldReturnNilAt: { _ in true }
        )
        let store = SkyStore(
            earthOrientationServiceLoader: {
                provider
            },
            now: center
        )

        store.showSelectedStarTrajectory = false
        store.selectedStarHR = try XCTUnwrap(
            store.catalog.stars.first?.hr
        )
        provider.reset()
        store.showSelectedStarTrajectory = true

        let provenance = try XCTUnwrap(
            store
                .selectedStarTrajectoryEarthOrientationProvenance
        )
        XCTAssertEqual(
            provenance.centerStatus,
            .unavailable
        )
        XCTAssertEqual(
            provenance.auxiliarySampleCount,
            12
        )
        XCTAssertEqual(
            provenance.auxiliaryFallbackSampleCount,
            12
        )
        XCTAssertEqual(
            provenance.warning?.shortText,
            "EOP 0近似: 現在点・周辺12/12点"
        )
        let expectedDescription =
            "現在点はEOP収録外のため0近似です。"
            + "周辺12点中12点はEOPを0近似しています。"
        XCTAssertEqual(
            provenance.warning?
                .accessibilityDescription,
            expectedDescription
        )
        XCTAssertTrue(
            SelectedStarTrajectoryLegendView(
                store: store
            ).rangeText.contains(
                "EOP 0近似: 現在点・周辺12/12点"
            )
        )
        XCTAssertTrue(
            store
                .selectedStarTrajectoryAccessibilitySummary
                .contains(expectedDescription)
        )
    }

    @MainActor
    func testTrajectoryDoesNotRetryUnavailableCenterLookup()
        throws
    {
        let center = try trajectoryCenterDate()
        let provider = try RecordingEOPProvider(
            shouldReturnNilAt: {
                $0 == center
            }
        )
        let store = SkyStore(
            earthOrientationServiceLoader: {
                provider
            },
            now: center
        )

        XCTAssertNil(
            store.currentEarthOrientationEstimate
        )
        XCTAssertNil(
            store.currentEarthOrientationLookupFailure
        )
        store.showSelectedStarTrajectory = false
        store.selectedStarHR = try XCTUnwrap(
            store.catalog.stars.first?.hr
        )
        provider.reset()
        store.showSelectedStarTrajectory = true

        XCTAssertFalse(
            provider.requestedDates.contains(center)
        )
        let provenance = try XCTUnwrap(
            store
                .selectedStarTrajectoryEarthOrientationProvenance
        )
        XCTAssertEqual(
            provenance.centerStatus,
            .unavailable
        )
        XCTAssertEqual(
            provenance.auxiliaryFallbackSampleCount,
            0
        )
        XCTAssertEqual(
            provenance.warning?.shortText,
            "EOP 0近似: 現在点"
        )
        XCTAssertEqual(
            provenance.warning?
                .accessibilityDescription,
            "現在点はEOP収録外のため0近似です。"
        )
    }

    @MainActor
    func testDisablingTrajectoryClearsItsProvenance()
        throws
    {
        let center = try trajectoryCenterDate()
        let provider = try RecordingEOPProvider()
        let store = SkyStore(
            earthOrientationServiceLoader: {
                provider
            },
            now: center
        )

        store.showSelectedStarTrajectory = false
        store.selectedStarHR = try XCTUnwrap(
            store.catalog.stars.first?.hr
        )
        store.showSelectedStarTrajectory = true
        XCTAssertNotNil(
            store
                .selectedStarTrajectoryEarthOrientationProvenance
        )

        store.showSelectedStarTrajectory = false

        XCTAssertTrue(
            store.selectedStarTrajectory.isEmpty
        )
        XCTAssertNil(
            store
                .selectedStarTrajectoryEarthOrientationProvenance
        )
        XCTAssertEqual(
            store
                .selectedStarTrajectoryAccessibilitySummary,
            "選択星の軌跡は非表示です。"
        )
    }

    @MainActor
    func testUTCDayBoundaryPublishesOneSynchronousFrameAcrossSkyAndPointingData()
        throws
    {
        let formatter = ISO8601DateFormatter()
        let boundary = try XCTUnwrap(
            formatter.date(
                from: "2026-07-30T00:00:00Z"
            )
        )
        let before = try XCTUnwrap(
            formatter.date(
                from: "2026-07-29T23:59:59Z"
            )
        )
        let after = try XCTUnwrap(
            formatter.date(
                from: "2026-07-30T00:00:01Z"
            )
        )
        let provider = try RecordingEOPProvider(
            dut1SecondsAt: { date in
                date < boundary ? -0.4 : 0.6
            }
        )
        let store = SkyStore(
            earthOrientationServiceLoader: {
                provider
            },
            now: before
        )

        // Normalize persisted display preferences, then exercise every
        // date-dependent value that SkyStore publishes from one recompute.
        store.showSelectedStarTrajectory = false
        store.useStandardAtmosphericRefraction = false
        store.selectedStarHR = try XCTUnwrap(
            store.catalog.stars.first?.hr
        )
        store.showSelectedStarTrajectory = true
        let oldSnapshot = try XCTUnwrap(
            store.captureSelectedStarPointingSnapshot(
                profile: .precisionJSON
            )
        )
        provider.reset()

        store.observationDate = after

        let estimate = provider.estimate(at: after)
        let options = ApparentPositionOptionsV2(
            earthOrientation:
                estimate.earthOrientationOptionsV2,
            diurnalAberration:
                .wgs84Observer(
                    heightMeters:
                        store.location.heightMeters
                ),
            refraction: .disabled
        )
        let expectedContext =
            try Astronomy.createApparentPositionContextV2(
                at: after,
                location: store.location,
                options: options
            )
        let expectedStars = try Astronomy.renderV2(
            catalog: store.catalog,
            context: expectedContext
        )
        let selectedHR = try XCTUnwrap(
            store.selectedStarHR
        )
        let expectedTrajectory =
            try SelectedStarTrajectorySampler.samples(
                for: store.catalog.starsByHR[selectedHR],
                centeredAt: after,
                location: store.location,
                enabled: true,
                optionsAt: { date in
                    ApparentPositionOptionsV2(
                        earthOrientation:
                            provider.estimate(at: date)
                            .earthOrientationOptionsV2,
                        diurnalAberration:
                            .wgs84Observer(
                                heightMeters:
                                    store.location
                                    .heightMeters
                            ),
                        refraction: .disabled
                    )
                }
            )

        XCTAssertEqual(store.observationDate, after)
        XCTAssertEqual(
            store.currentEarthOrientationEstimate,
            estimate
        )
        XCTAssertEqual(
            store.currentTimeScales,
            expectedContext.timeScales
        )
        XCTAssertEqual(store.renderedStars, expectedStars)
        XCTAssertEqual(
            store.sunState,
            try Sun.state(context: expectedContext)
        )
        XCTAssertEqual(
            store.selectedStarTrajectory,
            expectedTrajectory
        )
        XCTAssertEqual(
            provider.requestedDates,
            [after]
                + expectedTrajectory
                .map(\.date)
                .filter { $0 != after }
        )

        let snapshot = try XCTUnwrap(
            store.captureSelectedStarPointingSnapshot(
                profile: .precisionJSON
            )
        )
        XCTAssertEqual(snapshot.observationDate, after)
        XCTAssertNotEqual(snapshot.payload, oldSnapshot.payload)
        let payloadData = try XCTUnwrap(
            snapshot.payload.data(using: .utf8)
        )
        let root = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: payloadData
            ) as? [String: Any]
        )
        let observation = try XCTUnwrap(
            root["observation"] as? [String: Any]
        )
        let timeScales = try XCTUnwrap(
            root["timeScales"] as? [String: Any]
        )
        let earthOrientation = try XCTUnwrap(
            root["earthOrientation"] as? [String: Any]
        )
        XCTAssertEqual(
            observation["utc"] as? String,
            StarPointingPayloadFormatter
                .utcTimestamp(after)
        )
        XCTAssertEqual(
            timeScales["jdUTC"] as? Double,
            expectedContext.timeScales.utcJulianDate
        )
        XCTAssertEqual(
            timeScales["dut1Seconds"] as? Double,
            0.6
        )
        XCTAssertEqual(
            earthOrientation[
                "appliedDut1Seconds"
            ] as? Double,
            0.6
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
        store.showSelectedStarTrajectory = false
        store.selectedStarHR = try XCTUnwrap(
            store.catalog.stars.first?.hr
        )
        store.showSelectedStarTrajectory = true
        XCTAssertEqual(
            store
                .selectedStarTrajectoryEarthOrientationProvenance,
            SelectedStarTrajectoryEarthOrientationProvenance(
                auxiliaryFallbackSampleCount: 12,
                auxiliarySampleCount: 12,
                centerStatus: .error
            )
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
        XCTAssertEqual(
            store
                .selectedStarTrajectoryEarthOrientationProvenance,
            SelectedStarTrajectoryEarthOrientationProvenance(
                auxiliaryFallbackSampleCount: 0,
                auxiliarySampleCount: 12,
                centerStatus: .ready
            )
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
        store.showSelectedStarTrajectory = false
        store.selectedStarHR = try XCTUnwrap(
            store.catalog.stars.first?.hr
        )
        store.showSelectedStarTrajectory = true
        XCTAssertTrue(
            store.selectedStarTrajectory.isEmpty
        )
        XCTAssertNil(
            store
                .selectedStarTrajectoryEarthOrientationProvenance
        )
    }

    @MainActor
    func testTrajectoryClassifiesCenterApplicationFailureAsError()
        throws
    {
        let center = try trajectoryCenterDate()
        let provider = try RecordingEOPProvider(
            invalidEstimateAt: {
                $0 == center
            }
        )
        let store = SkyStore(
            earthOrientationServiceLoader: {
                provider
            },
            now: center
        )

        XCTAssertNotNil(
            store.currentEarthOrientationApplicationFailure
        )
        store.showSelectedStarTrajectory = false
        store.selectedStarHR = try XCTUnwrap(
            store.catalog.stars.first?.hr
        )
        provider.reset()
        store.showSelectedStarTrajectory = true

        XCTAssertFalse(
            store.selectedStarTrajectory.isEmpty
        )
        XCTAssertEqual(
            store
                .selectedStarTrajectoryEarthOrientationProvenance,
            SelectedStarTrajectoryEarthOrientationProvenance(
                auxiliaryFallbackSampleCount: 0,
                auxiliarySampleCount: 12,
                centerStatus: .error
            )
        )
        XCTAssertFalse(
            provider.requestedDates.contains(center)
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
    func testManualEllipsoidHeightReachesPreciseStarAndSunPipeline()
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

        try store.setCustomLocation(
            name: "マウナケア",
            latitude: 19.8207,
            longitude: -155.4681,
            timeZoneIdentifier: "Pacific/Honolulu",
            heightMeters: 4_205
        )

        XCTAssertEqual(store.location.heightMeters, 4_205)
        let estimate = try XCTUnwrap(
            store.currentEarthOrientationEstimate
        )
        let options = ApparentPositionOptionsV2(
            earthOrientation:
                estimate.earthOrientationOptionsV2,
            diurnalAberration:
                .wgs84Observer(
                    heightMeters: 4_205
                ),
            refraction: .disabled
        )
        let expectedStars = try Astronomy.renderV2(
            catalog: store.catalog,
            at: date,
            location: store.location,
            options: options
        )
        let actualFirst = try XCTUnwrap(
            store.renderedStars.first
        )
        let expectedFirst = try XCTUnwrap(
            expectedStars.first
        )
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

        let expectedContext =
            try Astronomy.createApparentPositionContextV2(
                at: date,
                location: store.location,
                options: options
            )
        XCTAssertEqual(
            store.sunState,
            try Sun.state(context: expectedContext)
        )
    }

    private func trajectoryCenterDate() throws -> Date {
        try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-29T12:00:00Z"
            )
        )
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
    private let dut1SecondsAt: (Date) -> Double
    private let failFirstLookupAt: Date?
    private let invalidEstimateAt: (Date) -> Bool
    private let shouldReturnNilAt: (Date) -> Bool
    private let shouldThrowAt: (Date) -> Bool
    private var didFailFirstLookup = false
    private(set) var requestedDates: [Date] = []

    init(
        polarMotionArcseconds: Double = 0.2,
        dut1SecondsAt:
            @escaping (Date) -> Double = { _ in 0.01 },
        failFirstLookupAt: Date? = nil,
        invalidEstimateAt:
            @escaping (Date) -> Bool = { _ in false },
        shouldReturnNilAt:
            @escaping (Date) -> Bool = { _ in false },
        shouldThrowAt:
            @escaping (Date) -> Bool = { _ in false }
    ) throws {
        let bundled =
            try IERSEarthOrientationServiceV1.loadBundled()
        coverage = bundled.coverage
        source = bundled.source
        self.polarMotionArcseconds =
            polarMotionArcseconds
        self.dut1SecondsAt = dut1SecondsAt
        self.failFirstLookupAt = failFirstLookupAt
        self.invalidEstimateAt = invalidEstimateAt
        self.shouldReturnNilAt = shouldReturnNilAt
        self.shouldThrowAt = shouldThrowAt
    }

    func lookup(
        at date: Date
    ) throws -> IERSEarthOrientationEstimateV1? {
        requestedDates.append(date)
        if date == failFirstLookupAt,
           !didFailFirstLookup
        {
            didFailFirstLookup = true
            throw IERSEarthOrientationError
                .resourceUnavailable(
                    "synthetic center lookup"
                )
        }
        if shouldThrowAt(date) {
            throw IERSEarthOrientationError
                .resourceUnavailable(
                    "synthetic trajectory lookup"
                )
        }
        if shouldReturnNilAt(date) {
            return nil
        }
        return estimate(at: date)
    }

    func estimate(
        at date: Date
    ) -> IERSEarthOrientationEstimateV1 {
        let resolvedPolarMotionArcseconds =
            invalidEstimateAt(date)
            ? 11
            : polarMotionArcseconds
        let radians =
            resolvedPolarMotionArcseconds
            * Double.pi / (180 * 3_600)
        return IERSEarthOrientationEstimateV1(
            dut1: IERSDUT1EstimateV1(
                dut1Seconds:
                    dut1SecondsAt(date),
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
