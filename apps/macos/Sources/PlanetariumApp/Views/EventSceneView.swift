import AppKit
import PlanetariumCore
import SwiftUI

/// A solved-contact diagram for one local event forecast.
///
/// The view deliberately has no playback animation. Besides keeping the
/// inspector lightweight, a static diagram remains usable when Reduce Motion
/// is enabled and avoids inventing positions between solver samples.
struct EventSceneView: View {
    let item: EventForecastItem
    let observationDate: Date
    let onShowOnSky: (Date, String) -> Void

    @State private var selectedMomentID: String?

    @Environment(\.accessibilityDifferentiateWithoutColor)
    private var differentiateWithoutColor
    @Environment(\.accessibilityReduceMotion)
    private var reduceMotion
    @Environment(\.accessibilityReduceTransparency)
    private var reduceTransparency
    @Environment(\.colorSchemeContrast)
    private var colorSchemeContrast

    var body: some View {
        let moments =
            EventSceneTimeline.moments(for: item)
        let selectedMoment =
            resolvedMoment(in: moments)

        Group {
            if let selectedMoment {
                sceneContent(
                    moment: selectedMoment,
                    moments: moments
                )
            } else {
                ContentUnavailableView(
                    "相対配置データなし",
                    systemImage:
                        "exclamationmark.triangle",
                    description:
                        Text(
                            "計算済みの"
                                + momentKindsDescription
                                + "データがありません。"
                        )
                )
            }
        }
        .onAppear {
            selectMatchingOrDefault(in: moments)
        }
        .onChange(of: item.id) {
            selectedMomentID = nil
            selectMatchingOrDefault(
                in:
                    EventSceneTimeline
                    .moments(for: item)
            )
        }
        .onChange(of: observationDate) {
            synchronizeWithSkyDate(
                moments:
                    EventSceneTimeline
                    .moments(for: item)
            )
        }
        // No animation is introduced by this view. This also prevents a
        // parent inspector transition from animating the scientific diagram
        // when the system Reduce Motion preference is active.
        .transaction { transaction in
            if reduceMotion {
                transaction.animation = nil
                transaction.disablesAnimations = true
            }
        }
    }

    private func sceneContent(
        moment: EventSceneTimelineMoment,
        moments: [EventSceneTimelineMoment]
    ) -> some View {
        let scene =
            EventScenePresentation(
                item: item,
                moment: moment
            )
        let matchesSky =
            EventSceneTimeline
            .matchingMoment(
                observationDate:
                    observationDate,
                in: [moment]
            ) != nil

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Label(
                    moment.label + "の相対配置",
                    systemImage: scene.systemImage
                )
                .font(SkyTypography.heading)

                Spacer(minLength: 8)

                Text(scene.fidelityLabel)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(
                        .quaternary,
                        in: Capsule()
                    )
            }

            Picker(
                "相対配置の計算済み時刻",
                selection:
                    momentSelection(
                        moments: moments
                    )
            ) {
                ForEach(moments) { candidate in
                    Text(
                        candidate.label
                            + " · "
                            + EventForecastFormatting
                            .shortDateTime(
                                candidate.instantUTC,
                                timeZoneIdentifier:
                                    item.observer
                                    .location
                                    .timeZoneIdentifier
                            )
                    )
                    .tag(candidate.id)
                }
            }
            .pickerStyle(.menu)
            .accessibilityHint(
                momentKindsDescription
                    + "の計算済み静止図を選びます。星図の観測時刻は変わりません"
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(
                    "現地："
                        + EventForecastFormatting
                        .dateTime(
                            moment.instantUTC,
                            timeZoneIdentifier:
                                item.observer
                                .location
                                .timeZoneIdentifier
                        )
                )
                Text(
                    "UTC："
                        + EventForecastFormatting
                        .utcDateTime(
                            moment.instantUTC
                        )
                )
                .foregroundStyle(.secondary)
            }
            .font(SkyTypography.dataCaption)
            .accessibilityElement(children: .combine)

            Label(
                matchesSky
                    ? "星図と同じ時刻です。"
                    : "計算済み時刻の静止図です。現在の星図時刻とは別です。",
                systemImage:
                    matchesSky
                    ? "checkmark.circle"
                    : "clock.badge.exclamationmark"
            )
            .font(.caption.weight(.semibold))
            .foregroundStyle(
                matchesSky
                    ? Color.secondary
                    : Color.orange
            )
            .fixedSize(
                horizontal: false,
                vertical: true
            )

            ZStack(alignment: .topLeading) {
                Canvas(
                    opaque: false,
                    colorMode: .linear
                ) { context, size in
                    draw(
                        scene,
                        in: &context,
                        size: size
                    )
                }

                Text(scene.axisLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(8)
                    .accessibilityHidden(true)
            }
            .frame(
                minHeight: 220,
                idealHeight: 240,
                maxHeight: 280
            )
            .background(
                Color.primary.opacity(
                    reduceTransparency
                        ? 0.075
                        : 0.035
                ),
                in: RoundedRectangle(
                    cornerRadius: 12,
                    style: .continuous
                )
            )
            .overlay {
                RoundedRectangle(
                    cornerRadius: 12,
                    style: .continuous
                )
                .stroke(
                    Color.secondary.opacity(
                        colorSchemeContrast == .increased
                            ? 0.55
                            : 0.20
                    ),
                    lineWidth:
                        colorSchemeContrast == .increased
                        ? 1.25
                        : 0.75
                )
            }
            .clipShape(
                RoundedRectangle(
                    cornerRadius: 12,
                    style: .continuous
                )
            )
            .accessibilityElement(
                children: .ignore
            )
            .accessibilityLabel(
                moment.label + "の相対配置"
            )
            .accessibilityValue(
                scene.accessibilitySummary
            )
            .accessibilityHint(
                scene.accessibilityHint
            )

            Text(scene.legend)
                .font(.caption.weight(.medium))
                .foregroundStyle(.primary)
                .fixedSize(
                    horizontal: false,
                    vertical: true
                )

            Label(
                scene.explanation,
                systemImage:
                    scene.isSchematic
                    ? "info.circle"
                    : "scope"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(
                horizontal: false,
                vertical: true
            )

            Button {
                onShowOnSky(
                    moment.instantUTC,
                    moment.label + "を空に表示"
                )
            } label: {
                Label(
                    "この時刻を空に表示",
                    systemImage:
                        "clock.arrow.circlepath"
                )
            }
            .buttonStyle(.bordered)
            .accessibilityHint(
                "時間再生を停止し、星図の観測時刻をこの計算済み時刻へ変更します"
            )

            Text(
                momentKindsDescription
                    + "のソルバー計算結果だけを切り替える静止図です。時刻間の画面座標は補間していません。"
            )
            .font(.caption2)
            .foregroundStyle(.secondary)
            .fixedSize(
                horizontal: false,
                vertical: true
            )
        }
    }

    private func momentSelection(
        moments: [EventSceneTimelineMoment]
    ) -> Binding<String> {
        Binding(
            get: {
                resolvedMoment(in: moments)?.id
                    ?? ""
            },
            set: {
                selectedMomentID = $0
            }
        )
    }

    private func resolvedMoment(
        in moments: [EventSceneTimelineMoment]
    ) -> EventSceneTimelineMoment? {
        if let selectedMomentID,
           let selected =
            moments.first(
                where: {
                    $0.id == selectedMomentID
                }
            )
        {
            return selected
        }
        return EventSceneTimeline
            .matchingMoment(
                observationDate:
                    observationDate,
                in: moments
            )
            ?? EventSceneTimeline
            .defaultMoment(in: moments)
    }

    private func selectMatchingOrDefault(
        in moments: [EventSceneTimelineMoment]
    ) {
        selectedMomentID =
            EventSceneTimeline
            .matchingMoment(
                observationDate:
                    observationDate,
                in: moments
            )?
            .id
            ?? EventSceneTimeline
            .defaultMoment(in: moments)?
            .id
    }

    private func synchronizeWithSkyDate(
        moments: [EventSceneTimelineMoment]
    ) {
        guard
            let matching =
                EventSceneTimeline
                .matchingMoment(
                    observationDate:
                        observationDate,
                    in: moments
                )
        else {
            return
        }
        selectedMomentID = matching.id
    }

    private var momentKindsDescription: String {
        switch item {
        case .eclipse:
            "接触・最大"
        case .occultation:
            "接触・最接近"
        }
    }

    private var increasedContrast: Bool {
        colorSchemeContrast == .increased
    }

    private func draw(
        _ scene: EventScenePresentation,
        in context: inout GraphicsContext,
        size: CGSize
    ) {
        switch scene.content {
        case let .solar(solar):
            drawSolar(
                solar,
                in: &context,
                size: size
            )
        case let .lunar(lunar):
            drawLunar(
                lunar,
                in: &context,
                size: size
            )
        case let .occultation(occultation):
            drawOccultation(
                occultation,
                in: &context,
                size: size
            )
        case .unavailable:
            drawUnavailable(
                in: &context,
                size: size
            )
        }
    }

    private func drawSolar(
        _ scene: SolarEventScene,
        in context: inout GraphicsContext,
        size: CGSize
    ) {
        let bodies = [
            AngularSceneBody(
                eastward: 0,
                upward: 0,
                radius: scene.sunRadius
            ),
            AngularSceneBody(
                eastward:
                    scene.moonOffset
                    .eastwardRadians,
                upward:
                    scene.moonOffset
                    .upwardRadians,
                radius: scene.moonRadius
            ),
        ]
        guard let transform =
            AngularSceneTransform(
                size: size,
                bodies: bodies
            )
        else {
            drawUnavailable(
                in: &context,
                size: size
            )
            return
        }

        let sunCenter = transform.point(
            eastward: 0,
            upward: 0
        )
        let moonCenter = transform.point(
            eastward:
                scene.moonOffset
                .eastwardRadians,
            upward:
                scene.moonOffset
                .upwardRadians
        )
        let sunRadius =
            transform.length(scene.sunRadius)
        let moonRadius =
            transform.length(scene.moonRadius)

        drawAxes(
            in: &context,
            transform: transform,
            origin: sunCenter
        )
        drawCenterLine(
            from: sunCenter,
            to: moonCenter,
            in: &context
        )

        let sunPath = circle(
            center: sunCenter,
            radius: sunRadius
        )
        context.fill(
            sunPath,
            with: .radialGradient(
                Gradient(colors: [
                    Color.yellow.opacity(0.96),
                    Color.orange.opacity(0.78),
                ]),
                center: sunCenter,
                startRadius: 0,
                endRadius: sunRadius
            )
        )
        context.stroke(
            sunPath,
            with: .color(
                Color.primary.opacity(0.76)
            ),
            lineWidth: increasedContrast ? 1.8 : 1.1
        )

        let moonPath = circle(
            center: moonCenter,
            radius: moonRadius
        )
        context.fill(
            moonPath,
            with: .color(
                Color(
                    nsColor:
                        .shadowColor
                )
                .opacity(0.94)
            )
        )
        context.stroke(
            moonPath,
            with: .color(Color.primary),
            style: StrokeStyle(
                lineWidth:
                    increasedContrast ? 2.2 : 1.35,
                dash:
                    differentiateWithoutColor
                    ? [5, 3]
                    : []
            )
        )

        drawLabel(
            "太陽",
            at: labelPoint(
                center: sunCenter,
                radius: sunRadius,
                edge: .bottom
            ),
            in: &context
        )
        drawLabel(
            "月",
            at: labelPoint(
                center: moonCenter,
                radius: moonRadius,
                edge: .top
            ),
            in: &context
        )
    }

    private func drawLunar(
        _ scene: LunarEclipseEventScene,
        in context: inout GraphicsContext,
        size: CGSize
    ) {
        let bodies = [
            AngularSceneBody(
                eastward: 0,
                upward: 0,
                radius: scene.penumbralRadius
            ),
            AngularSceneBody(
                eastward:
                    scene.moonOffset
                    .eastwardRadians,
                upward:
                    scene.moonOffset
                    .upwardRadians,
                radius: scene.moonRadius
            ),
        ]
        guard let transform =
            AngularSceneTransform(
                size: size,
                bodies: bodies
            )
        else {
            drawUnavailable(
                in: &context,
                size: size
            )
            return
        }

        let shadowCenter = transform.point(
            eastward: 0,
            upward: 0
        )
        let moonCenter = transform.point(
            eastward:
                scene.moonOffset
                .eastwardRadians,
            upward:
                scene.moonOffset
                .upwardRadians
        )
        let penumbraPath = circle(
            center: shadowCenter,
            radius:
                transform.length(
                    scene.penumbralRadius
                )
        )
        let umbraPath = circle(
            center: shadowCenter,
            radius:
                transform.length(
                    scene.umbralRadius
                )
        )
        let moonRadius =
            transform.length(scene.moonRadius)
        let moonPath = circle(
            center: moonCenter,
            radius: moonRadius
        )

        drawAxes(
            in: &context,
            transform: transform,
            origin: shadowCenter
        )
        drawCenterLine(
            from: shadowCenter,
            to: moonCenter,
            in: &context
        )

        context.fill(
            penumbraPath,
            with: .color(
                Color(
                    nsColor: .shadowColor
                )
                .opacity(
                    reduceTransparency
                    ? 0.16
                    : 0.08
                )
            )
        )
        context.stroke(
            penumbraPath,
            with: .color(
                Color.secondary.opacity(
                    increasedContrast ? 0.9 : 0.58
                )
            ),
            style: StrokeStyle(
                lineWidth:
                    increasedContrast ? 1.8 : 1.1,
                dash: [6, 4]
            )
        )

        context.fill(
            umbraPath,
            with: .color(
                Color(
                    nsColor: .shadowColor
                )
                .opacity(
                    reduceTransparency
                    ? 0.30
                    : 0.18
                )
            )
        )
        context.stroke(
            umbraPath,
            with: .color(
                Color.primary.opacity(0.74)
            ),
            lineWidth: increasedContrast ? 2 : 1.25
        )

        context.fill(
            moonPath,
            with: .color(
                Color.secondary.opacity(0.76)
            )
        )
        context.stroke(
            moonPath,
            with: .color(Color.primary),
            lineWidth: increasedContrast ? 2.1 : 1.3
        )

        // Overlay the two shadow zones only within the lunar disc. The
        // surrounding circles remain visible as measured geometry guides.
        context.drawLayer { layer in
            layer.clip(to: moonPath)
            layer.fill(
                penumbraPath,
                with: .color(
                    Color(
                        nsColor: .shadowColor
                    )
                    .opacity(
                        reduceTransparency
                        ? 0.20
                        : 0.12
                    )
                )
            )
            layer.fill(
                umbraPath,
                with: .color(
                    Color(
                        nsColor: .shadowColor
                    )
                    .opacity(
                        reduceTransparency
                        ? 0.68
                        : 0.52
                    )
                )
            )
        }
        context.stroke(
            moonPath,
            with: .color(Color.primary),
            lineWidth: increasedContrast ? 2.1 : 1.3
        )

        drawLabel(
            "半影",
            at: labelPoint(
                center: shadowCenter,
                radius:
                    transform.length(
                        scene.penumbralRadius
                    ),
                edge: .bottom
            ),
            in: &context
        )
        drawLabel(
            "本影",
            at: labelPoint(
                center: shadowCenter,
                radius:
                    transform.length(
                        scene.umbralRadius
                    ),
                edge: .top
            ),
            in: &context
        )
        drawLabel(
            "月",
            at: labelPoint(
                center: moonCenter,
                radius: moonRadius,
                edge: .top
            ),
            in: &context
        )
    }

    private func drawOccultation(
        _ scene: OccultationEventScene,
        in context: inout GraphicsContext,
        size: CGSize
    ) {
        let markerAllowance =
            max(
                scene.moonRadius * 0.10,
                1e-12
            )
        let bodies = [
            AngularSceneBody(
                eastward: 0,
                upward: 0,
                radius: scene.moonRadius
            ),
            AngularSceneBody(
                eastward:
                    scene.targetOffset
                    .eastwardRadians,
                upward:
                    scene.targetOffset
                    .upwardRadians,
                radius: markerAllowance
            ),
        ]
        guard let transform =
            AngularSceneTransform(
                size: size,
                bodies: bodies
            )
        else {
            drawUnavailable(
                in: &context,
                size: size
            )
            return
        }

        let moonCenter = transform.point(
            eastward: 0,
            upward: 0
        )
        let starCenter = transform.point(
            eastward:
                scene.targetOffset
                .eastwardRadians,
            upward:
                scene.targetOffset
                .upwardRadians
        )
        let moonRadius =
            transform.length(scene.moonRadius)

        drawAxes(
            in: &context,
            transform: transform,
            origin: moonCenter
        )
        drawCenterLine(
            from: moonCenter,
            to: starCenter,
            in: &context
        )

        let moonPath = circle(
            center: moonCenter,
            radius: moonRadius
        )
        context.fill(
            moonPath,
            with: .color(
                Color.secondary.opacity(0.62)
            )
        )
        context.stroke(
            moonPath,
            with: .color(Color.primary),
            lineWidth: increasedContrast ? 2.1 : 1.3
        )

        drawStarDirection(
            at: starCenter,
            targetState: scene.targetState,
            in: &context
        )
        drawLabel(
            "平均月縁",
            at: labelPoint(
                center: moonCenter,
                radius: moonRadius,
                edge: .bottom
            ),
            in: &context
        )
        drawLabel(
            scene.targetState.canvasLabel,
            at: CGPoint(
                x: starCenter.x,
                y: starCenter.y - 14
            ),
            in: &context
        )
    }

    private func drawUnavailable(
        in context: inout GraphicsContext,
        size: CGSize
    ) {
        context.draw(
            Text("配置データを表示できません")
                .font(.callout)
                .foregroundStyle(.secondary),
            at: CGPoint(
                x: size.width / 2,
                y: size.height / 2
            ),
            anchor: .center
        )
    }

    private func drawAxes(
        in context: inout GraphicsContext,
        transform: AngularSceneTransform,
        origin: CGPoint
    ) {
        let color = Color.secondary.opacity(
            increasedContrast ? 0.54 : 0.24
        )
        var horizontal = Path()
        horizontal.move(
            to: CGPoint(
                x: transform.contentRect.minX,
                y: origin.y
            )
        )
        horizontal.addLine(
            to: CGPoint(
                x: transform.contentRect.maxX,
                y: origin.y
            )
        )
        context.stroke(
            horizontal,
            with: .color(color),
            style: StrokeStyle(
                lineWidth:
                    increasedContrast ? 1.1 : 0.7,
                dash: [2, 5]
            )
        )

        var vertical = Path()
        vertical.move(
            to: CGPoint(
                x: origin.x,
                y: transform.contentRect.minY
            )
        )
        vertical.addLine(
            to: CGPoint(
                x: origin.x,
                y: transform.contentRect.maxY
            )
        )
        context.stroke(
            vertical,
            with: .color(color),
            style: StrokeStyle(
                lineWidth:
                    increasedContrast ? 1.1 : 0.7,
                dash: [2, 5]
            )
        )
    }

    private func drawCenterLine(
        from start: CGPoint,
        to end: CGPoint,
        in context: inout GraphicsContext
    ) {
        guard hypot(
            end.x - start.x,
            end.y - start.y
        ) > 0.5
        else {
            return
        }
        var line = Path()
        line.move(to: start)
        line.addLine(to: end)
        context.stroke(
            line,
            with: .color(
                Color.secondary.opacity(
                    increasedContrast ? 0.84 : 0.48
                )
            ),
            style: StrokeStyle(
                lineWidth:
                    increasedContrast ? 1.4 : 0.9,
                dash: [4, 4]
            )
        )
    }

    private func drawStarDirection(
        at center: CGPoint,
        targetState:
            OccultationSceneTargetState,
        in context: inout GraphicsContext
    ) {
        let radius: CGFloat =
            increasedContrast ? 8 : 7
        var rays = Path()
        rays.move(
            to: CGPoint(
                x: center.x - radius,
                y: center.y
            )
        )
        rays.addLine(
            to: CGPoint(
                x: center.x + radius,
                y: center.y
            )
        )
        rays.move(
            to: CGPoint(
                x: center.x,
                y: center.y - radius
            )
        )
        rays.addLine(
            to: CGPoint(
                x: center.x,
                y: center.y + radius
            )
        )
        rays.move(
            to: CGPoint(
                x: center.x - radius * 0.65,
                y: center.y - radius * 0.65
            )
        )
        rays.addLine(
            to: CGPoint(
                x: center.x + radius * 0.65,
                y: center.y + radius * 0.65
            )
        )
        rays.move(
            to: CGPoint(
                x: center.x + radius * 0.65,
                y: center.y - radius * 0.65
            )
        )
        rays.addLine(
            to: CGPoint(
                x: center.x - radius * 0.65,
                y: center.y + radius * 0.65
            )
        )

        context.stroke(
            rays,
            with: .color(Color.accentColor),
            style: StrokeStyle(
                lineWidth:
                    increasedContrast ? 2.4 : 1.7,
                lineCap: .round,
                dash: targetState.markerDash
            )
        )
        context.fill(
            Path(
                ellipseIn: CGRect(
                    x: center.x - 2,
                    y: center.y - 2,
                    width: 4,
                    height: 4
                )
            ),
            with: .color(Color.accentColor)
        )
    }

    private func drawLabel(
        _ string: String,
        at point: CGPoint,
        in context: inout GraphicsContext
    ) {
        context.draw(
            Text(string)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.primary),
            at: point,
            anchor: .center
        )
    }

    private func circle(
        center: CGPoint,
        radius: CGFloat
    ) -> Path {
        Path(
            ellipseIn: CGRect(
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2
            )
        )
    }

    private enum LabelEdge {
        case top
        case bottom
    }

    private func labelPoint(
        center: CGPoint,
        radius: CGFloat,
        edge: LabelEdge
    ) -> CGPoint {
        let inset = max(
            11,
            min(18, radius * 0.34)
        )
        return CGPoint(
            x: center.x,
            y:
                center.y
                + (edge == .top ? -inset : inset)
        )
    }
}

private struct AngularSceneBody {
    let eastward: Double
    let upward: Double
    let radius: Double
}

private struct AngularSceneTransform {
    let contentRect: CGRect
    private let scale: Double
    private let angularMidX: Double
    private let angularMidY: Double

    init?(
        size: CGSize,
        bodies: [AngularSceneBody]
    ) {
        guard
            size.width.isFinite,
            size.height.isFinite,
            size.width > 80,
            size.height > 80,
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

        let inset: CGFloat = 26
        let rect = CGRect(
            x: inset,
            y: inset,
            width: size.width - 2 * inset,
            height: size.height - 2 * inset
        )
        guard rect.width > 0, rect.height > 0 else {
            return nil
        }

        var minX = Double.infinity
        var maxX = -Double.infinity
        var minY = Double.infinity
        var maxY = -Double.infinity
        var maximumRadius = 0.0
        for body in bodies {
            minX = min(
                minX,
                body.eastward - body.radius
            )
            maxX = max(
                maxX,
                body.eastward + body.radius
            )
            minY = min(
                minY,
                body.upward - body.radius
            )
            maxY = max(
                maxY,
                body.upward + body.radius
            )
            maximumRadius = max(
                maximumRadius,
                body.radius
            )
        }
        guard
            minX.isFinite,
            maxX.isFinite,
            minY.isFinite,
            maxY.isFinite,
            maximumRadius > 0
        else {
            return nil
        }

        let minimumSpan = maximumRadius * 2.45
        let spanX = max(maxX - minX, minimumSpan)
        let spanY = max(maxY - minY, minimumSpan)
        let resolvedScale = min(
            Double(rect.width) / spanX,
            Double(rect.height) / spanY
        )
        guard
            resolvedScale.isFinite,
            resolvedScale > 0
        else {
            return nil
        }

        contentRect = rect
        scale = resolvedScale
        angularMidX = (minX + maxX) / 2
        angularMidY = (minY + maxY) / 2
    }

    func point(
        eastward: Double,
        upward: Double
    ) -> CGPoint {
        CGPoint(
            x:
                contentRect.midX
                + (eastward - angularMidX)
                * scale,
            y:
                contentRect.midY
                - (upward - angularMidY)
                * scale
        )
    }

    func length(_ radians: Double) -> CGFloat {
        radians * scale
    }
}

private enum EventSceneContent {
    case solar(SolarEventScene)
    case lunar(LunarEclipseEventScene)
    case occultation(OccultationEventScene)
    case unavailable
}

private struct SolarEventScene {
    let sunRadius: Double
    let moonRadius: Double
    let moonOffset: EventSceneTangentOffsetV1
}

private struct LunarEclipseEventScene {
    let moonRadius: Double
    let penumbralRadius: Double
    let umbralRadius: Double
    /// Moon-center offset from the shadow center.
    let moonOffset: EventSceneTangentOffsetV1
}

private struct OccultationEventScene {
    let moonRadius: Double
    let targetOffset: EventSceneTangentOffsetV1
    let targetState:
        OccultationSceneTargetState
}

private struct EventScenePresentation {
    let content: EventSceneContent
    let systemImage: String
    let fidelityLabel: String
    let axisLabel: String
    let legend: String
    let explanation: String
    let accessibilitySummary: String
    let accessibilityHint: String
    let isSchematic: Bool

    private init(
        content: EventSceneContent,
        systemImage: String,
        fidelityLabel: String,
        axisLabel: String,
        legend: String,
        explanation: String,
        accessibilitySummary: String,
        accessibilityHint: String,
        isSchematic: Bool
    ) {
        self.content = content
        self.systemImage = systemImage
        self.fidelityLabel = fidelityLabel
        self.axisLabel = axisLabel
        self.legend = legend
        self.explanation = explanation
        self.accessibilitySummary =
            accessibilitySummary
        self.accessibilityHint =
            accessibilityHint
        self.isSchematic = isSchematic
    }

    init(
        item: EventForecastItem,
        moment: EventSceneTimelineMoment
    ) {
        switch (item, moment.sample) {
        case let (
            .eclipse(forecast),
            .eclipse(contact)
        ):
            if forecast.candidate.kind
                == .solarEclipse
            {
                self = Self.solar(
                    contact,
                    phaseLabel: moment.label
                )
            } else {
                self = Self.lunar(
                    forecast,
                    contact: contact,
                    phaseLabel: moment.label,
                    isMaximum:
                        moment.isMaximum
                )
            }
        case let (
            .occultation(forecast),
            .occultation(contact)
        ):
            self = Self.occultation(
                forecast,
                contact: contact,
                phaseLabel: moment.label
            )
        default:
            self = Self.unavailable(
                systemImage:
                    item.candidate.kind
                    == .solarEclipse
                    ? "sun.max"
                    : "moon.stars",
                phaseLabel: moment.label
            )
        }
    }

    private static func solar(
        _ contact: EclipseContactV1,
        phaseLabel: String
    ) -> Self {
        guard
            let sun = contact.sun,
            let moon = contact.moon,
            validRadius(sun.angularRadiusRadians),
            validRadius(moon.angularRadiusRadians),
            let offset =
                EventSceneGeometryV1
                .tangentOffset(
                    reference: sun.horizontal,
                    target: moon.horizontal
                )
        else {
            return unavailable(
                systemImage: "sun.max",
                phaseLabel: phaseLabel
            )
        }

        let separation =
            EventSceneFormatting.angle(
                offset.separationRadians
            )
        let summary =
            "日食の\(phaseLabel)です。"
            + "太陽と月の中心間隔は\(separation)。"
            + "月中心は太陽中心から"
            + EventSceneFormatting
                .relativeDirection(offset)
            + "。太陽の角半径は"
            + EventSceneFormatting
                .angle(
                    sun.angularRadiusRadians
                )
            + "、月の角半径は"
            + EventSceneFormatting
                .angle(
                    moon.angularRadiusRadians
                )
            + "です。"

        return Self(
            content: .solar(
                SolarEventScene(
                    sunRadius:
                        sun.angularRadiusRadians,
                    moonRadius:
                        moon.angularRadiusRadians,
                    moonOffset: offset
                )
            ),
            systemImage: "sun.max",
            fidelityLabel: "計算結果",
            axisLabel:
                offset.orientationIsDefined
                ? "上：高度が高い　右：方位角が増える"
                : "相対方向の軸は未定義",
            legend:
                "黄色：太陽　輪郭円：月",
            explanation:
                "\(phaseLabel)の計算済み地平座標と角半径を同じ角尺度で投影しています。月縁は平均球面で、月面地形やベイリービーズは再現しません。",
            accessibilitySummary: summary,
            accessibilityHint:
                "太陽と月の円は同じ角尺度です。",
            isSchematic: false
        )
    }

    private static func lunar(
        _ forecast: LocalEclipseCircumstancesV1,
        contact: EclipseContactV1,
        phaseLabel: String,
        isMaximum: Bool
    ) -> Self {
        guard
            let moon = contact.moon,
            validRadius(moon.angularRadiusRadians)
        else {
            return unavailable(
                systemImage: "moon.stars",
                phaseLabel: phaseLabel
            )
        }

        guard
            contact.lunarShadow != nil
            || isMaximum
        else {
            return unavailable(
                systemImage: "moon.stars",
                phaseLabel: phaseLabel
            )
        }

        guard let layout =
            EventSceneGeometryV1
            .lunarEclipseLayout(
                moonAngularRadiusRadians:
                    moon.angularRadiusRadians,
                shadow:
                    contact.lunarShadow,
                magnitude: forecast.magnitude,
                usesPenumbralMagnitude:
                    forecast.classification
                    == .penumbral
            )
        else {
            return unavailable(
                systemImage: "moon.stars",
                phaseLabel: phaseLabel
            )
        }

        if layout.source == .physical,
           let shadow =
            contact.lunarShadow
        {
            let shadowFromMoon =
                EventSceneTangentOffsetV1(
                    eastwardRadians:
                        -layout.moonOffset
                        .eastwardRadians,
                    upwardRadians:
                        -layout.moonOffset
                        .upwardRadians,
                    separationRadians:
                        layout.moonOffset
                        .separationRadians,
                    positionAngleRadians:
                        EventSceneFormatting
                        .normalizedRadians(
                            layout.moonOffset
                                .positionAngleRadians
                            + .pi
                        ),
                    orientationIsDefined:
                        layout
                        .orientationIsDefined
                )
            let summary =
                "月食の\(phaseLabel)です。"
                + "月と地球影の中心間隔は"
                + EventSceneFormatting
                    .angle(
                        shadow
                            .centerSeparationRadians
                    )
                + "。本影の角半径は"
                + EventSceneFormatting
                    .angle(
                        shadow
                            .umbralAngularRadiusRadians
                    )
                + "、半影の角半径は"
                + EventSceneFormatting
                    .angle(
                        shadow
                            .penumbralAngularRadiusRadians
                    )
                + "、月の角半径は"
                + EventSceneFormatting
                    .angle(
                    moon.angularRadiusRadians
                    )
                + "です。"
                + (
                    layout.orientationIsDefined
                    ? "地球影中心は月中心から"
                        + EventSceneFormatting
                        .relativeDirection(
                            shadowFromMoon,
                            northLabel: "天の北",
                            eastLabel: "天の東"
                        )
                        + "。"
                    : "中心方向は定義できないため、向きは概略です。"
                )

            return Self(
                content: .lunar(
                    LunarEclipseEventScene(
                        moonRadius: layout.moonRadius,
                        penumbralRadius:
                            layout.penumbralRadius,
                        umbralRadius:
                            layout.umbralRadius,
                        moonOffset:
                            layout.moonOffset
                    )
                ),
                systemImage: "moon.stars",
                fidelityLabel:
                    layout.orientationIsDefined
                    ? "計算結果"
                    : "実寸・向き概略",
                axisLabel:
                    layout.orientationIsDefined
                    ? "上：天の北　右：天の東"
                    : "円の大きさは実値・向きは概略",
                legend:
                    "破線：半影　内側の円：本影　明るい円：月",
                explanation:
                    layout.orientationIsDefined
                    ? "\(phaseLabel)のDanjon法（影半径1.01倍）の計算結果を同じ角尺度で投影しています。色と明暗は識別用で、肉眼で見える月面輝度の再現ではありません。"
                    : "\(phaseLabel)の影と月の角半径・中心間隔は計算値です。中心位置角を定義できないため、向きだけを概略表示しています。",
                accessibilitySummary: summary,
                accessibilityHint:
                    "半影、本影、月の円は同じ角尺度です。",
                isSchematic:
                    !layout.orientationIsDefined
            )
        }

        return Self(
            content: .lunar(
                LunarEclipseEventScene(
                    moonRadius: layout.moonRadius,
                    penumbralRadius:
                        layout.penumbralRadius,
                    umbralRadius:
                        layout.umbralRadius,
                    moonOffset:
                        layout.moonOffset
                )
            ),
            systemImage: "moon.stars",
            fidelityLabel: "概略",
            axisLabel: "向き・影半径は概略",
            legend:
                "破線：半影　内側の円：本影　明るい円：月",
            explanation:
                "\(phaseLabel)の結果には地球影中心と影半径が含まれないため、最大食分に応じた概略です。向き・影半径・月面の明暗は観測再現ではありません。",
            accessibilitySummary:
                "月食\(phaseLabel)の概略図です。"
                + EventSceneFormatting
                .magnitude(
                    forecast.magnitude,
                    penumbral:
                        forecast.classification
                        == .penumbral
                )
                + "に応じた配置で、向きと影半径は計算値ではありません。",
            accessibilityHint:
                "概略図です。詳しい数値は予報の測定欄で確認してください。",
            isSchematic: true
        )
    }

    private static func occultation(
        _ forecast:
            LocalLunarOccultationCircumstancesV1,
        contact:
            LunarOccultationContactV1,
        phaseLabel: String
    ) -> Self {
        let moon = contact.moon
        guard validRadius(
            moon.angularRadiusRadians
        ) else {
            return unavailable(
                systemImage: "moon.circle",
                phaseLabel: phaseLabel
            )
        }

        let horizontalOffset =
            EventSceneGeometryV1
            .tangentOffset(
                reference: moon.horizontal,
                target:
                    contact.targetHorizontal
            )
        let fallbackSeparation =
            contact.phase == .maximum
            ? max(
                0,
                moon.angularRadiusRadians
                    + forecast
                    .minimumClearanceRadians
            )
            : moon.angularRadiusRadians
        let offset =
            horizontalOffset
            ?? contact
            .positionAngleRadians
            .flatMap {
                EventSceneGeometryV1
                    .tangentOffset(
                        separationRadians:
                            fallbackSeparation,
                        positionAngleRadians: $0
                    )
            }
        guard let offset else {
            return unavailable(
                systemImage: "moon.circle",
                phaseLabel: phaseLabel
            )
        }

        let clearance =
            offset.separationRadians
            - moon.angularRadiusRadians
        let targetState =
            OccultationSceneTargetState.resolve(
                phase: contact.phase,
                grazing: forecast.grazing,
                clearanceRadians: clearance
            )
        let summary =
            "恒星掩蔽の\(phaseLabel)です。"
            + forecast.target.label
            + "の予測方向は月中心から"
            + EventSceneFormatting
                .relativeDirection(offset)
            + "、中心間隔は"
            + EventSceneFormatting
                .angle(
                    offset.separationRadians
                )
            + "です。この時刻の平均月縁からのクリアランスは"
            + EventSceneFormatting
                .signedAngle(
                    clearance
                )
            + "です。"
            + targetState.accessibilitySummary

        return Self(
            content: .occultation(
                OccultationEventScene(
                    moonRadius:
                        moon.angularRadiusRadians,
                    targetOffset: offset,
                    targetState: targetState
                )
            ),
            systemImage: "moon.circle",
            fidelityLabel:
                targetState
                    == .uncertainBoundary
                ? "名目計算"
                : "計算結果",
            axisLabel:
                offset.orientationIsDefined
                ? "上：高度が高い　右：方位角が増える"
                : "相対方向の軸は未定義",
            legend:
                "円：平均月縁　星印："
                + forecast.target.label
                + targetState.legendSuffix,
            explanation:
                targetState.explanation(
                    phaseLabel: phaseLabel
                ),
            accessibilitySummary: summary,
            accessibilityHint:
                targetState.accessibilityHint,
            isSchematic: false
        )
    }

    private static func unavailable(
        systemImage: String,
        phaseLabel: String
    ) -> Self {
        Self(
            content: .unavailable,
            systemImage: systemImage,
            fidelityLabel: "データ不足",
            axisLabel: "",
            legend: "相対配置を作成できません。",
            explanation:
                "\(phaseLabel)の中心座標または角半径が不足しているため、図を表示できません。",
            accessibilitySummary:
                "\(phaseLabel)の相対配置データを表示できません。",
            accessibilityHint:
                "数値は予報の測定欄で確認してください。",
            isSchematic: true
        )
    }

    private static func validRadius(
        _ radius: Double
    ) -> Bool {
        radius.isFinite && radius > 0
    }
}

private extension OccultationSceneTargetState {
    var canvasLabel: String {
        switch self {
        case .atMeanLimb:
            "接触方向"
        case .insideMeanLimb:
            "恒星方向"
        case .outsideMeanLimb:
            "恒星"
        case .uncertainBoundary:
            "境界帯内の方向"
        }
    }

    var markerDash: [CGFloat] {
        switch self {
        case .insideMeanLimb:
            [2, 2]
        case .uncertainBoundary:
            [6, 3]
        case .atMeanLimb, .outsideMeanLimb:
            []
        }
    }

    var legendSuffix: String {
        switch self {
        case .atMeanLimb:
            "の平均月縁との接触方向"
        case .insideMeanLimb:
            "の月に隠された名目方向"
        case .outsideMeanLimb:
            "の予測方向"
        case .uncertainBoundary:
            "の発生未確定な名目方向"
        }
    }

    var accessibilitySummary: String {
        switch self {
        case .atMeanLimb:
            "平均月縁との計算上の接触です。"
        case .insideMeanLimb:
            "平均月縁の内側です。"
        case .outsideMeanLimb:
            "平均月縁の外側です。"
        case .uncertainBoundary:
            "平均月縁の物理境界帯内で、掩蔽の発生は未確定です。"
        }
    }

    var accessibilityHint: String {
        switch self {
        case .atMeanLimb:
            "星印は平均月縁との計算上の接触方向を示します。"
        case .insideMeanLimb:
            "星印は平均月縁の内側にある恒星の名目方向を示します。"
        case .outsideMeanLimb:
            "星印は恒星の予測方向を示します。"
        case .uncertainBoundary:
            "星印は物理境界帯内の名目方向で、掩蔽の発生を断定しません。"
        }
    }

    func explanation(
        phaseLabel: String
    ) -> String {
        let prefix =
            "\(phaseLabel)の月と恒星方向を同じ角尺度で投影しています。"
        switch self {
        case .atMeanLimb:
            return prefix
                + "星印は平均月縁との計算上の接触方向です。数値残差の符号で内側・外側を判定していません。月面地形による接触時刻の差は再現しません。"
        case .insideMeanLimb:
            return prefix
                + "星印は月の手前に見える星ではなく、平均月縁の内側にある名目方向です。月縁は平均球面です。"
        case .outsideMeanLimb:
            return prefix
                + "月縁は平均球面で、月面地形による接触時刻の差は再現しません。"
        case .uncertainBoundary:
            return prefix
                + "星印は物理境界帯内の名目方向で、月に隠れたことを断定しません。月面地形などを含む不確かさのため、掩蔽の発生は未確定です。"
        }
    }
}

private enum EventSceneFormatting {
    static func angle(_ radians: Double) -> String {
        let arcseconds =
            abs(radians)
            * 180
            / Double.pi
            * 3_600
        if arcseconds < 60 {
            return String(
                format: "%.2f秒角",
                arcseconds
            )
        }
        return String(
            format: "%.2f分角",
            arcseconds / 60
        )
    }

    static func signedAngle(
        _ radians: Double
    ) -> String {
        let sign = radians >= 0 ? "+" : "−"
        return sign + angle(radians)
    }

    static func magnitude(
        _ magnitude: Double,
        penumbral: Bool
    ) -> String {
        String(
            format:
                penumbral
                ? "半影食分%.3f"
                : "本影食分%.3f",
            magnitude
        )
    }

    static func relativeDirection(
        _ offset: EventSceneTangentOffsetV1,
        northLabel: String = "上",
        eastLabel: String = "右"
    ) -> String {
        guard
            offset.separationRadians
                > 0.01
                * Double.pi
                / (180 * 3_600)
        else {
            return "ほぼ同じ方向"
        }

        let horizontal: String
        if abs(offset.eastwardRadians)
            < offset.separationRadians * 0.20
        {
            horizontal = ""
        } else {
            horizontal =
                offset.eastwardRadians > 0
                ? eastLabel
                : opposite(eastLabel)
        }

        let vertical: String
        if abs(offset.upwardRadians)
            < offset.separationRadians * 0.20
        {
            vertical = ""
        } else {
            vertical =
                offset.upwardRadians > 0
                ? northLabel
                : opposite(northLabel)
        }

        let direction =
            directionName(
                vertical: vertical,
                horizontal: horizontal,
                usesCelestialLabels:
                    northLabel == "天の北"
                    && eastLabel == "天の東"
            )
        return direction
    }

    static func normalizedRadians(
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

    private static func directionName(
        vertical: String,
        horizontal: String,
        usesCelestialLabels: Bool
    ) -> String {
        if usesCelestialLabels {
            switch (vertical, horizontal) {
            case ("天の北", "天の東"):
                return "天の北東方向"
            case ("天の北", "天の西"):
                return "天の北西方向"
            case ("天の南", "天の東"):
                return "天の南東方向"
            case ("天の南", "天の西"):
                return "天の南西方向"
            case let (vertical, ""):
                return vertical + "方向"
            case let ("", horizontal):
                return horizontal + "方向"
            default:
                return "ほぼ同じ方向"
            }
        }

        switch (vertical, horizontal) {
        case ("上", "右"):
            return "右上方向"
        case ("上", "左"):
            return "左上方向"
        case ("下", "右"):
            return "右下方向"
        case ("下", "左"):
            return "左下方向"
        case let (vertical, ""):
            return vertical + "方向"
        case let ("", horizontal):
            return horizontal + "方向"
        default:
            return "ほぼ同じ方向"
        }
    }

    private static func opposite(
        _ direction: String
    ) -> String {
        switch direction {
        case "上":
            "下"
        case "右":
            "左"
        case "天の北":
            "天の南"
        case "天の東":
            "天の西"
        default:
            direction
        }
    }
}
