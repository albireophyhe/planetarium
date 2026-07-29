import PlanetariumCore
import SwiftUI

private struct SkyCanvasAccessibilityModifier: ViewModifier {
    let label: String
    let hint: String
    let store: SkyStore
    let sphereZoom: Double?

    func body(content: Content) -> some View {
        content
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityValue(accessibilityValue)
            .accessibilityHint(hint)
            .accessibilityAddTraits(.isImage)
            .accessibilityAction(named: "前の星を選択") {
                store.selectAdjacentStar(offset: -1)
            }
            .accessibilityAction(named: "次の星を選択") {
                store.selectAdjacentStar(offset: 1)
            }
            .accessibilityAction(
                named: store.showSelectedStarTrajectory
                    ? "選択星の軌跡を非表示"
                    : "選択星の軌跡を表示"
            ) {
                store.toggleSelectedStarTrajectory()
            }
    }

    private var accessibilityValue: String {
        var components = [
            store.location.name,
            store.observationDateText,
            "地平線上 \(store.visibleStarCount) 星",
            "太陽高度 \(SkyFormatting.degrees(store.sunState.horizontal.altitude))",
            store.sunState.horizontal.altitude >= 0
                ? "太陽は地平線上"
                : "太陽は地平線下",
        ]
        if let sphereZoom {
            components.append(
                "3D天球の倍率 \(Int((sphereZoom * 100).rounded()))パーセント"
            )
        }
        guard let star = store.selectedStar else {
            components.append("星は選択されていません")
            return components.joined(separator: "、")
        }

        let name =
            star.name?.nameJa
            ?? star.name?.name
            ?? "HR \(star.hr)"
        components.append("選択中 \(name)")
        components.append(
            star.isAboveHorizon ? "地平線上" : "地平線下"
        )
        components.append(
            "表示高度 \(SkyFormatting.degrees(star.horizontal.altitude))"
        )
        components.append(
            "方位 \(SkyFormatting.azimuth(star.horizontal))"
        )
        if store.showSelectedStarTrajectory {
            components.append(
                store.selectedStarTrajectoryAccessibilitySummary
            )
        }
        return components.joined(separator: "、")
    }
}

extension View {
    func skyCanvasAccessibility(
        label: String,
        hint: String,
        store: SkyStore,
        sphereZoom: Double? = nil
    ) -> some View {
        modifier(
            SkyCanvasAccessibilityModifier(
                label: label,
                hint: hint,
                store: store,
                sphereZoom: sphereZoom
            )
        )
    }
}
