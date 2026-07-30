import Accessibility
import PlanetariumCore
import SwiftUI

enum EventForecastAccessibility {
    static let kindFilterLabel = "現象の種類"
    static let localYearLabel =
        "予報年は観測地点の現地日付で集計"

    static func loadingAnnouncement(
        year: Int
    ) -> String {
        "\(year)年の局地予報を計算中です"
    }

    static func resultAnnouncement(
        year: Int,
        kindTitle: String,
        displayedCount: Int,
        hiddenCount: Int,
        selectedTitle: String?
    ) -> String {
        let scope = kindTitle == "すべて"
            ? "天文現象"
            : kindTitle
        if displayedCount == 0 {
            if hiddenCount > 0 {
                return "\(year)年の地平線上の\(scope)はありません。"
                    + "地平線下に\(hiddenCount)件あります"
            }
            return "\(year)年の\(scope)はありません"
        }

        var announcement =
            "\(year)年の\(scope)を\(displayedCount)件表示しています"
        if hiddenCount > 0 {
            announcement +=
                "。地平線下の\(hiddenCount)件は非表示です"
        }
        if let selectedTitle {
            announcement += "。\(selectedTitle)を選択しました"
        }
        return announcement
    }

    static func showOnSkyAnnouncement(
        label: String,
        dateText: String
    ) -> String {
        "\(label)しました。観測日時は\(dateText)です"
    }

    static let restoredObservationTimeAnnouncement =
        "現象表示前の観測日時へ戻しました"
}

struct EventForecastSidebarView: View {
    @Bindable var skyStore: SkyStore
    @Bindable var eventStore: EventForecastStore

    var body: some View {
        VStack(spacing: 0) {
            yearControls
                .padding(.horizontal, 12)
                .padding(.vertical, 10)

            if let coverageGap {
                Divider()

                Label(
                    EventForecastCoveragePresentation
                        .message(for: coverageGap),
                    systemImage:
                        "calendar.badge.exclamationmark"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(
                    horizontal: false,
                    vertical: true
                )
                .frame(
                    maxWidth: .infinity,
                    alignment: .leading
                )
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .accessibilityLabel(
                    "予報期間の収録範囲。"
                        + EventForecastCoveragePresentation
                        .message(for: coverageGap)
                )
            }

            Divider()

            if showsFilterControls {
                filterControls

                Divider()
            }

            content
        }
        .safeAreaInset(edge: .bottom) {
            Label(
                "端末内計算 · DE442s · 平均月縁",
                systemImage: "checkmark.shield"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.bar)
            .accessibilityLabel(
                "予報は端末内で、DE442s暦と平均月縁を使って計算します"
            )
        }
        .onAppear {
            announcePhase(eventStore.phase)
        }
        .onChange(of: eventStore.phase) { _, newPhase in
            announcePhase(newPhase)
        }
        .onChange(of: eventStore.kindFilter) {
            announceResultsIfLoaded()
        }
        .onChange(of: eventStore.showBelowHorizon) {
            announceResultsIfLoaded()
        }
    }

    private var showsFilterControls: Bool {
        switch eventStore.phase {
        case .loaded, .empty:
            true
        case .idle, .loading, .failed:
            false
        }
    }

    private var coverageGap:
        EventForecastCoverageGapV1?
    {
        EventForecastCoveragePresentation.gap(
            year: eventStore.selectedYear,
            timeZoneIdentifier:
                skyStore.location
                    .timeZoneIdentifier
        )
    }

    private var filterControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker(
                EventForecastAccessibility
                    .kindFilterLabel,
                selection: kindFilter
            ) {
                ForEach(
                    EventForecastKindFilter.allCases
                ) { filter in
                    Text(filter.title)
                        .tag(filter)
                }
            }
            .pickerStyle(.menu)
            .controlSize(.small)
            .accessibilityHint(
                "一覧に表示する天文現象の種類を選びます"
            )

            if eventStore.hiddenForecastCount > 0 {
                Toggle(
                    isOn: belowHorizonVisibility
                ) {
                    Text(
                        "地平線下も表示"
                            + "（\(eventStore.hiddenForecastCount)件）"
                    )
                }
                .toggleStyle(.switch)
                .controlSize(.small)
                .frame(
                    maxWidth: .infinity,
                    alignment: .leading
                )
                .accessibilityLabel(
                    "地平線下の現象"
                        + "\(eventStore.hiddenForecastCount)件を表示"
                )
                .accessibilityHint(
                    "オンにすると、全経過が地平線下の現象も"
                        + "一覧に含めます"
                )
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var yearControls: some View {
        VStack(spacing: 8) {
            HStack {
                Button {
                    eventStore.selectPreviousYear(
                        location: skyStore.location
                    )
                } label: {
                    Label(
                        "前年",
                        systemImage: "chevron.left"
                    )
                    .labelStyle(.iconOnly)
                }
                .disabled(
                    !eventStore.canSelectPreviousYear
                )
                .help("前年の現象を表示")
                .accessibilityLabel("前年")

                Spacer()

                Text(
                    eventStore.selectedYear
                        .formatted(.number.grouping(.never))
                    + "年"
                )
                .font(SkyTypography.heading)
                .monospacedDigit()
                .accessibilityAddTraits(.isHeader)

                Spacer()

                Button {
                    eventStore.selectNextYear(
                        location: skyStore.location
                    )
                } label: {
                    Label(
                        "翌年",
                        systemImage: "chevron.right"
                    )
                    .labelStyle(.iconOnly)
                }
                .disabled(
                    !eventStore.canSelectNextYear
                )
                .help("翌年の現象を表示")
                .accessibilityLabel("翌年")
            }

            Text("観測地点の現地日付で集計")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .accessibilityLabel(
                    EventForecastAccessibility
                        .localYearLabel
                )

            Button {
                eventStore.selectObservationYear(
                    observationDate:
                        skyStore.observationDate,
                    location: skyStore.location
                )
            } label: {
                Label(
                    "観測日時の年へ",
                    systemImage: "calendar.badge.clock"
                )
            }
            .controlSize(.small)
            .accessibilityHint(
                "現在の空の観測日時と同じ年の予報を読み込みます"
            )
        }
    }

    @ViewBuilder
    private var content: some View {
        switch eventStore.phase {
        case .idle, .loading:
            VStack(spacing: 12) {
                ProgressView()
                Text("この地点の現象を計算中…")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .frame(
                maxWidth: .infinity,
                maxHeight: .infinity
            )
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                "\(eventStore.selectedYear)年の局地予報を計算中"
            )

        case .empty:
            ContentUnavailableView {
                Label(
                    "現象は見つかりませんでした",
                    systemImage: "calendar.badge.exclamationmark"
                )
            } description: {
                Text(
                    "\(eventStore.selectedYear)年に、"
                        + "この地点で計算できる日食・月食・"
                        + "明るい恒星の掩蔽は、"
                        + "地平線上・地平線下ともに"
                        + "見つかりませんでした。"
                )
            } actions: {
                Button("再計算") {
                    eventStore.retry()
                }
            }

        case let .failed(message):
            ContentUnavailableView {
                Label(
                    "予報を計算できません",
                    systemImage: "exclamationmark.triangle"
                )
            } description: {
                Text(message)
            } actions: {
                Button("再試行") {
                    eventStore.retry()
                }
            }

        case .loaded:
            loadedContent
        }
    }

    private var loadedContent: some View {
        VStack(spacing: 0) {
            if eventStore.displayedForecasts.isEmpty {
                if eventStore.forecastsMatchingKind.isEmpty {
                    kindUnavailableView
                } else {
                    hiddenForecastsUnavailableView
                }
            } else {
                List(selection: selection) {
                    ForEach(
                        eventStore.displayedForecasts,
                        id: \.id
                    ) { forecast in
                        EventForecastRow(
                            forecast: forecast,
                            timeZoneIdentifier:
                                skyStore.location
                                    .timeZoneIdentifier
                        )
                        .tag(forecast.id)
                    }
                }
                .listStyle(.sidebar)
            }
        }
    }

    private var kindUnavailableView:
        some View
    {
        ContentUnavailableView {
            Label(
                "選択した\(eventStore.kindFilter.title)はありません",
                systemImage: "line.3.horizontal.decrease.circle"
            )
        } description: {
            Text(
                "\(eventStore.selectedYear)年の予報結果に"
                    + "\(eventStore.kindFilter.title)はありません。"
                    + "種類を「すべて」にすると"
                    + "他の現象を確認できます。"
            )
        }
    }

    private var hiddenForecastsUnavailableView:
        some View
    {
        ContentUnavailableView {
            Label(
                eventStore.kindFilter == .all
                    ? "地平線上の現象はありません"
                    : "地平線上の"
                        + eventStore.kindFilter.title
                        + "はありません",
                systemImage: "moon.haze"
            )
        } description: {
            Text(
                "\(eventStore.selectedYear)年の"
                    + "\(eventStore.hiddenForecastCount)件は、"
                    + "すべて全経過が地平線下です。"
                    + "上の切り替えで確認できます。"
            )
        }
    }

    private var kindFilter:
        Binding<EventForecastKindFilter>
    {
        Binding(
            get: {
                eventStore.kindFilter
            },
            set: {
                eventStore.setKindFilter($0)
            }
        )
    }

    private var belowHorizonVisibility:
        Binding<Bool>
    {
        Binding(
            get: {
                eventStore.showBelowHorizon
            },
            set: {
                eventStore.setShowBelowHorizon($0)
            }
        )
    }

    private var selection: Binding<String?> {
        Binding(
            get: {
                eventStore.selectedForecastID
            },
            set: {
                eventStore.selectForecast($0)
            }
        )
    }

    private func announcePhase(
        _ phase: EventForecastPhase
    ) {
        switch phase {
        case .idle:
            break
        case .loading:
            announce(
                EventForecastAccessibility
                    .loadingAnnouncement(
                        year: eventStore.selectedYear
                    )
            )
        case .loaded:
            announceResultsIfLoaded()
        case .empty:
            announce(
                "\(eventStore.selectedYear)年の"
                    + "天文現象は見つかりませんでした"
            )
        case .failed:
            announce("局地予報を計算できませんでした")
        }
    }

    private func announceResultsIfLoaded() {
        guard eventStore.phase == .loaded else {
            return
        }
        announce(
            EventForecastAccessibility
                .resultAnnouncement(
                    year: eventStore.selectedYear,
                    kindTitle:
                        eventStore.kindFilter.title,
                    displayedCount:
                        eventStore
                        .displayedForecasts.count,
                    hiddenCount:
                        eventStore.showBelowHorizon
                        ? 0
                        : eventStore.hiddenForecastCount,
                    selectedTitle:
                        eventStore.selectedForecast?.title
                )
        )
    }

    private func announce(_ message: String) {
        AccessibilityNotification
            .Announcement(message)
            .post()
    }
}

enum EventForecastCoveragePresentation {
    static func gap(
        year: Int,
        timeZoneIdentifier: String
    ) -> EventForecastCoverageGapV1? {
        guard let timeZone =
            TimeZone(identifier: timeZoneIdentifier)
        else {
            return nil
        }
        var calendar =
            Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        guard
            let start = calendar.date(
                from: DateComponents(
                    timeZone: timeZone,
                    year: year,
                    month: 1,
                    day: 1
                )
            ),
            let next = calendar.date(
                from: DateComponents(
                    timeZone: timeZone,
                    year: year + 1,
                    month: 1,
                    day: 1
                )
            )
        else {
            return nil
        }
        return try? EventForecastYearCoverageV1.gap(
            year: year,
            utcOffsetSecondsAtYearStart:
                timeZone.secondsFromGMT(for: start),
            utcOffsetSecondsAtNextYearStart:
                timeZone.secondsFromGMT(for: next)
        )
    }

    static func message(
        for gap: EventForecastCoverageGapV1
    ) -> String {
        let edge = gap.edge == .localYearStart
            ? "はじめ"
            : "おわり"
        return "イベント用暦データの収録範囲により、"
            + "この現地年の\(edge)約"
            + duration(
                approximateMinutes:
                    gap.approximateMinutes
            )
            + "は予報に含まれません。"
    }

    private static func duration(
        approximateMinutes: Int
    ) -> String {
        let hours = approximateMinutes / 60
        let minutes = approximateMinutes % 60
        if hours == 0 {
            return "\(approximateMinutes)分"
        }
        if minutes == 0 {
            return "\(hours)時間"
        }
        return "\(hours)時間\(minutes)分"
    }
}

private struct EventForecastRow: View {
    let forecast: EventForecastItem
    let timeZoneIdentifier: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: forecast.systemImage)
                .foregroundStyle(.secondary)
                .frame(width: 16)

            VStack(alignment: .leading, spacing: 2) {
                Text(forecast.title)
                    .fontWeight(.semibold)
                    .lineLimit(1)
                Text(
                    summary
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
    }

    private var summary: String {
        var value =
            EventForecastFormatting.shortDateTime(
                forecast.maximumDate,
                timeZoneIdentifier: timeZoneIdentifier
            )
            + " · "
            + EventForecastFormatting.visibility(
                forecast.visibility
            )
        if let boundaryReason =
            forecast.boundaryUncertaintyReason
        {
            value += " · "
                + EventForecastFormatting
                .boundarySummary(boundaryReason)
        }
        return value
    }

    private var accessibilitySummary: String {
        var value =
            forecast.title
            + "、"
            + EventForecastFormatting.dateTime(
                forecast.maximumDate,
                timeZoneIdentifier: timeZoneIdentifier
            )
            + "、"
            + EventForecastFormatting.visibility(
                forecast.visibility
            )
        if let boundaryReason =
            forecast.boundaryUncertaintyReason
        {
            value += "、"
                + EventForecastFormatting
                .boundaryUncertainty(
                    boundaryReason
                )
        }
        return value
    }

}
