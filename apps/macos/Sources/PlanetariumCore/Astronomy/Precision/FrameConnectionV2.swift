/*
 * The constants and transformations in this file are a Swift derived work
 * based on the IAU SOFA 2023-10-11 routines `fk5hip` and `fk52h`, plus the
 * catalogue/phase-space conversions `starpv` and `pvstar`. This is not
 * software provided by or endorsed by SOFA.
 *
 * The app-facing Cartesian API differs from `fk52h`: it preserves missing
 * distance and radial-velocity semantics instead of inventing catalogue
 * values. The catalogue-shaped conversion is retained to verify the official
 * six-dimensional reference vector. See `SOFA-NOTICE.md` for the complete
 * derived-work notice and license.
 */

import Foundation

struct ConnectedPhaseSpaceV2: Hashable, Sendable {
    let position: Vector3D
    let velocityPerJulianYear: Vector3D
}

struct ConnectedCatalogDataV2: Hashable, Sendable {
    let rightAscension: Double
    let declination: Double
    let properMotionRightAscensionRadiansPerJulianYear: Double
    let properMotionDeclinationRadiansPerJulianYear: Double
    let parallaxArcseconds: Double
    let radialVelocityKilometersPerSecond: Double
}

private struct PhaseSpaceV2 {
    let position: Vector3D
    let velocityPerDay: Vector3D
}

private let radiansToArcsecondsV2 = 206_264.80624709636

private func rotationVectorToMatrixV2(
    _ vector: Vector3D
) -> PrecisionMatrix3 {
    var x = vector.x
    var y = vector.y
    var z = vector.z
    let angle = sqrt(x * x + y * y + z * z)
    let sine = sin(angle)
    let cosine = cos(angle)
    let oneMinusCosine = 1 - cosine
    if angle > 0 {
        x /= angle
        y /= angle
        z /= angle
    }
    return PrecisionMatrix3(
        row0: Vector3D(
            x: x * x * oneMinusCosine + cosine,
            y: x * y * oneMinusCosine + z * sine,
            z: x * z * oneMinusCosine - y * sine
        ),
        row1: Vector3D(
            x: y * x * oneMinusCosine - z * sine,
            y: y * y * oneMinusCosine + cosine,
            z: y * z * oneMinusCosine + x * sine
        ),
        row2: Vector3D(
            x: z * x * oneMinusCosine + y * sine,
            y: z * y * oneMinusCosine - x * sine,
            z: z * z * oneMinusCosine + cosine
        )
    )
}

extension Astronomy {
    /// J2000 FK5 orientation into the Hipparcos/ICRS-aligned frame.
    static let fk5ToHipparcosMatrixV2 = rotationVectorToMatrixV2(
        Vector3D(
            x: -19.9e-3 * PrecisionConstants.arcsecondsToRadians,
            y: -9.1e-3 * PrecisionConstants.arcsecondsToRadians,
            z: 22.9e-3 * PrecisionConstants.arcsecondsToRadians
        )
    )

    /**
     Hipparcos with respect to FK5 spin, in radians per Julian year.

     The Cartesian velocity connection uses `position × spin`, matching the
     sense of the official J2000 frame connection.
     */
    static let fk5ToHipparcosSpinV2 = Vector3D(
        x: -0.30e-3 * PrecisionConstants.arcsecondsToRadians,
        y: 0.60e-3 * PrecisionConstants.arcsecondsToRadians,
        z: 0.70e-3 * PrecisionConstants.arcsecondsToRadians
    )

    /**
     Connects an FK5 J2000 Cartesian position and velocity to the
     Hipparcos/ICRS-aligned frame. Position units are arbitrary; velocity must
     use the same position unit per Julian year.
     */
    static func connectFK5PhaseSpaceToHipparcosV2(
        position: Vector3D,
        velocityPerJulianYear: Vector3D
    ) throws -> ConnectedPhaseSpaceV2 {
        guard position.isFinite, velocityPerJulianYear.isFinite else {
            throw PrecisionModelError.invalidVector
        }
        let connectedVelocity = fk5ToHipparcosMatrixV2.applying(
            to:
                velocityPerJulianYear
                + position.cross(fk5ToHipparcosSpinV2)
        )
        let connectedPosition = fk5ToHipparcosMatrixV2.applying(
            to: position
        )
        guard connectedPosition.isFinite, connectedVelocity.isFinite else {
            throw PrecisionModelError.invalidVector
        }
        return ConnectedPhaseSpaceV2(
            position: connectedPosition,
            velocityPerJulianYear: connectedVelocity
        )
    }

    /**
     Catalogue-shaped FK5-to-Hipparcos conversion used by the official
     six-dimensional regression test. The application propagation path calls
     the Cartesian API above, so absent parallax or radial velocity never
     becomes a synthetic distance.
     */
    static func connectFK5CatalogToHipparcosV2(
        rightAscension: Double,
        declination: Double,
        properMotionRightAscensionRadiansPerJulianYear: Double,
        properMotionDeclinationRadiansPerJulianYear: Double,
        parallaxArcseconds: Double,
        radialVelocityKilometersPerSecond: Double
    ) throws -> ConnectedCatalogDataV2 {
        let values = [
            rightAscension,
            declination,
            properMotionRightAscensionRadiansPerJulianYear,
            properMotionDeclinationRadiansPerJulianYear,
            parallaxArcseconds,
            radialVelocityKilometersPerSecond,
        ]
        guard values.allSatisfy(\.isFinite) else {
            throw PrecisionModelError.nonFiniteValue(
                "FK5 catalogue phase space"
            )
        }

        let fk5 = try catalogueToPhaseSpaceV2(
            rightAscension: rightAscension,
            declination: declination,
            properMotionRightAscensionRadiansPerJulianYear:
                properMotionRightAscensionRadiansPerJulianYear,
            properMotionDeclinationRadiansPerJulianYear:
                properMotionDeclinationRadiansPerJulianYear,
            parallaxArcseconds: parallaxArcseconds,
            radialVelocityKilometersPerSecond:
                radialVelocityKilometersPerSecond
        )
        let spinPerDay =
            fk5ToHipparcosSpinV2
            / PrecisionConstants.daysPerJulianYear
        let hipparcos = PhaseSpaceV2(
            position: fk5ToHipparcosMatrixV2.applying(
                to: fk5.position
            ),
            velocityPerDay: fk5ToHipparcosMatrixV2.applying(
                to:
                    fk5.velocityPerDay
                    + fk5.position.cross(spinPerDay)
            )
        )
        return try phaseSpaceToCatalogueV2(hipparcos)
    }
}

private func catalogueToPhaseSpaceV2(
    rightAscension: Double,
    declination: Double,
    properMotionRightAscensionRadiansPerJulianYear: Double,
    properMotionDeclinationRadiansPerJulianYear: Double,
    parallaxArcseconds: Double,
    radialVelocityKilometersPerSecond: Double
) throws -> PhaseSpaceV2 {
    let parallax = max(parallaxArcseconds, 1e-7)
    let distance = radiansToArcsecondsV2 / parallax
    let radialVelocityPerDay =
        PrecisionConstants.secondsPerDay
        * radialVelocityKilometersPerSecond
        / PrecisionConstants.astronomicalUnitKilometers
    let longitudeRate =
        properMotionRightAscensionRadiansPerJulianYear
        / PrecisionConstants.daysPerJulianYear
    let latitudeRate =
        properMotionDeclinationRadiansPerJulianYear
        / PrecisionConstants.daysPerJulianYear

    let sineLongitude = sin(rightAscension)
    let cosineLongitude = cos(rightAscension)
    let sineLatitude = sin(declination)
    let cosineLatitude = cos(declination)
    let projectedDistance = distance * cosineLatitude
    let x = projectedDistance * cosineLongitude
    let y = projectedDistance * sineLongitude
    let distanceLatitudeRate = distance * latitudeRate
    let common =
        distanceLatitudeRate * sineLatitude
        - cosineLatitude * radialVelocityPerDay
    let position = Vector3D(
        x: x,
        y: y,
        z: distance * sineLatitude
    )
    var velocity = Vector3D(
        x: -y * longitudeRate - common * cosineLongitude,
        y: x * longitudeRate - common * sineLongitude,
        z:
            distanceLatitudeRate * cosineLatitude
            + sineLatitude * radialVelocityPerDay
    )

    if velocity.length / PrecisionConstants.speedOfLightAUPerDay > 0.5 {
        velocity = .zero
    }

    let distanceMagnitude = position.length
    guard distanceMagnitude.isFinite, distanceMagnitude > 0 else {
        throw PrecisionModelError.invalidVector
    }
    let direction = position / distanceMagnitude
    let observedRadialSpeed = direction.dot(velocity)
    let observedRadialVelocity =
        observedRadialSpeed * direction
    let observedTangentialVelocity =
        velocity - observedRadialVelocity
    let observedTangentialSpeed =
        observedTangentialVelocity.length
    let observedRadialBeta =
        observedRadialSpeed
        / PrecisionConstants.speedOfLightAUPerDay
    let observedTangentialBeta =
        observedTangentialSpeed
        / PrecisionConstants.speedOfLightAUPerDay

    var tangentialBeta = observedTangentialBeta
    var radialBeta = observedRadialBeta
    var scale = 0.0
    var relativisticDelta = 0.0
    var previousScale = 0.0
    var previousDelta = 0.0
    var olderScaleDifference = 0.0
    var olderDeltaDifference = 0.0

    for index in 0..<100 {
        scale = 1 + radialBeta
        let betaSquared =
            radialBeta * radialBeta
            + tangentialBeta * tangentialBeta
        guard betaSquared < 1 else {
            throw PrecisionModelError.invalidVector
        }
        relativisticDelta =
            -betaSquared
            / (sqrt(1 - betaSquared) + 1)
        radialBeta =
            scale * observedRadialBeta
            + relativisticDelta
        tangentialBeta =
            scale * observedTangentialBeta

        if index > 0 {
            let scaleDifference = abs(scale - previousScale)
            let deltaDifference =
                abs(relativisticDelta - previousDelta)
            if index > 1,
               scaleDifference >= olderScaleDifference,
               deltaDifference >= olderDeltaDifference
            {
                break
            }
            olderScaleDifference = scaleDifference
            olderDeltaDifference = deltaDifference
        }
        previousScale = scale
        previousDelta = relativisticDelta
    }

    let inertialTangentialVelocity =
        scale * observedTangentialVelocity
    let inertialRadialVelocity =
        PrecisionConstants.speedOfLightAUPerDay
        * (
            scale * observedRadialBeta
                + relativisticDelta
        )
        * direction
    velocity =
        inertialRadialVelocity
        + inertialTangentialVelocity
    guard velocity.isFinite else {
        throw PrecisionModelError.invalidVector
    }
    return PhaseSpaceV2(
        position: position,
        velocityPerDay: velocity
    )
}

private func phaseSpaceToCatalogueV2(
    _ phaseSpace: PhaseSpaceV2
) throws -> ConnectedCatalogDataV2 {
    let position = phaseSpace.position
    let velocity = phaseSpace.velocityPerDay
    let distance = position.length
    guard position.isFinite,
          velocity.isFinite,
          distance.isFinite,
          distance > 0
    else {
        throw PrecisionModelError.invalidVector
    }

    let direction = position / distance
    let inertialRadialSpeed = direction.dot(velocity)
    let inertialRadialVelocity =
        inertialRadialSpeed * direction
    let inertialTangentialVelocity =
        velocity - inertialRadialVelocity
    let inertialTangentialSpeed =
        inertialTangentialVelocity.length
    let tangentialBeta =
        inertialTangentialSpeed
        / PrecisionConstants.speedOfLightAUPerDay
    let radialBeta =
        inertialRadialSpeed
        / PrecisionConstants.speedOfLightAUPerDay
    let scale = 1 + radialBeta
    let betaSquared =
        radialBeta * radialBeta
        + tangentialBeta * tangentialBeta
    guard scale != 0, betaSquared <= 1 else {
        throw PrecisionModelError.invalidVector
    }
    let relativisticDelta =
        -betaSquared
        / (sqrt(1 - betaSquared) + 1)
    let observedTangentialVelocity =
        inertialTangentialVelocity / scale
    let observedRadialVelocity =
        (
            PrecisionConstants.speedOfLightAUPerDay
            * (radialBeta - relativisticDelta)
            / scale
        )
        * direction
    let observedVelocity =
        observedRadialVelocity
        + observedTangentialVelocity

    let x = position.x
    let y = position.y
    let z = position.z
    let xRate = observedVelocity.x
    let yRate = observedVelocity.y
    let zRate = observedVelocity.z
    let projectedDistanceSquared = x * x + y * y
    let distanceSquared =
        projectedDistanceSquared + z * z
    let projectedDistance =
        sqrt(projectedDistanceSquared)
    let projectedRadialRate =
        x * xRate + y * yRate
    guard projectedDistanceSquared > 0,
          distanceSquared.isFinite,
          distanceSquared > 0
    else {
        throw PrecisionModelError.invalidVector
    }
    let rightAscensionRate =
        (x * yRate - y * xRate)
        / projectedDistanceSquared
    let declinationRate =
        (
            zRate * projectedDistanceSquared
                - z * projectedRadialRate
        )
        / (distanceSquared * projectedDistance)
    let radialRate =
        (
            projectedRadialRate
                + z * zRate
        )
        / distance
    let result = ConnectedCatalogDataV2(
        rightAscension: Angles.normalizedRadians(atan2(y, x)),
        declination: atan2(z, projectedDistance),
        properMotionRightAscensionRadiansPerJulianYear:
            rightAscensionRate
            * PrecisionConstants.daysPerJulianYear,
        properMotionDeclinationRadiansPerJulianYear:
            declinationRate
            * PrecisionConstants.daysPerJulianYear,
        parallaxArcseconds:
            radiansToArcsecondsV2 / distance,
        radialVelocityKilometersPerSecond:
            radialRate
            * PrecisionConstants.astronomicalUnitKilometers
            / PrecisionConstants.secondsPerDay
    )
    let values = [
        result.rightAscension,
        result.declination,
        result.properMotionRightAscensionRadiansPerJulianYear,
        result.properMotionDeclinationRadiansPerJulianYear,
        result.parallaxArcseconds,
        result.radialVelocityKilometersPerSecond,
    ]
    guard values.allSatisfy(\.isFinite) else {
        throw PrecisionModelError.invalidVector
    }
    return result
}
