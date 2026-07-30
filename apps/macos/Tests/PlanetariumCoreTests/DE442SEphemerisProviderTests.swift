import CryptoKit
import Foundation
import XCTest

import PlanetariumShared
@testable import PlanetariumCore

final class DE442SEphemerisProviderTests:
    XCTestCase, @unchecked Sendable
{
    func testBundledProviderMatchesEveryPackedFixtureEpoch()
        async throws
    {
        let provider =
            try DE442SEphemerisProviderV1.loadBundled()
        let fixture = try loadFixture()
        var comparisons = fixture.sampleCases
        comparisons.append(
            contentsOf: fixture.boundaryCases.map {
                let selected = $0.chunks.count == 1
                    ? $0.chunks[0]
                    : $0.chunks[$0.chunks.count - 1]
                return FixtureCase(
                    julianDateTdb: $0.julianDateTdb,
                    series: selected.series
                )
            }
        )

        for comparison in comparisons {
            for expected in comparison.series {
                let actual = try await provider.rawState(
                    for: expected.seriesId,
                    tdbJulianDate: comparison.julianDateTdb
                )
                assertVector(
                    actual.positionKilometers,
                    equals: expected.packedPositionKilometers,
                    accuracy: 1e-6,
                    context:
                        "\(comparison.julianDateTdb) " +
                        expected.seriesId.rawValue + " position"
                )
                assertVector(
                    actual.velocityKilometersPerDay,
                    equals:
                        expected
                        .packedVelocityKilometersPerSecond
                        .map { $0 * 86_400 },
                    accuracy: 1e-7,
                    context:
                        "\(comparison.julianDateTdb) " +
                        expected.seriesId.rawValue + " velocity"
                )
            }
        }
    }

    func testReconstructsEarthMoonAndSunStatesWithDE442MassRatio()
        async throws
    {
        let provider =
            try DE442SEphemerisProviderV1.loadBundled()
        let julianDate = 2_460_800.25
        let result = try await provider.state(
            tdbJulianDate: julianDate
        )
        let ratio =
            DE442SEphemerisConstantsV1.earthMoonMassRatio
        let expectedEarthPosition =
            result.earthMoonBarycenterBarycentric
            .positionKilometers -
            result.moonFromEarthMoonBarycenter
            .positionKilometers / ratio
        let expectedEarthVelocity =
            result.earthMoonBarycenterBarycentric
            .velocityKilometersPerDay -
            result.moonFromEarthMoonBarycenter
            .velocityKilometersPerDay / ratio

        XCTAssertEqual(
            result.earthBarycentric.positionKilometers,
            expectedEarthPosition
        )
        XCTAssertEqual(
            result.earthBarycentric.velocityKilometersPerDay,
            expectedEarthVelocity
        )
        XCTAssertLessThan(
            (
                result.moonGeocentric.positionKilometers -
                (
                    result.moonBarycentric.positionKilometers -
                    result.earthBarycentric.positionKilometers
                )
            ).length,
            2e-8
        )
        XCTAssertLessThan(
            (
                result.moonGeocentric.velocityKilometersPerDay -
                (
                    result.moonBarycentric
                        .velocityKilometersPerDay -
                    result.earthBarycentric
                        .velocityKilometersPerDay
                )
            ).length,
            1e-8
        )
        XCTAssertEqual(
            result.sunGeocentric.positionKilometers,
            result.sunBarycentric.positionKilometers -
                result.earthBarycentric.positionKilometers
        )
        XCTAssertEqual(result.tdbJulianDate, julianDate)
        XCTAssertEqual(
            provider.sourceSHA256,
            "54d97562a5b094d298b1b8eafa5a2e17" +
                "e3e010ce85e1a366d07f003ad159323c"
        )
    }

    func testCoverageIncludesBothArtifactEndpointsAndRejectsOutside()
        async throws
    {
        let provider =
            try DE442SEphemerisProviderV1.loadBundled()
        _ = try await provider.state(
            tdbJulianDate:
                provider.coverageStartJulianDateTdb
        )
        _ = try await provider.state(
            tdbJulianDate:
                provider.coverageEndJulianDateTdb
        )

        for invalid in [
            provider.coverageStartJulianDateTdb.nextDown,
            provider.coverageEndJulianDateTdb.nextUp,
        ] {
            let error = await capturedError {
                _ = try await provider.state(
                    tdbJulianDate: invalid
                )
            }
            XCTAssertEqual(
                error as? DE442SEphemerisError,
                .julianDateOutsideCoverage
            )
        }
        for invalid in [Double.nan, -.infinity, .infinity] {
            let error = await capturedError {
                _ = try await provider.state(
                    tdbJulianDate: invalid
                )
            }
            XCTAssertEqual(
                error as? DE442SEphemerisError,
                .nonFiniteJulianDate
            )
        }
    }

    func testActorCacheIsBoundedAndUsesLRUEviction()
        async throws
    {
        let loader = LockedBundledChunkLoader()
        let provider = try DE442SEphemerisProviderV1(
            manifestData: try bundledManifestData(),
            maximumCachedChunkCount: 2,
            chunkDataLoader: { name in
                try loader.load(name)
            }
        )

        _ = try await provider.state(
            tdbJulianDate: 2_415_020.5 + 1
        )
        _ = try await provider.state(
            tdbJulianDate: 2_416_846.5 + 1
        )
        _ = try await provider.state(
            tdbJulianDate: 2_415_020.5 + 2
        )
        _ = try await provider.state(
            tdbJulianDate: 2_418_672.5 + 1
        )

        let firstCachedIDs =
            await provider.cachedChunkIDsForTesting()
        XCTAssertEqual(
            firstCachedIDs,
            ["1900-1905", "1910-1915"]
        )
        XCTAssertEqual(
            loader.loadCount(named: "1900-1905.v1.bin"),
            1
        )
        XCTAssertEqual(
            loader.loadCount(named: "1905-1910.v1.bin"),
            1
        )
        XCTAssertEqual(
            loader.loadCount(named: "1910-1915.v1.bin"),
            1
        )

        _ = try await provider.state(
            tdbJulianDate: 2_416_846.5 + 2
        )
        XCTAssertEqual(
            loader.loadCount(named: "1905-1910.v1.bin"),
            2
        )
        let secondCachedIDs =
            await provider.cachedChunkIDsForTesting()
        XCTAssertEqual(
            secondCachedIDs,
            ["1910-1915", "1905-1910"]
        )
    }

    func testFailedChunkLoadIsNotCachedAndCanRetry()
        async throws
    {
        let loader = FailOnceBundledChunkLoader()
        let provider = try DE442SEphemerisProviderV1(
            manifestData: try bundledManifestData(),
            chunkDataLoader: { name in
                try loader.load(name)
            }
        )

        let firstError = await capturedError {
            _ = try await provider.state(
                tdbJulianDate: 2_460_800.25
            )
        }
        guard case .resourceUnavailable =
            firstError as? DE442SEphemerisError
        else {
            return XCTFail(
                "Expected resourceUnavailable, got " +
                    String(describing: firstError)
            )
        }

        _ = try await provider.state(
            tdbJulianDate: 2_460_800.25
        )
        XCTAssertEqual(loader.loadCount, 2)
    }

    func testManifestRejectsWrongModelTraversalAndOverflowShapes()
        throws
    {
        let original = try bundledManifestData()
        let mutations:
            [(String, (inout [String: Any]) -> Void)] = [
                ("model", { $0["model"] = "de442s-impersonator" }),
                ("traversal", { root in
                    var chunks = root["chunks"] as! [[String: Any]]
                    chunks[0]["file"] = "../1900-1905.v1.bin"
                    root["chunks"] = chunks
                }),
                ("record overflow", { root in
                    var chunks = root["chunks"] as! [[String: Any]]
                    var series =
                        chunks[0]["series"] as! [[String: Any]]
                    series[0]["recordCount"] = Int.max
                    chunks[0]["series"] = series
                    root["chunks"] = chunks
                }),
            ]

        for (label, mutation) in mutations {
            let data = try mutateManifest(
                original,
                mutation: mutation
            )
            XCTAssertThrowsError(
                try DE442SEphemerisProviderV1(
                    manifestData: data,
                    chunkDataLoader: { _ in Data() }
                ),
                label
            ) { error in
                guard case .invalidManifest =
                    error as? DE442SEphemerisError
                else {
                    return XCTFail(
                        "\(label): unexpected \(error)"
                    )
                }
            }
        }
    }

    func testRejectsInvalidCacheCapacity() throws {
        let manifestData = try bundledManifestData()
        for capacity in [0, 4, Int.max] {
            XCTAssertThrowsError(
                try DE442SEphemerisProviderV1(
                    manifestData: manifestData,
                    maximumCachedChunkCount: capacity,
                    chunkDataLoader: { _ in Data() }
                )
            ) { error in
                guard case .invalidManifest =
                    error as? DE442SEphemerisError
                else {
                    return XCTFail(
                        "Unexpected error \(error)"
                    )
                }
            }
        }
    }

    func testRejectsChunkHashMismatchBeforeDecoding()
        async throws
    {
        let original = try bundledChunkData(
            named: "1900-1905.v1.bin"
        )
        var corrupted = original
        corrupted[0] ^= 0xff
        let corruptedData = corrupted
        let provider = try DE442SEphemerisProviderV1(
            manifestData: try bundledManifestData(),
            chunkDataLoader: { _ in corruptedData }
        )

        let error = await capturedError {
            _ = try await provider.rawState(
                for: .sun,
                tdbJulianDate: 2_415_020.5
            )
        }
        XCTAssertEqual(
            error as? DE442SEphemerisError,
            .invalidChunk("SHA-256")
        )
    }

    func testDecodesADataSliceWithoutAlignedPointerAssumptions()
        async throws
    {
        let original = try bundledChunkData(
            named: "1900-1905.v1.bin"
        )
        var padded = Data([0xff])
        padded.append(original)
        let sliced = padded[1...]
        XCTAssertEqual(sliced.startIndex, 1)

        let provider = try DE442SEphemerisProviderV1(
            manifestData: try bundledManifestData(),
            chunkDataLoader: { _ in sliced }
        )
        let actual = try await provider.rawState(
            for: .sun,
            tdbJulianDate: 2_415_020.5
        )
        let expected = try await
            DE442SEphemerisProviderV1.loadBundled()
            .rawState(
                for: .sun,
                tdbJulianDate: 2_415_020.5
            )
        XCTAssertEqual(actual, expected)
    }

    func testRejectsAuthenticatedBadHeaderNonFiniteCoefficientAndPadding()
        async throws
    {
        let original = try bundledChunkData(
            named: "1900-1905.v1.bin"
        )
        let corruptions:
            [(String, (inout Data) -> Void)] = [
                ("header", { $0[0] ^= 0xff }),
                ("coefficient", {
                    writeUInt32(
                        Float.nan.bitPattern,
                        at: 128 + 16,
                        into: &$0
                    )
                }),
                ("padding", { $0[128 + 172] = 1 }),
            ]

        for (label, corrupt) in corruptions {
            var chunkData = original
            corrupt(&chunkData)
            let corruptedChunkData = chunkData
            let manifestData = try manifestData(
                replacingFirstChunkSHA256:
                    sha256Hex(corruptedChunkData)
            )
            let provider = try DE442SEphemerisProviderV1(
                manifestData: manifestData,
                chunkDataLoader: { _ in
                    corruptedChunkData
                }
            )
            let error = await capturedError {
                _ = try await provider.rawState(
                    for: .sun,
                    tdbJulianDate: 2_415_020.5
                )
            }
            guard case .invalidChunk =
                error as? DE442SEphemerisError
            else {
                return XCTFail(
                    "\(label): expected invalidChunk, got " +
                        String(describing: error)
                )
            }
        }
    }

    private func loadFixture() throws -> Fixture {
        try JSONDecoder().decode(
            Fixture.self,
            from: TestFixtureData.data(
                at: "shared/fixtures/de442s-ephemeris.v1.json"
            )
        )
    }

    private func assertVector(
        _ actual: Vector3D,
        equals expected: [Double],
        accuracy: Double,
        context: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        guard expected.count == 3 else {
            return XCTFail(
                "\(context): expected three components",
                file: file,
                line: line
            )
        }
        XCTAssertEqual(
            actual.x,
            expected[0],
            accuracy: accuracy,
            context,
            file: file,
            line: line
        )
        XCTAssertEqual(
            actual.y,
            expected[1],
            accuracy: accuracy,
            context,
            file: file,
            line: line
        )
        XCTAssertEqual(
            actual.z,
            expected[2],
            accuracy: accuracy,
            context,
            file: file,
            line: line
        )
    }

    private func capturedError(
        _ operation: () async throws -> Void
    ) async -> Error? {
        do {
            try await operation()
            return nil
        } catch {
            return error
        }
    }
}

private struct Fixture: Decodable {
    let sampleCases: [FixtureCase]
    let boundaryCases: [FixtureBoundaryCase]
}

private struct FixtureCase: Decodable {
    let julianDateTdb: Double
    let series: [FixtureSeries]
}

private struct FixtureBoundaryCase: Decodable {
    let julianDateTdb: Double
    let chunks: [FixtureChunk]
}

private struct FixtureChunk: Decodable {
    let chunkId: String
    let series: [FixtureSeries]
}

private struct FixtureSeries: Decodable {
    let seriesId: DE442SEphemerisSeriesV1
    let packedPositionKilometers: [Double]
    let packedVelocityKilometersPerSecond: [Double]
}

private final class LockedBundledChunkLoader:
    @unchecked Sendable
{
    private let lock = NSLock()
    private var counts: [String: Int] = [:]

    func load(_ name: String) throws -> Data {
        lock.lock()
        counts[name, default: 0] += 1
        lock.unlock()
        return try bundledChunkData(named: name)
    }

    func loadCount(named name: String) -> Int {
        lock.lock()
        defer { lock.unlock() }
        return counts[name, default: 0]
    }
}

private final class FailOnceBundledChunkLoader:
    @unchecked Sendable
{
    private let lock = NSLock()
    private var attempts = 0

    var loadCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return attempts
    }

    func load(_ name: String) throws -> Data {
        lock.lock()
        attempts += 1
        let shouldFail = attempts == 1
        lock.unlock()
        if shouldFail {
            throw SyntheticChunkError.firstAttempt
        }
        return try bundledChunkData(named: name)
    }
}

private enum SyntheticChunkError: LocalizedError {
    case firstAttempt

    var errorDescription: String? {
        "synthetic first-attempt failure"
    }
}

private func bundledManifestData() throws -> Data {
    try SharedResources.de442sEphemerisData(for: .manifest)
}

private func bundledChunkData(named name: String) throws -> Data {
    try SharedResources.de442sEphemerisChunkData(named: name)
}

private func mutateManifest(
    _ data: Data,
    mutation: (inout [String: Any]) -> Void
) throws -> Data {
    var root = try XCTUnwrap(
        JSONSerialization.jsonObject(with: data)
            as? [String: Any]
    )
    mutation(&root)
    return try JSONSerialization.data(
        withJSONObject: root,
        options: [.sortedKeys]
    )
}

private func manifestData(
    replacingFirstChunkSHA256 digest: String
) throws -> Data {
    try mutateManifest(try bundledManifestData()) { root in
        var chunks = root["chunks"] as! [[String: Any]]
        chunks[0]["sha256"] = digest
        root["chunks"] = chunks
    }
}

private func sha256Hex(_ data: Data) -> String {
    let digits = Array("0123456789abcdef".utf8)
    var result = [UInt8]()
    result.reserveCapacity(64)
    for byte in SHA256.hash(data: data) {
        result.append(digits[Int(byte >> 4)])
        result.append(digits[Int(byte & 0x0f)])
    }
    return String(decoding: result, as: UTF8.self)
}

private func writeUInt32(
    _ value: UInt32,
    at offset: Int,
    into data: inout Data
) {
    var littleEndian = value.littleEndian
    withUnsafeBytes(of: &littleEndian) { bytes in
        data.replaceSubrange(
            offset..<(offset + bytes.count),
            with: bytes
        )
    }
}
