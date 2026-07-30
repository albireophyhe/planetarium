import XCTest

@testable import PlanetariumCore

final class EventSceneGeometryTests: XCTestCase {
    func testTangentOffsetTracksEastAndAltitudeDirections()
        throws
    {
        let reference = HorizontalCoordinates(
            altitude: 30 * .pi / 180,
            azimuth: 120 * .pi / 180
        )
        let east = try XCTUnwrap(
            EventSceneGeometryV1.tangentOffset(
                reference: reference,
                target: HorizontalCoordinates(
                    altitude: reference.altitude,
                    azimuth:
                        reference.azimuth
                        + 0.01 * .pi / 180
                )
            )
        )
        XCTAssertGreaterThan(east.eastwardRadians, 0)
        XCTAssertEqual(
            east.upwardRadians,
            0,
            accuracy: 2e-8
        )

        let upward = try XCTUnwrap(
            EventSceneGeometryV1.tangentOffset(
                reference: reference,
                target: HorizontalCoordinates(
                    altitude:
                        reference.altitude
                        + 0.01 * .pi / 180,
                    azimuth: reference.azimuth
                )
            )
        )
        XCTAssertEqual(
            upward.eastwardRadians,
            0,
            accuracy: 1e-12
        )
        XCTAssertGreaterThan(
            upward.upwardRadians,
            0
        )
    }

    func testTangentOffsetHandlesAzimuthWrap() throws {
        let offset = try XCTUnwrap(
            EventSceneGeometryV1.tangentOffset(
                reference: HorizontalCoordinates(
                    altitude: 0,
                    azimuth:
                        359.99 * .pi / 180
                ),
                target: HorizontalCoordinates(
                    altitude: 0,
                    azimuth:
                        0.01 * .pi / 180
                )
            )
        )

        XCTAssertEqual(
            offset.separationRadians,
            0.02 * .pi / 180,
            accuracy: 1e-13
        )
        XCTAssertGreaterThan(
            offset.eastwardRadians,
            0
        )
        XCTAssertEqual(
            offset.positionAngleRadians,
            .pi / 2,
            accuracy: 1e-12
        )
    }

    func testPositionAngleOffsetUsesNorthThroughEastConvention()
        throws
    {
        let north = try XCTUnwrap(
            EventSceneGeometryV1.tangentOffset(
                separationRadians: 0.25,
                positionAngleRadians: 0
            )
        )
        XCTAssertEqual(
            north.eastwardRadians,
            0,
            accuracy: 1e-15
        )
        XCTAssertEqual(
            north.upwardRadians,
            0.25,
            accuracy: 1e-15
        )

        let east = try XCTUnwrap(
            EventSceneGeometryV1.tangentOffset(
                separationRadians: 0.25,
                positionAngleRadians: .pi / 2
            )
        )
        XCTAssertEqual(
            east.eastwardRadians,
            0.25,
            accuracy: 1e-15
        )
        XCTAssertEqual(
            east.upwardRadians,
            0,
            accuracy: 1e-15
        )
    }

    func testTangentOffsetRejectsInvalidCoordinates() {
        XCTAssertNil(
            EventSceneGeometryV1.tangentOffset(
                reference: HorizontalCoordinates(
                    altitude: .nan,
                    azimuth: 0
                ),
                target: HorizontalCoordinates(
                    altitude: 0,
                    azimuth: 0
                )
            )
        )
        XCTAssertNil(
            EventSceneGeometryV1.tangentOffset(
                reference: HorizontalCoordinates(
                    altitude: 0,
                    azimuth: 0
                ),
                target: HorizontalCoordinates(
                    altitude: .pi,
                    azimuth: 0
                )
            )
        )
        XCTAssertNil(
            EventSceneGeometryV1.tangentOffset(
                separationRadians: -1,
                positionAngleRadians: 0
            )
        )
    }

    func testSchematicImmersionIncreasesWithMagnitude()
        throws
    {
        let shallow = try XCTUnwrap(
            EventSceneGeometryV1
                .lunarEclipseSchematic(
                    magnitude: 0.2,
                    usesPenumbralMagnitude: false
                )
        )
        let deep = try XCTUnwrap(
            EventSceneGeometryV1
                .lunarEclipseSchematic(
                    magnitude: 1.2,
                    usesPenumbralMagnitude: false
                )
        )

        XCTAssertLessThan(
            deep.moonCenterDistance,
            shallow.moonCenterDistance
        )
        XCTAssertEqual(
            shallow.umbralRadius,
            deep.umbralRadius
        )
        XCTAssertFalse(deep.usesPenumbralMagnitude)
    }

    func testSchematicRejectsNonfiniteMagnitude() {
        XCTAssertNil(
            EventSceneGeometryV1
                .lunarEclipseSchematic(
                    magnitude: .infinity,
                    usesPenumbralMagnitude: true
                )
        )
    }

    func testLunarLayoutPrefersPhysicalShadowGeometry()
        throws
    {
        let shadow = LunarShadowGeometryV1(
            centerSeparationRadians: 0.003,
            centerPositionAngleRadians: .pi / 2,
            penumbralAngularRadiusRadians: 0.012,
            umbralAngularRadiusRadians: 0.008
        )
        let layout = try XCTUnwrap(
            EventSceneGeometryV1
                .lunarEclipseLayout(
                    moonAngularRadiusRadians:
                        0.0045,
                    shadow: shadow,
                    // An intentionally unrelated value proves the
                    // schematic path was not used.
                    magnitude: 99,
                    usesPenumbralMagnitude:
                        false
                )
        )

        XCTAssertEqual(layout.source, .physical)
        XCTAssertEqual(
            layout.penumbralRadius,
            0.012
        )
        XCTAssertEqual(
            layout.umbralRadius,
            0.008
        )
        XCTAssertEqual(
            layout.moonOffset
                .eastwardRadians,
            -0.003,
            accuracy: 1e-15
        )
        XCTAssertEqual(
            layout.moonOffset
                .upwardRadians,
            0,
            accuracy: 1e-15
        )
        XCTAssertTrue(layout.orientationIsDefined)
    }

    func testLunarLayoutUsesSchematicOnlyWhenShadowIsAbsent()
        throws
    {
        let fallback = try XCTUnwrap(
            EventSceneGeometryV1
                .lunarEclipseLayout(
                    moonAngularRadiusRadians:
                        0.0045,
                    shadow: nil,
                    magnitude: 0.7,
                    usesPenumbralMagnitude:
                        false
                )
        )
        XCTAssertEqual(
            fallback.source,
            .schematic
        )
        XCTAssertFalse(
            fallback.orientationIsDefined
        )

        let invalidShadow =
            LunarShadowGeometryV1(
                centerSeparationRadians: 0.003,
                centerPositionAngleRadians: 0,
                penumbralAngularRadiusRadians:
                    0.006,
                umbralAngularRadiusRadians:
                    0.008
            )
        XCTAssertNil(
            EventSceneGeometryV1
                .lunarEclipseLayout(
                    moonAngularRadiusRadians:
                        0.0045,
                    shadow: invalidShadow,
                    magnitude: 0.7,
                    usesPenumbralMagnitude:
                        false
                )
        )
    }
}
