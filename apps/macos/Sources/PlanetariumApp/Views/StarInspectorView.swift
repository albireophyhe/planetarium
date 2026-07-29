import PlanetariumCore
import SwiftUI

struct StarInspectorView: View {
    @Bindable var store: SkyStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let star = store.selectedStar {
                    selectedStarContent(star)
                } else {
                    ContentUnavailableView {
                        Label("星を選択", systemImage: "sparkles")
                    } description: {
                        Text("星図または検索可能な一覧から星を選んでください。")
                    }
                    .frame(maxWidth: .infinity, minHeight: 210)
                }

                Divider()

                layerControls

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Text("観測条件")
                        .font(SkyTypography.heading)
                    Label(store.location.name, systemImage: "mappin.and.ellipse")
                    Label(store.observationDateText, systemImage: "calendar")
                    Text(store.timeZoneText)
                        .font(SkyTypography.dataCaption)
                        .foregroundStyle(.secondary)

                    if let warning =
                        store.timeScaleAssumptionSummary
                    {
                        Label(
                            warning,
                            systemImage:
                                "clock.badge.exclamationmark"
                        )
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(.orange)

                        if let detail =
                            store.timeScaleAssumptionDetail
                        {
                            Text(detail)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(
                                    horizontal: false,
                                    vertical: true
                                )
                        }
                    }

                    Label(
                        store.dut1StatusSummary,
                        systemImage: store.dut1StatusSystemImage
                    )
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(
                        store.currentDUT1Estimate == nil
                            ? Color.orange
                            : Color.primary
                    )

                    Text(store.dut1StatusDetail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(
                            horizontal: false,
                            vertical: true
                        )

                    Label(
                        store.polarMotionStatusSummary,
                        systemImage:
                            store.polarMotionStatusSystemImage
                    )
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(
                        store.currentPolarMotionEstimate == nil
                            ? Color.orange
                            : Color.primary
                    )

                    Text(store.polarMotionStatusDetail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(
                            horizontal: false,
                            vertical: true
                        )

                    if store.canRetryEarthOrientationData {
                        Button {
                            store.retryEarthOrientationData()
                        } label: {
                            Label(
                                "IERSデータを再読み込み",
                                systemImage: "arrow.clockwise"
                            )
                        }
                        .buttonStyle(.bordered)
                        .help(
                            "manifestまたは必要なchunkを再検証し、現在の星図を再計算"
                        )
                    }

                    Button {
                        store.presentLocationEditor()
                    } label: {
                        Label("地点を詳しく設定", systemImage: "slider.horizontal.3")
                    }
                    .buttonStyle(.bordered)
                }

                Divider()

                HStack {
                    Button {
                        store.isHelpPresented = true
                    } label: {
                        Label("精度とプライバシー", systemImage: "questionmark.circle")
                    }
                    .buttonStyle(.link)
                    Spacer()
                    SettingsLink {
                        Label("設定", systemImage: "gearshape")
                    }
                }
            }
            .padding(18)
        }
    }

    @ViewBuilder
    private func selectedStarContent(_ star: RenderedStar) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(star.name?.nameJa ?? star.name?.name ?? "HR \(star.hr)")
                .font(SkyTypography.displayTitle)
                .textSelection(.enabled)
            if let name = star.name {
                Text(name.name)
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }

            Label(
                star.isAboveHorizon
                    ? (
                        store.useStandardAtmosphericRefraction
                            ? "標準大気差適用後も地平線上"
                            : "幾何学的に地平線上"
                    )
                    : "現在は地平線下",
                systemImage: star.isAboveHorizon ? "arrow.up.circle.fill" : "arrow.down.circle"
            )
            .font(.caption.weight(.semibold))
            .foregroundStyle(star.isAboveHorizon ? .green : .secondary)
            .padding(.top, 3)

            Label(
                store.selectedStarAnnualParallaxMode
                    == .truncatedVSOP2000HeliocentricEarth
                    ? "年周視差：VSOP2000 100項暦で適用"
                    : "年周視差：正の星表視差値なし",
                systemImage: "arrow.left.and.right.circle"
            )
            .font(.caption)
            .foregroundStyle(.secondary)

            Label(
                solarLightDeflectionLabel,
                systemImage: "sun.max"
            )
            .font(.caption)
            .foregroundStyle(.secondary)

            Label(
                "日周光行差：WGS84楕円体高0 mで適用",
                systemImage: "globe"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
        }

        Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 10) {
            GridRow {
                MetricView(
                    title: store.useStandardAtmosphericRefraction
                        ? "高度（標準大気差）"
                        : "高度（幾何）",
                    value: SkyFormatting.degrees(star.horizontal.altitude),
                    systemImage: "arrow.up.and.down"
                )
                MetricView(
                    title: "方位",
                    value: SkyFormatting.azimuth(star.horizontal),
                    systemImage: "safari"
                )
            }
            GridRow {
                MetricView(
                    title: "等級",
                    value: SkyFormatting.magnitude(star.catalog.visualMagnitude),
                    systemImage: "sparkle"
                )
                MetricView(
                    title: "星座",
                    value: star.name?.constellation ?? "—",
                    systemImage: "line.3.horizontal.decrease"
                )
            }
        }

        if !star.horizontal.azimuthIsDefined {
            Label(
                "天頂では方位角を一意に定められません。",
                systemImage: "info.circle"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }

        DisclosureGroup("詳しい情報") {
            Text(
                "赤経は天球上の東西方向を時間で、赤緯は天の赤道からの南北角を示します。J2000は2000年1月1.5日の基準座標で、上の高度・方位は選択した観測日時へ変換した値です。"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 8)

            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
                detailRow(
                    label: "赤経（J2000）",
                    value: SkyFormatting.rightAscension(star.catalog.rightAscension)
                )
                detailRow(
                    label: "赤緯（J2000）",
                    value: SkyFormatting.declination(star.catalog.declination)
                )
                detailRow(
                    label: "HR / HD",
                    value: "HR \(star.hr) / \(star.catalog.hd.map { "HD \($0)" } ?? "—")"
                )
                detailRow(
                    label: "スペクトル型",
                    value: star.catalog.spectralType ?? "—"
                )
                detailRow(
                    label: "B−V",
                    value: star.catalog.bvColor?.formatted(
                        .number.precision(.fractionLength(2))
                    ) ?? "—"
                )
                detailRow(
                    label: "星表視差",
                    value:
                        store
                            .selectedStarPositiveParallaxArcseconds
                            .map(SkyFormatting.arcseconds)
                            ?? "—"
                )
                detailRow(
                    label: "太陽重力光偏向",
                    value: solarLightDeflectionValue
                )
                detailRow(
                    label: "日周光行差",
                    value: "適用（WGS84楕円体高0 m仮定）"
                )
                detailRow(
                    label: "視線速度",
                    value:
                        star.catalog.astrometry?
                            .radialVelocityKilometersPerSecond
                            .flatMap { value in
                                value.isFinite
                                    ? AstronomicalFormatting.decimal(
                                        value,
                                        fractionDigits: 0
                                    ) + " km/s"
                                    : nil
                            }
                            ?? (
                                store
                                    .selectedStarRadialVelocityAssumedZero
                                    ? "未収録（0 km/sを仮定）"
                                    : "—"
                            )
                )
            }
            .font(.callout)
            .padding(.top, 6)
        }

        VStack(alignment: .leading, spacing: 4) {
            Text(
                store.useStandardAtmosphericRefraction
                    ? "精密モデルv2 · \(solarLightDeflectionSummary) · 日周光行差 · 標準大気差（幾何高度5°以上）"
                    : "精密モデルv2 · \(solarLightDeflectionSummary) · 日周光行差 · 幾何高度 · 大気差なし"
            )
                .font(.caption.weight(.semibold))
            Text(
                store.useStandardAtmosphericRefraction
                    ? "表示高度には固定した標準大気を仮定した補正を適用しています。幾何高度5°未満は不安定な外挿を避けるため補正せず、実際の気象や高度による差は含みません。"
                    : "表示高度は真空中の幾何高度です。大気差は適用していません。"
            )
            Text(annualParallaxExplanation)
            Text(solarLightDeflectionExplanation)
            Text("日周光行差は地球自転による東向き速度をWGS84で求め、地点の楕円体高を0 mと仮定して適用しています。")
            Text("BSC5PのFK5座標はJ2000回転・フレームスピンでHipparcos/ICRSへ接続します。既定の共有地球暦はVSOP2000由来100項をTT（TDBのproxy）で評価し、解析微分を年周光行差の速度に使いますが、太陽系重心に対する太陽の速度は加えません。BSC5Pの格納分解能、FK5のゾーン誤差、この切り詰めと近似が精度を制限します。既定の年周視差は厳密な太陽系重心暦と実観測地点の変位を含まず、恒星の日周視差、惑星による光の曲がり、日内の極運動潮汐、天候、光害、地形も含みません。太陽の水平位置だけはWGS84地点変位による日周視差を含みます。サブ秒角精度や望遠鏡導入を保証しません。星の大きさと色は見分けやすくした表現です。")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }

    private var annualParallaxExplanation: String {
        switch store.selectedStarAnnualParallaxMode {
        case .truncatedVSOP2000HeliocentricEarth:
            if store.selectedStarRadialVelocityAssumedZero {
                return "正の星表視差を使い、共有するVSOP2000由来100項の太陽中心地球位置を観測者位置のproxyとして年周視差を近似しています。視線速度が未収録のため0 km/sを仮定し、未知の遠近加速度は含みません。"
            }
            return "正の星表視差を使い、共有するVSOP2000由来100項の太陽中心地球位置を観測者位置のproxyとして年周視差を近似しています。"
        case .unavailable:
            return "この星には正の星表視差値がないため、年周視差を計算できません。これは変位がゼロという意味ではありません。"
        case .disabled:
            return "年周視差は無効です。"
        case .callerObserverPosition:
            return "外部から指定した観測者位置で年周視差を計算しています。"
        case nil:
            return "年周視差の状態を確認できません。"
        default:
            return "互換モードの近似地球暦で年周視差を計算しています。"
        }
    }

    private var solarLightDeflectionLabel: String {
        switch store.selectedStarSolarLightDeflectionMode {
        case .truncatedVSOP2000HeliocentricEarth:
            "太陽重力光偏向：VSOP2000 100項暦で適用"
        case .callerSunObserverGeometry:
            "太陽重力光偏向：外部指定幾何で適用"
        case .disabled:
            "太陽重力光偏向：無効"
        case nil:
            "太陽重力光偏向：状態不明"
        default:
            "太陽重力光偏向：互換近似暦で適用"
        }
    }

    private var solarLightDeflectionValue: String {
        switch store.selectedStarSolarLightDeflectionMode {
        case .truncatedVSOP2000HeliocentricEarth:
            "適用（VSOP2000 100項・太陽中心地球暦）"
        case .callerSunObserverGeometry:
            "適用（外部指定幾何）"
        case .disabled:
            "無効"
        case nil:
            "—"
        default:
            "適用（互換近似暦）"
        }
    }

    private var solarLightDeflectionSummary: String {
        store.selectedStarSolarLightDeflectionMode == .disabled
            ? "太陽重力光偏向なし"
            : "太陽重力光偏向"
    }

    private var solarLightDeflectionExplanation: String {
        switch store.selectedStarSolarLightDeflectionMode {
        case .truncatedVSOP2000HeliocentricEarth:
            "太陽重力光偏向は共有するVSOP2000由来100項の太陽中心地球暦から求めた太陽—観測者幾何で適用します。惑星による光偏向は含みません。"
        case .callerSunObserverGeometry:
            "太陽重力光偏向は外部から指定された太陽—観測者幾何で適用します。惑星による光偏向は含みません。"
        case .disabled:
            "太陽重力光偏向は無効です。惑星による光偏向も含みません。"
        case nil:
            "太陽重力光偏向の状態を確認できません。惑星による光偏向は含みません。"
        default:
            "太陽重力光偏向は互換近似暦で適用します。惑星による光偏向は含みません。"
        }
    }

    private var layerControls: some View {
        VStack(alignment: .leading, spacing: 11) {
            Text("表示設定")
                .font(SkyTypography.heading)

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

            Text(
                store.useStandardAtmosphericRefraction
                    ? "高度は標準大気差適用後です。5°未満は幾何高度のままです。ナイトモードは暗順応を意識した赤色表示です。"
                    : "高度は大気差なしの幾何高度です。ナイトモードは暗順応を意識した赤色表示です。"
            )
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Text(
                "軌跡は選択した1星だけを30分間隔・最大13点で精密計算します。2Dでは小さい破線側が過去、大きい実線側が未来です。"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func detailRow(label: String, value: String) -> some View {
        GridRow {
            Text(label)
                .foregroundStyle(.secondary)
            Text(value)
                .font(SkyTypography.data)
                .textSelection(.enabled)
        }
    }
}

private struct MetricView: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(title, systemImage: systemImage)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(SkyTypography.dataEmphasis)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title)、\(value)")
    }
}
