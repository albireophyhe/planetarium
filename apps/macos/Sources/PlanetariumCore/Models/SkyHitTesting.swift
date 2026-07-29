import Foundation

/// Pure hit-testing for the normalized sky projection.
public enum SkyHitTesting {
    public static func closestStarHR(
        to point: ProjectedPoint,
        among stars: [RenderedStar],
        maximumDistance: Double
    ) -> Int? {
        guard point.x.isFinite,
              point.y.isFinite,
              maximumDistance.isFinite,
              maximumDistance >= 0
        else {
            return nil
        }

        return stars.lazy
            .filter(\.isAboveHorizon)
            .compactMap { star -> (star: RenderedStar, distance: Double)? in
                guard star.projection.x.isFinite, star.projection.y.isFinite else {
                    return nil
                }
                let distance = hypot(
                    star.projection.x - point.x,
                    star.projection.y - point.y
                )
                guard distance <= maximumDistance else { return nil }
                return (star, distance)
            }
            .min { first, second in
                if first.distance != second.distance {
                    return first.distance < second.distance
                }
                if first.star.catalog.visualMagnitude
                    != second.star.catalog.visualMagnitude {
                    return first.star.catalog.visualMagnitude
                        < second.star.catalog.visualMagnitude
                }
                return first.star.hr < second.star.hr
            }?
            .star.hr
    }
}
