export interface RootResult {
  readonly iterations: number;
  readonly value: number;
}

export interface MinimumResult {
  readonly iterations: number;
  readonly value: number;
  readonly argument: number;
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}

/**
 * Finds one root in a sign-changing bracket using a safeguarded
 * bisection/secant method.
 *
 * Contact functions are often very flat close to a grazing event. The
 * implementation therefore keeps the bracket on every iteration and only
 * accepts a secant step when it stays comfortably inside that bracket.
 */
export function solveBracketedRoot(
  functionValue: (argument: number) => number,
  lowerArgument: number,
  upperArgument: number,
  argumentTolerance: number,
  valueTolerance = 0,
  maximumIterations = 96,
): RootResult {
  for (const [name, value] of [
    ["lower argument", lowerArgument],
    ["upper argument", upperArgument],
    ["argument tolerance", argumentTolerance],
    ["value tolerance", valueTolerance],
  ] as const) {
    assertFiniteNumber(value, name);
  }
  if (upperArgument <= lowerArgument) {
    throw new RangeError("Root bracket must have positive width");
  }
  if (argumentTolerance <= 0 || valueTolerance < 0) {
    throw new RangeError("Root tolerances must be non-negative");
  }
  if (!Number.isInteger(maximumIterations) || maximumIterations < 1) {
    throw new RangeError("Maximum iterations must be a positive integer");
  }

  let lower = lowerArgument;
  let upper = upperArgument;
  let lowerValue = functionValue(lower);
  let upperValue = functionValue(upper);
  assertFiniteNumber(lowerValue, "lower bracket value");
  assertFiniteNumber(upperValue, "upper bracket value");

  if (Math.abs(lowerValue) <= valueTolerance) {
    return { iterations: 0, value: lower };
  }
  if (Math.abs(upperValue) <= valueTolerance) {
    return { iterations: 0, value: upper };
  }
  if (Math.sign(lowerValue) === Math.sign(upperValue)) {
    throw new RangeError("Root bracket values must have opposite signs");
  }

  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    const width = upper - lower;
    if (width <= argumentTolerance) {
      return {
        iterations: iteration - 1,
        value:
          Math.abs(lowerValue) <= Math.abs(upperValue) ? lower : upper,
      };
    }

    const midpoint = lower + width / 2;
    const denominator = upperValue - lowerValue;
    const secant =
      denominator === 0
        ? midpoint
        : upper - (upperValue * width) / denominator;
    const guard = width * 0.1;
    const candidate =
      secant > lower + guard && secant < upper - guard
        ? secant
        : midpoint;
    const candidateValue = functionValue(candidate);
    assertFiniteNumber(candidateValue, "root candidate value");

    if (Math.abs(candidateValue) <= valueTolerance) {
      return { iterations: iteration, value: candidate };
    }
    if (Math.sign(candidateValue) === Math.sign(lowerValue)) {
      lower = candidate;
      lowerValue = candidateValue;
    } else {
      upper = candidate;
      upperValue = candidateValue;
    }
  }

  if (upper - lower <= argumentTolerance * 2) {
    return {
      iterations: maximumIterations,
      value: Math.abs(lowerValue) <= Math.abs(upperValue) ? lower : upper,
    };
  }
  throw new RangeError("Root solver did not converge");
}

/**
 * Finds a minimum in a closed bracket without requiring derivatives.
 */
export function minimizeBracketed(
  functionValue: (argument: number) => number,
  lowerArgument: number,
  upperArgument: number,
  argumentTolerance: number,
  maximumIterations = 128,
): MinimumResult {
  for (const [name, value] of [
    ["lower argument", lowerArgument],
    ["upper argument", upperArgument],
    ["argument tolerance", argumentTolerance],
  ] as const) {
    assertFiniteNumber(value, name);
  }
  if (upperArgument <= lowerArgument) {
    throw new RangeError("Minimum bracket must have positive width");
  }
  if (argumentTolerance <= 0) {
    throw new RangeError("Minimum tolerance must be positive");
  }
  if (!Number.isInteger(maximumIterations) || maximumIterations < 1) {
    throw new RangeError("Maximum iterations must be a positive integer");
  }

  const inverseGoldenRatio = (Math.sqrt(5) - 1) / 2;
  let lower = lowerArgument;
  let upper = upperArgument;
  let right = lower + inverseGoldenRatio * (upper - lower);
  let left = upper - inverseGoldenRatio * (upper - lower);
  let leftValue = functionValue(left);
  let rightValue = functionValue(right);
  assertFiniteNumber(leftValue, "left minimum value");
  assertFiniteNumber(rightValue, "right minimum value");

  let iteration = 0;
  while (
    upper - lower > argumentTolerance &&
    iteration < maximumIterations
  ) {
    iteration += 1;
    if (leftValue <= rightValue) {
      upper = right;
      right = left;
      rightValue = leftValue;
      left = upper - inverseGoldenRatio * (upper - lower);
      leftValue = functionValue(left);
      assertFiniteNumber(leftValue, "left minimum value");
    } else {
      lower = left;
      left = right;
      leftValue = rightValue;
      right = lower + inverseGoldenRatio * (upper - lower);
      rightValue = functionValue(right);
      assertFiniteNumber(rightValue, "right minimum value");
    }
  }

  if (upper - lower > argumentTolerance) {
    throw new RangeError("Minimum solver did not converge");
  }
  const argument = (lower + upper) / 2;
  const value = functionValue(argument);
  assertFiniteNumber(value, "minimum value");
  return { argument, iterations: iteration, value };
}

export interface SignChangeBracket {
  readonly lower: number;
  readonly upper: number;
}

export function findSignChangeBrackets(
  functionValue: (argument: number) => number,
  lowerArgument: number,
  upperArgument: number,
  step: number,
): readonly SignChangeBracket[] {
  for (const [name, value] of [
    ["lower argument", lowerArgument],
    ["upper argument", upperArgument],
    ["step", step],
  ] as const) {
    assertFiniteNumber(value, name);
  }
  if (upperArgument <= lowerArgument || step <= 0) {
    throw new RangeError("Search range and step must be positive");
  }

  const result: SignChangeBracket[] = [];
  let previousArgument = lowerArgument;
  let previousValue = functionValue(previousArgument);
  assertFiniteNumber(previousValue, "first search value");

  while (previousArgument < upperArgument) {
    const nextArgument = Math.min(
      previousArgument + step,
      upperArgument,
    );
    const nextValue = functionValue(nextArgument);
    assertFiniteNumber(nextValue, "search value");
    if (
      previousValue === 0 ||
      nextValue === 0 ||
      Math.sign(previousValue) !== Math.sign(nextValue)
    ) {
      result.push({
        lower: previousArgument,
        upper: nextArgument,
      });
    }
    previousArgument = nextArgument;
    previousValue = nextValue;
  }
  return Object.freeze(result.map((bracket) => Object.freeze(bracket)));
}
