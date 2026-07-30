import CoreGraphics
import PlanetariumCore

/// One circular body or marker in a local tangent-plane event scene.
///
/// Coordinates and radii are angular values in radians. Keeping this value
/// independent from pixels lets every solved phase share one viewport without
/// interpolating any body position.
struct AngularSceneBody: Hashable, Sendable {
    let eastward: Double
    let upward: Double
    let radius: Double
}

enum EventSceneAngularBodies {
    static func bodies(
        for sample: EventSceneSampleV1
    ) -> [AngularSceneBody]? {
        switch sample.kind {
        case .solarEclipse:
            guard let sun = sample.sun else {
                return nil
            }
            return [
                AngularSceneBody(
                    eastward: 0,
                    upward: 0,
                    radius:
                        sun.angularRadiusRadians
                ),
                AngularSceneBody(
                    eastward:
                        sample.relativeDirection
                        .eastwardRadians,
                    upward:
                        sample.relativeDirection
                        .upwardRadians,
                    radius:
                        sample.moon
                        .angularRadiusRadians
                ),
            ]
        case .lunarEclipse:
            guard let shadow =
                sample.lunarShadow
            else {
                return nil
            }
            return [
                AngularSceneBody(
                    eastward: 0,
                    upward: 0,
                    radius:
                        shadow
                        .penumbralAngularRadiusRadians
                ),
                AngularSceneBody(
                    eastward:
                        sample.relativeDirection
                        .eastwardRadians,
                    upward:
                        sample.relativeDirection
                        .upwardRadians,
                    radius:
                        sample.moon
                        .angularRadiusRadians
                ),
            ]
        case .lunarOccultation:
            guard sample.targetStar != nil
            else {
                return nil
            }
            let moonRadius =
                sample.moon
                .angularRadiusRadians
            return [
                AngularSceneBody(
                    eastward: 0,
                    upward: 0,
                    radius: moonRadius
                ),
                AngularSceneBody(
                    eastward:
                        sample.relativeDirection
                        .eastwardRadians,
                    upward:
                        sample.relativeDirection
                        .upwardRadians,
                    radius:
                        max(
                            moonRadius * 0.10,
                            1e-12
                        )
                ),
            ]
        }
    }
}

/// The angular bounds shared by every drawable solved phase of one event.
struct AngularSceneExtent: Hashable, Sendable {
    let minimumEastward: Double
    let maximumEastward: Double
    let minimumUpward: Double
    let maximumUpward: Double
    let maximumRadius: Double

    init?(
        phaseBodies: [[AngularSceneBody]]
    ) {
        self.init(
            bodies: phaseBodies.flatMap { $0 }
        )
    }

    init?(
        bodies: [AngularSceneBody]
    ) {
        guard
            !bodies.isEmpty,
            bodies.allSatisfy({
                $0.eastward.isFinite
                    && $0.upward.isFinite
                    && $0.radius.isFinite
                    && $0.radius >= 0
            })
        else {
            return nil
        }

        var minimumEastward = Double.infinity
        var maximumEastward = -Double.infinity
        var minimumUpward = Double.infinity
        var maximumUpward = -Double.infinity
        var maximumRadius = 0.0

        for body in bodies {
            minimumEastward = min(
                minimumEastward,
                body.eastward - body.radius
            )
            maximumEastward = max(
                maximumEastward,
                body.eastward + body.radius
            )
            minimumUpward = min(
                minimumUpward,
                body.upward - body.radius
            )
            maximumUpward = max(
                maximumUpward,
                body.upward + body.radius
            )
            maximumRadius = max(
                maximumRadius,
                body.radius
            )
        }

        guard
            minimumEastward.isFinite,
            maximumEastward.isFinite,
            minimumUpward.isFinite,
            maximumUpward.isFinite,
            maximumRadius.isFinite,
            maximumRadius > 0
        else {
            return nil
        }

        self.minimumEastward =
            minimumEastward
        self.maximumEastward =
            maximumEastward
        self.minimumUpward = minimumUpward
        self.maximumUpward = maximumUpward
        self.maximumRadius = maximumRadius
    }

    private init?(
        minimumEastward: Double,
        maximumEastward: Double,
        minimumUpward: Double,
        maximumUpward: Double,
        maximumRadius: Double
    ) {
        guard
            minimumEastward.isFinite,
            maximumEastward.isFinite,
            minimumUpward.isFinite,
            maximumUpward.isFinite,
            maximumRadius.isFinite,
            maximumEastward
                > minimumEastward,
            maximumUpward
                > minimumUpward,
            maximumRadius > 0
        else {
            return nil
        }
        self.minimumEastward =
            minimumEastward
        self.maximumEastward =
            maximumEastward
        self.minimumUpward =
            minimumUpward
        self.maximumUpward =
            maximumUpward
        self.maximumRadius = maximumRadius
    }

    /// Adds angular breathing room around the physical projection extent.
    ///
    /// Padding is applied on every side, so limbs and marker strokes do not
    /// touch the fixed viewport bounds while scrubbing through the event.
    func padded(
        fraction: Double
    ) -> AngularSceneExtent? {
        guard
            fraction.isFinite,
            fraction >= 0
        else {
            return nil
        }
        let spanX =
            maximumEastward
            - minimumEastward
        let spanY =
            maximumUpward
            - minimumUpward
        let baseX = max(
            spanX,
            maximumRadius * 2
        )
        let baseY = max(
            spanY,
            maximumRadius * 2
        )
        let paddingX = baseX * fraction
        let paddingY = baseY * fraction
        return AngularSceneExtent(
            minimumEastward:
                minimumEastward - paddingX,
            maximumEastward:
                maximumEastward + paddingX,
            minimumUpward:
                minimumUpward - paddingY,
            maximumUpward:
                maximumUpward + paddingY,
            maximumRadius: maximumRadius
        )
    }

    func contains(
        _ body: AngularSceneBody
    ) -> Bool {
        guard
            body.eastward.isFinite,
            body.upward.isFinite,
            body.radius.isFinite,
            body.radius >= 0
        else {
            return false
        }

        return body.eastward - body.radius
            >= minimumEastward
            && body.eastward + body.radius
                <= maximumEastward
            && body.upward - body.radius
                >= minimumUpward
            && body.upward + body.radius
                <= maximumUpward
    }
}

/// A pixel transform built from an event-wide angular extent.
///
/// Reusing the same extent and canvas size guarantees the same
/// `pixelsPerRadian` for every Picker selection.
struct AngularSceneTransform {
    static let contentInset: CGFloat = 26
    static let minimumCanvasLength: CGFloat =
        80
    static let minimumDiameterFactor = 2.45

    let contentRect: CGRect
    let pixelsPerRadian: Double
    private let angularMidX: Double
    private let angularMidY: Double

    init?(
        size: CGSize,
        extent: AngularSceneExtent
    ) {
        guard
            size.width.isFinite,
            size.height.isFinite,
            size.width
                > Self.minimumCanvasLength,
            size.height
                > Self.minimumCanvasLength
        else {
            return nil
        }

        let rect = CGRect(
            x: Self.contentInset,
            y: Self.contentInset,
            width:
                size.width
                - 2 * Self.contentInset,
            height:
                size.height
                - 2 * Self.contentInset
        )
        guard
            rect.width.isFinite,
            rect.height.isFinite,
            rect.width > 0,
            rect.height > 0
        else {
            return nil
        }

        let extentSpanX =
            extent.maximumEastward
            - extent.minimumEastward
        let extentSpanY =
            extent.maximumUpward
            - extent.minimumUpward
        let minimumSpan =
            extent.maximumRadius
            * Self.minimumDiameterFactor
        let spanX = max(
            extentSpanX,
            minimumSpan
        )
        let spanY = max(
            extentSpanY,
            minimumSpan
        )
        let resolvedScale = min(
            Double(rect.width) / spanX,
            Double(rect.height) / spanY
        )
        let midX =
            (
                extent.minimumEastward
                + extent.maximumEastward
            ) / 2
        let midY =
            (
                extent.minimumUpward
                + extent.maximumUpward
            ) / 2
        guard
            extentSpanX.isFinite,
            extentSpanY.isFinite,
            minimumSpan.isFinite,
            minimumSpan > 0,
            spanX.isFinite,
            spanY.isFinite,
            spanX > 0,
            spanY > 0,
            resolvedScale.isFinite,
            resolvedScale > 0,
            midX.isFinite,
            midY.isFinite
        else {
            return nil
        }

        contentRect = rect
        pixelsPerRadian = resolvedScale
        angularMidX = midX
        angularMidY = midY
    }

    func point(
        eastward: Double,
        upward: Double
    ) -> CGPoint {
        CGPoint(
            x:
                contentRect.midX
                + (eastward - angularMidX)
                * pixelsPerRadian,
            y:
                contentRect.midY
                - (upward - angularMidY)
                * pixelsPerRadian
        )
    }

    func length(_ radians: Double) -> CGFloat {
        radians * pixelsPerRadian
    }

    func contains(
        _ body: AngularSceneBody,
        tolerance: CGFloat = 0.000_001
    ) -> Bool {
        guard
            body.eastward.isFinite,
            body.upward.isFinite,
            body.radius.isFinite,
            body.radius >= 0,
            tolerance.isFinite,
            tolerance >= 0
        else {
            return false
        }

        let center = point(
            eastward: body.eastward,
            upward: body.upward
        )
        let radius = length(body.radius)
        guard
            center.x.isFinite,
            center.y.isFinite,
            radius.isFinite,
            radius >= 0
        else {
            return false
        }

        return center.x - radius
            >= contentRect.minX - tolerance
            && center.x + radius
                <= contentRect.maxX + tolerance
            && center.y - radius
                >= contentRect.minY - tolerance
            && center.y + radius
                <= contentRect.maxY + tolerance
    }
}
