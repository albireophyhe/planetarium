import PlanetariumCore
import SwiftUI

struct AtmosphericRefractionEditorView: View {
    let store: SkyStore
    let weatherProvider: any CurrentWeatherProviding

    @Environment(\.dismiss)
    private var dismiss

    @State
    private var draft: AtmosphericRefractionDraft
    @State
    private var validationMessage: String?
    @State
    private var weatherTask: Task<Void, Never>?
    @State
    private var isWeatherLoading = false
    @State
    private var appliedWeather:
        CurrentAtmosphereWeather?
    @AccessibilityFocusState
    private var validationMessageIsFocused: Bool

    init(
        store: SkyStore,
        weatherProvider:
            any CurrentWeatherProviding =
            ObservationFirstCurrentWeatherService()
    ) {
        self.store = store
        self.weatherProvider = weatherProvider
        _draft = State(
            initialValue: AtmosphericRefractionDraft(
                inputSource:
                    store
                        .atmosphericRefractionInputSource
                        ?? .standard,
                manualAtmosphere:
                    store.manualAtmosphereForEditor
            )
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Form {
                Section {
                    Picker(
                        "入力元",
                        selection: $draft.inputSource
                    ) {
                        ForEach(
                            AtmosphericRefractionInputSource
                                .allCases
                        ) { source in
                            Text(source.label)
                                .tag(source)
                        }
                    }
                    .pickerStyle(.segmented)
                    .disabled(isWeatherLoading)
                } header: {
                    Text("大気差モデル")
                } footer: {
                    Text(sourceExplanation)
                }

                if draft.inputSource == .manual {
                    Section {
                        atmosphereField(
                            "気圧",
                            unit: "hPa",
                            rangeHint:
                                "0から1100 hPa",
                            text: $draft.pressureHPA
                        )
                        atmosphereField(
                            "気温",
                            unit: "°C",
                            rangeHint:
                                "マイナス100から60°C",
                            text:
                                $draft
                                .temperatureCelsius
                        )
                        atmosphereField(
                            "相対湿度",
                            unit: "%",
                            rangeHint:
                                "0から100%",
                            text:
                                $draft
                                .relativeHumidityPercent
                        )
                        atmosphereField(
                            "観測波長",
                            unit: "µm",
                            rangeHint:
                                "0.3から2マイクロメートル",
                            text:
                                $draft
                                .wavelengthMicrometers
                        )
                        atmosphereField(
                            "最低適用高度",
                            unit: "°",
                            rangeHint:
                                "5から30度",
                            text:
                                $draft
                                .minimumGeometricAltitudeDegrees
                        )
                    } header: {
                        Text("現地の条件")
                    } footer: {
                        Text(
                            "対応範囲：気圧0〜1100 hPa、"
                                + "気温−100〜60°C、湿度0〜100%、"
                                + "観測波長（光学・近赤外）0.3〜2 µm、"
                                + "最低高度5〜30°。"
                        )
                    }
                }

                Section {
                    LabeledContent("観測地点（小数4桁）") {
                        Text(weatherLocationText)
                            .multilineTextAlignment(.trailing)
                            .textSelection(.enabled)
                    }

                    Button {
                        requestWeatherAndApply()
                    } label: {
                        HStack(spacing: 8) {
                            if isWeatherLoading {
                                ProgressView()
                                    .controlSize(.small)
                            } else {
                                Image(
                                    systemName:
                                        "cloud.sun"
                                )
                            }
                            Text(
                                isWeatherLoading
                                    ? "現在の天気を取得中…"
                                    : "現在の天気を取得して適用"
                            )
                        }
                    }
                    .disabled(isWeatherLoading)
                    .accessibilityHint(
                        "気象庁の最新実測を座標送信なしで取得し、利用できない場合だけ表示中の座標を小数4桁でOpen-Meteoへ送信します"
                    )

                    if let appliedWeather {
                        Label(
                            weatherSuccessText(
                                appliedWeather
                            ),
                            systemImage: "checkmark.circle.fill"
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(
                            horizontal: false,
                            vertical: true
                        )
                        .accessibilityLabel(
                            "天気情報を適用しました。"
                                + weatherSuccessText(
                                    appliedWeather
                                )
                        )
                    }
                } header: {
                    Text("現在地点の天気")
                } footer: {
                    VStack(
                        alignment: .leading,
                        spacing: 4
                    ) {
                        Text(
                            "ボタンを押した時だけ気象庁の10分ごとの最新観測を固定URLから取得し、端末内で25 km以内の最寄り有効局を選びます。気象庁へのURLに現在地点の座標は含みません。"
                        )
                        Text(
                            "実測が欠測・品質不良・距離超過・30分超の古さ、または取得失敗の場合だけ、表示中の座標を小数4桁に丸めてOpen-Meteoへ送信し、15分ごとの気象モデル値を使います。星図の観測日時とは自動同期しません。"
                        )
                        Text(
                            "観測波長と最低適用高度は現在の入力を保持します。"
                        )
                        Text(
                            "観測局標高での未補正の現地気圧を使うため、現在地点との標高差が大きい場合は気圧がずれます。"
                        )
                        HStack(spacing: 12) {
                            Link(
                                "気象庁公開データを加工して利用",
                                destination: URL(
                                    string:
                                        "https://www.jma.go.jp/bosai/amedas/"
                                )!
                            )
                            Link(
                                "Weather data by Open-Meteo.com",
                                destination: URL(
                                    string:
                                        "https://open-meteo.com/en/licence"
                                )!
                            )
                        }
                    }
                }

                if let validationMessage {
                    Section {
                        Label(
                            validationMessage,
                            systemImage:
                                "exclamationmark.triangle.fill"
                        )
                        .foregroundStyle(.orange)
                        .fixedSize(
                            horizontal: false,
                            vertical: true
                        )
                        .accessibilityLabel(
                            "入力エラー。\(validationMessage)"
                        )
                        .accessibilityFocused(
                            $validationMessageIsFocused
                        )
                    }
                }
            }
            .formStyle(.grouped)

            Divider()

            HStack {
                Text(
                    "手入力は「適用」、天気は取得完了時に星図・軌跡・転記データへ反映します。"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                Spacer()
                Button("キャンセル") {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)
                Button("適用") {
                    applyDraft()
                }
                .disabled(isWeatherLoading)
                .keyboardShortcut(.defaultAction)
            }
            .padding()
        }
        .frame(width: 500, height: editorHeight)
        .onChange(of: draft) {
            validationMessage = nil
            validationMessageIsFocused = false
        }
        .onDisappear {
            weatherTask?.cancel()
            weatherTask = nil
        }
    }

    private var sourceExplanation: String {
        switch draft.inputSource {
        case .standard:
            "気圧1013.25 hPa・気温10°C・"
                + "相対湿度50%・観測波長0.55 µmを使い、"
                + "幾何高度5°以上へ適用します。"
        case .manual:
            "このセッションだけで使う現地条件です。"
                + "値と手動入力の選択は端末へ保存しません。"
        }
    }

    private var editorHeight: CGFloat {
        draft.inputSource == .manual ? 700 : 510
    }

    private var weatherLocationText: String {
        store.location.name
            + " · 緯度 "
            + CurrentWeatherCoordinate.formatted(
                store.location.latitude
            )
            + "° · 経度 "
            + CurrentWeatherCoordinate.formatted(
                store.location.longitude
            )
            + "°"
    }

    private func atmosphereField(
        _ label: String,
        unit: String,
        rangeHint: String,
        text: Binding<String>
    ) -> some View {
        LabeledContent(label) {
            HStack(spacing: 6) {
                TextField(label, text: text)
                    .labelsHidden()
                    .multilineTextAlignment(.trailing)
                    .frame(width: 130)
                    .accessibilityLabel(label)
                    .accessibilityHint(
                        "対応範囲は\(rangeHint)"
                    )
                    .disabled(isWeatherLoading)
                Text(unit)
                    .foregroundStyle(.secondary)
                    .frame(
                        width: 38,
                        alignment: .leading
                    )
            }
        }
    }

    private func applyDraft() {
        do {
            switch draft.inputSource {
            case .standard:
                store.applyStandardAtmosphericRefraction()
            case .manual:
                try store
                    .applyManualAtmosphericRefraction(
                        draft.manualAtmosphere()
                    )
            }
            dismiss()
        } catch {
            validationMessage =
                error.localizedDescription
            validationMessageIsFocused = true
        }
    }

    private func requestWeatherAndApply() {
        guard weatherTask == nil else { return }

        validationMessage = nil
        validationMessageIsFocused = false
        appliedWeather = nil
        isWeatherLoading = true

        let requestedLocation = store.location
        let requestedDraft = draft
        let provider = weatherProvider
        weatherTask = Task { @MainActor in
            defer {
                isWeatherLoading = false
                weatherTask = nil
            }

            do {
                let weather = try await provider
                    .currentAtmosphere(
                        latitude:
                            requestedLocation.latitude,
                        longitude:
                            requestedLocation.longitude
                    )
                try Task.checkCancellation()
                guard store.location == requestedLocation
                else {
                    throw AtmosphericWeatherApplicationError
                        .locationChanged
                }

                let atmosphere = try
                    AtmosphericWeatherApplicator.apply(
                        weather,
                        preserving: requestedDraft,
                        to: store
                    )
                draft = AtmosphericRefractionDraft(
                    inputSource: .manual,
                    manualAtmosphere: atmosphere
                )
                appliedWeather = weather
            } catch is CancellationError {
                return
            } catch {
                validationMessage =
                    error.localizedDescription
                validationMessageIsFocused = true
            }
        }
    }

    private func weatherSuccessText(
        _ weather: CurrentAtmosphereWeather
    ) -> String {
        "適用済み："
            + weatherProviderText(weather)
            + "・現地気圧 "
            + value(
                weather.pressureHPA,
                fractionDigits: 1
            )
            + " hPa・気温 "
            + value(
                weather.temperatureCelsius,
                fractionDigits: 1
            )
            + "°C・相対湿度 "
            + value(
                weather.relativeHumidityPercent,
                fractionDigits: 0
            )
            + (weather.provider == .jmaObservation
                ? "%・観測時刻 "
                : "%・モデル時刻 ")
            + utcDateTime(weather.observedAt)
            + " UTC"
    }

    private func weatherProviderText(
        _ weather: CurrentAtmosphereWeather
    ) -> String {
        switch weather.provider {
        case .jmaObservation:
            guard let station = weather.station else {
                return "気象庁・最寄り局実測"
            }
            return "気象庁・最寄り局実測・"
                + station.name
                + "（距離 "
                + value(
                    station.distanceKilometers,
                    fractionDigits: 1
                )
                + " km・標高 "
                + value(
                    station.elevationMeters,
                    fractionDigits: 0
                )
                + " m）"
        case .openMeteoModel:
            return "Open-Meteo気象モデル値"
        }
    }

    private func utcDateTime(_ date: Date) -> String {
        var format = Date.FormatStyle(
            date: .numeric,
            time: .shortened
        )
        format.timeZone = TimeZone(secondsFromGMT: 0)!
        return date.formatted(format)
    }

    private func value(
        _ value: Double,
        fractionDigits: Int
    ) -> String {
        String(
            format: "%.*f",
            locale: Locale(identifier: "ja_JP"),
            fractionDigits,
            value
        )
    }
}

private enum AtmosphericWeatherApplicationError:
    LocalizedError
{
    case locationChanged

    var errorDescription: String? {
        "天気情報の取得中に観測地点が変わりました。現在の地点でもう一度お試しください。"
    }
}
