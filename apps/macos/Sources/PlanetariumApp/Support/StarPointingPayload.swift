import Foundation
import PlanetariumCore

struct StarPointingPayloadContext: Hashable, Sendable {
    let observationDate: Date
    let location: ObservingLocation
    let timeScales: ResolvedTimeScalesV2
    let earthOrientationIdentifier: String
    let refractionDescription: String
}

struct StarPointingSnapshot: Hashable, Sendable {
    let observationDate: Date
    let utcTimestamp: String
    let payload: String
    let didPausePlayback: Bool
}

enum StarPointingSnapshotCapturePolicy {
    @discardableResult
    static func pausePlaybackIfNeeded(
        isPlaybackPlaying: Bool,
        pause: () -> Void
    ) -> Bool {
        guard isPlaybackPlaying else {
            return false
        }
        pause()
        return true
    }
}

enum StarPointingCopyStatusPolicy {
    static func shouldClearGlobalStatus(
        copyStatus: String?,
        globalStatus: String?
    ) -> Bool {
        guard let copyStatus else {
            return false
        }
        return globalStatus == copyStatus
    }
}

enum StarPointingPayloadFormatter {
    static func payload(
        for star: RenderedStar,
        context: StarPointingPayloadContext
    ) -> String {
        let apparent = star.apparentEquatorial
        let hd =
            star.catalog.hd.map { "HD \($0)" } ?? "HD —"
        let name =
            star.name?.nameJa.nonEmpty
            ?? star.name?.name.nonEmpty
            ?? "HR \(star.hr)"

        return [
            "Planetarium 導入用データ",
            "対象: \(name)（HR \(star.hr) / \(hd)）",
            "観測時刻 UTC: \(utcTimestamp(context.observationDate))",
            "観測地点: \(context.location.name)",
            "緯度: \(decimalDegrees(context.location.latitude))",
            "経度: \(decimalDegrees(context.location.longitude))",
            "WGS84楕円体高: "
                + AstronomicalFormatting.decimal(
                    context.location.heightMeters,
                    fractionDigits: 2
                )
                + " m",
            "地点水平精度: "
                + context.location
                .horizontalAccuracyMeters
                .map {
                    "±"
                        + AstronomicalFormatting
                        .decimal(
                            $0,
                            fractionDigits: 1
                        )
                        + " m"
                }
                .orDash,
            "",
            "赤経（J2000）: "
                + preciseRightAscension(
                    star.catalog.rightAscension
                ),
            "赤緯（J2000）: "
                + preciseDeclination(
                    star.catalog.declination
                ),
            "見かけ赤経（真赤道・分点、日時）: "
                + apparent.map {
                    preciseRightAscension(
                        $0.rightAscension
                    )
                }.orDash,
            "見かけ赤緯（真赤道・分点、日時）: "
                + apparent.map {
                    preciseDeclination($0.declination)
                }.orDash,
            "真空 topocentric 高度: "
                + preciseDegrees(
                    star.geometricHorizontal.altitude
                ),
            "真空 topocentric 方位: "
                + preciseAzimuth(
                    star.geometricHorizontal
                ),
            "観測高度（大気差後）: "
                + preciseDegrees(
                    star.observedHorizontal.altitude
                ),
            "観測方位（大気差後）: "
                + preciseAzimuth(
                    star.observedHorizontal
                ),
            "大気差: \(context.refractionDescription)",
            "",
            "JD UTC: \(julianDate(context.timeScales.utcJulianDate))",
            "JD UT1: \(julianDate(context.timeScales.ut1JulianDate))",
            "JD TT: \(julianDate(context.timeScales.ttJulianDate))",
            "DUT1 (UT1−UTC): "
                + AstronomicalFormatting.decimal(
                    context.timeScales.dut1Seconds,
                    fractionDigits: 6
                )
                + " s",
            "TAI−UTC: "
                + AstronomicalFormatting.decimal(
                    context.timeScales.taiMinusUTCSeconds,
                    fractionDigits: 3
                )
                + " s",
            "EOP: \(context.earthOrientationIdentifier)",
            "モデル: Planetarium 精密モデルv2",
            "",
            "注意: 小数桁は計算値の転記用であり、"
                + "その桁数自体が位置精度を保証するものではありません。",
        ].joined(separator: "\n")
    }

    static func preciseRightAscension(
        _ radians: Double
    ) -> String {
        AstronomicalFormatting.rightAscension(
            radians,
            fractionDigits: 2
        )
    }

    static func preciseDeclination(
        _ radians: Double
    ) -> String {
        AstronomicalFormatting.declination(
            radians,
            fractionDigits: 1
        )
    }

    static func preciseDegrees(_ radians: Double) -> String {
        AstronomicalFormatting.degrees(
            radians,
            fractionDigits: 6
        )
    }

    static func preciseAzimuth(
        _ coordinates: HorizontalCoordinates
    ) -> String {
        guard coordinates.azimuthIsDefined else {
            return "不定"
        }
        return AstronomicalFormatting.decimal(
            Angles.normalizedDegrees(
                Angles.degrees(
                    fromRadians: coordinates.azimuth
                )
            ),
            fractionDigits: 6
        ) + "°（北=0°・東回り）"
    }

    private static func decimalDegrees(
        _ degrees: Double
    ) -> String {
        AstronomicalFormatting.decimal(
            degrees,
            fractionDigits: 6
        ) + "°"
    }

    private static func julianDate(_ value: Double) -> String {
        AstronomicalFormatting.decimal(
            value,
            fractionDigits: 9
        )
    }

    static func utcTimestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }
}

private extension Optional where Wrapped == String {
    var orDash: String { self ?? "—" }
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}
