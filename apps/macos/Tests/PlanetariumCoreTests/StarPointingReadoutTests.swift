import Foundation
import XCTest

@testable import Planetarium
@testable import PlanetariumCore

final class StarPointingReadoutTests: XCTestCase {
    func testLegacyRenderedStarInitializerKeepsCompatibilityDefaults() {
        let horizontal = HorizontalCoordinates(
            altitude: 0.25,
            azimuth: 1.5
        )
        let star = RenderedStar(
            catalog: catalogStar,
            name: nil,
            horizontal: horizontal,
            projection: ProjectedPoint(x: 0.1, y: 0.2)
        )

        XCTAssertNil(star.apparentEquatorial)
        XCTAssertEqual(star.geometricHorizontal, horizontal)
        XCTAssertEqual(star.observedHorizontal, horizontal)
        XCTAssertEqual(star.horizontal, horizontal)
    }

    func testV2RendererRetainsEachPrecisionCoordinateStage()
        throws
    {
        let date = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-31T12:00:00Z"
            )
        )
        let location = ObservingLocation(
            id: "test",
            name: "試験地点",
            latitude: 35,
            longitude: 139,
            timeZoneIdentifier: "Asia/Tokyo",
            heightMeters: 42
        )
        let context =
            try Astronomy.createApparentPositionContextV2(
                at: date,
                location: location,
                options: ApparentPositionOptionsV2(
                    refraction:
                        .atmosphere(.standardVisual)
                )
            )
        let rightAscension =
            context.greenwichApparentSiderealTime
            + Angles.radians(
                fromDegrees: location.longitude - 30
            )
        let source = CatalogStar(
            hr: 42,
            hd: 4242,
            rightAscension: rightAscension,
            declination: 0,
            visualMagnitude: 1,
            bvColor: 0,
            catalogName: nil,
            spectralType: "A0"
        )
        let catalog = SkyCatalog(
            stars: [source],
            names: [],
            constellations: [],
            cities: []
        )

        let rendered = try XCTUnwrap(
            Astronomy.renderV2(
                catalog: catalog,
                context: context
            ).first
        )
        let expected =
            try Astronomy
                .calculateApparentStarPositionWithContextV2(
                    source,
                    context: context
                )

        XCTAssertEqual(
            rendered.apparentEquatorial,
            expected.apparentEquatorial
        )
        XCTAssertEqual(
            rendered.geometricHorizontal,
            expected.geometricHorizontal
        )
        XCTAssertEqual(
            rendered.observedHorizontal,
            expected.observedHorizontal
        )
        XCTAssertEqual(
            rendered.horizontal,
            expected.observedHorizontal
        )
        XCTAssertGreaterThan(
            rendered.observedHorizontal.altitude,
            rendered.geometricHorizontal.altitude
        )
    }

    func testPointingPayloadSeparatesFramesAndIncludesTimeScales()
        throws
    {
        let date = Date(
            timeIntervalSince1970:
                1_775_000_000.123
        )
        let star = RenderedStar(
            catalog: catalogStar,
            name: NamedStar(
                hr: 42,
                name: "Test Star",
                nameJa: "試験星",
                aliases: [],
                constellation: "Test"
            ),
            horizontal: HorizontalCoordinates(
                altitude: 0.5,
                azimuth: 1
            ),
            projection: ProjectedPoint(x: 0, y: 0),
            apparentEquatorial: EquatorialCoordinates(
                rightAscension:
                    Angles.radians(fromDegrees: 31),
                declination:
                    Angles.radians(fromDegrees: -4.25)
            ),
            geometricHorizontal: HorizontalCoordinates(
                altitude:
                    Angles.radians(fromDegrees: 20.1234564),
                azimuth:
                    Angles.radians(fromDegrees: -45)
            ),
            observedHorizontal: HorizontalCoordinates(
                altitude:
                    Angles.radians(fromDegrees: 20.1567894),
                azimuth:
                    Angles.radians(fromDegrees: -45)
            )
        )
        let payload = StarPointingPayloadFormatter.payload(
            for: star,
            context: StarPointingPayloadContext(
                observationDate: date,
                location: ObservingLocation(
                    id: "test",
                    name: "試験地点",
                    latitude: 35.1234567,
                    longitude: 139.7654321,
                    timeZoneIdentifier: "Asia/Tokyo",
                    heightMeters: 42.5,
                    horizontalAccuracyMeters: 12.4
                ),
                timeScales: ResolvedTimeScalesV2(
                    utcJulianDate: 2_461_234.5,
                    taiJulianDate: 2_461_234.500428241,
                    ttJulianDate: 2_461_234.500800741,
                    ut1JulianDate: 2_461_234.499998572,
                    dut1Seconds: -0.123456,
                    dut1UncertaintySeconds: 0.0001,
                    taiMinusUTCSeconds: 37,
                    dut1Source: .iersObserved,
                    taiMinusUTCSource: .iersHistory,
                    warnings: []
                ),
                earthOrientationIdentifier:
                    "IERS test; sha256=abc123",
                refractionDescription:
                    "標準大気モデル"
            )
        )

        XCTAssertTrue(payload.contains("赤経（J2000）: 02h 00m 00.00s"))
        XCTAssertTrue(
            payload.contains(
                "見かけ赤経（真赤道・分点、日時）: "
                    + "02h 04m 00.00s"
            )
        )
        XCTAssertTrue(
            payload.contains(
                "地方見かけ恒星時（GAST＋入力東経、極運動前）: —"
            )
        )
        XCTAssertTrue(
            payload.contains(
                "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: —"
            )
        )
        XCTAssertTrue(
            payload.contains(
                "真空 topocentric 高度: 20.123456°"
            )
        )
        XCTAssertTrue(
            payload.contains(
                "真空 topocentric 方位: "
                    + "315.000000°（北=0°・東回り）"
            )
        )
        XCTAssertTrue(
            payload.contains(
                "観測高度（大気差後）: 20.156789°"
            )
        )
        XCTAssertTrue(payload.contains("JD UTC: 2461234.500000000"))
        XCTAssertTrue(payload.contains("JD UT1: 2461234.499998572"))
        XCTAssertTrue(payload.contains("JD TT: 2461234.500800741"))
        XCTAssertTrue(payload.contains("DUT1 (UT1−UTC): −0.123456 s"))
        XCTAssertTrue(payload.contains("EOP: IERS test; sha256=abc123"))
        XCTAssertTrue(payload.contains("地点水平精度: ±12.4 m"))
        XCTAssertTrue(
            payload.contains(
                "桁数自体が位置精度を保証するものではありません"
            )
        )
    }

    func testReadablePayloadUsesPrecisionLASTAndWestPositiveHourAngle()
        throws
    {
        let frame = try pointingFrame(
            earthOrientation:
                EarthOrientationOptionsV2(
                    polarMotion: .assumedZero
                ),
            refraction: .disabled
        )
        let source = precisionCatalogStar(
            rightAscension:
                Angles.normalizedRadians(
                    overheadRightAscension(frame) - 0.3
                ),
            astrometry: nil
        )
        let position =
            try Astronomy
            .calculateApparentStarPositionWithContextV2(
                source,
                context: frame
            )
        let rendered = RenderedStar(
            catalog: source,
            name: nil,
            horizontal: position.observedHorizontal,
            projection: position.projection,
            apparentEquatorial:
                position.apparentEquatorial,
            geometricHorizontal:
                position.geometricHorizontal,
            observedHorizontal:
                position.observedHorizontal
        )
        let precision = try XCTUnwrap(
            StarPointingPrecisionContext(
                position: position,
                frame: frame,
                atmosphere: nil,
                atmosphereInputSource: nil,
                earthOrientationEstimate: nil,
                earthOrientationSourceIdentifier: nil
            )
        )
        let context = StarPointingPayloadContext(
            observationDate: try XCTUnwrap(
                ISO8601DateFormatter().date(
                    from: "2026-07-31T12:00:00Z"
                )
            ),
            location: pointingLocation,
            timeScales: frame.timeScales,
            earthOrientationIdentifier: "未適用",
            refractionDescription: "なし",
            precisionContext: precision
        )
        let angles = try XCTUnwrap(
            StarPointingPayloadFormatter
                .localApparentSiderealTimeAndHourAngle(
                    context: context
                )
        )
        let expectedLAST = Angles.normalizedRadians(
            frame.greenwichApparentSiderealTime
                + Angles.radians(
                    fromDegrees:
                        pointingLocation.longitude
                )
        )
        let expectedHourAngle = atan2(
            sin(
                expectedLAST
                    - position.apparentEquatorial
                    .rightAscension
            ),
            cos(
                expectedLAST
                    - position.apparentEquatorial
                    .rightAscension
            )
        )
        let payload = StarPointingPayloadFormatter.payload(
            for: rendered,
            context: context
        )

        XCTAssertEqual(
            angles.localApparentSiderealTime,
            expectedLAST,
            accuracy: 1e-15
        )
        XCTAssertEqual(
            angles.hourAngle,
            expectedHourAngle,
            accuracy: 1e-15
        )
        XCTAssertGreaterThan(angles.hourAngle, 0)
        XCTAssertEqual(
            rendered.apparentEquatorial,
            position.apparentEquatorial
        )
        XCTAssertTrue(
            payload.contains(
                "地方見かけ恒星時（GAST＋入力東経、極運動前）: "
                    + AstronomicalFormatting
                    .rightAscension(
                        expectedLAST,
                        fractionDigits: 2
                    )
            )
        )
        XCTAssertTrue(
            payload.contains(
                "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: "
                    + StarPointingPayloadFormatter
                    .preciseSignedHourAngle(
                        expectedHourAngle
                    )
            )
        )
    }

    func testSignedHourAngleFormattingCarriesAndLocksBoundaries() {
        let carryHours =
            1 + 59.0 / 60 + 59.996 / 3_600
        let nearlyZeroHours = 0.004 / 3_600
        let roundedHalfTurnHours =
            11 + 59.0 / 60 + 59.996 / 3_600

        XCTAssertEqual(
            StarPointingPayloadFormatter
                .preciseSignedHourAngle(
                    carryHours * .pi / 12
                ),
            "+02h 00m 00.00s"
        )
        XCTAssertEqual(
            StarPointingPayloadFormatter
                .preciseSignedHourAngle(
                    -carryHours * .pi / 12
                ),
            "−02h 00m 00.00s"
        )
        XCTAssertEqual(
            StarPointingPayloadFormatter
                .preciseSignedHourAngle(
                    -nearlyZeroHours * .pi / 12
                ),
            "+00h 00m 00.00s"
        )
        XCTAssertEqual(
            StarPointingPayloadFormatter
                .preciseSignedHourAngle(.pi),
            "−12h 00m 00.00s"
        )
        XCTAssertEqual(
            StarPointingPayloadFormatter
                .preciseSignedHourAngle(-.pi),
            "−12h 00m 00.00s"
        )
        XCTAssertEqual(
            StarPointingPayloadFormatter
                .preciseSignedHourAngle(
                    roundedHalfTurnHours * .pi / 12
                ),
            "−12h 00m 00.00s"
        )
        XCTAssertEqual(
            StarPointingPayloadFormatter
                .preciseSignedHourAngle(
                    13 * .pi / 12
                ),
            "−11h 00m 00.00s"
        )
        XCTAssertEqual(
            StarPointingPayloadFormatter
                .preciseSignedHourAngle(.nan),
            "—"
        )
    }

    @MainActor
    func testSkyStoreBuildsCopyablePointingPayload() throws {
        let date = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-31T00:00:00Z"
            )
        )
        let store = SkyStore(now: date)
        let payload = try XCTUnwrap(
            store.selectedStarPointingPayload
        )

        XCTAssertTrue(payload.contains("Planetarium 導入用データ"))
        XCTAssertTrue(payload.contains("観測時刻 UTC:"))
        XCTAssertTrue(payload.contains("赤経（J2000）:"))
        XCTAssertTrue(payload.contains("見かけ赤経"))
        XCTAssertTrue(
            payload.contains(
                "地方見かけ恒星時（GAST＋入力東経、極運動前）: "
            )
        )
        XCTAssertFalse(
            payload.contains(
                "地方見かけ恒星時（GAST＋入力東経、極運動前）: —"
            )
        )
        XCTAssertTrue(
            payload.contains(
                "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: "
            )
        )
        XCTAssertFalse(
            payload.contains(
                "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: —"
            )
        )
        XCTAssertTrue(payload.contains("真空 topocentric 高度:"))
        XCTAssertTrue(payload.contains("観測高度（大気差後）:"))
        XCTAssertTrue(payload.contains("JD UT1:"))
        XCTAssertTrue(payload.contains("JD TT:"))
        XCTAssertTrue(payload.contains("EOP:"))
    }

    @MainActor
    func testSkyStoreBuildsVersionedMachineReadablePointingProfile()
        throws
    {
        let date = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-31T00:00:00Z"
            )
        )
        let store = SkyStore(now: date)
        let payload = try XCTUnwrap(
            store.selectedStarPointingPayload(
                profile: .precisionJSON
            )
        )
        let data = try XCTUnwrap(
            payload.data(using: .utf8)
        )
        let root = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: data
            ) as? [String: Any]
        )

        XCTAssertEqual(
            root["schemaVersion"] as? Int,
            1
        )
        XCTAssertEqual(
            root["profileId"] as? String,
            "planetarium.precision-pointing.full-v1"
        )
        let coordinates = try XCTUnwrap(
            root["coordinates"]
                as? [String: Any]
        )
        let catalog = try XCTUnwrap(
            coordinates["catalogJ2000"]
                as? [String: Any]
        )
        XCTAssertEqual(
            catalog["frame"] as? String,
            "FK5"
        )
        XCTAssertEqual(
            catalog["equinox"] as? String,
            "J2000.0"
        )
        let apparent = try XCTUnwrap(
            coordinates["geocentricApparent"]
                as? [String: Any]
        )
        XCTAssertEqual(
            apparent["origin"] as? String,
            "geocenter"
        )
        let vacuum = try XCTUnwrap(
            coordinates["vacuumTopocentric"]
                as? [String: Any]
        )
        XCTAssertEqual(
            vacuum["origin"] as? String,
            "WGS84-observer"
        )
        XCTAssertEqual(
            vacuum["azimuthConvention"]
                as? String,
            "north-zero-east-positive"
        )
        let diagnostics = try XCTUnwrap(
            root["diagnostics"]
                as? [String: Any]
        )
        XCTAssertEqual(
            diagnostics["modelId"] as? String,
            "planetarium-precision-v2"
        )
    }

    func testProductionMachineProfilesMatchSharedSchemaFixtures()
        throws
    {
        let fixtures =
            try productionMachineProfileFixtures()
        for fixture in fixtures {
            let actual = try XCTUnwrap(
                JSONSerialization.jsonObject(
                    with: try XCTUnwrap(
                        fixture.payload.data(
                            using: .utf8
                        )
                    )
                ) as? NSDictionary
            )
            let expected = try XCTUnwrap(
                JSONSerialization.jsonObject(
                    with: try TestFixtureData.data(
                        at: fixture.path
                    )
                ) as? NSDictionary
            )

            XCTAssertEqual(
                actual,
                expected,
                """
                The macOS production pointing serializer changed \
                for \(fixture.path). Review the shared JSON Schema \
                before intentionally regenerating the fixture.
                """
            )
        }
    }

    func testPositiveParallaxWithoutProperMotionOrRadialVelocity()
        throws
    {
        let frame = try pointingFrame(
            earthOrientation:
                EarthOrientationOptionsV2(
                    polarMotion: .assumedZero
                ),
            refraction: .disabled
        )
        let star = precisionCatalogStar(
            rightAscension:
                overheadRightAscension(frame),
            astrometry: StarAstrometry(
                properMotionRightAscensionCosDeclinationArcsecondsPerYear:
                    nil,
                properMotionDeclinationArcsecondsPerYear:
                    nil,
                parallaxArcseconds: 0.2,
                radialVelocityKilometersPerSecond:
                    nil
            )
        )
        let root = try machineProfile(
            star: star,
            frame: frame,
            atmosphere: nil,
            atmosphereInputSource: nil,
            estimate: nil,
            sourceIdentifier: nil
        )
        let target = try dictionary(
            root,
            key: "target"
        )
        let kinematics = try dictionary(
            target,
            key: "catalogKinematics"
        )

        XCTAssertEqual(
            kinematics["spaceMotionMode"] as? String,
            "none"
        )
        XCTAssertEqual(
            kinematics["properMotionStatus"] as? String,
            "not-applied-missing"
        )
        XCTAssertEqual(
            kinematics["parallaxStatus"] as? String,
            "applied"
        )
        XCTAssertEqual(
            kinematics["radialVelocityStatus"] as? String,
            "assumed-zero"
        )

        let diagnostics = try dictionary(
            root,
            key: "diagnostics"
        )
        let approximations = try dictionary(
            diagnostics,
            key: "approximations"
        )
        XCTAssertEqual(
            approximations["properMotionMissing"]
                as? Bool,
            true
        )
        XCTAssertEqual(
            approximations["properMotionUnavailable"]
                as? Bool,
            true
        )
        XCTAssertEqual(
            approximations["radialVelocityAssumedZero"]
                as? Bool,
            true
        )
    }

    func testMachineReadableProfileUsesAppliedPerStarMetadata()
        throws
    {
        let estimate = IERSEarthOrientationEstimateV1(
            dut1: IERSDUT1EstimateV1(
                dut1Seconds: 0.123456,
                source: .predicted,
                uncertaintySeconds: 0.000321
            ),
            polarMotion: IERSPolarMotionEstimateV1(
                xpRadians: 1.25e-6,
                ypRadians: -2.5e-6,
                xpReportedErrorRadians: 3e-9,
                ypReportedErrorRadians: 4e-9,
                source: .predicted,
                usesPrediction: true
            )
        )
        let frame =
            try pointingFrame(
                earthOrientation:
                    estimate.earthOrientationOptionsV2,
                refraction:
                    .atmosphere(.standardVisual)
            )
        let star = precisionCatalogStar(
            rightAscension:
                overheadRightAscension(frame),
            astrometry: StarAstrometry(
                properMotionRightAscensionCosDeclinationArcsecondsPerYear:
                    0.25,
                properMotionDeclinationArcsecondsPerYear:
                    -0.125,
                parallaxArcseconds: 0.2,
                radialVelocityKilometersPerSecond:
                    nil
            )
        )
        let root = try machineProfile(
            star: star,
            frame: frame,
            atmosphere: .standardVisual,
            atmosphereInputSource: .standard,
            estimate: estimate,
            sourceIdentifier: "sha256:test-eop"
        )

        let target = try dictionary(
            root,
            key: "target"
        )
        let kinematics = try dictionary(
            target,
            key: "catalogKinematics"
        )
        XCTAssertEqual(
            kinematics["properMotionStatus"] as? String,
            "applied"
        )
        XCTAssertEqual(
            kinematics["parallaxStatus"] as? String,
            "applied"
        )
        XCTAssertEqual(
            kinematics["radialVelocityStatus"] as? String,
            "assumed-zero"
        )
        XCTAssertEqual(
            kinematics[
                "properMotionRaCosDecArcsecondsPerYear"
            ] as? Double,
            0.25
        )
        XCTAssertEqual(
            kinematics[
                "radialVelocityKilometersPerSecond"
            ] as? NSNull,
            NSNull()
        )

        let diagnostics = try dictionary(
            root,
            key: "diagnostics"
        )
        let models = try dictionary(
            diagnostics,
            key: "models"
        )
        XCTAssertEqual(
            models["spaceMotionMode"] as? String,
            "angular-proper-motion"
        )
        XCTAssertEqual(
            models["radialVelocityAssumedZero"]
                as? Bool,
            true
        )
        XCTAssertEqual(
            models["annualParallaxMode"] as? String,
            "truncated-vsop2000-heliocentric-earth"
        )
        XCTAssertEqual(
            models["annualAberrationMode"] as? String,
            "truncated-vsop2000-heliocentric-earth"
        )
        XCTAssertEqual(
            models["solarLightDeflectionMode"]
                as? String,
            "truncated-vsop2000-heliocentric-earth"
        )
        XCTAssertEqual(
            models["diurnalAberrationMode"] as? String,
            "wgs84-observer"
        )
        XCTAssertEqual(
            models["polarMotionMode"] as? String,
            "iers-predicted"
        )
        XCTAssertEqual(
            models["refractionMode"] as? String,
            "applied"
        )

        let warnings = try XCTUnwrap(
            diagnostics["warnings"] as? [String]
        )
        XCTAssertTrue(
            warnings.contains(
                "radial-velocity-missing-assumed-zero"
            )
        )
        XCTAssertTrue(
            warnings.contains(
                "annual-parallax-approximate-ephemeris"
            )
        )
        XCTAssertTrue(
            warnings.contains(
                "solar-light-deflection-approximate-ephemeris"
            )
        )
        XCTAssertTrue(
            warnings.contains(
                "aberration-approximate-ephemeris"
            )
        )

        let omitted = try XCTUnwrap(
            diagnostics[
                "omittedCorrections"
            ] as? [String]
        )
        XCTAssertEqual(
            omitted,
            [
                "stellar-diurnal-parallax",
                "planetary-light-deflection",
                "subdaily-polar-motion-tides",
            ]
        )

        let refraction = try dictionary(
            diagnostics,
            key: "refraction"
        )
        XCTAssertEqual(
            refraction["mode"] as? String,
            "applied"
        )
        XCTAssertEqual(
            refraction["status"] as? String,
            "refraction-applied"
        )
        let parameters = try dictionary(
            refraction,
            key: "parameters"
        )
        XCTAssertEqual(
            refraction["parametersStatus"] as? String,
            "configured"
        )
        XCTAssertEqual(
            parameters["inputSource"] as? String,
            "standard"
        )
        XCTAssertEqual(
            parameters["pressureHpa"] as? Double,
            1_013.25
        )
        XCTAssertEqual(
            parameters[
                "temperatureCelsius"
            ] as? Double,
            10
        )
        XCTAssertEqual(
            parameters["relativeHumidity"] as? Double,
            0.5
        )
        XCTAssertEqual(
            parameters[
                "wavelengthMicrometers"
            ] as? Double,
            0.55
        )
        XCTAssertEqual(
            parameters[
                "minimumGeometricAltitudeDegrees"
            ] as? Double,
            5
        )

        let earthOrientation = try dictionary(
            root,
            key: "earthOrientation"
        )
        XCTAssertEqual(
            earthOrientation["status"] as? String,
            "iers"
        )
        XCTAssertEqual(
            earthOrientation["sourceIdentifier"]
                as? String,
            "sha256:test-eop"
        )
        XCTAssertEqual(
            earthOrientation["sourceIdentifierStatus"]
                as? String,
            "available"
        )
        XCTAssertEqual(
            earthOrientation["appliedDut1Seconds"]
                as? Double,
            0.123456
        )
        XCTAssertEqual(
            earthOrientation["dut1Status"] as? String,
            "available"
        )
        XCTAssertEqual(
            earthOrientation["dut1Source"] as? String,
            "iers-predicted"
        )
        XCTAssertEqual(
            earthOrientation[
                "dut1MetadataMatchesAppliedValue"
            ] as? Bool,
            true
        )
        XCTAssertEqual(
            earthOrientation["estimateStatus"] as? String,
            "available"
        )
        XCTAssertEqual(
            earthOrientation["polarMotionStatus"]
                as? String,
            "available"
        )
        XCTAssertEqual(
            earthOrientation["polarMotionSource"]
                as? String,
            "predicted"
        )
        XCTAssertEqual(
            earthOrientation[
                "polarMotionMetadataMatchesAppliedValue"
            ] as? Bool,
            true
        )
        XCTAssertEqual(
            earthOrientation["xpAppliedRadians"]
                as? Double,
            1.25e-6
        )
        XCTAssertEqual(
            earthOrientation["usesPrediction"] as? Bool,
            true
        )
        XCTAssertEqual(
            earthOrientation["consistencyIssues"]
                as? [String],
            []
        )
    }

    func testMachineProfileKeepsExplicitManualSourceForStandardValues()
        throws
    {
        let frame = try pointingFrame(
            earthOrientation:
                EarthOrientationOptionsV2(
                    polarMotion: .assumedZero
                ),
            refraction:
                .atmosphere(.standardVisual)
        )
        let star = precisionCatalogStar(
            rightAscension:
                overheadRightAscension(frame),
            astrometry: nil
        )
        let root = try machineProfile(
            star: star,
            frame: frame,
            atmosphere: .standardVisual,
            atmosphereInputSource: .manual,
            estimate: nil,
            sourceIdentifier: nil
        )
        let diagnostics = try dictionary(
            root,
            key: "diagnostics"
        )
        let refraction = try dictionary(
            diagnostics,
            key: "refraction"
        )
        let parameters = try dictionary(
            refraction,
            key: "parameters"
        )

        XCTAssertEqual(
            parameters["inputSource"] as? String,
            "manual"
        )
        XCTAssertTrue(
            StarPointingPrecisionContext(
                position:
                    try Astronomy
                    .calculateApparentStarPositionWithContextV2(
                        star,
                        context: frame
                    ),
                frame: frame,
                atmosphere: .standardVisual,
                atmosphereInputSource: nil,
                earthOrientationEstimate: nil,
                earthOrientationSourceIdentifier: nil
            ) == nil
        )
    }

    func testIERSMetadataMismatchesFailClosedPerComponent()
        throws
    {
        let appliedEstimate =
            IERSEarthOrientationEstimateV1(
                dut1: IERSDUT1EstimateV1(
                    dut1Seconds: 0.123456,
                    source: .predicted,
                    uncertaintySeconds: 0.000321
                ),
                polarMotion: IERSPolarMotionEstimateV1(
                    xpRadians: 1.25e-6,
                    ypRadians: -2.5e-6,
                    xpReportedErrorRadians: 3e-9,
                    ypReportedErrorRadians: 4e-9,
                    source: .predicted,
                    usesPrediction: true
                )
            )
        let frame = try pointingFrame(
            earthOrientation:
                appliedEstimate
                .earthOrientationOptionsV2,
            refraction: .disabled
        )
        let star = precisionCatalogStar(
            rightAscension:
                overheadRightAscension(frame),
            astrometry: nil
        )
        let dut1Mismatch =
            IERSEarthOrientationEstimateV1(
                dut1: IERSDUT1EstimateV1(
                    dut1Seconds: 0.123457,
                    source: .observed,
                    uncertaintySeconds: 0.000321
                ),
                polarMotion:
                    appliedEstimate.polarMotion
            )
        let dut1Root = try machineProfile(
            star: star,
            frame: frame,
            atmosphere: nil,
            atmosphereInputSource: nil,
            estimate: dut1Mismatch,
            sourceIdentifier: "must-not-survive"
        )
        let dut1EarthOrientation = try dictionary(
            dut1Root,
            key: "earthOrientation"
        )

        XCTAssertEqual(
            dut1EarthOrientation[
                "dut1MetadataMatchesAppliedValue"
            ] as? Bool,
            false
        )
        XCTAssertEqual(
            dut1EarthOrientation[
                "polarMotionMetadataMatchesAppliedValue"
            ] as? Bool,
            true
        )
        XCTAssertEqual(
            dut1EarthOrientation["dut1Status"] as? String,
            "applied-without-matching-estimate-metadata"
        )
        XCTAssertEqual(
            dut1EarthOrientation["polarMotionStatus"]
                as? String,
            "available"
        )
        XCTAssertTrue(
            dut1EarthOrientation["dut1Quality"]
                is NSNull
        )
        XCTAssertEqual(
            dut1EarthOrientation["polarMotionQuality"]
                as? String,
            "predicted"
        )
        XCTAssertTrue(
            dut1EarthOrientation["sourceIdentifier"]
                is NSNull
        )
        XCTAssertEqual(
            dut1EarthOrientation["sourceIdentifierStatus"]
                as? String,
            "unavailable"
        )
        XCTAssertEqual(
            dut1EarthOrientation["estimateStatus"]
                as? String,
            "available"
        )
        XCTAssertEqual(
            dut1EarthOrientation["consistencyIssues"]
                as? [String],
            [
                "Applied DUT1 does not have a matching IERS estimate snapshot."
            ]
        )

        let polarMotionMismatch =
            IERSEarthOrientationEstimateV1(
                dut1: appliedEstimate.dut1,
                polarMotion:
                    IERSPolarMotionEstimateV1(
                        xpRadians: 1.5e-6,
                        ypRadians: -2.5e-6,
                        xpReportedErrorRadians: 3e-9,
                        ypReportedErrorRadians: 4e-9,
                        source: .observed,
                        usesPrediction: false
                    )
            )
        let polarRoot = try machineProfile(
            star: star,
            frame: frame,
            atmosphere: nil,
            atmosphereInputSource: nil,
            estimate: polarMotionMismatch,
            sourceIdentifier: "must-not-survive"
        )
        let polarEarthOrientation = try dictionary(
            polarRoot,
            key: "earthOrientation"
        )

        XCTAssertEqual(
            polarEarthOrientation[
                "dut1MetadataMatchesAppliedValue"
            ] as? Bool,
            true
        )
        XCTAssertEqual(
            polarEarthOrientation[
                "polarMotionMetadataMatchesAppliedValue"
            ] as? Bool,
            false
        )
        XCTAssertEqual(
            polarEarthOrientation["dut1Status"] as? String,
            "available"
        )
        XCTAssertEqual(
            polarEarthOrientation[
                "polarMotionStatus"
            ] as? String,
            "applied-without-matching-estimate-metadata"
        )
        XCTAssertEqual(
            polarEarthOrientation["dut1Quality"]
                as? String,
            "predicted"
        )
        XCTAssertTrue(
            polarEarthOrientation["polarMotionQuality"]
                is NSNull
        )
        XCTAssertTrue(
            polarEarthOrientation["sourceIdentifier"]
                is NSNull
        )
        XCTAssertEqual(
            polarEarthOrientation["usesPrediction"]
                as? Bool,
            true
        )
        XCTAssertEqual(
            polarEarthOrientation["consistencyIssues"]
                as? [String],
            [
                "Applied polar motion does not have a matching IERS estimate snapshot."
            ]
        )
    }

    func testMachineProfileEnumsStayInsideSharedV1Contract()
        throws
    {
        let contractData = try TestFixtureData.data(
            at:
                "shared/fixtures/"
                + "star-pointing-profile-v1-contract.json"
        )
        let contract = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: contractData
            ) as? [String: Any]
        )
        XCTAssertEqual(
            contract["schemaVersion"] as? Int,
            1
        )
        XCTAssertEqual(
            contract["profileId"] as? String,
            "planetarium.precision-pointing.full-v1"
        )
        let allowedCatalogStatuses = Set(
            try XCTUnwrap(
                contract[
                    "catalogKinematicsStatuses"
                ] as? [String]
            )
        )
        let allowedEarthOrientationStatuses = Set(
            try XCTUnwrap(
                contract[
                    "earthOrientationStatuses"
                ] as? [String]
            )
        )
        let allowedDUT1Statuses = Set(
            try XCTUnwrap(
                contract["dut1Statuses"] as? [String]
            )
        )
        let allowedPolarMotionStatuses = Set(
            try XCTUnwrap(
                contract[
                    "polarMotionStatuses"
                ] as? [String]
            )
        )
        let allowedRefractionInputSources = Set(
            try XCTUnwrap(
                contract[
                    "refractionInputSources"
                ] as? [String]
            )
        )
        let allowedOmissionTokens = Set(
            try XCTUnwrap(
                contract[
                    "omittedCorrectionTokens"
                ] as? [String]
            )
        )
        let frame = try pointingFrame(
            earthOrientation:
                EarthOrientationOptionsV2(
                    polarMotion: .assumedZero
                ),
            refraction: .disabled
        )
        let astrometryCases: [StarAstrometry?] = [
            StarAstrometry(
                properMotionRightAscensionCosDeclinationArcsecondsPerYear:
                    0.25,
                properMotionDeclinationArcsecondsPerYear:
                    -0.125,
                parallaxArcseconds: 0.2,
                radialVelocityKilometersPerSecond: 12
            ),
            StarAstrometry(
                properMotionRightAscensionCosDeclinationArcsecondsPerYear:
                    0.25,
                properMotionDeclinationArcsecondsPerYear:
                    -0.125,
                parallaxArcseconds: 0.2,
                radialVelocityKilometersPerSecond: nil
            ),
            nil,
        ]
        var emittedCatalogStatuses = Set<String>()

        for astrometry in astrometryCases {
            let root = try machineProfile(
                star: precisionCatalogStar(
                    rightAscension:
                        overheadRightAscension(frame),
                    astrometry: astrometry
                ),
                frame: frame,
                atmosphere: nil,
                atmosphereInputSource: nil,
                estimate: nil,
                sourceIdentifier: nil
            )
            let target = try dictionary(
                root,
                key: "target"
            )
            let kinematics = try dictionary(
                target,
                key: "catalogKinematics"
            )
            let catalogStatus = try XCTUnwrap(
                kinematics["status"] as? String
            )
            emittedCatalogStatuses.insert(catalogStatus)
            XCTAssertTrue(
                allowedCatalogStatuses.contains(
                    catalogStatus
                )
            )

            let earthOrientation = try dictionary(
                root,
                key: "earthOrientation"
            )
            XCTAssertTrue(
                allowedEarthOrientationStatuses.contains(
                    try XCTUnwrap(
                        earthOrientation["status"]
                            as? String
                    )
                )
            )
            XCTAssertTrue(
                allowedDUT1Statuses.contains(
                    try XCTUnwrap(
                        earthOrientation["dut1Status"]
                            as? String
                    )
                )
            )
            XCTAssertTrue(
                allowedPolarMotionStatuses.contains(
                    try XCTUnwrap(
                        earthOrientation[
                            "polarMotionStatus"
                        ] as? String
                    )
                )
            )

            let diagnostics = try dictionary(
                root,
                key: "diagnostics"
            )
            for token in try XCTUnwrap(
                diagnostics[
                    "omittedCorrections"
                ] as? [String]
            ) {
                XCTAssertTrue(
                    allowedOmissionTokens.contains(token),
                    token
                )
            }
        }

        XCTAssertEqual(
            emittedCatalogStatuses,
            allowedCatalogStatuses
        )
        XCTAssertEqual(
            allowedRefractionInputSources,
            Set(
                AtmosphericRefractionInputSource
                    .allCases
                    .map(\.rawValue)
            )
        )
    }

    func testMachineReadableProfileUsesZeroOnlyForAppliedAssumption()
        throws
    {
        let contradictoryEstimate =
            IERSEarthOrientationEstimateV1(
                dut1: IERSDUT1EstimateV1(
                    dut1Seconds: 0.25,
                    source: .observed,
                    uncertaintySeconds: 0.001
                ),
                polarMotion: IERSPolarMotionEstimateV1(
                    xpRadians: 1e-6,
                    ypRadians: 2e-6,
                    xpReportedErrorRadians: 1e-9,
                    ypReportedErrorRadians: 1e-9,
                    source: .observed,
                    usesPrediction: false
                )
            )
        let frame =
            try pointingFrame(
                earthOrientation:
                    EarthOrientationOptionsV2(
                        polarMotion: .assumedZero
                    ),
                refraction: .disabled
            )
        let star = precisionCatalogStar(
            rightAscension:
                overheadRightAscension(frame),
            astrometry: nil
        )
        let root = try machineProfile(
            star: star,
            frame: frame,
            atmosphere: nil,
            atmosphereInputSource: nil,
            estimate: contradictoryEstimate,
            sourceIdentifier:
                "must-not-survive"
        )

        let earthOrientation = try dictionary(
            root,
            key: "earthOrientation"
        )
        XCTAssertEqual(
            earthOrientation["status"] as? String,
            "assumed-zero"
        )
        XCTAssertEqual(
            earthOrientation["appliedDut1Seconds"]
                as? Double,
            0
        )
        XCTAssertEqual(
            earthOrientation["dut1Source"] as? String,
            "assumed-zero"
        )
        XCTAssertEqual(
            earthOrientation["xpAppliedRadians"]
                as? Double,
            0
        )
        XCTAssertEqual(
            earthOrientation["ypAppliedRadians"]
                as? Double,
            0
        )
        XCTAssertTrue(
            earthOrientation["sourceIdentifier"]
                is NSNull
        )
        XCTAssertEqual(
            earthOrientation["sourceIdentifierStatus"]
                as? String,
            "unavailable"
        )
        XCTAssertTrue(
            earthOrientation[
                "dut1ReportedErrorSeconds"
            ] is NSNull
        )
        XCTAssertTrue(
            earthOrientation[
                "dut1MetadataMatchesAppliedValue"
            ] is NSNull
        )
        XCTAssertEqual(
            earthOrientation["estimateStatus"] as? String,
            "available"
        )
        XCTAssertTrue(
            earthOrientation[
                "polarMotionMetadataMatchesAppliedValue"
            ] is NSNull
        )
        XCTAssertEqual(
            earthOrientation["consistencyIssues"]
                as? [String],
            []
        )
        XCTAssertTrue(
            earthOrientation[
                "xpReportedErrorRadians"
            ] is NSNull
        )

        let diagnostics = try dictionary(
            root,
            key: "diagnostics"
        )
        let refraction = try dictionary(
            diagnostics,
            key: "refraction"
        )
        XCTAssertEqual(
            refraction["mode"] as? String,
            "disabled"
        )
        XCTAssertEqual(
            refraction["parametersStatus"] as? String,
            "not-configured"
        )
        XCTAssertTrue(
            refraction["parameters"] is NSNull
        )
        let approximations = try dictionary(
            diagnostics,
            key: "approximations"
        )
        XCTAssertEqual(
            approximations["earthOrientationNotApplied"]
                as? Bool,
            false
        )
        XCTAssertEqual(
            approximations["properMotionMissing"]
                as? Bool,
            true
        )
        XCTAssertEqual(
            approximations[
                "refractionParametersUnavailable"
            ] as? Bool,
            false
        )

        let warnings = try XCTUnwrap(
            diagnostics["warnings"] as? [String]
        )
        XCTAssertTrue(
            warnings.contains(
                "proper-motion-missing"
            )
        )
        XCTAssertTrue(
            warnings.contains(
                "annual-parallax-unavailable"
            )
        )
        XCTAssertTrue(
            warnings.contains(
                "polar-motion-assumed-zero"
            )
        )
        XCTAssertTrue(
            warnings.contains(
                "refraction-disabled"
            )
        )
    }

    func testDisabledPolarMotionStaysNullInsteadOfBecomingZero()
        throws
    {
        let frame =
            try pointingFrame(
                earthOrientation:
                    EarthOrientationOptionsV2(),
                refraction: .disabled
            )
        let star = precisionCatalogStar(
            rightAscension:
                overheadRightAscension(frame),
            astrometry: nil
        )
        let root = try machineProfile(
            star: star,
            frame: frame,
            atmosphere: nil,
            atmosphereInputSource: nil,
            estimate: nil,
            sourceIdentifier: nil
        )
        let earthOrientation = try dictionary(
            root,
            key: "earthOrientation"
        )

        XCTAssertEqual(
            earthOrientation[
                "polarMotionStatus"
            ] as? String,
            "unavailable"
        )
        XCTAssertEqual(
            earthOrientation[
                "polarMotionSource"
            ] as? String,
            "disabled"
        )
        XCTAssertTrue(
            earthOrientation[
                "xpAppliedRadians"
            ] is NSNull
        )
        XCTAssertTrue(
            earthOrientation[
                "ypAppliedRadians"
            ] is NSNull
        )
    }

    func testJSONProfileIsUnavailableWithoutPrecisionState()
        throws
    {
        let payloadContext = StarPointingPayloadContext(
            observationDate: Date(
                timeIntervalSince1970:
                    1_775_000_000
            ),
            location: pointingLocation,
            timeScales: ResolvedTimeScalesV2(
                utcJulianDate: 2_461_234.5,
                taiJulianDate:
                    2_461_234.500428241,
                ttJulianDate:
                    2_461_234.500800741,
                ut1JulianDate: 2_461_234.5,
                dut1Seconds: 0,
                dut1UncertaintySeconds: nil,
                taiMinusUTCSeconds: 37,
                dut1Source: .assumedZero,
                taiMinusUTCSource: .iersHistory,
                warnings: [.dut1AssumedZero]
            ),
            earthOrientationIdentifier:
                "未適用",
            refractionDescription: "なし"
        )
        let rendered = RenderedStar(
            catalog: catalogStar,
            name: nil,
            horizontal: HorizontalCoordinates(
                altitude: 0.5,
                azimuth: 1
            ),
            projection: ProjectedPoint(
                x: 0,
                y: 0
            )
        )

        XCTAssertNotNil(
            StarPointingPayloadFormatter.payload(
                for: rendered,
                context: payloadContext,
                profile: .readableText
            )
        )
        XCTAssertNil(
            StarPointingPayloadFormatter.payload(
                for: rendered,
                context: payloadContext,
                profile: .precisionJSON
            )
        )
    }

    func testSnapshotCaptureRequestsExactlyOnePauseWhilePlaying() {
        var pauseCount = 0

        let didPause =
            StarPointingSnapshotCapturePolicy
            .pausePlaybackIfNeeded(
                isPlaybackPlaying: true
            ) {
                pauseCount += 1
            }

        XCTAssertTrue(didPause)
        XCTAssertEqual(pauseCount, 1)
    }

    func testSnapshotCaptureDoesNotPauseAnAlreadyStoppedSky() {
        var pauseCount = 0

        let didPause =
            StarPointingSnapshotCapturePolicy
            .pausePlaybackIfNeeded(
                isPlaybackPlaying: false
            ) {
                pauseCount += 1
            }

        XCTAssertFalse(didPause)
        XCTAssertEqual(pauseCount, 0)
    }

    func testCopyStatusPolicyClearsOnlyItsOwnGlobalMessage() {
        XCTAssertTrue(
            StarPointingCopyStatusPolicy
                .shouldClearGlobalStatus(
                    copyStatus: "コピーしました",
                    globalStatus: "コピーしました"
                )
        )
        XCTAssertFalse(
            StarPointingCopyStatusPolicy
                .shouldClearGlobalStatus(
                    copyStatus: "コピーしました",
                    globalStatus:
                        "標準大気差を適用しました"
                )
        )
        XCTAssertFalse(
            StarPointingCopyStatusPolicy
                .shouldClearGlobalStatus(
                    copyStatus: nil,
                    globalStatus: "コピーしました"
                )
        )
    }

    @MainActor
    func testSkyStorePointingPayloadChangesWithRefractionCondition()
        throws
    {
        let date = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-31T00:00:00Z"
            )
        )
        let store = SkyStore(now: date)
        let originalSetting =
            store.useStandardAtmosphericRefraction
        let originalPayload = try XCTUnwrap(
            store.selectedStarPointingPayload
        )
        defer {
            if store.useStandardAtmosphericRefraction
                != originalSetting
            {
                store.useStandardAtmosphericRefraction =
                    originalSetting
            }
        }

        store.useStandardAtmosphericRefraction
            .toggle()
        let changedPayload = try XCTUnwrap(
            store.selectedStarPointingPayload
        )

        XCTAssertNotEqual(
            changedPayload,
            originalPayload
        )
        XCTAssertTrue(
            changedPayload.contains(
                store.pointingRefractionDescription
            )
        )
    }

    @MainActor
    func testSkyStoreSnapshotFreezesMatchingUTCAndPayload()
        throws
    {
        let date = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-31T00:00:00Z"
            )
        )
        let store = SkyStore(now: date)
        store.togglePlayback()
        XCTAssertTrue(store.isPlaybackPlaying)

        let snapshot = try XCTUnwrap(
            store.captureSelectedStarPointingSnapshot()
        )

        XCTAssertTrue(snapshot.didPausePlayback)
        XCTAssertFalse(store.isPlaybackPlaying)
        XCTAssertEqual(
            snapshot.observationDate,
            date
        )
        XCTAssertEqual(
            snapshot.utcTimestamp,
            StarPointingPayloadFormatter
                .utcTimestamp(date)
        )
        XCTAssertTrue(
            snapshot.payload.contains(
                "観測時刻 UTC: "
                    + snapshot.utcTimestamp
            )
        )

        let stoppedSnapshot = try XCTUnwrap(
            store.captureSelectedStarPointingSnapshot()
        )
        XCTAssertFalse(
            stoppedSnapshot.didPausePlayback
        )
        XCTAssertEqual(
            stoppedSnapshot.observationDate,
            snapshot.observationDate
        )

        let jsonSnapshot = try XCTUnwrap(
            store.captureSelectedStarPointingSnapshot(
                profile: .precisionJSON
            )
        )
        XCTAssertFalse(
            jsonSnapshot.didPausePlayback
        )
        XCTAssertTrue(
            jsonSnapshot.payload.contains(
                "\"profileId\" : "
                    + "\"planetarium.precision-pointing.full-v1\""
            )
        )
        XCTAssertEqual(
            jsonSnapshot.observationDate,
            snapshot.observationDate
        )
    }

    private var catalogStar: CatalogStar {
        CatalogStar(
            hr: 42,
            hd: 4242,
            rightAscension:
                Angles.radians(fromDegrees: 30),
            declination:
                Angles.radians(fromDegrees: -5),
            visualMagnitude: 1,
            bvColor: 0,
            catalogName: nil,
            spectralType: "A0"
        )
    }

    private var pointingLocation: ObservingLocation {
        ObservingLocation(
            id: "custom",
            name: "試験地点",
            latitude: 35,
            longitude: 139,
            timeZoneIdentifier: "Asia/Tokyo",
            heightMeters: 42,
            horizontalAccuracyMeters: 3
        )
    }

    private func pointingFrame(
        earthOrientation: EarthOrientationOptionsV2,
        refraction: RefractionConfigurationV2
    ) throws -> ApparentPositionContextV2 {
        let date = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-31T12:00:00Z"
            )
        )
        return try Astronomy
            .createApparentPositionContextV2(
                at: date,
                location: pointingLocation,
                options: ApparentPositionOptionsV2(
                    earthOrientation:
                        earthOrientation,
                    diurnalAberration:
                        .wgs84Observer(
                            heightMeters:
                                pointingLocation
                                .heightMeters
                        ),
                    refraction: refraction
                )
            )
    }

    private func overheadRightAscension(
        _ frame: ApparentPositionContextV2
    ) -> Double {
        Angles.normalizedRadians(
            frame.greenwichApparentSiderealTime
                + Angles.radians(
                    fromDegrees:
                        pointingLocation.longitude
                )
        )
    }

    private func precisionCatalogStar(
        rightAscension: Double,
        astrometry: StarAstrometry?
    ) -> CatalogStar {
        CatalogStar(
            hr: 42,
            hd: 4242,
            rightAscension: rightAscension,
            declination:
                Angles.radians(
                    fromDegrees:
                        pointingLocation.latitude
                ),
            visualMagnitude: 1.234567,
            bvColor: 0.1,
            catalogName: "Test Star",
            spectralType: "A0",
            astrometry: astrometry
        )
    }

    private func productionMachineProfileFixtures()
        throws -> [(path: String, payload: String)]
    {
        let estimate = IERSEarthOrientationEstimateV1(
            dut1: IERSDUT1EstimateV1(
                dut1Seconds: 0.123456,
                source: .predicted,
                uncertaintySeconds: 0.000321
            ),
            polarMotion: IERSPolarMotionEstimateV1(
                xpRadians: 1.25e-6,
                ypRadians: -2.5e-6,
                xpReportedErrorRadians: 3e-9,
                ypReportedErrorRadians: 4e-9,
                source: .predicted,
                usesPrediction: true
            )
        )
        let fullAstrometry = StarAstrometry(
            properMotionRightAscensionCosDeclinationArcsecondsPerYear:
                0.25,
            properMotionDeclinationArcsecondsPerYear:
                -0.125,
            parallaxArcseconds: 0.2,
            radialVelocityKilometersPerSecond: 12
        )
        let manualAtmosphere = AtmosphereV2(
            pressureHPA: 998.4,
            temperatureCelsius: 7.5,
            relativeHumidity: 0.62,
            wavelengthMicrometers: 0.7,
            minimumGeometricAltitudeDegrees: 8
        )
        let belowDomainAtmosphere = AtmosphereV2(
            pressureHPA: 1_005,
            temperatureCelsius: 4,
            relativeHumidity: 0.75,
            wavelengthMicrometers: 0.55,
            minimumGeometricAltitudeDegrees: 30
        )
        let standardFrame = try pointingFrame(
            earthOrientation:
                estimate.earthOrientationOptionsV2,
            refraction:
                .atmosphere(.standardVisual)
        )
        let disabledFrame = try pointingFrame(
            earthOrientation:
                EarthOrientationOptionsV2(
                    polarMotion: .assumedZero
                ),
            refraction: .disabled
        )
        let manualFrame = try pointingFrame(
            earthOrientation:
                estimate.earthOrientationOptionsV2,
            refraction:
                .atmosphere(manualAtmosphere)
        )
        let belowDomainFrame = try pointingFrame(
            earthOrientation:
                estimate.earthOrientationOptionsV2,
            refraction:
                .atmosphere(belowDomainAtmosphere)
        )

        return [
            (
                path:
                    "shared/fixtures/"
                    + "star-pointing-profile-v1-macos-iers-standard.json",
                payload:
                    try machineProfilePayload(
                        star: precisionCatalogStar(
                            rightAscension:
                                Angles.normalizedRadians(
                                    overheadRightAscension(
                                        standardFrame
                                    )
                                        - 0.3
                                ),
                            astrometry: fullAstrometry
                        ),
                        frame: standardFrame,
                        atmosphere: .standardVisual,
                        atmosphereInputSource: .standard,
                        estimate: estimate,
                        sourceIdentifier:
                            "IERS fixture; sha256=mac-production"
                    )
            ),
            (
                path:
                    "shared/fixtures/"
                    + "star-pointing-profile-v1-macos-assumed-zero-disabled.json",
                payload:
                    try machineProfilePayload(
                        star: precisionCatalogStar(
                            rightAscension:
                                Angles.normalizedRadians(
                                    overheadRightAscension(
                                        disabledFrame
                                    )
                                        - 0.35
                                ),
                            astrometry: fullAstrometry
                        ),
                        frame: disabledFrame,
                        atmosphere: nil,
                        atmosphereInputSource: nil,
                        estimate: nil,
                        sourceIdentifier: nil
                    )
            ),
            (
                path:
                    "shared/fixtures/"
                    + "star-pointing-profile-v1-macos-manual.json",
                payload:
                    try machineProfilePayload(
                        star: precisionCatalogStar(
                            rightAscension:
                                Angles.normalizedRadians(
                                    overheadRightAscension(
                                        manualFrame
                                    )
                                        - 0.45
                                ),
                            astrometry: fullAstrometry
                        ),
                        frame: manualFrame,
                        atmosphere: manualAtmosphere,
                        atmosphereInputSource: .manual,
                        estimate: estimate,
                        sourceIdentifier:
                            "IERS fixture; sha256=mac-production"
                    )
            ),
            (
                path:
                    "shared/fixtures/"
                    + "star-pointing-profile-v1-macos-below-domain-missing-kinematics.json",
                payload:
                    try machineProfilePayload(
                        star: precisionCatalogStar(
                            rightAscension:
                                Angles.normalizedRadians(
                                    overheadRightAscension(
                                        belowDomainFrame
                                    )
                                        - .pi / 2
                                ),
                            astrometry: nil
                        ),
                        frame: belowDomainFrame,
                        atmosphere:
                            belowDomainAtmosphere,
                        atmosphereInputSource: .manual,
                        estimate: estimate,
                        sourceIdentifier:
                            "IERS fixture; sha256=mac-production"
                    )
            ),
        ]
    }

    private func machineProfile(
        star: CatalogStar,
        frame: ApparentPositionContextV2,
        atmosphere: AtmosphereV2?,
        atmosphereInputSource:
            AtmosphericRefractionInputSource?,
        estimate: IERSEarthOrientationEstimateV1?,
        sourceIdentifier: String?
    ) throws -> [String: Any] {
        let payload = try machineProfilePayload(
            star: star,
            frame: frame,
            atmosphere: atmosphere,
            atmosphereInputSource:
                atmosphereInputSource,
            estimate: estimate,
            sourceIdentifier: sourceIdentifier
        )
        let data = try XCTUnwrap(
            payload.data(using: .utf8)
        )
        return try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: data
            ) as? [String: Any]
        )
    }

    private func machineProfilePayload(
        star: CatalogStar,
        frame: ApparentPositionContextV2,
        atmosphere: AtmosphereV2?,
        atmosphereInputSource:
            AtmosphericRefractionInputSource?,
        estimate: IERSEarthOrientationEstimateV1?,
        sourceIdentifier: String?
    ) throws -> String {
        let position = try Astronomy
            .calculateApparentStarPositionWithContextV2(
                star,
                context: frame
            )
        let rendered = RenderedStar(
            catalog: star,
            name: NamedStar(
                hr: star.hr,
                name: "Test Star",
                nameJa: "試験星",
                aliases: ["Alias"],
                constellation: "Test"
            ),
            horizontal:
                position.observedHorizontal,
            projection: position.projection,
            apparentEquatorial:
                position.apparentEquatorial,
            geometricHorizontal:
                position.geometricHorizontal,
            observedHorizontal:
                position.observedHorizontal
        )
        let precision = try XCTUnwrap(
            StarPointingPrecisionContext(
                position: position,
                frame: frame,
                atmosphere: atmosphere,
                atmosphereInputSource:
                    atmosphereInputSource,
                earthOrientationEstimate: estimate,
                earthOrientationSourceIdentifier:
                    sourceIdentifier
            )
        )
        let context = StarPointingPayloadContext(
            observationDate:
                Date(
                    timeIntervalSince1970:
                        (frame.timeScales.utcJulianDate
                            - 2_440_587.5)
                            * 86_400
                ),
            location: pointingLocation,
            timeScales: frame.timeScales,
            earthOrientationIdentifier:
                sourceIdentifier ?? "未適用",
            refractionDescription: "test",
            precisionContext: precision
        )
        let payload = try XCTUnwrap(
            StarPointingPayloadFormatter.payload(
                for: rendered,
                context: context,
                profile: .precisionJSON
            )
        )
        return payload
    }

    private func dictionary(
        _ parent: [String: Any],
        key: String
    ) throws -> [String: Any] {
        try XCTUnwrap(
            parent[key] as? [String: Any]
        )
    }
}
