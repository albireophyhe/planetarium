import PlanetariumCore
import SwiftUI

struct StarSidebarView: View {
    @Bindable var store: SkyStore
    @FocusState private var searchIsFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            TextField("星を検索", text: $store.searchText)
                .textFieldStyle(.roundedBorder)
                .focused($searchIsFocused)
                .accessibilityLabel("星を検索")
                .padding(.horizontal, 12)
                .padding(.top, 10)

            Picker("一覧の範囲", selection: $store.visibleOnly) {
                Text("地平線上").tag(true)
                Text("すべて").tag(false)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .accessibilityLabel("一覧の範囲")
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            selectedStarNotice

            Divider()

            if store.filteredNamedStars.isEmpty {
                ContentUnavailableView {
                    Label("星が見つかりません", systemImage: "sparkle.magnifyingglass")
                } description: {
                    Text(emptyDescription)
                } actions: {
                    if store.canRetryCatalogData {
                        Button("星表を再読み込み") {
                            store.retryCatalogData()
                        }
                    }
                    if case .hiddenMatches = store.starListEmptyReason {
                        Button("すべて表示") {
                            store.visibleOnly = false
                        }
                    }
                    if !store.searchText.isEmpty {
                        Button("検索を消去") {
                            store.searchText = ""
                        }
                    }
                }
            } else {
                List(selection: sidebarSelection) {
                    ForEach(store.filteredNamedStars) { star in
                        StarRow(star: star)
                            .tag(star.hr)
                    }
                }
                .listStyle(.sidebar)
            }
        }
        .navigationTitle("星を探す")
        .onChange(of: store.searchFocusRequest) {
            searchIsFocused = true
        }
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 6) {
                Image(systemName: "circle.dashed")
                Text("地平線上 \(store.visibleStarCount.formatted()) 星")
                Spacer()
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.bar)
        }
    }

    @ViewBuilder
    private var selectedStarNotice: some View {
        if let exclusion = store.selectedStarListExclusion,
           let star = store.selectedStar
        {
            VStack(alignment: .leading, spacing: 6) {
                Label {
                    Text(
                        "選択中：\(displayName(for: star))"
                            + "（現在は\(exclusionText(exclusion))）"
                    )
                    .fixedSize(
                        horizontal: false,
                        vertical: true
                    )
                } icon: {
                    Image(systemName: "scope")
                }
                .font(.caption.weight(.semibold))

                Button("一覧に表示") {
                    store.revealSelectedStarInList()
                }
                .buttonStyle(.link)
                .controlSize(.small)
                .accessibilityHint(
                    "検索を消去して一覧を「すべて」に切り替え、選択を維持します"
                )
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var sidebarSelection: Binding<Int?> {
        Binding(
            get: {
                guard let selectedStarHR = store.selectedStarHR,
                      store.filteredNamedStars.contains(
                          where: { $0.hr == selectedStarHR }
                      )
                else {
                    return nil
                }
                return selectedStarHR
            },
            set: { selectedStarHR in
                if let selectedStarHR {
                    store.selectedStarHR = selectedStarHR
                }
            }
        )
    }

    private func displayName(
        for star: RenderedStar
    ) -> String {
        star.name?.nameJa
            ?? star.name?.name
            ?? "HR \(star.hr)"
    }

    private func exclusionText(
        _ exclusion: StarListSelectionExclusion
    ) -> String {
        if exclusion.contains(.belowHorizon),
           exclusion.contains(.searchQuery)
        {
            return "地平線下・検索条件外"
        }
        if exclusion.contains(.belowHorizon) {
            return "地平線下"
        }
        return "検索条件外"
    }

    private var emptyDescription: String {
        if store.canRetryCatalogData {
            return "星表を読み込めませんでした。再読み込みして星図を復旧できます。"
        }
        switch store.starListEmptyReason {
        case let .hiddenMatches(count):
            return "一致する星 \(count) 件は現在地平線下です。「すべて」を表示して確認できます。"
        case .noSearchMatches:
            return "この検索語に一致する星はありません。名前や別名を変えてお試しください。"
        case .noNamedStars:
            return "表示できる名前付きの星がありません。日時や地点を変えてお試しください。"
        case nil:
            return ""
        }
    }
}

private struct StarRow: View {
    let star: RenderedStar

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: star.isAboveHorizon ? "sparkle" : "circle.dashed")
                .foregroundStyle(star.isAboveHorizon ? .primary : .tertiary)
                .frame(width: 16)

            VStack(alignment: .leading, spacing: 2) {
                Text(star.name?.nameJa ?? star.name?.name ?? "HR \(star.hr)")
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Text(star.name?.name ?? "")
                    Text("·")
                    Text(star.isAboveHorizon
                         ? "高度 \(SkyFormatting.degrees(star.horizontal.altitude))"
                         : "地平線下")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        let name = star.name?.nameJa ?? star.name?.name ?? "HR \(star.hr)"
        let altitude = SkyFormatting.degrees(star.horizontal.altitude)
        return "\(name)、等級 \(SkyFormatting.magnitude(star.catalog.visualMagnitude))、高度 \(altitude)"
    }
}
