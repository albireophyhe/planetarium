import XCTest

@testable import PlanetariumCore

final class DataTests: XCTestCase {
    func testSharedCatalogLoadsAndCrossReferencesResolve() throws {
        let catalog = try PlanetariumData.load()

        XCTAssertGreaterThan(catalog.stars.count, 8_000)
        XCTAssertGreaterThan(catalog.names.count, 40)
        XCTAssertEqual(catalog.cities.first?.id, "tokyo")
        XCTAssertEqual(Set(catalog.stars.map(\.hr)).count, catalog.stars.count)

        for name in catalog.names {
            XCTAssertNotNil(catalog.starsByHR[name.hr], name.name)
        }
        for constellation in catalog.constellations {
            for segment in constellation.segments {
                XCTAssertNotNil(
                    catalog.starsByHR[segment.startHR],
                    "\(constellation.id): HR \(segment.startHR)"
                )
                XCTAssertNotNil(
                    catalog.starsByHR[segment.endHR],
                    "\(constellation.id): HR \(segment.endHR)"
                )
            }
        }
    }

    func testRenderedCatalogKeepsNormalizedProjection() throws {
        let catalog = try PlanetariumData.load()
        let tokyo = try XCTUnwrap(catalog.cities.first { $0.id == "tokyo" })
        let rendered = Astronomy.render(
            catalog: catalog,
            at: Date(timeIntervalSince1970: 1_725_000_000),
            location: ObservingLocation(city: tokyo)
        )

        XCTAssertEqual(rendered.count, catalog.stars.count)
        XCTAssertTrue(rendered.allSatisfy { star in
            star.horizontal.altitude.isFinite
                && star.horizontal.azimuth.isFinite
                && star.projection.x.isFinite
                && star.projection.y.isFinite
        })
        XCTAssertTrue(
            rendered
                .filter(\.isAboveHorizon)
                .allSatisfy { hypot($0.projection.x, $0.projection.y) <= 1.0000000001 }
        )
    }
}
