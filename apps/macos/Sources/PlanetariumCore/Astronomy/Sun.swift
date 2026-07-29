import Foundation

public enum TwilightPhase: String, CaseIterable, Sendable {
    case day
    case civil
    case nautical
    case astronomical
    case night

    public var nameJa: String {
        switch self {
        case .day: "昼"
        case .civil: "市民薄明"
        case .nautical: "航海薄明"
        case .astronomical: "天文薄明"
        case .night: "夜"
        }
    }
}

public struct SunState: Hashable, Sendable {
    public let equatorial: EquatorialCoordinates
    public let horizontal: HorizontalCoordinates
    public let phase: TwilightPhase

    public init(
        equatorial: EquatorialCoordinates,
        horizontal: HorizontalCoordinates,
        phase: TwilightPhase
    ) {
        self.equatorial = equatorial
        self.horizontal = horizontal
        self.phase = phase
    }
}

public enum Sun {
    public static func equatorialCoordinates(
        julianDate: Double
    ) -> EquatorialCoordinates {
        let days = julianDate - Astronomy.j2000JulianDate
        let meanLongitude = Angles.radians(
            fromDegrees: Angles.normalizedDegrees(280.460 + 0.9856474 * days)
        )
        let meanAnomaly = Angles.radians(
            fromDegrees: Angles.normalizedDegrees(357.528 + 0.9856003 * days)
        )
        let eclipticLongitude = meanLongitude
            + Angles.radians(fromDegrees: 1.915) * sin(meanAnomaly)
            + Angles.radians(fromDegrees: 0.020) * sin(2 * meanAnomaly)
        let obliquity = Angles.radians(
            fromDegrees: 23.439 - 0.0000004 * days
        )

        return EquatorialCoordinates(
            rightAscension: Angles.normalizedRadians(
                atan2(
                    cos(obliquity) * sin(eclipticLongitude),
                    cos(eclipticLongitude)
                )
            ),
            declination: asin(
                Angles.clamped(sin(obliquity) * sin(eclipticLongitude))
            )
        )
    }

    public static func state(
        at date: Date,
        location: ObservingLocation
    ) -> SunState {
        let julianDate = Astronomy.julianDate(for: date)
        let equatorial = equatorialCoordinates(julianDate: julianDate)
        let longitude = Angles.radians(fromDegrees: location.longitude)
        let latitude = Angles.radians(fromDegrees: location.latitude)
        let hourAngle = Astronomy.localSiderealTime(
            julianDate: julianDate,
            longitude: longitude
        ) - equatorial.rightAscension
        let horizontal = Astronomy.horizontalCoordinates(
            declination: equatorial.declination,
            hourAngle: hourAngle,
            latitude: latitude
        )
        return SunState(
            equatorial: equatorial,
            horizontal: horizontal,
            phase: twilightPhase(forSolarAltitude: horizontal.altitude)
        )
    }

    /**
     Precision-v2 Sun state using the exact frame context shared with the
     stellar render. Twilight always uses the vacuum geometric altitude;
     configured optical refraction in the context is intentionally ignored.
     */
    public static func state(
        context: ApparentPositionContextV2
    ) throws -> SunState {
        let apparent = try Astronomy
            .calculateApparentSunPositionWithContextV2(context)
        return SunState(
            equatorial: apparent.apparentEquatorial,
            horizontal: apparent.geometricHorizontal,
            phase: twilightPhase(
                forSolarAltitude:
                    apparent.geometricHorizontal.altitude
            )
        )
    }

    public static func twilightPhase(forSolarAltitude altitude: Double) -> TwilightPhase {
        let degrees = Angles.degrees(fromRadians: altitude)
        return switch degrees {
        case 0...:
            .day
        case -6..<0:
            .civil
        case -12 ..< -6:
            .nautical
        case -18 ..< -12:
            .astronomical
        default:
            .night
        }
    }
}
