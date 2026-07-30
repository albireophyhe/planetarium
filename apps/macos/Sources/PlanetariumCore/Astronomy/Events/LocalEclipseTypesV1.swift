import Foundation

public enum EclipseClassificationV1:
    String, Codable, Hashable, Sendable
{
    case penumbral
    case partial
    case annular
    case total
    case hybrid
}

public enum EclipseVisibilityV1:
    String, Codable, Hashable, Sendable
{
    case fullyVisible = "fully-visible"
    case partlyVisible = "partly-visible"
    case belowHorizon = "below-horizon"
}

public enum SolarEclipseUncertainBoundaryV1:
    String, Codable, Hashable, Sendable
{
    case external
    case partialCentral = "partial-central"
}

public enum EclipseContactPhaseV1:
    String, Codable, Hashable, Sendable
{
    case solarC1 = "solar-c1"
    case solarC2 = "solar-c2"
    case maximum
    case solarC3 = "solar-c3"
    case solarC4 = "solar-c4"
    case lunarP1 = "lunar-p1"
    case lunarU1 = "lunar-u1"
    case lunarU2 = "lunar-u2"
    case lunarU3 = "lunar-u3"
    case lunarU4 = "lunar-u4"
    case lunarP4 = "lunar-p4"
}

public enum EventCalculationTierV1:
    String, Codable, Hashable, Sendable
{
    case normal
    case uncertain
    case reference
}

public enum EventLocationSourceV1:
    String, Codable, Hashable, Sendable
{
    case bundledCity = "bundled-city"
    case manual
    case deviceGeolocation = "device-geolocation"
}

public enum EventEOPQualityV1:
    String, Codable, Hashable, Sendable
{
    case observed
    case predicted
    case mixed
    case outsideCoverage = "outside-coverage"
    case callerOrAssumed = "caller-or-assumed"
}

public struct EclipseObserverContextV1: Hashable, Sendable {
    public let location: ObservingLocation
    public let heightMeters: Double
    public let horizontalAccuracyMeters: Double?
    public let locationSource: EventLocationSourceV1

    public init(
        location: ObservingLocation,
        heightMeters: Double,
        horizontalAccuracyMeters: Double?,
        locationSource: EventLocationSourceV1
    ) {
        self.location = location
        self.heightMeters = heightMeters
        self.horizontalAccuracyMeters =
            horizontalAccuracyMeters
        self.locationSource = locationSource
    }
}

public struct EclipseBodyPositionV1: Hashable, Sendable {
    public let horizontal: HorizontalCoordinates
    public let angularRadiusRadians: Double
    public let distanceKilometers: Double

    public init(
        horizontal: HorizontalCoordinates,
        angularRadiusRadians: Double,
        distanceKilometers: Double
    ) {
        self.horizontal = horizontal
        self.angularRadiusRadians = angularRadiusRadians
        self.distanceKilometers = distanceKilometers
    }
}

public struct EclipseContactV1: Hashable, Sendable {
    public let phase: EclipseContactPhaseV1
    public let instantUTC: Date
    public let sun: EclipseBodyPositionV1?
    public let moon: EclipseBodyPositionV1?
    public let aboveHorizon: Bool
    /**
     Contact point around the reference disc, in radians [0, 2π), measured
     eastward from CIP-defined celestial north in the CIRS tangent plane.
     `nil` at maximum and for degenerate directions. The reference disc is
     the Sun for solar eclipses and the Moon for lunar eclipses.
     */
    public let positionAngleRadians: Double?

    public init(
        phase: EclipseContactPhaseV1,
        instantUTC: Date,
        sun: EclipseBodyPositionV1?,
        moon: EclipseBodyPositionV1?,
        aboveHorizon: Bool,
        positionAngleRadians: Double? = nil
    ) {
        self.phase = phase
        self.instantUTC = instantUTC
        self.sun = sun
        self.moon = moon
        self.aboveHorizon = aboveHorizon
        self.positionAngleRadians = positionAngleRadians
    }
}

public struct EclipseForecastUncertaintyV1:
    Hashable, Sendable
{
    public let tier: EventCalculationTierV1
    public let timingSeconds: Double?
    public let pathKilometers: Double?
    public let observerLocationMeters: Double?
    public let dominantContributors: [String]

    public init(
        tier: EventCalculationTierV1,
        timingSeconds: Double?,
        pathKilometers: Double?,
        observerLocationMeters: Double?,
        dominantContributors: [String]
    ) {
        self.tier = tier
        self.timingSeconds = timingSeconds
        self.pathKilometers = pathKilometers
        self.observerLocationMeters =
            observerLocationMeters
        self.dominantContributors =
            dominantContributors
    }
}

public struct EclipseProvenanceV1: Hashable, Sendable {
    public let algorithmVersion: String
    public let ephemerisID: String
    public let ephemerisSourceSHA256: String
    public let eopID: String
    public let eopSourceSHA256: String?
    public let eopRetrievedAt: String?
    public let eopDUT1Quality: EventEOPQualityV1
    public let eopPolarMotionQuality:
        EventEOPQualityV1
    public let deltaTModel: String
    public let lunarRadiusModel: String
    public let limbProfileID: String?

    public init(
        algorithmVersion: String,
        ephemerisID: String,
        ephemerisSourceSHA256: String,
        eopID: String,
        eopSourceSHA256: String? = nil,
        eopRetrievedAt: String? = nil,
        eopDUT1Quality:
            EventEOPQualityV1 = .callerOrAssumed,
        eopPolarMotionQuality:
            EventEOPQualityV1 = .callerOrAssumed,
        deltaTModel: String,
        lunarRadiusModel: String,
        limbProfileID: String?
    ) {
        self.algorithmVersion = algorithmVersion
        self.ephemerisID = ephemerisID
        self.ephemerisSourceSHA256 =
            ephemerisSourceSHA256
        self.eopID = eopID
        self.eopSourceSHA256 = eopSourceSHA256
        self.eopRetrievedAt = eopRetrievedAt
        self.eopDUT1Quality = eopDUT1Quality
        self.eopPolarMotionQuality =
            eopPolarMotionQuality
        self.deltaTModel = deltaTModel
        self.lunarRadiusModel = lunarRadiusModel
        self.limbProfileID = limbProfileID
    }
}

public struct LocalEclipseCircumstancesV1:
    Hashable, Sendable
{
    public let candidate: EclipseCandidateV1
    public let title: String
    public let classification: EclipseClassificationV1
    public let observer: EclipseObserverContextV1
    public let visibility: EclipseVisibilityV1
    public let contacts: [EclipseContactV1]
    public let maximum: EclipseContactV1
    public let magnitude: Double
    public let obscuration: Double?
    public let uncertainty: EclipseForecastUncertaintyV1
    public let provenance: EclipseProvenanceV1
    public let warnings: [String]
    public let uncertainBoundary:
        SolarEclipseUncertainBoundaryV1?

    public var boundaryUncertain: Bool {
        uncertainBoundary != nil
    }

    public init(
        candidate: EclipseCandidateV1,
        title: String,
        classification: EclipseClassificationV1,
        observer: EclipseObserverContextV1,
        visibility: EclipseVisibilityV1,
        contacts: [EclipseContactV1],
        maximum: EclipseContactV1,
        magnitude: Double,
        obscuration: Double?,
        uncertainty: EclipseForecastUncertaintyV1,
        provenance: EclipseProvenanceV1,
        warnings: [String],
        uncertainBoundary:
            SolarEclipseUncertainBoundaryV1? = nil
    ) {
        self.candidate = candidate
        self.title = title
        self.classification = classification
        self.observer = observer
        self.visibility = visibility
        self.contacts = contacts
        self.maximum = maximum
        self.magnitude = magnitude
        self.obscuration = obscuration
        self.uncertainty = uncertainty
        self.provenance = provenance
        self.warnings = warnings
        self.uncertainBoundary = uncertainBoundary
    }
}

public struct LocalEclipseOptionsV1: Sendable {
    public let deltaTModel: String
    public let earthOrientation: EarthOrientationOptionsV2
    public let earthOrientationAt:
        (@Sendable (Date) throws
            -> EarthOrientationOptionsV2)?
    public let eopID: String
    public let eopSourceSHA256: String?
    public let eopRetrievedAt: String?
    public let eopDUT1Quality: EventEOPQualityV1
    public let eopPolarMotionQuality:
        EventEOPQualityV1
    public let earthRotationPathUncertaintyKilometers:
        Double?
    public let heightMeters: Double
    public let horizontalAccuracyMeters: Double?
    public let locationSource: EventLocationSourceV1
    public let halfWindowSeconds: Double?
    public let scanStepSeconds: Double?
    public let timingUncertaintySeconds: Double?
    public let timeScaleContributors: [String]
    public let timeScaleWarnings: [String]
    public let shouldCancel: (@Sendable () -> Bool)?

    public init(
        deltaTModel: String =
            "existing UTC-TAI-TT and caller DUT1",
        earthOrientation:
            EarthOrientationOptionsV2 =
                EarthOrientationOptionsV2(),
        earthOrientationAt:
            (@Sendable (Date) throws
                -> EarthOrientationOptionsV2)? = nil,
        eopID: String = "caller-or-assumed",
        eopSourceSHA256: String? = nil,
        eopRetrievedAt: String? = nil,
        eopDUT1Quality:
            EventEOPQualityV1 = .callerOrAssumed,
        eopPolarMotionQuality:
            EventEOPQualityV1 = .callerOrAssumed,
        earthRotationPathUncertaintyKilometers:
            Double? = nil,
        heightMeters: Double = 0,
        horizontalAccuracyMeters: Double? = nil,
        locationSource: EventLocationSourceV1 = .manual,
        halfWindowSeconds: Double? = nil,
        scanStepSeconds: Double? = nil,
        timingUncertaintySeconds: Double? = nil,
        timeScaleContributors: [String] = [],
        timeScaleWarnings: [String] = [],
        shouldCancel: (@Sendable () -> Bool)? = nil
    ) {
        self.deltaTModel = deltaTModel
        self.earthOrientation = earthOrientation
        self.earthOrientationAt = earthOrientationAt
        self.eopID = eopID
        self.eopSourceSHA256 = eopSourceSHA256
        self.eopRetrievedAt = eopRetrievedAt
        self.eopDUT1Quality = eopDUT1Quality
        self.eopPolarMotionQuality =
            eopPolarMotionQuality
        self.earthRotationPathUncertaintyKilometers =
            earthRotationPathUncertaintyKilometers
        self.heightMeters = heightMeters
        self.horizontalAccuracyMeters =
            horizontalAccuracyMeters
        self.locationSource = locationSource
        self.halfWindowSeconds = halfWindowSeconds
        self.scanStepSeconds = scanStepSeconds
        self.timingUncertaintySeconds =
            timingUncertaintySeconds
        self.timeScaleContributors =
            timeScaleContributors
        self.timeScaleWarnings = timeScaleWarnings
        self.shouldCancel = shouldCancel
    }

    func resolvedEarthOrientation(
        at date: Date
    ) throws -> EarthOrientationOptionsV2 {
        try earthOrientationAt?(date)
            ?? earthOrientation
    }
}

public enum LocalEclipseErrorV1:
    LocalizedError, Equatable, Sendable
{
    case wrongCandidateKind
    case invalidSearchOptions
    case contactsNotBracketed
    case invalidObserverHeight
    case invalidObserverAccuracy
    case invalidEarthRotationPathUncertainty

    public var errorDescription: String? {
        switch self {
        case .wrongCandidateKind:
            "現象候補と食計算の種類が一致しません。"
        case .invalidSearchOptions:
            "食の探索範囲または走査間隔が不正です。"
        case .contactsNotBracketed:
            "食の接触時刻を探索範囲内で挟み込めませんでした。"
        case .invalidObserverHeight:
            "観測地点の標高が不正です。"
        case .invalidObserverAccuracy:
            "観測地点の水平精度が不正です。"
        case .invalidEarthRotationPathUncertainty:
            "地球回転の経路不確かさが不正です。"
        }
    }
}

enum EclipseBodyV1: Sendable {
    case sun
    case moon
}

struct EclipseApparentBodyStateV1: Sendable {
    let body: EclipseBodyV1
    let tdbJulianDate: Double
    let lightTimeSeconds: Double
    let distanceKilometers: Double
    let angularRadiusRadians: Double
    let icrfDirection: Vector3D
    let cirsDirection: Vector3D
    let horizontal: HorizontalCoordinates?
}

struct EclipseApparentPairV1: Sendable {
    let sun: EclipseApparentBodyStateV1
    let moon: EclipseApparentBodyStateV1
}

struct EclipseSearchRangeV1:
    Equatable, Sendable
{
    let startSecondsSinceReferenceDate: Double
    let endSecondsSinceReferenceDate: Double
}

enum EclipseCalculationSupportV1 {
    /**
     Sun apparent-place evaluation requests retarded states about
     490–510 seconds before the reception epoch. Ten minutes keeps those
     requests inside the provider's actually loaded state coverage.
     */
    static let ephemerisLightTimeLookbackSeconds =
        600.0
    private static let
        boundaryAdjustmentStepSeconds = 0.001
    private static let
        maximumBoundaryAdjustments = 8
    private static let sunMeanRadiusKilometers =
        695_700.0
    private static let moonMeanRadiusKilometers =
        1_737.4
    private static let speedOfLightKilometersPerDay =
        PrecisionConstants.speedOfLightKilometersPerSecond
        * PrecisionConstants.secondsPerDay
    private static let earthRotationRadiansPerDay =
        1.002_737_811_911_354_6 * 2 * Double.pi

    /**
     Closed reception-time interval that is safe for apparent Sun/Moon
     evaluation with this provider.

     The lower edge reserves the light-time lookback. The upper edge does
     not need a reserve because all retarded epochs move earlier. Boundary
     conversion is explicitly nudged inward to prevent UTC↔TDB rounding
     from placing a solver sample just outside a closed DE442s endpoint.
     */
    static func ephemerisSearchRange(
        provider: DE442SEphemerisProviderV1
    ) throws -> EclipseSearchRangeV1 {
        let coverageStart =
            provider.coverageStartJulianDateTdb
        let coverageEnd =
            provider.coverageEndJulianDateTdb
        guard coverageStart.isFinite,
              coverageEnd.isFinite,
              coverageEnd > coverageStart
        else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        let safeStart =
            coverageStart
            + ephemerisLightTimeLookbackSeconds
                / PrecisionConstants.secondsPerDay
        guard safeStart < coverageEnd else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        let start =
            try secondsInsideTDBBoundary(
                safeStart,
                edge: .start
            )
        let end =
            try secondsInsideTDBBoundary(
                coverageEnd,
                edge: .end
            )
        guard start.isFinite,
              end.isFinite,
              end > start
        else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        return EclipseSearchRangeV1(
            startSecondsSinceReferenceDate: start,
            endSecondsSinceReferenceDate: end
        )
    }

    static func resolveSearchRange(
        candidateSecondsSinceReferenceDate:
            Double,
        halfWindowSeconds: Double,
        limit: EclipseSearchRangeV1? = nil
    ) throws -> EclipseSearchRangeV1 {
        guard
            candidateSecondsSinceReferenceDate
                .isFinite,
            halfWindowSeconds.isFinite,
            halfWindowSeconds > 0
        else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        let requestedStart =
            candidateSecondsSinceReferenceDate
            - halfWindowSeconds
        let requestedEnd =
            candidateSecondsSinceReferenceDate
            + halfWindowSeconds
        guard requestedStart.isFinite,
              requestedEnd.isFinite,
              requestedEnd > requestedStart
        else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        let start = max(
            requestedStart,
            limit?
                .startSecondsSinceReferenceDate
                ?? requestedStart
        )
        let end = min(
            requestedEnd,
            limit?
                .endSecondsSinceReferenceDate
                ?? requestedEnd
        )
        guard start.isFinite,
              end.isFinite,
              end > start,
              candidateSecondsSinceReferenceDate
                >= start,
              candidateSecondsSinceReferenceDate
                <= end
        else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        return EclipseSearchRangeV1(
            startSecondsSinceReferenceDate: start,
            endSecondsSinceReferenceDate: end
        )
    }

    private enum TDBBoundaryEdgeV1 {
        case start
        case end
    }

    private static func secondsInsideTDBBoundary(
        _ tdbJulianDate: Double,
        edge: TDBBoundaryEdgeV1
    ) throws -> Double {
        var seconds =
            try EventTimeScales
                .tdbToUTCDate(
                    tdbJulianDate:
                        tdbJulianDate
                )
                .timeIntervalSinceReferenceDate

        for _ in 0...maximumBoundaryAdjustments {
            let currentTDB =
                try EventTimeScales
                    .utcToTDBJulianDate(
                        Date(
                            timeIntervalSinceReferenceDate:
                                seconds
                        )
                    )
            switch edge {
            case .start:
                if currentTDB < tdbJulianDate {
                    seconds +=
                        boundaryAdjustmentStepSeconds
                    continue
                }
                let previousTDB =
                    try EventTimeScales
                        .utcToTDBJulianDate(
                            Date(
                                timeIntervalSinceReferenceDate:
                                    seconds
                                    - boundaryAdjustmentStepSeconds
                            )
                        )
                if previousTDB >= tdbJulianDate {
                    seconds -=
                        boundaryAdjustmentStepSeconds
                    continue
                }
            case .end:
                if currentTDB > tdbJulianDate {
                    seconds -=
                        boundaryAdjustmentStepSeconds
                    continue
                }
                let nextTDB =
                    try EventTimeScales
                        .utcToTDBJulianDate(
                            Date(
                                timeIntervalSinceReferenceDate:
                                    seconds
                                    + boundaryAdjustmentStepSeconds
                            )
                        )
                if nextTDB <= tdbJulianDate {
                    seconds +=
                        boundaryAdjustmentStepSeconds
                    continue
                }
            }
            return seconds
        }
        throw LocalEclipseErrorV1
            .invalidSearchOptions
    }

    static func validate(
        location: ObservingLocation,
        options: LocalEclipseOptionsV1
    ) throws -> ObservingLocation {
        let validLocation = try ObservationConstraints
            .validatedLocation(
                id: location.id,
                name: location.name,
                latitude: location.latitude,
                longitude: location.longitude,
                timeZoneIdentifier:
                    location.timeZoneIdentifier
            )
        guard options.heightMeters.isFinite,
              (-500...10_000).contains(
                options.heightMeters
              )
        else {
            throw LocalEclipseErrorV1
                .invalidObserverHeight
        }
        if let accuracy =
            options.horizontalAccuracyMeters
        {
            guard accuracy.isFinite, accuracy >= 0 else {
                throw LocalEclipseErrorV1
                .invalidObserverAccuracy
            }
        }
        if let pathUncertainty =
            options.earthRotationPathUncertaintyKilometers
        {
            guard pathUncertainty.isFinite,
                  pathUncertainty >= 0
            else {
                throw LocalEclipseErrorV1
                    .invalidEarthRotationPathUncertainty
            }
        }
        return validLocation
    }

    static func checkCancellation(
        _ shouldCancel: (@Sendable () -> Bool)?
    ) throws {
        try Task.checkCancellation()
        if shouldCancel?() == true {
            throw CancellationError()
        }
    }

    static func apparentTopocentricPair(
        provider: DE442SEphemerisProviderV1,
        at date: Date,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1
    ) async throws -> EclipseApparentPairV1 {
        try checkCancellation(options.shouldCancel)
        let earthOrientation =
            try options.resolvedEarthOrientation(
                at: date
            )
        let timeScales = try Astronomy.resolveTimeScalesV2(
            at: date,
            options: earthOrientation
        )
        let tdbJulianDate =
            try EventTimeScales.ttToTdbJulianDate(
                ttJulianDate: timeScales.ttJulianDate
            )
        let reception = try await provider.state(
            tdbJulianDate: tdbJulianDate
        )
        let precessionNutation =
            try Astronomy
                .precessionNutationMatrix2006BV2(
                    ttJulianDate:
                        timeScales.ttJulianDate
                )
        let siderealTime =
            try Astronomy
                .greenwichApparentSiderealTime2006BV2(
                    ut1JulianDate:
                        timeScales.ut1JulianDate,
                    ttJulianDate:
                        timeScales.ttJulianDate
                )
        let polarMotion =
            earthOrientation.polarMotion
                ?? .assumedZero
        let polarMotionMatrix =
            try Astronomy.polarMotionMatrix2000V2(
                xpRadians: polarMotion.xpRadians,
                ypRadians: polarMotion.ypRadians,
                tioLocatorRadians:
                    try Astronomy
                        .approximateTIOLocatorV2(
                            ttJulianDate:
                                timeScales.ttJulianDate
                        )
            )
        let latitudeRadians = Angles.radians(
            fromDegrees: location.latitude
        )
        let longitudeRadians = Angles.radians(
            fromDegrees: location.longitude
        )
        let itrsSiteKilometers =
            try Astronomy
                .wgs84ObserverPositionITRSAUV2(
                    geodeticLatitudeRadians:
                        latitudeRadians,
                    longitudeRadians: longitudeRadians,
                    heightMeters: options.heightMeters
                )
                * PrecisionConstants
                    .astronomicalUnitKilometers
        let tirsSiteKilometers =
            transpose(polarMotionMatrix)
                .applying(to: itrsSiteKilometers)
        let cirsSiteKilometers = rotateTIRSToCIRS(
            tirsSiteKilometers,
            siderealTime: siderealTime
        )
        let icrfSiteKilometers =
            transpose(precessionNutation)
                .applying(to: cirsSiteKilometers)
        let cirsSiteVelocity = Vector3D(
            x:
                -earthRotationRadiansPerDay
                * cirsSiteKilometers.y,
            y:
                earthRotationRadiansPerDay
                * cirsSiteKilometers.x,
            z: 0
        )
        let icrfSiteVelocity =
            transpose(precessionNutation)
                .applying(to: cirsSiteVelocity)
        let observerPosition =
            reception.earthBarycentric
                .positionKilometers
            + icrfSiteKilometers
        let observerVelocity =
            reception.earthBarycentric
                .velocityKilometersPerDay
            + icrfSiteVelocity
        let sunDistanceAU =
            (
                reception.sunGeocentric
                    .positionKilometers
                - icrfSiteKilometers
            ).length
            / PrecisionConstants
                .astronomicalUnitKilometers

        let sun = try await apparentBody(
            provider: provider,
            body: .sun,
            tdbJulianDate: tdbJulianDate,
            observerPositionKilometers:
                observerPosition,
            observerVelocityKilometersPerDay:
                observerVelocity,
            sunDistanceAU: sunDistanceAU,
            precessionNutation:
                precessionNutation,
            polarMotion: polarMotionMatrix,
            siderealTime: siderealTime,
            latitudeRadians: latitudeRadians,
            longitudeRadians: longitudeRadians
        )
        let moon = try await apparentBody(
            provider: provider,
            body: .moon,
            tdbJulianDate: tdbJulianDate,
            observerPositionKilometers:
                observerPosition,
            observerVelocityKilometersPerDay:
                observerVelocity,
            sunDistanceAU: sunDistanceAU,
            precessionNutation:
                precessionNutation,
            polarMotion: polarMotionMatrix,
            siderealTime: siderealTime,
            latitudeRadians: latitudeRadians,
            longitudeRadians: longitudeRadians
        )
        return EclipseApparentPairV1(
            sun: sun,
            moon: moon
        )
    }

    static func apparentGeocentricPair(
        provider: DE442SEphemerisProviderV1,
        at date: Date,
        earthOrientation: EarthOrientationOptionsV2,
        shouldCancel: (@Sendable () -> Bool)?
    ) async throws -> EclipseApparentPairV1 {
        try checkCancellation(shouldCancel)
        let timeScales = try Astronomy.resolveTimeScalesV2(
            at: date,
            options: earthOrientation
        )
        let tdbJulianDate =
            try EventTimeScales.ttToTdbJulianDate(
                ttJulianDate: timeScales.ttJulianDate
            )
        let reception = try await provider.state(
            tdbJulianDate: tdbJulianDate
        )
        let precessionNutation =
            try Astronomy
                .precessionNutationMatrix2006BV2(
                    ttJulianDate:
                        timeScales.ttJulianDate
                )
        let observerPosition =
            reception.earthBarycentric
                .positionKilometers
        let observerVelocity =
            reception.earthBarycentric
                .velocityKilometersPerDay
        let sunDistanceAU =
            reception.sunGeocentric
                .positionKilometers.length
            / PrecisionConstants
                .astronomicalUnitKilometers
        let sun = try await apparentBody(
            provider: provider,
            body: .sun,
            tdbJulianDate: tdbJulianDate,
            observerPositionKilometers:
                observerPosition,
            observerVelocityKilometersPerDay:
                observerVelocity,
            sunDistanceAU: sunDistanceAU,
            precessionNutation:
                precessionNutation
        )
        let moon = try await apparentBody(
            provider: provider,
            body: .moon,
            tdbJulianDate: tdbJulianDate,
            observerPositionKilometers:
                observerPosition,
            observerVelocityKilometersPerDay:
                observerVelocity,
            sunDistanceAU: sunDistanceAU,
            precessionNutation:
                precessionNutation
        )
        return EclipseApparentPairV1(
            sun: sun,
            moon: moon
        )
    }

    static func angularSeparation(
        _ first: Vector3D,
        _ second: Vector3D
    ) -> Double {
        atan2(
            first.cross(second).length,
            first.dot(second)
        )
    }

    static func visibility(
        contacts: [EclipseContactV1]
    ) -> EclipseVisibilityV1 {
        let count = contacts.filter(\.aboveHorizon).count
        if count == 0 {
            return .belowHorizon
        }
        return count == contacts.count
            ? .fullyVisible
            : .partlyVisible
    }

    /**
     Classifies a physical-boundary case where only the closest-approach
     sample is trustworthy. A positive clearance is intentionally partial:
     without certain contact roots the complete interval cannot be claimed
     to be above the horizon.
     */
    static func boundaryMaximumIsAboveHorizon(
        horizonClearanceRadians: Double
    ) throws -> Bool {
        guard horizonClearanceRadians.isFinite else {
            throw EventNumericsError
                .nonFiniteValue("horizon clearance")
        }
        return horizonClearanceRadians > 0
    }

    /**
     Evaluates the full event interval, not just named contacts. Two-hour
     segments keep the smooth Sun/Moon altitude function unimodal for the
     derivative-free extrema search while still catching a rise and set
     between contacts that are both below the horizon.
     */
    static func intervalVisibility(
        start: Double,
        end: Double,
        horizonClearanceAt:
            (Double) async throws -> Double,
        shouldCancel: (@Sendable () -> Bool)?,
        toleranceSeconds: Double = 1,
        maximumSegmentSeconds: Double = 2 * 60 * 60
    ) async throws -> EclipseVisibilityV1 {
        guard start.isFinite,
              end.isFinite,
              toleranceSeconds.isFinite,
              maximumSegmentSeconds.isFinite,
              end >= start,
              toleranceSeconds > 0,
              maximumSegmentSeconds > toleranceSeconds
        else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        let startValue =
            try await horizonClearanceAt(start)
        guard startValue.isFinite else {
            throw EventNumericsError
                .nonFiniteValue("horizon clearance")
        }
        if end == start {
            return startValue > 0
                ? .fullyVisible
                : .belowHorizon
        }

        var minimumClearance = startValue
        var maximumClearance = startValue
        var segmentStart = start
        while segmentStart < end {
            try checkCancellation(shouldCancel)
            let segmentEnd = min(
                end,
                segmentStart + maximumSegmentSeconds
            )
            let endValue =
                try await horizonClearanceAt(segmentEnd)
            guard endValue.isFinite else {
                throw EventNumericsError
                    .nonFiniteValue("horizon clearance")
            }
            let minimumArgument =
                try await asyncMinimum(
                    functionValue:
                        horizonClearanceAt,
                    lowerArgument: segmentStart,
                    upperArgument: segmentEnd,
                    argumentTolerance:
                        toleranceSeconds,
                    shouldCancel: shouldCancel
                )
            let minimumValue =
                try await horizonClearanceAt(
                    minimumArgument
                )
            let maximumArgument =
                try await asyncMinimum(
                    functionValue: {
                        -(try await horizonClearanceAt($0))
                    },
                    lowerArgument: segmentStart,
                    upperArgument: segmentEnd,
                    argumentTolerance:
                        toleranceSeconds,
                    shouldCancel: shouldCancel
                )
            let maximumValue =
                try await horizonClearanceAt(
                    maximumArgument
                )
            guard minimumValue.isFinite,
                  maximumValue.isFinite
            else {
                throw EventNumericsError
                    .nonFiniteValue("horizon clearance")
            }
            minimumClearance = min(
                minimumClearance,
                endValue,
                minimumValue
            )
            maximumClearance = max(
                maximumClearance,
                endValue,
                maximumValue
            )
            segmentStart = segmentEnd
        }

        if maximumClearance <= 0 {
            return .belowHorizon
        }
        return minimumClearance > 0
            ? .fullyVisible
            : .partlyVisible
    }

    static func observer(
        location: ObservingLocation,
        options: LocalEclipseOptionsV1
    ) -> EclipseObserverContextV1 {
        EclipseObserverContextV1(
            location: location,
            heightMeters: options.heightMeters,
            horizontalAccuracyMeters:
                options.horizontalAccuracyMeters,
            locationSource: options.locationSource
        )
    }

    static func asyncMinimum(
        functionValue:
            (Double) async throws -> Double,
        lowerArgument: Double,
        upperArgument: Double,
        argumentTolerance: Double,
        shouldCancel: (@Sendable () -> Bool)?,
        maximumIterations: Int = 128
    ) async throws -> Double {
        guard lowerArgument.isFinite,
              upperArgument.isFinite,
              argumentTolerance.isFinite,
              upperArgument > lowerArgument,
              argumentTolerance > 0,
              maximumIterations > 0
        else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        let inverseGoldenRatio = (sqrt(5) - 1) / 2
        var lower = lowerArgument
        var upper = upperArgument
        var right =
            lower + inverseGoldenRatio * (upper - lower)
        var left =
            upper - inverseGoldenRatio * (upper - lower)
        var leftValue = try await functionValue(left)
        var rightValue = try await functionValue(right)
        guard leftValue.isFinite, rightValue.isFinite else {
            throw EventNumericsError
                .nonFiniteValue("minimum value")
        }

        var iteration = 0
        while upper - lower > argumentTolerance,
              iteration < maximumIterations
        {
            try checkCancellation(shouldCancel)
            iteration += 1
            if leftValue <= rightValue {
                upper = right
                right = left
                rightValue = leftValue
                left =
                    upper
                    - inverseGoldenRatio
                    * (upper - lower)
                leftValue =
                    try await functionValue(left)
            } else {
                lower = left
                left = right
                leftValue = rightValue
                right =
                    lower
                    + inverseGoldenRatio
                    * (upper - lower)
                rightValue =
                    try await functionValue(right)
            }
            guard leftValue.isFinite,
                  rightValue.isFinite
            else {
                throw EventNumericsError
                    .nonFiniteValue("minimum value")
            }
        }
        guard upper - lower <= argumentTolerance else {
            throw EventNumericsError.minimumDidNotConverge
        }
        return (lower + upper) / 2
    }

    static func asyncSignChangeBrackets(
        functionValue:
            (Double) async throws -> Double,
        lowerArgument: Double,
        upperArgument: Double,
        step: Double,
        shouldCancel: (@Sendable () -> Bool)?
    ) async throws -> [SignChangeBracket] {
        guard lowerArgument.isFinite,
              upperArgument.isFinite,
              step.isFinite,
              upperArgument > lowerArgument,
              step > 0
        else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        var result: [SignChangeBracket] = []
        var previousArgument = lowerArgument
        var previousValue =
            try await functionValue(previousArgument)
        guard previousValue.isFinite else {
            throw EventNumericsError
                .nonFiniteValue("search value")
        }
        while previousArgument < upperArgument {
            try checkCancellation(shouldCancel)
            let nextArgument = min(
                previousArgument + step,
                upperArgument
            )
            guard nextArgument > previousArgument else {
                throw EventNumericsError.searchDidNotAdvance
            }
            let nextValue =
                try await functionValue(nextArgument)
            guard nextValue.isFinite else {
                throw EventNumericsError
                    .nonFiniteValue("search value")
            }
            if previousValue == 0
                || nextValue == 0
                || previousValue.sign != nextValue.sign
            {
                result.append(
                    SignChangeBracket(
                        lower: previousArgument,
                        upper: nextArgument
                    )
                )
            }
            previousArgument = nextArgument
            previousValue = nextValue
        }
        return result
    }

    static func asyncRoot(
        functionValue:
            (Double) async throws -> Double,
        lowerArgument: Double,
        upperArgument: Double,
        argumentTolerance: Double,
        valueTolerance: Double,
        shouldCancel: (@Sendable () -> Bool)?,
        maximumIterations: Int = 96
    ) async throws -> Double {
        guard lowerArgument.isFinite,
              upperArgument.isFinite,
              argumentTolerance.isFinite,
              valueTolerance.isFinite,
              upperArgument > lowerArgument,
              argumentTolerance > 0,
              valueTolerance >= 0,
              maximumIterations > 0
        else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        var lower = lowerArgument
        var upper = upperArgument
        var lowerValue =
            try await functionValue(lower)
        var upperValue =
            try await functionValue(upper)
        guard lowerValue.isFinite, upperValue.isFinite else {
            throw EventNumericsError
                .nonFiniteValue("root value")
        }
        if abs(lowerValue) <= valueTolerance {
            return lower
        }
        if abs(upperValue) <= valueTolerance {
            return upper
        }
        guard lowerValue.sign != upperValue.sign else {
            throw EventNumericsError.rootNotBracketed
        }

        for _ in 1...maximumIterations {
            try checkCancellation(shouldCancel)
            let width = upper - lower
            if width <= argumentTolerance {
                return abs(lowerValue) <= abs(upperValue)
                    ? lower
                    : upper
            }
            let midpoint = lower + width / 2
            let denominator = upperValue - lowerValue
            let secant =
                denominator == 0
                ? midpoint
                : upper - upperValue * width / denominator
            let guardWidth = width * 0.1
            let candidate =
                secant.isFinite
                    && secant > lower + guardWidth
                    && secant < upper - guardWidth
                ? secant
                : midpoint
            let candidateValue =
                try await functionValue(candidate)
            guard candidateValue.isFinite else {
                throw EventNumericsError
                    .nonFiniteValue("root value")
            }
            if abs(candidateValue) <= valueTolerance {
                return candidate
            }
            if candidateValue.sign == lowerValue.sign {
                lower = candidate
                lowerValue = candidateValue
            } else {
                upper = candidate
                upperValue = candidateValue
            }
        }
        if upper - lower <= argumentTolerance * 2 {
            return abs(lowerValue) <= abs(upperValue)
                ? lower
                : upper
        }
        throw EventNumericsError.rootDidNotConverge
    }

    private static func apparentBody(
        provider: DE442SEphemerisProviderV1,
        body: EclipseBodyV1,
        tdbJulianDate: Double,
        observerPositionKilometers: Vector3D,
        observerVelocityKilometersPerDay: Vector3D,
        sunDistanceAU: Double,
        precessionNutation: PrecisionMatrix3,
        polarMotion: PrecisionMatrix3? = nil,
        siderealTime: Double? = nil,
        latitudeRadians: Double? = nil,
        longitudeRadians: Double? = nil
    ) async throws -> EclipseApparentBodyStateV1 {
        var emissionTDB = tdbJulianDate
        var emitted = try await provider.state(
            tdbJulianDate: emissionTDB
        )
        var displacement =
            targetBarycentricPosition(
                emitted,
                body: body
            )
            - observerPositionKilometers
        for _ in 0..<4 {
            emissionTDB =
                tdbJulianDate
                - displacement.length
                / speedOfLightKilometersPerDay
            emitted = try await provider.state(
                tdbJulianDate: emissionTDB
            )
            displacement =
                targetBarycentricPosition(
                    emitted,
                    body: body
                )
                - observerPositionKilometers
        }
        let distance = displacement.length
        guard let naturalDirection =
            displacement.normalized()
        else {
            throw PrecisionModelError.invalidVector
        }
        let icrfDirection =
            try Astronomy.applyAnnualAberrationV2(
                naturalDirection: naturalDirection,
                observerBarycentricVelocityC:
                    observerVelocityKilometersPerDay
                    / speedOfLightKilometersPerDay,
                sunObserverDistanceAU: sunDistanceAU
            )
        let cirsDirection =
            precessionNutation.applying(
                to: icrfDirection
            )
        let radius =
            body == .sun
            ? sunMeanRadiusKilometers
            : moonMeanRadiusKilometers
        let horizontal: HorizontalCoordinates?
        if let polarMotion,
           let siderealTime,
           let latitudeRadians,
           let longitudeRadians
        {
            horizontal = horizontalCoordinates(
                cirsDirection: cirsDirection,
                polarMotion: polarMotion,
                siderealTime: siderealTime,
                latitudeRadians: latitudeRadians,
                longitudeRadians: longitudeRadians
            )
        } else {
            horizontal = nil
        }
        return EclipseApparentBodyStateV1(
            body: body,
            tdbJulianDate: tdbJulianDate,
            lightTimeSeconds:
                (tdbJulianDate - emissionTDB)
                * PrecisionConstants.secondsPerDay,
            distanceKilometers: distance,
            angularRadiusRadians:
                asin(Angles.clamped(radius / distance)),
            icrfDirection: icrfDirection,
            cirsDirection: cirsDirection,
            horizontal: horizontal
        )
    }

    private static func targetBarycentricPosition(
        _ state: DE442SEphemerisStateV1,
        body: EclipseBodyV1
    ) -> Vector3D {
        body == .sun
            ? state.sunBarycentric.positionKilometers
            : state.moonBarycentric.positionKilometers
    }

    private static func horizontalCoordinates(
        cirsDirection: Vector3D,
        polarMotion: PrecisionMatrix3,
        siderealTime: Double,
        latitudeRadians: Double,
        longitudeRadians: Double
    ) -> HorizontalCoordinates {
        let tirs = rotateCIRSToTIRS(
            cirsDirection,
            siderealTime: siderealTime
        )
        let itrs = polarMotion.applying(to: tirs)
        let latitudeSine = sin(latitudeRadians)
        let latitudeCosine = cos(latitudeRadians)
        let longitudeSine = sin(longitudeRadians)
        let longitudeCosine = cos(longitudeRadians)
        let east =
            -longitudeSine * itrs.x
            + longitudeCosine * itrs.y
        let north =
            -latitudeSine * longitudeCosine * itrs.x
            - latitudeSine * longitudeSine * itrs.y
            + latitudeCosine * itrs.z
        let up =
            latitudeCosine * longitudeCosine * itrs.x
            + latitudeCosine * longitudeSine * itrs.y
            + latitudeSine * itrs.z
        let horizontalMagnitude = hypot(east, north)
        let azimuthIsDefined =
            horizontalMagnitude > 1e-12
        return HorizontalCoordinates(
            altitude: atan2(
                Angles.clamped(up),
                horizontalMagnitude
            ),
            azimuth: azimuthIsDefined
                ? Angles.normalizedRadians(
                    atan2(east, north)
                )
                : 0,
            azimuthIsDefined: azimuthIsDefined
        )
    }

    private static func transpose(
        _ matrix: PrecisionMatrix3
    ) -> PrecisionMatrix3 {
        PrecisionMatrix3(
            row0: Vector3D(
                x: matrix.row0.x,
                y: matrix.row1.x,
                z: matrix.row2.x
            ),
            row1: Vector3D(
                x: matrix.row0.y,
                y: matrix.row1.y,
                z: matrix.row2.y
            ),
            row2: Vector3D(
                x: matrix.row0.z,
                y: matrix.row1.z,
                z: matrix.row2.z
            )
        )
    }

    private static func rotateCIRSToTIRS(
        _ vector: Vector3D,
        siderealTime: Double
    ) -> Vector3D {
        let sine = sin(siderealTime)
        let cosine = cos(siderealTime)
        return Vector3D(
            x: cosine * vector.x + sine * vector.y,
            y: -sine * vector.x + cosine * vector.y,
            z: vector.z
        )
    }

    private static func rotateTIRSToCIRS(
        _ vector: Vector3D,
        siderealTime: Double
    ) -> Vector3D {
        let sine = sin(siderealTime)
        let cosine = cos(siderealTime)
        return Vector3D(
            x: cosine * vector.x - sine * vector.y,
            y: sine * vector.x + cosine * vector.y,
            z: vector.z
        )
    }
}
