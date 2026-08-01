import Foundation
import PlanetariumCore

struct StarPointingPrecisionContext: Hashable, Sendable {
    let position: ApparentStarPositionV2
    let frame: ApparentPositionContextV2
    let atmosphere: AtmosphereV2?
    let atmosphereInputSource:
        AtmosphericRefractionInputSource?
    let earthOrientationEstimate:
        IERSEarthOrientationEstimateV1?
    let earthOrientationSourceIdentifier: String?

    init?(
        position: ApparentStarPositionV2,
        frame: ApparentPositionContextV2,
        atmosphere: AtmosphereV2?,
        atmosphereInputSource:
            AtmosphericRefractionInputSource?,
        earthOrientationEstimate:
            IERSEarthOrientationEstimateV1?,
        earthOrientationSourceIdentifier: String?
    ) {
        guard
            position.metadata.timeScales
                == frame.timeScales,
            position.solarLightDeflectionMode
                == frame.solarLightDeflection.mode,
            position.metadata.aberrationMode
                == frame.aberration.mode,
            position.diurnalAberrationMode
                == frame.diurnalAberration.mode,
            position.polarMotionMode
                == frame.polarMotion.mode,
            Self.atmosphereMatchesAppliedFrame(
                atmosphere,
                frame: frame
            ),
            (atmosphere == nil)
                == (atmosphereInputSource == nil),
            atmosphereInputSource != .standard
                || atmosphere == .standardVisual
        else {
            return nil
        }

        self.position = position
        self.frame = frame
        self.atmosphere = atmosphere
        self.atmosphereInputSource =
            atmosphereInputSource

        // Retain supplementary metadata so the machine-readable profile
        // can compare DUT1 and polar motion independently. The serializer
        // exports provenance only for components that match the applied
        // frame.
        self.earthOrientationEstimate =
            earthOrientationEstimate
        self.earthOrientationSourceIdentifier =
            earthOrientationSourceIdentifier
    }

    private static func atmosphereMatchesAppliedFrame(
        _ atmosphere: AtmosphereV2?,
        frame: ApparentPositionContextV2
    ) -> Bool {
        switch (atmosphere, frame.refraction) {
        case (nil, .disabled):
            return true
        case let (
            .some(atmosphere),
            .configured(
                coefficients,
                minimumGeometricAltitudeDegrees
            )
        ):
            guard
                let expected = try? Astronomy
                    .refractionCoefficientsV2(
                        for: atmosphere
                    ),
                let boundaryResult = try? Astronomy
                    .applyVisualRefractionV2(
                        to: Angles.radians(
                            fromDegrees:
                                minimumGeometricAltitudeDegrees
                        ),
                        coefficients: expected,
                        minimumGeometricAltitudeDegrees:
                            minimumGeometricAltitudeDegrees
                    ),
                boundaryResult.mode == .applied
            else {
                return false
            }
            return expected == coefficients
                && atmosphere
                    .minimumGeometricAltitudeDegrees
                    == minimumGeometricAltitudeDegrees
        case (.none, .configured),
             (.some, .disabled):
            return false
        }
    }
}

struct StarPointingPayloadContext: Hashable, Sendable {
    let observationDate: Date
    let location: ObservingLocation
    let timeScales: ResolvedTimeScalesV2
    let earthOrientationIdentifier: String
    let refractionDescription: String
    let precisionContext: StarPointingPrecisionContext?

    init(
        observationDate: Date,
        location: ObservingLocation,
        timeScales: ResolvedTimeScalesV2,
        earthOrientationIdentifier: String,
        refractionDescription: String,
        precisionContext:
            StarPointingPrecisionContext? = nil
    ) {
        self.observationDate = observationDate
        self.location = location
        self.timeScales = timeScales
        self.earthOrientationIdentifier =
            earthOrientationIdentifier
        self.refractionDescription =
            refractionDescription
        self.precisionContext = precisionContext
    }
}

enum StarPointingPayloadProfile:
    String, CaseIterable, Hashable, Identifiable, Sendable
{
    case readableText = "readable-text"
    case precisionJSON = "precision-json-v1"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .readableText:
            "読みやすい形式"
        case .precisionJSON:
            "JSON v1"
        }
    }

    var copyLabel: String {
        switch self {
        case .readableText:
            "参考座標をコピー"
        case .precisionJSON:
            "参考座標JSONをコピー"
        }
    }
}

struct StarPointingPayloadSignature:
    Hashable, Sendable
{
    let profile: StarPointingPayloadProfile
    let observationDate: Date
    let location: ObservingLocation
    let star: RenderedStar
    let timeScales: ResolvedTimeScalesV2
    let earthOrientationEstimate:
        IERSEarthOrientationEstimateV1?
    let solarLightDeflectionMode:
        SolarLightDeflectionModeV2
    let appliedAtmosphericRefraction:
        AppliedAtmosphericRefraction?
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
        context: StarPointingPayloadContext,
        profile: StarPointingPayloadProfile
    ) -> String? {
        switch profile {
        case .readableText:
            payload(for: star, context: context)
        case .precisionJSON:
            machineReadablePayload(
                for: star,
                context: context
            )
        }
    }

    static func payload(
        for star: RenderedStar,
        context: StarPointingPayloadContext
    ) -> String {
        let apparent = star.apparentEquatorial
        let precisionAngles =
            localApparentSiderealTimeAndHourAngle(
                context: context
            )
        let hd =
            star.catalog.hd.map { "HD \($0)" } ?? "HD —"
        let name =
            star.name?.nameJa.nonEmpty
            ?? star.name?.name.nonEmpty
            ?? "HR \(star.hr)"

        return [
            "Planetarium 参考座標データ",
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
            "地方見かけ恒星時（GAST＋入力東経、極運動前）: "
                + precisionAngles.map {
                    preciseRightAscension(
                        $0.localApparentSiderealTime
                    )
                }.orDash,
            "地心見かけ時角（H = LAST − 見かけ赤経、西向き正）: "
                + precisionAngles.map {
                    preciseSignedHourAngle($0.hourAngle)
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
            "注意: 座標系と大気差設定を確認した手動導入・"
                + "機材設定比較の補助情報です。小数桁は計算値の転記用であり、"
                + "その桁数自体が位置精度を保証するものではありません。"
                + "望遠鏡の自動導入・追尾を保証せず、"
                + "無人運転の唯一の入力には使用しないでください。",
        ].joined(separator: "\n")
    }

    static func machineReadablePayload(
        for star: RenderedStar,
        context: StarPointingPayloadContext
    ) -> String? {
        StarPointingJSONProfileV1.serialize(
            star: star,
            context: context
        )
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

    static func preciseSignedHourAngle(
        _ radians: Double
    ) -> String {
        guard radians.isFinite else {
            return "—"
        }
        let normalized =
            normalizedSignedHourAngle(radians)
        let scale = 100
        let totalUnits = Int(
            (
                abs(normalized)
                    * 12 / .pi
                    * 60 * 60
                    * Double(scale)
            ).rounded()
        )
        let halfTurnUnits = 12 * 60 * 60 * scale
        let sign =
            totalUnits == halfTurnUnits
                || normalized < 0 && totalUnits > 0
            ? "−"
            : "+"
        let hours = totalUnits / (60 * 60 * scale)
        let minutes = totalUnits / (60 * scale) % 60
        let seconds =
            Double(totalUnits % (60 * scale))
            / Double(scale)
        return String(
            format: "%@%02dh %02dm %05.2fs",
            sign,
            hours,
            minutes,
            seconds
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

    static func localApparentSiderealTimeAndHourAngle(
        context: StarPointingPayloadContext
    ) -> (
        localApparentSiderealTime: Double,
        hourAngle: Double
    )? {
        guard let precision = context.precisionContext else {
            return nil
        }
        let localApparentSiderealTime =
            Angles.normalizedRadians(
                precision.frame
                    .greenwichApparentSiderealTime
                    + Angles.radians(
                        fromDegrees:
                            context.location.longitude
                    )
            )
        let hourAngle =
            normalizedSignedHourAngle(
                localApparentSiderealTime
                    - precision.position
                    .apparentEquatorial
                    .rightAscension
            )
        return (
            localApparentSiderealTime,
            hourAngle
        )
    }

    private static func normalizedSignedHourAngle(
        _ radians: Double
    ) -> Double {
        var normalized = radians.truncatingRemainder(
            dividingBy: Angles.twoPi
        )
        if normalized >= .pi {
            normalized -= Angles.twoPi
        } else if normalized < -.pi {
            normalized += Angles.twoPi
        }
        return normalized
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
