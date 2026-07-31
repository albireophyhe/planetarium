import Accessibility
import PlanetariumCore
import SwiftUI

struct SkyWorkspaceView: View {
    @Bindable var store: SkyStore
    @Bindable var eventStore: EventForecastStore
    let contextFocusRequest: Int
    let onShowEvents: () -> Void
    @Environment(\.accessibilityReduceMotion)
    private var accessibilityReduceMotion
    @AccessibilityFocusState
    private var restoreActionAccessibilityFocused: Bool
    @AccessibilityFocusState
    private var workspaceHeadingAccessibilityFocused: Bool
    @State private var handledContextFocusRequest = 0

    var body: some View {
        workspaceContent
            .onAppear {
                store.setReduceMotion(
                    accessibilityReduceMotion
                )
                applyContextFocusRequest()
            }
            .onChange(of: accessibilityReduceMotion) {
                store.setReduceMotion(
                    accessibilityReduceMotion
                )
            }
            .onChange(of: contextFocusRequest) {
                applyContextFocusRequest()
            }
    }

    private var workspaceContent: some View {
        VStack(spacing: 0) {
            header

            if eventStore.canRestoreObservationDate {
                eventTimeRestoreBar
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
            }

            if let errorMessage = store.errorMessage {
                MessageBanner(
                    text: errorMessage,
                    systemImage: "exclamationmark.triangle.fill",
                    color: .orange,
                    actionTitle: store.canRetryCatalogData
                        ? "星表を再読み込み"
                        : nil,
                    action: {
                        store.retryCatalogData()
                    }
                ) {
                    store.errorMessage = nil
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
            } else if let statusMessage = store.statusMessage {
                MessageBanner(
                    text: statusMessage,
                    systemImage: "checkmark.circle.fill",
                    color: store.nightMode ? .red : .blue
                ) {
                    store.statusMessage = nil
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
            }

            Group {
                switch store.skyDisplayMode {
                case .chart2D:
                    SkyChartView(store: store)
                case .sphere3D:
                    CelestialSphereView(store: store)
                }
            }
                .padding(.horizontal, 24)
                .padding(.vertical, 10)

            if store.skyDisplayMode == .sphere3D {
                sphereControls
                    .padding(.horizontal, 20)
                    .padding(.bottom, 10)
            }

            timeControls
                .padding(.horizontal, 20)
                .padding(.bottom, 16)
        }
        .navigationTitle("Planetarium")
        .accessibilityIdentifier("sky.workspace")
        .background(
            store.nightMode
                ? Color(red: 0.055, green: 0.018, blue: 0.018)
                : Color(red: 0.018, green: 0.045, blue: 0.088)
        )
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text("Planetarium")
                        .font(SkyTypography.brand)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityFocused(
                            $workspaceHeadingAccessibilityFocused
                        )
                    Text(store.sunState.phase.nameJa)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            store.nightMode ? Color.red.opacity(0.22) : Color.blue.opacity(0.18),
                            in: Capsule()
                        )
                        .accessibilityLabel("空の状態 \(store.sunState.phase.nameJa)")
                }

                Text("\(store.location.name) · \(store.observationDateText)")
                    .font(SkyTypography.time)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Text(store.timeZoneText)
                    .font(SkyTypography.dataCaption)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)

                if let warning =
                    store.timeScaleAssumptionSummary
                {
                    Label(
                        warning,
                        systemImage: "clock.badge.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .lineLimit(2)
                    .help(
                        store.timeScaleAssumptionDetail
                            ?? warning
                    )
                    .accessibilityLabel("時刻系の警告。\(warning)")
                }

                Label(
                    calculationStatusPresentation.summary,
                    systemImage:
                        calculationStatusPresentation.systemImage
                )
                .font(SkyTypography.dataCaption)
                .foregroundStyle(
                    calculationStatusPresentation.isWarning
                        ? Color.orange
                        : Color.secondary
                )
                .lineLimit(
                    calculationStatusPresentation.isWarning
                        ? 2
                        : 1
                )
                .help(calculationStatusDetail)
                .accessibilityLabel(
                    "計算状態。"
                        + calculationStatusPresentation.summary
                )
                .accessibilityHint(store.dut1StatusDetail)
            }

            Spacer(minLength: 12)

            VStack(alignment: .trailing, spacing: 3) {
                Picker("星図表示", selection: displayModeBinding) {
                    ForEach(SkyDisplayMode.allCases, id: \.self) { mode in
                        Label(mode.title, systemImage: mode.systemImage)
                            .tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(width: 138)
                .accessibilityLabel("星図表示")
                .help("2D星図と3D天球を切り替え")

                Text("太陽高度")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(SkyFormatting.degrees(store.sunState.horizontal.altitude))
                    .font(SkyTypography.dataEmphasis)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
        .padding(.bottom, 10)
    }

    private var calculationStatusPresentation:
        SkyWorkspaceCalculationStatusPresentation
    {
        let earthOrientationStatus:
            SkyWorkspaceCalculationStatusPresentation
                .EarthOrientationStatus

        if let dut1Source =
            store.currentDUT1Estimate?.source,
            let polarMotionSource =
                store.currentPolarMotionEstimate?.source
        {
            switch (
                dut1Source == .observed,
                polarMotionSource == .observed
            ) {
            case (true, true):
                earthOrientationStatus = .observed
            case (false, false):
                earthOrientationStatus = .predicted
            default:
                earthOrientationStatus = .mixed
            }
        } else if store.currentEarthOrientationApplicationFailure
            != nil
        {
            earthOrientationStatus = .applicationFailure
        } else if store.iersEarthOrientationLoadFailure != nil
            || store.currentEarthOrientationLookupFailure != nil
        {
            earthOrientationStatus = .readFailure
        } else if store.isIERSEarthOrientationDataLoaded {
            earthOrientationStatus = .outsideCoverage
        } else {
            earthOrientationStatus = .preparing
        }

        return SkyWorkspaceCalculationStatusPresentation(
            refractionSource:
                store.atmosphericRefractionInputSource,
            earthOrientationStatus: earthOrientationStatus
        )
    }

    private var calculationStatusDetail: String {
        [
            "精密モデルv2",
            "大気差：\(store.pointingRefractionDescription)",
            store.dut1StatusDetail,
            store.polarMotionStatusDetail,
        ]
        .joined(separator: "\n")
    }

    private var timeControls: some View {
        VStack(spacing: 10) {
            if store.showSelectedStarTrajectory {
                SelectedStarTrajectoryLegendView(store: store)
            }

            ViewThatFits(in: .horizontal) {
                expandedTimeActionRow
                compactTimeActionRows
            }

            HStack(spacing: 6) {
                Image(systemName: "info.circle")
                Text(visibilityExplanation)
                    .lineLimit(2)
                Spacer()
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }

    private var eventTimeRestoreBar: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                eventTimeContextLabel

                Spacer(minLength: 12)

                eventTimeContextActions
            }

            VStack(alignment: .leading, spacing: 8) {
                eventTimeContextLabel
                eventTimeContextActions
            }
        }
        .padding(10)
        .background(
            .ultraThinMaterial,
            in: RoundedRectangle(cornerRadius: 9)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 9)
                .stroke(
                    (store.nightMode ? Color.red : Color.blue)
                        .opacity(0.45),
                    lineWidth: 1
                )
        }
        .accessibilityElement(children: .contain)
    }

    private var eventTimeContextLabel: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(
                    eventStore.skyContext?.eventTitle
                        ?? "天文現象"
                )
                .font(.callout.weight(.semibold))
                .lineLimit(2)

                Text(eventTimeContextDateText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: "clock.badge.checkmark")
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(eventStore.skyContext?.eventTitle ?? "天文現象")。"
                + eventTimeContextDateText
        )
        .accessibilityIdentifier(
            "sky.eventObservationContext"
        )
    }

    private var eventTimeContextActions: some View {
        HStack(spacing: 8) {
            Button {
                onShowEvents()
            } label: {
                Label(
                    "現象へ戻る",
                    systemImage: "calendar.badge.clock"
                )
            }
            .accessibilityHint(
                "選択した現象の詳細へ戻ります"
            )
            .accessibilityIdentifier(
                "sky.showEventWorkspace"
            )

            Button {
                restoreEventObservationDate()
            } label: {
                Label(
                    "元の観測日時へ戻す",
                    systemImage: "arrow.uturn.backward"
                )
            }
            .accessibilityIdentifier(
                "sky.restoreEventObservationDate"
            )
            .accessibilityFocused(
                $restoreActionAccessibilityFocused
            )
            .accessibilityHint(
                "現象を表示する前の観測日時へ戻します"
            )
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    private var eventTimeContextDateText: String {
        let date =
            eventStore.skyContext?.eventDate
            ?? store.observationDate
        return "現象時刻 " + SkyFormatting.dateTime(
            date,
            timeZoneIdentifier:
                store.location.timeZoneIdentifier
        )
    }

    private var expandedTimeActionRow: some View {
        HStack(spacing: 8) {
            timeActionButton(
                title: "−1時間",
                systemImage: "minus",
                compact: false
            ) {
                store.addHours(-1)
            }

            timeActionButton(
                title: "いま",
                systemImage: "clock.arrow.circlepath",
                compact: false,
                prominent: true
            ) {
                store.useCurrentTime()
            }

            timeActionButton(
                title: "＋1時間",
                systemImage: "plus",
                compact: false
            ) {
                store.addHours(1)
            }

            Divider()
                .frame(height: 22)

            PlaybackControlsView(store: store, compact: false)

            Spacer(minLength: 6)

            timeActionButton(
                title: "表示をリセット",
                systemImage: "arrow.counterclockwise",
                compact: true
            ) {
                store.resetDisplay()
            }
        }
        .controlSize(.large)
    }

    private var compactTimeActionRows: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                timeActionButton(
                    title: "−1時間",
                    systemImage: "minus",
                    compact: true
                ) {
                    store.addHours(-1)
                }
                timeActionButton(
                    title: "いま",
                    systemImage: "clock.arrow.circlepath",
                    compact: false,
                    prominent: true
                ) {
                    store.useCurrentTime()
                }
                timeActionButton(
                    title: "＋1時間",
                    systemImage: "plus",
                    compact: true
                ) {
                    store.addHours(1)
                }
                Spacer()
                timeActionButton(
                    title: "表示をリセット",
                    systemImage: "arrow.counterclockwise",
                    compact: true
                ) {
                    store.resetDisplay()
                }
            }

            PlaybackControlsView(store: store, compact: true)
        }
        .controlSize(.large)
    }

    private var sphereControls: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                sphereInteractionLabel(
                    "ドラッグ・ピンチまたはボタンで3D天球を操作"
                )

                Spacer()

                sphereRotationControls
                sphereZoomControls
                sphereZoomLabel
            }

            VStack(spacing: 6) {
                HStack {
                    sphereInteractionLabel("3D天球の操作")
                    Spacer()
                    sphereZoomLabel
                }
                HStack(spacing: 8) {
                    sphereRotationControls
                    Spacer(minLength: 4)
                    sphereZoomControls
                }
            }
        }
    }

    private func sphereInteractionLabel(
        _ title: String
    ) -> some View {
        Label(title, systemImage: "move.3d")
            .lineLimit(1)
            .help("ドラッグまたは矢印で回転し、ピンチまたは＋／−で拡大縮小")
            .accessibilityLabel(
                "3D天球。ドラッグまたは矢印で回転し、ピンチまたは拡大縮小ボタンで倍率を変更"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
    }

    private var sphereRotationControls: some View {
        ControlGroup {
            sphereControlButton(
                title: "左へ回転",
                systemImage: "arrow.left"
            ) {
                store.nudgeSphere(
                    horizontalDegrees: -10,
                    verticalDegrees: 0
                )
            }
            sphereControlButton(
                title: "上へ回転",
                systemImage: "arrow.up"
            ) {
                store.nudgeSphere(
                    horizontalDegrees: 0,
                    verticalDegrees: -10
                )
            }
            sphereControlButton(
                title: "下へ回転",
                systemImage: "arrow.down"
            ) {
                store.nudgeSphere(
                    horizontalDegrees: 0,
                    verticalDegrees: 10
                )
            }
            sphereControlButton(
                title: "右へ回転",
                systemImage: "arrow.right"
            ) {
                store.nudgeSphere(
                    horizontalDegrees: 10,
                    verticalDegrees: 0
                )
            }
            sphereControlButton(
                title: "3D天球の向きと倍率をリセット",
                systemImage: "view.3d"
            ) {
                store.resetSphereView()
            }
        }
        .controlSize(.small)
    }

    private var sphereZoomControls: some View {
        ControlGroup {
            sphereControlButton(
                title: "3D天球を縮小",
                systemImage: "minus"
            ) {
                store.nudgeSphereZoom(steps: -1)
            }
            .disabled(!store.canZoomSphereOut)

            sphereControlButton(
                title: "3D天球を拡大",
                systemImage: "plus"
            ) {
                store.nudgeSphereZoom(steps: 1)
            }
            .disabled(!store.canZoomSphereIn)
        }
        .controlSize(.small)
    }

    private var sphereZoomLabel: some View {
        let percentage = Int((store.sphereZoom * 100).rounded())
        return Text("\(percentage)%")
            .monospacedDigit()
            .frame(minWidth: 38, alignment: .trailing)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("3D天球の倍率")
            .accessibilityValue("\(percentage)パーセント")
            .font(.caption)
            .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private func timeActionButton(
        title: String,
        systemImage: String,
        compact: Bool,
        prominent: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        let button = Button(action: action) {
            if compact {
                Image(systemName: systemImage)
            } else {
                Label(title, systemImage: systemImage)
            }
        }
        .accessibilityLabel(title)
        .help(title)

        if prominent {
            button.buttonStyle(.borderedProminent)
        } else {
            button.buttonStyle(.bordered)
        }
    }

    private func sphereControlButton(
        title: String,
        systemImage: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(title, systemImage: systemImage, action: action)
            .labelStyle(.iconOnly)
            .help(title)
            .accessibilityLabel(title)
    }

    private var displayModeBinding: Binding<SkyDisplayMode> {
        Binding(
            get: { store.skyDisplayMode },
            set: { store.setSkyDisplayMode($0) }
        )
    }

    private var visibilityExplanation: String {
        switch store.skyDisplayMode {
        case .chart2D:
            "地平線上の星を表示しています。幾何学的な高度であり、肉眼で見えることを保証しません。"
        case .sphere3D:
            "3Dでは地平線下の星を控えめに表示します。明るさは肉眼で見えることを保証しません。"
        }
    }

    private func restoreEventObservationDate() {
        eventStore.restoreSkyDate(skyStore: store)
        Task { @MainActor in
            restoreActionAccessibilityFocused = false
            workspaceHeadingAccessibilityFocused = true
            AccessibilityNotification
                .Announcement(
                    EventForecastAccessibility
                        .restoredObservationTimeAnnouncement
                )
                .post()
        }
    }

    private func applyContextFocusRequest() {
        guard contextFocusRequest
            > handledContextFocusRequest
        else {
            return
        }
        handledContextFocusRequest =
            contextFocusRequest
        Task { @MainActor in
            if eventStore.canRestoreObservationDate {
                workspaceHeadingAccessibilityFocused = false
                restoreActionAccessibilityFocused = true
            } else {
                restoreActionAccessibilityFocused = false
                workspaceHeadingAccessibilityFocused = true
            }
        }
    }

}

struct SkyWorkspaceCalculationStatusPresentation:
    Equatable
{
    enum EarthOrientationStatus: Equatable {
        case observed
        case predicted
        case mixed
        case preparing
        case readFailure
        case outsideCoverage
        case applicationFailure
    }

    let summary: String
    let systemImage: String
    let isWarning: Bool

    init(
        refractionSource: AtmosphericRefractionInputSource?,
        earthOrientationStatus: EarthOrientationStatus
    ) {
        let refractionSummary = switch refractionSource {
        case .standard:
            "標準大気差"
        case .manual:
            "手動大気差"
        case nil:
            "大気差なし"
        }
        let earthOrientationSummary =
            switch earthOrientationStatus {
            case .observed:
                "IERS観測値"
            case .predicted:
                "IERS予測値"
            case .mixed:
                "IERS観測・予測値"
            case .preparing:
                "IERS EOP準備中（0近似）"
            case .readFailure:
                "IERS EOP読込失敗（0近似）"
            case .outsideCoverage:
                "IERS EOP収録範囲外（0近似）"
            case .applicationFailure:
                "IERS EOP適用失敗（0近似）"
            }

        summary =
            "精密計算・\(refractionSummary)・"
            + earthOrientationSummary
        systemImage = switch earthOrientationStatus {
        case .observed:
            "checkmark.circle"
        case .predicted, .mixed:
            "clock.badge.exclamationmark"
        case .preparing:
            "clock.arrow.circlepath"
        case .readFailure,
             .outsideCoverage,
             .applicationFailure:
            "exclamationmark.triangle"
        }
        isWarning = switch earthOrientationStatus {
        case .observed, .predicted, .mixed:
            false
        case .preparing,
             .readFailure,
             .outsideCoverage,
             .applicationFailure:
            true
        }
    }
}

private struct MessageBanner: View {
    let text: String
    let systemImage: String
    let color: Color
    var actionTitle: String?
    var action: (() -> Void)?
    let dismiss: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .foregroundStyle(color)
            Text(text)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
            Spacer()
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
            Button("閉じる", systemImage: "xmark", action: dismiss)
                .labelStyle(.iconOnly)
                .buttonStyle(.plain)
                .help("メッセージを閉じる")
        }
        .padding(10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 9))
        .overlay(
            RoundedRectangle(cornerRadius: 9)
                .stroke(color.opacity(0.45), lineWidth: 1)
        )
    }
}
