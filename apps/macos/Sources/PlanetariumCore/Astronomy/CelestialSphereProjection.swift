import Foundation

public enum CelestialSphereProjectionMode: Hashable, Sendable {
    case orthographic
    /// Camera distance is measured in sphere radii and must be greater than 1.
    case perspective(cameraDistance: Double)
}

public struct CelestialSphereProjectedPoint: Hashable, Sendable {
    public let point: ProjectedPoint
    /// Camera-space depth: +1 is the centre of the near hemisphere.
    public let depth: Double
    public let isFrontFacing: Bool

    public init(
        point: ProjectedPoint,
        depth: Double,
        isFrontFacing: Bool
    ) {
        self.point = point
        self.depth = depth
        self.isFrontFacing = isFrontFacing
    }
}

public enum CelestialSphereZoom {
    public static let minimum = 0.75
    public static let maximum = 2.50
    public static let defaultValue = 1.0
    public static let step = 0.25

    public static func clamped(_ zoom: Double) -> Double {
        guard zoom.isFinite else { return defaultValue }
        return Swift.max(minimum, Swift.min(maximum, zoom))
    }

    public static func applyingMagnification(
        _ magnification: Double,
        to baseZoom: Double
    ) -> Double {
        let base = clamped(baseZoom)
        guard magnification.isFinite, magnification > 0 else {
            return base
        }
        if magnification >= maximum / base {
            return maximum
        }
        if magnification <= minimum / base {
            return minimum
        }
        return clamped(base * magnification)
    }

    public static func stepped(
        from zoom: Double,
        by steps: Int
    ) -> Double {
        clamped(clamped(zoom) + Double(steps) * step)
    }
}

public enum CelestialSphereReferenceDirection:
    CaseIterable,
    Hashable,
    Sendable
{
    case north
    case east
    case south
    case west
    case zenith
    case nadir

    public var direction: Vector3D {
        switch self {
        case .north:
            .unitY
        case .east:
            .unitX
        case .south:
            -.unitY
        case .west:
            -.unitX
        case .zenith:
            .unitZ
        case .nadir:
            -.unitZ
        }
    }
}

public struct CelestialSphereOrientation: Hashable, Sendable {
    public private(set) var rotation: Quaternion

    public static let identity = CelestialSphereOrientation()

    public init(rotation: Quaternion = .identity) {
        self.rotation = rotation.normalized() ?? .identity
    }

    public mutating func reset() {
        rotation = .identity
    }

    public func applyingRotation(
        angle: Double,
        axis: Vector3D
    ) -> CelestialSphereOrientation {
        let delta = Quaternion(angle: angle, axis: axis)
        return CelestialSphereOrientation(rotation: delta * rotation)
    }

    /// Applies a virtual-trackball drag in normalized view coordinates, where
    /// x grows rightward and y grows downward.
    public func applyingTrackballDrag(
        from start: ProjectedPoint,
        to end: ProjectedPoint
    ) -> CelestialSphereOrientation {
        guard let startVector = Self.trackballVector(for: start),
              let endVector = Self.trackballVector(for: end),
              let delta = Quaternion.rotation(from: startVector, to: endVector)
        else {
            return self
        }
        return CelestialSphereOrientation(rotation: delta * rotation)
    }

    public func rotated(_ direction: Vector3D) -> Vector3D? {
        rotation.rotated(direction)
    }

    private static func trackballVector(
        for point: ProjectedPoint
    ) -> Vector3D? {
        guard point.x.isFinite, point.y.isFinite else { return nil }

        let x = point.x
        let y = -point.y
        let radiusSquared = x * x + y * y
        if radiusSquared <= 1 {
            return Vector3D(
                x: x,
                y: y,
                z: sqrt(max(0, 1 - radiusSquared))
            )
        }

        let radius = sqrt(radiusSquared)
        return Vector3D(x: x / radius, y: y / radius, z: 0)
    }
}

public enum CelestialSphere {
    /// Horizontal coordinates use x=east, y=north and z=up.
    public static func direction(
        for coordinates: HorizontalCoordinates
    ) -> Vector3D? {
        guard coordinates.altitude.isFinite, coordinates.azimuth.isFinite else {
            return nil
        }
        let horizontalLength = cos(coordinates.altitude)
        return Vector3D(
            x: horizontalLength * sin(coordinates.azimuth),
            y: horizontalLength * cos(coordinates.azimuth),
            z: sin(coordinates.altitude)
        ).normalized()
    }

    public static func horizontalCoordinates(
        for direction: Vector3D
    ) -> HorizontalCoordinates? {
        guard let unit = direction.normalized() else { return nil }
        let altitude = asin(Angles.clamped(unit.z))
        let horizontalLength = hypot(unit.x, unit.y)
        let azimuthIsDefined = horizontalLength > 1e-12
        let azimuth = azimuthIsDefined
            ? Angles.normalizedRadians(atan2(unit.x, unit.y))
            : 0
        return HorizontalCoordinates(
            altitude: altitude,
            azimuth: azimuth,
            azimuthIsDefined: azimuthIsDefined
        )
    }

    public static func project(
        direction: Vector3D,
        orientation: CelestialSphereOrientation = .identity,
        mode: CelestialSphereProjectionMode = .orthographic
    ) -> CelestialSphereProjectedPoint? {
        guard let unitDirection = direction.normalized(),
              let cameraDirection = orientation.rotated(unitDirection),
              cameraDirection.isFinite
        else {
            return nil
        }

        let scale: Double
        switch mode {
        case .orthographic:
            scale = 1
        case let .perspective(cameraDistance):
            guard cameraDistance.isFinite, cameraDistance > 1 else {
                return nil
            }
            let denominator = cameraDistance - cameraDirection.z
            guard denominator.isFinite, denominator > 0 else { return nil }
            scale = cameraDistance / denominator
        }

        return CelestialSphereProjectedPoint(
            point: ProjectedPoint(
                x: cameraDirection.x * scale,
                y: -cameraDirection.y * scale
            ),
            depth: cameraDirection.z,
            // Keep points on the numerical limb selectable after quaternion
            // round-off.
            isFrontFacing: cameraDirection.z >= -1e-12
        )
    }
}
