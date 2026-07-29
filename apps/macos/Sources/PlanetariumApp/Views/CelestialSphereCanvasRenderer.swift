import PlanetariumCore
import SwiftUI

@MainActor
struct CelestialSphereCanvasRenderer {
    let store: SkyStore

    func draw(
        in context: inout GraphicsContext,
        geometry: SphereCanvasGeometry,
        increasedContrast: Bool = false
    ) {
        drawBackground(in: &context, geometry: geometry)
        context.drawLayer { layer in
            layer.clip(to: Path(ellipseIn: geometry.sphereRect))
            drawHorizonPlane(
                in: &layer,
                geometry: geometry,
                increasedContrast: increasedContrast
            )
            if store.showConstellations {
                drawConstellations(
                    in: &layer,
                    geometry: geometry,
                    increasedContrast: increasedContrast
                )
            }
            drawSelectedStarTrajectory(
                in: &layer,
                geometry: geometry,
                increasedContrast: increasedContrast
            )
            drawStars(
                in: &layer,
                geometry: geometry,
                increasedContrast: increasedContrast
            )
            drawSun(
                in: &layer,
                geometry: geometry,
                increasedContrast: increasedContrast
            )
        }
        drawSphereOutline(
            in: &context,
            geometry: geometry,
            increasedContrast: increasedContrast
        )
        drawDirectionLabels(
            in: &context,
            geometry: geometry,
            increasedContrast: increasedContrast
        )
    }

    private func drawBackground(
        in context: inout GraphicsContext,
        geometry: SphereCanvasGeometry
    ) {
        let palette = SkyPalette.palette(
            for: store.sunState.phase,
            nightMode: store.nightMode
        )
        context.fill(
            Path(CGRect(origin: .zero, size: geometry.size)),
            with: .color(palette.canvas)
        )
        context.fill(
            Path(ellipseIn: geometry.sphereRect),
            with: .radialGradient(
                Gradient(colors: [palette.zenith, palette.horizon]),
                center: CGPoint(
                    x: geometry.center.x - geometry.radius * 0.22,
                    y: geometry.center.y - geometry.radius * 0.25
                ),
                startRadius: 0,
                endRadius: geometry.radius * 1.15
            )
        )
    }

    private func drawHorizonPlane(
        in context: inout GraphicsContext,
        geometry: SphereCanvasGeometry,
        increasedContrast: Bool
    ) {
        let samples = horizonSamples(geometry: geometry)
        guard let first = samples.first else { return }

        var plane = Path()
        plane.move(to: first.point)
        for sample in samples.dropFirst() {
            plane.addLine(to: sample.point)
        }
        plane.closeSubpath()
        context.fill(
            plane,
            with: .color(
                store.nightMode
                    ? Color.red.opacity(0.055)
                    : Color.blue.opacity(0.065)
            )
        )

        drawHorizonArc(
            samples: samples,
            frontFacing: false,
            in: &context,
            color: horizonColor.opacity(
                increasedContrast ? 0.62 : 0.34
            ),
            style: StrokeStyle(
                lineWidth: increasedContrast ? 1.4 : 0.9,
                dash: [4, 5]
            )
        )
        drawHorizonArc(
            samples: samples,
            frontFacing: true,
            in: &context,
            color: horizonColor.opacity(
                increasedContrast ? 1 : 0.88
            ),
            style: StrokeStyle(
                lineWidth: increasedContrast ? 2 : 1.35
            )
        )
    }

    private func drawHorizonArc(
        samples: [HorizonSample],
        frontFacing: Bool,
        in context: inout GraphicsContext,
        color: Color,
        style: StrokeStyle
    ) {
        var path = Path()
        var isDrawing = false

        for sample in samples {
            if sample.isFrontFacing == frontFacing {
                if isDrawing {
                    path.addLine(to: sample.point)
                } else {
                    path.move(to: sample.point)
                    isDrawing = true
                }
            } else {
                isDrawing = false
            }
        }
        context.stroke(path, with: .color(color), style: style)
    }

    private func horizonSamples(
        geometry: SphereCanvasGeometry
    ) -> [HorizonSample] {
        (0...128).compactMap { index in
            let azimuth = Angles.twoPi * Double(index) / 128
            let horizontal = HorizontalCoordinates(
                altitude: 0,
                azimuth: azimuth
            )
            guard let direction = CelestialSphere.direction(for: horizontal),
                  let projection = CelestialSphere.project(
                    direction: direction,
                    orientation: store.sphereOrientation
                  )
            else {
                return nil
            }
            return HorizonSample(
                point: geometry.point(for: projection.point),
                isFrontFacing: projection.isFrontFacing
            )
        }
    }

    private func drawConstellations(
        in context: inout GraphicsContext,
        geometry: SphereCanvasGeometry,
        increasedContrast: Bool
    ) {
        for constellation in store.catalog.constellations {
            for segment in constellation.segments {
                guard let startStar = store.renderedStarsByHR[segment.startHR],
                      let endStar = store.renderedStarsByHR[segment.endHR],
                      let start = projectedStar(startStar, geometry: geometry),
                      let end = projectedStar(endStar, geometry: geometry)
                else {
                    continue
                }

                let bothAbove = startStar.isAboveHorizon && endStar.isAboveHorizon
                let bothFront = start.projection.isFrontFacing
                    && end.projection.isFrontFacing
                var opacity = bothAbove
                    ? (increasedContrast ? 0.62 : 0.36)
                    : (increasedContrast ? 0.22 : 0.12)
                if !bothFront {
                    opacity *= increasedContrast ? 0.7 : 0.55
                }

                var path = Path()
                path.move(to: start.point)
                path.addLine(to: end.point)
                context.stroke(
                    path,
                    with: .color(
                        store.nightMode
                            ? Color.red.opacity(opacity)
                            : Color.blue.opacity(opacity)
                    ),
                    lineWidth: increasedContrast ? 1.2 : 0.8
                )
            }
        }
    }

    private func drawStars(
        in context: inout GraphicsContext,
        geometry: SphereCanvasGeometry,
        increasedContrast: Bool
    ) {
        let projectedStars = store.renderedStars
            .compactMap { projectedStar($0, geometry: geometry) }
            .sorted { $0.projection.depth < $1.projection.depth }

        for rendered in projectedStars {
            let star = rendered.star
            let isSelected = store.selectedStarHR == star.hr
            let diameter = starDiameter(
                magnitude: star.catalog.visualMagnitude,
                increasedContrast: increasedContrast
            )
            let rect = CGRect(
                x: rendered.point.x - diameter / 2,
                y: rendered.point.y - diameter / 2,
                width: diameter,
                height: diameter
            )

            var opacity = star.isAboveHorizon
                ? (increasedContrast ? 1 : 0.95)
                : (increasedContrast ? 0.38 : 0.24)
            if !rendered.projection.isFrontFacing {
                opacity *= increasedContrast ? 0.68 : 0.52
            }
            if isSelected {
                opacity = max(opacity, 0.72)
            }

            context.fill(
                Path(ellipseIn: rect),
                with: .color(
                    starColor(bvColor: star.catalog.bvColor)
                        .opacity(opacity)
                )
            )

            if isSelected {
                context.stroke(
                    Path(ellipseIn: rect.insetBy(dx: -5, dy: -5)),
                    with: .color(
                        selectionColor(
                            increasedContrast: increasedContrast
                        )
                    ),
                    lineWidth: increasedContrast ? 3 : 2
                )
            }

            if let name = star.name,
               store.showNames,
               isSelected
                    || (
                        star.isAboveHorizon
                            && rendered.projection.isFrontFacing
                            && star.catalog.visualMagnitude <= 0.9
                    ) {
                let label = Text(name.nameJa)
                    .font(
                        .system(
                            size: 11,
                            weight: isSelected ? .semibold : .regular,
                            design: .rounded
                        )
                    )
                    .foregroundStyle(
                        store.nightMode
                            ? Color.red.opacity(opacity)
                            : Color.white.opacity(
                                increasedContrast
                                    ? opacity
                                    : opacity * 0.9
                            )
                    )
                context.draw(
                    label,
                    at: CGPoint(
                        x: rendered.point.x + diameter / 2 + 5,
                        y: rendered.point.y - 1
                    ),
                    anchor: .leading
                )
            }
        }
    }

    private func drawSelectedStarTrajectory(
        in context: inout GraphicsContext,
        geometry: SphereCanvasGeometry,
        increasedContrast: Bool
    ) {
        guard store.showSelectedStarTrajectory else { return }
        let projected = store.selectedStarTrajectory.compactMap {
            projectedTrajectorySample($0, geometry: geometry)
        }
        guard !projected.isEmpty else { return }

        for (start, end) in zip(projected, projected.dropFirst()) {
            let startVisibility =
                StarTrajectoryStyle.threeDVisibilityMultiplier(
                    isAboveHorizon: start.sample.isAboveHorizon,
                    isFrontFacing: start.projection.isFrontFacing
                )
            let endVisibility =
                StarTrajectoryStyle.threeDVisibilityMultiplier(
                    isAboveHorizon: end.sample.isAboveHorizon,
                    isFrontFacing: end.projection.isFrontFacing
                )
            let opacity =
                StarTrajectoryStyle.threeDLineOpacity(
                    progress: end.sample.progress,
                    increasedContrast: increasedContrast
                ) * (startVisibility + endVisibility) / 2
            var path = Path()
            path.move(to: start.point)
            path.addLine(to: end.point)
            context.stroke(
                path,
                with: .color(
                    StarTrajectoryStyle.threeDColor(
                        progress: end.sample.progress,
                        nightMode: store.nightMode
                    ).opacity(opacity)
                ),
                style: StrokeStyle(
                    lineWidth: increasedContrast ? 2.15 : 1.4,
                    lineCap: .round,
                    lineJoin: .round
                )
            )
        }

        for rendered in projected.sorted(
            by: {
                $0.projection.depth < $1.projection.depth
            }
        ) {
            let sample = rendered.sample
            let visibility =
                StarTrajectoryStyle.threeDVisibilityMultiplier(
                    isAboveHorizon: sample.isAboveHorizon,
                    isFrontFacing:
                        rendered.projection.isFrontFacing
                )
            let opacity =
                StarTrajectoryStyle.threeDPointOpacity(
                    progress: sample.progress,
                    increasedContrast: increasedContrast
                ) * visibility
            let diameter = StarTrajectoryStyle.threeDPointDiameter(
                progress: sample.progress,
                increasedContrast: increasedContrast
            )
            let rect = CGRect(
                x: rendered.point.x - diameter / 2,
                y: rendered.point.y - diameter / 2,
                width: diameter,
                height: diameter
            )
            context.fill(
                Path(ellipseIn: rect),
                with: .color(
                    StarTrajectoryStyle.threeDColor(
                        progress: sample.progress,
                        nightMode: store.nightMode
                    ).opacity(opacity)
                )
            )
            if increasedContrast {
                context.stroke(
                    Path(ellipseIn: rect),
                    with: .color(
                        StarTrajectoryStyle.outlineColor(
                            nightMode: store.nightMode
                        ).opacity(max(0.35, visibility))
                    ),
                    lineWidth: 0.8
                )
            }
        }
    }

    private func drawSun(
        in context: inout GraphicsContext,
        geometry: SphereCanvasGeometry,
        increasedContrast: Bool
    ) {
        let horizontal = store.sunState.horizontal
        guard let direction = CelestialSphere.direction(for: horizontal),
              let projection = CelestialSphere.project(
                direction: direction,
                orientation: store.sphereOrientation
              )
        else {
            return
        }

        let isAboveHorizon = horizontal.altitude >= 0
        let metrics = SunMarkerStyle.threeDMetrics(
            isAboveHorizon: isAboveHorizon,
            isFrontFacing: projection.isFrontFacing,
            increasedContrast: increasedContrast
        )
        let point = geometry.point(for: projection.point)
        let markerRect = CGRect(
            x: point.x - metrics.diameter / 2,
            y: point.y - metrics.diameter / 2,
            width: metrics.diameter,
            height: metrics.diameter
        )
        let outerRect = CGRect(
            x: point.x - metrics.outerDiameter / 2,
            y: point.y - metrics.outerDiameter / 2,
            width: metrics.outerDiameter,
            height: metrics.outerDiameter
        )

        context.fill(
            Path(ellipseIn: markerRect),
            with: .color(
                SunMarkerStyle.markerColor(
                    nightMode: store.nightMode
                ).opacity(metrics.opacity)
            )
        )
        context.stroke(
            Path(ellipseIn: outerRect),
            with: .color(
                SunMarkerStyle.outlineColor(
                    nightMode: store.nightMode,
                    increasedContrast: increasedContrast
                ).opacity(metrics.outlineOpacity)
            ),
            style: StrokeStyle(
                lineWidth: metrics.lineWidth,
                dash: metrics.usesDashedOutline ? [3, 2] : []
            )
        )

        if store.showNames,
           isAboveHorizon,
           projection.isFrontFacing
        {
            let label = Text("太陽")
                .font(
                    .system(
                        size: 11,
                        weight: .medium,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    SunMarkerStyle.outlineColor(
                        nightMode: store.nightMode,
                        increasedContrast: increasedContrast
                    ).opacity(metrics.labelOpacity)
                )
            context.draw(
                label,
                at: CGPoint(
                    x: point.x + metrics.outerDiameter / 2 + 5,
                    y: point.y - 1
                ),
                anchor: .leading
            )
        }
    }

    private func drawSphereOutline(
        in context: inout GraphicsContext,
        geometry: SphereCanvasGeometry,
        increasedContrast: Bool
    ) {
        context.stroke(
            Path(ellipseIn: geometry.sphereRect),
            with: .color(
                store.nightMode
                    ? Color.red.opacity(
                        increasedContrast ? 1 : 0.68
                    )
                    : Color.white.opacity(
                        increasedContrast ? 0.78 : 0.42
                    )
            ),
            lineWidth: increasedContrast ? 1.8 : 1.2
        )
    }

    private func drawDirectionLabels(
        in context: inout GraphicsContext,
        geometry: SphereCanvasGeometry,
        increasedContrast: Bool
    ) {
        for reference in CelestialSphereReferenceDirection.allCases {
            guard let projection = CelestialSphere.project(
                direction: reference.direction,
                orientation: store.sphereOrientation
            )
            else {
                continue
            }

            let point = directionLabelPoint(
                for: reference,
                projection: projection,
                geometry: geometry,
                increasedContrast: increasedContrast
            )
            let opacity = projection.isFrontFacing
                ? (increasedContrast ? 1 : 0.88)
                : (increasedContrast ? 0.66 : 0.38)
            let color = store.nightMode
                ? Color(red: 1, green: 0.43, blue: 0.38)
                : Color.white
            let label = Text(reference.nameJa)
                .font(
                    .system(
                        size: geometry.radius < 120 ? 9 : 10,
                        weight: projection.isFrontFacing
                            ? .semibold
                            : .regular,
                        design: .rounded
                    )
                )
                .foregroundStyle(color.opacity(opacity))
            context.draw(label, at: point, anchor: .center)
        }
    }

    private func directionLabelPoint(
        for reference: CelestialSphereReferenceDirection,
        projection: CelestialSphereProjectedPoint,
        geometry: SphereCanvasGeometry,
        increasedContrast: Bool
    ) -> CGPoint {
        let point = geometry.directionGuidePoint(
            for: projection.point
        )
        let length = hypot(
            projection.point.x,
            projection.point.y
        )
        let offset: CGFloat = increasedContrast ? 11 : 9

        if length > 0.06 {
            return CGPoint(
                x: point.x
                    + CGFloat(projection.point.x / length) * offset,
                y: point.y
                    + CGFloat(projection.point.y / length) * offset
            )
        }

        let fallback = reference.centralLabelOffset(
            distance: increasedContrast ? 15 : 13
        )
        return CGPoint(
            x: point.x + fallback.x,
            y: point.y + fallback.y
        )
    }

    private func projectedStar(
        _ star: RenderedStar,
        geometry: SphereCanvasGeometry
    ) -> SphereRenderedStar? {
        guard let direction = CelestialSphere.direction(for: star.horizontal),
              let projection = CelestialSphere.project(
                direction: direction,
                orientation: store.sphereOrientation
              )
        else {
            return nil
        }
        return SphereRenderedStar(
            star: star,
            projection: projection,
            point: geometry.point(for: projection.point)
        )
    }

    private func projectedTrajectorySample(
        _ sample: SelectedStarTrajectorySample,
        geometry: SphereCanvasGeometry
    ) -> SphereRenderedTrajectorySample? {
        guard let direction = CelestialSphere.direction(
            for: sample.horizontal
        ),
            let projection = CelestialSphere.project(
                direction: direction,
                orientation: store.sphereOrientation
            )
        else {
            return nil
        }
        return SphereRenderedTrajectorySample(
            sample: sample,
            projection: projection,
            point: geometry.point(for: projection.point)
        )
    }

    private var horizonColor: Color {
        store.nightMode
            ? Color.red
            : Color(red: 0.60, green: 0.76, blue: 0.94)
    }

    private func starDiameter(
        magnitude: Double,
        increasedContrast: Bool
    ) -> CGFloat {
        CGFloat(
            max(
                increasedContrast ? 1.5 : 1,
                min(7, 5.8 - magnitude * 0.72)
            )
        )
    }

    private func selectionColor(
        increasedContrast: Bool
    ) -> Color {
        guard increasedContrast else {
            return store.nightMode
                ? .red
                : Color(red: 0.34, green: 0.72, blue: 1)
        }
        return store.nightMode
            ? Color(red: 1, green: 0.55, blue: 0.5)
            : .white
    }

    private func starColor(bvColor: Double?) -> Color {
        if store.nightMode {
            return Color(red: 0.96, green: 0.28, blue: 0.24)
        }
        guard let bvColor else {
            return Color(red: 1.0, green: 0.95, blue: 0.82)
        }
        switch bvColor {
        case ..<0:
            return Color(red: 0.73, green: 0.84, blue: 1.0)
        case 0..<0.5:
            return Color(red: 0.90, green: 0.93, blue: 1.0)
        case 0.5..<1:
            return Color(red: 1.0, green: 0.96, blue: 0.82)
        default:
            return Color(red: 1.0, green: 0.76, blue: 0.52)
        }
    }
}

private struct HorizonSample {
    let point: CGPoint
    let isFrontFacing: Bool
}

private struct SphereRenderedStar {
    let star: RenderedStar
    let projection: CelestialSphereProjectedPoint
    let point: CGPoint
}

private struct SphereRenderedTrajectorySample {
    let sample: SelectedStarTrajectorySample
    let projection: CelestialSphereProjectedPoint
    let point: CGPoint
}

private extension CelestialSphereReferenceDirection {
    var nameJa: String {
        switch self {
        case .north:
            "北"
        case .east:
            "東"
        case .south:
            "南"
        case .west:
            "西"
        case .zenith:
            "天頂"
        case .nadir:
            "天底"
        }
    }

    func centralLabelOffset(distance: CGFloat) -> CGPoint {
        switch self {
        case .north:
            CGPoint(x: 0, y: -distance)
        case .east:
            CGPoint(x: distance, y: 0)
        case .south:
            CGPoint(x: 0, y: distance)
        case .west:
            CGPoint(x: -distance, y: 0)
        case .zenith:
            CGPoint(x: -distance, y: -distance * 0.72)
        case .nadir:
            CGPoint(x: distance, y: distance * 0.72)
        }
    }
}
