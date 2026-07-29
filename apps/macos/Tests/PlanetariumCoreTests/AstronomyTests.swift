import Foundation
import PlanetariumShared
import XCTest

@testable import PlanetariumCore

final class AstronomyTests: XCTestCase {
    private let fixture: AstronomyFixture = {
        let data = try! SharedResources.data(for: .astronomyTestVectors)
        return try! JSONDecoder().decode(AstronomyFixture.self, from: data)
    }()

    func testJulianDateFixtures() throws {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        for vector in fixture.julianDates {
            let date = try XCTUnwrap(formatter.date(from: vector.iso), vector.id)
            XCTAssertEqual(
                Astronomy.julianDate(for: date),
                vector.expected,
                accuracy: 1e-8,
                vector.id
            )
        }
    }

    func testSiderealTimeFixtures() {
        for vector in fixture.siderealTimes {
            let actual = Astronomy.localSiderealTime(
                julianDate: vector.julianDate,
                longitude: Angles.radians(fromDegrees: vector.longitude)
            )
            XCTAssertEqual(
                Angles.degrees(fromRadians: actual),
                vector.expected,
                accuracy: 1e-8,
                vector.id
            )
        }
    }

    func testHorizontalCoordinateFixtures() {
        for vector in fixture.horizontalCoordinates {
            let actual = Astronomy.horizontalCoordinates(
                declination: Angles.radians(fromDegrees: vector.declination),
                hourAngle: Angles.radians(fromDegrees: vector.hourAngle),
                latitude: Angles.radians(fromDegrees: vector.latitude)
            )
            XCTAssertEqual(
                Angles.degrees(fromRadians: actual.altitude),
                vector.altitude,
                accuracy: 1e-8,
                vector.id
            )
            XCTAssertEqual(actual.azimuthIsDefined, vector.azimuthDefined, vector.id)
            if vector.azimuthDefined {
                XCTAssertEqual(
                    Angles.degrees(fromRadians: actual.azimuth),
                    vector.azimuth,
                    accuracy: 1e-8,
                    vector.id
                )
            }
        }
    }

    func testProjectionFixtures() {
        for vector in fixture.projections {
            let actual = Astronomy.project(
                altitude: Angles.radians(fromDegrees: vector.altitude),
                azimuth: Angles.radians(fromDegrees: vector.azimuth)
            )
            XCTAssertEqual(actual.x, vector.x, accuracy: 1e-12, vector.id)
            XCTAssertEqual(actual.y, vector.y, accuracy: 1e-12, vector.id)
        }
    }

    func testPrecessionIsIdentityAtJ2000() {
        let rightAscension = Angles.radians(fromDegrees: 279.2347)
        let declination = Angles.radians(fromDegrees: 38.7837)
        let result = Astronomy.precessFromJ2000(
            rightAscension: rightAscension,
            declination: declination,
            toJulianDate: Astronomy.j2000JulianDate
        )
        XCTAssertEqual(result.rightAscension, rightAscension, accuracy: 1e-14)
        XCTAssertEqual(result.declination, declination, accuracy: 1e-14)
    }

    func testPrecessionRegressionVectors() {
        for vector in fixture.precessionVectors {
            let result = Astronomy.precessFromJ2000(
                rightAscension: .degrees(vector.rightAscension),
                declination: .degrees(vector.declination),
                toJulianDate: vector.julianDate
            )
            XCTAssertEqual(
                Angles.degrees(fromRadians: result.rightAscension),
                vector.expected.rightAscension,
                accuracy: fixture.tolerances.precessionDegrees,
                vector.id
            )
            XCTAssertEqual(
                Angles.degrees(fromRadians: result.declination),
                vector.expected.declination,
                accuracy: fixture.tolerances.precessionDegrees,
                vector.id
            )
        }
    }

    func testRealStarPositionRegressionVectors() throws {
        for vector in fixture.realStarPositions {
            let date = try XCTUnwrap(isoDate(vector.iso), vector.id)
            let result = Astronomy.horizontalCoordinates(
                rightAscension: .degrees(vector.star.rightAscension),
                declination: .degrees(vector.star.declination),
                at: date,
                latitude: .degrees(vector.location.latitude),
                longitude: .degrees(vector.location.longitude)
            )
            XCTAssertEqual(
                Angles.degrees(fromRadians: result.altitude),
                vector.expected.altitude,
                accuracy: fixture.tolerances.realStarDegrees,
                vector.id
            )
            XCTAssertEqual(
                Angles.degrees(fromRadians: result.azimuth),
                vector.expected.azimuth,
                accuracy: fixture.tolerances.realStarDegrees,
                vector.id
            )
            XCTAssertEqual(
                result.azimuthIsDefined,
                vector.expected.azimuthDefined,
                vector.id
            )
        }
    }

    func testAngularDistanceRemainsStableNearZenith() {
        let first = HorizontalCoordinates(
            altitude: Angles.radians(fromDegrees: 89.999),
            azimuth: 0
        )
        let second = HorizontalCoordinates(
            altitude: Angles.radians(fromDegrees: 89.999),
            azimuth: .pi
        )
        let distance = Angles.degrees(
            fromRadians: Astronomy.angularDistance(between: first, and: second)
        )
        XCTAssertEqual(distance, 0.002, accuracy: 1e-7)
    }

    func testAngularDistanceRegressionVectors() {
        for vector in fixture.angularDistances {
            let first = HorizontalCoordinates(
                altitude: .degrees(vector.first.latitude),
                azimuth: .degrees(vector.first.longitude)
            )
            let second = HorizontalCoordinates(
                altitude: .degrees(vector.second.latitude),
                azimuth: .degrees(vector.second.longitude)
            )
            let result = Angles.degrees(
                fromRadians: Astronomy.angularDistance(between: first, and: second)
            )
            XCTAssertEqual(
                result,
                vector.expected,
                accuracy: fixture.tolerances.angularDistanceDegrees,
                vector.id
            )
        }
    }

    func testSolarTwilightBoundaries() {
        XCTAssertEqual(Sun.twilightPhase(forSolarAltitude: .degrees(2)), .day)
        XCTAssertEqual(Sun.twilightPhase(forSolarAltitude: .degrees(-3)), .civil)
        XCTAssertEqual(Sun.twilightPhase(forSolarAltitude: .degrees(-9)), .nautical)
        XCTAssertEqual(Sun.twilightPhase(forSolarAltitude: .degrees(-15)), .astronomical)
        XCTAssertEqual(Sun.twilightPhase(forSolarAltitude: .degrees(-20)), .night)
    }

    func testTwilightBoundaryFixtures() throws {
        for vector in fixture.twilightPhases {
            let expected = try XCTUnwrap(TwilightPhase(rawValue: vector.expected))
            XCTAssertEqual(
                Sun.twilightPhase(forSolarAltitude: .degrees(vector.altitude)),
                expected
            )
        }
    }

    func testEquinoxNoonSunIsHighAtGreenwichEquator() throws {
        let date = try XCTUnwrap(
            ISO8601DateFormatter().date(from: "2024-03-20T12:00:00Z")
        )
        let location = ObservingLocation(
            id: "equator",
            name: "Equator",
            latitude: 0,
            longitude: 0,
            timeZoneIdentifier: "UTC"
        )
        let sun = Sun.state(at: date, location: location)
        XCTAssertGreaterThan(Angles.degrees(fromRadians: sun.horizontal.altitude), 87)
        XCTAssertEqual(sun.phase, .day)
    }

    func testSolarPositionRegressionVectors() throws {
        for vector in fixture.solarPositions {
            let date = try XCTUnwrap(isoDate(vector.iso), vector.id)
            let location = ObservingLocation(
                id: vector.location.id,
                name: vector.location.id,
                latitude: vector.location.latitude,
                longitude: vector.location.longitude,
                timeZoneIdentifier: vector.location.timeZone
            )
            let result = Sun.state(at: date, location: location)
            XCTAssertEqual(
                Angles.degrees(fromRadians: result.equatorial.rightAscension),
                vector.expected.rightAscension,
                accuracy: fixture.tolerances.solarDegrees,
                vector.id
            )
            XCTAssertEqual(
                Angles.degrees(fromRadians: result.equatorial.declination),
                vector.expected.declination,
                accuracy: fixture.tolerances.solarDegrees,
                vector.id
            )
            XCTAssertEqual(
                Angles.degrees(fromRadians: result.horizontal.altitude),
                vector.expected.altitude,
                accuracy: fixture.tolerances.solarDegrees,
                vector.id
            )
            XCTAssertEqual(
                Angles.degrees(fromRadians: result.horizontal.azimuth),
                vector.expected.azimuth,
                accuracy: fixture.tolerances.solarDegrees,
                vector.id
            )
            XCTAssertEqual(result.phase.rawValue, vector.expected.phase, vector.id)
        }
    }

    private func isoDate(_ string: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: string)
    }
}

private extension Double {
    static func degrees(_ value: Double) -> Double {
        Angles.radians(fromDegrees: value)
    }
}

private struct AstronomyFixture: Decodable {
    let julianDates: [JulianDateFixture]
    let siderealTimes: [SiderealTimeFixture]
    let horizontalCoordinates: [HorizontalFixture]
    let projections: [ProjectionFixture]
    let realStarPositions: [RealStarFixture]
    let precessionVectors: [PrecessionFixture]
    let angularDistances: [AngularDistanceFixture]
    let solarPositions: [SolarPositionFixture]
    let twilightPhases: [TwilightFixture]
    let tolerances: ToleranceFixture
}

private struct JulianDateFixture: Decodable {
    let id: String
    let iso: String
    let expected: Double
}

private struct SiderealTimeFixture: Decodable {
    let id: String
    let julianDate: Double
    let longitude: Double
    let expected: Double
}

private struct HorizontalFixture: Decodable {
    let id: String
    let latitude: Double
    let declination: Double
    let hourAngle: Double
    let altitude: Double
    let azimuth: Double
    let azimuthDefined: Bool
}

private struct ProjectionFixture: Decodable {
    let id: String
    let altitude: Double
    let azimuth: Double
    let x: Double
    let y: Double
}

private struct FixtureLocation: Decodable {
    let id: String
    let latitude: Double
    let longitude: Double
    let timeZone: String
}

private struct FixtureEquatorial: Decodable {
    let rightAscension: Double
    let declination: Double
}

private struct RealStarFixture: Decodable {
    struct Star: Decodable {
        let rightAscension: Double
        let declination: Double
    }

    struct Expected: Decodable {
        let altitude: Double
        let azimuth: Double
        let azimuthDefined: Bool
    }

    let id: String
    let star: Star
    let iso: String
    let location: FixtureLocation
    let expected: Expected
}

private struct PrecessionFixture: Decodable {
    let id: String
    let rightAscension: Double
    let declination: Double
    let julianDate: Double
    let expected: FixtureEquatorial
}

private struct AngularDistanceFixture: Decodable {
    struct Coordinate: Decodable {
        let longitude: Double
        let latitude: Double
    }

    let id: String
    let first: Coordinate
    let second: Coordinate
    let expected: Double
}

private struct SolarPositionFixture: Decodable {
    struct Expected: Decodable {
        let rightAscension: Double
        let declination: Double
        let altitude: Double
        let azimuth: Double
        let phase: String
    }

    let id: String
    let iso: String
    let location: FixtureLocation
    let expected: Expected
}

private struct TwilightFixture: Decodable {
    let altitude: Double
    let expected: String
}

private struct ToleranceFixture: Decodable {
    let realStarDegrees: Double
    let precessionDegrees: Double
    let angularDistanceDegrees: Double
    let solarDegrees: Double
}
