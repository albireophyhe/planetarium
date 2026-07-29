import PlanetariumCore
import SwiftUI

struct SkyPalette {
    let canvas: Color
    let zenith: Color
    let horizon: Color

    static func palette(for phase: TwilightPhase, nightMode: Bool) -> SkyPalette {
        if nightMode {
            return SkyPalette(
                canvas: Color(red: 0.025, green: 0.006, blue: 0.006),
                zenith: Color(red: 0.105, green: 0.015, blue: 0.015),
                horizon: Color(red: 0.025, green: 0.006, blue: 0.006)
            )
        }

        return switch phase {
        case .day:
            SkyPalette(
                canvas: Color(red: 0.018, green: 0.095, blue: 0.18),
                zenith: Color(red: 0.08, green: 0.28, blue: 0.46),
                horizon: Color(red: 0.025, green: 0.13, blue: 0.24)
            )
        case .civil:
            SkyPalette(
                canvas: Color(red: 0.035, green: 0.055, blue: 0.14),
                zenith: Color(red: 0.13, green: 0.18, blue: 0.34),
                horizon: Color(red: 0.11, green: 0.075, blue: 0.18)
            )
        case .nautical:
            SkyPalette(
                canvas: Color(red: 0.018, green: 0.042, blue: 0.095),
                zenith: Color(red: 0.07, green: 0.14, blue: 0.27),
                horizon: Color(red: 0.035, green: 0.055, blue: 0.13)
            )
        case .astronomical:
            SkyPalette(
                canvas: Color(red: 0.012, green: 0.034, blue: 0.072),
                zenith: Color(red: 0.045, green: 0.115, blue: 0.20),
                horizon: Color(red: 0.014, green: 0.038, blue: 0.082)
            )
        case .night:
            SkyPalette(
                canvas: Color(red: 0.007, green: 0.02, blue: 0.045),
                zenith: Color(red: 0.028, green: 0.08, blue: 0.15),
                horizon: Color(red: 0.008, green: 0.024, blue: 0.052)
            )
        }
    }
}
