import Foundation

public struct CatalogStar: Identifiable, Hashable, Sendable {
    public let hr: Int
    public let hd: Int?
    public let rightAscension: Double
    public let declination: Double
    public let visualMagnitude: Double
    public let bvColor: Double?
    public let catalogName: String?
    public let spectralType: String?
    public let astrometry: StarAstrometry?

    public var id: Int { hr }

    public init(
        hr: Int,
        hd: Int?,
        rightAscension: Double,
        declination: Double,
        visualMagnitude: Double,
        bvColor: Double?,
        catalogName: String?,
        spectralType: String?,
        astrometry: StarAstrometry? = nil
    ) {
        self.hr = hr
        self.hd = hd
        self.rightAscension = rightAscension
        self.declination = declination
        self.visualMagnitude = visualMagnitude
        self.bvColor = bvColor
        self.catalogName = catalogName
        self.spectralType = spectralType
        self.astrometry = astrometry
    }
}

public struct NamedStar: Codable, Identifiable, Hashable, Sendable {
    public let hr: Int
    public let name: String
    public let nameJa: String
    public let aliases: [String]
    public let constellation: String

    public var id: Int { hr }
}

public struct Constellation: Identifiable, Hashable, Sendable {
    public struct Segment: Hashable, Sendable {
        public let startHR: Int
        public let endHR: Int

        public init(startHR: Int, endHR: Int) {
            self.startHR = startHR
            self.endHR = endHR
        }
    }

    public let id: String
    public let name: String
    public let nameJa: String
    public let segments: [Segment]
}

public struct City: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let nameJa: String
    public let latitude: Double
    public let longitude: Double
    public let timeZone: String
}

public struct ObservingLocation: Hashable, Sendable {
    public let id: String
    public let name: String
    public let latitude: Double
    public let longitude: Double
    public let timeZoneIdentifier: String

    public init(
        id: String,
        name: String,
        latitude: Double,
        longitude: Double,
        timeZoneIdentifier: String
    ) {
        self.id = id
        self.name = name
        self.latitude = latitude
        self.longitude = longitude
        self.timeZoneIdentifier = timeZoneIdentifier
    }

    public init(city: City) {
        self.init(
            id: city.id,
            name: city.nameJa,
            latitude: city.latitude,
            longitude: city.longitude,
            timeZoneIdentifier: city.timeZone
        )
    }
}

public struct EquatorialCoordinates: Hashable, Sendable {
    public let rightAscension: Double
    public let declination: Double

    public init(rightAscension: Double, declination: Double) {
        self.rightAscension = rightAscension
        self.declination = declination
    }
}

public struct HorizontalCoordinates: Hashable, Sendable {
    public let altitude: Double
    public let azimuth: Double
    public let azimuthIsDefined: Bool

    public init(altitude: Double, azimuth: Double, azimuthIsDefined: Bool = true) {
        self.altitude = altitude
        self.azimuth = azimuth
        self.azimuthIsDefined = azimuthIsDefined
    }
}

public struct ProjectedPoint: Hashable, Sendable {
    public let x: Double
    public let y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

public struct SkyCatalog: Sendable {
    public let stars: [CatalogStar]
    public let starsByHR: [Int: CatalogStar]
    public let names: [NamedStar]
    public let namesByHR: [Int: NamedStar]
    public let constellations: [Constellation]
    public let cities: [City]

    public init(
        stars: [CatalogStar],
        names: [NamedStar],
        constellations: [Constellation],
        cities: [City]
    ) {
        self.stars = stars
        self.starsByHR = Dictionary(uniqueKeysWithValues: stars.map { ($0.hr, $0) })
        self.names = names
        self.namesByHR = Dictionary(uniqueKeysWithValues: names.map { ($0.hr, $0) })
        self.constellations = constellations
        self.cities = cities
    }
}

public struct RenderedStar: Identifiable, Hashable, Sendable {
    public let catalog: CatalogStar
    public let name: NamedStar?
    public let horizontal: HorizontalCoordinates
    public let projection: ProjectedPoint

    public var id: Int { catalog.hr }
    public var hr: Int { catalog.hr }
    public var isAboveHorizon: Bool { horizontal.altitude >= 0 }

    public init(
        catalog: CatalogStar,
        name: NamedStar?,
        horizontal: HorizontalCoordinates,
        projection: ProjectedPoint
    ) {
        self.catalog = catalog
        self.name = name
        self.horizontal = horizontal
        self.projection = projection
    }
}
