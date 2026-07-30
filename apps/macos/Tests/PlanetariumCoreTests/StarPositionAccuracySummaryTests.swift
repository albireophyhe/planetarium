import XCTest

@testable import Planetarium

final class StarPositionAccuracySummaryTests: XCTestCase {
    func testBundledEOPSummaryScopesTheEstimate() {
        let text = StarPositionAccuracySummary.text(
            hasBundledEarthOrientation: true
        )

        XCTAssertTrue(text.contains("BSC5Pの格納分解能"))
        XCTAssertTrue(text.contains("真空中の通常目安"))
        XCTAssertTrue(text.contains("概ね1〜数秒角級"))
        XCTAssertTrue(text.contains("全恒星の実測精度を保証する値では"))
        XCTAssertTrue(text.contains("大気差ON時の表示高度は別"))
    }

    func testFallbackSummaryQualifiesTheDUT1Envelope() {
        let text = StarPositionAccuracySummary.text(
            hasBundledEarthOrientation: false
        )

        XCTAssertTrue(text.contains("DUT1=0秒・xp/yp=0近似"))
        XCTAssertTrue(text.contains("時角の最大約13.5秒角"))
        XCTAssertTrue(text.contains("現行の整数うるう秒UTC"))
        XCTAssertTrue(text.contains("DUT1だけの条件付き目安"))
        XCTAssertTrue(text.contains("最大約0.6秒角"))
        XCTAssertTrue(text.contains("1972年以前はTAI−UTC=0秒"))
        XCTAssertTrue(text.contains("既知最後の37秒"))
        XCTAssertTrue(text.contains("大気差ON時の表示高度は別"))
    }
}
