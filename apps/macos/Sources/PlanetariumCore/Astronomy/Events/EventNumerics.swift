import Foundation

public struct RootResult: Equatable, Sendable {
    public let iterations: Int
    public let value: Double

    public init(iterations: Int, value: Double) {
        self.iterations = iterations
        self.value = value
    }
}

public struct MinimumResult: Equatable, Sendable {
    public let iterations: Int
    public let value: Double
    public let argument: Double

    public init(
        iterations: Int,
        value: Double,
        argument: Double
    ) {
        self.iterations = iterations
        self.value = value
        self.argument = argument
    }
}

public struct SignChangeBracket: Equatable, Sendable {
    public let lower: Double
    public let upper: Double

    public init(lower: Double, upper: Double) {
        self.lower = lower
        self.upper = upper
    }
}

public enum EventNumericsError: LocalizedError, Equatable, Sendable {
    case nonFiniteValue(String)
    case invalidRootBracket
    case invalidRootTolerance
    case invalidMinimumBracket
    case invalidMinimumTolerance
    case invalidSearchRangeOrStep
    case invalidMaximumIterations
    case rootNotBracketed
    case rootDidNotConverge
    case minimumDidNotConverge
    case searchDidNotAdvance

    public var errorDescription: String? {
        switch self {
        case let .nonFiniteValue(name):
            "\(name) must be finite"
        case .invalidRootBracket:
            "Root bracket must have positive finite width"
        case .invalidRootTolerance:
            "Root argument tolerance must be positive and value tolerance non-negative"
        case .invalidMinimumBracket:
            "Minimum bracket must have positive finite width"
        case .invalidMinimumTolerance:
            "Minimum tolerance must be positive"
        case .invalidSearchRangeOrStep:
            "Search range and step must be positive and finite"
        case .invalidMaximumIterations:
            "Maximum iterations must be positive"
        case .rootNotBracketed:
            "Root bracket values must have opposite signs"
        case .rootDidNotConverge:
            "Root solver did not converge"
        case .minimumDidNotConverge:
            "Minimum solver did not converge"
        case .searchDidNotAdvance:
            "Search step is too small to advance at this magnitude"
        }
    }
}

public enum EventNumerics {
    /**
     Finds one root in a sign-changing bracket using a safeguarded
     bisection/secant method.

     Contact functions can be very flat near a grazing event. The bracket is
     retained on every iteration, and a secant step is accepted only when it
     remains comfortably inside that bracket.
     */
    public static func solveBracketedRoot(
        functionValue: (Double) -> Double,
        lowerArgument: Double,
        upperArgument: Double,
        argumentTolerance: Double,
        valueTolerance: Double = 0,
        maximumIterations: Int = 96
    ) throws -> RootResult {
        try requireFinite(lowerArgument, name: "lower argument")
        try requireFinite(upperArgument, name: "upper argument")
        try requireFinite(argumentTolerance, name: "argument tolerance")
        try requireFinite(valueTolerance, name: "value tolerance")

        let initialWidth = upperArgument - lowerArgument
        guard upperArgument > lowerArgument, initialWidth.isFinite else {
            throw EventNumericsError.invalidRootBracket
        }
        guard argumentTolerance > 0, valueTolerance >= 0 else {
            throw EventNumericsError.invalidRootTolerance
        }
        guard maximumIterations >= 1 else {
            throw EventNumericsError.invalidMaximumIterations
        }

        var lower = lowerArgument
        var upper = upperArgument
        var lowerValue = functionValue(lower)
        var upperValue = functionValue(upper)
        try requireFinite(lowerValue, name: "lower bracket value")
        try requireFinite(upperValue, name: "upper bracket value")

        if abs(lowerValue) <= valueTolerance {
            return RootResult(iterations: 0, value: lower)
        }
        if abs(upperValue) <= valueTolerance {
            return RootResult(iterations: 0, value: upper)
        }
        guard lowerValue.sign != upperValue.sign else {
            throw EventNumericsError.rootNotBracketed
        }

        for iteration in 1...maximumIterations {
            let width = upper - lower
            if width <= argumentTolerance {
                return RootResult(
                    iterations: iteration - 1,
                    value: bestRootEndpoint(
                        lower: lower,
                        lowerValue: lowerValue,
                        upper: upper,
                        upperValue: upperValue
                    )
                )
            }

            let midpoint = lower + width / 2
            let denominator = upperValue - lowerValue
            let secant =
                denominator == 0
                ? midpoint
                : upper - upperValue * width / denominator
            let guardWidth = width * 0.1
            let candidate =
                secant.isFinite
                    && secant > lower + guardWidth
                    && secant < upper - guardWidth
                ? secant
                : midpoint
            let candidateValue = functionValue(candidate)
            try requireFinite(
                candidateValue,
                name: "root candidate value"
            )

            if abs(candidateValue) <= valueTolerance {
                return RootResult(
                    iterations: iteration,
                    value: candidate
                )
            }
            if candidateValue.sign == lowerValue.sign {
                lower = candidate
                lowerValue = candidateValue
            } else {
                upper = candidate
                upperValue = candidateValue
            }
        }

        if upper - lower <= argumentTolerance * 2 {
            return RootResult(
                iterations: maximumIterations,
                value: bestRootEndpoint(
                    lower: lower,
                    lowerValue: lowerValue,
                    upper: upper,
                    upperValue: upperValue
                )
            )
        }
        throw EventNumericsError.rootDidNotConverge
    }

    /// Finds a minimum in a closed bracket without requiring derivatives.
    public static func minimizeBracketed(
        functionValue: (Double) -> Double,
        lowerArgument: Double,
        upperArgument: Double,
        argumentTolerance: Double,
        maximumIterations: Int = 128
    ) throws -> MinimumResult {
        try requireFinite(lowerArgument, name: "lower argument")
        try requireFinite(upperArgument, name: "upper argument")
        try requireFinite(argumentTolerance, name: "argument tolerance")

        let initialWidth = upperArgument - lowerArgument
        guard upperArgument > lowerArgument, initialWidth.isFinite else {
            throw EventNumericsError.invalidMinimumBracket
        }
        guard argumentTolerance > 0 else {
            throw EventNumericsError.invalidMinimumTolerance
        }
        guard maximumIterations >= 1 else {
            throw EventNumericsError.invalidMaximumIterations
        }

        let inverseGoldenRatio = (sqrt(5) - 1) / 2
        var lower = lowerArgument
        var upper = upperArgument
        var right = lower + inverseGoldenRatio * (upper - lower)
        var left = upper - inverseGoldenRatio * (upper - lower)
        var leftValue = functionValue(left)
        var rightValue = functionValue(right)
        try requireFinite(leftValue, name: "left minimum value")
        try requireFinite(rightValue, name: "right minimum value")

        var iteration = 0
        while upper - lower > argumentTolerance,
              iteration < maximumIterations
        {
            iteration += 1
            if leftValue <= rightValue {
                upper = right
                right = left
                rightValue = leftValue
                left = upper - inverseGoldenRatio * (upper - lower)
                leftValue = functionValue(left)
                try requireFinite(
                    leftValue,
                    name: "left minimum value"
                )
            } else {
                lower = left
                left = right
                leftValue = rightValue
                right = lower + inverseGoldenRatio * (upper - lower)
                rightValue = functionValue(right)
                try requireFinite(
                    rightValue,
                    name: "right minimum value"
                )
            }
        }

        guard upper - lower <= argumentTolerance else {
            throw EventNumericsError.minimumDidNotConverge
        }
        let argument = (lower + upper) / 2
        let value = functionValue(argument)
        try requireFinite(value, name: "minimum value")
        return MinimumResult(
            iterations: iteration,
            value: value,
            argument: argument
        )
    }

    public static func findSignChangeBrackets(
        functionValue: (Double) -> Double,
        lowerArgument: Double,
        upperArgument: Double,
        step: Double
    ) throws -> [SignChangeBracket] {
        try requireFinite(lowerArgument, name: "lower argument")
        try requireFinite(upperArgument, name: "upper argument")
        try requireFinite(step, name: "step")

        let width = upperArgument - lowerArgument
        guard upperArgument > lowerArgument,
              width.isFinite,
              step > 0
        else {
            throw EventNumericsError.invalidSearchRangeOrStep
        }

        var result: [SignChangeBracket] = []
        var previousArgument = lowerArgument
        var previousValue = functionValue(previousArgument)
        try requireFinite(previousValue, name: "first search value")

        while previousArgument < upperArgument {
            let steppedArgument = previousArgument + step
            let nextArgument = min(steppedArgument, upperArgument)
            guard nextArgument > previousArgument else {
                throw EventNumericsError.searchDidNotAdvance
            }
            let nextValue = functionValue(nextArgument)
            try requireFinite(nextValue, name: "search value")
            if previousValue == 0
                || nextValue == 0
                || previousValue.sign != nextValue.sign
            {
                result.append(
                    SignChangeBracket(
                        lower: previousArgument,
                        upper: nextArgument
                    )
                )
            }
            previousArgument = nextArgument
            previousValue = nextValue
        }
        return result
    }

    private static func requireFinite(
        _ value: Double,
        name: String
    ) throws {
        guard value.isFinite else {
            throw EventNumericsError.nonFiniteValue(name)
        }
    }

    private static func bestRootEndpoint(
        lower: Double,
        lowerValue: Double,
        upper: Double,
        upperValue: Double
    ) -> Double {
        abs(lowerValue) <= abs(upperValue) ? lower : upper
    }
}
