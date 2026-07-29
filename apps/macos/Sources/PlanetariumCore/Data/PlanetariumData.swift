import Foundation
import PlanetariumShared

public enum PlanetariumData {
    public static func load() throws -> SkyCatalog {
        let decoder = JSONDecoder()
        let stars = try decodeBrightStars(
            from: SharedResources.data(for: .brightStarsV2),
            using: decoder
        )
        let nameDocument = try decoder.decode(
            StarNameDocument.self,
            from: SharedResources.data(for: .starNames)
        )
        let constellationDocument = try decoder.decode(
            ConstellationDocument.self,
            from: SharedResources.data(for: .constellations)
        )
        let cityDocument = try decoder.decode(
            CityDocument.self,
            from: SharedResources.data(for: .cities)
        )

        return SkyCatalog(
            stars: stars,
            names: nameDocument.stars,
            constellations: constellationDocument.constellations.map(\.model),
            cities: cityDocument.cities
        )
    }

    /// Decodes both legacy 8-column v1 rows and forward-compatible rows with
    /// source-native astrometry appended after spectral type.
    public static func decodeBrightStars(from data: Data) throws -> [CatalogStar] {
        try decodeBrightStars(from: data, using: JSONDecoder())
    }

    private static func decodeBrightStars(
        from data: Data,
        using decoder: JSONDecoder
    ) throws -> [CatalogStar] {
        try decoder.decode(BrightStarDocument.self, from: data).stars
    }
}

private struct BrightStarDocument: Decodable {
    let schemaVersion: Int
    let epoch: String
    let stars: [CatalogStar]

    private enum CodingKeys: CodingKey {
        case schemaVersion
        case epoch
        case stars
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        epoch = try container.decode(String.self, forKey: .epoch)
        stars = try container.decode([CatalogStarRow].self, forKey: .stars).map(\.model)
    }
}

private struct CatalogStarRow: Decodable {
    let model: CatalogStar

    init(from decoder: Decoder) throws {
        var values = try decoder.unkeyedContainer()
        let hr = try values.decode(Int.self)
        let hd = try values.decodeIfPresent(Int.self)
        let rightAscension = try values.decode(Double.self)
        let declination = try values.decode(Double.self)
        let magnitude = try values.decode(Double.self)
        let bvColor = try values.decodeIfPresent(Double.self)
        let catalogName = try values.decodeIfPresent(String.self)
        let spectralType = try values.decodeIfPresent(String.self)
        let properMotionRightAscension = values.isAtEnd
            ? nil
            : try values.decodeIfPresent(Double.self)
        let properMotionDeclination = values.isAtEnd
            ? nil
            : try values.decodeIfPresent(Double.self)
        let parallax = values.isAtEnd
            ? nil
            : try values.decodeIfPresent(Double.self)
        let radialVelocity = values.isAtEnd
            ? nil
            : try values.decodeIfPresent(Double.self)
        let hasAstrometry =
            properMotionRightAscension != nil
            || properMotionDeclination != nil
            || parallax != nil
            || radialVelocity != nil
        model = CatalogStar(
            hr: hr,
            hd: hd,
            rightAscension: rightAscension,
            declination: declination,
            visualMagnitude: magnitude,
            bvColor: bvColor,
            catalogName: catalogName,
            spectralType: spectralType,
            astrometry: hasAstrometry
                ? StarAstrometry(
                    properMotionRightAscensionCosDeclinationArcsecondsPerYear:
                        properMotionRightAscension,
                    properMotionDeclinationArcsecondsPerYear:
                        properMotionDeclination,
                    parallaxArcseconds: parallax,
                    radialVelocityKilometersPerSecond: radialVelocity
                )
                : nil
        )
    }
}

private struct StarNameDocument: Decodable {
    let stars: [NamedStar]
}

private struct CityDocument: Decodable {
    let cities: [City]
}

private struct ConstellationDocument: Decodable {
    let constellations: [ConstellationRecord]
}

private struct ConstellationRecord: Decodable {
    let id: String
    let name: String
    let nameJa: String
    let segments: [[Int]]

    var model: Constellation {
        Constellation(
            id: id,
            name: name,
            nameJa: nameJa,
            segments: segments.compactMap { segment in
                guard segment.count == 2 else { return nil }
                return Constellation.Segment(startHR: segment[0], endHR: segment[1])
            }
        )
    }
}
