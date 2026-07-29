import Foundation

enum PrecisionConstants {
    static let twoPi = 2 * Double.pi
    static let daysPerJulianCentury = 36_525.0
    static let daysPerJulianYear = 365.25
    static let secondsPerDay = 86_400.0
    static let arcsecondsToRadians = Double.pi / (180 * 3_600)
    static let milliarcsecondsToRadians = arcsecondsToRadians / 1_000
    static let astronomicalUnitKilometers = 149_597_870.7
    static let speedOfLightKilometersPerSecond = 299_792.458
    static let speedOfLightAUPerDay =
        speedOfLightKilometersPerSecond * secondsPerDay
        / astronomicalUnitKilometers
    /// Twice the solar gravitational radius, in astronomical units.
    static let solarSchwarzschildRadiusAU = 1.97412574336e-8
}

extension PrecisionMatrix3 {
    func multiplied(by right: PrecisionMatrix3) -> PrecisionMatrix3 {
        let column0 = Vector3D(
            x: right.row0.x,
            y: right.row1.x,
            z: right.row2.x
        )
        let column1 = Vector3D(
            x: right.row0.y,
            y: right.row1.y,
            z: right.row2.y
        )
        let column2 = Vector3D(
            x: right.row0.z,
            y: right.row1.z,
            z: right.row2.z
        )
        return PrecisionMatrix3(
            row0: Vector3D(
                x: row0.dot(column0),
                y: row0.dot(column1),
                z: row0.dot(column2)
            ),
            row1: Vector3D(
                x: row1.dot(column0),
                y: row1.dot(column1),
                z: row1.dot(column2)
            ),
            row2: Vector3D(
                x: row2.dot(column0),
                y: row2.dot(column1),
                z: row2.dot(column2)
            )
        )
    }

    static func passiveRotationX(_ angle: Double) -> PrecisionMatrix3 {
        let sine = sin(angle)
        let cosine = cos(angle)
        return PrecisionMatrix3(
            row0: .unitX,
            row1: Vector3D(x: 0, y: cosine, z: sine),
            row2: Vector3D(x: 0, y: -sine, z: cosine)
        )
    }

    static func passiveRotationY(_ angle: Double) -> PrecisionMatrix3 {
        let sine = sin(angle)
        let cosine = cos(angle)
        return PrecisionMatrix3(
            row0: Vector3D(x: cosine, y: 0, z: -sine),
            row1: .unitY,
            row2: Vector3D(x: sine, y: 0, z: cosine)
        )
    }

    static func passiveRotationZ(_ angle: Double) -> PrecisionMatrix3 {
        let sine = sin(angle)
        let cosine = cos(angle)
        return PrecisionMatrix3(
            row0: Vector3D(x: cosine, y: sine, z: 0),
            row1: Vector3D(x: -sine, y: cosine, z: 0),
            row2: .unitZ
        )
    }

    static func composedPassiveRotations(
        _ rotations: PrecisionMatrix3...
    ) -> PrecisionMatrix3 {
        rotations.reduce(.identity) { result, rotation in
            rotation.multiplied(by: result)
        }
    }
}

func precisionNormalized(_ vector: Vector3D) throws -> Vector3D {
    guard vector.isFinite,
          vector.length.isFinite,
          vector.length > 0
    else {
        throw PrecisionModelError.invalidVector
    }
    return vector / vector.length
}

func precisionEquatorialToVector(
    _ coordinates: EquatorialCoordinates
) -> Vector3D {
    let cosineDeclination = cos(coordinates.declination)
    return Vector3D(
        x: cosineDeclination * cos(coordinates.rightAscension),
        y: cosineDeclination * sin(coordinates.rightAscension),
        z: sin(coordinates.declination)
    )
}

func precisionVectorToEquatorial(
    _ vector: Vector3D
) throws -> EquatorialCoordinates {
    let unit = try precisionNormalized(vector)
    return EquatorialCoordinates(
        rightAscension: Angles.normalizedRadians(atan2(unit.y, unit.x)),
        declination: asin(Angles.clamped(unit.z))
    )
}

func precisionUniqueWarnings(
    _ warnings: [PrecisionWarningCode]
) -> [PrecisionWarningCode] {
    var seen = Set<PrecisionWarningCode>()
    return warnings.filter { seen.insert($0).inserted }
}
