import Foundation

public enum SharedResource: String, CaseIterable, Sendable {
    case brightStarsV2 = "bright-stars.v2"
    case cities = "cities.v1"
    case constellations = "constellations.v1"
    case starNames = "star-names.v1"
    case truncatedEarthHeliocentricEphemeris =
        "truncated-earth-heliocentric.v1"
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

public enum DE442SEphemerisSharedResource:
    String, CaseIterable, Sendable
{
    case manifest = "de442s-manifest.v1"
}

public enum EventCandidateSharedResource:
    String, CaseIterable, Sendable
{
    case manifest = "event-candidates-manifest.v1"
}

public enum SharedResourceError: LocalizedError, Sendable {
    case missing(SharedResource)
    case missingIERSDUT1(IERSDUT1SharedResource)
    case missingIERSEarthOrientation(
        IERSEarthOrientationSharedResource
    )
    case missingIERSEarthOrientationChunk(Int)
    case missingDE442SEphemeris(
        DE442SEphemerisSharedResource
    )
    case invalidDE442SEphemerisChunkName(String)
    case missingDE442SEphemerisChunk(String)
    case missingEventCandidates(EventCandidateSharedResource)
    case invalidEventCandidateChunkName(String)
    case missingEventCandidateChunk(String)

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
        case let .missingDE442SEphemeris(resource):
            "DE442s共有暦「\(resource.rawValue).json」を読み込めませんでした。"
        case let .invalidDE442SEphemerisChunkName(fileName):
            "DE442s共有暦chunk名「\(fileName)」が不正です。"
        case let .missingDE442SEphemerisChunk(fileName):
            "DE442s共有暦chunk「\(fileName)」を読み込めませんでした。"
        case let .missingEventCandidates(resource):
            "天文現象候補「\(resource.rawValue).json」を読み込めませんでした。"
        case let .invalidEventCandidateChunkName(fileName):
            "天文現象候補chunk名「\(fileName)」が不正です。"
        case let .missingEventCandidateChunk(fileName):
            "天文現象候補chunk「\(fileName)」を読み込めませんでした。"
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

    public static func de442sEphemerisData(
        for resource: DE442SEphemerisSharedResource
    ) throws -> Data {
        try Data(
            contentsOf: de442sEphemerisURL(for: resource)
        )
    }

    public static func de442sEphemerisURL(
        for resource: DE442SEphemerisSharedResource
    ) throws -> URL {
        guard let url = resourceBundle.url(
            forResource: resource.rawValue,
            withExtension: "json"
        ) else {
            throw SharedResourceError
                .missingDE442SEphemeris(resource)
        }
        return url
    }

    /**
     Resolves a manifest-declared five-year DE442s chunk.

     Only a basename such as `2025-2030.v1.bin` is accepted. This prevents a
     malformed manifest value from escaping the bundled `chunks` directory.
     */
    public static func de442sEphemerisChunkData(
        named fileName: String
    ) throws -> Data {
        try Data(
            contentsOf: de442sEphemerisChunkURL(
                named: fileName
            )
        )
    }

    public static func de442sEphemerisChunkURL(
        named fileName: String
    ) throws -> URL {
        let fileURL = URL(fileURLWithPath: fileName)
        guard
            fileURL.lastPathComponent == fileName,
            fileURL.pathExtension == "bin",
            fileURL.deletingPathExtension()
                .lastPathComponent
                .hasSuffix(".v1"),
            !fileName.isEmpty
        else {
            throw SharedResourceError
                .invalidDE442SEphemerisChunkName(fileName)
        }
        let resourceName = fileURL
            .deletingPathExtension()
            .lastPathComponent
        guard let url = resourceBundle.url(
            forResource: resourceName,
            withExtension: "bin",
            subdirectory: "chunks"
        ) else {
            throw SharedResourceError
                .missingDE442SEphemerisChunk(fileName)
        }
        return url
    }

    public static func eventCandidateData(
        for resource: EventCandidateSharedResource
    ) throws -> Data {
        try Data(contentsOf: eventCandidateURL(for: resource))
    }

    public static func eventCandidateURL(
        for resource: EventCandidateSharedResource
    ) throws -> URL {
        guard let url = resourceBundle.url(
            forResource: resource.rawValue,
            withExtension: "json",
            subdirectory: "events"
        ) else {
            throw SharedResourceError
                .missingEventCandidates(resource)
        }
        return url
    }

    public static func eventCandidateChunkData(
        named fileName: String
    ) throws -> Data {
        try Data(
            contentsOf: eventCandidateChunkURL(
                named: fileName
            )
        )
    }

    public static func eventCandidateChunkURL(
        named fileName: String
    ) throws -> URL {
        let fileURL = URL(fileURLWithPath: fileName)
        let stem = fileURL
            .deletingPathExtension()
            .lastPathComponent
        let id = String(stem.dropLast(3))
        let yearParts = id.split(separator: "-", omittingEmptySubsequences: false)
        guard
            fileURL.lastPathComponent == fileName,
            fileURL.pathExtension == "json",
            stem.hasSuffix(".v1"),
            yearParts.count == 2,
            yearParts.allSatisfy({
                $0.count == 4 && $0.allSatisfy(\.isNumber)
            }),
            fileName == "\(id).v1.json"
        else {
            throw SharedResourceError
                .invalidEventCandidateChunkName(fileName)
        }
        guard let url = resourceBundle.url(
            forResource: stem,
            withExtension: "json",
            subdirectory: "events/chunks"
        ) else {
            throw SharedResourceError
                .missingEventCandidateChunk(fileName)
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
