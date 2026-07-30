@preconcurrency import CoreLocation
import Foundation

enum LocationServiceError: LocalizedError {
    case denied
    case unavailable
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .denied:
            "現在地の利用が許可されていません。都市プリセットまたは手入力を利用できます。"
        case .unavailable:
            "現在地を取得できませんでした。位置情報サービスを確認してください。"
        case let .failed(message):
            "現在地を取得できませんでした（\(message)）。"
        }
    }
}

struct DeviceLocationFix: Hashable, Sendable {
    let latitude: Double
    let longitude: Double
    let horizontalAccuracyMeters: Double?
}

@MainActor
final class LocationService: NSObject, @preconcurrency CLLocationManagerDelegate {
    private var manager: CLLocationManager?
    private var completion: ((Result<DeviceLocationFix, Error>) -> Void)?

    /// Creates and requests from CLLocationManager only after an explicit user action.
    func requestOnce(
        completion: @escaping (Result<DeviceLocationFix, Error>) -> Void
    ) {
        self.completion = completion

        guard CLLocationManager.locationServicesEnabled() else {
            finish(.failure(LocationServiceError.unavailable))
            return
        }

        let manager = CLLocationManager()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        self.manager = manager

        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorized, .authorizedAlways:
            manager.requestLocation()
        case .denied, .restricted:
            finish(.failure(LocationServiceError.denied))
        @unknown default:
            finish(.failure(LocationServiceError.unavailable))
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorized, .authorizedAlways:
            manager.requestLocation()
        case .denied, .restricted:
            finish(.failure(LocationServiceError.denied))
        case .notDetermined:
            break
        @unknown default:
            finish(.failure(LocationServiceError.unavailable))
        }
    }

    func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard let location = locations.last else {
            finish(.failure(LocationServiceError.unavailable))
            return
        }
        let coordinate = location.coordinate
        let horizontalAccuracy =
            location.horizontalAccuracy.isFinite
                && location.horizontalAccuracy >= 0
                ? location.horizontalAccuracy
                : nil
        finish(
            .success(
                DeviceLocationFix(
                    latitude: coordinate.latitude,
                    longitude: coordinate.longitude,
                    horizontalAccuracyMeters:
                        horizontalAccuracy
                )
            )
        )
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finish(.failure(LocationServiceError.failed(error.localizedDescription)))
    }

    private func finish(_ result: Result<DeviceLocationFix, Error>) {
        let callback = completion
        completion = nil
        manager?.delegate = nil
        manager = nil
        callback?(result)
    }
}
