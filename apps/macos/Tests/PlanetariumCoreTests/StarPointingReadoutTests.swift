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
        XCTAssertTrue(payload.contains("真空 topocentric 高度:"))
        XCTAssertTrue(payload.contains("観測高度（大気差後）:"))
        XCTAssertTrue(payload.contains("JD UT1:"))
        XCTAssertTrue(payload.contains("JD TT:"))
        XCTAssertTrue(payload.contains("EOP:"))
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
}
