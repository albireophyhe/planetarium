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

    private func sourceSlice(
        _ text: String,
        from startMarker: String,
        until endMarker: String
    ) throws -> String {
        let start = try XCTUnwrap(
            text.range(of: startMarker),
            "Missing source marker: \(startMarker)"
        )
        let end = try XCTUnwrap(
            text.range(
                of: endMarker,
                range: start.upperBound..<text.endIndex
            ),
            "Missing source marker: \(endMarker)"
        )
        return String(text[start.lowerBound..<end.lowerBound])
    }

    private func assertSourceOrder(
        _ markers: [String],
        in text: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        var searchStart = text.startIndex
        for marker in markers {
            guard let range = text.range(
                of: marker,
                range: searchStart..<text.endIndex
            ) else {
                XCTFail(
                    "Missing or out-of-order source marker: \(marker)",
                    file: file,
                    line: line
                )
                return
            }
            searchStart = range.upperBound
        }
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
                "大気差ON時の表示高度は別です"
            )
        )
    }

    func testEventReturnContextDoesNotMisstateAChangedObservationTime()
        throws
    {
        let text = try source(
            "apps/macos/Sources/PlanetariumApp/Views/SkyWorkspaceView.swift"
        )

        XCTAssertTrue(text.contains("return \"現象時刻 \""))
        XCTAssertFalse(text.contains("の空を表示中"))
    }

    func testHelpKeepsEOPFallbackConditionsAndLocationCopyCurrent()
        throws
    {
        let text = try source(
            "apps/macos/Sources/PlanetariumApp/Views/HelpView.swift"
        )

        XCTAssertTrue(text.contains("時角の最大約13.5秒角"))
        XCTAssertTrue(text.contains("2026年7月31日取得"))
        XCTAssertTrue(
            text.contains(
                "収録範囲は1973-01-02〜2027-08-07 UTC"
            )
        )
        XCTAssertTrue(text.contains("2026-07-30までは観測値"))
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

    func testSelectedSolarEclipseKeepsSafetyAndPrimaryActionBeforeScene()
        throws
    {
        let text = try source(
            "apps/macos/Sources/PlanetariumApp/Views/EventForecastInspectorView.swift"
        )
        let workspace = try sourceSlice(
            text,
            from: "private func workspaceDetails(",
            until: "private func accuracyOverview("
        )

        assertSourceOrder(
            [
                "header(item)",
                "if item.candidate.kind == .solarEclipse",
                "solarSafety",
                "eclipseMaximumSection(forecast)",
                "eclipseContactSection(forecast)",
                "EventSceneView(",
                "accuracyOverview(item)",
            ],
            in: workspace
        )
        XCTAssertTrue(text.contains("Text(\"安全上の注意\")"))
        XCTAssertTrue(text.contains("\"最大時刻を空に表示\""))
    }

    func testSelectedLunarEclipsePrimaryActionPrecedesScene() throws {
        let text = try source(
            "apps/macos/Sources/PlanetariumApp/Views/EventForecastInspectorView.swift"
        )
        let workspace = try sourceSlice(
            text,
            from: "private func workspaceDetails(",
            until: "private func accuracyOverview("
        )

        assertSourceOrder(
            [
                "eclipseMaximumSection(forecast)",
                "eclipseContactSection(forecast)",
                "EventSceneView(",
                "accuracyOverview(item)",
            ],
            in: workspace
        )
        XCTAssertTrue(text.contains("\"最大時刻を空に表示\""))
    }

    func testSelectedOccultationClosestApproachPrecedesScene() throws {
        let text = try source(
            "apps/macos/Sources/PlanetariumApp/Views/EventForecastInspectorView.swift"
        )
        let workspace = try sourceSlice(
            text,
            from: "private func workspaceDetails(",
            until: "private func accuracyOverview("
        )

        assertSourceOrder(
            [
                "occultationMaximumSection(forecast)",
                "occultationContactSection(forecast)",
                "EventSceneView(",
                "accuracyOverview(item)",
            ],
            in: workspace
        )
        XCTAssertTrue(
            text.contains("\"最接近時刻を空に表示\"")
        )
    }

    func testEventWorkspaceKeepsPrimaryAndSceneAccessibilityContracts()
        throws
    {
        let detailSource = try source(
            "apps/macos/Sources/PlanetariumApp/Views/EventForecastInspectorView.swift"
        )
        let sceneSource = try source(
            "apps/macos/Sources/PlanetariumApp/Views/EventSceneView.swift"
        )

        XCTAssertTrue(
            detailSource.contains(
                "\"event.showOnSky.primary\""
            )
        )
        XCTAssertTrue(
            detailSource.contains(
                ".accessibilityHint(hint)"
            )
        )
        XCTAssertTrue(
            detailSource.contains(
                "\"event.accuracySummary\""
            )
        )
        XCTAssertTrue(
            detailSource.contains(
                "\"event.showAccuracyInspector\""
            )
        )
        XCTAssertTrue(
            detailSource.contains(
                "\"event.workspace.heading\""
            )
        )
        XCTAssertTrue(
            detailSource.contains(
                "\"event.inspector.heading\""
            )
        )
        XCTAssertTrue(
            detailSource.contains(
                "equals: .workspaceHeading"
            )
        )
        XCTAssertTrue(
            detailSource.contains(
                "equals: .inspectorHeading"
            )
        )
        XCTAssertTrue(
            detailSource.contains(
                "equals: .accuracyTrigger"
            )
        )
        XCTAssertTrue(
            sceneSource.contains(
                "\"この時刻を空に表示\""
            )
        )
        XCTAssertTrue(
            sceneSource.contains(
                "\"event.scene.showOnSky\""
            )
        )
    }
}
