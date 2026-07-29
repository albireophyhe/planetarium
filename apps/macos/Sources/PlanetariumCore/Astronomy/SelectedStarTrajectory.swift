import Foundation

public enum StarTrajectoryTemporalPosition:
    String,
    Codable,
    Hashable,
    Sendable
{
    case past
    case present
    case future
}

public struct SelectedStarTrajectorySample:
    Identifiable,
    Hashable,
    Sendable
{
    public let starHR: Int
    public let offsetMinutes: Int
    public let date: Date
    public let horizontal: HorizontalCoordinates
    public let projection: ProjectedPoint

    public var id: Int { offsetMinutes }
    public var isAboveHorizon: Bool {
        horizontal.altitude >= 0
    }
    public var temporalPosition: StarTrajectoryTemporalPosition {
        switch offsetMinutes {
        case ..<0:
            .past
        case 1...:
            .future
        default:
            .present
        }
    }
    public var progress: Double {
        min(
            1,
            max(
                0,
                Double(
                    offsetMinutes
                        + SelectedStarTrajectorySampler.pastMinutes
                )
                    / Double(
                        SelectedStarTrajectorySampler.pastMinutes
                            + SelectedStarTrajectorySampler.futureMinutes
                    )
            )
        )
    }

    public init(
        starHR: Int,
        offsetMinutes: Int,
        date: Date,
        horizontal: HorizontalCoordinates,
        projection: ProjectedPoint
    ) {
        self.starHR = starHR
        self.offsetMinutes = offsetMinutes
        self.date = date
        self.horizontal = horizontal
        self.projection = projection
    }
}

public struct SelectedStarTrajectory2DSegment:
    Hashable,
    Sendable
{
    public let start: ProjectedPoint
    public let end: ProjectedPoint
    public let temporalPosition: StarTrajectoryTemporalPosition
    public let progress: Double

    public init(
        start: ProjectedPoint,
        end: ProjectedPoint,
        temporalPosition: StarTrajectoryTemporalPosition,
        progress: Double
    ) {
        self.start = start
        self.end = end
        self.temporalPosition = temporalPosition
        self.progress = min(1, max(0, progress))
    }
}

public enum SelectedStarTrajectorySampler {
    public static let pastMinutes = 180
    public static let futureMinutes = 180
    public static let stepMinutes = 30
    public static let maximumSampleCount = 13

    /**
     Samples one selected star with the same v2 pipeline used by the main sky.

     `optionsAt` is deliberately evaluated for every retained timestamp so
     time-dependent Earth-orientation data, including IERS DUT1 and polar
     motion, is not reused at the wrong UTC instant. It is never called while
     disabled or when no star is selected.
     */
    public static func samples(
        for star: CatalogStar?,
        centeredAt observationDate: Date,
        location: ObservingLocation,
        enabled: Bool,
        optionsAt: (Date) -> ApparentPositionOptionsV2
    ) throws -> [SelectedStarTrajectorySample] {
        guard enabled, let star else { return [] }
        guard observationDate.timeIntervalSinceReferenceDate.isFinite,
              ObservationConstraints.supportedDateRange.contains(
                  observationDate
              )
        else {
            throw PrecisionModelError.unsupportedObservationDate
        }

        var samples: [SelectedStarTrajectorySample] = []
        samples.reserveCapacity(maximumSampleCount)
        for offsetMinutes in stride(
            from: -pastMinutes,
            through: futureMinutes,
            by: stepMinutes
        ) {
            let date = observationDate.addingTimeInterval(
                Double(offsetMinutes * 60)
            )
            guard ObservationConstraints.supportedDateRange.contains(
                date
            ) else {
                continue
            }

            let context = try Astronomy.createApparentPositionContextV2(
                at: date,
                location: location,
                options: optionsAt(date)
            )
            let position = try Astronomy
                .calculateLightweightApparentStarPositionWithContextV2(
                    star,
                    context: context
                )
            samples.append(
                SelectedStarTrajectorySample(
                    starHR: star.hr,
                    offsetMinutes: offsetMinutes,
                    date: date,
                    horizontal: position.observedHorizontal,
                    projection: position.projection
                )
            )
        }
        return samples
    }

    /**
     Produces only the portions of adjacent 2D segments on or above the
     mathematical horizon. Crossing segments terminate at an interpolated
     altitude-zero point; pairs wholly below the horizon emit nothing.
     */
    public static func visible2DSegments(
        from samples: [SelectedStarTrajectorySample]
    ) -> [SelectedStarTrajectory2DSegment] {
        zip(samples, samples.dropFirst()).compactMap {
            start,
            end in
            visible2DSegment(from: start, to: end)
        }
    }

    private static func visible2DSegment(
        from start: SelectedStarTrajectorySample,
        to end: SelectedStarTrajectorySample
    ) -> SelectedStarTrajectory2DSegment? {
        let values = [
            start.horizontal.altitude,
            end.horizontal.altitude,
            start.projection.x,
            start.projection.y,
            end.projection.x,
            end.projection.y,
        ]
        guard values.allSatisfy(\.isFinite) else { return nil }

        let startVisible = start.isAboveHorizon
        let endVisible = end.isAboveHorizon
        guard startVisible || endVisible else { return nil }

        let temporalPosition = temporalPosition(
            between: start.offsetMinutes,
            and: end.offsetMinutes
        )
        if startVisible, endVisible {
            return SelectedStarTrajectory2DSegment(
                start: start.projection,
                end: end.projection,
                temporalPosition: temporalPosition,
                progress: end.progress
            )
        }

        let altitudeDifference =
            start.horizontal.altitude - end.horizontal.altitude
        guard altitudeDifference.isFinite,
              abs(altitudeDifference) > 1e-15
        else {
            return nil
        }
        let fraction = min(
            1,
            max(
                0,
                start.horizontal.altitude / altitudeDifference
            )
        )
        let interpolatedX =
            start.projection.x
            + fraction
                * (end.projection.x - start.projection.x)
        let interpolatedY =
            start.projection.y
            + fraction
                * (end.projection.y - start.projection.y)
        let radius = hypot(interpolatedX, interpolatedY)
        guard radius.isFinite, radius > 1e-15 else {
            return nil
        }
        let horizon = ProjectedPoint(
            x: interpolatedX / radius,
            y: interpolatedY / radius
        )
        return SelectedStarTrajectory2DSegment(
            start: startVisible ? start.projection : horizon,
            end: endVisible ? end.projection : horizon,
            temporalPosition: temporalPosition,
            progress: end.progress
        )
    }

    private static func temporalPosition(
        between startMinutes: Int,
        and endMinutes: Int
    ) -> StarTrajectoryTemporalPosition {
        if startMinutes < 0, endMinutes <= 0 {
            return .past
        }
        if startMinutes >= 0, endMinutes > 0 {
            return .future
        }
        return .present
    }
}
