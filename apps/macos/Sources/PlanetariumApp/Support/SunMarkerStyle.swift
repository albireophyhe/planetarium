import CoreGraphics
import SwiftUI

struct SunMarkerMetrics: Equatable {
    let diameter: CGFloat
    let outerDiameter: CGFloat
    let opacity: Double
    let outlineOpacity: Double
    let lineWidth: CGFloat
    let labelOpacity: Double
    let usesDashedOutline: Bool
}

enum SunMarkerStyle {
    static func isVisibleInTwoD(
        altitudeRadians: Double
    ) -> Bool {
        altitudeRadians.isFinite && altitudeRadians >= 0
    }

    static func twoDMetrics(
        increasedContrast: Bool
    ) -> SunMarkerMetrics {
        SunMarkerMetrics(
            diameter: increasedContrast ? 9 : 7,
            outerDiameter: increasedContrast ? 14 : 11,
            opacity: increasedContrast ? 1 : 0.88,
            outlineOpacity: increasedContrast ? 1 : 0.62,
            lineWidth: increasedContrast ? 1.6 : 1,
            labelOpacity: increasedContrast ? 1 : 0.84,
            usesDashedOutline: false
        )
    }

    static func threeDMetrics(
        isAboveHorizon: Bool,
        isFrontFacing: Bool,
        increasedContrast: Bool
    ) -> SunMarkerMetrics {
        let horizonMultiplier = isAboveHorizon
            ? 1
            : (increasedContrast ? 0.50 : 0.34)
        let facingMultiplier = isFrontFacing
            ? 1
            : (increasedContrast ? 0.68 : 0.52)
        let visibility = horizonMultiplier * facingMultiplier
        let opacity =
            (increasedContrast ? 1 : 0.90) * visibility

        return SunMarkerMetrics(
            diameter: increasedContrast ? 9 : 7,
            outerDiameter: increasedContrast ? 14 : 11,
            opacity: opacity,
            outlineOpacity: min(
                1,
                opacity + (increasedContrast ? 0.20 : 0.12)
            ),
            lineWidth: increasedContrast ? 1.6 : 1,
            labelOpacity: min(1, opacity + 0.10),
            usesDashedOutline:
                !isAboveHorizon || !isFrontFacing
        )
    }

    static func markerColor(nightMode: Bool) -> Color {
        nightMode
            ? Color(red: 0.98, green: 0.27, blue: 0.21)
            : Color(red: 1, green: 0.72, blue: 0.24)
    }

    static func outlineColor(
        nightMode: Bool,
        increasedContrast: Bool
    ) -> Color {
        if nightMode {
            return increasedContrast
                ? Color(red: 1, green: 0.72, blue: 0.68)
                : Color(red: 1, green: 0.47, blue: 0.39)
        }
        return increasedContrast
            ? .white
            : Color(red: 1, green: 0.91, blue: 0.64)
    }
}
