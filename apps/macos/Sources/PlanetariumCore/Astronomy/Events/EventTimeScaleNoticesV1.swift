import Foundation

public struct EventTimeScaleNoticesV1:
    Equatable,
    Sendable
{
    public let dominantContributors: [String]
    public let warnings: [String]

    public init(
        dominantContributors: [String],
        warnings: [String]
    ) {
        self.dominantContributors = dominantContributors
        self.warnings = warnings
    }

    /**
     Converts the precision time-scale model's reader-relevant assumptions
     into event-language notices. Contact times are presented as UTC, so the
     assumption must remain visible beside the forecast result.
     */
    public static func resolve(
        at instantUTC: Date,
        earthOrientation: EarthOrientationOptionsV2
    ) throws -> EventTimeScaleNoticesV1 {
        let timeScales = try Astronomy.resolveTimeScalesV2(
            at: instantUTC,
            options: earthOrientation
        )
        switch Astronomy.taiMinusUTCAssumptionV2(
            from: timeScales
        ) {
        case .pre1972Approximation:
            return EventTimeScaleNoticesV1(
                dominantContributors: [
                    "1972年以前のUTC−TT近似",
                ],
                warnings: [
                    "1972年以前のUTCとTTの差は近似値です。接触時刻を精密観測には使用しないでください。",
                ]
            )
        case .futureLeapSecondsUnknown:
            return EventTimeScaleNoticesV1(
                dominantContributors: [
                    "将来のうるう秒が未確定",
                ],
                warnings: [
                    "将来のうるう秒は未確定です。UTCの接触時刻は今後のIERS発表で変わる可能性があります。",
                ]
            )
        case nil:
            return EventTimeScaleNoticesV1(
                dominantContributors: [],
                warnings: []
            )
        }
    }
}
