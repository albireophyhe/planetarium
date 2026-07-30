import Foundation
import PlanetariumCore

enum AtmosphericRefractionInputSource:
    String, CaseIterable, Hashable, Identifiable, Sendable
{
    case standard
    case manual

    var id: String { rawValue }

    var label: String {
        switch self {
        case .standard:
            "標準大気"
        case .manual:
            "手動入力"
        }
    }
}

struct AppliedAtmosphericRefraction: Hashable, Sendable {
    let inputSource: AtmosphericRefractionInputSource
    let atmosphere: AtmosphereV2

    static let standard = AppliedAtmosphericRefraction(
        inputSource: .standard,
        atmosphere: .standardVisual
    )
}

enum AtmosphericRefractionValidator {
    static func validateForSkyRendering(
        _ atmosphere: AtmosphereV2
    ) throws {
        let coefficients =
            try Astronomy.refractionCoefficientsV2(
                for: atmosphere
            )

        // The frame stores coefficients, while individual stars perform the
        // numerical inverse at render time. Exercise the complete supported
        // altitude interval before committing so an accepted edit cannot
        // later blank the rendered catalog at a vulnerable altitude.
        var altitudeDegrees =
            atmosphere
                .minimumGeometricAltitudeDegrees
        while altitudeDegrees < 90 {
            _ = try Astronomy.applyVisualRefractionV2(
                to: Angles.radians(
                    fromDegrees: altitudeDegrees
                ),
                coefficients: coefficients,
                minimumGeometricAltitudeDegrees:
                    atmosphere
                    .minimumGeometricAltitudeDegrees
            )
            altitudeDegrees += 0.25
        }
        _ = try Astronomy.applyVisualRefractionV2(
            to: Double.pi / 2,
            coefficients: coefficients,
            minimumGeometricAltitudeDegrees:
                atmosphere
                .minimumGeometricAltitudeDegrees
        )
    }
}

struct AtmosphericRefractionDraft: Hashable, Sendable {
    var inputSource: AtmosphericRefractionInputSource
    var pressureHPA: String
    var temperatureCelsius: String
    var relativeHumidityPercent: String
    var wavelengthMicrometers: String
    var minimumGeometricAltitudeDegrees: String

    init(
        inputSource: AtmosphericRefractionInputSource = .standard,
        manualAtmosphere: AtmosphereV2 = .standardVisual
    ) {
        self.inputSource = inputSource
        pressureHPA = Self.editableNumber(
            manualAtmosphere.pressureHPA
        )
        temperatureCelsius = Self.editableNumber(
            manualAtmosphere.temperatureCelsius
        )
        relativeHumidityPercent = Self.editableNumber(
            manualAtmosphere.relativeHumidity * 100
        )
        wavelengthMicrometers = Self.editableNumber(
            manualAtmosphere.wavelengthMicrometers
        )
        minimumGeometricAltitudeDegrees = Self.editableNumber(
            manualAtmosphere.minimumGeometricAltitudeDegrees
        )
    }

    func manualAtmosphere() throws -> AtmosphereV2 {
        AtmosphereV2(
            pressureHPA: try Self.number(
                pressureHPA,
                fieldName: "気圧"
            ),
            temperatureCelsius: try Self.number(
                temperatureCelsius,
                fieldName: "気温"
            ),
            relativeHumidity:
                try Self.number(
                    relativeHumidityPercent,
                    fieldName: "相対湿度"
                ) / 100,
            wavelengthMicrometers: try Self.number(
                wavelengthMicrometers,
                fieldName: "観測波長"
            ),
            minimumGeometricAltitudeDegrees: try Self.number(
                minimumGeometricAltitudeDegrees,
                fieldName: "最低適用高度"
            )
        )
    }

    private static func number(
        _ text: String,
        fieldName: String
    ) throws -> Double {
        let normalized = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "−", with: "-")
            .replacingOccurrences(of: "＋", with: "+")
        guard
            !normalized.isEmpty,
            let value = Double(normalized),
            value.isFinite
        else {
            throw AtmosphericRefractionInputError
                .invalidNumber(fieldName)
        }
        return value
    }

    private static func editableNumber(_ value: Double) -> String {
        var text = String(
            format: "%.6f",
            locale: Locale(identifier: "en_US_POSIX"),
            value
        )
        while text.contains("."), text.last == "0" {
            text.removeLast()
        }
        if text.last == "." {
            text.removeLast()
        }
        return text
    }
}

enum AtmosphericRefractionInputError:
    LocalizedError, Equatable
{
    case invalidNumber(String)
    case pressureOutOfRange
    case temperatureOutOfRange
    case humidityOutOfRange
    case wavelengthOutOfRange
    case minimumAltitudeOutOfRange
    case physicallyInvalid

    var errorDescription: String? {
        switch self {
        case let .invalidNumber(fieldName):
            "\(fieldName)は有限の数値で入力してください。"
        case .pressureOutOfRange:
            "気圧は0〜1100 hPaの範囲で入力してください。"
        case .temperatureOutOfRange:
            "気温は−100〜60°Cの範囲で入力してください。"
        case .humidityOutOfRange:
            "相対湿度は0〜100%の範囲で入力してください。"
        case .wavelengthOutOfRange:
            "観測波長は光学・近赤外の0.3〜2 µmの範囲で入力してください。"
        case .minimumAltitudeOutOfRange:
            "最低適用高度は5〜30°の範囲で入力してください。"
        case .physicallyInvalid:
            "この組み合わせでは安定した大気差を計算できません。"
        }
    }

    static func translated(
        from error: Error
    ) -> AtmosphericRefractionInputError {
        guard let precisionError =
            error as? PrecisionModelError
        else {
            return .physicallyInvalid
        }
        switch precisionError {
        case let .invalidAtmosphere(field):
            switch field {
            case "pressure":
                return .pressureOutOfRange
            case "temperature":
                return .temperatureOutOfRange
            case "humidity":
                return .humidityOutOfRange
            case "wavelength":
                return .wavelengthOutOfRange
            default:
                return .physicallyInvalid
            }
        case .invalidMinimumRefractionAltitude:
            return .minimumAltitudeOutOfRange
        default:
            return .physicallyInvalid
        }
    }
}
