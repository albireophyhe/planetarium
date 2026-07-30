enum SelectedStarTrajectoryEarthOrientationStatus:
    String,
    Hashable,
    Sendable
{
    case ready
    case unavailable
    case error
}

struct SelectedStarTrajectoryEarthOrientationProvenance:
    Hashable,
    Sendable
{
    let auxiliaryFallbackSampleCount: Int
    let auxiliarySampleCount: Int
    let centerStatus:
        SelectedStarTrajectoryEarthOrientationStatus

    var warning:
        SelectedStarTrajectoryEarthOrientationWarning?
    {
        let centerUsesFallback =
            centerStatus != .ready
        let auxiliaryUsesFallback =
            auxiliaryFallbackSampleCount > 0
        guard
            centerUsesFallback
                || auxiliaryUsesFallback
        else {
            return nil
        }

        var shortParts: [String] = []
        var descriptions: [String] = []
        if centerUsesFallback {
            shortParts.append("現在点")
            switch centerStatus {
            case .error:
                descriptions.append(
                    "現在点はEOP読込失敗のため0近似です。"
                )
            case .unavailable:
                descriptions.append(
                    "現在点はEOP収録外のため0近似です。"
                )
            case .ready:
                break
            }
        }
        if auxiliaryUsesFallback {
            shortParts.append(
                "周辺\(auxiliaryFallbackSampleCount)"
                    + "/\(auxiliarySampleCount)点"
            )
            descriptions.append(
                "周辺\(auxiliarySampleCount)点中"
                    + "\(auxiliaryFallbackSampleCount)点は"
                    + "EOPを0近似しています。"
            )
        }
        return SelectedStarTrajectoryEarthOrientationWarning(
            shortText:
                "EOP 0近似: "
                + shortParts.joined(separator: "・"),
            accessibilityDescription:
                descriptions.joined()
        )
    }
}

struct SelectedStarTrajectoryEarthOrientationWarning:
    Hashable,
    Sendable
{
    let shortText: String
    let accessibilityDescription: String
}
