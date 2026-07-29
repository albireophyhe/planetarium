import SwiftUI

struct SettingsView: View {
    @Bindable var store: SkyStore
    @State private var didClearSavedDisplay = false

    var body: some View {
        TabView {
            Form {
                Section("表示") {
                    Toggle("星座線", isOn: $store.showConstellations)
                    Toggle("星の名前", isOn: $store.showNames)
                    Toggle(
                        "選択星の軌跡（±3時間）",
                        isOn: $store.showSelectedStarTrajectory
                    )
                    Toggle("ナイトモード", isOn: $store.nightMode)
                    Toggle(
                        "標準大気差（高度5°以上）",
                        isOn: $store.useStandardAtmosphericRefraction
                    )
                    Text("OFFでは真空中の幾何高度を表示します。ONでは気圧1013.25 hPa・気温10°C・相対湿度50%・波長0.55 µmを仮定し、幾何高度5°以上だけを観測高度へ補正します。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("選択星の軌跡は既定OFFです。ONでは選択した1星だけを前後3時間、30分間隔、最大13点で計算します。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("保存データ") {
                    Button("保存した表示設定を消去", role: .destructive) {
                        store.clearSavedDisplayPreferences()
                        didClearSavedDisplay = true
                    }

                    if didClearSavedDisplay {
                        Label("保存した表示設定を消去しました", systemImage: "checkmark.circle")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Text("保存するのは、星座線、星の名前、選択星の軌跡、ナイトモード、標準大気差の5項目です。地点、正確な位置座標、日時、検索語、選択した星は保存しません。初期地点は東京です。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .formStyle(.grouped)
            .tabItem {
                Label("一般", systemImage: "gearshape")
            }
        }
        .frame(width: 500, height: 400)
        .scenePadding()
    }
}
