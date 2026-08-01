import Foundation

enum OpenMeteoCurrentWeatherError:
    LocalizedError, Equatable
{
    case invalidCoordinates
    case requestFailed
    case serverResponse(Int)
    case invalidResponse
    case unsupportedUnits
    case valuesOutOfRange
    case invalidTimestamp
    case staleTimestamp

    var errorDescription: String? {
        switch self {
        case .invalidCoordinates:
            "観測地点の座標を確認できませんでした。地点を選び直して、もう一度お試しください。"
        case .requestFailed:
            "天気情報を取得できませんでした。通信状態を確認して、もう一度お試しください。"
        case let .serverResponse(statusCode):
            "Open-Meteoから天気情報を取得できませんでした（HTTP \(statusCode)）。しばらくしてから、もう一度お試しください。"
        case .invalidResponse:
            "Open-Meteoの天気情報を確認できませんでした。もう一度お試しください。"
        case .unsupportedUnits:
            "Open-Meteoの気象値の単位を確認できませんでした。もう一度お試しください。"
        case .valuesOutOfRange:
            "取得した気象値が大気差モデルの対応範囲外でした。時間をおいて、もう一度お試しください。"
        case .invalidTimestamp:
            "取得した天気情報の時刻を確認できませんでした。もう一度お試しください。"
        case .staleTimestamp:
            "Open-Meteoの現在値の時刻が現在時刻から1時間を超えているため使用しませんでした。もう一度お試しください。"
        }
    }
}

struct OpenMeteoCurrentWeatherService:
    CurrentWeatherProviding
{
    private struct Response: Decodable {
        let utcOffsetSeconds: Int
        let currentUnits: CurrentUnits
        let current: Current

        enum CodingKeys: String, CodingKey {
            case utcOffsetSeconds =
                "utc_offset_seconds"
            case currentUnits = "current_units"
            case current
        }
    }

    private struct CurrentUnits: Decodable {
        let time: String
        let temperatureCelsius: String
        let relativeHumidityPercent: String
        let surfacePressure: String

        enum CodingKeys: String, CodingKey {
            case time
            case temperatureCelsius = "temperature_2m"
            case relativeHumidityPercent =
                "relative_humidity_2m"
            case surfacePressure = "surface_pressure"
        }
    }

    private struct Current: Decodable {
        let time: String
        let temperatureCelsius: Double
        let relativeHumidityPercent: Double
        let surfacePressure: Double

        enum CodingKeys: String, CodingKey {
            case time
            case temperatureCelsius = "temperature_2m"
            case relativeHumidityPercent =
                "relative_humidity_2m"
            case surfacePressure = "surface_pressure"
        }
    }

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
        let request = try request(
            latitude: latitude,
            longitude: longitude
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
            throw OpenMeteoCurrentWeatherError
                .requestFailed
        }
        try Task.checkCancellation()

        guard let httpResponse = response as? HTTPURLResponse
        else {
            throw OpenMeteoCurrentWeatherError
                .invalidResponse
        }
        guard httpResponse.statusCode == 200 else {
            throw OpenMeteoCurrentWeatherError
                .serverResponse(
                    httpResponse.statusCode
                )
        }
        guard
            httpResponse.url == request.url,
            httpResponse.mimeType == "application/json",
            data.count <= 65_536
        else {
            throw OpenMeteoCurrentWeatherError
                .invalidResponse
        }

        let decoded: Response
        do {
            decoded = try JSONDecoder().decode(
                Response.self,
                from: data
            )
        } catch {
            throw OpenMeteoCurrentWeatherError
                .invalidResponse
        }

        guard
            decoded.utcOffsetSeconds == 0,
            decoded.currentUnits.time == "iso8601",
            decoded.currentUnits
                .temperatureCelsius == "°C",
            decoded.currentUnits
                .relativeHumidityPercent == "%",
            decoded.currentUnits
                .surfacePressure == "hPa"
        else {
            throw OpenMeteoCurrentWeatherError
                .unsupportedUnits
        }

        let current = decoded.current
        guard
            current.surfacePressure.isFinite,
            current.surfacePressure >= 300,
            current.surfacePressure <= 1_100,
            current.temperatureCelsius.isFinite,
            (-100 ... 60).contains(
                current.temperatureCelsius
            ),
            current.relativeHumidityPercent.isFinite,
            (0 ... 100).contains(
                current.relativeHumidityPercent
            )
        else {
            throw OpenMeteoCurrentWeatherError
                .valuesOutOfRange
        }

        guard let observedAt = Self.utcDate(
            from: current.time
        ) else {
            throw OpenMeteoCurrentWeatherError
                .invalidTimestamp
        }
        guard
            abs(
                clock().timeIntervalSince(observedAt)
            ) <= 60 * 60
        else {
            throw OpenMeteoCurrentWeatherError
                .staleTimestamp
        }

        return CurrentAtmosphereWeather(
            provider: .openMeteoModel,
            pressureHPA: current.surfacePressure,
            temperatureCelsius:
                current.temperatureCelsius,
            relativeHumidityPercent:
                current.relativeHumidityPercent,
            observedAt: observedAt,
            station: nil
        )
    }

    private func request(
        latitude: Double,
        longitude: Double
    ) throws -> URLRequest {
        guard
            latitude.isFinite,
            longitude.isFinite,
            (-90 ... 90).contains(latitude),
            (-180 ... 180).contains(longitude)
        else {
            throw OpenMeteoCurrentWeatherError
                .invalidCoordinates
        }

        var components = URLComponents()
        components.scheme = "https"
        components.host = "api.open-meteo.com"
        components.path = "/v1/forecast"
        components.queryItems = [
            URLQueryItem(
                name: "latitude",
                value:
                    CurrentWeatherCoordinate
                    .formatted(latitude)
            ),
            URLQueryItem(
                name: "longitude",
                value:
                    CurrentWeatherCoordinate
                    .formatted(longitude)
            ),
            URLQueryItem(
                name: "current",
                value:
                    "temperature_2m,"
                    + "relative_humidity_2m,"
                    + "surface_pressure"
            ),
            URLQueryItem(
                name: "timezone",
                value: "UTC"
            ),
            URLQueryItem(
                name: "forecast_days",
                value: "1"
            ),
        ]
        guard let url = components.url else {
            throw OpenMeteoCurrentWeatherError
                .invalidCoordinates
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 10
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue(
            "application/json",
            forHTTPHeaderField: "Accept"
        )
        return request
    }

    private static func utcDate(
        from value: String
    ) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
        ]
        if let date = formatter.date(
            from: value + "Z"
        ) ?? formatter.date(from: value) {
            return date
        }

        let minuteFormatter = DateFormatter()
        minuteFormatter.calendar = Calendar(
            identifier: .gregorian
        )
        minuteFormatter.locale = Locale(
            identifier: "en_US_POSIX"
        )
        minuteFormatter.timeZone = TimeZone(
            secondsFromGMT: 0
        )
        minuteFormatter.dateFormat =
            "yyyy-MM-dd'T'HH:mm"
        minuteFormatter.isLenient = false
        if let date = minuteFormatter.date(
            from: value
        ) {
            return date
        }

        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        return formatter.date(from: value + "Z")
            ?? formatter.date(from: value)
    }
}
