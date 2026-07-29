import XCTest

@testable import Planetarium
@testable import PlanetariumCore

final class SunMarkerStyleTests: XCTestCase {
    func testTwoDVisibilityIncludesHorizonAndRejectsInvalidAltitude() {
        XCTAssertTrue(
            SunMarkerStyle.isVisibleInTwoD(
                altitudeRadians: 0
            )
        )
        XCTAssertTrue(
            SunMarkerStyle.isVisibleInTwoD(
                altitudeRadians: .pi / 4
            )
        )
        XCTAssertFalse(
            SunMarkerStyle.isVisibleInTwoD(
                altitudeRadians: -Double.leastNonzeroMagnitude
            )
        )
        XCTAssertFalse(
            SunMarkerStyle.isVisibleInTwoD(
                altitudeRadians: .nan
            )
        )
    }

    func testHighContrastEnlargesAndStrengthensTwoDMarker() {
        let standard = SunMarkerStyle.twoDMetrics(
            increasedContrast: false
        )
        let highContrast = SunMarkerStyle.twoDMetrics(
            increasedContrast: true
        )

        XCTAssertGreaterThan(
            highContrast.diameter,
            standard.diameter
        )
        XCTAssertGreaterThan(
            highContrast.outerDiameter,
            standard.outerDiameter
        )
        XCTAssertGreaterThan(
            highContrast.opacity,
            standard.opacity
        )
        XCTAssertGreaterThan(
            highContrast.outlineOpacity,
            standard.outlineOpacity
        )
        XCTAssertFalse(standard.usesDashedOutline)
        XCTAssertFalse(highContrast.usesDashedOutline)
    }

    func testThreeDMarkerWeakensBelowHorizonAndOnBack() {
        let aboveFront = SunMarkerStyle.threeDMetrics(
            isAboveHorizon: true,
            isFrontFacing: true,
            increasedContrast: false
        )
        let aboveBack = SunMarkerStyle.threeDMetrics(
            isAboveHorizon: true,
            isFrontFacing: false,
            increasedContrast: false
        )
        let belowFront = SunMarkerStyle.threeDMetrics(
            isAboveHorizon: false,
            isFrontFacing: true,
            increasedContrast: false
        )
        let belowBack = SunMarkerStyle.threeDMetrics(
            isAboveHorizon: false,
            isFrontFacing: false,
            increasedContrast: false
        )

        XCTAssertGreaterThan(
            aboveFront.opacity,
            aboveBack.opacity
        )
        XCTAssertGreaterThan(
            aboveFront.opacity,
            belowFront.opacity
        )
        XCTAssertLessThan(
            belowBack.opacity,
            aboveBack.opacity
        )
        XCTAssertLessThan(
            belowBack.opacity,
            belowFront.opacity
        )
        XCTAssertFalse(aboveFront.usesDashedOutline)
        XCTAssertTrue(aboveBack.usesDashedOutline)
        XCTAssertTrue(belowFront.usesDashedOutline)
        XCTAssertTrue(belowBack.usesDashedOutline)
    }

    func testHighContrastKeepsHiddenThreeDDirectionsDistinct() {
        let aboveFront = SunMarkerStyle.threeDMetrics(
            isAboveHorizon: true,
            isFrontFacing: true,
            increasedContrast: true
        )
        let belowBack = SunMarkerStyle.threeDMetrics(
            isAboveHorizon: false,
            isFrontFacing: false,
            increasedContrast: true
        )

        XCTAssertGreaterThan(belowBack.opacity, 0)
        XCTAssertLessThan(
            belowBack.opacity,
            aboveFront.opacity
        )
        XCTAssertLessThanOrEqual(
            belowBack.outlineOpacity,
            1
        )
        XCTAssertGreaterThan(
            belowBack.diameter,
            SunMarkerStyle.threeDMetrics(
                isAboveHorizon: false,
                isFrontFacing: false,
                increasedContrast: false
            ).diameter
        )
    }

    func testSphereGeometryClampsZoomAndRoundTripsProjection() throws {
        let size = CGSize(width: 420, height: 360)
        let standard = try XCTUnwrap(
            SphereCanvasGeometry(size: size, zoom: 1)
        )
        let minimum = try XCTUnwrap(
            SphereCanvasGeometry(size: size, zoom: -100)
        )
        let maximum = try XCTUnwrap(
            SphereCanvasGeometry(size: size, zoom: 100)
        )
        let invalid = try XCTUnwrap(
            SphereCanvasGeometry(size: size, zoom: .nan)
        )

        XCTAssertEqual(
            minimum.radius / standard.radius,
            CelestialSphereZoom.minimum,
            accuracy: 1e-12
        )
        XCTAssertEqual(
            maximum.radius / standard.radius,
            CelestialSphereZoom.maximum,
            accuracy: 1e-12
        )
        XCTAssertEqual(invalid.zoom, CelestialSphereZoom.defaultValue)

        let projected = ProjectedPoint(x: 0.31, y: -0.44)
        let roundTrip = maximum.projectedPoint(
            for: maximum.point(for: projected)
        )
        XCTAssertEqual(roundTrip.x, projected.x, accuracy: 1e-12)
        XCTAssertEqual(roundTrip.y, projected.y, accuracy: 1e-12)

        let guide = maximum.directionGuidePoint(
            for: ProjectedPoint(x: 1, y: 0)
        )
        XCTAssertEqual(
            guide.x,
            standard.center.x + standard.referenceRadius,
            accuracy: 1e-12
        )
        XCTAssertEqual(guide.y, standard.center.y, accuracy: 1e-12)
    }
}
