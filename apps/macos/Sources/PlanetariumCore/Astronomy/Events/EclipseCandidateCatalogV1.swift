import CryptoKit
import Foundation
import PlanetariumShared

public enum EclipseCandidateKindV1:
    String, Codable, Hashable, Sendable
{
    case solarEclipse = "solar-eclipse"
    case lunarEclipse = "lunar-eclipse"
    case lunarOccultation = "lunar-occultation"
}

public struct EclipseCandidateV1: Hashable, Sendable {
    public let id: String
    public let kind: EclipseCandidateKindV1
    public let classificationHint: String
    public let maximumJulianDateTDB: Double
    public let searchStartJulianDateTDB: Double
    public let searchEndJulianDateTDB: Double
    public let canonicalEpochUTC: Date
    public let dataVersion: String
    public let targetStarHR: Int?
    public let targetLabel: String?

    public var title: String {
        switch (kind, classificationHint) {
        case (.solarEclipse, "partial"):
            "部分日食"
        case (.solarEclipse, "annular"):
            "金環日食"
        case (.solarEclipse, "total"):
            "皆既日食"
        case (.solarEclipse, "hybrid"):
            "金環皆既日食"
        case (.lunarEclipse, "penumbral"):
            "半影月食"
        case (.lunarEclipse, "partial"):
            "部分月食"
        case (.lunarEclipse, "total"):
            "皆既月食"
        case (.lunarOccultation, "occultation"):
            "月による\(targetLabel ?? "恒星")の掩蔽"
        default:
            "天文現象"
        }
    }
}

public enum EclipseCandidateCatalogErrorV1:
    LocalizedError, Equatable, Sendable
{
    case invalidManifest(String)
    case invalidChunk(String)
    case resourceUnavailable(String)
    case invalidDateRange
    case dateRangeOutsideCoverage

    public var errorDescription: String? {
        switch self {
        case let .invalidManifest(reason):
            "天文現象候補manifestが不正です（\(reason)）。"
        case let .invalidChunk(reason):
            "天文現象候補chunkが不正です（\(reason)）。"
        case let .resourceUnavailable(reason):
            "天文現象候補を読み込めません（\(reason)）。"
        case .invalidDateRange:
            "天文現象の検索期間が不正です。"
        case .dateRangeOutsideCoverage:
            "天文現象の検索期間が収録期間外です。"
        }
    }
}

private struct EclipseCandidateManifestV1:
    Decodable, Sendable
{
    let schemaVersion: Int
    let model: String
    let coverage: Coverage
    let chunks: [Chunk]

    struct Coverage: Decodable, Sendable {
        let timeScale: String
        let startYear: Int
        let endYear: Int
        let endIsExclusive: Bool
        let chunkYears: Int
    }

    struct Chunk: Decodable, Sendable {
        let id: String
        let startYear: Int
        let endYear: Int
        let file: String
        let eventCount: Int
        let byteLength: Int
        let sha256: String
    }
}

private struct EclipseCandidateChunkV1:
    Decodable, Sendable
{
    let schemaVersion: Int
    let model: String
    let id: String
    let coverage: Coverage
    let events: [RawCandidate]

    struct Coverage: Decodable, Sendable {
        let startYear: Int
        let endYear: Int
        let endIsExclusive: Bool
        let timeScale: String
    }

    struct RawCandidate: Decodable, Sendable {
        let id: String
        let kind: EclipseCandidateKindV1
        let classificationHint: String
        let maximumJulianDateTdb: Double
        let searchStartJulianDateTdb: Double
        let searchEndJulianDateTdb: Double
        let target: Target?
    }

    struct Target: Decodable, Sendable {
        let hr: Int
        let hd: Int?
        let label: String
        let labelJa: String?
        let vMagnitude: Double
    }
}

private struct ValidatedEclipseCandidateManifestV1:
    Sendable
{
    let model: String
    let coverageStartYear: Int
    let coverageEndYear: Int
    let chunks: [EclipseCandidateManifestV1.Chunk]
}

/**
 Lazy, authenticated access to the bundled five-year event seed chunks.

 Candidate records are intentionally global and small. Local contact times
 are recomputed from DE442s after selection; this catalog never claims that a
 global event is visible from the observer's site.
 */
public actor EclipseCandidateCatalogV1 {
    private static let expectedModel =
        "de442s-mean-sphere-eclipse-candidates-v1"
    private static let chunkPathPrefix =
        "shared/events/chunks/"

    private let manifest: ValidatedEclipseCandidateManifestV1
    private let maximumCachedChunkCount: Int
    private let chunkDataLoader:
        @Sendable (String) throws -> Data
    private var cachedChunks:
        [String: [EclipseCandidateV1]] = [:]
    private var leastToMostRecentlyUsedChunkIDs: [String] = []

    public static func loadBundled(
        maximumCachedChunkCount: Int = 4
    ) throws -> EclipseCandidateCatalogV1 {
        let manifestData: Data
        do {
            manifestData = try SharedResources.eventCandidateData(
                for: .manifest
            )
        } catch {
            throw EclipseCandidateCatalogErrorV1
                .resourceUnavailable(
                    error.localizedDescription
                )
        }
        return try EclipseCandidateCatalogV1(
            manifestData: manifestData,
            maximumCachedChunkCount: maximumCachedChunkCount,
            chunkDataLoader: { fileName in
                try SharedResources.eventCandidateChunkData(
                    named: fileName
                )
            }
        )
    }

    public init(
        manifestData: Data,
        maximumCachedChunkCount: Int = 4,
        chunkDataLoader:
            @escaping @Sendable (String) throws -> Data
    ) throws {
        guard (1...8).contains(maximumCachedChunkCount) else {
            throw EclipseCandidateCatalogErrorV1
                .invalidManifest("cache上限")
        }
        manifest = try Self.validateManifest(manifestData)
        self.maximumCachedChunkCount =
            maximumCachedChunkCount
        self.chunkDataLoader = chunkDataLoader
    }

    public func candidates(
        from startUTC: Date,
        through endUTC: Date
    ) throws -> [EclipseCandidateV1] {
        let startSeconds =
            startUTC.timeIntervalSinceReferenceDate
        let endSeconds =
            endUTC.timeIntervalSinceReferenceDate
        guard
            startSeconds.isFinite,
            endSeconds.isFinite,
            startUTC <= endUTC
        else {
            throw EclipseCandidateCatalogErrorV1
                .invalidDateRange
        }

        let firstYear = Self.utcYear(startUTC)
        let lastYear = Self.utcYear(endUTC)
        guard
            firstYear >= manifest.coverageStartYear,
            lastYear < manifest.coverageEndYear
        else {
            throw EclipseCandidateCatalogErrorV1
                .dateRangeOutsideCoverage
        }

        let firstTDBYear = max(
            manifest.coverageStartYear,
            try EventTimeScales.tdbCalendarYear(
                tdbJulianDate:
                    EventTimeScales.utcToTDBJulianDate(
                        startUTC
                    )
            )
        )
        let lastTDBYear = min(
            manifest.coverageEndYear - 1,
            try EventTimeScales.tdbCalendarYear(
                tdbJulianDate:
                    EventTimeScales.utcToTDBJulianDate(
                        endUTC
                    )
            )
        )
        let descriptors = manifest.chunks.filter {
            $0.startYear <= lastTDBYear
                && $0.endYear > firstTDBYear
        }
        var result: [EclipseCandidateV1] = []
        for descriptor in descriptors {
            result.append(
                contentsOf: try chunk(for: descriptor)
            )
        }
        return result
            .filter {
                $0.canonicalEpochUTC >= startUTC
                    && $0.canonicalEpochUTC <= endUTC
            }
            .sorted {
                $0.canonicalEpochUTC
                    < $1.canonicalEpochUTC
            }
    }

    func cachedChunkIDsForTesting() -> [String] {
        leastToMostRecentlyUsedChunkIDs
    }

    private func chunk(
        for descriptor: EclipseCandidateManifestV1.Chunk
    ) throws -> [EclipseCandidateV1] {
        if let cached = cachedChunks[descriptor.id] {
            touchCachedChunk(descriptor.id)
            return cached
        }

        let fileName = try Self.safeChunkFileName(
            descriptor
        )
        let data: Data
        do {
            data = try chunkDataLoader(fileName)
        } catch {
            throw EclipseCandidateCatalogErrorV1
                .resourceUnavailable(
                    "\(fileName): \(error.localizedDescription)"
                )
        }
        guard data.count == descriptor.byteLength else {
            throw EclipseCandidateCatalogErrorV1.invalidChunk(
                "\(descriptor.id)のbyte length"
            )
        }
        let digest = SHA256.hash(data: data)
            .map { String(format: "%02x", $0) }
            .joined()
        guard digest == descriptor.sha256 else {
            throw EclipseCandidateCatalogErrorV1.invalidChunk(
                "\(descriptor.id)のSHA-256"
            )
        }
        let candidates = try Self.decodeChunk(
            data,
            descriptor: descriptor,
            model: manifest.model
        )
        cachedChunks[descriptor.id] = candidates
        leastToMostRecentlyUsedChunkIDs.append(
            descriptor.id
        )
        while cachedChunks.count > maximumCachedChunkCount {
            let removed =
                leastToMostRecentlyUsedChunkIDs.removeFirst()
            cachedChunks.removeValue(forKey: removed)
        }
        return candidates
    }

    private func touchCachedChunk(_ id: String) {
        if let index =
            leastToMostRecentlyUsedChunkIDs.firstIndex(of: id)
        {
            leastToMostRecentlyUsedChunkIDs.remove(at: index)
        }
        leastToMostRecentlyUsedChunkIDs.append(id)
    }

    private static func validateManifest(
        _ data: Data
    ) throws -> ValidatedEclipseCandidateManifestV1 {
        let decoded: EclipseCandidateManifestV1
        do {
            decoded = try JSONDecoder().decode(
                EclipseCandidateManifestV1.self,
                from: data
            )
        } catch {
            throw EclipseCandidateCatalogErrorV1
                .invalidManifest(
                    "JSON decode: \(error.localizedDescription)"
                )
        }
        guard
            decoded.schemaVersion == 1,
            decoded.model == expectedModel,
            decoded.coverage.timeScale == "TDB",
            decoded.coverage.startYear == 1900,
            decoded.coverage.endYear == 2101,
            decoded.coverage.endIsExclusive,
            decoded.coverage.chunkYears == 5,
            !decoded.chunks.isEmpty,
            decoded.chunks.count <= 64
        else {
            throw EclipseCandidateCatalogErrorV1
                .invalidManifest("headerまたはcoverage")
        }

        var expectedStartYear =
            decoded.coverage.startYear
        var identifiers = Set<String>()
        for descriptor in decoded.chunks {
            let expectedID =
                "\(descriptor.startYear)-\(descriptor.endYear)"
            guard
                descriptor.id == expectedID,
                descriptor.startYear == expectedStartYear,
                descriptor.endYear > descriptor.startYear,
                descriptor.endYear <=
                    decoded.coverage.endYear,
                descriptor.file ==
                    chunkPathPrefix
                    + descriptor.id
                    + ".v1.json",
                (0...2_000).contains(
                    descriptor.eventCount
                ),
                (1...524_288).contains(
                    descriptor.byteLength
                ),
                isLowercaseSHA256(descriptor.sha256),
                identifiers.insert(descriptor.id).inserted
            else {
                throw EclipseCandidateCatalogErrorV1
                    .invalidManifest(
                        "chunk \(descriptor.id)"
                    )
            }
            expectedStartYear = descriptor.endYear
        }
        guard expectedStartYear == decoded.coverage.endYear else {
            throw EclipseCandidateCatalogErrorV1
                .invalidManifest("chunk coverage")
        }
        return ValidatedEclipseCandidateManifestV1(
            model: decoded.model,
            coverageStartYear:
                decoded.coverage.startYear,
            coverageEndYear:
                decoded.coverage.endYear,
            chunks: decoded.chunks
        )
    }

    private static func safeChunkFileName(
        _ descriptor: EclipseCandidateManifestV1.Chunk
    ) throws -> String {
        let expected =
            chunkPathPrefix
            + descriptor.id
            + ".v1.json"
        guard descriptor.file == expected else {
            throw EclipseCandidateCatalogErrorV1
                .invalidManifest(
                    "chunk \(descriptor.id)のfile path"
                )
        }
        return "\(descriptor.id).v1.json"
    }

    private static func decodeChunk(
        _ data: Data,
        descriptor: EclipseCandidateManifestV1.Chunk,
        model: String
    ) throws -> [EclipseCandidateV1] {
        let decoded: EclipseCandidateChunkV1
        do {
            decoded = try JSONDecoder().decode(
                EclipseCandidateChunkV1.self,
                from: data
            )
        } catch {
            throw EclipseCandidateCatalogErrorV1
                .invalidChunk(
                    "\(descriptor.id) JSON decode: "
                    + error.localizedDescription
                )
        }
        guard
            decoded.schemaVersion == 1,
            decoded.model == model,
            decoded.id == descriptor.id,
            decoded.coverage.startYear ==
                descriptor.startYear,
            decoded.coverage.endYear ==
                descriptor.endYear,
            decoded.coverage.endIsExclusive,
            decoded.coverage.timeScale == "TDB",
            decoded.events.count == descriptor.eventCount
        else {
            throw EclipseCandidateCatalogErrorV1
                .invalidChunk(
                    "\(descriptor.id) header"
                )
        }

        var identifiers = Set<String>()
        var result: [EclipseCandidateV1] = []
        result.reserveCapacity(decoded.events.count)
        for raw in decoded.events {
            guard
                candidateIDIsValid(
                    raw.id,
                    kind: raw.kind
                ),
                classificationIsValid(
                    raw.classificationHint,
                    kind: raw.kind
                ),
                raw.maximumJulianDateTdb.isFinite,
                raw.searchStartJulianDateTdb.isFinite,
                raw.searchEndJulianDateTdb.isFinite,
                raw.searchStartJulianDateTdb
                    < raw.maximumJulianDateTdb,
                raw.maximumJulianDateTdb
                    < raw.searchEndJulianDateTdb,
                identifiers.insert(raw.id).inserted
            else {
                throw EclipseCandidateCatalogErrorV1
                    .invalidChunk(
                        "\(descriptor.id) event \(raw.id)"
                    )
            }
            let date: Date
            do {
                date = try EventTimeScales.tdbToUTCDate(
                    tdbJulianDate:
                        raw.maximumJulianDateTdb
                )
            } catch {
                throw EclipseCandidateCatalogErrorV1
                    .invalidChunk(
                        "\(descriptor.id) event time"
                    )
            }
            guard
                try EventTimeScales.tdbCalendarYear(
                    tdbJulianDate:
                        raw.maximumJulianDateTdb
                ) >= descriptor.startYear,
                try EventTimeScales.tdbCalendarYear(
                    tdbJulianDate:
                        raw.maximumJulianDateTdb
                ) < descriptor.endYear
            else {
                throw EclipseCandidateCatalogErrorV1
                    .invalidChunk(
                        "\(descriptor.id) event coverage"
                    )
            }
            let targetStarHR: Int?
            let targetLabel: String?
            if raw.kind == .lunarOccultation {
                guard
                    let target = raw.target,
                    (1...9_110).contains(target.hr),
                    target.hd.map({ $0 > 0 }) ?? true,
                    !target.label.isEmpty,
                    target.vMagnitude.isFinite,
                    (-2...3).contains(
                        target.vMagnitude
                    )
                else {
                    throw EclipseCandidateCatalogErrorV1
                        .invalidChunk(
                            "\(descriptor.id) occultation target"
                        )
                }
                targetStarHR = target.hr
                targetLabel =
                    LunarOccultationTargetLabelFormatting
                    .displayLabel(
                        bscLabel: target.label,
                        localizedLabel: target.labelJa
                    )
            } else {
                guard raw.target == nil else {
                    throw EclipseCandidateCatalogErrorV1
                        .invalidChunk(
                            "\(descriptor.id) unexpected target"
                        )
                }
                targetStarHR = nil
                targetLabel = nil
            }
            result.append(
                EclipseCandidateV1(
                    id: raw.id,
                    kind: raw.kind,
                    classificationHint:
                        raw.classificationHint,
                    maximumJulianDateTDB:
                        raw.maximumJulianDateTdb,
                    searchStartJulianDateTDB:
                        raw.searchStartJulianDateTdb,
                    searchEndJulianDateTDB:
                        raw.searchEndJulianDateTdb,
                    canonicalEpochUTC: date,
                    dataVersion:
                        "\(model)/\(descriptor.id)",
                    targetStarHR: targetStarHR,
                    targetLabel: targetLabel
                )
            )
        }
        return result
    }

    private static func isLowercaseSHA256(
        _ value: String
    ) -> Bool {
        value.count == 64
            && value.allSatisfy {
                $0.isNumber || ("a"..."f").contains(
                    String($0)
                )
            }
    }

    private static func candidateIDIsValid(
        _ id: String,
        kind: EclipseCandidateKindV1
    ) -> Bool {
        let prefix =
            kind == .solarEclipse
            ? "se-"
            : kind == .lunarEclipse
                ? "le-"
                : "lo-"
        guard id.hasPrefix(prefix) else {
            return false
        }
        if kind == .lunarOccultation {
            let parts = id.dropFirst(prefix.count)
                .split(separator: "-")
            return parts.count == 2
                && parts[0].count == 8
                && parts[0].allSatisfy(\.isNumber)
                && parts[1].hasPrefix("hr")
                && parts[1].dropFirst(2)
                    .allSatisfy(\.isNumber)
        }
        let suffix = id.dropFirst(prefix.count)
        return suffix.count == 8
            && suffix.allSatisfy(\.isNumber)
    }

    private static func classificationIsValid(
        _ value: String,
        kind: EclipseCandidateKindV1
    ) -> Bool {
        switch kind {
        case .solarEclipse:
            ["partial", "annular", "total", "hybrid"]
                .contains(value)
        case .lunarEclipse:
            ["penumbral", "partial", "total"]
                .contains(value)
        case .lunarOccultation:
            value == "occultation"
        }
    }

    private static func utcYear(_ date: Date) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone =
            TimeZone(secondsFromGMT: 0)!
        return calendar.component(.year, from: date)
    }
}
