import Foundation
import XCTest

@testable import PlanetariumCore

final class StarAstrometryTests: XCTestCase {
    func testLegacyEightColumnRowDecodesWithoutAstrometry() throws {
        let stars = try PlanetariumData.decodeBrightStars(
            from: documentData(
                row: "[1,null,0.1,0.2,1.5,null,\"Legacy\",\"A0V\"]",
                schemaVersion: 1
            )
        )

        let star = try XCTUnwrap(stars.first)
        XCTAssertEqual(star.hr, 1)
        XCTAssertNil(star.astrometry)
    }

    func testExtendedRowDecodesSourceNativeAstrometryInDeclaredOrder() throws {
        let stars = try PlanetariumData.decodeBrightStars(
            from: documentData(
                row: """
                [2,20,0.3,-0.4,0.5,0.1,"Future","G2V",\
                -0.54601,-1.22307,0.37921,-5.5]
                """,
                schemaVersion: 2
            )
        )

        let astrometry = try XCTUnwrap(stars.first?.astrometry)
        XCTAssertEqual(
            astrometry.properMotionRightAscensionCosDeclinationArcsecondsPerYear,
            -0.54601
        )
        XCTAssertEqual(
            astrometry.properMotionDeclinationArcsecondsPerYear,
            -1.22307
        )
        XCTAssertEqual(astrometry.parallaxArcseconds, 0.37921)
        XCTAssertEqual(astrometry.radialVelocityKilometersPerSecond, -5.5)
        XCTAssertTrue(astrometry.hasProperMotion)
    }

    func testPartialOptionalAstrometryPreservesNulls() throws {
        let stars = try PlanetariumData.decodeBrightStars(
            from: documentData(
                row: "[3,null,0,0,2,null,null,null,null,0.25,null,null]",
                schemaVersion: 2
            )
        )

        let astrometry = try XCTUnwrap(stars.first?.astrometry)
        XCTAssertNil(
            astrometry.properMotionRightAscensionCosDeclinationArcsecondsPerYear
        )
        XCTAssertEqual(
            astrometry.properMotionDeclinationArcsecondsPerYear,
            0.25
        )
        XCTAssertNil(astrometry.parallaxArcseconds)
        XCTAssertNil(astrometry.radialVelocityKilometersPerSecond)
        XCTAssertTrue(astrometry.hasProperMotion)
    }

    private func documentData(
        row: String,
        schemaVersion: Int
    ) -> Data {
        Data(
            """
            {
              "schemaVersion": \(schemaVersion),
              "epoch": "J2000.0",
              "stars": [\(row)]
            }
            """.utf8
        )
    }
}
