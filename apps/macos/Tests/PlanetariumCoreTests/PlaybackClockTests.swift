import Foundation
import XCTest

@testable import PlanetariumCore

final class PlaybackClockTests: XCTestCase {
    private let range =
        Date(timeIntervalSince1970: 0)...Date(timeIntervalSince1970: 10_000)

    func testPlayPauseDirectionAndSpeedAreReducedDeterministically() {
        let clock = PlaybackClock(
            supportedDateRange: range,
            maximumFrameDelta: 1
        )
        var state = PlaybackState(
            date: Date(timeIntervalSince1970: 5_000),
            speed: .hourPerSecond
        )

        state = clock.reduce(state, action: .play).state
        XCTAssertTrue(state.isPlaying)

        let forward = clock.reduce(
            state,
            action: .tick(realTimeDelta: 0.5)
        )
        XCTAssertEqual(
            forward.state.date.timeIntervalSince1970,
            6_800,
            accuracy: 1e-9
        )

        state = clock.reduce(
            forward.state,
            action: .setDirection(.backward)
        ).state
        let backward = clock.reduce(
            state,
            action: .tick(realTimeDelta: 0.5)
        )
        XCTAssertEqual(
            backward.state.date.timeIntervalSince1970,
            5_000,
            accuracy: 1e-9
        )

        state = clock.reduce(backward.state, action: .pause).state
        let paused = clock.reduce(
            state,
            action: .tick(realTimeDelta: 0.5)
        )
        XCTAssertEqual(paused.state.date, state.date)
        XCTAssertEqual(paused.appliedRealTimeDelta, 0)
    }

    func testLongFrameDeltaIsClampedBeforeSimulationScaling() {
        let clock = PlaybackClock(
            supportedDateRange: range,
            maximumFrameDelta: 0.25
        )
        let state = PlaybackState(
            date: Date(timeIntervalSince1970: 1_000),
            isPlaying: true,
            speed: .minutePerSecond
        )

        let result = clock.reduce(
            state,
            action: .tick(realTimeDelta: 10)
        )

        XCTAssertEqual(result.appliedRealTimeDelta, 0.25)
        XCTAssertEqual(
            result.state.date.timeIntervalSince1970,
            1_015,
            accuracy: 1e-9
        )
    }

    func testForwardAndBackwardTicksPauseAtSupportedBoundaries() {
        let clock = PlaybackClock(
            supportedDateRange: range,
            maximumFrameDelta: 1
        )
        let forward = PlaybackState(
            date: range.upperBound.addingTimeInterval(-10),
            isPlaying: true,
            direction: .forward,
            speed: .minutePerSecond
        )
        let forwardResult = clock.reduce(
            forward,
            action: .tick(realTimeDelta: 1)
        )
        XCTAssertEqual(forwardResult.state.date, range.upperBound)
        XCTAssertFalse(forwardResult.state.isPlaying)
        XCTAssertEqual(
            forwardResult.event,
            .reachedBoundary(.maximum)
        )

        let backward = PlaybackState(
            date: range.lowerBound.addingTimeInterval(10),
            isPlaying: true,
            direction: .backward,
            speed: .minutePerSecond
        )
        let backwardResult = clock.reduce(
            backward,
            action: .tick(realTimeDelta: 1)
        )
        XCTAssertEqual(backwardResult.state.date, range.lowerBound)
        XCTAssertFalse(backwardResult.state.isPlaying)
        XCTAssertEqual(
            backwardResult.event,
            .reachedBoundary(.minimum)
        )
    }

    func testDefaultClockStopsAtExactFractionalMaximum() {
        let clock = PlaybackClock(maximumFrameDelta: 1)
        let state = PlaybackState(
            date: ObservationConstraints.maximumDate
                .addingTimeInterval(-0.05),
            isPlaying: true,
            direction: .forward,
            speed: .realTime
        )

        let result = clock.reduce(
            state,
            action: .tick(realTimeDelta: 0.1)
        )

        XCTAssertEqual(
            result.state.date,
            ObservationConstraints.maximumDate
        )
        XCTAssertEqual(
            result.state.date.timeIntervalSince1970,
            4_133_980_799.999,
            accuracy: 0.000_1
        )
        XCTAssertFalse(result.state.isPlaying)
        XCTAssertEqual(
            result.event,
            .reachedBoundary(.maximum)
        )
    }

    func testPlaybackAtOutboundBoundaryWaitsForDirectionChange() {
        let clock = PlaybackClock(supportedDateRange: range)
        let state = PlaybackState(
            date: range.upperBound,
            direction: .forward
        )

        let blocked = clock.reduce(state, action: .play)
        XCTAssertFalse(blocked.state.isPlaying)
        XCTAssertEqual(blocked.event, .reachedBoundary(.maximum))

        let reversed = clock.reduce(
            blocked.state,
            action: .setDirection(.backward)
        )
        let playing = clock.reduce(reversed.state, action: .play)
        XCTAssertTrue(playing.state.isPlaying)
        XCTAssertNil(playing.event)
    }

    func testStaticModePausesAndBlocksAutomaticPlayback() {
        let clock = PlaybackClock(supportedDateRange: range)
        let playing = PlaybackState(
            date: Date(timeIntervalSince1970: 5_000),
            isPlaying: true
        )

        let staticState = clock.reduce(
            playing,
            action: .setMotionMode(.staticFrame)
        )
        XCTAssertFalse(staticState.state.isPlaying)

        let blocked = clock.reduce(staticState.state, action: .play)
        XCTAssertFalse(blocked.state.isPlaying)
        XCTAssertEqual(blocked.event, .blockedByStaticMode)

        let tick = clock.reduce(
            blocked.state,
            action: .tick(realTimeDelta: 0.1)
        )
        XCTAssertEqual(tick.state.date, playing.date)
        XCTAssertEqual(tick.appliedRealTimeDelta, 0)
    }

    func testInvalidFrameDeltasAreIgnored() {
        let clock = PlaybackClock(supportedDateRange: range)
        let playing = PlaybackState(
            date: Date(timeIntervalSince1970: 5_000),
            isPlaying: true
        )

        let invalidDeltas: [Double] = [.nan, -.infinity, -1, 0]
        for delta in invalidDeltas {
            let result = clock.reduce(
                playing,
                action: .tick(realTimeDelta: delta)
            )
            XCTAssertEqual(result.state.date, playing.date)
            XCTAssertEqual(result.appliedRealTimeDelta, 0)
        }
    }

    func testClampedSeekStopsPlaybackRegardlessOfDirection() {
        let clock = PlaybackClock(supportedDateRange: range)
        let testCases: [
            (
                date: Date,
                direction: PlaybackDirection,
                expectedDate: Date,
                expectedBoundary: ObservationDateBoundary
            )
        ] = [
            (
                range.lowerBound.addingTimeInterval(-1),
                .forward,
                range.lowerBound,
                .minimum
            ),
            (
                range.upperBound.addingTimeInterval(1),
                .backward,
                range.upperBound,
                .maximum
            ),
        ]

        for testCase in testCases {
            let playing = PlaybackState(
                date: Date(timeIntervalSince1970: 5_000),
                isPlaying: true,
                direction: testCase.direction
            )
            let result = clock.reduce(
                playing,
                action: .seek(testCase.date)
            )
            XCTAssertEqual(result.state.date, testCase.expectedDate)
            XCTAssertFalse(result.state.isPlaying)
            XCTAssertEqual(
                result.event,
                .reachedBoundary(testCase.expectedBoundary)
            )
        }
    }

    func testNonFiniteSeekStopsPlaybackAndReportsBoundary() {
        let clock = PlaybackClock(supportedDateRange: range)
        let nonFiniteSeeks: [
            (
                date: Date,
                expectedDate: Date,
                expectedBoundary: ObservationDateBoundary
            )
        ] = [
            (
                Date(timeIntervalSince1970: .nan),
                range.lowerBound,
                .minimum
            ),
            (
                Date(timeIntervalSince1970: -.infinity),
                range.lowerBound,
                .minimum
            ),
            (
                Date(timeIntervalSince1970: .infinity),
                range.upperBound,
                .maximum
            ),
        ]

        for direction in PlaybackDirection.allCases {
            for testCase in nonFiniteSeeks {
                let playing = PlaybackState(
                    date: Date(timeIntervalSince1970: 5_000),
                    isPlaying: true,
                    direction: direction
                )
                let result = clock.reduce(
                    playing,
                    action: .seek(testCase.date)
                )
                XCTAssertEqual(
                    result.state.date,
                    testCase.expectedDate
                )
                XCTAssertFalse(result.state.isPlaying)
                XCTAssertEqual(
                    result.event,
                    .reachedBoundary(testCase.expectedBoundary)
                )
            }
        }
    }

    func testExactEndpointSeekOnlyStopsInOutboundDirection() {
        let clock = PlaybackClock(supportedDateRange: range)
        let testCases: [
            (
                date: Date,
                direction: PlaybackDirection,
                expectedIsPlaying: Bool,
                expectedEvent: PlaybackEvent?
            )
        ] = [
            (
                range.lowerBound,
                .backward,
                false,
                .reachedBoundary(.minimum)
            ),
            (
                range.lowerBound,
                .forward,
                true,
                nil
            ),
            (
                range.upperBound,
                .forward,
                false,
                .reachedBoundary(.maximum)
            ),
            (
                range.upperBound,
                .backward,
                true,
                nil
            ),
        ]

        for testCase in testCases {
            let playing = PlaybackState(
                date: Date(timeIntervalSince1970: 5_000),
                isPlaying: true,
                direction: testCase.direction
            )
            let result = clock.reduce(
                playing,
                action: .seek(testCase.date)
            )
            XCTAssertEqual(result.state.date, testCase.date)
            XCTAssertEqual(
                result.state.isPlaying,
                testCase.expectedIsPlaying
            )
            XCTAssertEqual(result.event, testCase.expectedEvent)
        }
    }

    func testPresetRatesRemainExplicitAndStable() {
        XCTAssertEqual(
            PlaybackSpeedPreset.allCases.map(
                \.simulatedSecondsPerRealSecond
            ),
            [1, 60, 600, 3_600, 86_400]
        )
    }
}
