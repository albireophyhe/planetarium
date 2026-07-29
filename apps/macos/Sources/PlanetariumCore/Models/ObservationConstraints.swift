import Foundation

public enum ObservationValidationError: LocalizedError, Equatable, Sendable {
    case invalidLatitudeNumber
    case invalidLongitudeNumber
    case invalidLatitude
    case invalidLongitude
    case invalidTimeZone

    public var errorDescription: String? {
        switch self {
        case .invalidLatitudeNumber:
            "緯度は半角数字で入力し、小数点には「.」を使用してください。"
        case .invalidLongitudeNumber:
            "経度は半角数字で入力し、小数点には「.」を使用してください。"
        case .invalidLatitude:
            "緯度は−90°から90°の数値で入力してください。"
        case .invalidLongitude:
            "経度は−180°から180°の数値で入力してください。"
        case .invalidTimeZone:
            "IANAタイムゾーン（例: Asia/Tokyo）を入力してください。"
        }
    }
}

public enum ObservationDateBoundary: Equatable, Sendable {
    case minimum
    case maximum
}

public struct ObservationDateStepResult: Equatable, Sendable {
    public let date: Date
    public let reachedBoundary: ObservationDateBoundary?

    public init(date: Date, reachedBoundary: ObservationDateBoundary?) {
        self.date = date
        self.reachedBoundary = reachedBoundary
    }
}

public enum ObservationConstraints {
    public static let minimumDate = Date(timeIntervalSince1970: -2_208_988_800)
    public static let maximumDate = Date(timeIntervalSince1970: 4_133_980_799.999)
    public static let supportedDateRange = minimumDate...maximumDate

    public static func clampedDate(_ date: Date) -> Date {
        clampedDateAndBoundary(date).date
    }

    private static func clampedDateAndBoundary(
        _ date: Date
    ) -> (date: Date, boundary: ObservationDateBoundary?) {
        let seconds = date.timeIntervalSinceReferenceDate
        if seconds == .infinity {
            return (maximumDate, .maximum)
        }
        guard seconds.isFinite else {
            return (minimumDate, .minimum)
        }
        if date < minimumDate {
            return (minimumDate, .minimum)
        }
        if date > maximumDate {
            return (maximumDate, .maximum)
        }
        return (date, nil)
    }

    public static func steppedDate(
        from date: Date,
        hours: Int
    ) -> ObservationDateStepResult {
        let startingDate = clampedDate(date)
        let proposed = startingDate.addingTimeInterval(
            Double(hours) * 3_600
        )
        let result = clampedDateAndBoundary(proposed)
        return ObservationDateStepResult(
            date: result.date,
            reachedBoundary: result.boundary
        )
    }

    public static func validatedLocation(
        id: String,
        name: String,
        latitude: Double,
        longitude: Double,
        timeZoneIdentifier: String
    ) throws -> ObservingLocation {
        guard latitude.isFinite, (-90...90).contains(latitude) else {
            throw ObservationValidationError.invalidLatitude
        }
        guard longitude.isFinite, (-180...180).contains(longitude) else {
            throw ObservationValidationError.invalidLongitude
        }

        let normalizedTimeZone = timeZoneIdentifier.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard TimeZone(identifier: normalizedTimeZone) != nil else {
            throw ObservationValidationError.invalidTimeZone
        }

        let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return ObservingLocation(
            id: id,
            name: normalizedName.isEmpty ? "指定地点" : normalizedName,
            latitude: latitude,
            longitude: longitude,
            timeZoneIdentifier: normalizedTimeZone
        )
    }

    public static func validatedLocation(
        id: String,
        name: String,
        latitudeText: String,
        longitudeText: String,
        timeZoneIdentifier: String
    ) throws -> ObservingLocation {
        let latitude = try parsedCoordinate(
            latitudeText,
            error: .invalidLatitudeNumber
        )
        let longitude = try parsedCoordinate(
            longitudeText,
            error: .invalidLongitudeNumber
        )
        return try validatedLocation(
            id: id,
            name: name,
            latitude: latitude,
            longitude: longitude,
            timeZoneIdentifier: timeZoneIdentifier
        )
    }

    private static func parsedCoordinate(
        _ rawValue: String,
        error: ObservationValidationError
    ) throws -> Double {
        let normalized = rawValue
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.widthInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .replacingOccurrences(of: "−", with: "-")

        // A comma is ambiguous between a decimal separator and a thousands
        // separator. Reject it instead of silently moving the observation site.
        guard !normalized.contains(","),
              let value = Double(normalized)
        else {
            throw error
        }
        return value
    }
}
