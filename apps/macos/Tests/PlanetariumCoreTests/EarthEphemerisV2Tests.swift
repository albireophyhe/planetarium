import Foundation
import PlanetariumShared
import XCTest

@testable import PlanetariumCore

final class EarthEphemerisV2Tests: XCTestCase {
    func testBundledArtifactStrictlyDecodesCanonicalProvenanceAndTerms()
        throws
    {
        let artifact = try decodedBundledArtifact()

        XCTAssertEqual(artifact.schemaVersion, 1)
        XCTAssertEqual(
            artifact.model,
            "truncated-vsop2000-earth-heliocentric"
        )
        XCTAssertEqual(
            artifact.source.sourceFileSha256,
            "939d57fb2556dcd065370e090df962a7d459a89d972e7fe1b9b250306fe73c8a"
        )
        XCTAssertEqual(
            artifact.source.archiveSha256,
            "d9c10833cae8b4d9361a0ffda31ec361fd1262362025bec4d4e51a880150ace2"
        )
        XCTAssertEqual(artifact.truncation.fullTermCount, 1_323)
        XCTAssertEqual(
            artifact.truncation.retainedTermCount,
            200
        )
        XCTAssertEqual(artifact.retainedTermCount, 200)
        XCTAssertEqual(
            artifact.series.all.map(\.count),
            [90, 88, 6, 4, 4, 3, 2, 2, 1]
        )
        XCTAssertEqual(
            artifact.bcrsOrientationMatrix,
            [
                [1, 2.11284e-7, -9.1603e-8],
                [
                    -2.30286e-7,
                    0.917482137087,
                    -0.397776982902,
                ],
                [
                    0,
                    0.397776982902,
                    0.917482137087,
                ],
            ]
        )
    }

    func testAnalyticVelocityMatchesCenteredPositionDerivative()
        throws
    {
        for julianDate in [
            2_415_020.5,
            2_461_150.0,
            2_488_069.5,
        ] {
            let halfStepDays = 0.001
            let before =
                try Astronomy
                    .truncatedEarthHeliocentricStateV2(
                        ttJulianDate:
                            julianDate - halfStepDays
                    )
            let state =
                try Astronomy
                    .truncatedEarthHeliocentricStateV2(
                        ttJulianDate: julianDate
                    )
            let after =
                try Astronomy
                    .truncatedEarthHeliocentricStateV2(
                        ttJulianDate:
                            julianDate + halfStepDays
                    )
            let centered =
                (after.positionAU - before.positionAU)
                / (2 * halfStepDays)

            XCTAssertEqual(
                state.velocityAUPerDay.x,
                centered.x,
                accuracy: 1e-8,
                "\(julianDate) vx"
            )
            XCTAssertEqual(
                state.velocityAUPerDay.y,
                centered.y,
                accuracy: 1e-8,
                "\(julianDate) vy"
            )
            XCTAssertEqual(
                state.velocityAUPerDay.z,
                centered.z,
                accuracy: 1e-8,
                "\(julianDate) vz"
            )
        }
    }

    func testApproximateEarthStateUsesCanonicalPositionAndAnalyticVelocity()
        throws
    {
        let julianDate = 2_461_150.0
        let canonical =
            try Astronomy.truncatedEarthHeliocentricStateV2(
                ttJulianDate: julianDate
            )
        let approximate = try Astronomy.approximateEarthStateV2(
            ttJulianDate: julianDate
        )

        XCTAssertEqual(
            approximate.positionAU,
            canonical.positionAU
        )
        XCTAssertEqual(
            approximate.velocityC,
            canonical.velocityAUPerDay
                / PrecisionConstants.speedOfLightAUPerDay
        )
        XCTAssertEqual(
            approximate.sunObserverDistanceAU,
            canonical.positionAU.length
        )
    }

    func testBundledArtifactIsCachedAndEvaluationIsDeterministic()
        throws
    {
        let first =
            try Astronomy.truncatedEarthHeliocentricStateV2(
                ttJulianDate: Astronomy.j2000JulianDate
            )
        let second =
            try Astronomy.truncatedEarthHeliocentricStateV2(
                ttJulianDate: Astronomy.j2000JulianDate
            )
        XCTAssertEqual(first, second)
    }

    func testStrictDecoderRejectsUnknownKeysProvenanceMatrixAndTermCount()
        throws
    {
        let original = try bundledObject()
        let corruptions:
            [(inout [String: Any]) -> Void] = [
                { $0["unexpected"] = true },
                { root in
                    var source =
                        root["source"] as! [String: Any]
                    source["sourceFileSha256"] =
                        String(repeating: "0", count: 64)
                    root["source"] = source
                },
                { root in
                    var matrix =
                        root["bcrsOrientationMatrix"]
                        as! [[Any]]
                    matrix[0][0] = 0.999
                    root["bcrsOrientationMatrix"] =
                        matrix
                },
                { root in
                    var series =
                        root["series"] as! [String: Any]
                    var terms =
                        series["e0x"] as! [[Any]]
                    terms.removeLast()
                    series["e0x"] = terms
                    root["series"] = series
                },
            ]

        for mutate in corruptions {
            var object = original
            mutate(&object)
            let data = try JSONSerialization.data(
                withJSONObject: object
            )
            assertInvalidArtifact(data)
        }
    }

    func testStrictDecoderRejectsNonFiniteAndMalformedCoefficient()
        throws
    {
        let data = try SharedResources.data(
            for: .truncatedEarthHeliocentricEphemeris
        )
        let text = try XCTUnwrap(
            String(data: data, encoding: .utf8)
        )
        let overflow = try XCTUnwrap(
            text.replacingFirstOccurrence(
                of: "0.9998292878132",
                with: "1e999"
            )
        )
        assertInvalidArtifact(
            Data(overflow.utf8)
        )

        var malformed = try bundledObject()
        var series = malformed["series"] as! [String: Any]
        var terms = series["e0x"] as! [[Any]]
        terms[0].append(0)
        series["e0x"] = terms
        malformed["series"] = series
        assertInvalidArtifact(
            try JSONSerialization.data(
                withJSONObject: malformed
            )
        )
    }

    func testNonFiniteEpochIsRejectedAndLegacyModeOnlyDecodes()
    {
        XCTAssertThrowsError(
            try Astronomy.truncatedEarthHeliocentricStateV2(
                ttJulianDate: .nan
            )
        ) { error in
            XCTAssertEqual(
                error as? PrecisionModelError,
                .nonFiniteValue("TT Julian date")
            )
        }
        XCTAssertEqual(
            AberrationModeV2(
                rawValue:
                    "truncated-vsop2000-heliocentric-earth"
            ),
            .truncatedVSOP2000HeliocentricEarth
        )
        XCTAssertNotNil(
            AberrationModeV2(
                rawValue:
                    "jpl-approximate-earth-moon-barycenter"
            )
        )
        XCTAssertNotNil(
            AnnualParallaxModeV2(
                rawValue:
                    "jpl-approximate-earth-moon-barycenter"
            )
        )
        XCTAssertNotNil(
            SolarLightDeflectionModeV2(
                rawValue:
                    "jpl-approximate-earth-moon-barycenter"
            )
        )
        XCTAssertNotNil(
            SolarEphemerisModeV2(
                rawValue:
                    "jpl-approximate-earth-moon-barycenter"
            )
        )
    }

    private func decodedBundledArtifact()
        throws -> TruncatedEarthEphemerisArtifactV1
    {
        try TruncatedEarthEphemerisDecoderV1.decode(
            from: SharedResources.data(
                for: .truncatedEarthHeliocentricEphemeris
            )
        )
    }

    private func bundledObject()
        throws -> [String: Any]
    {
        let data = try SharedResources.data(
            for: .truncatedEarthHeliocentricEphemeris
        )
        return try XCTUnwrap(
            JSONSerialization.jsonObject(with: data)
                as? [String: Any]
        )
    }

    private func assertInvalidArtifact(
        _ data: Data,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertThrowsError(
            try TruncatedEarthEphemerisDecoderV1.decode(
                from: data
            ),
            file: file,
            line: line
        ) { error in
            guard case .invalidArtifact =
                error as? TruncatedEarthEphemerisErrorV1
            else {
                return XCTFail(
                    "Expected invalidArtifact, got \(error)",
                    file: file,
                    line: line
                )
            }
        }
    }
}

private extension String {
    func replacingFirstOccurrence(
        of target: String,
        with replacement: String
    ) -> String? {
        guard let range = range(of: target) else {
            return nil
        }
        var copy = self
        copy.replaceSubrange(range, with: replacement)
        return copy
    }
}
