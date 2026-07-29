import Foundation

public enum Astronomy {
    public static let j2000JulianDate = 2_451_545.0

    public static func julianDate(for date: Date) -> Double {
        2_440_587.5 + date.timeIntervalSince1970 / 86_400
    }

    public static func greenwichMeanSiderealTime(julianDate: Double) -> Double {
        let centuries = (julianDate - j2000JulianDate) / 36_525
        let degrees =
            280.46061837
            + 360.98564736629 * (julianDate - j2000JulianDate)
            + 0.000387933 * centuries * centuries
            - centuries * centuries * centuries / 38_710_000
        return Angles.radians(fromDegrees: Angles.normalizedDegrees(degrees))
    }

    public static func localSiderealTime(
        julianDate: Double,
        longitude: Double
    ) -> Double {
        Angles.normalizedRadians(
            greenwichMeanSiderealTime(julianDate: julianDate) + longitude
        )
    }

    /// Applies the compact IAU 1976 precession model from J2000.0.
    public static func precessFromJ2000(
        rightAscension: Double,
        declination: Double,
        toJulianDate julianDate: Double
    ) -> EquatorialCoordinates {
        let centuries = (julianDate - j2000JulianDate) / 36_525
        let centuriesSquared = centuries * centuries
        let centuriesCubed = centuriesSquared * centuries
        let arcsecondsToRadians = Double.pi / (180 * 3_600)

        let zeta = (
            2_306.2181 * centuries
                + 0.30188 * centuriesSquared
                + 0.017998 * centuriesCubed
        ) * arcsecondsToRadians
        let z = (
            2_306.2181 * centuries
                + 1.09468 * centuriesSquared
                + 0.018203 * centuriesCubed
        ) * arcsecondsToRadians
        let theta = (
            2_004.3109 * centuries
                - 0.42665 * centuriesSquared
                - 0.041833 * centuriesCubed
        ) * arcsecondsToRadians

        let shiftedRightAscension = rightAscension + zeta
        let a = cos(declination) * sin(shiftedRightAscension)
        let b =
            cos(theta) * cos(declination) * cos(shiftedRightAscension)
            - sin(theta) * sin(declination)
        let c =
            sin(theta) * cos(declination) * cos(shiftedRightAscension)
            + cos(theta) * sin(declination)

        return EquatorialCoordinates(
            rightAscension: Angles.normalizedRadians(atan2(a, b) + z),
            declination: asin(Angles.clamped(c))
        )
    }

    public static func horizontalCoordinates(
        declination: Double,
        hourAngle: Double,
        latitude: Double
    ) -> HorizontalCoordinates {
        let east = -cos(declination) * sin(hourAngle)
        let north =
            cos(latitude) * sin(declination)
            - sin(latitude) * cos(declination) * cos(hourAngle)
        let up =
            sin(latitude) * sin(declination)
            + cos(latitude) * cos(declination) * cos(hourAngle)

        let altitude = asin(Angles.clamped(up))
        let azimuthDefined = hypot(east, north) > 1e-12
        let azimuth = azimuthDefined
            ? Angles.normalizedRadians(atan2(east, north))
            : 0
        return HorizontalCoordinates(
            altitude: altitude,
            azimuth: azimuth,
            azimuthIsDefined: azimuthDefined
        )
    }

    public static func horizontalCoordinates(
        rightAscension: Double,
        declination: Double,
        at date: Date,
        latitude: Double,
        longitude: Double
    ) -> HorizontalCoordinates {
        let julianDate = julianDate(for: date)
        let equatorial = precessFromJ2000(
            rightAscension: rightAscension,
            declination: declination,
            toJulianDate: julianDate
        )
        let hourAngle = localSiderealTime(
            julianDate: julianDate,
            longitude: longitude
        ) - equatorial.rightAscension
        return horizontalCoordinates(
            declination: equatorial.declination,
            hourAngle: hourAngle,
            latitude: latitude
        )
    }

    /// Zenith-centred azimuthal equidistant projection normalized to a unit horizon.
    public static func project(
        altitude: Double,
        azimuth: Double
    ) -> ProjectedPoint {
        let rho = (.pi / 2 - altitude) / (.pi / 2)
        return ProjectedPoint(
            x: rho * sin(azimuth),
            y: -rho * cos(azimuth)
        )
    }

    public static func angularDistance(
        between first: HorizontalCoordinates,
        and second: HorizontalCoordinates
    ) -> Double {
        let firstVector = horizontalUnitVector(first)
        let secondVector = horizontalUnitVector(second)
        let dot =
            firstVector.x * secondVector.x
            + firstVector.y * secondVector.y
            + firstVector.z * secondVector.z
        let crossX = firstVector.y * secondVector.z - firstVector.z * secondVector.y
        let crossY = firstVector.z * secondVector.x - firstVector.x * secondVector.z
        let crossZ = firstVector.x * secondVector.y - firstVector.y * secondVector.x
        let crossLength = sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ)
        return atan2(crossLength, Angles.clamped(dot))
    }

    public static func render(
        catalog: SkyCatalog,
        at date: Date,
        location: ObservingLocation
    ) -> [RenderedStar] {
        render(
            catalog: catalog,
            at: date,
            location: location,
            options: ApparentPositionOptionsV2()
        )
    }

    public static func render(
        catalog: SkyCatalog,
        at date: Date,
        location: ObservingLocation,
        options: ApparentPositionOptionsV2
    ) -> [RenderedStar] {
        do {
            return try renderV2(
                catalog: catalog,
                at: date,
                location: location,
                options: options
            )
        } catch {
            // Preserve the existing nonthrowing public API for callers with
            // unsupported or malformed input. Valid bundled data uses v2.
            return renderLegacy(
                catalog: catalog,
                at: date,
                location: location
            )
        }
    }

    private static func renderLegacy(
        catalog: SkyCatalog,
        at date: Date,
        location: ObservingLocation
    ) -> [RenderedStar] {
        let latitude = Angles.radians(fromDegrees: location.latitude)
        let longitude = Angles.radians(fromDegrees: location.longitude)
        let julianDate = julianDate(for: date)
        let siderealTime = localSiderealTime(
            julianDate: julianDate,
            longitude: longitude
        )

        return catalog.stars.map { star in
            let equatorial = precessFromJ2000(
                rightAscension: star.rightAscension,
                declination: star.declination,
                toJulianDate: julianDate
            )
            let horizontal = horizontalCoordinates(
                declination: equatorial.declination,
                hourAngle: siderealTime - equatorial.rightAscension,
                latitude: latitude
            )
            return RenderedStar(
                catalog: star,
                name: catalog.namesByHR[star.hr],
                horizontal: horizontal,
                projection: project(
                    altitude: horizontal.altitude,
                    azimuth: horizontal.azimuth
                )
            )
        }
    }

    private static func horizontalUnitVector(
        _ coordinates: HorizontalCoordinates
    ) -> (x: Double, y: Double, z: Double) {
        let horizontalLength = cos(coordinates.altitude)
        return (
            x: horizontalLength * sin(coordinates.azimuth),
            y: horizontalLength * cos(coordinates.azimuth),
            z: sin(coordinates.altitude)
        )
    }
}
