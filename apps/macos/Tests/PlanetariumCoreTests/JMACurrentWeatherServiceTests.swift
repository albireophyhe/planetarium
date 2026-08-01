import Foundation
import PlanetariumCore
import XCTest

@testable import Planetarium

final class JMACurrentWeatherServiceTests:
    XCTestCase
{
    func testUsesNearestTokyoObservationAndLocalPressureWithoutCoordinatesInURLs()
        async throws
    {
        let recorder = WeatherRequestRecorder()
        let service = makeService(
            stations: twoTokyoStations,
            observations:
                """
                {
                  "44132": {
                    "pressure": [1001.2, 0],
                    "normalPressure": [1016.8, 0],
                    "temp": [28.4, 0],
                    "humidity": [72, 0]
                  },
                  "44136": {
                    "pressure": [1002.1, 0],
                    "normalPressure": [1017.3, 0],
                    "temp": [27.8, 0],
                    "humidity": [75, 0]
                  }
                }
                """,
            recorder: recorder
        )

        let weather = try await service
            .currentAtmosphere(
                latitude: 35.6812,
                longitude: 139.7671
            )

        XCTAssertEqual(weather.provider, .jmaObservation)
        XCTAssertEqual(weather.pressureHPA, 1_001.2)
        XCTAssertNotEqual(weather.pressureHPA, 1_016.8)
        XCTAssertEqual(weather.temperatureCelsius, 28.4)
        XCTAssertEqual(
            weather.relativeHumidityPercent,
            72
        )
        XCTAssertEqual(
            weather.observedAt,
            try date("2026-08-01T00:00:00Z")
        )
        let station = try XCTUnwrap(weather.station)
        XCTAssertEqual(station.name, "東京")
        XCTAssertEqual(station.elevationMeters, 25)
        XCTAssertLessThan(
            station.distanceKilometers,
            5
        )

        let requests = await recorder.requests
        XCTAssertEqual(requests.count, 3)
        XCTAssertEqual(
            Set(requests.compactMap { $0.url?.path }),
            Set([
                "/bosai/amedas/data/latest_time.txt",
                "/bosai/amedas/const/amedastable.json",
                "/bosai/amedas/data/map/20260801090000.json",
            ])
        )
        for request in requests {
            let url = try XCTUnwrap(request.url)
            XCTAssertEqual(url.scheme, "https")
            XCTAssertEqual(url.host, "www.jma.go.jp")
            XCTAssertNil(url.query)
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertFalse(
                url.absoluteString.contains("35.6812")
            )
            XCTAssertFalse(
                url.absoluteString.contains("139.7671")
            )
        }
    }

    func testSkipsBadQualityAndUsesNextNearestStation()
        async throws
    {
        let service = makeService(
            stations: twoTokyoStations,
            observations:
                """
                {
                  "44132": {
                    "pressure": [1001.2, 1],
                    "temp": [28.4, 0],
                    "humidity": [72, 0]
                  },
                  "44136": {
                    "pressure": [1002.1, 0],
                    "temp": [27.8, 0],
                    "humidity": [75, 0]
                  }
                }
                """
        )

        let weather = try await service
            .currentAtmosphere(
                latitude: 35.6812,
                longitude: 139.7671
            )

        XCTAssertEqual(weather.station?.name, "江戸川臨海")
        XCTAssertEqual(weather.pressureHPA, 1_002.1)
    }

    func testBadQualityFallsBackToModel() async throws {
        let observation = makeService(
            stations: tokyoStation,
            observations:
                """
                {"44132":{"pressure":[1001.2,1],"temp":[28.4,0],"humidity":[72,0]}}
                """
        )
        let weather = try await fallbackService(
            observation
        ).currentAtmosphere(
            latitude: 35.6812,
            longitude: 139.7671
        )

        XCTAssertEqual(weather.provider, .openMeteoModel)
    }

    func testMissingMeasurementFallsBackToModel()
        async throws
    {
        let observation = makeService(
            stations: tokyoStation,
            observations:
                """
                {"44132":{"pressure":[1001.2,0],"temp":[28.4,0]}}
                """
        )
        let weather = try await fallbackService(
            observation
        ).currentAtmosphere(
            latitude: 35.6812,
            longitude: 139.7671
        )

        XCTAssertEqual(weather.provider, .openMeteoModel)
    }

    func testImplausiblyLowPressureFallsBackToModel()
        async throws
    {
        let observation = makeService(
            stations: tokyoStation,
            observations:
                """
                {"44132":{"pressure":[299.9,0],"temp":[28.4,0],"humidity":[72,0]}}
                """
        )
        let weather = try await fallbackService(
            observation
        ).currentAtmosphere(
            latitude: 35.6812,
            longitude: 139.7671
        )

        XCTAssertEqual(weather.provider, .openMeteoModel)
    }

    func testStationBeyondTwentyFiveKilometersFallsBackToModel()
        async throws
    {
        let observation = makeService(
            stations:
                """
                {"62078":{"lat":[34,41.0],"lon":[135,31.0],"alt":23,"kjName":"大阪"}}
                """,
            observations:
                """
                {"62078":{"pressure":[1004.4,0],"temp":[30.1,0],"humidity":[68,0]}}
                """
        )
        let weather = try await fallbackService(
            observation
        ).currentAtmosphere(
            latitude: 35.6812,
            longitude: 139.7671
        )

        XCTAssertEqual(weather.provider, .openMeteoModel)
    }

    func testTwentyFiveKilometerDistanceBoundary()
        async throws
    {
        let validObservation =
            """
            {"44132":{"pressure":[1001.2,0],"temp":[28.4,0],"humidity":[72,0]}}
            """
        let inside = makeService(
            stations:
                """
                {"44132":{"lat":[35,13.45],"lon":[139,0.0],"alt":25,"kjName":"25km内"}}
                """,
            observations: validObservation
        )
        let insideWeather = try await inside
            .currentAtmosphere(
                latitude: 35,
                longitude: 139
            )
        XCTAssertEqual(
            insideWeather.provider,
            .jmaObservation
        )
        XCTAssertLessThan(
            try XCTUnwrap(
                insideWeather.station?
                    .distanceKilometers
            ),
            25
        )

        let outside = makeService(
            stations:
                """
                {"44132":{"lat":[35,13.55],"lon":[139,0.0],"alt":25,"kjName":"25km外"}}
                """,
            observations: validObservation
        )
        let outsideWeather = try await fallbackService(
            outside
        ).currentAtmosphere(
            latitude: 35,
            longitude: 139
        )
        XCTAssertEqual(
            outsideWeather.provider,
            .openMeteoModel
        )
    }

    func testObservationOlderThanThirtyMinutesFallsBackToModel()
        async throws
    {
        let observation = makeService(
            stations: tokyoStation,
            observations: validTokyoObservation,
            now: try date("2026-08-01T00:30:01Z")
        )
        let weather = try await fallbackService(
            observation
        ).currentAtmosphere(
            latitude: 35.6812,
            longitude: 139.7671
        )

        XCTAssertEqual(weather.provider, .openMeteoModel)
    }

    func testObservationMoreThanFiveMinutesInFutureFallsBackToModel()
        async throws
    {
        let observation = makeService(
            stations: tokyoStation,
            observations: validTokyoObservation,
            now: try date("2026-07-31T23:54:59Z")
        )
        let weather = try await fallbackService(
            observation
        ).currentAtmosphere(
            latitude: 35.6812,
            longitude: 139.7671
        )

        XCTAssertEqual(weather.provider, .openMeteoModel)
    }

    func testLatestTimestampRequiresExactJSTTenMinuteForm()
        async
    {
        for invalidTimestamp in [
            "2026-08-01T00:00:00Z",
            "2026-08-01T09:05:00+09:00",
        ] {
            let service = makeService(
                stations: tokyoStation,
                observations: validTokyoObservation,
                latestTime: invalidTimestamp
            )
            do {
                _ = try await service.currentAtmosphere(
                    latitude: 35.6812,
                    longitude: 139.7671
                )
                XCTFail("厳密でない時刻形式を拒否する必要があります")
            } catch {
                XCTAssertEqual(
                    error as? JMACurrentWeatherError,
                    .invalidResponse
                )
            }
        }
    }

    func testLatestResponseSizeIsBounded() async {
        let oversized = String(
            repeating: "0",
            count: 129
        )
        let service = makeService(
            stations: tokyoStation,
            observations: validTokyoObservation,
            latestTime: oversized
        )
        do {
            _ = try await service.currentAtmosphere(
                latitude: 35.6812,
                longitude: 139.7671
            )
            XCTFail("サイズ上限を超えた応答を拒否する必要があります")
        } catch {
            XCTAssertEqual(
                error as? JMACurrentWeatherError,
                .invalidResponse
            )
        }
    }

    func testStationDegreesComponentMustBeInteger()
        async
    {
        let service = makeService(
            stations:
                """
                {"44132":{"lat":[35.5,41.4],"lon":[139,45.6],"alt":25,"kjName":"不正局"}}
                """,
            observations: validTokyoObservation
        )
        do {
            _ = try await service.currentAtmosphere(
                latitude: 35.6812,
                longitude: 139.7671
            )
            XCTFail("度成分の小数を拒否する必要があります")
        } catch {
            XCTAssertEqual(
                error as? JMACurrentWeatherError,
                .invalidResponse
            )
        }
    }

    func testJMACommunicationFailureFallsBackToModel()
        async throws
    {
        let observation = StubWeatherProvider {
            _, _ in
            throw JMACurrentWeatherError.requestFailed
        }
        let weather = try await fallbackService(
            observation
        ).currentAtmosphere(
            latitude: 35.6812,
            longitude: 139.7671
        )

        XCTAssertEqual(weather.provider, .openMeteoModel)
    }

    func testCancellationDoesNotStartModelFallback()
        async
    {
        let fallbackCalls = WeatherCallCounter()
        let observation = StubWeatherProvider {
            _, _ in
            try await Task.sleep(for: .seconds(30))
            throw JMACurrentWeatherError.requestFailed
        }
        let model = StubWeatherProvider { _, _ in
            await fallbackCalls.increment()
            return Self.modelWeather
        }
        let service = ObservationFirstCurrentWeatherService(
            observationProvider: observation,
            modelProvider: model
        )
        let task = Task {
            try await service.currentAtmosphere(
                latitude: 35,
                longitude: 139
            )
        }
        task.cancel()

        do {
            _ = try await task.value
            XCTFail("キャンセルが伝播する必要があります")
        } catch is CancellationError {
            // Expected.
        } catch {
            XCTFail("予期しないエラー：\(error)")
        }
        let fallbackCallCount = await fallbackCalls.value
        XCTAssertEqual(fallbackCallCount, 0)
    }

    @MainActor
    func testFailedWeatherApplicationKeepsExistingConfiguration()
        throws
    {
        let store = SkyStore(
            catalogLoader: {
                SkyCatalog(
                    stars: [],
                    names: [],
                    constellations: [],
                    cities: []
                )
            },
            earthOrientationServiceLoader: {
                throw TestFailure.unavailable
            },
            now: Date(
                timeIntervalSince1970: 1_785_456_000
            )
        )
        store.applyStandardAtmosphericRefraction()
        let previous = store.appliedAtmosphericRefraction
        let previousManual = store.lastManualAtmosphere
        let previousStatus = store.statusMessage
        var draft = AtmosphericRefractionDraft(
            inputSource: .manual
        )
        draft.wavelengthMicrometers = "invalid"

        XCTAssertThrowsError(
            try AtmosphericWeatherApplicator.apply(
                Self.observationWeather,
                preserving: draft,
                to: store
            )
        )
        XCTAssertEqual(
            store.appliedAtmosphericRefraction,
            previous
        )
        XCTAssertEqual(
            store.lastManualAtmosphere,
            previousManual
        )
        XCTAssertEqual(store.statusMessage, previousStatus)
    }

    private func makeService(
        stations: String,
        observations: String,
        latestTime: String =
            "2026-08-01T09:00:00+09:00",
        now: Date? = nil,
        recorder: WeatherRequestRecorder? = nil
    ) -> JMACurrentWeatherService {
        let latestData = Data(latestTime.utf8)
        let stationData = Data(stations.utf8)
        let observationData = Data(observations.utf8)
        let resolvedNow = now
            ?? ISO8601DateFormatter().date(
                from: "2026-08-01T00:05:00Z"
            )!
        return JMACurrentWeatherService(
            clock: { resolvedNow }
        ) { request in
            if let recorder {
                await recorder.record(request)
            }
            let url = try XCTUnwrap(request.url)
            let payload: Data
            let contentType: String
            switch url.path {
            case "/bosai/amedas/data/latest_time.txt":
                payload = latestData
                contentType = "text/plain"
            case "/bosai/amedas/const/amedastable.json":
                payload = stationData
                contentType = "application/json"
            case "/bosai/amedas/data/map/20260801090000.json":
                payload = observationData
                contentType = "application/json"
            default:
                throw TestFailure.unexpectedURL
            }
            let response = try XCTUnwrap(
                HTTPURLResponse(
                    url: url,
                    statusCode: 200,
                    httpVersion: "HTTP/1.1",
                    headerFields: [
                        "Content-Type": contentType,
                    ]
                )
            )
            return (payload, response)
        }
    }

    private func fallbackService(
        _ observation: any CurrentWeatherProviding
    ) -> ObservationFirstCurrentWeatherService {
        ObservationFirstCurrentWeatherService(
            observationProvider: observation,
            modelProvider: StubWeatherProvider {
                _, _ in Self.modelWeather
            }
        )
    }

    private func date(_ value: String) throws -> Date {
        try XCTUnwrap(
            ISO8601DateFormatter().date(from: value)
        )
    }

    private var tokyoStation: String {
        """
        {"44132":{"lat":[35,41.4],"lon":[139,45.6],"alt":25,"kjName":"東京"}}
        """
    }

    private var twoTokyoStations: String {
        """
        {
          "44132":{"lat":[35,41.4],"lon":[139,45.6],"alt":25,"kjName":"東京"},
          "44136":{"lat":[35,38.0],"lon":[139,51.0],"alt":5,"kjName":"江戸川臨海"}
        }
        """
    }

    private var validTokyoObservation: String {
        """
        {"44132":{"pressure":[1001.2,0],"temp":[28.4,0],"humidity":[72,0]}}
        """
    }

    private static let observationWeather =
        CurrentAtmosphereWeather(
            provider: .jmaObservation,
            pressureHPA: 1_001.2,
            temperatureCelsius: 28.4,
            relativeHumidityPercent: 72,
            observedAt: Date(
                timeIntervalSince1970: 1_785_564_000
            ),
            station: CurrentAtmosphereWeatherStation(
                name: "東京",
                distanceKilometers: 1.2,
                elevationMeters: 25
            )
        )

    private static let modelWeather =
        CurrentAtmosphereWeather(
            provider: .openMeteoModel,
            pressureHPA: 1_004.2,
            temperatureCelsius: 29,
            relativeHumidityPercent: 65,
            observedAt: Date(
                timeIntervalSince1970: 1_785_564_000
            ),
            station: nil
        )

    private enum TestFailure: Error {
        case unavailable
        case unexpectedURL
    }
}

private struct StubWeatherProvider:
    CurrentWeatherProviding
{
    let operation: @Sendable (
        Double,
        Double
    ) async throws -> CurrentAtmosphereWeather

    init(
        operation: @escaping @Sendable (
            Double,
            Double
        ) async throws -> CurrentAtmosphereWeather
    ) {
        self.operation = operation
    }

    func currentAtmosphere(
        latitude: Double,
        longitude: Double
    ) async throws -> CurrentAtmosphereWeather {
        try await operation(latitude, longitude)
    }
}

private actor WeatherRequestRecorder {
    private(set) var requests: [URLRequest] = []

    func record(_ request: URLRequest) {
        requests.append(request)
    }
}

private actor WeatherCallCounter {
    private(set) var value = 0

    func increment() {
        value += 1
    }
}
