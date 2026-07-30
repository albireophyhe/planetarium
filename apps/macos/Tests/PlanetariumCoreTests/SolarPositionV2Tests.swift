import Foundation
import PlanetariumShared
import XCTest

@testable import PlanetariumCore

final class SolarPositionV2Tests: XCTestCase {
    private let fixture: SOFASolarPositionFixture = {
        let data = try! TestFixtureData.data(
            at: "shared/fixtures/sofa-solar-position.v1.json"
        )
        return try! JSONDecoder().decode(
            SOFASolarPositionFixture.self,
            from: data
        )
    }()

    func testSharedSOFASolarPositionVectorsStayWithinScope()
        throws
    {
        XCTAssertEqual(fixture.schemaVersion, 1)
        XCTAssertFalse(fixture.cases.isEmpty)
        XCTAssertTrue(fixture.oracle.contains("SOFA"))
        XCTAssertEqual(
            fixture.assumptions.ephemerisTimeScale,
            "TT as TDB proxy"
        )
        XCTAssertEqual(
            fixture.assumptions.refraction,
            "disabled"
        )
        XCTAssertEqual(
            fixture.assumptions.horizontalOrigin,
            "WGS84 topocenter"
        )
        XCTAssertEqual(
            fixture.assumptions.futureTaiMinusUtcSeconds,
            37
        )
        XCTAssertEqual(
            fixture.assumptions.horizontalAxes,
            "east,north,up"
        )

        var maximumEquatorialResidualArcseconds = 0.0
        var maximumHorizontalResidualArcseconds = 0.0
        var maximumEphemerisDirectionResidualArcseconds =
            0.0
        var maximumEphemerisDistanceResidualAU = 0.0
        for vector in fixture.cases {
            let context = try context(
                for: vector,
                refraction: .disabled
            )
            let result = try Astronomy
                .calculateApparentSunPositionWithContextV2(
                    context
                )
            if try date(vector.observedAtIso)
                >= date("2017-01-01T00:00:00Z")
            {
                XCTAssertEqual(
                    context.timeScales.taiMinusUTCSeconds,
                    Double(
                        fixture.assumptions
                            .futureTaiMinusUtcSeconds
                    ),
                    "\(vector.id) future TAI−UTC"
                )
            }
            let expectedEquatorial = try pair(
                vector.expectedApparentEquatorialRadians
            )
            let expectedENU = try vector3(
                vector.expectedHorizontalEnu
            )
            let earthState =
                try Astronomy
                    .truncatedEarthHeliocentricStateV2(
                        ttJulianDate:
                            context.timeScales.ttJulianDate
                    )
            let expectedEarthPosition = try vector3(
                vector.expectedHeliocentricEarthPositionAu
            )
            let equatorialResidual =
                angularSeparationArcseconds(
                    precisionEquatorialToVector(
                        result.apparentEquatorial
                    ),
                    equatorialVector(
                        rightAscension: expectedEquatorial.0,
                        declination: expectedEquatorial.1
                    )
                )
            let horizontalResidual =
                angularSeparationArcseconds(
                    horizontalENU(
                        result.geometricHorizontal
                    ),
                    expectedENU
                )
            let ephemerisDirectionResidual =
                angularSeparationArcseconds(
                    try XCTUnwrap(
                        earthState.positionAU.normalized()
                    ),
                    try XCTUnwrap(
                        expectedEarthPosition.normalized()
                    )
                )
            let ephemerisDistanceResidual =
                abs(
                    earthState.positionAU.length
                        - expectedEarthPosition.length
                )
            maximumEquatorialResidualArcseconds = max(
                maximumEquatorialResidualArcseconds,
                equatorialResidual
            )
            maximumHorizontalResidualArcseconds = max(
                maximumHorizontalResidualArcseconds,
                horizontalResidual
            )
            maximumEphemerisDirectionResidualArcseconds =
                max(
                    maximumEphemerisDirectionResidualArcseconds,
                    ephemerisDirectionResidual
                )
            maximumEphemerisDistanceResidualAU = max(
                maximumEphemerisDistanceResidualAU,
                ephemerisDistanceResidual
            )

            XCTAssertLessThan(
                equatorialResidual,
                2,
                "\(vector.id) apparent equatorial"
            )
            XCTAssertLessThan(
                horizontalResidual,
                2,
                "\(vector.id) horizontal ENU"
            )
            XCTAssertLessThan(
                ephemerisDirectionResidual,
                1,
                "\(vector.id) heliocentric direction"
            )
            XCTAssertLessThan(
                ephemerisDistanceResidual,
                3e-6,
                "\(vector.id) heliocentric distance"
            )
            XCTAssertEqual(
                result.ephemerisMode,
                .truncatedVSOP2000HeliocentricEarth
            )
            XCTAssertEqual(
                result.aberrationMode,
                .truncatedVSOP2000HeliocentricEarth
            )
            XCTAssertEqual(
                result.diurnalAberrationMode,
                .wgs84Observer
            )
            XCTAssertEqual(result.polarMotionMode, .caller)

            let state = try Sun.state(context: context)
            XCTAssertEqual(
                state.equatorial,
                result.apparentEquatorial
            )
            XCTAssertEqual(
                state.horizontal,
                result.geometricHorizontal
            )
            XCTAssertEqual(
                state.phase,
                Sun.twilightPhase(
                    forSolarAltitude:
                        result.geometricHorizontal.altitude
                )
            )
        }

        print(
            "SOFA solar-position max residuals: "
                + "equatorial="
                + String(
                    format: "%.12f",
                    maximumEquatorialResidualArcseconds
                )
                + " arcsec, horizontal="
                + String(
                    format: "%.12f",
                    maximumHorizontalResidualArcseconds
                )
                + " arcsec, ephemeris-direction="
                + String(
                    format: "%.12f",
                    maximumEphemerisDirectionResidualArcseconds
                )
                + " arcsec, ephemeris-distance="
                + String(
                    format: "%.12g",
                    maximumEphemerisDistanceResidualAU
                )
                + " AU"
        )
    }

    func testSolarGeometryIgnoresConfiguredOpticalRefraction()
        throws
    {
        let vector = try XCTUnwrap(
            fixture.cases.first {
                $0.id == "tokyo-iers-eop-2026-midnight"
            }
        )
        let disabled = try context(
            for: vector,
            refraction: .disabled
        )
        let configured = try context(
            for: vector,
            refraction: .atmosphere(.standardVisual)
        )

        let disabledResult = try Astronomy
            .calculateApparentSunPositionWithContextV2(
                disabled
            )
        let configuredResult = try Astronomy
            .calculateApparentSunPositionWithContextV2(
                configured
            )
        XCTAssertEqual(disabledResult, configuredResult)
        XCTAssertEqual(
            try Sun.state(context: disabled),
            try Sun.state(context: configured)
        )
    }

    func testSolarResultHonorsDisabledAberrationMode() throws {
        let vector = fixture.cases[0]
        let base = try context(
            for: vector,
            refraction: .disabled,
            aberration: .disabled
        )
        let result = try Astronomy
            .calculateApparentSunPositionWithContextV2(base)
        XCTAssertEqual(result.aberrationMode, .disabled)
    }

    func testApparentEquatorialRemainsGeocentricWhileHeightChangesHorizon()
        throws
    {
        let vector = try XCTUnwrap(
            fixture.cases.first {
                $0.id
                    == "mauna-kea-high-altitude-sunrise-2026"
            }
        )
        let location = ObservingLocation(
            id: vector.id,
            name: vector.id,
            latitude: vector.location.latitudeDegrees,
            longitude: vector.location.longitudeDegrees,
            timeZoneIdentifier: "Pacific/Honolulu"
        )
        let date = try date(vector.observedAtIso)
        func result(heightMeters: Double) throws
            -> ApparentSunPositionV2
        {
            let context =
                try Astronomy.createApparentPositionContextV2(
                    at: date,
                    location: location,
                    options: ApparentPositionOptionsV2(
                        diurnalAberration:
                            .wgs84Observer(
                                heightMeters: heightMeters
                            )
                    )
                )
            return try Astronomy
                .calculateApparentSunPositionWithContextV2(
                    context
                )
        }

        let seaLevel = try result(heightMeters: 0)
        let summit = try result(heightMeters: 4_205)
        XCTAssertEqual(
            summit.apparentEquatorial,
            seaLevel.apparentEquatorial
        )
        XCTAssertNotEqual(
            summit.geometricHorizontal,
            seaLevel.geometricHorizontal
        )
    }

    private func context(
        for vector: SOFASolarPositionCase,
        refraction: RefractionConfigurationV2,
        aberration: AberrationConfigurationV2 =
            .truncatedVSOP2000HeliocentricEarth
    ) throws -> ApparentPositionContextV2 {
        try Astronomy.createApparentPositionContextV2(
            at: try date(vector.observedAtIso),
            location: ObservingLocation(
                id: vector.id,
                name: vector.id,
                latitude:
                    vector.location.latitudeDegrees,
                longitude:
                    vector.location.longitudeDegrees,
                timeZoneIdentifier: "UTC"
            ),
            options: ApparentPositionOptionsV2(
                earthOrientation: EarthOrientationOptionsV2(
                    dut1Seconds:
                        vector.earthOrientation.dut1Seconds,
                    dut1Source: .caller,
                    polarMotion: PolarMotionOptionsV2(
                        xpRadians:
                            vector.earthOrientation
                                .xpArcseconds
                            * PrecisionConstants
                                .arcsecondsToRadians,
                        ypRadians:
                            vector.earthOrientation
                                .ypArcseconds
                            * PrecisionConstants
                                .arcsecondsToRadians,
                        source: .caller
                    )
                ),
                aberration: aberration,
                diurnalAberration: .wgs84Observer(
                    heightMeters:
                        vector.location.heightMeters
                ),
                refraction: refraction
            )
        )
    }

    private func date(_ iso: String) throws -> Date {
        guard let date = ISO8601DateFormatter().date(from: iso)
        else {
            throw SolarPositionFixtureError.invalidDate
        }
        return date
    }

    private func pair(
        _ values: [Double]
    ) throws -> (Double, Double) {
        guard values.count == 2 else {
            throw SolarPositionFixtureError.invalidVector
        }
        return (values[0], values[1])
    }

    private func vector3(
        _ values: [Double]
    ) throws -> Vector3D {
        guard values.count == 3 else {
            throw SolarPositionFixtureError.invalidVector
        }
        return Vector3D(
            x: values[0],
            y: values[1],
            z: values[2]
        )
    }

    private func equatorialVector(
        rightAscension: Double,
        declination: Double
    ) -> Vector3D {
        let cosineDeclination = cos(declination)
        return Vector3D(
            x: cosineDeclination * cos(rightAscension),
            y: cosineDeclination * sin(rightAscension),
            z: sin(declination)
        )
    }

    private func horizontalENU(
        _ horizontal: HorizontalCoordinates
    ) -> Vector3D {
        let cosineAltitude = cos(horizontal.altitude)
        return Vector3D(
            x: cosineAltitude * sin(horizontal.azimuth),
            y: cosineAltitude * cos(horizontal.azimuth),
            z: sin(horizontal.altitude)
        )
    }

    private func angularSeparationArcseconds(
        _ left: Vector3D,
        _ right: Vector3D
    ) -> Double {
        atan2(
            left.cross(right).length,
            left.dot(right)
        ) / PrecisionConstants.arcsecondsToRadians
    }
}

private enum SolarPositionFixtureError: Error {
    case invalidDate
    case invalidVector
}

private struct SOFASolarPositionFixture: Decodable {
    let schemaVersion: Int
    let oracle: String
    let assumptions: SOFASolarPositionAssumptions
    let cases: [SOFASolarPositionCase]
}

private struct SOFASolarPositionAssumptions: Decodable {
    let ephemerisTimeScale: String
    let refraction: String
    let horizontalOrigin: String
    let futureTaiMinusUtcSeconds: Int
    let horizontalAxes: String
}

private struct SOFASolarPositionCase: Decodable {
    let id: String
    let observedAtIso: String
    let location: SOFASolarPositionLocation
    let earthOrientation: SOFASolarPositionEarthOrientation
    let expectedHeliocentricEarthPositionAu: [Double]
    let expectedApparentEquatorialRadians: [Double]
    let expectedHorizontalEnu: [Double]
}

private struct SOFASolarPositionLocation: Decodable {
    let longitudeDegrees: Double
    let latitudeDegrees: Double
    let heightMeters: Double
}

private struct SOFASolarPositionEarthOrientation: Decodable {
    let dut1Seconds: Double
    let xpArcseconds: Double
    let ypArcseconds: Double
}
