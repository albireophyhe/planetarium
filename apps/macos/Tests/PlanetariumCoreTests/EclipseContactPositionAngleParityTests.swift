import Foundation
@testable import PlanetariumCore
import Testing

struct EclipseContactPositionAngleParityTests {
    private let fixture: PositionAngleFixture = {
        let testFileURL = URL(
            fileURLWithPath: #filePath
        )
        let repositoryRoot = testFileURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let fixtureURL = repositoryRoot
            .appendingPathComponent(
                "shared/fixtures/"
                    + "eclipse-contact-position-angles"
                    + ".v1.json"
            )
        let data = try! Data(contentsOf: fixtureURL)
        return try! JSONDecoder().decode(
            PositionAngleFixture.self,
            from: data
        )
    }()

    @Test
    func sharedFixtureLocksCIRSNorthThroughEastConvention()
        throws
    {
        #expect(fixture.schemaVersion == 1)
        #expect(
            fixture.convention
                == .init(
                    frame:
                        "CIRS tangent plane (north from CIP)",
                    referenceDirection:
                        "celestial-north",
                    positiveDirection: "eastward",
                    rangeDegrees: "[0, 360)"
                )
        )

        for vector in fixture.cases {
            let radialDirection:
                EclipseContactRadialDirectionV1 =
                    switch vector.radialDirection {
                    case "toward-other-center":
                        .towardOtherCenter
                    case "away-from-other-center":
                        .awayFromOtherCenter
                    default:
                        throw FixtureError
                            .unknownRadialDirection(
                                vector.radialDirection
                            )
                    }
            let actual =
                EclipseContactPositionAngleV1
                .radians(
                    referenceCenterDirection:
                        vector
                        .referenceCenterDirection
                        .vector,
                    otherCenterDirection:
                        vector.otherCenterDirection
                        .vector,
                    radialDirection: radialDirection
                )
            guard let expected =
                vector.expectedDegrees
            else {
                #expect(
                    actual == nil,
                    Comment(rawValue: vector.id)
                )
                continue
            }
            let radians = try #require(
                actual,
                Comment(rawValue: vector.id)
            )
            #expect(
                abs(
                    radians * 180 / Double.pi
                        - expected
                ) <= fixture.toleranceDegrees,
                Comment(rawValue: vector.id)
            )
        }
    }

    @Test
    func nonFiniteDirectionsReturnNil() {
        #expect(
            EclipseContactPositionAngleV1
                .radians(
                    referenceCenterDirection:
                        Vector3D(
                            x: .nan,
                            y: 0,
                            z: 0
                        ),
                    otherCenterDirection:
                        .unitX
                ) == nil
        )
        #expect(
            EclipseContactPositionAngleV1
                .radians(
                    referenceCenterDirection:
                        .unitX,
                    otherCenterDirection:
                        Vector3D(
                            x: .infinity,
                            y: 0,
                            z: 0
                        )
                ) == nil
        )
    }
}

private struct PositionAngleFixture:
    Decodable, Sendable
{
    let schemaVersion: Int
    let convention: Convention
    let toleranceDegrees: Double
    let cases: [PositionAngleCase]
}

private struct Convention:
    Decodable, Equatable, Sendable
{
    let frame: String
    let referenceDirection: String
    let positiveDirection: String
    let rangeDegrees: String
}

private struct PositionAngleCase:
    Decodable, Sendable
{
    let id: String
    let referenceCenterDirection: [Double]
    let otherCenterDirection: [Double]
    let radialDirection: String
    let expectedDegrees: Double?
}

private extension Array where Element == Double {
    var vector: Vector3D {
        precondition(count == 3)
        return Vector3D(
            x: self[0],
            y: self[1],
            z: self[2]
        )
    }
}

private enum FixtureError: Error {
    case unknownRadialDirection(String)
}
