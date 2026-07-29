import CryptoKit
import Foundation
import PlanetariumShared

private let microsecondsPerSecond = 1_000_000
private let unixEpochMjdUtc = 40_587.0
private let secondsPerDay = 86_400.0

public enum IERSDUT1RecordStatusV1: String, Codable, Hashable, Sendable {
    case observed = "I"
    case predicted = "P"
}

public enum IERSDUT1EstimateSourceV1: String, Codable, Hashable, Sendable {
    case observed
    case predicted
}

public struct IERSDUT1DailyRecordV1: Hashable, Sendable {
    public let mjdUtc: Int
    public let status: IERSDUT1RecordStatusV1
    public let dut1Microseconds: Int
    public let uncertaintyMicroseconds: Int

    public init(
        mjdUtc: Int,
        status: IERSDUT1RecordStatusV1,
        dut1Microseconds: Int,
        uncertaintyMicroseconds: Int
    ) {
        self.mjdUtc = mjdUtc
        self.status = status
        self.dut1Microseconds = dut1Microseconds
        self.uncertaintyMicroseconds = uncertaintyMicroseconds
    }
}

public struct IERSDUT1EstimateV1: Hashable, Sendable {
    public let dut1Seconds: Double
    public let source: IERSDUT1EstimateSourceV1
    public let uncertaintySeconds: Double

    public init(
        dut1Seconds: Double,
        source: IERSDUT1EstimateSourceV1,
        uncertaintySeconds: Double
    ) {
        self.dut1Seconds = dut1Seconds
        self.source = source
        self.uncertaintySeconds = uncertaintySeconds
    }

    public var earthOrientationOptionsV2: EarthOrientationOptionsV2 {
        EarthOrientationOptionsV2(
            dut1Seconds: dut1Seconds,
            dut1Source: source == .observed
                ? .iersObserved
                : .iersPredicted,
            dut1UncertaintySeconds: uncertaintySeconds
        )
    }
}

public struct IERSDUT1CoverageV1: Codable, Hashable, Sendable {
    public let firstMjdUtc: Int
    public let lastMjdUtc: Int
    public let observedThroughMjdUtc: Int
    public let predictionStartsMjdUtc: Int
    public let recordCount: Int
    public let observedCount: Int
    public let predictedCount: Int
    public let missingUt1TailRows: Int
    public let leapSecondBoundaryCount: Int
}

public struct IERSDUT1SourceSummaryV1: Hashable, Sendable {
    public let title: String
    public let url: String
    public let retrievedAt: String
    public let sourceLastModified: String
    public let sourceSha256: String
}

public enum IERSDUT1Error: LocalizedError, Equatable, Sendable {
    case invalidManifest(String)
    case invalidChunk(String)
    case resourceUnavailable(String)

    public var errorDescription: String? {
        switch self {
        case let .invalidManifest(reason):
            "IERS DUT1 manifestが不正です（\(reason)）。"
        case let .invalidChunk(reason):
            "IERS DUT1 chunkが不正です（\(reason)）。"
        case let .resourceUnavailable(reason):
            "IERS DUT1データを読み込めません（\(reason)）。"
        }
    }
}

/**
 Immutable synchronous lookup over daily 00:00 UTC samples.

 At a leap-second boundary the rounded integer step is removed only while
 interpolating the preceding UTC day. The next tabulated value takes effect
 exactly at 00:00 UTC; the leap is not smeared across the day.
 */
public struct IERSDUT1LookupV1: Sendable {
    private let records: [IERSDUT1DailyRecordV1]

    public init(records: [IERSDUT1DailyRecordV1]) throws {
        try IERSDUT1Validation.validate(records: records)
        self.records = records
    }

    public func lookup(at date: Date) -> IERSDUT1EstimateV1? {
        let secondsSince1970 = date.timeIntervalSince1970
        guard secondsSince1970.isFinite else { return nil }

        let mjdUtc =
            secondsSince1970 / secondsPerDay + unixEpochMjdUtc
        guard let first = records.first,
              let last = records.last,
              mjdUtc >= Double(first.mjdUtc),
              mjdUtc <= Double(last.mjdUtc)
        else {
            return nil
        }

        var low = 0
        var high = records.count - 1
        while low <= high {
            let middle = (low + high) / 2
            if Double(records[middle].mjdUtc) <= mjdUtc {
                low = middle + 1
            } else {
                high = middle - 1
            }
        }

        let startIndex = high
        guard startIndex >= 0 else { return nil }
        let start = records[startIndex]
        let fraction = mjdUtc - Double(start.mjdUtc)
        if abs(fraction) < Double.ulpOfOne * 8 {
            return IERSDUT1EstimateV1(
                dut1Seconds:
                    Double(start.dut1Microseconds)
                    / Double(microsecondsPerSecond),
                source: start.status == .observed
                    ? .observed
                    : .predicted,
                uncertaintySeconds:
                    Double(start.uncertaintyMicroseconds)
                    / Double(microsecondsPerSecond)
            )
        }

        let endIndex = startIndex + 1
        guard records.indices.contains(endIndex) else { return nil }
        let end = records[endIndex]
        guard end.mjdUtc == start.mjdUtc + 1,
              fraction > 0,
              fraction < 1
        else {
            return nil
        }

        let rawDifference =
            end.dut1Microseconds - start.dut1Microseconds
        let leapStepMicroseconds: Int
        if abs(rawDifference) > microsecondsPerSecond / 2 {
            leapStepMicroseconds =
                Int(
                    (
                        Double(rawDifference)
                            / Double(microsecondsPerSecond)
                    ).rounded()
                ) * microsecondsPerSecond
        } else {
            leapStepMicroseconds = 0
        }
        let adjustedEnd =
            end.dut1Microseconds - leapStepMicroseconds
        let interpolated =
            Double(start.dut1Microseconds)
            + fraction
                * Double(adjustedEnd - start.dut1Microseconds)

        return IERSDUT1EstimateV1(
            dut1Seconds:
                interpolated / Double(microsecondsPerSecond),
            source:
                start.status == .observed
                    && end.status == .observed
                ? .observed
                : .predicted,
            uncertaintySeconds:
                Double(
                    max(
                        start.uncertaintyMicroseconds,
                        end.uncertaintyMicroseconds
                    )
                ) / Double(microsecondsPerSecond)
        )
    }
}

public struct IERSDUT1ServiceV1: Sendable {
    public let coverage: IERSDUT1CoverageV1
    public let source: IERSDUT1SourceSummaryV1
    private let integratedService:
        IERSEarthOrientationServiceV1

    private init(
        coverage: IERSDUT1CoverageV1,
        source: IERSDUT1SourceSummaryV1,
        integratedService:
            IERSEarthOrientationServiceV1
    ) {
        self.coverage = coverage
        self.source = source
        self.integratedService = integratedService
    }

    public static func loadBundled() throws -> Self {
        let integrated =
            try IERSEarthOrientationServiceV1
                .loadBundled()
        let integratedCoverage = integrated.coverage
        let integratedSource = integrated.source
        return Self(
            coverage: IERSDUT1CoverageV1(
                firstMjdUtc:
                    integratedCoverage.firstSampleMjdUtc,
                lastMjdUtc:
                    integratedCoverage.lastSampleMjdUtc,
                observedThroughMjdUtc:
                    integratedCoverage.dut1
                        .iersThroughMjdUtc,
                predictionStartsMjdUtc:
                    integratedCoverage.dut1
                        .predictionStartsMjdUtc,
                recordCount:
                    integratedCoverage.recordCount,
                observedCount:
                    integratedCoverage.dut1.iersCount,
                predictedCount:
                    integratedCoverage.dut1.predictedCount,
                missingUt1TailRows:
                    integratedCoverage.dut1.missingTailRows,
                leapSecondBoundaryCount:
                    integratedCoverage.dut1
                        .leapSecondBoundaryCount
            ),
            source: IERSDUT1SourceSummaryV1(
                title: integratedSource.title,
                url: integratedSource.url,
                retrievedAt:
                    integratedSource.retrievedAt,
                sourceLastModified:
                    integratedSource.sourceLastModified,
                sourceSha256:
                    integratedSource.sourceSha256
            ),
            integratedService: integrated
        )
    }

    public func lookup(at date: Date) -> IERSDUT1EstimateV1? {
        do {
            return try integratedService.lookup(at: date)?
                .dut1
        } catch {
            return nil
        }
    }

    public func earthOrientationOptionsV2(
        at date: Date
    ) -> EarthOrientationOptionsV2 {
        do {
            return try integratedService
                .earthOrientationOptionsV2(at: date)
        } catch {
            return EarthOrientationOptionsV2(
                polarMotion: .assumedZero
            )
        }
    }
}

public enum IERSDUT1DecoderV1 {
    public static func decodeChunk(
        from data: Data
    ) throws -> [IERSDUT1DailyRecordV1] {
        try IERSDUT1Validation.requireExactObjectKeys(
            in: data,
            expected: [
                "schemaVersion",
                "startMjdUtc",
                "recordCount",
                "qualityRanges",
                "dut1MicrosecondsDelta",
                "uncertaintyMicrosecondsDelta",
            ],
            context: "chunk",
            manifest: false
        )

        let chunk: EncodedIERSDUT1ChunkV1
        do {
            chunk = try JSONDecoder().decode(
                EncodedIERSDUT1ChunkV1.self,
                from: data
            )
        } catch {
            throw IERSDUT1Error.invalidChunk(
                "JSON decode: \(error.localizedDescription)"
            )
        }
        guard chunk.schemaVersion == 1,
              chunk.recordCount >= 1,
              chunk.recordCount <= 4_096,
              chunk.dut1MicrosecondsDelta.count
                == chunk.recordCount,
              chunk.uncertaintyMicrosecondsDelta.count
                == chunk.recordCount
        else {
            throw IERSDUT1Error.invalidChunk(
                "headerまたはseries長"
            )
        }

        var statuses = Array<IERSDUT1RecordStatusV1?>(
            repeating: nil,
            count: chunk.recordCount
        )
        var expectedStart = 0
        for range in chunk.qualityRanges {
            guard range.startOffset == expectedStart,
                  range.endOffsetExclusive > range.startOffset,
                  range.endOffsetExclusive <= chunk.recordCount
            else {
                throw IERSDUT1Error.invalidChunk("quality range")
            }
            statuses.replaceSubrange(
                range.startOffset..<range.endOffsetExclusive,
                with: repeatElement(
                    Optional(range.status),
                    count:
                        range.endOffsetExclusive - range.startOffset
                )
            )
            expectedStart = range.endOffsetExclusive
        }
        guard expectedStart == chunk.recordCount,
              !statuses.contains(where: { $0 == nil })
        else {
            throw IERSDUT1Error.invalidChunk("quality range coverage")
        }

        var records: [IERSDUT1DailyRecordV1] = []
        records.reserveCapacity(chunk.recordCount)
        var dut1Microseconds = 0
        var uncertaintyMicroseconds = 0
        for index in 0..<chunk.recordCount {
            if index == 0 {
                dut1Microseconds =
                    chunk.dut1MicrosecondsDelta[index]
                uncertaintyMicroseconds =
                    chunk.uncertaintyMicrosecondsDelta[index]
            } else {
                let dut1Result =
                    dut1Microseconds.addingReportingOverflow(
                        chunk.dut1MicrosecondsDelta[index]
                    )
                let uncertaintyResult =
                    uncertaintyMicroseconds.addingReportingOverflow(
                        chunk.uncertaintyMicrosecondsDelta[index]
                    )
                guard !dut1Result.overflow,
                      !uncertaintyResult.overflow
                else {
                    throw IERSDUT1Error.invalidChunk(
                        "delta overflow"
                    )
                }
                dut1Microseconds = dut1Result.partialValue
                uncertaintyMicroseconds =
                    uncertaintyResult.partialValue
            }

            let mjdResult =
                chunk.startMjdUtc.addingReportingOverflow(index)
            guard !mjdResult.overflow,
                  let status = statuses[index]
            else {
                throw IERSDUT1Error.invalidChunk("MJD overflow")
            }
            records.append(
                IERSDUT1DailyRecordV1(
                    mjdUtc: mjdResult.partialValue,
                    status: status,
                    dut1Microseconds: dut1Microseconds,
                    uncertaintyMicroseconds:
                        uncertaintyMicroseconds
                )
            )
        }
        try IERSDUT1Validation.validate(records: records)
        return records
    }

    fileprivate static func decodeManifest(
        from data: Data
    ) throws -> IERSDUT1ManifestV1 {
        try IERSDUT1Validation.requireExactObjectKeys(
            in: data,
            expected: [
                "schemaVersion",
                "product",
                "timeScale",
                "units",
                "source",
                "statusCodes",
                "encoding",
                "coverage",
                "chunks",
            ],
            context: "manifest",
            manifest: true
        )
        let manifest: IERSDUT1ManifestV1
        do {
            manifest = try JSONDecoder().decode(
                IERSDUT1ManifestV1.self,
                from: data
            )
        } catch {
            throw IERSDUT1Error.invalidManifest(
                "JSON decode: \(error.localizedDescription)"
            )
        }
        try IERSDUT1Validation.validate(manifest: manifest)
        return manifest
    }
}

private struct EncodedIERSDUT1ChunkV1: Decodable {
    let schemaVersion: Int
    let startMjdUtc: Int
    let recordCount: Int
    let qualityRanges: [IERSDUT1QualityRangeV1]
    let dut1MicrosecondsDelta: [Int]
    let uncertaintyMicrosecondsDelta: [Int]
}

private struct IERSDUT1QualityRangeV1: Decodable {
    let startOffset: Int
    let endOffsetExclusive: Int
    let status: IERSDUT1RecordStatusV1

    init(from decoder: Decoder) throws {
        var values = try decoder.unkeyedContainer()
        startOffset = try values.decode(Int.self)
        endOffsetExclusive = try values.decode(Int.self)
        status = try values.decode(IERSDUT1RecordStatusV1.self)
        guard values.isAtEnd else {
            throw DecodingError.dataCorruptedError(
                in: values,
                debugDescription:
                    "qualityRanges entries must contain three values"
            )
        }
    }
}

private struct IERSDUT1ManifestV1: Decodable {
    let schemaVersion: Int
    let product: String
    let timeScale: String
    let units: Units
    let source: Source
    let statusCodes: StatusCodes
    let encoding: Encoding
    let coverage: IERSDUT1CoverageV1
    let chunks: [Chunk]

    struct Units: Decodable {
        let mjdUtc: String
        let dut1: String
        let uncertainty: String
    }

    struct Source: Decodable {
        let title: String
        let url: String
        let formatUrl: String
        let checksumUrl: String
        let productMetadataUrl: String
        let retrievedAt: String
        let sourceLastModified: String
        let sourceSha256: String
        let officialSourceSha512: String
        let formatSha256: String
        let checksumSha256: String
        let attribution: String
        let distributionStatement: String
        let distributionUrl: String
        let rawSnapshot: String
        let formatSnapshot: String
        let checksumSnapshot: String
    }

    struct StatusCodes: Decodable {
        let observed: String
        let predicted: String

        enum CodingKeys: String, CodingKey {
            case observed = "I"
            case predicted = "P"
        }
    }

    struct Encoding: Decodable {
        let mjdUtc: String
        let numeric: String
        let quality: String
        let maximumQuantizationErrorSeconds: Double
    }

    struct Chunk: Decodable {
        let file: String
        let startMjdUtc: Int
        let endMjdUtc: Int
        let recordCount: Int
        let observedCount: Int
        let predictedCount: Int
        let rawBytes: Int
        let gzipBytes: Int
        let sha256: String
    }
}

private enum IERSDUT1Validation {
    static func validate(
        records: [IERSDUT1DailyRecordV1]
    ) throws {
        guard !records.isEmpty else {
            throw IERSDUT1Error.invalidChunk("recordが空")
        }
        var previous: IERSDUT1DailyRecordV1?
        var predictionStarted = false
        for record in records {
            guard (-microsecondsPerSecond...microsecondsPerSecond)
                .contains(record.dut1Microseconds),
                (0...microsecondsPerSecond).contains(
                    record.uncertaintyMicroseconds
                )
            else {
                throw IERSDUT1Error.invalidChunk(
                    "record値が範囲外"
                )
            }
            if predictionStarted, record.status == .observed {
                throw IERSDUT1Error.invalidChunk(
                    "予測値の後に観測値"
                )
            }
            if record.status == .predicted {
                predictionStarted = true
            }
            if let previous {
                guard record.mjdUtc > previous.mjdUtc else {
                    throw IERSDUT1Error.invalidChunk(
                        "MJDが昇順でない"
                    )
                }
                if record.mjdUtc == previous.mjdUtc + 1 {
                    try validateDiscontinuity(
                        from: previous.dut1Microseconds,
                        to: record.dut1Microseconds
                    )
                }
            }
            previous = record
        }
    }

    static func validateDiscontinuity(
        from start: Int,
        to end: Int
    ) throws {
        let difference = end - start
        guard abs(difference) > microsecondsPerSecond / 2 else {
            return
        }
        let step = Int(
            (
                Double(difference)
                    / Double(microsecondsPerSecond)
            ).rounded()
        )
        let residual =
            difference - step * microsecondsPerSecond
        guard abs(step) == 1,
              abs(residual) <= 100_000
        else {
            throw IERSDUT1Error.invalidChunk(
                "説明できないDUT1不連続"
            )
        }
    }

    static func validate(
        manifest: IERSDUT1ManifestV1
    ) throws {
        let coverage = manifest.coverage
        guard manifest.schemaVersion == 1,
              manifest.product
                == "IERS Bulletin A finals2000A UT1-UTC",
              manifest.timeScale == "UTC",
              manifest.units.mjdUtc == "day",
              manifest.units.dut1 == "second",
              manifest.units.uncertainty == "second",
              manifest.statusCodes.observed == "observed",
              manifest.statusCodes.predicted == "predicted",
              manifest.encoding.maximumQuantizationErrorSeconds
                == 0.000_000_5,
              !manifest.encoding.mjdUtc.isEmpty,
              !manifest.encoding.numeric.isEmpty,
              !manifest.encoding.quality.isEmpty
        else {
            throw IERSDUT1Error.invalidManifest(
                "schemaまたはencoding"
            )
        }

        let sourceStrings = [
            manifest.source.title,
            manifest.source.url,
            manifest.source.formatUrl,
            manifest.source.checksumUrl,
            manifest.source.productMetadataUrl,
            manifest.source.retrievedAt,
            manifest.source.sourceLastModified,
            manifest.source.attribution,
            manifest.source.distributionStatement,
            manifest.source.distributionUrl,
            manifest.source.rawSnapshot,
            manifest.source.formatSnapshot,
            manifest.source.checksumSnapshot,
        ]
        guard sourceStrings.allSatisfy({ !$0.isEmpty }),
              isLowercaseHex(
                  manifest.source.sourceSha256,
                  count: 64
              ),
              isLowercaseHex(
                  manifest.source.officialSourceSha512,
                  count: 128
              ),
              isLowercaseHex(
                  manifest.source.formatSha256,
                  count: 64
              ),
              isLowercaseHex(
                  manifest.source.checksumSha256,
                  count: 64
              ),
              URL(string: manifest.source.url)?.scheme == "https"
        else {
            throw IERSDUT1Error.invalidManifest(
                "source metadata"
            )
        }

        guard coverage.recordCount > 0,
              safeSum(
                  coverage.firstMjdUtc,
                  coverage.recordCount - 1
              ) == coverage.lastMjdUtc,
              safeSum(
                  coverage.observedThroughMjdUtc,
                  1
              ) == coverage.predictionStartsMjdUtc,
              coverage.observedCount >= 0,
              coverage.predictedCount >= 0,
              safeSum(
                  coverage.observedCount,
                  coverage.predictedCount
              ) == coverage.recordCount,
              coverage.firstMjdUtc
                <= coverage.observedThroughMjdUtc,
              coverage.predictionStartsMjdUtc
                <= coverage.lastMjdUtc,
              coverage.missingUt1TailRows >= 0,
              coverage.leapSecondBoundaryCount >= 0,
              manifest.chunks.count
                == IERSDUT1SharedResource.allCases.count - 1
        else {
            throw IERSDUT1Error.invalidManifest("coverage")
        }

        var nextStart = coverage.firstMjdUtc
        var recordCount = 0
        var observedCount = 0
        var predictedCount = 0
        var seenStarts = Set<Int>()
        for descriptor in manifest.chunks {
            guard descriptor.startMjdUtc == nextStart,
                  descriptor.recordCount >= 1,
                  descriptor.recordCount <= 4_096,
                  safeSum(
                      descriptor.startMjdUtc,
                      descriptor.recordCount - 1
                  ) == descriptor.endMjdUtc,
                  descriptor.observedCount >= 0,
                  descriptor.predictedCount >= 0,
                  safeSum(
                      descriptor.observedCount,
                      descriptor.predictedCount
                  )
                    == descriptor.recordCount,
                  descriptor.rawBytes > 0,
                  descriptor.gzipBytes > 0,
                  descriptor.gzipBytes <= descriptor.rawBytes,
                  isLowercaseHex(descriptor.sha256, count: 64),
                  descriptor.file
                    == "shared/eop/dut1/"
                        + "\(descriptor.startMjdUtc).v1.json",
                  seenStarts.insert(
                      descriptor.startMjdUtc
                  ).inserted
            else {
                throw IERSDUT1Error.invalidManifest(
                    "chunk descriptor"
                )
            }
            guard let followingStart = safeSum(
                descriptor.endMjdUtc,
                1
            ),
                let accumulatedRecordCount = safeSum(
                    recordCount,
                    descriptor.recordCount
                ),
                let accumulatedObservedCount = safeSum(
                    observedCount,
                    descriptor.observedCount
                ),
                let accumulatedPredictedCount = safeSum(
                    predictedCount,
                    descriptor.predictedCount
                )
            else {
                throw IERSDUT1Error.invalidManifest(
                    "chunk descriptor overflow"
                )
            }
            nextStart = followingStart
            recordCount = accumulatedRecordCount
            observedCount = accumulatedObservedCount
            predictedCount = accumulatedPredictedCount
        }
        guard safeSum(coverage.lastMjdUtc, 1) == nextStart,
              recordCount == coverage.recordCount,
              observedCount == coverage.observedCount,
              predictedCount == coverage.predictedCount
        else {
            throw IERSDUT1Error.invalidManifest(
                "chunk集計"
            )
        }
    }

    static func validateOfficialRecords(
        _ records: [IERSDUT1DailyRecordV1],
        coverage: IERSDUT1CoverageV1
    ) throws {
        try validate(records: records)
        let observedCount =
            records.filter { $0.status == .observed }.count
        let predictedCount = records.count - observedCount
        var leapCount = 0
        for pair in zip(records, records.dropFirst()) {
            guard pair.1.mjdUtc == pair.0.mjdUtc + 1 else {
                throw IERSDUT1Error.invalidManifest(
                    "chunk間に日次欠測"
                )
            }
            if abs(
                pair.1.dut1Microseconds
                    - pair.0.dut1Microseconds
            ) > microsecondsPerSecond / 2 {
                leapCount += 1
            }
        }
        guard records.count == coverage.recordCount,
              records.first?.mjdUtc == coverage.firstMjdUtc,
              records.last?.mjdUtc == coverage.lastMjdUtc,
              observedCount == coverage.observedCount,
              predictedCount == coverage.predictedCount,
              records.last(where: { $0.status == .observed })?
                .mjdUtc == coverage.observedThroughMjdUtc,
              records.first(where: { $0.status == .predicted })?
                .mjdUtc == coverage.predictionStartsMjdUtc,
              leapCount == coverage.leapSecondBoundaryCount
        else {
            throw IERSDUT1Error.invalidManifest(
                "coverageとrecordが不一致"
            )
        }
    }

    static func requireExactObjectKeys(
        in data: Data,
        expected: Set<String>,
        context: String,
        manifest: Bool
    ) throws {
        let object: Any
        do {
            object = try JSONSerialization.jsonObject(
                with: data,
                options: []
            )
        } catch {
            if manifest {
                throw IERSDUT1Error.invalidManifest(
                    "\(context) JSON"
                )
            }
            throw IERSDUT1Error.invalidChunk(
                "\(context) JSON"
            )
        }
        guard let dictionary = object as? [String: Any],
              Set(dictionary.keys) == expected
        else {
            if manifest {
                throw IERSDUT1Error.invalidManifest(
                    "\(context) key"
                )
            }
            throw IERSDUT1Error.invalidChunk(
                "\(context) key"
            )
        }
    }

    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map {
            String(format: "%02x", $0)
        }.joined()
    }

    private static func isLowercaseHex(
        _ value: String,
        count: Int
    ) -> Bool {
        value.count == count
            && value.unicodeScalars.allSatisfy {
                ("0"..."9").contains(Character($0))
                    || ("a"..."f").contains(Character($0))
            }
    }

    private static func safeSum(
        _ first: Int,
        _ second: Int
    ) -> Int? {
        let result = first.addingReportingOverflow(second)
        return result.overflow ? nil : result.partialValue
    }
}
