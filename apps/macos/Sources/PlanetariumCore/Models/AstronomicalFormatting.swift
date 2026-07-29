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

    public static func rightAscension(_ radians: Double) -> String {
        guard radians.isFinite else { return "—" }
        let tenthsPerDay = 24 * 60 * 60 * 10
        let rawTenths = (
            Angles.normalizedRadians(radians) * 12 / .pi * 60 * 60 * 10
        ).rounded()
        let totalTenths = Int(rawTenths) % tenthsPerDay
        let hours = totalTenths / (60 * 60 * 10)
        let minutes = totalTenths / (60 * 10) % 60
        let seconds = Double(totalTenths % (60 * 10)) / 10
        return String(format: "%02dh %02dm %04.1fs", hours, minutes, seconds)
    }

    public static func declination(_ radians: Double) -> String {
        guard radians.isFinite else { return "—" }
        let degreesValue = Angles.degrees(fromRadians: radians)
        let rawTenths = (abs(degreesValue) * 60 * 60 * 10).rounded()
        guard rawTenths <= Double(Int.max) else { return "—" }

        let totalTenths = Int(rawTenths)
        let sign = degreesValue < 0 ? "−" : "+"
        let degrees = totalTenths / (60 * 60 * 10)
        let minutes = totalTenths / (60 * 10) % 60
        let seconds = Double(totalTenths % (60 * 10)) / 10
        return String(
            format: "%@%02d° %02d′ %04.1f″",
            sign,
            degrees,
            minutes,
            seconds
        )
    }

    public static func azimuth(_ radians: Double) -> String {
        guard radians.isFinite else { return "—" }
        let tenthsPerCircle = 360 * 10
        let roundedTenths = Int(
            (Angles.normalizedDegrees(
                Angles.degrees(fromRadians: radians)
            ) * 10).rounded()
        ) % tenthsPerCircle
        let degrees = Double(roundedTenths) / 10

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
        return "\(direction) \(String(format: "%.1f", degrees))°"
    }

    public static func azimuth(_ coordinates: HorizontalCoordinates) -> String {
        guard coordinates.azimuthIsDefined else { return "不定" }
        return azimuth(coordinates.azimuth)
    }
}
