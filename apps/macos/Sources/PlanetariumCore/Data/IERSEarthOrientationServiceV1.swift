import CryptoKit
import Foundation
import PlanetariumShared

private let eopMicroUnitsPerUnit = 1_000_000
private let eopUnixEpochMjdUtc = 40_587.0
private let eopSecondsPerDay = 86_400.0
private let eopRadiansPerMicroarcsecond =
    Double.pi / (180 * 3_600 * 1_000_000)

public enum IERSEarthOrientationRecordStatusV1:
    String, Codable, Hashable, Sendable
{
    case observed = "I"
    case predicted = "P"
}

public enum IERSEarthOrientationEstimateSourceV1:
    String, Codable, Hashable, Sendable
{
    case observed
    case predicted
}

public struct IERSEarthOrientationDailyRecordV1:
    Hashable, Sendable
{
    public let mjdUtc: Int
    public let polarMotionStatus:
        IERSEarthOrientationRecordStatusV1
    public let xpMicroarcseconds: Int
    public let xpReportedErrorMicroarcseconds: Int
    public let ypMicroarcseconds: Int
    public let ypReportedErrorMicroarcseconds: Int
    public let dut1Status: IERSEarthOrientationRecordStatusV1
    public let dut1Microseconds: Int
    public let dut1ReportedErrorMicroseconds: Int

    public init(
        mjdUtc: Int,
        polarMotionStatus: IERSEarthOrientationRecordStatusV1,
        xpMicroarcseconds: Int,
        xpReportedErrorMicroarcseconds: Int,
        ypMicroarcseconds: Int,
        ypReportedErrorMicroarcseconds: Int,
        dut1Status: IERSEarthOrientationRecordStatusV1,
        dut1Microseconds: Int,
        dut1ReportedErrorMicroseconds: Int
    ) {
        self.mjdUtc = mjdUtc
        self.polarMotionStatus = polarMotionStatus
        self.xpMicroarcseconds = xpMicroarcseconds
        self.xpReportedErrorMicroarcseconds =
            xpReportedErrorMicroarcseconds
        self.ypMicroarcseconds = ypMicroarcseconds
        self.ypReportedErrorMicroarcseconds =
            ypReportedErrorMicroarcseconds
        self.dut1Status = dut1Status
        self.dut1Microseconds = dut1Microseconds
        self.dut1ReportedErrorMicroseconds =
            dut1ReportedErrorMicroseconds
    }
}

public struct IERSPolarMotionEstimateV1:
    Hashable, Sendable
{
    public let xpRadians: Double
    public let ypRadians: Double
    public let xpReportedErrorRadians: Double
    public let ypReportedErrorRadians: Double
    public let source: IERSEarthOrientationEstimateSourceV1
    public let usesPrediction: Bool

    public init(
        xpRadians: Double,
        ypRadians: Double,
        xpReportedErrorRadians: Double,
        ypReportedErrorRadians: Double,
        source: IERSEarthOrientationEstimateSourceV1,
        usesPrediction: Bool
    ) {
        self.xpRadians = xpRadians
        self.ypRadians = ypRadians
        self.xpReportedErrorRadians =
            xpReportedErrorRadians
        self.ypReportedErrorRadians =
            ypReportedErrorRadians
        self.source = source
        self.usesPrediction = usesPrediction
    }

    public var polarMotionOptionsV2: PolarMotionOptionsV2 {
        PolarMotionOptionsV2(
            xpRadians: xpRadians,
            ypRadians: ypRadians,
            source: source == .observed
                ? .iersObserved
                : .iersPredicted,
            xpReportedErrorRadians: xpReportedErrorRadians,
            ypReportedErrorRadians: ypReportedErrorRadians
        )
    }
}

public struct IERSEarthOrientationEstimateV1:
    Hashable, Sendable
{
    public let dut1: IERSDUT1EstimateV1
    public let polarMotion: IERSPolarMotionEstimateV1

    public init(
        dut1: IERSDUT1EstimateV1,
        polarMotion: IERSPolarMotionEstimateV1
    ) {
        self.dut1 = dut1
        self.polarMotion = polarMotion
    }

    public var earthOrientationOptionsV2:
        EarthOrientationOptionsV2
    {
        EarthOrientationOptionsV2(
            dut1Seconds: dut1.dut1Seconds,
            dut1Source: dut1.source == .observed
                ? .iersObserved
                : .iersPredicted,
            dut1UncertaintySeconds:
                dut1.uncertaintySeconds,
            polarMotion: polarMotion.polarMotionOptionsV2
        )
    }
}

public struct IERSEarthOrientationObservableCoverageV1:
    Codable, Hashable, Sendable
{
    public let iersThroughMjdUtc: Int
    public let predictionStartsMjdUtc: Int
    public let iersCount: Int
    public let predictedCount: Int
    public let missingTailRows: Int
}

public struct IERSEarthOrientationDUT1CoverageV1:
    Codable, Hashable, Sendable
{
    public let iersThroughMjdUtc: Int
    public let predictionStartsMjdUtc: Int
    public let iersCount: Int
    public let predictedCount: Int
    public let missingTailRows: Int
    public let leapSecondBoundaryCount: Int
}

public struct IERSEarthOrientationCoverageV1:
    Codable, Hashable, Sendable
{
    public let firstSampleMjdUtc: Int
    public let lastSampleMjdUtc: Int
    public let recordCount: Int
    public let sourceRowCount: Int
    public let polarMotion:
        IERSEarthOrientationObservableCoverageV1
    public let dut1: IERSEarthOrientationDUT1CoverageV1
}

public struct IERSEarthOrientationSourceSummaryV1:
    Hashable, Sendable
{
    public let title: String
    public let url: String
    public let retrievedAt: String
    public let sourceLastModified: String
    public let sourceSha256: String
    public let reportedErrorSemantics: String
}

public struct IERSEarthOrientationChunkDescriptorV1:
    Decodable, Hashable, Sendable
{
    public let file: String
    public let startMjdUtc: Int
    public let endMjdUtc: Int
    public let recordCount: Int
    public let polarMotionIersCount: Int
    public let polarMotionPredictedCount: Int
    public let dut1IersCount: Int
    public let dut1PredictedCount: Int
    public let rawBytes: Int
    public let gzipBytes: Int
    public let sha256: String
}

public enum IERSEarthOrientationError:
    LocalizedError, Equatable, Sendable
{
    case invalidManifest(String)
    case invalidChunk(String)
    case resourceUnavailable(String)

    public var errorDescription: String? {
        switch self {
        case let .invalidManifest(reason):
            "IERS地球姿勢manifestが不正です（\(reason)）。"
        case let .invalidChunk(reason):
            "IERS地球姿勢chunkが不正です（\(reason)）。"
        case let .resourceUnavailable(reason):
            "IERS地球姿勢データを読み込めません（\(reason)）。"
        }
    }
}

/**
 Lazy, synchronous lookup over the bundled integrated IERS EOP v1 data.

 The manifest is validated when the service is created. A lookup loads only
 the one chunk needed by an exact daily sample, or the one or two chunks
 needed by a four-point polar-motion window. Successfully decoded chunks are
 cached behind a lock. Failed loads are never cached, so a later lookup can
 retry safely.
 */
public final class IERSEarthOrientationServiceV1:
    @unchecked Sendable
{
    public let coverage: IERSEarthOrientationCoverageV1
    public let source: IERSEarthOrientationSourceSummaryV1

    private let descriptors:
        [IERSEarthOrientationChunkDescriptorV1]
    private let loadChunkData:
        @Sendable (
            IERSEarthOrientationChunkDescriptorV1
        ) throws -> Data
    private let cacheLock = NSLock()
    private var cachedRecords:
        [Int: [IERSEarthOrientationDailyRecordV1]] = [:]

    public static func loadBundled() throws -> Self {
        let manifestData: Data
        do {
            manifestData =
                try SharedResources.iersEarthOrientationData(
                    for: .manifest
                )
        } catch {
            throw IERSEarthOrientationError
                .resourceUnavailable(
                    error.localizedDescription
                )
        }
        return try Self(
            manifestData: manifestData,
            loadChunkData: { descriptor in
                do {
                    return try SharedResources
                        .iersEarthOrientationChunkData(
                            startMjdUtc:
                                descriptor.startMjdUtc
                        )
                } catch {
                    throw IERSEarthOrientationError
                        .resourceUnavailable(
                            error.localizedDescription
                        )
                }
            }
        )
    }

    init(
        manifestData: Data,
        loadChunkData:
            @escaping @Sendable (
                IERSEarthOrientationChunkDescriptorV1
            ) throws -> Data
    ) throws {
        let manifest =
            try IERSEarthOrientationDecoderV1
                .decodeManifest(from: manifestData)
        coverage = manifest.coverage
        source = IERSEarthOrientationSourceSummaryV1(
            title: manifest.source.title,
            url: manifest.source.url,
            retrievedAt: manifest.source.retrievedAt,
            sourceLastModified:
                manifest.source.sourceLastModified,
            sourceSha256: manifest.source.sourceSha256,
            reportedErrorSemantics:
                manifest.source.reportedErrorSemantics
        )
        descriptors = manifest.chunks
        self.loadChunkData = loadChunkData
    }

    public func lookup(
        at date: Date
    ) throws -> IERSEarthOrientationEstimateV1? {
        let secondsSince1970 = date.timeIntervalSince1970
        guard secondsSince1970.isFinite else { return nil }
        let mjdUtc =
            secondsSince1970 / eopSecondsPerDay
            + eopUnixEpochMjdUtc
        let firstMjdUtc = coverage.firstSampleMjdUtc
        let lastMjdUtc = coverage.lastSampleMjdUtc
        guard mjdUtc >= Double(firstMjdUtc),
              mjdUtc <= Double(lastMjdUtc)
        else {
            return nil
        }

        let day = Int(floor(mjdUtc))
        let exact = IERSEarthOrientationLookupV1
            .isExactDailySample(mjdUtc)
        if !exact, day >= lastMjdUtc {
            return nil
        }
        let supportStart: Int
        let supportEnd: Int
        if exact {
            supportStart = day
            supportEnd = day
        } else {
            supportStart = max(
                firstMjdUtc,
                min(day - 1, lastMjdUtc - 3)
            )
            supportEnd = supportStart + 3
        }

        guard let firstDescriptorIndex =
            descriptorIndex(containing: supportStart),
            let lastDescriptorIndex =
                descriptorIndex(containing: supportEnd),
            lastDescriptorIndex >= firstDescriptorIndex
        else {
            return nil
        }
        var support: [IERSEarthOrientationDailyRecordV1] =
            []
        for descriptor in descriptors[
            firstDescriptorIndex...lastDescriptorIndex
        ] {
            support.append(
                contentsOf: try records(for: descriptor)
            )
        }
        support = support.filter {
            $0.mjdUtc >= supportStart
                && $0.mjdUtc <= supportEnd
        }
        return try IERSEarthOrientationLookupV1(
            records: support
        ).lookup(mjdUtc: mjdUtc)
    }

    /**
     Returns explicit zero fallbacks when data are out of coverage.

     A thrown chunk/resource error remains distinguishable to callers. They
     can surface that failure and still choose this fallback while a later
     lookup retries the uncached chunk.
     */
    public func earthOrientationOptionsV2(
        at date: Date
    ) throws -> EarthOrientationOptionsV2 {
        try lookup(at: date)?.earthOrientationOptionsV2
            ?? EarthOrientationOptionsV2(
                polarMotion: .assumedZero
            )
    }

    private func descriptorIndex(
        containing day: Int
    ) -> Int? {
        var low = 0
        var high = descriptors.count - 1
        while low <= high {
            let middle = (low + high) / 2
            let descriptor = descriptors[middle]
            if day < descriptor.startMjdUtc {
                high = middle - 1
            } else if day > descriptor.endMjdUtc {
                low = middle + 1
            } else {
                return middle
            }
        }
        return nil
    }

    private func records(
        for descriptor:
            IERSEarthOrientationChunkDescriptorV1
    ) throws -> [IERSEarthOrientationDailyRecordV1] {
        cacheLock.lock()
        if let cached =
            cachedRecords[descriptor.startMjdUtc]
        {
            cacheLock.unlock()
            return cached
        }
        do {
            let data = try loadChunkData(descriptor)
            guard data.count == descriptor.rawBytes else {
                throw IERSEarthOrientationError.invalidChunk(
                    "\(descriptor.startMjdUtc) のbyte数"
                )
            }
            guard IERSEarthOrientationValidationV1
                .sha256Hex(data) == descriptor.sha256
            else {
                throw IERSEarthOrientationError.invalidChunk(
                    "\(descriptor.startMjdUtc) のSHA-256"
                )
            }
            let decoded =
                try IERSEarthOrientationDecoderV1
                    .decodeChunk(from: data)
            try IERSEarthOrientationValidationV1
                .validate(
                    records: decoded,
                    against: descriptor
                )
            cachedRecords[descriptor.startMjdUtc] =
                decoded
            cacheLock.unlock()
            return decoded
        } catch {
            // A failed read or decode deliberately leaves no negative cache.
            cacheLock.unlock()
            throw error
        }
    }
}

public struct IERSEarthOrientationLookupV1:
    Sendable
{
    private let records:
        [IERSEarthOrientationDailyRecordV1]

    public init(
        records: [IERSEarthOrientationDailyRecordV1]
    ) throws {
        try IERSEarthOrientationValidationV1
            .validateLookupRecords(records)
        self.records = records
    }

    public func lookup(
        at date: Date
    ) -> IERSEarthOrientationEstimateV1? {
        let secondsSince1970 = date.timeIntervalSince1970
        guard secondsSince1970.isFinite else { return nil }
        return try? lookup(
            mjdUtc:
                secondsSince1970 / eopSecondsPerDay
                + eopUnixEpochMjdUtc
        )
    }

    fileprivate static func isExactDailySample(
        _ mjdUtc: Double
    ) -> Bool {
        abs(mjdUtc - mjdUtc.rounded())
            < Double.ulpOfOne * 8
    }

    fileprivate func lookup(
        mjdUtc: Double
    ) throws -> IERSEarthOrientationEstimateV1? {
        guard mjdUtc.isFinite,
              let first = records.first,
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
        guard records.indices.contains(startIndex) else {
            return nil
        }
        let start = records[startIndex]

        if Self.isExactDailySample(mjdUtc) {
            let polarSource:
                IERSEarthOrientationEstimateSourceV1 =
                start.polarMotionStatus == .observed
                ? .observed
                : .predicted
            return IERSEarthOrientationEstimateV1(
                dut1: IERSDUT1EstimateV1(
                    dut1Seconds:
                        Double(start.dut1Microseconds)
                        / Double(eopMicroUnitsPerUnit),
                    source: start.dut1Status == .observed
                        ? .observed
                        : .predicted,
                    uncertaintySeconds:
                        Double(
                            start
                                .dut1ReportedErrorMicroseconds
                        )
                        / Double(eopMicroUnitsPerUnit)
                ),
                polarMotion: IERSPolarMotionEstimateV1(
                    xpRadians:
                        Double(start.xpMicroarcseconds)
                        * eopRadiansPerMicroarcsecond,
                    ypRadians:
                        Double(start.ypMicroarcseconds)
                        * eopRadiansPerMicroarcsecond,
                    xpReportedErrorRadians:
                        Double(
                            start
                                .xpReportedErrorMicroarcseconds
                        )
                        * eopRadiansPerMicroarcsecond,
                    ypReportedErrorRadians:
                        Double(
                            start
                                .ypReportedErrorMicroarcseconds
                        )
                        * eopRadiansPerMicroarcsecond,
                    source: polarSource,
                    usesPrediction:
                        polarSource == .predicted
                )
            )
        }

        let endIndex = startIndex + 1
        guard records.indices.contains(endIndex),
              records[endIndex].mjdUtc
                == start.mjdUtc + 1
        else {
            return nil
        }
        let fraction =
            mjdUtc - Double(start.mjdUtc)
        guard fraction > 0, fraction < 1,
              records.count >= 4
        else {
            return nil
        }

        let dut1End = records[endIndex]
        let rawDut1Difference =
            dut1End.dut1Microseconds
            - start.dut1Microseconds
        let leapStepMicroseconds: Int
        if abs(rawDut1Difference)
            > eopMicroUnitsPerUnit / 2
        {
            leapStepMicroseconds =
                Int(
                    (
                        Double(rawDut1Difference)
                            / Double(eopMicroUnitsPerUnit)
                    ).rounded()
                ) * eopMicroUnitsPerUnit
        } else {
            leapStepMicroseconds = 0
        }
        let adjustedDut1End =
            dut1End.dut1Microseconds
            - leapStepMicroseconds
        let dut1Microseconds =
            Double(start.dut1Microseconds)
            + fraction
                * Double(
                    adjustedDut1End
                        - start.dut1Microseconds
                )

        let windowStart = max(
            0,
            min(startIndex - 1, records.count - 4)
        )
        let support =
            Array(records[windowStart..<(windowStart + 4)])
        var weights = Array(repeating: 1.0, count: 4)
        for index in support.indices {
            for otherIndex in support.indices
            where otherIndex != index {
                weights[index] *=
                    (
                        mjdUtc
                            - Double(
                                support[otherIndex].mjdUtc
                            )
                    )
                    / Double(
                        support[index].mjdUtc
                            - support[otherIndex].mjdUtc
                    )
            }
        }

        func weightedValue(
            _ value:
                (IERSEarthOrientationDailyRecordV1) -> Int
        ) -> Double {
            zip(support, weights).reduce(0) {
                $0 + $1.1 * Double(value($1.0))
            }
        }
        func reportedErrorEnvelope(
            _ value:
                (IERSEarthOrientationDailyRecordV1) -> Int
        ) -> Double {
            zip(support, weights).reduce(0) {
                $0 + abs($1.1) * Double(value($1.0))
            }
        }
        let usesPrediction =
            zip(support, weights).contains {
                abs($0.1) > Double.ulpOfOne * 8
                    && $0.0.polarMotionStatus
                        == .predicted
            }

        return IERSEarthOrientationEstimateV1(
            dut1: IERSDUT1EstimateV1(
                dut1Seconds:
                    dut1Microseconds
                    / Double(eopMicroUnitsPerUnit),
                source:
                    start.dut1Status == .observed
                        && dut1End.dut1Status == .observed
                    ? .observed
                    : .predicted,
                uncertaintySeconds:
                    Double(
                        max(
                            start
                                .dut1ReportedErrorMicroseconds,
                            dut1End
                                .dut1ReportedErrorMicroseconds
                        )
                    ) / Double(eopMicroUnitsPerUnit)
            ),
            polarMotion: IERSPolarMotionEstimateV1(
                xpRadians:
                    weightedValue(\.xpMicroarcseconds)
                    * eopRadiansPerMicroarcsecond,
                ypRadians:
                    weightedValue(\.ypMicroarcseconds)
                    * eopRadiansPerMicroarcsecond,
                xpReportedErrorRadians:
                    reportedErrorEnvelope(
                        \.xpReportedErrorMicroarcseconds
                    ) * eopRadiansPerMicroarcsecond,
                ypReportedErrorRadians:
                    reportedErrorEnvelope(
                        \.ypReportedErrorMicroarcseconds
                    ) * eopRadiansPerMicroarcsecond,
                source: usesPrediction
                    ? .predicted
                    : .observed,
                usesPrediction: usesPrediction
            )
        )
    }
}

public enum IERSEarthOrientationDecoderV1 {
    public static func decodeChunk(
        from data: Data
    ) throws -> [IERSEarthOrientationDailyRecordV1] {
        try IERSEarthOrientationValidationV1
            .validateChunkObjectShape(data)
        let chunk: EncodedIERSEarthOrientationChunkV1
        do {
            chunk = try JSONDecoder().decode(
                EncodedIERSEarthOrientationChunkV1.self,
                from: data
            )
        } catch {
            throw IERSEarthOrientationError.invalidChunk(
                "JSON decode: \(error.localizedDescription)"
            )
        }
        guard chunk.schemaVersion == 1,
              chunk.recordCount >= 1,
              chunk.recordCount <= 4_096
        else {
            throw IERSEarthOrientationError.invalidChunk(
                "header"
            )
        }

        let polarStatuses = try decodeStatuses(
            chunk.polarMotionQualityRanges,
            recordCount: chunk.recordCount,
            label: "polar motion"
        )
        let dut1Statuses = try decodeStatuses(
            chunk.dut1QualityRanges,
            recordCount: chunk.recordCount,
            label: "DUT1"
        )
        let dut1 = try decodeDeltaSeries(
            chunk.dut1MicrosecondsDelta,
            recordCount: chunk.recordCount,
            label: "DUT1"
        )
        let dut1Error = try decodeDeltaSeries(
            chunk.dut1ReportedErrorMicrosecondsDelta,
            recordCount: chunk.recordCount,
            label: "DUT1 reported error"
        )
        let xp = try decodeDeltaSeries(
            chunk.xpMicroarcsecondsDelta,
            recordCount: chunk.recordCount,
            label: "xp"
        )
        let xpError = try decodeDeltaSeries(
            chunk.xpReportedErrorMicroarcsecondsDelta,
            recordCount: chunk.recordCount,
            label: "xp reported error"
        )
        let yp = try decodeDeltaSeries(
            chunk.ypMicroarcsecondsDelta,
            recordCount: chunk.recordCount,
            label: "yp"
        )
        let ypError = try decodeDeltaSeries(
            chunk.ypReportedErrorMicroarcsecondsDelta,
            recordCount: chunk.recordCount,
            label: "yp reported error"
        )

        var records:
            [IERSEarthOrientationDailyRecordV1] = []
        records.reserveCapacity(chunk.recordCount)
        for index in 0..<chunk.recordCount {
            let mjdResult =
                chunk.startMjdUtc.addingReportingOverflow(
                    index
                )
            guard !mjdResult.overflow else {
                throw IERSEarthOrientationError.invalidChunk(
                    "MJD overflow"
                )
            }
            records.append(
                IERSEarthOrientationDailyRecordV1(
                    mjdUtc: mjdResult.partialValue,
                    polarMotionStatus:
                        polarStatuses[index],
                    xpMicroarcseconds: xp[index],
                    xpReportedErrorMicroarcseconds:
                        xpError[index],
                    ypMicroarcseconds: yp[index],
                    ypReportedErrorMicroarcseconds:
                        ypError[index],
                    dut1Status: dut1Statuses[index],
                    dut1Microseconds: dut1[index],
                    dut1ReportedErrorMicroseconds:
                        dut1Error[index]
                )
            )
        }
        try IERSEarthOrientationValidationV1
            .validateDecodedRecords(records)
        return records
    }

    fileprivate static func decodeManifest(
        from data: Data
    ) throws -> IERSEarthOrientationManifestV1 {
        try IERSEarthOrientationValidationV1
            .validateManifestObjectShape(data)
        let manifest: IERSEarthOrientationManifestV1
        do {
            manifest = try JSONDecoder().decode(
                IERSEarthOrientationManifestV1.self,
                from: data
            )
        } catch {
            throw IERSEarthOrientationError.invalidManifest(
                "JSON decode: \(error.localizedDescription)"
            )
        }
        try IERSEarthOrientationValidationV1
            .validate(manifest)
        return manifest
    }

    private static func decodeStatuses(
        _ ranges: [IERSEarthOrientationQualityRangeV1],
        recordCount: Int,
        label: String
    ) throws -> [IERSEarthOrientationRecordStatusV1] {
        var statuses =
            Array<IERSEarthOrientationRecordStatusV1?>(
                repeating: nil,
                count: recordCount
            )
        var expectedStart = 0
        var predictionStarted = false
        for range in ranges {
            guard range.startOffset == expectedStart,
                  range.endOffsetExclusive
                    > range.startOffset,
                  range.endOffsetExclusive <= recordCount
            else {
                throw IERSEarthOrientationError.invalidChunk(
                    "\(label) quality range"
                )
            }
            if predictionStarted,
               range.status == .observed
            {
                throw IERSEarthOrientationError.invalidChunk(
                    "\(label) I after P"
                )
            }
            if range.status == .predicted {
                predictionStarted = true
            }
            statuses.replaceSubrange(
                range.startOffset..<range.endOffsetExclusive,
                with: repeatElement(
                    Optional(range.status),
                    count:
                        range.endOffsetExclusive
                        - range.startOffset
                )
            )
            expectedStart = range.endOffsetExclusive
        }
        guard expectedStart == recordCount,
              !statuses.contains(where: { $0 == nil })
        else {
            throw IERSEarthOrientationError.invalidChunk(
                "\(label) quality coverage"
            )
        }
        return statuses.map { $0! }
    }

    private static func decodeDeltaSeries(
        _ deltas: [Int],
        recordCount: Int,
        label: String
    ) throws -> [Int] {
        guard deltas.count == recordCount else {
            throw IERSEarthOrientationError.invalidChunk(
                "\(label) series length"
            )
        }
        var values: [Int] = []
        values.reserveCapacity(recordCount)
        var value = 0
        for (index, delta) in deltas.enumerated() {
            if index == 0 {
                value = delta
            } else {
                let result =
                    value.addingReportingOverflow(delta)
                guard !result.overflow else {
                    throw IERSEarthOrientationError
                        .invalidChunk(
                            "\(label) delta overflow"
                        )
                }
                value = result.partialValue
            }
            values.append(value)
        }
        return values
    }
}

private struct EncodedIERSEarthOrientationChunkV1:
    Decodable
{
    let schemaVersion: Int
    let startMjdUtc: Int
    let recordCount: Int
    let dut1QualityRanges:
        [IERSEarthOrientationQualityRangeV1]
    let polarMotionQualityRanges:
        [IERSEarthOrientationQualityRangeV1]
    let dut1MicrosecondsDelta: [Int]
    let dut1ReportedErrorMicrosecondsDelta: [Int]
    let xpMicroarcsecondsDelta: [Int]
    let xpReportedErrorMicroarcsecondsDelta: [Int]
    let ypMicroarcsecondsDelta: [Int]
    let ypReportedErrorMicroarcsecondsDelta: [Int]
}

private struct IERSEarthOrientationQualityRangeV1:
    Decodable
{
    let startOffset: Int
    let endOffsetExclusive: Int
    let status: IERSEarthOrientationRecordStatusV1

    init(from decoder: Decoder) throws {
        var values = try decoder.unkeyedContainer()
        startOffset = try values.decode(Int.self)
        endOffsetExclusive = try values.decode(Int.self)
        status = try values.decode(
            IERSEarthOrientationRecordStatusV1.self
        )
        guard values.isAtEnd else {
            throw DecodingError.dataCorruptedError(
                in: values,
                debugDescription:
                    "quality range must have three values"
            )
        }
    }
}

private struct IERSEarthOrientationManifestV1:
    Decodable
{
    let schemaVersion: Int
    let product: String
    let timeScale: String
    let units: Units
    let source: Source
    let statusCodes: StatusCodes
    let encoding: Encoding
    let coverage: IERSEarthOrientationCoverageV1
    let chunks: [IERSEarthOrientationChunkDescriptorV1]

    struct Units: Decodable {
        let mjdUtc: String
        let dut1: String
        let dut1ReportedError: String
        let polarMotion: String
        let polarMotionReportedError: String
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
        let reportedErrorSemantics: String
    }

    struct StatusCodes: Decodable {
        let iers: String
        let predicted: String

        enum CodingKeys: String, CodingKey {
            case iers = "I"
            case predicted = "P"
        }
    }

    struct Encoding: Decodable {
        let mjdUtc: String
        let numeric: String
        let dut1IntegerUnit: String
        let polarMotionIntegerUnit: String
        let quality: String
        let maximumDut1QuantizationErrorSeconds:
            Double
        let maximumPolarMotionQuantizationErrorArcseconds:
            Double
        let canonicalRecordColumns: [String]
    }
}

private enum IERSEarthOrientationValidationV1 {
    private static let manifestKeys: Set<String> = [
        "schemaVersion",
        "product",
        "timeScale",
        "units",
        "source",
        "statusCodes",
        "encoding",
        "coverage",
        "chunks",
    ]
    private static let chunkKeys: Set<String> = [
        "schemaVersion",
        "startMjdUtc",
        "recordCount",
        "dut1QualityRanges",
        "polarMotionQualityRanges",
        "dut1MicrosecondsDelta",
        "dut1ReportedErrorMicrosecondsDelta",
        "xpMicroarcsecondsDelta",
        "xpReportedErrorMicroarcsecondsDelta",
        "ypMicroarcsecondsDelta",
        "ypReportedErrorMicroarcsecondsDelta",
    ]

    static func validateManifestObjectShape(
        _ data: Data
    ) throws {
        let root = try dictionary(
            data,
            manifest: true,
            context: "manifest"
        )
        try requireKeys(
            root,
            manifestKeys,
            manifest: true,
            context: "manifest"
        )
        try requireKeys(
            root["units"],
            [
                "mjdUtc",
                "dut1",
                "dut1ReportedError",
                "polarMotion",
                "polarMotionReportedError",
            ],
            manifest: true,
            context: "units"
        )
        try requireKeys(
            root["source"],
            [
                "title",
                "url",
                "formatUrl",
                "checksumUrl",
                "productMetadataUrl",
                "retrievedAt",
                "sourceLastModified",
                "sourceSha256",
                "officialSourceSha512",
                "formatSha256",
                "checksumSha256",
                "attribution",
                "distributionStatement",
                "distributionUrl",
                "rawSnapshot",
                "formatSnapshot",
                "checksumSnapshot",
                "reportedErrorSemantics",
            ],
            manifest: true,
            context: "source"
        )
        try requireKeys(
            root["statusCodes"],
            ["I", "P"],
            manifest: true,
            context: "statusCodes"
        )
        try requireKeys(
            root["encoding"],
            [
                "mjdUtc",
                "numeric",
                "dut1IntegerUnit",
                "polarMotionIntegerUnit",
                "quality",
                "maximumDut1QuantizationErrorSeconds",
                "maximumPolarMotionQuantizationErrorArcseconds",
                "canonicalRecordColumns",
            ],
            manifest: true,
            context: "encoding"
        )
        guard let coverage =
            root["coverage"] as? [String: Any]
        else {
            throw IERSEarthOrientationError
                .invalidManifest("coverage object")
        }
        try requireKeys(
            coverage,
            [
                "firstSampleMjdUtc",
                "lastSampleMjdUtc",
                "recordCount",
                "sourceRowCount",
                "polarMotion",
                "dut1",
            ],
            manifest: true,
            context: "coverage"
        )
        try requireKeys(
            coverage["polarMotion"],
            [
                "iersThroughMjdUtc",
                "predictionStartsMjdUtc",
                "iersCount",
                "predictedCount",
                "missingTailRows",
            ],
            manifest: true,
            context: "polarMotion coverage"
        )
        try requireKeys(
            coverage["dut1"],
            [
                "iersThroughMjdUtc",
                "predictionStartsMjdUtc",
                "iersCount",
                "predictedCount",
                "missingTailRows",
                "leapSecondBoundaryCount",
            ],
            manifest: true,
            context: "DUT1 coverage"
        )
        guard let chunks =
            root["chunks"] as? [Any]
        else {
            throw IERSEarthOrientationError
                .invalidManifest("chunks array")
        }
        let descriptorKeys: Set<String> = [
            "file",
            "startMjdUtc",
            "endMjdUtc",
            "recordCount",
            "polarMotionIersCount",
            "polarMotionPredictedCount",
            "dut1IersCount",
            "dut1PredictedCount",
            "rawBytes",
            "gzipBytes",
            "sha256",
        ]
        for (index, chunk) in chunks.enumerated() {
            try requireKeys(
                chunk,
                descriptorKeys,
                manifest: true,
                context: "chunk descriptor \(index)"
            )
        }
    }

    static func validateChunkObjectShape(
        _ data: Data
    ) throws {
        let root = try dictionary(
            data,
            manifest: false,
            context: "chunk"
        )
        try requireKeys(
            root,
            chunkKeys,
            manifest: false,
            context: "chunk"
        )
    }

    static func validate(
        _ manifest: IERSEarthOrientationManifestV1
    ) throws {
        let units = manifest.units
        let source = manifest.source
        let encoding = manifest.encoding
        let coverage = manifest.coverage
        guard manifest.schemaVersion == 1,
              manifest.product
                == "IERS Bulletin A finals2000A Earth orientation",
              manifest.timeScale == "UTC",
              units.mjdUtc == "day",
              units.dut1 == "second",
              units.dut1ReportedError == "second",
              units.polarMotion == "arcsecond",
              units.polarMotionReportedError
                == "arcsecond",
              manifest.statusCodes.iers == "iers",
              manifest.statusCodes.predicted
                == "predicted",
              encoding.dut1IntegerUnit == "microsecond",
              encoding.polarMotionIntegerUnit
                == "microarcsecond",
              encoding.mjdUtc
                == "chunk.startMjdUtc + zero-based record index",
              encoding.numeric
                == "each series stores its first absolute integer followed by signed daily deltas",
              encoding.quality
                == "independent DUT1 and polar-motion ranges are [startOffset, endOffsetExclusive, I|P]",
              encoding
                .maximumDut1QuantizationErrorSeconds
                == 0.000_000_5,
              encoding
                .maximumPolarMotionQuantizationErrorArcseconds
                == 0.000_000_5,
              encoding.canonicalRecordColumns == [
                  "mjdUtc",
                  "polarMotionStatus",
                  "xpMicroarcseconds",
                  "xpReportedErrorMicroarcseconds",
                  "ypMicroarcseconds",
                  "ypReportedErrorMicroarcseconds",
                  "dut1Status",
                  "dut1Microseconds",
                  "dut1ReportedErrorMicroseconds",
              ]
        else {
            throw IERSEarthOrientationError.invalidManifest(
                "schemaまたはencoding"
            )
        }

        let sourceStrings = [
            source.title,
            source.url,
            source.formatUrl,
            source.checksumUrl,
            source.productMetadataUrl,
            source.retrievedAt,
            source.sourceLastModified,
            source.attribution,
            source.distributionStatement,
            source.distributionUrl,
            source.rawSnapshot,
            source.formatSnapshot,
            source.checksumSnapshot,
            source.reportedErrorSemantics,
        ]
        guard source.title
            == "IERS Bulletin A finals2000A",
            sourceStrings.allSatisfy({ !$0.isEmpty }),
            URL(string: source.url)?.scheme == "https",
            URL(string: source.formatUrl)?.scheme == "https",
            URL(string: source.checksumUrl)?.scheme == "https",
            URL(string: source.productMetadataUrl)?.scheme
                == "https",
            URL(string: source.distributionUrl)?.scheme
                == "https",
            isLowercaseHex(source.sourceSha256, count: 64),
            isLowercaseHex(
                source.officialSourceSha512,
                count: 128
            ),
            isLowercaseHex(source.formatSha256, count: 64),
            isLowercaseHex(
                source.checksumSha256,
                count: 64
            )
        else {
            throw IERSEarthOrientationError.invalidManifest(
                "source metadata"
            )
        }

        guard coverage.recordCount > 0,
              safeSum(
                  coverage.firstSampleMjdUtc,
                  coverage.recordCount - 1
              ) == coverage.lastSampleMjdUtc,
              coverage.sourceRowCount >= coverage.recordCount,
              validateObservableCoverage(
                  coverage.polarMotion,
                  recordCount: coverage.recordCount,
                  sourceRowCount: coverage.sourceRowCount
              ),
              validateDUT1Coverage(
                  coverage.dut1,
                  recordCount: coverage.recordCount,
                  sourceRowCount: coverage.sourceRowCount
              ),
              (1...16).contains(manifest.chunks.count)
        else {
            throw IERSEarthOrientationError.invalidManifest(
                "coverage"
            )
        }

        var nextStart = coverage.firstSampleMjdUtc
        var recordCount = 0
        var polarIersCount = 0
        var polarPredictedCount = 0
        var dut1IersCount = 0
        var dut1PredictedCount = 0
        var polarPredictionStarted = false
        var dut1PredictionStarted = false
        var seenStarts = Set<Int>()
        for descriptor in manifest.chunks {
            let polarCount = safeSum(
                descriptor.polarMotionIersCount,
                descriptor.polarMotionPredictedCount
            )
            let dut1Count = safeSum(
                descriptor.dut1IersCount,
                descriptor.dut1PredictedCount
            )
            guard descriptor.startMjdUtc == nextStart,
                  descriptor.recordCount >= 1,
                  descriptor.recordCount <= 4_096,
                  safeSum(
                      descriptor.startMjdUtc,
                      descriptor.recordCount - 1
                  ) == descriptor.endMjdUtc,
                  polarCount == descriptor.recordCount,
                  dut1Count == descriptor.recordCount,
                  descriptor.polarMotionIersCount >= 0,
                  descriptor.polarMotionPredictedCount
                    >= 0,
                  descriptor.dut1IersCount >= 0,
                  descriptor.dut1PredictedCount >= 0,
                  !(polarPredictionStarted
                    && descriptor.polarMotionIersCount > 0),
                  !(dut1PredictionStarted
                    && descriptor.dut1IersCount > 0),
                  descriptor.rawBytes > 0,
                  descriptor.rawBytes <= 262_144,
                  descriptor.gzipBytes > 0,
                  descriptor.gzipBytes <= 65_536,
                  descriptor.gzipBytes
                    <= descriptor.rawBytes,
                  isLowercaseHex(
                      descriptor.sha256,
                      count: 64
                  ),
                  descriptor.file
                    == "shared/eop/eop/"
                        + "\(descriptor.startMjdUtc).v1.json",
                  seenStarts.insert(
                      descriptor.startMjdUtc
                  ).inserted
            else {
                throw IERSEarthOrientationError
                    .invalidManifest(
                        "chunk descriptor"
                    )
            }
            if descriptor.polarMotionPredictedCount > 0 {
                polarPredictionStarted = true
            }
            if descriptor.dut1PredictedCount > 0 {
                dut1PredictionStarted = true
            }
            guard let followingStart = safeSum(
                descriptor.endMjdUtc,
                1
            ),
                let nextRecordCount = safeSum(
                    recordCount,
                    descriptor.recordCount
                ),
                let nextPolarIers = safeSum(
                    polarIersCount,
                    descriptor.polarMotionIersCount
                ),
                let nextPolarPredicted = safeSum(
                    polarPredictedCount,
                    descriptor
                        .polarMotionPredictedCount
                ),
                let nextDut1Iers = safeSum(
                    dut1IersCount,
                    descriptor.dut1IersCount
                ),
                let nextDut1Predicted = safeSum(
                    dut1PredictedCount,
                    descriptor.dut1PredictedCount
                )
            else {
                throw IERSEarthOrientationError
                    .invalidManifest(
                        "chunk descriptor overflow"
                    )
            }
            nextStart = followingStart
            recordCount = nextRecordCount
            polarIersCount = nextPolarIers
            polarPredictedCount = nextPolarPredicted
            dut1IersCount = nextDut1Iers
            dut1PredictedCount = nextDut1Predicted
        }
        guard safeSum(coverage.lastSampleMjdUtc, 1)
            == nextStart,
            recordCount == coverage.recordCount,
            polarIersCount
                == coverage.polarMotion.iersCount,
            polarPredictedCount
                == coverage.polarMotion.predictedCount,
            dut1IersCount == coverage.dut1.iersCount,
            dut1PredictedCount
                == coverage.dut1.predictedCount
        else {
            throw IERSEarthOrientationError.invalidManifest(
                "chunk集計"
            )
        }
    }

    static func validate(
        records: [IERSEarthOrientationDailyRecordV1],
        against descriptor:
            IERSEarthOrientationChunkDescriptorV1
    ) throws {
        guard records.count == descriptor.recordCount,
              records.first?.mjdUtc
                == descriptor.startMjdUtc,
              records.last?.mjdUtc
                == descriptor.endMjdUtc,
              records.filter({
                  $0.polarMotionStatus == .observed
              }).count
                == descriptor.polarMotionIersCount,
              records.filter({
                  $0.polarMotionStatus == .predicted
              }).count
                == descriptor.polarMotionPredictedCount,
              records.filter({
                  $0.dut1Status == .observed
              }).count == descriptor.dut1IersCount,
              records.filter({
                  $0.dut1Status == .predicted
              }).count
                == descriptor.dut1PredictedCount
        else {
            throw IERSEarthOrientationError.invalidChunk(
                "\(descriptor.startMjdUtc) がmanifestと不一致"
            )
        }
    }

    static func validateLookupRecords(
        _ records: [IERSEarthOrientationDailyRecordV1]
    ) throws {
        try validateDecodedRecords(records)
        for pair in zip(records, records.dropFirst()) {
            guard pair.1.mjdUtc == pair.0.mjdUtc + 1
            else {
                throw IERSEarthOrientationError.invalidChunk(
                    "lookup windowに日次gap"
                )
            }
        }
    }

    static func validateDecodedRecords(
        _ records: [IERSEarthOrientationDailyRecordV1]
    ) throws {
        guard !records.isEmpty else {
            throw IERSEarthOrientationError.invalidChunk(
                "recordが空"
            )
        }
        var previous:
            IERSEarthOrientationDailyRecordV1?
        var polarPredictionStarted = false
        var dut1PredictionStarted = false
        for record in records {
            let polarRange: ClosedRange<Int> = (
                -2 * eopMicroUnitsPerUnit
            )...(2 * eopMicroUnitsPerUnit)
            let dut1Range: ClosedRange<Int> =
                (-eopMicroUnitsPerUnit)...eopMicroUnitsPerUnit
            guard polarRange.contains(
                record.xpMicroarcseconds
            ),
                polarRange.contains(
                    record.ypMicroarcseconds
                ),
                (0...eopMicroUnitsPerUnit).contains(
                    record
                        .xpReportedErrorMicroarcseconds
                ),
                (0...eopMicroUnitsPerUnit).contains(
                    record
                        .ypReportedErrorMicroarcseconds
                ),
                dut1Range.contains(
                    record.dut1Microseconds
                ),
                (0...eopMicroUnitsPerUnit).contains(
                    record
                        .dut1ReportedErrorMicroseconds
                )
            else {
                throw IERSEarthOrientationError.invalidChunk(
                    "record値が範囲外"
                )
            }
            if polarPredictionStarted,
               record.polarMotionStatus == .observed
            {
                throw IERSEarthOrientationError.invalidChunk(
                    "polar motion Pの後にI"
                )
            }
            if dut1PredictionStarted,
               record.dut1Status == .observed
            {
                throw IERSEarthOrientationError.invalidChunk(
                    "DUT1 Pの後にI"
                )
            }
            polarPredictionStarted =
                polarPredictionStarted
                || record.polarMotionStatus == .predicted
            dut1PredictionStarted =
                dut1PredictionStarted
                || record.dut1Status == .predicted
            if let previous {
                guard record.mjdUtc
                    == previous.mjdUtc + 1
                else {
                    throw IERSEarthOrientationError
                        .invalidChunk(
                            "MJDが日次連続でない"
                        )
                }
                try validateDUT1Discontinuity(
                    from: previous.dut1Microseconds,
                    to: record.dut1Microseconds
                )
            }
            previous = record
        }
    }

    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map {
            String(format: "%02x", $0)
        }.joined()
    }

    private static func validateObservableCoverage(
        _ observable:
            IERSEarthOrientationObservableCoverageV1,
        recordCount: Int,
        sourceRowCount: Int
    ) -> Bool {
        observable.iersCount > 0
            && observable.predictedCount > 0
            && safeSum(
                observable.iersCount,
                observable.predictedCount
            ) == recordCount
            && safeSum(
                observable.iersThroughMjdUtc,
                1
            ) == observable.predictionStartsMjdUtc
            && observable.missingTailRows >= 0
            && safeSum(
                recordCount,
                observable.missingTailRows
            ) == sourceRowCount
    }

    private static func validateDUT1Coverage(
        _ observable:
            IERSEarthOrientationDUT1CoverageV1,
        recordCount: Int,
        sourceRowCount: Int
    ) -> Bool {
        observable.iersCount > 0
            && observable.predictedCount > 0
            && safeSum(
                observable.iersCount,
                observable.predictedCount
            ) == recordCount
            && safeSum(
                observable.iersThroughMjdUtc,
                1
            ) == observable.predictionStartsMjdUtc
            && observable.missingTailRows >= 0
            && safeSum(
                recordCount,
                observable.missingTailRows
            ) == sourceRowCount
            && observable.leapSecondBoundaryCount >= 0
    }

    private static func validateDUT1Discontinuity(
        from start: Int,
        to end: Int
    ) throws {
        let difference = end - start
        guard abs(difference)
            > eopMicroUnitsPerUnit / 2
        else {
            return
        }
        let step = Int(
            (
                Double(difference)
                    / Double(eopMicroUnitsPerUnit)
            ).rounded()
        )
        let residual =
            difference - step * eopMicroUnitsPerUnit
        guard abs(step) == 1,
              abs(residual) <= 100_000
        else {
            throw IERSEarthOrientationError.invalidChunk(
                "説明できないDUT1不連続"
            )
        }
    }

    private static func dictionary(
        _ data: Data,
        manifest: Bool,
        context: String
    ) throws -> [String: Any] {
        let object: Any
        do {
            object = try JSONSerialization.jsonObject(
                with: data
            )
        } catch {
            if manifest {
                throw IERSEarthOrientationError
                    .invalidManifest("\(context) JSON")
            }
            throw IERSEarthOrientationError
                .invalidChunk("\(context) JSON")
        }
        guard let result = object as? [String: Any]
        else {
            if manifest {
                throw IERSEarthOrientationError
                    .invalidManifest("\(context) object")
            }
            throw IERSEarthOrientationError
                .invalidChunk("\(context) object")
        }
        return result
    }

    private static func requireKeys(
        _ value: Any?,
        _ expected: Set<String>,
        manifest: Bool,
        context: String
    ) throws {
        guard let dictionary =
            value as? [String: Any],
            Set(dictionary.keys) == expected
        else {
            if manifest {
                throw IERSEarthOrientationError
                    .invalidManifest("\(context) key")
            }
            throw IERSEarthOrientationError
                .invalidChunk("\(context) key")
        }
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
        let result =
            first.addingReportingOverflow(second)
        return result.overflow
            ? nil
            : result.partialValue
    }
}
