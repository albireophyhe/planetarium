import Foundation
import XCTest

import PlanetariumShared
@testable import PlanetariumCore

final class LunarOccultationTargetLabelFormattingTests:
    XCTestCase
{
    private let expectedBundledDesignations = [
        "123Zet Tau": "123 ζ Tau",
        "13Mu Gem": "13 μ Gem",
        "19Del Sgr": "19 δ Sgr",
        "20Sig Sco": "20 σ Sco",
        "22Lam Sgr": "22 λ Sgr",
        "23Tau Sco": "23 τ Sco",
        "25Eta Tau": "25 η Tau",
        "27Eps Gem": "27 ε Gem",
        "41Pi Sgr": "41 π Sgr",
        "49Del Cap": "49 δ Cap",
        "6Pi Sco": "6 π Sco",
        "7Del Sco": "7 δ Sco",
        "8Bet1Sco": "8 β¹ Sco",
        "9Alp2Lib": "9 α² Lib",
    ]

    func testFormatsEveryUniqueBundledRawBSCDesignation()
        throws
    {
        let targets = try bundledTargets()
        let rawDesignations = Set(
            targets
                .filter { $0.labelJa == nil }
                .map(\.label)
        )

        XCTAssertEqual(
            rawDesignations,
            Set(expectedBundledDesignations.keys)
        )
        for label in rawDesignations {
            XCTAssertEqual(
                LunarOccultationTargetLabelFormatting
                    .displayLabel(
                        bscLabel: label,
                        localizedLabel: nil
                    ),
                expectedBundledDesignations[label],
                label
            )
        }
    }

    func testPreservesEveryBundledJapaneseProperName()
        throws
    {
        var localizedTargets: [String: String] = [:]
        for target in try bundledTargets() {
            guard let labelJa = target.labelJa else {
                continue
            }
            if let existing = localizedTargets[target.label] {
                XCTAssertEqual(existing, labelJa)
            } else {
                localizedTargets[target.label] = labelJa
            }
        }

        XCTAssertEqual(
            localizedTargets,
            [
                "Aldebaran": "アルデバラン",
                "Antares": "アンタレス",
                "Elnath": "エルナト",
                "Nunki": "ヌンキ",
                "Regulus": "レグルス",
                "Spica": "スピカ",
            ]
        )
        for (label, labelJa) in localizedTargets {
            XCTAssertEqual(
                LunarOccultationTargetLabelFormatting
                    .displayLabel(
                        bscLabel: label,
                        localizedLabel: labelJa
                    ),
                labelJa
            )
        }
    }

    func testPassesProperNamesAndUnrecognizedCatalogTextThrough() {
        XCTAssertEqual(
            LunarOccultationTargetLabelFormatting
                .displayLabel(
                    bscLabel: "Aldebaran",
                    localizedLabel: nil
                ),
            "Aldebaran"
        )
        XCTAssertEqual(
            LunarOccultationTargetLabelFormatting
                .displayLabel(
                    bscLabel: "HR 1457",
                    localizedLabel: nil
                ),
            "HR 1457"
        )
    }

    private func bundledTargets() throws -> [RawTarget] {
        let manifest = try JSONDecoder().decode(
            RawManifest.self,
            from:
                SharedResources.eventCandidateData(
                    for: .manifest
                )
        )
        return try manifest.chunks.flatMap { descriptor in
            let fileName = URL(
                fileURLWithPath: descriptor.file
            ).lastPathComponent
            let chunk = try JSONDecoder().decode(
                RawChunk.self,
                from:
                    SharedResources.eventCandidateChunkData(
                        named: fileName
                    )
            )
            return chunk.events.compactMap { event in
                event.kind == "lunar-occultation"
                    ? event.target
                    : nil
            }
        }
    }
}

private struct RawManifest: Decodable {
    let chunks: [RawChunkDescriptor]
}

private struct RawChunkDescriptor: Decodable {
    let file: String
}

private struct RawChunk: Decodable {
    let events: [RawEvent]
}

private struct RawEvent: Decodable {
    let kind: String
    let target: RawTarget?
}

private struct RawTarget: Decodable {
    let label: String
    let labelJa: String?
}
