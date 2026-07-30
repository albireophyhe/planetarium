import XCTest

@testable import PlanetariumCore

final class AstronomicalFormattingTests: XCTestCase {
    func testRightAscensionCarriesRoundedSecondsAcrossMidnight() {
        let hours = 23 + 59.0 / 60 + 59.96 / 3_600
        let radians = hours * .pi / 12

        XCTAssertEqual(
            AstronomicalFormatting.rightAscension(radians),
            "00h 00m 00.0s"
        )
        XCTAssertEqual(
            AstronomicalFormatting.rightAscension(
                Angles.radians(fromDegrees: -15)
            ),
            "23h 00m 00.0s"
        )
        XCTAssertEqual(
            AstronomicalFormatting.rightAscension(
                (23 + 59.0 / 60 + 59.996 / 3_600)
                    * .pi / 12,
                fractionDigits: 2
            ),
            "00h 00m 00.00s"
        )
    }

    func testDeclinationCarriesRoundedSecondsIntoDegrees() {
        let degrees = 12 + 59.0 / 60 + 59.96 / 3_600

        XCTAssertEqual(
            AstronomicalFormatting.declination(
                Angles.radians(fromDegrees: degrees)
            ),
            "+13° 00′ 00.0″"
        )
        XCTAssertEqual(
            AstronomicalFormatting.declination(-0.0),
            "+00° 00′ 00.0″"
        )
        XCTAssertEqual(
            AstronomicalFormatting.declination(
                Angles.radians(
                    fromDegrees:
                        -(12 + 59.0 / 60 + 59.996 / 3_600)
                ),
                fractionDigits: 2
            ),
            "−13° 00′ 00.00″"
        )
    }

    func testAzimuthNormalizesNegativeAndRoundedFullCircleValues() {
        XCTAssertEqual(
            AstronomicalFormatting.azimuth(
                Angles.radians(fromDegrees: -45)
            ),
            "北西 315.0°"
        )
        XCTAssertEqual(
            AstronomicalFormatting.azimuth(Angles.twoPi),
            "北 0.0°"
        )
        XCTAssertEqual(
            AstronomicalFormatting.azimuth(
                Angles.radians(fromDegrees: 359.96)
            ),
            "北 0.0°"
        )
        XCTAssertEqual(
            AstronomicalFormatting.azimuth(
                Angles.radians(fromDegrees: -45.1254),
                fractionDigits: 3
            ),
            "北西 314.875°"
        )
    }

    func testDegreeFormattingRemovesNegativeZeroAndRejectsNonFiniteValues() {
        XCTAssertEqual(
            AstronomicalFormatting.degrees(
                Angles.radians(fromDegrees: -0.04)
            ),
            "0.0°"
        )
        XCTAssertEqual(
            AstronomicalFormatting.degrees(
                Angles.radians(fromDegrees: -12.5)
            ),
            "−12.5°"
        )
        XCTAssertEqual(
            AstronomicalFormatting.decimal(-1.46, fractionDigits: 2),
            "−1.46"
        )
        XCTAssertEqual(
            AstronomicalFormatting.decimal(-0.004, fractionDigits: 2),
            "0.00"
        )
        XCTAssertEqual(AstronomicalFormatting.degrees(.nan), "—")
        XCTAssertEqual(AstronomicalFormatting.decimal(.infinity), "—")
        XCTAssertEqual(AstronomicalFormatting.rightAscension(.infinity), "—")
        XCTAssertEqual(AstronomicalFormatting.declination(.nan), "—")
        XCTAssertEqual(AstronomicalFormatting.azimuth(-.infinity), "—")
    }

    func testUndefinedZenithAzimuthIsNotMisreportedAsNorth() {
        let undefined = HorizontalCoordinates(
            altitude: .pi / 2,
            azimuth: 0,
            azimuthIsDefined: false
        )
        let definedNorth = HorizontalCoordinates(
            altitude: 0,
            azimuth: 0,
            azimuthIsDefined: true
        )

        XCTAssertEqual(AstronomicalFormatting.azimuth(undefined), "不定")
        XCTAssertEqual(AstronomicalFormatting.azimuth(definedNorth), "北 0.0°")
    }
}
