import Foundation

public struct Vector3D: Hashable, Sendable {
    public let x: Double
    public let y: Double
    public let z: Double

    public static let zero = Vector3D(x: 0, y: 0, z: 0)
    public static let unitX = Vector3D(x: 1, y: 0, z: 0)
    public static let unitY = Vector3D(x: 0, y: 1, z: 0)
    public static let unitZ = Vector3D(x: 0, y: 0, z: 1)

    public init(x: Double, y: Double, z: Double) {
        self.x = x
        self.y = y
        self.z = z
    }

    public var isFinite: Bool {
        x.isFinite && y.isFinite && z.isFinite
    }

    public var lengthSquared: Double {
        x * x + y * y + z * z
    }

    public var length: Double {
        sqrt(lengthSquared)
    }

    public func normalized(epsilon: Double = 1e-12) -> Vector3D? {
        guard isFinite else { return nil }
        let magnitude = length
        guard magnitude.isFinite, magnitude > epsilon else { return nil }
        return self / magnitude
    }

    public func dot(_ other: Vector3D) -> Double {
        x * other.x + y * other.y + z * other.z
    }

    public func cross(_ other: Vector3D) -> Vector3D {
        Vector3D(
            x: y * other.z - z * other.y,
            y: z * other.x - x * other.z,
            z: x * other.y - y * other.x
        )
    }

    public static prefix func - (value: Vector3D) -> Vector3D {
        Vector3D(x: -value.x, y: -value.y, z: -value.z)
    }

    public static func + (left: Vector3D, right: Vector3D) -> Vector3D {
        Vector3D(
            x: left.x + right.x,
            y: left.y + right.y,
            z: left.z + right.z
        )
    }

    public static func - (left: Vector3D, right: Vector3D) -> Vector3D {
        Vector3D(
            x: left.x - right.x,
            y: left.y - right.y,
            z: left.z - right.z
        )
    }

    public static func * (vector: Vector3D, scalar: Double) -> Vector3D {
        Vector3D(
            x: vector.x * scalar,
            y: vector.y * scalar,
            z: vector.z * scalar
        )
    }

    public static func * (scalar: Double, vector: Vector3D) -> Vector3D {
        vector * scalar
    }

    public static func / (vector: Vector3D, scalar: Double) -> Vector3D {
        Vector3D(
            x: vector.x / scalar,
            y: vector.y / scalar,
            z: vector.z / scalar
        )
    }
}
