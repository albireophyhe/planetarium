import CryptoKit
import Foundation
import PlanetariumShared

public enum DE442SEphemerisConstantsV1 {
    /**
     Earth/Moon mass ratio derived from the DE442 GM3 and GMM constants.

     The displayed DE442 AU-based constants give
     `8.8876924475211348e-10 / 1.0931894592103165e-11`.
     Keeping the ratio as Double limits the induced Earth-center error to
     far below the Float32 EMB coefficient quantization in this artifact.
     */
    public static let earthMoonMassRatio =
        81.300_568_466_341_66
}

/**
 A single-epoch state reconstructed from the three bundled DE442s series.

 Every vector is in the J2000/ICRF axes. Positions use kilometers and
 velocities use kilometers per TDB day.
 */
public struct DE442SEphemerisStateV1: Hashable, Sendable {
    public let tdbJulianDate: Double
    public let earthMoonBarycenterBarycentric: EphemerisState
    public let sunBarycentric: EphemerisState
    public let moonFromEarthMoonBarycenter: EphemerisState
    public let earthBarycentric: EphemerisState
    public let moonBarycentric: EphemerisState
    public let moonGeocentric: EphemerisState
    public let sunGeocentric: EphemerisState

    public init(
        tdbJulianDate: Double,
        earthMoonBarycenterBarycentric: EphemerisState,
        sunBarycentric: EphemerisState,
        moonFromEarthMoonBarycenter: EphemerisState,
        earthBarycentric: EphemerisState,
        moonBarycentric: EphemerisState,
        moonGeocentric: EphemerisState,
        sunGeocentric: EphemerisState
    ) {
        self.tdbJulianDate = tdbJulianDate
        self.earthMoonBarycenterBarycentric =
            earthMoonBarycenterBarycentric
        self.sunBarycentric = sunBarycentric
        self.moonFromEarthMoonBarycenter =
            moonFromEarthMoonBarycenter
        self.earthBarycentric = earthBarycentric
        self.moonBarycentric = moonBarycentric
        self.moonGeocentric = moonGeocentric
        self.sunGeocentric = sunGeocentric
    }
}

/**
 Lazy DE442s provider for the bundled five-year coefficient chunks.

 The manifest is decoded and semantically validated during construction.
 Chunk bytes are loaded only on first use, authenticated with their manifest
 SHA-256, decoded without assuming pointer alignment, and retained in a
 bounded actor-isolated LRU cache. A failed load is never cached.
 */
public actor DE442SEphemerisProviderV1 {
    public nonisolated let id: String
    public nonisolated let sourceSHA256: String
    public nonisolated let coverageStartJulianDateTdb: Double
    public nonisolated let coverageEndJulianDateTdb: Double

    private let manifest: DE442SValidatedManifestV1
    private let maximumCachedChunkCount: Int
    private let chunkDataLoader:
        @Sendable (String) throws -> Data
    private var cachedChunks:
        [String: DE442SDecodedChunkV1] = [:]
    private var leastToMostRecentlyUsedChunkIDs: [String] = []

    public static func loadBundled(
        maximumCachedChunkCount: Int = 3
    ) throws -> DE442SEphemerisProviderV1 {
        let manifestData: Data
        do {
            manifestData =
                try SharedResources.de442sEphemerisData(
                    for: .manifest
                )
        } catch {
            throw DE442SEphemerisError.resourceUnavailable(
                error.localizedDescription
            )
        }
        return try DE442SEphemerisProviderV1(
            manifestData: manifestData,
            maximumCachedChunkCount: maximumCachedChunkCount,
            chunkDataLoader: { fileName in
                try SharedResources.de442sEphemerisChunkData(
                    named: fileName
                )
            }
        )
    }

    public init(
        manifestData: Data,
        maximumCachedChunkCount: Int = 3,
        chunkDataLoader:
            @escaping @Sendable (String) throws -> Data
    ) throws {
        guard (1...3).contains(maximumCachedChunkCount) else {
            throw DE442SEphemerisError.invalidManifest(
                "maximumCachedChunkCountは1〜3である必要があります"
            )
        }
        let validated = try DE442SManifestValidatorV1
            .decodeAndValidate(manifestData)
        id = validated.model
        sourceSHA256 = validated.sourceSHA256
        coverageStartJulianDateTdb =
            validated.coverageStartJulianDateTdb
        coverageEndJulianDateTdb =
            validated.coverageEndJulianDateTdb
        manifest = validated
        self.maximumCachedChunkCount =
            maximumCachedChunkCount
        self.chunkDataLoader = chunkDataLoader
    }

    /**
     Evaluates one of the three series exactly as declared by its center.

     - EMB and Sun are barycentric.
     - Moon is relative to the Earth-Moon barycenter.
     */
    public func rawState(
        for series: DE442SEphemerisSeriesV1,
        tdbJulianDate: Double
    ) throws -> EphemerisState {
        let sample = try sampleContext(
            tdbJulianDate: tdbJulianDate
        )
        return try sample.chunk.evaluate(
            series: series,
            secondsPastJ2000Tdb:
                sample.secondsPastJ2000Tdb
        )
    }

    /**
     Evaluates all raw series and reconstructs Earth-centered states.

     Earth is `EMB - MoonFromEMB / EMRAT`; the geocentric Moon is
     `MoonFromEMB * (1 + 1 / EMRAT)`.
     */
    public func state(
        tdbJulianDate: Double
    ) throws -> DE442SEphemerisStateV1 {
        let sample = try sampleContext(
            tdbJulianDate: tdbJulianDate
        )
        let emb = try sample.chunk.evaluate(
            series: .earthMoonBarycenter,
            secondsPastJ2000Tdb:
                sample.secondsPastJ2000Tdb
        )
        let sun = try sample.chunk.evaluate(
            series: .sun,
            secondsPastJ2000Tdb:
                sample.secondsPastJ2000Tdb
        )
        let moonFromEmb = try sample.chunk.evaluate(
            series: .moonFromEarthMoonBarycenter,
            secondsPastJ2000Tdb:
                sample.secondsPastJ2000Tdb
        )

        let inverseMassRatio =
            1 / DE442SEphemerisConstantsV1
                .earthMoonMassRatio
        let earth = subtract(
            emb,
            scale(moonFromEmb, by: inverseMassRatio)
        )
        let moonBarycentric = add(emb, moonFromEmb)
        let moonGeocentric = scale(
            moonFromEmb,
            by: 1 + inverseMassRatio
        )
        let sunGeocentric = subtract(sun, earth)
        return DE442SEphemerisStateV1(
            tdbJulianDate: tdbJulianDate,
            earthMoonBarycenterBarycentric: emb,
            sunBarycentric: sun,
            moonFromEarthMoonBarycenter: moonFromEmb,
            earthBarycentric: earth,
            moonBarycentric: moonBarycentric,
            moonGeocentric: moonGeocentric,
            sunGeocentric: sunGeocentric
        )
    }

    func cachedChunkIDsForTesting() -> [String] {
        leastToMostRecentlyUsedChunkIDs
    }

    private func sampleContext(
        tdbJulianDate: Double
    ) throws -> (
        chunk: DE442SDecodedChunkV1,
        secondsPastJ2000Tdb: Double
    ) {
        guard tdbJulianDate.isFinite else {
            throw DE442SEphemerisError.nonFiniteJulianDate
        }
        let descriptor = try chunkDescriptor(
            tdbJulianDate: tdbJulianDate
        )
        let secondsPastJ2000Tdb =
            (tdbJulianDate - 2_451_545) * 86_400
        guard secondsPastJ2000Tdb.isFinite else {
            throw DE442SEphemerisError.nonFiniteJulianDate
        }
        return (
            try chunk(for: descriptor),
            secondsPastJ2000Tdb
        )
    }

    private func chunkDescriptor(
        tdbJulianDate: Double
    ) throws -> DE442SManifestV1.Chunk {
        guard
            tdbJulianDate >=
                manifest.coverageStartJulianDateTdb,
            tdbJulianDate <=
                manifest.coverageEndJulianDateTdb
        else {
            throw DE442SEphemerisError
                .julianDateOutsideCoverage
        }
        if tdbJulianDate ==
            manifest.coverageEndJulianDateTdb
        {
            guard let final = manifest.chunks.last else {
                throw DE442SEphemerisError.invalidManifest(
                    "final chunk"
                )
            }
            return final
        }

        var lower = 0
        var upper = manifest.chunks.count
        while lower < upper {
            let middle = lower + (upper - lower) / 2
            if manifest.chunks[middle]
                .startJulianDateTdb <= tdbJulianDate
            {
                lower = middle + 1
            } else {
                upper = middle
            }
        }
        let index = max(0, lower - 1)
        let descriptor = manifest.chunks[index]
        guard
            tdbJulianDate >= descriptor.startJulianDateTdb,
            tdbJulianDate < descriptor.endJulianDateTdb
        else {
            throw DE442SEphemerisError
                .julianDateOutsideCoverage
        }
        return descriptor
    }

    private func chunk(
        for descriptor: DE442SManifestV1.Chunk
    ) throws -> DE442SDecodedChunkV1 {
        if let cached = cachedChunks[descriptor.id] {
            touchCachedChunk(descriptor.id)
            return cached
        }

        let fileName = try DE442SManifestValidatorV1
            .safeChunkFileName(for: descriptor)
        let data: Data
        do {
            data = try chunkDataLoader(fileName)
        } catch {
            throw DE442SEphemerisError.resourceUnavailable(
                "\(fileName): \(error.localizedDescription)"
            )
        }
        let decoded = try DE442SBinaryDecoderV1.decode(
            data,
            matching: descriptor
        )
        cachedChunks[descriptor.id] = decoded
        leastToMostRecentlyUsedChunkIDs.append(
            descriptor.id
        )
        while cachedChunks.count > maximumCachedChunkCount {
            let removedID =
                leastToMostRecentlyUsedChunkIDs.removeFirst()
            cachedChunks.removeValue(forKey: removedID)
        }
        return decoded
    }

    private func touchCachedChunk(_ id: String) {
        if let index =
            leastToMostRecentlyUsedChunkIDs.firstIndex(of: id)
        {
            leastToMostRecentlyUsedChunkIDs.remove(at: index)
        }
        leastToMostRecentlyUsedChunkIDs.append(id)
    }

    private func add(
        _ left: EphemerisState,
        _ right: EphemerisState
    ) -> EphemerisState {
        EphemerisState(
            positionKilometers:
                left.positionKilometers +
                right.positionKilometers,
            velocityKilometersPerDay:
                left.velocityKilometersPerDay +
                right.velocityKilometersPerDay
        )
    }

    private func subtract(
        _ left: EphemerisState,
        _ right: EphemerisState
    ) -> EphemerisState {
        EphemerisState(
            positionKilometers:
                left.positionKilometers -
                right.positionKilometers,
            velocityKilometersPerDay:
                left.velocityKilometersPerDay -
                right.velocityKilometersPerDay
        )
    }

    private func scale(
        _ state: EphemerisState,
        by scalar: Double
    ) -> EphemerisState {
        EphemerisState(
            positionKilometers:
                state.positionKilometers * scalar,
            velocityKilometersPerDay:
                state.velocityKilometersPerDay * scalar
        )
    }
}

private struct DE442SBinarySeriesDescriptorV1: Sendable {
    let series: DE442SEphemerisSeriesV1
    let recordCount: Int
    let coefficientCountPerAxis: Int
    let dataOffsetBytes: Int
    let recordStrideBytes: Int
}

private struct DE442SDecodedChunkV1: Sendable {
    let data: Data
    let descriptors:
        [DE442SEphemerisSeriesV1:
            DE442SBinarySeriesDescriptorV1]

    func evaluate(
        series: DE442SEphemerisSeriesV1,
        secondsPastJ2000Tdb: Double
    ) throws -> EphemerisState {
        guard let descriptor = descriptors[series] else {
            throw DE442SEphemerisError.invalidChunk(
                "series \(series.rawValue)がありません"
            )
        }
        let reader = DE442SLittleEndianReaderV1(data: data)
        let recordIndex = try recordIndex(
            descriptor: descriptor,
            secondsPastJ2000Tdb: secondsPastJ2000Tdb,
            reader: reader
        )
        let offset = try recordOffset(
            descriptor: descriptor,
            index: recordIndex
        )
        let midpoint = try reader.double(at: offset)
        let radius = try reader.double(at: offset + 8)
        let normalized =
            (secondsPastJ2000Tdb - midpoint) / radius
        guard
            normalized.isFinite,
            normalized >= -1 - 1e-12,
            normalized <= 1 + 1e-12
        else {
            throw DE442SEphemerisError.invalidChunk(
                "series \(series.rawValue)のrecord範囲"
            )
        }

        let coefficientCount =
            descriptor.coefficientCountPerAxis * 3
        var coefficients: [Float] = []
        coefficients.reserveCapacity(coefficientCount)
        var coefficientOffset = offset + 16
        for _ in 0..<coefficientCount {
            coefficients.append(
                try reader.float(at: coefficientOffset)
            )
            coefficientOffset += 4
        }
        return try ChebyshevEphemeris.evaluateChebyshevRecord(
            coefficients: coefficients,
            coefficientCount:
                descriptor.coefficientCountPerAxis,
            normalizedTime: max(-1, min(1, normalized)),
            intervalDays: (2 * radius) / 86_400
        )
    }

    private func recordIndex(
        descriptor: DE442SBinarySeriesDescriptorV1,
        secondsPastJ2000Tdb: Double,
        reader: DE442SLittleEndianReaderV1
    ) throws -> Int {
        var lower = 0
        var upper = descriptor.recordCount
        while lower < upper {
            let middle = lower + (upper - lower) / 2
            let offset = try recordOffset(
                descriptor: descriptor,
                index: middle
            )
            let midpoint = try reader.double(at: offset)
            let radius = try reader.double(at: offset + 8)
            if midpoint - radius <= secondsPastJ2000Tdb {
                lower = middle + 1
            } else {
                upper = middle
            }
        }
        let index = max(0, lower - 1)
        let offset = try recordOffset(
            descriptor: descriptor,
            index: index
        )
        let midpoint = try reader.double(at: offset)
        let radius = try reader.double(at: offset + 8)
        guard
            secondsPastJ2000Tdb >= midpoint - radius,
            secondsPastJ2000Tdb <= midpoint + radius
        else {
            throw DE442SEphemerisError.invalidChunk(
                "epochを覆うrecordがありません"
            )
        }
        return index
    }

    private func recordOffset(
        descriptor: DE442SBinarySeriesDescriptorV1,
        index: Int
    ) throws -> Int {
        guard (0..<descriptor.recordCount).contains(index) else {
            throw DE442SEphemerisError.invalidChunk(
                "record index"
            )
        }
        let displacement = index.multipliedReportingOverflow(
            by: descriptor.recordStrideBytes
        )
        let offset =
            descriptor.dataOffsetBytes.addingReportingOverflow(
                displacement.partialValue
            )
        guard !displacement.overflow, !offset.overflow else {
            throw DE442SEphemerisError.invalidChunk(
                "record offset overflow"
            )
        }
        return offset.partialValue
    }
}

private enum DE442SBinaryDecoderV1 {
    static func decode(
        _ data: Data,
        matching manifest:
            DE442SManifestV1.Chunk
    ) throws -> DE442SDecodedChunkV1 {
        // A Data slice may retain a non-zero collection startIndex. Copying
        // here gives the byte reader a stable zero-based view while still
        // keeping all integer and floating-point loads explicitly unaligned.
        let bytes = Data(data)
        guard bytes.count == manifest.byteLength else {
            throw invalid("byteLength")
        }
        guard sha256Hex(bytes) == manifest.sha256 else {
            throw invalid("SHA-256")
        }
        let reader = DE442SLittleEndianReaderV1(data: bytes)
        guard
            try reader.ascii(at: 0, count: 8) == "PLDE4421",
            try reader.uint32(at: 8) == 1,
            try reader.uint32(at: 12) == 3
        else {
            throw invalid("magic, version, or series count")
        }
        let start = try reader.double(at: 16)
        let end = try reader.double(at: 24)
        guard
            start.isFinite,
            end.isFinite,
            start == manifest.startSecondsPastJ2000Tdb,
            end == manifest.endSecondsPastJ2000Tdb,
            start < end
        else {
            throw invalid("header interval")
        }

        var decoded:
            [DE442SEphemerisSeriesV1:
                DE442SBinarySeriesDescriptorV1] = [:]
        var expectedDataOffset = 128
        for (index, series) in
            DE442SEphemerisSeriesV1.allCases.enumerated()
        {
            let encoded = manifest.series[index]
            let directoryOffset = 32 + index * 32
            let target = try reader.int32(at: directoryOffset)
            let center = try reader.int32(
                at: directoryOffset + 4
            )
            let frame = try reader.int32(
                at: directoryOffset + 8
            )
            let dataType = try reader.int32(
                at: directoryOffset + 12
            )
            let recordCount = try int(
                reader.uint32(at: directoryOffset + 16)
            )
            let coefficientCount = try int(
                reader.uint32(at: directoryOffset + 20)
            )
            let dataOffset = try int(
                reader.uint32(at: directoryOffset + 24)
            )
            let recordStride = try int(
                reader.uint32(at: directoryOffset + 28)
            )
            guard
                target == encoded.targetNaifId,
                center == encoded.centerNaifId,
                frame == encoded.frameNaifId,
                dataType == encoded.spkDataType,
                recordCount == encoded.recordCount,
                coefficientCount ==
                    encoded.coefficientCountPerAxis,
                dataOffset == encoded.dataOffsetBytes,
                recordStride == encoded.recordStrideBytes,
                dataOffset == expectedDataOffset
            else {
                throw invalid(
                    "series \(series.rawValue) directory"
                )
            }
            let descriptor = DE442SBinarySeriesDescriptorV1(
                series: series,
                recordCount: recordCount,
                coefficientCountPerAxis: coefficientCount,
                dataOffsetBytes: dataOffset,
                recordStrideBytes: recordStride
            )
            let dataEnd = try sectionEnd(
                descriptor: descriptor
            )
            guard dataEnd <= bytes.count else {
                throw invalid(
                    "series \(series.rawValue) bounds"
                )
            }
            try validateRecords(
                descriptor: descriptor,
                manifest: encoded,
                reader: reader
            )
            decoded[series] = descriptor
            expectedDataOffset = dataEnd
        }
        guard expectedDataOffset == bytes.count else {
            throw invalid("trailing or unreferenced bytes")
        }
        return DE442SDecodedChunkV1(
            data: bytes,
            descriptors: decoded
        )
    }

    private static func validateRecords(
        descriptor: DE442SBinarySeriesDescriptorV1,
        manifest: DE442SManifestV1.ChunkSeries,
        reader: DE442SLittleEndianReaderV1
    ) throws {
        var previousEnd: Double?
        for index in 0..<descriptor.recordCount {
            let displacement = index.multipliedReportingOverflow(
                by: descriptor.recordStrideBytes
            )
            let recordOffset =
                descriptor.dataOffsetBytes
                .addingReportingOverflow(
                    displacement.partialValue
                )
            guard !displacement.overflow, !recordOffset.overflow else {
                throw invalid("record offset overflow")
            }
            let midpoint = try reader.double(
                at: recordOffset.partialValue
            )
            let radius = try reader.double(
                at: recordOffset.partialValue + 8
            )
            let recordStart = midpoint - radius
            let recordEnd = midpoint + radius
            guard
                midpoint.isFinite,
                radius.isFinite,
                radius > 0,
                2 * radius == manifest.recordIntervalSeconds,
                recordStart.isFinite,
                recordEnd.isFinite,
                recordStart < recordEnd,
                previousEnd == nil || previousEnd == recordStart
            else {
                throw invalid(
                    "series \(descriptor.series.rawValue) " +
                    "record \(index) time"
                )
            }

            let coefficientCount =
                descriptor.coefficientCountPerAxis * 3
            var coefficientOffset =
                recordOffset.partialValue + 16
            for _ in 0..<coefficientCount {
                let coefficient = try reader.float(
                    at: coefficientOffset
                )
                guard coefficient.isFinite else {
                    throw invalid(
                        "series \(descriptor.series.rawValue) " +
                        "non-finite coefficient"
                    )
                }
                coefficientOffset += 4
            }
            let recordEndOffset =
                recordOffset.partialValue +
                descriptor.recordStrideBytes
            while coefficientOffset < recordEndOffset {
                guard try reader.uint8(at: coefficientOffset) == 0
                else {
                    throw invalid(
                        "series \(descriptor.series.rawValue) padding"
                    )
                }
                coefficientOffset += 1
            }

            if index == 0 {
                guard recordStart ==
                    manifest
                    .firstRecordStartSecondsPastJ2000Tdb
                else {
                    throw invalid(
                        "series \(descriptor.series.rawValue) " +
                        "first record"
                    )
                }
            }
            if index == descriptor.recordCount - 1 {
                guard recordEnd ==
                    manifest
                    .lastRecordEndSecondsPastJ2000Tdb
                else {
                    throw invalid(
                        "series \(descriptor.series.rawValue) " +
                        "last record"
                    )
                }
            }
            previousEnd = recordEnd
        }
    }

    private static func sectionEnd(
        descriptor: DE442SBinarySeriesDescriptorV1
    ) throws -> Int {
        let bytes = descriptor.recordCount
            .multipliedReportingOverflow(
                by: descriptor.recordStrideBytes
            )
        let end = descriptor.dataOffsetBytes
            .addingReportingOverflow(bytes.partialValue)
        guard !bytes.overflow, !end.overflow else {
            throw invalid("series byte range overflow")
        }
        return end.partialValue
    }

    private static func int(_ value: UInt32) throws -> Int {
        guard let result = Int(exactly: value) else {
            throw invalid("UInt32 to Int overflow")
        }
        return result
    }

    private static func sha256Hex(_ data: Data) -> String {
        let digits = Array("0123456789abcdef".utf8)
        let digest = SHA256.hash(data: data)
        var result = [UInt8]()
        result.reserveCapacity(64)
        for byte in digest {
            result.append(digits[Int(byte >> 4)])
            result.append(digits[Int(byte & 0x0f)])
        }
        return String(decoding: result, as: UTF8.self)
    }

    private static func invalid(
        _ reason: String
    ) -> DE442SEphemerisError {
        .invalidChunk(reason)
    }
}

private struct DE442SLittleEndianReaderV1: Sendable {
    let data: Data

    func uint8(at offset: Int) throws -> UInt8 {
        let range = try checkedRange(offset: offset, count: 1)
        return data[range.lowerBound]
    }

    func uint32(at offset: Int) throws -> UInt32 {
        _ = try checkedRange(offset: offset, count: 4)
        return data.withUnsafeBytes { bytes in
            UInt32(
                littleEndian: bytes.loadUnaligned(
                    fromByteOffset: offset,
                    as: UInt32.self
                )
            )
        }
    }

    func int32(at offset: Int) throws -> Int {
        Int(Int32(bitPattern: try uint32(at: offset)))
    }

    func float(at offset: Int) throws -> Float {
        Float(bitPattern: try uint32(at: offset))
    }

    func double(at offset: Int) throws -> Double {
        _ = try checkedRange(offset: offset, count: 8)
        let bitPattern = data.withUnsafeBytes { bytes in
            UInt64(
                littleEndian: bytes.loadUnaligned(
                    fromByteOffset: offset,
                    as: UInt64.self
                )
            )
        }
        return Double(bitPattern: bitPattern)
    }

    func ascii(
        at offset: Int,
        count: Int
    ) throws -> String {
        let range = try checkedRange(
            offset: offset,
            count: count
        )
        return String(
            decoding: data[range],
            as: UTF8.self
        )
    }

    private func checkedRange(
        offset: Int,
        count: Int
    ) throws -> Range<Int> {
        guard offset >= 0, count >= 0 else {
            throw DE442SEphemerisError.invalidChunk(
                "negative byte range"
            )
        }
        let end = offset.addingReportingOverflow(count)
        guard
            !end.overflow,
            end.partialValue <= data.count
        else {
            throw DE442SEphemerisError.invalidChunk(
                "byte range outside chunk"
            )
        }
        return offset..<end.partialValue
    }
}
