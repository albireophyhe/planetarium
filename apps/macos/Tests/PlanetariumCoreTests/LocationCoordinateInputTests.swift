import XCTest

@testable import Planetarium

final class LocationCoordinateInputTests:
    XCTestCase
{
    func testPreservesEightFractionalDigitsForEditing()
    {
        XCTAssertEqual(
            LocationCoordinateInput.text(
                for: 35.123_456_78
            ),
            "35.12345678"
        )
        XCTAssertEqual(
            LocationCoordinateInput.text(
                for: -139.987_654_32
            ),
            "-139.98765432"
        )
        XCTAssertEqual(
            LocationCoordinateInput.text(
                for: 35.1
            ),
            "35.1"
        )
    }
}
