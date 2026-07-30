import Foundation

/// Deterministic formatting for astronomical quantities that also handles
/// carry-over at sexagesimal and circular-angle boundaries.
public enum AstronomicalFormatting {
    public static func degrees(
        _ radians: Double,
        fractionDigits requestedFractionDigits: Int = 1
    ) -> String {
        guard radians.isFinite else { return "—" }
        return decimal(
            Angles.degrees(fromRadians: radians),
            fractionDigits: requestedFractionDigits
        ) + "°"
    }

    public static func decimal(
        _ value: Double,
        fractionDigits requestedFractionDigits: Int = 1
    ) -> String {
        guard value.isFinite else { return "—" }
        let fractionDigits = min(max(requestedFractionDigits, 0), 9)
        let scale = pow(10, Double(fractionDigits))
        let roundedMagnitude = (abs(value) * scale).rounded() / scale
        let sign = value < 0 && roundedMagnitude > 0 ? "−" : ""
        return sign + String(
            format: "%.*f",
            fractionDigits,
            roundedMagnitude
        )
    }

    public static func rightAscension(
        _ radians: Double,
        fractionDigits requestedFractionDigits: Int = 1
    ) -> String {
        guard radians.isFinite else { return "—" }
        let fractionDigits =
            min(max(requestedFractionDigits, 0), 9)
        let scale = Int(pow(10, Double(fractionDigits)))
        let unitsPerDay = 24 * 60 * 60 * scale
        let rawUnits = (
            Angles.normalizedRadians(radians) * 12 / .pi * 60 * 60
                * Double(scale)
        ).rounded()
        let totalUnits = Int(rawUnits) % unitsPerDay
        let hours = totalUnits / (60 * 60 * scale)
        let minutes = totalUnits / (60 * scale) % 60
        let seconds =
            Double(totalUnits % (60 * scale)) / Double(scale)
        let secondsWidth =
            fractionDigits == 0 ? 2 : fractionDigits + 3
        return String(
            format: "%02dh %02dm %0*.*fs",
            hours,
            minutes,
            secondsWidth,
            fractionDigits,
            seconds
        )
    }

    public static func declination(
        _ radians: Double,
        fractionDigits requestedFractionDigits: Int = 1
    ) -> String {
        guard radians.isFinite else { return "—" }
        let fractionDigits =
            min(max(requestedFractionDigits, 0), 9)
        let scale = Int(pow(10, Double(fractionDigits)))
        let degreesValue = Angles.degrees(fromRadians: radians)
        let rawUnits = (
            abs(degreesValue) * 60 * 60 * Double(scale)
        ).rounded()
        guard rawUnits <= Double(Int.max) else { return "—" }

        let totalUnits = Int(rawUnits)
        let sign = degreesValue < 0 ? "−" : "+"
        let degrees = totalUnits / (60 * 60 * scale)
        let minutes = totalUnits / (60 * scale) % 60
        let seconds =
            Double(totalUnits % (60 * scale)) / Double(scale)
        let secondsWidth =
            fractionDigits == 0 ? 2 : fractionDigits + 3
        return String(
            format: "%@%02d° %02d′ %0*.*f″",
            sign,
            degrees,
            minutes,
            secondsWidth,
            fractionDigits,
            seconds
        )
    }

    public static func azimuth(
        _ radians: Double,
        fractionDigits requestedFractionDigits: Int = 1
    ) -> String {
        guard radians.isFinite else { return "—" }
        let fractionDigits =
            min(max(requestedFractionDigits, 0), 9)
        let scale = Int(pow(10, Double(fractionDigits)))
        let unitsPerCircle = 360 * scale
        let roundedUnits = Int(
            (Angles.normalizedDegrees(
                Angles.degrees(fromRadians: radians)
            ) * Double(scale)).rounded()
        ) % unitsPerCircle
        let degrees = Double(roundedUnits) / Double(scale)

        let direction: String
        switch degrees {
        case 22.5..<67.5: direction = "北東"
        case 67.5..<112.5: direction = "東"
        case 112.5..<157.5: direction = "南東"
        case 157.5..<202.5: direction = "南"
        case 202.5..<247.5: direction = "南西"
        case 247.5..<292.5: direction = "西"
        case 292.5..<337.5: direction = "北西"
        default: direction = "北"
        }
        return direction
            + " "
            + String(
                format: "%.*f",
                fractionDigits,
                degrees
            )
            + "°"
    }

    public static func azimuth(
        _ coordinates: HorizontalCoordinates,
        fractionDigits: Int = 1
    ) -> String {
        guard coordinates.azimuthIsDefined else { return "不定" }
        return azimuth(
            coordinates.azimuth,
            fractionDigits: fractionDigits
        )
    }
}
