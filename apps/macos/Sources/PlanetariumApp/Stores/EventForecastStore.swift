import Foundation
import Observation
import PlanetariumCore

enum EventForecastPhase: Equatable {
    case idle
    case loading
    case loaded
    case empty
    case failed(String)
}

struct EventSkyContext: Equatable, Sendable {
    let eventTitle: String
    let eventDate: Date
}

struct EventSceneSessionLease:
    Hashable, Sendable
{
    private let id = UUID()
}

enum EventForecastVisibility:
    Hashable, Sendable
{
    case fullyVisible
    case partlyVisible
    case belowHorizon
}

enum EventForecastBoundaryUncertaintyReason:
    Hashable, Sendable
{
    /// The observer may lie just inside or outside the solar-eclipse path.
    case solarOccurrence
    /// A solar eclipse occurs, but the local central-eclipse classification
    /// and internal contacts cannot be resolved with the available limb model.
    case solarCentralClassification
    /// The target may pass just inside or outside the mean lunar limb.
    case occultationOccurrence

    var occurrenceIsUncertain: Bool {
        switch self {
        case .solarOccurrence, .occultationOccurrence:
            true
        case .solarCentralClassification:
            false
        }
    }
}

enum EventForecastKindFilter:
    String, CaseIterable, Hashable, Identifiable, Sendable
{
    case all
    case solarEclipse
    case lunarEclipse
    case lunarOccultation

    var id: Self {
        self
    }

    var title: String {
        switch self {
        case .all:
            "すべて"
        case .solarEclipse:
            "日食"
        case .lunarEclipse:
            "月食"
        case .lunarOccultation:
            "恒星掩蔽"
        }
    }

    func includes(_ item: EventForecastItem) -> Bool {
        switch self {
        case .all:
            true
        case .solarEclipse:
            item.candidate.kind == .solarEclipse
        case .lunarEclipse:
            item.candidate.kind == .lunarEclipse
        case .lunarOccultation:
            item.candidate.kind == .lunarOccultation
        }
    }
}

enum EventForecastItem:
    Hashable, Sendable, Identifiable
{
    case eclipse(LocalEclipseCircumstancesV1)
    case occultation(
        LocalLunarOccultationCircumstancesV1
    )

    var id: String {
        candidate.id
    }

    var candidate: EclipseCandidateV1 {
        switch self {
        case let .eclipse(forecast):
            forecast.candidate
        case let .occultation(forecast):
            forecast.candidate
        }
    }

    private var sourceTitle: String {
        switch self {
        case let .eclipse(forecast):
            forecast.title
        case let .occultation(forecast):
            forecast.title
        }
    }

    var title: String {
        switch boundaryUncertaintyReason {
        case .solarOccurrence:
            "日食候補（発生未確定）"
        case .occultationOccurrence:
            switch self {
            case .eclipse:
                sourceTitle
            case let .occultation(forecast):
                "月による\(forecast.target.label)の掩蔽候補（発生未確定）"
            }
        case .solarCentralClassification, nil:
            sourceTitle
        }
    }

    var maximumDate: Date {
        switch self {
        case let .eclipse(forecast):
            forecast.maximum.instantUTC
        case let .occultation(forecast):
            forecast.maximum.instantUTC
        }
    }

    var observer: EclipseObserverContextV1 {
        switch self {
        case let .eclipse(forecast):
            forecast.observer
        case let .occultation(forecast):
            forecast.observer
        }
    }

    var visibility: EventForecastVisibility {
        switch self {
        case let .eclipse(forecast):
            switch forecast.visibility {
            case .fullyVisible:
                return .fullyVisible
            case .partlyVisible:
                return .partlyVisible
            case .belowHorizon:
                return .belowHorizon
            }
        case let .occultation(forecast):
            switch forecast.visibility {
            case .fullyVisible:
                return .fullyVisible
            case .partlyVisible:
                return .partlyVisible
            case .belowHorizon:
                return .belowHorizon
            }
        }
    }

    var boundaryUncertaintyReason:
        EventForecastBoundaryUncertaintyReason?
    {
        switch self {
        case let .eclipse(forecast):
            switch forecast.uncertainBoundary {
            case .external:
                .solarOccurrence
            case .partialCentral:
                .solarCentralClassification
            case nil:
                nil
            }
        case let .occultation(forecast):
            forecast.boundaryUncertain
                ? .occultationOccurrence
                : nil
        }
    }

    var boundaryUncertain: Bool {
        boundaryUncertaintyReason != nil
    }

    var uncertainty: EclipseForecastUncertaintyV1 {
        switch self {
        case let .eclipse(forecast):
            forecast.uncertainty
        case let .occultation(forecast):
            forecast.uncertainty
        }
    }

    var provenance: EclipseProvenanceV1 {
        switch self {
        case let .eclipse(forecast):
            forecast.provenance
        case let .occultation(forecast):
            forecast.provenance
        }
    }

    var warnings: [String] {
        switch self {
        case let .eclipse(forecast):
            forecast.warnings
        case let .occultation(forecast):
            forecast.warnings
        }
    }

    var systemImage: String {
        switch candidate.kind {
        case .solarEclipse:
            "sun.max"
        case .lunarEclipse:
            "moon.stars"
        case .lunarOccultation:
            "moon.circle"
        }
    }

    var isLocallyVisible: Bool {
        visibility != .belowHorizon
    }
}

struct EventForecastDependencies: Sendable {
    typealias Loader = @Sendable (
        _ year: Int,
        _ location: ObservingLocation
    ) async throws -> [EventForecastItem]
    typealias SceneSampler = @Sendable (
        _ item: EventForecastItem,
        _ instantUTC: Date
    ) async throws -> EventSceneSampleV1

    let loadForecasts: Loader
    let sampleScene: SceneSampler

    init(
        loadForecasts:
            @escaping Loader,
        sampleScene:
            @escaping SceneSampler = {
                _, _ in
                throw EventSceneSessionError
                    .samplingUnavailable
            }
    ) {
        self.loadForecasts = loadForecasts
        self.sampleScene = sampleScene
    }

    static func live() -> EventForecastDependencies {
        let engine = EventForecastEngine()
        return EventForecastDependencies(
            loadForecasts: { year, location in
                try await engine.forecasts(
                    year: year,
                    location: location
                )
            },
            sampleScene: { item, instantUTC in
                try await engine.sceneSample(
                    for: item,
                    at: instantUTC
                )
            }
        )
    }
}

@MainActor
@Observable
final class EventForecastStore {
    nonisolated static let supportedYears = 1900...2100
    private static let forecastCacheCapacity = 3
    nonisolated static let sceneSampleCacheCapacity =
        32

    private struct ForecastCacheKey: Hashable {
        let year: Int
        let location: ObservingLocation
    }

    private struct SceneLeaseRequest {
        let item: EventForecastItem
        let initialDate: Date?
        let initialLabel: String?
    }

    private(set) var selectedYear: Int
    private(set) var phase: EventForecastPhase = .idle
    private(set) var forecasts: [EventForecastItem] = []
    private(set) var selectedForecastID: String? {
        didSet {
            if selectedForecastID != oldValue {
                deactivateSceneSession()
            }
        }
    }
    private(set) var showBelowHorizon = false
    private(set) var kindFilter: EventForecastKindFilter = .all
    private(set) var originalObservationDate: Date?
    private(set) var skyContext: EventSkyContext?
    private(set) var sceneSession:
        EventSceneSessionState?
    private(set) var sceneReduceMotionEnabled =
        false

    @ObservationIgnored
    private let dependencies: EventForecastDependencies

    @ObservationIgnored
    private var loadTask: Task<Void, Never>?

    @ObservationIgnored
    private var sceneProjectionTask:
        Task<Void, Never>?

    @ObservationIgnored
    private var sceneSampleTask:
        Task<Void, Never>?

    @ObservationIgnored
    private var sceneScrubTask:
        Task<Void, Never>?

    @ObservationIgnored
    private var scenePlaybackTask:
        Task<Void, Never>?

    @ObservationIgnored
    private var requestGeneration = 0

    @ObservationIgnored
    private var sceneGeneration = 0

    @ObservationIgnored
    private var sceneSampleGeneration = 0

    @ObservationIgnored
    private var activeLocation: ObservingLocation?

    @ObservationIgnored
    private var activeSceneItem:
        EventForecastItem?

    @ObservationIgnored
    private var observationDateForSelection: Date?

    /// True only when the current forecast was chosen from the list by the
    /// user. Automatic upcoming selections may follow a changed sky date,
    /// while an explicit choice survives an otherwise identical feature
    /// round-trip.
    @ObservationIgnored
    private var selectedForecastWasExplicit = false

    @ObservationIgnored
    private var cachedForecasts:
        [ForecastCacheKey: [EventForecastItem]] = [:]

    @ObservationIgnored
    private var forecastCacheRecency: [ForecastCacheKey] = []

    @ObservationIgnored
    private var sceneSampleCache =
        EventSceneSampleCache(
            capacity:
                EventForecastStore
                .sceneSampleCacheCapacity
        )

    @ObservationIgnored
    private var sceneLeaseRequests:
        [EventSceneSessionLease: SceneLeaseRequest] = [:]

    @ObservationIgnored
    private var sceneLeaseRecency:
        [EventSceneSessionLease] = []

    init(
        initialYear: Int = EventForecastStore.utcYear(Date()),
        dependencies: EventForecastDependencies = .live()
    ) {
        selectedYear = Self.clampedYear(initialYear)
        self.dependencies = dependencies
    }

    var selectedForecast: EventForecastItem? {
        guard let selectedForecastID else {
            return nil
        }
        return displayedForecasts.first {
            $0.id == selectedForecastID
        }
    }

    var displayedForecasts: [EventForecastItem] {
        forecastsMatchingKind.filter {
            showBelowHorizon || $0.isLocallyVisible
        }
    }

    var forecastsMatchingKind: [EventForecastItem] {
        forecasts.filter {
            kindFilter.includes($0)
        }
    }

    var hiddenForecastCount: Int {
        forecastsMatchingKind.count {
            !$0.isLocallyVisible
        }
    }

    var canSelectPreviousYear: Bool {
        selectedYear > Self.supportedYears.lowerBound
    }

    var canSelectNextYear: Bool {
        selectedYear < Self.supportedYears.upperBound
    }

    var canRestoreObservationDate: Bool {
        originalObservationDate != nil
    }

    var canPlayScene: Bool {
        guard
            let session = sceneSession,
            session.plan.isInteractive,
            session.phase == .ready,
            session.displayedSample != nil,
            !sceneReduceMotionEnabled
        else {
            return false
        }
        return true
    }

    var sceneSampleCacheCount: Int {
        sceneSampleCache.count
    }

    func sceneSession(
        matching item: EventForecastItem
    ) -> EventSceneSessionState? {
        guard
            activeSceneItem == item,
            sceneSession?.itemID == item.id
        else {
            return nil
        }
        return sceneSession
    }

    func activate(
        location: ObservingLocation,
        observationDate: Date
    ) {
        observationDateForSelection = observationDate
        if phase == .idle {
            selectedYear = Self.clampedYear(
                Self.observationYear(
                    observationDate,
                    timeZoneIdentifier:
                        location.timeZoneIdentifier
                )
            )
        }

        if activeLocation == location {
            switch phase {
            case .loaded, .empty:
                if selectedForecastWasExplicit,
                   selectedForecast != nil
                {
                    return
                }
                selectedForecastWasExplicit = false
                selectedForecastID = nil
                selectFallbackIfNeeded()
                return
            case .idle, .loading, .failed:
                break
            }
        }

        reload(location: location)
    }

    func deactivate() {
        cancelLoad()
        deactivateSceneSession()
        if phase == .loading {
            phase = .idle
        }
    }

    func reload(location: ObservingLocation) {
        selectedForecastWasExplicit = false
        activeLocation = location
        cancelLoad()
        requestGeneration += 1
        let generation = requestGeneration
        let year = selectedYear
        let loader = dependencies.loadForecasts
        let cacheKey = ForecastCacheKey(
            year: year,
            location: location
        )

        if let cached = cachedForecasts[cacheKey] {
            touchCachedForecasts(for: cacheKey)
            forecasts = cached
            selectedForecastID = nil
            selectFallbackIfNeeded()
            phase = cached.isEmpty
                ? .empty
                : .loaded
            return
        }

        phase = .loading
        forecasts = []
        selectedForecastID = nil

        loadTask = Task { [weak self] in
            do {
                let loaded = try await loader(year, location)
                    .sorted {
                        $0.maximumDate
                            < $1.maximumDate
                    }
                try Task.checkCancellation()
                guard let self,
                      self.requestGeneration == generation,
                      self.selectedYear == year,
                      self.activeLocation == location
                else {
                    return
                }

                self.storeCachedForecasts(
                    loaded,
                    for: cacheKey
                )
                self.forecasts = loaded
                self.selectFallbackIfNeeded()
                self.phase = loaded.isEmpty
                    ? .empty
                    : .loaded
                self.loadTask = nil
            } catch is CancellationError {
                guard !Task.isCancelled,
                      let self,
                      self.requestGeneration == generation,
                      self.selectedYear == year,
                      self.activeLocation == location
                else {
                    return
                }
                self.forecasts = []
                self.selectedForecastID = nil
                self.phase = .failed(
                    "予報の計算が中断されました。再試行してください。"
                )
                self.loadTask = nil
            } catch {
                guard let self,
                      self.requestGeneration == generation,
                      self.selectedYear == year,
                      self.activeLocation == location
                else {
                    return
                }
                self.forecasts = []
                self.selectedForecastID = nil
                self.phase = .failed(
                    error.localizedDescription
                )
                self.loadTask = nil
            }
        }
    }

    func retry() {
        guard let activeLocation else {
            return
        }
        reload(location: activeLocation)
    }

    func setShowBelowHorizon(_ show: Bool) {
        guard showBelowHorizon != show else {
            return
        }
        showBelowHorizon = show
        selectFallbackIfNeeded()
    }

    func setKindFilter(_ filter: EventForecastKindFilter) {
        guard kindFilter != filter else {
            return
        }
        kindFilter = filter
        selectFallbackIfNeeded()
    }

    func selectForecast(_ id: String?) {
        guard let id else {
            selectedForecastWasExplicit = false
            selectedForecastID = nil
            return
        }
        guard displayedForecasts.contains(
            where: { $0.id == id }
        ) else {
            selectFallbackIfNeeded()
            return
        }
        selectedForecastID = id
        selectedForecastWasExplicit = true
    }

    func selectPreviousYear(location: ObservingLocation) {
        guard canSelectPreviousYear else {
            return
        }
        selectYear(selectedYear - 1, location: location)
    }

    func selectNextYear(location: ObservingLocation) {
        guard canSelectNextYear else {
            return
        }
        selectYear(selectedYear + 1, location: location)
    }

    func selectObservationYear(
        observationDate: Date,
        location: ObservingLocation
    ) {
        observationDateForSelection = observationDate
        let observationYear = Self.observationYear(
            observationDate,
            timeZoneIdentifier:
                location.timeZoneIdentifier
        )
        let clampedObservationYear =
            Self.clampedYear(observationYear)

        if selectedYear == clampedObservationYear,
           activeLocation == location
        {
            if case .failed = phase {
                // Selecting the current year after a failure retries below.
            } else {
                selectedForecastID = nil
                selectFallbackIfNeeded()
                return
            }
        }

        selectYear(
            clampedObservationYear,
            location: location
        )
    }

    func selectYear(
        _ year: Int,
        location: ObservingLocation
    ) {
        let clamped = Self.clampedYear(year)
        if selectedYear == clamped,
           activeLocation == location
        {
            if case .failed = phase {
                // Selecting the current year after a failure retries.
            } else {
                return
            }
        }
        selectedYear = clamped
        reload(location: location)
    }

    func showOnSky(
        at date: Date,
        skyStore: SkyStore
    ) {
        if originalObservationDate == nil {
            originalObservationDate =
                skyStore.observationDate
        }
        skyContext = EventSkyContext(
            eventTitle:
                selectedForecast?.title
                ?? "天文現象",
            eventDate: date
        )
        skyStore.pausePlayback()
        skyStore.observationDate = date
        skyStore.statusMessage =
            "現象の時刻を空に表示しました。予報を選ぶだけでは日時は変わりません。"
    }

    func restoreSkyDate(skyStore: SkyStore) {
        guard let originalObservationDate else {
            return
        }
        skyStore.pausePlayback()
        skyStore.observationDate =
            originalObservationDate
        skyStore.statusMessage =
            "現象表示前の観測日時へ戻しました。"
        self.originalObservationDate = nil
        skyContext = nil
    }

    func clearRestorableDate() {
        originalObservationDate = nil
        skyContext = nil
    }

    func activateSceneSession(
        for item: EventForecastItem,
        initialDate: Date? = nil,
        initialLabel: String? = nil
    ) {
        if sceneSession?.itemID == item.id,
           activeSceneItem == item
        {
            return
        }
        resetSceneSession()

        guard let plan =
            EventSceneSessionPlan(item: item)
        else {
            return
        }
        let requestedDate = plan.clamped(
            initialDate ?? item.maximumDate
        )
        let requestedLabel =
            initialLabel ?? "指定時刻"
        activeSceneItem = item

        if !plan.isInteractive {
            sceneSession =
                EventSceneSessionState(
                    itemID: item.id,
                    plan: plan,
                    phase: .staticOnly,
                    requestedDate:
                        requestedDate,
                    requestedLabel:
                        requestedLabel,
                    displayedSample: nil,
                    displayedLabel: nil,
                    angularExtent: nil,
                    isPlaying: false,
                    hasPlaybackPosition:
                        false
                )
            return
        }

        sceneSession =
            EventSceneSessionState(
                itemID: item.id,
                plan: plan,
                phase: .preparing,
                requestedDate: requestedDate,
                requestedLabel: requestedLabel,
                displayedSample: nil,
                displayedLabel: nil,
                angularExtent: nil,
                isPlaying: false,
                hasPlaybackPosition: false
            )
        sceneGeneration += 1
        let generation = sceneGeneration
        let sampler = dependencies.sampleScene
        let dates = Array(
            Set(
                plan.projectionDates
                    + [requestedDate]
            )
        ).sorted()

        sceneProjectionTask =
            Task { @MainActor [weak self] in
                do {
                    var projectionSamples:
                        [Date: EventSceneSampleV1] = [:]
                    var phaseBodies:
                        [[AngularSceneBody]] = []
                    phaseBodies.reserveCapacity(
                        dates.count
                    )

                    for date in dates {
                        try Task.checkCancellation()
                        let sample =
                            try await sampler(
                                item,
                                date
                            )
                        try Self.validateSceneSample(
                            sample,
                            requestedDate: date,
                            item: item
                        )
                        guard let bodies =
                            EventSceneAngularBodies
                            .bodies(for: sample)
                        else {
                            throw EventSceneSessionError
                                .invalidProjection
                        }
                        projectionSamples[date] =
                            sample
                        phaseBodies.append(bodies)
                    }

                    guard
                        let extent =
                            AngularSceneExtent(
                                phaseBodies:
                                    phaseBodies
                            )?.padded(
                                fraction:
                                    EventSceneSessionPlan
                                    .projectionPaddingFraction
                            ),
                        let initialSample =
                            projectionSamples[
                                requestedDate
                            ],
                        let self,
                        self.sceneGeneration
                            == generation,
                        self.activeSceneItem
                            == item,
                        self.sceneSession?
                            .itemID == item.id
                    else {
                        return
                    }

                    self.sceneSampleCache
                        .removeAll()
                    for date in dates {
                        if let sample =
                            projectionSamples[date]
                        {
                            self.sceneSampleCache
                                .insert(
                                    sample,
                                    for: date
                                )
                        }
                    }
                    self.sceneSampleCache.insert(
                        initialSample,
                        for: requestedDate
                    )

                    guard var session =
                        self.sceneSession
                    else {
                        return
                    }
                    let desiredDate =
                        session.requestedDate
                    let desiredLabel =
                        session.requestedLabel
                    let desiredSample =
                        projectionSamples[
                            desiredDate
                        ]
                    session.phase = .ready
                    session.displayedSample =
                        desiredSample
                        ?? initialSample
                    session.displayedLabel =
                        desiredSample == nil
                        ? requestedLabel
                        : desiredLabel
                    session.angularExtent = extent
                    self.sceneSession = session
                    self.sceneProjectionTask = nil
                    if desiredSample == nil,
                       desiredDate != requestedDate
                    {
                        self.requestSceneSample(
                            at: desiredDate,
                            label: desiredLabel,
                            stopsPlayback: false
                        )
                    }
                } catch {
                    guard
                        let self,
                        self.sceneGeneration
                            == generation,
                        self.activeSceneItem
                            == item,
                        self.sceneSession?
                            .itemID == item.id
                    else {
                        return
                    }
                    guard var session =
                        self.sceneSession
                    else {
                        return
                    }
                    session.phase = .failed(
                        error.localizedDescription
                    )
                    session.isPlaying = false
                    self.sceneSession = session
                    self.sceneProjectionTask = nil
                }
            }
    }

    func acquireSceneSession(
        for item: EventForecastItem,
        lease: EventSceneSessionLease,
        initialDate: Date? = nil,
        initialLabel: String? = nil
    ) {
        sceneLeaseRequests[lease] =
            SceneLeaseRequest(
                item: item,
                initialDate: initialDate,
                initialLabel: initialLabel
            )
        sceneLeaseRecency.removeAll {
            $0 == lease
        }
        sceneLeaseRecency.append(lease)
        activateSceneSession(
            for: item,
            initialDate: initialDate,
            initialLabel: initialLabel
        )
    }

    func releaseSceneSession(
        lease: EventSceneSessionLease
    ) {
        guard
            sceneLeaseRequests
                .removeValue(forKey: lease)
                != nil
        else {
            return
        }
        sceneLeaseRecency.removeAll {
            $0 == lease
        }

        guard !sceneLeaseRequests.isEmpty
        else {
            resetSceneSession()
            return
        }
        if let activeSceneItem,
           sceneLeaseRequests.values
            .contains(where: {
                $0.item == activeSceneItem
            })
        {
            return
        }
        guard
            let survivingLease =
                sceneLeaseRecency.last,
            let request =
                sceneLeaseRequests[
                    survivingLease
                ]
        else {
            resetSceneSession()
            return
        }
        activateSceneSession(
            for: request.item,
            initialDate: request.initialDate,
            initialLabel: request.initialLabel
        )
    }

    func retrySceneSession(
        for item: EventForecastItem
    ) {
        let requestedDate =
            sceneSession?.requestedDate
        let requestedLabel =
            sceneSession?.requestedLabel
        resetSceneSession()
        activateSceneSession(
            for: item,
            initialDate: requestedDate,
            initialLabel: requestedLabel
        )
    }

    func requestSceneSample(
        at date: Date,
        label: String = "指定時刻",
        stopsPlayback: Bool = true
    ) {
        sceneScrubTask?.cancel()
        sceneScrubTask = nil
        guard
            var session = sceneSession,
            session.plan.isInteractive,
            let item = activeSceneItem,
            item.id == session.itemID
        else {
            return
        }
        if stopsPlayback {
            pauseScenePlayback()
            guard let refreshed =
                sceneSession
            else {
                return
            }
            session = refreshed
            session.hasPlaybackPosition =
                true
        }

        let requestedDate =
            session.plan.clamped(date)
        sceneSampleTask?.cancel()
        sceneSampleTask = nil
        sceneSampleGeneration += 1
        let generation =
            sceneSampleGeneration

        session.requestedDate =
            requestedDate
        session.requestedLabel = label
        if session.angularExtent == nil {
            sceneSession = session
            return
        }

        if let cached =
            sceneSampleCache.value(
                for: requestedDate
            )
        {
            session.phase = .ready
            session.displayedSample = cached
            session.displayedLabel = label
            sceneSession = session
            return
        }

        session.phase = .sampling
        sceneSession = session
        let sampler = dependencies.sampleScene
        sceneSampleTask =
            Task { @MainActor [weak self] in
                do {
                    let sample =
                        try await sampler(
                            item,
                            requestedDate
                        )
                    guard
                        let self,
                        self.sceneSampleGeneration
                            == generation,
                        var current =
                            self.sceneSession,
                        current.itemID == item.id,
                        current.requestedDate
                            == requestedDate
                    else {
                        return
                    }
                    try Self.validateSceneSample(
                        sample,
                        requestedDate:
                            requestedDate,
                        item: item,
                        angularExtent:
                            current
                            .angularExtent
                    )
                    self.sceneSampleCache.insert(
                        sample,
                        for: requestedDate
                    )
                    current.phase = .ready
                    current.displayedSample =
                        sample
                    current.displayedLabel = label
                    self.sceneSession = current
                    self.sceneSampleTask = nil
                } catch {
                    guard
                        let self,
                        self.sceneSampleGeneration
                            == generation,
                        var current =
                            self.sceneSession,
                        current.itemID == item.id,
                        current.requestedDate
                            == requestedDate
                    else {
                        return
                    }
                    current.phase = .failed(
                        error.localizedDescription
                    )
                    current.isPlaying = false
                    self.sceneSession = current
                    self.scenePlaybackTask?
                        .cancel()
                    self.scenePlaybackTask = nil
                    self.sceneSampleTask = nil
                }
            }
    }

    func requestCoalescedSceneSample(
        at date: Date,
        label: String = "指定時刻"
    ) {
        sceneScrubTask?.cancel()
        sceneScrubTask = nil
        pauseScenePlayback()
        guard
            var session = sceneSession,
            session.plan.isInteractive,
            let item = activeSceneItem,
            item.id == session.itemID
        else {
            return
        }
        let requestedDate =
            session.plan.clamped(date)
        session.requestedDate =
            requestedDate
        session.requestedLabel = label
        session.hasPlaybackPosition = true
        if session.angularExtent != nil {
            session.phase = .sampling
        }
        sceneSession = session

        sceneScrubTask =
            Task { @MainActor [weak self] in
                do {
                    try await Task.sleep(
                        for: .milliseconds(100)
                    )
                } catch {
                    return
                }
                guard
                    let self,
                    self.activeSceneItem == item,
                    self.sceneSession?
                        .requestedDate
                        == requestedDate
                else {
                    return
                }
                self.sceneScrubTask = nil
                self.requestSceneSample(
                    at: requestedDate,
                    label: label,
                    stopsPlayback: false
                )
            }
    }

    func playScene() {
        guard canPlayScene,
              var session = sceneSession
        else {
            return
        }
        if !session.hasPlaybackPosition
            || session.requestedDate
                >= session.plan.upperBound
        {
            requestSceneSample(
                at: session.plan.lowerBound,
                label: "指定時刻",
                stopsPlayback: false
            )
            guard let refreshed =
                sceneSession
            else {
                return
            }
            session = refreshed
        }
        session.isPlaying = true
        session.hasPlaybackPosition = true
        sceneSession = session
        scenePlaybackTask?.cancel()
        scenePlaybackTask =
            Task { @MainActor [weak self] in
                while !Task.isCancelled {
                    do {
                        try await Task.sleep(
                            for: .seconds(
                                session.plan
                                    .playbackFrameIntervalSeconds
                            )
                        )
                    } catch {
                        return
                    }
                    guard let self else {
                        return
                    }
                    self.advanceScenePlaybackFrame()
                }
            }
    }

    func pauseScenePlayback() {
        scenePlaybackTask?.cancel()
        scenePlaybackTask = nil
        guard var session = sceneSession,
              session.isPlaying
        else {
            return
        }
        sceneSampleGeneration += 1
        sceneSampleTask?.cancel()
        sceneSampleTask = nil
        if let displayed =
            session.displayedSample
        {
            session.requestedDate =
                displayed.instantUTC
            session.requestedLabel =
                session.displayedLabel
                ?? "指定時刻"
            session.phase = .ready
        }
        session.isPlaying = false
        sceneSession = session
    }

    func setSceneReduceMotion(
        _ reduceMotion: Bool
    ) {
        guard
            sceneReduceMotionEnabled
                != reduceMotion
        else {
            return
        }
        sceneReduceMotionEnabled =
            reduceMotion
        if reduceMotion {
            pauseScenePlayback()
        }
    }

    func deactivateSceneSession() {
        sceneLeaseRequests.removeAll()
        sceneLeaseRecency.removeAll()
        resetSceneSession()
    }

    private func resetSceneSession() {
        sceneGeneration += 1
        sceneSampleGeneration += 1
        sceneProjectionTask?.cancel()
        sceneProjectionTask = nil
        sceneSampleTask?.cancel()
        sceneSampleTask = nil
        sceneScrubTask?.cancel()
        sceneScrubTask = nil
        scenePlaybackTask?.cancel()
        scenePlaybackTask = nil
        sceneSampleCache.removeAll()
        activeSceneItem = nil
        sceneSession = nil
    }

    func stopScenePlaybackForBackground() {
        pauseScenePlayback()
    }

    private func cancelLoad() {
        loadTask?.cancel()
        loadTask = nil
    }

    private func advanceScenePlaybackFrame() {
        guard
            let session = sceneSession,
            session.isPlaying,
            session.phase == .ready,
            let displayed =
                session.displayedSample
        else {
            return
        }
        let next = min(
            session.plan.upperBound,
            displayed.instantUTC
                .addingTimeInterval(
                    session.plan
                        .playbackFrameStepSeconds
                )
        )
        guard next > displayed.instantUTC else {
            pauseScenePlayback()
            return
        }
        requestSceneSample(
            at: next,
            label: "指定時刻",
            stopsPlayback: false
        )
    }

    private static func validateSceneSample(
        _ sample: EventSceneSampleV1,
        requestedDate: Date,
        item: EventForecastItem,
        angularExtent:
            AngularSceneExtent? = nil
    ) throws {
        guard sample.instantUTC == requestedDate
        else {
            throw EventSceneSessionError
                .sampleInstantMismatch
        }
        let expectedKind:
            EventSceneSampleKindV1
        switch item.candidate.kind {
        case .solarEclipse:
            expectedKind = .solarEclipse
        case .lunarEclipse:
            expectedKind = .lunarEclipse
        case .lunarOccultation:
            expectedKind = .lunarOccultation
        }
        guard sample.kind == expectedKind else {
            throw EventSceneSessionError
                .invalidProjection
        }
        switch expectedKind {
        case .solarEclipse:
            guard
                sample.sun != nil,
                sample.lunarShadow == nil,
                sample.targetStar == nil
            else {
                throw EventSceneSessionError
                    .invalidProjection
            }
        case .lunarEclipse:
            guard
                sample.sun != nil,
                sample.lunarShadow != nil,
                sample.targetStar == nil
            else {
                throw EventSceneSessionError
                    .invalidProjection
            }
        case .lunarOccultation:
            guard
                let expectedStarHR =
                    item.candidate.targetStarHR,
                sample.sun == nil,
                sample.lunarShadow == nil,
                sample.targetStar?
                    .starHR
                    == expectedStarHR
            else {
                throw EventSceneSessionError
                    .invalidProjection
            }
        }
        if let angularExtent {
            guard
                let bodies =
                    EventSceneAngularBodies
                    .bodies(for: sample),
                bodies.allSatisfy(
                    angularExtent.contains
                )
            else {
                throw EventSceneSessionError
                    .invalidProjection
            }
        }
    }

    private func selectFallbackIfNeeded() {
        let displayed = displayedForecasts
        if let selectedForecastID,
           displayed.contains(
               where: {
                   $0.id == selectedForecastID
               }
           )
        {
            return
        }

        selectedForecastWasExplicit = false

        guard !displayed.isEmpty else {
            selectedForecastID = nil
            return
        }

        if let observationDateForSelection,
           let activeLocation,
           selectedYear == Self.clampedYear(
               Self.observationYear(
                   observationDateForSelection,
                   timeZoneIdentifier:
                       activeLocation.timeZoneIdentifier
               )
           )
        {
            selectedForecastID =
                displayed.first {
                    $0.maximumDate
                        >= observationDateForSelection
                }?.id
                ?? displayed.last?.id
            return
        }

        selectedForecastID =
            displayed.first?.id
    }

    private func storeCachedForecasts(
        _ forecasts: [EventForecastItem],
        for key: ForecastCacheKey
    ) {
        cachedForecasts[key] = forecasts
        touchCachedForecasts(for: key)
        while forecastCacheRecency.count
            > Self.forecastCacheCapacity
        {
            let evicted = forecastCacheRecency.removeFirst()
            cachedForecasts.removeValue(forKey: evicted)
        }
    }

    private func touchCachedForecasts(
        for key: ForecastCacheKey
    ) {
        forecastCacheRecency.removeAll {
            $0 == key
        }
        forecastCacheRecency.append(key)
    }

    nonisolated private static func clampedYear(
        _ year: Int
    ) -> Int {
        min(
            supportedYears.upperBound,
            max(supportedYears.lowerBound, year)
        )
    }

    nonisolated private static func utcYear(
        _ date: Date
    ) -> Int {
        observationYear(
            date,
            timeZoneIdentifier: "UTC"
        )
    }

    nonisolated private static func observationYear(
        _ date: Date,
        timeZoneIdentifier: String
    ) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone =
            TimeZone(identifier: timeZoneIdentifier)
            ?? TimeZone(secondsFromGMT: 0)!
        return calendar.component(.year, from: date)
    }
}

private struct EventForecastResources: Sendable {
    let candidateCatalog: EclipseCandidateCatalogV1
    let skyCatalog: SkyCatalog
    let ephemeris: DE442SEphemerisProviderV1
    let earthOrientation:
        IERSEarthOrientationServiceV1
}

/**
 Shares one in-flight resource load between concurrent callers and retains the
 successful value. Cancelling a waiter never cancels the shared load, so a
 rapid year change during cold start can reuse the work already in progress.
 Failed shared loads are removed and can be retried.
 */
actor SharedAsyncResource<Value: Sendable> {
    typealias Loader =
        @Sendable () async throws -> Value

    private struct InFlight: Sendable {
        let generation: UInt64
        let task: Task<Value, Error>
    }

    private let loader: Loader
    private var cachedValue: Value?
    private var inFlight: InFlight?
    private var generation: UInt64 = 0

    init(loader: @escaping Loader) {
        self.loader = loader
    }

    func value() async throws -> Value {
        if let cachedValue {
            return cachedValue
        }

        let current: InFlight
        if let inFlight {
            current = inFlight
        } else {
            generation &+= 1
            let next = InFlight(
                generation: generation,
                task: Task {
                    try await loader()
                }
            )
            inFlight = next
            current = next
        }

        do {
            let loaded = try await current.task.value
            if inFlight?.generation == current.generation {
                cachedValue = loaded
                inFlight = nil
            }
            try Task.checkCancellation()
            return loaded
        } catch {
            if inFlight?.generation == current.generation {
                inFlight = nil
            }
            throw error
        }
    }
}

actor EventForecastEngine {
    private let resource = SharedAsyncResource {
        try await Task.detached(
            priority: .userInitiated
        ) {
            EventForecastResources(
                candidateCatalog:
                    try EclipseCandidateCatalogV1
                        .loadBundled(),
                skyCatalog:
                    try PlanetariumData.load(),
                ephemeris:
                    try DE442SEphemerisProviderV1
                        .loadBundled(),
                earthOrientation:
                    try IERSEarthOrientationServiceV1
                        .loadBundled()
            )
        }.value
    }

    func forecasts(
        year: Int,
        location: ObservingLocation
    ) async throws -> [EventForecastItem] {
        try Task.checkCancellation()
        let resources = try await loadResources()
        let interval =
            try Self.utcCandidateInterval(for: year)
        let candidates = try await resources
            .candidateCatalog
            .candidates(
                from: interval.start,
                through: interval.end
            )
        var forecasts:
            [EventForecastItem] = []
        forecasts.reserveCapacity(candidates.count)

        for candidate in candidates {
            try Task.checkCancellation()
            let options = try Self.options(
                for: candidate,
                location: location,
                service:
                    resources.earthOrientation
            )
            switch candidate.kind {
            case .solarEclipse:
                if let forecast =
                    try await LocalSolarEclipseV1
                    .calculate(
                        provider: resources.ephemeris,
                        candidate: candidate,
                        location: location,
                        options: options
                    )
                {
                    guard Self.isInLocalYear(
                        forecast.maximum.instantUTC,
                        year: year,
                        timeZoneIdentifier:
                            location.timeZoneIdentifier
                    ) else {
                        continue
                    }
                    forecasts.append(
                        .eclipse(forecast)
                    )
                }
            case .lunarEclipse:
                if let forecast =
                    try await LocalLunarEclipseV1
                    .calculate(
                        provider: resources.ephemeris,
                        candidate: candidate,
                        location: location,
                        options: options
                    )
                {
                    guard Self.isInLocalYear(
                        forecast.maximum.instantUTC,
                        year: year,
                        timeZoneIdentifier:
                            location.timeZoneIdentifier
                    ) else {
                        continue
                    }
                    forecasts.append(
                        .eclipse(forecast)
                    )
                }
            case .lunarOccultation:
                if let forecast =
                    try await LocalLunarOccultationV1
                    .calculate(
                        provider: resources.ephemeris,
                        candidate: candidate,
                        catalog: resources.skyCatalog,
                        location: location,
                        options: options
                    )
                {
                    guard Self.isInLocalYear(
                        forecast.maximum.instantUTC,
                        year: year,
                        timeZoneIdentifier:
                            location.timeZoneIdentifier
                    ) else {
                        continue
                    }
                    forecasts.append(
                        .occultation(forecast)
                    )
                }
            }
        }
        return forecasts
    }

    func sceneSample(
        for item: EventForecastItem,
        at instantUTC: Date
    ) async throws -> EventSceneSampleV1 {
        try Task.checkCancellation()
        let resources = try await loadResources()
        let candidate = item.candidate
        let location = item.observer.location
        let options = try Self.options(
            for: candidate,
            location: location,
            service:
                resources.earthOrientation
        )

        switch candidate.kind {
        case .solarEclipse:
            return try await LocalSolarEclipseV1
                .sampleScene(
                    provider:
                        resources.ephemeris,
                    candidate: candidate,
                    at: instantUTC,
                    location: location,
                    options: options
                )
        case .lunarEclipse:
            return try await LocalLunarEclipseV1
                .sampleScene(
                    provider:
                        resources.ephemeris,
                    candidate: candidate,
                    at: instantUTC,
                    location: location,
                    options: options
                )
        case .lunarOccultation:
            return try await LocalLunarOccultationV1
                .sampleScene(
                    provider:
                        resources.ephemeris,
                    candidate: candidate,
                    catalog:
                        resources.skyCatalog,
                    at: instantUTC,
                    location: location,
                    options: options
                )
        }
    }

    private func loadResources()
        async throws -> EventForecastResources
    {
        try await resource.value()
    }

    private static func utcCandidateInterval(
        for year: Int
    ) throws -> DateInterval {
        guard EventForecastStore.supportedYears
            .contains(year)
        else {
            throw EventForecastStoreError
                .unsupportedYear
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone =
            TimeZone(secondsFromGMT: 0)!
        guard
            let start = calendar.date(
                from: DateComponents(
                    timeZone:
                        TimeZone(secondsFromGMT: 0),
                    year: year,
                    month: 1,
                    day: 1
                )
            ),
            let nextYear = calendar.date(
                byAdding: .year,
                value: 1,
                to: start
            )
        else {
            throw EventForecastStoreError
                .unsupportedYear
        }
        let padding: TimeInterval =
            2 * 24 * 60 * 60
        let supportedStart = try utcStart(of: 1900)
        let supportedEnd =
            try utcStart(of: 2101)
                .addingTimeInterval(-0.001)
        return DateInterval(
            start: max(
                supportedStart,
                start.addingTimeInterval(-padding)
            ),
            end: min(
                supportedEnd,
                nextYear.addingTimeInterval(
                    padding - 0.001
                )
            )
        )
    }

    private static func utcStart(
        of year: Int
    ) throws -> Date {
        var calendar =
            Calendar(identifier: .gregorian)
        calendar.timeZone =
            TimeZone(secondsFromGMT: 0)!
        guard let start = calendar.date(
            from: DateComponents(
                timeZone:
                    TimeZone(secondsFromGMT: 0),
                year: year,
                month: 1,
                day: 1
            )
        ) else {
            throw EventForecastStoreError
                .unsupportedYear
        }
        return start
    }

    private static func isInLocalYear(
        _ date: Date,
        year: Int,
        timeZoneIdentifier: String
    ) -> Bool {
        guard
            let timeZone =
                TimeZone(
                    identifier:
                        timeZoneIdentifier
                )
        else {
            return false
        }
        var calendar =
            Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.component(
            .year,
            from: date
        ) == year
    }

    static func options(
        for candidate: EclipseCandidateV1,
        location: ObservingLocation,
        service: IERSEarthOrientationServiceV1
    ) throws -> LocalEclipseOptionsV1 {
        let eventEarthRotationAt:
            @Sendable (Date) throws
                -> EventEarthRotationContextV1 =
            { date in
                try eventEarthRotationContext(
                    at: date,
                    candidateKind: candidate.kind,
                    service: service
                )
            }
        let earthOrientationAt:
            @Sendable (Date) throws
                -> EarthOrientationOptionsV2 =
            { date in
                try eventEarthRotationAt(date)
                    .earthOrientation
            }
        let source: EventLocationSourceV1
        switch location.id {
        case "current":
            source = .deviceGeolocation
        case "custom":
            source = .manual
        default:
            source = .bundledCity
        }
        return LocalEclipseOptionsV1(
            earthOrientationAt:
                earthOrientationAt,
            eventEarthRotationAt:
                eventEarthRotationAt,
            heightMeters:
                location.heightMeters,
            horizontalAccuracyMeters:
                location
                    .horizontalAccuracyMeters,
            locationSource: source,
            timeScaleContributors: [],
            timeScaleWarnings: []
        )
    }

    private static func eventEarthRotationContext(
        at date: Date,
        candidateKind: EclipseCandidateKindV1,
        service: IERSEarthOrientationServiceV1
    ) throws -> EventEarthRotationContextV1 {
        if let estimate = try service.lookup(at: date) {
            return EventEarthRotationContextV1(
                earthOrientation:
                    estimate.earthOrientationOptionsV2,
                eopID: eopID(estimate),
                eopSourceSHA256:
                    service.source.sourceSha256,
                eopRetrievedAt:
                    service.source.retrievedAt,
                eopDUT1Quality:
                    estimate.dut1.source == .observed
                    ? .observed
                    : .predicted,
                eopPolarMotionQuality:
                    estimate.polarMotion.source
                        == .observed
                    ? .observed
                    : .predicted,
                deltaTModel:
                    "IERS-EOP-and-bundled-leap-second-history",
                uncertainty:
                    .iersReported(
                        EventEarthRotationModelV1
                            .reportedUncertainty(
                                for: estimate
                            )
                    )
            )
        }

        let fallback =
            try EventEarthRotationModelV1
            .fallback(at: date)
        return EventEarthRotationContextV1(
            earthOrientation:
                fallback.earthOrientation,
            eopID: fallback.eopID,
            eopDUT1Quality: .outsideCoverage,
            eopPolarMotionQuality:
                .outsideCoverage,
            deltaTModel: fallback.deltaTModel,
            uncertainty:
                .model(
                    pathKilometers:
                        fallback
                        .pathUncertaintyKilometers
                ),
            timingUncertaintySeconds:
                fallback.deltaTUncertaintySeconds
                + (
                    candidateKind == .lunarEclipse
                    ? 10
                    : 0
                ),
            dominantContributors:
                fallback.dominantContributors,
            warnings: fallback.warnings
        )
    }

    private static func eopID(
        _ estimate: IERSEarthOrientationEstimateV1
    ) -> String {
        switch (
            estimate.dut1.source,
            estimate.polarMotion.source
        ) {
        case (.observed, .observed):
            "IERS EOP観測値"
        case (.predicted, .predicted):
            "IERS EOP予測値"
        default:
            "IERS EOP観測・予測混在"
        }
    }
}

private enum EventForecastStoreError:
    LocalizedError
{
    case unsupportedYear

    var errorDescription: String? {
        "現象予報の対応年は1900〜2100年です。"
    }
}
