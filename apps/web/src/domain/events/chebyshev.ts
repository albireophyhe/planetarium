import type { EphemerisState } from "./types";

type NumericArray = Float32Array | Float64Array | readonly number[];

function assertRecordShape(
  coefficients: NumericArray,
  coefficientCount: number,
): void {
  if (!Number.isInteger(coefficientCount) || coefficientCount < 2) {
    throw new RangeError("Coefficient count must be an integer of at least 2");
  }
  if (coefficients.length !== coefficientCount * 3) {
    throw new RangeError(
      "A position record must contain x, y, and z coefficients",
    );
  }
}
function evaluateComponent(
  coefficients: NumericArray,
  offset: number,
  coefficientCount: number,
  normalizedTime: number,
): readonly [position: number, derivative: number] {
  let previousBasis = 1;
  let currentBasis = normalizedTime;
  let previousDerivative = 0;
  let currentDerivative = 1;
  let position = coefficients[offset] ?? 0;
  let derivative = 0;

  if (coefficientCount >= 2) {
    position += (coefficients[offset + 1] ?? 0) * currentBasis;
    derivative += coefficients[offset + 1] ?? 0;
  }
  for (let degree = 2; degree < coefficientCount; degree += 1) {
    const nextBasis =
      2 * normalizedTime * currentBasis - previousBasis;
    const nextDerivative =
      2 * currentBasis +
      2 * normalizedTime * currentDerivative -
      previousDerivative;
    const coefficient = coefficients[offset + degree] ?? 0;
    position += coefficient * nextBasis;
    derivative += coefficient * nextDerivative;
    previousBasis = currentBasis;
    currentBasis = nextBasis;
    previousDerivative = currentDerivative;
    currentDerivative = nextDerivative;
  }
  return [position, derivative];
}

/**
 * Evaluates one SPK Type 2-style Chebyshev position record.
 *
 * Coefficients are component-major: all x coefficients, then y, then z,
 * each in ascending polynomial degree. The normalized time is in [-1, +1].
 * Inputs may be Float32, but all JavaScript arithmetic and returned values
 * are IEEE-754 binary64.
 */
export function evaluateChebyshevRecord(
  coefficients: NumericArray,
  coefficientCount: number,
  normalizedTime: number,
  intervalDays: number,
): EphemerisState {
  assertRecordShape(coefficients, coefficientCount);
  if (
    !Number.isFinite(normalizedTime) ||
    normalizedTime < -1 ||
    normalizedTime > 1
  ) {
    throw new RangeError("Normalized Chebyshev time must be within [-1, 1]");
  }
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) {
    throw new RangeError("Chebyshev interval must be finite and positive");
  }

  const x = evaluateComponent(
    coefficients,
    0,
    coefficientCount,
    normalizedTime,
  );
  const y = evaluateComponent(
    coefficients,
    coefficientCount,
    coefficientCount,
    normalizedTime,
  );
  const z = evaluateComponent(
    coefficients,
    coefficientCount * 2,
    coefficientCount,
    normalizedTime,
  );
  const normalizedDerivativeToPerDay = 2 / intervalDays;
  return {
    positionKilometers: [x[0], y[0], z[0]],
    velocityKilometersPerDay: [
      x[1] * normalizedDerivativeToPerDay,
      y[1] * normalizedDerivativeToPerDay,
      z[1] * normalizedDerivativeToPerDay,
    ],
  };
}

export function normalizedChebyshevTime(
  julianDate: number,
  recordStartJulianDate: number,
  intervalDays: number,
): number {
  if (
    !Number.isFinite(julianDate) ||
    !Number.isFinite(recordStartJulianDate) ||
    !Number.isFinite(intervalDays) ||
    intervalDays <= 0
  ) {
    throw new RangeError("Chebyshev record time must be finite");
  }
  const normalized =
    (2 * (julianDate - recordStartJulianDate)) / intervalDays - 1;
  if (normalized < -1 - 1e-12 || normalized > 1 + 1e-12) {
    throw new RangeError("Julian date is outside the Chebyshev record");
  }
  return Math.max(-1, Math.min(1, normalized));
}
