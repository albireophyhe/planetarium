import Foundation
import XCTest

@testable import PlanetariumCore

final class PolarMotionV2Tests: XCTestCase {
    func testOfficialSOFAPOM00ReferenceMatrix() throws {
        let matrix = try Astronomy.polarMotionMatrix2000V2(
            xpRadians: 2.550_602_38e-7,
            ypRadians: 1.860_359_247e-6,
            tioLocatorRadians:
                -0.136_717_458_072_889_146e-10
        )
        let expected = [
            [
                0.999_999_999_999_967_472_1,
                -0.136_717_458_072_884_698_9e-10,
                0.255_060_237_999_997_234_5e-6,
            ],
            [
                0.141_462_494_795_702_980_1e-10,
                0.999_999_999_998_269_531_7,
                -0.186_035_924_699_886_638_9e-5,
            ],
            [
                -0.255_060_237_974_121_502_1e-6,
                0.186_035_924_700_241_402_1e-5,
                0.999_999_999_998_237_003_9,
            ],
        ]
        let actual = [
            [matrix.row0.x, matrix.row0.y, matrix.row0.z],
            [matrix.row1.x, matrix.row1.y, matrix.row1.z],
            [matrix.row2.x, matrix.row2.y, matrix.row2.z],
        ]
        for row in 0..<3 {
            for column in 0..<3 {
                XCTAssertEqual(
                    actual[row][column],
                    expected[row][column],
                    accuracy: row == column ? 1e-12 : 1e-16
                )
            }
        }
    }

    func testOfficialSOFASP00ReferenceValue() throws {
        XCTAssertEqual(
            try Astronomy.approximateTIOLocatorV2(
                ttJulianDate: 2_400_000.5 + 52_541
            ),
            -0.621_669_846_998_101_930_9e-11,
            accuracy: 1e-22
        )
    }

    func testAxesAndSignsRemainDistinct() throws {
        let amount =
            0.5 * PrecisionConstants.arcsecondsToRadians
        let xpOnly =
            try Astronomy.polarMotionMatrix2000V2(
                xpRadians: amount,
                ypRadians: 0,
                tioLocatorRadians: 0
            ).applying(to: .unitX)
        let ypOnly =
            try Astronomy.polarMotionMatrix2000V2(
                xpRadians: 0,
                ypRadians: amount,
                tioLocatorRadians: 0
            ).applying(to: .unitY)

        XCTAssertEqual(
            xpOnly.z,
            -sin(amount),
            accuracy: 1e-18
        )
        XCTAssertEqual(
            ypOnly.z,
            sin(amount),
            accuracy: 1e-18
        )
        XCTAssertEqual(xpOnly.y, 0, accuracy: 1e-18)
        XCTAssertEqual(ypOnly.x, 0, accuracy: 1e-18)
    }

    func testGuardrailsRejectNonFiniteAndExtremeInputs() {
        XCTAssertThrowsError(
            try Astronomy.approximateTIOLocatorV2(
                ttJulianDate: .nan
            )
        )
        XCTAssertThrowsError(
            try Astronomy.polarMotionMatrix2000V2(
                xpRadians:
                    11
                    * PrecisionConstants.arcsecondsToRadians,
                ypRadians: 0,
                tioLocatorRadians: 0
            )
        )
        XCTAssertThrowsError(
            try Astronomy.polarMotionMatrix2000V2(
                xpRadians: 0,
                ypRadians: .infinity,
                tioLocatorRadians: 0
            )
        )
        XCTAssertThrowsError(
            try Astronomy.polarMotionMatrix2000V2(
                xpRadians: 0,
                ypRadians: 0,
                tioLocatorRadians:
                    2
                    * PrecisionConstants.arcsecondsToRadians
            )
        )
    }

    func testPipelineAppliesGASTThenPolarMotionThenSiteENU()
        throws
    {
        let location = ObservingLocation(
            id: "pipeline",
            name: "pipeline",
            latitude: 34.5,
            longitude: 141.25,
            timeZoneIdentifier: "UTC"
        )
        let polar = PolarMotionOptionsV2(
            xpRadians: 0.35
                * PrecisionConstants.arcsecondsToRadians,
            ypRadians: -0.22
                * PrecisionConstants.arcsecondsToRadians,
            source: .caller
        )
        let context =
            try Astronomy.createApparentPositionContextV2(
                at: ISO8601DateFormatter().date(
                    from: "2026-07-29T12:00:00Z"
                )!,
                location: location,
                options: ApparentPositionOptionsV2(
                    earthOrientation:
                        EarthOrientationOptionsV2(
                            dut1Seconds: 0.1,
                            polarMotion: polar
                        ),
                    annualParallax: .disabled,
                    aberration: .disabled,
                    diurnalAberration: .disabled
                )
            )
        let rightAscension = 1.234
        let declination = -0.456
        let actual = try geometricHorizontalV2(
            rightAscension: rightAscension,
            declination: declination,
            context: context
        )

        let cosineDeclination = cos(declination)
        let apparent = Vector3D(
            x: cosineDeclination * cos(rightAscension),
            y: cosineDeclination * sin(rightAscension),
            z: sin(declination)
        )
        let tirs = PrecisionMatrix3.passiveRotationZ(
            context.greenwichApparentSiderealTime
        ).applying(to: apparent)
        let itrs = context.polarMotion.matrix.applying(
            to: tirs
        )
        let longitude = context.longitudeRadians
        let latitude = context.latitudeRadians
        let east =
            -sin(longitude) * itrs.x
            + cos(longitude) * itrs.y
        let north =
            -sin(latitude) * cos(longitude) * itrs.x
            - sin(latitude) * sin(longitude) * itrs.y
            + cos(latitude) * itrs.z
        let up =
            cos(latitude) * cos(longitude) * itrs.x
            + cos(latitude) * sin(longitude) * itrs.y
            + sin(latitude) * itrs.z
        let expectedAltitude = atan2(
            up,
            hypot(east, north)
        )
        let expectedAzimuth = Angles.normalizedRadians(
            atan2(east, north)
        )

        XCTAssertEqual(
            actual.altitude,
            expectedAltitude,
            accuracy: 5e-15
        )
        XCTAssertEqual(
            actual.azimuth,
            expectedAzimuth,
            accuracy: 5e-15
        )
    }

    func testAssumedZeroIsExplicitInWarningsAndMetadata()
        throws
    {
        let position =
            try Astronomy.calculateApparentStarPositionV2(
                testStar,
                at: ISO8601DateFormatter().date(
                    from: "2026-07-29T12:00:00Z"
                )!,
                location: testLocation,
                options: ApparentPositionOptionsV2(
                    earthOrientation:
                        EarthOrientationOptionsV2(
                            polarMotion: .assumedZero
                        )
                )
            )

        XCTAssertEqual(
            position.polarMotionMode,
            .assumedZero
        )
        XCTAssertTrue(
            position.metadata.warnings.contains(
                .polarMotionAssumedZero
            )
        )
        XCTAssertTrue(
            position.metadata.omittedCorrections.contains(
                .polarMotion
            )
        )
        XCTAssertFalse(
            position.metadata.omittedCorrections.contains(
                .subdailyPolarMotionTides
            )
        )
    }

    func testIERSModeRequiresPairedReportedErrors()
        throws
    {
        let date = ISO8601DateFormatter().date(
            from: "2026-07-29T12:00:00Z"
        )!
        XCTAssertThrowsError(
            try Astronomy.createApparentPositionContextV2(
                at: date,
                location: testLocation,
                options: ApparentPositionOptionsV2(
                    earthOrientation:
                        EarthOrientationOptionsV2(
                            polarMotion:
                                PolarMotionOptionsV2(
                                    xpRadians: 1e-7,
                                    ypRadians: 2e-7,
                                    source: .iersObserved
                                )
                        )
                )
            )
        )
        let context =
            try Astronomy.createApparentPositionContextV2(
                at: date,
                location: testLocation,
                options: ApparentPositionOptionsV2(
                    earthOrientation:
                        EarthOrientationOptionsV2(
                            polarMotion:
                                PolarMotionOptionsV2(
                                    xpRadians: 1e-7,
                                    ypRadians: 2e-7,
                                    source: .iersObserved,
                                    xpReportedErrorRadians:
                                        1e-9,
                                    ypReportedErrorRadians:
                                        2e-9
                                )
                        )
                )
            )
        XCTAssertEqual(
            context.polarMotion.mode,
            .iersObserved
        )
    }

    private var testStar: CatalogStar {
        CatalogStar(
            hr: 2491,
            hd: 48_915,
            rightAscension:
                Angles.radians(fromDegrees: 101.287_155_33),
            declination:
                Angles.radians(fromDegrees: -16.716_115_86),
            visualMagnitude: -1.46,
            bvColor: 0,
            catalogName: "Sirius",
            spectralType: "A1V"
        )
    }

    private var testLocation: ObservingLocation {
        ObservingLocation(
            id: "tokyo",
            name: "東京",
            latitude: 35.6812,
            longitude: 139.7671,
            timeZoneIdentifier: "Asia/Tokyo"
        )
    }
}
