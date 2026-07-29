import Foundation

/*
 * This Swift derived work is based on computations in the IAU SOFA
 * 2023-10-11 C routines `nut00b`, `obl06`, `pfw06`, `fw2m`, `era00`, and
 * `gmst06`. It is not software provided by or endorsed by SOFA.
 *
 * This implementation changes language, API, date representation, error
 * handling, and composition. It combines IAU 2006 bias/precession with the
 * abridged IAU 2000B series and uses only the leading equation-of-equinoxes
 * term for apparent sidereal time. Differences and the full license are in
 * `SOFA-NOTICE.md`; model scope is in `docs/astronomy-model-v2.md`.
 */

private struct NutationTermV2: Sendable {
    let moonAnomaly: Int
    let sunAnomaly: Int
    let moonLatitude: Int
    let elongation: Int
    let ascendingNode: Int
    let longitudeSine: Double
    let longitudeSineRate: Double
    let longitudeCosine: Double
    let obliquityCosine: Double
    let obliquityCosineRate: Double
    let obliquitySine: Double

    init(
        _ moonAnomaly: Int,
        _ sunAnomaly: Int,
        _ moonLatitude: Int,
        _ elongation: Int,
        _ ascendingNode: Int,
        _ longitudeSine: Double,
        _ longitudeSineRate: Double,
        _ longitudeCosine: Double,
        _ obliquityCosine: Double,
        _ obliquityCosineRate: Double,
        _ obliquitySine: Double
    ) {
        self.moonAnomaly = moonAnomaly
        self.sunAnomaly = sunAnomaly
        self.moonLatitude = moonLatitude
        self.elongation = elongation
        self.ascendingNode = ascendingNode
        self.longitudeSine = longitudeSine
        self.longitudeSineRate = longitudeSineRate
        self.longitudeCosine = longitudeCosine
        self.obliquityCosine = obliquityCosine
        self.obliquityCosineRate = obliquityCosineRate
        self.obliquitySine = obliquitySine
    }
}
/*
 * MHB_2000_SHORT, 77 luni-solar terms. Coefficients are in 0.1 µas and
 * 0.1 µas per Julian century, matching the SOFA 2023-10-11 implementation.
 */
private let nutation2000BTerms: [NutationTermV2] = [
    .init(0, 0, 0, 0, 1, -172064161, -174666, 33386, 92052331, 9086, 15377),
    .init(0, 0, 2, -2, 2, -13170906, -1675, -13696, 5730336, -3015, -4587),
    .init(0, 0, 2, 0, 2, -2276413, -234, 2796, 978459, -485, 1374),
    .init(0, 0, 0, 0, 2, 2074554, 207, -698, -897492, 470, -291),
    .init(0, 1, 0, 0, 0, 1475877, -3633, 11817, 73871, -184, -1924),
    .init(0, 1, 2, -2, 2, -516821, 1226, -524, 224386, -677, -174),
    .init(1, 0, 0, 0, 0, 711159, 73, -872, -6750, 0, 358),
    .init(0, 0, 2, 0, 1, -387298, -367, 380, 200728, 18, 318),
    .init(1, 0, 2, 0, 2, -301461, -36, 816, 129025, -63, 367),
    .init(0, -1, 2, -2, 2, 215829, -494, 111, -95929, 299, 132),
    .init(0, 0, 2, -2, 1, 128227, 137, 181, -68982, -9, 39),
    .init(-1, 0, 2, 0, 2, 123457, 11, 19, -53311, 32, -4),
    .init(-1, 0, 0, 2, 0, 156994, 10, -168, -1235, 0, 82),
    .init(1, 0, 0, 0, 1, 63110, 63, 27, -33228, 0, -9),
    .init(-1, 0, 0, 0, 1, -57976, -63, -189, 31429, 0, -75),
    .init(-1, 0, 2, 2, 2, -59641, -11, 149, 25543, -11, 66),
    .init(1, 0, 2, 0, 1, -51613, -42, 129, 26366, 0, 78),
    .init(-2, 0, 2, 0, 1, 45893, 50, 31, -24236, -10, 20),
    .init(0, 0, 0, 2, 0, 63384, 11, -150, -1220, 0, 29),
    .init(0, 0, 2, 2, 2, -38571, -1, 158, 16452, -11, 68),
    .init(0, -2, 2, -2, 2, 32481, 0, 0, -13870, 0, 0),
    .init(-2, 0, 0, 2, 0, -47722, 0, -18, 477, 0, -25),
    .init(2, 0, 2, 0, 2, -31046, -1, 131, 13238, -11, 59),
    .init(1, 0, 2, -2, 2, 28593, 0, -1, -12338, 10, -3),
    .init(-1, 0, 2, 0, 1, 20441, 21, 10, -10758, 0, -3),
    .init(2, 0, 0, 0, 0, 29243, 0, -74, -609, 0, 13),
    .init(0, 0, 2, 0, 0, 25887, 0, -66, -550, 0, 11),
    .init(0, 1, 0, 0, 1, -14053, -25, 79, 8551, -2, -45),
    .init(-1, 0, 0, 2, 1, 15164, 10, 11, -8001, 0, -1),
    .init(0, 2, 2, -2, 2, -15794, 72, -16, 6850, -42, -5),
    .init(0, 0, -2, 2, 0, 21783, 0, 13, -167, 0, 13),
    .init(1, 0, 0, -2, 1, -12873, -10, -37, 6953, 0, -14),
    .init(0, -1, 0, 0, 1, -12654, 11, 63, 6415, 0, 26),
    .init(-1, 0, 2, 2, 1, -10204, 0, 25, 5222, 0, 15),
    .init(0, 2, 0, 0, 0, 16707, -85, -10, 168, -1, 10),
    .init(1, 0, 2, 2, 2, -7691, 0, 44, 3268, 0, 19),
    .init(-2, 0, 2, 0, 0, -11024, 0, -14, 104, 0, 2),
    .init(0, 1, 2, 0, 2, 7566, -21, -11, -3250, 0, -5),
    .init(0, 0, 2, 2, 1, -6637, -11, 25, 3353, 0, 14),
    .init(0, -1, 2, 0, 2, -7141, 21, 8, 3070, 0, 4),
    .init(0, 0, 0, 2, 1, -6302, -11, 2, 3272, 0, 4),
    .init(1, 0, 2, -2, 1, 5800, 10, 2, -3045, 0, -1),
    .init(2, 0, 2, -2, 2, 6443, 0, -7, -2768, 0, -4),
    .init(-2, 0, 0, 2, 1, -5774, -11, -15, 3041, 0, -5),
    .init(2, 0, 2, 0, 1, -5350, 0, 21, 2695, 0, 12),
    .init(0, -1, 2, -2, 1, -4752, -11, -3, 2719, 0, -3),
    .init(0, 0, 0, -2, 1, -4940, -11, -21, 2720, 0, -9),
    .init(-1, -1, 0, 2, 0, 7350, 0, -8, -51, 0, 4),
    .init(2, 0, 0, -2, 1, 4065, 0, 6, -2206, 0, 1),
    .init(1, 0, 0, 2, 0, 6579, 0, -24, -199, 0, 2),
    .init(0, 1, 2, -2, 1, 3579, 0, 5, -1900, 0, 1),
    .init(1, -1, 0, 0, 0, 4725, 0, -6, -41, 0, 3),
    .init(-2, 0, 2, 0, 2, -3075, 0, -2, 1313, 0, -1),
    .init(3, 0, 2, 0, 2, -2904, 0, 15, 1233, 0, 7),
    .init(0, -1, 0, 2, 0, 4348, 0, -10, -81, 0, 2),
    .init(1, -1, 2, 0, 2, -2878, 0, 8, 1232, 0, 4),
    .init(0, 0, 0, 1, 0, -4230, 0, 5, -20, 0, -2),
    .init(-1, -1, 2, 2, 2, -2819, 0, 7, 1207, 0, 3),
    .init(-1, 0, 2, 0, 0, -4056, 0, 5, 40, 0, -2),
    .init(0, -1, 2, 2, 2, -2647, 0, 11, 1129, 0, 5),
    .init(-2, 0, 0, 0, 1, -2294, 0, -10, 1266, 0, -4),
    .init(1, 1, 2, 0, 2, 2481, 0, -7, -1062, 0, -3),
    .init(2, 0, 0, 0, 1, 2179, 0, -2, -1129, 0, -2),
    .init(-1, 1, 0, 1, 0, 3276, 0, 1, -9, 0, 0),
    .init(1, 1, 0, 0, 0, -3389, 0, 5, 35, 0, -2),
    .init(1, 0, 2, 0, 0, 3339, 0, -13, -107, 0, 1),
    .init(-1, 0, 2, -2, 1, -1987, 0, -6, 1073, 0, -2),
    .init(1, 0, 0, 0, 2, -1981, 0, 0, 854, 0, 0),
    .init(-1, 0, 0, 1, 0, 4026, 0, -353, -553, 0, -139),
    .init(0, 0, 2, 1, 2, 1660, 0, -5, -710, 0, -2),
    .init(-1, 0, 2, 4, 2, -1521, 0, 9, 647, 0, 4),
    .init(-1, 1, 0, 1, 1, 1314, 0, 0, -700, 0, 0),
    .init(0, -2, 2, -2, 1, -1283, 0, 0, 672, 0, 0),
    .init(1, 0, 2, 2, 1, -1331, 0, 8, 663, 0, 4),
    .init(-2, 0, 2, 2, 2, 1383, 0, -2, -594, 0, -2),
    .init(-1, 0, 0, 0, 2, 1405, 0, 4, -610, 0, 2),
    .init(1, 1, 2, -2, 2, 1290, 0, 0, -556, 0, 0),
]

public struct NutationAnglesV2: Hashable, Sendable {
    public let longitude: Double
    public let obliquity: Double
}

public struct FukushimaWilliamsAnglesV2: Hashable, Sendable {
    public let gamma: Double
    public let phi: Double
    public let psi: Double
    public let obliquity: Double
}

private func julianCenturiesV2(
    ttJulianDate: Double
) throws -> Double {
    guard ttJulianDate.isFinite else {
        throw PrecisionModelError.nonFiniteValue("TT Julian date")
    }
    return (
        ttJulianDate - Astronomy.j2000JulianDate
    ) / PrecisionConstants.daysPerJulianCentury
}

public extension Astronomy {
    static func meanObliquity2006V2(
        ttJulianDate: Double
    ) throws -> Double {
        let centuries = try julianCenturiesV2(
            ttJulianDate: ttJulianDate
        )
        let squared = centuries * centuries
        let cubed = squared * centuries
        let fourth = cubed * centuries
        let fifth = fourth * centuries
        return (
            84_381.406
                - 46.836769 * centuries
                - 0.0001831 * squared
                + 0.0020034 * cubed
                - 0.000000576 * fourth
                - 0.0000000434 * fifth
        ) * PrecisionConstants.arcsecondsToRadians
    }

    static func nutation2000BV2(
        ttJulianDate: Double
    ) throws -> NutationAnglesV2 {
        let centuries = try julianCenturiesV2(
            ttJulianDate: ttJulianDate
        )
        let turnArcseconds = 1_296_000.0
        func arcsecondArgument(
            base: Double,
            rate: Double
        ) -> Double {
            (base + rate * centuries)
                .truncatingRemainder(dividingBy: turnArcseconds)
                * PrecisionConstants.arcsecondsToRadians
        }

        let moonAnomaly = arcsecondArgument(
            base: 485_868.249036,
            rate: 1_717_915_923.2178
        )
        let sunAnomaly = arcsecondArgument(
            base: 1_287_104.79305,
            rate: 129_596_581.0481
        )
        let moonLatitude = arcsecondArgument(
            base: 335_779.526232,
            rate: 1_739_527_262.8478
        )
        let elongation = arcsecondArgument(
            base: 1_072_260.70369,
            rate: 1_602_961_601.209
        )
        let ascendingNode = arcsecondArgument(
            base: 450_160.398036,
            rate: -6_962_890.5431
        )

        var longitude = 0.0
        var obliquity = 0.0
        for term in nutation2000BTerms.reversed() {
            let argument = (
                Double(term.moonAnomaly) * moonAnomaly
                    + Double(term.sunAnomaly) * sunAnomaly
                    + Double(term.moonLatitude) * moonLatitude
                    + Double(term.elongation) * elongation
                    + Double(term.ascendingNode) * ascendingNode
            ).truncatingRemainder(
                dividingBy: PrecisionConstants.twoPi
            )
            let sine = sin(argument)
            let cosine = cos(argument)
            longitude +=
                (term.longitudeSine
                    + term.longitudeSineRate * centuries)
                * sine
                + term.longitudeCosine * cosine
            obliquity +=
                (term.obliquityCosine
                    + term.obliquityCosineRate * centuries)
                * cosine
                + term.obliquitySine * sine
        }

        let unitsToRadians =
            PrecisionConstants.arcsecondsToRadians / 10_000_000
        return NutationAnglesV2(
            longitude:
                longitude * unitsToRadians
                - 0.135
                * PrecisionConstants.milliarcsecondsToRadians,
            obliquity:
                obliquity * unitsToRadians
                + 0.388
                * PrecisionConstants.milliarcsecondsToRadians
        )
    }

    static func fukushimaWilliams2006V2(
        ttJulianDate: Double
    ) throws -> FukushimaWilliamsAnglesV2 {
        let centuries = try julianCenturiesV2(
            ttJulianDate: ttJulianDate
        )
        let squared = centuries * centuries
        let cubed = squared * centuries
        let fourth = cubed * centuries
        let fifth = fourth * centuries
        let gamma =
            (
                -0.052928
                    + 10.556378 * centuries
                    + 0.4932044 * squared
                    - 0.00031238 * cubed
                    - 0.000002788 * fourth
                    + 0.000000026 * fifth
            )
            * PrecisionConstants.arcsecondsToRadians
        let phi =
            (
                84_381.412819
                    - 46.811016 * centuries
                    + 0.0511268 * squared
                    + 0.00053289 * cubed
                    - 0.00000044 * fourth
                    - 0.0000000176 * fifth
            )
            * PrecisionConstants.arcsecondsToRadians
        let psi =
            (
                -0.041775
                    + 5_038.481484 * centuries
                    + 1.5584175 * squared
                    - 0.00018522 * cubed
                    - 0.000026452 * fourth
                    - 0.0000000148 * fifth
            )
            * PrecisionConstants.arcsecondsToRadians
        return FukushimaWilliamsAnglesV2(
            gamma: gamma,
            phi: phi,
            psi: psi,
            obliquity: try meanObliquity2006V2(
                ttJulianDate: ttJulianDate
            )
        )
    }

    /**
     GCRS-like J2000 to true equator/equinox-of-date matrix. The deliberate
     v2 compromise is IAU 2006 bias/precession combined with abridged IAU
     2000B nutation instead of the formally matched full 2000A series.
     */
    static func precessionNutationMatrix2006BV2(
        ttJulianDate: Double
    ) throws -> PrecisionMatrix3 {
        let angles = try fukushimaWilliams2006V2(
            ttJulianDate: ttJulianDate
        )
        let nutation = try nutation2000BV2(
            ttJulianDate: ttJulianDate
        )
        return .composedPassiveRotations(
            .passiveRotationZ(angles.gamma),
            .passiveRotationX(angles.phi),
            .passiveRotationZ(-angles.psi - nutation.longitude),
            .passiveRotationX(
                -angles.obliquity - nutation.obliquity
            )
        )
    }

    static func applyPrecessionNutation2006BV2(
        _ coordinates: EquatorialCoordinates,
        ttJulianDate: Double
    ) throws -> EquatorialCoordinates {
        try precisionVectorToEquatorial(
            precessionNutationMatrix2006BV2(
                ttJulianDate: ttJulianDate
            ).applying(to: precisionEquatorialToVector(coordinates))
        )
    }

    /// IAU 2000 Earth Rotation Angle. UT1, rather than UTC, is significant.
    static func earthRotationAngleV2(
        ut1JulianDate: Double
    ) throws -> Double {
        guard ut1JulianDate.isFinite else {
            throw PrecisionModelError.nonFiniteValue("UT1 Julian date")
        }
        let daysSinceJ2000 =
            ut1JulianDate - Astronomy.j2000JulianDate
        let fraction = daysSinceJ2000.truncatingRemainder(
            dividingBy: 1
        )
        return Angles.normalizedRadians(
            PrecisionConstants.twoPi
                * (
                    fraction
                        + 0.779057273264
                        + 0.00273781191135448 * daysSinceJ2000
                )
        )
    }

    static func greenwichMeanSiderealTime2006V2(
        ut1JulianDate: Double,
        ttJulianDate: Double
    ) throws -> Double {
        let centuries = try julianCenturiesV2(
            ttJulianDate: ttJulianDate
        )
        let squared = centuries * centuries
        let cubed = squared * centuries
        let fourth = cubed * centuries
        let fifth = fourth * centuries
        let polynomialArcseconds =
            0.014506
            + 4_612.156534 * centuries
            + 1.3915817 * squared
            - 0.00000044 * cubed
            - 0.000029956 * fourth
            - 0.0000000368 * fifth
        return Angles.normalizedRadians(
            try earthRotationAngleV2(
                ut1JulianDate: ut1JulianDate
            )
                + polynomialArcseconds
                * PrecisionConstants.arcsecondsToRadians
        )
    }

    /**
     Apparent sidereal time for the abridged v2 model. Complementary terms in
     the equation of the equinoxes are deliberately omitted and measured
     against the official SOFA C oracle in the v2 accuracy fixture.
     */
    static func greenwichApparentSiderealTime2006BV2(
        ut1JulianDate: Double,
        ttJulianDate: Double
    ) throws -> Double {
        let nutation = try nutation2000BV2(
            ttJulianDate: ttJulianDate
        )
        return Angles.normalizedRadians(
            try greenwichMeanSiderealTime2006V2(
                ut1JulianDate: ut1JulianDate,
                ttJulianDate: ttJulianDate
            )
                + nutation.longitude
                * cos(
                    try meanObliquity2006V2(
                        ttJulianDate: ttJulianDate
                    )
                )
        )
    }
}
