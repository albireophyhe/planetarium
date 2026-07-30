import Foundation

/// The physical event geometry represented by an arbitrary-time sample.
public enum EventSceneSampleKindV1:
    Hashable, Sendable
{
    case solarEclipse
    case lunarEclipse
    case lunarOccultation
}

/// A precision apparent target-star position for an occultation scene.
public struct EventSceneTargetStarPositionV1:
    Hashable, Sendable
{
    public let starHR: Int
    public let label: String
    public let visualMagnitude: Double
    public let horizontal:
        HorizontalCoordinates
    public let precisionWarnings:
        [PrecisionWarningCode]

    init(
        starHR: Int,
        label: String,
        visualMagnitude: Double,
        horizontal: HorizontalCoordinates,
        precisionWarnings:
            [PrecisionWarningCode]
    ) {
        self.starHR = starHR
        self.label = label
        self.visualMagnitude =
            visualMagnitude
        self.horizontal = horizontal
        self.precisionWarnings =
            precisionWarnings
    }
}

/**
 A physical event-scene sample evaluated at one arbitrary UTC instant.

 This value deliberately has no contact phase. Callers must not present it
 as C1/C2/maximum/D/R unless its instant independently matches a solved
 contact.

 `relativeDirection` uses these reference and target centers:
 - solar eclipse: Sun → Moon in the local horizontal tangent plane
 - lunar eclipse: terrestrial shadow → Moon in the CIRS north/east plane
 - lunar occultation: Moon → target star in the local horizontal plane
 */
public struct EventSceneSampleV1:
    Hashable, Sendable
{
    public let kind: EventSceneSampleKindV1
    public let instantUTC: Date
    public let sun: EclipseBodyPositionV1?
    public let moon: EclipseBodyPositionV1
    public let lunarShadow:
        LunarShadowGeometryV1?
    public let targetStar:
        EventSceneTargetStarPositionV1?
    public let aboveHorizon: Bool
    public let relativeDirection:
        EventSceneTangentOffsetV1

    init(
        kind: EventSceneSampleKindV1,
        instantUTC: Date,
        sun: EclipseBodyPositionV1?,
        moon: EclipseBodyPositionV1,
        lunarShadow:
            LunarShadowGeometryV1?,
        targetStar:
            EventSceneTargetStarPositionV1?,
        aboveHorizon: Bool,
        relativeDirection:
            EventSceneTangentOffsetV1
    ) {
        self.kind = kind
        self.instantUTC = instantUTC
        self.sun = sun
        self.moon = moon
        self.lunarShadow = lunarShadow
        self.targetStar = targetStar
        self.aboveHorizon = aboveHorizon
        self.relativeDirection =
            relativeDirection
    }
}

public enum EventSceneSampleErrorV1:
    LocalizedError, Equatable, Sendable
{
    case invalidInstant
    case outsideEphemerisCoverage
    case invalidGeometry

    public var errorDescription: String? {
        switch self {
        case .invalidInstant:
            "シーンのUTC時刻が不正です。"
        case .outsideEphemerisCoverage:
            "シーンのUTC時刻は収録暦の安全な計算範囲外です。"
        case .invalidGeometry:
            "シーンの相対配置を有限値として構成できません。"
        }
    }
}

enum EventSceneSampleSupportV1 {
    static func bodyPosition(
        _ state: EclipseApparentBodyStateV1
    ) throws -> EclipseBodyPositionV1 {
        guard
            let horizontal = state.horizontal,
            valid(horizontal),
            state.angularRadiusRadians.isFinite,
            state.angularRadiusRadians > 0,
            state.distanceKilometers.isFinite,
            state.distanceKilometers > 0
        else {
            throw EventSceneSampleErrorV1
                .invalidGeometry
        }
        return EclipseBodyPositionV1(
            horizontal: horizontal,
            angularRadiusRadians:
                state.angularRadiusRadians,
            distanceKilometers:
                state.distanceKilometers
        )
    }

    static func require(
        _ direction:
            EventSceneTangentOffsetV1?
    ) throws -> EventSceneTangentOffsetV1 {
        guard
            let direction,
            direction.eastwardRadians.isFinite,
            direction.upwardRadians.isFinite,
            direction.separationRadians.isFinite,
            direction.separationRadians >= 0,
            direction
                .positionAngleRadians.isFinite
        else {
            throw EventSceneSampleErrorV1
                .invalidGeometry
        }
        return direction
    }

    private static func valid(
        _ horizontal: HorizontalCoordinates
    ) -> Bool {
        horizontal.altitude.isFinite
            && horizontal.azimuth.isFinite
            && horizontal.altitude
                >= -Double.pi / 2
            && horizontal.altitude
                <= Double.pi / 2
    }
}
