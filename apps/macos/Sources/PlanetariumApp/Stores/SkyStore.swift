import Foundation
import Observation
import PlanetariumCore
import SwiftUI

protocol IERSEarthOrientationProviding: AnyObject {
    var coverage: IERSEarthOrientationCoverageV1 { get }
    var source: IERSEarthOrientationSourceSummaryV1 { get }

    func lookup(
        at date: Date
    ) throws -> IERSEarthOrientationEstimateV1?
}

extension IERSEarthOrientationServiceV1:
    IERSEarthOrientationProviding
{}

@MainActor
@Observable
final class SkyStore {
    private enum PreferenceKey {
        static let showConstellations = "planetarium.showConstellationsDefault"
        static let showNames = "planetarium.showNamesDefault"
        static let nightMode = "planetarium.nightModeDefault"
        static let standardRefraction = "planetarium.standardRefractionDefault"
        static let selectedStarTrajectory =
            "planetarium.selectedStarTrajectoryDefault"
    }

    private enum TimeBoundaryStatus {
        static let adjusted =
            "対応期間は1900年から2100年です。最も近い日時へ調整しました。"
        static let manualMinimum =
            "対応期間の開始（1900年）に達しました。"
        static let manualMaximum =
            "対応期間の終了（2100年）に達しました。"
        static let playbackMinimum =
            "対応期間の開始（1900年）で時間再生を停止しました。"
        static let playbackMaximum =
            "対応期間の終了（2100年）で時間再生を停止しました。"
        static let messages: Set<String> = [
            adjusted,
            manualMinimum,
            manualMaximum,
            playbackMinimum,
            playbackMaximum,
        ]
    }

    private(set) var catalog: SkyCatalog
    private(set) var renderedStars: [RenderedStar] = []
    private(set) var renderedStarsByHR: [Int: RenderedStar] = [:]
    private(set) var sunState: SunState
    private(set) var currentSolarLightDeflectionMode:
        SolarLightDeflectionModeV2 = .disabled
    private(set) var isPlaybackPlaying = false
    private(set) var playbackDirection: PlaybackDirection = .forward
    private(set) var playbackSpeed: PlaybackSpeedPreset = .minutePerSecond
    private(set) var playbackMotionMode: PlaybackMotionMode = .animated
    private(set) var sphereOrientation: CelestialSphereOrientation = .identity
    private(set) var sphereZoom = CelestialSphereZoom.defaultValue
    private(set) var currentTimeScales:
        ResolvedTimeScalesV2?
    private(set) var currentEarthOrientationEstimate:
        IERSEarthOrientationEstimateV1?
    private(set) var currentEarthOrientationLookupFailure: String?
    private(set) var currentEarthOrientationApplicationFailure:
        String?
    private(set) var catalogLoadFailure: String?
    private(set) var iersEarthOrientationLoadFailure: String?
    private(set) var selectedStarTrajectory:
        [SelectedStarTrajectorySample] = []
    private(set) var selectedStarTrajectoryEarthOrientationProvenance:
        SelectedStarTrajectoryEarthOrientationProvenance?
    var skyDisplayMode: SkyDisplayMode = .chart2D

    var observationDate: Date {
        didSet {
            if !isApplyingPlaybackDate, isPlaybackPlaying {
                isPlaybackPlaying = false
                stopPlaybackDriver()
            }
            let clampedDate = ObservationConstraints.clampedDate(observationDate)
            if clampedDate != observationDate {
                observationDate = clampedDate
                statusMessage = TimeBoundaryStatus.adjusted
            } else if observationDate != oldValue {
                clearStaleTimeBoundaryStatus()
            }
            recomputeSky()
        }
    }
    var location: ObservingLocation {
        didSet {
            pausePlayback()
            recomputeSky()
        }
    }
    var selectedStarHR: Int? {
        didSet {
            guard selectedStarHR != oldValue,
                  !isRecomputingSky
            else {
                return
            }
            recomputeSelectedStarTrajectory()
        }
    }
    var searchText = ""
    var visibleOnly = true
    var showConstellations: Bool {
        didSet {
            guard !isClearingDisplayPreferences else { return }
            UserDefaults.standard.set(
                showConstellations,
                forKey: PreferenceKey.showConstellations
            )
        }
    }
    var showNames: Bool {
        didSet {
            guard !isClearingDisplayPreferences else { return }
            UserDefaults.standard.set(
                showNames,
                forKey: PreferenceKey.showNames
            )
        }
    }
    var nightMode: Bool {
        didSet {
            guard !isClearingDisplayPreferences else { return }
            UserDefaults.standard.set(
                nightMode,
                forKey: PreferenceKey.nightMode
            )
        }
    }
    private(set) var appliedAtmosphericRefraction:
        AppliedAtmosphericRefraction?
    private(set) var lastManualAtmosphere:
        AtmosphereV2 = .standardVisual

    /// Compatibility binding for the existing persisted ON/OFF preference.
    /// Enabling through this Boolean always selects the standard preset.
    var useStandardAtmosphericRefraction: Bool {
        get { appliedAtmosphericRefraction != nil }
        set {
            if newValue {
                applyStandardAtmosphericRefraction()
            } else {
                disableAtmosphericRefraction()
            }
        }
    }
    var showSelectedStarTrajectory: Bool {
        didSet {
            guard showSelectedStarTrajectory != oldValue else {
                return
            }
            if !isClearingDisplayPreferences {
                UserDefaults.standard.set(
                    showSelectedStarTrajectory,
                    forKey: PreferenceKey.selectedStarTrajectory
                )
            }
            recomputeSelectedStarTrajectory()
        }
    }
    var isHelpPresented = false
    var isLocationEditorPresented = false
    var isInspectorPresented = true
    var searchFocusRequest = 0
    var errorMessage: String?
    var statusMessage: String?
    var isLocating = false

    @ObservationIgnored
    private lazy var locationService = LocationService()

    @ObservationIgnored
    private var isClearingDisplayPreferences = false

    @ObservationIgnored
    private let playbackClock = PlaybackClock()

    @ObservationIgnored
    private var iersEarthOrientationService:
        (any IERSEarthOrientationProviding)?

    @ObservationIgnored
    private let loadIERSEarthOrientationService:
        () throws -> any IERSEarthOrientationProviding

    @ObservationIgnored
    private let loadCatalog: () throws -> SkyCatalog

    @ObservationIgnored
    private var isApplyingPlaybackDate = false

    @ObservationIgnored
    private var isRecomputingSky = false

    @ObservationIgnored
    private var currentApparentPositionContext:
        ApparentPositionContextV2?

    @ObservationIgnored
    private var playbackTask: Task<Void, Never>?

    var isPlaybackDriverRunning: Bool {
        playbackTask != nil
    }

    init(
        catalogLoader: @escaping () throws -> SkyCatalog = {
            try PlanetariumData.load()
        },
        earthOrientationServiceLoader:
            @escaping () throws ->
                any IERSEarthOrientationProviding = {
                try IERSEarthOrientationServiceV1
                    .loadBundled()
            },
        now: Date = Date()
    ) {
        let initialObservationDate =
            ObservationConstraints.clampedDate(now)
        let initialTimeBoundaryStatus =
            initialObservationDate == now
                ? nil
                : TimeBoundaryStatus.adjusted
        var initialError: String?
        var initialCatalogLoadFailure: String?
        let loadedCatalog: SkyCatalog
        do {
            loadedCatalog = try catalogLoader()
        } catch {
            loadedCatalog = SkyCatalog(
                stars: [],
                names: [],
                constellations: [],
                cities: []
            )
            initialCatalogLoadFailure =
                error.localizedDescription
            initialError =
                "星表を読み込めませんでした。"
                + "「星表を再読み込み」をお試しください"
                + "（\(error.localizedDescription)）。"
        }

        let loadedEarthOrientationService:
            (any IERSEarthOrientationProviding)?
        let earthOrientationLoadFailure: String?
        do {
            loadedEarthOrientationService =
                try earthOrientationServiceLoader()
            earthOrientationLoadFailure = nil
        } catch {
            loadedEarthOrientationService = nil
            earthOrientationLoadFailure =
                error.localizedDescription
            AppLog.ui.error(
                "IERS EOP manifest load failed: \(error.localizedDescription, privacy: .public)"
            )
        }

        let tokyo = loadedCatalog.cities.first { $0.id == "tokyo" }
        let initialLocation = tokyo.map(ObservingLocation.init(city:))
            ?? ObservingLocation(
                id: "tokyo",
                name: "東京",
                latitude: 35.6812,
                longitude: 139.7671,
                timeZoneIdentifier: "Asia/Tokyo"
            )
        catalog = loadedCatalog
        catalogLoadFailure =
            initialCatalogLoadFailure
        loadCatalog = catalogLoader
        iersEarthOrientationService =
            loadedEarthOrientationService
        loadIERSEarthOrientationService =
            earthOrientationServiceLoader
        iersEarthOrientationLoadFailure =
            earthOrientationLoadFailure
        observationDate = initialObservationDate
        location = initialLocation
        showConstellations = UserDefaults.standard.object(
            forKey: PreferenceKey.showConstellations
        ) as? Bool ?? true
        showNames = UserDefaults.standard.object(
            forKey: PreferenceKey.showNames
        ) as? Bool ?? true
        nightMode = UserDefaults.standard.object(
            forKey: PreferenceKey.nightMode
        ) as? Bool ?? false
        appliedAtmosphericRefraction =
            UserDefaults.standard.object(
                forKey: PreferenceKey.standardRefraction
            ) as? Bool == true
            ? .standard
            : nil
        showSelectedStarTrajectory = UserDefaults.standard.object(
            forKey: PreferenceKey.selectedStarTrajectory
        ) as? Bool ?? false
        sunState = Sun.state(
            at: initialObservationDate,
            location: initialLocation
        )
        errorMessage = initialError
        statusMessage = initialTimeBoundaryStatus
        recomputeSky()
        selectedStarHR = filteredNamedStars.first?.hr
        AppLog.ui.info(
            "catalog loaded stars=\(loadedCatalog.stars.count, privacy: .public)"
        )
    }

    var cities: [City] { catalog.cities }

    var selectedStar: RenderedStar? {
        selectedStarHR.flatMap { renderedStarsByHR[$0] }
    }

    var selectedStarPointingPayload: String? {
        selectedStarPointingPayload(
            profile: .readableText
        )
    }

    func selectedStarPointingPayloadSignature(
        profile: StarPointingPayloadProfile
    ) -> StarPointingPayloadSignature? {
        guard
            let star = selectedStar,
            let timeScales = currentTimeScales,
            profile == .readableText
                || currentApparentPositionContext
                    != nil
        else {
            return nil
        }
        return StarPointingPayloadSignature(
            profile: profile,
            observationDate: observationDate,
            location: location,
            star: star,
            timeScales: timeScales,
            earthOrientationEstimate:
                currentEarthOrientationEstimate,
            solarLightDeflectionMode:
                currentSolarLightDeflectionMode,
            appliedAtmosphericRefraction:
                appliedAtmosphericRefraction
        )
    }

    func isSelectedStarPointingPayloadAvailable(
        profile: StarPointingPayloadProfile
    ) -> Bool {
        selectedStarPointingPayloadSignature(
            profile: profile
        ) != nil
    }

    func selectedStarPointingPayload(
        profile: StarPointingPayloadProfile
    ) -> String? {
        guard let star = selectedStar,
              let timeScales = currentTimeScales
        else {
            return nil
        }
        let precisionContext:
            StarPointingPrecisionContext?
        switch profile {
        case .readableText:
            precisionContext = nil
        case .precisionJSON:
            guard
                let frame =
                    currentApparentPositionContext,
                let position = try? Astronomy
                    .calculateApparentStarPositionWithContextV2(
                        star.catalog,
                        context: frame
                    ),
                let resolved =
                    StarPointingPrecisionContext(
                        position: position,
                        frame: frame,
                        atmosphere:
                            appliedAtmosphericRefraction?
                                .atmosphere,
                        atmosphereInputSource:
                            appliedAtmosphericRefraction?
                                .inputSource,
                        earthOrientationEstimate:
                            currentEarthOrientationEstimate,
                        earthOrientationSourceIdentifier:
                            currentEarthOrientationEstimate
                                == nil
                            ? nil
                            : pointingEarthOrientationIdentifier
                    )
            else {
                return nil
            }
            precisionContext = resolved
        }
        return StarPointingPayloadFormatter.payload(
            for: star,
            context: StarPointingPayloadContext(
                observationDate: observationDate,
                location: location,
                timeScales: timeScales,
                earthOrientationIdentifier:
                    pointingEarthOrientationIdentifier,
                refractionDescription:
                    pointingRefractionDescription,
                precisionContext: precisionContext
            ),
            profile: profile
        )
    }

    /// Stops a moving sky before capturing the exact date and its matching
    /// pointing payload. The returned payload and timestamp therefore always
    /// describe the same immutable frame.
    func captureSelectedStarPointingSnapshot(
        profile:
            StarPointingPayloadProfile =
            .readableText
    )
        -> StarPointingSnapshot?
    {
        let didPausePlayback =
            StarPointingSnapshotCapturePolicy
            .pausePlaybackIfNeeded(
                isPlaybackPlaying:
                    isPlaybackPlaying
            ) {
                pausePlayback()
            }

        let frozenDate = observationDate
        guard
            let payload =
                selectedStarPointingPayload(
                    profile: profile
                )
        else {
            return nil
        }
        return StarPointingSnapshot(
            observationDate: frozenDate,
            utcTimestamp:
                StarPointingPayloadFormatter
                .utcTimestamp(frozenDate),
            payload: payload,
            didPausePlayback: didPausePlayback
        )
    }

    var selectedStarTrajectoryIsTruncated: Bool {
        guard showSelectedStarTrajectory,
              let first = selectedStarTrajectory.first,
              let last = selectedStarTrajectory.last
        else {
            return false
        }
        return first.offsetMinutes
            > -SelectedStarTrajectorySampler.pastMinutes
            || last.offsetMinutes
                < SelectedStarTrajectorySampler.futureMinutes
    }

    var selectedStarTrajectoryAccessibilitySummary: String {
        guard showSelectedStarTrajectory else {
            return "選択星の軌跡は非表示です。"
        }
        guard selectedStar != nil else {
            return "選択星の軌跡は表示設定ですが、星が選択されていません。"
        }
        guard let first = selectedStarTrajectory.first,
              let last = selectedStarTrajectory.last
        else {
            return "選択星の軌跡を計算できませんでした。"
        }

        var summary =
            "選択星の軌跡。"
            + "\(relativeTimeText(first.offsetMinutes))から"
            + "\(relativeTimeText(last.offsetMinutes))まで、"
            + "\(SelectedStarTrajectorySampler.stepMinutes)分間隔の"
            + "\(selectedStarTrajectory.count)点です。"
            + "小さい点から大きい点へ、過去、現在、未来の順に進みます。"
        if selectedStarTrajectoryIsTruncated {
            summary += "対応期間の境界で軌跡を短くしています。"
        }
        if let warning =
            selectedStarTrajectoryEarthOrientationProvenance?
            .warning
        {
            summary +=
                warning.accessibilityDescription
        }
        return summary
    }

    var currentDUT1Estimate: IERSDUT1EstimateV1? {
        currentEarthOrientationEstimate?.dut1
    }

    var currentPolarMotionEstimate:
        IERSPolarMotionEstimateV1?
    {
        currentEarthOrientationEstimate?.polarMotion
    }

    var isIERSEarthOrientationDataLoaded: Bool {
        iersEarthOrientationService != nil
    }

    var iersEarthOrientationCoverage:
        IERSEarthOrientationCoverageV1?
    {
        iersEarthOrientationService?.coverage
    }

    var iersEarthOrientationSourceSummary:
        IERSEarthOrientationSourceSummaryV1?
    {
        iersEarthOrientationService?.source
    }

    var timeScaleAssumptionSummary: String? {
        guard let assumption = currentTAIMinusUTCAssumption
        else {
            return nil
        }
        switch assumption {
        case let .pre1972Approximation(seconds):
            return "時刻系：TAI−UTC="
                + compactSeconds(seconds)
                + "秒近似（1972年以前）"
        case let .futureLeapSecondsUnknown(seconds):
            return "時刻系：将来うるう秒不明・"
                + compactSeconds(seconds)
                + "秒仮定（TAI−UTC）"
        }
    }

    var timeScaleAssumptionDetail: String? {
        guard let assumption = currentTAIMinusUTCAssumption
        else {
            return nil
        }
        switch assumption {
        case let .pre1972Approximation(seconds):
            return "1972年以前のUTCは現在の整数うるう秒方式ではありません。"
                + "外部値がないため、この計算ではTAI−UTC="
                + compactSeconds(seconds)
                + "秒と近似しています。"
        case let .futureLeapSecondsUnknown(seconds):
            return "確定済みのうるう秒範囲より後の日時です。"
                + "将来のBulletin Cで変わる可能性がありますが、"
                + "この計算ではTAI−UTC="
                + compactSeconds(seconds)
                + "秒を仮定しています。"
        }
    }

    var dut1StatusSummary: String {
        if let estimate = currentDUT1Estimate {
            let kind = estimate.source == .observed
                ? "IERS観測"
                : "IERS予測"
            return "\(kind) DUT1 "
                + SkyFormatting.signedSeconds(
                    estimate.dut1Seconds
                )
                + " · 公表誤差 "
                + SkyFormatting.uncertaintySeconds(
                    estimate.uncertaintySeconds
                )
        }
        if currentEarthOrientationApplicationFailure != nil {
            return "DUT1 適用失敗 · 0秒近似"
        }
        return earthOrientationDataIsUnavailable
            ? "DUT1 データ利用不可 · 0秒近似"
            : "DUT1 収録範囲外 · 0秒近似"
    }

    var dut1StatusDetail: String {
        if let estimate = currentDUT1Estimate {
            let kind = estimate.source == .observed
                ? "IERS観測値"
                : "同梱スナップショットのIERS予測値"
            return "\(kind)をUTC日次値から補間しています。"
                + "UT1−UTCは"
                + SkyFormatting.signedSeconds(
                    estimate.dut1Seconds
                )
                + "、IERS公表誤差は"
                + SkyFormatting.uncertaintySeconds(
                    estimate.uncertaintySeconds
                )
                + "です。"
        }
        if currentEarthOrientationApplicationFailure != nil {
            return "IERS値は取得できましたが精密モデルv2へ適用できなかったため、"
                + "この星図ではUT1−UTCを0秒とする近似へ戻しています。"
        }
        if earthOrientationDataIsUnavailable {
            return earthOrientationReadFailureDescription
                + "ため、"
                + "UT1−UTCを0秒とする近似で表示しています。"
        }
        if let coverage = iersEarthOrientationCoverage {
            let first = SkyFormatting.utcDate(
                mjdUtc: coverage.firstSampleMjdUtc
            )
            let last = SkyFormatting.utcDate(
                mjdUtc: coverage.lastSampleMjdUtc
            )
            return "この日時は同梱IERSデータの範囲"
                + "（\(first)〜\(last) UTC）外です。"
                + "UT1−UTCを0秒とする近似で表示しています。"
        }
        return "IERS地球姿勢データを利用できないため、"
            + "UT1−UTCを0秒とする近似で表示しています。"
    }

    var dut1StatusSystemImage: String {
        switch currentDUT1Estimate?.source {
        case .observed:
            "clock.badge.checkmark"
        case .predicted:
            "clock.badge.exclamationmark"
        case nil:
            "exclamationmark.triangle"
        }
    }

    var polarMotionStatusSummary: String {
        if let estimate = currentPolarMotionEstimate {
            let kind = estimate.source == .observed
                ? "IERS観測"
                : "IERS予測"
            return "\(kind) 極運動 xp "
                + SkyFormatting.signedArcseconds(
                    radians: estimate.xpRadians
                )
                + " · yp "
                + SkyFormatting.signedArcseconds(
                    radians: estimate.ypRadians
                )
        }
        if currentEarthOrientationApplicationFailure != nil {
            return "極運動適用失敗 · xp=yp=0近似"
        }
        return earthOrientationDataIsUnavailable
            ? "極運動データ利用不可 · xp=yp=0近似"
            : "極運動収録範囲外 · xp=yp=0近似"
    }

    var polarMotionStatusDetail: String {
        if let estimate = currentPolarMotionEstimate {
            let kind = estimate.source == .observed
                ? "IERS観測値"
                : "同梱スナップショットのIERS予測値"
            return "\(kind)をUTC日次値から4点Lagrange補間しています。"
                + "xpは"
                + SkyFormatting.signedArcseconds(
                    radians: estimate.xpRadians
                )
                + "（公表誤差 "
                + SkyFormatting.uncertaintyArcseconds(
                    radians:
                        estimate.xpReportedErrorRadians
                )
                + "）、ypは"
                + SkyFormatting.signedArcseconds(
                    radians: estimate.ypRadians
                )
                + "（公表誤差 "
                + SkyFormatting.uncertaintyArcseconds(
                    radians:
                        estimate.ypReportedErrorRadians
                )
                + "）です。DUT1とは独立した品質区分です。"
        }
        if currentEarthOrientationApplicationFailure != nil {
            return "IERS値は取得できましたが精密モデルv2へ適用できなかったため、"
                + "この星図ではxp=yp=0を明示的に仮定しています。"
        }
        if earthOrientationDataIsUnavailable {
            return earthOrientationReadFailureDescription
                + "ため、"
                + "xp=yp=0を明示的に仮定しています。"
        }
        if let coverage = iersEarthOrientationCoverage {
            let first = SkyFormatting.utcDate(
                mjdUtc: coverage.firstSampleMjdUtc
            )
            let last = SkyFormatting.utcDate(
                mjdUtc: coverage.lastSampleMjdUtc
            )
            return "この日時は同梱IERSデータの範囲"
                + "（\(first)〜\(last) UTC）外です。"
                + "xp=yp=0を明示的に仮定しています。"
        }
        return "IERS地球姿勢データを利用できないため、"
            + "xp=yp=0を明示的に仮定しています。"
    }

    var polarMotionStatusSystemImage: String {
        switch currentPolarMotionEstimate?.source {
        case .observed:
            "globe.badge.chevron.backward"
        case .predicted:
            "clock.arrow.circlepath"
        case nil:
            "exclamationmark.triangle"
        }
    }

    var canRetryEarthOrientationData: Bool {
        earthOrientationDataIsUnavailable
            || currentEarthOrientationApplicationFailure
                != nil
    }

    var canRetryCatalogData: Bool {
        catalogLoadFailure != nil
    }

    func retryCatalogData() {
        guard canRetryCatalogData else { return }

        do {
            catalog = try loadCatalog()
            catalogLoadFailure = nil
            errorMessage = nil
            recomputeSky()
            if errorMessage == nil {
                statusMessage =
                    "星表を再読み込みし、星図へ適用しました。"
            }
            AppLog.ui.info(
                "catalog retry succeeded stars=\(self.catalog.stars.count, privacy: .public)"
            )
        } catch {
            catalogLoadFailure =
                error.localizedDescription
            statusMessage = nil
            errorMessage =
                "星表を再読み込みできませんでした"
                + "（\(error.localizedDescription)）。"
            AppLog.ui.error(
                "catalog retry failed: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    func retryEarthOrientationData() {
        if iersEarthOrientationService == nil {
            do {
                iersEarthOrientationService =
                    try loadIERSEarthOrientationService()
                iersEarthOrientationLoadFailure = nil
            } catch {
                iersEarthOrientationLoadFailure =
                    error.localizedDescription
                AppLog.ui.error(
                    "IERS EOP manifest retry failed: \(error.localizedDescription, privacy: .public)"
                )
            }
        }
        currentEarthOrientationLookupFailure = nil
        currentEarthOrientationApplicationFailure = nil
        recomputeSky()

        if currentEarthOrientationEstimate != nil {
            errorMessage = nil
            statusMessage =
                "IERS地球姿勢データを再読み込みし、星図へ適用しました。"
        } else if canRetryEarthOrientationData {
            errorMessage =
                "IERS地球姿勢データを再読み込みできませんでした。0近似で表示を続けます。"
        }
    }

    private var earthOrientationDataIsUnavailable: Bool {
        iersEarthOrientationService == nil
            || iersEarthOrientationLoadFailure != nil
            || currentEarthOrientationLookupFailure != nil
    }

    private var earthOrientationReadFailureDescription:
        String
    {
        if currentEarthOrientationLookupFailure != nil {
            return "必要なIERSデータchunkを検証して読み込めなかった"
        }
        if iersEarthOrientationLoadFailure != nil {
            return "同梱IERS manifestを検証して読み込めなかった"
        }
        return "IERS地球姿勢データを利用できない"
    }

    var selectedStarPositiveParallaxArcseconds: Double? {
        guard let parallax =
            selectedStar?.catalog.astrometry?.parallaxArcseconds,
            parallax.isFinite,
            parallax > 0
        else {
            return nil
        }
        return parallax
    }

    var selectedStarAnnualParallaxMode: AnnualParallaxModeV2? {
        guard selectedStar != nil else { return nil }
        return selectedStarPositiveParallaxArcseconds == nil
            ? .unavailable
            : .truncatedVSOP2000HeliocentricEarth
    }

    var selectedStarSolarLightDeflectionMode:
        SolarLightDeflectionModeV2?
    {
        selectedStar == nil
            ? nil
            : currentSolarLightDeflectionMode
    }

    var selectedStarRadialVelocityAssumedZero: Bool {
        guard selectedStarPositiveParallaxArcseconds != nil else {
            return false
        }
        // A present non-finite value is invalid catalogue input and is never
        // interpreted as a missing value by the precision pipeline.
        return selectedStar?.catalog.astrometry?
            .radialVelocityKilometersPerSecond == nil
    }

    var filteredNamedStars: [RenderedStar] {
        StarListPolicy.filteredNamedStars(
            from: renderedStars,
            query: searchText,
            visibleOnly: visibleOnly
        )
    }

    var starListEmptyReason: StarListEmptyReason? {
        StarListPolicy.emptyReason(
            stars: renderedStars,
            query: searchText,
            visibleOnly: visibleOnly
        )
    }

    var selectedStarListExclusion:
        StarListSelectionExclusion?
    {
        StarListPolicy.selectionExclusion(
            currentHR: selectedStarHR,
            stars: renderedStars,
            query: searchText,
            visibleOnly: visibleOnly
        )
    }

    var canSelectPreviousStar: Bool {
        StarListPolicy.adjacentSelection(
            currentHR: selectedStarHR,
            candidates: filteredNamedStars,
            offset: -1
        ) != nil
    }

    var canSelectNextStar: Bool {
        StarListPolicy.adjacentSelection(
            currentHR: selectedStarHR,
            candidates: filteredNamedStars,
            offset: 1
        ) != nil
    }

    var visibleStarCount: Int {
        renderedStars.lazy.filter(\.isAboveHorizon).count
    }

    var observationDateText: String {
        SkyFormatting.dateTime(
            observationDate,
            timeZoneIdentifier: location.timeZoneIdentifier
        )
    }

    var pointingUTCTimestamp: String {
        StarPointingPayloadFormatter
            .utcTimestamp(observationDate)
    }

    var pointingLocalTimestamp: String {
        SkyFormatting.preciseDateTime(
            observationDate,
            timeZoneIdentifier:
                location.timeZoneIdentifier
        )
    }

    var pointingLocationDescription: String {
        let latitude =
            AstronomicalFormatting.decimal(
                location.latitude,
                fractionDigits: 6
            )
        let longitude =
            AstronomicalFormatting.decimal(
                location.longitude,
                fractionDigits: 6
            )
        let height =
            AstronomicalFormatting.decimal(
                location.heightMeters,
                fractionDigits: 2
            )
        let accuracy =
            location.horizontalAccuracyMeters
            .map {
                " · 水平精度 ±"
                    + AstronomicalFormatting.decimal(
                        $0,
                        fractionDigits: 0
                    )
                    + " m"
            }
            ?? ""
        return location.name
            + " · 緯度 "
            + latitude
            + "° · 経度 "
            + longitude
            + "° · WGS84楕円体高 "
            + height
            + " m"
            + accuracy
    }

    var timeZoneText: String {
        SkyFormatting.timeZoneLabel(
            location.timeZoneIdentifier,
            at: observationDate
        )
    }

    func presentLocationEditor() {
        pausePlayback()
        isLocationEditorPresented = true
    }

    func selectCity(_ city: City) {
        location = ObservingLocation(city: city)
        statusMessage = "\(city.nameJa)へ移動しました。"
        AppLog.ui.info("city selected id=\(city.id, privacy: .public)")
    }

    func setCustomLocation(
        name: String,
        latitude: Double,
        longitude: Double,
        timeZoneIdentifier: String,
        heightMeters: Double = 0
    ) throws {
        location = try ObservationConstraints.validatedLocation(
            id: "custom",
            name: name,
            latitude: latitude,
            longitude: longitude,
            timeZoneIdentifier: timeZoneIdentifier,
            heightMeters: heightMeters
        )
        let height = heightMeters.formatted(
            .number.precision(.fractionLength(0...2))
        )
        statusMessage =
            "指定した地点へ移動しました（WGS84楕円体高 \(height) m）。"
            + "座標と楕円体高は保存・送信されません。"
        AppLog.ui.info("custom location applied")
    }

    func requestCurrentLocation() {
        guard !isLocating else { return }
        isLocating = true
        errorMessage = nil
        statusMessage = "現在地を確認しています…"
        AppLog.location.info("location request started by explicit action")
        locationService.requestOnce { [weak self] result in
            guard let self else { return }
            self.isLocating = false
            switch result {
            case let .success(fix):
                self.location = ObservingLocation(
                    id: "current",
                    name: "現在地",
                    latitude: fix.latitude,
                    longitude: fix.longitude,
                    timeZoneIdentifier:
                        TimeZone.current.identifier,
                    heightMeters:
                        fix.heightMeters ?? 0,
                    horizontalAccuracyMeters:
                        fix.horizontalAccuracyMeters
                )
                let accuracyText =
                    fix.horizontalAccuracyMeters.map {
                        "（水平精度 ±\(Int($0.rounded())) m）"
                    }
                    ?? ""
                let altitudeText =
                    fix.heightMeters.map {
                        let height = Int($0.rounded())
                        let accuracy =
                            fix.verticalAccuracyMeters.map {
                                "、垂直精度 ±\(Int($0.rounded())) m"
                            }
                            ?? ""
                        return "（楕円体高 \(height) m\(accuracy)）"
                    }
                    ?? "（楕円体高は0 m近似）"
                self.statusMessage =
                    "現在地へ移動しました\(accuracyText)\(altitudeText)。"
                    + "座標は保存・送信されません。"
                AppLog.location.info("location request succeeded")
            case let .failure(error):
                self.statusMessage = nil
                self.errorMessage = error.localizedDescription
                AppLog.location.error(
                    "location request failed: \(error.localizedDescription, privacy: .public)"
                )
            }
        }
    }

    func addHours(_ hours: Int) {
        pausePlayback()
        let result = ObservationConstraints.steppedDate(
            from: observationDate,
            hours: hours
        )
        observationDate = result.date
        switch result.reachedBoundary {
        case .minimum:
            statusMessage = TimeBoundaryStatus.manualMinimum
        case .maximum:
            statusMessage = TimeBoundaryStatus.manualMaximum
        case nil:
            break
        }
    }

    func useCurrentTime(_ now: Date = Date()) {
        pausePlayback()
        observationDate = now
    }

    func toggleSelectedStarTrajectory() {
        showSelectedStarTrajectory.toggle()
        statusMessage = showSelectedStarTrajectory
            ? "選択星の前後3時間の軌跡を表示しました。"
            : "選択星の軌跡を非表示にしました。"
    }

    func applyStandardAtmosphericRefraction() {
        commitAtmosphericRefraction(
            .standard,
            status:
                "標準大気差を幾何高度5°以上の星へ適用しました。"
        )
    }

    func applyManualAtmosphericRefraction(
        _ atmosphere: AtmosphereV2
    ) throws {
        do {
            try AtmosphericRefractionValidator
                .validateForSkyRendering(
                    atmosphere
                )
        } catch {
            throw AtmosphericRefractionInputError
                .translated(from: error)
        }

        lastManualAtmosphere = atmosphere
        commitAtmosphericRefraction(
            AppliedAtmosphericRefraction(
                inputSource: .manual,
                atmosphere: atmosphere
            ),
            status:
                "手動入力の大気差を幾何高度"
                + compactDegrees(
                    atmosphere
                        .minimumGeometricAltitudeDegrees
                )
                + "以上の星へ適用しました。"
        )
    }

    func disableAtmosphericRefraction() {
        commitAtmosphericRefraction(
            nil,
            status:
                "大気差を外し、幾何高度へ戻しました。"
        )
    }

    /// Resets visual state without changing the user's location or observation time.
    func resetDisplay() {
        pausePlayback()
        searchText = ""
        visibleOnly = true
        showConstellations = true
        showNames = true
        nightMode = false
        showSelectedStarTrajectory = false
        useStandardAtmosphericRefraction = false
        sphereOrientation = .identity
        sphereZoom = CelestialSphereZoom.defaultValue
        if selectedStarHR == nil {
            selectedStarHR = filteredNamedStars.first?.hr
        }
        statusMessage = "表示をリセットしました。地点と日時は変更していません。"
    }

    /// Clears only durable layer preferences; observing location and time stay in memory.
    func clearSavedDisplayPreferences() {
        isClearingDisplayPreferences = true
        defer { isClearingDisplayPreferences = false }

        UserDefaults.standard.removeObject(forKey: PreferenceKey.showConstellations)
        UserDefaults.standard.removeObject(forKey: PreferenceKey.showNames)
        UserDefaults.standard.removeObject(forKey: PreferenceKey.nightMode)
        UserDefaults.standard.removeObject(forKey: PreferenceKey.standardRefraction)
        UserDefaults.standard.removeObject(
            forKey: PreferenceKey.selectedStarTrajectory
        )

        showConstellations = true
        showNames = true
        nightMode = false
        showSelectedStarTrajectory = false
        useStandardAtmosphericRefraction = false
        statusMessage = "保存した表示設定を消去しました。地点と日時は変更していません。"
        AppLog.ui.info("saved display preferences cleared")
    }

    func requestSearchFocus() {
        searchFocusRequest += 1
    }

    func revealSelectedStarInList() {
        guard selectedStarListExclusion != nil else { return }
        searchText = ""
        visibleOnly = false
        statusMessage = "選択中の星を一覧に表示しました。"
    }

    func selectAdjacentStar(offset: Int) {
        guard let nextHR = StarListPolicy.adjacentSelection(
            currentHR: selectedStarHR,
            candidates: filteredNamedStars,
            offset: offset
        ) else { return }
        selectedStarHR = nextHR
    }

    func selectClosest(to point: ProjectedPoint, maximumDistance: Double) {
        if let closestHR = SkyHitTesting.closestStarHR(
            to: point,
            among: renderedStars,
            maximumDistance: maximumDistance
        ) {
            selectedStarHR = closestHR
        }
    }

    func togglePlayback() {
        applyPlaybackAction(.togglePlayback)
    }

    func pausePlayback() {
        applyPlaybackAction(.pause)
    }

    func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .active:
            return
        case .inactive, .background:
            pausePlayback()
        @unknown default:
            pausePlayback()
        }
    }

    func setPlaybackDirection(_ direction: PlaybackDirection) {
        applyPlaybackAction(.setDirection(direction))
    }

    func setPlaybackSpeed(_ speed: PlaybackSpeedPreset) {
        applyPlaybackAction(.setSpeed(speed))
    }

    func setReduceMotion(_ reduceMotion: Bool) {
        let mode: PlaybackMotionMode = reduceMotion ? .staticFrame : .animated
        guard mode != playbackMotionMode else { return }
        applyPlaybackAction(.setMotionMode(mode))
        if reduceMotion {
            statusMessage = "動きを減らす設定により、時間再生を静止モードにしました。"
        }
    }

    func advancePlayback(realTimeDelta: TimeInterval) {
        applyPlaybackAction(.tick(realTimeDelta: realTimeDelta))
    }

    func setSkyDisplayMode(_ mode: SkyDisplayMode) {
        skyDisplayMode = mode
    }

    func setSphereOrientation(_ orientation: CelestialSphereOrientation) {
        sphereOrientation = orientation
    }

    var canZoomSphereIn: Bool {
        sphereZoom < CelestialSphereZoom.maximum
    }

    var canZoomSphereOut: Bool {
        sphereZoom > CelestialSphereZoom.minimum
    }

    func setSphereZoom(_ zoom: Double) {
        sphereZoom = CelestialSphereZoom.clamped(zoom)
    }

    func nudgeSphereZoom(steps: Int) {
        sphereZoom = CelestialSphereZoom.stepped(
            from: sphereZoom,
            by: steps
        )
    }

    func nudgeSphere(horizontalDegrees: Double, verticalDegrees: Double) {
        var orientation = sphereOrientation
        if horizontalDegrees != 0 {
            orientation = orientation.applyingRotation(
                angle: Angles.radians(fromDegrees: horizontalDegrees),
                axis: .unitY
            )
        }
        if verticalDegrees != 0 {
            orientation = orientation.applyingRotation(
                angle: Angles.radians(fromDegrees: verticalDegrees),
                axis: .unitX
            )
        }
        sphereOrientation = orientation
    }

    func resetSphereView() {
        sphereOrientation.reset()
        sphereZoom = CelestialSphereZoom.defaultValue
        statusMessage = "3D天球の向きと倍率を初期状態へ戻しました。"
    }

    func selectClosestOnSphere(
        to point: ProjectedPoint,
        maximumDistance: Double
    ) {
        let targets = renderedStars.compactMap(CelestialSphereHitTarget.init(star:))
        if let closestHR = CelestialSphereHitTesting.closestTargetID(
            to: point,
            among: targets,
            orientation: sphereOrientation,
            maximumDistance: maximumDistance,
            visibility: .entireSphere
        ) {
            selectedStarHR = closestHR
            if visibleOnly,
               renderedStarsByHR[closestHR]?.isAboveHorizon == false {
                visibleOnly = false
                statusMessage = "地平線下の星を選択したため、一覧を「すべて」に切り替えました。"
            }
        }
    }

    private func recomputeSky() {
        isRecomputingSky = true
        currentTimeScales = nil
        currentApparentPositionContext = nil
        var hasPrecisionFrame = false
        defer {
            isRecomputingSky = false
            recomputeSelectedStarTrajectory()
        }
        let earthOrientationEstimate:
            IERSEarthOrientationEstimateV1?
        do {
            earthOrientationEstimate =
                try iersEarthOrientationService?
                    .lookup(at: observationDate)
            currentEarthOrientationLookupFailure = nil
        } catch {
            earthOrientationEstimate = nil
            currentEarthOrientationLookupFailure =
                error.localizedDescription
            AppLog.ui.error(
                "IERS EOP lookup failed: \(error.localizedDescription, privacy: .public)"
            )
        }
        do {
            let context =
                try Astronomy.createApparentPositionContextV2(
                at: observationDate,
                location: location,
                options: apparentPositionOptions(
                    for: earthOrientationEstimate
                )
            )
            let renderedFrame = try Astronomy.renderV2(
                catalog: catalog,
                context: context
            )
            let renderedSun = try Sun.state(context: context)
            renderedStars = renderedFrame
            sunState = renderedSun
            currentSolarLightDeflectionMode =
                context.solarLightDeflection.mode
            currentTimeScales = context.timeScales
            currentApparentPositionContext = context
            hasPrecisionFrame = true
            currentEarthOrientationEstimate =
                earthOrientationEstimate
            currentEarthOrientationApplicationFailure =
                nil
            if errorMessage?.hasPrefix(
                "精密モデルv2で星図を計算できませんでした"
            ) == true {
                errorMessage = nil
            }
        } catch {
            currentEarthOrientationEstimate = nil
            currentEarthOrientationApplicationFailure =
                error.localizedDescription
            AppLog.ui.error(
                "precision v2 render failed with IERS EOP: \(error.localizedDescription, privacy: .public)"
            )

            if earthOrientationEstimate != nil {
                do {
                    let context =
                        try Astronomy
                            .createApparentPositionContextV2(
                            at: observationDate,
                            location: location,
                            options:
                                apparentPositionOptions(
                                    for: nil
                                )
                        )
                    let renderedFrame =
                        try Astronomy.renderV2(
                            catalog: catalog,
                            context: context
                        )
                    let renderedSun =
                        try Sun.state(context: context)
                    renderedStars = renderedFrame
                    sunState = renderedSun
                    currentSolarLightDeflectionMode =
                        context.solarLightDeflection.mode
                    currentTimeScales = context.timeScales
                    currentApparentPositionContext =
                        context
                    hasPrecisionFrame = true
                } catch {
                    renderedStars = []
                    errorMessage =
                        "精密モデルv2で星図を計算できませんでした。"
                        + "誤った旧モデル表示には切り替えず、星を非表示にしています"
                        + "（\(error.localizedDescription)）。"
                    AppLog.ui.error(
                        "precision v2 explicit zero-EOP fallback failed: \(error.localizedDescription, privacy: .public)"
                    )
                }
            } else {
                renderedStars = []
                errorMessage =
                    "精密モデルv2で星図を計算できませんでした。"
                    + "誤った旧モデル表示には切り替えず、星を非表示にしています"
                    + "（\(error.localizedDescription)）。"
            }
        }
        if !hasPrecisionFrame {
            // Compatibility fallback only when no precision-v2 frame exists.
            currentSolarLightDeflectionMode = .disabled
            sunState = Sun.state(
                at: observationDate,
                location: location
            )
        }
        renderedStarsByHR = Dictionary(
            uniqueKeysWithValues: renderedStars.map { ($0.hr, $0) }
        )
        selectedStarHR = StarListPolicy.preservedSelection(
            currentHR: selectedStarHR,
            availableStars: renderedStars,
            fallbackCandidates: filteredNamedStars
        )
    }

    private func recomputeSelectedStarTrajectory() {
        selectedStarTrajectoryEarthOrientationProvenance =
            nil
        var auxiliarySampleCount = 0
        var auxiliaryFallbackSampleCount = 0
        let centerStatus =
            selectedStarTrajectoryCenterEarthOrientationStatus
        do {
            selectedStarTrajectory =
                try SelectedStarTrajectorySampler.samples(
                    for: selectedStarHR.flatMap {
                        catalog.starsByHR[$0]
                    },
                    centeredAt: observationDate,
                    location: location,
                    enabled: showSelectedStarTrajectory,
                    optionsAt: { date in
                        if date == observationDate {
                            // The present trajectory marker is part of the
                            // already-published sky frame. Reuse its settled
                            // EOP result, including an explicit zero fallback,
                            // instead of independently retrying the same
                            // instant and risking a center mismatch.
                            return apparentPositionOptions(
                                for:
                                    currentEarthOrientationEstimate
                            )
                        }
                        auxiliarySampleCount += 1
                        let resolution =
                            trajectoryApparentPositionOptions(
                                at: date
                            )
                        if resolution.status != .ready {
                            auxiliaryFallbackSampleCount += 1
                        }
                        return resolution.options
                    }
                )
            if !selectedStarTrajectory.isEmpty {
                selectedStarTrajectoryEarthOrientationProvenance =
                    SelectedStarTrajectoryEarthOrientationProvenance(
                        auxiliaryFallbackSampleCount:
                            auxiliaryFallbackSampleCount,
                        auxiliarySampleCount:
                            auxiliarySampleCount,
                        centerStatus: centerStatus
                    )
            }
        } catch {
            selectedStarTrajectory = []
            selectedStarTrajectoryEarthOrientationProvenance =
                nil
            AppLog.ui.error(
                "selected-star trajectory failed: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    private var selectedStarTrajectoryCenterEarthOrientationStatus:
        SelectedStarTrajectoryEarthOrientationStatus
    {
        if currentEarthOrientationEstimate != nil {
            return .ready
        }
        if iersEarthOrientationLoadFailure != nil
            || currentEarthOrientationLookupFailure != nil
            || currentEarthOrientationApplicationFailure
                != nil
        {
            return .error
        }
        return .unavailable
    }

    private func trajectoryApparentPositionOptions(
        at date: Date
    ) -> (
        options: ApparentPositionOptionsV2,
        status:
            SelectedStarTrajectoryEarthOrientationStatus
    ) {
        do {
            guard let iersEarthOrientationService else {
                return (
                    apparentPositionOptions(for: nil),
                    iersEarthOrientationLoadFailure == nil
                        ? .unavailable
                        : .error
                )
            }
            let estimate =
                try iersEarthOrientationService
                .lookup(at: date)
            return (
                apparentPositionOptions(
                    for: estimate
                ),
                estimate == nil
                    ? .unavailable
                    : .ready
            )
        } catch {
            AppLog.ui.error(
                "trajectory IERS EOP lookup failed: \(error.localizedDescription, privacy: .public)"
            )
            return (
                apparentPositionOptions(for: nil),
                .error
            )
        }
    }

    private func apparentPositionOptions(
        for estimate: IERSEarthOrientationEstimateV1?
    ) -> ApparentPositionOptionsV2 {
        ApparentPositionOptionsV2(
            earthOrientation: earthOrientationOptions(
                for: estimate
            ),
            diurnalAberration:
                .wgs84Observer(
                    heightMeters:
                        location.heightMeters
                ),
            refraction: refractionConfiguration
        )
    }

    private func earthOrientationOptions(
        for estimate: IERSEarthOrientationEstimateV1?
    ) -> EarthOrientationOptionsV2 {
        estimate?.earthOrientationOptionsV2
            ?? EarthOrientationOptionsV2(
                polarMotion: .assumedZero
            )
    }

    private var refractionConfiguration:
        RefractionConfigurationV2
    {
        appliedAtmosphericRefraction.map {
            .atmosphere($0.atmosphere)
        }
            ?? .disabled
    }

    private func relativeTimeText(_ minutes: Int) -> String {
        guard minutes != 0 else { return "現在" }
        let sign = minutes < 0 ? "−" : "＋"
        let magnitude = abs(minutes)
        let hours = magnitude / 60
        let remainingMinutes = magnitude % 60
        if hours == 0 {
            return "\(sign)\(remainingMinutes)分"
        }
        if remainingMinutes == 0 {
            return "\(sign)\(hours)時間"
        }
        return "\(sign)\(hours)時間\(remainingMinutes)分"
    }

    private var currentTAIMinusUTCAssumption:
        TAIMinusUTCAssumptionV2?
    {
        currentTimeScales.flatMap {
            Astronomy.taiMinusUTCAssumptionV2(from: $0)
        }
    }

    private var pointingEarthOrientationIdentifier: String {
        guard let estimate = currentEarthOrientationEstimate else {
            return "未適用（DUT1=0 s、xp=yp=0の明示近似）"
        }

        let dut1Kind =
            estimate.dut1.source == .observed
            ? "observed"
            : "predicted"
        let polarMotionKind =
            estimate.polarMotion.source == .observed
            ? "observed"
            : "predicted"

        guard let source = iersEarthOrientationSourceSummary else {
            return "IERS EOP（source IDなし、DUT1="
                + dut1Kind
                + "、xp/yp="
                + polarMotionKind
                + "）"
        }

        return source.title
            + "; retrievedAt="
            + source.retrievedAt
            + "; sha256="
            + source.sourceSha256
            + "; DUT1="
            + dut1Kind
            + "; xp/yp="
            + polarMotionKind
    }

    var pointingRefractionDescription: String {
        guard let appliedAtmosphericRefraction else {
            return "なし（観測座標は真空幾何座標と同値）"
        }
        let source =
            appliedAtmosphericRefraction.inputSource
                == .standard
            ? "標準大気モデル"
            : "手動入力の大気モデル"
        let atmosphere =
            appliedAtmosphericRefraction
                .atmosphere
        return source
            + "（気圧 "
            + compactValue(
                atmosphere.pressureHPA,
                maximumFractionDigits: 2
            )
            + " hPa・気温 "
            + compactValue(
                atmosphere.temperatureCelsius,
                maximumFractionDigits: 2
            )
            + "°C・相対湿度 "
            + compactValue(
                atmosphere.relativeHumidity * 100,
                maximumFractionDigits: 1
            )
            + "%・観測波長 "
            + compactValue(
                atmosphere.wavelengthMicrometers,
                maximumFractionDigits: 3
            )
            + " µm・真空幾何高度 "
            + compactDegrees(
                atmosphere
                    .minimumGeometricAltitudeDegrees
            )
            + "以上で適用）"
    }

    var atmosphericRefractionInputSource:
        AtmosphericRefractionInputSource?
    {
        appliedAtmosphericRefraction?.inputSource
    }

    var appliedAtmosphere: AtmosphereV2? {
        appliedAtmosphericRefraction?.atmosphere
    }

    var manualAtmosphereForEditor: AtmosphereV2 {
        if appliedAtmosphericRefraction?.inputSource
            == .manual
        {
            return appliedAtmosphericRefraction?
                .atmosphere
                ?? lastManualAtmosphere
        }
        return lastManualAtmosphere
    }

    var atmosphericRefractionSummary: String {
        guard let appliedAtmosphericRefraction else {
            return "OFF · 真空中の幾何高度"
        }
        let source =
            appliedAtmosphericRefraction.inputSource
                == .standard
            ? "標準大気"
            : "手動入力"
        return source
            + " · "
            + compactDegrees(
                appliedAtmosphericRefraction
                    .atmosphere
                    .minimumGeometricAltitudeDegrees
            )
            + "以上"
    }

    private func commitAtmosphericRefraction(
        _ configuration: AppliedAtmosphericRefraction?,
        status: String
    ) {
        if !isClearingDisplayPreferences {
            UserDefaults.standard.set(
                configuration != nil,
                forKey: PreferenceKey.standardRefraction
            )
        }
        guard
            appliedAtmosphericRefraction
                != configuration
        else {
            statusMessage = status
            return
        }

        pausePlayback()
        appliedAtmosphericRefraction =
            configuration
        recomputeSky()
        statusMessage = status
    }

    private func compactDegrees(_ degrees: Double) -> String {
        compactValue(
            degrees,
            maximumFractionDigits: 2
        ) + "°"
    }

    private func compactValue(
        _ value: Double,
        maximumFractionDigits: Int
    ) -> String {
        value.formatted(
            .number.precision(
                .fractionLength(
                    0...maximumFractionDigits
                )
            )
        )
    }

    private func compactSeconds(_ seconds: Double) -> String {
        guard seconds.isFinite else { return "—" }
        if seconds.rounded() == seconds {
            return String(Int(seconds))
        }
        return seconds.formatted(
            .number.precision(.fractionLength(0...3))
        )
    }

    private func applyPlaybackAction(_ action: PlaybackAction) {
        let current = PlaybackState(
            date: observationDate,
            isPlaying: isPlaybackPlaying,
            direction: playbackDirection,
            speed: playbackSpeed,
            motionMode: playbackMotionMode
        )
        let reduction = playbackClock.reduce(current, action: action)

        isPlaybackPlaying = reduction.state.isPlaying
        playbackDirection = reduction.state.direction
        playbackSpeed = reduction.state.speed
        playbackMotionMode = reduction.state.motionMode

        if reduction.state.date != observationDate {
            isApplyingPlaybackDate = true
            observationDate = reduction.state.date
            isApplyingPlaybackDate = false
        }

        switch reduction.event {
        case .reachedBoundary(.minimum):
            statusMessage = TimeBoundaryStatus.playbackMinimum
        case .reachedBoundary(.maximum):
            statusMessage = TimeBoundaryStatus.playbackMaximum
        case .blockedByStaticMode:
            statusMessage = "動きを減らす設定が有効なため、時間再生は利用できません。"
        case nil:
            if !current.isPlaying,
               reduction.state.isPlaying
            {
                clearStaleTimeBoundaryStatus()
            }
        }
        synchronizePlaybackDriver()
    }

    private func clearStaleTimeBoundaryStatus() {
        guard let statusMessage,
              TimeBoundaryStatus.messages.contains(statusMessage)
        else {
            return
        }
        self.statusMessage = nil
    }

    private func synchronizePlaybackDriver() {
        if isPlaybackPlaying {
            guard playbackTask == nil else { return }
            playbackTask = Task { @MainActor [weak self] in
                let clock = ContinuousClock()
                var previous = clock.now

                while !Task.isCancelled {
                    do {
                        try await clock.sleep(for: .milliseconds(33))
                    } catch {
                        break
                    }
                    guard !Task.isCancelled, let self else { break }
                    let current = clock.now
                    let duration = previous.duration(to: current)
                    previous = current
                    let components = duration.components
                    let delta =
                        Double(components.seconds)
                        + Double(components.attoseconds) / 1e18
                    self.advancePlayback(realTimeDelta: delta)
                }
            }
        } else {
            stopPlaybackDriver()
        }
    }

    private func stopPlaybackDriver() {
        playbackTask?.cancel()
        playbackTask = nil
    }
}
