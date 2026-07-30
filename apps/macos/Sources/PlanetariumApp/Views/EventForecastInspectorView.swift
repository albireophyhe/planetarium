import Accessibility
import PlanetariumCore
import SwiftUI

struct EventForecastInspectorView: View {
    @Bindable var skyStore: SkyStore
    @Bindable var eventStore: EventForecastStore
    @AccessibilityFocusState
    private var maximumActionAccessibilityFocused: Bool
    @FocusState
    private var maximumActionKeyboardFocused: Bool

    var body: some View {
        Group {
            if let forecast =
                eventStore.selectedForecast
            {
                details(forecast)
            } else {
                ContentUnavailableView {
                    Label(
                        "現象を選択",
                        systemImage: "sparkles"
                    )
                } description: {
                    Text(
                        "サイドバーから局地予報を選ぶと、接触時刻と精度情報を確認できます。"
                    )
                }
            }
        }
    }

    private func details(
        _ item: EventForecastItem
    ) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header(item)

                if item.candidate.kind == .solarEclipse {
                    solarSafety
                }

                EventSceneView(
                    item: item,
                    eventStore: eventStore,
                    observationDate:
                        skyStore.observationDate
                ) { date, label in
                    showOnSky(
                        at: date,
                        label: label
                    )
                }

                switch item {
                case let .eclipse(forecast):
                    eclipseMaximumSection(forecast)
                    eclipseContactSection(forecast)
                    eclipseMeasurementSection(forecast)
                case let .occultation(forecast):
                    occultationMaximumSection(forecast)
                    occultationContactSection(forecast)
                    occultationMeasurementSection(forecast)
                    precisionWarningsSection(forecast)
                }

                uncertaintySection(item.uncertainty)
                assumptionsSection(item)
                warningsSection(item.warnings)
                provenanceSection(item.provenance)
            }
            .padding(16)
        }
        .navigationTitle(item.title)
    }

    private func header(
        _ item: EventForecastItem
    ) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Label(
                item.title,
                systemImage: item.systemImage
            )
            .font(SkyTypography.heading)

            eventDateTime(item.maximumDate)

            Label(
                EventForecastFormatting.visibility(
                    item.visibility
                ),
                systemImage:
                    EventForecastFormatting
                    .visibilitySystemImage(
                        item.visibility
                    )
            )
            .font(.callout.weight(.semibold))
            .foregroundStyle(.secondary)

            if let boundaryReason =
                item.boundaryUncertaintyReason
            {
                Label(
                    EventForecastFormatting
                        .boundaryUncertainty(
                            boundaryReason
                        ),
                    systemImage: "scope"
                )
                .font(.callout.weight(.semibold))
                .foregroundStyle(.orange)
                .fixedSize(
                    horizontal: false,
                    vertical: true
                )
            }

            Text(
                "地点：\(item.observer.location.name)"
            )
            .font(.caption)
            .foregroundStyle(.secondary)

            if eventStore.canRestoreObservationDate {
                Button {
                    eventStore.restoreSkyDate(
                        skyStore: skyStore
                    )
                    Task { @MainActor in
                        maximumActionKeyboardFocused =
                            true
                        maximumActionAccessibilityFocused =
                            true
                        AccessibilityNotification
                            .Announcement(
                                EventForecastAccessibility
                                    .restoredObservationTimeAnnouncement
                            )
                            .post()
                    }
                } label: {
                    Label(
                        "元の観測日時へ戻す",
                        systemImage: "arrow.uturn.backward"
                    )
                }
                .controlSize(.small)
                .accessibilityHint(
                    "現象の時刻を表示する前の観測日時へ戻します"
                )
            }
        }
    }

    private var solarSafety: some View {
        GroupBox {
            Label {
                Text(
                    "太陽を肉眼や光学機器で直接見ないでください。皆既日食でも、皆既中以外は規格に適合した日食観察用フィルターが必要です。"
                )
                .foregroundStyle(.primary)
                .fixedSize(
                    horizontal: false,
                    vertical: true
                )
            } icon: {
                Image(
                    systemName:
                        "exclamationmark.triangle.fill"
                )
            }
            .foregroundStyle(.orange)
        } label: {
            Text("安全上の注意")
        }
    }

    private func eclipseMaximumSection(
        _ forecast: LocalEclipseCircumstancesV1
    ) -> some View {
        let occurrenceUncertain =
            forecast.uncertainBoundary == .external
        return GroupBox(
            occurrenceUncertain
                ? "最接近"
                : "食の最大"
        ) {
            VStack(alignment: .leading, spacing: 9) {
                eventDateTime(
                    forecast.maximum.instantUTC
                )

                eclipseBodyPosition(
                    forecast.maximum,
                    kind: forecast.candidate.kind
                )

                showOnSkyButton(
                    date:
                        forecast.maximum
                        .instantUTC,
                    label:
                        occurrenceUncertain
                        ? "最接近時刻を空に表示"
                        : "最大時刻を空に表示",
                    hint:
                        occurrenceUncertain
                        ? "時間再生を停止し、空の観測日時を太陽と月の最接近へ変更します"
                        : "時間再生を停止し、空の観測日時を食の最大へ変更します",
                    prominent: true
                )
            }
            .frame(
                maxWidth: .infinity,
                alignment: .leading
            )
        }
    }

    private func eclipseContactSection(
        _ forecast: LocalEclipseCircumstancesV1
    ) -> some View {
        let occurrenceUncertain =
            forecast.uncertainBoundary == .external
        return GroupBox(
            occurrenceUncertain
                ? "最接近時刻"
                : "接触時刻"
        ) {
            VStack(alignment: .leading, spacing: 0) {
                utcScenarioNote(
                    deltaTModel:
                        forecast.provenance
                        .deltaTModel
                )
                ForEach(
                    Array(
                        forecast.contacts.enumerated()
                    ),
                    id: \.offset
                ) { index, contact in
                    if index > 0 {
                        Divider()
                    }
                    eclipseContactRow(
                        contact,
                        kind: forecast.candidate.kind,
                        solarOccurrenceUncertain:
                            occurrenceUncertain
                    )
                }
                if forecast.contacts.contains(
                    where: {
                        $0.positionAngleRadians != nil
                    }
                ) {
                    Text(
                        EventForecastFormatting
                            .positionAngleConvention
                    )
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.top, 6)
                }
            }
        }
    }

    private func eclipseContactRow(
        _ contact: EclipseContactV1,
        kind: EclipseCandidateKindV1,
        solarOccurrenceUncertain: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            contactHeading(
                title:
                    EventForecastFormatting.phase(
                        contact.phase,
                        solarOccurrenceUncertain:
                            solarOccurrenceUncertain
                    ),
                date: contact.instantUTC
            )

            HStack(spacing: 7) {
                visibilityLabel(
                    isAboveHorizon:
                        contact.aboveHorizon
                )
                eclipseBodyPosition(
                    contact,
                    kind: kind
                )
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            positionAngle(
                contact.positionAngleRadians,
                label: "接触位置角",
                includesConvention: false
            )
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func eclipseBodyPosition(
        _ contact: EclipseContactV1,
        kind: EclipseCandidateKindV1
    ) -> some View {
        if let position =
            kind == .solarEclipse
                ? contact.sun
                : contact.moon
        {
            horizontalPosition(
                prefix:
                    kind == .solarEclipse
                    ? "太陽"
                    : "月",
                coordinates: position.horizontal
            )
        }
    }

    private func eclipseMeasurementSection(
        _ forecast: LocalEclipseCircumstancesV1
    ) -> some View {
        GroupBox("規模") {
            VStack(alignment: .leading, spacing: 7) {
                EventMetricRow(
                    label:
                        eclipseMagnitudeLabel(
                            forecast
                        ),
                    value:
                        AstronomicalFormatting
                        .decimal(
                            forecast.magnitude,
                            fractionDigits: 3
                        )
                )
                if let obscuration =
                    forecast.obscuration
                {
                    EventMetricRow(
                        label: "面積遮蔽率",
                        value:
                            AstronomicalFormatting
                            .decimal(
                                obscuration * 100,
                                fractionDigits: 1
                            )
                            + "%"
                    )
                }
            }
        }
    }

    private func eclipseMagnitudeLabel(
        _ forecast: LocalEclipseCircumstancesV1
    ) -> String {
        guard
            forecast.candidate.kind
                == .lunarEclipse
        else {
            return "食分"
        }
        return forecast.classification == .penumbral
            ? "半影食分"
            : "本影食分"
    }

    private func occultationMaximumSection(
        _ forecast:
            LocalLunarOccultationCircumstancesV1
    ) -> some View {
        GroupBox("最接近") {
            VStack(alignment: .leading, spacing: 8) {
                eventDateTime(
                    forecast.maximum.instantUTC
                )

                horizontalPosition(
                    prefix: forecast.target.label,
                    coordinates:
                        forecast.maximum
                        .targetHorizontal
                )
                horizontalPosition(
                    prefix: "月",
                    coordinates:
                        forecast.maximum.moon
                        .horizontal
                )
                positionAngle(
                    forecast.maximum
                        .positionAngleRadians
                )

                showOnSkyButton(
                    date:
                        forecast.maximum
                        .instantUTC,
                    label: "最接近時刻を空に表示",
                    hint:
                        "時間再生を停止し、空の観測日時を掩蔽の最接近へ変更します",
                    prominent: true
                )
            }
            .frame(
                maxWidth: .infinity,
                alignment: .leading
            )
        }
    }

    private func occultationContactSection(
        _ forecast:
            LocalLunarOccultationCircumstancesV1
    ) -> some View {
        GroupBox(
            forecast.grazing
                ? "最接近時刻"
                : "潜入・最接近・出現時刻"
        ) {
            VStack(alignment: .leading, spacing: 0) {
                utcScenarioNote(
                    deltaTModel:
                        forecast.provenance
                        .deltaTModel
                )
                ForEach(
                    Array(
                        forecast.contacts.enumerated()
                    ),
                    id: \.offset
                ) { index, contact in
                    if index > 0 {
                        Divider()
                    }
                    occultationContactRow(
                        contact,
                        targetLabel:
                            forecast.target.label
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func utcScenarioNote(
        deltaTModel: String
    ) -> some View {
        if deltaTModel.contains("anchored-to-IERS") {
            Text(
                "時刻基準：連続UTCシナリオ（TAI−UTC=37秒固定）"
            )
            .font(.caption)
            .foregroundStyle(.orange)
            .padding(.vertical, 6)
        }
    }

    private func occultationContactRow(
        _ contact: LunarOccultationContactV1,
        targetLabel: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            contactHeading(
                title:
                    EventForecastFormatting
                    .occultationPhase(
                        contact.phase
                    ),
                date: contact.instantUTC
            )

            visibilityLabel(
                isAboveHorizon:
                    contact.aboveHorizon
            )
            .font(.caption)
            .foregroundStyle(.secondary)

            horizontalPosition(
                prefix: targetLabel,
                coordinates:
                    contact.targetHorizontal
            )
            horizontalPosition(
                prefix: "月",
                coordinates:
                    contact.moon.horizontal
            )
            positionAngle(contact.positionAngleRadians)
        }
        .font(.caption)
        .padding(.vertical, 8)
        .accessibilityElement(children: .contain)
    }

    private func occultationMeasurementSection(
        _ forecast:
            LocalLunarOccultationCircumstancesV1
    ) -> some View {
        GroupBox("対象と幾何") {
            VStack(alignment: .leading, spacing: 7) {
                EventMetricRow(
                    label: "対象",
                    value: forecast.target.label
                )
                EventMetricRow(
                    label: "星表番号",
                    value:
                        "HR "
                        + forecast.target.starHR
                        .formatted()
                )
                EventMetricRow(
                    label: "等級",
                    value:
                        AstronomicalFormatting
                        .decimal(
                            forecast.target
                                .visualMagnitude,
                            fractionDigits: 2
                        )
                )
                EventMetricRow(
                    label: "判定",
                    value:
                        forecast.grazing
                        ? "平均月縁の境界帯内・発生未確定"
                        : "平均月縁の内側を通過"
                )
                EventMetricRow(
                    label: "最小クリアランス",
                    value:
                        EventForecastFormatting
                        .signedArcseconds(
                            forecast
                                .minimumClearanceRadians
                        )
                )
                Text(
                    "最小クリアランスの負値は、恒星方向が平均月縁の内側に入ることを示します。"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(
                    horizontal: false,
                    vertical: true
                )
            }
        }
    }

    @ViewBuilder
    private func precisionWarningsSection(
        _ forecast:
            LocalLunarOccultationCircumstancesV1
    ) -> some View {
        if !forecast.precisionWarnings.isEmpty {
            GroupBox("恒星位置の精度注意") {
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(
                        forecast.precisionWarnings,
                        id: \.self
                    ) { warning in
                        Label(
                            EventForecastFormatting
                                .precisionWarning(
                                    warning
                                ),
                            systemImage:
                                "scope"
                        )
                        .font(.caption)
                    }
                }
                .frame(
                    maxWidth: .infinity,
                    alignment: .leading
                )
            }
        }
    }

    private func uncertaintySection(
        _ uncertainty: EclipseForecastUncertaintyV1
    ) -> some View {
        GroupBox("予報精度") {
            VStack(alignment: .leading, spacing: 8) {
                EventMetricRow(
                    label: "計算区分",
                    value:
                        EventForecastFormatting
                        .tier(uncertainty.tier)
                )
                EventMetricRow(
                    label: "時刻モデル幅",
                    value:
                        uncertainty.timingSeconds
                        .map {
                            "±"
                                + AstronomicalFormatting
                                .decimal(
                                    $0,
                                    fractionDigits: 2
                                )
                                + "秒"
                        }
                        ?? "定量化なし"
                )
                Text(
                    "数値はモデル寄与を保守的に足した工学的な上限幅で、統計的な信頼区間ではありません。"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                if let pathKilometers =
                    uncertainty.pathKilometers
                {
                    EventMetricRow(
                        label: "総経路境界幅",
                        value:
                            "約±"
                            + AstronomicalFormatting
                            .decimal(
                                pathKilometers,
                                fractionDigits: 1
                            )
                            + " km"
                    )
                }
                EventMetricRow(
                    label: "地点精度",
                    value:
                        uncertainty
                        .observerLocationMeters
                        .map {
                            "±"
                                + AstronomicalFormatting
                                .decimal(
                                    $0,
                                    fractionDigits: 0
                                )
                                + "m"
                        }
                        ?? "不明"
                )
                if let earthOrientation =
                    uncertainty.earthOrientation
                {
                    EventMetricRow(
                        label: "IERS DUT1公表誤差",
                        value:
                            "±"
                            + AstronomicalFormatting
                            .decimal(
                                earthOrientation
                                    .dut1ReportedErrorSeconds,
                                fractionDigits: 6
                            )
                            + "秒"
                    )
                    EventMetricRow(
                        label: "IERS地表経路成分",
                        value:
                            "±"
                            + AstronomicalFormatting
                            .decimal(
                                earthOrientation
                                    .combinedPathMeters,
                                fractionDigits: 2
                            )
                            + " m"
                    )
                    Text(
                        "DUT1 "
                            + AstronomicalFormatting
                            .decimal(
                                earthOrientation
                                    .dut1PathMeters,
                                fractionDigits: 2
                            )
                            + " m ＋ xp/yp "
                            + AstronomicalFormatting
                            .decimal(
                                earthOrientation
                                    .polarMotionPathMeters,
                                fractionDigits: 2
                            )
                            + " m。IERS公表誤差の線形包絡で、1σや総合時刻誤差ではありません。"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                ForEach(
                    uncertainty.dominantContributors,
                    id: \.self
                ) { contributor in
                    Label(
                        contributor,
                        systemImage: "circle.fill"
                    )
                    .labelStyle(
                        EventForecastBulletLabelStyle()
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func assumptionsSection(
        _ item: EventForecastItem
    ) -> some View {
        GroupBox("前提") {
            VStack(alignment: .leading, spacing: 7) {
                Label(
                    "JPL DE442sを端末内で評価",
                    systemImage: "function"
                )
                if case .occultation = item {
                    Label(
                        "BSC5P恒星位置を精密モデルで評価",
                        systemImage: "star"
                    )
                }
                Label(
                    "平均月縁（山谷の輪郭は未適用）",
                    systemImage: "moon"
                )
                Label(
                    EventForecastFormatting.eop(
                        item.provenance.eopID
                    ),
                    systemImage: "globe"
                )
                Label(
                    "観測地点の楕円体高 "
                        + AstronomicalFormatting
                        .decimal(
                            item.observer
                                .heightMeters,
                            fractionDigits: 0
                        )
                        + " m"
                        + (
                            item.observer
                                .horizontalAccuracyMeters
                                == nil
                            ? "、水平精度は不明"
                            : ""
                        ),
                    systemImage: "mappin.and.ellipse"
                )
                Text(
                    "大気差、地形、建物、雲、視程は局地可視判定に含みません。"
                )
                .foregroundStyle(.secondary)
            }
            .font(.caption)
            .fixedSize(
                horizontal: false,
                vertical: true
            )
        }
    }

    @ViewBuilder
    private func warningsSection(
        _ warnings: [String]
    ) -> some View {
        if !warnings.isEmpty {
            GroupBox("注意") {
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(
                        warnings,
                        id: \.self
                    ) { warning in
                        Label(
                            warning,
                            systemImage:
                                "exclamationmark.circle"
                        )
                        .font(.caption)
                    }
                }
                .frame(
                    maxWidth: .infinity,
                    alignment: .leading
                )
            }
        }
    }

    private func provenanceSection(
        _ provenance: EclipseProvenanceV1
    ) -> some View {
        DisclosureGroup("計算の出典") {
            VStack(alignment: .leading, spacing: 6) {
                EventMetricRow(
                    label: "アルゴリズム",
                    value:
                        provenance.algorithmVersion
                )
                EventMetricRow(
                    label: "暦",
                    value:
                        provenance.ephemerisID
                )
                EventMetricRow(
                    label: "EOP",
                    value: provenance.eopID
                )
                EventMetricRow(
                    label: "EOP品質",
                    value:
                        "DUT1 "
                        + EventForecastFormatting
                        .eopQuality(
                            provenance.eopDUT1Quality
                        )
                        + " / 極運動 "
                        + EventForecastFormatting
                        .eopQuality(
                            provenance
                                .eopPolarMotionQuality
                        )
                )
                if let retrievedAt =
                    provenance.eopRetrievedAt
                {
                    EventMetricRow(
                        label: "EOP取得",
                        value: retrievedAt
                    )
                }
                if let sourceSHA256 =
                    provenance.eopSourceSHA256
                {
                    EventMetricRow(
                        label: "EOP SHA-256",
                        value: sourceSHA256
                    )
                }
                EventMetricRow(
                    label: "ΔT",
                    value: provenance.deltaTModel
                )
                EventMetricRow(
                    label: "月半径",
                    value:
                        provenance.lunarRadiusModel
                )
                EventMetricRow(
                    label: "月縁",
                    value:
                        provenance.limbProfileID
                        ?? "未適用"
                )
            }
            .padding(.top, 7)
        }
        .font(.caption)
    }

    private func contactHeading(
        title: String,
        date: Date
    ) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.callout.weight(.semibold))
                eventDateTime(date)
            }

            Spacer()

            showOnSkyButton(
                date: date,
                label: "\(title)を空に表示",
                hint:
                    "時間再生を停止して、この現象時刻へ変更します",
                prominent: false
            )
        }
    }

    private func eventDateTime(
        _ date: Date
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(
                "現地："
                    + EventForecastFormatting
                    .dateTime(
                        date,
                        timeZoneIdentifier:
                            skyStore.location
                            .timeZoneIdentifier
                    )
            )
            Text(
                "UTC："
                    + EventForecastFormatting
                    .utcDateTime(date)
            )
            .foregroundStyle(.secondary)
        }
        .font(SkyTypography.data)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func showOnSkyButton(
        date: Date,
        label: String,
        hint: String,
        prominent: Bool
    ) -> some View {
        if prominent {
            Button {
                showOnSky(
                    at: date,
                    label: label
                )
            } label: {
                Label(
                    label,
                    systemImage: "clock.arrow.circlepath"
                )
            }
            .buttonStyle(.borderedProminent)
            .focused(
                $maximumActionKeyboardFocused
            )
            .accessibilityFocused(
                $maximumActionAccessibilityFocused
            )
            .accessibilityHint(hint)
        } else {
            Button {
                showOnSky(
                    at: date,
                    label: label
                )
            } label: {
                Label(
                    label,
                    systemImage: "clock.arrow.circlepath"
                )
                .labelStyle(.iconOnly)
            }
            .buttonStyle(.borderless)
            .help(label)
            .accessibilityLabel(label)
            .accessibilityHint(hint)
        }
    }

    private func showOnSky(
        at date: Date,
        label: String
    ) {
        eventStore.showOnSky(
            at: date,
            skyStore: skyStore
        )
        AccessibilityNotification
            .Announcement(
                EventForecastAccessibility
                    .showOnSkyAnnouncement(
                        label: label,
                        dateText:
                            EventForecastFormatting
                            .dateTime(
                                date,
                                timeZoneIdentifier:
                                    skyStore.location
                                    .timeZoneIdentifier
                            )
                    )
            )
            .post()
    }

    private func visibilityLabel(
        isAboveHorizon: Bool
    ) -> some View {
        Label(
            isAboveHorizon
                ? "地平線上"
                : "地平線下",
            systemImage:
                isAboveHorizon
                ? "eye"
                : "eye.slash"
        )
    }

    private func horizontalPosition(
        prefix: String,
        coordinates: HorizontalCoordinates
    ) -> some View {
        Text(
            prefix
                + " 高度 "
                + SkyFormatting.degrees(
                    coordinates.altitude
                )
                + " · 方位 "
                + SkyFormatting.azimuth(coordinates)
        )
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private func positionAngle(
        _ radians: Double?,
        label: String = "月縁位置角",
        includesConvention: Bool = true
    ) -> some View {
        if let radians {
            Text(
                label
                    + " "
                    + EventForecastFormatting
                    .positionAngle(radians)
                    + (
                        includesConvention
                        ? "（天の北から東回り）"
                        : ""
                    )
            )
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }
}

private struct EventMetricRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer(minLength: 12)
            Text(value)
                .font(SkyTypography.data)
                .multilineTextAlignment(.trailing)
                .textSelection(.enabled)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct EventForecastBulletLabelStyle:
    LabelStyle
{
    func makeBody(
        configuration: Configuration
    ) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 7) {
            configuration.icon
                .font(.system(size: 4))
            configuration.title
        }
    }
}

enum EventForecastFormatting {
    static let positionAngleConvention =
        "位置角は天の北を0°として東回り（0〜360°）"

    static func positionAngle(
        _ radians: Double
    ) -> String {
        AstronomicalFormatting
            .decimal(
                radians * 180 / Double.pi,
                fractionDigits: 1
            )
            + "°"
    }

    static func dateTime(
        _ date: Date,
        timeZoneIdentifier: String
    ) -> String {
        let formatter = DateFormatter()
        formatter.locale =
            Locale(identifier: "ja_JP")
        formatter.calendar =
            Calendar(identifier: .gregorian)
        formatter.timeZone =
            TimeZone(
                identifier: timeZoneIdentifier
            ) ?? .current
        formatter.dateFormat =
            "yyyy年M月d日（E） HH:mm:ss z"
        return formatter.string(from: date)
    }

    static func shortDateTime(
        _ date: Date,
        timeZoneIdentifier: String
    ) -> String {
        let formatter = DateFormatter()
        formatter.locale =
            Locale(identifier: "ja_JP")
        formatter.calendar =
            Calendar(identifier: .gregorian)
        formatter.timeZone =
            TimeZone(
                identifier: timeZoneIdentifier
            ) ?? .current
        formatter.dateFormat = "M月d日 HH:mm"
        return formatter.string(from: date)
    }

    static func utcDateTime(
        _ date: Date
    ) -> String {
        let formatter = DateFormatter()
        formatter.locale =
            Locale(identifier: "en_US_POSIX")
        formatter.calendar =
            Calendar(identifier: .gregorian)
        formatter.timeZone =
            TimeZone(secondsFromGMT: 0)
        formatter.dateFormat =
            "yyyy/MM/dd HH:mm:ss 'UTC'"
        return formatter.string(from: date)
    }

    static func visibility(
        _ visibility: EventForecastVisibility
    ) -> String {
        switch visibility {
        case .fullyVisible:
            "全経過が地平線上"
        case .partlyVisible:
            "一部が地平線上"
        case .belowHorizon:
            "全経過が地平線下"
        }
    }

    static func visibilitySystemImage(
        _ visibility: EventForecastVisibility
    ) -> String {
        switch visibility {
        case .fullyVisible:
            "eye"
        case .partlyVisible:
            "eye.trianglebadge.exclamationmark"
        case .belowHorizon:
            "eye.slash"
        }
    }

    static func boundaryUncertainty(
        _ reason:
            EventForecastBoundaryUncertaintyReason
    ) -> String {
        switch reason {
        case .solarOccurrence:
            "外縁の物理境界帯内のため、この地点で日食が起きるかは未確定です。"
        case .solarCentralClassification:
            "部分食・中心食の物理境界帯内です。日食は起きますが、皆既・金環になるかと第2・第3接触は未確定です。"
        case .occultationOccurrence:
            "平均月縁の物理境界帯内のため、掩蔽が起きるかは未確定です。"
        }
    }

    static func boundarySummary(
        _ reason:
            EventForecastBoundaryUncertaintyReason
    ) -> String {
        switch reason {
        case .solarOccurrence:
            "日食発生未確定"
        case .solarCentralClassification:
            "中心食分類未確定"
        case .occultationOccurrence:
            "掩蔽発生未確定"
        }
    }

    static func phase(
        _ phase: EclipseContactPhaseV1,
        solarOccurrenceUncertain: Bool = false
    ) -> String {
        switch phase {
        case .solarC1:
            "部分食開始（C1）"
        case .solarC2:
            "皆既・金環食開始（C2）"
        case .maximum:
            solarOccurrenceUncertain
                ? "最接近"
                : "最大"
        case .solarC3:
            "皆既・金環食終了（C3）"
        case .solarC4:
            "部分食終了（C4）"
        case .lunarP1:
            "半影食開始（P1）"
        case .lunarU1:
            "部分食開始（U1）"
        case .lunarU2:
            "皆既食開始（U2）"
        case .lunarU3:
            "皆既食終了（U3）"
        case .lunarU4:
            "部分食終了（U4）"
        case .lunarP4:
            "半影食終了（P4）"
        }
    }

    static func occultationPhase(
        _ phase: LunarOccultationContactPhaseV1
    ) -> String {
        switch phase {
        case .disappearance:
            "潜入"
        case .maximum:
            "最接近"
        case .reappearance:
            "出現"
        }
    }

    static func tier(
        _ tier: EventCalculationTierV1
    ) -> String {
        switch tier {
        case .normal:
            "通常"
        case .uncertain:
            "不確かさあり"
        case .reference:
            "参考"
        }
    }

    static func eop(_ id: String) -> String {
        switch id {
        case "iers-finals2000a-eop.v1":
            "IERS DUT1・極運動を適用"
        case "IERS EOP観測値":
            "IERS観測DUT1・極運動を適用"
        case "IERS EOP予測値":
            "IERS予測DUT1・極運動を適用"
        case "IERS EOP観測・予測混在":
            "IERS観測・予測混在値を適用"
        case "assumed-zero-outside-iers-coverage":
            "IERS範囲外：DUT1=0、極運動=0を仮定"
        default:
            id
        }
    }

    static func eopQuality(
        _ quality: EventEOPQualityV1
    ) -> String {
        switch quality {
        case .observed:
            "観測"
        case .predicted:
            "予測"
        case .mixed:
            "観測・予測混在"
        case .outsideCoverage:
            "収録外"
        case .callerOrAssumed:
            "外部値または仮定"
        }
    }

    static func signedArcseconds(
        _ radians: Double
    ) -> String {
        guard radians.isFinite else {
            return "—"
        }
        let arcseconds =
            radians * 180 / Double.pi * 3_600
        let sign = arcseconds < 0 ? "−" : "+"
        return sign
            + AstronomicalFormatting
            .decimal(
                abs(arcseconds),
                fractionDigits: 3
            )
            + "″"
    }

    static func precisionWarning(
        _ warning: PrecisionWarningCode
    ) -> String {
        switch warning {
        case .dut1AssumedZero:
            "DUT1を0秒と仮定"
        case .pre1972UTCTTApproximation:
            "1972年以前のUTC−TTを近似"
        case .futureLeapSecondsUnknown:
            "将来のうるう秒は未確定"
        case .catalogFK5PrecisionLimited:
            "BSC5P FK5星表の精度制約"
        case .properMotionMissing:
            "固有運動が未収録"
        case .radialVelocityMissingAssumedZero:
            "視線速度を0 km/sと仮定"
        case .annualParallaxDisabled:
            "年周視差を無効化"
        case .annualParallaxUnavailable:
            "年周視差が未収録"
        case .annualParallaxApproximateEphemeris:
            "年周視差に近似暦を使用"
        case .solarLightDeflectionDisabled:
            "太陽重力光偏向を未適用"
        case .solarLightDeflectionApproximateEphemeris:
            "太陽重力光偏向に近似暦を使用"
        case .aberrationDisabled:
            "年周光行差を無効化"
        case .aberrationApproximateEphemeris:
            "年周光行差に近似暦を使用"
        case .diurnalAberrationDisabled:
            "日周光行差は共通速度へ統合"
        case .observerHeightAssumedZero:
            "観測地点の標高を0 mと仮定"
        case .polarMotionAssumedZero:
            "極運動を0と仮定"
        case .refractionDisabled:
            "大気差を未適用"
        case .refractionBelowModelAltitude:
            "低高度の大気差モデル範囲外"
        }
    }
}
