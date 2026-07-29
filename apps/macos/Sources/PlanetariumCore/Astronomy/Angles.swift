import Foundation

public enum Angles {
    public static let twoPi = 2 * Double.pi

    public static func radians(fromDegrees degrees: Double) -> Double {
        degrees * .pi / 180
    }

    public static func degrees(fromRadians radians: Double) -> Double {
        radians * 180 / .pi
    }

    public static func normalizedRadians(_ radians: Double) -> Double {
        let value = radians.truncatingRemainder(dividingBy: twoPi)
        return value >= 0 ? value : value + twoPi
    }

    public static func normalizedDegrees(_ degrees: Double) -> Double {
        let value = degrees.truncatingRemainder(dividingBy: 360)
        return value >= 0 ? value : value + 360
    }

    public static func clamped(_ value: Double, lower: Double = -1, upper: Double = 1) -> Double {
        min(max(value, lower), upper)
    }
}
