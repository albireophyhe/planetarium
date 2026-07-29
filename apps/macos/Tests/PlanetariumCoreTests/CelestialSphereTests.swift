import XCTest

@testable import PlanetariumCore

final class CelestialSphereTests: XCTestCase {
    func testVectorOperationsAndQuaternionQuarterTurn() throws {
        XCTAssertEqual(Vector3D.unitX.dot(.unitY), 0)
        XCTAssertEqual(Vector3D.unitX.cross(.unitY), .unitZ)

        let rotation = Quaternion(angle: .pi / 2, axis: .unitZ)
        let rotated = try XCTUnwrap(rotation.rotated(.unitX))
        assertVector(rotated, equals: .unitY)
        XCTAssertEqual(rotation.normalized()?.lengthSquared ?? 0, 1, accuracy: 1e-12)
    }

    func testQuaternionFromAntipodalVectorsIsStable() throws {
        let rotation = try XCTUnwrap(
            Quaternion.rotation(from: .unitZ, to: -.unitZ)
        )
        let rotated = try XCTUnwrap(rotation.rotated(.unitZ))

        assertVector(rotated, equals: -.unitZ)
        XCTAssertTrue(rotated.isFinite)
    }

    func testHorizontalDirectionUsesEastNorthUpAxesAndRoundTrips() throws {
        let north = try XCTUnwrap(
            CelestialSphere.direction(
                for: HorizontalCoordinates(altitude: 0, azimuth: 0)
            )
        )
        assertVector(north, equals: .unitY)

        let east = try XCTUnwrap(
            CelestialSphere.direction(
                for: HorizontalCoordinates(altitude: 0, azimuth: .pi / 2)
            )
        )
        assertVector(east, equals: .unitX)

        let original = HorizontalCoordinates(
            altitude: Angles.radians(fromDegrees: 27.5),
            azimuth: Angles.radians(fromDegrees: 231.25)
        )
        let direction = try XCTUnwrap(CelestialSphere.direction(for: original))
        let roundTrip = try XCTUnwrap(
            CelestialSphere.horizontalCoordinates(for: direction)
        )
        XCTAssertEqual(roundTrip.altitude, original.altitude, accuracy: 1e-12)
        XCTAssertEqual(roundTrip.azimuth, original.azimuth, accuracy: 1e-12)
        XCTAssertTrue(roundTrip.azimuthIsDefined)
    }

    func testOrthographicAndPerspectiveProjectionExposeDepth() throws {
        let zenith = try XCTUnwrap(
            CelestialSphere.project(direction: .unitZ)
        )
        XCTAssertEqual(zenith.point.x, 0, accuracy: 1e-12)
        XCTAssertEqual(zenith.point.y, 0, accuracy: 1e-12)
        XCTAssertEqual(zenith.depth, 1, accuracy: 1e-12)
        XCTAssertTrue(zenith.isFrontFacing)

        let nadir = try XCTUnwrap(
            CelestialSphere.project(direction: -.unitZ)
        )
        XCTAssertFalse(nadir.isFrontFacing)
        XCTAssertEqual(nadir.depth, -1, accuracy: 1e-12)

        let diagonal = try XCTUnwrap(
            Vector3D(x: sqrt(3) / 2, y: 0, z: 0.5).normalized()
        )
        let perspective = try XCTUnwrap(
            CelestialSphere.project(
                direction: diagonal,
                mode: .perspective(cameraDistance: 3)
            )
        )
        XCTAssertEqual(
            perspective.point.x,
            (sqrt(3) / 2) * 3 / 2.5,
            accuracy: 1e-12
        )
        XCTAssertNil(
            CelestialSphere.project(
                direction: diagonal,
                mode: .perspective(cameraDistance: 1)
            )
        )

        let numericalLimb = try XCTUnwrap(
            CelestialSphere.project(
                direction: Vector3D(x: 1, y: 0, z: -1e-14)
            )
        )
        XCTAssertTrue(numericalLimb.isFrontFacing)
    }

    func testTrackballDragMovesGrabbedPointAndResetRestoresIdentity() throws {
        let dragged = CelestialSphereOrientation.identity.applyingTrackballDrag(
            from: ProjectedPoint(x: 0, y: 0),
            to: ProjectedPoint(x: 0.5, y: 0)
        )
        let projected = try XCTUnwrap(
            CelestialSphere.project(
                direction: .unitZ,
                orientation: dragged
            )
        )
        XCTAssertEqual(projected.point.x, 0.5, accuracy: 1e-12)
        XCTAssertEqual(projected.point.y, 0, accuracy: 1e-12)
        XCTAssertEqual(dragged.rotation.lengthSquared, 1, accuracy: 1e-12)

        var reset = dragged
        reset.reset()
        XCTAssertEqual(reset, .identity)
    }

    func testTrackballClampsOutsideDiscAndRejectsNonFiniteInput() throws {
        let outside = CelestialSphereOrientation.identity.applyingTrackballDrag(
            from: ProjectedPoint(x: 0, y: 0),
            to: ProjectedPoint(x: 4, y: 3)
        )
        let rotated = try XCTUnwrap(outside.rotated(.unitZ))
        XCTAssertTrue(rotated.isFinite)
        XCTAssertEqual(rotated.length, 1, accuracy: 1e-12)

        let invalid = outside.applyingTrackballDrag(
            from: ProjectedPoint(x: .nan, y: 0),
            to: ProjectedPoint(x: 0, y: 0)
        )
        XCTAssertEqual(invalid, outside)
    }

    func testZoomClampsStepsAndMagnificationToFiniteRange() {
        XCTAssertEqual(
            CelestialSphereZoom.clamped(-100),
            CelestialSphereZoom.minimum
        )
        XCTAssertEqual(
            CelestialSphereZoom.clamped(100),
            CelestialSphereZoom.maximum
        )
        XCTAssertEqual(
            CelestialSphereZoom.clamped(.nan),
            CelestialSphereZoom.defaultValue
        )
        XCTAssertEqual(
            CelestialSphereZoom.clamped(.infinity),
            CelestialSphereZoom.defaultValue
        )
        XCTAssertEqual(
            CelestialSphereZoom.stepped(
                from: CelestialSphereZoom.defaultValue,
                by: 1
            ),
            CelestialSphereZoom.defaultValue
                + CelestialSphereZoom.step
        )
        XCTAssertEqual(
            CelestialSphereZoom.stepped(from: 100, by: 1),
            CelestialSphereZoom.maximum
        )
        XCTAssertEqual(
            CelestialSphereZoom.applyingMagnification(
                1.5,
                to: 1
            ),
            1.5
        )
        XCTAssertEqual(
            CelestialSphereZoom.applyingMagnification(
                .greatestFiniteMagnitude,
                to: 2
            ),
            CelestialSphereZoom.maximum
        )
        XCTAssertEqual(
            CelestialSphereZoom.applyingMagnification(
                0,
                to: 1.25
            ),
            1.25
        )
    }

    func testReferenceDirectionsFollowQuaternionProjection() throws {
        let identityExpected: [
            CelestialSphereReferenceDirection: (
                x: Double,
                y: Double,
                depth: Double
            )
        ] = [
            .north: (0, -1, 0),
            .east: (1, 0, 0),
            .south: (0, 1, 0),
            .west: (-1, 0, 0),
            .zenith: (0, 0, 1),
            .nadir: (0, 0, -1),
        ]
        for (reference, expected) in identityExpected {
            let projection = try XCTUnwrap(
                CelestialSphere.project(
                    direction: reference.direction
                )
            )
            XCTAssertEqual(
                projection.point.x,
                expected.x,
                accuracy: 1e-12
            )
            XCTAssertEqual(
                projection.point.y,
                expected.y,
                accuracy: 1e-12
            )
            XCTAssertEqual(
                projection.depth,
                expected.depth,
                accuracy: 1e-12
            )
        }

        let orientation =
            CelestialSphereOrientation.identity
                .applyingRotation(
                    angle: 0.71,
                    axis: .unitY
                )
                .applyingRotation(
                    angle: -0.38,
                    axis: .unitX
                )
        let oppositePairs: [
            (
                CelestialSphereReferenceDirection,
                CelestialSphereReferenceDirection
            )
        ] = [
            (.north, .south),
            (.east, .west),
            (.zenith, .nadir),
        ]
        for (first, opposite) in oppositePairs {
            let firstProjection = try XCTUnwrap(
                CelestialSphere.project(
                    direction: first.direction,
                    orientation: orientation
                )
            )
            let oppositeProjection = try XCTUnwrap(
                CelestialSphere.project(
                    direction: opposite.direction,
                    orientation: orientation
                )
            )
            XCTAssertEqual(
                firstProjection.point.x,
                -oppositeProjection.point.x,
                accuracy: 1e-12
            )
            XCTAssertEqual(
                firstProjection.point.y,
                -oppositeProjection.point.y,
                accuracy: 1e-12
            )
            XCTAssertEqual(
                firstProjection.depth,
                -oppositeProjection.depth,
                accuracy: 1e-12
            )
        }
    }

    private func assertVector(
        _ actual: Vector3D,
        equals expected: Vector3D,
        accuracy: Double = 1e-12,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(actual.x, expected.x, accuracy: accuracy, file: file, line: line)
        XCTAssertEqual(actual.y, expected.y, accuracy: accuracy, file: file, line: line)
        XCTAssertEqual(actual.z, expected.z, accuracy: accuracy, file: file, line: line)
    }
}
