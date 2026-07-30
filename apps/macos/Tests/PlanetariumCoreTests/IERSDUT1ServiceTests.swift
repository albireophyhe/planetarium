import Foundation
import XCTest

import PlanetariumShared
@testable import PlanetariumCore

final class IERSDUT1ServiceTests: XCTestCase {
    func testStrictDecoderReconstructsDeltaAndQualityRanges() throws {
        let data = try chunkData(
            startMjdUtc: 60_000,
            statuses: [.observed, .observed, .predicted],
            dut1: [10_000, 11_000, 12_000],
            uncertainty: [15, 20, 100]
        )
        let records = try IERSDUT1DecoderV1.decodeChunk(
            from: data
        )

        XCTAssertEqual(
            records,
            [
                IERSDUT1DailyRecordV1(
                    mjdUtc: 60_000,
                    status: .observed,
                    dut1Microseconds: 10_000,
                    uncertaintyMicroseconds: 15
                ),
                IERSDUT1DailyRecordV1(
                    mjdUtc: 60_001,
                    status: .observed,
                    dut1Microseconds: 11_000,
                    uncertaintyMicroseconds: 20
                ),
                IERSDUT1DailyRecordV1(
                    mjdUtc: 60_002,
                    status: .predicted,
                    dut1Microseconds: 12_000,
                    uncertaintyMicroseconds: 100
                ),
            ]
        )

        var malformed = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data)
                as? [String: Any]
        )
        malformed["qualityRanges"] = [[1, 1, "I"]]
        XCTAssertThrowsError(
            try IERSDUT1DecoderV1.decodeChunk(
                from: try JSONSerialization.data(
                    withJSONObject: malformed
                )
            )
        )

        malformed = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data)
                as? [String: Any]
        )
        malformed["unexpected"] = true
        XCTAssertThrowsError(
            try IERSDUT1DecoderV1.decodeChunk(
                from: try JSONSerialization.data(
                    withJSONObject: malformed
                )
            )
        )
    }

    func testLookupMatchesInterpolationAndLeapBoundaryContract()
        throws
    {
        let observed = try IERSDUT1LookupV1(
            records: [
                record(60_000, .observed, 100_000, 10),
                record(60_001, .observed, 104_000, 30),
            ]
        )
        XCTAssertEqual(
            try XCTUnwrap(
                observed.lookup(at: dateFromMjd(60_000))
            ).dut1Seconds,
            0.1,
            accuracy: 1e-15
        )
        let quarter = try XCTUnwrap(
            observed.lookup(at: dateFromMjd(60_000.25))
        )
        XCTAssertEqual(quarter.dut1Seconds, 0.101, accuracy: 1e-12)
        XCTAssertEqual(quarter.source, .observed)
        XCTAssertEqual(
            quarter.uncertaintySeconds,
            0.000_03,
            accuracy: 1e-15
        )

        let positiveLeap = try IERSDUT1LookupV1(
            records: [
                record(57_753, .observed, -407_760, 20),
                record(57_754, .observed, 591_282, 30),
            ]
        )
        XCTAssertEqual(
            try XCTUnwrap(
                positiveLeap.lookup(
                    at: dateFromMjd(57_753.5)
                )
            ).dut1Seconds,
            -0.408_239,
            accuracy: 1e-12
        )
        XCTAssertEqual(
            try XCTUnwrap(
                positiveLeap.lookup(
                    at: dateFromMjd(57_754)
                        .addingTimeInterval(-0.001)
                )
            ).dut1Seconds,
            -0.408_718,
            accuracy: 1e-8
        )
        XCTAssertEqual(
            try XCTUnwrap(
                positiveLeap.lookup(
                    at: dateFromMjd(57_754)
                )
            ).dut1Seconds,
            0.591_282,
            accuracy: 1e-15
        )

        let hypotheticalNegativeLeap = try IERSDUT1LookupV1(
            records: [
                record(60_000, .observed, 400_000, 10),
                record(60_001, .observed, -599_000, 20),
            ]
        )
        XCTAssertEqual(
            try XCTUnwrap(
                hypotheticalNegativeLeap.lookup(
                    at: dateFromMjd(60_000.5)
                )
            ).dut1Seconds,
            0.400_5,
            accuracy: 1e-12
        )
        XCTAssertEqual(
            try XCTUnwrap(
                hypotheticalNegativeLeap.lookup(
                    at: dateFromMjd(60_001)
                )
            ).dut1Seconds,
            -0.599,
            accuracy: 1e-15
        )
    }

    func testLookupUsesPredictedProvenanceAndFailsClosed()
        throws
    {
        let lookup = try IERSDUT1LookupV1(
            records: [
                record(60_000, .observed, 10_000, 15),
                record(60_001, .predicted, 12_000, 108),
                record(60_003, .predicted, 14_000, 120),
            ]
        )
        let boundary = try XCTUnwrap(
            lookup.lookup(at: dateFromMjd(60_000.5))
        )
        XCTAssertEqual(boundary.dut1Seconds, 0.011, accuracy: 1e-15)
        XCTAssertEqual(boundary.source, .predicted)
        XCTAssertEqual(
            boundary.uncertaintySeconds,
            0.000_108,
            accuracy: 1e-15
        )
        XCTAssertNil(lookup.lookup(at: dateFromMjd(59_999)))
        XCTAssertNil(lookup.lookup(at: dateFromMjd(60_001.5)))
        XCTAssertNil(lookup.lookup(at: dateFromMjd(60_004)))
        XCTAssertNil(
            lookup.lookup(
                at: Date(timeIntervalSince1970: .nan)
            )
        )

        XCTAssertThrowsError(
            try IERSDUT1LookupV1(
                records: [
                    record(60_000, .observed, 0, 10),
                    record(60_001, .observed, 700_000, 10),
                ]
            )
        )
        XCTAssertThrowsError(
            try IERSDUT1LookupV1(
                records: [
                    record(
                        60_000,
                        .observed,
                        .min,
                        10
                    ),
                ]
            )
        )
        XCTAssertThrowsError(
            try IERSDUT1LookupV1(
                records: [
                    record(60_000, .predicted, 0, 10),
                    record(60_001, .observed, 1_000, 10),
                ]
            )
        )
    }

    func testBundledOfficialServiceMatchesPublishedValues()
        throws
    {
        let service = try IERSDUT1ServiceV1.loadBundled()
        let coverage = service.coverage

        XCTAssertEqual(coverage.firstMjdUtc, 41_684)
        XCTAssertEqual(coverage.lastMjdUtc, 61_624)
        XCTAssertEqual(
            coverage.observedThroughMjdUtc,
            61_251
        )
        XCTAssertEqual(
            coverage.predictionStartsMjdUtc,
            61_252
        )
        XCTAssertEqual(coverage.recordCount, 19_941)
        XCTAssertEqual(service.source.title, "IERS Bulletin A finals2000A")

        assertEstimate(
            service.lookup(
                at: dateFromMjd(
                    Double(coverage.firstMjdUtc)
                )
            ),
            dut1Seconds: 0.808_418,
            source: .observed,
            uncertaintySeconds: 0.000_271
        )
        assertEstimate(
            service.lookup(
                at: dateFromMjd(
                    Double(
                        coverage.observedThroughMjdUtc
                    )
                )
            ),
            dut1Seconds: 0.012_961,
            source: .observed,
            uncertaintySeconds: 0.000_010
        )
        assertEstimate(
            service.lookup(
                at: dateFromMjd(
                    Double(coverage.observedThroughMjdUtc)
                        + 0.5
                )
            ),
            dut1Seconds: 0.012_951_5,
            source: .predicted,
            uncertaintySeconds: 0.000_108
        )
        assertEstimate(
            service.lookup(
                at: dateFromMjd(
                    Double(
                        coverage.predictionStartsMjdUtc
                    )
                )
            ),
            dut1Seconds: 0.012_942,
            source: .predicted,
            uncertaintySeconds: 0.000_108
        )
        XCTAssertNil(
            service.lookup(
                at: dateFromMjd(
                    Double(coverage.firstMjdUtc) - 0.001
                )
            )
        )
        XCTAssertNil(
            service.lookup(
                at: dateFromMjd(
                    Double(coverage.lastMjdUtc) + 0.001
                )
            )
        )
    }

    func testServiceProducesStoreReadyOptionsAndZeroFallback()
        throws
    {
        let service = try IERSDUT1ServiceV1.loadBundled()
        let coverage = service.coverage
        let observedOptions = service.earthOrientationOptionsV2(
            at: dateFromMjd(
                Double(coverage.observedThroughMjdUtc)
            )
        )
        XCTAssertEqual(observedOptions.dut1Seconds, 0.012_961)
        XCTAssertEqual(observedOptions.dut1Source, .iersObserved)
        XCTAssertEqual(
            observedOptions.dut1UncertaintySeconds,
            0.000_010
        )

        let predictedOptions = service.earthOrientationOptionsV2(
            at: dateFromMjd(
                Double(coverage.predictionStartsMjdUtc)
            )
        )
        XCTAssertEqual(predictedOptions.dut1Seconds, 0.012_942)
        XCTAssertEqual(predictedOptions.dut1Source, .iersPredicted)
        XCTAssertEqual(
            predictedOptions.dut1UncertaintySeconds,
            0.000_108
        )

        let pre1973Date = dateFromMjd(41_682)
        let preCoverageOptions = service.earthOrientationOptionsV2(
            at: pre1973Date
        )
        XCTAssertNil(preCoverageOptions.dut1Seconds)
        XCTAssertNil(preCoverageOptions.dut1Source)
        XCTAssertNil(preCoverageOptions.dut1UncertaintySeconds)
        let resolved = try Astronomy.resolveTimeScalesV2(
            at: pre1973Date,
            options: preCoverageOptions
        )
        XCTAssertEqual(resolved.dut1Seconds, 0)
        XCTAssertEqual(resolved.dut1Source, .assumedZero)
        XCTAssertTrue(
            resolved.warnings.contains(.dut1AssumedZero)
        )

        let postCoverageOptions = service.earthOrientationOptionsV2(
            at: dateFromMjd(
                Double(coverage.lastMjdUtc + 1)
            )
        )
        XCTAssertNil(postCoverageOptions.dut1Seconds)
        XCTAssertNil(postCoverageOptions.dut1Source)
        XCTAssertNil(postCoverageOptions.dut1UncertaintySeconds)

        let failedLoadEstimate: IERSDUT1EstimateV1? = nil
        let failedLoadOptions =
            failedLoadEstimate?.earthOrientationOptionsV2
                ?? EarthOrientationOptionsV2()
        XCTAssertNil(failedLoadOptions.dut1Seconds)
        XCTAssertNil(failedLoadOptions.dut1Source)
        XCTAssertNil(
            failedLoadOptions.dut1UncertaintySeconds
        )
    }

    func testBundleContainsOnlyRuntimeIERSAssets() throws {
        let expectedNames: Set<String> = [
            "iers-finals2000a-eop.v1.json",
            "41684.v1.json",
            "45780.v1.json",
            "49876.v1.json",
            "53972.v1.json",
            "58068.v1.json",
        ]
        let urls = try IERSDUT1SharedResource.allCases.map {
            try SharedResources.iersDUT1URL(for: $0)
        }
        XCTAssertEqual(
            Set(urls.map(\.lastPathComponent)),
            expectedNames
        )
        for resource in IERSDUT1SharedResource.allCases {
            XCTAssertFalse(
                try SharedResources.iersDUT1Data(for: resource)
                    .isEmpty
            )
        }

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
        for case let fileURL as URL in enumerator {
            bundledNames.insert(fileURL.lastPathComponent)
        }
        for excludedName in [
            "iers-finals2000a-dut1.v1.json",
            "iers-finals2000a-dut1.lock.v1.json",
            "iers-finals2000a-eop.lock.v1.json",
            "finals2000A.all",
            "finals2000A.snapshot.v1.json",
            "readme.finals2000A",
            "checksums.sha512",
            "README.md",
        ] {
            XCTAssertFalse(
                bundledNames.contains(excludedName),
                excludedName
            )
        }
    }

    private func record(
        _ mjdUtc: Int,
        _ status: IERSDUT1RecordStatusV1,
        _ dut1Microseconds: Int,
        _ uncertaintyMicroseconds: Int
    ) -> IERSDUT1DailyRecordV1 {
        IERSDUT1DailyRecordV1(
            mjdUtc: mjdUtc,
            status: status,
            dut1Microseconds: dut1Microseconds,
            uncertaintyMicroseconds: uncertaintyMicroseconds
        )
    }

    private func dateFromMjd(_ mjdUtc: Double) -> Date {
        Date(
            timeIntervalSince1970:
                (mjdUtc - 40_587) * 86_400
        )
    }

    private func chunkData(
        startMjdUtc: Int,
        statuses: [IERSDUT1RecordStatusV1],
        dut1: [Int],
        uncertainty: [Int]
    ) throws -> Data {
        XCTAssertEqual(statuses.count, dut1.count)
        XCTAssertEqual(dut1.count, uncertainty.count)

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
        func delta(_ values: [Int]) -> [Int] {
            values.enumerated().map { index, value in
                index == 0 ? value : value - values[index - 1]
            }
        }
        return try JSONSerialization.data(
            withJSONObject: [
                "schemaVersion": 1,
                "startMjdUtc": startMjdUtc,
                "recordCount": statuses.count,
                "qualityRanges": ranges,
                "dut1MicrosecondsDelta": delta(dut1),
                "uncertaintyMicrosecondsDelta":
                    delta(uncertainty),
            ]
        )
    }

    private func assertEstimate(
        _ estimate: IERSDUT1EstimateV1?,
        dut1Seconds: Double,
        source: IERSDUT1EstimateSourceV1,
        uncertaintySeconds: Double,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        guard let estimate else {
            XCTFail("DUT1 estimate is nil", file: file, line: line)
            return
        }
        XCTAssertEqual(
            estimate.dut1Seconds,
            dut1Seconds,
            accuracy: 1e-12,
            file: file,
            line: line
        )
        XCTAssertEqual(
            estimate.source,
            source,
            file: file,
            line: line
        )
        XCTAssertEqual(
            estimate.uncertaintySeconds,
            uncertaintySeconds,
            accuracy: 1e-12,
            file: file,
            line: line
        )
    }
}
