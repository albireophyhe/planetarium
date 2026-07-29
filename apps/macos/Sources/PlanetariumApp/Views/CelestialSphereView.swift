import PlanetariumCore
import SwiftUI

struct CelestialSphereView: View {
    let store: SkyStore
    private let increasedContrastOverride: Bool?
    @State private var dragStartOrientation: CelestialSphereOrientation?
    @State private var magnificationStartZoom: Double?
    @Environment(\.colorSchemeContrast)
    private var colorSchemeContrast

    init(
        store: SkyStore,
        increasedContrastOverride: Bool? = nil
    ) {
        self.store = store
        self.increasedContrastOverride =
            increasedContrastOverride
    }

    var body: some View {
        GeometryReader { proxy in
            if let geometry = SphereCanvasGeometry(
                size: proxy.size,
                zoom: store.sphereZoom
            ) {
                ZStack {
                    Canvas(opaque: true, colorMode: .linear) { context, _ in
                        CelestialSphereCanvasRenderer(store: store).draw(
                            in: &context,
                            geometry: geometry,
                            increasedContrast: increasedContrast
                        )
                    }
                    .gesture(interactionGesture(geometry: geometry))
                    .simultaneousGesture(magnificationGesture)
                    .skyCanvasAccessibility(
                        label: "3D天球",
                        hint:
                            "ドラッグまたは下部の矢印ボタンで回転し、ピンチまたは拡大縮小ボタンで倍率を変更できます。北、東、南、西、天頂、天底の方向ラベルがあります。星の選択と、選択星の軌跡を表示または非表示にするアクションも利用できます。",
                        store: store,
                        sphereZoom: store.sphereZoom
                    )
                }
            } else {
                SkyChartView(store: store)
                    .accessibilityHint(
                        "3D描画に必要な領域がないため、2D星図を表示しています。"
                    )
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var magnificationGesture: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                let baseZoom: Double
                if let magnificationStartZoom {
                    baseZoom = magnificationStartZoom
                } else {
                    baseZoom = store.sphereZoom
                    magnificationStartZoom = baseZoom
                }
                store.setSphereZoom(
                    CelestialSphereZoom.applyingMagnification(
                        Double(value.magnification),
                        to: baseZoom
                    )
                )
            }
            .onEnded { _ in
                magnificationStartZoom = nil
            }
    }

    private func interactionGesture(
        geometry: SphereCanvasGeometry
    ) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                let start = geometry.projectedPoint(for: value.startLocation)
                guard hypot(start.x, start.y) <= 1 else { return }

                let baseOrientation: CelestialSphereOrientation
                if let dragStartOrientation {
                    baseOrientation = dragStartOrientation
                } else {
                    baseOrientation = store.sphereOrientation
                    dragStartOrientation = baseOrientation
                }
                store.setSphereOrientation(
                    baseOrientation.applyingTrackballDrag(
                        from: start,
                        to: geometry.projectedPoint(for: value.location)
                    )
                )
            }
            .onEnded { value in
                defer { dragStartOrientation = nil }

                let start = geometry.projectedPoint(for: value.startLocation)
                guard hypot(start.x, start.y) <= 1 else { return }
                let movement = hypot(
                    value.translation.width,
                    value.translation.height
                )
                guard movement < 4 else { return }

                if let dragStartOrientation {
                    store.setSphereOrientation(dragStartOrientation)
                }
                let projected = geometry.projectedPoint(for: value.location)
                guard hypot(projected.x, projected.y) <= 1 else { return }
                store.selectClosestOnSphere(
                    to: projected,
                    maximumDistance: max(
                        12 / Double(geometry.radius),
                        0.025
                    )
                )
            }
    }

    private var increasedContrast: Bool {
        increasedContrastOverride
            ?? (colorSchemeContrast == .increased)
    }
}

struct SphereCanvasGeometry {
    let size: CGSize
    let center: CGPoint
    let referenceRadius: CGFloat
    let radius: CGFloat
    let sphereRect: CGRect
    let zoom: Double

    init?(
        size: CGSize,
        zoom: Double = CelestialSphereZoom.defaultValue
    ) {
        guard size.width.isFinite,
              size.height.isFinite,
              size.width >= 80,
              size.height >= 80
        else {
            return nil
        }
        let clampedZoom = CelestialSphereZoom.clamped(zoom)
        let referenceRadius =
            min(size.width, size.height) / 2 - 24
        let radius = referenceRadius * CGFloat(clampedZoom)
        guard radius.isFinite, radius > 1 else { return nil }

        self.size = size
        center = CGPoint(x: size.width / 2, y: size.height / 2)
        self.referenceRadius = referenceRadius
        self.radius = radius
        self.zoom = clampedZoom
        sphereRect = CGRect(
            x: center.x - radius,
            y: center.y - radius,
            width: radius * 2,
            height: radius * 2
        )
    }

    func point(for projected: ProjectedPoint) -> CGPoint {
        CGPoint(
            x: center.x + CGFloat(projected.x) * radius,
            y: center.y + CGFloat(projected.y) * radius
        )
    }

    func projectedPoint(for point: CGPoint) -> ProjectedPoint {
        ProjectedPoint(
            x: Double((point.x - center.x) / radius),
            y: Double((point.y - center.y) / radius)
        )
    }

    func directionGuidePoint(
        for projected: ProjectedPoint
    ) -> CGPoint {
        let guideRadius = min(radius, referenceRadius)
        return CGPoint(
            x: center.x + CGFloat(projected.x) * guideRadius,
            y: center.y + CGFloat(projected.y) * guideRadius
        )
    }
}
