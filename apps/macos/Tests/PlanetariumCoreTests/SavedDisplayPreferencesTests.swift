import Foundation
import XCTest

@testable import Planetarium
@testable import PlanetariumCore

final class SavedDisplayPreferencesTests: XCTestCase {
    private let keys = [
        "planetarium.showConstellationsDefault",
        "planetarium.showNamesDefault",
        "planetarium.nightModeDefault",
        "planetarium.standardRefractionDefault",
        "planetarium.selectedStarTrajectoryDefault",
    ]

    override func tearDown() {
        for key in keys {
            UserDefaults.standard.removeObject(forKey: key)
        }
        super.tearDown()
    }

    @MainActor
    func testClearRemovesAllFiveDurableDisplayPreferences()
        throws
    {
        for key in keys {
            UserDefaults.standard.set(true, forKey: key)
        }

        let store = SkyStore(
            catalogLoader: {
                SkyCatalog(
                    stars: [],
                    names: [],
                    constellations: [],
                    cities: []
                )
            },
            earthOrientationServiceLoader: {
                throw TestFailure.unavailable
            },
            now: Date(timeIntervalSince1970: 1_774_953_600)
        )
        XCTAssertTrue(store.showConstellations)
        XCTAssertTrue(store.showNames)
        XCTAssertTrue(store.nightMode)
        XCTAssertTrue(store.useStandardAtmosphericRefraction)
        XCTAssertTrue(store.showSelectedStarTrajectory)

        store.clearSavedDisplayPreferences()

        for key in keys {
            XCTAssertNil(UserDefaults.standard.object(forKey: key))
        }
        XCTAssertTrue(store.showConstellations)
        XCTAssertTrue(store.showNames)
        XCTAssertFalse(store.nightMode)
        XCTAssertFalse(store.useStandardAtmosphericRefraction)
        XCTAssertFalse(store.showSelectedStarTrajectory)
    }

    private enum TestFailure: Error {
        case unavailable
    }
}
