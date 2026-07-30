import Foundation
import XCTest

@testable import Planetarium
@testable import PlanetariumCore

final class AtmosphericRefractionSettingsTests:
    XCTestCase
{
    private let refractionPreferenceKey =
        "planetarium.standardRefractionDefault"
    private let trajectoryPreferenceKey =
        "planetarium.selectedStarTrajectoryDefault"

    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(
            forKey: refractionPreferenceKey
        )
        UserDefaults.standard.removeObject(
            forKey: trajectoryPreferenceKey
        )
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(
            forKey: refractionPreferenceKey
        )
        UserDefaults.standard.removeObject(
            forKey: trajectoryPreferenceKey
        )
        super.tearDown()
    }

    func testDraftRejectsNonnumericFieldInJapanese() {
        var draft = AtmosphericRefractionDraft(
            inputSource: .manual
        )
        draft.temperatureCelsius = "暖かい"

        XCTAssertThrowsError(
            try draft.manualAtmosphere()
        ) { error in
            XCTAssertEqual(
                error as?
                    AtmosphericRefractionInputError,
                .invalidNumber("気温")
            )
            XCTAssertEqual(
                error.localizedDescription,
                "気温は有限の数値で入力してください。"
            )
        }
    }

    func testValidatorRejectsCoefficientOnlyConfigurationThatCannotRender()
        throws
    {
        let candidate = AtmosphereV2(
            pressureHPA: 500,
            temperatureCelsius: 60,
            relativeHumidity: 0,
            wavelengthMicrometers: 0.3,
            minimumGeometricAltitudeDegrees: 5
        )

        // Coefficients alone are valid, but their inverse is unsafe at the
        // configured boundary. The application validator must catch this
        // before SkyStore commits the edit.
        _ = try Astronomy.refractionCoefficientsV2(
            for: candidate
        )
        XCTAssertThrowsError(
            try AtmosphericRefractionValidator
                .validateForSkyRendering(candidate)
        ) { error in
            XCTAssertEqual(
                error as? PrecisionModelError,
                .refractionInversionFailed
            )
        }
    }

    @MainActor
    func testInvalidManualApplyIsAtomicAndKeepsPlaybackRunning()
        throws
    {
        UserDefaults.standard.set(
            true,
            forKey: refractionPreferenceKey
        )
        let store = makeEmptyStore()
        let previousConfiguration =
            try XCTUnwrap(
                store.appliedAtmosphericRefraction
            )
        let previousManual =
            store.lastManualAtmosphere
        store.statusMessage = "変更前"
        store.togglePlayback()
        XCTAssertTrue(store.isPlaybackPlaying)

        let invalid = AtmosphereV2(
            pressureHPA: 500,
            temperatureCelsius: 60,
            relativeHumidity: 0,
            wavelengthMicrometers: 0.3,
            minimumGeometricAltitudeDegrees: 5
        )
        XCTAssertThrowsError(
            try store
                .applyManualAtmosphericRefraction(
                    invalid
                )
        ) { error in
            XCTAssertEqual(
                error as?
                    AtmosphericRefractionInputError,
                .physicallyInvalid
            )
            XCTAssertEqual(
                error.localizedDescription,
                "この組み合わせでは安定した大気差を計算できません。"
            )
        }

        XCTAssertEqual(
            store.appliedAtmosphericRefraction,
            previousConfiguration
        )
        XCTAssertEqual(
            store.lastManualAtmosphere,
            previousManual
        )
        XCTAssertEqual(store.statusMessage, "変更前")
        XCTAssertTrue(store.isPlaybackPlaying)
        XCTAssertEqual(
            UserDefaults.standard.bool(
                forKey: refractionPreferenceKey
            ),
            true
        )
        store.pausePlayback()
    }

    @MainActor
    func testManualApplyReportsEverySupportedRangeInJapanese() {
        let store = makeEmptyStore()
        let cases: [
            (
                AtmosphereV2,
                AtmosphericRefractionInputError
            )
        ] = [
            (
                AtmosphereV2(
                    pressureHPA: 1_101,
                    temperatureCelsius: 10,
                    relativeHumidity: 0.5,
                    wavelengthMicrometers: 0.55
                ),
                .pressureOutOfRange
            ),
            (
                AtmosphereV2(
                    pressureHPA: 1_013.25,
                    temperatureCelsius: 61,
                    relativeHumidity: 0.5,
                    wavelengthMicrometers: 0.55
                ),
                .temperatureOutOfRange
            ),
            (
                AtmosphereV2(
                    pressureHPA: 1_013.25,
                    temperatureCelsius: 10,
                    relativeHumidity: 1.01,
                    wavelengthMicrometers: 0.55
                ),
                .humidityOutOfRange
            ),
            (
                AtmosphereV2(
                    pressureHPA: 1_013.25,
                    temperatureCelsius: 10,
                    relativeHumidity: 0.5,
                    wavelengthMicrometers: 0.2
                ),
                .wavelengthOutOfRange
            ),
            (
                AtmosphereV2(
                    pressureHPA: 1_013.25,
                    temperatureCelsius: 10,
                    relativeHumidity: 0.5,
                    wavelengthMicrometers: 0.55,
                    minimumGeometricAltitudeDegrees: 31
                ),
                .minimumAltitudeOutOfRange
            ),
        ]

        for (atmosphere, expectedError) in cases {
            XCTAssertThrowsError(
                try store
                    .applyManualAtmosphericRefraction(
                        atmosphere
                    )
            ) { error in
                XCTAssertEqual(
                    error as?
                        AtmosphericRefractionInputError,
                    expectedError
                )
                XCTAssertFalse(
                    error.localizedDescription
                        .isEmpty
                )
            }
        }
        XCTAssertNil(
            store.appliedAtmosphericRefraction
        )
        XCTAssertFalse(
            UserDefaults.standard.bool(
                forKey: refractionPreferenceKey
            )
        )
    }

    @MainActor
    func testManualConfigurationIsSessionOnlyAndRelaunchesAsStandard()
        throws
    {
        let store = makeEmptyStore()
        let manual = AtmosphereV2(
            pressureHPA: 930,
            temperatureCelsius: 2,
            relativeHumidity: 0.82,
            wavelengthMicrometers: 0.62,
            minimumGeometricAltitudeDegrees: 8
        )
        try store.applyManualAtmosphericRefraction(
            manual
        )

        XCTAssertEqual(
            store.atmosphericRefractionInputSource,
            .manual
        )
        XCTAssertEqual(
            store.appliedAtmosphere,
            manual
        )
        XCTAssertTrue(
            UserDefaults.standard.bool(
                forKey: refractionPreferenceKey
            )
        )

        let relaunched = makeEmptyStore()
        XCTAssertEqual(
            relaunched
                .atmosphericRefractionInputSource,
            .standard
        )
        XCTAssertEqual(
            relaunched.appliedAtmosphere,
            .standardVisual
        )
        XCTAssertEqual(
            relaunched.lastManualAtmosphere,
            .standardVisual
        )
    }

    @MainActor
    func testManualStandardValuesStayManualAcrossSkyTrackAndJSON()
        throws
    {
        let store = SkyStore(
            now: Date(
                timeIntervalSince1970:
                    1_785_456_000
            )
        )
        store.showSelectedStarTrajectory = true

        try store
            .applyManualAtmosphericRefraction(
                .standardVisual
            )

        XCTAssertEqual(
            store.atmosphericRefractionInputSource,
            .manual
        )
        XCTAssertEqual(
            store.appliedAtmosphere,
            .standardVisual
        )
        let selected = try XCTUnwrap(
            store.selectedStar
        )
        let currentTrajectorySample =
            try XCTUnwrap(
                store.selectedStarTrajectory.first {
                    $0.offsetMinutes == 0
                }
            )
        XCTAssertEqual(
            currentTrajectorySample
                .horizontal,
            selected.observedHorizontal
        )

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
        let diagnostics = try XCTUnwrap(
            root["diagnostics"]
                as? [String: Any]
        )
        let refraction = try XCTUnwrap(
            diagnostics["refraction"]
                as? [String: Any]
        )
        let parameters = try XCTUnwrap(
            refraction["parameters"]
                as? [String: Any]
        )
        XCTAssertEqual(
            parameters["inputSource"] as? String,
            "manual"
        )
        XCTAssertEqual(
            parameters["pressureHpa"] as? Double,
            1_013.25
        )
        XCTAssertEqual(
            parameters[
                "minimumGeometricAltitudeDegrees"
            ] as? Double,
            5
        )

        let readable = try XCTUnwrap(
            store.selectedStarPointingPayload(
                profile: .readableText
            )
        )
        XCTAssertTrue(
            readable.contains(
                "大気差: 手動入力の大気モデル"
            )
        )
        XCTAssertTrue(
            readable.contains(
                "気圧 1,013.25 hPa"
            )
        )
        XCTAssertTrue(
            readable.contains(
                "気温 10°C"
            )
        )
        XCTAssertTrue(
            readable.contains(
                "相対湿度 50%"
            )
        )
        XCTAssertTrue(
            readable.contains(
                "観測波長 0.55 µm"
            )
        )
        XCTAssertTrue(
            readable.contains(
                "真空幾何高度 5°以上"
            )
        )
    }

    @MainActor
    private func makeEmptyStore() -> SkyStore {
        SkyStore(
            catalogLoader: {
                SkyCatalog(
                    stars: [],
                    names: [],
                    constellations: [],
                    cities: []
                )
            },
            earthOrientationServiceLoader: {
                throw TestFailure.unavailable
            },
            now: Date(
                timeIntervalSince1970:
                    1_785_456_000
            )
        )
    }

    private enum TestFailure: Error {
        case unavailable
    }
}
