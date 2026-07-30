import Foundation

struct LunarShadowSampleV1: Sendable {
    let secondsSinceReferenceDate: Double
    let sun: EclipseApparentBodyStateV1
    let moon: EclipseApparentBodyStateV1
    let centerSeparationRadians: Double
    let penumbralRadiusRadians: Double
    let umbralRadiusRadians: Double
}

private struct LunarEclipseGeometryV1: Sendable {
    let classification: EclipseClassificationV1
    let maximum: LunarShadowSampleV1
    let earthRotation:
        EventEarthRotationContextV1
    let penumbralContacts: [LunarShadowSampleV1]
    let umbralContacts: [LunarShadowSampleV1]
    let totalContacts: [LunarShadowSampleV1]
    let penumbralMagnitude: Double
    let umbralMagnitude: Double
}

public enum LocalLunarEclipseV1 {
    private static let earthEquatorialRadiusKilometers =
        6_378.137
    private static let danjonShadowParallaxFactor =
        1.01
    private static let defaultHalfWindowSeconds =
        7 * 60 * 60.0
    private static let defaultScanStepSeconds =
        3 * 60.0
    private static let rootTimeToleranceSeconds = 0.05
    private static let rootAngleToleranceRadians = 1e-12

    /**
     Computes global mean-shadow contacts and their local visibility.

     The 1.01 Danjon shadow enlargement matches the convention used by
     NASA's Five Millennium lunar-eclipse catalog. Atmospheric extinction,
     clouds, local obstructions, and a hard visual boundary for the
     penumbra are outside this geometric model.
     */
    public static func calculate(
        provider: DE442SEphemerisProviderV1,
        candidate: EclipseCandidateV1,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1 =
            LocalEclipseOptionsV1()
    ) async throws -> LocalEclipseCircumstancesV1? {
        guard candidate.kind == .lunarEclipse else {
            throw LocalEclipseErrorV1
                .wrongCandidateKind
        }
        let validLocation =
            try EclipseCalculationSupportV1.validate(
                location: location,
                options: options
            )
        let halfWindow =
            options.halfWindowSeconds
            ?? defaultHalfWindowSeconds
        let scanStep =
            options.scanStepSeconds
            ?? defaultScanStepSeconds
        guard halfWindow.isFinite,
              scanStep.isFinite,
              halfWindow > 0,
              scanStep > 0
        else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        let center =
            candidate.canonicalEpochUTC
                .timeIntervalSinceReferenceDate
        guard center.isFinite else {
            throw LocalEclipseErrorV1
                .invalidSearchOptions
        }
        let loadedSearchRange =
            try EclipseCalculationSupportV1
                .ephemerisSearchRange(
                    provider: provider
                )
        let searchRange =
            try EclipseCalculationSupportV1
                .resolveSearchRange(
                    candidateSecondsSinceReferenceDate:
                        center,
                    halfWindowSeconds: halfWindow,
                    limit: loadedSearchRange
                )
        let start =
            searchRange
                .startSecondsSinceReferenceDate
        let end =
            searchRange
                .endSecondsSinceReferenceDate
        var samples: [Double: LunarShadowSampleV1] = [:]

        func sampleAt(
            _ instant: Double
        ) async throws -> LunarShadowSampleV1 {
            if let cached = samples[instant] {
                return cached
            }
            let sample = try await rawSample(
                provider: provider,
                at: Date(
                    timeIntervalSinceReferenceDate:
                        instant
                ),
                options: options
            )
            samples[instant] = sample
            return sample
        }

        func clearanceAt(
            _ instant: Double,
            shadow: ShadowV1
        ) async throws -> Double {
            Self.clearance(
                try await sampleAt(instant),
                shadow: shadow
            )
        }

        let maximumInstant =
            try await EclipseCalculationSupportV1
                .asyncMinimum(
                    functionValue: { instant in
                        try await sampleAt(instant)
                            .centerSeparationRadians
                    },
                    lowerArgument: start,
                    upperArgument: end,
                    argumentTolerance:
                        rootTimeToleranceSeconds,
                    shouldCancel: options.shouldCancel
                )
        let maximum = try await sampleAt(maximumInstant)
        guard Self.clearance(
            maximum,
            shadow: .penumbral
        ) < 0
        else {
            return nil
        }
        let penumbralTimes =
            try await contactTimesAroundMinimum(
            clearance: {
                try await clearanceAt(
                    $0,
                    shadow: .penumbral
                )
            },
            start: start,
            end: end,
            shouldCancel: options.shouldCancel
        )
        let umbralTimes =
            try await contactTimesAroundMinimum(
                clearance: {
                    try await clearanceAt(
                        $0,
                        shadow: .umbral
                    )
                },
                start: start,
                end: end,
                shouldCancel: options.shouldCancel
            )
        let totalTimes =
            try await contactTimesAroundMinimum(
                clearance: {
                    try await clearanceAt(
                        $0,
                        shadow: .total
                    )
                },
                start: start,
                end: end,
                shouldCancel: options.shouldCancel
            )
        let hasUmbra = umbralTimes.count >= 2
        let hasTotality = totalTimes.count >= 2
        guard penumbralTimes.count >= 2,
              !hasUmbra || umbralTimes.count >= 2,
              !hasTotality || totalTimes.count >= 2
        else {
            throw LocalEclipseErrorV1
                .contactsNotBracketed
        }
        let moonDiameter =
            2 * maximum.moon.angularRadiusRadians
        let maximumEarthRotation =
            try options.resolvedEventEarthRotation(
                at: Date(
                    timeIntervalSinceReferenceDate:
                        maximum
                        .secondsSinceReferenceDate
                )
            )
        let geometry = LunarEclipseGeometryV1(
            classification:
                hasTotality
                ? .total
                : hasUmbra
                    ? .partial
                    : .penumbral,
            maximum: maximum,
            earthRotation: maximumEarthRotation,
            penumbralContacts:
                try await endpointSamples(
                    penumbralTimes,
                    sampleAt: sampleAt
                ),
            umbralContacts:
                try await endpointSamples(
                    umbralTimes,
                    sampleAt: sampleAt
                ),
            totalContacts:
                try await endpointSamples(
                    totalTimes,
                    sampleAt: sampleAt
                ),
            penumbralMagnitude:
                (
                    maximum.penumbralRadiusRadians
                        + maximum.moon
                            .angularRadiusRadians
                        - maximum
                            .centerSeparationRadians
                )
                / moonDiameter,
            umbralMagnitude:
                (
                    maximum.umbralRadiusRadians
                        + maximum.moon
                            .angularRadiusRadians
                        - maximum
                            .centerSeparationRadians
                )
                / moonDiameter
        )
        var localClearanceCache: [Double: Double] =
            [:]
        func localHorizonClearance(
            _ instant: Double
        ) async throws -> Double {
            if let cached =
                localClearanceCache[instant]
            {
                return cached
            }
            let pair =
                try await EclipseCalculationSupportV1
                    .apparentTopocentricPair(
                        provider: provider,
                        at: Date(
                            timeIntervalSinceReferenceDate:
                                instant
                        ),
                        location: validLocation,
                        options: options
                    )
            guard let horizontal =
                pair.moon.horizontal
            else {
                throw PrecisionModelError.invalidVector
            }
            let clearance =
                horizontal.altitude
                + pair.moon.angularRadiusRadians
            localClearanceCache[instant] = clearance
            return clearance
        }
        let visibility =
            try await EclipseCalculationSupportV1
                .intervalVisibility(
                    start: penumbralTimes[0],
                    end:
                        penumbralTimes[
                            penumbralTimes.count - 1
                        ],
                    horizonClearanceAt:
                        localHorizonClearance,
                    shouldCancel:
                        options.shouldCancel
                )
        return try await circumstances(
            provider: provider,
            candidate: candidate,
            location: validLocation,
            options: options,
            geometry: geometry,
            visibility: visibility
        )
    }

    /**
     Evaluates a physical Danjon-shadow scene at an arbitrary UTC instant.

     The returned value is not labelled as a contact or maximum. Shadow
     geometry follows the same geocentric DE442s path as the contact solver,
     while Sun/Moon horizon coordinates use the same topocentric observer
     pipeline as the published local contacts.
     */
    public static func sampleScene(
        provider: DE442SEphemerisProviderV1,
        candidate: EclipseCandidateV1,
        at instantUTC: Date,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1 =
            LocalEclipseOptionsV1()
    ) async throws -> EventSceneSampleV1 {
        guard candidate.kind == .lunarEclipse else {
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
            options: options
        )
        let topocentric =
            try await EclipseCalculationSupportV1
            .apparentTopocentricPair(
                provider: provider,
                at: instantUTC,
                location: validLocation,
                options: options
            )
        let sun = try EventSceneSampleSupportV1
            .bodyPosition(topocentric.sun)
        let moon = try EventSceneSampleSupportV1
            .bodyPosition(topocentric.moon)
        let shadow = shadowGeometry(raw)
        guard
            let layout =
                EventSceneGeometryV1
                .lunarEclipseLayout(
                    moonAngularRadiusRadians:
                        moon
                        .angularRadiusRadians,
                    shadow: shadow,
                    magnitude: 0,
                    usesPenumbralMagnitude:
                        false
                )
        else {
            throw EventSceneSampleErrorV1
                .invalidGeometry
        }
        let direction =
            try EventSceneSampleSupportV1
            .require(layout.moonOffset)
        return EventSceneSampleV1(
            kind: .lunarEclipse,
            instantUTC: instantUTC,
            sun: sun,
            moon: moon,
            lunarShadow: shadow,
            targetStar: nil,
            aboveHorizon:
                moon.horizontal.altitude
                + moon.angularRadiusRadians
                > 0,
            relativeDirection: direction
        )
    }

    static func rawSample(
        provider: DE442SEphemerisProviderV1,
        at instantUTC: Date,
        options: LocalEclipseOptionsV1
    ) async throws -> LunarShadowSampleV1 {
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
            .apparentGeocentricPair(
                provider: provider,
                at: instantUTC,
                earthOrientation:
                    try options
                    .resolvedEarthOrientation(
                        at: instantUTC
                    ),
                shouldCancel:
                    options.shouldCancel
            )
        return shadowSample(
            instant: instant,
            sun: pair.sun,
            moon: pair.moon
        )
    }

    private enum ShadowV1: Sendable {
        case penumbral
        case umbral
        case total
    }

    private static func shadowSample(
        instant: Double,
        sun: EclipseApparentBodyStateV1,
        moon: EclipseApparentBodyStateV1
    ) -> LunarShadowSampleV1 {
        let moonParallax = asin(
            min(
                1,
                earthEquatorialRadiusKilometers
                    / moon.distanceKilometers
            )
        )
        let sunParallax = asin(
            min(
                1,
                earthEquatorialRadiusKilometers
                    / sun.distanceKilometers
            )
        )
        return LunarShadowSampleV1(
            secondsSinceReferenceDate: instant,
            sun: sun,
            moon: moon,
            centerSeparationRadians:
                EclipseCalculationSupportV1
                .angularSeparation(
                    moon.icrfDirection,
                    -sun.icrfDirection
                ),
            penumbralRadiusRadians:
                danjonShadowParallaxFactor
                * moonParallax
                + sun.angularRadiusRadians
                + sunParallax,
            umbralRadiusRadians:
                danjonShadowParallaxFactor
                * moonParallax
                - sun.angularRadiusRadians
                + sunParallax
        )
    }

    private static func shadowGeometry(
        _ sample: LunarShadowSampleV1
    ) -> LunarShadowGeometryV1 {
        LunarShadowGeometryV1(
            centerSeparationRadians:
                sample
                .centerSeparationRadians,
            centerPositionAngleRadians:
                EclipseContactPositionAngleV1
                .radians(
                    referenceCenterDirection:
                        sample.moon.cirsDirection,
                    otherCenterDirection:
                        sample.sun.cirsDirection
                        * -1
                ),
            penumbralAngularRadiusRadians:
                sample
                .penumbralRadiusRadians,
            umbralAngularRadiusRadians:
                sample
                .umbralRadiusRadians
        )
    }

    private static func clearance(
        _ sample: LunarShadowSampleV1,
        shadow: ShadowV1
    ) -> Double {
        let shadowRadius =
            shadow == .penumbral
            ? sample.penumbralRadiusRadians
            : sample.umbralRadiusRadians
        let contactRadius =
            shadow == .total
            ? shadowRadius
                - sample.moon.angularRadiusRadians
            : shadowRadius
                + sample.moon.angularRadiusRadians
        return sample.centerSeparationRadians
            - contactRadius
    }

    private static func circumstances(
        provider: DE442SEphemerisProviderV1,
        candidate: EclipseCandidateV1,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1,
        geometry: LunarEclipseGeometryV1,
        visibility: EclipseVisibilityV1
    ) async throws -> LocalEclipseCircumstancesV1 {
        guard let firstPenumbral =
            geometry.penumbralContacts.first,
            let lastPenumbral =
                geometry.penumbralContacts.last
        else {
            throw LocalEclipseErrorV1
                .contactsNotBracketed
        }
        var contacts: [EclipseContactV1] = [
            try await localContact(
                .lunarP1,
                sample: firstPenumbral,
                provider: provider,
                location: location,
                options: options
            ),
        ]
        if let firstUmbral =
            geometry.umbralContacts.first
        {
            contacts.append(
                try await localContact(
                    .lunarU1,
                    sample: firstUmbral,
                    provider: provider,
                    location: location,
                    options: options
                )
            )
        }
        if let firstTotal =
            geometry.totalContacts.first
        {
            contacts.append(
                try await localContact(
                    .lunarU2,
                    sample: firstTotal,
                    provider: provider,
                    location: location,
                    options: options
                )
            )
        }
        contacts.append(
            try await localContact(
                .maximum,
                sample: geometry.maximum,
                provider: provider,
                location: location,
                options: options
            )
        )
        if let lastTotal =
            geometry.totalContacts.last
        {
            contacts.append(
                try await localContact(
                    .lunarU3,
                    sample: lastTotal,
                    provider: provider,
                    location: location,
                    options: options
                )
            )
        }
        if let lastUmbral =
            geometry.umbralContacts.last
        {
            contacts.append(
                try await localContact(
                    .lunarU4,
                    sample: lastUmbral,
                    provider: provider,
                    location: location,
                    options: options
                )
            )
        }
        contacts.append(
            try await localContact(
                .lunarP4,
                sample: lastPenumbral,
                provider: provider,
                location: location,
                options: options
            )
        )
        guard let maximum = contacts.first(
            where: { $0.phase == .maximum }
        ) else {
            throw LocalEclipseErrorV1
                .contactsNotBracketed
        }
        let maximumEarthRotation =
            geometry.earthRotation
        let maximumEarthOrientation =
            maximumEarthRotation.earthOrientation
        var contributors = [
            "Danjon法（影半径1.01倍）",
            "地球大気による影の境界は連続的",
        ]
        if maximumEarthOrientation.dut1Seconds == nil {
            contributors.append(
                "UT1−UTCを0秒と仮定"
            )
        }
        if maximumEarthRotation
            .uncertainty.iersReported != nil
        {
            contributors.append(
                "IERS公表誤差のDUT1・xp・yp成分を表示（地表経路の境界帯へは加算しない）"
            )
        }
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
            magnitude:
                geometry.classification == .penumbral
                ? geometry.penumbralMagnitude
                : geometry.umbralMagnitude,
            obscuration: nil,
            uncertainty: EclipseForecastUncertaintyV1(
                tier: .uncertain,
                timingSeconds:
                    maximumEarthRotation
                        .timingUncertaintySeconds
                    ?? 10,
                pathKilometers: nil,
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
                    "event-lunar-swift-v1-danjon",
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
                "月食の影半径はNASA Five Millennium Catalogと同じDanjon法です。",
                "半影の開始・終了は淡く、肉眼で明確に判別できない場合があります。",
                "地形、建物、雲、視程は含みません。",
            ]
            + timeScaleNotices.warnings
            + maximumEarthRotation.warnings
        )
    }

    private static func localContact(
        _ phase: EclipseContactPhaseV1,
        sample: LunarShadowSampleV1,
        provider: DE442SEphemerisProviderV1,
        location: ObservingLocation,
        options: LocalEclipseOptionsV1
    ) async throws -> EclipseContactV1 {
        let pair =
            try await EclipseCalculationSupportV1
                .apparentTopocentricPair(
                    provider: provider,
                    at: Date(
                        timeIntervalSinceReferenceDate:
                            sample
                            .secondsSinceReferenceDate
                    ),
                    location: location,
                    options: options
                )
        guard let moonHorizontal =
            pair.moon.horizontal
        else {
            throw PrecisionModelError.invalidVector
        }
        let shadowCenterDirection =
            sample.sun.cirsDirection * -1
        let contactPointIsAwayFromShadowCenter =
            phase == .lunarU2
            || phase == .lunarU3
        return EclipseContactV1(
            phase: phase,
            instantUTC: Date(
                timeIntervalSinceReferenceDate:
                    sample.secondsSinceReferenceDate
            ),
            sun: nil,
            moon: EclipseBodyPositionV1(
                horizontal: moonHorizontal,
                angularRadiusRadians:
                    pair.moon.angularRadiusRadians,
                distanceKilometers:
                    pair.moon.distanceKilometers
            ),
            lunarShadow: shadowGeometry(sample),
            aboveHorizon:
                moonHorizontal.altitude
                    + pair.moon.angularRadiusRadians
                    > 0,
            positionAngleRadians:
                phase == .maximum
                ? nil
                : EclipseContactPositionAngleV1
                    .radians(
                        referenceCenterDirection:
                            sample.moon.cirsDirection,
                        otherCenterDirection:
                            shadowCenterDirection,
                        radialDirection:
                            contactPointIsAwayFromShadowCenter
                            ? .awayFromOtherCenter
                            : .towardOtherCenter
                    )
        )
    }

    private static func contactTimesAroundMinimum(
        clearance:
            (Double) async throws -> Double,
        start: Double,
        end: Double,
        shouldCancel: (@Sendable () -> Bool)?
    ) async throws -> [Double] {
        let minimum =
            try await EclipseCalculationSupportV1
                .asyncMinimum(
                    functionValue: clearance,
                    lowerArgument: start,
                    upperArgument: end,
                    argumentTolerance:
                        rootTimeToleranceSeconds,
                    shouldCancel: shouldCancel
                )
        let minimumValue =
            try await clearance(minimum)
        guard minimumValue < 0 else {
            return []
        }
        let startValue = try await clearance(start)
        let endValue = try await clearance(end)
        guard startValue > 0, endValue > 0 else {
            throw LocalEclipseErrorV1
                .contactsNotBracketed
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
            (Double) async throws -> LunarShadowSampleV1
    ) async throws -> [LunarShadowSampleV1] {
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

    private static func title(
        for classification: EclipseClassificationV1
    ) -> String {
        switch classification {
        case .total:
            "皆既月食"
        case .partial:
            "部分月食"
        default:
            "半影月食"
        }
    }
}
