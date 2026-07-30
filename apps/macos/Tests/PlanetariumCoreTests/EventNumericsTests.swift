import Foundation
import XCTest

@testable import PlanetariumCore

final class EventNumericsTests: XCTestCase {
    func testSolvesWellConditionedContactRoot() throws {
        let result = try EventNumerics.solveBracketedRoot(
            functionValue: { argument in
                argument * argument - 2
            },
            lowerArgument: 1,
            upperArgument: 2,
            argumentTolerance: 1e-12,
            valueTolerance: 1e-14
        )

        XCTAssertEqual(result.value, sqrt(2), accuracy: 1e-11)
        XCTAssertLessThan(result.iterations, 96)
    }

    func testKeepsBracketForFlatGrazingLikeRoot() throws {
        let root = 0.125
        let result = try EventNumerics.solveBracketedRoot(
            functionValue: { argument in
                let difference = argument - root
                return difference * difference * difference
            },
            lowerArgument: -1,
            upperArgument: 1,
            argumentTolerance: 1e-10,
            valueTolerance: 0
        )

        XCTAssertEqual(result.value, root, accuracy: 1e-8)
    }

    func testRootSolverReturnsExactBracketEndpointsWithoutIterations()
        throws
    {
        let lower = try EventNumerics.solveBracketedRoot(
            functionValue: { $0 },
            lowerArgument: 0,
            upperArgument: 2,
            argumentTolerance: 1e-8
        )
        let upper = try EventNumerics.solveBracketedRoot(
            functionValue: { $0 - 2 },
            lowerArgument: 0,
            upperArgument: 2,
            argumentTolerance: 1e-8
        )

        XCTAssertEqual(lower, RootResult(iterations: 0, value: 0))
        XCTAssertEqual(upper, RootResult(iterations: 0, value: 2))
    }

    func testRootSolverRejectsRangeWithoutSignChange() {
        assertError(.rootNotBracketed) {
            _ = try EventNumerics.solveBracketedRoot(
                functionValue: { argument in
                    argument * argument + 1
                },
                lowerArgument: -1,
                upperArgument: 1,
                argumentTolerance: 1e-8
            )
        }
    }

    func testFindsDerivativeFreeFlatMinimum() throws {
        let minimum = 3.25
        let result = try EventNumerics.minimizeBracketed(
            functionValue: { argument in
                let difference = argument - minimum
                return difference * difference + 7
            },
            lowerArgument: -10,
            upperArgument: 10,
            argumentTolerance: 1e-10
        )

        XCTAssertEqual(result.argument, minimum, accuracy: 1e-7)
        XCTAssertEqual(result.value, 7, accuracy: 1e-12)
        XCTAssertLessThan(result.iterations, 128)
    }

    func testMinimumCanLieAtClosedBracketEndpoint() throws {
        let result = try EventNumerics.minimizeBracketed(
            functionValue: { $0 },
            lowerArgument: 0,
            upperArgument: 5,
            argumentTolerance: 1e-9
        )

        XCTAssertEqual(result.argument, 0, accuracy: 1e-8)
        XCTAssertEqual(result.value, result.argument)
    }

    func testRejectsNonFiniteArgumentsAndFunctionValues() {
        assertError(.nonFiniteValue("lower argument")) {
            _ = try EventNumerics.solveBracketedRoot(
                functionValue: { $0 },
                lowerArgument: .nan,
                upperArgument: 1,
                argumentTolerance: 1e-8
            )
        }
        assertError(.nonFiniteValue("upper argument")) {
            _ = try EventNumerics.minimizeBracketed(
                functionValue: { $0 },
                lowerArgument: 0,
                upperArgument: .infinity,
                argumentTolerance: 1e-8
            )
        }
        assertError(.nonFiniteValue("step")) {
            _ = try EventNumerics.findSignChangeBrackets(
                functionValue: { $0 },
                lowerArgument: 0,
                upperArgument: 1,
                step: .nan
            )
        }
        assertError(.nonFiniteValue("lower bracket value")) {
            _ = try EventNumerics.solveBracketedRoot(
                functionValue: { _ in .nan },
                lowerArgument: 0,
                upperArgument: 1,
                argumentTolerance: 1e-8
            )
        }

        var rootEvaluationCount = 0
        assertError(.nonFiniteValue("root candidate value")) {
            _ = try EventNumerics.solveBracketedRoot(
                functionValue: { argument in
                    rootEvaluationCount += 1
                    if rootEvaluationCount == 3 {
                        return .nan
                    }
                    return argument * argument - 2
                },
                lowerArgument: 1,
                upperArgument: 2,
                argumentTolerance: 1e-8
            )
        }
        assertError(.nonFiniteValue("left minimum value")) {
            _ = try EventNumerics.minimizeBracketed(
                functionValue: { _ in .nan },
                lowerArgument: 0,
                upperArgument: 1,
                argumentTolerance: 1e-8
            )
        }
        assertError(.nonFiniteValue("first search value")) {
            _ = try EventNumerics.findSignChangeBrackets(
                functionValue: { _ in .nan },
                lowerArgument: 0,
                upperArgument: 1,
                step: 0.1
            )
        }
    }

    func testRejectsInvalidRangesTolerancesAndIterationLimits() {
        assertError(.invalidRootBracket) {
            _ = try EventNumerics.solveBracketedRoot(
                functionValue: { $0 },
                lowerArgument: 1,
                upperArgument: 1,
                argumentTolerance: 1e-8
            )
        }
        assertError(.invalidRootBracket) {
            _ = try EventNumerics.solveBracketedRoot(
                functionValue: { $0 },
                lowerArgument: -.greatestFiniteMagnitude,
                upperArgument: .greatestFiniteMagnitude,
                argumentTolerance: 1e-8
            )
        }
        assertError(.invalidRootTolerance) {
            _ = try EventNumerics.solveBracketedRoot(
                functionValue: { $0 },
                lowerArgument: -1,
                upperArgument: 1,
                argumentTolerance: 0
            )
        }
        assertError(.invalidRootTolerance) {
            _ = try EventNumerics.solveBracketedRoot(
                functionValue: { $0 },
                lowerArgument: -1,
                upperArgument: 1,
                argumentTolerance: 1e-8,
                valueTolerance: -1
            )
        }
        assertError(.invalidMaximumIterations) {
            _ = try EventNumerics.solveBracketedRoot(
                functionValue: { $0 },
                lowerArgument: -1,
                upperArgument: 1,
                argumentTolerance: 1e-8,
                maximumIterations: 0
            )
        }
        assertError(.invalidMinimumBracket) {
            _ = try EventNumerics.minimizeBracketed(
                functionValue: { $0 },
                lowerArgument: 1,
                upperArgument: 0,
                argumentTolerance: 1e-8
            )
        }
        assertError(.invalidMinimumTolerance) {
            _ = try EventNumerics.minimizeBracketed(
                functionValue: { $0 },
                lowerArgument: 0,
                upperArgument: 1,
                argumentTolerance: 0
            )
        }
        assertError(.invalidMaximumIterations) {
            _ = try EventNumerics.minimizeBracketed(
                functionValue: { $0 },
                lowerArgument: 0,
                upperArgument: 1,
                argumentTolerance: 1e-8,
                maximumIterations: 0
            )
        }
        assertError(.invalidSearchRangeOrStep) {
            _ = try EventNumerics.findSignChangeBrackets(
                functionValue: { $0 },
                lowerArgument: 0,
                upperArgument: 0,
                step: 0.1
            )
        }
        assertError(.invalidSearchRangeOrStep) {
            _ = try EventNumerics.findSignChangeBrackets(
                functionValue: { $0 },
                lowerArgument: 0,
                upperArgument: 1,
                step: 0
            )
        }
    }

    func testSolversReportNonConvergence() {
        assertError(.rootDidNotConverge) {
            _ = try EventNumerics.solveBracketedRoot(
                functionValue: { argument in
                    argument * argument - 2
                },
                lowerArgument: 1,
                upperArgument: 2,
                argumentTolerance: 1e-30,
                maximumIterations: 1
            )
        }
        assertError(.minimumDidNotConverge) {
            _ = try EventNumerics.minimizeBracketed(
                functionValue: { argument in
                    argument * argument
                },
                lowerArgument: -10,
                upperArgument: 10,
                argumentTolerance: 1e-30,
                maximumIterations: 1
            )
        }
    }

    func testFindsMultipleSignChangeBracketsWithoutLeavingRange()
        throws
    {
        var evaluatedArguments: [Double] = []
        let result = try EventNumerics.findSignChangeBrackets(
            functionValue: { argument in
                evaluatedArguments.append(argument)
                return (argument - 1) * (argument - 3)
            },
            lowerArgument: 0,
            upperArgument: 4,
            step: 0.75
        )

        XCTAssertEqual(
            result,
            [
                SignChangeBracket(lower: 0.75, upper: 1.5),
                SignChangeBracket(lower: 2.25, upper: 3),
                SignChangeBracket(lower: 3, upper: 3.75),
            ]
        )
        XCTAssertEqual(evaluatedArguments.last, 4)
        XCTAssertTrue(evaluatedArguments.allSatisfy { (0...4).contains($0) })
    }

    func testSignChangeSearchIncludesRangeEndpointRoots() throws {
        let lower = try EventNumerics.findSignChangeBrackets(
            functionValue: { $0 },
            lowerArgument: 0,
            upperArgument: 1,
            step: 2
        )
        let upper = try EventNumerics.findSignChangeBrackets(
            functionValue: { $0 - 1 },
            lowerArgument: 0,
            upperArgument: 1,
            step: 2
        )

        let expected = [SignChangeBracket(lower: 0, upper: 1)]
        XCTAssertEqual(lower, expected)
        XCTAssertEqual(upper, expected)
    }

    func testSignChangeSearchRejectsStepThatCannotAdvance() {
        let lower = 1e16
        assertError(.searchDidNotAdvance) {
            _ = try EventNumerics.findSignChangeBrackets(
                functionValue: { $0 - lower },
                lowerArgument: lower,
                upperArgument: lower + 4,
                step: 0.25
            )
        }
    }

    private func assertError(
        _ expected: EventNumericsError,
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
                error as? EventNumericsError,
                expected,
                file: file,
                line: line
            )
        }
    }
}
