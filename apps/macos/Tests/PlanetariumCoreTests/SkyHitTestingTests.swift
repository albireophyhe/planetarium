import XCTest

@testable import PlanetariumCore

final class SkyHitTestingTests: XCTestCase {
    func testClosestStarWithinThresholdIsSelected() {
        let stars = [
            renderedStar(hr: 1, x: 0.1, y: 0.1),
            renderedStar(hr: 2, x: 0.4, y: 0.4),
        ]

        XCTAssertEqual(
            SkyHitTesting.closestStarHR(
                to: ProjectedPoint(x: 0, y: 0),
                among: stars,
                maximumDistance: 0.2
            ),
            1
        )
        XCTAssertNil(
            SkyHitTesting.closestStarHR(
                to: ProjectedPoint(x: 0, y: 0),
                among: stars,
                maximumDistance: 0.05
            )
        )
    }

    func testBelowHorizonStarIsIgnoredEvenWhenCloser() {
        let stars = [
            renderedStar(hr: 1, x: 0, y: 0, altitudeDegrees: -1),
            renderedStar(hr: 2, x: 0.1, y: 0.1, altitudeDegrees: 10),
        ]

        XCTAssertEqual(
            SkyHitTesting.closestStarHR(
                to: ProjectedPoint(x: 0, y: 0),
                among: stars,
                maximumDistance: 0.2
            ),
            2
        )
    }

    func testInvalidPointThresholdAndProjectionReturnNoSelection() {
        let invalidProjection = renderedStar(hr: 1, x: .nan, y: 0)

        XCTAssertNil(
            SkyHitTesting.closestStarHR(
                to: ProjectedPoint(x: .nan, y: 0),
                among: [renderedStar(hr: 2, x: 0, y: 0)],
                maximumDistance: 1
            )
        )
        XCTAssertNil(
            SkyHitTesting.closestStarHR(
                to: ProjectedPoint(x: 0, y: 0),
                among: [invalidProjection],
                maximumDistance: 1
            )
        )
        XCTAssertNil(
            SkyHitTesting.closestStarHR(
                to: ProjectedPoint(x: 0, y: 0),
                among: [renderedStar(hr: 2, x: 0, y: 0)],
                maximumDistance: -1
            )
        )
    }

    func testExactDistanceTiePrefersBrighterThenLowerHR() {
        let dim = renderedStar(hr: 1, x: 0.1, y: 0, magnitude: 2)
        let brightHighHR = renderedStar(hr: 3, x: -0.1, y: 0, magnitude: 1)
        let brightLowHR = renderedStar(hr: 2, x: 0, y: 0.1, magnitude: 1)

        XCTAssertEqual(
            SkyHitTesting.closestStarHR(
                to: ProjectedPoint(x: 0, y: 0),
                among: [dim, brightHighHR, brightLowHR],
                maximumDistance: 0.1
            ),
            2
        )
    }

    private func renderedStar(
        hr: Int,
        x: Double,
        y: Double,
        altitudeDegrees: Double = 10,
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
            name: nil,
            horizontal: HorizontalCoordinates(
                altitude: Angles.radians(fromDegrees: altitudeDegrees),
                azimuth: 0
            ),
            projection: ProjectedPoint(x: x, y: y)
        )
    }
}
