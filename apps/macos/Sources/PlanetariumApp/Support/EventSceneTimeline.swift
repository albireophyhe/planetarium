import Foundation
import PlanetariumCore

struct EventSceneTimelineMoment:
    Hashable, Identifiable, Sendable
{
    enum Sample: Hashable, Sendable {
        case eclipse(EclipseContactV1)
        case occultation(
            LunarOccultationContactV1
        )
    }

    let id: String
    let label: String
    let instantUTC: Date
    let isMaximum: Bool
    let sample: Sample
}

enum OccultationSceneTargetState:
    Hashable, Sendable
{
    case atMeanLimb
    case insideMeanLimb
    case outsideMeanLimb
    case uncertainBoundary

    static func resolve(
        phase:
            LunarOccultationContactPhaseV1,
        grazing: Bool,
        clearanceRadians: Double
    ) -> Self {
        if grazing {
            return .uncertainBoundary
        }
        switch phase {
        case .disappearance, .reappearance:
            return .atMeanLimb
        case .maximum:
            if clearanceRadians == 0 {
                return .atMeanLimb
            }
            return clearanceRadians < 0
                ? .insideMeanLimb
                : .outsideMeanLimb
        }
    }
}

enum EventSceneTimeline {
    // Date values assigned from a solved contact are expected to be identical.
    // One millisecond only absorbs representation noise; it must not turn a
    // nearby manually entered or playing sky time into the solved instant.
    static let matchingTolerance: TimeInterval = 0.001

    static func moments(
        for item: EventForecastItem
    ) -> [EventSceneTimelineMoment] {
        switch item {
        case let .eclipse(forecast):
            return eclipseMoments(
                contacts: forecast.contacts,
                maximum: forecast.maximum,
                solarOccurrenceUncertain:
                    forecast.uncertainBoundary
                    == .external
            )
        case let .occultation(forecast):
            return occultationMoments(
                contacts: forecast.contacts,
                maximum: forecast.maximum
            )
        }
    }

    static func eclipseMoments(
        contacts: [EclipseContactV1],
        maximum: EclipseContactV1,
        solarOccurrenceUncertain: Bool
    ) -> [EventSceneTimelineMoment] {
        deduplicated(
            (contacts + [maximum]).map {
                eclipseMoment(
                    $0,
                    solarOccurrenceUncertain:
                        solarOccurrenceUncertain
                )
            }
        )
    }

    static func occultationMoments(
        contacts:
            [LunarOccultationContactV1],
        maximum:
            LunarOccultationContactV1
    ) -> [EventSceneTimelineMoment] {
        deduplicated(
            (contacts + [maximum]).map {
                occultationMoment($0)
            }
        )
    }

    static func matchingMoment(
        observationDate: Date,
        in moments: [EventSceneTimelineMoment],
        tolerance: TimeInterval =
            matchingTolerance
    ) -> EventSceneTimelineMoment? {
        guard tolerance.isFinite, tolerance >= 0
        else {
            return nil
        }
        return moments
            .map {
                (
                    moment: $0,
                    distance:
                        abs(
                            $0.instantUTC
                                .timeIntervalSince(
                                    observationDate
                                )
                        )
                )
            }
            .filter {
                $0.distance <= tolerance
            }
            .min {
                if $0.distance == $1.distance {
                    return $0.moment.id
                        < $1.moment.id
                }
                return $0.distance < $1.distance
            }?
            .moment
    }

    static func defaultMoment(
        in moments: [EventSceneTimelineMoment]
    ) -> EventSceneTimelineMoment? {
        moments.first(where: \.isMaximum)
            ?? moments.first
    }

    private static func eclipseMoment(
        _ contact: EclipseContactV1,
        solarOccurrenceUncertain: Bool
    ) -> EventSceneTimelineMoment {
        EventSceneTimelineMoment(
            id:
                "eclipse:"
                + contact.phase.rawValue
                + ":"
                + String(
                    contact.instantUTC
                        .timeIntervalSinceReferenceDate
                        .bitPattern
                ),
            label:
                EventForecastFormatting.phase(
                    contact.phase,
                    solarOccurrenceUncertain:
                        solarOccurrenceUncertain
                ),
            instantUTC: contact.instantUTC,
            isMaximum:
                contact.phase == .maximum,
            sample: .eclipse(contact)
        )
    }

    private static func occultationMoment(
        _ contact:
            LunarOccultationContactV1
    ) -> EventSceneTimelineMoment {
        EventSceneTimelineMoment(
            id:
                "occultation:"
                + contact.phase.rawValue
                + ":"
                + String(
                    contact.instantUTC
                        .timeIntervalSinceReferenceDate
                        .bitPattern
                ),
            label:
                EventForecastFormatting
                .occultationPhase(contact.phase),
            instantUTC: contact.instantUTC,
            isMaximum:
                contact.phase == .maximum,
            sample: .occultation(contact)
        )
    }

    private static func deduplicated(
        _ moments: [EventSceneTimelineMoment]
    ) -> [EventSceneTimelineMoment] {
        // The explicit `maximum` is appended after `contacts`; keeping the
        // last value ensures its canonical geometry wins if an older result
        // duplicated the maximum phase with a less complete sample.
        var unique: [
            String: EventSceneTimelineMoment
        ] = [:]
        for moment in moments {
            unique[moment.id] = moment
        }
        return unique.values
            .sorted {
                if $0.instantUTC == $1.instantUTC {
                    return $0.id < $1.id
                }
                return $0.instantUTC
                    < $1.instantUTC
            }
    }
}
