import Foundation

public enum LunarOccultationContactPhaseV1:
    String, Codable, Hashable, Sendable
{
    case disappearance = "occultation-disappearance"
    case maximum
    case reappearance = "occultation-reappearance"
}

public enum LunarOccultationVisibilityV1:
    String, Codable, Hashable, Sendable
{
    case fullyVisible = "fully-visible"
    case partlyVisible = "partly-visible"
    case belowHorizon = "below-horizon"
}

public struct LunarOccultationTargetV1:
    Hashable, Sendable
{
    public let starHR: Int
    public let label: String
    public let visualMagnitude: Double

    public init(
        starHR: Int,
        label: String,
        visualMagnitude: Double
    ) {
        self.starHR = starHR
        self.label = label
        self.visualMagnitude = visualMagnitude
    }
}

public struct LunarOccultationContactV1:
    Hashable, Sendable
{
    public let phase: LunarOccultationContactPhaseV1
    public let instantUTC: Date
    public let moon: EclipseBodyPositionV1
    public let targetHorizontal: HorizontalCoordinates
    public let aboveHorizon: Bool
    /**
     Position angle of the target about the lunar center, measured eastward
     from CIP-defined celestial north in the CIRS tangent plane.
     */
    public let positionAngleRadians: Double?

    public init(
        phase: LunarOccultationContactPhaseV1,
        instantUTC: Date,
        moon: EclipseBodyPositionV1,
        targetHorizontal: HorizontalCoordinates,
        aboveHorizon: Bool,
        positionAngleRadians: Double?
    ) {
        self.phase = phase
        self.instantUTC = instantUTC
        self.moon = moon
        self.targetHorizontal = targetHorizontal
        self.aboveHorizon = aboveHorizon
        self.positionAngleRadians =
            positionAngleRadians
    }
}

public struct LocalLunarOccultationCircumstancesV1:
    Hashable, Sendable
{
    public let candidate: EclipseCandidateV1
    public let title: String
    public let target: LunarOccultationTargetV1
    public let observer: EclipseObserverContextV1
    public let visibility: LunarOccultationVisibilityV1
    public let contacts: [LunarOccultationContactV1]
    public let maximum: LunarOccultationContactV1
    /**
     Historical API name retained for UI compatibility. This is true when
     the closest approach lies inside the conservative physical boundary
     band; it is not the numerical root/tangency epsilon.
     */
    public let grazing: Bool
    public var boundaryUncertain: Bool {
        grazing
    }
    /**
     Closest center-to-center separation minus the mean lunar angular
     radius. Negative values place the target inside the mean limb.
     */
    public let minimumClearanceRadians: Double
    public let uncertainty: EclipseForecastUncertaintyV1
    public let provenance: EclipseProvenanceV1
    public let precisionWarnings: [PrecisionWarningCode]
    public let warnings: [String]

    public init(
        candidate: EclipseCandidateV1,
        title: String,
        target: LunarOccultationTargetV1,
        observer: EclipseObserverContextV1,
        visibility: LunarOccultationVisibilityV1,
        contacts: [LunarOccultationContactV1],
        maximum: LunarOccultationContactV1,
        grazing: Bool,
        minimumClearanceRadians: Double,
        uncertainty: EclipseForecastUncertaintyV1,
        provenance: EclipseProvenanceV1,
        precisionWarnings: [PrecisionWarningCode],
        warnings: [String]
    ) {
        self.candidate = candidate
        self.title = title
        self.target = target
        self.observer = observer
        self.visibility = visibility
        self.contacts = contacts
        self.maximum = maximum
        self.grazing = grazing
        self.minimumClearanceRadians =
            minimumClearanceRadians
        self.uncertainty = uncertainty
        self.provenance = provenance
        self.precisionWarnings = precisionWarnings
        self.warnings = warnings
    }
}

public enum LocalLunarOccultationErrorV1:
    LocalizedError, Equatable, Sendable
{
    case wrongCandidateKind
    case candidateTargetMissing
    case targetStarMismatch(expectedHR: Int, actualHR: Int)
    case targetStarUnavailable(hr: Int)
    case invalidSearchOptions
    case contactsNotBracketed
    case invalidTimingUncertainty

    public var errorDescription: String? {
        switch self {
        case .wrongCandidateKind:
            "現象候補が月による恒星掩蔽ではありません。"
        case .candidateTargetMissing:
            "掩蔽候補に対象恒星のHR番号がありません。"
        case let .targetStarMismatch(expected, actual):
            "掩蔽候補の対象HR \(expected)と恒星HR \(actual)が一致しません。"
        case let .targetStarUnavailable(hr):
            "対象恒星HR \(hr)が精密恒星カタログにありません。"
        case .invalidSearchOptions:
            "掩蔽の探索範囲または走査間隔が不正です。"
        case .contactsNotBracketed:
            "掩蔽の潜入・出現時刻を探索範囲内で挟み込めませんでした。"
        case .invalidTimingUncertainty:
            "掩蔽の時刻不確かさが不正です。"
        }
    }
}

struct LunarOccultationStarStateV1: Sendable {
    let starHR: Int
    let cirsDirection: Vector3D
    let horizontal: HorizontalCoordinates
    let precisionWarnings: [PrecisionWarningCode]
}

struct LunarOccultationSampleV1: Sendable {
    let secondsSinceReferenceDate: Double
    let moon: EclipseApparentBodyStateV1
    let target: LunarOccultationStarStateV1
}

struct LunarOccultationGeometryV1: Sendable {
    let maximum: LunarOccultationSampleV1
    let earthRotation:
        EventEarthRotationContextV1
    let limbContacts: [LunarOccultationSampleV1]
    let minimumClearanceRadians: Double
    let boundaryUncertaintyRadians: Double
    let boundaryUncertain: Bool
    let numericallyTangent: Bool
}

private struct OccultationObserverAstrometryV1:
    Sendable
{
    let barycentricPositionAU: Vector3D
    let barycentricVelocityC: Vector3D
    let sunObserverDistanceAU: Double
}

/**
 Local bright-star occultation solver backed by bundled DE442s data.

 Candidate epochs are only coarse global seeds. Each call recomputes the
 topocentric lunar center and the BSC5P target's precision apparent direction
 for the supplied WGS84 location, height, UT1, and polar motion. Contacts are
 roots against a spherical mean lunar limb; lunar topography is deliberately
 not modelled.
 */
public enum LocalLunarOccultationV1 {
    private static let defaultHalfWindowSeconds =
        4 * 60 * 60.0
    private static let defaultScanStepSeconds =
        60.0
    private static let maximumHalfWindowSeconds =
        2 * 24 * 60 * 60.0
    private static let rootTimeToleranceSeconds =
        0.02
    private static let rootAngleToleranceRadians =
        1e-13
    private static let numericalTangencyEpsilonRadians =
        5e-10
    // LRO reports a global high point 10.786 km above the 1,737.4 km
    // mean radius. Eleven kilometres is a conservative radial envelope
    // when no local LOLA/Kaguya limb profile is available.
    private static let lunarTopographyEnvelopeKilometers =
        11.0
    // Packed Float32 EMB→Moon coefficients are bounded at 0.0242 km in
    // the bundled validation set. Geocentric Moon reconstruction scales
    // that vector by (1 + 1 / EMRAT).
    private static let
        de442sEMBToMoonQuantizationKilometers =
            0.0242
    private static let
        de442sGeocentricMoonQuantizationKilometers =
            de442sEMBToMoonQuantizationKilometers
            * (
                1
                + 1
                / DE442SEphemerisConstantsV1
                    .earthMoonMassRatio
            )
    // BSC5P's full RA and declination storage grids are 1.5 and 1
    // arcseconds. They are added linearly because no per-star covariance
    // is available.
    private static let bsc5pPositionEnvelopeArcseconds =
        2.5
    private static let arcsecondsToRadians =
        Double.pi / (180 * 60 * 60)
    private static let earthRotationRadiansPerDay =
        1.002_737_811_911_354_6 * 2 * Double.pi
    private static let speedOfLightKilometersPerDay =
        PrecisionConstants.speedOfLightKilometersPerSecond
        * PrecisionConstants.secondsPerDay

    /**
     Resolves the candidate's BSC5P target from a loaded sky catalog.

     This overload is the direct integration point for candidate-catalog UI
     code: no target metadata from the candidate seed is trusted as
     astrometry.
     */
    public static func calculate(
        provider: DE442SEphemerisProviderV1,
        candidate: EclipseCandidateV1,
        catalog: SkyCatalog,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1 =
            LocalEclipseOptionsV1()
    ) async throws
        -> LocalLunarOccultationCircumstancesV1?
    {
        guard candidate.kind == .lunarOccultation else {
            throw LocalLunarOccultationErrorV1
                .wrongCandidateKind
        }
        guard let targetHR = candidate.targetStarHR else {
            throw LocalLunarOccultationErrorV1
                .candidateTargetMissing
        }
        guard let targetStar =
            catalog.starsByHR[targetHR]
        else {
            throw LocalLunarOccultationErrorV1
                .targetStarUnavailable(hr: targetHR)
        }
        return try await calculate(
            provider: provider,
            candidate: candidate,
            targetStar: targetStar,
            location: location,
            options: options
        )
    }

    /**
     Computes local D/maximum/R circumstances for one candidate and target.

     `nil` means the global candidate misses the supplied observing site.
     Cancellation propagates as `CancellationError`.
     */
    public static func calculate(
        provider: DE442SEphemerisProviderV1,
        candidate: EclipseCandidateV1,
        targetStar: CatalogStar,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1 =
            LocalEclipseOptionsV1()
    ) async throws
        -> LocalLunarOccultationCircumstancesV1?
    {
        guard candidate.kind == .lunarOccultation else {
            throw LocalLunarOccultationErrorV1
                .wrongCandidateKind
        }
        guard let targetHR = candidate.targetStarHR else {
            throw LocalLunarOccultationErrorV1
                .candidateTargetMissing
        }
        guard targetHR == targetStar.hr else {
            throw LocalLunarOccultationErrorV1
                .targetStarMismatch(
                    expectedHR: targetHR,
                    actualHR: targetStar.hr
                )
        }
        let validLocation =
            try EclipseCalculationSupportV1.validate(
                location: location,
                options: options
            )
        if options.eventEarthRotationAt == nil,
           let timingUncertainty =
            options.timingUncertaintySeconds
        {
            guard timingUncertainty.isFinite,
                  timingUncertainty >= 0
            else {
                throw LocalLunarOccultationErrorV1
                    .invalidTimingUncertainty
            }
        }
        let center =
            candidate.canonicalEpochUTC
                .timeIntervalSinceReferenceDate
        let loadedSearchRange =
            try EclipseCalculationSupportV1
                .ephemerisSearchRange(
                    provider: provider
                )
        var samples: [Double: LunarOccultationSampleV1] =
            [:]

        func sampleAt(
            _ instant: Double
        ) async throws -> LunarOccultationSampleV1 {
            if let cached = samples[instant] {
                return cached
            }
            let sample = try await rawSample(
                provider: provider,
                targetStar: targetStar,
                at: Date(
                    timeIntervalSinceReferenceDate:
                        instant
                ),
                location: validLocation,
                options: options
            )
            samples[instant] = sample
            return sample
        }

        let geometry = try await solveGeometry(
            candidateSecondsSinceReferenceDate:
                center,
            sampleAt: sampleAt,
            searchLimit: loadedSearchRange,
            options: options
        )
        guard let geometry else {
            return nil
        }
        let visibility:
            LunarOccultationVisibilityV1
        if geometry.boundaryUncertain {
            visibility =
                try EclipseCalculationSupportV1
                    .boundaryMaximumIsAboveHorizon(
                        horizonClearanceRadians:
                            geometry.maximum
                                .target
                                .horizontal
                                .altitude
                    )
                ? .partlyVisible
                : .belowHorizon
        } else {
            let intervalVisibility =
                try await EclipseCalculationSupportV1
                    .intervalVisibility(
                        start:
                            geometry
                            .limbContacts[0]
                            .secondsSinceReferenceDate,
                        end:
                            geometry
                            .limbContacts[
                                geometry
                                    .limbContacts
                                    .count - 1
                            ]
                            .secondsSinceReferenceDate,
                        horizonClearanceAt: {
                            try await sampleAt($0)
                                .target
                                .horizontal
                                .altitude
                        },
                        shouldCancel:
                            options.shouldCancel
                    )
            switch intervalVisibility {
            case .fullyVisible:
                visibility = .fullyVisible
            case .partlyVisible:
                visibility = .partlyVisible
            case .belowHorizon:
                visibility = .belowHorizon
            }
        }
        return try circumstances(
            provider: provider,
            candidate: candidate,
            targetStar: targetStar,
            location: validLocation,
            options: options,
            geometry: geometry,
            visibility: visibility
        )
    }

    /**
     Resolves the candidate target and evaluates a physical Moon/star scene
     at an arbitrary UTC instant.
     */
    public static func sampleScene(
        provider: DE442SEphemerisProviderV1,
        candidate: EclipseCandidateV1,
        catalog: SkyCatalog,
        at instantUTC: Date,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1 =
            LocalEclipseOptionsV1()
    ) async throws -> EventSceneSampleV1 {
        guard candidate.kind == .lunarOccultation
        else {
            throw LocalLunarOccultationErrorV1
                .wrongCandidateKind
        }
        guard let targetHR = candidate.targetStarHR
        else {
            throw LocalLunarOccultationErrorV1
                .candidateTargetMissing
        }
        guard let targetStar =
            catalog.starsByHR[targetHR]
        else {
            throw LocalLunarOccultationErrorV1
                .targetStarUnavailable(hr: targetHR)
        }
        return try await sampleScene(
            provider: provider,
            candidate: candidate,
            targetStar: targetStar,
            at: instantUTC,
            location: location,
            options: options
        )
    }

    /**
     Evaluates a physical mean-limb occultation scene at an arbitrary UTC
     instant through the same DE442s observer and BSC5P precision apparent
     star pipeline used by the contact solver.
     */
    public static func sampleScene(
        provider: DE442SEphemerisProviderV1,
        candidate: EclipseCandidateV1,
        targetStar: CatalogStar,
        at instantUTC: Date,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1 =
            LocalEclipseOptionsV1()
    ) async throws -> EventSceneSampleV1 {
        guard candidate.kind == .lunarOccultation
        else {
            throw LocalLunarOccultationErrorV1
                .wrongCandidateKind
        }
        guard let targetHR = candidate.targetStarHR
        else {
            throw LocalLunarOccultationErrorV1
                .candidateTargetMissing
        }
        guard targetHR == targetStar.hr else {
            throw LocalLunarOccultationErrorV1
                .targetStarMismatch(
                    expectedHR: targetHR,
                    actualHR: targetStar.hr
                )
        }
        let validLocation =
            try EclipseCalculationSupportV1
            .validate(
                location: location,
                options: options
            )
        if options.eventEarthRotationAt == nil,
           let timingUncertainty =
            options.timingUncertaintySeconds
        {
            guard
                timingUncertainty.isFinite,
                timingUncertainty >= 0
            else {
                throw LocalLunarOccultationErrorV1
                    .invalidTimingUncertainty
            }
        }
        try EclipseCalculationSupportV1
            .validateSceneInstant(
                provider: provider,
                instantUTC: instantUTC,
                shouldCancel:
                    options.shouldCancel
            )
        let raw = try await rawSample(
            provider: provider,
            targetStar: targetStar,
            at: instantUTC,
            location: validLocation,
            options: options
        )
        let moon = try EventSceneSampleSupportV1
            .bodyPosition(raw.moon)
        let direction =
            try EventSceneSampleSupportV1
            .require(
                EventSceneGeometryV1
                    .tangentOffset(
                        reference:
                            moon.horizontal,
                        target:
                            raw.target
                            .horizontal
                    )
            )
        let target =
            EventSceneTargetStarPositionV1(
                starHR: raw.target.starHR,
                label:
                    candidate.targetLabel
                    ?? targetStar.catalogName
                    ?? "HR \(targetStar.hr)",
                visualMagnitude:
                    targetStar.visualMagnitude,
                horizontal:
                    raw.target.horizontal,
                precisionWarnings:
                    raw.target
                    .precisionWarnings
            )
        return EventSceneSampleV1(
            kind: .lunarOccultation,
            instantUTC: instantUTC,
            sun: nil,
            moon: moon,
            lunarShadow: nil,
            targetStar: target,
            aboveHorizon:
                target.horizontal.altitude > 0,
            relativeDirection: direction
        )
    }

    static func rawSample(
        provider: DE442SEphemerisProviderV1,
        targetStar: CatalogStar,
        at instantUTC: Date,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1
    ) async throws
        -> LunarOccultationSampleV1
    {
        try EclipseCalculationSupportV1
            .checkCancellation(
                options.shouldCancel
            )
        let instant =
            instantUTC
            .timeIntervalSinceReferenceDate
        guard instant.isFinite else {
            throw EventSceneSampleErrorV1
                .invalidInstant
        }
        let earthOrientation =
            try options.resolvedEarthOrientation(
                at: instantUTC
            )
        let pair =
            try await EclipseCalculationSupportV1
            .apparentTopocentricPair(
                provider: provider,
                at: instantUTC,
                location: location,
                options: options
            )
        let astrometry = try await observerAstrometry(
            provider: provider,
            at: instantUTC,
            location: location,
            options: options
        )
        let star = try Astronomy
            .calculateApparentStarPositionV2(
                targetStar,
                at: instantUTC,
                location: location,
                options:
                    ApparentPositionOptionsV2(
                        earthOrientation:
                            earthOrientation,
                        annualParallax:
                            .custom(
                                CustomAnnualParallaxV2(
                                    observerPositionAU:
                                        astrometry
                                        .barycentricPositionAU
                                )
                            ),
                        // The lunar apparent-place path omits solar
                        // deflection. Omitting it on both sides keeps
                        // the limb equation internally consistent.
                        solarLightDeflection:
                            .disabled,
                        aberration:
                            .custom(
                                CustomAberrationV2(
                                    observerBarycentricVelocityC:
                                        astrometry
                                        .barycentricVelocityC,
                                    sunObserverDistanceAU:
                                        astrometry
                                        .sunObserverDistanceAU
                                )
                            ),
                        // Site rotation is already in the custom
                        // barycentric velocity above.
                        diurnalAberration: .disabled,
                        refraction: .disabled
                    )
            )
        return LunarOccultationSampleV1(
            secondsSinceReferenceDate: instant,
            moon: pair.moon,
            target:
                LunarOccultationStarStateV1(
                    starHR: targetStar.hr,
                    cirsDirection:
                        precisionEquatorialToVector(
                            star.apparentEquatorial
                        ),
                    horizontal:
                        star.geometricHorizontal,
                    precisionWarnings:
                        star.metadata.warnings
                )
        )
    }

    /**
     Conservative angular band around the spherical mean lunar limb.

     Terms are added linearly because they do not share a covariance model.
     A supplied horizontal accuracy is treated as a bound and omitted when
     unknown. This is an engineering envelope rather than a confidence
     interval or a replacement for a local lunar-limb profile.
     */
    static func boundaryUncertaintyRadians(
        moonDistanceKilometers: Double,
        horizontalAccuracyMeters: Double? = nil,
        earthRotationPathUncertaintyKilometers:
            Double? = nil
    ) throws -> Double {
        guard moonDistanceKilometers.isFinite,
              moonDistanceKilometers > 0
        else {
            throw EventNumericsError.nonFiniteValue(
                "positive lunar-occultation Moon distance"
            )
        }
        if let horizontalAccuracyMeters {
            guard horizontalAccuracyMeters.isFinite,
                  horizontalAccuracyMeters >= 0
            else {
                throw LocalEclipseErrorV1
                    .invalidObserverAccuracy
            }
        }
        if let earthRotationPathUncertaintyKilometers {
            guard
                earthRotationPathUncertaintyKilometers
                    .isFinite,
                earthRotationPathUncertaintyKilometers >= 0
            else {
                throw LocalEclipseErrorV1
                    .invalidEarthRotationPathUncertainty
            }
        }
        let observerKilometers =
            (horizontalAccuracyMeters ?? 0)
            / 1_000
        return (
            lunarTopographyEnvelopeKilometers
            + de442sGeocentricMoonQuantizationKilometers
            + observerKilometers
            + (
                earthRotationPathUncertaintyKilometers
                ?? 0
            )
        ) / moonDistanceKilometers
        + bsc5pPositionEnvelopeArcseconds
            * arcsecondsToRadians
    }

    static func solveGeometry(
        candidateSecondsSinceReferenceDate:
            Double,
        sampleAt:
            (Double) async throws
                -> LunarOccultationSampleV1,
        searchLimit:
            EclipseSearchRangeV1? = nil,
        options: LocalEclipseOptionsV1 =
            LocalEclipseOptionsV1()
    ) async throws -> LunarOccultationGeometryV1? {
        let halfWindow =
            options.halfWindowSeconds
            ?? defaultHalfWindowSeconds
        let scanStep =
            options.scanStepSeconds
            ?? defaultScanStepSeconds
        guard
            candidateSecondsSinceReferenceDate
                .isFinite,
            halfWindow.isFinite,
            scanStep.isFinite,
            halfWindow > 0,
            halfWindow
                <= maximumHalfWindowSeconds,
            scanStep > 0,
            scanStep <= 2 * halfWindow
        else {
            throw LocalLunarOccultationErrorV1
                .invalidSearchOptions
        }
        if let horizontalAccuracy =
            options.horizontalAccuracyMeters
        {
            guard horizontalAccuracy.isFinite,
                  horizontalAccuracy >= 0
            else {
                throw LocalEclipseErrorV1
                    .invalidObserverAccuracy
            }
        }
        let searchRange:
            EclipseSearchRangeV1
        do {
            searchRange =
                try EclipseCalculationSupportV1
                    .resolveSearchRange(
                        candidateSecondsSinceReferenceDate:
                            candidateSecondsSinceReferenceDate,
                        halfWindowSeconds: halfWindow,
                        limit: searchLimit
                    )
        } catch is LocalEclipseErrorV1 {
            throw LocalLunarOccultationErrorV1
                .invalidSearchOptions
        }
        let start =
            searchRange
                .startSecondsSinceReferenceDate
        let end =
            searchRange
                .endSecondsSinceReferenceDate

        func clearanceAt(
            _ instant: Double
        ) async throws -> Double {
            try await clearance(
                sampleAt(instant)
            )
        }

        let maximumInstant =
            try await EclipseCalculationSupportV1
                .asyncMinimum(
                    functionValue: clearanceAt,
                    lowerArgument: start,
                    upperArgument: end,
                    argumentTolerance:
                        rootTimeToleranceSeconds,
                    shouldCancel:
                        options.shouldCancel
                )
        try EclipseCalculationSupportV1
            .checkCancellation(options.shouldCancel)
        let maximum = try await sampleAt(maximumInstant)
        let minimumClearance = try clearance(maximum)
        let maximumEarthRotation =
            try options.resolvedEventEarthRotation(
                at: Date(
                    timeIntervalSinceReferenceDate:
                        maximum
                        .secondsSinceReferenceDate
                )
            )
        if let timingUncertainty =
            maximumEarthRotation
            .timingUncertaintySeconds
        {
            guard timingUncertainty.isFinite,
                  timingUncertainty >= 0
            else {
                throw LocalLunarOccultationErrorV1
                    .invalidTimingUncertainty
            }
        }
        let boundaryUncertainty =
            try boundaryUncertaintyRadians(
                moonDistanceKilometers:
                    maximum.moon.distanceKilometers,
                horizontalAccuracyMeters:
                    options.horizontalAccuracyMeters,
                earthRotationPathUncertaintyKilometers:
                    maximumEarthRotation
                    .uncertainty.pathKilometers
            )
        guard minimumClearance
            <= boundaryUncertainty
        else {
            return nil
        }
        let numericallyTangent =
            abs(minimumClearance)
            <= numericalTangencyEpsilonRadians
        let boundaryUncertain =
            abs(minimumClearance)
            <= boundaryUncertainty
        if boundaryUncertain {
            return LunarOccultationGeometryV1(
                maximum: maximum,
                earthRotation:
                    maximumEarthRotation,
                limbContacts: [maximum],
                minimumClearanceRadians:
                    minimumClearance,
                boundaryUncertaintyRadians:
                    boundaryUncertainty,
                boundaryUncertain: true,
                numericallyTangent:
                    numericallyTangent
            )
        }

        let disappearanceBrackets =
            try await EclipseCalculationSupportV1
                .asyncSignChangeBrackets(
                    functionValue: clearanceAt,
                    lowerArgument: start,
                    upperArgument: maximumInstant,
                    step: scanStep,
                    shouldCancel:
                        options.shouldCancel
                )
        let reappearanceBrackets =
            try await EclipseCalculationSupportV1
                .asyncSignChangeBrackets(
                    functionValue: clearanceAt,
                    lowerArgument: maximumInstant,
                    upperArgument: end,
                    step: scanStep,
                    shouldCancel:
                        options.shouldCancel
                )
        guard
            let disappearanceBracket =
                disappearanceBrackets.last,
            let reappearanceBracket =
                reappearanceBrackets.first
        else {
            throw LocalLunarOccultationErrorV1
                .contactsNotBracketed
        }
        let disappearance =
            try await EclipseCalculationSupportV1
                .asyncRoot(
                    functionValue: clearanceAt,
                    lowerArgument:
                        disappearanceBracket.lower,
                    upperArgument:
                        disappearanceBracket.upper,
                    argumentTolerance:
                        rootTimeToleranceSeconds,
                    valueTolerance:
                        rootAngleToleranceRadians,
                    shouldCancel:
                        options.shouldCancel
                )
        let reappearance =
            try await EclipseCalculationSupportV1
                .asyncRoot(
                    functionValue: clearanceAt,
                    lowerArgument:
                        reappearanceBracket.lower,
                    upperArgument:
                        reappearanceBracket.upper,
                    argumentTolerance:
                        rootTimeToleranceSeconds,
                    valueTolerance:
                        rootAngleToleranceRadians,
                    shouldCancel:
                        options.shouldCancel
                )
        return LunarOccultationGeometryV1(
            maximum: maximum,
            earthRotation: maximumEarthRotation,
            limbContacts: [
                try await sampleAt(disappearance),
                try await sampleAt(reappearance),
            ],
            minimumClearanceRadians:
                minimumClearance,
            boundaryUncertaintyRadians:
                boundaryUncertainty,
            boundaryUncertain: false,
            numericallyTangent:
                numericallyTangent
        )
    }

    /**
     Position angle of the target around the lunar center, eastward from
     CIP-defined celestial north in the CIRS tangent plane. `nil` is
     returned only at a degenerate pole/direction.
     */
    public static func limbPositionAngleRadians(
        moonDirection: Vector3D,
        targetDirection: Vector3D
    ) -> Double? {
        EclipseContactPositionAngleV1.radians(
            referenceCenterDirection: moonDirection,
            otherCenterDirection: targetDirection
        )
    }

    private static func clearance(
        _ sample: LunarOccultationSampleV1
    ) throws -> Double {
        let value =
            EclipseCalculationSupportV1
            .angularSeparation(
                sample.moon.cirsDirection,
                sample.target.cirsDirection
            )
            - sample.moon.angularRadiusRadians
        guard value.isFinite else {
            throw EventNumericsError
                .nonFiniteValue(
                    "lunar-occultation clearance"
                )
        }
        return value
    }

    private static func earthRotationPathWarning(
        uncertainty:
            EventEarthRotationUncertaintyV1,
        pathKilometers: Double
    ) -> String {
        let label: String
        switch uncertainty {
        case .none:
            label = "地球回転・姿勢による経路"
        case .iersReported:
            label = "IERS公表誤差換算の地表経路"
        case .model:
            label = "地球回転・姿勢モデルによる経路"
        }
        if pathKilometers < 0.001 {
            return String(
                format: "、%@±%.3f m",
                label,
                pathKilometers * 1_000
            )
        }
        return String(
            format: "、%@±%.3f km",
            label,
            pathKilometers
        )
    }

    private static func circumstances(
        provider: DE442SEphemerisProviderV1,
        candidate: EclipseCandidateV1,
        targetStar: CatalogStar,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1,
        geometry: LunarOccultationGeometryV1,
        visibility: LunarOccultationVisibilityV1
    ) throws -> LocalLunarOccultationCircumstancesV1 {
        let maximum = contact(
            phase: .maximum,
            sample: geometry.maximum
        )
        let boundaryEnvelopeKilometers =
            geometry.boundaryUncertaintyRadians
            * geometry.maximum.moon.distanceKilometers
        let contacts: [LunarOccultationContactV1]
        if geometry.boundaryUncertain {
            contacts = [maximum]
        } else {
            contacts = [
                contact(
                    phase: .disappearance,
                    sample:
                        geometry.limbContacts[0]
                ),
                maximum,
                contact(
                    phase: .reappearance,
                    sample:
                        geometry.limbContacts[
                            geometry
                                .limbContacts
                                .count - 1
                        ]
                ),
            ]
        }
        let astrometry = targetStar.astrometry
        let missingProperMotion =
            astrometry?
                .properMotionRightAscensionCosDeclinationArcsecondsPerYear
                == nil
            || astrometry?
                .properMotionDeclinationArcsecondsPerYear
                == nil
        let maximumEarthRotation =
            geometry.earthRotation
        let maximumEarthOrientation =
            maximumEarthRotation.earthOrientation
        let timeScaleNotices =
            try EventTimeScaleNoticesV1.resolve(
                at: maximum.instantUTC,
                earthOrientation:
                    maximumEarthOrientation
            )
        var dominantContributors = [
            "BSC5P J2000 FK5恒星位置（星ごとの共分散なし、位置分解能2.5″を境界帯へ反映）",
            "平均球面月縁（LOLA・かぐや地形未使用、月地形±11 kmを境界帯へ反映）",
            "DE442s月位置係数量子化（地心月最大約24.5 mを境界帯へ反映）",
            "月と恒星の共通太陽重力偏向を未適用",
        ]
        + (
            missingProperMotion
            ? ["対象星の固有運動が不完全"]
            : []
        )
        + (
            astrometry?.parallaxArcseconds == nil
            ? ["対象星の年周視差が未収録"]
            : []
        )
        + (
            maximumEarthOrientation.dut1Seconds
                == nil
            ? ["UT1−UTCを0秒と仮定"]
            : []
        )
        + (
            maximumEarthOrientation.polarMotion
                == nil
            ? ["極運動xp・ypを0と仮定"]
            : []
        )
        + (
            options.horizontalAccuracyMeters
                == nil
            ? ["観測地点の水平精度が不明"]
            : ["観測地点の水平精度を境界帯へ線形加算"]
        )
        switch maximumEarthRotation.uncertainty {
        case .none:
            break
        case .iersReported:
            dominantContributors.append(
                "IERS公表誤差から換算した地表経路幅を境界帯へ1回だけ線形加算"
            )
        case .model:
            dominantContributors.append(
                "地球回転・姿勢モデルによる経路幅を境界帯へ線形加算"
            )
        }
        dominantContributors.append(
            "経路値は月地形・暦・星表・地点・地球回転を線形加算した総境界幅"
        )
        dominantContributors.append(
            contentsOf:
                timeScaleNotices
                .dominantContributors
        )
        dominantContributors.append(
            contentsOf:
                maximumEarthRotation
                .dominantContributors
        )
        let precisionWarnings =
            uniquePrecisionWarnings(
                contacts.flatMap {
                    sampleWarnings(
                        phase: $0.phase,
                        geometry: geometry
                    )
                }
            )
        let warnings = [
            "明るい恒星を対象にした参考予報です。精密な望遠鏡時刻測定には使用しないでください。",
            "潜入・出現は平均月縁との幾何学的接触で、月面地形による数秒規模の差を含みません。",
            "境界判定は月地形±11 km、DE442s月位置係数量子化約24.5 m、BSC5P位置分解能2.5″、既知の観測地点水平精度"
                + (
                    maximumEarthRotation
                        .uncertainty
                        .pathKilometers
                        .map {
                            earthRotationPathWarning(
                                uncertainty:
                                    maximumEarthRotation
                                    .uncertainty,
                                pathKilometers: $0
                            )
                        }
                    ?? ""
                )
                + "を保守的に線形加算します。",
            String(
                format:
                    "最大時の総経路境界幅は約±%.2f kmです。",
                boundaryEnvelopeKilometers
            ),
            "大気差、地形、建物、雲、視程は含みません。",
        ]
        + (
            geometry.boundaryUncertain
            ? ["最接近が保守的な物理境界帯内のため、発生有無を確定せず最接近時刻のみを示します。"]
            : []
        )
        + timeScaleNotices.warnings
        + maximumEarthRotation.warnings
        return LocalLunarOccultationCircumstancesV1(
            candidate: candidate,
            title: candidate.title,
            target:
                LunarOccultationTargetV1(
                    starHR: targetStar.hr,
                    label:
                        candidate.targetLabel
                        ?? targetStar.catalogName
                        ?? "HR \(targetStar.hr)",
                    visualMagnitude:
                        targetStar.visualMagnitude
                ),
            observer:
                EclipseCalculationSupportV1
                .observer(
                    location: location,
                    options: options
                ),
            visibility: visibility,
            contacts: contacts,
            maximum: maximum,
            grazing: geometry.boundaryUncertain,
            minimumClearanceRadians:
                geometry.minimumClearanceRadians,
            uncertainty:
                EclipseForecastUncertaintyV1(
                    tier: .reference,
                    timingSeconds:
                        maximumEarthRotation
                        .timingUncertaintySeconds,
                    pathKilometers:
                        boundaryEnvelopeKilometers,
                    observerLocationMeters:
                        options
                        .horizontalAccuracyMeters,
                    earthOrientation:
                        maximumEarthRotation
                        .uncertainty.iersReported,
                    dominantContributors:
                        dominantContributors
                ),
            provenance:
                EclipseProvenanceV1(
                    algorithmVersion:
                        "event-occultation-v1-bsc5p-mean-limb-boundary-band",
                    ephemerisID: provider.id,
                    ephemerisSourceSHA256:
                        provider.sourceSHA256,
                    eopID:
                        maximumEarthRotation.eopID,
                    eopSourceSHA256:
                        maximumEarthRotation
                        .eopSourceSHA256,
                    eopRetrievedAt:
                        maximumEarthRotation
                        .eopRetrievedAt,
                    eopDUT1Quality:
                        maximumEarthRotation
                        .eopDUT1Quality,
                    eopPolarMotionQuality:
                        maximumEarthRotation
                        .eopPolarMotionQuality,
                    deltaTModel:
                        maximumEarthRotation
                        .deltaTModel,
                    lunarRadiusModel:
                        "mean-spherical-limb",
                    limbProfileID: nil
                ),
            precisionWarnings: precisionWarnings,
            warnings: warnings
        )
    }

    private static func contact(
        phase: LunarOccultationContactPhaseV1,
        sample: LunarOccultationSampleV1
    ) -> LunarOccultationContactV1 {
        LunarOccultationContactV1(
            phase: phase,
            instantUTC:
                Date(
                    timeIntervalSinceReferenceDate:
                        sample
                        .secondsSinceReferenceDate
                ),
            moon:
                EclipseBodyPositionV1(
                    horizontal:
                        sample.moon.horizontal
                        ?? sample.target.horizontal,
                    angularRadiusRadians:
                        sample.moon
                        .angularRadiusRadians,
                    distanceKilometers:
                        sample.moon
                        .distanceKilometers
                ),
            targetHorizontal:
                sample.target.horizontal,
            aboveHorizon:
                sample.target.horizontal.altitude > 0,
            positionAngleRadians:
                limbPositionAngleRadians(
                    moonDirection:
                        sample.moon.cirsDirection,
                    targetDirection:
                        sample.target.cirsDirection
                )
        )
    }

    private static func sampleWarnings(
        phase: LunarOccultationContactPhaseV1,
        geometry: LunarOccultationGeometryV1
    ) -> [PrecisionWarningCode] {
        let sample: LunarOccultationSampleV1
        switch phase {
        case .disappearance:
            sample =
                geometry.limbContacts.first
                ?? geometry.maximum
        case .maximum:
            sample = geometry.maximum
        case .reappearance:
            sample =
                geometry.limbContacts.last
                ?? geometry.maximum
        }
        return sample.target.precisionWarnings
    }

    private static func uniquePrecisionWarnings(
        _ warnings: [PrecisionWarningCode]
    ) -> [PrecisionWarningCode] {
        var seen = Set<PrecisionWarningCode>()
        return warnings.filter {
            seen.insert($0).inserted
        }
    }

    private static func observerAstrometry(
        provider: DE442SEphemerisProviderV1,
        at date: Date,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1
    ) async throws
        -> OccultationObserverAstrometryV1
    {
        try EclipseCalculationSupportV1
            .checkCancellation(options.shouldCancel)
        let earthOrientation =
            try options.resolvedEarthOrientation(
                at: date
            )
        let timeScales =
            try Astronomy.resolveTimeScalesV2(
                at: date,
                options: earthOrientation
            )
        let tdbJulianDate =
            try EventTimeScales
                .ttToTdbJulianDate(
                    ttJulianDate:
                        timeScales.ttJulianDate
                )
        let state = try await provider.state(
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
                                timeScales
                                .ttJulianDate
                        )
            )
        let itrsSiteKilometers =
            try Astronomy
                .wgs84ObserverPositionITRSAUV2(
                    geodeticLatitudeRadians:
                        Angles.radians(
                            fromDegrees:
                                location.latitude
                        ),
                    longitudeRadians:
                        Angles.radians(
                            fromDegrees:
                                location.longitude
                        ),
                    heightMeters:
                        options.heightMeters
                )
                * PrecisionConstants
                    .astronomicalUnitKilometers
        let tirsSiteKilometers =
            transposed(polarMotionMatrix)
                .applying(to: itrsSiteKilometers)
        let cirsSiteKilometers =
            rotateTIRSToCIRS(
                tirsSiteKilometers,
                siderealTime: siderealTime
            )
        let icrfSiteKilometers =
            transposed(precessionNutation)
                .applying(to: cirsSiteKilometers)
        let cirsSiteVelocity =
            Vector3D(
                x:
                    -earthRotationRadiansPerDay
                    * cirsSiteKilometers.y,
                y:
                    earthRotationRadiansPerDay
                    * cirsSiteKilometers.x,
                z: 0
            )
        let icrfSiteVelocity =
            transposed(precessionNutation)
                .applying(to: cirsSiteVelocity)
        return OccultationObserverAstrometryV1(
            barycentricPositionAU:
                (
                    state.earthBarycentric
                        .positionKilometers
                    + icrfSiteKilometers
                )
                / PrecisionConstants
                    .astronomicalUnitKilometers,
            barycentricVelocityC:
                (
                    state.earthBarycentric
                        .velocityKilometersPerDay
                    + icrfSiteVelocity
                )
                / speedOfLightKilometersPerDay,
            sunObserverDistanceAU:
                (
                    icrfSiteKilometers
                    - state.sunGeocentric
                        .positionKilometers
                ).length
                / PrecisionConstants
                    .astronomicalUnitKilometers
        )
    }

    private static func transposed(
        _ matrix: PrecisionMatrix3
    ) -> PrecisionMatrix3 {
        PrecisionMatrix3(
            row0:
                Vector3D(
                    x: matrix.row0.x,
                    y: matrix.row1.x,
                    z: matrix.row2.x
                ),
            row1:
                Vector3D(
                    x: matrix.row0.y,
                    y: matrix.row1.y,
                    z: matrix.row2.y
                ),
            row2:
                Vector3D(
                    x: matrix.row0.z,
                    y: matrix.row1.z,
                    z: matrix.row2.z
                )
        )
    }

    private static func rotateTIRSToCIRS(
        _ vector: Vector3D,
        siderealTime: Double
    ) -> Vector3D {
        let sine = sin(siderealTime)
        let cosine = cos(siderealTime)
        return Vector3D(
            x:
                cosine * vector.x
                - sine * vector.y,
            y:
                sine * vector.x
                + cosine * vector.y,
            z: vector.z
        )
    }
}
