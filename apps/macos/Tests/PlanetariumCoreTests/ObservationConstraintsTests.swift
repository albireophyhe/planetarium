import Foundation
import XCTest

@testable import PlanetariumCore

final class ObservationConstraintsTests: XCTestCase {
    func testSupportedDateRangeIncludesEndpointsAndClampsOutsideValues() {
        let minimum = ObservationConstraints.minimumDate
        let maximum = ObservationConstraints.maximumDate

        XCTAssertEqual(
            maximum.timeIntervalSince1970,
            4_133_980_799.999,
            accuracy: 0.000_1
        )
        XCTAssertTrue(ObservationConstraints.supportedDateRange.contains(minimum))
        XCTAssertTrue(ObservationConstraints.supportedDateRange.contains(maximum))
        XCTAssertEqual(
            ObservationConstraints.clampedDate(minimum.addingTimeInterval(-1)),
            minimum
        )
        XCTAssertEqual(
            ObservationConstraints.clampedDate(maximum.addingTimeInterval(1)),
            maximum
        )
        XCTAssertEqual(
            ObservationConstraints.clampedDate(
                Date(timeIntervalSince1970: .nan)
            ),
            minimum
        )
        XCTAssertEqual(
            ObservationConstraints.clampedDate(
                Date(timeIntervalSince1970: -.infinity)
            ),
            minimum
        )
        XCTAssertEqual(
            ObservationConstraints.clampedDate(
                Date(timeIntervalSince1970: .infinity)
            ),
            maximum
        )
    }

    func testSteppedDatePreservesExactHourAwayFromBoundaries() {
        let startingDate = Date(timeIntervalSince1970: 1_700_000_000)
        let result = ObservationConstraints.steppedDate(
            from: startingDate,
            hours: 6
        )

        XCTAssertEqual(
            result.date,
            startingDate.addingTimeInterval(6 * 3_600)
        )
        XCTAssertNil(result.reachedBoundary)
    }

    func testSteppedDateReportsMinimumAndMaximumClamping() {
        let beforeMinimum = ObservationConstraints.steppedDate(
            from: ObservationConstraints.minimumDate,
            hours: -1
        )
        XCTAssertEqual(beforeMinimum.date, ObservationConstraints.minimumDate)
        XCTAssertEqual(beforeMinimum.reachedBoundary, .minimum)

        let afterMaximum = ObservationConstraints.steppedDate(
            from: ObservationConstraints.maximumDate,
            hours: 1
        )
        XCTAssertEqual(afterMaximum.date, ObservationConstraints.maximumDate)
        XCTAssertEqual(afterMaximum.reachedBoundary, .maximum)
    }

    func testSteppedDateCanLandExactlyOnBoundaryWithoutFalseWarning() {
        let result = ObservationConstraints.steppedDate(
            from: ObservationConstraints.maximumDate.addingTimeInterval(-3_600),
            hours: 1
        )

        XCTAssertEqual(result.date, ObservationConstraints.maximumDate)
        XCTAssertNil(result.reachedBoundary)
    }

    func testSteppedDateCanonicalizesNonFiniteStartBeforeMoving() {
        let minimum = ObservationConstraints.minimumDate
        let maximum = ObservationConstraints.maximumDate
        let testCases: [
            (
                date: Date,
                hours: Int,
                expectedDate: Date,
                expectedBoundary: ObservationDateBoundary?
            )
        ] = [
            (
                Date(timeIntervalSince1970: .nan),
                1,
                minimum.addingTimeInterval(3_600),
                nil
            ),
            (
                Date(timeIntervalSince1970: .nan),
                -1,
                minimum,
                .minimum
            ),
            (
                Date(timeIntervalSince1970: -.infinity),
                1,
                minimum.addingTimeInterval(3_600),
                nil
            ),
            (
                Date(timeIntervalSince1970: -.infinity),
                -1,
                minimum,
                .minimum
            ),
            (
                Date(timeIntervalSince1970: .infinity),
                -1,
                maximum.addingTimeInterval(-3_600),
                nil
            ),
            (
                Date(timeIntervalSince1970: .infinity),
                1,
                maximum,
                .maximum
            ),
        ]

        for testCase in testCases {
            let result = ObservationConstraints.steppedDate(
                from: testCase.date,
                hours: testCase.hours
            )
            XCTAssertEqual(result.date, testCase.expectedDate)
            XCTAssertEqual(
                result.reachedBoundary,
                testCase.expectedBoundary
            )
        }
    }

    func testValidatedLocationNormalizesNameAndTimeZone() throws {
        let location = try ObservationConstraints.validatedLocation(
            id: "custom",
            name: "  ",
            latitude: 35.6812,
            longitude: 139.7671,
            timeZoneIdentifier: " Asia/Tokyo "
        )

        XCTAssertEqual(location.name, "指定地点")
        XCTAssertEqual(location.timeZoneIdentifier, "Asia/Tokyo")
        XCTAssertEqual(location.latitude, 35.6812)
        XCTAssertEqual(location.longitude, 139.7671)
    }

    func testValidatedLocationRejectsNonFiniteAndOutOfRangeCoordinates() {
        assertLocationError(.invalidLatitude) {
            try ObservationConstraints.validatedLocation(
                id: "invalid",
                name: "Invalid",
                latitude: .nan,
                longitude: 0,
                timeZoneIdentifier: "UTC"
            )
        }
        assertLocationError(.invalidLatitude) {
            try ObservationConstraints.validatedLocation(
                id: "invalid",
                name: "Invalid",
                latitude: 90.0001,
                longitude: 0,
                timeZoneIdentifier: "UTC"
            )
        }
        assertLocationError(.invalidLongitude) {
            try ObservationConstraints.validatedLocation(
                id: "invalid",
                name: "Invalid",
                latitude: 0,
                longitude: -.infinity,
                timeZoneIdentifier: "UTC"
            )
        }
        assertLocationError(.invalidLongitude) {
            try ObservationConstraints.validatedLocation(
                id: "invalid",
                name: "Invalid",
                latitude: 0,
                longitude: 180.0001,
                timeZoneIdentifier: "UTC"
            )
        }
    }

    func testValidatedLocationRejectsUnknownTimeZone() {
        assertLocationError(.invalidTimeZone) {
            try ObservationConstraints.validatedLocation(
                id: "invalid",
                name: "Invalid",
                latitude: 0,
                longitude: 0,
                timeZoneIdentifier: "Mars/Olympus_Mons"
            )
        }
    }

    func testTextLocationInputNormalizesWhitespaceWidthAndUnicodeMinus() throws {
        let location = try ObservationConstraints.validatedLocation(
            id: "custom",
            name: " Test ",
            latitudeText: " −３５.５ ",
            longitudeText: " １３９.７ ",
            timeZoneIdentifier: " UTC "
        )

        XCTAssertEqual(location.name, "Test")
        XCTAssertEqual(location.latitude, -35.5)
        XCTAssertEqual(location.longitude, 139.7)
        XCTAssertEqual(location.timeZoneIdentifier, "UTC")
    }

    func testTextLocationInputRejectsAmbiguousCommaWithoutMovingDecimalPoint() {
        assertLocationError(.invalidLatitudeNumber) {
            try ObservationConstraints.validatedLocation(
                id: "invalid",
                name: "Invalid",
                latitudeText: "1,234",
                longitudeText: "0",
                timeZoneIdentifier: "UTC"
            )
        }
        assertLocationError(.invalidLongitudeNumber) {
            try ObservationConstraints.validatedLocation(
                id: "invalid",
                name: "Invalid",
                latitudeText: "0",
                longitudeText: "139,7",
                timeZoneIdentifier: "UTC"
            )
        }
    }

    func testTextLocationInputRetainsRangeAndTimeZoneValidation() {
        assertLocationError(.invalidLatitude) {
            try ObservationConstraints.validatedLocation(
                id: "invalid",
                name: "Invalid",
                latitudeText: "90.1",
                longitudeText: "0",
                timeZoneIdentifier: "UTC"
            )
        }
        assertLocationError(.invalidTimeZone) {
            try ObservationConstraints.validatedLocation(
                id: "invalid",
                name: "Invalid",
                latitudeText: "35",
                longitudeText: "139",
                timeZoneIdentifier: "Not/A_Zone"
            )
        }
    }

    private func assertLocationError(
        _ expected: ObservationValidationError,
        operation: () throws -> ObservingLocation
    ) {
        XCTAssertThrowsError(try operation()) { error in
            XCTAssertEqual(error as? ObservationValidationError, expected)
        }
    }
}
