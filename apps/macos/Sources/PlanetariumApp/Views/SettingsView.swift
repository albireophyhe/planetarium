import SwiftUI

struct SettingsView: View {
    @Bindable var store: SkyStore
    @State private var didClearSavedDisplay = false
    @State private var isAtmosphereEditorPresented = false

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
                        "大気差",
                        isOn: $store.useStandardAtmosphericRefraction
                    )
                    LabeledContent(
                        "現在",
                        value:
                            store
                            .atmosphericRefractionSummary
                    )
                    Button("大気差を詳しく設定…") {
                        isAtmosphereEditorPresented = true
                    }
                    Text("OFFでは真空中の幾何高度を表示します。ONへ切り替えた場合は標準大気を使います。「詳しく設定」では、手動値、または気象庁の最寄り局実測（Open-Meteoモデルfallback）を、このセッションだけに適用できます。")
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

                    Text("保存するのは、星座線、星の名前、選択星の軌跡、ナイトモード、大気差ON/OFFの5項目です。手動入力または現在気象から取得した値は保存せず、次回起動時にONなら標準大気へ戻します。地点、正確な位置座標、日時、検索語、選択した星は保存しません。初期地点は東京です。")
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
        .sheet(
            isPresented:
                $isAtmosphereEditorPresented
        ) {
            AtmosphericRefractionEditorView(
                store: store
            )
        }
    }
}
