import Foundation
import PlanetariumShared

/*
 * This Swift module uses coefficients and computations derived from the IAU
 * SOFA ANSI C 2023-10-11 `epv00` routine. It is not software provided by or
 * endorsed by SOFA.
 *
 * Differences from the original routine:
 * - only the heliocentric Sun-to-Earth position is evaluated;
 * - 100 of 1,323 position terms are retained using the documented
 *   century-wide contribution rule in the shared canonical artifact;
 * - TT is used as a TDB proxy;
 * - the implementation and identifiers are native Swift.
 *
 * The complete derived-work notice and SOFA Software License are distributed
 * at `shared/licenses/IAU-SOFA-derived-work-notice.md`.
 */

public struct TruncatedEarthHeliocentricStateV2:
    Hashable, Sendable
{
    /// Heliocentric Sun-to-Earth position in BCRS-oriented AU.
    public let positionAU: Vector3D
    /// Analytic heliocentric Earth velocity in BCRS-oriented AU/day.
    public let velocityAUPerDay: Vector3D

    public init(
        positionAU: Vector3D,
        velocityAUPerDay: Vector3D
    ) {
        self.positionAU = positionAU
        self.velocityAUPerDay = velocityAUPerDay
    }
}

public enum TruncatedEarthEphemerisErrorV1:
    LocalizedError, Equatable, Sendable
{
    case resourceUnavailable(String)
    case invalidArtifact(String)
    case numericFailure

    public var errorDescription: String? {
        switch self {
        case let .resourceUnavailable(reason):
            "共有地球暦を読み込めませんでした（\(reason)）。"
        case let .invalidArtifact(reason):
            "共有地球暦が不正です（\(reason)）。"
        case .numericFailure:
            "共有地球暦の評価結果が有限範囲を超えました。"
        }
    }
}

struct TruncatedEarthEphemerisArtifactV1:
    Decodable, Hashable, Sendable
{
    struct Source: Decodable, Hashable, Sendable {
        let release: String
        let sourceRoutine: String
        let sourceFileSha256: String
        let archiveUrl: String
        let archiveSha256: String
    }

    struct Truncation: Decodable, Hashable, Sendable {
        let rule: String
        let referenceSpanJulianYears: Int
        let fullTermCount: Int
        let retainedTermCount: Int
    }

    struct Units: Decodable, Hashable, Sendable {
        let amplitude: String
        let phase: String
        let frequency: String
    }

    struct HarmonicTerm: Decodable, Hashable, Sendable {
        let amplitudeAU: Double
        let phaseRadians: Double
        let frequencyRadiansPerJulianYear: Double

        init(from decoder: Decoder) throws {
            var values = try decoder.unkeyedContainer()
            amplitudeAU = try values.decode(Double.self)
            phaseRadians = try values.decode(Double.self)
            frequencyRadiansPerJulianYear =
                try values.decode(Double.self)
            guard values.isAtEnd else {
                throw DecodingError.dataCorruptedError(
                    in: values,
                    debugDescription:
                        "harmonic term must have three values"
                )
            }
        }
    }

    struct Series: Decodable, Hashable, Sendable {
        let e0x: [HarmonicTerm]
        let e0y: [HarmonicTerm]
        let e0z: [HarmonicTerm]
        let e1x: [HarmonicTerm]
        let e1y: [HarmonicTerm]
        let e1z: [HarmonicTerm]
        let e2x: [HarmonicTerm]
        let e2y: [HarmonicTerm]
        let e2z: [HarmonicTerm]

        var all: [[HarmonicTerm]] {
            [
                e0x, e0y, e0z,
                e1x, e1y, e1z,
                e2x, e2y, e2z,
            ]
        }
    }

    let schemaVersion: Int
    let model: String
    let source: Source
    let truncation: Truncation
    let units: Units
    let bcrsOrientationMatrix: [[Double]]
    let series: Series

    var retainedTermCount: Int {
        series.all.reduce(0) { $0 + $1.count }
    }

    var orientationMatrix: PrecisionMatrix3 {
        PrecisionMatrix3(
            row0: Vector3D(
                x: bcrsOrientationMatrix[0][0],
                y: bcrsOrientationMatrix[0][1],
                z: bcrsOrientationMatrix[0][2]
            ),
            row1: Vector3D(
                x: bcrsOrientationMatrix[1][0],
                y: bcrsOrientationMatrix[1][1],
                z: bcrsOrientationMatrix[1][2]
            ),
            row2: Vector3D(
                x: bcrsOrientationMatrix[2][0],
                y: bcrsOrientationMatrix[2][1],
                z: bcrsOrientationMatrix[2][2]
            )
        )
    }
}

enum TruncatedEarthEphemerisDecoderV1 {
    private static let rootKeys: Set<String> = [
        "schemaVersion",
        "model",
        "source",
        "truncation",
        "units",
        "bcrsOrientationMatrix",
        "series",
    ]
    private static let sourceKeys: Set<String> = [
        "release",
        "sourceRoutine",
        "sourceFileSha256",
        "archiveUrl",
        "archiveSha256",
    ]
    private static let truncationKeys: Set<String> = [
        "rule",
        "referenceSpanJulianYears",
        "fullTermCount",
        "retainedTermCount",
    ]
    private static let unitKeys: Set<String> = [
        "amplitude",
        "phase",
        "frequency",
    ]
    private static let seriesKeys: Set<String> = [
        "e0x", "e0y", "e0z",
        "e1x", "e1y", "e1z",
        "e2x", "e2y", "e2z",
    ]
    private static let expectedSeriesCounts = [
        43, 44, 2,
        4, 3, 3,
        0, 0, 1,
    ]
    private static let expectedOrientationMatrix = [
        [1.0, 0.000_000_211_284, -0.000_000_091_603],
        [
            -0.000_000_230_286,
            0.917_482_137_087,
            -0.397_776_982_902,
        ],
        [
            0,
            0.397_776_982_902,
            0.917_482_137_087,
        ],
    ]

    static func decode(
        from data: Data
    ) throws -> TruncatedEarthEphemerisArtifactV1 {
        try validateObjectShape(data)
        let artifact: TruncatedEarthEphemerisArtifactV1
        do {
            artifact = try JSONDecoder().decode(
                TruncatedEarthEphemerisArtifactV1.self,
                from: data
            )
        } catch {
            throw TruncatedEarthEphemerisErrorV1
                .invalidArtifact(
                    "JSON decode: \(error.localizedDescription)"
                )
        }
        try validate(artifact)
        return artifact
    }

    private static func validateObjectShape(
        _ data: Data
    ) throws {
        let object: Any
        do {
            object = try JSONSerialization.jsonObject(
                with: data
            )
        } catch {
            throw TruncatedEarthEphemerisErrorV1
                .invalidArtifact(
                    "JSON object: \(error.localizedDescription)"
                )
        }
        guard let root = object as? [String: Any] else {
            throw TruncatedEarthEphemerisErrorV1
                .invalidArtifact("root object")
        }
        try requireExactKeys(
            root,
            expected: rootKeys,
            context: "root"
        )
        try requireExactKeys(
            root["source"],
            expected: sourceKeys,
            context: "source"
        )
        try requireExactKeys(
            root["truncation"],
            expected: truncationKeys,
            context: "truncation"
        )
        try requireExactKeys(
            root["units"],
            expected: unitKeys,
            context: "units"
        )
        try requireExactKeys(
            root["series"],
            expected: seriesKeys,
            context: "series"
        )
    }

    private static func requireExactKeys(
        _ value: Any?,
        expected: Set<String>,
        context: String
    ) throws {
        guard let dictionary = value as? [String: Any],
              Set(dictionary.keys) == expected
        else {
            throw TruncatedEarthEphemerisErrorV1
                .invalidArtifact("\(context) keys")
        }
    }

    private static func validate(
        _ artifact: TruncatedEarthEphemerisArtifactV1
    ) throws {
        guard artifact.schemaVersion == 1,
              artifact.model
                == "truncated-vsop2000-earth-heliocentric",
              artifact.source.release
                == "IAU SOFA ANSI C 2023-10-11",
              artifact.source.sourceRoutine == "epv00",
              artifact.source.sourceFileSha256
                == "939d57fb2556dcd065370e090df962a7d459a89d972e7fe1b9b250306fe73c8a",
              artifact.source.archiveUrl
                == "https://www.iausofa.org/s/sofa_c-20231011tar.gz",
              artifact.source.archiveSha256
                == "d9c10833cae8b4d9361a0ffda31ec361fd1262362025bec4d4e51a880150ace2",
              artifact.truncation.rule
                == "top terms by abs(amplitude) * referenceSpanJulianYears ** timePower",
              artifact.truncation.referenceSpanJulianYears
                == 100,
              artifact.truncation.fullTermCount == 1_323,
              artifact.truncation.retainedTermCount == 100,
              artifact.units.amplitude == "au",
              artifact.units.phase == "radian",
              artifact.units.frequency
                == "radian per Julian year",
              artifact.bcrsOrientationMatrix
                == expectedOrientationMatrix,
              artifact.series.all.map(\.count)
                == expectedSeriesCounts,
              artifact.retainedTermCount == 100
        else {
            throw TruncatedEarthEphemerisErrorV1
                .invalidArtifact(
                    "schema, provenance, matrix, or term counts"
                )
        }

        for term in artifact.series.all.joined() {
            guard term.amplitudeAU.isFinite,
                  term.amplitudeAU != 0,
                  abs(term.amplitudeAU) <= 2,
                  term.phaseRadians.isFinite,
                  (0...PrecisionConstants.twoPi)
                    .contains(term.phaseRadians),
                  term.frequencyRadiansPerJulianYear
                    .isFinite,
                  (0...200).contains(
                    term.frequencyRadiansPerJulianYear
                  )
            else {
                throw TruncatedEarthEphemerisErrorV1
                    .invalidArtifact(
                        "non-finite or out-of-envelope coefficient"
                    )
            }
        }
    }
}

private enum CachedTruncatedEarthEphemerisV1 {
    static let artifact:
        Result<
            TruncatedEarthEphemerisArtifactV1,
            TruncatedEarthEphemerisErrorV1
        > = {
            do {
                let data = try SharedResources.data(
                    for:
                        .truncatedEarthHeliocentricEphemeris
                )
                return .success(
                    try TruncatedEarthEphemerisDecoderV1
                        .decode(from: data)
                )
            } catch let error
                as TruncatedEarthEphemerisErrorV1
            {
                return .failure(error)
            } catch {
                return .failure(
                    TruncatedEarthEphemerisErrorV1
                        .resourceUnavailable(
                            error.localizedDescription
                        )
                )
            }
        }()
}

private struct EvaluatedEarthTermsV2 {
    let positionAU: Double
    let derivativeAUPerJulianYear: Double
}

private func evaluateEarthTermsV2(
    _ terms:
        [TruncatedEarthEphemerisArtifactV1.HarmonicTerm],
    julianYearsSinceJ2000: Double
) -> EvaluatedEarthTermsV2 {
    var positionAU = 0.0
    var derivativeAUPerJulianYear = 0.0
    for term in terms {
        let argument =
            term.phaseRadians
            + term.frequencyRadiansPerJulianYear
            * julianYearsSinceJ2000
        positionAU += term.amplitudeAU * cos(argument)
        derivativeAUPerJulianYear -=
            term.amplitudeAU
            * term.frequencyRadiansPerJulianYear
            * sin(argument)
    }
    return EvaluatedEarthTermsV2(
        positionAU: positionAU,
        derivativeAUPerJulianYear:
            derivativeAUPerJulianYear
    )
}

private func evaluateEarthComponentV2(
    constantTerms:
        [TruncatedEarthEphemerisArtifactV1.HarmonicTerm],
    linearTerms:
        [TruncatedEarthEphemerisArtifactV1.HarmonicTerm],
    quadraticTerms:
        [TruncatedEarthEphemerisArtifactV1.HarmonicTerm],
    julianYearsSinceJ2000: Double
) -> EvaluatedEarthTermsV2 {
    let constant = evaluateEarthTermsV2(
        constantTerms,
        julianYearsSinceJ2000:
            julianYearsSinceJ2000
    )
    let linear = evaluateEarthTermsV2(
        linearTerms,
        julianYearsSinceJ2000:
            julianYearsSinceJ2000
    )
    let quadratic = evaluateEarthTermsV2(
        quadraticTerms,
        julianYearsSinceJ2000:
            julianYearsSinceJ2000
    )
    let t = julianYearsSinceJ2000
    return EvaluatedEarthTermsV2(
        positionAU:
            constant.positionAU
            + t * linear.positionAU
            + t * t * quadratic.positionAU,
        derivativeAUPerJulianYear:
            constant.derivativeAUPerJulianYear
            + linear.positionAU
            + t * linear.derivativeAUPerJulianYear
            + 2 * t * quadratic.positionAU
            + t * t
            * quadratic.derivativeAUPerJulianYear
    )
}

private func evaluateTruncatedEarthHeliocentricStateV2(
    ttJulianDate: Double,
    artifact: TruncatedEarthEphemerisArtifactV1
) throws -> TruncatedEarthHeliocentricStateV2 {
    guard ttJulianDate.isFinite else {
        throw PrecisionModelError.nonFiniteValue(
            "TT Julian date"
        )
    }
    let t =
        (ttJulianDate - Astronomy.j2000JulianDate)
        / PrecisionConstants.daysPerJulianYear
    let x = evaluateEarthComponentV2(
        constantTerms: artifact.series.e0x,
        linearTerms: artifact.series.e1x,
        quadraticTerms: artifact.series.e2x,
        julianYearsSinceJ2000: t
    )
    let y = evaluateEarthComponentV2(
        constantTerms: artifact.series.e0y,
        linearTerms: artifact.series.e1y,
        quadraticTerms: artifact.series.e2y,
        julianYearsSinceJ2000: t
    )
    let z = evaluateEarthComponentV2(
        constantTerms: artifact.series.e0z,
        linearTerms: artifact.series.e1z,
        quadraticTerms: artifact.series.e2z,
        julianYearsSinceJ2000: t
    )
    let matrix = artifact.orientationMatrix
    let position = matrix.applying(
        to: Vector3D(
            x: x.positionAU,
            y: y.positionAU,
            z: z.positionAU
        )
    )
    let velocity = matrix.applying(
        to: Vector3D(
            x:
                x.derivativeAUPerJulianYear
                / PrecisionConstants.daysPerJulianYear,
            y:
                y.derivativeAUPerJulianYear
                / PrecisionConstants.daysPerJulianYear,
            z:
                z.derivativeAUPerJulianYear
                / PrecisionConstants.daysPerJulianYear
        )
    )
    guard position.isFinite,
          position.length.isFinite,
          position.length > 0,
          velocity.isFinite
    else {
        throw TruncatedEarthEphemerisErrorV1.numericFailure
    }
    return TruncatedEarthHeliocentricStateV2(
        positionAU: position,
        velocityAUPerDay: velocity
    )
}

public extension Astronomy {
    /**
     Heliocentric Sun-to-Earth state from the shared 100-term VSOP2000
     truncation, loaded and strictly validated once, then evaluated in
     BCRS-oriented axes.

     The coefficient selection is audited only for Planetarium's 1900–2100
     support interval and is not a general-purpose ephemeris.
     */
    static func truncatedEarthHeliocentricStateV2(
        ttJulianDate: Double
    ) throws -> TruncatedEarthHeliocentricStateV2 {
        try evaluateTruncatedEarthHeliocentricStateV2(
            ttJulianDate: ttJulianDate,
            artifact:
                CachedTruncatedEarthEphemerisV1
                .artifact.get()
        )
    }
}
