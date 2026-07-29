import Foundation

public enum CelestialSphereHitVisibility: Equatable, Sendable {
    case frontHemisphere
    case entireSphere
}

public struct CelestialSphereHitTarget: Hashable, Sendable {
    public let id: Int
    public let direction: Vector3D
    /// Lower values win after screen distance and depth. Visual magnitude is a
    /// natural value for stars.
    public let selectionPriority: Double

    public init(
        id: Int,
        direction: Vector3D,
        selectionPriority: Double
    ) {
        self.id = id
        self.direction = direction
        self.selectionPriority = selectionPriority
    }

    public init?(star: RenderedStar) {
        guard let direction = CelestialSphere.direction(for: star.horizontal) else {
            return nil
        }
        self.init(
            id: star.hr,
            direction: direction,
            selectionPriority: star.catalog.visualMagnitude
        )
    }
}

public enum CelestialSphereHitTesting {
    public static func closestTargetID(
        to point: ProjectedPoint,
        among targets: [CelestialSphereHitTarget],
        orientation: CelestialSphereOrientation = .identity,
        projectionMode: CelestialSphereProjectionMode = .orthographic,
        maximumDistance: Double,
        visibility: CelestialSphereHitVisibility = .frontHemisphere
    ) -> Int? {
        guard point.x.isFinite,
              point.y.isFinite,
              maximumDistance.isFinite,
              maximumDistance >= 0
        else {
            return nil
        }

        return targets.compactMap { target -> Candidate? in
            guard let projected = CelestialSphere.project(
                direction: target.direction,
                orientation: orientation,
                mode: projectionMode
            ) else {
                return nil
            }
            if visibility == .frontHemisphere, !projected.isFrontFacing {
                return nil
            }

            let distance = hypot(
                projected.point.x - point.x,
                projected.point.y - point.y
            )
            guard distance.isFinite, distance <= maximumDistance else {
                return nil
            }
            return Candidate(
                id: target.id,
                distance: distance,
                depth: projected.depth,
                priority: target.selectionPriority.isFinite
                    ? target.selectionPriority
                    : .greatestFiniteMagnitude
            )
        }
        .min { first, second in
            Candidate.isPreferred(first, over: second)
        }?
        .id
    }

    private struct Candidate {
        let id: Int
        let distance: Double
        let depth: Double
        let priority: Double

        static func isPreferred(
            _ first: Candidate,
            over second: Candidate
        ) -> Bool {
            if first.distance != second.distance {
                return first.distance < second.distance
            }
            if first.depth != second.depth {
                return first.depth > second.depth
            }
            if first.priority != second.priority {
                return first.priority < second.priority
            }
            return first.id < second.id
        }
    }
}
