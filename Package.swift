// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "Planetarium",
    defaultLocalization: "ja",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(name: "PlanetariumShared", targets: ["PlanetariumShared"]),
        .library(name: "PlanetariumCore", targets: ["PlanetariumCore"]),
        .executable(name: "Planetarium", targets: ["Planetarium"]),
    ],
    targets: [
        .target(
            name: "PlanetariumShared",
            path: "shared",
            exclude: [
                "catalog/README.md",
                "catalog/bright-stars.v1.json",
                "catalog/bright-stars.lock.v1.json",
                "catalog/bright-stars.lock.v2.json",
                "catalog/render-stars.v1.json",
                "catalog/render-stars.lock.v1.json",
                "eop/README.md",
                "eop/iers-finals2000a-dut1.v1.json",
                "eop/iers-finals2000a-dut1.lock.v1.json",
                "eop/iers-finals2000a-eop.lock.v1.json",
                "eop/dut1",
                "eop/source",
                "ephemeris/README.md",
                "ephemeris/de442s/README.md",
                "fixtures",
                "schema",
            ],
            sources: ["swift"],
            resources: [
                .copy("licenses/IAU-SOFA-derived-work-notice.md"),
                .copy("catalog/bright-stars.v2.json"),
                .copy("catalog/cities.v1.json"),
                .copy("catalog/constellations.v1.json"),
                .copy("catalog/star-names.v1.json"),
                .copy("eop/iers-finals2000a-eop.v1.json"),
                .process("eop/eop"),
                .copy("ephemeris/truncated-earth-heliocentric.v1.json"),
                .copy("ephemeris/de442s/de442s-manifest.v1.json"),
                .copy("ephemeris/de442s/chunks"),
                .copy("events"),
            ]
        ),
        .target(
            name: "PlanetariumCore",
            dependencies: ["PlanetariumShared"],
            path: "apps/macos/Sources/PlanetariumCore",
            exclude: [
                "Astronomy/Precision/SOFA-NOTICE.md",
            ]
        ),
        .executableTarget(
            name: "Planetarium",
            dependencies: ["PlanetariumCore"],
            path: "apps/macos/Sources/PlanetariumApp"
        ),
        .testTarget(
            name: "PlanetariumCoreTests",
            dependencies: [
                "Planetarium",
                "PlanetariumCore",
                "PlanetariumShared",
            ],
            path: "apps/macos/Tests/PlanetariumCoreTests"
        ),
    ]
)
