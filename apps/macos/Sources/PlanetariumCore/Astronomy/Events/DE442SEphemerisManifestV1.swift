import Foundation

public enum DE442SEphemerisError:
    LocalizedError, Equatable, Sendable
{
    case invalidManifest(String)
    case invalidChunk(String)
    case resourceUnavailable(String)
    case nonFiniteJulianDate
    case julianDateOutsideCoverage

    public var errorDescription: String? {
        switch self {
        case let .invalidManifest(reason):
            "DE442s manifestが不正です（\(reason)）。"
        case let .invalidChunk(reason):
            "DE442s chunkが不正です（\(reason)）。"
        case let .resourceUnavailable(reason):
            "DE442s共有暦を読み込めません（\(reason)）。"
        case .nonFiniteJulianDate:
            "TDBユリウス日は有限値である必要があります。"
        case .julianDateOutsideCoverage:
            "TDBユリウス日がDE442s共有暦の収録期間外です。"
        }
    }
}

public enum DE442SEphemerisSeriesV1:
    String, CaseIterable, Codable, Hashable, Sendable
{
    case earthMoonBarycenter = "emb"
    case sun
    case moonFromEarthMoonBarycenter = "moon"

    var targetNaifID: Int {
        switch self {
        case .earthMoonBarycenter:
            3
        case .sun:
            10
        case .moonFromEarthMoonBarycenter:
            301
        }
    }

    var centerNaifID: Int {
        switch self {
        case .earthMoonBarycenter, .sun:
            0
        case .moonFromEarthMoonBarycenter:
            3
        }
    }

    var coefficientCountPerAxis: Int {
        switch self {
        case .earthMoonBarycenter,
             .moonFromEarthMoonBarycenter:
            13
        case .sun:
            11
        }
    }

    var recordIntervalSeconds: Double {
        switch self {
        case .earthMoonBarycenter, .sun:
            1_382_400
        case .moonFromEarthMoonBarycenter:
            345_600
        }
    }
}

struct DE442SManifestV1: Codable, Sendable {
    let schemaVersion: Int
    let model: String
    let source: Source
    let coverage: Coverage
    let units: Units
    let binaryFormat: BinaryFormat
    let series: [SourceSeries]
    let chunks: [Chunk]
    let statistics: Statistics

    struct Source: Codable, Sendable {
        let release: String
        let kernelFile: String
        let kernelUrl: String
        let technicalCommentsUrl: String
        let byteLength: Int
        let md5: String
        let sha256: String
        let binaryFileFormat: String
    }

    struct Coverage: Codable, Sendable {
        let calendar: String
        let timeScale: String
        let startIsoTdb: String
        let endIsoTdb: String
        let startJulianDateTdb: Double
        let endJulianDateTdb: Double
        let startSecondsPastJ2000Tdb: Double
        let endSecondsPastJ2000Tdb: Double
        let endIsIncluded: Bool
        let chunkYears: Int
        let chunkBoundaryRule: String
    }

    struct Units: Codable, Sendable {
        let position: String
        let velocity: String
        let recordTime: String
        let julianDate: String
    }

    struct BinaryFormat: Codable, Sendable {
        let magic: String
        let formatVersion: Int
        let byteOrder: String
        let coefficientEncoding: String
        let timeEncoding: String
        let headerBytes: Int
        let seriesDirectoryEntryBytes: Int
        let headerLayout: [String]
        let directoryLayout: [String]
        let recordLayout: [String]
        let evaluation: String
    }

    struct SourceSeries: Codable, Sendable {
        let id: DE442SEphemerisSeriesV1
        let label: String
        let targetNaifId: Int
        let centerNaifId: Int
        let frameNaifId: Int
        let frame: String
        let spkDataType: Int
        let sourceInitialAddress: Int
        let sourceFinalAddress: Int
        let sourceStartSecondsPastJ2000Tdb: Double
        let sourceEndSecondsPastJ2000Tdb: Double
        let sourceInitialEpochSecondsPastJ2000Tdb: Double
        let sourceRecordIntervalSeconds: Double
        let sourceRecordCount: Int
        let coefficientCountPerAxis: Int
        let degree: Int
    }

    struct Chunk: Codable, Sendable {
        let id: String
        let startYear: Int
        let endYear: Int
        let startJulianDateTdb: Double
        let endJulianDateTdb: Double
        let startSecondsPastJ2000Tdb: Double
        let endSecondsPastJ2000Tdb: Double
        let file: String
        let byteLength: Int
        let gzipByteLength: Int
        let sha256: String
        let series: [ChunkSeries]
    }

    struct ChunkSeries: Codable, Sendable {
        let id: DE442SEphemerisSeriesV1
        let targetNaifId: Int
        let centerNaifId: Int
        let frameNaifId: Int
        let spkDataType: Int
        let recordCount: Int
        let coefficientCountPerAxis: Int
        let degree: Int
        let dataOffsetBytes: Int
        let recordStrideBytes: Int
        let firstRecordStartSecondsPastJ2000Tdb: Double
        let lastRecordEndSecondsPastJ2000Tdb: Double
        let sourceFirstRecordIndex: Int
        let sourceLastRecordIndex: Int
        let recordIntervalSeconds: Double
    }

    struct Statistics: Codable, Sendable {
        let chunkCount: Int
        let totalChunkBytes: Int
        let totalChunkGzipBytes: Int
        let maximumChunkBytes: Int
        let maximumChunkGzipBytes: Int
    }
}

struct DE442SValidatedManifestV1: Sendable {
    let model: String
    let sourceSHA256: String
    let coverageStartJulianDateTdb: Double
    let coverageEndJulianDateTdb: Double
    let coverageStartSecondsPastJ2000Tdb: Double
    let coverageEndSecondsPastJ2000Tdb: Double
    let chunks: [DE442SManifestV1.Chunk]
}

enum DE442SManifestValidatorV1 {
    static let chunkPathPrefix =
        "shared/ephemeris/de442s/chunks/"

    private static let expectedSourceSHA256 =
        "54d97562a5b094d298b1b8eafa5a2e17" +
        "e3e010ce85e1a366d07f003ad159323c"
    private static let expectedChunkBoundaryRule =
        "start-inclusive/end-exclusive selection except artifact end; " +
        "the source record selected at each boundary is duplicated"

    static func decodeAndValidate(
        _ data: Data
    ) throws -> DE442SValidatedManifestV1 {
        let manifest: DE442SManifestV1
        do {
            manifest = try JSONDecoder().decode(
                DE442SManifestV1.self,
                from: data
            )
        } catch {
            throw DE442SEphemerisError.invalidManifest(
                "JSONをdecodeできません: \(error.localizedDescription)"
            )
        }
        try validateRoot(manifest)
        try validateSourceSeries(manifest.series)
        try validateChunks(manifest)
        return DE442SValidatedManifestV1(
            model: manifest.model,
            sourceSHA256: manifest.source.sha256,
            coverageStartJulianDateTdb:
                manifest.coverage.startJulianDateTdb,
            coverageEndJulianDateTdb:
                manifest.coverage.endJulianDateTdb,
            coverageStartSecondsPastJ2000Tdb:
                manifest.coverage.startSecondsPastJ2000Tdb,
            coverageEndSecondsPastJ2000Tdb:
                manifest.coverage.endSecondsPastJ2000Tdb,
            chunks: manifest.chunks
        )
    }

    static func safeChunkFileName(
        for descriptor: DE442SManifestV1.Chunk
    ) throws -> String {
        let expectedFile =
            chunkPathPrefix + descriptor.id + ".v1.bin"
        guard descriptor.file == expectedFile else {
            throw DE442SEphemerisError.invalidManifest(
                "chunk \(descriptor.id)のfile path"
            )
        }
        let fileName = String(
            descriptor.file.dropFirst(chunkPathPrefix.count)
        )
        guard
            fileName == "\(descriptor.id).v1.bin",
            !fileName.contains("/"),
            !fileName.contains("\\"),
            !fileName.contains(".."),
            fileName.unicodeScalars.allSatisfy({
                $0.isASCII
            })
        else {
            throw DE442SEphemerisError.invalidManifest(
                "chunk \(descriptor.id)の安全でないfile path"
            )
        }
        return fileName
    }

    private static func validateRoot(
        _ manifest: DE442SManifestV1
    ) throws {
        guard manifest.schemaVersion == 1 else {
            throw invalid("schemaVersion")
        }
        guard manifest.model == "jpl-de442s-type2-float32" else {
            throw invalid("model")
        }
        let source = manifest.source
        guard
            source.release == "JPL DE442s",
            source.kernelFile == "de442s.bsp",
            source.kernelUrl ==
                "https://naif.jpl.nasa.gov/pub/naif/" +
                "generic_kernels/spk/planets/de442s.bsp",
            source.technicalCommentsUrl ==
                "https://naif.jpl.nasa.gov/pub/naif/" +
                "generic_kernels/spk/planets/" +
                "de442_tech-comments.txt",
            source.byteLength == 32_701_440,
            source.md5 == "cc49327e06088124c0e39d8dde9f0b58",
            source.sha256 == expectedSourceSHA256,
            source.binaryFileFormat == "DAF/SPK LTL-IEEE"
        else {
            throw invalid("source")
        }

        let coverage = manifest.coverage
        guard
            coverage.calendar == "proleptic Gregorian",
            coverage.timeScale == "TDB",
            coverage.startIsoTdb ==
                "1900-01-01T00:00:00 TDB",
            coverage.endIsoTdb ==
                "2101-01-01T00:00:00 TDB",
            coverage.startJulianDateTdb == 2_415_020.5,
            coverage.endJulianDateTdb == 2_488_434.5,
            coverage.startSecondsPastJ2000Tdb
                == -3_155_716_800,
            coverage.endSecondsPastJ2000Tdb
                == 3_187_252_800,
            coverage.endIsIncluded,
            coverage.chunkYears == 5,
            coverage.chunkBoundaryRule ==
                expectedChunkBoundaryRule
        else {
            throw invalid("coverage")
        }

        guard
            manifest.units.position == "kilometer",
            manifest.units.velocity == "kilometer per second",
            manifest.units.recordTime ==
                "TDB seconds past J2000.0",
            manifest.units.julianDate == "TDB Julian Date"
        else {
            throw invalid("units")
        }

        let binary = manifest.binaryFormat
        guard
            binary.magic == "PLDE4421",
            binary.formatVersion == 1,
            binary.byteOrder == "little-endian",
            binary.coefficientEncoding ==
                "IEEE-754 binary32",
            binary.timeEncoding == "IEEE-754 binary64",
            binary.headerBytes == 32,
            binary.seriesDirectoryEntryBytes == 32,
            binary.headerLayout.count >= 5,
            binary.directoryLayout.count >= 8,
            binary.recordLayout.count >= 4,
            !binary.evaluation.isEmpty
        else {
            throw invalid("binaryFormat")
        }
    }

    private static func validateSourceSeries(
        _ encoded: [DE442SManifestV1.SourceSeries]
    ) throws {
        guard encoded.count ==
            DE442SEphemerisSeriesV1.allCases.count
        else {
            throw invalid("source series count")
        }
        for (actual, expected) in zip(
            encoded,
            DE442SEphemerisSeriesV1.allCases
        ) {
            guard
                actual.id == expected,
                actual.targetNaifId == expected.targetNaifID,
                actual.centerNaifId == expected.centerNaifID,
                actual.frameNaifId == 1,
                actual.frame == "J2000",
                actual.spkDataType == 2,
                actual.sourceInitialAddress >= 1,
                actual.sourceFinalAddress >=
                    actual.sourceInitialAddress,
                actual.sourceStartSecondsPastJ2000Tdb.isFinite,
                actual.sourceEndSecondsPastJ2000Tdb.isFinite,
                actual.sourceEndSecondsPastJ2000Tdb >
                    actual.sourceStartSecondsPastJ2000Tdb,
                actual.sourceInitialEpochSecondsPastJ2000Tdb
                    .isFinite,
                actual.sourceRecordIntervalSeconds ==
                    expected.recordIntervalSeconds,
                (1...100_000).contains(actual.sourceRecordCount),
                actual.coefficientCountPerAxis ==
                    expected.coefficientCountPerAxis,
                actual.degree ==
                    actual.coefficientCountPerAxis - 1,
                !actual.label.isEmpty
            else {
                throw invalid(
                    "source series \(expected.rawValue)"
                )
            }
        }
    }

    private static func validateChunks(
        _ manifest: DE442SManifestV1
    ) throws {
        let chunks = manifest.chunks
        guard chunks.count == 41 else {
            throw invalid("chunk count")
        }

        var totalBytes = 0
        var totalGzipBytes = 0
        var maximumBytes = 0
        var maximumGzipBytes = 0
        var previousEndJulianDate =
            manifest.coverage.startJulianDateTdb
        var previousEndSeconds =
            manifest.coverage.startSecondsPastJ2000Tdb

        for (index, chunk) in chunks.enumerated() {
            let startYear = 1_900 + index * 5
            let endYear = min(startYear + 5, 2_101)
            let expectedID = "\(startYear)-\(endYear)"
            guard
                chunk.id == expectedID,
                chunk.startYear == startYear,
                chunk.endYear == endYear,
                chunk.startJulianDateTdb.isFinite,
                chunk.endJulianDateTdb.isFinite,
                chunk.startSecondsPastJ2000Tdb.isFinite,
                chunk.endSecondsPastJ2000Tdb.isFinite,
                chunk.startJulianDateTdb == previousEndJulianDate,
                chunk.startSecondsPastJ2000Tdb ==
                    previousEndSeconds,
                chunk.endJulianDateTdb >
                    chunk.startJulianDateTdb,
                chunk.endSecondsPastJ2000Tdb >
                    chunk.startSecondsPastJ2000Tdb,
                (chunk.endJulianDateTdb -
                    chunk.startJulianDateTdb) * 86_400
                    == chunk.endSecondsPastJ2000Tdb -
                    chunk.startSecondsPastJ2000Tdb,
                (128...1_048_576).contains(chunk.byteLength),
                (1...chunk.byteLength).contains(
                    chunk.gzipByteLength
                ),
                isLowercaseSHA256(chunk.sha256)
            else {
                throw invalid("chunk \(expectedID)")
            }
            _ = try safeChunkFileName(for: chunk)
            try validateChunkSeries(chunk)

            let nextTotal = totalBytes.addingReportingOverflow(
                chunk.byteLength
            )
            let nextGzipTotal =
                totalGzipBytes.addingReportingOverflow(
                    chunk.gzipByteLength
                )
            guard !nextTotal.overflow, !nextGzipTotal.overflow else {
                throw invalid("chunk byte total overflow")
            }
            totalBytes = nextTotal.partialValue
            totalGzipBytes = nextGzipTotal.partialValue
            maximumBytes = max(maximumBytes, chunk.byteLength)
            maximumGzipBytes = max(
                maximumGzipBytes,
                chunk.gzipByteLength
            )
            previousEndJulianDate = chunk.endJulianDateTdb
            previousEndSeconds = chunk.endSecondsPastJ2000Tdb
        }

        guard
            previousEndJulianDate ==
                manifest.coverage.endJulianDateTdb,
            previousEndSeconds ==
                manifest.coverage.endSecondsPastJ2000Tdb,
            manifest.statistics.chunkCount == chunks.count,
            manifest.statistics.totalChunkBytes == totalBytes,
            manifest.statistics.totalChunkGzipBytes ==
                totalGzipBytes,
            manifest.statistics.maximumChunkBytes == maximumBytes,
            manifest.statistics.maximumChunkGzipBytes ==
                maximumGzipBytes
        else {
            throw invalid("statistics or final coverage")
        }
    }

    private static func validateChunkSeries(
        _ chunk: DE442SManifestV1.Chunk
    ) throws {
        guard chunk.series.count ==
            DE442SEphemerisSeriesV1.allCases.count
        else {
            throw invalid("chunk \(chunk.id) series count")
        }
        var expectedDataOffset = 128
        for (actual, expected) in zip(
            chunk.series,
            DE442SEphemerisSeriesV1.allCases
        ) {
            let coefficientBytes =
                actual.coefficientCountPerAxis
                .multipliedReportingOverflow(by: 3 * 4)
            guard !coefficientBytes.overflow else {
                throw invalid("chunk coefficient byte overflow")
            }
            let unalignedStride =
                16.addingReportingOverflow(
                    coefficientBytes.partialValue
                )
            guard !unalignedStride.overflow else {
                throw invalid("chunk record stride overflow")
            }
            let expectedStride = try alignToEight(
                unalignedStride.partialValue
            )

            let sourceIndexSpan =
                actual.sourceLastRecordIndex
                .subtractingReportingOverflow(
                    actual.sourceFirstRecordIndex
                )
            let sourceIndexCount =
                sourceIndexSpan.partialValue
                .addingReportingOverflow(1)
            guard
                actual.id == expected,
                actual.targetNaifId == expected.targetNaifID,
                actual.centerNaifId == expected.centerNaifID,
                actual.frameNaifId == 1,
                actual.spkDataType == 2,
                (1...2_048).contains(actual.recordCount),
                actual.coefficientCountPerAxis ==
                    expected.coefficientCountPerAxis,
                actual.degree ==
                    actual.coefficientCountPerAxis - 1,
                actual.dataOffsetBytes == expectedDataOffset,
                actual.recordStrideBytes == expectedStride,
                actual.firstRecordStartSecondsPastJ2000Tdb
                    .isFinite,
                actual.lastRecordEndSecondsPastJ2000Tdb.isFinite,
                actual.firstRecordStartSecondsPastJ2000Tdb <=
                    chunk.startSecondsPastJ2000Tdb,
                chunk.startSecondsPastJ2000Tdb -
                    actual.firstRecordStartSecondsPastJ2000Tdb <=
                    expected.recordIntervalSeconds,
                actual.lastRecordEndSecondsPastJ2000Tdb >=
                    chunk.endSecondsPastJ2000Tdb,
                actual.lastRecordEndSecondsPastJ2000Tdb -
                    chunk.endSecondsPastJ2000Tdb <=
                    expected.recordIntervalSeconds,
                actual.sourceFirstRecordIndex >= 0,
                !sourceIndexSpan.overflow,
                sourceIndexSpan.partialValue >= 0,
                !sourceIndexCount.overflow,
                sourceIndexCount.partialValue ==
                    actual.recordCount,
                actual.recordIntervalSeconds ==
                    expected.recordIntervalSeconds
            else {
                throw invalid(
                    "chunk \(chunk.id) series \(expected.rawValue)"
                )
            }

            let seriesBytes =
                actual.recordCount.multipliedReportingOverflow(
                    by: actual.recordStrideBytes
                )
            let nextOffset =
                actual.dataOffsetBytes.addingReportingOverflow(
                    seriesBytes.partialValue
                )
            guard
                !seriesBytes.overflow,
                !nextOffset.overflow,
                nextOffset.partialValue <= chunk.byteLength
            else {
                throw invalid("chunk data offset overflow")
            }
            expectedDataOffset = nextOffset.partialValue
        }
        guard expectedDataOffset == chunk.byteLength else {
            throw invalid("chunk \(chunk.id) byteLength")
        }
    }

    private static func alignToEight(_ value: Int) throws -> Int {
        let adjusted = value.addingReportingOverflow(7)
        guard !adjusted.overflow else {
            throw invalid("8-byte alignment overflow")
        }
        return adjusted.partialValue / 8 * 8
    }

    private static func isLowercaseSHA256(
        _ value: String
    ) -> Bool {
        value.utf8.count == 64 && value.utf8.allSatisfy {
            (48...57).contains($0) || (97...102).contains($0)
        }
    }

    private static func invalid(
        _ reason: String
    ) -> DE442SEphemerisError {
        .invalidManifest(reason)
    }
}
