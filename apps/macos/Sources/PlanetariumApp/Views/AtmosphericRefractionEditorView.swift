import PlanetariumCore
import SwiftUI

struct AtmosphericRefractionEditorView: View {
    let store: SkyStore

    @Environment(\.dismiss)
    private var dismiss

    @State
    private var draft: AtmosphericRefractionDraft
    @State
    private var validationMessage: String?
    @AccessibilityFocusState
    private var validationMessageIsFocused: Bool

    init(store: SkyStore) {
        self.store = store
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
                    "「適用」するまで星図・軌跡・転記データは変わりません。"
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
                .keyboardShortcut(.defaultAction)
            }
            .padding()
        }
        .frame(width: 500, height: editorHeight)
        .onChange(of: draft) {
            validationMessage = nil
            validationMessageIsFocused = false
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
        draft.inputSource == .manual ? 540 : 330
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
}
