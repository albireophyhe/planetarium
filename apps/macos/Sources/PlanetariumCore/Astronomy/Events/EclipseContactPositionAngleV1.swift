import Foundation

enum EclipseContactRadialDirectionV1: Equatable, Sendable {
    case towardOtherCenter
    case awayFromOtherCenter
}

enum EclipseContactPositionAngleV1 {
    /**
     Contact position angle in the CIRS tangent plane, with north defined
     by the celestial intermediate pole (CIP).

     Zero is the celestial-north point of the reference disc and angles
     increase eastward through 90 degrees. `radialDirection` chooses the
     tangent point on the near or far side of the reference disc.
     */
    static func radians(
        referenceCenterDirection: Vector3D,
        otherCenterDirection: Vector3D,
        radialDirection:
            EclipseContactRadialDirectionV1 =
                .towardOtherCenter
    ) -> Double? {
        guard
            let center =
                referenceCenterDirection.normalized(),
            let other =
                otherCenterDirection.normalized()
        else {
            return nil
        }
        let northProjection =
            Vector3D.unitZ
            - center * Vector3D.unitZ.dot(center)
        let east = Vector3D(
            x: -center.y,
            y: center.x,
            z: 0
        )
        let otherProjection =
            other - center * other.dot(center)
        guard
            let north =
                northProjection.normalized(
                    epsilon: 1e-14
                ),
            let normalizedEast =
                east.normalized(epsilon: 1e-14),
            otherProjection.length >= 1e-14
        else {
            return nil
        }
        let towardAngle = atan2(
            otherProjection.dot(normalizedEast),
            otherProjection.dot(north)
        )
        let radialOffset =
            radialDirection == .awayFromOtherCenter
            ? Double.pi
            : 0
        return Angles.normalizedRadians(
            towardAngle + radialOffset
        )
    }
}
