import Foundation
import PlanetariumCore
import SwiftUI

enum LocationCoordinateInput {
    static func text(for value: Double) -> String {
        value.formatted(
            .number
                .locale(
                    Locale(
                        identifier: "en_US_POSIX"
                    )
                )
                .grouping(.never)
                .precision(
                    .fractionLength(0...8)
                )
        )
    }
}

struct LocationEditorView: View {
    private enum InputField: Hashable {
        case name
        case latitude
        case longitude
        case height
        case timeZone
    }

    @Bindable var store: SkyStore
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedField: InputField?

    @State private var name: String
    @State private var latitude: String
    @State private var longitude: String
    @State private var heightMeters: String
    @State private var timeZoneIdentifier: String
    @State private var validationMessage: String?

    init(store: SkyStore) {
        self.store = store
        _name = State(initialValue: store.location.name)
        _latitude = State(
            initialValue: LocationCoordinateInput
                .text(for: store.location.latitude)
        )
        _longitude = State(
            initialValue: LocationCoordinateInput
                .text(for: store.location.longitude)
        )
        _heightMeters = State(
            initialValue: store.location.heightMeters.formatted(
                .number
                    .grouping(.never)
                    .precision(.fractionLength(0...2))
            )
        )
        _timeZoneIdentifier = State(initialValue: store.location.timeZoneIdentifier)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("観測地点")
                        .font(SkyTypography.brand)
                    Text("都市を選ぶか、緯度・経度とWGS84楕円体高を直接入力します。")
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
                TextField("WGS84楕円体高（m）", text: $heightMeters)
                    .font(SkyTypography.data)
                    .focused($focusedField, equals: .height)
                    .accessibilityIdentifier("location-height")
                    .accessibilityHint("海抜標高ではなくWGS84楕円体からの高さです。マイナス500から10000メートルまで。")
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
                    "現在地はボタンを押した時だけ取得します。地点の設定だけでは座標と楕円体高を保存・外部送信しません。現在気象の明示取得でも気象庁には座標を送らず、実測を使えない場合だけ丸めた座標をOpen-Meteoへ送ります。",
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
        .frame(width: 580, height: 570)
    }

    private func apply() {
        do {
            let validated = try ObservationConstraints.validatedLocation(
                id: "custom",
                name: name,
                latitudeText: latitude,
                longitudeText: longitude,
                timeZoneIdentifier: timeZoneIdentifier,
                heightText: heightMeters
            )
            try store.setCustomLocation(
                name: validated.name,
                latitude: validated.latitude,
                longitude: validated.longitude,
                timeZoneIdentifier: validated.timeZoneIdentifier,
                heightMeters: validated.heightMeters
            )
            dismiss()
        } catch let error as ObservationValidationError {
            validationMessage = error.localizedDescription
            switch error {
            case .invalidLatitudeNumber, .invalidLatitude:
                focusedField = .latitude
            case .invalidLongitudeNumber, .invalidLongitude:
                focusedField = .longitude
            case .invalidHeightNumber, .invalidHeight:
                focusedField = .height
            case .invalidTimeZone:
                focusedField = .timeZone
            }
        } catch {
            validationMessage = error.localizedDescription
        }
    }
}
