import Foundation

enum CurrentAtmosphereWeatherProvider:
    Hashable, Sendable
{
    case jmaObservation
    case openMeteoModel
}

struct CurrentAtmosphereWeatherStation:
    Hashable, Sendable
{
    let name: String
    let distanceKilometers: Double
    let elevationMeters: Double
}

struct CurrentAtmosphereWeather: Hashable, Sendable {
    let provider: CurrentAtmosphereWeatherProvider
    let pressureHPA: Double
    let temperatureCelsius: Double
    let relativeHumidityPercent: Double
    let observedAt: Date
    let station: CurrentAtmosphereWeatherStation?
}

protocol CurrentWeatherProviding: Sendable {
    func currentAtmosphere(
        latitude: Double,
        longitude: Double
    ) async throws -> CurrentAtmosphereWeather
}

struct ObservationFirstCurrentWeatherService:
    CurrentWeatherProviding
{
    private let observationProvider:
        any CurrentWeatherProviding
    private let modelProvider:
        any CurrentWeatherProviding

    init(
        observationProvider:
            any CurrentWeatherProviding =
            JMACurrentWeatherService(),
        modelProvider:
            any CurrentWeatherProviding =
            OpenMeteoCurrentWeatherService()
    ) {
        self.observationProvider =
            observationProvider
        self.modelProvider = modelProvider
    }

    func currentAtmosphere(
        latitude: Double,
        longitude: Double
    ) async throws -> CurrentAtmosphereWeather {
        do {
            return try await observationProvider
                .currentAtmosphere(
                    latitude: latitude,
                    longitude: longitude
                )
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            if Task.isCancelled {
                throw CancellationError()
            }
            return try await modelProvider
                .currentAtmosphere(
                    latitude: latitude,
                    longitude: longitude
                )
        }
    }
}

enum CurrentWeatherCoordinate {
    static let fractionDigits = 4

    static func formatted(_ value: Double) -> String {
        String(
            format: "%.*f",
            locale: Locale(identifier: "en_US_POSIX"),
            fractionDigits,
            value
        )
    }
}

typealias CurrentWeatherDataLoader = @Sendable (
    URLRequest
) async throws -> (Data, URLResponse)

final class CurrentWeatherNoRedirectDelegate:
    NSObject, URLSessionTaskDelegate, @unchecked Sendable
{
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response:
            HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

enum CurrentWeatherURLSessionFactory {
    static func makeEphemeral() -> URLSession {
        let configuration =
            URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        configuration.requestCachePolicy =
            .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 15
        return URLSession(
            configuration: configuration,
            delegate:
                CurrentWeatherNoRedirectDelegate(),
            delegateQueue: nil
        )
    }
}
