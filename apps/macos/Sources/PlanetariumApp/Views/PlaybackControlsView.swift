import PlanetariumCore
import SwiftUI

struct PlaybackControlsView: View {
    @Bindable var store: SkyStore
    let compact: Bool

    var body: some View {
        HStack(spacing: 8) {
            Picker("再生方向", selection: directionBinding) {
                Label("逆方向", systemImage: "backward.fill")
                    .labelStyle(.iconOnly)
                    .accessibilityLabel("逆方向")
                    .tag(PlaybackDirection.backward)
                Label("順方向", systemImage: "forward.fill")
                    .labelStyle(.iconOnly)
                    .accessibilityLabel("順方向")
                    .tag(PlaybackDirection.forward)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 76)
            .accessibilityLabel("時間の再生方向")
            .help("時間を進める向きを選択")

            Button {
                store.togglePlayback()
            } label: {
                if compact {
                    Image(
                        systemName: store.isPlaybackPlaying
                            ? "pause.fill"
                            : "play.fill"
                    )
                } else {
                    Label(
                        store.isPlaybackPlaying ? "停止" : "再生",
                        systemImage: store.isPlaybackPlaying
                            ? "pause.fill"
                            : "play.fill"
                    )
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.playbackMotionMode == .staticFrame)
            .accessibilityLabel(store.isPlaybackPlaying ? "時間再生を停止" : "時間再生を開始")
            .help(playbackHelp)

            Menu {
                ForEach(PlaybackSpeedPreset.allCases, id: \.self) { speed in
                    Button {
                        store.setPlaybackSpeed(speed)
                    } label: {
                        if speed == store.playbackSpeed {
                            Label(speed.shortLabel, systemImage: "checkmark")
                        } else {
                            Text(speed.shortLabel)
                        }
                    }
                }
            } label: {
                Label(
                    compact
                        ? store.playbackSpeed.shortLabel
                        : "速度 \(store.playbackSpeed.shortLabel)",
                    systemImage: "speedometer"
                )
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .accessibilityLabel(
                "再生速度 \(store.playbackSpeed.accessibilityLabel)"
            )
            .help("実時間1秒あたりに進める観測時間")

            if store.playbackMotionMode == .staticFrame {
                Label("静止", systemImage: "figure.stand")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .help("macOSの「動きを減らす」が有効です")
            }
        }
    }

    private var directionBinding: Binding<PlaybackDirection> {
        Binding(
            get: { store.playbackDirection },
            set: { store.setPlaybackDirection($0) }
        )
    }

    private var playbackHelp: String {
        if store.playbackMotionMode == .staticFrame {
            return "macOSの「動きを減らす」が有効なため静止しています"
        }
        return store.isPlaybackPlaying ? "時間再生を停止" : "時間再生を開始"
    }
}

extension PlaybackSpeedPreset {
    var shortLabel: String {
        "\(Int(simulatedSecondsPerRealSecond))×"
    }

    var accessibilityLabel: String {
        switch self {
        case .realTime:
            "実時間と同じ速さ"
        case .minutePerSecond:
            "1秒で1分"
        case .tenMinutesPerSecond:
            "1秒で10分"
        case .hourPerSecond:
            "1秒で1時間"
        case .dayPerSecond:
            "1秒で1日"
        }
    }
}
