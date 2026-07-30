import Foundation
import XCTest

@testable import PlanetariumCore

final class ChebyshevEphemerisTests: XCTestCase {
    func testEvaluatesPositionAndAnalyticVelocityInComponentMajorOrder()
        throws
    {
        // x = 1 + 2 T1 + 3 T2
        // y = -4 + 0.5 T1
        // z = 2 T2
        let state = try ChebyshevEphemeris.evaluateChebyshevRecord(
            coefficients: [
                1, 2, 3,
                -4, 0.5, 0,
                0, 0, 2,
            ] as [Float],
            coefficientCount: 3,
            normalizedTime: 0.25,
            intervalDays: 4
        )

        XCTAssertEqual(
            state.positionKilometers,
            Vector3D(x: -1.125, y: -3.875, z: -1.75)
        )
        XCTAssertEqual(
            state.velocityKilometersPerDay,
            Vector3D(x: 2.5, y: 0.25, z: 1)
        )
    }

    func testFloatCoefficientsUseDoubleArithmetic() throws {
        let state = try ChebyshevEphemeris.evaluateChebyshevRecord(
            coefficients: [
                16_777_216, 1,
                0, 0,
                0, 0,
            ] as [Float],
            coefficientCount: 2,
            normalizedTime: 1,
            intervalDays: 2
        )

        // Float arithmetic would round this sum back to 16_777_216.
        XCTAssertEqual(state.positionKilometers.x, 16_777_217)
        XCTAssertEqual(state.velocityKilometersPerDay.x, 1)
    }

    func testDoubleCoefficientSliceAndAnalyticDerivative() throws {
        let storage = [
            999,
            1, -2, 0.5, 3,
            -4, 0.25, 0, -1,
            2, 1.5, -0.75, 0.125,
            999,
        ] as [Double]
        let coefficients = storage.dropFirst().dropLast()
        let normalizedTime = 0.234_567
        let intervalDays = 8.0
        let delta = 1e-6

        let state = try ChebyshevEphemeris.evaluateChebyshevRecord(
            coefficients: coefficients,
            coefficientCount: 4,
            normalizedTime: normalizedTime,
            intervalDays: intervalDays
        )
        let before = try ChebyshevEphemeris.evaluateChebyshevRecord(
            coefficients: coefficients,
            coefficientCount: 4,
            normalizedTime: normalizedTime - delta,
            intervalDays: intervalDays
        )
        let after = try ChebyshevEphemeris.evaluateChebyshevRecord(
            coefficients: coefficients,
            coefficientCount: 4,
            normalizedTime: normalizedTime + delta,
            intervalDays: intervalDays
        )
        let normalizedDerivativeToPerDay = 2 / intervalDays
        let centeredDerivative =
            (after.positionKilometers - before.positionKilometers)
            / (2 * delta)
            * normalizedDerivativeToPerDay

        XCTAssertEqual(
            state.velocityKilometersPerDay.x,
            centeredDerivative.x,
            accuracy: 1e-9
        )
        XCTAssertEqual(
            state.velocityKilometersPerDay.y,
            centeredDerivative.y,
            accuracy: 1e-9
        )
        XCTAssertEqual(
            state.velocityKilometersPerDay.z,
            centeredDerivative.z,
            accuracy: 1e-9
        )
    }

    func testNormalizedTimeKeepsAndClampsBothRecordEndpoints() throws {
        XCTAssertEqual(
            try ChebyshevEphemeris.normalizedChebyshevTime(
                julianDate: 100,
                recordStartJulianDate: 100,
                intervalDays: 4
            ),
            -1
        )
        XCTAssertEqual(
            try ChebyshevEphemeris.normalizedChebyshevTime(
                julianDate: 104,
                recordStartJulianDate: 100,
                intervalDays: 4
            ),
            1
        )
        XCTAssertEqual(
            try ChebyshevEphemeris.normalizedChebyshevTime(
                julianDate: 100 - 1e-12,
                recordStartJulianDate: 100,
                intervalDays: 4
            ),
            -1
        )
        XCTAssertEqual(
            try ChebyshevEphemeris.normalizedChebyshevTime(
                julianDate: 104 + 1e-12,
                recordStartJulianDate: 100,
                intervalDays: 4
            ),
            1
        )
    }

    func testRejectsMalformedRecordsAndEvaluationArguments() {
        assertError(.invalidCoefficientCount) {
            _ = try ChebyshevEphemeris.evaluateChebyshevRecord(
                coefficients: [1, 2, 3] as [Float],
                coefficientCount: 1,
                normalizedTime: 0,
                intervalDays: 4
            )
        }
        assertError(.invalidRecordShape) {
            _ = try ChebyshevEphemeris.evaluateChebyshevRecord(
                coefficients: [1, 2, 3] as [Double],
                coefficientCount: 2,
                normalizedTime: 0,
                intervalDays: 4
            )
        }
        for normalizedTime in [
            Double.nan,
            -.infinity,
            -1.000_000_1,
            1.000_000_1,
            .infinity,
        ] {
            assertError(.invalidNormalizedTime) {
                _ = try ChebyshevEphemeris.evaluateChebyshevRecord(
                    coefficients: [1, 2, 3, 4, 5, 6] as [Float],
                    coefficientCount: 2,
                    normalizedTime: normalizedTime,
                    intervalDays: 4
                )
            }
        }
        for interval in [Double.nan, -.infinity, -1, 0, .infinity] {
            assertError(.invalidInterval) {
                _ = try ChebyshevEphemeris.evaluateChebyshevRecord(
                    coefficients: [1, 2, 3, 4, 5, 6] as [Float],
                    coefficientCount: 2,
                    normalizedTime: 0,
                    intervalDays: interval
                )
            }
        }
    }

    func testRejectsInvalidAndOutOfRecordTimes() {
        let invalidTimes: [
            (
                julianDate: Double,
                recordStart: Double,
                interval: Double
            )
        ] = [
            (.nan, 100, 4),
            (100, .infinity, 4),
            (100, 100, .nan),
            (100, 100, 0),
        ]
        for invalid in invalidTimes {
            assertError(.invalidRecordTime) {
                _ = try ChebyshevEphemeris.normalizedChebyshevTime(
                    julianDate: invalid.julianDate,
                    recordStartJulianDate: invalid.recordStart,
                    intervalDays: invalid.interval
                )
            }
        }

        for julianDate in [99, 100 - 3e-12, 104 + 3e-12, 105] {
            assertError(.julianDateOutsideRecord) {
                _ = try ChebyshevEphemeris.normalizedChebyshevTime(
                    julianDate: julianDate,
                    recordStartJulianDate: 100,
                    intervalDays: 4
                )
            }
        }
    }

    private func assertError(
        _ expected: ChebyshevEphemerisError,
        file: StaticString = #filePath,
        line: UInt = #line,
        operation: () throws -> Void
    ) {
        XCTAssertThrowsError(
            try operation(),
            file: file,
            line: line
        ) { error in
            XCTAssertEqual(
                error as? ChebyshevEphemerisError,
                expected,
                file: file,
                line: line
            )
        }
    }
}
