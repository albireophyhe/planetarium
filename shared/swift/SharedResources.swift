import Foundation

public enum SharedResource: String, CaseIterable, Sendable {
    case brightStars = "bright-stars.v1"
    case brightStarsV2 = "bright-stars.v2"
    case cities = "cities.v1"
    case constellations = "constellations.v1"
    case starNames = "star-names.v1"
    case truncatedEarthHeliocentricEphemeris =
        "truncated-earth-heliocentric.v1"
    case astronomyTestVectors = "astro-test-vectors.v1"
    case astronomyTestVectorsV2 = "astro-test-vectors.v2"
    case sofaDiurnalAberrationVectors =
        "sofa-diurnal-aberration.v1"
    case sofaSolarLightDeflectionVectors =
        "sofa-solar-light-deflection.v1"
    case sofaSolarPositionVectors = "sofa-solar-position.v1"
}

public enum IERSDUT1SharedResource: String, CaseIterable, Sendable {
    // Compatibility API: the integrated EOP resources are now the sole
    // bundled source for both DUT1 and polar motion.
    case manifest = "iers-finals2000a-eop.v1"
    case chunk41684 = "41684.v1"
    case chunk45780 = "45780.v1"
    case chunk49876 = "49876.v1"
    case chunk53972 = "53972.v1"
    case chunk58068 = "58068.v1"

    public var startMjdUtc: Int? {
        switch self {
        case .manifest:
            nil
        case .chunk41684:
            41_684
        case .chunk45780:
            45_780
        case .chunk49876:
            49_876
        case .chunk53972:
            53_972
        case .chunk58068:
            58_068
        }
    }

    public static func chunk(startMjdUtc: Int) -> Self? {
        allCases.first { $0.startMjdUtc == startMjdUtc }
    }
}

public enum IERSEarthOrientationSharedResource:
    String, CaseIterable, Sendable
{
    case manifest = "iers-finals2000a-eop.v1"
}

public enum SharedResourceError: LocalizedError, Sendable {
    case missing(SharedResource)
    case missingIERSDUT1(IERSDUT1SharedResource)
    case missingIERSEarthOrientation(
        IERSEarthOrientationSharedResource
    )
    case missingIERSEarthOrientationChunk(Int)

    public var errorDescription: String? {
        switch self {
        case let .missing(resource):
            "共有データ「\(resource.rawValue).json」を読み込めませんでした。"
        case let .missingIERSDUT1(resource):
            "IERS地球姿勢データ「\(resource.rawValue).json」を読み込めませんでした。"
        case let .missingIERSEarthOrientation(resource):
            "IERS地球姿勢データ「\(resource.rawValue).json」を読み込めませんでした。"
        case let .missingIERSEarthOrientationChunk(startMjdUtc):
            "IERS地球姿勢chunk「\(startMjdUtc).v1.json」を読み込めませんでした。"
        }
    }
}

public enum SharedResources {
    public static func data(for resource: SharedResource) throws -> Data {
        try Data(contentsOf: url(for: resource))
    }

    public static func url(for resource: SharedResource) throws -> URL {
        guard let url = resourceBundle.url(
            forResource: resource.rawValue,
            withExtension: "json"
        ) else {
            throw SharedResourceError.missing(resource)
        }
        return url
    }

    public static func iersDUT1Data(
        for resource: IERSDUT1SharedResource
    ) throws -> Data {
        try Data(contentsOf: iersDUT1URL(for: resource))
    }

    public static func iersDUT1URL(
        for resource: IERSDUT1SharedResource
    ) throws -> URL {
        guard let url = resourceBundle.url(
            forResource: resource.rawValue,
            withExtension: "json"
        ) else {
            throw SharedResourceError.missingIERSDUT1(resource)
        }
        return url
    }

    public static func iersEarthOrientationData(
        for resource: IERSEarthOrientationSharedResource
    ) throws -> Data {
        try Data(
            contentsOf:
                iersEarthOrientationURL(for: resource)
        )
    }

    public static func iersEarthOrientationURL(
        for resource: IERSEarthOrientationSharedResource
    ) throws -> URL {
        guard let url = resourceBundle.url(
            forResource: resource.rawValue,
            withExtension: "json"
        ) else {
            throw SharedResourceError
                .missingIERSEarthOrientation(resource)
        }
        return url
    }

    /**
     Loads a manifest-declared EOP chunk without a compiled-in chunk list.

     Packaging processes the complete `shared/eop/eop` directory, so a
     canonical manifest refresh can add a sixth (or later) chunk without a
     corresponding Swift enum or Package.swift edit.
     */
    public static func iersEarthOrientationChunkData(
        startMjdUtc: Int
    ) throws -> Data {
        try Data(
            contentsOf: iersEarthOrientationChunkURL(
                startMjdUtc: startMjdUtc
            )
        )
    }

    public static func iersEarthOrientationChunkURL(
        startMjdUtc: Int
    ) throws -> URL {
        guard let url = resourceBundle.url(
            forResource: "\(startMjdUtc).v1",
            withExtension: "json"
        ) else {
            throw SharedResourceError
                .missingIERSEarthOrientationChunk(
                    startMjdUtc
                )
        }
        return url
    }

    private static var resourceBundle: Bundle {
        if let resourcesURL = Bundle.main.resourceURL {
            let stagedURL = resourcesURL
                .appendingPathComponent("Planetarium_PlanetariumShared.bundle")
            if let stagedBundle = Bundle(url: stagedURL) {
                return stagedBundle
            }
        }
        return Bundle.module
    }
}
