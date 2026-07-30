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

    let loadForecasts: Loader

    static func live() -> EventForecastDependencies {
        let engine = EventForecastEngine()
        return EventForecastDependencies { year, location in
            try await engine.forecasts(
                year: year,
                location: location
            )
        }
    }
}

@MainActor
@Observable
final class EventForecastStore {
    nonisolated static let supportedYears = 1900...2100
    private static let forecastCacheCapacity = 3

    private struct ForecastCacheKey: Hashable {
        let year: Int
        let location: ObservingLocation
    }

    private(set) var selectedYear: Int
    private(set) var phase: EventForecastPhase = .idle
    private(set) var forecasts: [EventForecastItem] = []
    private(set) var selectedForecastID: String?
    private(set) var showBelowHorizon = false
    private(set) var kindFilter: EventForecastKindFilter = .all
    private(set) var originalObservationDate: Date?

    @ObservationIgnored
    private let dependencies: EventForecastDependencies

    @ObservationIgnored
    private var loadTask: Task<Void, Never>?

    @ObservationIgnored
    private var requestGeneration = 0

    @ObservationIgnored
    private var activeLocation: ObservingLocation?

    @ObservationIgnored
    private var observationDateForSelection: Date?

    @ObservationIgnored
    private var cachedForecasts:
        [ForecastCacheKey: [EventForecastItem]] = [:]

    @ObservationIgnored
    private var forecastCacheRecency: [ForecastCacheKey] = []

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
        reload(location: location)
    }

    func deactivate() {
        cancelLoad()
        if phase == .loading {
            phase = .idle
        }
    }

    func reload(location: ObservingLocation) {
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
    }

    func clearRestorableDate() {
        originalObservationDate = nil
    }

    private func cancelLoad() {
        loadTask?.cancel()
        loadTask = nil
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
