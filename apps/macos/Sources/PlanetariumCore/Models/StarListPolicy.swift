import Foundation

public enum StarListEmptyReason: Equatable, Sendable {
    case hiddenMatches(count: Int)
    case noSearchMatches
    case noNamedStars
}

public struct StarListSelectionExclusion:
    OptionSet,
    Hashable,
    Sendable
{
    public let rawValue: Int

    public init(rawValue: Int) {
        self.rawValue = rawValue
    }

    public static let belowHorizon = Self(rawValue: 1 << 0)
    public static let searchQuery = Self(rawValue: 1 << 1)
}

/// Pure list-state rules shared by the SwiftUI sidebar and keyboard commands.
public enum StarListPolicy {
    public static func filteredNamedStars(
        from stars: [RenderedStar],
        query rawQuery: String,
        visibleOnly: Bool
    ) -> [RenderedStar] {
        let query = normalized(rawQuery.trimmingCharacters(in: .whitespacesAndNewlines))

        return stars
            .filter { star in
                guard star.name != nil else { return false }
                guard !visibleOnly || star.isAboveHorizon else { return false }
                return matches(star, normalizedQuery: query)
            }
            .sorted { first, second in
                if first.isAboveHorizon != second.isAboveHorizon {
                    return first.isAboveHorizon
                }
                if first.horizontal.altitude != second.horizontal.altitude {
                    return first.horizontal.altitude > second.horizontal.altitude
                }
                if first.catalog.visualMagnitude != second.catalog.visualMagnitude {
                    return first.catalog.visualMagnitude < second.catalog.visualMagnitude
                }
                return first.hr < second.hr
            }
    }

    /// Keeps a selection while its rendered star remains available, even when
    /// list filters hide it. A stale selection falls back deterministically.
    public static func preservedSelection(
        currentHR: Int?,
        availableStars: [RenderedStar],
        fallbackCandidates: [RenderedStar]
    ) -> Int? {
        if let currentHR,
           availableStars.contains(where: { $0.hr == currentHR })
        {
            return currentHR
        }
        return fallbackCandidates.first?.hr
    }

    /// Explains why a selected named star is not represented by the current
    /// sidebar rows. The two reasons can apply simultaneously.
    public static func selectionExclusion(
        currentHR: Int?,
        stars: [RenderedStar],
        query rawQuery: String,
        visibleOnly: Bool
    ) -> StarListSelectionExclusion? {
        guard let currentHR,
              let star = stars.first(where: { $0.hr == currentHR }),
              star.name != nil
        else {
            return nil
        }

        var exclusion: StarListSelectionExclusion = []
        if visibleOnly, !star.isAboveHorizon {
            exclusion.insert(.belowHorizon)
        }

        let query = normalized(
            rawQuery.trimmingCharacters(
                in: .whitespacesAndNewlines
            )
        )
        if !query.isEmpty,
           !matches(star, normalizedQuery: query)
        {
            exclusion.insert(.searchQuery)
        }
        return exclusion.isEmpty ? nil : exclusion
    }

    /// Distinguishes a valid match hidden below the horizon from a query that
    /// does not match the catalog, so the UI can offer the correct recovery.
    public static func emptyReason(
        stars: [RenderedStar],
        query: String,
        visibleOnly: Bool
    ) -> StarListEmptyReason? {
        guard filteredNamedStars(
            from: stars,
            query: query,
            visibleOnly: visibleOnly
        ).isEmpty else {
            return nil
        }

        let matchesWithoutHorizonFilter = filteredNamedStars(
            from: stars,
            query: query,
            visibleOnly: false
        )
        if visibleOnly, !matchesWithoutHorizonFilter.isEmpty {
            return .hiddenMatches(count: matchesWithoutHorizonFilter.count)
        }

        if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .noSearchMatches
        }
        return .noNamedStars
    }

    /// Returns an adjacent row without wrapping. A missing selection starts at the
    /// beginning when moving forward and at the end when moving backward.
    public static func adjacentSelection(
        currentHR: Int?,
        candidates: [RenderedStar],
        offset: Int
    ) -> Int? {
        guard !candidates.isEmpty, offset != 0 else { return nil }

        guard let currentHR,
              let currentIndex = candidates.firstIndex(where: { $0.hr == currentHR })
        else {
            return offset > 0 ? candidates.first?.hr : candidates.last?.hr
        }

        let targetIndex = currentIndex + offset
        guard candidates.indices.contains(targetIndex) else { return nil }
        return candidates[targetIndex].hr
    }

    private static func normalized(_ value: String) -> String {
        value
            .folding(
                options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
                locale: Locale(identifier: "ja_JP")
            )
            .lowercased(with: Locale(identifier: "ja_JP"))
    }

    private static func matches(
        _ star: RenderedStar,
        normalizedQuery query: String
    ) -> Bool {
        guard !query.isEmpty else { return true }
        guard let name = star.name else { return false }

        let searchTarget = (
            [name.name, name.nameJa, name.constellation]
                + name.aliases
                + [star.catalog.catalogName ?? ""]
        )
        .joined(separator: " ")
        return normalized(searchTarget).contains(query)
    }
}
