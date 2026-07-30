import CoreGraphics
import XCTest

@testable import Planetarium

final class AngularSceneTransformTests:
    XCTestCase
{
    func testSolarTimelineUsesOneScaleAndContainsEverySolvedPhase()
        throws
    {
        let sun = AngularSceneBody(
            eastward: 0,
            upward: 0,
            radius: 0.00465
        )
        let phases = [
            [
                sun,
                AngularSceneBody(
                    eastward: -0.0091,
                    upward: 0.0018,
                    radius: 0.00472
                ),
            ],
            [
                sun,
                AngularSceneBody(
                    eastward: 0.0003,
                    upward: -0.0002,
                    radius: 0.00472
                ),
            ],
            [
                sun,
                AngularSceneBody(
                    eastward: 0.0094,
                    upward: -0.0015,
                    radius: 0.00472
                ),
            ],
        ]

        try assertFixedTimelineViewport(
            phases
        )
    }

    func testLunarTimelineUsesOneScaleAndContainsEverySolvedPhase()
        throws
    {
        let shadow = AngularSceneBody(
            eastward: 0,
            upward: 0,
            radius: 0.0240
        )
        let phases = [
            [
                shadow,
                AngularSceneBody(
                    eastward: -0.0272,
                    upward: 0.0061,
                    radius: 0.00455
                ),
            ],
            [
                shadow,
                AngularSceneBody(
                    eastward: 0.0020,
                    upward: -0.0032,
                    radius: 0.00455
                ),
            ],
            [
                shadow,
                AngularSceneBody(
                    eastward: 0.0280,
                    upward: -0.0052,
                    radius: 0.00455
                ),
            ],
        ]

        try assertFixedTimelineViewport(
            phases
        )
    }

    func testOccultationTimelineUsesOneScaleAndContainsEverySolvedPhase()
        throws
    {
        let moon = AngularSceneBody(
            eastward: 0,
            upward: 0,
            radius: 0.00460
        )
        let markerRadius = moon.radius * 0.10
        let phases = [
            [
                moon,
                AngularSceneBody(
                    eastward: -0.00460,
                    upward: 0,
                    radius: markerRadius
                ),
            ],
            [
                moon,
                AngularSceneBody(
                    eastward: 0.0012,
                    upward: 0.0010,
                    radius: markerRadius
                ),
            ],
            [
                moon,
                AngularSceneBody(
                    eastward: 0.00460,
                    upward: 0,
                    radius: markerRadius
                ),
            ],
        ]

        try assertFixedTimelineViewport(
            phases
        )
    }

    func testExtentAndTransformRejectInvalidInputs()
        throws
    {
        XCTAssertNil(
            AngularSceneExtent(
                phaseBodies: []
            )
        )
        XCTAssertNil(
            AngularSceneExtent(
                bodies: [
                    AngularSceneBody(
                        eastward: .nan,
                        upward: 0,
                        radius: 1
                    ),
                ]
            )
        )
        XCTAssertNil(
            AngularSceneExtent(
                bodies: [
                    AngularSceneBody(
                        eastward: 0,
                        upward: .infinity,
                        radius: 1
                    ),
                ]
            )
        )
        XCTAssertNil(
            AngularSceneExtent(
                bodies: [
                    AngularSceneBody(
                        eastward: 0,
                        upward: 0,
                        radius: -1
                    ),
                ]
            )
        )
        XCTAssertNil(
            AngularSceneExtent(
                bodies: [
                    AngularSceneBody(
                        eastward:
                            Double
                            .greatestFiniteMagnitude,
                        upward: 0,
                        radius:
                            Double
                            .greatestFiniteMagnitude
                    ),
                ]
            ),
            "Finite inputs whose bounds overflow must fail closed"
        )

        let extent = try XCTUnwrap(
            AngularSceneExtent(
                bodies: [
                    AngularSceneBody(
                        eastward: 0,
                        upward: 0,
                        radius: 0.005
                    ),
                ]
            )
        )
        XCTAssertNil(
            AngularSceneTransform(
                size: CGSize(
                    width: 80,
                    height: 240
                ),
                extent: extent
            )
        )
        XCTAssertNil(
            AngularSceneTransform(
                size: CGSize(
                    width: CGFloat.infinity,
                    height: 240
                ),
                extent: extent
            )
        )
        XCTAssertFalse(
            try XCTUnwrap(
                AngularSceneTransform(
                    size: CGSize(
                        width: 320,
                        height: 240
                    ),
                    extent: extent
                )
            )
            .contains(
                AngularSceneBody(
                    eastward: .nan,
                    upward: 0,
                    radius: 0
                )
            )
        )
    }

    func testFourPercentAngularPaddingKeepsBodiesOffContentBounds()
        throws
    {
        let bodies = [
            AngularSceneBody(
                eastward: -0.012,
                upward: 0.003,
                radius: 0.0047
            ),
            AngularSceneBody(
                eastward: 0.011,
                upward: -0.004,
                radius: 0.0046
            ),
        ]
        let physical = try XCTUnwrap(
            AngularSceneExtent(bodies: bodies)
        )
        let padded = try XCTUnwrap(
            physical.padded(
                fraction:
                    EventSceneSessionPlan
                    .projectionPaddingFraction
            )
        )
        let transform = try XCTUnwrap(
            AngularSceneTransform(
                size: CGSize(
                    width: 420,
                    height: 240
                ),
                extent: padded
            )
        )

        for body in bodies {
            let center = transform.point(
                eastward: body.eastward,
                upward: body.upward
            )
            let radius =
                transform.length(body.radius)
            XCTAssertGreaterThan(
                center.x - radius,
                transform.contentRect.minX
            )
            XCTAssertLessThan(
                center.x + radius,
                transform.contentRect.maxX
            )
            XCTAssertGreaterThan(
                center.y - radius,
                transform.contentRect.minY
            )
            XCTAssertLessThan(
                center.y + radius,
                transform.contentRect.maxY
            )
        }
    }

    private func assertFixedTimelineViewport(
        _ phases: [[AngularSceneBody]],
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws {
        let extent = try XCTUnwrap(
            AngularSceneExtent(
                phaseBodies: phases
            ),
            file: file,
            line: line
        )
        let size = CGSize(
            width: 420,
            height: 240
        )
        let transforms = try phases.map { _ in
            try XCTUnwrap(
                AngularSceneTransform(
                    size: size,
                    extent: extent
                ),
                file: file,
                line: line
            )
        }

        guard let expectedScale =
            transforms.first?
            .pixelsPerRadian
        else {
            return XCTFail(
                "Expected a transform",
                file: file,
                line: line
            )
        }
        for transform in transforms {
            XCTAssertEqual(
                transform.pixelsPerRadian,
                expectedScale,
                accuracy: 0,
                file: file,
                line: line
            )
        }
        for phase in phases {
            for body in phase {
                XCTAssertTrue(
                    extent.contains(body),
                    file: file,
                    line: line
                )
                XCTAssertTrue(
                    transforms[0]
                        .contains(body),
                    file: file,
                    line: line
                )
            }
        }
    }
}
