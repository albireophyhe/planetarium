import PlanetariumCore
import SwiftUI

struct SkyChartView: View {
    let store: SkyStore
    private let increasedContrastOverride: Bool?
    @Environment(\.colorSchemeContrast)
    private var colorSchemeContrast

    init(
        store: SkyStore,
        increasedContrastOverride: Bool? = nil
    ) {
        self.store = store
        self.increasedContrastOverride =
            increasedContrastOverride
    }

    var body: some View {
        GeometryReader { proxy in
            let geometry = ChartGeometry(size: proxy.size)

            ZStack {
                Canvas(opaque: true, colorMode: .linear) { context, _ in
                    drawBackground(in: &context, geometry: geometry)
                    drawSky(in: &context, geometry: geometry)
                    drawHorizon(in: &context, geometry: geometry)
                }
                .gesture(selectionGesture(geometry: geometry))
                .skyCanvasAccessibility(
                    label: "全天星図",
                    hint:
                        "星は左側の一覧、前後の星を選ぶアクションから選択できます。選択星の軌跡を表示または非表示にするアクションも利用できます。",
                    store: store
                )

                directionLabels(geometry: geometry)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func drawBackground(
        in context: inout GraphicsContext,
        geometry: ChartGeometry
    ) {
        let palette = SkyPalette.palette(
            for: store.sunState.phase,
            nightMode: store.nightMode
        )
        context.fill(
            Path(CGRect(origin: .zero, size: geometry.size)),
            with: .color(palette.canvas)
        )

        let gradient = Gradient(colors: [palette.zenith, palette.horizon])
        context.fill(
            Path(ellipseIn: geometry.horizonRect),
            with: .radialGradient(
                gradient,
                center: geometry.center,
                startRadius: 0,
                endRadius: geometry.radius
            )
        )
    }

    private func drawSky(
        in context: inout GraphicsContext,
        geometry: ChartGeometry
    ) {
        context.drawLayer { layer in
            layer.clip(to: Path(ellipseIn: geometry.horizonRect))
            drawAltitudeRings(in: &layer, geometry: geometry)

            if store.showConstellations {
                drawConstellations(in: &layer, geometry: geometry)
            }

            drawSelectedStarTrajectory(
                in: &layer,
                geometry: geometry
            )
            drawStars(in: &layer, geometry: geometry)
            drawSun(in: &layer, geometry: geometry)
        }
    }

    private func drawAltitudeRings(
        in context: inout GraphicsContext,
        geometry: ChartGeometry
    ) {
        let gridColor = store.nightMode
            ? Color.red.opacity(increasedContrast ? 0.34 : 0.16)
            : Color(red: 0.52, green: 0.69, blue: 0.88)
                .opacity(increasedContrast ? 0.38 : 0.18)
        for fraction in [1.0 / 3.0, 2.0 / 3.0] {
            let radius = geometry.radius * fraction
            let rect = CGRect(
                x: geometry.center.x - radius,
                y: geometry.center.y - radius,
                width: radius * 2,
                height: radius * 2
            )
            context.stroke(
                Path(ellipseIn: rect),
                with: .color(gridColor),
                style: StrokeStyle(
                    lineWidth: increasedContrast ? 1.2 : 0.8,
                    dash: [3, 5]
                )
            )
        }

        var northSouth = Path()
        northSouth.move(to: CGPoint(
            x: geometry.center.x,
            y: geometry.center.y - geometry.radius
        ))
        northSouth.addLine(to: CGPoint(
            x: geometry.center.x,
            y: geometry.center.y + geometry.radius
        ))
        context.stroke(
            northSouth,
            with: .color(gridColor),
            lineWidth: increasedContrast ? 1.1 : 0.7
        )

        var eastWest = Path()
        eastWest.move(to: CGPoint(
            x: geometry.center.x - geometry.radius,
            y: geometry.center.y
        ))
        eastWest.addLine(to: CGPoint(
            x: geometry.center.x + geometry.radius,
            y: geometry.center.y
        ))
        context.stroke(
            eastWest,
            with: .color(gridColor),
            lineWidth: increasedContrast ? 1.1 : 0.7
        )
    }

    private func drawConstellations(
        in context: inout GraphicsContext,
        geometry: ChartGeometry
    ) {
        let lineColor = store.nightMode
            ? Color.red.opacity(increasedContrast ? 0.62 : 0.36)
            : Color(red: 0.34, green: 0.66, blue: 0.96)
                .opacity(increasedContrast ? 0.72 : 0.42)
        for constellation in store.catalog.constellations {
            for segment in constellation.segments {
                guard
                    let start = store.renderedStarsByHR[segment.startHR],
                    let end = store.renderedStarsByHR[segment.endHR],
                    start.isAboveHorizon,
                    end.isAboveHorizon
                else {
                    continue
                }
                var path = Path()
                path.move(to: geometry.point(for: start.projection))
                path.addLine(to: geometry.point(for: end.projection))
                context.stroke(
                    path,
                    with: .color(lineColor),
                    lineWidth: increasedContrast ? 1.35 : 0.9
                )
            }
        }
    }

    private func drawStars(
        in context: inout GraphicsContext,
        geometry: ChartGeometry
    ) {
        for star in store.renderedStars where star.isAboveHorizon {
            let point = geometry.point(for: star.projection)
            let diameter = starDiameter(magnitude: star.catalog.visualMagnitude)
            let rect = CGRect(
                x: point.x - diameter / 2,
                y: point.y - diameter / 2,
                width: diameter,
                height: diameter
            )
            context.fill(
                Path(ellipseIn: rect),
                with: .color(starColor(bvColor: star.catalog.bvColor))
            )

            if star.catalog.visualMagnitude < 1.1 {
                let glowRect = rect.insetBy(dx: -diameter * 0.65, dy: -diameter * 0.65)
                context.stroke(
                    Path(ellipseIn: glowRect),
                    with: .color(starColor(bvColor: star.catalog.bvColor).opacity(0.20)),
                    lineWidth: 1
                )
            }

            let isSelected = store.selectedStarHR == star.hr
            if isSelected {
                let selectionRect = rect.insetBy(dx: -5, dy: -5)
                context.stroke(
                    Path(ellipseIn: selectionRect),
                    with: .color(selectionColor),
                    lineWidth: increasedContrast ? 3 : 2
                )
            }

            if let name = star.name,
               store.showNames,
               (star.catalog.visualMagnitude <= 1.25 || isSelected) {
                let label = Text(name.nameJa)
                    .font(
                        .system(
                            size: 11,
                            weight: isSelected ? .semibold : .regular,
                            design: .rounded
                        )
                    )
                    .foregroundStyle(store.nightMode ? Color.red : Color.white.opacity(0.82))
                context.draw(
                    label,
                    at: CGPoint(x: point.x + diameter / 2 + 5, y: point.y - 1),
                    anchor: .leading
                )
            }
        }
    }

    private func drawSelectedStarTrajectory(
        in context: inout GraphicsContext,
        geometry: ChartGeometry
    ) {
        guard store.showSelectedStarTrajectory,
              !store.selectedStarTrajectory.isEmpty
        else {
            return
        }
        let compact = geometry.radius < 150
        let color = StarTrajectoryStyle.twoDColor(
            nightMode: store.nightMode
        )

        for segment in SelectedStarTrajectorySampler
            .visible2DSegments(
                from: store.selectedStarTrajectory
            )
        {
            var path = Path()
            path.move(to: geometry.point(for: segment.start))
            path.addLine(to: geometry.point(for: segment.end))
            context.stroke(
                path,
                with: .color(
                    color.opacity(
                        StarTrajectoryStyle.twoDLineOpacity(
                            progress: segment.progress,
                            nightMode: store.nightMode,
                            increasedContrast: increasedContrast
                        )
                    )
                ),
                style: StarTrajectoryStyle.twoDLineStyle(
                    temporalPosition: segment.temporalPosition,
                    compact: compact,
                    increasedContrast: increasedContrast
                )
            )
        }

        let finalOffset =
            store.selectedStarTrajectory.last?.offsetMinutes
        for (index, sample) in
            store.selectedStarTrajectory.enumerated()
        {
            guard sample.isAboveHorizon,
                  !compact
                    || index.isMultiple(of: 2)
                    || sample.offsetMinutes == 0
                    || sample.offsetMinutes == finalOffset
            else {
                continue
            }
            let diameter = StarTrajectoryStyle.twoDPointDiameter(
                progress: sample.progress,
                compact: compact,
                increasedContrast: increasedContrast
            )
            let point = geometry.point(for: sample.projection)
            let rect = CGRect(
                x: point.x - diameter / 2,
                y: point.y - diameter / 2,
                width: diameter,
                height: diameter
            )
            context.fill(
                Path(ellipseIn: rect),
                with: .color(
                    color.opacity(
                        StarTrajectoryStyle.twoDPointOpacity(
                            progress: sample.progress,
                            nightMode: store.nightMode,
                            increasedContrast: increasedContrast
                        )
                    )
                )
            )
            if increasedContrast {
                context.stroke(
                    Path(ellipseIn: rect),
                    with: .color(
                        StarTrajectoryStyle.outlineColor(
                            nightMode: store.nightMode
                        )
                    ),
                    lineWidth: 0.8
                )
            }
        }
    }

    private func drawSun(
        in context: inout GraphicsContext,
        geometry: ChartGeometry
    ) {
        let horizontal = store.sunState.horizontal
        guard SunMarkerStyle.isVisibleInTwoD(
            altitudeRadians: horizontal.altitude
        )
        else {
            return
        }

        let projection = Astronomy.project(
            altitude: horizontal.altitude,
            azimuth: horizontal.azimuth
        )
        let point = geometry.point(for: projection)
        let metrics = SunMarkerStyle.twoDMetrics(
            increasedContrast: increasedContrast
        )
        drawSunMarker(
            in: &context,
            at: point,
            metrics: metrics
        )

        if store.showNames {
            drawSunLabel(
                in: &context,
                at: point,
                metrics: metrics
            )
        }
    }

    private func drawSunMarker(
        in context: inout GraphicsContext,
        at point: CGPoint,
        metrics: SunMarkerMetrics
    ) {
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
            style: StrokeStyle(lineWidth: metrics.lineWidth)
        )
    }

    private func drawSunLabel(
        in context: inout GraphicsContext,
        at point: CGPoint,
        metrics: SunMarkerMetrics
    ) {
        let label = Text("太陽")
            .font(.system(size: 11, weight: .medium, design: .rounded))
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

    private func drawHorizon(
        in context: inout GraphicsContext,
        geometry: ChartGeometry
    ) {
        context.stroke(
            Path(ellipseIn: geometry.horizonRect),
            with: .color(
                store.nightMode
                    ? Color.red.opacity(
                        increasedContrast ? 1 : 0.72
                    )
                    : Color(red: 0.60, green: 0.76, blue: 0.94)
                        .opacity(increasedContrast ? 1 : 0.72)
            ),
            lineWidth: increasedContrast ? 2 : 1.25
        )
    }

    private func directionLabels(geometry: ChartGeometry) -> some View {
        let color = store.nightMode
            ? Color.red.opacity(increasedContrast ? 1 : 0.9)
            : Color.white.opacity(increasedContrast ? 1 : 0.75)
        return ZStack {
            Text("北")
                .position(x: geometry.center.x, y: geometry.center.y - geometry.radius - 12)
            Text("東")
                .position(x: geometry.center.x + geometry.radius + 13, y: geometry.center.y)
            Text("南")
                .position(x: geometry.center.x, y: geometry.center.y + geometry.radius + 12)
            Text("西")
                .position(x: geometry.center.x - geometry.radius - 13, y: geometry.center.y)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(color)
    }

    private func selectionGesture(geometry: ChartGeometry) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onEnded { value in
                let projected = geometry.projectedPoint(for: value.location)
                guard hypot(projected.x, projected.y) <= 1 else { return }
                store.selectClosest(
                    to: projected,
                    maximumDistance: max(12 / Double(geometry.radius), 0.025)
                )
            }
    }

    private func starDiameter(magnitude: Double) -> CGFloat {
        CGFloat(
            max(
                increasedContrast ? 1.5 : 1,
                min(7, 5.8 - magnitude * 0.72)
            )
        )
    }

    private var increasedContrast: Bool {
        increasedContrastOverride
            ?? (colorSchemeContrast == .increased)
    }

    private var selectionColor: Color {
        if increasedContrast {
            return store.nightMode
                ? Color(red: 1, green: 0.55, blue: 0.5)
                : .white
        }
        return store.nightMode
            ? .red
            : Color(red: 0.34, green: 0.72, blue: 1)
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

private struct ChartGeometry {
    let size: CGSize
    let center: CGPoint
    let radius: CGFloat
    let horizonRect: CGRect

    init(size: CGSize) {
        let safeSize = CGSize(
            width: max(0, size.width),
            height: max(0, size.height)
        )
        self.size = safeSize
        center = CGPoint(x: safeSize.width / 2, y: safeSize.height / 2)
        radius = max(1, min(safeSize.width, safeSize.height) / 2 - 28)
        horizonRect = CGRect(
            x: center.x - radius,
            y: center.y - radius,
            width: radius * 2,
            height: radius * 2
        )
    }

    func point(for projected: ProjectedPoint) -> CGPoint {
        CGPoint(
            x: center.x + CGFloat(projected.x) * radius,
            y: center.y + CGFloat(projected.y) * radius
        )
    }

    func projectedPoint(for point: CGPoint) -> ProjectedPoint {
        ProjectedPoint(
            x: Double((point.x - center.x) / radius),
            y: Double((point.y - center.y) / radius)
        )
    }
}
