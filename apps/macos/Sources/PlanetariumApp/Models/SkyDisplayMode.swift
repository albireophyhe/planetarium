enum SkyDisplayMode: String, CaseIterable, Hashable {
    case chart2D
    case sphere3D

    var title: String {
        switch self {
        case .chart2D:
            "2D"
        case .sphere3D:
            "3D"
        }
    }

    var systemImage: String {
        switch self {
        case .chart2D:
            "circle.grid.cross"
        case .sphere3D:
            "globe.asia.australia"
        }
    }
}
