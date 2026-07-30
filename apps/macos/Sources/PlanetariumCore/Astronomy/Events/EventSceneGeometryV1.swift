import Foundation

/// A small-angle offset in the tangent plane around a reference direction.
///
/// `eastwardRadians` grows toward increasing azimuth and
/// `upwardRadians` grows toward increasing altitude. Their Euclidean norm
/// equals `separationRadians`, so nearby event bodies can be rendered on one
/// angular scale without treating azimuth differences as linear at high
/// altitude.
public struct EventSceneTangentOffsetV1:
    Hashable, Sendable
{
    public let eastwardRadians: Double
    public let upwardRadians: Double
    public let separationRadians: Double
    public let positionAngleRadians: Double
    public let orientationIsDefined: Bool

    public init(
        eastwardRadians: Double,
        upwardRadians: Double,
        separationRadians: Double,
        positionAngleRadians: Double,
        orientationIsDefined: Bool
    ) {
        self.eastwardRadians = eastwardRadians
        self.upwardRadians = upwardRadians
        self.separationRadians = separationRadians
        self.positionAngleRadians =
            positionAngleRadians
        self.orientationIsDefined =
            orientationIsDefined
    }
}

/// Normalized fallback geometry used only when a lunar-eclipse result does
/// not carry its physical penumbral and umbral radii.
public struct LunarEclipseSceneSchematicV1:
    Hashable, Sendable
{
    public let moonRadius: Double
    public let penumbralRadius: Double
    public let umbralRadius: Double
    public let moonCenterDistance: Double
    public let usesPenumbralMagnitude: Bool

    public init(
        moonRadius: Double,
        penumbralRadius: Double,
        umbralRadius: Double,
        moonCenterDistance: Double,
        usesPenumbralMagnitude: Bool
    ) {
        self.moonRadius = moonRadius
        self.penumbralRadius = penumbralRadius
        self.umbralRadius = umbralRadius
        self.moonCenterDistance =
            moonCenterDistance
        self.usesPenumbralMagnitude =
            usesPenumbralMagnitude
    }
}

public enum LunarEclipseSceneGeometrySourceV1:
    Hashable, Sendable
{
    case physical
    case schematic
}

/// Render-ready lunar-eclipse geometry with the shadow center at the origin.
public struct LunarEclipseSceneLayoutV1:
    Hashable, Sendable
{
    public let moonRadius: Double
    public let penumbralRadius: Double
    public let umbralRadius: Double
    public let moonOffset:
        EventSceneTangentOffsetV1
    public let source:
        LunarEclipseSceneGeometrySourceV1
    public let orientationIsDefined: Bool

    public init(
        moonRadius: Double,
        penumbralRadius: Double,
        umbralRadius: Double,
        moonOffset:
            EventSceneTangentOffsetV1,
        source:
            LunarEclipseSceneGeometrySourceV1,
        orientationIsDefined: Bool
    ) {
        self.moonRadius = moonRadius
        self.penumbralRadius = penumbralRadius
        self.umbralRadius = umbralRadius
        self.moonOffset = moonOffset
        self.source = source
        self.orientationIsDefined =
            orientationIsDefined
    }
}

public enum EventSceneGeometryV1 {
    private static let directionTolerance = 1e-15

    /// Resolves the shortest on-sphere offset from `reference` to `target`.
    ///
    /// The returned components use an azimuth/altitude tangent basis, while
    /// the separation is evaluated with `atan2(|a×b|, a·b)` for stability at
    /// the sub-degree separations used by eclipses and occultations.
    public static func tangentOffset(
        reference: HorizontalCoordinates,
        target: HorizontalCoordinates
    ) -> EventSceneTangentOffsetV1? {
        guard
            valid(reference),
            valid(target),
            let referenceDirection =
                direction(for: reference),
            let targetDirection =
                direction(for: target)
        else {
            return nil
        }

        let dot = clamped(
            referenceDirection.x
                * targetDirection.x
                + referenceDirection.y
                * targetDirection.y
                + referenceDirection.z
                * targetDirection.z
        )
        let crossX =
            referenceDirection.y
                * targetDirection.z
                - referenceDirection.z
                * targetDirection.y
        let crossY =
            referenceDirection.z
                * targetDirection.x
                - referenceDirection.x
                * targetDirection.z
        let crossZ =
            referenceDirection.x
                * targetDirection.y
                - referenceDirection.y
                * targetDirection.x
        let crossLength = hypot(
            hypot(crossX, crossY),
            crossZ
        )
        let separation = atan2(crossLength, dot)

        if separation <= directionTolerance {
            return EventSceneTangentOffsetV1(
                eastwardRadians: 0,
                upwardRadians: 0,
                separationRadians: 0,
                positionAngleRadians: 0,
                orientationIsDefined:
                    reference.azimuthIsDefined
            )
        }
        // An antipodal target has no unique shortest tangent direction.
        guard crossLength > directionTolerance else {
            return nil
        }

        let sinAzimuth = sin(reference.azimuth)
        let cosAzimuth = cos(reference.azimuth)
        let sinAltitude = sin(reference.altitude)
        let cosAltitude = cos(reference.altitude)
        let eastX = cosAzimuth
        let eastY = -sinAzimuth
        let upwardX = -sinAltitude * sinAzimuth
        let upwardY = -sinAltitude * cosAzimuth
        let upwardZ = cosAltitude

        let eastProjection =
            targetDirection.x * eastX
                + targetDirection.y * eastY
        let upwardProjection =
            targetDirection.x * upwardX
                + targetDirection.y * upwardY
                + targetDirection.z * upwardZ
        let projectionLength = hypot(
            eastProjection,
            upwardProjection
        )
        guard projectionLength > directionTolerance else {
            return nil
        }

        let positionAngle = normalizedRadians(
            atan2(eastProjection, upwardProjection)
        )
        return EventSceneTangentOffsetV1(
            eastwardRadians:
                separation
                * eastProjection
                / projectionLength,
            upwardRadians:
                separation
                * upwardProjection
                / projectionLength,
            separationRadians: separation,
            positionAngleRadians:
                positionAngle,
            orientationIsDefined:
                reference.azimuthIsDefined
        )
    }

    /// Converts a north-through-east position angle into tangent-plane
    /// components. This is the convention used by the event solvers' CIRS
    /// position angles.
    public static func tangentOffset(
        separationRadians: Double,
        positionAngleRadians: Double
    ) -> EventSceneTangentOffsetV1? {
        guard
            separationRadians.isFinite,
            separationRadians >= 0,
            positionAngleRadians.isFinite
        else {
            return nil
        }
        let angle =
            normalizedRadians(positionAngleRadians)
        return EventSceneTangentOffsetV1(
            eastwardRadians:
                separationRadians * sin(angle),
            upwardRadians:
                separationRadians * cos(angle),
            separationRadians: separationRadians,
            positionAngleRadians: angle,
            orientationIsDefined: true
        )
    }

    /// Creates a clearly schematic lunar-eclipse layout from magnitude.
    ///
    /// The radii are dimensionless illustration constants. The magnitude
    /// controls immersion monotonically, but this function must not be used
    /// when the solver's physical shadow geometry is available.
    public static func lunarEclipseSchematic(
        magnitude: Double,
        usesPenumbralMagnitude: Bool
    ) -> LunarEclipseSceneSchematicV1? {
        guard magnitude.isFinite else {
            return nil
        }

        let moonRadius = 0.22
        let penumbralRadius = 0.76
        let umbralRadius = 0.46
        let referenceRadius =
            usesPenumbralMagnitude
            ? penumbralRadius
            : umbralRadius
        let nonnegativeMagnitude = max(0, magnitude)
        let centerDistance = max(
            0,
            referenceRadius
                + moonRadius
                - 2 * moonRadius
                * nonnegativeMagnitude
        )

        return LunarEclipseSceneSchematicV1(
            moonRadius: moonRadius,
            penumbralRadius: penumbralRadius,
            umbralRadius: umbralRadius,
            moonCenterDistance: centerDistance,
            usesPenumbralMagnitude:
                usesPenumbralMagnitude
        )
    }

    /// Resolves lunar-eclipse geometry, preferring the solver's physical
    /// shadow sample. A schematic is returned only for legacy results where
    /// `shadow` is absent; malformed physical data is rejected instead of
    /// silently being presented as an approximation.
    public static func lunarEclipseLayout(
        moonAngularRadiusRadians: Double,
        shadow: LunarShadowGeometryV1?,
        magnitude: Double,
        usesPenumbralMagnitude: Bool
    ) -> LunarEclipseSceneLayoutV1? {
        guard
            moonAngularRadiusRadians.isFinite,
            moonAngularRadiusRadians > 0
        else {
            return nil
        }

        if let shadow {
            guard
                shadow.centerSeparationRadians
                    .isFinite,
                shadow.centerSeparationRadians >= 0,
                shadow
                    .penumbralAngularRadiusRadians
                    .isFinite,
                shadow
                    .penumbralAngularRadiusRadians > 0,
                shadow
                    .umbralAngularRadiusRadians
                    .isFinite,
                shadow
                    .umbralAngularRadiusRadians > 0,
                shadow
                    .penumbralAngularRadiusRadians
                    >= shadow
                    .umbralAngularRadiusRadians
            else {
                return nil
            }

            let orientationIsDefined =
                shadow.centerPositionAngleRadians
                    != nil
                || shadow
                    .centerSeparationRadians
                    <= directionTolerance
            guard let shadowFromMoon =
                tangentOffset(
                    separationRadians:
                        shadow
                        .centerSeparationRadians,
                    positionAngleRadians:
                        shadow
                            .centerPositionAngleRadians
                        ?? 0
                )
            else {
                return nil
            }
            let moonFromShadow =
                EventSceneTangentOffsetV1(
                    eastwardRadians:
                        -shadowFromMoon
                        .eastwardRadians,
                    upwardRadians:
                        -shadowFromMoon
                        .upwardRadians,
                    separationRadians:
                        shadowFromMoon
                        .separationRadians,
                    positionAngleRadians:
                        normalizedRadians(
                            shadowFromMoon
                                .positionAngleRadians
                            + .pi
                        ),
                    orientationIsDefined:
                        orientationIsDefined
                )
            return LunarEclipseSceneLayoutV1(
                moonRadius:
                    moonAngularRadiusRadians,
                penumbralRadius:
                    shadow
                    .penumbralAngularRadiusRadians,
                umbralRadius:
                    shadow
                    .umbralAngularRadiusRadians,
                moonOffset: moonFromShadow,
                source: .physical,
                orientationIsDefined:
                    orientationIsDefined
            )
        }

        guard
            let schematic =
                lunarEclipseSchematic(
                    magnitude: magnitude,
                    usesPenumbralMagnitude:
                        usesPenumbralMagnitude
                ),
            let moonOffset =
                tangentOffset(
                    separationRadians:
                        schematic
                        .moonCenterDistance,
                    positionAngleRadians:
                        .pi / 2
                )
        else {
            return nil
        }
        return LunarEclipseSceneLayoutV1(
            moonRadius: schematic.moonRadius,
            penumbralRadius:
                schematic.penumbralRadius,
            umbralRadius:
                schematic.umbralRadius,
            moonOffset: moonOffset,
            source: .schematic,
            orientationIsDefined: false
        )
    }

    private static func valid(
        _ coordinates: HorizontalCoordinates
    ) -> Bool {
        coordinates.altitude.isFinite
            && coordinates.azimuth.isFinite
            && coordinates.altitude
                >= -Double.pi / 2
            && coordinates.altitude
                <= Double.pi / 2
    }

    private static func direction(
        for coordinates: HorizontalCoordinates
    ) -> (x: Double, y: Double, z: Double)? {
        let horizontalLength =
            cos(coordinates.altitude)
        let direction = (
            x:
                horizontalLength
                * sin(coordinates.azimuth),
            y:
                horizontalLength
                * cos(coordinates.azimuth),
            z: sin(coordinates.altitude)
        )
        guard
            direction.x.isFinite,
            direction.y.isFinite,
            direction.z.isFinite
        else {
            return nil
        }
        return direction
    }

    private static func clamped(
        _ value: Double
    ) -> Double {
        max(-1, min(1, value))
    }

    private static func normalizedRadians(
        _ radians: Double
    ) -> Double {
        let turn = 2 * Double.pi
        let remainder =
            radians.truncatingRemainder(
                dividingBy: turn
            )
        return remainder >= 0
            ? remainder
            : remainder + turn
    }
}
