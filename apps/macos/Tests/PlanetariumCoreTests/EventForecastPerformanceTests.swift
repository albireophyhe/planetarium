import Darwin
import Foundation
import XCTest

import PlanetariumShared
@testable import PlanetariumCore

final class EventForecastPerformanceTests:
    XCTestCase, @unchecked Sendable
{
    func testAnnualTokyoForecastColdLoad()
        async throws
    {
        let environment =
            ProcessInfo.processInfo.environment
        guard let rawYear =
            environment[
                "PLANETARIUM_EVENT_BENCHMARK_YEAR"
            ],
            let year = Int(rawYear)
        else {
            throw XCTSkip(
                "Set PLANETARIUM_EVENT_BENCHMARK_YEAR to run the opt-in benchmark."
            )
        }
        guard (1900...2100).contains(year) else {
            return XCTFail(
                "Benchmark year must be from 1900 through 2100."
            )
        }

        let tracker = EventBenchmarkAssetTracker()
        let baselinePeakResidentBytes =
            peakResidentBytes()
        let totalStartedAt =
            DispatchTime.now().uptimeNanoseconds

        let resourceStartedAt =
            DispatchTime.now().uptimeNanoseconds
        let candidateManifest =
            try SharedResources.eventCandidateData(
                for: .manifest
            )
        tracker.record(
            file:
                "shared/events/event-candidates-manifest.v1.json",
            bytes: candidateManifest.count
        )
        let ephemerisManifest =
            try SharedResources.de442sEphemerisData(
                for: .manifest
            )
        tracker.record(
            file:
                "shared/ephemeris/de442s/de442s-manifest.v1.json",
            bytes: ephemerisManifest.count
        )
        let eopManifest =
            try SharedResources
            .iersEarthOrientationData(
                for: .manifest
            )
        tracker.record(
            file:
                "shared/eop/iers-finals2000a-eop.v1.json",
            bytes: eopManifest.count
        )
        let catalog = try EclipseCandidateCatalogV1(
            manifestData: candidateManifest,
            chunkDataLoader: { fileName in
                let data =
                    try SharedResources
                    .eventCandidateChunkData(
                        named: fileName
                    )
                tracker.record(
                    file:
                        "shared/events/chunks/\(fileName)",
                    bytes: data.count
                )
                return data
            }
        )
        let ephemeris =
            try DE442SEphemerisProviderV1(
                manifestData: ephemerisManifest,
                chunkDataLoader: { fileName in
                    let data =
                        try SharedResources
                        .de442sEphemerisChunkData(
                            named: fileName
                        )
                    tracker.record(
                        file:
                            "shared/ephemeris/de442s/chunks/\(fileName)",
                        bytes: data.count
                    )
                    return data
                }
            )
        let earthOrientation =
            try IERSEarthOrientationServiceV1(
                manifestData: eopManifest,
                loadChunkData: { descriptor in
                    let data =
                        try SharedResources
                        .iersEarthOrientationChunkData(
                            startMjdUtc:
                                descriptor.startMjdUtc
                        )
                    tracker.record(
                        file: descriptor.file,
                        bytes: data.count
                    )
                    return data
                }
            )
        let skyCatalog = try PlanetariumData.load()
        let resourceSetupMilliseconds =
            elapsedMilliseconds(
                since: resourceStartedAt
            )

        let interval = try utcInterval(year: year)
        let candidateStartedAt =
            DispatchTime.now().uptimeNanoseconds
        let candidates = try await catalog.candidates(
            from: interval.start,
            through: interval.end
        )
        let candidateLoadMilliseconds =
            elapsedMilliseconds(
                since: candidateStartedAt
            )

        var calculatedForecasts = 0
        var failures: [String] = []
        let forecastStartedAt =
            DispatchTime.now().uptimeNanoseconds
        for candidate in candidates {
            do {
                let options = try eventOptions(
                    candidate: candidate,
                    service: earthOrientation
                )
                switch candidate.kind {
                case .solarEclipse:
                    if try await LocalSolarEclipseV1
                        .calculate(
                            provider: ephemeris,
                            candidate: candidate,
                            location: tokyo,
                            options: options
                        ) != nil
                    {
                        calculatedForecasts += 1
                    }
                case .lunarEclipse:
                    if try await LocalLunarEclipseV1
                        .calculate(
                            provider: ephemeris,
                            candidate: candidate,
                            location: tokyo,
                            options: options
                        ) != nil
                    {
                        calculatedForecasts += 1
                    }
                case .lunarOccultation:
                    if try await LocalLunarOccultationV1
                        .calculate(
                            provider: ephemeris,
                            candidate: candidate,
                            catalog: skyCatalog,
                            location: tokyo,
                            options: options
                        ) != nil
                    {
                        calculatedForecasts += 1
                    }
                }
            } catch {
                failures.append(
                    "\(candidate.id): \(error.localizedDescription)"
                )
            }
        }
        let forecastCalculationMilliseconds =
            elapsedMilliseconds(
                since: forecastStartedAt
            )
        let totalMilliseconds =
            elapsedMilliseconds(
                since: totalStartedAt
            )

        XCTAssertFalse(candidates.isEmpty)
        XCTAssertEqual(failures, [])

        let candidateChunks = try assetMetrics(
            tracker: tracker,
            prefix: "shared/events/chunks/",
            manifest: candidateManifest
        )
        let de442sChunks = try assetMetrics(
            tracker: tracker,
            prefix:
                "shared/ephemeris/de442s/chunks/",
            manifest: ephemerisManifest
        )
        let eopChunks = try assetMetrics(
            tracker: tracker,
            prefix: "shared/eop/eop/",
            manifest: eopManifest
        )
        let finalPeakResidentBytes =
            peakResidentBytes()
        let metrics = EventBenchmarkMetrics(
            benchmark:
                "annual-local-event-forecast",
            runtime: "macos-swift",
            year: year,
            location: "Tokyo",
            candidates: candidates.count,
            calculatedForecasts:
                calculatedForecasts,
            candidateKinds: Dictionary(
                grouping: candidates,
                by: { $0.kind.rawValue }
            ).mapValues(\.count),
            resourceSetupMilliseconds:
                resourceSetupMilliseconds,
            candidateLoadMilliseconds:
                candidateLoadMilliseconds,
            forecastCalculationMilliseconds:
                forecastCalculationMilliseconds,
            totalMilliseconds: totalMilliseconds,
            baselinePeakResidentBytes:
                baselinePeakResidentBytes,
            peakResidentBytes:
                finalPeakResidentBytes,
            peakResidentDeltaBytes:
                finalPeakResidentBytes
                >= baselinePeakResidentBytes
                ? finalPeakResidentBytes
                    - baselinePeakResidentBytes
                : 0,
            manifestRawBytes:
                candidateManifest.count
                + ephemerisManifest.count
                + eopManifest.count,
            assets: EventBenchmarkAssets(
                candidateChunks:
                    candidateChunks,
                de442sChunks: de442sChunks,
                eopChunks: eopChunks
            )
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let encoded = try encoder.encode(metrics)
        print(
            "EVENT_FORECAST_BENCHMARK_SWIFT "
                + String(
                    decoding: encoded,
                    as: UTF8.self
                )
        )
    }

    func testAnnualTokyoForecastWarmAssetNavigation()
        async throws
    {
        let environment =
            ProcessInfo.processInfo.environment
        guard let rawYear =
            environment[
                "PLANETARIUM_EVENT_BENCHMARK_YEAR"
            ],
            let year = Int(rawYear)
        else {
            throw XCTSkip(
                "Set PLANETARIUM_EVENT_BENCHMARK_YEAR to run the opt-in benchmark."
            )
        }
        guard (1900...2100).contains(year) else {
            return XCTFail(
                "Benchmark year must be from 1900 through 2100."
            )
        }

        let adjacentYear =
            year == 2100 ? year - 1 : year + 1
        let tracker = EventBenchmarkAssetTracker()
        let candidateManifest =
            try SharedResources.eventCandidateData(
                for: .manifest
            )
        tracker.record(
            file:
                "shared/events/event-candidates-manifest.v1.json",
            bytes: candidateManifest.count
        )
        let ephemerisManifest =
            try SharedResources.de442sEphemerisData(
                for: .manifest
            )
        tracker.record(
            file:
                "shared/ephemeris/de442s/de442s-manifest.v1.json",
            bytes: ephemerisManifest.count
        )
        let eopManifest =
            try SharedResources
            .iersEarthOrientationData(
                for: .manifest
            )
        tracker.record(
            file:
                "shared/eop/iers-finals2000a-eop.v1.json",
            bytes: eopManifest.count
        )
        let catalog = try EclipseCandidateCatalogV1(
            manifestData: candidateManifest,
            chunkDataLoader: { fileName in
                let data =
                    try SharedResources
                    .eventCandidateChunkData(
                        named: fileName
                    )
                tracker.record(
                    file:
                        "shared/events/chunks/\(fileName)",
                    bytes: data.count
                )
                return data
            }
        )
        let ephemeris =
            try DE442SEphemerisProviderV1(
                manifestData: ephemerisManifest,
                chunkDataLoader: { fileName in
                    let data =
                        try SharedResources
                        .de442sEphemerisChunkData(
                            named: fileName
                        )
                    tracker.record(
                        file:
                            "shared/ephemeris/de442s/chunks/\(fileName)",
                        bytes: data.count
                    )
                    return data
                }
            )
        let earthOrientation =
            try IERSEarthOrientationServiceV1(
                manifestData: eopManifest,
                loadChunkData: { descriptor in
                    let data =
                        try SharedResources
                        .iersEarthOrientationChunkData(
                            startMjdUtc:
                                descriptor.startMjdUtc
                        )
                    tracker.record(
                        file: descriptor.file,
                        bytes: data.count
                    )
                    return data
                }
            )

        func loadYearAssets(
            _ requestedYear: Int
        ) async throws -> (
            candidateCount: Int,
            elapsedMilliseconds: Double
        ) {
            let startedAt =
                DispatchTime.now().uptimeNanoseconds
            let interval =
                try utcInterval(year: requestedYear)
            let candidates =
                try await catalog.candidates(
                    from: interval.start,
                    through: interval.end
                )
            for candidate in candidates {
                _ = try await ephemeris.state(
                    tdbJulianDate:
                        candidate
                        .maximumJulianDateTDB
                )
                _ = try earthOrientation.lookup(
                    at: candidate.canonicalEpochUTC
                )
            }
            return (
                candidates.count,
                elapsedMilliseconds(since: startedAt)
            )
        }

        let firstA = try await loadYearAssets(year)
        let adjacent =
            try await loadYearAssets(adjacentYear)
        let readsBeforeReturn =
            tracker.totalReadCount()
        let secondA = try await loadYearAssets(year)
        let readsAfterReturn =
            tracker.totalReadCount()

        XCTAssertEqual(
            secondA.candidateCount,
            firstA.candidateCount
        )
        XCTAssertEqual(
            readsAfterReturn,
            readsBeforeReturn,
            "A→B→Aで直近chunkを再読込しない"
        )

        let metrics: [String: Any] = [
            "benchmark":
                "annual-event-warm-asset-navigation",
            "runtime": "macos-swift",
            "sequence": [year, adjacentYear, year],
            "firstAMilliseconds":
                firstA.elapsedMilliseconds,
            "adjacentMilliseconds":
                adjacent.elapsedMilliseconds,
            "secondAMilliseconds":
                secondA.elapsedMilliseconds,
            "firstACandidates":
                firstA.candidateCount,
            "adjacentCandidates":
                adjacent.candidateCount,
            "secondACandidates":
                secondA.candidateCount,
            "returnAssetReadDelta":
                readsAfterReturn
                - readsBeforeReturn,
        ]
        let encoded = try JSONSerialization.data(
            withJSONObject: metrics,
            options: [.sortedKeys]
        )
        print(
            "EVENT_FORECAST_WARM_ASSET_BENCHMARK_SWIFT "
                + String(
                    decoding: encoded,
                    as: UTF8.self
                )
        )
    }

    private var tokyo: ObservingLocation {
        ObservingLocation(
            id: "tokyo",
            name: "東京",
            latitude: 35.681_236,
            longitude: 139.767_125,
            timeZoneIdentifier: "Asia/Tokyo"
        )
    }

    private func eventOptions(
        candidate: EclipseCandidateV1,
        service: IERSEarthOrientationServiceV1
    ) throws -> LocalEclipseOptionsV1 {
        let estimate = try service.lookup(
            at: candidate.canonicalEpochUTC
        )
        let fallback = estimate == nil
            ? try EventEarthRotationModelV1.fallback(
                at: candidate.canonicalEpochUTC
            )
            : nil
        let earthOrientationAt:
            @Sendable (Date) throws
                -> EarthOrientationOptionsV2 =
            { date in
                if let estimate =
                    try service.lookup(at: date)
                {
                    return estimate
                        .earthOrientationOptionsV2
                }
                return try EventEarthRotationModelV1
                    .fallback(at: date)
                    .earthOrientation
            }
        return LocalEclipseOptionsV1(
            deltaTModel:
                fallback?.deltaTModel
                ?? "IERS-EOP-and-bundled-leap-second-history",
            earthOrientation:
                fallback?.earthOrientation
                ?? estimate?.earthOrientationOptionsV2
                ?? EarthOrientationOptionsV2(),
            earthOrientationAt:
                earthOrientationAt,
            eopID:
                fallback?.eopID
                ?? "bundled-IERS-EOP",
            eopSourceSHA256:
                estimate == nil
                ? nil
                : service.source.sourceSha256,
            eopRetrievedAt:
                estimate == nil
                ? nil
                : service.source.retrievedAt,
            eopDUT1Quality:
                eventQuality(
                    estimate?.dut1.source
                ),
            eopPolarMotionQuality:
                eventQuality(
                    estimate?
                        .polarMotion.source
                ),
            earthRotationPathUncertaintyKilometers:
                fallback?
                    .pathUncertaintyKilometers,
            heightMeters: 0,
            horizontalAccuracyMeters: nil,
            locationSource: .bundledCity,
            timingUncertaintySeconds:
                fallback.map {
                    $0.deltaTUncertaintySeconds
                    + (
                        candidate.kind == .lunarEclipse
                        ? 10
                        : 0
                    )
                },
            timeScaleContributors:
                fallback?.dominantContributors
                ?? [],
            timeScaleWarnings:
                fallback?.warnings
                ?? []
        )
    }

    private func eventQuality(
        _ source:
            IERSDUT1EstimateSourceV1?
    ) -> EventEOPQualityV1 {
        switch source {
        case .observed:
            .observed
        case .predicted:
            .predicted
        case nil:
            .outsideCoverage
        }
    }

    private func eventQuality(
        _ source:
            IERSEarthOrientationEstimateSourceV1?
    ) -> EventEOPQualityV1 {
        switch source {
        case .observed:
            .observed
        case .predicted:
            .predicted
        case nil:
            .outsideCoverage
        }
    }

    private func utcInterval(
        year: Int
    ) throws -> DateInterval {
        var calendar =
            Calendar(identifier: .gregorian)
        calendar.timeZone =
            TimeZone(secondsFromGMT: 0)!
        guard
            let start = calendar.date(
                from: DateComponents(
                    timeZone:
                        TimeZone(secondsFromGMT: 0),
                    year: year,
                    month: 1,
                    day: 1
                )
            ),
            let nextYear = calendar.date(
                byAdding: .year,
                value: 1,
                to: start
            )
        else {
            throw EventBenchmarkError.invalidYear
        }
        return DateInterval(
            start: start,
            end:
                nextYear
                .addingTimeInterval(-0.001)
        )
    }

    private func assetMetrics(
        tracker: EventBenchmarkAssetTracker,
        prefix: String,
        manifest: Data
    ) throws -> EventBenchmarkAssetMetrics {
        let snapshot = tracker.files(
            withPrefix: prefix
        )
        let loadedFiles = Set(snapshot.map(\.file))
        let object =
            try JSONSerialization.jsonObject(
                with: manifest
            )
        guard
            let document =
                object as? [String: Any],
            let chunks =
                document["chunks"]
                as? [[String: Any]]
        else {
            throw EventBenchmarkError.invalidManifest
        }
        let gzipBytes = chunks.reduce(0) {
            partial, descriptor in
            guard let file =
                descriptor["file"] as? String,
                loadedFiles.contains(file)
            else {
                return partial
            }
            return partial
                + (
                    descriptor[
                        "gzipByteLength"
                    ] as? Int
                    ?? descriptor[
                        "gzipBytes"
                    ] as? Int
                    ?? 0
                )
        }
        return EventBenchmarkAssetMetrics(
            files: snapshot.map(\.file),
            chunkCount: snapshot.count,
            readCount: snapshot.reduce(0) {
                $0 + $1.readCount
            },
            rawBytes: snapshot.reduce(0) {
                $0 + $1.bytes
            },
            gzipBytes: gzipBytes
        )
    }

    private func elapsedMilliseconds(
        since startedAt: UInt64
    ) -> Double {
        Double(
            DispatchTime.now().uptimeNanoseconds
                - startedAt
        ) / 1_000_000
    }

    private func peakResidentBytes() -> UInt64 {
        var usage = rusage()
        guard getrusage(RUSAGE_SELF, &usage) == 0,
              usage.ru_maxrss >= 0
        else {
            return 0
        }
        return UInt64(usage.ru_maxrss)
    }
}

private final class EventBenchmarkAssetTracker:
    @unchecked Sendable
{
    struct Entry {
        let file: String
        let bytes: Int
        let readCount: Int
    }

    private let lock = NSLock()
    private var entries:
        [String: (bytes: Int, readCount: Int)] = [:]

    func record(
        file: String,
        bytes: Int
    ) {
        lock.lock()
        let previous = entries[file]
        entries[file] = (
            bytes: bytes,
            readCount:
                (previous?.readCount ?? 0) + 1
        )
        lock.unlock()
    }

    func files(
        withPrefix prefix: String
    ) -> [Entry] {
        lock.lock()
        let snapshot = entries
            .filter {
                $0.key.hasPrefix(prefix)
            }
            .map {
                Entry(
                    file: $0.key,
                    bytes: $0.value.bytes,
                    readCount:
                        $0.value.readCount
                )
            }
            .sorted {
                $0.file < $1.file
            }
        lock.unlock()
        return snapshot
    }

    func totalReadCount() -> Int {
        lock.lock()
        let result = entries.values.reduce(0) {
            $0 + $1.readCount
        }
        lock.unlock()
        return result
    }
}

private struct EventBenchmarkAssetMetrics:
    Codable
{
    let files: [String]
    let chunkCount: Int
    let readCount: Int
    let rawBytes: Int
    let gzipBytes: Int
}

private struct EventBenchmarkAssets: Codable {
    let candidateChunks:
        EventBenchmarkAssetMetrics
    let de442sChunks:
        EventBenchmarkAssetMetrics
    let eopChunks:
        EventBenchmarkAssetMetrics
}

private struct EventBenchmarkMetrics: Codable {
    let benchmark: String
    let runtime: String
    let year: Int
    let location: String
    let candidates: Int
    let calculatedForecasts: Int
    let candidateKinds: [String: Int]
    let resourceSetupMilliseconds: Double
    let candidateLoadMilliseconds: Double
    let forecastCalculationMilliseconds: Double
    let totalMilliseconds: Double
    let baselinePeakResidentBytes: UInt64
    let peakResidentBytes: UInt64
    let peakResidentDeltaBytes: UInt64
    let manifestRawBytes: Int
    let assets: EventBenchmarkAssets
}

private enum EventBenchmarkError: Error {
    case invalidYear
    case invalidManifest
}
