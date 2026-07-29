import SwiftUI

enum SkyTypography {
    static let brand = Font.system(
        .title2,
        design: .rounded,
        weight: .semibold
    )
    static let displayTitle = Font.system(
        .largeTitle,
        design: .rounded,
        weight: .bold
    )
    static let heading = Font.system(
        .headline,
        design: .rounded,
        weight: .semibold
    )
    static let time = Font.system(
        .body,
        design: .monospaced,
        weight: .regular
    ).monospacedDigit()
    static let data = Font.system(
        .callout,
        design: .monospaced,
        weight: .regular
    ).monospacedDigit()
    static let dataCaption = Font.system(
        .caption,
        design: .monospaced,
        weight: .regular
    ).monospacedDigit()
    static let dataEmphasis = Font.system(
        .title3,
        design: .monospaced,
        weight: .medium
    ).monospacedDigit()
}
