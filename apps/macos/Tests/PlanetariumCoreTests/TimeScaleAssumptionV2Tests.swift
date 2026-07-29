import Foundation
import XCTest

@testable import PlanetariumCore

final class TimeScaleAssumptionV2Tests: XCTestCase {
    func testPre1972BoundaryUsesConcreteZeroSecondApproximation()
        throws
    {
        let beforeBoundary = try Astronomy.resolveTimeScalesV2(
            at: date("1971-12-31T23:59:59Z")
        )
        XCTAssertEqual(
            Astronomy.taiMinusUTCAssumptionV2(
                from: beforeBoundary
            ),
            .pre1972Approximation(seconds: 0)
        )

        let atBoundary = try Astronomy.resolveTimeScalesV2(
            at: date("1972-01-01T00:00:00Z")
        )
        XCTAssertNil(
            Astronomy.taiMinusUTCAssumptionV2(
                from: atBoundary
            )
        )
    }

    func testFutureBoundaryUsesConcreteThirtySevenSecondAssumption()
        throws
    {
        let beforeBoundary = try Astronomy.resolveTimeScalesV2(
            at: date("2027-06-30T23:59:59Z")
        )
        XCTAssertNil(
            Astronomy.taiMinusUTCAssumptionV2(
                from: beforeBoundary
            )
        )

        let atBoundary = try Astronomy.resolveTimeScalesV2(
            at: date("2027-07-01T00:00:00Z")
        )
        XCTAssertEqual(
            Astronomy.taiMinusUTCAssumptionV2(
                from: atBoundary
            ),
            .futureLeapSecondsUnknown(seconds: 37)
        )
    }

    func testNormalHistoryAndCallerOverrideStaySilent()
        throws
    {
        let normal = try Astronomy.resolveTimeScalesV2(
            at: date("2026-07-29T00:00:00Z")
        )
        XCTAssertNil(
            Astronomy.taiMinusUTCAssumptionV2(from: normal)
        )

        let callerOverride = try Astronomy.resolveTimeScalesV2(
            at: date("2050-01-01T00:00:00Z"),
            options: EarthOrientationOptionsV2(
                taiMinusUTCSeconds: 42
            )
        )
        XCTAssertNil(
            Astronomy.taiMinusUTCAssumptionV2(
                from: callerOverride
            )
        )
    }

    private func date(_ value: String) -> Date {
        ISO8601DateFormatter().date(from: value)!
    }
}
