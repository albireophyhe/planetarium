import Foundation
import PlanetariumShared
import XCTest

@testable import PlanetariumCore

final class DiurnalAberrationV2Tests: XCTestCase {
    private let fixture: SOFADiurnalAberrationFixture = {
        let data = try! TestFixtureData.data(
            at: "shared/fixtures/sofa-diurnal-aberration.v1.json"
        )
        return try! JSONDecoder().decode(
            SOFADiurnalAberrationFixture.self,
            from: data
        )
    }()

    func testSharedSOFAObserverVectors() throws {
        XCTAssertEqual(fixture.schemaVersion, 1)
        XCTAssertEqual(fixture.cases.count, 7)
        XCTAssertTrue(fixture.oracle.contains("SOFA"))

        for vector in fixture.cases {
            let magnitude =
                try Astronomy.diurnalAberrationMagnitudeV2(
                    geodeticLatitudeRadians: Angles.radians(
                        fromDegrees: vector.latitudeDegrees
                    ),
                    heightMeters: vector.heightMeters
                )
            XCTAssertEqual(
                magnitude,
                vector.diurnalAberrationMagnitude,
                accuracy: 3e-21,
                "\(vector.id) magnitude"
            )

            let geometric = try enu(vector.geometricHorizontalEnu)
            let result = try Astronomy
                .applyDiurnalAberrationToHorizontalENUV2(
                    geometric,
                    magnitude: magnitude
                )
            let expected = try enu(vector.expectedHorizontalEnu)
            XCTAssertEqual(
                result.east,
                expected.east,
                accuracy: 3e-15,
                "\(vector.id) east"
            )
            XCTAssertEqual(
                result.north,
                expected.north,
                accuracy: 3e-15,
                "\(vector.id) north"
            )
            XCTAssertEqual(
                result.up,
                expected.up,
                accuracy: 3e-15,
                "\(vector.id) up"
            )
            XCTAssertEqual(
                angularSeparationArcseconds(
                    geometric,
                    result
                ),
                vector.separationArcseconds,
                accuracy: 3e-8,
                "\(vector.id) separation"
            )
        }
    }

    func testDefaultContextUsesWGS84ZeroHeightAndReportsApproximation()
        throws
    {
        let context = try Astronomy.createApparentPositionContextV2(
            at: observationDate,
            location: tokyo
        )

        guard case let .wgs84Observer(heightMeters, magnitude) =
            context.diurnalAberration
        else {
            return XCTFail("Expected default WGS84 observer")
        }
        XCTAssertEqual(heightMeters, 0)
        XCTAssertEqual(
            magnitude,
            try Astronomy.diurnalAberrationMagnitudeV2(
                geodeticLatitudeRadians: context.latitudeRadians
            ),
            accuracy: 0
        )
        XCTAssertEqual(
            context.diurnalAberration.mode,
            .wgs84Observer
        )
        XCTAssertTrue(
            context.baseWarnings.contains(
                .observerHeightAssumedZero
            )
        )
        XCTAssertFalse(
            context.baseWarnings.contains(
                .diurnalAberrationDisabled
            )
        )

        let result = try Astronomy
            .calculateApparentStarPositionWithContextV2(
                testStar,
                context: context
            )
        XCTAssertEqual(
            result.diurnalAberrationMode,
            .wgs84Observer
        )
        XCTAssertEqual(
            result.metadata.diurnalAberrationMode,
            .wgs84Observer
        )
        XCTAssertFalse(
            result.metadata.omittedCorrections.contains(
                .diurnalAberration
            )
        )
    }

    func testCallerHeightSuppressesApproximationWarning() throws {
        let context = try Astronomy.createApparentPositionContextV2(
            at: observationDate,
            location: tokyo,
            options: ApparentPositionOptionsV2(
                diurnalAberration:
                    .wgs84Observer(heightMeters: 1_000)
            )
        )

        XCTAssertEqual(
            context.diurnalAberration.heightMeters,
            1_000
        )
        XCTAssertGreaterThan(
            try XCTUnwrap(context.diurnalAberration.magnitude),
            try Astronomy.diurnalAberrationMagnitudeV2(
                geodeticLatitudeRadians: context.latitudeRadians
            )
        )
        XCTAssertFalse(
            context.baseWarnings.contains(
                .observerHeightAssumedZero
            )
        )
    }

    func testPolarObserversAndNegativeEllipsoidHeightAreFinite() throws {
        let northPole =
            try Astronomy.diurnalAberrationMagnitudeV2(
                geodeticLatitudeRadians: Double.pi / 2
            )
        let southPole =
            try Astronomy.diurnalAberrationMagnitudeV2(
                geodeticLatitudeRadians: -Double.pi / 2
            )
        let equatorAtZeroHeight =
            try Astronomy.diurnalAberrationMagnitudeV2(
                geodeticLatitudeRadians: 0
            )
        let equatorBelowEllipsoid =
            try Astronomy.diurnalAberrationMagnitudeV2(
                geodeticLatitudeRadians: 0,
                heightMeters: -430
            )

        XCTAssertTrue(northPole.isFinite)
        XCTAssertTrue(southPole.isFinite)
        XCTAssertEqual(northPole, southPole, accuracy: 1e-30)
        XCTAssertLessThan(northPole, 1e-20)
        XCTAssertGreaterThan(equatorBelowEllipsoid, 0)
        XCTAssertLessThan(
            equatorBelowEllipsoid,
            equatorAtZeroHeight
        )
    }

    func testExplicitDisableIsVisibleInWarningsResultsAndOmissions()
        throws
    {
        let context = try Astronomy.createApparentPositionContextV2(
            at: observationDate,
            location: tokyo,
            options: ApparentPositionOptionsV2(
                diurnalAberration: .disabled
            )
        )
        let result = try Astronomy
            .calculateApparentStarPositionWithContextV2(
                testStar,
                context: context
            )

        XCTAssertEqual(context.diurnalAberration.mode, .disabled)
        XCTAssertEqual(result.diurnalAberrationMode, .disabled)
        XCTAssertEqual(
            result.metadata.diurnalAberrationMode,
            .disabled
        )
        XCTAssertTrue(
            result.metadata.warnings.contains(
                .diurnalAberrationDisabled
            )
        )
        XCTAssertFalse(
            result.metadata.warnings.contains(
                .observerHeightAssumedZero
            )
        )
        XCTAssertTrue(
            result.metadata.omittedCorrections.contains(
                .diurnalAberration
            )
        )
    }

    func testPipelineCorrectsENUAfterEarthRotation() throws {
        let disabled = try Astronomy.createApparentPositionContextV2(
            at: observationDate,
            location: tokyo,
            options: ApparentPositionOptionsV2(
                annualParallax: .disabled,
                aberration: .disabled,
                diurnalAberration: .disabled
            )
        )
        let enabled = try Astronomy.createApparentPositionContextV2(
            at: observationDate,
            location: tokyo,
            options: ApparentPositionOptionsV2(
                annualParallax: .disabled,
                aberration: .disabled,
                diurnalAberration:
                    .wgs84Observer(heightMeters: 0)
            )
        )
        let rightAscension =
            disabled.greenwichApparentSiderealTime
            + disabled.longitudeRadians - 0.4
        let declination = -0.2
        let geometric = try geometricHorizontalV2(
            rightAscension: rightAscension,
            declination: declination,
            context: disabled
        )
        let actual = try geometricHorizontalV2(
            rightAscension: rightAscension,
            declination: declination,
            context: enabled
        )
        let geometricENU = horizontalENU(geometric)
        let expectedENU = try Astronomy
            .applyDiurnalAberrationToHorizontalENUV2(
                geometricENU,
                magnitude: try XCTUnwrap(
                    enabled.diurnalAberration.magnitude
                )
            )
        let actualENU = horizontalENU(actual)

        XCTAssertEqual(
            actualENU.east,
            expectedENU.east,
            accuracy: 2e-15
        )
        XCTAssertEqual(
            actualENU.north,
            expectedENU.north,
            accuracy: 2e-15
        )
        XCTAssertEqual(
            actualENU.up,
            expectedENU.up,
            accuracy: 2e-15
        )
    }

    func testPipelineAppliesRefractionAfterDiurnalAberration() throws {
        let baseContext = try Astronomy.createApparentPositionContextV2(
            at: observationDate,
            location: tokyo,
            options: ApparentPositionOptionsV2(
                annualParallax: .disabled,
                aberration: .disabled,
                diurnalAberration:
                    .wgs84Observer(heightMeters: 0)
            )
        )
        let twoPi = 2 * Double.pi
        let rawRightAscension =
            baseContext.greenwichApparentSiderealTime
            + baseContext.longitudeRadians
        let rightAscension =
            (rawRightAscension.truncatingRemainder(
                dividingBy: twoPi
            ) + twoPi).truncatingRemainder(dividingBy: twoPi)
        let highStar = CatalogStar(
            hr: 99_902,
            hd: nil,
            rightAscension: rightAscension,
            declination: baseContext.latitudeRadians,
            visualMagnitude: 1,
            bvColor: nil,
            catalogName: "Refraction-order fixture",
            spectralType: nil,
            astrometry: nil
        )
        let corrected = try Astronomy
            .calculateApparentStarPositionWithContextV2(
                highStar,
                context: baseContext
            )
        let refractedContext = try Astronomy
            .createApparentPositionContextV2(
                at: observationDate,
                location: tokyo,
                options: ApparentPositionOptionsV2(
                    annualParallax: .disabled,
                    aberration: .disabled,
                    diurnalAberration:
                        .wgs84Observer(heightMeters: 0),
                    refraction:
                        .atmosphere(.standardVisual)
                )
            )
        let refracted = try Astronomy
            .calculateApparentStarPositionWithContextV2(
                highStar,
                context: refractedContext
            )
        let expectedRefraction = try Astronomy
            .applyVisualRefractionV2(
                to: corrected.geometricHorizontal.altitude,
                atmosphere: .standardVisual
            )

        XCTAssertEqual(expectedRefraction.mode, .applied)
        XCTAssertEqual(
            refracted.geometricHorizontal.altitude,
            corrected.geometricHorizontal.altitude,
            accuracy: 2e-15
        )
        XCTAssertEqual(
            refracted.geometricHorizontal.azimuth,
            corrected.geometricHorizontal.azimuth,
            accuracy: 2e-15
        )
        XCTAssertEqual(
            refracted.observedHorizontal.altitude,
            expectedRefraction.altitude,
            accuracy: 2e-15
        )
        XCTAssertEqual(
            refracted.observedHorizontal.azimuth,
            corrected.geometricHorizontal.azimuth,
            accuracy: 0
        )
        XCTAssertEqual(refracted.refractionMode, .applied)
    }

    func testGuardrailsRejectInvalidLatitudeHeightMagnitudeAndVector() {
        assertPrecisionError(.invalidGeodeticLatitude) {
            try Astronomy.diurnalAberrationMagnitudeV2(
                geodeticLatitudeRadians: .nan
            )
        }
        assertPrecisionError(.invalidGeodeticLatitude) {
            try Astronomy.diurnalAberrationMagnitudeV2(
                geodeticLatitudeRadians:
                    Double.pi / 2 + 1e-12
            )
        }
        assertPrecisionError(.invalidWGS84EllipsoidHeight) {
            try Astronomy.diurnalAberrationMagnitudeV2(
                geodeticLatitudeRadians: 0,
                heightMeters: .infinity
            )
        }
        assertPrecisionError(.invalidWGS84EllipsoidHeight) {
            try Astronomy.diurnalAberrationMagnitudeV2(
                geodeticLatitudeRadians: 0,
                heightMeters: -6_378_137
            )
        }
        for magnitude in [Double.nan, -1e-12, 1, .infinity] {
            assertPrecisionError(
                .invalidDiurnalAberrationMagnitude
            ) {
                try Astronomy
                    .applyDiurnalAberrationToHorizontalENUV2(
                        HorizontalENUVectorV2(
                            east: 0,
                            north: 0,
                            up: 1
                        ),
                        magnitude: magnitude
                    )
            }
        }
        assertPrecisionError(.invalidVector) {
            try Astronomy
                .applyDiurnalAberrationToHorizontalENUV2(
                    HorizontalENUVectorV2(
                        east: 0,
                        north: 0,
                        up: 0
                    ),
                    magnitude: 0
                )
        }
        for direction in [
            HorizontalENUVectorV2(
                east: .nan,
                north: 0,
                up: 1
            ),
            HorizontalENUVectorV2(
                east: 0,
                north: .infinity,
                up: 1
            ),
        ] {
            assertPrecisionError(.invalidVector) {
                try Astronomy
                    .applyDiurnalAberrationToHorizontalENUV2(
                        direction,
                        magnitude: 0
                    )
            }
        }
    }

    func testWGS84ITRSSiteVectorsUseEastPositiveLongitude()
        throws
    {
        let auMeters =
            PrecisionConstants.astronomicalUnitKilometers
            * 1_000
        let equatorGreenwich =
            try Astronomy.wgs84ObserverPositionITRSAUV2(
                geodeticLatitudeRadians: 0,
                longitudeRadians: 0
            )
        let equatorEast90 =
            try Astronomy.wgs84ObserverPositionITRSAUV2(
                geodeticLatitudeRadians: 0,
                longitudeRadians: Double.pi / 2
            )
        let northPole =
            try Astronomy.wgs84ObserverPositionITRSAUV2(
                geodeticLatitudeRadians: Double.pi / 2,
                longitudeRadians: 0,
                heightMeters: 4_205
            )

        XCTAssertEqual(
            equatorGreenwich.x * auMeters,
            6_378_137,
            accuracy: 1e-7
        )
        XCTAssertEqual(equatorGreenwich.y, 0)
        XCTAssertEqual(equatorGreenwich.z, 0)
        XCTAssertEqual(
            equatorEast90.x * auMeters,
            0,
            accuracy: 1e-7
        )
        XCTAssertEqual(
            equatorEast90.y * auMeters,
            6_378_137,
            accuracy: 1e-7
        )
        XCTAssertEqual(
            northPole.x * auMeters,
            0,
            accuracy: 1e-7
        )
        XCTAssertEqual(northPole.y, 0)
        XCTAssertEqual(
            northPole.z * auMeters,
            6_356_752.314_245 + 4_205,
            accuracy: 1e-6
        )
    }

    func testTopocentricSolarParallaxLowersHorizonRay()
        throws
    {
        let observer =
            try Astronomy.wgs84ObserverPositionITRSAUV2(
                geodeticLatitudeRadians: 0,
                longitudeRadians: 0
            )
        let geocentric = Vector3D.unitY
        let topocentric =
            try Astronomy
                .applyTopocentricParallaxToITRSDirectionV2(
                    geocentricUnitDirection: geocentric,
                    geocentricDistanceAU: 1,
                    observerPositionITRSAU: observer
                )
        let separation =
            atan2(
                geocentric.cross(topocentric).length,
                geocentric.dot(topocentric)
            )
            / PrecisionConstants.arcsecondsToRadians

        XCTAssertLessThan(topocentric.x, 0)
        XCTAssertGreaterThan(topocentric.y, 0)
        XCTAssertEqual(topocentric.z, 0)
        XCTAssertEqual(
            separation,
            8.794_143_831,
            accuracy: 1e-9
        )
    }

    private let tokyo = ObservingLocation(
        id: "tokyo",
        name: "東京",
        latitude: 35.6812,
        longitude: 139.7671,
        timeZoneIdentifier: "Asia/Tokyo"
    )

    private let observationDate = ISO8601DateFormatter().date(
        from: "2026-07-29T12:00:00Z"
    )!

    private let testStar = CatalogStar(
        hr: 99_901,
        hd: nil,
        rightAscension: 1.2,
        declination: -0.3,
        visualMagnitude: 1,
        bvColor: nil,
        catalogName: "Diurnal fixture",
        spectralType: nil,
        astrometry: nil
    )

    private func enu(
        _ values: [Double],
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> HorizontalENUVectorV2 {
        XCTAssertEqual(values.count, 3, file: file, line: line)
        guard values.count == 3 else {
            throw DiurnalAberrationFixtureError.invalidVector
        }
        return HorizontalENUVectorV2(
            east: values[0],
            north: values[1],
            up: values[2]
        )
    }

    private func horizontalENU(
        _ horizontal: HorizontalCoordinates
    ) -> HorizontalENUVectorV2 {
        let cosineAltitude = cos(horizontal.altitude)
        return HorizontalENUVectorV2(
            east: cosineAltitude * sin(horizontal.azimuth),
            north: cosineAltitude * cos(horizontal.azimuth),
            up: sin(horizontal.altitude)
        )
    }

    private func angularSeparationArcseconds(
        _ left: HorizontalENUVectorV2,
        _ right: HorizontalENUVectorV2
    ) -> Double {
        let crossX = left.north * right.up - left.up * right.north
        let crossY = left.up * right.east - left.east * right.up
        let crossZ = left.east * right.north - left.north * right.east
        let crossMagnitude = hypot(
            crossX,
            hypot(crossY, crossZ)
        )
        let dot =
            left.east * right.east
            + left.north * right.north
            + left.up * right.up
        return atan2(crossMagnitude, dot)
            / PrecisionConstants.arcsecondsToRadians
    }

    private func assertPrecisionError(
        _ expected: PrecisionModelError,
        file: StaticString = #filePath,
        line: UInt = #line,
        _ body: () throws -> some Any
    ) {
        XCTAssertThrowsError(
            try body(),
            file: file,
            line: line
        ) { error in
            XCTAssertEqual(
                error as? PrecisionModelError,
                expected,
                file: file,
                line: line
            )
        }
    }
}

private enum DiurnalAberrationFixtureError: Error {
    case invalidVector
}

private struct SOFADiurnalAberrationFixture: Decodable {
    let schemaVersion: Int
    let oracle: String
    let cases: [SOFADiurnalAberrationCase]
}

private struct SOFADiurnalAberrationCase: Decodable {
    let id: String
    let latitudeDegrees: Double
    let heightMeters: Double
    let diurnalAberrationMagnitude: Double
    let geometricHorizontalEnu: [Double]
    let expectedHorizontalEnu: [Double]
    let separationArcseconds: Double
}
