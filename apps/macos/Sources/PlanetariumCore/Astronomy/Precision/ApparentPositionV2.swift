import Foundation

private let omittedCorrectionsWithoutAnnualParallaxV2:
    [OmittedCorrectionV2] = [
    .annualParallax,
    .diurnalParallax,
    .planetaryLightDeflection,
]

private let omittedCorrectionsWithApproximateAnnualParallaxV2:
    [OmittedCorrectionV2] = [
    .diurnalParallax,
    .planetaryLightDeflection,
]

private let omittedCorrectionsWithCallerAnnualParallaxV2:
    [OmittedCorrectionV2] = [
    .planetaryLightDeflection,
]

private func validatedLocationV2(
    _ location: ObservingLocation
) throws -> ObservingLocation {
    guard location.latitude.isFinite,
          (-90...90).contains(location.latitude),
          location.longitude.isFinite,
          (-180...180).contains(location.longitude),
          TimeZone(identifier: location.timeZoneIdentifier) != nil
    else {
        throw PrecisionModelError.invalidLocation
    }
    return location
}

private func createAberrationContextV2(
    configuration: AberrationConfigurationV2,
    approximateEarthState: ApproximateEarthStateV2?,
    warnings: inout [PrecisionWarningCode]
) throws -> AberrationContextV2 {
    switch configuration {
    case .disabled:
        warnings.append(.aberrationDisabled)
        return .disabled
    case .truncatedVSOP2000HeliocentricEarth,
         .approximateEarthMoonBarycenter:
        guard let approximateEarthState else {
            throw PrecisionModelError.invalidVector
        }
        warnings.append(.aberrationApproximateEphemeris)
        return .prepared(
            try Astronomy.prepareAnnualAberrationV2(
                observerBarycentricVelocityC:
                    approximateEarthState.velocityC,
                sunObserverDistanceAU:
                    approximateEarthState.sunObserverDistanceAU,
                mode: .truncatedVSOP2000HeliocentricEarth
            )
        )
    case let .custom(custom):
        return .prepared(
            try Astronomy.prepareAnnualAberrationV2(
                observerBarycentricVelocityC:
                    custom.observerBarycentricVelocityC,
                sunObserverDistanceAU: custom.sunObserverDistanceAU,
                mode: .callerBarycentricVelocity
            )
        )
    }
}

private func createAnnualParallaxContextV2(
    configuration: AnnualParallaxConfigurationV2,
    approximateEarthState: ApproximateEarthStateV2?,
    warnings: inout [PrecisionWarningCode]
) throws -> AnnualParallaxContextV2 {
    switch configuration {
    case .disabled:
        warnings.append(.annualParallaxDisabled)
        return .disabled
    case .truncatedVSOP2000HeliocentricEarth,
         .approximateEarthMoonBarycenter:
        guard let approximateEarthState else {
            throw PrecisionModelError.invalidVector
        }
        return .prepared(
            PreparedAnnualParallaxContextV2(
                mode: .truncatedVSOP2000HeliocentricEarth,
                observerPositionAU:
                    approximateEarthState.positionAU
            )
        )
    case let .custom(custom):
        guard custom.observerPositionAU.isFinite else {
            throw PrecisionModelError.nonFiniteValue(
                "Annual-parallax observer position"
            )
        }
        return .prepared(
            PreparedAnnualParallaxContextV2(
                mode: .callerObserverPosition,
                observerPositionAU: custom.observerPositionAU
            )
        )
    }
}

private func createSolarLightDeflectionContextV2(
    configuration: SolarLightDeflectionConfigurationV2,
    approximateEarthState: ApproximateEarthStateV2?,
    warnings: inout [PrecisionWarningCode]
) throws -> SolarLightDeflectionContextV2 {
    switch configuration {
    case .disabled:
        warnings.append(.solarLightDeflectionDisabled)
        return .disabled
    case .truncatedVSOP2000HeliocentricEarth,
         .approximateEarthMoonBarycenter:
        guard let approximateEarthState else {
            throw PrecisionModelError.invalidVector
        }
        warnings.append(
            .solarLightDeflectionApproximateEphemeris
        )
        return .prepared(
            try Astronomy.prepareSolarLightDeflectionV2(
                sunToObserverUnitDirection:
                    precisionNormalized(
                        approximateEarthState.positionAU
                    ),
                sunObserverDistanceAU:
                    approximateEarthState.sunObserverDistanceAU,
                mode: .truncatedVSOP2000HeliocentricEarth
            )
        )
    case let .custom(custom):
        return .prepared(
            try Astronomy.prepareSolarLightDeflectionV2(
                sunToObserverUnitDirection:
                    custom.sunToObserverUnitDirection,
                sunObserverDistanceAU:
                    custom.sunObserverDistanceAU,
                mode: .callerSunObserverGeometry
            )
        )
    }
}

private func createRefractionContextV2(
    configuration: RefractionConfigurationV2,
    warnings: inout [PrecisionWarningCode]
) throws -> RefractionContextV2 {
    switch configuration {
    case .disabled:
        warnings.append(.refractionDisabled)
        return .disabled
    case let .atmosphere(atmosphere):
        return .configured(
            coefficients: try Astronomy.refractionCoefficientsV2(
                for: atmosphere
            ),
            minimumGeometricAltitudeDegrees:
                atmosphere.minimumGeometricAltitudeDegrees
        )
    }
}

private func createDiurnalAberrationContextV2(
    configuration: DiurnalAberrationConfigurationV2,
    latitudeRadians: Double,
    warnings: inout [PrecisionWarningCode]
) throws -> DiurnalAberrationContextV2 {
    switch configuration {
    case .disabled:
        warnings.append(.diurnalAberrationDisabled)
        return .disabled
    case let .wgs84Observer(optionalHeightMeters):
        let heightMeters = optionalHeightMeters ?? 0
        if optionalHeightMeters == nil {
            warnings.append(.observerHeightAssumedZero)
        }
        return .wgs84Observer(
            heightMeters: heightMeters,
            magnitude: try Astronomy.diurnalAberrationMagnitudeV2(
                geodeticLatitudeRadians: latitudeRadians,
                heightMeters: heightMeters
            )
        )
    }
}

private func createPolarMotionContextV2(
    options: PolarMotionOptionsV2?,
    ttJulianDate: Double,
    warnings: inout [PrecisionWarningCode]
) throws -> PolarMotionContextV2 {
    guard let options else {
        return PolarMotionContextV2(
            mode: .disabled,
            xpRadians: 0,
            ypRadians: 0,
            xpReportedErrorRadians: nil,
            ypReportedErrorRadians: nil,
            tioLocatorRadians: 0,
            matrix: .identity
        )
    }

    let hasXpError =
        options.xpReportedErrorRadians != nil
    let hasYpError =
        options.ypReportedErrorRadians != nil
    guard hasXpError == hasYpError else {
        throw PrecisionModelError.invalidPolarMotion(
            "xp/ypの公表誤差は両方を指定"
        )
    }
    if options.source == .iersObserved
        || options.source == .iersPredicted
    {
        guard hasXpError else {
            throw PrecisionModelError.invalidPolarMotion(
                "IERS値には両軸の公表誤差が必要"
            )
        }
    }
    let maximumReportedError =
        PrecisionConstants.arcsecondsToRadians
    for (name, value) in [
        ("xp", options.xpReportedErrorRadians),
        ("yp", options.ypReportedErrorRadians),
    ] {
        if let value {
            guard value.isFinite,
                  (0...maximumReportedError).contains(value)
            else {
                throw PrecisionModelError.invalidPolarMotion(
                    "\(name)公表誤差は0〜1秒角"
                )
            }
        }
    }
    if options.source == .assumedZero {
        guard options.xpRadians == 0,
              options.ypRadians == 0
        else {
            throw PrecisionModelError.invalidPolarMotion(
                "assumed-zeroはxp=yp=0が必要"
            )
        }
        warnings.append(.polarMotionAssumedZero)
    }

    let mode: PolarMotionModeV2
    switch options.source {
    case .caller:
        mode = .caller
    case .iersObserved:
        mode = .iersObserved
    case .iersPredicted:
        mode = .iersPredicted
    case .assumedZero:
        mode = .assumedZero
    }
    let tioLocator = try Astronomy
        .approximateTIOLocatorV2(
            ttJulianDate: ttJulianDate
        )
    return PolarMotionContextV2(
        mode: mode,
        xpRadians: options.xpRadians,
        ypRadians: options.ypRadians,
        xpReportedErrorRadians:
            options.xpReportedErrorRadians,
        ypReportedErrorRadians:
            options.ypReportedErrorRadians,
        tioLocatorRadians: tioLocator,
        matrix: try Astronomy.polarMotionMatrix2000V2(
            xpRadians: options.xpRadians,
            ypRadians: options.ypRadians,
            tioLocatorRadians: tioLocator
        )
    )
}

func geometricHorizontalV2(
    rightAscension: Double,
    declination: Double,
    context: ApparentPositionContextV2,
    geocentricDistanceAU: Double? = nil
) throws -> HorizontalCoordinates {
    let cosineDeclination = cos(declination)
    let apparentDirection = Vector3D(
        x: cosineDeclination * cos(rightAscension),
        y: cosineDeclination * sin(rightAscension),
        z: sin(declination)
    )
    let siderealSine = sin(
        context.greenwichApparentSiderealTime
    )
    let siderealCosine = cos(
        context.greenwichApparentSiderealTime
    )
    let tirsDirection = Vector3D(
        x:
            siderealCosine * apparentDirection.x
            + siderealSine * apparentDirection.y,
        y:
            -siderealSine * apparentDirection.x
            + siderealCosine * apparentDirection.y,
        z: apparentDirection.z
    )
    var itrsDirection =
        context.polarMotion.matrix.applying(
            to: tirsDirection
        )
    if let geocentricDistanceAU {
        // Site height currently enters through the existing WGS84 diurnal-
        // aberration option. Disabling that independent velocity correction
        // removes its height input, so solar parallax continues at the
        // explicit zero-metre fallback rather than being disabled implicitly.
        let heightMeters =
            context.diurnalAberration.heightMeters ?? 0
        itrsDirection =
            try Astronomy
                .applyTopocentricParallaxToITRSDirectionV2(
                    geocentricUnitDirection:
                        itrsDirection,
                    geocentricDistanceAU:
                        geocentricDistanceAU,
                    observerPositionITRSAU:
                        Astronomy
                        .wgs84ObserverPositionITRSAUV2(
                            geodeticLatitudeRadians:
                                context.latitudeRadians,
                            longitudeRadians:
                                context.longitudeRadians,
                            heightMeters: heightMeters
                        )
                )
    }
    let east =
        -context.longitudeSine * itrsDirection.x
        + context.longitudeCosine * itrsDirection.y
    let north =
        -context.latitudeSine
        * context.longitudeCosine
        * itrsDirection.x
        - context.latitudeSine
        * context.longitudeSine
        * itrsDirection.y
        + context.latitudeCosine * itrsDirection.z
    let up =
        context.latitudeCosine
        * context.longitudeCosine
        * itrsDirection.x
        + context.latitudeCosine
        * context.longitudeSine
        * itrsDirection.y
        + context.latitudeSine * itrsDirection.z
    let corrected: HorizontalENUVectorV2
    switch context.diurnalAberration {
    case .disabled:
        corrected = HorizontalENUVectorV2(
            east: east,
            north: north,
            up: up
        )
    case let .wgs84Observer(_, magnitude):
        corrected = try Astronomy
            .applyDiurnalAberrationToHorizontalENUV2(
                HorizontalENUVectorV2(
                    east: east,
                    north: north,
                    up: up
                ),
                magnitude: magnitude
            )
    }
    let horizontalMagnitude = hypot(
        corrected.east,
        corrected.north
    )
    let azimuthDefined = horizontalMagnitude > 1e-12
    return HorizontalCoordinates(
        altitude: atan2(
            Angles.clamped(corrected.up),
            horizontalMagnitude
        ),
        azimuth: azimuthDefined
            ? Angles.normalizedRadians(
                atan2(corrected.east, corrected.north)
            )
            : 0,
        azimuthIsDefined: azimuthDefined
    )
}

private func calculateLightweightUncheckedV2(
    star: CatalogStar,
    context: ApparentPositionContextV2
) throws -> LightweightApparentStarPositionV2 {
    let spaceMotion = try Astronomy.propagateSpaceMotionV2(
        star,
        ttJulianDate: context.timeScales.ttJulianDate
    )
    let astrometricDirection = precisionEquatorialToVector(
        spaceMotion.coordinates
    )
    let naturalDirection: Vector3D
    let annualParallaxMode: AnnualParallaxModeV2
    switch context.annualParallax {
    case .disabled:
        naturalDirection = astrometricDirection
        annualParallaxMode = .disabled
    case let .prepared(prepared):
        if let astrometricPositionAU =
            spaceMotion.astrometricPositionAU
        {
            naturalDirection = try Astronomy.applyAnnualParallaxV2(
                astrometricPositionAU: astrometricPositionAU,
                observerPositionAU: prepared.observerPositionAU
            )
            annualParallaxMode = prepared.mode
        } else {
            naturalDirection = astrometricDirection
            annualParallaxMode = .unavailable
        }
    }
    let properDirection: Vector3D
    let deflectedDirection: Vector3D
    switch context.solarLightDeflection {
    case .disabled:
        deflectedDirection = naturalDirection
    case let .prepared(prepared):
        deflectedDirection = try Astronomy
            .applyPreparedSolarLightDeflectionToUnitDirectionV2(
                naturalDirection,
                prepared: prepared
            )
    }
    switch context.aberration {
    case .disabled:
        properDirection = deflectedDirection
    case let .prepared(prepared):
        properDirection = try Astronomy.applyPreparedAnnualAberrationV2(
            naturalDirection: deflectedDirection,
            prepared: prepared
        )
    }
    let apparentEquatorial = try precisionVectorToEquatorial(
        context.precessionNutationMatrix.applying(
            to: properDirection
        )
    )
    let geometricHorizontal = try geometricHorizontalV2(
        rightAscension: apparentEquatorial.rightAscension,
        declination: apparentEquatorial.declination,
        context: context
    )

    let observedHorizontal: HorizontalCoordinates
    let refractionMode: RefractionModeV2
    switch context.refraction {
    case .disabled:
        observedHorizontal = geometricHorizontal
        refractionMode = .disabled
    case let .configured(
        coefficients,
        minimumGeometricAltitudeDegrees
    ):
        let refracted = try Astronomy.applyVisualRefractionV2(
            to: geometricHorizontal.altitude,
            coefficients: coefficients,
            minimumGeometricAltitudeDegrees:
                minimumGeometricAltitudeDegrees
        )
        observedHorizontal = HorizontalCoordinates(
            altitude: refracted.altitude,
            azimuth: geometricHorizontal.azimuth,
            azimuthIsDefined:
                geometricHorizontal.azimuthIsDefined
        )
        refractionMode = refracted.mode
    }

    return LightweightApparentStarPositionV2(
        starHR: star.hr,
        astrometricJ2000: spaceMotion.coordinates,
        apparentEquatorial: apparentEquatorial,
        geometricHorizontal: geometricHorizontal,
        observedHorizontal: observedHorizontal,
        projection: Astronomy.project(
            altitude: observedHorizontal.altitude,
            azimuth: observedHorizontal.azimuth
        ),
        spaceMotionMode: spaceMotion.mode,
        radialVelocityAssumedZero:
            spaceMotion.radialVelocityAssumedZero,
        annualParallaxMode: annualParallaxMode,
        solarLightDeflectionMode:
            context.solarLightDeflection.mode,
        diurnalAberrationMode:
            context.diurnalAberration.mode,
        polarMotionMode: context.polarMotion.mode,
        refractionMode: refractionMode
    )
}

public extension Astronomy {
    /**
     Builds immutable per-frame state once, outside the star loop.

     UTC/TAI/TT/UT1 resolution, 77-term nutation, the precession/nutation
     matrix, apparent sidereal time, Earth-state approximation, site
     trigonometry, and optional refraction coefficients are all prepared here.
     */
    static func createApparentPositionContextV2(
        at date: Date,
        location: ObservingLocation,
        options: ApparentPositionOptionsV2 = ApparentPositionOptionsV2()
    ) throws -> ApparentPositionContextV2 {
        let validLocation = try validatedLocationV2(location)
        let timeScales = try resolveTimeScalesV2(
            at: date,
            options: options.earthOrientation
        )
        var warnings =
            timeScales.warnings + [.catalogFK5PrecisionLimited]
        let needsApproximateEarthState =
            options.annualParallax
            == .truncatedVSOP2000HeliocentricEarth
            || options.annualParallax
            == .approximateEarthMoonBarycenter
            || options.solarLightDeflection
            == .truncatedVSOP2000HeliocentricEarth
            || options.solarLightDeflection
            == .approximateEarthMoonBarycenter
            || options.aberration
            == .truncatedVSOP2000HeliocentricEarth
            || options.aberration
            == .approximateEarthMoonBarycenter
        let approximateEarthState =
            needsApproximateEarthState
            ? try approximateEarthStateV2(
                ttJulianDate: timeScales.ttJulianDate
            )
            : nil
        let annualParallax = try createAnnualParallaxContextV2(
            configuration: options.annualParallax,
            approximateEarthState: approximateEarthState,
            warnings: &warnings
        )
        let solarLightDeflection =
            try createSolarLightDeflectionContextV2(
                configuration:
                    options.solarLightDeflection,
                approximateEarthState:
                    approximateEarthState,
                warnings: &warnings
            )
        let aberration = try createAberrationContextV2(
            configuration: options.aberration,
            approximateEarthState: approximateEarthState,
            warnings: &warnings
        )
        let latitudeRadians = Angles.radians(
            fromDegrees: validLocation.latitude
        )
        let diurnalAberration =
            try createDiurnalAberrationContextV2(
                configuration: options.diurnalAberration,
                latitudeRadians: latitudeRadians,
                warnings: &warnings
            )
        let polarMotion = try createPolarMotionContextV2(
            options: options.earthOrientation.polarMotion,
            ttJulianDate: timeScales.ttJulianDate,
            warnings: &warnings
        )
        let refraction = try createRefractionContextV2(
            configuration: options.refraction,
            warnings: &warnings
        )
        return ApparentPositionContextV2(
            location: validLocation,
            latitudeRadians: latitudeRadians,
            longitudeRadians: Angles.radians(
                fromDegrees: validLocation.longitude
            ),
            timeScales: timeScales,
            precessionNutationMatrix:
                try precessionNutationMatrix2006BV2(
                    ttJulianDate: timeScales.ttJulianDate
                ),
            greenwichApparentSiderealTime:
                try greenwichApparentSiderealTime2006BV2(
                    ut1JulianDate: timeScales.ut1JulianDate,
                    ttJulianDate: timeScales.ttJulianDate
            ),
            annualParallax: annualParallax,
            solarLightDeflection:
                solarLightDeflection,
            aberration: aberration,
            diurnalAberration: diurnalAberration,
            polarMotion: polarMotion,
            refraction: refraction,
            baseWarnings: precisionUniqueWarnings(warnings)
        )
    }

    /// Lightweight single-star result using already prepared per-frame state.
    static func calculateLightweightApparentStarPositionWithContextV2(
        _ star: CatalogStar,
        context: ApparentPositionContextV2
    ) throws -> LightweightApparentStarPositionV2 {
        try calculateLightweightUncheckedV2(
            star: star,
            context: context
        )
    }

    /**
     Render-loop batch API. It reuses one context and does not allocate
     per-star metadata or warning arrays.
     */
    static func calculateLightweightApparentStarPositionsWithContextV2(
        _ stars: [CatalogStar],
        context: ApparentPositionContextV2
    ) throws -> [LightweightApparentStarPositionV2] {
        try stars.map {
            try calculateLightweightUncheckedV2(
                star: $0,
                context: context
            )
        }
    }

    /**
     Calculates the apparent Sun from the same immutable frame state as the
     stellar v2 pipeline.

     The shared 200-term VSOP2000 heliocentric Earth ephemeris supplies the
     geocentric natural direction and distance. WGS84 site displacement is
     applied after the Earth-orientation rotations and before split-at-CIRS
     diurnal aberration, so the horizontal result includes solar diurnal
     parallax while `apparentEquatorial` remains geocentric. The independent
     diurnal-aberration mode remains visible in the result and can still be
     disabled. Solar light deflection is intentionally not applied to light
     emitted by the Sun itself, and optical refraction is not applied so
     twilight thresholds remain geometric.
     */
    static func calculateApparentSunPositionWithContextV2(
        _ context: ApparentPositionContextV2
    ) throws -> ApparentSunPositionV2 {
        let earthState = try approximateEarthStateV2(
            ttJulianDate: context.timeScales.ttJulianDate
        )
        let naturalDirection = try precisionNormalized(
            -earthState.positionAU
        )
        let properDirection: Vector3D
        switch context.aberration {
        case .disabled:
            properDirection = naturalDirection
        case let .prepared(prepared):
            properDirection =
                try applyPreparedAnnualAberrationV2(
                    naturalDirection: naturalDirection,
                    prepared: prepared
                )
        }
        let apparentDirection =
            context.precessionNutationMatrix.applying(
                to: properDirection
            )
        let apparentEquatorial =
            try precisionVectorToEquatorial(apparentDirection)
        let geometricHorizontal = try geometricHorizontalV2(
            rightAscension:
                apparentEquatorial.rightAscension,
            declination: apparentEquatorial.declination,
            context: context,
            geocentricDistanceAU:
                earthState.sunObserverDistanceAU
        )
        return ApparentSunPositionV2(
            apparentEquatorial: apparentEquatorial,
            geometricHorizontal: geometricHorizontal,
            projection: project(
                altitude: geometricHorizontal.altitude,
                azimuth: geometricHorizontal.azimuth
            ),
            ephemerisMode:
                .truncatedVSOP2000HeliocentricEarth,
            aberrationMode: context.aberration.mode,
            diurnalAberrationMode:
                context.diurnalAberration.mode,
            polarMotionMode: context.polarMotion.mode
        )
    }

    static func calculateApparentStarPositionWithContextV2(
        _ star: CatalogStar,
        context: ApparentPositionContextV2
    ) throws -> ApparentStarPositionV2 {
        let result = try calculateLightweightUncheckedV2(
            star: star,
            context: context
        )
        var warnings = context.baseWarnings
        if result.spaceMotionMode == .none {
            warnings.append(.properMotionMissing)
        }
        if result.radialVelocityAssumedZero {
            warnings.append(.radialVelocityMissingAssumedZero)
        }
        switch result.annualParallaxMode {
        case .disabled:
            break
        case .unavailable:
            warnings.append(.annualParallaxUnavailable)
        case .truncatedVSOP2000HeliocentricEarth:
            warnings.append(.annualParallaxApproximateEphemeris)
        case .callerObserverPosition:
            break
        default:
            // Deprecated v2.0 JPL mode retained only for decoding/API
            // compatibility; runtime contexts never emit it.
            warnings.append(.annualParallaxApproximateEphemeris)
        }
        if result.refractionMode == .belowModelAltitude {
            warnings.append(.refractionBelowModelAltitude)
        }
        var omittedCorrections: [OmittedCorrectionV2]
        switch result.annualParallaxMode {
        case .disabled, .unavailable:
            omittedCorrections =
                omittedCorrectionsWithoutAnnualParallaxV2
        case .truncatedVSOP2000HeliocentricEarth:
            omittedCorrections =
                omittedCorrectionsWithApproximateAnnualParallaxV2
        case .callerObserverPosition:
            omittedCorrections =
                omittedCorrectionsWithCallerAnnualParallaxV2
        default:
            omittedCorrections =
                omittedCorrectionsWithApproximateAnnualParallaxV2
        }
        if result.solarLightDeflectionMode == .disabled {
            omittedCorrections.append(.solarLightDeflection)
        }
        if result.diurnalAberrationMode == .disabled {
            omittedCorrections.append(.diurnalAberration)
        }
        switch result.polarMotionMode {
        case .disabled, .assumedZero:
            omittedCorrections.append(.polarMotion)
        case .caller, .iersObserved, .iersPredicted:
            // Daily finals2000A values omit the IERS subdaily oceanic and
            // lunisolar correction, a documented ~0.1 mas residual.
            omittedCorrections.append(
                .subdailyPolarMotionTides
            )
        }
        return ApparentStarPositionV2(
            lightweight: result,
            metadata: ApparentPositionMetadataV2(
                modelVersion: 2,
                catalogFrame: "BSC5P J2000.0 FK5",
                frameConnectionModel:
                    "SOFA FK5-to-Hipparcos J2000 rotation and spin",
                precessionModel:
                    "IAU 2006 Fukushima-Williams",
                nutationModel: "IAU 2000B 77-term",
                siderealTimeModel:
                    "IAU 2006 GMST + IAU 2000B leading equation of equinoxes",
                spaceMotionMode: result.spaceMotionMode,
                annualParallaxMode:
                    result.annualParallaxMode,
                solarLightDeflectionMode:
                    result.solarLightDeflectionMode,
                aberrationMode: context.aberration.mode,
                diurnalAberrationMode:
                    result.diurnalAberrationMode,
                polarMotionMode:
                    result.polarMotionMode,
                refractionMode: result.refractionMode,
                omittedCorrections: omittedCorrections,
                timeScales: context.timeScales,
                warnings: precisionUniqueWarnings(warnings)
            )
        )
    }

    static func calculateApparentStarPositionsWithContextV2(
        _ stars: [CatalogStar],
        context: ApparentPositionContextV2
    ) throws -> [ApparentStarPositionV2] {
        try stars.map {
            try calculateApparentStarPositionWithContextV2(
                $0,
                context: context
            )
        }
    }

    /// Convenience wrapper for one-off calculations. Render loops should reuse a context.
    static func calculateApparentStarPositionV2(
        _ star: CatalogStar,
        at date: Date,
        location: ObservingLocation,
        options: ApparentPositionOptionsV2 = ApparentPositionOptionsV2()
    ) throws -> ApparentStarPositionV2 {
        try calculateApparentStarPositionWithContextV2(
            star,
            context: createApparentPositionContextV2(
                at: date,
                location: location,
                options: options
            )
        )
    }

    /// v2 batch renderer. Default options intentionally leave atmospheric refraction off.
    static func renderV2(
        catalog: SkyCatalog,
        at date: Date,
        location: ObservingLocation,
        options: ApparentPositionOptionsV2 = ApparentPositionOptionsV2()
    ) throws -> [RenderedStar] {
        let context = try createApparentPositionContextV2(
            at: date,
            location: location,
            options: options
        )
        return try renderV2(
            catalog: catalog,
            context: context
        )
    }

    /**
     Render-loop batch API for a caller-owned frame context. This overload
     lets stars and solar/twilight state share exactly the same EOP snapshot.
     */
    static func renderV2(
        catalog: SkyCatalog,
        context: ApparentPositionContextV2
    ) throws -> [RenderedStar] {
        return try catalog.stars.map { star in
            let position = try calculateLightweightUncheckedV2(
                star: star,
                context: context
            )
            return RenderedStar(
                catalog: star,
                name: catalog.namesByHR[star.hr],
                horizontal: position.observedHorizontal,
                projection: position.projection
            )
        }
    }
}
