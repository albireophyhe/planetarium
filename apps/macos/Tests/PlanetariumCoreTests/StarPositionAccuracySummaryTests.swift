import XCTest

@testable import Planetarium

final class StarPositionAccuracySummaryTests: XCTestCase {
    func testBundledEOPSummaryScopesTheEstimate() {
        let text = StarPositionAccuracySummary.text(
            hasBundledEarthOrientation: true
        )

        XCTAssertTrue(text.contains("真空中の位置精度の通常目安"))
        XCTAssertTrue(text.contains("概ね1〜数秒角級"))
        XCTAssertTrue(text.contains("全恒星の実測精度を保証する値では"))
        XCTAssertTrue(text.contains("大気差ON時の表示高度は別"))
        XCTAssertTrue(text.contains("計算モデルと制限"))
        XCTAssertFalse(text.contains("BSC5P"))
        XCTAssertFalse(text.contains("IERS"))
    }

    func testFallbackSummaryQualifiesTheDUT1Envelope() {
        let text = StarPositionAccuracySummary.text(
            hasBundledEarthOrientation: false
        )

        XCTAssertTrue(text.contains("精度低下"))
        XCTAssertTrue(text.contains("地球回転データを利用できず近似中"))
        XCTAssertTrue(text.contains("時角差は最大約13.5秒角"))
        XCTAssertTrue(text.contains("最大約0.6秒角"))
        XCTAssertTrue(text.contains("大気差ON時の表示高度は別"))
        XCTAssertTrue(text.contains("計算モデルと制限"))

        let details = StarPositionAccuracySummary.fallbackDetails
        XCTAssertTrue(details.contains("DUT1=0秒・xp/yp=0近似"))
        XCTAssertTrue(details.contains("現行の整数うるう秒UTC"))
        XCTAssertTrue(details.contains("DUT1だけの条件付き目安"))
        XCTAssertTrue(details.contains("1972年以前はTAI−UTC=0秒"))
        XCTAssertTrue(details.contains("既知最後の37秒"))
    }
}
