import XCTest

@testable import PlanetariumCore

final class StarListPolicyTests: XCTestCase {
    func testFilterMatchesJapaneseAliasAndUsesDeterministicAltitudeOrder() {
        let high = renderedStar(
            hr: 2,
            name: "Vega",
            nameJa: "ベガ",
            aliases: ["織女星"],
            altitudeDegrees: 50,
            magnitude: 0.03
        )
        let low = renderedStar(
            hr: 1,
            name: "Altair",
            nameJa: "アルタイル",
            aliases: ["彦星"],
            altitudeDegrees: 20,
            magnitude: 0.76
        )

        XCTAssertEqual(
            StarListPolicy.filteredNamedStars(
                from: [low, high],
                query: "",
                visibleOnly: true
            ).map(\.hr),
            [2, 1]
        )
        XCTAssertEqual(
            StarListPolicy.filteredNamedStars(
                from: [low, high],
                query: "織女",
                visibleOnly: true
            ).map(\.hr),
            [2]
        )
    }

    func testPreservedSelectionSurvivesFiltersAndRepairsOnlyStaleIDs() {
        let available = [
            renderedStar(hr: 10, name: "First", altitudeDegrees: 30),
            renderedStar(hr: 20, name: "Second", altitudeDegrees: -20),
        ]
        let filtered = [available[0]]

        XCTAssertEqual(
            StarListPolicy.preservedSelection(
                currentHR: 20,
                availableStars: available,
                fallbackCandidates: filtered
            ),
            20
        )
        XCTAssertEqual(
            StarListPolicy.preservedSelection(
                currentHR: 99,
                availableStars: available,
                fallbackCandidates: filtered
            ),
            10
        )
        XCTAssertEqual(
            StarListPolicy.preservedSelection(
                currentHR: nil,
                availableStars: available,
                fallbackCandidates: filtered
            ),
            10
        )
        XCTAssertNil(
            StarListPolicy.preservedSelection(
                currentHR: 99,
                availableStars: available,
                fallbackCandidates: []
            )
        )
    }

    func testSelectionExclusionIsDeterministicAndCanCombineReasons() {
        let selected = renderedStar(
            hr: 20,
            name: "Sirius",
            nameJa: "シリウス",
            aliases: ["天狼星"],
            altitudeDegrees: -20
        )

        XCTAssertEqual(
            StarListPolicy.selectionExclusion(
                currentHR: 20,
                stars: [selected],
                query: "",
                visibleOnly: true
            ),
            [.belowHorizon]
        )
        XCTAssertEqual(
            StarListPolicy.selectionExclusion(
                currentHR: 20,
                stars: [selected],
                query: "ベガ",
                visibleOnly: false
            ),
            [.searchQuery]
        )
        XCTAssertEqual(
            StarListPolicy.selectionExclusion(
                currentHR: 20,
                stars: [selected],
                query: "ベガ",
                visibleOnly: true
            ),
            [.belowHorizon, .searchQuery]
        )
        XCTAssertNil(
            StarListPolicy.selectionExclusion(
                currentHR: 20,
                stars: [selected],
                query: "天狼",
                visibleOnly: false
            )
        )
        XCTAssertNil(
            StarListPolicy.selectionExclusion(
                currentHR: 99,
                stars: [selected],
                query: "",
                visibleOnly: true
            )
        )
    }

    func testAdjacentSelectionDoesNotWrapAndSupportsMissingSelection() {
        let candidates = [
            renderedStar(hr: 10, name: "First", altitudeDegrees: 30),
            renderedStar(hr: 20, name: "Second", altitudeDegrees: 20),
            renderedStar(hr: 30, name: "Third", altitudeDegrees: 10),
        ]

        XCTAssertEqual(
            StarListPolicy.adjacentSelection(
                currentHR: 20,
                candidates: candidates,
                offset: -1
            ),
            10
        )
        XCTAssertEqual(
            StarListPolicy.adjacentSelection(
                currentHR: 20,
                candidates: candidates,
                offset: 1
            ),
            30
        )
        XCTAssertNil(
            StarListPolicy.adjacentSelection(
                currentHR: 10,
                candidates: candidates,
                offset: -1
            )
        )
        XCTAssertEqual(
            StarListPolicy.adjacentSelection(
                currentHR: nil,
                candidates: candidates,
                offset: -1
            ),
            30
        )
    }

    func testEmptyReasonOffersShowAllOnlyForActualHiddenMatches() {
        let hidden = renderedStar(
            hr: 40,
            name: "Sirius",
            nameJa: "シリウス",
            altitudeDegrees: -10
        )

        XCTAssertEqual(
            StarListPolicy.emptyReason(
                stars: [hidden],
                query: "シリウス",
                visibleOnly: true
            ),
            .hiddenMatches(count: 1)
        )
        XCTAssertEqual(
            StarListPolicy.emptyReason(
                stars: [hidden],
                query: "not-a-star",
                visibleOnly: true
            ),
            .noSearchMatches
        )
        XCTAssertNil(
            StarListPolicy.emptyReason(
                stars: [hidden],
                query: "Sirius",
                visibleOnly: false
            )
        )
    }

    func testEmptyReasonSeparatesEmptyCatalogFromSearchMiss() {
        XCTAssertEqual(
            StarListPolicy.emptyReason(
                stars: [],
                query: "",
                visibleOnly: true
            ),
            .noNamedStars
        )
        XCTAssertEqual(
            StarListPolicy.emptyReason(
                stars: [],
                query: "Vega",
                visibleOnly: true
            ),
            .noSearchMatches
        )
    }

    private func renderedStar(
        hr: Int,
        name: String,
        nameJa: String = "",
        aliases: [String] = [],
        altitudeDegrees: Double,
        magnitude: Double = 1
    ) -> RenderedStar {
        RenderedStar(
            catalog: CatalogStar(
                hr: hr,
                hd: nil,
                rightAscension: 0,
                declination: 0,
                visualMagnitude: magnitude,
                bvColor: nil,
                catalogName: nil,
                spectralType: nil
            ),
            name: NamedStar(
                hr: hr,
                name: name,
                nameJa: nameJa,
                aliases: aliases,
                constellation: "Test"
            ),
            horizontal: HorizontalCoordinates(
                altitude: Angles.radians(fromDegrees: altitudeDegrees),
                azimuth: 0
            ),
            projection: ProjectedPoint(x: 0, y: 0)
        )
    }
}
