import SwiftUI

enum PlanetariumFeature: String, CaseIterable {
    case sky
    case events

    var title: String {
        switch self {
        case .sky:
            "空"
        case .events:
            "現象"
        }
    }

    var systemImage: String {
        switch self {
        case .sky:
            "sparkles"
        case .events:
            "calendar.badge.clock"
        }
    }
}

struct PlanetariumSidebarView: View {
    @Bindable var skyStore: SkyStore
    @Bindable var eventStore: EventForecastStore
    @Binding var feature: PlanetariumFeature

    var body: some View {
        VStack(spacing: 0) {
            Picker("機能", selection: $feature) {
                ForEach(
                    PlanetariumFeature.allCases,
                    id: \.self
                ) { feature in
                    Label(
                        feature.title,
                        systemImage: feature.systemImage
                    )
                    .tag(feature)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .accessibilityLabel("機能")
            .accessibilityHint(
                "空の観察と天文現象の予報を切り替えます"
            )
            .accessibilityIdentifier(
                "planetarium.featurePicker"
            )
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Divider()

            switch feature {
            case .sky:
                StarSidebarView(store: skyStore)
            case .events:
                EventForecastSidebarView(
                    skyStore: skyStore,
                    eventStore: eventStore
                )
            }
        }
        .navigationTitle(feature.title)
    }
}
