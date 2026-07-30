import Foundation
import Testing

@testable import PlanetariumCore

struct EventTimeScaleNoticesTests {
    @Test
    func settledUTCDateStaysQuiet() throws {
        let notices = try EventTimeScaleNoticesV1.resolve(
            at: #require(
                ISO8601DateFormatter().date(
                    from: "2026-08-12T18:13:22Z"
                )
            ),
            earthOrientation: EarthOrientationOptionsV2()
        )

        #expect(notices.dominantContributors.isEmpty)
        #expect(notices.warnings.isEmpty)
    }

    @Test
    func futureUTCDateLabelsUnknownLeapSeconds() throws {
        let notices = try EventTimeScaleNoticesV1.resolve(
            at: #require(
                ISO8601DateFormatter().date(
                    from: "2028-08-12T18:13:22Z"
                )
            ),
            earthOrientation: EarthOrientationOptionsV2()
        )

        #expect(
            notices.dominantContributors.contains {
                $0.contains("うるう秒")
            }
        )
        #expect(
            notices.warnings.contains {
                $0.contains("IERS")
            }
        )
    }

    @Test
    func pre1972UTCDateLabelsApproximation() throws {
        let notices = try EventTimeScaleNoticesV1.resolve(
            at: #require(
                ISO8601DateFormatter().date(
                    from: "1969-03-18T04:00:00Z"
                )
            ),
            earthOrientation: EarthOrientationOptionsV2()
        )

        #expect(
            notices.dominantContributors.contains {
                $0.contains("UTC−TT近似")
            }
        )
        #expect(
            notices.warnings.contains {
                $0.contains("精密観測")
            }
        )
    }
}
