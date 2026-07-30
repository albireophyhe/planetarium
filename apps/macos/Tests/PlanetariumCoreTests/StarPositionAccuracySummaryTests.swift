import XCTest

@testable import Planetarium

final class StarPositionAccuracySummaryTests: XCTestCase {
    func testBundledEOPSummaryScopesTheEstimate() {
        let text = StarPositionAccuracySummary.text(
            hasBundledEarthOrientation: true
        )

        XCTAssertTrue(text.contains("星表の格納分解能"))
        XCTAssertTrue(text.contains("概ね1〜数秒角級"))
        XCTAssertTrue(text.contains("全恒星への保証値ではありません"))
        XCTAssertTrue(text.contains("星表・真空計算部分の目安"))
        XCTAssertTrue(text.contains("地点・時計・実際の大気との差は別"))
    }

    func testFallbackSummaryQualifiesTheDUT1Envelope() {
        let text = StarPositionAccuracySummary.text(
            hasBundledEarthOrientation: false
        )

        XCTAssertTrue(text.contains("DUT1=0秒・xp/yp=0近似"))
        XCTAssertTrue(text.contains("整数うるう秒UTCが維持される期間"))
        XCTAssertTrue(text.contains("最大約13.5秒角相当"))
        XCTAssertTrue(text.contains("1972年以前と将来のUTC制度"))
        XCTAssertTrue(text.contains("星表・真空計算部分の目安"))
    }
}
