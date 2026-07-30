import Foundation
import PlanetariumShared
import XCTest

@testable import PlanetariumCore

final class PrecisionAstronomyTests: XCTestCase {
    private let fixture: PrecisionAstronomyFixture = {
        let data = try! TestFixtureData.data(
            at: "shared/fixtures/astro-test-vectors.v2.json"
        )
        return try! JSONDecoder().decode(
            PrecisionAstronomyFixture.self,
            from: data
        )
    }()

    private let refractionGuardrails:
        RefractionGuardrailFixture = {
            let data = try! TestFixtureData.data(
                at:
                    "shared/fixtures/"
                    + "refraction-guardrails.v1.json"
            )
            return try! JSONDecoder().decode(
                RefractionGuardrailFixture.self,
                from: data
            )
        }()

    private let catalog: SkyCatalog = try! PlanetariumData.load()

    func testOfficialEarthRotationAngleReference() throws {
        for vector in fixture.earthRotationAngles {
            XCTAssertEqual(
                try Astronomy.earthRotationAngleV2(
                    ut1JulianDate: vector.ut1JulianDate
                ),
                vector.expected,
                accuracy: fixture.tolerances.angleRadians,
                vector.id
            )
        }
    }

    func testOfficialMeanSiderealTimeReference() throws {
        for vector in fixture.meanSiderealTimes {
            XCTAssertEqual(
                try Astronomy.greenwichMeanSiderealTime2006V2(
                    ut1JulianDate: vector.ut1JulianDate,
                    ttJulianDate: vector.ttJulianDate
                ),
                vector.expected,
                accuracy: fixture.tolerances.angleRadians,
                vector.id
            )
        }
    }

    func testOfficialNutationReference() throws {
        for vector in fixture.nutationAngles {
            let result = try Astronomy.nutation2000BV2(
                ttJulianDate: vector.ttJulianDate
            )
            XCTAssertEqual(
                result.longitude,
                vector.expected.longitude,
                accuracy: fixture.tolerances.nutationRadians,
                vector.id
            )
            XCTAssertEqual(
                result.obliquity,
                vector.expected.obliquity,
                accuracy: fixture.tolerances.nutationRadians,
                vector.id
            )
        }
    }

    func testOfficialFukushimaWilliamsReference() throws {
        for vector in fixture.fukushimaWilliamsAngles {
            let result = try Astronomy.fukushimaWilliams2006V2(
                ttJulianDate: vector.ttJulianDate
            )
            XCTAssertEqual(
                result.gamma,
                vector.expected.gamma,
                accuracy: fixture.tolerances.angleRadians,
                "\(vector.id) gamma"
            )
            XCTAssertEqual(
                result.phi,
                vector.expected.phi,
                accuracy: fixture.tolerances.angleRadians,
                "\(vector.id) phi"
            )
            XCTAssertEqual(
                result.psi,
                vector.expected.psi,
                accuracy: fixture.tolerances.angleRadians,
                "\(vector.id) psi"
            )
            XCTAssertEqual(
                result.obliquity,
                vector.expected.obliquity,
                accuracy: fixture.tolerances.angleRadians,
                "\(vector.id) obliquity"
            )
        }
    }

    func testOfficialAberrationReference() throws {
        for vector in fixture.aberrationVectors {
            let result = try Astronomy.applyAnnualAberrationV2(
                naturalDirection: try vector3(
                    vector.naturalDirection
                ),
                observerBarycentricVelocityC: try vector3(
                    vector.observerBarycentricVelocityC
                ),
                sunObserverDistanceAU:
                    vector.sunObserverDistanceAu
            )
            let expected = try vector3(vector.expected)
            XCTAssertEqual(
                result.x,
                expected.x,
                accuracy: fixture.tolerances.aberrationComponent,
                "\(vector.id) x"
            )
            XCTAssertEqual(
                result.y,
                expected.y,
                accuracy: fixture.tolerances.aberrationComponent,
                "\(vector.id) y"
            )
            XCTAssertEqual(
                result.z,
                expected.z,
                accuracy: fixture.tolerances.aberrationComponent,
                "\(vector.id) z"
            )
        }
    }

    func testOfficialRefractionCoefficientReference() throws {
        for vector in fixture.refractionCoefficients {
            let result = try Astronomy.refractionCoefficientsV2(
                for: vector.atmosphere.model
            )
            XCTAssertEqual(
                result.tangent,
                vector.expected.tangent,
                accuracy:
                    fixture.tolerances.refractionCoefficient,
                "\(vector.id) A"
            )
            XCTAssertEqual(
                result.tangentCubed,
                vector.expected.tangentCubed,
                accuracy:
                    fixture.tolerances.refractionCoefficient,
                "\(vector.id) B"
            )
        }
    }

    func testOfficialFK5HipparcosOrientationAndSpinReference() {
        let matrix = Astronomy.fk5ToHipparcosMatrixV2
        let expectedRows = [
            [
                0.9999999999999928638,
                0.1110223351022919694e-6,
                0.4411803962536558154e-7,
            ],
            [
                -0.1110223308458746430e-6,
                0.9999999999999891830,
                -0.9647792498984142358e-7,
            ],
            [
                -0.4411805033656962252e-7,
                0.9647792009175314354e-7,
                0.9999999999999943728,
            ],
        ]
        let rows = [matrix.row0, matrix.row1, matrix.row2]
        for rowIndex in rows.indices {
            let actual = [
                rows[rowIndex].x,
                rows[rowIndex].y,
                rows[rowIndex].z,
            ]
            for columnIndex in actual.indices {
                XCTAssertEqual(
                    actual[columnIndex],
                    expectedRows[rowIndex][columnIndex],
                    accuracy:
                        rowIndex == columnIndex ? 1e-14 : 1e-17,
                    "orientation [\(rowIndex),\(columnIndex)]"
                )
            }
        }

        let spin = Astronomy.fk5ToHipparcosSpinV2
        let actualSpin = [spin.x, spin.y, spin.z]
        let expectedSpin = [
            -0.1454441043328607981e-8,
            0.2908882086657215962e-8,
            0.3393695767766751955e-8,
        ]
        for index in actualSpin.indices {
            XCTAssertEqual(
                actualSpin[index],
                expectedSpin[index],
                accuracy: 1e-17,
                "spin [\(index)]"
            )
        }
    }

    func testOfficialFK52HSixDimensionalReference() throws {
        let result = try Astronomy.connectFK5CatalogToHipparcosV2(
            rightAscension: 1.76779433,
            declination: -0.2917517103,
            properMotionRightAscensionRadiansPerJulianYear:
                -1.91851572e-7,
            properMotionDeclinationRadiansPerJulianYear:
                -5.8468475e-6,
            parallaxArcseconds: 0.379210,
            radialVelocityKilometersPerSecond: -7.6
        )

        XCTAssertEqual(
            result.rightAscension,
            1.767794226299947632,
            accuracy: 1e-14
        )
        XCTAssertEqual(
            result.declination,
            -0.2917516070530391757,
            accuracy: 1e-14
        )
        XCTAssertEqual(
            result.properMotionRightAscensionRadiansPerJulianYear,
            -0.1961874125605721270e-6,
            accuracy: 1e-19
        )
        XCTAssertEqual(
            result.properMotionDeclinationRadiansPerJulianYear,
            -0.58459905176693911e-5,
            accuracy: 1e-19
        )
        XCTAssertEqual(
            result.parallaxArcseconds,
            0.37921,
            accuracy: 1e-14
        )
        XCTAssertEqual(
            result.radialVelocityKilometersPerSecond,
            -7.6000000940000254,
            accuracy: 1e-11
        )
    }

    func testFrameConnectionStillAppliesWhenAstrometryIsMissing() throws {
        let star = CatalogStar(
            hr: 99_001,
            hd: nil,
            rightAscension: 1.1,
            declination: -0.3,
            visualMagnitude: 2,
            bvColor: nil,
            catalogName: nil,
            spectralType: nil,
            astrometry: nil
        )
        let atJ2000 = try Astronomy.propagateSpaceMotionV2(
            star,
            ttJulianDate: Astronomy.j2000JulianDate
        )
        let oneYearLater = try Astronomy.propagateSpaceMotionV2(
            star,
            ttJulianDate:
                Astronomy.j2000JulianDate
                + PrecisionConstants.daysPerJulianYear
        )

        XCTAssertEqual(atJ2000.mode, .none)
        XCTAssertEqual(oneYearLater.mode, .none)
        XCTAssertGreaterThan(
            sphericalSeparation(
                atJ2000.coordinates,
                rightAscension: star.rightAscension,
                declination: star.declination
            ),
            1e-8,
            "J2000 orientation must not be skipped"
        )
        XCTAssertGreaterThan(
            sphericalSeparation(
                oneYearLater.coordinates,
                rightAscension:
                    atJ2000.coordinates.rightAscension,
                declination:
                    atJ2000.coordinates.declination
            ),
            1e-10,
            "frame spin must remain active without catalogue motion"
        )
    }

    func testAngularConnectionPreservesMissingDistanceAndRadialVelocity() throws {
        let star = CatalogStar(
            hr: 99_002,
            hd: nil,
            rightAscension: 1.1,
            declination: -0.3,
            visualMagnitude: 2,
            bvColor: nil,
            catalogName: nil,
            spectralType: nil,
            astrometry: StarAstrometry(
                properMotionRightAscensionCosDeclinationArcsecondsPerYear:
                    0.2,
                properMotionDeclinationArcsecondsPerYear: -0.1,
                parallaxArcseconds: nil,
                radialVelocityKilometersPerSecond: nil
            )
        )
        let result = try Astronomy.propagateSpaceMotionV2(
            star,
            ttJulianDate:
                Astronomy.j2000JulianDate
                + 10 * PrecisionConstants.daysPerJulianYear
        )

        XCTAssertEqual(result.mode, .angularProperMotion)
        XCTAssertTrue(result.coordinates.rightAscension.isFinite)
        XCTAssertTrue(result.coordinates.declination.isFinite)
    }

    func testAnnualParallaxMatchesAnalyticEuclideanFixture() throws {
        let result = try Astronomy.applyAnnualParallaxV2(
            astrometricPositionAU: Vector3D(x: 4, y: 3, z: 12),
            observerPositionAU: Vector3D(x: 1, y: -2, z: 3)
        )
        let expected = Vector3D(
            x: 0.2797514424720941296908041653605466,
            y: 0.4662524041201568828180069422675776,
            z: 0.8392543274162823890724124960816397
        )

        XCTAssertEqual(result.x, expected.x, accuracy: 2e-16)
        XCTAssertEqual(result.y, expected.y, accuracy: 2e-16)
        XCTAssertEqual(result.z, expected.z, accuracy: 2e-16)
        XCTAssertEqual(result.length, 1, accuracy: 2e-16)
    }

    func testAnnualParallaxHasExpectedOrthogonalSignAndAmplitude() throws {
        let parallaxRadians =
            PrecisionConstants.arcsecondsToRadians
        let distanceAU = 1 / sin(parallaxRadians)
        let result = try Astronomy.applyAnnualParallaxV2(
            astrometricPositionAU:
                Vector3D(x: distanceAU, y: 0, z: 0),
            observerPositionAU: .unitY
        )
        let signedShift = atan2(result.y, result.x)

        XCTAssertLessThan(signedShift, 0)
        XCTAssertEqual(
            signedShift,
            -atan(sin(parallaxRadians)),
            accuracy: 2e-16
        )
    }

    func testAnnualParallaxRunsAfterFrameConnectionAndBeforeAberration() throws {
        let star = CatalogStar(
            hr: 99_003,
            hd: nil,
            rightAscension: 1.2,
            declination: -0.3,
            visualMagnitude: 1,
            bvColor: nil,
            catalogName: "Pipeline-order fixture",
            spectralType: nil,
            astrometry: StarAstrometry(
                properMotionRightAscensionCosDeclinationArcsecondsPerYear:
                    0.4,
                properMotionDeclinationArcsecondsPerYear: -0.2,
                parallaxArcseconds: 10,
                radialVelocityKilometersPerSecond: nil
            )
        )
        let observerPosition = Vector3D(
            x: 0.25,
            y: -0.8,
            z: 0.45
        )
        let observerVelocity = Vector3D(
            x: 7e-5,
            y: -3e-5,
            z: 2e-5
        )
        let context = try Astronomy.createApparentPositionContextV2(
            at: date("2026-07-29T12:00:00.000Z"),
            location: ObservingLocation(
                id: "tokyo",
                name: "東京",
                latitude: 35.6812,
                longitude: 139.7671,
                timeZoneIdentifier: "Asia/Tokyo"
            ),
            options: ApparentPositionOptionsV2(
                annualParallax: .custom(
                    CustomAnnualParallaxV2(
                        observerPositionAU: observerPosition
                    )
                ),
                solarLightDeflection: .disabled,
                aberration: .custom(
                    CustomAberrationV2(
                        observerBarycentricVelocityC:
                            observerVelocity,
                        sunObserverDistanceAU: 1
                    )
                ),
                refraction: .disabled
            )
        )
        let propagated = try Astronomy.propagateSpaceMotionV2(
            star,
            ttJulianDate: context.timeScales.ttJulianDate
        )
        let astrometricPosition = try XCTUnwrap(
            propagated.astrometricPositionAU
        )
        let natural = try Astronomy.applyAnnualParallaxV2(
            astrometricPositionAU: astrometricPosition,
            observerPositionAU: observerPosition
        )
        let proper = try Astronomy.applyAnnualAberrationV2(
            naturalDirection: natural,
            observerBarycentricVelocityC: observerVelocity,
            sunObserverDistanceAU: 1
        )
        let expected = try precisionVectorToEquatorial(
            context.precessionNutationMatrix.applying(to: proper)
        )
        let result = try Astronomy
            .calculateApparentStarPositionWithContextV2(
                star,
                context: context
            )

        XCTAssertLessThanOrEqual(
            sphericalSeparation(
                result.apparentEquatorial,
                rightAscension: expected.rightAscension,
                declination: expected.declination
            ),
            2e-15
        )
        XCTAssertEqual(
            result.annualParallaxMode,
            .callerObserverPosition
        )
        XCTAssertFalse(
            result.metadata.omittedCorrections.contains(
                .annualParallax
            )
        )
        XCTAssertFalse(
            result.metadata.omittedCorrections.contains(
                .diurnalParallax
            )
        )
        XCTAssertTrue(
            result.metadata.warnings.contains(
                .radialVelocityMissingAssumedZero
            )
        )
    }

    func testPositiveParallaxRetainsDistanceWhenRadialVelocityIsMissing() throws {
        let parallaxArcseconds = 0.5
        let star = CatalogStar(
            hr: 99_004,
            hd: nil,
            rightAscension: 2.1,
            declination: 0.4,
            visualMagnitude: 1,
            bvColor: nil,
            catalogName: "Distance-only fixture",
            spectralType: nil,
            astrometry: StarAstrometry(
                properMotionRightAscensionCosDeclinationArcsecondsPerYear:
                    nil,
                properMotionDeclinationArcsecondsPerYear: nil,
                parallaxArcseconds: parallaxArcseconds,
                radialVelocityKilometersPerSecond: nil
            )
        )
        let result = try Astronomy.propagateSpaceMotionV2(
            star,
            ttJulianDate: Astronomy.j2000JulianDate
        )
        let position = try XCTUnwrap(
            result.astrometricPositionAU
        )
        let expectedDistance =
            1
            / sin(
                parallaxArcseconds
                    * PrecisionConstants.arcsecondsToRadians
            )

        XCTAssertEqual(
            position.length,
            expectedDistance,
            accuracy: expectedDistance * 2e-15
        )
        XCTAssertTrue(result.radialVelocityAssumedZero)
        XCTAssertEqual(result.mode, .none)
    }

    func testIndependentComposedReferencePositions() throws {
        for vector in fixture.composedApparentPositions {
            let star = try XCTUnwrap(
                catalog.starsByHR[vector.starHR],
                vector.id
            )
            let date = try date(vector.iso)
            let location = vector.location.model(id: vector.id)
            let result = try Astronomy.calculateApparentStarPositionV2(
                star,
                at: date,
                location: location,
                options: ApparentPositionOptionsV2(
                    earthOrientation: EarthOrientationOptionsV2(
                        dut1Seconds:
                            vector.earthOrientation.dut1Seconds,
                        taiMinusUTCSeconds:
                            vector.earthOrientation
                                .taiMinusUtcSeconds
                    ),
                    annualParallax: .disabled,
                    solarLightDeflection: .disabled,
                    aberration: .custom(
                        CustomAberrationV2(
                            observerBarycentricVelocityC:
                                try vector3(
                                    vector.aberration
                                        .observerBarycentricVelocityC
                                ),
                            sunObserverDistanceAU:
                                vector.aberration
                                    .sunObserverDistanceAu
                        )
                    ),
                    diurnalAberration: .disabled,
                    refraction: .disabled
                )
            )

            XCTAssertLessThanOrEqual(
                sphericalSeparation(
                    result.astrometricJ2000,
                    rightAscension:
                        vector.expected.astrometricRightAscension,
                    declination:
                        vector.expected.astrometricDeclination
                ),
                fixture.tolerances.composedEquatorialRadians,
                "\(vector.id) astrometric direction"
            )
            XCTAssertLessThanOrEqual(
                sphericalSeparation(
                    result.apparentEquatorial,
                    rightAscension:
                        vector.expected.apparentRightAscension,
                    declination:
                        vector.expected.apparentDeclination
                ),
                fixture.tolerances.composedEquatorialRadians,
                "\(vector.id) apparent direction"
            )
            XCTAssertLessThanOrEqual(
                abs(
                    wrappedAngleDifference(
                        result.metadata.timeScales.ut1JulianDate
                            .isFinite
                            ? try Astronomy
                                .greenwichApparentSiderealTime2006BV2(
                                    ut1JulianDate:
                                        result.metadata.timeScales
                                            .ut1JulianDate,
                                    ttJulianDate:
                                        result.metadata.timeScales
                                            .ttJulianDate
                                )
                            : .nan,
                        vector.expected
                            .greenwichApparentSiderealTime
                    )
                ),
                fixture.tolerances.composedSiderealRadians,
                "\(vector.id) GAST"
            )
            XCTAssertEqual(
                result.geometricHorizontal.altitude,
                vector.expected.altitude,
                accuracy:
                    fixture.tolerances.composedHorizontalRadians,
                "\(vector.id) altitude"
            )
            XCTAssertLessThanOrEqual(
                abs(
                    wrappedAngleDifference(
                        result.geometricHorizontal.azimuth,
                        vector.expected.azimuth
                    )
                ),
                fixture.tolerances.composedHorizontalRadians,
                "\(vector.id) azimuth"
            )
            XCTAssertEqual(
                result.metadata.aberrationMode,
                .callerBarycentricVelocity
            )
            XCTAssertEqual(
                result.metadata.annualParallaxMode,
                .disabled
            )
            XCTAssertTrue(
                result.metadata.omittedCorrections.contains(
                    .annualParallax
                )
            )
            XCTAssertEqual(
                result.metadata.timeScales.dut1Source,
                .caller
            )
            XCTAssertEqual(
                result.metadata.frameConnectionModel,
                "SOFA FK5-to-Hipparcos J2000 rotation and spin"
            )
        }
    }

    func testFrameContextIsReusableAndWrapperEquivalent() throws {
        let vector = try XCTUnwrap(
            fixture.composedApparentPositions.first
        )
        let firstStar = try XCTUnwrap(
            catalog.starsByHR[vector.starHR]
        )
        let secondStar = try XCTUnwrap(catalog.starsByHR[5340])
        let options = ApparentPositionOptionsV2(
            earthOrientation: EarthOrientationOptionsV2(
                dut1Seconds: vector.earthOrientation.dut1Seconds,
                taiMinusUTCSeconds:
                    vector.earthOrientation.taiMinusUtcSeconds
            ),
            annualParallax: .disabled,
            aberration: .custom(
                CustomAberrationV2(
                    observerBarycentricVelocityC: try vector3(
                        vector.aberration
                            .observerBarycentricVelocityC
                    ),
                    sunObserverDistanceAU:
                        vector.aberration.sunObserverDistanceAu
                )
            ),
            refraction: .disabled
        )
        let observationDate = try date(vector.iso)
        let location = vector.location.model(id: vector.id)
        let context = try Astronomy.createApparentPositionContextV2(
            at: observationDate,
            location: location,
            options: options
        )
        let snapshot = context

        let first = try Astronomy
            .calculateApparentStarPositionWithContextV2(
                firstStar,
                context: context
            )
        let second = try Astronomy
            .calculateApparentStarPositionWithContextV2(
                secondStar,
                context: context
            )
        let wrapper = try Astronomy.calculateApparentStarPositionV2(
            firstStar,
            at: observationDate,
            location: location,
            options: options
        )
        let fullBatch = try Astronomy
            .calculateApparentStarPositionsWithContextV2(
                [firstStar, secondStar],
                context: context
            )
        let lightweightBatch = try Astronomy
            .calculateLightweightApparentStarPositionsWithContextV2(
                [firstStar, secondStar],
                context: context
            )

        XCTAssertEqual(first, wrapper)
        XCTAssertEqual(fullBatch, [first, second])
        XCTAssertEqual(
            lightweightBatch,
            [first.lightweight, second.lightweight]
        )
        XCTAssertEqual(context, snapshot)
        XCTAssertEqual(context.modelVersion, 2)
        XCTAssertEqual(
            first.metadata.timeScales,
            context.timeScales
        )
        XCTAssertEqual(
            second.metadata.timeScales,
            context.timeScales
        )
    }

    func testAnnualParallaxContextReusesDefaultEarthPositionAndAcceptsCustomSite() throws {
        let location = ObservingLocation(
            id: "tokyo",
            name: "東京",
            latitude: 35.6812,
            longitude: 139.7671,
            timeZoneIdentifier: "Asia/Tokyo"
        )
        let observationDate = try date(
            "2026-07-29T12:00:00.000Z"
        )
        let defaultContext = try Astronomy
            .createApparentPositionContextV2(
                at: observationDate,
                location: location,
                options: ApparentPositionOptionsV2(
                    aberration: .disabled,
                    refraction: .disabled
                )
            )
        guard case let .prepared(defaultParallax) =
            defaultContext.annualParallax
        else {
            return XCTFail("Expected default annual parallax")
        }
        let expectedEarth = try Astronomy.approximateEarthStateV2(
            ttJulianDate:
                defaultContext.timeScales.ttJulianDate
        )

        XCTAssertEqual(
            defaultParallax.mode,
            .truncatedVSOP2000HeliocentricEarth
        )
        XCTAssertEqual(
            defaultParallax.observerPositionAU,
            expectedEarth.positionAU
        )

        let customPosition = Vector3D(
            x: 0.1,
            y: -0.2,
            z: 0.3
        )
        let customContext = try Astronomy
            .createApparentPositionContextV2(
                at: observationDate,
                location: location,
                options: ApparentPositionOptionsV2(
                    annualParallax: .custom(
                        CustomAnnualParallaxV2(
                            observerPositionAU: customPosition
                        )
                    ),
                    aberration: .disabled,
                    refraction: .disabled
                )
            )
        guard case let .prepared(customParallax) =
            customContext.annualParallax
        else {
            return XCTFail("Expected custom annual parallax")
        }
        XCTAssertEqual(
            customParallax.mode,
            .callerObserverPosition
        )
        XCTAssertEqual(
            customParallax.observerPositionAU,
            customPosition
        )
    }

    func testAnnualParallaxReportsUnavailableAndDisabledDistinctly() throws {
        let starWithoutParallax = try XCTUnwrap(
            catalog.starsByHR[2]
        )
        let sirius = try XCTUnwrap(catalog.starsByHR[2491])
        let observationDate = try date(
            "2026-07-29T12:00:00.000Z"
        )
        let location = ObservingLocation(
            id: "tokyo",
            name: "東京",
            latitude: 35.6812,
            longitude: 139.7671,
            timeZoneIdentifier: "Asia/Tokyo"
        )
        let unavailable = try Astronomy
            .calculateApparentStarPositionV2(
                starWithoutParallax,
                at: observationDate,
                location: location,
                options: ApparentPositionOptionsV2(
                    aberration: .disabled,
                    refraction: .disabled
                )
            )
        let disabled = try Astronomy
            .calculateApparentStarPositionV2(
                sirius,
                at: observationDate,
                location: location,
                options: ApparentPositionOptionsV2(
                    annualParallax: .disabled,
                    aberration: .disabled,
                    refraction: .disabled
                )
            )
        let missingAndDisabled = try Astronomy
            .calculateApparentStarPositionV2(
                starWithoutParallax,
                at: observationDate,
                location: location,
                options: ApparentPositionOptionsV2(
                    annualParallax: .disabled,
                    aberration: .disabled,
                    refraction: .disabled
                )
            )

        XCTAssertEqual(
            unavailable.annualParallaxMode,
            .unavailable
        )
        XCTAssertTrue(
            unavailable.metadata.warnings.contains(
                .annualParallaxUnavailable
            )
        )
        XCTAssertFalse(
            unavailable.metadata.warnings.contains(
                .annualParallaxApproximateEphemeris
            )
        )
        XCTAssertEqual(disabled.annualParallaxMode, .disabled)
        XCTAssertTrue(
            disabled.metadata.warnings.contains(
                .annualParallaxDisabled
            )
        )
        XCTAssertTrue(
            unavailable.metadata.omittedCorrections.contains(
                .annualParallax
            )
        )
        XCTAssertTrue(
            unavailable.metadata.omittedCorrections.contains(
                .diurnalParallax
            )
        )
        XCTAssertEqual(
            unavailable.apparentEquatorial,
            missingAndDisabled.apparentEquatorial
        )
    }

    func testAnnualParallaxRejectsInvalidAndSingularInputs() throws {
        XCTAssertThrowsError(
            try Astronomy.applyAnnualParallaxV2(
                astrometricPositionAU: .unitX,
                observerPositionAU: Vector3D(
                    x: .nan,
                    y: 0,
                    z: 0
                )
            )
        )
        XCTAssertThrowsError(
            try Astronomy.applyAnnualParallaxV2(
                astrometricPositionAU: .unitX,
                observerPositionAU: .unitX
            )
        ) { error in
            XCTAssertEqual(
                error as? PrecisionModelError,
                .invalidVector
            )
        }
        XCTAssertThrowsError(
            try Astronomy.createApparentPositionContextV2(
                at: date("2026-07-29T12:00:00.000Z"),
                location: ObservingLocation(
                    id: "equator",
                    name: "赤道",
                    latitude: 0,
                    longitude: 0,
                    timeZoneIdentifier: "UTC"
                ),
                options: ApparentPositionOptionsV2(
                    annualParallax: .custom(
                        CustomAnnualParallaxV2(
                            observerPositionAU: Vector3D(
                                x: 0,
                                y: .infinity,
                                z: 0
                            )
                        )
                    )
                )
            )
        )

        func star(
            properMotionRA: Double? = nil,
            properMotionDeclination: Double? = nil,
            parallax: Double?,
            radialVelocity: Double? = nil
        ) -> CatalogStar {
            CatalogStar(
                hr: 99_005,
                hd: nil,
                rightAscension: 0,
                declination: 0,
                visualMagnitude: 1,
                bvColor: nil,
                catalogName: "Parallax guardrail fixture",
                spectralType: nil,
                astrometry: StarAstrometry(
                    properMotionRightAscensionCosDeclinationArcsecondsPerYear:
                        properMotionRA,
                    properMotionDeclinationArcsecondsPerYear:
                        properMotionDeclination,
                    parallaxArcseconds: parallax,
                    radialVelocityKilometersPerSecond:
                        radialVelocity
                )
            )
        }

        XCTAssertThrowsError(
            try Astronomy.propagateSpaceMotionV2(
                star(parallax: .nan),
                ttJulianDate: Astronomy.j2000JulianDate
            )
        )
        XCTAssertThrowsError(
            try Astronomy.propagateSpaceMotionV2(
                star(
                    properMotionRA: .nan,
                    parallax: nil
                ),
                ttJulianDate: Astronomy.j2000JulianDate
            )
        ) { error in
            XCTAssertEqual(
                error as? PrecisionModelError,
                .nonFiniteCatalogAstrometry(
                    hr: 99_005,
                    field: "赤経方向の固有運動"
                )
            )
        }
        XCTAssertThrowsError(
            try Astronomy.propagateSpaceMotionV2(
                star(
                    properMotionDeclination: .infinity,
                    parallax: nil
                ),
                ttJulianDate: Astronomy.j2000JulianDate
            )
        ) { error in
            XCTAssertEqual(
                error as? PrecisionModelError,
                .nonFiniteCatalogAstrometry(
                    hr: 99_005,
                    field: "赤緯方向の固有運動"
                )
            )
        }
        XCTAssertThrowsError(
            try Astronomy.propagateSpaceMotionV2(
                star(
                    parallax: 0.1,
                    radialVelocity: .infinity
                ),
                ttJulianDate: Astronomy.j2000JulianDate
            )
        ) { error in
            XCTAssertEqual(
                error as? PrecisionModelError,
                .nonFiniteCatalogAstrometry(
                    hr: 99_005,
                    field: "視線速度"
                )
            )
        }
        XCTAssertThrowsError(
            try Astronomy.propagateSpaceMotionV2(
                star(
                    parallax: 0.1,
                    radialVelocity:
                        PrecisionConstants
                            .speedOfLightKilometersPerSecond
                ),
                ttJulianDate: Astronomy.j2000JulianDate
            )
        ) { error in
            XCTAssertEqual(
                error as? PrecisionModelError,
                .catalogSpaceVelocityAtOrAboveLightSpeed(
                    hr: 99_005
                )
            )
        }
        let syntheticParallax = 0.1
        let syntheticDistanceAU =
            1
            / sin(
                syntheticParallax
                    * PrecisionConstants.arcsecondsToRadians
            )
        let eightyPercentLightSpeedAUPerYear =
            0.8
            * PrecisionConstants.speedOfLightAUPerDay
            * PrecisionConstants.daysPerJulianYear
        let syntheticProperMotion =
            eightyPercentLightSpeedAUPerYear
            / syntheticDistanceAU
            / PrecisionConstants.arcsecondsToRadians
        XCTAssertThrowsError(
            try Astronomy.propagateSpaceMotionV2(
                star(
                    properMotionRA: syntheticProperMotion,
                    parallax: syntheticParallax,
                    radialVelocity:
                        0.8
                        * PrecisionConstants
                            .speedOfLightKilometersPerSecond
                ),
                ttJulianDate: Astronomy.j2000JulianDate
            )
        ) { error in
            XCTAssertEqual(
                error as? PrecisionModelError,
                .catalogSpaceVelocityAtOrAboveLightSpeed(
                    hr: 99_005
                )
            )
        }
        XCTAssertThrowsError(
            try Astronomy.propagateSpaceMotionV2(
                star(parallax: 324_000),
                ttJulianDate: Astronomy.j2000JulianDate
            )
        )
        let negative = try Astronomy.propagateSpaceMotionV2(
            star(parallax: -0.1),
            ttJulianDate: Astronomy.j2000JulianDate
        )
        XCTAssertNil(negative.astrometricPositionAU)
        XCTAssertFalse(negative.radialVelocityAssumedZero)
    }

    func testGeometricHorizontalUsesStableAtan2NearZenith() throws {
        let context = try Astronomy.createApparentPositionContextV2(
            at: date("2026-07-29T12:00:00.000Z"),
            location: ObservingLocation(
                id: "tokyo",
                name: "東京",
                latitude: 35.6812,
                longitude: 139.7671,
                timeZoneIdentifier: "Asia/Tokyo"
            ),
            options: ApparentPositionOptionsV2(
                annualParallax: .disabled,
                aberration: .disabled,
                diurnalAberration: .disabled,
                refraction: .disabled
            )
        )
        let zenithRightAscension = Angles.normalizedRadians(
            context.greenwichApparentSiderealTime
                + context.longitudeRadians
        )
        let zenith = try geometricHorizontalV2(
            rightAscension: zenithRightAscension,
            declination: context.latitudeRadians,
            context: context
        )
        let nearZenith = try geometricHorizontalV2(
            rightAscension: zenithRightAscension + 1e-10,
            declination: context.latitudeRadians,
            context: context
        )

        XCTAssertTrue(zenith.altitude.isFinite)
        XCTAssertEqual(
            zenith.altitude,
            Double.pi / 2,
            accuracy: 1e-15
        )
        XCTAssertFalse(zenith.azimuthIsDefined)
        XCTAssertTrue(nearZenith.altitude.isFinite)
        XCTAssertLessThan(nearZenith.altitude, Double.pi / 2)
    }

    func testDefaultAnnualParallaxKeepsFullCatalogFiniteAcrossModelRange() throws {
        let expectedAvailable = catalog.stars.lazy.filter {
            guard let parallax =
                $0.astrometry?.parallaxArcseconds
            else {
                return false
            }
            return parallax.isFinite && parallax > 0
        }.count
        XCTAssertEqual(expectedAvailable, 2_985)
        let location = ObservingLocation(
            id: "tokyo",
            name: "東京",
            latitude: 35.6812,
            longitude: 139.7671,
            timeZoneIdentifier: "Asia/Tokyo"
        )
        let dates = [
            "1900-01-01T00:00:00.000Z",
            "2000-01-01T12:00:00.000Z",
            "2026-07-29T12:00:00.000Z",
            "2100-12-31T00:00:00.000Z",
        ]

        for dateString in dates {
            let context = try Astronomy
                .createApparentPositionContextV2(
                    at: date(dateString),
                    location: location
                )
            let positions = try Astronomy
                .calculateLightweightApparentStarPositionsWithContextV2(
                    catalog.stars,
                    context: context
                )
            XCTAssertEqual(positions.count, 8_404)
            XCTAssertEqual(
                positions.lazy.filter {
                    $0.annualParallaxMode
                        == .truncatedVSOP2000HeliocentricEarth
                }.count,
                expectedAvailable,
                dateString
            )

            for position in positions {
                let values = [
                    position.astrometricJ2000.rightAscension,
                    position.astrometricJ2000.declination,
                    position.apparentEquatorial.rightAscension,
                    position.apparentEquatorial.declination,
                    position.geometricHorizontal.altitude,
                    position.geometricHorizontal.azimuth,
                    position.observedHorizontal.altitude,
                    position.observedHorizontal.azimuth,
                    position.projection.x,
                    position.projection.y,
                ]
                guard values.allSatisfy(\.isFinite),
                      (0..<PrecisionConstants.twoPi).contains(
                          position.apparentEquatorial.rightAscension
                      ),
                      (0..<PrecisionConstants.twoPi).contains(
                          position.geometricHorizontal.azimuth
                      )
                else {
                    return XCTFail(
                        "HR \(position.starHR) produced invalid output at \(dateString)"
                    )
                }
            }
        }
    }

    func testDefaultMetadataMakesApproximationsExplicit() throws {
        let sirius = try XCTUnwrap(catalog.starsByHR[2491])
        let result = try Astronomy.calculateApparentStarPositionV2(
            sirius,
            at: date("2026-07-29T12:00:00.000Z"),
            location: ObservingLocation(
                id: "tokyo",
                name: "東京",
                latitude: 35.6812,
                longitude: 139.7671,
                timeZoneIdentifier: "Asia/Tokyo"
            )
        )
        XCTAssertEqual(result.metadata.modelVersion, 2)
        XCTAssertEqual(
            result.metadata.aberrationMode,
            .truncatedVSOP2000HeliocentricEarth
        )
        XCTAssertEqual(
            result.metadata.annualParallaxMode,
            .truncatedVSOP2000HeliocentricEarth
        )
        XCTAssertEqual(
            result.metadata.solarLightDeflectionMode,
            .truncatedVSOP2000HeliocentricEarth
        )
        XCTAssertEqual(
            result.metadata.diurnalAberrationMode,
            .wgs84Observer
        )
        XCTAssertEqual(result.metadata.refractionMode, .disabled)
        XCTAssertFalse(
            result.metadata.omittedCorrections.contains(
                .annualParallax
            )
        )
        XCTAssertTrue(
            result.metadata.omittedCorrections.contains(
                .diurnalParallax
            )
        )
        XCTAssertFalse(
            result.metadata.omittedCorrections.contains(
                .solarLightDeflection
            )
        )
        XCTAssertTrue(
            result.metadata.omittedCorrections.contains(
                .planetaryLightDeflection
            )
        )
        XCTAssertFalse(
            result.metadata.omittedCorrections.contains(
                .diurnalAberration
            )
        )
        XCTAssertTrue(
            Set([
                PrecisionWarningCode.dut1AssumedZero,
                .catalogFK5PrecisionLimited,
                .annualParallaxApproximateEphemeris,
                .solarLightDeflectionApproximateEphemeris,
                .aberrationApproximateEphemeris,
                .observerHeightAssumedZero,
                .refractionDisabled,
            ]).isSubset(of: Set(result.metadata.warnings))
        )
    }

    func testTimeScaleAndSupportedDateBoundaries() throws {
        let beforeIntegerLeapSeconds = try Astronomy.resolveTimeScalesV2(
            at: date("1971-12-31T23:59:59Z")
        )
        XCTAssertEqual(
            beforeIntegerLeapSeconds.taiMinusUTCSeconds,
            0
        )
        XCTAssertEqual(
            beforeIntegerLeapSeconds.taiMinusUTCSource,
            .pre1972Approximation
        )
        XCTAssertTrue(
            beforeIntegerLeapSeconds.warnings.contains(
                .pre1972UTCTTApproximation
            )
        )

        XCTAssertEqual(
            try Astronomy.resolveTimeScalesV2(
                at: date("1972-01-01T00:00:00Z")
            ).taiMinusUTCSeconds,
            10
        )
        XCTAssertEqual(
            try Astronomy.resolveTimeScalesV2(
                at: date("2016-12-31T23:59:59Z")
            ).taiMinusUTCSeconds,
            36
        )
        XCTAssertEqual(
            try Astronomy.resolveTimeScalesV2(
                at: date("2017-01-01T00:00:00Z")
            ).taiMinusUTCSeconds,
            37
        )
        XCTAssertFalse(
            try Astronomy.resolveTimeScalesV2(
                at: date("2027-06-30T23:59:59Z")
            ).warnings.contains(.futureLeapSecondsUnknown)
        )
        XCTAssertTrue(
            try Astronomy.resolveTimeScalesV2(
                at: date("2027-07-01T00:00:00Z")
            ).warnings.contains(.futureLeapSecondsUnknown)
        )

        XCTAssertNoThrow(
            try Astronomy.resolveTimeScalesV2(
                at: ObservationConstraints.minimumDate
            )
        )
        XCTAssertNoThrow(
            try Astronomy.resolveTimeScalesV2(
                at: ObservationConstraints.maximumDate
            )
        )
        XCTAssertThrowsError(
            try Astronomy.resolveTimeScalesV2(
                at: ObservationConstraints.minimumDate
                    .addingTimeInterval(-1)
            )
        )
        XCTAssertThrowsError(
            try Astronomy.resolveTimeScalesV2(
                at: ObservationConstraints.maximumDate
                    .addingTimeInterval(1)
            )
        )
    }

    func testTimeScalesPreserveExplicitIERSDUT1Provenance() throws {
        let observed = try Astronomy.resolveTimeScalesV2(
            at: date("2026-01-01T12:00:00Z"),
            options: EarthOrientationOptionsV2(
                dut1Seconds: 0.073_521,
                dut1Source: .iersObserved,
                dut1UncertaintySeconds: 0.000_013
            )
        )
        XCTAssertEqual(observed.dut1Seconds, 0.073_521)
        XCTAssertEqual(observed.dut1Source, .iersObserved)
        XCTAssertEqual(
            observed.dut1UncertaintySeconds,
            0.000_013
        )
        XCTAssertFalse(
            observed.warnings.contains(.dut1AssumedZero)
        )

        let predicted = try Astronomy.resolveTimeScalesV2(
            at: date("2026-07-29T00:00:00Z"),
            options: EarthOrientationOptionsV2(
                dut1Seconds: 0.061,
                dut1Source: .iersPredicted,
                dut1UncertaintySeconds: 0.008
            )
        )
        XCTAssertEqual(predicted.dut1Source, .iersPredicted)
        XCTAssertEqual(predicted.dut1UncertaintySeconds, 0.008)

        XCTAssertThrowsError(
            try Astronomy.resolveTimeScalesV2(
                at: date("2026-07-29T00:00:00Z"),
                options: EarthOrientationOptionsV2(
                    dut1Source: .iersObserved
                )
            )
        ) { error in
            XCTAssertEqual(
                error as? PrecisionModelError,
                .dut1MetadataWithoutValue
            )
        }
        XCTAssertThrowsError(
            try Astronomy.resolveTimeScalesV2(
                at: date("2026-07-29T00:00:00Z"),
                options: EarthOrientationOptionsV2(
                    dut1Seconds: 0.1,
                    dut1UncertaintySeconds: -0.001
                )
            )
        ) { error in
            XCTAssertEqual(
                error as? PrecisionModelError,
                .dut1UncertaintyOutOfRange
            )
        }
    }

    func testRefractionUsesGeometricGuardrail() throws {
        let atmosphere = AtmosphereV2(
            pressureHPA: 1_013.25,
            temperatureCelsius: 10,
            relativeHumidity: 0.5,
            wavelengthMicrometers: 0.55
        )
        let tenDegrees = Angles.radians(fromDegrees: 10)
        let oneDegree = Angles.radians(fromDegrees: 1)
        let applied = try Astronomy.applyVisualRefractionV2(
            to: tenDegrees,
            atmosphere: atmosphere
        )
        let guarded = try Astronomy.applyVisualRefractionV2(
            to: oneDegree,
            atmosphere: atmosphere
        )
        XCTAssertEqual(applied.mode, .applied)
        XCTAssertGreaterThan(applied.altitude, tenDegrees)
        XCTAssertEqual(guarded.mode, .belowModelAltitude)
        XCTAssertEqual(guarded.altitude, oneDegree)
    }

    func testSharedRefractionAtmosphereGuardrails() {
        for vector in refractionGuardrails.cases {
            let calculate = {
                try Astronomy.applyVisualRefractionV2(
                    to: Double.pi / 4,
                    atmosphere: vector.atmosphere.model
                )
            }
            if vector.expected == "accepted" {
                XCTAssertNoThrow(
                    try calculate(),
                    vector.id
                )
            } else {
                XCTAssertThrowsError(
                    try calculate(),
                    vector.id
                )
            }
        }
    }

    func testRefractionRejectsFormerOneDegreePolynomialExtrapolation() throws {
        let coefficients = try Astronomy.refractionCoefficientsV2(
            for: .standardVisual
        )
        let oneDegree = Angles.radians(fromDegrees: 1)

        XCTAssertThrowsError(
            try Astronomy.applyVisualRefractionV2(
                to: oneDegree,
                coefficients: coefficients,
                minimumGeometricAltitudeDegrees: 0
            )
        ) { error in
            XCTAssertEqual(
                error as? PrecisionModelError,
                .invalidMinimumRefractionAltitude
            )
        }
        XCTAssertThrowsError(
            try Astronomy.refractionCoefficientsV2(
                for: AtmosphereV2(
                    pressureHPA: 1_013.25,
                    temperatureCelsius: 10,
                    relativeHumidity: 0.5,
                    wavelengthMicrometers: 0.55,
                    minimumGeometricAltitudeDegrees: 4.999
                )
            )
        )
    }

    func testRefractionRejectsLowPressureVaporSingularity() {
        XCTAssertThrowsError(
            try Astronomy.refractionCoefficientsV2(
                for: AtmosphereV2(
                    pressureHPA: 6.13374770562797,
                    temperatureCelsius: 10,
                    relativeHumidity: 0.5,
                    wavelengthMicrometers: 0.55
                )
            )
        )
    }

    func testStandardRefractionCoefficientsAndInversionRemainHealthy() throws {
        let atmosphere = AtmosphereV2.standardVisual
        XCTAssertEqual(atmosphere.pressureHPA, 1_013.25)
        XCTAssertEqual(atmosphere.temperatureCelsius, 10)
        XCTAssertEqual(atmosphere.relativeHumidity, 0.5)
        XCTAssertEqual(atmosphere.wavelengthMicrometers, 0.55)
        XCTAssertEqual(
            atmosphere.minimumGeometricAltitudeDegrees,
            5
        )

        let coefficients = try Astronomy.refractionCoefficientsV2(
            for: atmosphere
        )
        XCTAssertTrue(coefficients.tangent.isFinite)
        XCTAssertTrue(coefficients.tangentCubed.isFinite)
        XCTAssertGreaterThan(coefficients.tangent, 0)
        XCTAssertLessThan(coefficients.tangentCubed, 0)

        var previousObservedAltitude = -Double.infinity
        for altitudeDegrees in stride(
            from: 5.0,
            through: 90,
            by: 0.25
        ) {
            let geometricAltitude = Angles.radians(
                fromDegrees: altitudeDegrees
            )
            let result = try Astronomy.applyVisualRefractionV2(
                to: geometricAltitude,
                atmosphere: atmosphere
            )
            XCTAssertTrue(result.altitude.isFinite)
            XCTAssertGreaterThanOrEqual(
                result.altitude,
                geometricAltitude,
                "\(altitudeDegrees)°"
            )
            XCTAssertLessThanOrEqual(
                result.altitude,
                Double.pi / 2,
                "\(altitudeDegrees)°"
            )
            XCTAssertGreaterThan(
                result.altitude,
                previousObservedAltitude,
                "\(altitudeDegrees)° monotonicity"
            )
            previousObservedAltitude = result.altitude
        }
    }

    func testStandardRefractionIsValidatedWhenFrameContextIsCreated() throws {
        let context = try Astronomy.createApparentPositionContextV2(
            at: date("2026-07-29T12:00:00.000Z"),
            location: ObservingLocation(
                id: "tokyo",
                name: "東京",
                latitude: 35.6812,
                longitude: 139.7671,
                timeZoneIdentifier: "Asia/Tokyo"
            ),
            options: ApparentPositionOptionsV2(
                refraction: .atmosphere(.standardVisual)
            )
        )
        guard case let .configured(
            coefficients,
            minimumGeometricAltitudeDegrees
        ) = context.refraction else {
            return XCTFail("Expected configured refraction context")
        }
        XCTAssertGreaterThan(coefficients.tangent, 0)
        XCTAssertLessThanOrEqual(coefficients.tangentCubed, 0)
        XCTAssertEqual(minimumGeometricAltitudeDegrees, 5)
        XCTAssertFalse(
            context.baseWarnings.contains(.refractionDisabled)
        )
    }

    func testGuardrailsRejectImpossibleInputs() throws {
        XCTAssertThrowsError(
            try Astronomy.resolveTimeScalesV2(
                at: date("2026-07-29T00:00:00Z"),
                options: EarthOrientationOptionsV2(
                    dut1Seconds: 3_601
                )
            )
        )
        XCTAssertThrowsError(
            try Astronomy.applyVisualRefractionV2(
                to: 0.5,
                atmosphere: AtmosphereV2(
                    pressureHPA: 1_013,
                    temperatureCelsius: 15,
                    relativeHumidity: 2,
                    wavelengthMicrometers: 0.55
                )
            )
        )
        XCTAssertThrowsError(
            try Astronomy.applyAnnualAberrationV2(
                naturalDirection: .unitX,
                observerBarycentricVelocityC: .unitX,
                sunObserverDistanceAU: 1
            )
        )
    }

    func testV2CatalogAndLegacyRowsBothDecode() throws {
        let precisionStars = try PlanetariumData.decodeBrightStars(
            from: SharedResources.data(for: .brightStarsV2)
        )
        let legacyStars = try PlanetariumData.decodeBrightStars(
            from: TestFixtureData.data(
                at: "shared/catalog/bright-stars.v1.json"
            )
        )
        XCTAssertEqual(precisionStars.count, 8_404)
        XCTAssertEqual(legacyStars.count, 8_404)

        let precisionSirius = try XCTUnwrap(
            precisionStars.first { $0.hr == 2491 }
        )
        let legacySirius = try XCTUnwrap(
            legacyStars.first { $0.hr == 2491 }
        )
        XCTAssertEqual(
            precisionSirius.astrometry?
                .properMotionRightAscensionCosDeclinationArcsecondsPerYear,
            -0.553
        )
        XCTAssertEqual(
            precisionSirius.astrometry?
                .properMotionDeclinationArcsecondsPerYear,
            -1.205
        )
        XCTAssertEqual(
            precisionSirius.astrometry?.parallaxArcseconds,
            0.375
        )
        XCTAssertEqual(
            precisionSirius.astrometry?
                .radialVelocityKilometersPerSecond,
            -8
        )
        XCTAssertNil(legacySirius.astrometry)
        XCTAssertNotNil(catalog.starsByHR[2491]?.astrometry)
    }

    func testAstronomyRenderDefaultsToV2ContextPath() throws {
        let observationDate = try date(
            "2026-07-29T12:00:00.000Z"
        )
        let location = ObservingLocation(
            id: "tokyo",
            name: "東京",
            latitude: 35.6812,
            longitude: 139.7671,
            timeZoneIdentifier: "Asia/Tokyo"
        )
        let rendered = Astronomy.render(
            catalog: catalog,
            at: observationDate,
            location: location
        )
        let renderedSirius = try XCTUnwrap(
            rendered.first { $0.hr == 2491 }
        )
        let precisionSirius = try Astronomy
            .calculateApparentStarPositionV2(
                try XCTUnwrap(catalog.starsByHR[2491]),
                at: observationDate,
                location: location
            )
        XCTAssertEqual(
            renderedSirius.horizontal,
            precisionSirius.geometricHorizontal
        )
        XCTAssertEqual(
            renderedSirius.projection,
            precisionSirius.projection
        )
        XCTAssertEqual(
            precisionSirius.geometricHorizontal,
            precisionSirius.observedHorizontal
        )
    }

    func testRenderOptionsExplicitlyEnableStandardRefractionAboveFiveDegrees() throws {
        let observationDate = try date(
            "2026-07-29T12:00:00.000Z"
        )
        let location = ObservingLocation(
            id: "tokyo",
            name: "東京",
            latitude: 35.6812,
            longitude: 139.7671,
            timeZoneIdentifier: "Asia/Tokyo"
        )
        let geometric = Astronomy.render(
            catalog: catalog,
            at: observationDate,
            location: location
        )
        let refracted = Astronomy.render(
            catalog: catalog,
            at: observationDate,
            location: location,
            options: ApparentPositionOptionsV2(
                refraction: .atmosphere(.standardVisual)
            )
        )
        let refractedByHR = Dictionary(
            uniqueKeysWithValues: refracted.map { ($0.hr, $0) }
        )
        let highStar = try XCTUnwrap(
            geometric.first {
                let altitude = Angles.degrees(
                    fromRadians: $0.horizontal.altitude
                )
                return (10...80).contains(altitude)
            }
        )
        let lowStar = try XCTUnwrap(
            geometric.first {
                let altitude = Angles.degrees(
                    fromRadians: $0.horizontal.altitude
                )
                return (0..<5).contains(altitude)
            }
        )
        let refractedHighStar = try XCTUnwrap(
            refractedByHR[highStar.hr]
        )
        let refractedLowStar = try XCTUnwrap(
            refractedByHR[lowStar.hr]
        )

        XCTAssertGreaterThan(
            refractedHighStar.horizontal.altitude,
            highStar.horizontal.altitude
        )
        XCTAssertEqual(
            refractedHighStar.horizontal.azimuth,
            highStar.horizontal.azimuth
        )
        XCTAssertEqual(
            refractedLowStar.horizontal,
            lowStar.horizontal
        )
    }

    private func date(
        _ string: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        if let value = formatter.date(from: string) {
            return value
        }
        formatter.formatOptions = [.withInternetDateTime]
        return try XCTUnwrap(
            formatter.date(from: string),
            string,
            file: file,
            line: line
        )
    }

    private func vector3(
        _ values: [Double],
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> Vector3D {
        XCTAssertEqual(values.count, 3, file: file, line: line)
        guard values.count == 3 else {
            throw PrecisionFixtureError.invalidVector
        }
        return Vector3D(x: values[0], y: values[1], z: values[2])
    }

    private func wrappedAngleDifference(
        _ left: Double,
        _ right: Double
    ) -> Double {
        var difference = (left - right + Double.pi)
            .truncatingRemainder(dividingBy: 2 * Double.pi)
        if difference < 0 {
            difference += 2 * Double.pi
        }
        return difference - Double.pi
    }

    private func sphericalSeparation(
        _ coordinates: EquatorialCoordinates,
        rightAscension: Double,
        declination: Double
    ) -> Double {
        let halfDeclinationDifference =
            (coordinates.declination - declination) / 2
        let halfRightAscensionDifference =
            wrappedAngleDifference(
                coordinates.rightAscension,
                rightAscension
            ) / 2
        let haversine =
            sin(halfDeclinationDifference)
            * sin(halfDeclinationDifference)
            + cos(coordinates.declination)
            * cos(declination)
            * sin(halfRightAscensionDifference)
            * sin(halfRightAscensionDifference)
        return 2 * asin(sqrt(Angles.clamped(haversine)))
    }
}

private enum PrecisionFixtureError: Error {
    case invalidVector
}

private struct PrecisionAstronomyFixture: Decodable {
    let tolerances: PrecisionToleranceFixture
    let earthRotationAngles: [EarthRotationFixture]
    let meanSiderealTimes: [MeanSiderealTimeFixture]
    let nutationAngles: [NutationFixture]
    let fukushimaWilliamsAngles: [FukushimaWilliamsFixture]
    let aberrationVectors: [AberrationFixture]
    let refractionCoefficients: [RefractionCoefficientFixture]
    let composedApparentPositions: [ComposedPositionFixture]
}

private struct PrecisionToleranceFixture: Decodable {
    let angleRadians: Double
    let nutationRadians: Double
    let aberrationComponent: Double
    let refractionCoefficient: Double
    let composedEquatorialRadians: Double
    let composedSiderealRadians: Double
    let composedHorizontalRadians: Double
}

private struct EarthRotationFixture: Decodable {
    let id: String
    let ut1JulianDate: Double
    let expected: Double
}

private struct MeanSiderealTimeFixture: Decodable {
    let id: String
    let ut1JulianDate: Double
    let ttJulianDate: Double
    let expected: Double
}

private struct NutationFixture: Decodable {
    struct Expected: Decodable {
        let longitude: Double
        let obliquity: Double
    }

    let id: String
    let ttJulianDate: Double
    let expected: Expected
}

private struct FukushimaWilliamsFixture: Decodable {
    struct Expected: Decodable {
        let gamma: Double
        let phi: Double
        let psi: Double
        let obliquity: Double
    }

    let id: String
    let ttJulianDate: Double
    let expected: Expected
}

private struct AberrationFixture: Decodable {
    let id: String
    let naturalDirection: [Double]
    let observerBarycentricVelocityC: [Double]
    let sunObserverDistanceAu: Double
    let expected: [Double]
}

private struct FixtureAtmosphere: Decodable {
    let pressureHpa: Double
    let temperatureCelsius: Double
    let relativeHumidity: Double
    let wavelengthMicrometers: Double
    let minimumGeometricAltitudeDegrees: Double?

    var model: AtmosphereV2 {
        AtmosphereV2(
            pressureHPA: pressureHpa,
            temperatureCelsius: temperatureCelsius,
            relativeHumidity: relativeHumidity,
            wavelengthMicrometers: wavelengthMicrometers,
            minimumGeometricAltitudeDegrees:
                minimumGeometricAltitudeDegrees
                ?? 5
        )
    }
}

private struct RefractionGuardrailFixture:
    Decodable
{
    struct Case: Decodable {
        let id: String
        let atmosphere: FixtureAtmosphere
        let expected: String
    }

    let cases: [Case]
}

private struct RefractionCoefficientFixture: Decodable {
    struct Expected: Decodable {
        let tangent: Double
        let tangentCubed: Double
    }

    let id: String
    let atmosphere: FixtureAtmosphere
    let expected: Expected
}

private struct FixtureEarthOrientation: Decodable {
    let taiMinusUtcSeconds: Double
    let dut1Seconds: Double
}

private struct FixtureLocationV2: Decodable {
    let latitude: Double
    let longitude: Double
    let timeZone: String

    func model(id: String) -> ObservingLocation {
        ObservingLocation(
            id: id,
            name: id,
            latitude: latitude,
            longitude: longitude,
            timeZoneIdentifier: timeZone
        )
    }
}

private struct FixtureAberrationV2: Decodable {
    let observerBarycentricVelocityC: [Double]
    let sunObserverDistanceAu: Double
}

private struct ComposedPositionFixture: Decodable {
    struct Expected: Decodable {
        let astrometricRightAscension: Double
        let astrometricDeclination: Double
        let apparentRightAscension: Double
        let apparentDeclination: Double
        let greenwichApparentSiderealTime: Double
        let altitude: Double
        let azimuth: Double
    }

    let id: String
    let iso: String
    let starHR: Int
    let earthOrientation: FixtureEarthOrientation
    let location: FixtureLocationV2
    let aberration: FixtureAberrationV2
    let expected: Expected
}
