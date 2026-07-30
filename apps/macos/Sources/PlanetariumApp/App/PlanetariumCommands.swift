import PlanetariumCore
import SwiftUI

struct PlanetariumCommands: Commands {
    let store: SkyStore

    var body: some Commands {
        CommandMenu("星空") {
            Button("星を検索") {
                store.requestSearchFocus()
            }
            .keyboardShortcut("f", modifiers: .command)

            Button("観測地点を設定…") {
                store.presentLocationEditor()
            }
            .keyboardShortcut("g", modifiers: [.command, .shift])

            Button("前の星を選択") {
                store.selectAdjacentStar(offset: -1)
            }
            .keyboardShortcut(.upArrow, modifiers: [.command, .option])
            .disabled(!store.canSelectPreviousStar)

            Button("次の星を選択") {
                store.selectAdjacentStar(offset: 1)
            }
            .keyboardShortcut(.downArrow, modifiers: [.command, .option])
            .disabled(!store.canSelectNextStar)

            Divider()

            Button("現在時刻へ") {
                store.useCurrentTime()
            }
            .keyboardShortcut("n", modifiers: [.command, .shift])

            Button("1時間戻す") {
                store.addHours(-1)
            }
            .keyboardShortcut(.leftArrow, modifiers: .option)

            Button("1時間進める") {
                store.addHours(1)
            }
            .keyboardShortcut(.rightArrow, modifiers: .option)

            Divider()

            Button(store.isPlaybackPlaying ? "時間再生を停止" : "時間再生を開始") {
                store.togglePlayback()
            }
            .keyboardShortcut(.space, modifiers: .option)
            .disabled(store.playbackMotionMode == .staticFrame)

            Picker(
                "再生方向",
                selection: Binding(
                    get: { store.playbackDirection },
                    set: { store.setPlaybackDirection($0) }
                )
            ) {
                Text("逆方向").tag(PlaybackDirection.backward)
                Text("順方向").tag(PlaybackDirection.forward)
            }

            Picker(
                "再生速度",
                selection: Binding(
                    get: { store.playbackSpeed },
                    set: { store.setPlaybackSpeed($0) }
                )
            ) {
                ForEach(PlaybackSpeedPreset.allCases, id: \.self) { speed in
                    Text(speed.shortLabel).tag(speed)
                }
            }

            Divider()

            Button("2D星図") {
                store.setSkyDisplayMode(.chart2D)
            }
            .keyboardShortcut("1", modifiers: .command)

            Button("3D天球") {
                store.setSkyDisplayMode(.sphere3D)
            }
            .keyboardShortcut("2", modifiers: .command)

            Button("3D天球を左へ回転") {
                store.nudgeSphere(horizontalDegrees: -10, verticalDegrees: 0)
            }
            .keyboardShortcut(
                .leftArrow,
                modifiers: [.command, .control]
            )
            .disabled(store.skyDisplayMode != .sphere3D)

            Button("3D天球を右へ回転") {
                store.nudgeSphere(horizontalDegrees: 10, verticalDegrees: 0)
            }
            .keyboardShortcut(
                .rightArrow,
                modifiers: [.command, .control]
            )
            .disabled(store.skyDisplayMode != .sphere3D)

            Button("3D天球を上へ回転") {
                store.nudgeSphere(horizontalDegrees: 0, verticalDegrees: -10)
            }
            .keyboardShortcut(
                .upArrow,
                modifiers: [.command, .control]
            )
            .disabled(store.skyDisplayMode != .sphere3D)

            Button("3D天球を下へ回転") {
                store.nudgeSphere(horizontalDegrees: 0, verticalDegrees: 10)
            }
            .keyboardShortcut(
                .downArrow,
                modifiers: [.command, .control]
            )
            .disabled(store.skyDisplayMode != .sphere3D)

            Button("3D天球を拡大") {
                store.nudgeSphereZoom(steps: 1)
            }
            .keyboardShortcut("+", modifiers: .command)
            .disabled(
                store.skyDisplayMode != .sphere3D
                    || !store.canZoomSphereIn
            )

            Button("3D天球を縮小") {
                store.nudgeSphereZoom(steps: -1)
            }
            .keyboardShortcut("-", modifiers: .command)
            .disabled(
                store.skyDisplayMode != .sphere3D
                    || !store.canZoomSphereOut
            )

            Button("3D天球の向きと倍率をリセット") {
                store.resetSphereView()
            }
            .keyboardShortcut("0", modifiers: .command)
            .disabled(store.skyDisplayMode != .sphere3D)

            Divider()

            Toggle("一覧を地平線上だけにする", isOn: Binding(
                get: { store.visibleOnly },
                set: { store.visibleOnly = $0 }
            ))
            .keyboardShortcut("h", modifiers: [.command, .shift])

            Toggle("星座線", isOn: Binding(
                get: { store.showConstellations },
                set: { store.showConstellations = $0 }
            ))
            .keyboardShortcut("c", modifiers: [.command, .shift])

            Toggle("星の名前", isOn: Binding(
                get: { store.showNames },
                set: { store.showNames = $0 }
            ))
            .keyboardShortcut("l", modifiers: [.command, .shift])

            Toggle("選択星の軌跡", isOn: Binding(
                get: { store.showSelectedStarTrajectory },
                set: { store.showSelectedStarTrajectory = $0 }
            ))
            .keyboardShortcut("t", modifiers: [.command, .shift])

            Toggle("ナイトモード", isOn: Binding(
                get: { store.nightMode },
                set: { store.nightMode = $0 }
            ))
            .keyboardShortcut("m", modifiers: [.command, .shift])

            Toggle("インスペクタ", isOn: Binding(
                get: { store.isInspectorPresented },
                set: { store.isInspectorPresented = $0 }
            ))
            .keyboardShortcut("i", modifiers: [.command, .option])

            Divider()

            Button("表示をリセット") {
                store.resetDisplay()
            }
            .keyboardShortcut("r", modifiers: [.command, .option])
        }

        CommandGroup(after: .toolbar) {
            Divider()
            Toggle(
                "大気差（ONは標準大気）",
                isOn: Binding(
                    get: {
                        store.useStandardAtmosphericRefraction
                    },
                    set: {
                        store.useStandardAtmosphericRefraction = $0
                    }
                )
            )
        }

        CommandGroup(replacing: .help) {
            Button("Planetarium ヘルプ") {
                store.isHelpPresented = true
            }
            .keyboardShortcut("/", modifiers: [.command, .shift])
        }
    }
}
