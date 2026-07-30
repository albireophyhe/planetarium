import Foundation
import XCTest

@testable import Planetarium

final class EventForecastFormattingTests: XCTestCase {
    func testEdgeYearCoverageCopyUsesTheObservingTimeZone() {
        let startGap =
            EventForecastCoveragePresentation.gap(
                year: 1900,
                timeZoneIdentifier: "UTC"
            )
        XCTAssertEqual(
            startGap?.approximateMinutes,
            10
        )
        XCTAssertEqual(
            startGap.map {
                EventForecastCoveragePresentation
                    .message(for: $0)
            },
            "イベント用暦データの収録範囲により、"
                + "この現地年のはじめ約10分は予報に含まれません。"
        )

        XCTAssertNil(
            EventForecastCoveragePresentation.gap(
                year: 2026,
                timeZoneIdentifier: "Asia/Tokyo"
            )
        )

        let endGap =
            EventForecastCoveragePresentation.gap(
                year: 2100,
                timeZoneIdentifier: "UTC"
            )
        XCTAssertEqual(
            endGap?.approximateMinutes,
            2
        )
        XCTAssertEqual(
            endGap.map {
                EventForecastCoveragePresentation
                    .message(for: $0)
            },
            "イベント用暦データの収録範囲により、"
                + "この現地年のおわり約2分は予報に含まれません。"
        )
    }

    func testPositionAngleUsesOneDecimalDegreeAndStatesConvention()
    {
        XCTAssertEqual(
            EventForecastFormatting.positionAngle(
                286.4 * Double.pi / 180
            ),
            "286.4°"
        )
        XCTAssertEqual(
            EventForecastFormatting
                .positionAngleConvention,
            "位置角は天の北を0°として東回り（0〜360°）"
        )
    }

    func testEventTimesExposeLocalAndUTCRepresentations()
        throws
    {
        let instant = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-08-12T18:13:22Z"
            )
        )

        XCTAssertEqual(
            EventForecastFormatting.dateTime(
                instant,
                timeZoneIdentifier: "Asia/Tokyo"
            ),
            "2026年8月13日（木） 03:13:22 JST"
        )
        XCTAssertEqual(
            EventForecastFormatting.utcDateTime(
                instant
            ),
            "2026/08/12 18:13:22 UTC"
        )
    }

    func testBoundaryCopyDistinguishesOccurrenceFromClassification()
    {
        XCTAssertEqual(
            EventForecastFormatting
                .boundaryUncertainty(
                    .solarOccurrence
                ),
            "外縁の物理境界帯内のため、"
                + "この地点で日食が起きるかは未確定です。"
        )
        XCTAssertEqual(
            EventForecastFormatting
                .boundaryUncertainty(
                    .solarCentralClassification
                ),
            "部分食・中心食の物理境界帯内です。"
                + "日食は起きますが、皆既・金環になるかと"
                + "第2・第3接触は未確定です。"
        )
        XCTAssertEqual(
            EventForecastFormatting
                .boundaryUncertainty(
                    .occultationOccurrence
                ),
            "平均月縁の物理境界帯内のため、"
                + "掩蔽が起きるかは未確定です。"
        )
        XCTAssertEqual(
            EventForecastFormatting
                .boundarySummary(
                    .solarCentralClassification
                ),
            "中心食分類未確定"
        )
    }

    func testContactNamesMatchTheExplicitScientificPhases()
    {
        XCTAssertEqual(
            EventForecastFormatting.phase(
                .solarC1
            ),
            "部分食開始（C1）"
        )
        XCTAssertEqual(
            EventForecastFormatting.phase(
                .solarC2
            ),
            "皆既・金環食開始（C2）"
        )
        XCTAssertEqual(
            EventForecastFormatting.phase(
                .maximum,
                solarOccurrenceUncertain: true
            ),
            "最接近"
        )
        XCTAssertEqual(
            EventForecastFormatting.phase(
                .lunarU4
            ),
            "部分食終了（U4）"
        )
        XCTAssertEqual(
            EventForecastFormatting
                .occultationPhase(.maximum),
            "最接近"
        )
    }
}
