import SwiftUI

struct SelectedStarTrajectoryLegendView: View {
    let store: SkyStore
    @Environment(\.colorSchemeContrast)
    private var colorSchemeContrast

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                Label(
                    "選択星の軌跡",
                    systemImage:
                        "point.topleft.down.to.point.bottomright.curvepath"
                )
                .font(.caption.weight(.semibold))
                trajectoryKey
                Spacer(minLength: 8)
                Text(rangeText)
                    .lineLimit(1)
            }

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Label(
                        "選択星の軌跡",
                        systemImage:
                            "point.topleft.down.to.point.bottomright.curvepath"
                    )
                    .font(.caption.weight(.semibold))
                    Spacer(minLength: 4)
                    trajectoryKey
                }
                Text(rangeText)
                    .lineLimit(2)
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(.black.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
        .accessibilityHidden(true)
    }

    private var trajectoryKey: some View {
        HStack(spacing: 5) {
            marker(label: "過去", progress: 0, diameter: 4)
            Image(systemName: "arrow.right")
                .font(.caption2)
            marker(label: "現在", progress: 0.5, diameter: 7)
            Image(systemName: "arrow.right")
                .font(.caption2)
            marker(label: "未来", progress: 1, diameter: 10)
        }
    }

    private func marker(
        label: String,
        progress: Double,
        diameter: CGFloat
    ) -> some View {
        HStack(spacing: 3) {
            Circle()
                .fill(markerColor(progress: progress))
                .frame(
                    width:
                        diameter
                        + (increasedContrast ? 2 : 0),
                    height:
                        diameter
                        + (increasedContrast ? 2 : 0)
                )
                .overlay {
                    if increasedContrast {
                        Circle().stroke(.white, lineWidth: 0.8)
                    }
                }
            Text(label)
        }
    }

    private func markerColor(progress: Double) -> Color {
        switch store.skyDisplayMode {
        case .chart2D:
            StarTrajectoryStyle.twoDColor(
                nightMode: store.nightMode
            ).opacity(
                StarTrajectoryStyle.twoDPointOpacity(
                    progress: progress,
                    nightMode: store.nightMode,
                    increasedContrast: increasedContrast
                )
            )
        case .sphere3D:
            StarTrajectoryStyle.threeDColor(
                progress: progress,
                nightMode: store.nightMode
            )
        }
    }

    var rangeText: String {
        let baseText: String
        if store.selectedStar == nil {
            baseText =
                "星を選ぶと前後3時間を表示します"
        } else if store.selectedStarTrajectory.isEmpty {
            baseText = "軌跡を準備できませんでした"
        } else if store.selectedStarTrajectoryIsTruncated {
            baseText =
                "対応期間の境界で短縮 · "
                + "\(store.selectedStarTrajectory.count)点"
        } else {
            baseText =
                "−3時間 → 現在 → ＋3時間 · "
                + "\(store.selectedStarTrajectory.count)点"
        }
        guard
            let warning =
                store
                .selectedStarTrajectoryEarthOrientationProvenance?
                .warning
        else {
            return baseText
        }
        return baseText + " · " + warning.shortText
    }

    private var increasedContrast: Bool {
        colorSchemeContrast == .increased
    }
}
