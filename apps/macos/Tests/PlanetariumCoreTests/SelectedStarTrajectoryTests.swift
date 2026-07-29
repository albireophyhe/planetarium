import Foundation
import XCTest

@testable import PlanetariumCore

final class SelectedStarTrajectoryTests: XCTestCase {
    func testDisabledAndUnselectedTrajectoryPerformNoCalculation()
        throws
    {
        var optionsCallCount = 0
        let disabled = try SelectedStarTrajectorySampler.samples(
            for: testStar,
            centeredAt: testDate,
            location: testLocation,
            enabled: false,
            optionsAt: { _ in
                optionsCallCount += 1
                return ApparentPositionOptionsV2()
            }
        )
        XCTAssertTrue(disabled.isEmpty)
        XCTAssertEqual(optionsCallCount, 0)

        let unselected = try SelectedStarTrajectorySampler.samples(
            for: nil,
            centeredAt: testDate,
            location: testLocation,
            enabled: true,
            optionsAt: { _ in
                optionsCallCount += 1
                return ApparentPositionOptionsV2()
            }
        )
        XCTAssertTrue(unselected.isEmpty)
        XCTAssertEqual(optionsCallCount, 0)
    }

    func testStandardTrajectoryUsesThirteenOrderedV2Samples()
        throws
    {
        var requestedDates: [Date] = []
        let options = ApparentPositionOptionsV2(
            earthOrientation: EarthOrientationOptionsV2(
                dut1Seconds: 0.009_732,
                dut1Source: .iersPredicted,
                dut1UncertaintySeconds: 0.000_108
            ),
            refraction: .atmosphere(.standardVisual)
        )
        let samples = try SelectedStarTrajectorySampler.samples(
            for: testStar,
            centeredAt: testDate,
            location: testLocation,
            enabled: true,
            optionsAt: { date in
                requestedDates.append(date)
                return options
            }
        )

        XCTAssertEqual(
            samples.count,
            SelectedStarTrajectorySampler.maximumSampleCount
        )
        XCTAssertEqual(
            samples.map(\.offsetMinutes),
            Array(stride(from: -180, through: 180, by: 30))
        )
        XCTAssertEqual(requestedDates, samples.map(\.date))
        XCTAssertEqual(samples.map(\.starHR), Array(repeating: 2491, count: 13))
        XCTAssertEqual(samples.first?.progress, 0)
        XCTAssertEqual(samples[6].progress, 0.5)
        XCTAssertEqual(samples.last?.progress, 1)
        XCTAssertEqual(samples[6].temporalPosition, .present)

        let direct = try Astronomy.calculateApparentStarPositionV2(
            testStar,
            at: testDate,
            location: testLocation,
            options: options
        )
        XCTAssertEqual(
            samples[6].horizontal.altitude,
            direct.observedHorizontal.altitude,
            accuracy: 1e-12
        )
        XCTAssertEqual(
            samples[6].horizontal.azimuth,
            direct.observedHorizontal.azimuth,
            accuracy: 1e-12
        )
        XCTAssertEqual(
            samples[6].projection.x,
            direct.projection.x,
            accuracy: 1e-12
        )
        XCTAssertEqual(
            samples[6].projection.y,
            direct.projection.y,
            accuracy: 1e-12
        )
        XCTAssertEqual(
            direct.metadata.timeScales.dut1Source,
            .iersPredicted
        )
        XCTAssertEqual(
            direct.metadata.timeScales.dut1UncertaintySeconds,
            0.000_108
        )
        XCTAssertNotEqual(direct.refractionMode, .disabled)
    }

    func testSupportedDateBoundariesTrimWithoutClamping()
        throws
    {
        let nearMinimum =
            ObservationConstraints.minimumDate
                .addingTimeInterval(30 * 60)
        let minimumSamples =
            try SelectedStarTrajectorySampler.samples(
                for: testStar,
                centeredAt: nearMinimum,
                location: testLocation,
                enabled: true,
                optionsAt: { _ in
                    ApparentPositionOptionsV2()
                }
            )
        XCTAssertEqual(minimumSamples.first?.offsetMinutes, -30)
        XCTAssertEqual(minimumSamples.last?.offsetMinutes, 180)
        XCTAssertEqual(minimumSamples.count, 8)
        XCTAssertEqual(
            minimumSamples.first?.date,
            ObservationConstraints.minimumDate
        )

        let nearMaximum =
            ObservationConstraints.maximumDate
                .addingTimeInterval(-30 * 60)
        let maximumSamples =
            try SelectedStarTrajectorySampler.samples(
                for: testStar,
                centeredAt: nearMaximum,
                location: testLocation,
                enabled: true,
                optionsAt: { _ in
                    ApparentPositionOptionsV2()
                }
            )
        XCTAssertEqual(maximumSamples.first?.offsetMinutes, -180)
        XCTAssertEqual(maximumSamples.last?.offsetMinutes, 30)
        XCTAssertEqual(maximumSamples.count, 8)
        XCTAssertEqual(
            maximumSamples.last?.date,
            ObservationConstraints.maximumDate
        )
    }

    func test2DSegmentsHideBelowHorizonAndClipCrossings()
        throws
    {
        let samples = [
            sample(offsetMinutes: -90, altitudeDegrees: -20),
            sample(offsetMinutes: -60, altitudeDegrees: -10),
            sample(offsetMinutes: -30, altitudeDegrees: 10),
            sample(offsetMinutes: 0, altitudeDegrees: 20),
            sample(offsetMinutes: 30, altitudeDegrees: 15),
        ]
        let segments =
            SelectedStarTrajectorySampler.visible2DSegments(
                from: samples
            )

        XCTAssertEqual(segments.count, 3)
        XCTAssertEqual(
            segments.map(\.temporalPosition),
            [.past, .past, .future]
        )
        XCTAssertEqual(
            hypot(segments[0].start.x, segments[0].start.y),
            1,
            accuracy: 1e-12
        )
        XCTAssertLessThanOrEqual(
            hypot(segments[0].end.x, segments[0].end.y),
            1
        )
        XCTAssertFalse(
            segments.contains {
                hypot($0.start.x, $0.start.y) > 1.000_000_000_001
                    || hypot($0.end.x, $0.end.y)
                        > 1.000_000_000_001
            }
        )
    }

    func testProgressClampsAndIncreasesFromPastToFuture() {
        let offsets = [-300, -180, 0, 180, 300]
        let progress = offsets.map {
            sample(offsetMinutes: $0, altitudeDegrees: 10).progress
        }
        XCTAssertEqual(progress, [0, 0, 0.5, 1, 1])
        XCTAssertTrue(
            zip(progress, progress.dropFirst()).allSatisfy {
                $0 <= $1
            }
        )
    }

    private var testStar: CatalogStar {
        CatalogStar(
            hr: 2491,
            hd: 48_915,
            rightAscension:
                Angles.radians(fromDegrees: 101.287_155_33),
            declination:
                Angles.radians(fromDegrees: -16.716_115_86),
            visualMagnitude: -1.46,
            bvColor: 0.00,
            catalogName: "Sirius",
            spectralType: "A1V"
        )
    }

    private var testLocation: ObservingLocation {
        ObservingLocation(
            id: "tokyo",
            name: "東京",
            latitude: 35.6812,
            longitude: 139.7671,
            timeZoneIdentifier: "Asia/Tokyo"
        )
    }

    private var testDate: Date {
        ISO8601DateFormatter().date(
            from: "2026-07-29T12:00:00Z"
        )!
    }

    private func sample(
        offsetMinutes: Int,
        altitudeDegrees: Double
    ) -> SelectedStarTrajectorySample {
        let altitude = Angles.radians(
            fromDegrees: altitudeDegrees
        )
        return SelectedStarTrajectorySample(
            starHR: 2491,
            offsetMinutes: offsetMinutes,
            date: testDate.addingTimeInterval(
                Double(offsetMinutes * 60)
            ),
            horizontal: HorizontalCoordinates(
                altitude: altitude,
                azimuth: .pi / 2
            ),
            projection: Astronomy.project(
                altitude: altitude,
                azimuth: .pi / 2
            )
        )
    }
}
