import Foundation
@testable import PlanetariumCore
import Testing

struct EventIntervalVisibilityTests {
    @Test
    func keepsBoundaryUncertaintyIndependentFromHorizon()
        throws
    {
        #expect(
            try EclipseCalculationSupportV1
                .boundaryMaximumIsAboveHorizon(
                    horizonClearanceRadians: 0.1
                )
        )
        #expect(
            try !EclipseCalculationSupportV1
                .boundaryMaximumIsAboveHorizon(
                    horizonClearanceRadians: 0
                )
        )
        #expect(
            try !EclipseCalculationSupportV1
                .boundaryMaximumIsAboveHorizon(
                    horizonClearanceRadians: -0.1
                )
        )
        #expect(throws: EventNumericsError.self) {
            try EclipseCalculationSupportV1
                .boundaryMaximumIsAboveHorizon(
                    horizonClearanceRadians: .nan
                )
        }
    }

    @Test
    func findsVisibleWindowBetweenHiddenEndpoints()
        async throws
    {
        let visibility =
            try await EclipseCalculationSupportV1
                .intervalVisibility(
                    start: 0,
                    end: 4_000,
                    horizonClearanceAt: { instant in
                        1
                        - pow(
                            (instant - 2_000) / 300,
                            2
                        )
                    },
                    shouldCancel: nil,
                    toleranceSeconds: 0.1
                )

        #expect(visibility == .partlyVisible)
    }

    @Test
    func findsHiddenDipBetweenVisibleEndpoints()
        async throws
    {
        let visibility =
            try await EclipseCalculationSupportV1
                .intervalVisibility(
                    start: 0,
                    end: 4_000,
                    horizonClearanceAt: { instant in
                        pow(
                            (instant - 2_000) / 300,
                            2
                        ) - 1
                    },
                    shouldCancel: nil,
                    toleranceSeconds: 0.1
                )

        #expect(visibility == .partlyVisible)
    }

    @Test
    func distinguishesFullyVisibleAndHidden()
        async throws
    {
        let visible =
            try await EclipseCalculationSupportV1
                .intervalVisibility(
                    start: 0,
                    end: 4_000,
                    horizonClearanceAt: { instant in
                        2 + sin(instant / 1_000)
                    },
                    shouldCancel: nil
                )
        let hidden =
            try await EclipseCalculationSupportV1
                .intervalVisibility(
                    start: 0,
                    end: 4_000,
                    horizonClearanceAt: { instant in
                        -2 + sin(instant / 1_000)
                    },
                    shouldCancel: nil
                )

        #expect(visible == .fullyVisible)
        #expect(hidden == .belowHorizon)
    }
}
