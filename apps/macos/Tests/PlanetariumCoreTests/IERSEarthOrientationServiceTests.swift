import Foundation
import XCTest

import PlanetariumShared
@testable import PlanetariumCore

final class IERSEarthOrientationServiceTests:
    XCTestCase
{
    func testStrictDecoderKeepsIndependentQualityStreams()
        throws
    {
        let data = try encodedChunkData(
            startMjdUtc: 60_000,
            polarStatuses:
                [.observed, .predicted, .predicted, .predicted],
            dut1Statuses:
                [.observed, .observed, .predicted, .predicted]
        )
        let records =
            try IERSEarthOrientationDecoderV1
                .decodeChunk(from: data)

        XCTAssertEqual(records.count, 4)
        XCTAssertEqual(
            records.map(\.polarMotionStatus),
            [.observed, .predicted, .predicted, .predicted]
        )
        XCTAssertEqual(
            records.map(\.dut1Status),
            [.observed, .observed, .predicted, .predicted]
        )
        XCTAssertEqual(
            records.map(\.xpMicroarcseconds),
            [10_000, 10_100, 10_800, 12_700]
        )
        XCTAssertEqual(
            records.map(\.ypMicroarcseconds),
            [-20_000, -19_800, -19_200, -18_200]
        )

        var malformed = try jsonObject(data)
        malformed["unexpected"] = true
        XCTAssertThrowsError(
            try IERSEarthOrientationDecoderV1
                .decodeChunk(
                    from: try JSONSerialization.data(
                        withJSONObject: malformed
                    )
                )
        )

        malformed = try jsonObject(data)
        malformed["polarMotionQualityRanges"] = [
            [1, 4, "I"],
        ]
        XCTAssertThrowsError(
            try IERSEarthOrientationDecoderV1
                .decodeChunk(
                    from: try JSONSerialization.data(
                        withJSONObject: malformed
                    )
                )
        )

        malformed = try jsonObject(data)
        malformed["xpMicroarcsecondsDelta"] = [
            Int.max,
            1,
            0,
            0,
        ]
        XCTAssertThrowsError(
            try IERSEarthOrientationDecoderV1
                .decodeChunk(
                    from: try JSONSerialization.data(
                        withJSONObject: malformed
                    )
                )
        )
    }

    func testFourPointLagrangeAndIndependentProvenance()
        throws
    {
        let records = try IERSEarthOrientationDecoderV1
            .decodeChunk(
                from: encodedChunkData(
                    startMjdUtc: 60_000,
                    polarStatuses:
                        [.observed, .observed, .predicted, .predicted],
                    dut1Statuses:
                        [.observed, .observed, .observed, .observed]
                )
            )
        let lookup = try IERSEarthOrientationLookupV1(
            records: records
        )
        let exact = try XCTUnwrap(
            lookup.lookup(at: dateFromMjd(60_001))
        )
        XCTAssertEqual(
            exact.dut1.dut1Seconds,
            0.101,
            accuracy: 1e-15
        )
        XCTAssertEqual(exact.dut1.source, .observed)
        XCTAssertEqual(
            exact.polarMotion.source,
            .observed
        )

        let estimate = try XCTUnwrap(
            lookup.lookup(at: dateFromMjd(60_001.5))
        )
        XCTAssertEqual(
            estimate.polarMotion.xpRadians,
            radians(microarcseconds: 10_337.5),
            accuracy: 1e-22
        )
        XCTAssertEqual(
            estimate.polarMotion.ypRadians,
            radians(microarcseconds: -19_550),
            accuracy: 1e-22
        )
        XCTAssertEqual(
            estimate.polarMotion
                .xpReportedErrorRadians,
            radians(microarcseconds: 125),
            accuracy: 1e-22
        )
        XCTAssertEqual(
            estimate.polarMotion
                .ypReportedErrorRadians,
            radians(microarcseconds: 250),
            accuracy: 1e-22
        )
        XCTAssertEqual(
            estimate.polarMotion.source,
            .predicted
        )
        XCTAssertTrue(
            estimate.polarMotion.usesPrediction
        )
        XCTAssertEqual(estimate.dut1.source, .observed)
    }

    func testDUT1LeapBoundaryIsNotSmeared() throws {
        let records = [
            record(
                57_752,
                dut1Microseconds: -406_800,
                dut1ErrorMicroseconds: 20
            ),
            record(
                57_753,
                dut1Microseconds: -407_760,
                dut1ErrorMicroseconds: 20
            ),
            record(
                57_754,
                dut1Microseconds: 591_282,
                dut1ErrorMicroseconds: 30
            ),
            record(
                57_755,
                dut1Microseconds: 590_000,
                dut1ErrorMicroseconds: 30
            ),
        ]
        let lookup = try IERSEarthOrientationLookupV1(
            records: records
        )
        XCTAssertEqual(
            try XCTUnwrap(
                lookup.lookup(
                    at: dateFromMjd(57_753.5)
                )
            ).dut1.dut1Seconds,
            -0.408_239,
            accuracy: 1e-12
        )
        XCTAssertEqual(
            try XCTUnwrap(
                lookup.lookup(at: dateFromMjd(57_754))
            ).dut1.dut1Seconds,
            0.591_282,
            accuracy: 1e-15
        )
    }

    func testBundledOfficialValuesBoundariesAndFallback()
        throws
    {
        let service =
            try IERSEarthOrientationServiceV1
                .loadBundled()
        let coverage = service.coverage
        XCTAssertEqual(
            coverage.firstSampleMjdUtc,
            41_684
        )
        XCTAssertEqual(
            coverage.lastSampleMjdUtc,
            61_624
        )
        XCTAssertEqual(coverage.recordCount, 19_941)
        XCTAssertEqual(
            coverage.polarMotion
                .iersThroughMjdUtc,
            61_251
        )
        XCTAssertEqual(
            coverage.polarMotion
                .predictionStartsMjdUtc,
            61_252
        )
        XCTAssertEqual(
            coverage.dut1.iersThroughMjdUtc,
            61_251
        )
        XCTAssertEqual(
            coverage.dut1.predictionStartsMjdUtc,
            61_252
        )
        XCTAssertEqual(
            coverage.dut1
                .leapSecondBoundaryCount,
            25
        )

        let first = try XCTUnwrap(
            service.lookup(
                at: dateFromMjd(
                    Double(coverage.firstSampleMjdUtc)
                )
            )
        )
        XCTAssertEqual(
            first.dut1.dut1Seconds,
            0.808_418,
            accuracy: 1e-15
        )
        XCTAssertEqual(
            first.dut1.uncertaintySeconds,
            0.000_271,
            accuracy: 1e-15
        )
        XCTAssertEqual(
            first.polarMotion.xpRadians,
            radians(microarcseconds: 120_733),
            accuracy: 1e-20
        )
        XCTAssertEqual(
            first.polarMotion.ypRadians,
            radians(microarcseconds: 136_966),
            accuracy: 1e-20
        )
        XCTAssertEqual(
            first.polarMotion
                .xpReportedErrorRadians,
            radians(microarcseconds: 9_786),
            accuracy: 1e-20
        )
        XCTAssertEqual(
            first.polarMotion
                .ypReportedErrorRadians,
            radians(microarcseconds: 15_902),
            accuracy: 1e-20
        )

        let boundary = try XCTUnwrap(
            service.lookup(
                at: dateFromMjd(
                    Double(
                        coverage.dut1.iersThroughMjdUtc
                    ) + 0.5
                )
            )
        )
        XCTAssertEqual(
            boundary.dut1.dut1Seconds,
            0.012_951_5,
            accuracy: 1e-12
        )
        XCTAssertEqual(
            boundary.dut1.uncertaintySeconds,
            0.000_108,
            accuracy: 1e-15
        )
        XCTAssertEqual(boundary.dut1.source, .predicted)
        XCTAssertEqual(
            boundary.polarMotion.xpRadians,
            radians(microarcseconds: 219_758.625),
            accuracy: 1e-20
        )
        XCTAssertEqual(
            boundary.polarMotion.ypRadians,
            radians(microarcseconds: 365_522.625),
            accuracy: 1e-20
        )
        XCTAssertEqual(
            boundary.polarMotion
                .xpReportedErrorRadians,
            radians(microarcseconds: 478.25),
            accuracy: 1e-20
        )
        XCTAssertEqual(
            boundary.polarMotion
                .ypReportedErrorRadians,
            radians(microarcseconds: 349.0625),
            accuracy: 1e-20
        )
        XCTAssertEqual(
            boundary.polarMotion.source,
            .predicted
        )

        XCTAssertNotNil(
            try service.lookup(
                at: dateFromMjd(
                    Double(coverage.lastSampleMjdUtc)
                )
            )
        )
        XCTAssertNil(
            try service.lookup(
                at: dateFromMjd(
                    Double(coverage.lastSampleMjdUtc)
                        + 0.001
                )
            )
        )
        let fallback =
            try service.earthOrientationOptionsV2(
                at: dateFromMjd(41_683)
            )
        XCTAssertNil(fallback.dut1Seconds)
        XCTAssertEqual(
            fallback.polarMotion?.source,
            .assumedZero
        )
        XCTAssertEqual(
            fallback.polarMotion?.xpRadians,
            0
        )
        XCTAssertEqual(
            fallback.polarMotion?.ypRadians,
            0
        )
    }

    func testManifestIsStrictAndChunksAreLazyCachedAndRetryable()
        throws
    {
        let manifestData =
            try SharedResources.iersEarthOrientationData(
                for: .manifest
            )
        let state = LoaderState()
        let service =
            try IERSEarthOrientationServiceV1(
                manifestData: manifestData,
                loadChunkData: { descriptor in
                    try state.load(descriptor)
                }
            )
        XCTAssertEqual(state.callCount, 0)

        XCTAssertNotNil(
            try service.lookup(at: dateFromMjd(41_684))
        )
        XCTAssertEqual(state.callCount, 1)
        XCTAssertNotNil(
            try service.lookup(at: dateFromMjd(41_684.25))
        )
        XCTAssertEqual(state.callCount, 1)
        XCTAssertNotNil(
            try service.lookup(at: dateFromMjd(45_779.5))
        )
        XCTAssertEqual(state.callCount, 2)

        let concurrentState = LoaderState()
        let concurrentService =
            try IERSEarthOrientationServiceV1(
                manifestData: manifestData,
                loadChunkData: { descriptor in
                    try concurrentState.load(descriptor)
                }
            )
        let failures = FailureCollector()
        let concurrentDate = dateFromMjd(41_684)
        DispatchQueue.concurrentPerform(
            iterations: 16
        ) { _ in
            do {
                let estimate =
                    try concurrentService.lookup(
                        at: concurrentDate
                    )
                if estimate == nil {
                    failures.append("nil")
                }
            } catch {
                failures.append(
                    error.localizedDescription
                )
            }
        }
        XCTAssertTrue(failures.values.isEmpty)
        XCTAssertEqual(concurrentState.callCount, 1)

        let retryState = LoaderState(failFirst: true)
        let retryService =
            try IERSEarthOrientationServiceV1(
                manifestData: manifestData,
                loadChunkData: { descriptor in
                    try retryState.load(descriptor)
                }
            )
        XCTAssertThrowsError(
            try retryService.lookup(
                at: dateFromMjd(41_684)
            )
        )
        XCTAssertEqual(retryState.callCount, 1)
        XCTAssertNotNil(
            try retryService.lookup(
                at: dateFromMjd(41_684)
            )
        )
        XCTAssertEqual(retryState.callCount, 2)
        XCTAssertNotNil(
            try retryService.lookup(
                at: dateFromMjd(41_685)
            )
        )
        XCTAssertEqual(retryState.callCount, 2)

        var malformed = try jsonObject(manifestData)
        var source = try XCTUnwrap(
            malformed["source"] as? [String: Any]
        )
        source["unexpected"] = true
        malformed["source"] = source
        XCTAssertThrowsError(
            try IERSEarthOrientationServiceV1(
                manifestData:
                    try JSONSerialization.data(
                        withJSONObject: malformed
                    ),
                loadChunkData: { _ in Data() }
            )
        )

        malformed = try jsonObject(manifestData)
        var encoding = try XCTUnwrap(
            malformed["encoding"] as? [String: Any]
        )
        encoding["numeric"] = "some other delta contract"
        malformed["encoding"] = encoding
        XCTAssertThrowsError(
            try IERSEarthOrientationServiceV1(
                manifestData:
                    try JSONSerialization.data(
                        withJSONObject: malformed
                    ),
                loadChunkData: { _ in Data() }
            )
        )
    }

    func testManifestAcceptsCanonicalSixthChunk()
        throws
    {
        let manifestData =
            try SharedResources.iersEarthOrientationData(
                for: .manifest
            )
        var manifest = try jsonObject(manifestData)
        var chunks = try XCTUnwrap(
            manifest["chunks"] as? [[String: Any]]
        )
        var fifth = try XCTUnwrap(chunks.popLast())
        let fifthStartMjdUtc = try XCTUnwrap(
            fifth["startMjdUtc"] as? Int
        )
        let fifthPolarMotionIersCount = try XCTUnwrap(
            fifth["polarMotionIersCount"] as? Int
        )
        let fifthDut1IersCount = try XCTUnwrap(
            fifth["dut1IersCount"] as? Int
        )
        let fullChunkRecordCount = 4_096
        let sixthStartMjdUtc =
            fifthStartMjdUtc + fullChunkRecordCount
        fifth["endMjdUtc"] = sixthStartMjdUtc - 1
        fifth["recordCount"] = fullChunkRecordCount
        fifth["polarMotionPredictedCount"] =
            fullChunkRecordCount
            - fifthPolarMotionIersCount
        fifth["dut1PredictedCount"] =
            fullChunkRecordCount - fifthDut1IersCount
        chunks.append(fifth)
        chunks.append([
            "file":
                "shared/eop/eop/\(sixthStartMjdUtc).v1.json",
            "startMjdUtc": sixthStartMjdUtc,
            "endMjdUtc": sixthStartMjdUtc,
            "recordCount": 1,
            "polarMotionIersCount": 0,
            "polarMotionPredictedCount": 1,
            "dut1IersCount": 0,
            "dut1PredictedCount": 1,
            "rawBytes": 100,
            "gzipBytes": 50,
            "sha256": String(repeating: "0", count: 64),
        ])
        manifest["chunks"] = chunks

        var coverage = try XCTUnwrap(
            manifest["coverage"] as? [String: Any]
        )
        let originalRecordCount = try XCTUnwrap(
            coverage["recordCount"] as? Int
        )
        let originalSourceRowCount = try XCTUnwrap(
            coverage["sourceRowCount"] as? Int
        )
        let expandedRecordCount = chunks.compactMap {
            $0["recordCount"] as? Int
        }.reduce(0, +)
        XCTAssertEqual(chunks.count, 6)
        coverage["lastSampleMjdUtc"] = sixthStartMjdUtc
        coverage["recordCount"] = expandedRecordCount
        coverage["sourceRowCount"] =
            expandedRecordCount
            + originalSourceRowCount - originalRecordCount
        var polar = try XCTUnwrap(
            coverage["polarMotion"] as? [String: Any]
        )
        polar["predictedCount"] = chunks.compactMap {
            $0["polarMotionPredictedCount"] as? Int
        }.reduce(0, +)
        coverage["polarMotion"] = polar
        var dut1 = try XCTUnwrap(
            coverage["dut1"] as? [String: Any]
        )
        dut1["predictedCount"] = chunks.compactMap {
            $0["dut1PredictedCount"] as? Int
        }.reduce(0, +)
        coverage["dut1"] = dut1
        manifest["coverage"] = coverage

        let service = try IERSEarthOrientationServiceV1(
            manifestData: try JSONSerialization.data(
                withJSONObject: manifest
            ),
            loadChunkData: { _ in Data() }
        )
        XCTAssertEqual(
            service.coverage.lastSampleMjdUtc,
            sixthStartMjdUtc
        )
        XCTAssertEqual(
            service.coverage.recordCount,
            expandedRecordCount
        )
    }

    func testBundleContainsIntegratedEOPWithoutLegacyDuplicate()
        throws
    {
        let manifestURL =
            try SharedResources.iersEarthOrientationURL(
                for: .manifest
            )
        let manifest = try jsonObject(
            Data(contentsOf: manifestURL)
        )
        let descriptors = try XCTUnwrap(
            manifest["chunks"] as? [[String: Any]]
        )
        let chunkURLs = try descriptors.map { descriptor in
            try SharedResources
                .iersEarthOrientationChunkURL(
                    startMjdUtc: try XCTUnwrap(
                        descriptor["startMjdUtc"] as? Int
                    )
                )
        }
        let urls = [manifestURL] + chunkURLs
        let expectedNames = Set(
            ["iers-finals2000a-eop.v1.json"]
                + descriptors.compactMap {
                    ($0["file"] as? String)?
                        .split(separator: "/")
                        .last
                        .map(String.init)
                }
        )
        XCTAssertEqual(
            Set(urls.map(\.lastPathComponent)),
            expectedNames
        )
        let bundleRoot = try XCTUnwrap(
            urls.first?.deletingLastPathComponent()
        )
        let enumerator = try XCTUnwrap(
            FileManager.default.enumerator(
                at: bundleRoot,
                includingPropertiesForKeys: nil
            )
        )
        var bundledNames = Set<String>()
        for case let url as URL in enumerator {
            bundledNames.insert(url.lastPathComponent)
        }
        for excluded in [
            "iers-finals2000a-dut1.v1.json",
            "iers-finals2000a-eop.lock.v1.json",
            "iers-finals2000a-dut1.lock.v1.json",
            "finals2000A.all",
            "finals2000A.snapshot.v1.json",
            "readme.finals2000A",
            "checksums.sha512",
        ] {
            XCTAssertFalse(
                bundledNames.contains(excluded),
                excluded
            )
        }
    }

    private func record(
        _ mjdUtc: Int,
        dut1Microseconds: Int,
        dut1ErrorMicroseconds: Int
    ) -> IERSEarthOrientationDailyRecordV1 {
        IERSEarthOrientationDailyRecordV1(
            mjdUtc: mjdUtc,
            polarMotionStatus: .observed,
            xpMicroarcseconds: 0,
            xpReportedErrorMicroarcseconds: 10,
            ypMicroarcseconds: 0,
            ypReportedErrorMicroarcseconds: 10,
            dut1Status: .observed,
            dut1Microseconds: dut1Microseconds,
            dut1ReportedErrorMicroseconds:
                dut1ErrorMicroseconds
        )
    }

    private func dateFromMjd(_ mjdUtc: Double) -> Date {
        Date(
            timeIntervalSince1970:
                (mjdUtc - 40_587) * 86_400
        )
    }

    private func radians(
        microarcseconds: Double
    ) -> Double {
        microarcseconds
            * Double.pi
            / (180 * 3_600 * 1_000_000)
    }

    private func jsonObject(
        _ data: Data
    ) throws -> [String: Any] {
        try XCTUnwrap(
            JSONSerialization.jsonObject(with: data)
                as? [String: Any]
        )
    }

    private func encodedChunkData(
        startMjdUtc: Int,
        polarStatuses:
            [IERSEarthOrientationRecordStatusV1],
        dut1Statuses:
            [IERSEarthOrientationRecordStatusV1]? = nil
    ) throws -> Data {
        let dut1Statuses = dut1Statuses
            ?? polarStatuses
        let count = polarStatuses.count
        XCTAssertEqual(count, dut1Statuses.count)
        let offsets = Array(0..<count)
        let xp = offsets.map {
            10_000 + $0 * $0 * $0 * 100
        }
        let yp = offsets.map {
            -20_000 + $0 * $0 * 200
        }
        return try JSONSerialization.data(
            withJSONObject: [
                "schemaVersion": 1,
                "startMjdUtc": startMjdUtc,
                "recordCount": count,
                "dut1QualityRanges":
                    qualityRanges(dut1Statuses),
                "polarMotionQualityRanges":
                    qualityRanges(polarStatuses),
                "dut1MicrosecondsDelta":
                    deltas(
                        offsets.map {
                            100_000 + $0 * 1_000
                        }
                    ),
                "dut1ReportedErrorMicrosecondsDelta":
                    deltas(
                        Array(repeating: 20, count: count)
                    ),
                "xpMicroarcsecondsDelta": deltas(xp),
                "xpReportedErrorMicroarcsecondsDelta":
                    deltas(
                        Array(repeating: 100, count: count)
                    ),
                "ypMicroarcsecondsDelta": deltas(yp),
                "ypReportedErrorMicroarcsecondsDelta":
                    deltas(
                        Array(repeating: 200, count: count)
                    ),
            ]
        )
    }

    private func qualityRanges(
        _ statuses:
            [IERSEarthOrientationRecordStatusV1]
    ) -> [[Any]] {
        var ranges: [[Any]] = []
        var start = 0
        for index in 1...statuses.count {
            if index == statuses.count
                || statuses[index] != statuses[start]
            {
                ranges.append([
                    start,
                    index,
                    statuses[start].rawValue,
                ])
                start = index
            }
        }
        return ranges
    }

    private func deltas(_ values: [Int]) -> [Int] {
        values.enumerated().map { index, value in
            index == 0
                ? value
                : value - values[index - 1]
        }
    }
}

private final class LoaderState: @unchecked Sendable {
    private let lock = NSLock()
    private var calls = 0
    private var shouldFail: Bool

    init(failFirst: Bool = false) {
        shouldFail = failFirst
    }

    var callCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return calls
    }

    func load(
        _ descriptor:
            IERSEarthOrientationChunkDescriptorV1
    ) throws -> Data {
        lock.lock()
        calls += 1
        let fail = shouldFail
        shouldFail = false
        lock.unlock()
        if fail {
            throw IERSEarthOrientationError
                .resourceUnavailable("synthetic failure")
        }
        return try SharedResources
            .iersEarthOrientationChunkData(
                startMjdUtc: descriptor.startMjdUtc
            )
    }
}

private final class FailureCollector:
    @unchecked Sendable
{
    private let lock = NSLock()
    private var storage: [String] = []

    func append(_ value: String) {
        lock.lock()
        storage.append(value)
        lock.unlock()
    }

    var values: [String] {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }
}
