import Foundation
import PlanetariumShared
import XCTest

@testable import PlanetariumCore

final class SolarLightDeflectionV2Tests: XCTestCase {
    private let fixture: SOFASolarLightDeflectionFixture = {
        let data = try! TestFixtureData.data(
            at:
                "shared/fixtures/"
                + "sofa-solar-light-deflection.v1.json"
        )
        return try! JSONDecoder().decode(
            SOFASolarLightDeflectionFixture.self,
            from: data
        )
    }()

    func testAllSharedSOFALightDeflectionVectors() throws {
        XCTAssertEqual(fixture.schemaVersion, 1)
        XCTAssertEqual(fixture.cases.count, 6)
        XCTAssertTrue(fixture.oracle.contains("SOFA"))

        for vector in fixture.cases {
            let result = try Astronomy
                .applySolarLightDeflectionV2(
                    naturalDirection:
                        try vector3(vector.naturalDirection),
                    sunToObserverUnitDirection:
                        try vector3(
                            vector.sunToObserverUnitDirection
                        ),
                    sunObserverDistanceAU:
                        vector.sunObserverDistanceAu
                )
            let expected = try precisionNormalized(
                try vector3(vector.expectedDeflectedDirection)
            )

            XCTAssertEqual(
                result.x,
                expected.x,
                accuracy: 5e-15,
                "\(vector.id) x"
            )
            XCTAssertEqual(
                result.y,
                expected.y,
                accuracy: 5e-15,
                "\(vector.id) y"
            )
            XCTAssertEqual(
                result.z,
                expected.z,
                accuracy: 5e-15,
                "\(vector.id) z"
            )
            XCTAssertTrue(result.isFinite, "\(vector.id) finite")
            XCTAssertEqual(
                result.length,
                1,
                accuracy: 3e-16,
                "\(vector.id) unit"
            )
        }
    }

    func testOfficialLimiterAndSolarCenterBehavior() throws {
        let oneAU = try Astronomy.prepareSolarLightDeflectionV2(
            sunToObserverUnitDirection: .unitX,
            sunObserverDistanceAU: 1,
            mode: .callerSunObserverGeometry
        )
        let tenAU = try Astronomy.prepareSolarLightDeflectionV2(
            sunToObserverUnitDirection: .unitX,
            sunObserverDistanceAU: 10,
            mode: .callerSunObserverGeometry
        )

        XCTAssertEqual(oneAU.deflectionLimiter, 1e-6)
        XCTAssertEqual(tenAU.deflectionLimiter, 1e-8)
        XCTAssertEqual(
            try Astronomy
                .applyPreparedSolarLightDeflectionToUnitDirectionV2(
                    -.unitX,
                    prepared: oneAU
                ),
            -.unitX
        )
    }

    func testGuardrailsRejectInvalidGeometryAndDirections() {
        assertThrows(.invalidVector) {
            _ = try Astronomy.prepareSolarLightDeflectionV2(
                sunToObserverUnitDirection: .zero,
                sunObserverDistanceAU: 1,
                mode: .callerSunObserverGeometry
            )
        }
        assertThrows(.invalidVector) {
            _ = try Astronomy.prepareSolarLightDeflectionV2(
                sunToObserverUnitDirection:
                    Vector3D(x: 1 + 2e-9, y: 0, z: 0),
                sunObserverDistanceAU: 1,
                mode: .callerSunObserverGeometry
            )
        }
        assertThrows(.invalidVector) {
            _ = try Astronomy.prepareSolarLightDeflectionV2(
                sunToObserverUnitDirection: .unitX,
                sunObserverDistanceAU: 1,
                mode: .disabled
            )
        }
        for distance in [
            0,
            -.infinity,
            .infinity,
            .nan,
            Double.leastNonzeroMagnitude,
            Double.greatestFiniteMagnitude,
        ] {
            assertThrows(.invalidSunObserverDistance) {
                _ = try Astronomy.prepareSolarLightDeflectionV2(
                    sunToObserverUnitDirection: .unitX,
                    sunObserverDistanceAU: distance,
                    mode: .callerSunObserverGeometry
                )
            }
        }

        let prepared = try! Astronomy
            .prepareSolarLightDeflectionV2(
                sunToObserverUnitDirection: .unitX,
                sunObserverDistanceAU: 1,
                mode: .callerSunObserverGeometry
            )
        assertThrows(.invalidVector) {
            _ = try Astronomy
                .applyPreparedSolarLightDeflectionToUnitDirectionV2(
                    .zero,
                    prepared: prepared
                )
        }
        assertThrows(.invalidVector) {
            _ = try Astronomy
                .applyPreparedSolarLightDeflectionToUnitDirectionV2(
                    Vector3D(x: .nan, y: 0, z: 0),
                    prepared: prepared
                )
        }
    }

    func testContextModesWarningsAndOmissionsRemainSeparated()
        throws
    {
        let defaultContext =
            try Astronomy.createApparentPositionContextV2(
                at: observationDate,
                location: tokyo
            )
        guard case let .prepared(defaultPrepared) =
            defaultContext.solarLightDeflection
        else {
            return XCTFail("Expected default solar deflection")
        }
        XCTAssertEqual(
            defaultPrepared.mode,
            .truncatedVSOP2000HeliocentricEarth
        )
        XCTAssertTrue(
            defaultContext.baseWarnings.contains(
                .solarLightDeflectionApproximateEphemeris
            )
        )
        let defaultResult = try Astronomy
            .calculateApparentStarPositionWithContextV2(
                star,
                context: defaultContext
            )
        XCTAssertFalse(
            defaultResult.metadata.omittedCorrections.contains(
                .solarLightDeflection
            )
        )
        XCTAssertTrue(
            defaultResult.metadata.omittedCorrections.contains(
                .planetaryLightDeflection
            )
        )
        XCTAssertFalse(
            defaultResult.metadata.omittedCorrections.contains {
                $0.rawValue == "solar-system-light-deflection"
            }
        )

        let disabledContext =
            try Astronomy.createApparentPositionContextV2(
                at: observationDate,
                location: tokyo,
                options: ApparentPositionOptionsV2(
                    solarLightDeflection: .disabled
                )
            )
        XCTAssertEqual(
            disabledContext.solarLightDeflection.mode,
            .disabled
        )
        XCTAssertTrue(
            disabledContext.baseWarnings.contains(
                .solarLightDeflectionDisabled
            )
        )
        let disabledResult = try Astronomy
            .calculateApparentStarPositionWithContextV2(
                star,
                context: disabledContext
            )
        XCTAssertTrue(
            disabledResult.metadata.omittedCorrections.contains(
                .solarLightDeflection
            )
        )
        XCTAssertTrue(
            disabledResult.metadata.omittedCorrections.contains(
                .planetaryLightDeflection
            )
        )
    }

    func testPipelineAppliesDeflectionBeforeAnnualAberration()
        throws
    {
        let sunDirection = try precisionNormalized(
            Vector3D(x: 0.7, y: -0.4, z: 0.2)
        )
        let observerVelocity =
            Vector3D(x: 7e-5, y: -3e-5, z: 2e-5)
        let context =
            try Astronomy.createApparentPositionContextV2(
                at: observationDate,
                location: tokyo,
                options: ApparentPositionOptionsV2(
                    annualParallax: .disabled,
                    solarLightDeflection: .custom(
                        CustomSolarLightDeflectionV2(
                            sunToObserverUnitDirection:
                                sunDirection,
                            sunObserverDistanceAU: 0.8
                        )
                    ),
                    aberration: .custom(
                        CustomAberrationV2(
                            observerBarycentricVelocityC:
                                observerVelocity,
                            sunObserverDistanceAU: 0.8
                        )
                    ),
                    diurnalAberration: .disabled,
                    refraction: .disabled
                )
            )
        let propagated = try Astronomy.propagateSpaceMotionV2(
            star,
            ttJulianDate: context.timeScales.ttJulianDate
        )
        let natural = precisionEquatorialToVector(
            propagated.coordinates
        )
        let deflected = try Astronomy.applySolarLightDeflectionV2(
            naturalDirection: natural,
            sunToObserverUnitDirection: sunDirection,
            sunObserverDistanceAU: 0.8
        )
        let correctProper = try Astronomy.applyAnnualAberrationV2(
            naturalDirection: deflected,
            observerBarycentricVelocityC: observerVelocity,
            sunObserverDistanceAU: 0.8
        )
        let wrongAberrated = try Astronomy.applyAnnualAberrationV2(
            naturalDirection: natural,
            observerBarycentricVelocityC: observerVelocity,
            sunObserverDistanceAU: 0.8
        )
        let wrongProper = try Astronomy.applySolarLightDeflectionV2(
            naturalDirection: wrongAberrated,
            sunToObserverUnitDirection: sunDirection,
            sunObserverDistanceAU: 0.8
        )
        let correct = try precisionVectorToEquatorial(
            context.precessionNutationMatrix.applying(
                to: correctProper
            )
        )
        let wrong = try precisionVectorToEquatorial(
            context.precessionNutationMatrix.applying(
                to: wrongProper
            )
        )
        let result = try Astronomy
            .calculateApparentStarPositionWithContextV2(
                star,
                context: context
            )

        XCTAssertLessThanOrEqual(
            separation(result.apparentEquatorial, correct),
            3e-15
        )
        XCTAssertGreaterThan(
            separation(result.apparentEquatorial, wrong),
            1e-13
        )
        XCTAssertEqual(
            result.solarLightDeflectionMode,
            .callerSunObserverGeometry
        )
    }

    private let observationDate = ISO8601DateFormatter().date(
        from: "2026-07-29T12:00:00Z"
    )!
    private let tokyo = ObservingLocation(
        id: "tokyo",
        name: "東京",
        latitude: 35.6812,
        longitude: 139.7671,
        timeZoneIdentifier: "Asia/Tokyo"
    )
    private let star = CatalogStar(
        hr: 99_100,
        hd: nil,
        rightAscension: 1.2,
        declination: -0.3,
        visualMagnitude: 1,
        bvColor: nil,
        catalogName: "Solar deflection fixture",
        spectralType: nil,
        astrometry: nil
    )

    private func vector3(_ values: [Double]) throws -> Vector3D {
        guard values.count == 3 else {
            throw SolarLightDeflectionFixtureError.invalidVector
        }
        return Vector3D(
            x: values[0],
            y: values[1],
            z: values[2]
        )
    }

    private func separation(
        _ left: EquatorialCoordinates,
        _ right: EquatorialCoordinates
    ) -> Double {
        let leftVector = precisionEquatorialToVector(left)
        let rightVector = precisionEquatorialToVector(right)
        return atan2(
            leftVector.cross(rightVector).length,
            leftVector.dot(rightVector)
        )
    }

    private func assertThrows(
        _ expected: PrecisionModelError,
        file: StaticString = #filePath,
        line: UInt = #line,
        _ body: () throws -> Void
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

private enum SolarLightDeflectionFixtureError: Error {
    case invalidVector
}

private struct SOFASolarLightDeflectionFixture: Decodable {
    let schemaVersion: Int
    let oracle: String
    let cases: [SOFASolarLightDeflectionCase]
}

private struct SOFASolarLightDeflectionCase: Decodable {
    let id: String
    let naturalDirection: [Double]
    let sunToObserverUnitDirection: [Double]
    let sunObserverDistanceAu: Double
    let expectedDeflectedDirection: [Double]
}
