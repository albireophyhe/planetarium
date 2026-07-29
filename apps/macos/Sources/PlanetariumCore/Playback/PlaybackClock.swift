import Foundation

public enum PlaybackDirection: Int, CaseIterable, Codable, Hashable, Sendable {
    case backward = -1
    case forward = 1
}

public enum PlaybackSpeedPreset: String, CaseIterable, Codable, Hashable, Sendable {
    case realTime
    case minutePerSecond
    case tenMinutesPerSecond
    case hourPerSecond
    case dayPerSecond

    public var simulatedSecondsPerRealSecond: TimeInterval {
        switch self {
        case .realTime:
            1
        case .minutePerSecond:
            60
        case .tenMinutesPerSecond:
            10 * 60
        case .hourPerSecond:
            60 * 60
        case .dayPerSecond:
            24 * 60 * 60
        }
    }
}

public enum PlaybackMotionMode: String, Codable, Hashable, Sendable {
    case animated
    case staticFrame
}

public struct PlaybackState: Equatable, Sendable {
    public var date: Date
    public var isPlaying: Bool
    public var direction: PlaybackDirection
    public var speed: PlaybackSpeedPreset
    public var motionMode: PlaybackMotionMode

    public init(
        date: Date,
        isPlaying: Bool = false,
        direction: PlaybackDirection = .forward,
        speed: PlaybackSpeedPreset = .minutePerSecond,
        motionMode: PlaybackMotionMode = .animated
    ) {
        self.date = date
        self.isPlaying = isPlaying
        self.direction = direction
        self.speed = speed
        self.motionMode = motionMode
    }
}

public enum PlaybackAction: Equatable, Sendable {
    case play
    case pause
    case togglePlayback
    case setDirection(PlaybackDirection)
    case setSpeed(PlaybackSpeedPreset)
    case setMotionMode(PlaybackMotionMode)
    case seek(Date)
    case tick(realTimeDelta: TimeInterval)
}

public enum PlaybackEvent: Equatable, Sendable {
    case reachedBoundary(ObservationDateBoundary)
    case blockedByStaticMode
}

public struct PlaybackReduction: Equatable, Sendable {
    public let state: PlaybackState
    public let event: PlaybackEvent?
    /// The sanitized real-time delta consumed by a tick. This is zero for
    /// ignored ticks and non-tick actions.
    public let appliedRealTimeDelta: TimeInterval

    public init(
        state: PlaybackState,
        event: PlaybackEvent?,
        appliedRealTimeDelta: TimeInterval
    ) {
        self.state = state
        self.event = event
        self.appliedRealTimeDelta = appliedRealTimeDelta
    }
}

/// A deterministic playback reducer. The caller supplies elapsed real time,
/// keeping wall-clock and display-link concerns outside the astronomy model.
public struct PlaybackClock: Sendable {
    public let supportedDateRange: ClosedRange<Date>
    public let maximumFrameDelta: TimeInterval

    public init(
        supportedDateRange: ClosedRange<Date> = ObservationConstraints.supportedDateRange,
        maximumFrameDelta: TimeInterval = 0.25
    ) {
        precondition(
            maximumFrameDelta.isFinite && maximumFrameDelta > 0,
            "maximumFrameDelta must be finite and greater than zero"
        )
        self.supportedDateRange = supportedDateRange
        self.maximumFrameDelta = maximumFrameDelta
    }

    public func reduce(
        _ state: PlaybackState,
        action: PlaybackAction
    ) -> PlaybackReduction {
        var next = canonicalized(state)
        var event: PlaybackEvent?
        var appliedRealTimeDelta: TimeInterval = 0

        switch action {
        case .play:
            event = startPlaybackIfPossible(&next)

        case .pause:
            next.isPlaying = false

        case .togglePlayback:
            if next.isPlaying {
                next.isPlaying = false
            } else {
                event = startPlaybackIfPossible(&next)
            }

        case let .setDirection(direction):
            next.direction = direction
            if next.isPlaying, let boundary = outboundBoundary(for: next) {
                next.isPlaying = false
                event = .reachedBoundary(boundary)
            }

        case let .setSpeed(speed):
            next.speed = speed

        case let .setMotionMode(mode):
            next.motionMode = mode
            if mode == .staticFrame {
                next.isPlaying = false
            }

        case let .seek(date):
            let result = clamped(date)
            next.date = result.date
            event = result.boundary.map(PlaybackEvent.reachedBoundary)
            if next.isPlaying,
               let boundary = outboundBoundary(for: next) {
                next.isPlaying = false
                if event == nil {
                    event = .reachedBoundary(boundary)
                }
            }

        case let .tick(realTimeDelta):
            guard next.isPlaying, next.motionMode == .animated else {
                break
            }
            guard realTimeDelta.isFinite, realTimeDelta > 0 else {
                break
            }

            appliedRealTimeDelta = min(realTimeDelta, maximumFrameDelta)
            let simulatedDelta =
                appliedRealTimeDelta
                * next.speed.simulatedSecondsPerRealSecond
                * Double(next.direction.rawValue)
            let proposedDate = next.date.addingTimeInterval(simulatedDelta)

            switch next.direction {
            case .forward where proposedDate >= supportedDateRange.upperBound:
                next.date = supportedDateRange.upperBound
                next.isPlaying = false
                event = .reachedBoundary(.maximum)
            case .backward where proposedDate <= supportedDateRange.lowerBound:
                next.date = supportedDateRange.lowerBound
                next.isPlaying = false
                event = .reachedBoundary(.minimum)
            default:
                next.date = proposedDate
            }
        }

        return PlaybackReduction(
            state: next,
            event: event,
            appliedRealTimeDelta: appliedRealTimeDelta
        )
    }

    private func canonicalized(_ state: PlaybackState) -> PlaybackState {
        var result = state
        result.date = clamped(state.date).date
        if result.motionMode == .staticFrame {
            result.isPlaying = false
        }
        return result
    }

    private func startPlaybackIfPossible(
        _ state: inout PlaybackState
    ) -> PlaybackEvent? {
        guard state.motionMode == .animated else {
            state.isPlaying = false
            return .blockedByStaticMode
        }
        if let boundary = outboundBoundary(for: state) {
            state.isPlaying = false
            return .reachedBoundary(boundary)
        }
        state.isPlaying = true
        return nil
    }

    private func outboundBoundary(
        for state: PlaybackState
    ) -> ObservationDateBoundary? {
        switch state.direction {
        case .forward where state.date >= supportedDateRange.upperBound:
            .maximum
        case .backward where state.date <= supportedDateRange.lowerBound:
            .minimum
        default:
            nil
        }
    }

    private func clamped(
        _ date: Date
    ) -> (date: Date, boundary: ObservationDateBoundary?) {
        guard date.timeIntervalSinceReferenceDate.isFinite else {
            return (supportedDateRange.lowerBound, .minimum)
        }
        if date < supportedDateRange.lowerBound {
            return (supportedDateRange.lowerBound, .minimum)
        }
        if date > supportedDateRange.upperBound {
            return (supportedDateRange.upperBound, .maximum)
        }
        return (date, nil)
    }
}
