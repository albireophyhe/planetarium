import Foundation
import XCTest

@testable import PlanetariumCore

final class EventTimeScalesTests: XCTestCase {
    func testDominantTermsMatchWebReferenceValues() throws {
        let references: [(julianDate: Double, seconds: Double)] = [
            (2_415_020.5, -0.000_030_278_564_185_741_654),
            (2_451_545.0, -0.000_072_670_073_241_837_49),
            (2_461_150.0, 0.001_599_644_788_281_761_2),
            (2_488_069.5, -0.000_115_013_256_103_882_98),
        ]

        for reference in references {
            XCTAssertEqual(
                try EventTimeScales.tdbMinusTtSeconds(
                    ttJulianDate: reference.julianDate
                ),
                reference.seconds,
                accuracy: 1e-15
            )
        }
    }

    func testPeriodicCorrectionStaysWithinPhysicalBound() throws {
        for year in 1900...2100 {
            let julianDate =
                2_415_020.5 + Double(year - 1900) * 365.2425
            XCTAssertLessThan(
                abs(
                    try EventTimeScales.tdbMinusTtSeconds(
                        ttJulianDate: julianDate
                    )
                ),
                0.001_8
            )
        }
    }

    func testTTToTDBAddsCorrectionInJulianDays() throws {
        let ttJulianDate = 2_451_545.0
        let correction = try EventTimeScales.tdbMinusTtSeconds(
            ttJulianDate: ttJulianDate
        )
        let tdbJulianDate = try EventTimeScales.ttToTdbJulianDate(
            ttJulianDate: ttJulianDate
        )

        XCTAssertLessThan(tdbJulianDate, ttJulianDate)
        XCTAssertLessThan(
            abs(
                (tdbJulianDate - ttJulianDate) * 86_400
                    - correction
            ),
            0.000_02
        )
    }

    func testRejectsNonFiniteTT() {
        for value in [Double.nan, -.infinity, .infinity] {
            XCTAssertThrowsError(
                try EventTimeScales.tdbMinusTtSeconds(
                    ttJulianDate: value
                )
            ) { error in
                XCTAssertEqual(
                    error as? EventTimeScaleError,
                    .nonFiniteTTJulianDate
                )
            }
            XCTAssertThrowsError(
                try EventTimeScales.ttToTdbJulianDate(
                    ttJulianDate: value
                )
            ) { error in
                XCTAssertEqual(
                    error as? EventTimeScaleError,
                    .nonFiniteTTJulianDate
                )
            }
        }
    }
}
