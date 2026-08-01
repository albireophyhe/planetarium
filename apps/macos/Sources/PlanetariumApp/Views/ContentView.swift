import PlanetariumCore
import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Bindable var store: SkyStore
    @Bindable var eventStore: EventForecastStore
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var selectedFeature: PlanetariumFeature = .sky
    @State private var skyContextFocusRequest = 0
    @State private var eventWorkspaceFocusRouter =
        EventWorkspaceFocusRouter()

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            PlanetariumSidebarView(
                skyStore: store,
                eventStore: eventStore,
                feature: $selectedFeature
            )
                .navigationSplitViewColumnWidth(min: 230, ideal: 280, max: 360)
        } detail: {
            Group {
                switch selectedFeature {
                case .sky:
                    SkyWorkspaceView(
                        store: store,
                        eventStore: eventStore,
                        contextFocusRequest:
                            skyContextFocusRequest,
                        onShowEvents: {
                            selectedFeature = .events
                        }
                    )
                case .events:
                    EventWorkspaceView(
                        skyStore: store,
                        eventStore: eventStore,
                        focusRequest:
                            eventWorkspaceFocusRouter
                            .request,
                        onShowOnSky: {
                            skyContextFocusRequest += 1
                            selectedFeature = .sky
                        },
                        onShowAccuracyInspector: {
                            eventWorkspaceFocusRouter
                                .requestedAccuracyInspector()
                            EventWorkspaceRouting
                                .showAccuracyInspector(
                                    skyStore: store
                                )
                        }
                    )
                }
            }
                .inspector(isPresented: $store.isInspectorPresented) {
                    Group {
                        switch selectedFeature {
                        case .sky:
                            StarInspectorView(store: store)
                        case .events:
                            EventForecastInspectorView(
                                skyStore: store,
                                eventStore: eventStore,
                                focusRequest:
                                    eventWorkspaceFocusRouter
                                    .request
                            )
                        }
                    }
                    .inspectorColumnWidth(
                        min: 270,
                        ideal: 320,
                        max: 390
                    )
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
            if newPhase != .active {
                eventStore
                    .stopScenePlaybackForBackground()
            }
        }
        .onChange(of: selectedFeature) { _, newFeature in
            eventWorkspaceFocusRouter.switched(
                to: newFeature
            )
            switch newFeature {
            case .sky:
                eventStore.deactivate()
            case .events:
                eventStore.activate(
                    location: store.location,
                    observationDate:
                        store.observationDate
                )
                // Keep inspector visibility user-controlled. Presenting it
                // from this segmented Picker callback re-enters AppKit's
                // constraint pass when the change comes from AX Press.
            }
        }
        .onChange(of: store.isInspectorPresented) {
            _, isPresented in
            eventWorkspaceFocusRouter
                .inspectorVisibilityChanged(
                    isPresented: isPresented,
                    selectedFeature: selectedFeature
                )
        }
        .onChange(of: store.location) {
            guard selectedFeature == .events else {
                return
            }
            eventStore.reload(
                location: store.location
            )
        }
        .onDisappear {
            eventStore.deactivate()
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
            .help("現在地を一度だけ取得（この操作では座標を保存・外部送信しません）")
        }
    }

    private var observationDatePicker: some View {
        HStack(spacing: 8) {
            DatePicker(
                "観測日時",
                selection: $store.observationDate,
                in: observationDateRange,
                displayedComponents:
                    [.date, .hourAndMinute]
            )
            .labelsHidden()
            .font(SkyTypography.data)
            .environment(
                \.timeZone,
                TimeZone(
                    identifier:
                        store.location
                        .timeZoneIdentifier
                )
                ?? .current
            )
            .help("観測地点の日時を編集")
            .accessibilityLabel("観測日時")

            Stepper(
                value: observationSecond,
                in: 0 ... 59,
                step: 1
            ) {
                Text(
                    "\(displayedObservationSecond, specifier: "%02d")秒"
                )
                .monospacedDigit()
            }
            .fixedSize()
            .help("観測時刻の秒を1秒単位で編集")
            .accessibilityLabel("観測時刻の秒")
            .accessibilityValue(
                "\(displayedObservationSecond)秒"
            )
        }
    }

    private var displayedObservationSecond: Int {
        var calendar =
            Calendar(identifier: .gregorian)
        calendar.timeZone =
            TimeZone(
                identifier:
                    store.location
                    .timeZoneIdentifier
            )
            ?? TimeZone(secondsFromGMT: 0)!
        return calendar.component(
            .second,
            from: store.observationDate
        )
    }

    private var observationSecond: Binding<Int> {
        Binding(
            get: {
                displayedObservationSecond
            },
            set: { second in
                store.observationDate =
                    ObservationConstraints
                    .settingSecond(
                        second,
                        in:
                            store
                            .observationDate,
                        timeZoneIdentifier:
                            store.location
                            .timeZoneIdentifier
                    )
            }
        )
    }

    private var observationDateRange: ClosedRange<Date> {
        ObservationConstraints.supportedDateRange
    }
}
