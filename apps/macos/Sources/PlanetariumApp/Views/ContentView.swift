import PlanetariumCore
import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Bindable var store: SkyStore
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            StarSidebarView(store: store)
                .navigationSplitViewColumnWidth(min: 230, ideal: 280, max: 360)
        } detail: {
            SkyWorkspaceView(store: store)
                .inspector(isPresented: $store.isInspectorPresented) {
                    StarInspectorView(store: store)
                        .inspectorColumnWidth(min: 270, ideal: 320, max: 390)
                }
        }
        .navigationSplitViewStyle(.balanced)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                locationMenu
                currentLocationButton
                observationDatePicker

                Button {
                    store.isHelpPresented = true
                } label: {
                    Label("ヘルプ", systemImage: "questionmark.circle")
                }
                .help("精度・操作・プライバシーについて")

                SettingsLink {
                    Label("設定", systemImage: "gearshape")
                }
                .help("表示設定と保存データを管理")

                Button {
                    store.isInspectorPresented.toggle()
                } label: {
                    Label("インスペクタ", systemImage: "sidebar.trailing")
                }
                .help("インスペクタを表示／非表示")
            }
        }
        .sheet(isPresented: $store.isHelpPresented) {
            HelpView()
        }
        .sheet(isPresented: $store.isLocationEditorPresented) {
            LocationEditorView(store: store)
        }
        .tint(store.nightMode ? Color(red: 0.88, green: 0.29, blue: 0.29) : .blue)
        .onChange(of: scenePhase) { _, newPhase in
            store.handleScenePhase(newPhase)
        }
    }

    private var locationMenu: some View {
        Menu {
            Section("都市") {
                ForEach(store.cities) { city in
                    Button {
                        store.selectCity(city)
                    } label: {
                        if city.id == store.location.id {
                            Label(city.nameJa, systemImage: "checkmark")
                        } else {
                            Text(city.nameJa)
                        }
                    }
                }
            }

            Divider()

            Button {
                store.presentLocationEditor()
            } label: {
                Label("緯度・経度を入力…", systemImage: "slider.horizontal.3")
            }
        } label: {
            Label(store.location.name, systemImage: "mappin.and.ellipse")
        }
        .help("観測地点を選ぶ")
        .accessibilityLabel("観測地点 \(store.location.name)")
    }

    @ViewBuilder
    private var currentLocationButton: some View {
        if store.isLocating {
            ProgressView()
                .controlSize(.small)
                .help("現在地を確認しています")
        } else {
            Button {
                store.requestCurrentLocation()
            } label: {
                Label("現在地", systemImage: "location")
            }
            .help("現在地を一度だけ取得（座標は保存・送信しません）")
        }
    }

    private var observationDatePicker: some View {
        DatePicker(
            "観測日時",
            selection: $store.observationDate,
            in: observationDateRange,
            displayedComponents: [.date, .hourAndMinute]
        )
        .labelsHidden()
        .font(SkyTypography.data)
        .environment(
            \.timeZone,
            TimeZone(identifier: store.location.timeZoneIdentifier) ?? .current
        )
        .help("観測地点の日時を編集")
        .accessibilityLabel("観測日時")
    }

    private var observationDateRange: ClosedRange<Date> {
        ObservationConstraints.supportedDateRange
    }
}
