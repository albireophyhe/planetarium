import AppKit
import SwiftUI
import XCTest

@testable import Planetarium

final class PlanetariumSidebarAccessibilityTests:
    XCTestCase, @unchecked Sendable
{
    @MainActor
    func testAXPressOnEventsFeatureActivatesForecastAndPreservesHiddenInspector()
        throws
    {
        _ = NSApplication.shared
        let skyStore = SkyStore(
            now: Date(timeIntervalSince1970: 1_774_915_200)
        )
        skyStore.isInspectorPresented = false
        let eventStore = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in []
            }
        )
        let hostingView = NSHostingView(
            rootView: ContentView(
                store: skyStore,
                eventStore: eventStore
            )
        )
        let window = NSWindow(
            contentRect: NSRect(
                x: 0,
                y: 0,
                width: 980,
                height: 680
            ),
            styleMask: [
                .titled,
                .closable,
                .resizable,
            ],
            backing: .buffered,
            defer: false
        )
        window.contentView = hostingView
        window.makeKeyAndOrderFront(nil)
        defer {
            window.orderOut(nil)
            window.contentView = nil
        }

        hostingView.layoutSubtreeIfNeeded()
        drainMainRunLoop()

        let segmentedControls =
            segmentedControls(in: hostingView)
        let picker = try XCTUnwrap(
            segmentedControls.first {
                accessibilityDescendants(of: $0)
                    .contains {
                        $0.accessibilityLabel() == "現象"
                    }
            },
            "The sidebar mode Picker must remain a native segmented control. "
                + segmentedControls.map {
                    accessibilityDescendants(of: $0)
                        .compactMap {
                            $0.accessibilityLabel()
                        }
                        .joined(separator: "/")
                }
                .joined(separator: ", ")
        )
        let accessibleSegments =
            accessibilityDescendants(of: picker)
        XCTAssertTrue(
            accessibleSegments.contains {
                $0.accessibilityLabel() == "空"
            },
            "The feature Picker must expose the sky destination as 空."
        )
        let eventsSegment = try XCTUnwrap(
            accessibleSegments.first {
                $0.accessibilityLabel() == "現象"
            },
            "The events segment must be exposed to accessibility. "
                + accessibleSegments.map {
                    "\(type(of: $0)):"
                        + " role=\($0.accessibilityRole()?.rawValue ?? "nil")"
                        + " label=\($0.accessibilityLabel() ?? "nil")"
                        + " title=\($0.accessibilityTitle() ?? "nil")"
                }
                .joined(separator: ", ")
        )

        _ = eventsSegment.accessibilityPerformPress()
        XCTAssertFalse(
            skyStore.isInspectorPresented,
            "The mode change must not present the inspector inside the AX callback"
        )
        drainMainRunLoop()

        XCTAssertEqual(picker.selectedSegment, 1)
        XCTAssertNotEqual(eventStore.phase, .idle)
        XCTAssertFalse(
            skyStore.isInspectorPresented,
            "Changing feature must preserve the user's inspector visibility"
        )
        XCTAssertTrue(window.isVisible)
    }

    func testFeatureNamesDescribePrimaryDestinations() {
        XCTAssertEqual(
            PlanetariumFeature.allCases.map(\.title),
            ["空", "現象"]
        )
        XCTAssertEqual(
            PlanetariumFeature.sky.systemImage,
            "sparkles"
        )
        XCTAssertEqual(
            PlanetariumFeature.events.systemImage,
            "calendar.badge.clock"
        )
    }

    func testSwitchingToEventsRequestsWorkspaceHeadingFocus() {
        var router = EventWorkspaceFocusRouter()

        router.switched(to: .events)

        XCTAssertEqual(router.request.serial, 1)
        XCTAssertEqual(
            router.request.target,
            .workspaceHeading
        )
        XCTAssertFalse(
            router.returnsToAccuracyTriggerOnClose
        )
    }

    func testAccuracyInspectorCloseReturnsFocusToItsTrigger() {
        var router = EventWorkspaceFocusRouter()
        router.switched(to: .events)

        router.requestedAccuracyInspector()
        let inspectorRequestSerial =
            router.request.serial
        XCTAssertEqual(
            router.request.target,
            .inspectorHeading
        )
        XCTAssertTrue(
            router.returnsToAccuracyTriggerOnClose
        )

        router.inspectorVisibilityChanged(
            isPresented: true,
            selectedFeature: .events
        )
        XCTAssertEqual(
            router.request.serial,
            inspectorRequestSerial,
            "Presenting the requested inspector must preserve its focus request"
        )

        router.inspectorVisibilityChanged(
            isPresented: false,
            selectedFeature: .events
        )
        XCTAssertEqual(
            router.request.target,
            .accuracyTrigger
        )
        XCTAssertFalse(
            router.returnsToAccuracyTriggerOnClose
        )
    }

    func testToolbarInspectorCloseDoesNotClaimAccuracyTriggerFocus() {
        var router = EventWorkspaceFocusRouter()
        router.switched(to: .events)
        let workspaceRequest = router.request

        router.inspectorVisibilityChanged(
            isPresented: true,
            selectedFeature: .events
        )
        router.inspectorVisibilityChanged(
            isPresented: false,
            selectedFeature: .events
        )

        XCTAssertEqual(router.request, workspaceRequest)
        XCTAssertFalse(
            router.returnsToAccuracyTriggerOnClose
        )
    }

    func testLeavingEventsClearsPendingReturnToHiddenTrigger() {
        var router = EventWorkspaceFocusRouter()
        router.switched(to: .events)
        router.requestedAccuracyInspector()

        router.switched(to: .sky)
        let skyRequest = router.request
        router.inspectorVisibilityChanged(
            isPresented: false,
            selectedFeature: .sky
        )

        XCTAssertNil(skyRequest.target)
        XCTAssertEqual(router.request, skyRequest)
        XCTAssertFalse(
            router.returnsToAccuracyTriggerOnClose
        )
    }

    func testRepeatedAccuracyActionsIssueFreshInspectorFocusRequests() {
        var router = EventWorkspaceFocusRouter()

        router.requestedAccuracyInspector()
        let firstRequest = router.request
        router.requestedAccuracyInspector()

        XCTAssertEqual(
            router.request.target,
            .inspectorHeading
        )
        XCTAssertGreaterThan(
            router.request.serial,
            firstRequest.serial
        )
    }

    func testReopeningInspectorCancelsPendingTriggerFocus() {
        var router = EventWorkspaceFocusRouter()
        router.switched(to: .events)
        router.requestedAccuracyInspector()
        router.inspectorVisibilityChanged(
            isPresented: false,
            selectedFeature: .events
        )
        XCTAssertEqual(
            router.request.target,
            .accuracyTrigger
        )

        router.inspectorVisibilityChanged(
            isPresented: true,
            selectedFeature: .events
        )

        XCTAssertNil(router.request.target)
    }

    @MainActor
    func testEventWorkspaceRoutingPreservesOriginalDateForRestore() {
        let originalDate =
            Date(timeIntervalSince1970: 1_774_915_200)
        let eventDate =
            Date(timeIntervalSince1970: 1_776_000_000)
        let skyStore = SkyStore(now: originalDate)
        let eventStore = EventForecastStore(
            initialYear: 2026
        )
        var didRouteToSky = false

        EventWorkspaceRouting.showOnSky(
            at: eventDate,
            skyStore: skyStore,
            eventStore: eventStore
        ) {
            didRouteToSky = true
        }

        XCTAssertTrue(didRouteToSky)
        XCTAssertEqual(skyStore.observationDate, eventDate)
        XCTAssertEqual(
            eventStore.originalObservationDate,
            originalDate
        )
        XCTAssertTrue(eventStore.canRestoreObservationDate)

        eventStore.restoreSkyDate(skyStore: skyStore)

        XCTAssertEqual(skyStore.observationDate, originalDate)
        XCTAssertFalse(eventStore.canRestoreObservationDate)
    }

    @MainActor
    func testAccuracySummaryActionPresentsInspector() {
        let skyStore = SkyStore(
            now: Date(timeIntervalSince1970: 1_774_915_200)
        )
        skyStore.isInspectorPresented = false

        EventWorkspaceRouting.showAccuracyInspector(
            skyStore: skyStore
        )

        XCTAssertTrue(skyStore.isInspectorPresented)
    }

    @MainActor
    func testEventKindPickerIsKeyboardFocusableAndVoiceOverNamed()
        async throws
    {
        _ = NSApplication.shared
        let skyStore = SkyStore(
            now: Date(timeIntervalSince1970: 1_774_915_200)
        )
        let eventStore = EventForecastStore(
            initialYear: 2026,
            dependencies: EventForecastDependencies {
                _, _ in []
            }
        )
        eventStore.activate(
            location: skyStore.location,
            observationDate: skyStore.observationDate
        )
        try await waitUntil {
            eventStore.phase == .empty
        }

        let hostingView = NSHostingView(
            rootView: EventForecastSidebarView(
                skyStore: skyStore,
                eventStore: eventStore
            )
            .frame(width: 320, height: 640)
        )
        let window = NSWindow(
            contentRect: NSRect(
                x: 0,
                y: 0,
                width: 320,
                height: 640
            ),
            styleMask: [
                .titled,
                .closable,
                .resizable,
            ],
            backing: .buffered,
            defer: false
        )
        window.contentView = hostingView
        window.makeKeyAndOrderFront(nil)
        defer {
            window.orderOut(nil)
            window.contentView = nil
        }

        hostingView.layoutSubtreeIfNeeded()
        drainMainRunLoop()

        let popUpButtons = popUpButtons(in: hostingView)
        let picker = try XCTUnwrap(
            popUpButtons.first,
            "種類フィルターはネイティブPickerを使う"
        )
        XCTAssertEqual(
            EventForecastAccessibility.kindFilterLabel,
            "現象の種類",
            "PickerのタイトルをVoiceOver名として固定する"
        )
        XCTAssertEqual(
            picker.itemTitles,
            ["すべて", "日食", "月食", "恒星掩蔽"]
        )
        XCTAssertEqual(picker.titleOfSelectedItem, "すべて")
        XCTAssertTrue(picker.acceptsFirstResponder)
        XCTAssertTrue(
            window.makeFirstResponder(picker),
            "ネイティブPickerはキーボードフォーカスを受け取る"
        )
        XCTAssertTrue(
            picker === window.firstResponder
        )
        XCTAssertEqual(
            EventForecastAccessibility.localYearLabel,
            "予報年は観測地点の現地日付で集計",
            "現地日付で年を区切るVoiceOver説明を固定する"
        )
    }

    func testEventForecastAnnouncementsDescribeAsyncAndFilteredState()
    {
        XCTAssertEqual(
            EventWorkspaceAccessibility
                .switchedToEventsAnnouncement,
            "現象画面を表示しました"
        )
        XCTAssertEqual(
            EventWorkspaceAccessibility
                .accuracyInspectorAnnouncement,
            "予報の精度と出典をインスペクタに表示しました"
        )
        XCTAssertEqual(
            EventWorkspaceAccessibility
                .returnedToAccuracyTriggerAnnouncement,
            "精度・出典を表示へ戻りました"
        )
        XCTAssertEqual(
            EventForecastAccessibility
                .loadingAnnouncement(year: 2026),
            "2026年の局地予報を計算中です"
        )
        XCTAssertEqual(
            EventForecastAccessibility
                .resultAnnouncement(
                    year: 2026,
                    kindTitle: "月食",
                    displayedCount: 0,
                    hiddenCount: 1,
                    selectedTitle: nil
                ),
            "2026年の地平線上の月食はありません。地平線下に1件あります"
        )
        XCTAssertEqual(
            EventForecastAccessibility
                .resultAnnouncement(
                    year: 2026,
                    kindTitle: "すべて",
                    displayedCount: 2,
                    hiddenCount: 1,
                    selectedTitle: "部分日食"
                ),
            "2026年の天文現象を2件表示しています。"
                + "地平線下の1件は非表示です。"
                + "部分日食を選択しました"
        )
        XCTAssertEqual(
            EventForecastAccessibility
                .showOnSkyAnnouncement(
                    label: "最大時刻を空に表示",
                    dateText:
                        "2026年8月13日（木） 03:13:22 JST"
                ),
            "最大時刻を空に表示しました。"
                + "空画面へ移動し、観測日時は"
                + "2026年8月13日（木） 03:13:22 JSTです"
        )
    }

    @MainActor
    private func accessibilityDescendants(
        of element: any NSAccessibilityProtocol,
        remainingDepth: Int = 6
    ) -> [any NSAccessibilityProtocol] {
        guard remainingDepth > 0 else {
            return []
        }
        let children =
            (element.accessibilityChildren() ?? [])
            .compactMap {
                $0 as? any NSAccessibilityProtocol
            }
        return children + children.flatMap {
            accessibilityDescendants(
                of: $0,
                remainingDepth: remainingDepth - 1
            )
        }
    }

    @MainActor
    private func segmentedControls(
        in view: NSView
    ) -> [NSSegmentedControl] {
        var matches: [NSSegmentedControl] = []
        if let segmentedControl =
            view as? NSSegmentedControl
        {
            matches.append(segmentedControl)
        }
        for subview in view.subviews {
            matches.append(
                contentsOf:
                    segmentedControls(in: subview)
            )
        }
        return matches
    }

    @MainActor
    private func popUpButtons(
        in view: NSView
    ) -> [NSPopUpButton] {
        var matches: [NSPopUpButton] = []
        if let popUpButton = view as? NSPopUpButton {
            matches.append(popUpButton)
        }
        for subview in view.subviews {
            matches.append(
                contentsOf:
                    popUpButtons(in: subview)
            )
        }
        return matches
    }

    @MainActor
    private func waitUntil(
        attempts: Int = 100,
        _ predicate: @escaping @MainActor () -> Bool
    ) async throws {
        for _ in 0..<attempts {
            if predicate() {
                return
            }
            try await Task.sleep(
                for: .milliseconds(10)
            )
        }
        XCTFail("Timed out waiting for view state")
    }

    @MainActor
    private func drainMainRunLoop() {
        let end = Date().addingTimeInterval(0.15)
        while Date() < end {
            RunLoop.main.run(
                mode: .default,
                before:
                    min(
                        end,
                        Date().addingTimeInterval(0.01)
                    )
            )
        }
    }
}
