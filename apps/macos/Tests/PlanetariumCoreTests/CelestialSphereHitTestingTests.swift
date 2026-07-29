import XCTest

@testable import PlanetariumCore

final class CelestialSphereHitTestingTests: XCTestCase {
    func testFrontHemisphereHitTestExcludesBackTarget() {
        let targets = [
            CelestialSphereHitTarget(
                id: 1,
                direction: -.unitZ,
                selectionPriority: -1
            ),
            CelestialSphereHitTarget(
                id: 2,
                direction: Vector3D(x: 0.05, y: 0, z: 1),
                selectionPriority: 1
            ),
        ]

        XCTAssertEqual(
            CelestialSphereHitTesting.closestTargetID(
                to: ProjectedPoint(x: 0, y: 0),
                among: targets,
                maximumDistance: 0.1
            ),
            2
        )
    }

    func testEntireSphereOverlapPrefersNearerDepthBeforeMagnitude() {
        let targets = [
            CelestialSphereHitTarget(
                id: 1,
                direction: -.unitZ,
                selectionPriority: -10
            ),
            CelestialSphereHitTarget(
                id: 2,
                direction: .unitZ,
                selectionPriority: 10
            ),
        ]

        XCTAssertEqual(
            CelestialSphereHitTesting.closestTargetID(
                to: ProjectedPoint(x: 0, y: 0),
                among: targets,
                maximumDistance: 0,
                visibility: .entireSphere
            ),
            2
        )
    }

    func testTieBreakUsesPriorityThenStableID() {
        let targets = [
            CelestialSphereHitTarget(
                id: 3,
                direction: .unitX,
                selectionPriority: 1
            ),
            CelestialSphereHitTarget(
                id: 2,
                direction: .unitX,
                selectionPriority: 1
            ),
            CelestialSphereHitTarget(
                id: 1,
                direction: .unitX,
                selectionPriority: 2
            ),
        ]

        XCTAssertEqual(
            CelestialSphereHitTesting.closestTargetID(
                to: ProjectedPoint(x: 1, y: 0),
                among: targets,
                maximumDistance: 0
            ),
            2
        )
    }

    func testOrientationAndInvalidInputsAreAppliedConsistently() {
        let orientation = CelestialSphereOrientation.identity.applyingRotation(
            angle: .pi / 2,
            axis: .unitY
        )
        let target = CelestialSphereHitTarget(
            id: 7,
            direction: .unitZ,
            selectionPriority: 0
        )

        XCTAssertEqual(
            CelestialSphereHitTesting.closestTargetID(
                to: ProjectedPoint(x: 1, y: 0),
                among: [target],
                orientation: orientation,
                maximumDistance: 1e-9
            ),
            7
        )
        XCTAssertNil(
            CelestialSphereHitTesting.closestTargetID(
                to: ProjectedPoint(x: .nan, y: 0),
                among: [target],
                maximumDistance: 1
            )
        )
        XCTAssertNil(
            CelestialSphereHitTesting.closestTargetID(
                to: ProjectedPoint(x: 0, y: 0),
                among: [target],
                maximumDistance: -1
            )
        )
    }
}
