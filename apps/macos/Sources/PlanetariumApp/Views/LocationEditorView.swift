import PlanetariumCore
import SwiftUI

struct LocationEditorView: View {
    private enum InputField: Hashable {
        case name
        case latitude
        case longitude
        case timeZone
    }

    @Bindable var store: SkyStore
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedField: InputField?

    @State private var name: String
    @State private var latitude: String
    @State private var longitude: String
    @State private var timeZoneIdentifier: String
    @State private var validationMessage: String?

    init(store: SkyStore) {
        self.store = store
        _name = State(initialValue: store.location.name)
        _latitude = State(initialValue: store.location.latitude.formatted(
            .number.precision(.fractionLength(4))
        ))
        _longitude = State(initialValue: store.location.longitude.formatted(
            .number.precision(.fractionLength(4))
        ))
        _timeZoneIdentifier = State(initialValue: store.location.timeZoneIdentifier)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("観測地点")
                        .font(SkyTypography.brand)
                    Text("都市を選ぶか、緯度・経度を直接入力します。")
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("閉じる", systemImage: "xmark") {
                    dismiss()
                }
                .labelStyle(.iconOnly)
                .buttonStyle(.plain)
            }

            GroupBox("都市プリセット") {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(store.cities) { city in
                            Button(city.nameJa) {
                                store.selectCity(city)
                                dismiss()
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .scrollIndicators(.hidden)
            }

            Form {
                TextField("地点名", text: $name)
                    .focused($focusedField, equals: .name)
                    .accessibilityIdentifier("location-name")
                TextField("緯度（北緯が正）", text: $latitude)
                    .font(SkyTypography.data)
                    .focused($focusedField, equals: .latitude)
                    .accessibilityIdentifier("location-latitude")
                    .accessibilityHint("マイナス90から90まで。小数点はピリオドを使用します。")
                TextField("経度（東経が正）", text: $longitude)
                    .font(SkyTypography.data)
                    .focused($focusedField, equals: .longitude)
                    .accessibilityIdentifier("location-longitude")
                    .accessibilityHint("マイナス180から180まで。小数点はピリオドを使用します。")
                TextField("タイムゾーン", text: $timeZoneIdentifier)
                    .textContentType(.none)
                    .focused($focusedField, equals: .timeZone)
                    .accessibilityIdentifier("location-time-zone")
                    .accessibilityHint("AsiaスラッシュTokyoのようなIANA識別子を入力します。")
            }
            .formStyle(.grouped)

            if let validationMessage {
                Label(validationMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.callout)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("入力エラー。\(validationMessage)")
            }

            HStack(alignment: .center, spacing: 10) {
                Label(
                    "現在地はボタンを押した時だけ取得し、座標を保存・外部送信しません。",
                    systemImage: "hand.raised"
                )
                .font(.caption)
                .foregroundStyle(.secondary)

                Spacer()

                Button("現在地") {
                    store.requestCurrentLocation()
                    dismiss()
                }
                .disabled(store.isLocating)

                Button("適用") {
                    apply()
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(22)
        .frame(width: 560, height: 520)
    }

    private func apply() {
        do {
            let validated = try ObservationConstraints.validatedLocation(
                id: "custom",
                name: name,
                latitudeText: latitude,
                longitudeText: longitude,
                timeZoneIdentifier: timeZoneIdentifier
            )
            try store.setCustomLocation(
                name: validated.name,
                latitude: validated.latitude,
                longitude: validated.longitude,
                timeZoneIdentifier: validated.timeZoneIdentifier
            )
            dismiss()
        } catch let error as ObservationValidationError {
            validationMessage = error.localizedDescription
            switch error {
            case .invalidLatitudeNumber, .invalidLatitude:
                focusedField = .latitude
            case .invalidLongitudeNumber, .invalidLongitude:
                focusedField = .longitude
            case .invalidTimeZone:
                focusedField = .timeZone
            }
        } catch {
            validationMessage = error.localizedDescription
        }
    }
}
