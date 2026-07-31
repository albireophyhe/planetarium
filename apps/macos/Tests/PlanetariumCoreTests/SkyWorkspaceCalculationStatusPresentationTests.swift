import XCTest

@testable import Planetarium

final class SkyWorkspaceCalculationStatusPresentationTests:
    XCTestCase
{
    func testNormalStatesUseCompactBeginnerFacingSummary() {
        let predicted =
            SkyWorkspaceCalculationStatusPresentation(
                refractionSource: nil,
                earthOrientationStatus: .predicted
            )
        XCTAssertEqual(
            predicted.summary,
            "精密計算・大気差なし・IERS予測値"
        )
        XCTAssertFalse(predicted.isWarning)

        let observed =
            SkyWorkspaceCalculationStatusPresentation(
                refractionSource: .standard,
                earthOrientationStatus: .observed
            )
        XCTAssertEqual(
            observed.summary,
            "精密計算・標準大気差・IERS観測値"
        )
        XCTAssertFalse(observed.isWarning)

        let mixed =
            SkyWorkspaceCalculationStatusPresentation(
                refractionSource: .manual,
                earthOrientationStatus: .mixed
            )
        XCTAssertEqual(
            mixed.summary,
            "精密計算・手動大気差・IERS観測・予測値"
        )
        XCTAssertFalse(mixed.isWarning)
    }

    func testExceptionalStatesKeepCauseAndApproximationVisible() {
        let cases: [
            (
                SkyWorkspaceCalculationStatusPresentation
                    .EarthOrientationStatus,
                String
            )
        ] = [
            (.preparing, "IERS EOP準備中（0近似）"),
            (.readFailure, "IERS EOP読込失敗（0近似）"),
            (
                .outsideCoverage,
                "IERS EOP収録範囲外（0近似）"
            ),
            (
                .applicationFailure,
                "IERS EOP適用失敗（0近似）"
            ),
        ]

        for (earthOrientationStatus, expectedSuffix) in cases {
            let presentation =
                SkyWorkspaceCalculationStatusPresentation(
                    refractionSource: nil,
                    earthOrientationStatus:
                        earthOrientationStatus
                )
            XCTAssertTrue(
                presentation.summary.hasSuffix(expectedSuffix),
                presentation.summary
            )
            XCTAssertTrue(presentation.isWarning)
            XCTAssertNotEqual(
                presentation.systemImage,
                "checkmark.circle"
            )
        }
    }
}
