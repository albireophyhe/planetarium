import Foundation

struct SolarDiscSampleV1: Sendable {
    let secondsSinceReferenceDate: Double
    let sun: EclipseApparentBodyStateV1
    let moon: EclipseApparentBodyStateV1
}

struct SolarEclipseGeometryV1: Sendable {
    let classification: EclipseClassificationV1
    let maximum: SolarDiscSampleV1
    let earthRotation:
        EventEarthRotationContextV1
    let externalContacts: [SolarDiscSampleV1]
    let internalContacts: [SolarDiscSampleV1]
    let magnitude: Double
    let obscuration: Double
    let boundaryUncertaintyRadians: Double
    let uncertainBoundary:
        SolarEclipseUncertainBoundaryV1?

    var boundaryUncertain: Bool {
        uncertainBoundary != nil
    }
}

public enum LocalSolarEclipseV1 {
    private static let defaultHalfWindowSeconds =
        5 * 60 * 60.0
    private static let defaultScanStepSeconds =
        2 * 60.0
    private static let rootTimeToleranceSeconds = 0.02
    private static let rootAngleToleranceRadians = 1e-13
    // NASA reports departures of the real lunar limb from a smooth sphere
    // of about ±3 arcseconds, or nearly ±6 km at the Moon's mean distance.
    // Preserve that radial envelope when no topographic profile is loaded:
    // https://eclipse.gsfc.nasa.gov/SEhelp/limb.html
    private static let meanLimbBoundaryKilometers = 6.0

    /**
     Computes mean-limb local solar-eclipse circumstances.

     The result is `nil` when the global candidate is not an eclipse at the
     observer's topocentric position. Atmospheric refraction, local terrain,
     weather, and the lunar topographic limb are deliberately excluded.
     */
    public static func calculate(
        provider: DE442SEphemerisProviderV1,
        candidate: EclipseCandidateV1,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1 =
            LocalEclipseOptionsV1()
    ) async throws -> LocalEclipseCircumstancesV1? {
        guard candidate.kind == .solarEclipse else {
            throw LocalEclipseErrorV1
                .wrongCandidateKind
        }
        let validLocation =
            try EclipseCalculationSupportV1.validate(
                location: location,
                options: options
            )
        let center =
            candidate.canonicalEpochUTC
                .timeIntervalSinceReferenceDate
        let loadedSearchRange =
            try EclipseCalculationSupportV1
                .ephemerisSearchRange(
                    provider: provider
                )
        var samples: [Double: SolarDiscSampleV1] = [:]

        func sampleAt(
            _ instant: Double
        ) async throws -> SolarDiscSampleV1 {
            if let cached = samples[instant] {
                return cached
            }
            let sample = try await rawSample(
                provider: provider,
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

        guard let geometry =
            try await solveGeometry(
                candidateSecondsSinceReferenceDate:
                    center,
                sampleAt: sampleAt,
                searchLimit: loadedSearchRange,
                options: options
            )
        else {
            return nil
        }
        let visibility: EclipseVisibilityV1
        if geometry.uncertainBoundary == .external {
            guard let horizontal =
                geometry.maximum.sun.horizontal
            else {
                throw PrecisionModelError.invalidVector
            }
            visibility =
                try EclipseCalculationSupportV1
                    .boundaryMaximumIsAboveHorizon(
                        horizonClearanceRadians:
                            horizontal.altitude
                            + geometry.maximum.sun
                                .angularRadiusRadians
                    )
                ? .partlyVisible
                : .belowHorizon
        } else {
            guard let firstExternal =
                geometry.externalContacts.first,
                let lastExternal =
                    geometry.externalContacts.last
            else {
                throw LocalEclipseErrorV1
                    .contactsNotBracketed
            }
            visibility =
                try await EclipseCalculationSupportV1
                    .intervalVisibility(
                        start:
                            firstExternal
                                .secondsSinceReferenceDate,
                        end:
                            lastExternal
                                .secondsSinceReferenceDate,
                        horizonClearanceAt: { instant in
                            let sample =
                                try await sampleAt(instant)
                            guard let horizontal =
                                sample.sun.horizontal
                            else {
                                throw PrecisionModelError
                                    .invalidVector
                            }
                            return horizontal.altitude
                                + sample.sun
                                    .angularRadiusRadians
                        },
                        shouldCancel:
                            options.shouldCancel
                    )
        }
        return try circumstances(
            provider: provider,
            candidate: candidate,
            location: validLocation,
            options: options,
            geometry: geometry,
            visibility: visibility
        )
    }

    /**
     Evaluates a physical Sun/Moon scene at an arbitrary UTC instant.

     The returned value has no contact phase. The supplied candidate is used
     only to reject a mismatched phenomenon kind; its canonical epoch does
     not replace `instantUTC`.
     */
    public static func sampleScene(
        provider: DE442SEphemerisProviderV1,
        candidate: EclipseCandidateV1,
        at instantUTC: Date,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1 =
            LocalEclipseOptionsV1()
    ) async throws -> EventSceneSampleV1 {
        guard candidate.kind == .solarEclipse else {
            throw LocalEclipseErrorV1
                .wrongCandidateKind
        }
        let validLocation =
            try EclipseCalculationSupportV1
            .validate(
                location: location,
                options: options
            )
        try EclipseCalculationSupportV1
            .validateSceneInstant(
                provider: provider,
                instantUTC: instantUTC,
                shouldCancel:
                    options.shouldCancel
            )
        let raw = try await rawSample(
            provider: provider,
            at: instantUTC,
            location: validLocation,
            options: options
        )
        let sun = try EventSceneSampleSupportV1
            .bodyPosition(raw.sun)
        let moon = try EventSceneSampleSupportV1
            .bodyPosition(raw.moon)
        let direction =
            try EventSceneSampleSupportV1
            .require(
                EventSceneGeometryV1
                    .tangentOffset(
                        reference:
                            sun.horizontal,
                        target:
                            moon.horizontal
                    )
            )
        return EventSceneSampleV1(
            kind: .solarEclipse,
            instantUTC: instantUTC,
            sun: sun,
            moon: moon,
            lunarShadow: nil,
            targetStar: nil,
            aboveHorizon:
                sun.horizontal.altitude
                + sun.angularRadiusRadians
                > 0,
            relativeDirection: direction
        )
    }

    static func rawSample(
        provider: DE442SEphemerisProviderV1,
        at instantUTC: Date,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1
    ) async throws -> SolarDiscSampleV1 {
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
        let pair =
            try await EclipseCalculationSupportV1
            .apparentTopocentricPair(
                provider: provider,
                at: instantUTC,
                location: location,
                options: options
            )
        return SolarDiscSampleV1(
            secondsSinceReferenceDate: instant,
            sun: pair.sun,
            moon: pair.moon
        )
    }

    static func boundaryUncertaintyRadians(
        moonDistanceKilometers: Double,
        earthRotationPathUncertaintyKilometers:
            Double? = nil,
        horizontalAccuracyMeters:
            Double? = nil
    ) throws -> Double {
        guard moonDistanceKilometers.isFinite,
              moonDistanceKilometers > 0
        else {
            throw EventNumericsError.nonFiniteValue(
                "positive solar-eclipse Moon distance"
            )
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
        if let horizontalAccuracyMeters {
            guard horizontalAccuracyMeters.isFinite,
                  horizontalAccuracyMeters >= 0
            else {
                throw LocalEclipseErrorV1
                    .invalidObserverAccuracy
            }
        }
        let observerKilometers =
            (horizontalAccuracyMeters ?? 0)
            / 1_000
        return (
            meanLimbBoundaryKilometers
                + (
                    earthRotationPathUncertaintyKilometers
                    ?? 0
                )
                + observerKilometers
        ) / moonDistanceKilometers
    }

    static func solveGeometry(
        candidateSecondsSinceReferenceDate:
            Double,
        sampleAt:
            (Double) async throws
                -> SolarDiscSampleV1,
        searchLimit:
            EclipseSearchRangeV1? = nil,
        options: LocalEclipseOptionsV1 =
            LocalEclipseOptionsV1()
    ) async throws -> SolarEclipseGeometryV1? {
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
            scanStep > 0
        else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        let searchRange =
            try EclipseCalculationSupportV1
                .resolveSearchRange(
                    candidateSecondsSinceReferenceDate:
                        candidateSecondsSinceReferenceDate,
                    halfWindowSeconds: halfWindow,
                    limit: searchLimit
                )
        let start =
            searchRange
                .startSecondsSinceReferenceDate
        let end =
            searchRange
                .endSecondsSinceReferenceDate

        func separation(
            _ sample: SolarDiscSampleV1
        ) -> Double {
            EclipseCalculationSupportV1
                .angularSeparation(
                    sample.sun.icrfDirection,
                    sample.moon.icrfDirection
                )
        }

        func externalClearance(
            _ sample: SolarDiscSampleV1
        ) -> Double {
            separation(sample)
                - sample.sun.angularRadiusRadians
                - sample.moon.angularRadiusRadians
        }

        func externalClearanceAt(
            _ instant: Double
        ) async throws -> Double {
            externalClearance(
                try await sampleAt(instant)
            )
        }

        func internalClearance(
            _ sample: SolarDiscSampleV1
        ) -> Double {
            separation(sample)
                - abs(
                    sample.moon.angularRadiusRadians
                        - sample.sun.angularRadiusRadians
                )
        }

        func internalClearanceAt(
            _ instant: Double
        ) async throws -> Double {
            internalClearance(
                try await sampleAt(instant)
            )
        }

        func makeGeometry(
            classification:
                EclipseClassificationV1,
            maximum: SolarDiscSampleV1,
            earthRotation:
                EventEarthRotationContextV1,
            externalContacts:
                [SolarDiscSampleV1],
            internalContacts:
                [SolarDiscSampleV1],
            hasInternalContacts: Bool,
            boundaryUncertaintyRadians: Double,
            uncertainBoundary:
                SolarEclipseUncertainBoundaryV1?
        ) -> SolarEclipseGeometryV1 {
            let centerSeparation =
                separation(maximum)
            let sunRadius =
                maximum.sun.angularRadiusRadians
            let moonRadius =
                maximum.moon.angularRadiusRadians
            return SolarEclipseGeometryV1(
                classification: classification,
                maximum: maximum,
                earthRotation: earthRotation,
                externalContacts:
                    externalContacts,
                internalContacts:
                    internalContacts,
                magnitude:
                    hasInternalContacts
                    ? moonRadius / sunRadius
                    : max(
                        0,
                        (
                            sunRadius + moonRadius
                                - centerSeparation
                        )
                        / (2 * sunRadius)
                    ),
                obscuration: overlapFraction(
                    separationRadians:
                        centerSeparation,
                    firstRadiusRadians: sunRadius,
                    secondRadiusRadians: moonRadius
                ),
                boundaryUncertaintyRadians:
                    boundaryUncertaintyRadians,
                uncertainBoundary:
                    uncertainBoundary
            )
        }

        let maximumInstant =
            try await EclipseCalculationSupportV1
                .asyncMinimum(
                    functionValue: { instant in
                        separation(
                            try await sampleAt(instant)
                        )
                    },
                    lowerArgument: start,
                    upperArgument: end,
                    argumentTolerance:
                        rootTimeToleranceSeconds,
                    shouldCancel:
                        options.shouldCancel
                )
        let maximum = try await sampleAt(maximumInstant)
        let maximumEarthRotation =
            try options.resolvedEventEarthRotation(
                at: Date(
                    timeIntervalSinceReferenceDate:
                        maximum
                        .secondsSinceReferenceDate
                )
            )
        let boundaryUncertainty =
            try boundaryUncertaintyRadians(
                moonDistanceKilometers:
                    maximum.moon.distanceKilometers,
                earthRotationPathUncertaintyKilometers:
                    maximumEarthRotation
                    .uncertainty.pathKilometers,
                horizontalAccuracyMeters:
                    options.horizontalAccuracyMeters
            )
        let externalMinimum =
            externalClearance(maximum)
        guard externalMinimum
            <= boundaryUncertainty
        else {
            return nil
        }
        if abs(externalMinimum)
            <= boundaryUncertainty
        {
            return makeGeometry(
                classification: .partial,
                maximum: maximum,
                earthRotation:
                    maximumEarthRotation,
                externalContacts: [maximum],
                internalContacts: [],
                hasInternalContacts: false,
                boundaryUncertaintyRadians:
                    boundaryUncertainty,
                uncertainBoundary: .external
            )
        }

        let externalTimes =
            try await contactTimesAroundMinimum(
                clearance: externalClearanceAt,
                start: start,
                minimum: maximumInstant,
                end: end,
                shouldCancel: options.shouldCancel
            )
        guard externalTimes.count >= 2 else {
            throw LocalEclipseErrorV1
                .contactsNotBracketed
        }
        let externalContacts =
            try await endpointSamples(
                externalTimes,
                sampleAt: sampleAt
            )
        let internalMinimum =
            try await EclipseCalculationSupportV1
                .asyncMinimum(
                    functionValue:
                        internalClearanceAt,
                    lowerArgument:
                        externalTimes[0],
                    upperArgument:
                        externalTimes[
                            externalTimes.count - 1
                        ],
                    argumentTolerance:
                        rootTimeToleranceSeconds,
                    shouldCancel:
                        options.shouldCancel
                )
        let internalMinimumValue =
            try await internalClearanceAt(
                internalMinimum
            )
        let internalMaximum =
            try await sampleAt(internalMinimum)
        let internalEarthRotation =
            try options.resolvedEventEarthRotation(
                at: Date(
                    timeIntervalSinceReferenceDate:
                        internalMaximum
                        .secondsSinceReferenceDate
                )
            )
        let internalBoundaryUncertainty =
            try boundaryUncertaintyRadians(
                moonDistanceKilometers:
                    internalMaximum.moon
                    .distanceKilometers,
                earthRotationPathUncertaintyKilometers:
                    internalEarthRotation
                    .uncertainty.pathKilometers,
                horizontalAccuracyMeters:
                    options.horizontalAccuracyMeters
            )
        let nominalHasInternalContacts =
            internalMinimumValue < 0
        let uncertainInternalBoundary =
            abs(internalMinimumValue)
                <= internalBoundaryUncertainty
        let hasInternalContacts =
            nominalHasInternalContacts
                && !uncertainInternalBoundary
        let internalTimes =
            hasInternalContacts
            ? try await contactTimesAroundMinimum(
                clearance: internalClearanceAt,
                start: externalTimes[0],
                minimum: internalMinimum,
                end:
                    externalTimes[
                        externalTimes.count - 1
                    ],
                shouldCancel: options.shouldCancel
            )
            : []
        guard !hasInternalContacts
            || internalTimes.count >= 2
        else {
            throw LocalEclipseErrorV1
                .contactsNotBracketed
        }
        let classification:
            EclipseClassificationV1 =
            nominalHasInternalContacts
            ? (
                maximum.moon.angularRadiusRadians
                    >= maximum.sun.angularRadiusRadians
                ? .total
                : .annular
            )
            : .partial
        return makeGeometry(
            classification: classification,
            maximum: maximum,
            earthRotation: maximumEarthRotation,
            externalContacts:
                externalContacts,
            internalContacts:
                try await endpointSamples(
                    internalTimes,
                    sampleAt: sampleAt
                ),
            hasInternalContacts:
                nominalHasInternalContacts,
            boundaryUncertaintyRadians:
                uncertainInternalBoundary
                ? internalBoundaryUncertainty
                : boundaryUncertainty,
            uncertainBoundary:
                uncertainInternalBoundary
                ? .partialCentral
                : nil
        )
    }

    private static func circumstances(
        provider: DE442SEphemerisProviderV1,
        candidate: EclipseCandidateV1,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1,
        geometry: SolarEclipseGeometryV1,
        visibility: EclipseVisibilityV1
    ) throws -> LocalEclipseCircumstancesV1 {
        let external = geometry.externalContacts
        let internalContacts =
            geometry.internalContacts
        let maximum =
            try contact(
                .maximum,
                sample: geometry.maximum
            )
        var contacts: [EclipseContactV1]
        if geometry.uncertainBoundary == .external {
            contacts = [maximum]
        } else {
            guard let firstExternal = external.first,
                  let lastExternal = external.last
            else {
                throw LocalEclipseErrorV1
                    .contactsNotBracketed
            }
            contacts = [
                try contact(
                    .solarC1,
                    sample: firstExternal
                ),
            ]
            if let firstInternal =
                internalContacts.first
            {
                contacts.append(
                    try contact(
                        .solarC2,
                        sample: firstInternal
                    )
                )
            }
            contacts.append(
                maximum
            )
            if let lastInternal =
                internalContacts.last
            {
                contacts.append(
                    try contact(
                        .solarC3,
                        sample: lastInternal
                    )
                )
            }
            contacts.append(
                try contact(
                    .solarC4,
                    sample: lastExternal
                )
            )
        }
        let maximumEarthRotation =
            geometry.earthRotation
        let maximumEarthOrientation =
            maximumEarthRotation.earthOrientation
        let hasDUT1 =
            maximumEarthOrientation.dut1Seconds != nil
        var contributors = ["平均月縁（地形未使用）"]
        if !hasDUT1 {
            contributors.append(
                "UT1−UTCを0秒と仮定"
            )
        }
        if options.horizontalAccuracyMeters == nil {
            contributors.append(
                "観測地点の水平精度が不明"
            )
        } else {
            contributors.append(
                "観測地点の水平精度を境界帯へ線形加算"
            )
        }
        switch maximumEarthRotation.uncertainty {
        case .none:
            break
        case .iersReported:
            contributors.append(
                "IERS公表誤差から換算した地表経路幅を境界帯へ1回だけ線形加算"
            )
        case .model:
            contributors.append(
                "地球回転・姿勢モデルによる経路幅を境界帯へ線形加算"
            )
        }
        contributors.append(
            "実月縁地形±6 km・既知の観測地点水平精度・地球回転経路を線形加算した総境界幅"
        )
        let timeScaleNotices =
            try EventTimeScaleNoticesV1.resolve(
                at: maximum.instantUTC,
                earthOrientation:
                maximumEarthOrientation
            )
        contributors.append(
            contentsOf:
                timeScaleNotices
                .dominantContributors
        )
        contributors.append(
            contentsOf:
                maximumEarthRotation
                .dominantContributors
        )
        return LocalEclipseCircumstancesV1(
            candidate: candidate,
            title: title(for: geometry.classification),
            classification: geometry.classification,
            observer:
                EclipseCalculationSupportV1.observer(
                    location: location,
                    options: options
                ),
            visibility: visibility,
            contacts: contacts,
            maximum: maximum,
            magnitude: geometry.magnitude,
            obscuration: geometry.obscuration,
            uncertainty: EclipseForecastUncertaintyV1(
                tier: .uncertain,
                timingSeconds:
                    maximumEarthRotation
                    .timingUncertaintySeconds,
                pathKilometers:
                    geometry
                    .boundaryUncertaintyRadians
                    * geometry.maximum.moon
                        .distanceKilometers,
                observerLocationMeters:
                    options
                        .horizontalAccuracyMeters,
                earthOrientation:
                    maximumEarthRotation
                    .uncertainty.iersReported,
                dominantContributors: contributors
            ),
            provenance: EclipseProvenanceV1(
                algorithmVersion:
                    "event-solar-swift-v1-mean-limb-boundary-band",
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
                    maximumEarthRotation.deltaTModel,
                lunarRadiusModel:
                    "mean-spherical-limb",
                limbProfileID: nil
            ),
            warnings: [
                "平均月縁による幾何学的予報です。",
                String(
                    format:
                        "最大時の総経路境界幅は約±%.2f kmです。",
                    geometry
                        .boundaryUncertaintyRadians
                        * geometry.maximum.moon
                            .distanceKilometers
                ),
                "地形、建物、雲、視程は含みません。",
                "太陽が地平線に近い段階は大気差の影響を受けます。",
            ]
            + boundaryWarnings(
                geometry.uncertainBoundary
            )
            + timeScaleNotices.warnings
            + maximumEarthRotation.warnings,
            uncertainBoundary:
                geometry.uncertainBoundary
        )
    }

    private static func boundaryWarnings(
        _ boundary:
            SolarEclipseUncertainBoundaryV1?
    ) -> [String] {
        switch boundary {
        case .external:
            [
                "最接近が保守的な外縁境界帯内のため、局地的な日食の発生有無を確定せず最大時刻のみを示します。",
            ]
        case .partialCentral:
            [
                "最大食が保守的な部分食・中心食境界帯内のため、中心食接触の有無を確定しません。",
            ]
        case nil:
            []
        }
    }

    private static func contact(
        _ phase: EclipseContactPhaseV1,
        sample: SolarDiscSampleV1
    ) throws -> EclipseContactV1 {
        guard let sunHorizontal =
            sample.sun.horizontal,
            let moonHorizontal =
                sample.moon.horizontal
        else {
            throw PrecisionModelError.invalidVector
        }
        let isInternalContact =
            phase == .solarC2
            || phase == .solarC3
        let contactPointIsAwayFromMoon =
            isInternalContact
            && sample.moon.angularRadiusRadians
                > sample.sun.angularRadiusRadians
        return EclipseContactV1(
            phase: phase,
            instantUTC: Date(
                timeIntervalSinceReferenceDate:
                    sample.secondsSinceReferenceDate
            ),
            sun: EclipseBodyPositionV1(
                horizontal: sunHorizontal,
                angularRadiusRadians:
                    sample.sun.angularRadiusRadians,
                distanceKilometers:
                    sample.sun.distanceKilometers
            ),
            moon: EclipseBodyPositionV1(
                horizontal: moonHorizontal,
                angularRadiusRadians:
                    sample.moon.angularRadiusRadians,
                distanceKilometers:
                    sample.moon.distanceKilometers
            ),
            aboveHorizon:
                sunHorizontal.altitude
                    + sample.sun
                        .angularRadiusRadians
                    > 0,
            positionAngleRadians:
                phase == .maximum
                ? nil
                : EclipseContactPositionAngleV1
                    .radians(
                        referenceCenterDirection:
                            sample.sun.cirsDirection,
                        otherCenterDirection:
                            sample.moon.cirsDirection,
                        radialDirection:
                            contactPointIsAwayFromMoon
                            ? .awayFromOtherCenter
                            : .towardOtherCenter
                    )
        )
    }

    private static func contactTimesAroundMinimum(
        clearance:
            (Double) async throws -> Double,
        start: Double,
        minimum: Double,
        end: Double,
        shouldCancel: (@Sendable () -> Bool)?
    ) async throws -> [Double] {
        let minimumValue =
            try await clearance(minimum)
        guard minimumValue < 0 else {
            return []
        }
        let startValue = try await clearance(start)
        let endValue = try await clearance(end)
        guard startValue > 0, endValue > 0 else {
            return []
        }
        return [
            try await EclipseCalculationSupportV1
                .asyncRoot(
                    functionValue: clearance,
                    lowerArgument: start,
                    upperArgument: minimum,
                    argumentTolerance:
                        rootTimeToleranceSeconds,
                    valueTolerance:
                        rootAngleToleranceRadians,
                    shouldCancel: shouldCancel
                ),
            try await EclipseCalculationSupportV1
                .asyncRoot(
                    functionValue: clearance,
                    lowerArgument: minimum,
                    upperArgument: end,
                    argumentTolerance:
                        rootTimeToleranceSeconds,
                    valueTolerance:
                        rootAngleToleranceRadians,
                    shouldCancel: shouldCancel
                ),
        ]
    }

    private static func endpointSamples(
        _ times: [Double],
        sampleAt:
            (Double) async throws -> SolarDiscSampleV1
    ) async throws -> [SolarDiscSampleV1] {
        guard let first = times.first,
              let last = times.last
        else {
            return []
        }
        return [
            try await sampleAt(first),
            try await sampleAt(last),
        ]
    }

    private static func overlapFraction(
        separationRadians: Double,
        firstRadiusRadians: Double,
        secondRadiusRadians: Double
    ) -> Double {
        let distance = separationRadians
        let first = firstRadiusRadians
        let second = secondRadiusRadians
        if distance >= first + second {
            return 0
        }
        if distance <= abs(first - second) {
            let coveredRadius = min(first, second)
            return min(
                1,
                coveredRadius * coveredRadius
                    / (first * first)
            )
        }
        let firstAngle = acos(
            max(
                -1,
                min(
                    1,
                    (
                        distance * distance
                            + first * first
                            - second * second
                    )
                    / (2 * distance * first)
                )
            )
        )
        let secondAngle = acos(
            max(
                -1,
                min(
                    1,
                    (
                        distance * distance
                            + second * second
                            - first * first
                    )
                    / (2 * distance * second)
                )
            )
        )
        let triangleArea =
            0.5
            * sqrt(
                max(
                    0,
                    (-distance + first + second)
                        * (distance + first - second)
                        * (distance - first + second)
                        * (distance + first + second)
                )
            )
        let overlapArea =
            first * first * firstAngle
            + second * second * secondAngle
            - triangleArea
        return max(
            0,
            min(
                1,
                overlapArea
                    / (Double.pi * first * first)
            )
        )
    }

    private static func title(
        for classification: EclipseClassificationV1
    ) -> String {
        switch classification {
        case .total:
            "皆既日食"
        case .annular:
            "金環日食"
        default:
            "部分日食"
        }
    }
}
