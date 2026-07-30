import Foundation
import XCTest

@testable import Planetarium
@testable import PlanetariumCore

final class EventSceneTimelineTests: XCTestCase {
    func testEclipseTimelineSortsAndDeduplicatesMaximum()
        throws
    {
        let start = try date(
            "2026-08-12T17:00:00Z"
        )
        let maximum = eclipseContact(
            phase: .maximum,
            date: start.addingTimeInterval(120)
        )
        let staleMaximum = eclipseContact(
            phase: .maximum,
            date: start.addingTimeInterval(120),
            aboveHorizon: false
        )
        let moments =
            EventSceneTimeline.eclipseMoments(
                contacts: [
                    eclipseContact(
                        phase: .solarC4,
                        date:
                            start.addingTimeInterval(
                                240
                            )
                    ),
                    staleMaximum,
                    eclipseContact(
                        phase: .solarC1,
                        date: start
                    ),
                    maximum,
                ],
                maximum: maximum,
                solarOccurrenceUncertain: false
            )

        XCTAssertEqual(moments.count, 3)
        XCTAssertEqual(
            moments.map(\.instantUTC),
            [
                start,
                start.addingTimeInterval(120),
                start.addingTimeInterval(240),
            ]
        )
        XCTAssertEqual(
            moments.map(\.label),
            [
                "部分食開始（C1）",
                "最大",
                "部分食終了（C4）",
            ]
        )
        XCTAssertEqual(
            EventSceneTimeline
                .defaultMoment(in: moments)?
                .label,
            "最大"
        )
        guard case let .eclipse(maximumSample) =
            moments[1].sample
        else {
            return XCTFail(
                "Expected eclipse maximum sample"
            )
        }
        XCTAssertTrue(
            maximumSample.aboveHorizon,
            "The explicit canonical maximum must win duplicate removal"
        )
    }

    func testMatchingMomentUsesOnlyExactSolvedInstantWindow()
        throws
    {
        let maximumDate = try date(
            "2026-08-12T17:02:00Z"
        )
        let maximum = eclipseContact(
            phase: .maximum,
            date: maximumDate
        )
        let moments =
            EventSceneTimeline.eclipseMoments(
                contacts: [maximum],
                maximum: maximum,
                solarOccurrenceUncertain: false
            )

        XCTAssertEqual(
            EventSceneTimeline
                .matchingMoment(
                    observationDate:
                        maximumDate
                        .addingTimeInterval(0.0009),
                    in: moments
                )?
                .label,
            "最大"
        )
        XCTAssertNil(
            EventSceneTimeline
                .matchingMoment(
                    observationDate:
                        maximumDate
                        .addingTimeInterval(0.0011),
                    in: moments
                )
        )
    }

    func testOccultationTimelineKeepsEachSolvedPhase()
        throws
    {
        let start = try date(
            "2026-09-01T10:00:00Z"
        )
        let maximum = occultationContact(
            phase: .maximum,
            date: start.addingTimeInterval(60)
        )
        let moments =
            EventSceneTimeline
            .occultationMoments(
                contacts: [
                    occultationContact(
                        phase: .reappearance,
                        date:
                            start.addingTimeInterval(
                                120
                            )
                    ),
                    occultationContact(
                        phase: .disappearance,
                        date: start
                    ),
                    maximum,
                ],
                maximum: maximum
            )

        XCTAssertEqual(
            moments.map(\.label),
            ["潜入", "最接近", "出現"]
        )
        XCTAssertEqual(moments.count, 3)
        guard case let .occultation(sample) =
            moments[0].sample
        else {
            return XCTFail(
                "Expected occultation sample"
            )
        }
        XCTAssertEqual(
            sample.phase,
            .disappearance
        )
    }

    func testOccultationSceneStatePrioritizesSolvedPhaseAndBoundary()
    {
        XCTAssertEqual(
            OccultationSceneTargetState.resolve(
                phase: .disappearance,
                grazing: false,
                clearanceRadians: -1e-13
            ),
            .atMeanLimb
        )
        XCTAssertEqual(
            OccultationSceneTargetState.resolve(
                phase: .reappearance,
                grazing: false,
                clearanceRadians: 1e-13
            ),
            .atMeanLimb
        )
        XCTAssertEqual(
            OccultationSceneTargetState.resolve(
                phase: .maximum,
                grazing: true,
                clearanceRadians: -0.001
            ),
            .uncertainBoundary
        )
        XCTAssertEqual(
            OccultationSceneTargetState.resolve(
                phase: .maximum,
                grazing: false,
                clearanceRadians: -0.001
            ),
            .insideMeanLimb
        )
        XCTAssertEqual(
            OccultationSceneTargetState.resolve(
                phase: .maximum,
                grazing: false,
                clearanceRadians: 0.001
            ),
            .outsideMeanLimb
        )
        XCTAssertEqual(
            OccultationSceneTargetState.resolve(
                phase: .maximum,
                grazing: false,
                clearanceRadians: 0
            ),
            .atMeanLimb
        )
    }

    private func eclipseContact(
        phase: EclipseContactPhaseV1,
        date: Date,
        aboveHorizon: Bool = true
    ) -> EclipseContactV1 {
        EclipseContactV1(
            phase: phase,
            instantUTC: date,
            sun: nil,
            moon: nil,
            aboveHorizon: aboveHorizon
        )
    }

    private func occultationContact(
        phase:
            LunarOccultationContactPhaseV1,
        date: Date
    ) -> LunarOccultationContactV1 {
        LunarOccultationContactV1(
            phase: phase,
            instantUTC: date,
            moon: EclipseBodyPositionV1(
                horizontal:
                    HorizontalCoordinates(
                        altitude: 0.5,
                        azimuth: 1
                    ),
                angularRadiusRadians: 0.0045,
                distanceKilometers: 384_400
            ),
            targetHorizontal:
                HorizontalCoordinates(
                    altitude: 0.5,
                    azimuth: 1.0045
                ),
            aboveHorizon: true,
            positionAngleRadians: .pi / 2
        )
    }

    private func date(
        _ value: String
    ) throws -> Date {
        try XCTUnwrap(
            ISO8601DateFormatter()
                .date(from: value)
        )
    }
}
