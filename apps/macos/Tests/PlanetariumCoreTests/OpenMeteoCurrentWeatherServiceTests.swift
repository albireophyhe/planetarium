import Foundation
import PlanetariumCore
import XCTest

@testable import Planetarium

final class OpenMeteoCurrentWeatherServiceTests:
    XCTestCase
{
    func testSharedSessionDelegateRejectsRedirect()
        throws
    {
        let delegate = CurrentWeatherNoRedirectDelegate()
        let session = URLSession(
            configuration: .ephemeral
        )
        defer { session.invalidateAndCancel() }
        let sourceURL = try XCTUnwrap(
            URL(string: "https://api.open-meteo.com/v1/forecast")
        )
        let redirectedURL = try XCTUnwrap(
            URL(string: "https://example.com/redirected")
        )
        let task = session.dataTask(with: sourceURL)
        let response = try XCTUnwrap(
            HTTPURLResponse(
                url: sourceURL,
                statusCode: 302,
                httpVersion: "HTTP/1.1",
                headerFields: [
                    "Location": redirectedURL.absoluteString,
                ]
            )
        )
        var resolvedRedirect:
            URLRequest? = URLRequest(
                url: redirectedURL
            )

        delegate.urlSession(
            session,
            task: task,
            willPerformHTTPRedirection: response,
            newRequest: URLRequest(url: redirectedURL)
        ) { request in
            resolvedRedirect = request
        }

        XCTAssertNil(resolvedRedirect)
    }

    func testFetchesOnlyRequiredCurrentValuesAndDecodesUnits()
        async throws
    {
        let payload = Data(
            """
            {
              "utc_offset_seconds": 0,
              "current_units": {
                "time": "iso8601",
                "interval": "seconds",
                "temperature_2m": "°C",
                "relative_humidity_2m": "%",
                "surface_pressure": "hPa"
              },
              "current": {
                "time": "2026-08-01T12:15",
                "interval": 900,
                "temperature_2m": 31.4,
                "relative_humidity_2m": 67,
                "surface_pressure": 1004.2
              }
            }
            """.utf8
        )
        let fixtureNow = Self.fixtureNow
        let service = OpenMeteoCurrentWeatherService(
            clock: { fixtureNow }
        ) {
            request in
            let url = try XCTUnwrap(request.url)
            let components = try XCTUnwrap(
                URLComponents(
                    url: url,
                    resolvingAgainstBaseURL: false
                )
            )
            let query = Dictionary(
                uniqueKeysWithValues:
                    (components.queryItems ?? []).map {
                        ($0.name, $0.value ?? "")
                    }
            )

            XCTAssertEqual(url.scheme, "https")
            XCTAssertEqual(
                url.host,
                "api.open-meteo.com"
            )
            XCTAssertEqual(url.path, "/v1/forecast")
            XCTAssertEqual(query["latitude"], "35.6812")
            XCTAssertEqual(query["longitude"], "139.7671")
            XCTAssertEqual(
                query["current"],
                "temperature_2m,relative_humidity_2m,surface_pressure"
            )
            XCTAssertEqual(query["timezone"], "UTC")
            XCTAssertEqual(query["forecast_days"], "1")
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.timeoutInterval, 10)
            XCTAssertEqual(
                request.cachePolicy,
                .reloadIgnoringLocalCacheData
            )
            XCTAssertEqual(
                request.value(
                    forHTTPHeaderField: "Accept"
                ),
                "application/json"
            )

            let response = try XCTUnwrap(
                HTTPURLResponse(
                    url: url,
                    statusCode: 200,
                    httpVersion: "HTTP/1.1",
                    headerFields: [
                        "Content-Type": "application/json",
                    ]
                )
            )
            return (payload, response)
        }

        let weather = try await service
            .currentAtmosphere(
                latitude: 35.6812,
                longitude: 139.7671
            )

        XCTAssertEqual(weather.provider, .openMeteoModel)
        XCTAssertNil(weather.station)
        XCTAssertEqual(weather.pressureHPA, 1_004.2)
        XCTAssertEqual(
            weather.temperatureCelsius,
            31.4
        )
        XCTAssertEqual(
            weather.relativeHumidityPercent,
            67
        )
        XCTAssertEqual(
            weather.observedAt,
            try XCTUnwrap(
                ISO8601DateFormatter().date(
                    from:
                        "2026-08-01T12:15:00Z"
                )
            )
        )
    }

    func testRejectsUnexpectedUnits() async throws {
        let service = service(
            payload: validPayload(
                pressureUnit: "Pa"
            )
        )

        await XCTAssertThrowsErrorAsync(
            try await service.currentAtmosphere(
                latitude: 0,
                longitude: 0
            )
        ) { error in
            XCTAssertEqual(
                error as?
                    OpenMeteoCurrentWeatherError,
                .unsupportedUnits
            )
        }
    }

    func testRejectsNonUTCResponse() async throws {
        let service = service(
            payload: validPayload(
                utcOffsetSeconds: 3_600
            )
        )

        await XCTAssertThrowsErrorAsync(
            try await service.currentAtmosphere(
                latitude: 0,
                longitude: 0
            )
        ) { error in
            XCTAssertEqual(
                error as?
                    OpenMeteoCurrentWeatherError,
                .unsupportedUnits
            )
        }
    }

    func testRejectsModelTimestampMoreThanOneHourFromClock()
        async
    {
        for time in [
            "2026-08-01T11:14",
            "2026-08-01T13:16",
        ] {
            let service = service(
                payload: validPayload(time: time)
            )
            await XCTAssertThrowsErrorAsync(
                try await service.currentAtmosphere(
                    latitude: 0,
                    longitude: 0
                )
            ) { error in
                XCTAssertEqual(
                    error as?
                        OpenMeteoCurrentWeatherError,
                    .staleTimestamp
                )
            }
        }
    }

    func testRejectsOutOfRangeWeatherValues()
        async throws
    {
        let service = service(
            payload: validPayload(humidity: 101)
        )

        await XCTAssertThrowsErrorAsync(
            try await service.currentAtmosphere(
                latitude: 0,
                longitude: 0
            )
        ) { error in
            XCTAssertEqual(
                error as?
                    OpenMeteoCurrentWeatherError,
                .valuesOutOfRange
            )
        }
    }

    func testRejectsZeroSurfacePressure() async {
        let service = service(
            payload: validPayload(pressureHPA: 0)
        )

        await XCTAssertThrowsErrorAsync(
            try await service.currentAtmosphere(
                latitude: 0,
                longitude: 0
            )
        ) { error in
            XCTAssertEqual(
                error as?
                    OpenMeteoCurrentWeatherError,
                .valuesOutOfRange
            )
        }
    }

    func testRejectsSurfacePressureBelowProviderFloor()
        async
    {
        let service = service(
            payload: validPayload(pressureHPA: 299.9)
        )

        await XCTAssertThrowsErrorAsync(
            try await service.currentAtmosphere(
                latitude: 0,
                longitude: 0
            )
        ) { error in
            XCTAssertEqual(
                error as?
                    OpenMeteoCurrentWeatherError,
                .valuesOutOfRange
            )
        }
    }

    func testRejectsNonSuccessHTTPWithoutDecoding()
        async throws
    {
        let service = service(
            statusCode: 429,
            payload: Data("not json".utf8)
        )

        await XCTAssertThrowsErrorAsync(
            try await service.currentAtmosphere(
                latitude: 0,
                longitude: 0
            )
        ) { error in
            XCTAssertEqual(
                error as?
                    OpenMeteoCurrentWeatherError,
                .serverResponse(429)
            )
            XCTAssertTrue(
                error.localizedDescription
                    .contains("もう一度")
            )
        }
    }

    func testRejectsInvalidCoordinatesBeforeNetwork()
        async
    {
        let service = OpenMeteoCurrentWeatherService {
            _ in
            XCTFail("無効な座標で通信してはいけません")
            throw CancellationError()
        }

        await XCTAssertThrowsErrorAsync(
            try await service.currentAtmosphere(
                latitude: .nan,
                longitude: 0
            )
        ) { error in
            XCTAssertEqual(
                error as?
                    OpenMeteoCurrentWeatherError,
                .invalidCoordinates
            )
        }
    }

    func testCancellationPropagates() async {
        let service = OpenMeteoCurrentWeatherService {
            _ in
            try await Task.sleep(
                for: .seconds(30)
            )
            throw OpenMeteoCurrentWeatherError
                .invalidResponse
        }
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
    }

    func testDraftWeatherMergeIgnoresReplacedWeatherFields()
        throws
    {
        var draft = AtmosphericRefractionDraft(
            inputSource: .manual
        )
        draft.pressureHPA = "invalid"
        draft.temperatureCelsius = "invalid"
        draft.relativeHumidityPercent = "invalid"
        draft.wavelengthMicrometers = "0.65"
        draft.minimumGeometricAltitudeDegrees = "9"

        let atmosphere = try draft.manualAtmosphere(
            pressureHPA: 998.4,
            temperatureCelsius: 20,
            relativeHumidityPercent: 55
        )

        XCTAssertEqual(atmosphere.pressureHPA, 998.4)
        XCTAssertEqual(atmosphere.temperatureCelsius, 20)
        XCTAssertEqual(atmosphere.relativeHumidity, 0.55)
        XCTAssertEqual(
            atmosphere.wavelengthMicrometers,
            0.65
        )
        XCTAssertEqual(
            atmosphere.minimumGeometricAltitudeDegrees,
            9
        )
    }

    private func service(
        statusCode: Int = 200,
        payload: Data
    ) -> OpenMeteoCurrentWeatherService {
        let fixtureNow = Self.fixtureNow
        return OpenMeteoCurrentWeatherService(
            clock: { fixtureNow }
        ) { request in
            let url = try XCTUnwrap(request.url)
            let response = try XCTUnwrap(
                HTTPURLResponse(
                    url: url,
                    statusCode: statusCode,
                    httpVersion: "HTTP/1.1",
                    headerFields: [
                        "Content-Type": "application/json",
                    ]
                )
            )
            return (payload, response)
        }
    }

    private func validPayload(
        utcOffsetSeconds: Int = 0,
        pressureUnit: String = "hPa",
        humidity: Double = 67,
        pressureHPA: Double = 1_004.2,
        time: String = "2026-08-01T12:15"
    ) -> Data {
        Data(
            """
            {
              "utc_offset_seconds": \(utcOffsetSeconds),
              "current_units": {
                "time": "iso8601",
                "temperature_2m": "°C",
                "relative_humidity_2m": "%",
                "surface_pressure": "\(pressureUnit)"
              },
              "current": {
                "time": "\(time)",
                "temperature_2m": 31.4,
                "relative_humidity_2m": \(humidity),
                "surface_pressure": \(pressureHPA)
              }
            }
            """.utf8
        )
    }

    private static let fixtureNow = Date(
        timeIntervalSince1970: 1_785_586_500
    )
}

private func XCTAssertThrowsErrorAsync<T>(
    _ expression: @autoclosure () async throws -> T,
    _ errorHandler: (Error) -> Void = { _ in }
) async {
    do {
        _ = try await expression()
        XCTFail("エラーが必要です")
    } catch {
        errorHandler(error)
    }
}
