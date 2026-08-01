import Foundation

enum JMACurrentWeatherError:
    LocalizedError, Equatable
{
    case invalidCoordinates
    case requestFailed
    case serverResponse(Int)
    case invalidResponse
    case staleObservation
    case noUsableObservation

    var errorDescription: String? {
        switch self {
        case .invalidCoordinates:
            "観測地点の座標を確認できませんでした。"
        case .requestFailed:
            "気象庁の観測値を取得できませんでした。"
        case let .serverResponse(statusCode):
            "気象庁の観測値を取得できませんでした（HTTP \(statusCode)）。"
        case .invalidResponse:
            "気象庁の観測値を確認できませんでした。"
        case .staleObservation:
            "気象庁の最新観測時刻が現在時刻の許容範囲外でした。"
        case .noUsableObservation:
            "25 km以内に気圧・気温・湿度がそろった気象庁観測所がありませんでした。"
        }
    }
}

struct JMACurrentWeatherService:
    CurrentWeatherProviding
{
    private struct StationMetadata: Decodable {
        let latitude: [Double]
        let longitude: [Double]
        let elevationMeters: Double
        let name: String

        enum CodingKeys: String, CodingKey {
            case latitude = "lat"
            case longitude = "lon"
            case elevationMeters = "alt"
            case name = "kjName"
        }
    }

    private struct StationObservation: Decodable {
        let pressure: [Double?]?
        let temperature: [Double?]?
        let humidity: [Double?]?

        enum CodingKeys: String, CodingKey {
            case pressure
            case temperature = "temp"
            case humidity
        }
    }

    private struct ValidatedStation: Sendable {
        let id: String
        let name: String
        let latitude: Double
        let longitude: Double
        let elevationMeters: Double
    }

    private struct ObservationTimestamp: Sendable {
        let observedAt: Date
        let pathComponent: String
    }

    private static let origin = "https://www.jma.go.jp"
    private static let latestPath =
        "/bosai/amedas/data/latest_time.txt"
    private static let stationPath =
        "/bosai/amedas/const/amedastable.json"
    private static let maximumStationDistanceKilometers = 25.0
    private static let maximumAgeSeconds = 30.0 * 60.0
    private static let maximumFutureSkewSeconds = 5.0 * 60.0

    private let dataLoader: CurrentWeatherDataLoader
    private let clock: @Sendable () -> Date

    init(clock: @escaping @Sendable () -> Date = Date.init) {
        self.init(
            clock: clock,
            session:
                CurrentWeatherURLSessionFactory
                .makeEphemeral()
        )
    }

    init(
        clock: @escaping @Sendable () -> Date = Date.init,
        session: URLSession
    ) {
        self.clock = clock
        dataLoader = { request in
            try await session.data(for: request)
        }
    }

    init(
        clock: @escaping @Sendable () -> Date = Date.init,
        dataLoader:
            @escaping CurrentWeatherDataLoader
    ) {
        self.clock = clock
        self.dataLoader = dataLoader
    }

    func currentAtmosphere(
        latitude: Double,
        longitude: Double
    ) async throws -> CurrentAtmosphereWeather {
        guard
            latitude.isFinite,
            longitude.isFinite,
            (-90 ... 90).contains(latitude),
            (-180 ... 180).contains(longitude)
        else {
            throw JMACurrentWeatherError
                .invalidCoordinates
        }

        let latestURL = try fixedURL(
            path: Self.latestPath
        )
        let latestData = try await load(
            url: latestURL,
            acceptedMIMEType: "text/plain",
            maximumBytes: 128
        )
        let timestamp = try Self.parseTimestamp(
            latestData
        )
        let observationAge = clock()
            .timeIntervalSince(timestamp.observedAt)
        guard
            observationAge
                >= -Self.maximumFutureSkewSeconds,
            observationAge <= Self.maximumAgeSeconds
        else {
            throw JMACurrentWeatherError
                .staleObservation
        }

        let stationURL = try fixedURL(
            path: Self.stationPath
        )
        let observationURL = try fixedURL(
            path:
                "/bosai/amedas/data/map/"
                + timestamp.pathComponent
                + ".json"
        )

        async let stationData = load(
            url: stationURL,
            acceptedMIMEType: "application/json",
            maximumBytes: 524_288
        )
        async let observationData = load(
            url: observationURL,
            acceptedMIMEType: "application/json",
            maximumBytes: 1_572_864
        )
        let (loadedStations, loadedObservations) =
            try await (stationData, observationData)

        let stations = try Self.decodeStations(
            loadedStations
        )
        let observations = try Self.decodeObservations(
            loadedObservations
        )

        var best:
            (
                station: ValidatedStation,
                distanceKilometers: Double,
                pressureHPA: Double,
                temperatureCelsius: Double,
                relativeHumidityPercent: Double
            )?

        for station in stations {
            guard
                let observation = observations[
                    station.id
                ],
                let pressureHPA = Self.measurement(
                    observation.pressure,
                    range: 300 ... 1_100
                ),
                let temperatureCelsius = Self.measurement(
                    observation.temperature,
                    range: -100 ... 60
                ),
                let relativeHumidityPercent = Self.measurement(
                    observation.humidity,
                    range: 0 ... 100
                )
            else {
                continue
            }

            let distance = Self.haversineKilometers(
                latitude1: latitude,
                longitude1: longitude,
                latitude2: station.latitude,
                longitude2: station.longitude
            )
            guard
                distance.isFinite,
                distance <= Self
                    .maximumStationDistanceKilometers
            else {
                continue
            }
            if let best {
                guard
                    distance
                        < best.distanceKilometers
                        || (
                            distance
                                == best.distanceKilometers
                                && station.id
                                    < best.station.id
                        )
                else {
                    continue
                }
            }
            best = (
                station,
                distance,
                pressureHPA,
                temperatureCelsius,
                relativeHumidityPercent
            )
        }

        guard let best else {
            throw JMACurrentWeatherError
                .noUsableObservation
        }

        return CurrentAtmosphereWeather(
            provider: .jmaObservation,
            pressureHPA: best.pressureHPA,
            temperatureCelsius:
                best.temperatureCelsius,
            relativeHumidityPercent:
                best.relativeHumidityPercent,
            observedAt: timestamp.observedAt,
            station: CurrentAtmosphereWeatherStation(
                name: best.station.name,
                distanceKilometers:
                    best.distanceKilometers,
                elevationMeters:
                    best.station.elevationMeters
            )
        )
    }

    private func load(
        url: URL,
        acceptedMIMEType: String,
        maximumBytes: Int
    ) async throws -> Data {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 10
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue(
            acceptedMIMEType,
            forHTTPHeaderField: "Accept"
        )

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await dataLoader(
                request
            )
        } catch {
            if Task.isCancelled
                || error is CancellationError
            {
                throw CancellationError()
            }
            throw JMACurrentWeatherError
                .requestFailed
        }
        try Task.checkCancellation()

        guard let httpResponse = response as? HTTPURLResponse
        else {
            throw JMACurrentWeatherError
                .invalidResponse
        }
        guard httpResponse.statusCode == 200 else {
            throw JMACurrentWeatherError
                .serverResponse(
                    httpResponse.statusCode
                )
        }
        guard
            httpResponse.url == url,
            httpResponse.mimeType == acceptedMIMEType,
            data.count <= maximumBytes
        else {
            throw JMACurrentWeatherError
                .invalidResponse
        }
        return data
    }

    private func fixedURL(path: String) throws -> URL {
        guard
            path.hasPrefix("/bosai/amedas/"),
            !path.contains("?"),
            let url = URL(
                string: Self.origin + path
            ),
            url.scheme == "https",
            url.host == "www.jma.go.jp",
            url.query == nil,
            url.fragment == nil
        else {
            throw JMACurrentWeatherError
                .invalidResponse
        }
        return url
    }

    private static func parseTimestamp(
        _ data: Data
    ) throws -> ObservationTimestamp {
        guard
            let raw = String(
                data: data,
                encoding: .utf8
            )
        else {
            throw JMACurrentWeatherError
                .invalidResponse
        }
        let value = raw.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        let bytes = Array(value.utf8)
        guard bytes.count == 25 else {
            throw JMACurrentWeatherError
                .invalidResponse
        }

        let literals: [Int: UInt8] = [
            4: 45,
            7: 45,
            10: 84,
            13: 58,
            16: 58,
            19: 43,
            22: 58,
        ]
        for (index, literal) in literals {
            guard bytes[index] == literal else {
                throw JMACurrentWeatherError
                    .invalidResponse
            }
        }
        for index in bytes.indices
        where literals[index] == nil {
            guard (48 ... 57).contains(bytes[index]) else {
                throw JMACurrentWeatherError
                    .invalidResponse
            }
        }
        guard
            bytes[17] == 48,
            bytes[18] == 48,
            bytes[20] == 48,
            bytes[21] == 57,
            bytes[23] == 48,
            bytes[24] == 48,
            let minute = Int(
                String(
                    decoding: bytes[14 ... 15],
                    as: UTF8.self
                )
            ),
            minute % 10 == 0
        else {
            throw JMACurrentWeatherError
                .invalidResponse
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
        ]
        guard let observedAt = formatter.date(
            from: value
        ) else {
            throw JMACurrentWeatherError
                .invalidResponse
        }

        var pathBytes: [UInt8] = []
        pathBytes.reserveCapacity(14)
        pathBytes.append(contentsOf: bytes[0 ... 3])
        pathBytes.append(contentsOf: bytes[5 ... 6])
        pathBytes.append(contentsOf: bytes[8 ... 9])
        pathBytes.append(contentsOf: bytes[11 ... 12])
        pathBytes.append(contentsOf: bytes[14 ... 15])
        pathBytes.append(48)
        pathBytes.append(48)
        return ObservationTimestamp(
            observedAt: observedAt,
            pathComponent: String(
                decoding: pathBytes,
                as: UTF8.self
            )
        )
    }

    private static func decodeStations(
        _ data: Data
    ) throws -> [ValidatedStation] {
        let decoded: [String: StationMetadata]
        do {
            decoded = try JSONDecoder().decode(
                [String: StationMetadata].self,
                from: data
            )
        } catch {
            throw JMACurrentWeatherError
                .invalidResponse
        }

        return try decoded.map { id, station in
            guard
                id.utf8.count == 5,
                id.utf8.allSatisfy({
                    (48 ... 57).contains($0)
                }),
                station.latitude.count == 2,
                station.longitude.count == 2,
                station.elevationMeters.isFinite,
                (-500 ... 10_000).contains(
                    station.elevationMeters
                ),
                !station.name.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ).isEmpty,
                let latitude = coordinate(
                    station.latitude,
                    maximumDegrees: 90
                ),
                let longitude = coordinate(
                    station.longitude,
                    maximumDegrees: 180
                )
            else {
                throw JMACurrentWeatherError
                    .invalidResponse
            }
            return ValidatedStation(
                id: id,
                name: station.name,
                latitude: latitude,
                longitude: longitude,
                elevationMeters:
                    station.elevationMeters
            )
        }
    }

    private static func decodeObservations(
        _ data: Data
    ) throws -> [String: StationObservation] {
        let decoded: [String: StationObservation]
        do {
            decoded = try JSONDecoder().decode(
                [String: StationObservation].self,
                from: data
            )
        } catch {
            throw JMACurrentWeatherError
                .invalidResponse
        }

        for observation in decoded.values {
            for measurement in [
                observation.pressure,
                observation.temperature,
                observation.humidity,
            ] where measurement != nil {
                guard measurement?.count == 2 else {
                    throw JMACurrentWeatherError
                        .invalidResponse
                }
            }
        }
        return decoded
    }

    private static func coordinate(
        _ components: [Double],
        maximumDegrees: Double
    ) -> Double? {
        guard
            components.count == 2,
            components[0].isFinite,
            components[1].isFinite,
            components[0].rounded() == components[0],
            (-maximumDegrees ... maximumDegrees)
                .contains(components[0]),
            (0 ..< 60).contains(components[1])
        else {
            return nil
        }
        let sign = components[0] < 0 ? -1.0 : 1.0
        let value = components[0]
            + sign * components[1] / 60
        return (-maximumDegrees ... maximumDegrees)
            .contains(value)
            ? value
            : nil
    }

    private static func measurement(
        _ components: [Double?]?,
        range: ClosedRange<Double>
    ) -> Double? {
        guard
            let components,
            components.count == 2,
            let value = components[0],
            let quality = components[1],
            value.isFinite,
            quality.isFinite,
            quality == 0,
            range.contains(value)
        else {
            return nil
        }
        return value
    }

    private static func haversineKilometers(
        latitude1: Double,
        longitude1: Double,
        latitude2: Double,
        longitude2: Double
    ) -> Double {
        let radians = Double.pi / 180
        let phi1 = latitude1 * radians
        let phi2 = latitude2 * radians
        let deltaPhi = (latitude2 - latitude1)
            * radians
        let deltaLambda = (longitude2 - longitude1)
            * radians
        let a = sin(deltaPhi / 2)
            * sin(deltaPhi / 2)
            + cos(phi1) * cos(phi2)
            * sin(deltaLambda / 2)
            * sin(deltaLambda / 2)
        let angle = 2 * atan2(
            sqrt(a),
            sqrt(max(0, 1 - a))
        )
        return 6_371.0088 * angle
    }
}
