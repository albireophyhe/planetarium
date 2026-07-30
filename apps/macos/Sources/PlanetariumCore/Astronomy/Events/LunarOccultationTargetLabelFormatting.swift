import Foundation

public enum LunarOccultationTargetLabelFormatting {
    private static let greekLetters: [
        (code: String, symbol: String)
    ] = [
        ("Alp", "α"),
        ("Bet", "β"),
        ("Gam", "γ"),
        ("Del", "δ"),
        ("Eps", "ε"),
        ("Zet", "ζ"),
        ("Eta", "η"),
        ("The", "θ"),
        ("Iot", "ι"),
        ("Kap", "κ"),
        ("Lam", "λ"),
        ("Mu", "μ"),
        ("Nu", "ν"),
        ("Xi", "ξ"),
        ("Omi", "ο"),
        ("Pi", "π"),
        ("Rho", "ρ"),
        ("Sig", "σ"),
        ("Tau", "τ"),
        ("Ups", "υ"),
        ("Phi", "φ"),
        ("Chi", "χ"),
        ("Psi", "ψ"),
        ("Ome", "ω"),
    ]

    /**
     Formats the fixed-width BSC5P Name field for presentation only.

     The source label and catalogue identifiers remain unchanged. Proper names
     that do not match the BSC designation grammar pass through.
     */
    public static func displayLabel(
        bscLabel: String,
        localizedLabel: String?
    ) -> String {
        if let localizedLabel {
            return localizedLabel
        }

        let scalars = Array(bscLabel.unicodeScalars)
        var cursor = 0
        while cursor < scalars.count,
              isASCIIDigit(scalars[cursor])
        {
            cursor += 1
        }
        guard
            (1...3).contains(cursor),
            scalars[0].value != 48
        else {
            return bscLabel
        }
        let flamsteedNumber = String(
            String.UnicodeScalarView(scalars[0..<cursor])
        )

        guard let greek = greekLetters.first(where: { entry in
            let code = Array(entry.code.unicodeScalars)
            return scalars[cursor...].starts(with: code)
        }) else {
            return bscLabel
        }
        cursor += greek.code.unicodeScalars.count

        var component = ""
        if cursor < scalars.count,
           let formatted = superscriptDigit(scalars[cursor])
        {
            component = formatted
            cursor += 1
        }
        while cursor < scalars.count,
              scalars[cursor].value == 32
        {
            cursor += 1
        }

        let constellation = scalars[cursor...]
        guard
            constellation.count == 3,
            isASCIIUppercase(constellation[constellation.startIndex]),
            isASCIILowercase(
                constellation[
                    constellation.index(
                        after: constellation.startIndex
                    )
                ]
            ),
            isASCIILowercase(
                constellation[
                    constellation.index(
                        constellation.startIndex,
                        offsetBy: 2
                    )
                ]
            )
        else {
            return bscLabel
        }
        let constellationLabel = String(
            String.UnicodeScalarView(constellation)
        )
        return "\(flamsteedNumber) \(greek.symbol)\(component) \(constellationLabel)"
    }

    private static func isASCIIDigit(
        _ scalar: Unicode.Scalar
    ) -> Bool {
        (48...57).contains(scalar.value)
    }

    private static func isASCIIUppercase(
        _ scalar: Unicode.Scalar
    ) -> Bool {
        (65...90).contains(scalar.value)
    }

    private static func isASCIILowercase(
        _ scalar: Unicode.Scalar
    ) -> Bool {
        (97...122).contains(scalar.value)
    }

    private static func superscriptDigit(
        _ scalar: Unicode.Scalar
    ) -> String? {
        switch scalar.value {
        case 49:
            "¹"
        case 50:
            "²"
        case 51:
            "³"
        case 52:
            "⁴"
        case 53:
            "⁵"
        case 54:
            "⁶"
        case 55:
            "⁷"
        case 56:
            "⁸"
        case 57:
            "⁹"
        default:
            nil
        }
    }
}
