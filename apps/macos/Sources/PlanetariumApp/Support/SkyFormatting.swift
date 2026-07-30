import Foundation
import PlanetariumCore

enum SkyFormatting {
    static func dateTime(_ date: Date, timeZoneIdentifier: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: timeZoneIdentifier) ?? .current
        formatter.dateFormat = "yyyy年M月d日（E） HH:mm"
        return formatter.string(from: date)
    }

    static func preciseDateTime(
        _ date: Date,
        timeZoneIdentifier: String
    ) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone =
            TimeZone(identifier: timeZoneIdentifier)
            ?? .current
        formatter.dateFormat = "yyyy年M月d日（E） HH:mm:ss.SSS z"
        return formatter.string(from: date)
    }

    static func timeZoneLabel(_ identifier: String, at date: Date) -> String {
        guard let timeZone = TimeZone(identifier: identifier) else {
            return identifier
        }
        let abbreviation = timeZone.abbreviation(for: date)
        return abbreviation.map { "\(identifier)（\($0)）" } ?? identifier
    }

    static func degrees(_ radians: Double, fractionDigits: Int = 1) -> String {
        AstronomicalFormatting.degrees(
            radians,
            fractionDigits: fractionDigits
        )
    }

    static func magnitude(_ value: Double) -> String {
        AstronomicalFormatting.decimal(value, fractionDigits: 2)
    }

    static func arcseconds(_ value: Double) -> String {
        AstronomicalFormatting.decimal(value, fractionDigits: 3) + "″"
    }

    static func signedSeconds(
        _ value: Double,
        fractionDigits: Int = 6
    ) -> String {
        guard value.isFinite else { return "—" }
        let sign = value < 0 ? "−" : "+"
        return sign
            + AstronomicalFormatting.decimal(
                abs(value),
                fractionDigits: fractionDigits
            )
            + " s"
    }

    static func uncertaintySeconds(
        _ value: Double,
        fractionDigits: Int = 6
    ) -> String {
        guard value.isFinite, value >= 0 else { return "—" }
        return "±"
            + AstronomicalFormatting.decimal(
                value,
                fractionDigits: fractionDigits
            )
            + " s"
    }

    static func signedArcseconds(
        radians: Double,
        fractionDigits: Int = 6
    ) -> String {
        guard radians.isFinite else { return "—" }
        let arcseconds =
            radians * 180 / Double.pi * 3_600
        let sign = arcseconds < 0 ? "−" : "+"
        return sign
            + AstronomicalFormatting.decimal(
                abs(arcseconds),
                fractionDigits: fractionDigits
            )
            + "″"
    }

    static func uncertaintyArcseconds(
        radians: Double,
        fractionDigits: Int = 6
    ) -> String {
        guard radians.isFinite, radians >= 0 else {
            return "—"
        }
        let arcseconds =
            radians * 180 / Double.pi * 3_600
        return "±"
            + AstronomicalFormatting.decimal(
                arcseconds,
                fractionDigits: fractionDigits
            )
            + "″"
    }

    static func utcDate(mjdUtc: Int) -> String {
        let date = Date(
            timeIntervalSince1970:
                (Double(mjdUtc) - 40_587) * 86_400
        )
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func rightAscension(
        _ radians: Double,
        fractionDigits: Int = 1
    ) -> String {
        AstronomicalFormatting.rightAscension(
            radians,
            fractionDigits: fractionDigits
        )
    }

    static func declination(
        _ radians: Double,
        fractionDigits: Int = 1
    ) -> String {
        AstronomicalFormatting.declination(
            radians,
            fractionDigits: fractionDigits
        )
    }

    static func azimuth(
        _ radians: Double,
        fractionDigits: Int = 1
    ) -> String {
        AstronomicalFormatting.azimuth(
            radians,
            fractionDigits: fractionDigits
        )
    }

    static func azimuth(
        _ coordinates: HorizontalCoordinates,
        fractionDigits: Int = 1
    ) -> String {
        AstronomicalFormatting.azimuth(
            coordinates,
            fractionDigits: fractionDigits
        )
    }
}
