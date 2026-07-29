import PlanetariumCore
import SwiftUI

enum StarTrajectoryStyle {
    static func twoDColor(nightMode: Bool) -> Color {
        nightMode
            ? Color(
                red: 240 / 255,
                green: 109 / 255,
                blue: 99 / 255
            )
            : Color(
                red: 139 / 255,
                green: 200 / 255,
                blue: 1
            )
    }

    static func twoDLineOpacity(
        progress: Double,
        nightMode: Bool,
        increasedContrast: Bool
    ) -> Double {
        let base =
            (nightMode ? 0.38 : 0.36)
            + (nightMode ? 0.40 : 0.44)
                * clampedProgress(progress)
        return min(1, base + (increasedContrast ? 0.16 : 0))
    }

    static func twoDPointOpacity(
        progress: Double,
        nightMode: Bool,
        increasedContrast: Bool
    ) -> Double {
        let base =
            (nightMode ? 0.56 : 0.54)
            + (nightMode ? 0.40 : 0.42)
                * clampedProgress(progress)
        return min(1, base + (increasedContrast ? 0.08 : 0))
    }

    static func twoDPointDiameter(
        progress: Double,
        compact: Bool,
        increasedContrast: Bool
    ) -> CGFloat {
        let radius =
            (compact ? 1.20 : 1.45)
            + 1.35 * clampedProgress(progress)
            + (increasedContrast ? 0.55 : 0)
        return CGFloat(radius * 2)
    }

    static func twoDLineStyle(
        temporalPosition: StarTrajectoryTemporalPosition,
        compact: Bool,
        increasedContrast: Bool
    ) -> StrokeStyle {
        StrokeStyle(
            lineWidth:
                (compact ? 1.2 : 1.55)
                + (increasedContrast ? 0.7 : 0),
            lineCap: .round,
            lineJoin: .round,
            dash: temporalPosition == .past
                ? (increasedContrast ? [3, 2] : [2, 3])
                : []
        )
    }

    static func threeDColor(
        progress: Double,
        nightMode: Bool
    ) -> Color {
        let start = nightMode
            ? RGB(red: 173, green: 51, blue: 43)
            : RGB(red: 92, green: 168, blue: 240)
        let end = nightMode
            ? RGB(red: 250, green: 110, blue: 97)
            : RGB(red: 179, green: 219, blue: 255)
        return start.interpolated(
            to: end,
            progress: clampedProgress(progress)
        ).color
    }

    static func threeDLineOpacity(
        progress: Double,
        increasedContrast: Bool
    ) -> Double {
        min(
            1,
            0.52 + 0.36 * clampedProgress(progress)
                + (increasedContrast ? 0.10 : 0)
        )
    }

    static func threeDPointOpacity(
        progress: Double,
        increasedContrast: Bool
    ) -> Double {
        min(
            1,
            0.78 + 0.20 * clampedProgress(progress)
                + (increasedContrast ? 0.02 : 0)
        )
    }

    static func threeDPointDiameter(
        progress: Double,
        increasedContrast: Bool
    ) -> CGFloat {
        CGFloat(
            2.8 + 3 * clampedProgress(progress)
                + (increasedContrast ? 1.25 : 0)
        )
    }

    static func threeDVisibilityMultiplier(
        isAboveHorizon: Bool,
        isFrontFacing: Bool
    ) -> Double {
        (isAboveHorizon ? 1 : 0.36)
            * (isFrontFacing ? 1 : 0.52)
    }

    static func outlineColor(nightMode: Bool) -> Color {
        nightMode
            ? Color(red: 1, green: 0.72, blue: 0.68)
            : .white
    }

    private static func clampedProgress(_ progress: Double) -> Double {
        min(1, max(0, progress.isFinite ? progress : 0))
    }
}

private struct RGB {
    let red: Double
    let green: Double
    let blue: Double

    func interpolated(to end: Self, progress: Double) -> Self {
        Self(
            red: red + (end.red - red) * progress,
            green: green + (end.green - green) * progress,
            blue: blue + (end.blue - blue) * progress
        )
    }

    var color: Color {
        Color(
            red: red / 255,
            green: green / 255,
            blue: blue / 255
        )
    }
}
