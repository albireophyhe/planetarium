/*
 * This Swift derived work uses computations from the IAU SOFA
 * 2023-10-11 C routines gd2gc, apio, pvtob and atioq. It is not software
 * provided by or endorsed by SOFA.
 *
 * Differences from SOFA:
 * - the API accepts explicit ITRS and local East-North-Up vectors;
 * - WGS84 site position and rotational speed are evaluated directly rather
 *   than constructing the complete terrestrial-station PV vector;
 * - polar motion, the TIO locator, Earth rotation and refraction remain the
 *   caller's responsibility; and
 * - atioq's common first-order scale factor is replaced by an explicit final
 *   normalization, which leaves the direction unchanged.
 *
 * This is intentionally SOFA's conventional split-at-CIRS, first-order
 * diurnal-aberration correction. A future end-to-end relativistic pipeline
 * must instead combine terrestrial rotational velocity with the geocenter's
 * barycentric velocity and apply aberration once before precession-nutation.
 */
import Foundation

public struct HorizontalENUVectorV2: Hashable, Sendable {
    public let east: Double
    public let north: Double
    public let up: Double

    public init(east: Double, north: Double, up: Double) {
        self.east = east
        self.north = north
        self.up = up
    }

    public var isFinite: Bool {
        east.isFinite && north.isFinite && up.isFinite
    }

    public var length: Double {
        hypot(east, hypot(north, up))
    }
}

private enum DiurnalAberrationConstantsV2 {
    static let wgs84SemiMajorAxisMeters = 6_378_137.0
    static let wgs84Flattening = 1 / 298.257_223_563
    static let wgs84EccentricitySquared =
        wgs84Flattening * (2 - wgs84Flattening)
    static let earthRotationRadiansPerUT1Second =
        1.002_737_811_911_354_6
        * PrecisionConstants.twoPi
        / PrecisionConstants.secondsPerDay
    static let speedOfLightMetersPerSecond =
        PrecisionConstants.speedOfLightKilometersPerSecond * 1_000
    static let metersToAstronomicalUnits =
        1 / (PrecisionConstants.astronomicalUnitKilometers * 1_000)
}

private func wgs84PrimeVerticalRadiusV2(
    geodeticLatitudeRadians: Double,
    heightMeters: Double
) throws -> Double {
    guard geodeticLatitudeRadians.isFinite,
          abs(geodeticLatitudeRadians) <= Double.pi / 2
    else {
        throw PrecisionModelError.invalidGeodeticLatitude
    }
    guard heightMeters.isFinite else {
        throw PrecisionModelError.invalidWGS84EllipsoidHeight
    }
    let latitudeSine = sin(geodeticLatitudeRadians)
    let primeVerticalRadius =
        DiurnalAberrationConstantsV2.wgs84SemiMajorAxisMeters
        / sqrt(
            1
                - DiurnalAberrationConstantsV2
                .wgs84EccentricitySquared
                * latitudeSine
                * latitudeSine
        )
    guard primeVerticalRadius + heightMeters > 0 else {
        throw PrecisionModelError.invalidWGS84EllipsoidHeight
    }
    return primeVerticalRadius
}

public extension Astronomy {
    /**
     Magnitude |v|/c of a WGS84 observer's rotational velocity.

     Latitude is geodetic, not geocentric. Height is measured above the WGS84
     reference ellipsoid. At the repository's current location precision,
     `heightMeters == 0` is the explicit approximation.
     */
    static func diurnalAberrationMagnitudeV2(
        geodeticLatitudeRadians: Double,
        heightMeters: Double = 0
    ) throws -> Double {
        let primeVerticalRadius =
            try wgs84PrimeVerticalRadiusV2(
                geodeticLatitudeRadians:
                    geodeticLatitudeRadians,
                heightMeters: heightMeters
            )
        let distanceFromRotationAxis =
            (primeVerticalRadius + heightMeters)
            * cos(geodeticLatitudeRadians)
        let magnitude =
            abs(
                DiurnalAberrationConstantsV2
                    .earthRotationRadiansPerUT1Second
                    * distanceFromRotationAxis
            )
            / DiurnalAberrationConstantsV2
                .speedOfLightMetersPerSecond
        guard magnitude.isFinite,
              magnitude >= 0,
              magnitude < 1
        else {
            throw PrecisionModelError.invalidDiurnalAberrationMagnitude
        }
        return magnitude
    }

    /**
     WGS84 geodetic site position in ITRS, expressed in astronomical units.

     This is the geodetic-to-geocentric part of SOFA `gd2gc`/`pvtob`.
     Earth rotation and polar motion are absent because callers use the
     vector only after rotating the solar direction into ITRS.
     */
    static func wgs84ObserverPositionITRSAUV2(
        geodeticLatitudeRadians: Double,
        longitudeRadians: Double,
        heightMeters: Double = 0
    ) throws -> Vector3D {
        guard longitudeRadians.isFinite,
              abs(longitudeRadians) <= Double.pi
        else {
            throw PrecisionModelError.invalidLocation
        }
        let primeVerticalRadius =
            try wgs84PrimeVerticalRadiusV2(
                geodeticLatitudeRadians:
                    geodeticLatitudeRadians,
                heightMeters: heightMeters
            )
        let latitudeSine = sin(geodeticLatitudeRadians)
        let latitudeCosine = cos(geodeticLatitudeRadians)
        let longitudeSine = sin(longitudeRadians)
        let longitudeCosine = cos(longitudeRadians)
        let equatorialRadius =
            primeVerticalRadius + heightMeters
        let polarRadius =
            (
                1
                    - DiurnalAberrationConstantsV2
                    .wgs84EccentricitySquared
            )
            * primeVerticalRadius
            + heightMeters
        let metersToAU =
            DiurnalAberrationConstantsV2
                .metersToAstronomicalUnits
        return Vector3D(
            x:
                equatorialRadius
                * latitudeCosine
                * longitudeCosine
                * metersToAU,
            y:
                equatorialRadius
                * latitudeCosine
                * longitudeSine
                * metersToAU,
            z: polarRadius * latitudeSine * metersToAU
        )
    }

    /**
     Converts a geocentric ITRS direction and distance to the unit direction
     from an actual terrestrial observer. Apply this before split-at-CIRS
     diurnal aberration.
     */
    static func applyTopocentricParallaxToITRSDirectionV2(
        geocentricUnitDirection: Vector3D,
        geocentricDistanceAU: Double,
        observerPositionITRSAU: Vector3D
    ) throws -> Vector3D {
        guard geocentricDistanceAU.isFinite,
              geocentricDistanceAU > 0
        else {
            throw PrecisionModelError.invalidSunObserverDistance
        }
        guard observerPositionITRSAU.isFinite else {
            throw PrecisionModelError.invalidVector
        }
        let unit = try precisionNormalized(
            geocentricUnitDirection
        )
        return try precisionNormalized(
            geocentricDistanceAU * unit
                - observerPositionITRSAU
        )
    }

    /**
     Applies conventional split-at-CIRS diurnal aberration to a geometric
     local direction. Components are East, North and Up, all right-handed.

     Positive terrestrial rotational velocity is eastward, so the correction
     adds `magnitude` to the east component. Call this after Earth rotation
     and polar motion, but before horizon angles and refraction.
     */
    static func applyDiurnalAberrationToHorizontalENUV2(
        _ geometricDirection: HorizontalENUVectorV2,
        magnitude: Double
    ) throws -> HorizontalENUVectorV2 {
        guard magnitude.isFinite,
              magnitude >= 0,
              magnitude < 1
        else {
            throw PrecisionModelError.invalidDiurnalAberrationMagnitude
        }
        let geometricLength = geometricDirection.length
        guard geometricDirection.isFinite,
              geometricLength.isFinite,
              geometricLength > 0
        else {
            throw PrecisionModelError.invalidVector
        }

        let unitEast =
            geometricDirection.east / geometricLength
        let unitNorth =
            geometricDirection.north / geometricLength
        let unitUp =
            geometricDirection.up / geometricLength
        let correctedLength = hypot(
            unitEast + magnitude,
            hypot(unitNorth, unitUp)
        )
        guard correctedLength.isFinite, correctedLength > 0 else {
            throw PrecisionModelError.invalidVector
        }
        return HorizontalENUVectorV2(
            east: (unitEast + magnitude) / correctedLength,
            north: unitNorth / correctedLength,
            up: unitUp / correctedLength
        )
    }
}
