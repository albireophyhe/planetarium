import Foundation
import PlanetariumCore

enum EventSceneSessionPhase:
    Equatable, Sendable
{
    case staticOnly
    case preparing
    case ready
    case sampling
    case failed(String)
}

struct EventSceneSessionPlan:
    Equatable, Sendable
{
    static let maximumProjectionSampleCount =
        256
    static let projectionPaddingFraction =
        0.04
    static let playbackFramesPerSecond =
        10.0
    static let targetPlaybackDurationSeconds =
        24.0

    let itemID: String
    let lowerBound: Date
    let upperBound: Date
    let solvedDates: [Date]
    let frameStepSeconds: TimeInterval
    let projectionDates: [Date]

    var isInteractive: Bool {
        upperBound > lowerBound
            && solvedDates.count > 1
    }

    var duration: TimeInterval {
        upperBound.timeIntervalSince(
            lowerBound
        )
    }

    var playbackFrameIntervalSeconds:
        TimeInterval
    {
        1 / Self.playbackFramesPerSecond
    }

    var playbackFrameStepSeconds:
        TimeInterval
    {
        guard duration > 0 else {
            return 0
        }
        return duration
            / (
                Self.playbackFramesPerSecond
                * Self
                .targetPlaybackDurationSeconds
            )
    }

    init?(
        item: EventForecastItem
    ) {
        let moments =
            EventSceneTimeline.moments(for: item)
        let dates = moments
            .map(\.instantUTC)
            .filter {
                $0.timeIntervalSinceReferenceDate
                    .isFinite
            }
        guard
            let first = dates.first,
            let last = dates.last
        else {
            return nil
        }

        let step: TimeInterval
        switch item.candidate.kind {
        case .solarEclipse:
            step = 120
        case .lunarEclipse:
            step = 180
        case .lunarOccultation:
            step = 60
        }

        itemID = item.id
        lowerBound = first
        upperBound = last
        solvedDates = dates
        frameStepSeconds = step
        projectionDates =
            Self.projectionDates(
                lowerBound: first,
                upperBound: last,
                solvedDates: dates,
                preferredStep: step
            )
    }

    func clamped(
        _ date: Date
    ) -> Date {
        min(
            upperBound,
            max(lowerBound, date)
        )
    }

    private static func projectionDates(
        lowerBound: Date,
        upperBound: Date,
        solvedDates: [Date],
        preferredStep: TimeInterval
    ) -> [Date] {
        let duration =
            upperBound.timeIntervalSince(
                lowerBound
            )
        guard
            duration.isFinite,
            duration > 0,
            preferredStep.isFinite,
            preferredStep > 0
        else {
            return [lowerBound]
        }

        let uniqueSolved =
            Array(Set(solvedDates)).sorted()
        let gridBudget = max(
            2,
            maximumProjectionSampleCount
                - uniqueSolved.count
        )
        let preferredIntervals = max(
            1,
            Int(ceil(duration / preferredStep))
        )
        let intervalCount = min(
            gridBudget - 1,
            preferredIntervals
        )
        var dates = Set(uniqueSolved)
        for index in 0...intervalCount {
            let fraction =
                Double(index)
                / Double(intervalCount)
            dates.insert(
                lowerBound.addingTimeInterval(
                    duration * fraction
                )
            )
        }
        let result = dates.sorted()
        if result.count
            <= maximumProjectionSampleCount
        {
            return result
        }

        // Solved instants always win. This defensive branch is reachable
        // only for malformed input with hundreds of named contacts.
        return Array(
            result.prefix(
                maximumProjectionSampleCount
            )
        )
    }
}

struct EventSceneSessionState:
    Equatable, Sendable
{
    let itemID: String
    let plan: EventSceneSessionPlan
    var phase: EventSceneSessionPhase
    var requestedDate: Date
    var requestedLabel: String
    var displayedSample:
        EventSceneSampleV1?
    var displayedLabel: String?
    var angularExtent:
        AngularSceneExtent?
    var isPlaying: Bool
    var hasPlaybackPosition: Bool
}

struct EventSceneSampleCache: Sendable {
    let capacity: Int
    private var values:
        [Date: EventSceneSampleV1] = [:]
    private var recency: [Date] = []

    init(capacity: Int) {
        self.capacity = max(1, capacity)
    }

    var count: Int {
        values.count
    }

    mutating func value(
        for date: Date
    ) -> EventSceneSampleV1? {
        guard let value = values[date] else {
            return nil
        }
        touch(date)
        return value
    }

    mutating func insert(
        _ sample: EventSceneSampleV1,
        for date: Date
    ) {
        values[date] = sample
        touch(date)
        while recency.count > capacity {
            let evicted =
                recency.removeFirst()
            values.removeValue(
                forKey: evicted
            )
        }
    }

    mutating func removeAll() {
        values.removeAll(
            keepingCapacity: true
        )
        recency.removeAll(
            keepingCapacity: true
        )
    }

    private mutating func touch(
        _ date: Date
    ) {
        recency.removeAll { $0 == date }
        recency.append(date)
    }
}

enum EventSceneSessionError:
    LocalizedError, Equatable
{
    case samplingUnavailable
    case sampleInstantMismatch
    case invalidProjection

    var errorDescription: String? {
        switch self {
        case .samplingUnavailable:
            "この環境では任意時刻の物理配置を計算できません。"
        case .sampleInstantMismatch:
            "要求したUTC時刻と計算結果のUTC時刻が一致しません。"
        case .invalidProjection:
            "全経過を収める固定角視野を構成できません。"
        }
    }
}
