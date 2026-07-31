import Accessibility
import SwiftUI

enum EventWorkspaceFocusTarget: Hashable {
    case workspaceHeading
    case inspectorHeading
    case accuracyTrigger
}

struct EventWorkspaceFocusRequest: Equatable {
    let serial: Int
    let target: EventWorkspaceFocusTarget?

    static let none = EventWorkspaceFocusRequest(
        serial: 0,
        target: nil
    )
}

struct EventWorkspaceFocusRouter: Equatable {
    private(set) var request =
        EventWorkspaceFocusRequest.none
    private(set) var returnsToAccuracyTriggerOnClose =
        false

    mutating func switched(
        to feature: PlanetariumFeature
    ) {
        returnsToAccuracyTriggerOnClose = false
        switch feature {
        case .sky:
            makeRequest(nil)
        case .events:
            makeRequest(.workspaceHeading)
        }
    }

    mutating func requestedAccuracyInspector() {
        returnsToAccuracyTriggerOnClose = true
        makeRequest(.inspectorHeading)
    }

    mutating func inspectorVisibilityChanged(
        isPresented: Bool,
        selectedFeature: PlanetariumFeature
    ) {
        if isPresented {
            // A quick toolbar reopen must not leave a pending request
            // pointing at the workspace action behind the inspector.
            if request.target == .accuracyTrigger {
                makeRequest(nil)
            }
            return
        }

        guard returnsToAccuracyTriggerOnClose else {
            return
        }
        returnsToAccuracyTriggerOnClose = false

        guard selectedFeature == .events else {
            makeRequest(nil)
            return
        }
        makeRequest(.accuracyTrigger)
    }

    private mutating func makeRequest(
        _ target: EventWorkspaceFocusTarget?
    ) {
        request = EventWorkspaceFocusRequest(
            serial: request.serial + 1,
            target: target
        )
    }
}

enum EventWorkspaceAccessibility {
    static let switchedToEventsAnnouncement =
        "現象画面を表示しました"
    static let accuracyInspectorAnnouncement =
        "予報の精度と出典をインスペクタに表示しました"
    static let returnedToAccuracyTriggerAnnouncement =
        "精度・出典を表示へ戻りました"
}

@MainActor
enum EventWorkspaceRouting {
    static func showOnSky(
        at date: Date,
        skyStore: SkyStore,
        eventStore: EventForecastStore,
        onShowOnSky: () -> Void
    ) {
        eventStore.showOnSky(
            at: date,
            skyStore: skyStore
        )
        onShowOnSky()
    }

    static func showAccuracyInspector(
        skyStore: SkyStore
    ) {
        skyStore.isInspectorPresented = true
    }
}

/// The primary surface for one selected local astronomical event.
///
/// The sidebar owns forecast discovery, this workspace owns the event's
/// visual explanation and actionable times, and the inspector is reserved
/// for precision and provenance details.
struct EventWorkspaceView: View {
    @Bindable var skyStore: SkyStore
    @Bindable var eventStore: EventForecastStore
    let focusRequest: EventWorkspaceFocusRequest
    let onShowOnSky: () -> Void
    let onShowAccuracyInspector: () -> Void

    var body: some View {
        EventForecastDetailView(
            skyStore: skyStore,
            eventStore: eventStore,
            presentation: .workspace,
            focusRequest: focusRequest,
            onShowOnSky: onShowOnSky,
            onShowDetails: {
                onShowAccuracyInspector()
            }
        )
        .navigationTitle("現象")
        .accessibilityIdentifier("event.workspace")
    }
}
