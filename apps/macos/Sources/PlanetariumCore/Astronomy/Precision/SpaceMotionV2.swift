import Foundation

public struct SpaceMotionResultV2: Hashable, Sendable {
    public let coordinates: EquatorialCoordinates
    /**
     Propagated SSB-relative, Hipparcos/ICRS-aligned stellar position in AU
     when the catalogue contains a positive parallax.
     */
    public let astrometricPositionAU: Vector3D?
    public let mode: SpaceMotionModeV2
    public let radialVelocityAssumedZero: Bool
}

private func validateCatalogDirectionV2(_ star: CatalogStar) throws {
    guard star.rightAscension.isFinite,
          (0..<PrecisionConstants.twoPi).contains(star.rightAscension),
          star.declination.isFinite,
          (-Double.pi / 2...Double.pi / 2).contains(star.declination)
    else {
        throw PrecisionModelError.invalidCatalogCoordinates(hr: star.hr)
    }
}

public extension Astronomy {
    /**
     Connects a BSC5P FK5 direction and velocity to the
     Hipparcos/ICRS-aligned frame, then propagates from J2000.0. Positive
     parallax always retains a physical distance. Missing radial velocity is
     explicitly treated as zero so annual parallax remains available while
     unknown perspective acceleration remains omitted.

     This is independently written classical propagation, not a port of the
     SOFA `starpm` routine. The J2000 orientation and spin are derived from
     `fk5hip` and `fk52h`; zonal FK5 errors are not modeled. Catalog precision
     remains the dominant limitation.
     */
    static func propagateSpaceMotionV2(
        _ star: CatalogStar,
        ttJulianDate: Double
    ) throws -> SpaceMotionResultV2 {
        try validateCatalogDirectionV2(star)
        guard ttJulianDate.isFinite else {
            throw PrecisionModelError.nonFiniteValue("TT Julian date")
        }

        let properMotionRA =
            star.astrometry?
                .properMotionRightAscensionCosDeclinationArcsecondsPerYear
        let properMotionDeclination =
            star.astrometry?.properMotionDeclinationArcsecondsPerYear
        if let properMotionRA, !properMotionRA.isFinite {
            throw PrecisionModelError.nonFiniteCatalogAstrometry(
                hr: star.hr,
                field: "赤経方向の固有運動"
            )
        }
        if let properMotionDeclination,
           !properMotionDeclination.isFinite
        {
            throw PrecisionModelError.nonFiniteCatalogAstrometry(
                hr: star.hr,
                field: "赤緯方向の固有運動"
            )
        }
        let hasRAMotion = properMotionRA != nil
        let hasDeclinationMotion = properMotionDeclination != nil

        let years =
            (ttJulianDate - Astronomy.j2000JulianDate)
            / PrecisionConstants.daysPerJulianYear
        let rightAscension = star.rightAscension
        let declination = star.declination
        let direction = precisionEquatorialToVector(
            EquatorialCoordinates(
                rightAscension: rightAscension,
                declination: declination
            )
        )
        let east = Vector3D(
            x: -sin(rightAscension),
            y: cos(rightAscension),
            z: 0
        )
        let north = Vector3D(
            x: -sin(declination) * cos(rightAscension),
            y: -sin(declination) * sin(rightAscension),
            z: cos(declination)
        )
        let muRA =
            (hasRAMotion ? properMotionRA! : 0)
            * PrecisionConstants.arcsecondsToRadians
        let muDeclination =
            (hasDeclinationMotion ? properMotionDeclination! : 0)
            * PrecisionConstants.arcsecondsToRadians

        let parallax = star.astrometry?.parallaxArcseconds
        let radialVelocity =
            star.astrometry?.radialVelocityKilometersPerSecond
        if let parallax, !parallax.isFinite {
            throw PrecisionModelError.invalidCatalogParallax(
                hr: star.hr
            )
        }
        if let radialVelocity, !radialVelocity.isFinite {
            throw PrecisionModelError.nonFiniteCatalogAstrometry(
                hr: star.hr,
                field: "視線速度"
            )
        }
        let hasDistance = parallax != nil && parallax! > 0
        let hasRadialVelocity = radialVelocity != nil

        if hasDistance {
            let parallaxRadians =
                parallax! * PrecisionConstants.arcsecondsToRadians
            guard parallaxRadians > 0,
                  parallaxRadians < Double.pi / 2
            else {
                throw PrecisionModelError.invalidCatalogParallax(
                    hr: star.hr
                )
            }
            let distanceAU = 1 / sin(parallaxRadians)
            guard distanceAU.isFinite else {
                throw PrecisionModelError.invalidCatalogParallax(
                    hr: star.hr
                )
            }
            let radialAUPerYear =
                (hasRadialVelocity ? radialVelocity! : 0)
                * PrecisionConstants.secondsPerDay
                * PrecisionConstants.daysPerJulianYear
                / PrecisionConstants.astronomicalUnitKilometers
            let position = direction * distanceAU
            let tangentialVelocity =
                distanceAU * (muRA * east + muDeclination * north)
            let velocity =
                tangentialVelocity + radialAUPerYear * direction
            let speedAUPerJulianYear = hypot(
                velocity.x,
                hypot(velocity.y, velocity.z)
            )
            let speedOfLightAUPerJulianYear =
                PrecisionConstants.speedOfLightAUPerDay
                * PrecisionConstants.daysPerJulianYear
            guard speedAUPerJulianYear.isFinite,
                  speedAUPerJulianYear
                    < speedOfLightAUPerJulianYear
            else {
                throw PrecisionModelError
                    .catalogSpaceVelocityAtOrAboveLightSpeed(
                        hr: star.hr
                    )
            }
            let connected = try connectFK5PhaseSpaceToHipparcosV2(
                position: position,
                velocityPerJulianYear: velocity
            )
            let propagatedPosition =
                connected.position
                + years * connected.velocityPerJulianYear
            return SpaceMotionResultV2(
                coordinates: try precisionVectorToEquatorial(
                    propagatedPosition
                ),
                astrometricPositionAU: propagatedPosition,
                mode:
                    hasRadialVelocity
                    ? .threeDimensional
                    : hasRAMotion || hasDeclinationMotion
                    ? .angularProperMotion
                    : .none,
                radialVelocityAssumedZero: !hasRadialVelocity
            )
        }

        let connected = try connectFK5PhaseSpaceToHipparcosV2(
            position: direction,
            velocityPerJulianYear:
                muRA * east + muDeclination * north
        )
        return SpaceMotionResultV2(
            coordinates: try precisionVectorToEquatorial(
                connected.position
                    + years * connected.velocityPerJulianYear
            ),
            astrometricPositionAU: nil,
            mode:
                hasRAMotion || hasDeclinationMotion
                ? .angularProperMotion
                : .none,
            radialVelocityAssumedZero: false
        )
    }
}
