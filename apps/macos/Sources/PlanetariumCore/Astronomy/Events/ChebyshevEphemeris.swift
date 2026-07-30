import Foundation

public struct EphemerisState: Hashable, Sendable {
    /// ICRF position in km from the state provider's declared center.
    public let positionKilometers: Vector3D
    /// ICRF velocity in km per TDB day.
    public let velocityKilometersPerDay: Vector3D

    public init(
        positionKilometers: Vector3D,
        velocityKilometersPerDay: Vector3D
    ) {
        self.positionKilometers = positionKilometers
        self.velocityKilometersPerDay = velocityKilometersPerDay
    }
}

public enum ChebyshevEphemerisError:
    LocalizedError, Equatable, Sendable
{
    case invalidCoefficientCount
    case invalidRecordShape
    case invalidNormalizedTime
    case invalidInterval
    case invalidRecordTime
    case julianDateOutsideRecord

    public var errorDescription: String? {
        switch self {
        case .invalidCoefficientCount:
            "Coefficient count must be an integer of at least 2"
        case .invalidRecordShape:
            "A position record must contain x, y, and z coefficients"
        case .invalidNormalizedTime:
            "Normalized Chebyshev time must be within [-1, 1]"
        case .invalidInterval:
            "Chebyshev interval must be finite and positive"
        case .invalidRecordTime:
            "Chebyshev record time must be finite"
        case .julianDateOutsideRecord:
            "Julian date is outside the Chebyshev record"
        }
    }
}

public enum ChebyshevEphemeris {
    /**
     Evaluates one SPK Type 2-style Chebyshev position record.

     Coefficients are component-major: all x coefficients, then y, then z,
     each in ascending polynomial degree. Float coefficients are converted
     individually, while all basis, derivative, time, and result arithmetic
     uses Double.
     */
    public static func evaluateChebyshevRecord<C>(
        coefficients: C,
        coefficientCount: Int,
        normalizedTime: Double,
        intervalDays: Double
    ) throws -> EphemerisState
    where C: RandomAccessCollection, C.Element: BinaryFloatingPoint {
        guard coefficientCount >= 2,
              coefficientCount <= Int.max / 3
        else {
            throw ChebyshevEphemerisError.invalidCoefficientCount
        }
        guard coefficients.count == coefficientCount * 3 else {
            throw ChebyshevEphemerisError.invalidRecordShape
        }
        guard normalizedTime.isFinite,
              (-1...1).contains(normalizedTime)
        else {
            throw ChebyshevEphemerisError.invalidNormalizedTime
        }
        guard intervalDays.isFinite, intervalDays > 0 else {
            throw ChebyshevEphemerisError.invalidInterval
        }

        let x = evaluateComponent(
            coefficients: coefficients,
            offset: 0,
            coefficientCount: coefficientCount,
            normalizedTime: normalizedTime
        )
        let y = evaluateComponent(
            coefficients: coefficients,
            offset: coefficientCount,
            coefficientCount: coefficientCount,
            normalizedTime: normalizedTime
        )
        let z = evaluateComponent(
            coefficients: coefficients,
            offset: coefficientCount * 2,
            coefficientCount: coefficientCount,
            normalizedTime: normalizedTime
        )
        let normalizedDerivativeToPerDay = 2 / intervalDays
        return EphemerisState(
            positionKilometers: Vector3D(
                x: x.position,
                y: y.position,
                z: z.position
            ),
            velocityKilometersPerDay: Vector3D(
                x: x.derivative * normalizedDerivativeToPerDay,
                y: y.derivative * normalizedDerivativeToPerDay,
                z: z.derivative * normalizedDerivativeToPerDay
            )
        )
    }

    public static func normalizedChebyshevTime(
        julianDate: Double,
        recordStartJulianDate: Double,
        intervalDays: Double
    ) throws -> Double {
        guard julianDate.isFinite,
              recordStartJulianDate.isFinite,
              intervalDays.isFinite,
              intervalDays > 0
        else {
            throw ChebyshevEphemerisError.invalidRecordTime
        }
        let normalized =
            2 * (julianDate - recordStartJulianDate)
            / intervalDays - 1
        guard normalized >= -1 - 1e-12,
              normalized <= 1 + 1e-12
        else {
            throw ChebyshevEphemerisError.julianDateOutsideRecord
        }
        return max(-1, min(1, normalized))
    }

    private static func evaluateComponent<C>(
        coefficients: C,
        offset: Int,
        coefficientCount: Int,
        normalizedTime: Double
    ) -> (position: Double, derivative: Double)
    where C: RandomAccessCollection, C.Element: BinaryFloatingPoint {
        func coefficient(at logicalIndex: Int) -> Double {
            let index = coefficients.index(
                coefficients.startIndex,
                offsetBy: logicalIndex
            )
            return Double(coefficients[index])
        }

        var previousBasis = 1.0
        var currentBasis = normalizedTime
        var previousDerivative = 0.0
        var currentDerivative = 1.0
        var position = coefficient(at: offset)
        var derivative = 0.0

        position += coefficient(at: offset + 1) * currentBasis
        derivative += coefficient(at: offset + 1)
        for degree in 2..<coefficientCount {
            let nextBasis =
                2 * normalizedTime * currentBasis - previousBasis
            let nextDerivative =
                2 * currentBasis
                + 2 * normalizedTime * currentDerivative
                - previousDerivative
            let currentCoefficient = coefficient(at: offset + degree)
            position += currentCoefficient * nextBasis
            derivative += currentCoefficient * nextDerivative
            previousBasis = currentBasis
            currentBasis = nextBasis
            previousDerivative = currentDerivative
            currentDerivative = nextDerivative
        }
        return (position, derivative)
    }
}
