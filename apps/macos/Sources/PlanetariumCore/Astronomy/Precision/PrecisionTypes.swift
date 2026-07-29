import Foundation

public enum PrecisionWarningCode: String, Codable, CaseIterable, Hashable, Sendable {
    case dut1AssumedZero = "dut1-assumed-zero"
    case pre1972UTCTTApproximation = "pre-1972-utc-tt-approximation"
    case futureLeapSecondsUnknown = "future-leap-seconds-unknown"
    case catalogFK5PrecisionLimited = "catalog-fk5-precision-limited"
    case properMotionMissing = "proper-motion-missing"
    case radialVelocityMissingAssumedZero =
        "radial-velocity-missing-assumed-zero"
    case annualParallaxDisabled = "annual-parallax-disabled"
    case annualParallaxUnavailable = "annual-parallax-unavailable"
    case annualParallaxApproximateEphemeris =
        "annual-parallax-approximate-ephemeris"
    case solarLightDeflectionDisabled =
        "solar-light-deflection-disabled"
    case solarLightDeflectionApproximateEphemeris =
        "solar-light-deflection-approximate-ephemeris"
    case aberrationDisabled = "aberration-disabled"
    case aberrationApproximateEphemeris = "aberration-approximate-ephemeris"
    case diurnalAberrationDisabled = "diurnal-aberration-disabled"
    case observerHeightAssumedZero = "observer-height-assumed-zero"
    case polarMotionAssumedZero = "polar-motion-assumed-zero"
    case refractionDisabled = "refraction-disabled"
    case refractionBelowModelAltitude = "refraction-below-model-altitude"
}

public enum DUT1SourceV2: String, Codable, Hashable, Sendable {
    case caller
    case iersObserved = "iers-observed"
    case iersPredicted = "iers-predicted"
    case assumedZero = "assumed-zero"
}

public enum PolarMotionSourceV2:
    String, Codable, Hashable, Sendable
{
    case caller
    case iersObserved = "iers-observed"
    case iersPredicted = "iers-predicted"
    case assumedZero = "assumed-zero"
}

public struct PolarMotionOptionsV2: Hashable, Sendable {
    public let xpRadians: Double
    public let ypRadians: Double
    public let source: PolarMotionSourceV2
    /**
     Source-reported errors. Their statistical interpretation belongs to the
     source product; both axes must be supplied together for IERS values.
     */
    public let xpReportedErrorRadians: Double?
    public let ypReportedErrorRadians: Double?

    public init(
        xpRadians: Double,
        ypRadians: Double,
        source: PolarMotionSourceV2 = .caller,
        xpReportedErrorRadians: Double? = nil,
        ypReportedErrorRadians: Double? = nil
    ) {
        self.xpRadians = xpRadians
        self.ypRadians = ypRadians
        self.source = source
        self.xpReportedErrorRadians =
            xpReportedErrorRadians
        self.ypReportedErrorRadians =
            ypReportedErrorRadians
    }

    public static let assumedZero = PolarMotionOptionsV2(
        xpRadians: 0,
        ypRadians: 0,
        source: .assumedZero
    )
}

public enum TAIMinusUTCSourceV2: String, Codable, Hashable, Sendable {
    case caller
    case iersHistory = "iers-history"
    case pre1972Approximation = "pre-1972-approximation"
}

public struct EarthOrientationOptionsV2: Hashable, Sendable {
    /// UT1−UTC in seconds. When omitted, zero is used and reported as an approximation.
    public let dut1Seconds: Double?
    /// Provenance attached to an explicitly supplied DUT1 value.
    public let dut1Source: DUT1SourceV2?
    /// Uncertainty or source-reported error of DUT1 in seconds.
    public let dut1UncertaintySeconds: Double?
    /// Celestial Intermediate Pole coordinates in the terrestrial frame.
    public let polarMotion: PolarMotionOptionsV2?
    /// TAI−UTC in seconds. When omitted, the bundled IERS history is used where defined.
    public let taiMinusUTCSeconds: Double?

    public init(
        dut1Seconds: Double? = nil,
        dut1Source: DUT1SourceV2? = nil,
        dut1UncertaintySeconds: Double? = nil,
        polarMotion: PolarMotionOptionsV2? = nil,
        taiMinusUTCSeconds: Double? = nil
    ) {
        self.dut1Seconds = dut1Seconds
        self.dut1Source = dut1Source
        self.dut1UncertaintySeconds = dut1UncertaintySeconds
        self.polarMotion = polarMotion
        self.taiMinusUTCSeconds = taiMinusUTCSeconds
    }
}

public struct ResolvedTimeScalesV2: Hashable, Sendable {
    public let utcJulianDate: Double
    public let taiJulianDate: Double
    public let ttJulianDate: Double
    public let ut1JulianDate: Double
    public let dut1Seconds: Double
    public let dut1UncertaintySeconds: Double?
    public let taiMinusUTCSeconds: Double
    public let dut1Source: DUT1SourceV2
    public let taiMinusUTCSource: TAIMinusUTCSourceV2
    public let warnings: [PrecisionWarningCode]

    public init(
        utcJulianDate: Double,
        taiJulianDate: Double,
        ttJulianDate: Double,
        ut1JulianDate: Double,
        dut1Seconds: Double,
        dut1UncertaintySeconds: Double?,
        taiMinusUTCSeconds: Double,
        dut1Source: DUT1SourceV2,
        taiMinusUTCSource: TAIMinusUTCSourceV2,
        warnings: [PrecisionWarningCode]
    ) {
        self.utcJulianDate = utcJulianDate
        self.taiJulianDate = taiJulianDate
        self.ttJulianDate = ttJulianDate
        self.ut1JulianDate = ut1JulianDate
        self.dut1Seconds = dut1Seconds
        self.dut1UncertaintySeconds = dut1UncertaintySeconds
        self.taiMinusUTCSeconds = taiMinusUTCSeconds
        self.dut1Source = dut1Source
        self.taiMinusUTCSource = taiMinusUTCSource
        self.warnings = warnings
    }
}

public struct AtmosphereV2: Hashable, Sendable {
    public let pressureHPA: Double
    public let temperatureCelsius: Double
    public let relativeHumidity: Double
    /// Visual or near-infrared wavelength in micrometres.
    public let wavelengthMicrometers: Double
    /// The fast tangent polynomial is not applied below this geometric altitude.
    public let minimumGeometricAltitudeDegrees: Double

    public init(
        pressureHPA: Double,
        temperatureCelsius: Double,
        relativeHumidity: Double,
        wavelengthMicrometers: Double,
        minimumGeometricAltitudeDegrees: Double = 5
    ) {
        self.pressureHPA = pressureHPA
        self.temperatureCelsius = temperatureCelsius
        self.relativeHumidity = relativeHumidity
        self.wavelengthMicrometers = wavelengthMicrometers
        self.minimumGeometricAltitudeDegrees = minimumGeometricAltitudeDegrees
    }

    /// Explicit opt-in preset used by the macOS UI.
    public static let standardVisual = AtmosphereV2(
        pressureHPA: 1_013.25,
        temperatureCelsius: 10,
        relativeHumidity: 0.5,
        wavelengthMicrometers: 0.55,
        minimumGeometricAltitudeDegrees: 5
    )
}

public struct CustomAberrationV2: Hashable, Sendable {
    /// Observer barycentric velocity in units of the speed of light.
    public let observerBarycentricVelocityC: Vector3D
    public let sunObserverDistanceAU: Double

    public init(
        observerBarycentricVelocityC: Vector3D,
        sunObserverDistanceAU: Double
    ) {
        self.observerBarycentricVelocityC = observerBarycentricVelocityC
        self.sunObserverDistanceAU = sunObserverDistanceAU
    }
}

public struct CustomAnnualParallaxV2: Hashable, Sendable {
    /**
     SSB-to-actual-observing-site position in AU, expressed in
     BCRS/Hipparcos-aligned axes.

     Callers must include the site's displacement from the Earth center when
     they want metadata to report diurnal parallax as applied.
     */
    public let observerPositionAU: Vector3D

    public init(observerPositionAU: Vector3D) {
        self.observerPositionAU = observerPositionAU
    }
}

public struct CustomSolarLightDeflectionV2: Hashable, Sendable {
    /**
     Unit vector from the Sun to the observer in the same
     BCRS/Hipparcos-aligned axes as the natural source direction.
     */
    public let sunToObserverUnitDirection: Vector3D
    /// Sun-to-observer distance in AU.
    public let sunObserverDistanceAU: Double

    public init(
        sunToObserverUnitDirection: Vector3D,
        sunObserverDistanceAU: Double
    ) {
        self.sunToObserverUnitDirection =
            sunToObserverUnitDirection
        self.sunObserverDistanceAU = sunObserverDistanceAU
    }
}

public enum AnnualParallaxConfigurationV2: Hashable, Sendable {
    case truncatedVSOP2000HeliocentricEarth
    /// Compatibility option; evaluates the canonical truncated VSOP artifact.
    case approximateEarthMoonBarycenter
    case disabled
    case custom(CustomAnnualParallaxV2)
}

public enum SolarLightDeflectionConfigurationV2:
    Hashable, Sendable
{
    case truncatedVSOP2000HeliocentricEarth
    /// Compatibility option; evaluates the canonical truncated VSOP artifact.
    case approximateEarthMoonBarycenter
    case disabled
    case custom(CustomSolarLightDeflectionV2)
}

public enum AberrationConfigurationV2: Hashable, Sendable {
    case truncatedVSOP2000HeliocentricEarth
    /// Compatibility option; evaluates the canonical truncated VSOP artifact.
    case approximateEarthMoonBarycenter
    case disabled
    case custom(CustomAberrationV2)
}

public enum RefractionConfigurationV2: Hashable, Sendable {
    case disabled
    case atmosphere(AtmosphereV2)
}

public enum DiurnalAberrationConfigurationV2: Hashable, Sendable {
    /**
     Conventional SOFA split-at-CIRS first-order diurnal aberration.

     Height is above the WGS84 reference ellipsoid. When omitted, zero metres
     is used and reported as an explicit approximation.
     */
    case wgs84Observer(heightMeters: Double? = nil)
    case disabled
}

public struct ApparentPositionOptionsV2: Hashable, Sendable {
    public let earthOrientation: EarthOrientationOptionsV2
    /**
     Defaults to the shared 100-term VSOP2000 heliocentric Earth
     approximation. Disable it explicitly or provide an SSB-to-site BCRS
     observer position in AU.
     */
    public let annualParallax: AnnualParallaxConfigurationV2
    /**
     Defaults to solar geometry from the shared 100-term VSOP2000
     heliocentric Earth approximation. Disable it explicitly or provide a
     Sun-to-observer unit direction and distance.
     */
    public let solarLightDeflection:
        SolarLightDeflectionConfigurationV2
    public let aberration: AberrationConfigurationV2
    public let diurnalAberration: DiurnalAberrationConfigurationV2
    public let refraction: RefractionConfigurationV2

    public init(
        earthOrientation: EarthOrientationOptionsV2 = EarthOrientationOptionsV2(),
        annualParallax: AnnualParallaxConfigurationV2 =
            .truncatedVSOP2000HeliocentricEarth,
        solarLightDeflection:
            SolarLightDeflectionConfigurationV2 =
                .truncatedVSOP2000HeliocentricEarth,
        aberration: AberrationConfigurationV2 =
            .truncatedVSOP2000HeliocentricEarth,
        diurnalAberration: DiurnalAberrationConfigurationV2 =
            .wgs84Observer(),
        refraction: RefractionConfigurationV2 = .disabled
    ) {
        self.earthOrientation = earthOrientation
        self.annualParallax = annualParallax
        self.solarLightDeflection = solarLightDeflection
        self.aberration = aberration
        self.diurnalAberration = diurnalAberration
        self.refraction = refraction
    }
}

public enum SpaceMotionModeV2: String, Codable, Hashable, Sendable {
    case none
    case angularProperMotion = "angular-proper-motion"
    case threeDimensional = "three-dimensional"
}

public enum AberrationModeV2: String, Codable, Hashable, Sendable {
    case disabled
    case truncatedVSOP2000HeliocentricEarth =
        "truncated-vsop2000-heliocentric-earth"
    @available(
        *,
        deprecated,
        message: "Use truncatedVSOP2000HeliocentricEarth."
    )
    case jplApproximateEarthMoonBarycenter = "jpl-approximate-earth-moon-barycenter"
    case callerBarycentricVelocity = "caller-barycentric-velocity"
}

public enum AnnualParallaxModeV2: String, Codable, Hashable, Sendable {
    case disabled
    case unavailable
    case truncatedVSOP2000HeliocentricEarth =
        "truncated-vsop2000-heliocentric-earth"
    @available(
        *,
        deprecated,
        message: "Use truncatedVSOP2000HeliocentricEarth."
    )
    case jplApproximateEarthMoonBarycenter =
        "jpl-approximate-earth-moon-barycenter"
    case callerObserverPosition = "caller-observer-position"
}

public enum SolarLightDeflectionModeV2:
    String, Codable, Hashable, Sendable
{
    case disabled
    case truncatedVSOP2000HeliocentricEarth =
        "truncated-vsop2000-heliocentric-earth"
    @available(
        *,
        deprecated,
        message: "Use truncatedVSOP2000HeliocentricEarth."
    )
    case jplApproximateEarthMoonBarycenter =
        "jpl-approximate-earth-moon-barycenter"
    case callerSunObserverGeometry =
        "caller-sun-observer-geometry"
}

public enum SolarEphemerisModeV2:
    String, Codable, Hashable, Sendable
{
    case truncatedVSOP2000HeliocentricEarth =
        "truncated-vsop2000-heliocentric-earth"
    @available(
        *,
        deprecated,
        message: "Use truncatedVSOP2000HeliocentricEarth."
    )
    case jplApproximateEarthMoonBarycenter =
        "jpl-approximate-earth-moon-barycenter"
}

public enum DiurnalAberrationModeV2:
    String, Codable, Hashable, Sendable
{
    case disabled
    case wgs84Observer = "wgs84-observer"
}

public enum PolarMotionModeV2:
    String, Codable, Hashable, Sendable
{
    case disabled
    case caller
    case iersObserved = "iers-observed"
    case iersPredicted = "iers-predicted"
    case assumedZero = "assumed-zero"
}

public enum RefractionModeV2: String, Codable, Hashable, Sendable {
    case disabled
    case applied
    case belowModelAltitude = "below-model-altitude"
}

public enum OmittedCorrectionV2: String, Codable, CaseIterable, Hashable, Sendable {
    case annualParallax = "annual-parallax"
    case diurnalParallax = "diurnal-parallax"
    case solarLightDeflection = "solar-light-deflection"
    case planetaryLightDeflection =
        "planetary-light-deflection"
    @available(
        *,
        deprecated,
        message: "Use solarLightDeflection and planetaryLightDeflection."
    )
    case solarSystemLightDeflection = "solar-system-light-deflection"
    case diurnalAberration = "diurnal-aberration"
    case polarMotion = "polar-motion"
    case subdailyPolarMotionTides =
        "subdaily-polar-motion-tides"

    public static let allCases: [OmittedCorrectionV2] = [
        .annualParallax,
        .diurnalParallax,
        .solarLightDeflection,
        OmittedCorrectionV2(
            rawValue: "solar-system-light-deflection"
        )!,
        .planetaryLightDeflection,
        .diurnalAberration,
        .polarMotion,
        .subdailyPolarMotionTides,
    ]
}

public struct PrecisionMatrix3: Hashable, Sendable {
    public let row0: Vector3D
    public let row1: Vector3D
    public let row2: Vector3D

    public init(row0: Vector3D, row1: Vector3D, row2: Vector3D) {
        self.row0 = row0
        self.row1 = row1
        self.row2 = row2
    }

    public static let identity = PrecisionMatrix3(
        row0: .unitX,
        row1: .unitY,
        row2: .unitZ
    )

    public func applying(to vector: Vector3D) -> Vector3D {
        Vector3D(
            x: row0.dot(vector),
            y: row1.dot(vector),
            z: row2.dot(vector)
        )
    }
}

public struct PreparedAberrationContextV2: Hashable, Sendable {
    public let mode: AberrationModeV2
    public let observerBarycentricVelocityC: Vector3D
    public let reciprocalLorentzFactor: Double
    public let solarPotentialWeight: Double

    init(
        mode: AberrationModeV2,
        observerBarycentricVelocityC: Vector3D,
        reciprocalLorentzFactor: Double,
        solarPotentialWeight: Double
    ) {
        self.mode = mode
        self.observerBarycentricVelocityC = observerBarycentricVelocityC
        self.reciprocalLorentzFactor = reciprocalLorentzFactor
        self.solarPotentialWeight = solarPotentialWeight
    }
}

public enum AberrationContextV2: Hashable, Sendable {
    case disabled
    case prepared(PreparedAberrationContextV2)

    public var mode: AberrationModeV2 {
        switch self {
        case .disabled:
            .disabled
        case let .prepared(context):
            context.mode
        }
    }
}

public struct PreparedAnnualParallaxContextV2: Hashable, Sendable {
    public let mode: AnnualParallaxModeV2
    public let observerPositionAU: Vector3D

    init(
        mode: AnnualParallaxModeV2,
        observerPositionAU: Vector3D
    ) {
        self.mode = mode
        self.observerPositionAU = observerPositionAU
    }
}

public enum AnnualParallaxContextV2: Hashable, Sendable {
    case disabled
    case prepared(PreparedAnnualParallaxContextV2)

    public var mode: AnnualParallaxModeV2 {
        switch self {
        case .disabled:
            .disabled
        case let .prepared(context):
            context.mode
        }
    }
}

public struct PreparedSolarLightDeflectionContextV2:
    Hashable, Sendable
{
    public let mode: SolarLightDeflectionModeV2
    public let sunToObserverUnitDirection: Vector3D
    public let sunObserverDistanceAU: Double
    /// SOFA `ldsun` angular-separation limiter denominator.
    public let deflectionLimiter: Double
    /// Solar Schwarzschild radius divided by observer distance.
    public let gravitationalScale: Double

    init(
        mode: SolarLightDeflectionModeV2,
        sunToObserverUnitDirection: Vector3D,
        sunObserverDistanceAU: Double,
        deflectionLimiter: Double,
        gravitationalScale: Double
    ) {
        self.mode = mode
        self.sunToObserverUnitDirection =
            sunToObserverUnitDirection
        self.sunObserverDistanceAU = sunObserverDistanceAU
        self.deflectionLimiter = deflectionLimiter
        self.gravitationalScale = gravitationalScale
    }
}

public enum SolarLightDeflectionContextV2:
    Hashable, Sendable
{
    case disabled
    case prepared(PreparedSolarLightDeflectionContextV2)

    public var mode: SolarLightDeflectionModeV2 {
        switch self {
        case .disabled:
            .disabled
        case let .prepared(context):
            context.mode
        }
    }
}

public enum DiurnalAberrationContextV2: Hashable, Sendable {
    case disabled
    case wgs84Observer(heightMeters: Double, magnitude: Double)

    public var mode: DiurnalAberrationModeV2 {
        switch self {
        case .disabled:
            .disabled
        case .wgs84Observer:
            .wgs84Observer
        }
    }

    public var heightMeters: Double? {
        switch self {
        case .disabled:
            nil
        case let .wgs84Observer(heightMeters, _):
            heightMeters
        }
    }

    public var magnitude: Double? {
        switch self {
        case .disabled:
            nil
        case let .wgs84Observer(_, magnitude):
            magnitude
        }
    }
}

public struct PolarMotionContextV2: Hashable, Sendable {
    public let mode: PolarMotionModeV2
    public let xpRadians: Double
    public let ypRadians: Double
    public let xpReportedErrorRadians: Double?
    public let ypReportedErrorRadians: Double?
    public let tioLocatorRadians: Double
    public let matrix: PrecisionMatrix3

    init(
        mode: PolarMotionModeV2,
        xpRadians: Double,
        ypRadians: Double,
        xpReportedErrorRadians: Double?,
        ypReportedErrorRadians: Double?,
        tioLocatorRadians: Double,
        matrix: PrecisionMatrix3
    ) {
        self.mode = mode
        self.xpRadians = xpRadians
        self.ypRadians = ypRadians
        self.xpReportedErrorRadians =
            xpReportedErrorRadians
        self.ypReportedErrorRadians =
            ypReportedErrorRadians
        self.tioLocatorRadians = tioLocatorRadians
        self.matrix = matrix
    }
}

public struct RefractionCoefficientsV2: Hashable, Sendable {
    public let tangent: Double
    public let tangentCubed: Double

    public init(tangent: Double, tangentCubed: Double) {
        self.tangent = tangent
        self.tangentCubed = tangentCubed
    }
}

public enum RefractionContextV2: Hashable, Sendable {
    case disabled
    case configured(
        coefficients: RefractionCoefficientsV2,
        minimumGeometricAltitudeDegrees: Double
    )
}

/// Immutable, reusable per-frame state. Construct once and reuse for the complete catalog.
public struct ApparentPositionContextV2: Hashable, Sendable {
    public let modelVersion: Int
    public let location: ObservingLocation
    public let latitudeRadians: Double
    public let longitudeRadians: Double
    public let longitudeSine: Double
    public let longitudeCosine: Double
    public let latitudeSine: Double
    public let latitudeCosine: Double
    public let timeScales: ResolvedTimeScalesV2
    public let precessionNutationMatrix: PrecisionMatrix3
    public let greenwichApparentSiderealTime: Double
    public let annualParallax: AnnualParallaxContextV2
    public let solarLightDeflection:
        SolarLightDeflectionContextV2
    public let aberration: AberrationContextV2
    public let diurnalAberration: DiurnalAberrationContextV2
    public let polarMotion: PolarMotionContextV2
    public let refraction: RefractionContextV2
    public let baseWarnings: [PrecisionWarningCode]

    init(
        location: ObservingLocation,
        latitudeRadians: Double,
        longitudeRadians: Double,
        timeScales: ResolvedTimeScalesV2,
        precessionNutationMatrix: PrecisionMatrix3,
        greenwichApparentSiderealTime: Double,
        annualParallax: AnnualParallaxContextV2,
        solarLightDeflection:
            SolarLightDeflectionContextV2,
        aberration: AberrationContextV2,
        diurnalAberration: DiurnalAberrationContextV2,
        polarMotion: PolarMotionContextV2,
        refraction: RefractionContextV2,
        baseWarnings: [PrecisionWarningCode]
    ) {
        modelVersion = 2
        self.location = location
        self.latitudeRadians = latitudeRadians
        self.longitudeRadians = longitudeRadians
        longitudeSine = sin(longitudeRadians)
        longitudeCosine = cos(longitudeRadians)
        latitudeSine = sin(latitudeRadians)
        latitudeCosine = cos(latitudeRadians)
        self.timeScales = timeScales
        self.precessionNutationMatrix = precessionNutationMatrix
        self.greenwichApparentSiderealTime = greenwichApparentSiderealTime
        self.annualParallax = annualParallax
        self.solarLightDeflection = solarLightDeflection
        self.aberration = aberration
        self.diurnalAberration = diurnalAberration
        self.polarMotion = polarMotion
        self.refraction = refraction
        self.baseWarnings = baseWarnings
    }
}

public struct ApparentPositionMetadataV2: Hashable, Sendable {
    public let modelVersion: Int
    public let catalogFrame: String
    public let frameConnectionModel: String
    public let precessionModel: String
    public let nutationModel: String
    public let siderealTimeModel: String
    public let spaceMotionMode: SpaceMotionModeV2
    public let annualParallaxMode: AnnualParallaxModeV2
    public let solarLightDeflectionMode:
        SolarLightDeflectionModeV2
    public let aberrationMode: AberrationModeV2
    public let diurnalAberrationMode: DiurnalAberrationModeV2
    public let polarMotionMode: PolarMotionModeV2
    public let refractionMode: RefractionModeV2
    public let omittedCorrections: [OmittedCorrectionV2]
    public let timeScales: ResolvedTimeScalesV2
    public let warnings: [PrecisionWarningCode]
}

public struct LightweightApparentStarPositionV2: Hashable, Sendable {
    public let starHR: Int
    /**
     Hipparcos/ICRS-aligned barycentric astrometric direction after
     propagation from the J2000 epoch, before annual parallax, solar light
     deflection, and aberration.
     */
    public let astrometricJ2000: EquatorialCoordinates
    /// True equator and equinox-of-date apparent coordinates.
    public let apparentEquatorial: EquatorialCoordinates
    /// Vacuum position relative to the mathematical horizon.
    public let geometricHorizontal: HorizontalCoordinates
    /// Equals `geometricHorizontal` unless optical refraction was applied.
    public let observedHorizontal: HorizontalCoordinates
    public let projection: ProjectedPoint
    public let spaceMotionMode: SpaceMotionModeV2
    public let radialVelocityAssumedZero: Bool
    public let annualParallaxMode: AnnualParallaxModeV2
    public let solarLightDeflectionMode:
        SolarLightDeflectionModeV2
    public let diurnalAberrationMode: DiurnalAberrationModeV2
    public let polarMotionMode: PolarMotionModeV2
    public let refractionMode: RefractionModeV2

    public init(
        starHR: Int,
        astrometricJ2000: EquatorialCoordinates,
        apparentEquatorial: EquatorialCoordinates,
        geometricHorizontal: HorizontalCoordinates,
        observedHorizontal: HorizontalCoordinates,
        projection: ProjectedPoint,
        spaceMotionMode: SpaceMotionModeV2,
        radialVelocityAssumedZero: Bool,
        annualParallaxMode: AnnualParallaxModeV2,
        solarLightDeflectionMode:
            SolarLightDeflectionModeV2,
        diurnalAberrationMode: DiurnalAberrationModeV2,
        polarMotionMode: PolarMotionModeV2,
        refractionMode: RefractionModeV2
    ) {
        self.starHR = starHR
        self.astrometricJ2000 = astrometricJ2000
        self.apparentEquatorial = apparentEquatorial
        self.geometricHorizontal = geometricHorizontal
        self.observedHorizontal = observedHorizontal
        self.projection = projection
        self.spaceMotionMode = spaceMotionMode
        self.radialVelocityAssumedZero =
            radialVelocityAssumedZero
        self.annualParallaxMode = annualParallaxMode
        self.solarLightDeflectionMode =
            solarLightDeflectionMode
        self.diurnalAberrationMode = diurnalAberrationMode
        self.polarMotionMode = polarMotionMode
        self.refractionMode = refractionMode
    }
}

public struct ApparentStarPositionV2: Hashable, Sendable {
    public let lightweight: LightweightApparentStarPositionV2
    public let metadata: ApparentPositionMetadataV2

    public var starHR: Int { lightweight.starHR }
    public var astrometricJ2000: EquatorialCoordinates { lightweight.astrometricJ2000 }
    public var apparentEquatorial: EquatorialCoordinates { lightweight.apparentEquatorial }
    public var geometricHorizontal: HorizontalCoordinates { lightweight.geometricHorizontal }
    public var observedHorizontal: HorizontalCoordinates { lightweight.observedHorizontal }
    public var projection: ProjectedPoint { lightweight.projection }
    public var spaceMotionMode: SpaceMotionModeV2 { lightweight.spaceMotionMode }
    public var radialVelocityAssumedZero: Bool {
        lightweight.radialVelocityAssumedZero
    }
    public var annualParallaxMode: AnnualParallaxModeV2 {
        lightweight.annualParallaxMode
    }
    public var solarLightDeflectionMode:
        SolarLightDeflectionModeV2
    {
        lightweight.solarLightDeflectionMode
    }
    public var diurnalAberrationMode: DiurnalAberrationModeV2 {
        lightweight.diurnalAberrationMode
    }
    public var polarMotionMode: PolarMotionModeV2 {
        lightweight.polarMotionMode
    }
    public var refractionMode: RefractionModeV2 { lightweight.refractionMode }
}

public struct ApparentSunPositionV2: Hashable, Sendable {
    /// Apparent geocentric direction on the true equator/equinox of date.
    public let apparentEquatorial: EquatorialCoordinates
    /**
     Topocentric vacuum altitude and azimuth of the Sun's center, including
     WGS84 observing-site displacement and, when enabled, diurnal aberration.
     */
    public let geometricHorizontal: HorizontalCoordinates
    public let projection: ProjectedPoint
    public let ephemerisMode: SolarEphemerisModeV2
    public let aberrationMode: AberrationModeV2
    public let diurnalAberrationMode: DiurnalAberrationModeV2
    public let polarMotionMode: PolarMotionModeV2

    public init(
        apparentEquatorial: EquatorialCoordinates,
        geometricHorizontal: HorizontalCoordinates,
        projection: ProjectedPoint,
        ephemerisMode: SolarEphemerisModeV2,
        aberrationMode: AberrationModeV2,
        diurnalAberrationMode: DiurnalAberrationModeV2,
        polarMotionMode: PolarMotionModeV2
    ) {
        self.apparentEquatorial = apparentEquatorial
        self.geometricHorizontal = geometricHorizontal
        self.projection = projection
        self.ephemerisMode = ephemerisMode
        self.aberrationMode = aberrationMode
        self.diurnalAberrationMode = diurnalAberrationMode
        self.polarMotionMode = polarMotionMode
    }
}

public struct RefractionResultV2: Hashable, Sendable {
    public let altitude: Double
    public let mode: RefractionModeV2
}

public enum PrecisionModelError: LocalizedError, Equatable, Sendable {
    case unsupportedObservationDate
    case nonFiniteValue(String)
    case dut1MetadataWithoutValue
    case dut1OutOfRange
    case dut1UncertaintyOutOfRange
    case taiMinusUTCOutOfRange
    case invalidLocation
    case invalidCatalogCoordinates(hr: Int)
    case invalidCatalogParallax(hr: Int)
    case nonFiniteCatalogAstrometry(hr: Int, field: String)
    case catalogSpaceVelocityAtOrAboveLightSpeed(hr: Int)
    case invalidVector
    case invalidSunObserverDistance
    case observerVelocityAtOrAboveLightSpeed
    case invalidAtmosphere(String)
    case invalidRefractionCoefficients
    case refractionInversionFailed
    case invalidGeometricAltitude
    case invalidMinimumRefractionAltitude
    case invalidGeodeticLatitude
    case invalidWGS84EllipsoidHeight
    case invalidDiurnalAberrationMagnitude
    case invalidPolarMotion(String)
    case invalidTioLocator

    public var errorDescription: String? {
        switch self {
        case .unsupportedObservationDate:
            "観測日時は1900-01-01から2100-12-31の範囲で指定してください。"
        case let .nonFiniteValue(name):
            "\(name)は有限の数値で指定してください。"
        case .dut1MetadataWithoutValue:
            "DUT1の出典と不確かさはDUT1値と一緒に指定してください。"
        case .dut1OutOfRange:
            "DUT1は−1秒から+1秒の範囲で指定してください。"
        case .dut1UncertaintyOutOfRange:
            "DUT1の不確かさは0秒から1秒の範囲で指定してください。"
        case .taiMinusUTCOutOfRange:
            "TAI−UTCは−100秒から+200秒の範囲で指定してください。"
        case .invalidLocation:
            "観測地点の緯度・経度またはタイムゾーンが不正です。"
        case let .invalidCatalogCoordinates(hr):
            "HR \(hr) のJ2000座標が不正です。"
        case let .invalidCatalogParallax(hr):
            "HR \(hr) の星表視差が物理的な対応範囲外です。"
        case let .nonFiniteCatalogAstrometry(hr, field):
            "HR \(hr) の\(field)は有限の数値で指定してください。"
        case let .catalogSpaceVelocityAtOrAboveLightSpeed(hr):
            "HR \(hr) の空間速度は光速未満である必要があります。"
        case .invalidVector:
            "ベクトルは有限かつゼロでない必要があります。"
        case .invalidSunObserverDistance:
            "太陽と観測者の距離は正の有限値で指定してください。"
        case .observerVelocityAtOrAboveLightSpeed:
            "観測者の速度は光速未満で指定してください。"
        case let .invalidAtmosphere(field):
            "大気パラメータ「\(field)」が対応範囲外です。"
        case .invalidRefractionCoefficients:
            "大気差係数が物理的な対応範囲外です。"
        case .refractionInversionFailed:
            "大気差の逆変換が安全に収束しませんでした。"
        case .invalidGeometricAltitude:
            "幾何高度は−π/2から+π/2の範囲で指定してください。"
        case .invalidMinimumRefractionAltitude:
            "大気差の最低適用高度は5°から30°の範囲で指定してください。"
        case .invalidGeodeticLatitude:
            "測地緯度は−π/2から+π/2の範囲で指定してください。"
        case .invalidWGS84EllipsoidHeight:
            "WGS84楕円体高は有限で、観測者が回転軸の外側にある値を指定してください。"
        case .invalidDiurnalAberrationMagnitude:
            "日周光行差の速度比は0以上1未満の有限値で指定してください。"
        case let .invalidPolarMotion(reason):
            "極運動の指定が不正です（\(reason)）。"
        case .invalidTioLocator:
            "TIO locatorは有限で±1秒角以内にしてください。"
        }
    }
}
