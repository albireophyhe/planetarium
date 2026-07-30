import Accessibility
import AppKit
import PlanetariumCore
import SwiftUI

struct StarInspectorView: View {
    @Bindable var store: SkyStore
    @State private var pointingCopyStatus: String?
    @State private var pointingCopyFailed = false
    @State private var pointingPayloadProfile:
        StarPointingPayloadProfile = .readableText
    @State private var isAtmosphereEditorPresented = false

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
        .onChange(
            of: store
                .selectedStarPointingPayloadSignature(
                profile: pointingPayloadProfile
            )
        ) {
            clearPointingCopyStatus()
        }
        .onChange(of: pointingPayloadProfile) {
            clearPointingCopyStatus()
        }
        .sheet(
            isPresented:
                $isAtmosphereEditorPresented
        ) {
            AtmosphericRefractionEditorView(
                store: store
            )
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
                            ? "設定した大気差適用後も地平線上"
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
                    ? "年周視差：VSOP2000 200項暦で適用"
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
                "日周光行差：WGS84・選択地点の標高を反映",
                systemImage: "globe"
            )
            .font(.caption)
            .foregroundStyle(.secondary)

            Label(
                starPositionAccuracySummary,
                systemImage: "scope"
            )
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .fixedSize(
                horizontal: false,
                vertical: true
            )
        }

        Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 10) {
            GridRow {
                MetricView(
                    title: store.useStandardAtmosphericRefraction
                        ? "高度（大気差後・計算値）"
                        : "高度（真空topocentric・計算値）",
                    value: SkyFormatting.degrees(
                        star.observedHorizontal.altitude,
                        fractionDigits: 3
                    ),
                    systemImage: "arrow.up.and.down"
                )
                MetricView(
                    title: store.useStandardAtmosphericRefraction
                        ? "方位（大気差後・計算値）"
                        : "方位（真空topocentric・計算値）",
                    value: SkyFormatting.azimuth(
                        star.observedHorizontal,
                        fractionDigits: 3
                    ),
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

        if !star.observedHorizontal.azimuthIsDefined {
            Label(
                "天頂では方位角を一意に定められません。",
                systemImage: "info.circle"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }

        precisionPointingReadout(star)

        DisclosureGroup("詳しい情報") {
            Text(
                "赤経は天球上の東西方向を時間で、赤緯は天の赤道からの南北角を示します。J2000は2000年1月1.5日の基準座標で、上の高度・方位は選択した観測日時・地点へ変換した値です。0.001°単位の表示桁そのものは精度の保証ではありません。"
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
                    value: "適用（WGS84・選択地点の楕円体高）"
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
                    ? "精密モデルv2 · \(solarLightDeflectionSummary) · 日周光行差 · \(store.atmosphericRefractionSummary)"
                    : "精密モデルv2 · \(solarLightDeflectionSummary) · 日周光行差 · 幾何高度 · 大気差なし"
            )
                .font(.caption.weight(.semibold))
            Text(refractionExplanation)
            Text(annualParallaxExplanation)
            Text(solarLightDeflectionExplanation)
            Text("日周光行差は地球自転による東向き速度をWGS84で求め、選択地点の楕円体高を反映します。都市は0 m、手入力は指定値、端末測位は取得できたOSの楕円体高を使い、取得できない場合は0 mとします。")
            Text("BSC5PのFK5座標はJ2000回転・フレームスピンでHipparcos/ICRSへ接続します。既定の共有地球暦はVSOP2000由来200項をTT（TDBのproxy）で評価し、解析微分を年周光行差の速度に使いますが、太陽系重心に対する太陽の速度は加えません。BSC5Pの格納分解能、FK5のゾーン誤差、この切り詰めと近似が精度を制限します。IERS収録期間内の「概ね1〜数秒角級」は、BSC5Pの格納分解能から見た真空中の通常目安で、全恒星の実測精度を保証する値ではありません。大気差ON時の表示高度は別です。既定の年周視差は厳密な太陽系重心暦と実観測地点の変位を含まず、恒星の日周視差、惑星による光の曲がり、日内の極運動潮汐、天候、光害、地形も含みません。太陽の水平位置だけはWGS84地点変位による日周視差を含みます。サブ秒角精度や望遠鏡導入を保証しません。星の大きさと色は見分けやすくした表現です。")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }

    private var annualParallaxExplanation: String {
        switch store.selectedStarAnnualParallaxMode {
        case .truncatedVSOP2000HeliocentricEarth:
            if store.selectedStarRadialVelocityAssumedZero {
                return "正の星表視差を使い、共有するVSOP2000由来200項の太陽中心地球位置を観測者位置のproxyとして年周視差を近似しています。視線速度が未収録のため0 km/sを仮定し、未知の遠近加速度は含みません。"
            }
            return "正の星表視差を使い、共有するVSOP2000由来200項の太陽中心地球位置を観測者位置のproxyとして年周視差を近似しています。"
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

    private var starPositionAccuracySummary: String {
        StarPositionAccuracySummary.text(
            hasBundledEarthOrientation:
                store.currentDUT1Estimate != nil
                && store.currentPolarMotionEstimate != nil
        )
    }

    private var solarLightDeflectionLabel: String {
        switch store.selectedStarSolarLightDeflectionMode {
        case .truncatedVSOP2000HeliocentricEarth:
            "太陽重力光偏向：VSOP2000 200項暦で適用"
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
            "適用（VSOP2000 200項・太陽中心地球暦）"
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
            "太陽重力光偏向は共有するVSOP2000由来200項の太陽中心地球暦から求めた太陽—観測者幾何で適用します。惑星による光偏向は含みません。"
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
                "大気差",
                isOn: $store.useStandardAtmosphericRefraction
            )

            Text(
                store.useStandardAtmosphericRefraction
                    ? "高度は\(store.atmosphericRefractionSummary)の補正後です。適用域より低い星は幾何高度のままです。"
                    : "高度は大気差なしの幾何高度です。ナイトモードは暗順応を意識した赤色表示です。"
            )
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                isAtmosphereEditorPresented = true
            } label: {
                Label(
                    "大気差を詳しく設定…",
                    systemImage:
                        "humidity"
                )
            }
            .buttonStyle(.bordered)
            .help(
                "標準大気またはセッション内だけの手動気象値を設定"
            )

            Text(
                "軌跡は選択した1星だけを30分間隔・最大13点で精密計算します。2Dでは小さい破線側が過去、大きい実線側が未来です。"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func precisionPointingReadout(
        _ star: RenderedStar
    ) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline) {
                Label("導入用座標", systemImage: "scope")
                    .font(SkyTypography.heading)
                Spacer()
                Text("精密モデルv2")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Text(
                "見かけ赤道座標、真空中のtopocentric幾何座標、"
                    + "設定した大気差を反映した観測座標を分けて表示します。"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)

            Grid(
                alignment: .leading,
                horizontalSpacing: 12,
                verticalSpacing: 8
            ) {
                detailRow(
                    label: "見かけ赤経（日時）",
                    value:
                        star.apparentEquatorial.map {
                            StarPointingPayloadFormatter
                                .preciseRightAscension(
                                    $0.rightAscension
                                )
                        } ?? "—"
                )
                detailRow(
                    label: "見かけ赤緯（日時）",
                    value:
                        star.apparentEquatorial.map {
                            StarPointingPayloadFormatter
                                .preciseDeclination(
                                    $0.declination
                                )
                        } ?? "—"
                )
                detailRow(
                    label: "高度（真空・topocentric）",
                    value:
                        StarPointingPayloadFormatter
                            .preciseDegrees(
                                star.geometricHorizontal.altitude
                            )
                )
                detailRow(
                    label: "方位（真空・topocentric）",
                    value:
                        StarPointingPayloadFormatter
                            .preciseAzimuth(
                                star.geometricHorizontal
                            )
                )
                detailRow(
                    label: "高度（設定大気差後）",
                    value:
                        StarPointingPayloadFormatter
                            .preciseDegrees(
                                star.observedHorizontal.altitude
                            )
                )
                detailRow(
                    label: "方位（設定大気差後）",
                    value:
                        StarPointingPayloadFormatter
                            .preciseAzimuth(
                                star.observedHorizontal
                            )
                )
            }
            .font(.callout)

            Text(
                store.useStandardAtmosphericRefraction
                    ? "\(store.pointingRefractionDescription)です。適用域より低い星は真空幾何値のままです。"
                    : "大気差は無効です。設定大気差後の値は真空幾何値と同じです。"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)

            Divider()

            Text("現在の計算条件")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            Grid(
                alignment: .leading,
                horizontalSpacing: 12,
                verticalSpacing: 7
            ) {
                detailRow(
                    label: "UTC",
                    value: store.pointingUTCTimestamp
                )
                detailRow(
                    label: "現地時刻",
                    value: store.pointingLocalTimestamp
                )
                detailRow(
                    label: "観測地点",
                    value:
                        store
                        .pointingLocationDescription
                )
                detailRow(
                    label: "大気差",
                    value:
                        store
                        .pointingRefractionDescription
                )
            }
            .font(.caption)

            Picker(
                "コピー形式",
                selection: $pointingPayloadProfile
            ) {
                ForEach(
                    StarPointingPayloadProfile.allCases
                ) { profile in
                    Text(profile.label)
                        .tag(profile)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityHint(
                "読みやすい本文または座標系と単位を明示したversion付きJSONを選択"
            )

            Button {
                copyPointingPayload()
            } label: {
                Label(
                    pointingPayloadProfile.copyLabel,
                    systemImage:
                        pointingPayloadProfile
                            == .precisionJSON
                        ? "curlybraces"
                        : "doc.on.doc"
                )
            }
            .buttonStyle(.borderedProminent)
            .disabled(
                !store
                    .isSelectedStarPointingPayloadAvailable(
                        profile:
                            pointingPayloadProfile
                    )
            )
            .help(
                pointingPayloadProfile == .precisionJSON
                    ? "profile ID・座標系・原点・単位・UTC/UT1/TT・EOPをJSONでコピー"
                    : "J2000・見かけ座標・真空/大気差後の水平座標とUTC/UT1/TT・EOP識別情報をコピー"
            )

            if let pointingCopyStatus {
                Label(
                    pointingCopyStatus,
                    systemImage:
                        pointingCopyFailed
                        ? "exclamationmark.triangle"
                        : "checkmark.circle"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(
                    pointingCopyFailed
                        ? Color.orange
                        : Color.secondary
                )
                .fixedSize(
                    horizontal: false,
                    vertical: true
                )
                .accessibilityElement(
                    children: .combine
                )
            }

            Text(
                "0.01秒時・0.000001°単位の表示桁そのものは"
                    + "位置精度の保証ではありません。望遠鏡の座標系と"
                    + "大気差設定を確認して使ってください。"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(.quaternary.opacity(0.35))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var refractionExplanation: String {
        guard let applied =
            store.appliedAtmosphericRefraction
        else {
            return "表示高度は真空中の幾何高度です。"
                + "大気差は適用していません。"
        }
        let sourceDescription =
            applied.inputSource == .standard
            ? "固定した標準大気"
            : "手動入力した現地の大気条件"
        return "表示高度には\(sourceDescription)による"
            + "補正を適用しています。幾何高度"
            + applied.atmosphere
                .minimumGeometricAltitudeDegrees
                .formatted(
                    .number.precision(
                        .fractionLength(0...2)
                    )
                )
            + "°未満は不安定な外挿を避けるため補正しません。"
            + "天候の時間変化や鉛直構造は含みません。"
    }

    private func copyPointingPayload() {
        guard
            let snapshot =
                store
                .captureSelectedStarPointingSnapshot(
                    profile:
                        pointingPayloadProfile
                )
        else {
            let message =
                "導入用データを作成できませんでした。"
            updatePointingCopyStatus(
                message,
                failed: true
            )
            return
        }

        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        if pasteboard.setString(
            snapshot.payload,
            forType: .string
        ) {
            let prefix =
                snapshot.didPausePlayback
                ? "時刻を停止し、"
                : ""
            let payloadKind =
                pointingPayloadProfile
                    == .precisionJSON
                ? "JSON導入用データ"
                : "導入用データ"
            updatePointingCopyStatus(
                prefix
                    + "UTC "
                    + snapshot.utcTimestamp
                    + " 時点の"
                    + payloadKind
                    + "をコピーしました。",
                failed: false
            )
        } else {
            let prefix =
                snapshot.didPausePlayback
                ? "時刻は停止しましたが、"
                : ""
            updatePointingCopyStatus(
                prefix
                    + "UTC "
                    + snapshot.utcTimestamp
                    + " 時点のデータをクリップボードへコピーできませんでした。",
                failed: true
            )
        }
    }

    private func clearPointingCopyStatus() {
        if StarPointingCopyStatusPolicy
            .shouldClearGlobalStatus(
                copyStatus: pointingCopyStatus,
                globalStatus: store.statusMessage
            )
        {
            store.statusMessage = nil
        }
        pointingCopyStatus = nil
        pointingCopyFailed = false
    }

    private func updatePointingCopyStatus(
        _ message: String,
        failed: Bool
    ) {
        pointingCopyStatus = message
        pointingCopyFailed = failed
        store.statusMessage = message
        AccessibilityNotification
            .Announcement(message)
            .post()
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
