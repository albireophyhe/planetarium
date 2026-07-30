import Foundation
import XCTest

final class AccuracyCopySourceContractTests: XCTestCase {
    private var repositoryRoot: URL {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 {
            root.deleteLastPathComponent()
        }
        return root
    }

    private func source(_ path: String) throws -> String {
        try String(
            contentsOf: repositoryRoot.appending(path: path),
            encoding: .utf8
        )
    }

    func testStarInspectorScopesTheOrdinaryEstimateToVacuum() throws {
        let text = try source(
            "apps/macos/Sources/PlanetariumApp/Views/StarInspectorView.swift"
        )

        XCTAssertTrue(
            text.contains(
                "BSC5Pの格納分解能から見た真空中の通常目安"
            )
        )
        XCTAssertTrue(
            text.contains(
                "全恒星の実測精度を保証する値ではありません"
            )
        )
        XCTAssertTrue(
            text.contains(
                "標準大気差ON時の表示高度は別です"
            )
        )
    }

    func testHelpKeepsEOPFallbackConditionsAndLocationCopyCurrent()
        throws
    {
        let text = try source(
            "apps/macos/Sources/PlanetariumApp/Views/HelpView.swift"
        )

        XCTAssertTrue(text.contains("時角の最大約13.5秒角"))
        XCTAssertTrue(
            text.contains(
                "現行の整数うるう秒UTCを前提にした"
                    + "DUT1だけの条件付き目安"
            )
        )
        XCTAssertTrue(
            text.contains(
                "xp/yp=0による方向差も同梱履歴では"
                    + "最大約0.6秒角"
            )
        )
        XCTAssertTrue(text.contains("1972年以前はTAI−UTC=0秒"))
        XCTAssertTrue(
            text.contains(
                "将来は既知最後の37秒を仮定するUTC近似"
            )
        )
        XCTAssertTrue(
            text.contains(
                "OSから水平精度を取得できた場合だけ境界幅へ加え"
            )
        )
        XCTAssertTrue(
            text.contains(
                "都市・手入力は測位精度値を持ちません"
            )
        )
        XCTAssertTrue(
            text.contains(
                "WGS84楕円体高は都市では0 m、"
                    + "手入力では指定値"
            )
        )
        XCTAssertFalse(
            text.contains(
                "都市・手入力では不明として扱います"
            )
        )
    }
}
