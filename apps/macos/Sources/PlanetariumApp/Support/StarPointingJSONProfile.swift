import Foundation
import PlanetariumCore

enum StarPointingJSONProfileV1 {
    static let profileID =
        "planetarium.precision-pointing.full-v1"
    static let schemaVersion = 1

    static func serialize(
        star: RenderedStar,
        context: StarPointingPayloadContext
    ) -> String? {
        guard
            let precision = context.precisionContext,
            precision.position.starHR == star.hr
        else {
            return nil
        }

        let object = profile(
            star: star,
            context: context,
            precision: precision
        )
        guard
            JSONSerialization.isValidJSONObject(object),
            let data = try? JSONSerialization.data(
                withJSONObject: object,
                options: [
                    .prettyPrinted,
                    .sortedKeys,
                    .withoutEscapingSlashes,
                ]
            )
        else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    private static func profile(
        star: RenderedStar,
        context: StarPointingPayloadContext,
        precision: StarPointingPrecisionContext
    ) -> [String: Any] {
        let position = precision.position
        let timeScales = precision.frame.timeScales

        return [
            "schemaVersion": schemaVersion,
            "profileId": profileID,
            "target": target(
                star,
                spaceMotionMode:
                    position.spaceMotionMode
            ),
            "observation": observation(context),
            "coordinates":
                coordinates(
                    star,
                    position: position
                ),
            "timeScales": timeScaleProfile(timeScales),
            "earthOrientation":
                earthOrientation(precision),
            "units": units,
            "conventions": conventions,
            "diagnostics":
                diagnostics(precision),
        ]
    }

    private static func target(
        _ star: RenderedStar,
        spaceMotionMode: SpaceMotionModeV2
    ) -> [String: Any] {
        let astrometry = star.catalog.astrometry
        return [
            "catalog": "BSC5P",
            "hd": jsonValue(star.catalog.hd),
            "hr": star.hr,
            "catalogName":
                jsonValue(star.catalog.catalogName),
            "nameJapanese":
                jsonValue(star.name?.nameJa),
            "nameEnglish":
                jsonValue(star.name?.name),
            "aliases": star.name?.aliases ?? [],
            "constellation":
                jsonValue(star.name?.constellation),
            "visualMagnitude":
                finiteJSON(star.catalog.visualMagnitude),
            "catalogKinematics": [
                "status":
                    catalogKinematicsStatus(
                        spaceMotionMode
                    ),
                "spaceMotionMode":
                    spaceMotionMode.rawValue,
                "properMotionRaCosDecArcsecondsPerYear":
                    finiteJSON(
                        astrometry?
                            .properMotionRightAscensionCosDeclinationArcsecondsPerYear
                    ),
                "properMotionDecArcsecondsPerYear":
                    finiteJSON(
                        astrometry?
                            .properMotionDeclinationArcsecondsPerYear
                    ),
                "parallaxArcseconds":
                    finiteJSON(
                        astrometry?.parallaxArcseconds
                    ),
                "radialVelocityKilometersPerSecond":
                    finiteJSON(
                        astrometry?
                            .radialVelocityKilometersPerSecond
                    ),
            ],
        ]
    }

    private static func observation(
        _ context: StarPointingPayloadContext
    ) -> [String: Any] {
        let location = context.location
        return [
            "utc":
                StarPointingPayloadFormatter.utcTimestamp(
                    context.observationDate
                ),
            "timeZone": location.timeZoneIdentifier,
            "localDateTime":
                localTimestamp(
                    context.observationDate,
                    timeZoneIdentifier:
                        location.timeZoneIdentifier
                ),
            "location": [
                "status": "available",
                "referenceFrame": "WGS84",
                "latitudeDegrees": location.latitude,
                "longitudeDegrees": location.longitude,
                "heightMeters": location.heightMeters,
                "name": location.name,
                "source": locationSource(location),
                "horizontalAccuracyMeters":
                    jsonValue(
                        location.horizontalAccuracyMeters
                    ),
                "horizontalAccuracyStatus":
                    location.horizontalAccuracyMeters
                        == nil
                    ? "unavailable"
                    : "available",
            ],
        ]
    }

    private static func coordinates(
        _ star: RenderedStar,
        position: ApparentStarPositionV2
    ) -> [String: Any] {
        [
            "catalogJ2000": [
                "status": "calculated",
                "frame": "FK5",
                "origin": "catalog-direction",
                "equinox": "J2000.0",
                "epoch": "J2000.0",
                "units": "radian",
                "rightAscensionRadians":
                    star.catalog.rightAscension,
                "declinationRadians":
                    star.catalog.declination,
            ],
            "geocentricApparent": [
                "status": "calculated",
                "origin": "geocenter",
                "frame":
                    "true-equator-and-equinox-of-date",
                "equinox": "observation-date",
                "units": "radian",
                "rightAscensionRadians":
                    position.apparentEquatorial
                    .rightAscension,
                "declinationRadians":
                    position.apparentEquatorial
                    .declination,
            ],
            "vacuumTopocentric":
                horizontalProfile(
                    position.geometricHorizontal,
                    status: "calculated",
                    extra: ["atmosphere": "vacuum"]
                ),
            "observedTopocentric":
                horizontalProfile(
                    position.observedHorizontal,
                    status:
                        refractionCoordinateStatus(
                            position.refractionMode
                        ),
                    extra: [
                        "refractionMode":
                            position.refractionMode
                            .rawValue,
                    ]
                ),
        ]
    }

    private static func timeScaleProfile(
        _ timeScales: ResolvedTimeScalesV2
    ) -> [String: Any] {
        [
            "status":
                timeScales.dut1Source == .assumedZero
                ? "available-with-assumed-zero-dut1"
                : "available",
            "jdUTC": timeScales.utcJulianDate,
            "jdUT1": timeScales.ut1JulianDate,
            "jdTT": timeScales.ttJulianDate,
            "dut1Seconds": timeScales.dut1Seconds,
            "dut1UncertaintySeconds":
                jsonValue(
                    timeScales.dut1UncertaintySeconds
                ),
            "dut1Source":
                timeScales.dut1Source.rawValue,
            "taiMinusUTCSeconds":
                timeScales.taiMinusUTCSeconds,
            "taiMinusUTCSource":
                timeScales.taiMinusUTCSource.rawValue,
        ]
    }

    private static func earthOrientation(
        _ precision: StarPointingPrecisionContext
    ) -> [String: Any] {
        let timeScales = precision.frame.timeScales
        let polarMotion = precision.frame.polarMotion
        let estimate =
            precision.earthOrientationEstimate
        let dut1Status =
            switch timeScales.dut1Source {
            case .assumedZero:
                "assumed-zero"
            case .caller:
                "caller"
            case .iersObserved, .iersPredicted:
                "available"
            }
        let polarStatus =
            polarMotionStatus(polarMotion.mode)

        return [
            "status":
                earthOrientationStatus(
                    dut1Source: timeScales.dut1Source,
                    polarMotionMode: polarMotion.mode
                ),
            "sourceIdentifier":
                jsonValue(
                    precision
                        .earthOrientationSourceIdentifier
                ),
            "appliedDut1Seconds":
                timeScales.dut1Seconds,
            "dut1Status": dut1Status,
            "dut1Source":
                timeScales.dut1Source.rawValue,
            "dut1Quality":
                jsonValue(
                    iersQuality(
                        timeScales.dut1Source
                    )
                ),
            "dut1ReportedErrorSeconds":
                jsonValue(
                    timeScales
                        .dut1UncertaintySeconds
                ),
            "polarMotionStatus": polarStatus,
            "polarMotionSource":
                polarMotionSource(
                    polarMotion.mode
                ),
            "polarMotionQuality":
                jsonValue(
                    iersQuality(
                        polarMotion.mode
                    )
                ),
            "xpAppliedRadians":
                appliedPolarMotionValue(
                    polarMotion.xpRadians,
                    mode: polarMotion.mode
                ),
            "ypAppliedRadians":
                appliedPolarMotionValue(
                    polarMotion.ypRadians,
                    mode: polarMotion.mode
                ),
            "xpReportedErrorRadians":
                jsonValue(
                    polarMotion
                        .xpReportedErrorRadians
                ),
            "ypReportedErrorRadians":
                jsonValue(
                    polarMotion
                        .ypReportedErrorRadians
                ),
            "usesPrediction":
                usesPrediction(
                    estimate: estimate,
                    mode: polarMotion.mode
                ),
        ]
    }

    private static var units: [String: Any] {
        [
            "rightAscension": "radian",
            "declination": "radian",
            "altitude": "degree",
            "azimuth": "degree",
            "polarMotion": "radian",
            "properMotion": "arcsecond/year",
            "parallax": "arcsecond",
            "radialVelocity": "kilometer/second",
            "dut1": "second",
            "julianDate": "day",
            "siteHeight": "meter",
        ]
    }

    private static var conventions: [String: Any] {
        [
            "azimuth": [
                "zeroDirection": "true-north",
                "positiveDirection":
                    "clockwise-toward-east",
                "rangeDegrees": "[0,360)",
                "undefinedRepresentation": NSNull(),
                "undefinedWhen": "zenith-or-nadir",
            ],
            "altitude": [
                "zeroPlane": "mathematical-horizon",
                "positiveDirection": "up",
                "rangeDegrees": "[-90,90]",
            ],
            "longitude": [
                "positiveDirection": "east",
                "rangeDegrees": "[-180,180]",
            ],
            "rightAscension": [
                "positiveDirection": "east",
                "rangeRadians": "[0,2pi)",
            ],
        ]
    }

    private static func diagnostics(
        _ precision: StarPointingPrecisionContext
    ) -> [String: Any] {
        let position = precision.position
        let metadata = position.metadata
        let timeScales = precision.frame.timeScales
        let refraction =
            refractionProfile(precision)

        return [
            "status": "precision-model-v2",
            "modelId": "planetarium-precision-v2",
            "omittedCorrections":
                omittedCorrectionIdentifiers(
                    metadata
                ),
            "refraction": refraction,
            "timeScaleWarnings":
                timeScales.warnings.map(\.rawValue),
            "models": [
                "calculationModel": "v2",
                "catalogFrame": "J2000.0 FK5",
                "frameConnectionModel":
                    metadata.frameConnectionModel,
                "precessionModel":
                    metadata.precessionModel,
                "nutationModel":
                    metadata.nutationModel,
                "siderealTimeModel":
                    metadata.siderealTimeModel,
                "spaceMotionMode":
                    position.spaceMotionMode.rawValue,
                "radialVelocityAssumedZero":
                    position
                    .radialVelocityAssumedZero,
                "annualParallaxMode":
                    position.annualParallaxMode
                    .rawValue,
                "annualAberrationMode":
                    metadata.aberrationMode
                    .rawValue,
                "solarLightDeflectionMode":
                    position
                    .solarLightDeflectionMode
                    .rawValue,
                "diurnalAberrationMode":
                    position.diurnalAberrationMode
                    .rawValue,
                "polarMotionMode":
                    position.polarMotionMode
                    .rawValue,
                "refractionMode":
                    position.refractionMode.rawValue,
            ],
            "approximations": [
                "simplifiedPositionModel": false,
                "apparentCoordinatesUnavailable":
                    false,
                "timeScalesUnavailable": false,
                "earthOrientationEstimateUnavailable":
                    precision
                    .earthOrientationEstimate
                    == nil,
                "dut1AssumedZero":
                    timeScales.dut1Source
                    == .assumedZero,
                "polarMotionAssumedZero":
                    position.polarMotionMode
                    == .assumedZero,
                "properMotionUnavailable":
                    position.spaceMotionMode == .none,
                "radialVelocityAssumedZero":
                    position
                    .radialVelocityAssumedZero,
                "approximateEarthEphemeris":
                    usesApproximateEarthEphemeris(
                        position: position,
                        aberrationMode:
                            metadata.aberrationMode
                    ),
                "refractionOutsideModelDomain":
                    position.refractionMode
                    == .belowModelAltitude,
            ],
            "warnings":
                metadata.warnings.map(\.rawValue),
            "precisionStatement":
                "Digits preserve calculation inputs and outputs; they do not guarantee measurement accuracy.",
        ]
    }

    private static func refractionProfile(
        _ precision: StarPointingPrecisionContext
    ) -> [String: Any] {
        let mode = precision.position.refractionMode
        let atmosphere = precision.atmosphere
        return [
            "mode": mode.rawValue,
            "status":
                refractionCoordinateStatus(mode),
            "description":
                refractionDescription(mode),
            "parametersStatus":
                atmosphere == nil
                ? "not-configured"
                : "configured",
            "parameters":
                atmosphere.map {
                    refractionParameters($0)
                } ?? NSNull(),
        ]
    }

    private static func refractionParameters(
        _ atmosphere: AtmosphereV2
    ) -> [String: Any] {
        [
            "inputSource":
                atmosphere == .standardVisual
                ? "standard"
                : "manual",
            "pressureHpa": atmosphere.pressureHPA,
            "temperatureCelsius":
                atmosphere.temperatureCelsius,
            "relativeHumidity":
                atmosphere.relativeHumidity,
            "wavelengthMicrometers":
                atmosphere.wavelengthMicrometers,
            "minimumGeometricAltitudeDegrees":
                atmosphere
                .minimumGeometricAltitudeDegrees,
        ]
    }

    private static func horizontalProfile(
        _ coordinates: HorizontalCoordinates,
        status: String,
        extra: [String: Any]
    ) -> [String: Any] {
        let azimuth: Any =
            coordinates.azimuthIsDefined
            ? Angles.normalizedDegrees(
                Angles.degrees(
                    fromRadians: coordinates.azimuth
                )
            )
            : NSNull()
        var profile: [String: Any] = [
            "altitudeDegrees":
                Angles.degrees(
                    fromRadians: coordinates.altitude
                ),
            "azimuthDegrees": azimuth,
            "azimuthStatus":
                coordinates.azimuthIsDefined
                ? "defined"
                : "undefined-at-zenith-or-nadir",
            "status": status,
            "frame": "local-ENU",
            "origin": "WGS84-observer",
            "units": "degree",
            "azimuthConvention":
                "north-zero-east-positive",
        ]
        profile.merge(extra) { _, new in new }
        return profile
    }

    private static func refractionCoordinateStatus(
        _ mode: RefractionModeV2
    ) -> String {
        switch mode {
        case .applied:
            "refraction-applied"
        case .belowModelAltitude:
            "refraction-not-applied-outside-model-domain"
        case .disabled:
            "refraction-disabled"
        }
    }

    private static func catalogKinematicsStatus(
        _ mode: SpaceMotionModeV2
    ) -> String {
        switch mode {
        case .threeDimensional:
            "three-dimensional"
        case .angularProperMotion:
            "angular-proper-motion"
        case .none:
            "catalog-position-only"
        }
    }

    private static func refractionDescription(
        _ mode: RefractionModeV2
    ) -> String {
        switch mode {
        case .applied:
            "標準大気差を適用"
        case .belowModelAltitude:
            "幾何高度（標準大気差の適用域外）"
        case .disabled:
            "幾何高度（大気差なし）"
        }
    }

    private static func earthOrientationStatus(
        dut1Source: DUT1SourceV2,
        polarMotionMode: PolarMotionModeV2
    ) -> String {
        let dut1IsIERS =
            dut1Source == .iersObserved
            || dut1Source == .iersPredicted
        let polarMotionIsIERS =
            polarMotionMode == .iersObserved
            || polarMotionMode == .iersPredicted
        if dut1IsIERS, polarMotionIsIERS {
            return "iers"
        }
        if dut1Source == .assumedZero,
           polarMotionMode == .assumedZero
        {
            return "assumed-zero"
        }
        if polarMotionMode == .disabled,
           dut1Source == .assumedZero
        {
            return "partial"
        }
        return "partial"
    }

    private static func polarMotionStatus(
        _ mode: PolarMotionModeV2
    ) -> String {
        switch mode {
        case .disabled:
            "unavailable"
        case .assumedZero:
            "assumed-zero"
        case .caller, .iersObserved, .iersPredicted:
            "available"
        }
    }

    private static func polarMotionSource(
        _ mode: PolarMotionModeV2
    ) -> String {
        switch mode {
        case .iersObserved:
            "observed"
        case .iersPredicted:
            "predicted"
        default:
            mode.rawValue
        }
    }

    private static func iersQuality(
        _ source: DUT1SourceV2
    ) -> String? {
        switch source {
        case .iersObserved:
            "observed"
        case .iersPredicted:
            "predicted"
        case .caller, .assumedZero:
            nil
        }
    }

    private static func iersQuality(
        _ mode: PolarMotionModeV2
    ) -> String? {
        switch mode {
        case .iersObserved:
            "observed"
        case .iersPredicted:
            "predicted"
        case .disabled, .caller, .assumedZero:
            nil
        }
    }

    private static func appliedPolarMotionValue(
        _ value: Double,
        mode: PolarMotionModeV2
    ) -> Any {
        mode == .disabled ? NSNull() : value
    }

    private static func usesPrediction(
        estimate: IERSEarthOrientationEstimateV1?,
        mode: PolarMotionModeV2
    ) -> Any {
        guard mode == .iersObserved
            || mode == .iersPredicted
        else {
            return NSNull()
        }
        return estimate?.polarMotion.usesPrediction
            ?? (mode == .iersPredicted)
    }

    private static func usesApproximateEarthEphemeris(
        position: ApparentStarPositionV2,
        aberrationMode: AberrationModeV2
    ) -> Bool {
        position.annualParallaxMode
            == .truncatedVSOP2000HeliocentricEarth
            || position.solarLightDeflectionMode
                == .truncatedVSOP2000HeliocentricEarth
            || aberrationMode
                == .truncatedVSOP2000HeliocentricEarth
    }

    private static func omittedCorrectionIdentifier(
        _ correction: OmittedCorrectionV2
    ) -> String {
        correction == .diurnalParallax
            ? "stellar-diurnal-parallax"
            : correction.rawValue
    }

    private static func omittedCorrectionIdentifiers(
        _ metadata: ApparentPositionMetadataV2
    ) -> [String] {
        var identifiers =
            metadata.omittedCorrections.map(
                omittedCorrectionIdentifier
            )
        if metadata.aberrationMode == .disabled {
            identifiers.append("annual-aberration")
        }
        return identifiers
    }

    private static func locationSource(
        _ location: ObservingLocation
    ) -> String {
        switch location.id {
        case "custom":
            "manual"
        case "current":
            "device-geolocation"
        default:
            "bundled-city"
        }
    }

    private static func localTimestamp(
        _ date: Date,
        timeZoneIdentifier: String
    ) -> String {
        let formatter = DateFormatter()
        formatter.calendar =
            Calendar(identifier: .gregorian)
        formatter.locale =
            Locale(identifier: "en_US_POSIX")
        formatter.timeZone =
            TimeZone(identifier: timeZoneIdentifier)
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return formatter.string(from: date)
    }

    private static func finiteJSON(
        _ value: Double?
    ) -> Any {
        guard let value, value.isFinite else {
            return NSNull()
        }
        return value
    }

    private static func jsonValue<T>(
        _ value: T?
    ) -> Any {
        guard let value else {
            return NSNull()
        }
        return value
    }
}
