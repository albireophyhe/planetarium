import SwiftUI

enum PlanetariumSidebarMode: String, CaseIterable {
    case stars
    case events

    var title: String {
        switch self {
        case .stars:
            "恒星"
        case .events:
            "現象予報"
        }
    }
}

struct PlanetariumSidebarView: View {
    @Bindable var skyStore: SkyStore
    @Bindable var eventStore: EventForecastStore
    @Binding var mode: PlanetariumSidebarMode

    var body: some View {
        VStack(spacing: 0) {
            Picker("サイドバーの内容", selection: $mode) {
                Text("恒星")
                    .tag(PlanetariumSidebarMode.stars)
                Text("現象")
                    .tag(PlanetariumSidebarMode.events)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .accessibilityLabel("サイドバーの内容")
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Divider()

            switch mode {
            case .stars:
                StarSidebarView(store: skyStore)
            case .events:
                EventForecastSidebarView(
                    skyStore: skyStore,
                    eventStore: eventStore
                )
            }
        }
        .navigationTitle(mode.title)
    }
}
