import Foundation

public struct Quaternion: Hashable, Sendable {
    public let w: Double
    public let x: Double
    public let y: Double
    public let z: Double

    public static let identity = Quaternion(w: 1, x: 0, y: 0, z: 0)

    public init(w: Double, x: Double, y: Double, z: Double) {
        self.w = w
        self.x = x
        self.y = y
        self.z = z
    }

    public init(angle: Double, axis: Vector3D) {
        guard angle.isFinite, let unitAxis = axis.normalized() else {
            self = .identity
            return
        }
        let halfAngle = angle / 2
        let scale = sin(halfAngle)
        self.init(
            w: cos(halfAngle),
            x: unitAxis.x * scale,
            y: unitAxis.y * scale,
            z: unitAxis.z * scale
        )
    }

    public var isFinite: Bool {
        w.isFinite && x.isFinite && y.isFinite && z.isFinite
    }

    public var lengthSquared: Double {
        w * w + x * x + y * y + z * z
    }

    public func normalized(epsilon: Double = 1e-12) -> Quaternion? {
        guard isFinite else { return nil }
        let magnitude = sqrt(lengthSquared)
        guard magnitude.isFinite, magnitude > epsilon else { return nil }
        return Quaternion(
            w: w / magnitude,
            x: x / magnitude,
            y: y / magnitude,
            z: z / magnitude
        )
    }

    public var conjugate: Quaternion {
        Quaternion(w: w, x: -x, y: -y, z: -z)
    }

    /// Hamilton product. `left * right` applies `right` first, then `left`.
    public static func * (left: Quaternion, right: Quaternion) -> Quaternion {
        Quaternion(
            w: left.w * right.w
                - left.x * right.x
                - left.y * right.y
                - left.z * right.z,
            x: left.w * right.x
                + left.x * right.w
                + left.y * right.z
                - left.z * right.y,
            y: left.w * right.y
                - left.x * right.z
                + left.y * right.w
                + left.z * right.x,
            z: left.w * right.z
                + left.x * right.y
                - left.y * right.x
                + left.z * right.w
        )
    }

    public func rotated(_ vector: Vector3D) -> Vector3D? {
        guard vector.isFinite, let unitQuaternion = normalized() else {
            return nil
        }

        let imaginary = Vector3D(
            x: unitQuaternion.x,
            y: unitQuaternion.y,
            z: unitQuaternion.z
        )
        let twiceCross = 2 * imaginary.cross(vector)
        return vector
            + unitQuaternion.w * twiceCross
            + imaginary.cross(twiceCross)
    }

    public static func rotation(
        from start: Vector3D,
        to end: Vector3D
    ) -> Quaternion? {
        guard let from = start.normalized(), let to = end.normalized() else {
            return nil
        }
        let dot = Angles.clamped(from.dot(to))

        if dot > 1 - 1e-12 {
            return .identity
        }
        if dot < -1 + 1e-12 {
            let basis: Vector3D
            if abs(from.x) <= abs(from.y), abs(from.x) <= abs(from.z) {
                basis = .unitX
            } else if abs(from.y) <= abs(from.z) {
                basis = .unitY
            } else {
                basis = .unitZ
            }
            guard let axis = from.cross(basis).normalized() else {
                return nil
            }
            return Quaternion(angle: .pi, axis: axis)
        }

        let cross = from.cross(to)
        return Quaternion(
            w: 1 + dot,
            x: cross.x,
            y: cross.y,
            z: cross.z
        ).normalized()
    }
}
